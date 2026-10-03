export type SfxKind = 'pop' | 'tick' | 'whoosh' | 'impact' | 'swish';

/** Tiny synthesized sound-design kit. Every sound is quiet and short so the voice stays dominant. */
export class Sfx {
  ctx: AudioContext | null = null;
  monitor!: GainNode;
  bus!: GainNode;
  rec!: MediaStreamAudioDestinationNode;
  noise!: AudioBuffer;
  hooked = false;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.monitor = this.ctx.createGain();
      this.monitor.connect(this.ctx.destination);
      this.rec = this.ctx.createMediaStreamDestination();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.55;
      this.bus.connect(this.monitor);
      this.bus.connect(this.rec);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  hook(video: HTMLVideoElement) {
    if (!this.ctx || this.hooked) return;
    const src = this.ctx.createMediaElementSource(video);
    src.connect(this.monitor);
    src.connect(this.rec);
    this.hooked = true;
  }

  play(kind: SfxKind) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const env = (g: GainNode, peak: number, a: number, d: number) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const osc = (type: OscillatorType, f0: number, f1: number, dur: number, peak: number, a = 0.005) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      env(g, peak, a, dur);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + dur + a + 0.05);
    };
    const noise = (type: BiquadFilterType, f0: number, f1: number, dur: number, peak: number, a: number) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = 1.1;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      env(g, peak, a, dur - a);
      s.connect(f).connect(g).connect(this.bus);
      s.start(t);
      s.stop(t + dur + 0.05);
    };
    switch (kind) {
      case 'pop':
        osc('sine', 620, 280, 0.1, 0.32);
        break;
      case 'tick':
        osc('triangle', 2100, 1500, 0.035, 0.12, 0.002);
        break;
      case 'whoosh':
        noise('bandpass', 350, 2600, 0.42, 0.3, 0.16);
        break;
      case 'swish':
        noise('bandpass', 500, 1800, 0.22, 0.14, 0.09);
        break;
      case 'impact':
        osc('sine', 110, 38, 0.42, 0.7, 0.004);
        noise('lowpass', 900, 120, 0.16, 0.22, 0.003);
        break;
    }
  }
}
