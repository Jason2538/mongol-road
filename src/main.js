import * as THREE from 'three';
import { Road, SURFACES } from './road.js';
import { World, QUALITY } from './world.js';
import { Bike } from './bike.js';
import { BikeModel } from './bikemodel.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- 설정 (브라우저에 저장) ----------
const KEY = 'mongol-road-settings-v1';
const S = { mode: 'tour', quality: isTouch ? 'low' : 'medium', assist: true, hud: true, engineVol: 0.8, windVol: 0.8 };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const MODES = { tour: { label: '관광 모드', vmax: 80 / 3.6 }, speed: { label: '스피드 모드', vmax: 160 / 3.6 } };
const CRUISE = [0, 40, 60, 80, 100];
const VIEWS = ['3인칭', '1인칭 (헬멧)', '핸들바'];

// ---------- 3D 준비 ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: !isTouch, powerPreference: 'high-performance' });
} catch (e) {
  document.body.innerHTML = '<p style="padding:24px;color:#fff">이 브라우저에서는 3D(WebGL)를 사용할 수 없습니다. 최신 Chrome, Edge, Safari로 열어 주세요.</p>';
  throw e;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 6500);
const road = new Road(7);
const world = new World(scene, road, S.quality, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
const bike = new Bike(road);
const model = new BikeModel();
scene.add(model.root);
const input = new Input();
const audio = new AudioSys();
document.querySelectorAll('[data-act]').forEach((el) => input.bindTouch(el));

function applyQuality(q) {
  S.quality = q;
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY[q].pr));
  renderer.setSize(innerWidth, innerHeight, false);
  world.setQuality(q);
  world.warm(bike.s);
  save();
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
applyQuality(S.quality);
camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();

// ---------- 상태 ----------
let running = false, paused = false, view = 0, cruise = 0, wantShot = false;
const pose = {};
bike.pose(pose);
let camH = pose.H, camY = pose.y + 3;

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.style.opacity = 1;
  clearTimeout(toast.id); toast.id = setTimeout(() => (t.style.opacity = 0), 1800);
}
function setCruise(v) {
  cruise = v;
  $('btnCruise').classList.toggle('on', v > 0);
  $('cruiseTxt').textContent = v ? `크루즈 ${v}` : '';
  toast(v ? `크루즈 컨트롤 ${v} km/h` : '크루즈 해제');
}
function cycleCruise() {
  const max = Math.round(MODES[S.mode].vmax * 3.6);
  const list = CRUISE.filter((v) => v <= max);
  setCruise(list[(list.indexOf(cruise) + 1) % list.length]);
}
function cycleView() { view = (view + 1) % VIEWS.length; toast(`시점: ${VIEWS[view]}`); }
function setPaused(p) { paused = p; $('settings').classList.toggle('hidden', !p); }

function syncUI() {
  $('selMode').value = S.mode; $('selQuality').value = S.quality;
  $('chkAssist').checked = S.assist; $('chkHud').checked = S.hud;
  $('rngEngine').value = S.engineVol; $('rngWind').value = S.windVol;
  $('hud').classList.toggle('hidden', !S.hud);
  $('modeTxt').textContent = MODES[S.mode].label;
  audio.vol.engine = S.engineVol; audio.vol.wind = S.windVol;
}
syncUI();
$('selMode0').value = S.mode; $('selQuality0').value = S.quality;

$('btnStart').onclick = () => {
  S.mode = $('selMode0').value;
  if ($('selQuality0').value !== S.quality) applyQuality($('selQuality0').value);
  save(); syncUI();
  $('start').classList.add('hidden');
  audio.start();
  running = true;
};
$('btnCruise').onclick = cycleCruise;
$('btnCam').onclick = cycleView;
$('btnSet').onclick = () => setPaused(true);
$('btnResume').onclick = () => setPaused(false);
$('btnShot').onclick = () => { wantShot = true; };
$('selMode').onchange = (e) => { S.mode = e.target.value; if (cruise > MODES[S.mode].vmax * 3.6) setCruise(0); save(); syncUI(); };
$('selQuality').onchange = (e) => applyQuality(e.target.value);
$('chkAssist').onchange = (e) => { S.assist = e.target.checked; save(); };
$('chkHud').onchange = (e) => { S.hud = e.target.checked; save(); syncUI(); };
$('rngEngine').oninput = (e) => { S.engineVol = +e.target.value; save(); syncUI(); };
$('rngWind').oninput = (e) => { S.windVol = +e.target.value; save(); syncUI(); };
document.addEventListener('visibilitychange', () => { if (document.hidden && running) setPaused(true); });

// ---------- 카메라 ----------
const lookTarget = new THREE.Vector3();
function updateCamera(dt, time) {
  bike.pose(pose);
  const sp = clamp(bike.v / 44, 0, 1.2);
  camH += (pose.H - camH) * (1 - Math.exp(-dt * (view === 0 ? 3.5 : 14)));
  const fx = Math.sin(camH), fz = -Math.cos(camH);
  const sf = SURFACES[bike.surface];
  const shake = sf.rough * sp * 0.07 + sp * sp * 0.012 + bike.slip * 0.08;
  model.rider.visible = view === 0;

  if (view === 0) {
    camY += (pose.y + 2.6 - camY) * (1 - Math.exp(-dt * 8));
    camera.position.set(pose.x - fx * 6.4, camY, pose.z - fz * 6.4);
    lookTarget.set(pose.x + fx * 9, pose.y + 1.3, pose.z + fz * 9);
  } else {
    const hgt = view === 1 ? 1.62 : 1.3, fwd = view === 1 ? 0.05 : 0.55;
    camera.position.set(pose.x + fx * fwd, pose.y + hgt, pose.z + fz * fwd);
    lookTarget.set(camera.position.x + fx * 30, camera.position.y + pose.slope * 30 - 0.4, camera.position.z + fz * 30);
  }
  camera.position.y += (Math.random() - 0.5) * shake;
  camera.position.x += (Math.random() - 0.5) * shake * 0.5;
  camera.lookAt(lookTarget);
  camera.rotateZ(-bike.lean * (view === 0 ? 0.15 : 0.55));
  const fov = 62 + sp * 18;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = fov; camera.updateProjectionMatrix(); }
  $('vignette').style.opacity = clamp((sp - 0.25) * 1.2, 0, 0.8);
  model.shadow.visible = !world.shadowOn;
  model.update(pose, bike, time);
}

// ---------- 메인 루프 ----------
let last = performance.now(), frames = 0, fpsAcc = 0, fpsN = 0, slowWin = 0, hudTick = 0;
world.warm(bike.s);

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.1, (now - last) / 1000); last = now;
  const time = now / 1000;
  input.update(raw);

  for (const ev of input.consume()) {
    if (!running) continue;
    if (ev === 'cruise') cycleCruise();
    else if (ev === 'camera') cycleView();
    else if (ev === 'pause') setPaused(!paused);
  }

  if (running && !paused) {
    if (input.brake > 0.15 && cruise) setCruise(0); // 브레이크를 밟으면 크루즈 해제
    const o = { vmax: MODES[S.mode].vmax, assist: S.assist, cruise };
    let rem = raw;
    while (rem > 0) { const h = Math.min(rem, 1 / 60); bike.update(h, input, o); rem -= h; }
    if (bike.justRecovered) {
      bike.justRecovered = false; setCruise(0);
      $('flash').style.transition = 'none'; $('flash').style.opacity = 0.6;
      requestAnimationFrame(() => { $('flash').style.transition = 'opacity 0.6s'; $('flash').style.opacity = 0; });
      toast('다시 일어나 달립니다');
    }
    if (bike.slip > 0.55 && time - (frame.warnT || 0) > 4) { frame.warnT = time; toast('미끄러워요! 속도를 줄이세요'); }
  }

  updateCamera(raw, time);
  world.update(bike.s, camera, time, pose);
  audio.update(bike.rpmN, bike.throttle, bike.v / 44, SURFACES[bike.surface].rough, !running || paused);
  renderer.render(scene, camera);

  if (wantShot) {
    wantShot = false;
    renderer.domElement.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `mongol-road-${Date.now()}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  // 계기판 (너무 자주 바꾸지 않는다)
  if (++hudTick % 4 === 0 && S.hud) {
    $('spd').textContent = Math.round(bike.kmh);
    $('gear').textContent = bike.v < 0.3 ? 'N' : bike.gear;
    $('rpmFill').style.width = `${Math.round(bike.rpmN * 100)}%`;
    $('rpmTxt').textContent = `${Math.round(bike.rpm / 10) * 10} rpm`;
    $('surf').textContent = `노면: ${SURFACES[bike.surface].name}`;
    $('dist').textContent = `${(bike.s / 1000).toFixed(2)} km`;
  }

  // 느린 기기에서는 그래픽 품질을 자동으로 낮춘다.
  if (running && !paused) {
    fpsAcc += raw; fpsN++;
    if (fpsAcc > 2.5) {
      const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      slowWin = fps < 28 ? slowWin + 1 : 0;
      if (slowWin >= 2 && S.quality !== 'low') {
        applyQuality(S.quality === 'high' ? 'medium' : 'low'); syncUI(); slowWin = 0;
        toast('화면이 느려서 그래픽 품질을 낮췄어요');
      }
    }
  }
}
requestAnimationFrame(frame);

// 개발 중 점검용 (콘솔에서 window.__game 으로 접근)
window.__game = { bike, world, camera, S, setView: (v) => { view = v; } };
