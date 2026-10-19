// 키보드, 터치 버튼, 게임패드 입력을 하나로 합친다.
// throttle(0~1), brake(0~1), steer(-1~1, 오른쪽이 +)
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false };
    this.events = [];
    this.throttle = 0; this.brake = 0; this.steer = 0;
    this.padPrev = {};

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.events.push('cruise');
      if (e.code === 'KeyC') this.events.push('camera');
      if (e.code === 'Escape' || e.code === 'KeyP') this.events.push('pause');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k in this.touch) this.touch[k] = false; });
  }

  // 화면 버튼(data-act)을 연결한다.
  bindTouch(el) {
    const act = el.dataset.act;
    const on = (e) => { e.preventDefault(); this.touch[act] = true; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch {} };
    const off = (e) => { this.touch[act] = false; el.classList.remove('down'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(dt) {
    const k = this.keys, t = this.touch;
    let gas = (k.has('KeyW') || k.has('ArrowUp') || t.gas) ? 1 : 0;
    let brk = (k.has('KeyS') || k.has('ArrowDown') || k.has('Space') || t.brake) ? 1 : 0;
    let str = ((k.has('KeyD') || k.has('ArrowRight') || t.right) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft') || t.left) ? 1 : 0);

    const pad = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) str = ax;
      gas = Math.max(gas, pad.buttons[7] ? pad.buttons[7].value : 0);
      brk = Math.max(brk, pad.buttons[6] ? pad.buttons[6].value : 0);
      const edge = (i, ev) => {
        const p = !!(pad.buttons[i] && pad.buttons[i].pressed);
        if (p && !this.padPrev[i]) this.events.push(ev);
        this.padPrev[i] = p;
      };
      edge(0, 'cruise'); edge(3, 'camera'); edge(9, 'pause');
    }

    this.throttle += (gas - this.throttle) * Math.min(1, dt * (gas > this.throttle ? 8 : 12));
    this.brake += (brk - this.brake) * Math.min(1, dt * (brk > this.brake ? 12 : 14));
    this.steer = str;
  }

  consume() { const e = this.events; this.events = []; return e; }
}
