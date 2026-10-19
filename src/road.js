import { clamp, lerp, smoothstep, noise1, noise2 } from './util.js';

export const STEP = 6; // 도로 점 사이 간격(m)
export const ROAD_HALF = 3.5; // 도로 반폭(m) -> 폭 7m (2차선 기준의 임의값, 실제 몽골 기준은 추후 확인)

// 노면 종류. grip=접지력, roll=구름저항(m/s²), rough=진동 세기, color=sRGB
export const SURFACES = {
  paved: { name: '포장도로', grip: 1.0, roll: 0.12, rough: 0.05, color: [0.2, 0.2, 0.22], vary: 0.02 },
  cracked: { name: '갈라진 포장', grip: 0.9, roll: 0.2, rough: 0.35, color: [0.3, 0.29, 0.28], vary: 0.07 },
  gravel: { name: '자갈길', grip: 0.62, roll: 0.6, rough: 0.7, color: [0.56, 0.51, 0.43], vary: 0.06 },
  dirt: { name: '흙길', grip: 0.68, roll: 0.8, rough: 0.55, color: [0.5, 0.37, 0.24], vary: 0.05 },
  grass: { name: '초원 (도로 밖)', grip: 0.5, roll: 2.8, rough: 0.8, color: [0.5, 0.55, 0.3], vary: 0.05 },
};

// 도로 밖 언덕 높이 (세계 좌표 기준, 어디서나 같은 값)
export function hills(x, z) {
  return (noise2(x / 1100, z / 1100, 11) - 0.5) * 40
    + (noise2(x / 320, z / 320, 12) - 0.5) * 14
    + (noise2(x / 70, z / 70, 13) - 0.5) * 2.2;
}

// 도로 중심에서 off(m)만큼 떨어진 곳의 땅 높이. 도로 근처는 평평하고 멀수록 언덕에 가까워진다.
export function groundHeight(x, z, roadY, off) {
  const a = Math.abs(off);
  if (a <= 12) return roadY;
  return lerp(roadY, hills(x, z), smoothstep(12, 140, a));
}

// 끝없이 이어지는 외길. 앞쪽으로 필요한 만큼만 점을 늘려 간다.
export class Road {
  constructor(seed = 7) {
    this.seed = seed;
    this.p = [seed * 1.7, seed * 2.9, seed * 4.1, seed * 0.9, seed * 3.3, seed * 5.7];
    this.xs = [0]; this.zs = [0]; this.hs = [0]; this.ys = [this.elev(0)];
  }

  // 휘어짐(1/반지름). +이면 오른쪽으로 휜다. 최대 약 1/280m.
  curvature(s) {
    const ramp = Math.min(1, s / 300);
    const p = this.p;
    return ramp * 0.0017 * (Math.sin(s * 0.0029 + p[0]) + 0.7 * Math.sin(s * 0.0071 + p[1]) + 0.4 * Math.sin(s * 0.0163 + p[2]));
  }

  elev(s) {
    const p = this.p;
    return 8 * Math.sin(s * 0.0011 + p[3]) + 3 * Math.sin(s * 0.0033 + p[4]) + 1 * Math.sin(s * 0.0091 + p[5]);
  }

  ensure(n) {
    while (this.xs.length <= n) {
      const i = this.xs.length - 1;
      const h = this.hs[i] + this.curvature(i * STEP) * STEP;
      this.hs.push(h);
      this.xs.push(this.xs[i] + Math.sin(h) * STEP);
      this.zs.push(this.zs[i] - Math.cos(h) * STEP);
      this.ys.push(this.elev((i + 1) * STEP));
    }
  }

  // 거리 s 지점의 도로 중심 정보를 out에 채운다.
  at(s, out) {
    s = Math.max(0, s);
    const f = s / STEP, i = Math.floor(f), t = f - i;
    this.ensure(i + 2);
    out.x = lerp(this.xs[i], this.xs[i + 1], t);
    out.z = lerp(this.zs[i], this.zs[i + 1], t);
    out.h = lerp(this.hs[i], this.hs[i + 1], t);
    out.y = lerp(this.ys[i], this.ys[i + 1], t);
    out.slope = (this.ys[i + 1] - this.ys[i]) / STEP;
    out.kappa = this.curvature(s);
    return out;
  }

  surfaceAt(s) {
    if (s < 500) return 'paved';
    const n = noise1(s / 520, this.seed);
    if (n < 0.5) return 'paved';
    if (n < 0.68) return 'cracked';
    if (n < 0.84) return 'gravel';
    return 'dirt';
  }
}

export { clamp };
