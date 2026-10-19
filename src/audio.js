// 소리 파일 없이 Web Audio로 엔진·바람·노면 소리를 즉석에서 만든다. (저작권 걱정 없음)
export class AudioSys {
  constructor() { this.ctx = null; this.vol = { engine: 0.8, wind: 0.8 }; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.6; this.master.connect(c.destination);

    // 엔진: 톱니파 + 한 옥타브 낮은 사각파 -> 저역 필터, 점화 떨림(LFO)
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2;
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.lfo = c.createOscillator(); this.lfo.type = 'sine';
    this.lfoG = c.createGain(); this.lfoG.gain.value = 0.02;
    const o2g = c.createGain(); o2g.gain.value = 0.5;
    this.o1.connect(this.lp); this.o2.connect(o2g); o2g.connect(this.lp);
    this.lp.connect(this.eng); this.eng.connect(this.master);
    this.lfo.connect(this.lfoG); this.lfoG.connect(this.eng.gain);
    this.o1.start(); this.o2.start(); this.lfo.start();

    // 바람과 노면 진동: 흰 잡음
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    this.wf = c.createBiquadFilter(); this.wf.type = 'bandpass'; this.wf.Q.value = 0.6;
    this.wg = c.createGain(); this.wg.gain.value = 0;
    noise().connect(this.wf); this.wf.connect(this.wg); this.wg.connect(this.master);
    this.rf = c.createBiquadFilter(); this.rf.type = 'lowpass'; this.rf.frequency.value = 220;
    this.rg = c.createGain(); this.rg.gain.value = 0;
    noise().connect(this.rf); this.rf.connect(this.rg); this.rg.connect(this.master);
  }

  // rpmN(0~1), thr(0~1), speedN(0~1+), rough(0~1)
  update(rpmN, thr, speedN, rough, muted) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.06;
    const f = 28 + rpmN * 95;
    this.o1.frequency.setTargetAtTime(f, t, k);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    this.lfo.frequency.setTargetAtTime(f * 0.5, t, k);
    this.lp.frequency.setTargetAtTime(260 + thr * 900 + rpmN * 700, t, k);
    const m = muted ? 0 : 1;
    this.eng.gain.setTargetAtTime((0.05 + 0.1 * thr + 0.04 * rpmN) * this.vol.engine * m, t, 0.08);
    this.wf.frequency.setTargetAtTime(300 + speedN * 1800, t, 0.1);
    this.wg.gain.setTargetAtTime(0.35 * Math.pow(Math.min(speedN, 1.2), 1.6) * this.vol.wind * m, t, 0.1);
    this.rg.gain.setTargetAtTime(0.5 * rough * Math.min(speedN, 1) * this.vol.engine * m, t, 0.1);
  }
}
