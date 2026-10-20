import * as THREE from 'three';

// ---------- 로우폴리 오토바이 모델 ----------
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.15, ...o });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);

// 두 점 a, b를 잇는 막대(캡슐)를 만든다.
function seg(parent, a, b, r, m, cyl = false) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const geo = cyl ? new THREE.CylinderGeometry(r, r, len, 8) : new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 3, 8);
  const o = new THREE.Mesh(geo, m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(UP, d.normalize());
  o.castShadow = true;
  parent.add(o);
  return o;
}

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.leanG = new THREE.Group();
    this.root.add(this.leanG);
    const L = this.leanG;

    const black = mat(0x18181a, { roughness: 0.8 }), grey = mat(0x4a4d54, { metalness: 0.5 }), steel = mat(0xb8bcc4, { metalness: 0.8, roughness: 0.35 });
    const red = mat(0xc9302a, { roughness: 0.35, metalness: 0.3 }), blue = mat(0x1e5fa8), gold = mat(0xffd900, { metalness: 0.5 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), tail = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const add = (geo, m, x, y, z, parent = L) => {
      const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o;
    };

    // 바퀴: 타이어, 림, 살, 허브, 브레이크 디스크
    const wheel = (z) => {
      const g = new THREE.Group(); g.position.set(0, 0.37, z);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 8, 18).rotateY(Math.PI / 2), black); tire.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 6, 18).rotateY(Math.PI / 2), steel);
      g.add(tire, rim);
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.54, 0.014), steel); sp.rotation.x = (i * Math.PI) / 4; g.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 8).rotateZ(Math.PI / 2), grey);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.012, 14).rotateZ(Math.PI / 2), steel); disc.position.x = 0.07;
      g.add(hub, disc);
      L.add(g); return g;
    };
    this.rearWheel = wheel(0.72);
    this.frontWheel = wheel(-0.72);

    // 차체
    add(new THREE.BoxGeometry(0.26, 0.3, 0.5), grey, 0, 0.6, 0.0);                                     // 엔진 블록
    const cylH = add(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10), grey, 0, 0.82, -0.1); cylH.rotation.x = -0.45; // 실린더
    for (let i = 0; i < 3; i++) { const f = add(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 10), steel, 0, 0.74 + i * 0.07, -0.05 - i * 0.03); f.rotation.x = -0.45; }
    const tank = add(new THREE.CapsuleGeometry(0.15, 0.3, 4, 10).rotateX(Math.PI / 2), red, 0, 1.0, -0.2); tank.scale.set(1, 0.88, 1);
    const seat = add(new THREE.CapsuleGeometry(0.13, 0.42, 3, 8).rotateX(Math.PI / 2), black, 0, 0.92, 0.38); seat.scale.set(1.1, 0.45, 1);
    add(new THREE.BoxGeometry(0.2, 0.06, 0.34), red, 0, 0.9, 0.78).rotation.x = -0.25;                  // 뒷 펜더
    add(new THREE.BoxGeometry(0.06, 0.04, 0.03), tail, 0, 0.9, 0.97);                                    // 후미등
    const ff = add(new THREE.BoxGeometry(0.16, 0.025, 0.46), red, 0, 0.78, -0.82); ff.rotation.x = 0.12;  // 앞 펜더
    seg(L, V(0.0, 0.64, 0.2), V(0, 0.4, 0.72), 0.035, grey);                                             // 스윙암
    seg(L, V(0.0, 0.98, 0.4), V(0, 0.5, 0.52), 0.03, steel);                                             // 리어 쇼크
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10).rotateX(Math.PI / 2), steel, 0.2, 0.46, 0.4);   // 배기관

    // 앞 포크, 핸들바, 헤드라이트, 미러
    for (const sx of [-0.09, 0.09]) seg(L, V(sx, 1.08, -0.5), V(sx, 0.38, -0.72), 0.026, steel);
    add(new THREE.BoxGeometry(0.24, 0.05, 0.08), grey, 0, 1.08, -0.5);
    seg(L, V(-0.36, 1.14, -0.5), V(0.36, 1.14, -0.5), 0.016, black);
    for (const sx of [-0.36, 0.36]) add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6).rotateZ(Math.PI / 2), black, sx, 1.14, -0.5);
    add(new THREE.CylinderGeometry(0.115, 0.1, 0.1, 12).rotateX(Math.PI / 2), grey, 0, 1.04, -0.66);
    add(new THREE.SphereGeometry(0.09, 10, 8), lamp, 0, 1.04, -0.72);
    for (const sx of [-0.3, 0.3]) { seg(L, V(sx, 1.15, -0.5), V(sx * 1.1, 1.3, -0.42), 0.01, black); add(new THREE.BoxGeometry(0.1, 0.06, 0.02), black, sx * 1.1, 1.32, -0.42); }

    // 라이더
    this.rider = new THREE.Group();
    L.add(this.rider);
    const R = this.rider, jacket = blue, helm = mat(0xda2032, { roughness: 0.3, metalness: 0.2 }), pants = mat(0x2a2a3a), glove = mat(0x222226, { roughness: 0.8 });
    seg(R, V(0, 1.0, 0.3), V(0, 1.45, 0.0), 0.17, jacket);                         // 몸통
    add(new THREE.SphereGeometry(0.17, 12, 10), helm, 0, 1.74, -0.1, R);           // 헬멧
    add(new THREE.SphereGeometry(0.17, 12, 10, -0.9, 1.8, 0.7, 1.0), mat(0x101418, { roughness: 0.15, metalness: 0.6 }), 0, 1.74, -0.1, R).scale.set(1.03, 1.03, 1.03); // 바이저
    const stripe = add(new THREE.BoxGeometry(0.05, 0.02, 0.36), gold, 0, 1.91, -0.1, R); stripe.rotation.x = 0.0;
    for (const sx of [-1, 1]) {
      seg(R, V(sx * 0.2, 1.42, -0.02), V(sx * 0.35, 1.16, -0.48), 0.05, jacket);   // 팔
      add(new THREE.SphereGeometry(0.055, 8, 6), glove, sx * 0.35, 1.14, -0.5, R);
      seg(R, V(sx * 0.16, 0.98, 0.3), V(sx * 0.23, 0.8, -0.1), 0.075, pants);      // 허벅지
      seg(R, V(sx * 0.23, 0.8, -0.1), V(sx * 0.21, 0.46, 0.1), 0.06, pants);       // 정강이
      add(new THREE.BoxGeometry(0.09, 0.07, 0.2), black, sx * 0.21, 0.42, 0.04, R); // 부츠
    }

    // 바닥 그림자(그림자 맵을 끈 낮은 품질에서만 보임)
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
