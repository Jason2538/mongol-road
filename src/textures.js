import * as THREE from 'three';
import { rng } from './util.js';

// 이미지 파일 없이 캔버스로 질감을 그려서 만든다.
function canvasTex(c, aniso) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// 가장자리에서 끊기지 않도록 4방향으로 겹쳐 그린다.
function tiled(g, size, fn) {
  for (const dx of [0, -size]) for (const dy of [0, -size]) { g.save(); g.translate(dx, dy); fn(); g.restore(); }
}

// 초원 바닥: 밝은 회색 바탕에 얼룩과 풀잎 -> 정점 색과 곱해져 초록/노랑 초원이 된다.
export function groundTexture(aniso) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), r = rng(3);
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 28, v = (190 + r() * 60) | 0;
    tiled(g, S, () => { g.fillStyle = `rgba(${v},${v},${v},0.28)`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); });
  }
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, len = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 0.9, v = (140 + r() * 115) | 0;
    tiled(g, S, () => {
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    });
  }
  return canvasTex(c, aniso);
}

// 도로: 자잘한 알갱이와 바퀴 자국
export function roadTexture(aniso) {
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(8);
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 7000; i++) {
    const v = (120 + r() * 135) | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  for (const cx of [W * 0.3, W * 0.7]) {
    const gr = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(cx - 14, 0, 28, H);
  }
  return canvasTex(c, aniso);
}

// 몽골 국기: 빨강-파랑-빨강 세로 3등분, 왼쪽 빨강 위에 금색 소욤보(단순화)
export function flagTexture(aniso) {
  const W = 450, H = 225, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), sw = W / 3;
  g.fillStyle = '#da2032'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0066b3'; g.fillRect(sw, 0, sw, H);
  g.fillStyle = '#da2032'; g.fillRect(sw * 2, 0, sw, H);

  const cx = sw / 2, gold = '#ffd900';
  g.fillStyle = gold; g.strokeStyle = gold;
  // 불꽃 세 갈래
  for (const [dx, h] of [[-9, 20], [0, 26], [9, 20]]) {
    g.beginPath(); g.moveTo(cx + dx - 5, 56); g.quadraticCurveTo(cx + dx - 6, 56 - h * 0.6, cx + dx, 56 - h);
    g.quadraticCurveTo(cx + dx + 6, 56 - h * 0.6, cx + dx + 5, 56); g.closePath(); g.fill();
  }
  // 해와 초승달
  g.beginPath(); g.arc(cx, 66, 5, 0, 7); g.fill();
  g.beginPath(); g.arc(cx, 77, 8, 0, Math.PI, false); g.arc(cx, 74, 8, Math.PI, 0, true); g.fill();
  // 삼각형, 가로 막대 두 개
  g.beginPath(); g.moveTo(cx - 9, 86); g.lineTo(cx + 9, 86); g.lineTo(cx, 104); g.closePath(); g.fill();
  g.fillRect(cx - 14, 108, 28, 6);
  g.fillRect(cx - 14, 158, 28, 6);
  // 음양 원
  g.beginPath(); g.arc(cx, 136, 15, 0, 7); g.fillStyle = gold; g.fill();
  g.beginPath(); g.arc(cx, 136, 15, -Math.PI / 2, Math.PI / 2, false); g.fillStyle = '#da2032'; g.fill();
  g.beginPath(); g.arc(cx, 128.5, 7.5, 0, 7); g.fillStyle = gold; g.fill();
  g.beginPath(); g.arc(cx, 143.5, 7.5, 0, 7); g.fillStyle = '#da2032'; g.fill();
  // 양옆 기둥
  g.fillStyle = gold;
  g.fillRect(cx - 28, 100, 9, 74);
  g.fillRect(cx + 19, 100, 9, 74);
  g.fillRect(cx - 28, 100, 9, 74);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
