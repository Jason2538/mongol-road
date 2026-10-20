import * as THREE from 'three';
import { STEP, ROAD_HALF, SURFACES, groundHeight } from './road.js';
import { noise2, smoothstep, lerp, rng } from './util.js';
import { groundTexture, roadTexture } from './textures.js';
import { buildGoatGeometry, buildGerGeometry, createFlag, flagTime } from './props.js';

export const ROWS = 16; // 청크 하나의 도로 점 수
export const CHUNK_LEN = ROWS * STEP; // 96m

// 그래픽 품질: ahead=앞쪽 청크 수, fogFar=안개 끝, pr=최대 픽셀 비율, props=소품 밀도, shadow=그림자 해상도(0이면 끔)
export const QUALITY = {
  low: { ahead: 7, fogFar: 640, pr: 0.75, props: 0.35, shadow: 0 },
  medium: { ahead: 11, fogFar: 1000, pr: 1.25, props: 0.7, shadow: 1024 },
  high: { ahead: 15, fogFar: 1400, pr: 2, props: 1, shadow: 2048 },
};
const BASE_OFFS = [3.5, 6, 9, 13, 18, 25, 35, 50, 75, 110, 160, 230, 330, 470, 650, 900];

const _c = new THREE.Color();
const rgb = (r, g, b) => _c.setRGB(r, g, b, THREE.SRGBColorSpace);
export const HAZE = new THREE.Color().setRGB(0.82, 0.87, 0.93, THREE.SRGBColorSpace);

const shared = (g) => { g.userData.shared = true; return g; };
const poleGeo = shared(new THREE.BoxGeometry(0.2, 7, 0.2));
const barGeo = shared(new THREE.BoxGeometry(2.4, 0.16, 0.16));
const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b5238 });
const rockGeo = shared(new THREE.IcosahedronGeometry(1, 0));
const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const bushGeo = shared(new THREE.DodecahedronGeometry(1, 0));
const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const tuftGeo = shared(new THREE.ConeGeometry(0.1, 0.5, 4, 1).translate(0, 0.25, 0));
const tuftMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
const goatGeo = buildGoatGeometry();
const goatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const gerGeo = buildGerGeometry();
const gerMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const GOAT_COLORS = [[1, 1, 1], [0.95, 0.88, 0.76], [0.78, 0.58, 0.4], [0.48, 0.32, 0.22], [0.2, 0.19, 0.18], [0.6, 0.56, 0.52]];

const _m4 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ee = new THREE.Euler(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);

// 먼 산: 높이에 따라 색이 변하고 높은 산은 꼭대기에 눈이 쌓인다.
function mountainGeo(rad, h, seed) {
  const g = new THREE.ConeGeometry(rad, h, 7, 3);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = (y + h / 2) / h;
    if (f > 0.02 && f < 0.98) {
      const j = (noise2(x * 0.02 + seed, z * 0.02, 41) - 0.5) * rad * 0.35;
      p.setXYZ(i, x + j, y + (noise2(x * 0.03, z * 0.03 + seed, 42) - 0.5) * h * 0.08, z - j);
    }
    const snow = h > 230 ? smoothstep(0.62, 0.72, f) : 0;
    rgb(lerp(0.42, 0.5, f), lerp(0.46, 0.52, f), lerp(0.55, 0.58, f));
    let r = _c.r, gg = _c.g, b = _c.b;
    r = lerp(r, 0.95, snow); gg = lerp(gg, 0.96, snow); b = lerp(b, 1, snow);
    r = lerp(r, HAZE.r, 0.35); gg = lerp(gg, HAZE.g, 0.35); b = lerp(b, HAZE.b, 0.35);
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class World {
  constructor(scene, road, quality, aniso = 4) {
    this.scene = scene;
    this.road = road;
    this.aniso = aniso;
    this.chunks = new Map();
    this.sunDir = new THREE.Vector3(0.45, 0.42, -0.6).normalize(); // 노을 느낌의 낮은 태양, 오른쪽 앞

    this.terrainMat = new THREE.MeshLambertMaterial({ map: groundTexture(aniso), vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(aniso), vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.lineMat = new THREE.MeshLambertMaterial({ color: 0xe8e6d8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

    scene.background = HAZE.clone();
    scene.fog = new THREE.Fog(HAZE, 50, 600);

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0xa08c64, 1.7);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 3.4);
    this.sun.shadow.camera.left = -48; this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48; this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 20; this.sun.shadow.camera.far = 340;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35;
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
        top: { value: new THREE.Color(0x2a66cc) },
        mid: { value: new THREE.Color(0x86bdf0) },
        hor: { value: HAZE.clone() },
        sun: { value: this.sunDir.clone() },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sun; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
          c = mix(c, top, smoothstep(0.15, 0.75, h));
          float s = max(dot(d, normalize(sun)), 0.0);
          c += vec3(1.0, 0.72, 0.42) * pow(s, 6.0) * 0.28 * (1.0 - smoothstep(0.0, 0.5, h));
          c += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.45;
          c += vec3(1.0, 0.97, 0.85) * smoothstep(0.9993, 0.9997, s) * 2.0;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
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
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, emissive: 0x6a6f7c });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const r = rng(99);
    this.cloudList = [];
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      const n = 4 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set((j - n / 2) * 55 + r() * 20, r() * 14, (r() - 0.5) * 50);
        m.scale.set(50 + r() * 40, 16 + r() * 14, 35 + r() * 25);
        g.add(m);
      }
      g.position.y = 300 + r() * 240;
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
      new THREE.MeshBasicMaterial({ color: rgb(0.68, 0.74, 0.66).clone(), fog: false })
    );
    this.far.add(floor);
    const r = rng(5), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
    for (const [R, count, hMin, hSpan] of [[3000, 30, 150, 300], [2300, 18, 70, 120]]) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + r() * 0.15;
        const rad = 330 + r() * 450, h = hMin + r() * hSpan;
        const m = new THREE.Mesh(mountainGeo(rad, h, r() * 50), mat);
        m.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R);
        m.rotation.y = r() * 6;
        this.far.add(m);
      }
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

    this.shadowOn = q.shadow > 0;
    this.sun.castShadow = this.shadowOn;
    if (this.shadowOn) {
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    }
    for (const k of [...this.chunks.keys()]) this.removeChunk(k);
  }

  // 시작할 때 한꺼번에 앞쪽 지형을 만든다.
  warm(s) {
    const kc = Math.floor(s / CHUNK_LEN);
    for (let k = Math.max(0, kc - 1); k <= kc + this.q.ahead; k++) if (!this.chunks.has(k)) this.buildChunk(k);
  }

  // focus: 오토바이 위치(그림자 기준)
  update(s, camera, time, focus) {
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
    const f = focus || cp;
    this.sun.position.set(f.x, f.y, f.z).addScaledVector(this.sunDir, 160);
    this.sun.target.position.set(f.x, f.y, f.z);
    this.sun.target.updateMatrixWorld();

    flagTime.value = time;
    this.updateGoats(time, kc);
  }

  // 염소들이 천천히 풀을 뜯으며 이리저리 걷는다. 가까운 청크만 갱신한다.
  updateGoats(time, kc) {
    for (let k = kc - 1; k <= kc + 5; k++) {
      const c = this.chunks.get(k);
      if (!c || !c.goats) continue;
      const { mesh, data } = c.goats;
      for (let i = 0; i < data.length; i++) {
        const d = data[i], ph = time * d.sp + d.ph, w = Math.sin(ph), cs = Math.cos(ph);
        const x = d.x + Math.cos(d.a) * w * d.range, z = d.z + Math.sin(d.a) * w * d.range;
        const dir = cs >= 0 ? 1 : -1;
        const fx = Math.cos(d.a) * dir, fz = Math.sin(d.a) * dir;
        const y = groundHeight(x, z, d.roadY, d.off) + Math.abs(Math.sin(time * 5 + d.ph)) * 0.025;
        _ee.set(0, Math.atan2(-fx, -fz), 0);
        _m4.compose(_pp.set(x, y, z), _qq.setFromEuler(_ee), _ss.set(d.sc, d.sc, d.sc));
        mesh.setMatrixAt(i, _m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  removeChunk(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    this.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    this.chunks.delete(k);
  }

  buildChunk(k) {
    const road = this.road, cols = this.cols, C = cols.length;
    const r0 = k * ROWS;
    road.ensure(r0 + ROWS + 2);
    const group = new THREE.Group();
    const rand = rng(k * 7919 + 13);

    // ---- 지형 ----
    const N = (ROWS + 1) * C;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), uv = new Float32Array(N * 2);
    for (let r = 0; r <= ROWS; r++) {
      const i = r0 + r;
      const x0 = road.xs[i], z0 = road.zs[i], h = road.hs[i], y0 = road.ys[i];
      const lx = -Math.cos(h), lz = -Math.sin(h);
      for (let c = 0; c < C; c++) {
        const off = cols[c], a = Math.abs(off);
        const x = x0 + lx * off, z = z0 + lz * off;
        const y = groundHeight(x, z, y0, off) - (a <= ROAD_HALF ? 0.04 : 0);
        const vi = r * C + c, v = vi * 3;
        pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
        uv[vi * 2] = x / 9; uv[vi * 2 + 1] = z / 9;
        const n1 = noise2(x / 200, z / 200, 21), n2 = noise2(x / 30, z / 30, 22), n3 = noise2(x / 9, z / 9, 23);
        const t = n1 * n1 * (3 - 2 * n1), br = 0.92 + n2 * 0.22 + (n3 - 0.5) * 0.12;
        // 초록 풀밭과 누런 마른 풀이 섞인 스텝
        let cr = lerp(0.42, 0.78, t) * br, cg = lerp(0.54, 0.72, t) * br, cb = lerp(0.2, 0.34, t) * br;
        const dry = smoothstep(0.62, 0.8, n2) * 0.25;
        cr += dry * 0.2; cg += dry * 0.12; cb -= dry * 0.05;
        const sh = (1 - smoothstep(3.5, 10, a)) * 0.8; // 도로 옆 자갈 갓길
        cr = lerp(cr, 0.58, sh); cg = lerp(cg, 0.53, sh); cb = lerp(cb, 0.42, sh);
        rgb(cr * 1.12, cg * 1.12, cb * 1.12);
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
    tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, this.terrainMat);
    tm.receiveShadow = true;
    group.add(tm);

    // ---- 도로 ----
    const rp = new Float32Array((ROWS + 1) * 2 * 3), rc = new Float32Array((ROWS + 1) * 2 * 3), ru = new Float32Array((ROWS + 1) * 2 * 2);
    const lp = [], ridx = [];
    for (let r = 0; r <= ROWS; r++) {
      const i = r0 + r;
      const x0 = road.xs[i], z0 = road.zs[i], h = road.hs[i], y0 = road.ys[i];
      const lx = -Math.cos(h), lz = -Math.sin(h);
      const sf = SURFACES[road.surfaceAt(i * STEP)];
      for (let side = 0; side < 2; side++) {
        const off = side === 0 ? -ROAD_HALF : ROAD_HALF;
        const vi = r * 2 + side, v = vi * 3;
        rp[v] = x0 + lx * off; rp[v + 1] = y0 + 0.04; rp[v + 2] = z0 + lz * off;
        ru[vi * 2] = side; ru[vi * 2 + 1] = (i * STEP) / 7;
        const vv = (noise2(i * 0.9 + side * 7, side, 31) - 0.5) * 2 * sf.vary;
        rgb(sf.color[0] + vv, sf.color[1] + vv, sf.color[2] + vv);
        rc[v] = _c.r; rc[v + 1] = _c.g; rc[v + 2] = _c.b;
      }
      if (r < ROWS) { const a = r * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rg.setAttribute('uv', new THREE.BufferAttribute(ru, 2));
    rg.setIndex(ridx);
    rg.computeVertexNormals();
    const roadMesh = new THREE.Mesh(rg, this.roadMat);
    roadMesh.receiveShadow = true;
    group.add(roadMesh);

    // 차선: 가운데 점선, 양쪽 가장자리 실선 (포장 구간만)
    const quad = (i, o1, o2) => {
      const lx0 = -Math.cos(road.hs[i]), lz0 = -Math.sin(road.hs[i]);
      const lx1 = -Math.cos(road.hs[i + 1]), lz1 = -Math.sin(road.hs[i + 1]);
      lp.push(
        road.xs[i] + lx0 * o1, road.ys[i] + 0.08, road.zs[i] + lz0 * o1,
        road.xs[i] + lx0 * o2, road.ys[i] + 0.08, road.zs[i] + lz0 * o2,
        road.xs[i + 1] + lx1 * o1, road.ys[i + 1] + 0.08, road.zs[i + 1] + lz1 * o1,
        road.xs[i + 1] + lx1 * o2, road.ys[i + 1] + 0.08, road.zs[i + 1] + lz1 * o2,
      );
    };
    for (let r = 0; r < ROWS; r++) {
      const i = r0 + r, key = road.surfaceAt(i * STEP);
      if (key !== 'paved' && key !== 'cracked') continue;
      if (i % 4 < 2) quad(i, -0.09, 0.09);
      quad(i, ROAD_HALF - 0.4, ROAD_HALF - 0.28);
      quad(i, -ROAD_HALF + 0.28, -ROAD_HALF + 0.4);
    }
    if (lp.length) {
      const li = [];
      for (let q = 0; q < lp.length / 12; q++) { const a = q * 4; li.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      lg.setIndex(li);
      lg.computeVertexNormals();
      group.add(new THREE.Mesh(lg, this.lineMat));
    }

    // ---- 전신주 (도로 오른쪽, 48m 간격) ----
    const poles = [];
    for (let r = 0; r < ROWS; r++) if ((r0 + r) % 8 === 0) poles.push(r0 + r);
    if (poles.length) {
      const pm = new THREE.InstancedMesh(poleGeo, woodMat, poles.length);
      const bm = new THREE.InstancedMesh(barGeo, woodMat, poles.length);
      poles.forEach((i, n) => {
        const h = road.hs[i], off = -(ROAD_HALF + 5.5);
        _pp.set(road.xs[i] - Math.cos(h) * off, road.ys[i] + 3.5, road.zs[i] - Math.sin(h) * off);
        _qq.setFromEuler(_ee.set(0, Math.PI - h, 0));
        pm.setMatrixAt(n, _m4.compose(_pp, _qq, _one));
        _pp.y = road.ys[i] + 6.4;
        bm.setMatrixAt(n, _m4.compose(_pp, _qq, _one));
      });
      pm.castShadow = bm.castShadow = true;
      group.add(pm, bm);
    }

    // 도로 중심에서 off(m) 떨어진 점 (row 기준)
    const at = (i, off) => {
      const h = road.hs[i];
      return [road.xs[i] - Math.cos(h) * off, road.zs[i] - Math.sin(h) * off];
    };

    // ---- 몽골 국기: 도로 왼쪽, 0번 청크와 4청크마다 ----
    if (k === 0 || k % 4 === 2) {
      const i = r0 + 9 + Math.floor(rand() * 3), off = ROAD_HALF + 7;
      const [x, z] = at(i, off);
      const flag = createFlag(this.aniso);
      flag.position.set(x, road.ys[i], z);
      flag.rotation.y = -road.hs[i] + 0.35;
      group.add(flag);
    }

    // ---- 염소 떼 ----
    if (k === 1 || rand() < 0.42) {
      const n = Math.max(3, Math.round((6 + Math.floor(rand() * 6)) * (0.5 + this.q.props * 0.5)));
      const side = rand() < 0.5 ? -1 : 1, cOff = side * (15 + rand() * 38);
      const row = r0 + Math.floor(rand() * ROWS);
      const [cx, cz] = at(row, cOff);
      const mesh = new THREE.InstancedMesh(goatGeo, goatMat, n);
      mesh.castShadow = true; mesh.frustumCulled = false;
      const data = [];
      for (let g = 0; g < n; g++) {
        const col = GOAT_COLORS[Math.floor(rand() * GOAT_COLORS.length)];
        mesh.setColorAt(g, _c.setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace));
        data.push({
          x: cx + (rand() - 0.5) * 14, z: cz + (rand() - 0.5) * 14, roadY: road.ys[row], off: cOff,
          a: rand() * 6.28, ph: rand() * 6.28, sp: 0.05 + rand() * 0.08, range: 2 + rand() * 6, sc: 1.55 + rand() * 0.4,
        });
      }
      group.add(mesh);
      this.chunks.set(k, { group, goats: { mesh, data } });
    }

    // ---- 게르 ----
    if (rand() < 0.14) {
      const side = rand() < 0.5 ? -1 : 1, off = side * (34 + rand() * 50);
      const i = r0 + Math.floor(rand() * ROWS);
      const [x, z] = at(i, off), [rx, rz] = at(i, 0);
      const ger = new THREE.Mesh(gerGeo, gerMat);
      ger.position.set(x, groundHeight(x, z, road.ys[i], off) - 0.05, z);
      ger.rotation.y = Math.atan2(rx - x, rz - z);
      ger.castShadow = true;
      group.add(ger);
    }

    // ---- 바위, 덤불, 풀 ----
    const scatter = (geo, mat, n, minOff, spread, colorFn, sizeFn, lift, shadow) => {
      if (n <= 0) return;
      const im = new THREE.InstancedMesh(geo, mat, n);
      for (let n2 = 0; n2 < n; n2++) {
        const i = r0 + Math.floor(rand() * ROWS);
        const side = rand() < 0.5 ? -1 : 1;
        const off = side * (minOff + rand() * rand() * spread);
        const [x, z] = at(i, off);
        const y = groundHeight(x, z, road.ys[i], off);
        const s = sizeFn(rand);
        _pp.set(x, y + s.y * lift, z);
        _qq.setFromEuler(_ee.set(rand() * 0.4, rand() * 6.28, rand() * 0.4));
        _ss.set(s.x, s.y, s.z);
        im.setMatrixAt(n2, _m4.compose(_pp, _qq, _ss));
        im.setColorAt(n2, colorFn(rand));
      }
      im.castShadow = shadow;
      group.add(im);
    };
    const P = this.q.props;
    scatter(rockGeo, rockMat, Math.round(10 * P), 11, 130,
      (r) => { const g = 0.42 + r() * 0.2; return rgb(g, g * 0.97, g * 0.9).clone(); },
      (r) => { const b = 0.6 + r() * r() * 2.4; return { x: b, y: b * (0.5 + r() * 0.3), z: b * (0.8 + r() * 0.4) }; }, 0.4, true);
    scatter(bushGeo, bushMat, Math.round(26 * P), 11, 130,
      (r) => rgb(0.32 + r() * 0.12, 0.42 + r() * 0.1, 0.2).clone(),
      (r) => { const b = 0.5 + r() * 0.9; return { x: b * 1.4, y: b * 0.7, z: b * 1.4 }; }, 0.3, false);
    scatter(tuftGeo, tuftMat, Math.round(260 * P), 6, 40,
      (r) => { const t = r(); return rgb(lerp(0.55, 0.9, t), lerp(0.7, 0.85, t), lerp(0.3, 0.4, t)).clone(); },
      (r) => { const b = 0.9 + r() * 1.0; return { x: b, y: b * (0.45 + r() * 0.4), z: b }; }, 0, false);

    this.scene.add(group);
    const rec = this.chunks.get(k);
    if (rec) rec.group = group; else this.chunks.set(k, { group });
  }
}
