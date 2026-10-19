import * as THREE from 'three';
import { clamp } from './util.js';
import { ROAD_HALF, SURFACES, groundHeight } from './road.js';

const G = 9.81;
const IDLE = 1400, REDLINE = 10000;
// 기어별 최고 속도(m/s)와 가속력(m/s²)
const GEARS = [
  { vmax: 11, acc: 8.5 }, { vmax: 20, acc: 6.8 }, { vmax: 30, acc: 5.2 },
  { vmax: 41, acc: 4.0 }, { vmax: 52, acc: 3.2 },
];
const P = {}; // 도로 정보 임시 저장용

// 오토바이의 움직임 계산 (도로를 따라 달리는 단순 물리)
export class Bike {
  constructor(road) { this.road = road; this.reset(); }

  reset() {
    this.s = 12;       // 도로를 따라 이동한 거리(m)
    this.d = 0;        // 도로 중심에서 옆으로 벗어난 거리(m), +는 왼쪽
    this.psi = 0;      // 도로 방향 대비 차체 방향(rad), +는 오른쪽
    this.v = 0;        // 속도(m/s)
    this.gear = 1; this.rpm = IDLE; this.rpmN = 0;
    this.lean = 0; this.steerS = 0; this.slip = 0;
    this.failT = 0; this.fallT = 0; this.fallDir = 1; this.shiftT = 0;
    this.surface = 'paved'; this.wheelRot = 0; this.justRecovered = false;
    this.throttle = 0; this.brake = 0;
  }

  get kmh() { return this.v * 3.6; }

  // o: { vmax(m/s), assist(bool), cruise(km/h 또는 0) }
  update(dt, inp, o) {
    if (dt <= 0) return;
    const road = this.road;
    road.at(this.s, P);
    const kappa = P.kappa;
    this.surface = Math.abs(this.d) <= ROAD_HALF ? road.surfaceAt(this.s) : 'grass';
    const S = SURFACES[this.surface];

    if (this.fallT > 0) { this.updateFall(dt); return; }

    let thr = inp.throttle, brk = inp.brake;
    if (o.cruise && brk < 0.05 && thr < 0.01) {
      const tgt = o.cruise / 3.6;
      thr = clamp(0.2 + (tgt - this.v) * 0.45, 0, 1);
      if (this.v > tgt + 3) brk = clamp((this.v - tgt - 3) * 0.12, 0, 0.4);
    }
    this.throttle = thr; this.brake = brk;

    // ---- 엔진, 기어 ----
    const g = GEARS[this.gear - 1];
    const wheelN = clamp(this.v / g.vmax, 0, 1.1);
    const wheelRpm = IDLE + wheelN * (REDLINE - IDLE);
    const target = Math.max(wheelRpm, IDLE + thr * 2600 * (1 - clamp(this.v / 6, 0, 1)));
    this.rpm += (target - this.rpm) * Math.min(1, dt * 12);
    const rpmN = (this.rpm - IDLE) / (REDLINE - IDLE);
    this.rpmN = clamp(rpmN, 0, 1);

    this.shiftT = Math.max(0, this.shiftT - dt);
    if (this.shiftT === 0) {
      if (((rpmN > 0.84 && thr > 0.15) || rpmN > 0.92) && this.gear < 5) { this.gear++; this.shiftT = 0.3; }
      else if (wheelN < 0.42 && this.gear > 1) { this.gear--; this.shiftT = 0.2; }
    }

    // ---- 가속과 감속 ----
    const tq = clamp(1 - 1.6 * (rpmN - 0.65) ** 2, 0.35, 1);
    let aEng = thr * g.acc * tq * (this.shiftT > 0 ? 0.2 : 1);
    const aTrac = 0.8 * G * S.grip;
    let spin = 0;
    if (aEng > aTrac) { spin = (aEng - aTrac) / aEng; aEng = aTrac; }
    if (this.v > o.vmax) aEng = 0;
    const v = this.v;
    let a = aEng - 0.0009 * v * v - S.roll * clamp(v / 0.3, 0, 1)
      - (1 - thr) * 0.5 * this.rpmN * (v > 0.5 ? 1 : 0) - G * P.slope;
    if (v > 0.2) a -= brk * 8.4 * S.grip;
    if (v > o.vmax) a -= (v - o.vmax) * 2.5;
    this.v = Math.max(0, v + a * dt);
    if (this.v < 0.15 && thr < 0.02) this.v = 0;

    // 비포장에서 급브레이크 -> 뒷바퀘 미끄러짐
    let skid = 0;
    if (brk > 0.8 && v > 10 && S.grip < 0.85) skid = (brk - 0.8) * 5 * (0.95 - S.grip) * clamp(v / 20, 0, 1.4) * 2;

    // ---- 조향 ----
    const st = inp.steer;
    this.steerS += (st - this.steerS) * Math.min(1, dt * (Math.abs(st) > Math.abs(this.steerS) ? 7 : 10));
    const aLatMax = 0.55 * G * S.grip * (1 - 0.45 * this.slip);
    const vv = this.v;
    let w = this.steerS * Math.min(1.1, 0.8 * aLatMax / Math.max(vv, 3));
    if (o.assist) {
      // 주행 보조: 도로 공률을 따라가고 중앙으로 부드럽게 복귀 (직접 조향 중에는 약해짐)
      const k = clamp(vv / 6, 0, 1);
      const act = Math.abs(this.steerS) > 0.08 ? 0.25 : 1;
      w += k * (kappa * vv * Math.cos(this.psi) + act * (-2.2 * this.psi + 0.14 * this.d));
    }
    w = clamp(w, -1.4, 1.4);
    const ratio = (Math.abs(w) * vv) / Math.max(aLatMax, 0.1);
    if (ratio > 1) w /= ratio; // 접지력 한계 -> 더 못 꺾고 바깥으로 밀려난다

    const slipT = clamp(Math.max(0, (ratio - 0.85) * 2.2) + skid + spin * 0.6, 0, 1);
    this.slip += (slipT - this.slip) * Math.min(1, dt * (slipT > this.slip ? 6 : 1.5));

    // ---- 위치 갱신 ----
    const ds = (vv * Math.cos(this.psi)) / Math.max(0.3, 1 + kappa * this.d);
    this.psi = clamp(this.psi + (w - kappa * ds) * dt, -1.3, 1.3);
    this.d += -vv * Math.sin(this.psi) * dt;
    this.s += ds * dt;
    if (Math.abs(this.d) > 70) { this.d = Math.sign(this.d) * 70; this.psi *= 0.5; }

    const leanT = clamp(Math.atan2(w * vv, G), -0.75, 0.75);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 7);
    this.wheelRot -= (vv / 0.34) * dt;

    // ---- 넘어짐 판정: 오래 심하게 미끄러지면 짧게 넘어졌다가 복구 ----
    if (this.slip > 0.96) this.failT += dt; else this.failT = Math.max(0, this.failT - dt * 0.5);
    if (this.failT > 0.8 && this.v > 6) {
      this.fallT = 1.6; this.fallDir = this.lean >= 0 ? 1 : -1; this.failT = 0;
    }
  }

  updateFall(dt) {
    this.fallT -= dt;
    this.v *= Math.exp(-2.4 * dt);
    this.s += this.v * dt;
    this.lean += (this.fallDir * 1.35 - this.lean) * Math.min(1, dt * 5);
    this.wheelRot -= (this.v / 0.34) * dt;
    this.throttle = 0; this.brake = 0;
    if (this.fallT <= 0) {
      this.psi = 0; this.d = clamp(this.d, -2.5, 2.5);
      this.v = 6; this.slip = 0; this.lean = 0; this.steerS = 0; this.gear = 1;
      this.justRecovered = true;
    }
  }

  // 세계 좌표에서의 위치와 방향
  pose(out) {
    this.road.at(this.s, P);
    const lx = -Math.cos(P.h), lz = -Math.sin(P.h);
    out.x = P.x + lx * this.d; out.z = P.z + lz * this.d;
    out.y = groundHeight(out.x, out.z, P.y, this.d);
    out.H = P.h + this.psi;
    out.roadH = P.h;
    out.slope = P.slope;
    return out;
  }
}

// ---------- 로우폴리 오토바이 모델 ----------
const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.leanG = new THREE.Group();
    this.root.add(this.leanG);

    const black = mat(0x1a1a1c), grey = mat(0x55585e), red = mat(0xc4372a), skin = mat(0xe0b48c);
    const add = (geo, m, x, y, z, parent = this.leanG) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o;
    };
    const wheel = (z) => {
      const g = new THREE.Group(); g.position.set(0, 0.34, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.13, 14), black); tire.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8), grey); hub.rotation.z = Math.PI / 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.05), grey);
      g.add(tire, hub, spoke);
      this.leanG.add(g); return g;
    };
    this.rearWheel = wheel(0.72);
    this.frontWheel = wheel(-0.72);

    add(new THREE.BoxGeometry(0.3, 0.34, 0.9), grey, 0, 0.62, 0.15);            // 엔진
    add(new THREE.BoxGeometry(0.34, 0.26, 0.55), red, 0, 0.98, -0.22);          // 연료탱크
    add(new THREE.BoxGeometry(0.32, 0.12, 0.62), black, 0, 0.9, 0.38);          // 시트
    add(new THREE.BoxGeometry(0.28, 0.1, 0.4), red, 0, 0.82, 0.78);             // 뒷 펜더
    const fork = add(new THREE.BoxGeometry(0.09, 0.82, 0.09), grey, 0, 0.72, -0.62); fork.rotation.x = -0.3;
    add(new THREE.BoxGeometry(0.72, 0.05, 0.05), black, 0, 1.12, -0.5);         // 핸들바
    add(new THREE.SphereGeometry(0.11, 8, 6), mat(0xfff2b0), 0, 1.0, -0.78);    // 헤드라이트
    add(new THREE.BoxGeometry(0.1, 0.1, 0.5), grey, 0.2, 0.42, 0.72);           // 배기관

    this.rider = new THREE.Group();
    this.leanG.add(this.rider);
    const torso = add(new THREE.BoxGeometry(0.42, 0.56, 0.28), mat(0x2f6f9a), 0, 1.32, 0.12, this.rider); torso.rotation.x = -0.4;
    add(new THREE.SphereGeometry(0.17, 10, 8), mat(0xe8821e), 0, 1.78, -0.08, this.rider);
    add(new THREE.BoxGeometry(0.2, 0.08, 0.1), skin, 0, 1.76, -0.22, this.rider);
    for (const sx of [-1, 1]) {
      const arm = add(new THREE.BoxGeometry(0.1, 0.1, 0.62), mat(0x2f6f9a), sx * 0.3, 1.2, -0.22, this.rider); arm.rotation.x = 0.15;
      const leg = add(new THREE.BoxGeometry(0.14, 0.52, 0.14), mat(0x2a2a3a), sx * 0.2, 0.74, 0.28, this.rider); leg.rotation.x = -0.5;
    }

    // 바닥 그림자(번짐)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })
    );
    this.shadow.scale.set(0.5, 1, 1.1);
    this.root.add(this.shadow);
  }

  update(pose, bike, time) {
    const wob = bike.slip > 0.25 ? Math.sin(time * 22) * bike.slip * 0.05 : 0;
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.set(Math.atan(pose.slope), -(pose.H + wob), 0);
    this.leanG.rotation.z = -(bike.lean + wob * 2);
    this.leanG.position.y = bike.fallT > 0 ? -0.18 : 0;
    this.rearWheel.rotation.x = this.frontWheel.rotation.x = bike.wheelRot;
    this.shadow.position.y = 0.04;
  }
}
