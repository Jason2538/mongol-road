import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flagTexture } from './textures.js';

// 도형 조각 하나를 위치/회전/크기/색과 함께 만든다. (합치기 위해 색을 정점에 넣는다)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function part(geo, hex, pos, rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(_m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scl)));
  const n = g.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}
const mark = (g) => { g.userData.shared = true; return g; };

// ---------- 염소 (몸이 -z 방향을 본다) ----------
export function buildGoatGeometry() {
  const sph = new THREE.SphereGeometry(1, 8, 6), box = new THREE.BoxGeometry(1, 1, 1);
  const horn = new THREE.ConeGeometry(0.028, 0.3, 5), cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
  const W = 0xffffff, D = 0x3a3430;
  const parts = [
    part(sph, W, [0, 0.52, 0.02], [0, 0, 0], [0.17, 0.19, 0.4]),
    part(sph, W, [0, 0.5, 0.24], [0, 0, 0], [0.16, 0.17, 0.2]),
    part(cyl, W, [0, 0.66, -0.36], [-0.95, 0, 0], [0.075, 0.34, 0.075]),
    part(box, W, [0, 0.8, -0.55], [0.15, 0, 0], [0.12, 0.14, 0.24]),
    part(box, D, [0, 0.76, -0.67], [0.15, 0, 0], [0.07, 0.07, 0.06]),
    part(box, W, [0.1, 0.84, -0.5], [0, 0, 0.5], [0.14, 0.03, 0.07]),
    part(box, W, [-0.1, 0.84, -0.5], [0, 0, -0.5], [0.14, 0.03, 0.07]),
    part(horn, D, [0.05, 0.93, -0.5], [0.9, 0, -0.2], [1, 1, 1]),
    part(horn, D, [-0.05, 0.93, -0.5], [0.9, 0, 0.2], [1, 1, 1]),
    part(box, W, [0, 0.68, -0.62], [0, 0, 0], [0.025, 0.1, 0.025]),
    part(box, W, [0, 0.64, 0.44], [-0.5, 0, 0], [0.045, 0.12, 0.045]),
  ];
  for (const x of [-0.09, 0.09]) for (const z of [-0.27, 0.3]) {
    parts.push(part(box, W, [x, 0.2, z], [0, 0, 0], [0.055, 0.4, 0.055]));
    parts.push(part(box, D, [x, 0.02, z], [0, 0, 0], [0.065, 0.05, 0.08]));
  }
  return mark(mergeGeometries(parts));
}

// ---------- 게르 (문은 +z 쪽) ----------
export function buildGerGeometry() {
  const cyl = (n) => new THREE.CylinderGeometry(1, 1, 1, n);
  const parts = [
    part(cyl(14), 0xf1ece0, [0, 0.9, 0], [0, 0, 0], [3, 1.8, 3]),
    part(new THREE.ConeGeometry(1, 1, 14), 0xe8e2d4, [0, 2.3, 0], [0, 0, 0], [3.4, 1.3, 3.4]),
    part(cyl(8), 0x6b4a36, [0, 3.0, 0], [0, 0, 0], [0.5, 0.22, 0.5]),
    part(cyl(14), 0xb8452c, [0, 1.62, 0], [0, 0, 0], [3.03, 0.14, 3.03]),
    part(new THREE.BoxGeometry(1, 1, 1), 0xc8561e, [0, 0.78, 2.96], [0, 0, 0], [0.95, 1.5, 0.12]),
    part(new THREE.BoxGeometry(1, 1, 1), 0x2a6fb0, [0, 1.62, 3.02], [0, 0, 0], [1.15, 0.12, 0.1]),
  ];
  return mark(mergeGeometries(parts));
}

// ---------- 몽골 국기 게양대 ----------
export const flagTime = { value: 0 };
let flagGeo = null, flagMat = null, poleGeo = null, poleMat = null, finialGeo = null, goldMat = null;

export function createFlag(aniso) {
  if (!flagGeo) {
    flagGeo = mark(new THREE.PlaneGeometry(3, 1.5, 16, 6).translate(1.5, 0, 0));
    flagMat = new THREE.MeshLambertMaterial({ map: flagTexture(aniso), side: THREE.DoubleSide });
    flagMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = flagTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float k = position.x / 3.0;
          transformed.z += sin(position.x * 2.2 - uTime * 5.0) * 0.22 * k;
          transformed.y += sin(position.x * 1.6 - uTime * 3.7) * 0.06 * k;`);
    };
    poleGeo = mark(new THREE.CylinderGeometry(0.06, 0.09, 9, 8).translate(0, 4.5, 0));
    finialGeo = mark(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 9.1, 0));
    poleMat = new THREE.MeshLambertMaterial({ color: 0xdcdcdc });
    goldMat = new THREE.MeshLambertMaterial({ color: 0xffd900 });
  }
  const g = new THREE.Group();
  const pole = new THREE.Mesh(poleGeo, poleMat), fin = new THREE.Mesh(finialGeo, goldMat), flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.06, 8.0, 0);
  pole.castShadow = true; flag.castShadow = true;
  g.add(pole, fin, flag);
  return g;
}
