import * as THREE from 'three';
import { STEP, ROAD_HALF, SURFACES, groundHeight } from './road.js';
import { noise2, smoothstep, lerp, rng } from './util.js';

export const ROWS = 16; // 청크 하나의 도로 점 수
export const CHUNK_LEN = ROWS * STEP; // 96m

// 그래픽 품질: ahead=앞쪽으로 미리 만들 청크 수, fogFar=안개 끝, pr=최대 픽셀 비율, props=소품 밀도
export const QUALITY = {
  low: { ahead: 7, fogFar: 640, pr: 0.75, props: 0.35 },
  medium: { ahead: 11, fogFar: 1000, pr: 1.25, props: 0.7 },
  high: { ahead: 15, fogFar: 1400, pr: 2, props: 1 },
};
const BASE_OFFS = [3.5, 9, 17, 30, 50, 80, 125, 190, 280, 420, 620, 900];

const _c = new THREE.Color();
const rgb = (r, g, b) => _c.setRGB(r, g, b, THREE.SRGBColorSpace);
export const HAZE = new THREE.Color().setRGB(0.8, 0.87, 0.93, THREE.SRGBColorSpace);

// 여러 청크가 함께 쓰는 도형과 재질
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const lineMat = new THREE.MeshLambertMaterial({ color: 0xe8e6d8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const poleGeo = new THREE.BoxGeometry(0.2, 7, 0.2);
const barGeo = new THREE.BoxGeometry(2.4, 0.16, 0.16);
const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b5238 });
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const bushGeo = new THREE.DodecahedronGeometry(1, 0);
const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

export class World {
  constructor(scene, road, quality) {
    this.scene = scene;
    this.road = road;
    this.chunks = new Map();
    this.sunDir = new THREE.Vector3(-0.55, 0.62, 0.35).normalize();

    scene.background = HAZE.clone();
    scene.fog = new THREE.Fog(HAZE, 50, 600);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x9a9070, 1.5);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    scene.add(this.hemi, this.sun, this.sun.target);

    this.buildSky();
    this.buildClouds();
    this.buildFar();
    this.setQuality(quality);
  }

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f6fd0) },
        mid: { value: new THREE.Color(0x8fc0ee) },
        hor: { value: HAZE.clone() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.12, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 24, 12), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  buildClouds() {
    this.clouds = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x555a66 });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const r = rng(99);
    this.cloudList = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set((j - n / 2) * 55 + r() * 20, r() * 14, (r() - 0.5) * 50);
        m.scale.set(50 + r() * 40, 18 + r() * 14, 35 + r() * 25);
        g.add(m);
      }
      g.position.y = 320 + r() * 220;
      this.cloudList.push({ g, ox: r() * 3600, oz: r() * 3600 });
      this.clouds.add(g);
    }
    this.scene.add(this.clouds);
  }

  // 먼 산맥과 아주 멀리 펼쳐진 초원 바닥
  buildFar() {
    this.far = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(5200, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: rgb(0.7, 0.76, 0.7).clone(), fog: false })
    );
    this.far.add(floor);
    const r = rng(5);
    const R = 3000;
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + r() * 0.15;
      const rad = 350 + r() * 450, h = 150 + r() * 280;
      const col = rgb(0.5 + r() * 0.08, 0.58 + r() * 0.06, 0.68).clone().lerp(HAZE, 0.38);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      m.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R);
      m.rotation.y = r() * 6;
      this.far.add(m);
    }
    this.scene.add(this.far);
  }

  setQuality(name) {
    const q = QUALITY[name];
    this.q = q;
    this.offs = [];
    for (const o of BASE_OFFS) { this.offs.push(o); if (o >= q.fogFar) break; }
    this.cols = [...this.offs.slice().reverse().map((o) => -o), ...this.offs]; // 오른쪽(-) -> 왼쪽(+)
    this.scene.fog.near = q.fogFar * 0.12;
    this.scene.fog.far = q.fogFar;
    for (const k of [...this.chunks.keys()]) this.removeChunk(k);
  }

  // 시작할 때 한꺼번에 앞쪽 지형을 만든다.
  warm(s) {
    const kc = Math.floor(s / CHUNK_LEN);
    for (let k = Math.max(0, kc - 1); k <= kc + this.q.ahead; k++) if (!this.chunks.has(k)) this.buildChunk(k);
  }

  update(s, camera, time) {
    const kc = Math.floor(s / CHUNK_LEN);
    let built = 0;
    for (let k = Math.max(0, kc - 1); k <= kc + this.q.ahead && built < 2; k++) {
      if (!this.chunks.has(k)) { this.buildChunk(k); built++; }
    }
    for (const k of [...this.chunks.keys()]) if (k < kc - 1) this.removeChunk(k);

    const cp = camera.position;
    this.sky.position.copy(cp);
    this.far.position.set(cp.x, cp.y - 14, cp.z);
    const L = 3600;
    for (const c of this.cloudList) {
      const wrap = (v) => ((v % L) + L) % L - L / 2;
      c.g.position.x = cp.x + wrap(c.ox - cp.x + time * 3);
      c.g.position.z = cp.z + wrap(c.oz - cp.z + time * 1.5);
    }
    this.sun.position.set(cp.x, cp.y, cp.z).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(cp);
    this.sun.target.updateMatrixWorld();
  }

  removeChunk(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh && o.geometry !== poleGeo && o.geometry !== barGeo) o.geometry.dispose();
    });
    this.chunks.delete(k);
  }

  buildChunk(k) {
    const road = this.road, cols = this.cols, C = cols.length;
    const r0 = k * ROWS;
    road.ensure(r0 + ROWS + 2);
    const group = new THREE.Group();

    // ---- 지형 ----
    const N = (ROWS + 1) * C;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let r = 0; r <= ROWS; r++) {
      const i = r0 + r;
      const x0 = road.xs[i], z0 = road.zs[i], h = road.hs[i], y0 = road.ys[i];
      const lx = -Math.cos(h), lz = -Math.sin(h);
      for (let c = 0; c < C; c++) {
        const off = cols[c], a = Math.abs(off);
        const x = x0 + lx * off, z = z0 + lz * off;
        const y = groundHeight(x, z, y0, off) - (a <= ROAD_HALF ? 0.04 : 0);
        const v = (r * C + c) * 3;
        pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
        const n1 = noise2(x / 200, z / 200, 21), n2 = noise2(x / 30, z / 30, 22);
        const t = n1 * n1 * (3 - 2 * n1), br = 0.9 + n2 * 0.2;
        let cr = lerp(0.42, 0.72, t) * br, cg = lerp(0.52, 0.66, t) * br, cb = lerp(0.22, 0.34, t) * br;
        const sh = (1 - smoothstep(3.5, 10, a)) * 0.8; // 도로 옆 자갈 갓길
        cr = lerp(cr, 0.55, sh); cg = lerp(cg, 0.5, sh); cb = lerp(cb, 0.4, sh);
        rgb(cr, cg, cb);
        col[v] = _c.r; col[v + 1] = _c.g; col[v + 2] = _c.b;
      }
    }
    const idx = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, cc = a + C, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    group.add(new THREE.Mesh(tg, terrainMat));

    // ---- 도로 ----
    const rp = new Float32Array((ROWS + 1) * 2 * 3), rc = new Float32Array((ROWS + 1) * 2 * 3);
    const lp = [], ridx = [];
    for (let r = 0; r <= ROWS; r++) {
      const i = r0 + r;
      const x0 = road.xs[i], z0 = road.zs[i], h = road.hs[i], y0 = road.ys[i];
      const lx = -Math.cos(h), lz = -Math.sin(h);
      const sf = SURFACES[road.surfaceAt(i * STEP)];
      for (let side = 0; side < 2; side++) {
        const off = side === 0 ? -ROAD_HALF : ROAD_HALF;
        const v = (r * 2 + side) * 3;
        rp[v] = x0 + lx * off; rp[v + 1] = y0 + 0.04; rp[v + 2] = z0 + lz * off;
        const vv = (noise2(i * 0.9 + side * 7, side, 31) - 0.5) * 2 * sf.vary;
        rgb(sf.color[0] + vv, sf.color[1] + vv, sf.color[2] + vv);
        rc[v] = _c.r; rc[v + 1] = _c.g; rc[v + 2] = _c.b;
      }
      if (r < ROWS) { const a = r * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rg.setIndex(ridx);
    rg.computeVertexNormals();
    group.add(new THREE.Mesh(rg, roadMat));

    // 중앙 점선 (포장 구간만)
    for (let r = 0; r < ROWS; r++) {
      const i = r0 + r;
      const key = road.surfaceAt(i * STEP);
      if (i % 4 >= 2 || (key !== 'paved' && key !== 'cracked')) continue;
      const lx0 = -Math.cos(road.hs[i]), lz0 = -Math.sin(road.hs[i]);
      const lx1 = -Math.cos(road.hs[i + 1]), lz1 = -Math.sin(road.hs[i + 1]);
      const w = 0.09;
      lp.push(
        road.xs[i] + lx0 * w, road.ys[i] + 0.08, road.zs[i] + lz0 * w,
        road.xs[i] - lx0 * w, road.ys[i] + 0.08, road.zs[i] - lz0 * w,
        road.xs[i + 1] + lx1 * w, road.ys[i + 1] + 0.08, road.zs[i + 1] + lz1 * w,
        road.xs[i + 1] - lx1 * w, road.ys[i + 1] + 0.08, road.zs[i + 1] - lz1 * w,
      );
    }
    if (lp.length) {
      const li = [];
      for (let q = 0; q < lp.length / 12; q++) { const a = q * 4; li.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      lg.setIndex(li);
      lg.computeVertexNormals();
      group.add(new THREE.Mesh(lg, lineMat));
    }

    // ---- 전신주 (도로 오른쪽, 48m 간격) ----
    const poles = [];
    for (let r = 0; r < ROWS; r++) if ((r0 + r) % 8 === 0) poles.push(r0 + r);
    if (poles.length) {
      const pm = new THREE.InstancedMesh(poleGeo, woodMat, poles.length);
      const bm = new THREE.InstancedMesh(barGeo, woodMat, poles.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      poles.forEach((i, n) => {
        const h = road.hs[i], off = -(ROAD_HALF + 5.5);
        p.set(road.xs[i] - Math.cos(h) * off, road.ys[i] + 3.5, road.zs[i] - Math.sin(h) * off);
        q.setFromEuler(e.set(0, Math.PI - h, 0));
        pm.setMatrixAt(n, m4.compose(p, q, one));
        p.y = road.ys[i] + 6.4;
        bm.setMatrixAt(n, m4.compose(p, q, one));
      });
      group.add(pm, bm);
    }

    // ---- 바위와 덤불 ----
    const rand = rng(k * 7919 + 13);
    const nRock = Math.round(10 * this.q.props), nBush = Math.round(26 * this.q.props);
    const scatter = (geo, mat, n, colorFn, sizeFn, lift) => {
      if (n <= 0) return;
      const im = new THREE.InstancedMesh(geo, mat, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let n2 = 0; n2 < n; n2++) {
        const i = r0 + Math.floor(rand() * ROWS);
        const side = rand() < 0.5 ? -1 : 1;
        const off = side * (11 + rand() * rand() * 130);
        const h = road.hs[i];
        const x = road.xs[i] - Math.cos(h) * off, z = road.zs[i] - Math.sin(h) * off;
        const y = groundHeight(x, z, road.ys[i], off);
        const s = sizeFn(rand);
        p.set(x, y + s.y * lift, z);
        q.setFromEuler(e.set(rand() * 0.4, rand() * 6.28, rand() * 0.4));
        sc.set(s.x, s.y, s.z);
        im.setMatrixAt(n2, m4.compose(p, q, sc));
        im.setColorAt(n2, colorFn(rand));
      }
      group.add(im);
    };
    scatter(rockGeo, rockMat, nRock, (r) => { const g = 0.42 + r() * 0.2; return rgb(g, g * 0.97, g * 0.9).clone(); },
      (r) => { const b = 0.6 + r() * r() * 2.4; return { x: b, y: b * (0.5 + r() * 0.3), z: b * (0.8 + r() * 0.4) }; }, 0.4);
    scatter(bushGeo, bushMat, nBush, (r) => rgb(0.32 + r() * 0.12, 0.42 + r() * 0.1, 0.2).clone(),
      (r) => { const b = 0.5 + r() * 0.9; return { x: b * 1.4, y: b * 0.7, z: b * 1.4 }; }, 0.3);

    this.scene.add(group);
    this.chunks.set(k, { group });
  }
}
