/**
 * Áudio 100% sintetizado (WebAudio): nenhum arquivo de terceiros.
 * Um único AudioContext; música agendada só enquanto a partida roda; tudo para em pausa/menu.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private rollOsc: OscillatorNode | null = null;
  private rollGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private step = 0;
  volume = 0.8;
  sfx = true;
  music = true;

  /** Precisa de um gesto do usuário (iOS). Chamado no toque em JOGAR/menus. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.22;
        this.musicGain.connect(this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch (e) {
      console.warn('[audio] indisponível', e);
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    this.stopMusic();
    this.setRoll(0, false);
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0): void {
    if (!this.ctx || !this.master || !this.sfx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number): void {
    if (!this.ctx || !this.master || !this.sfx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  click(): void {
    this.tone(880, 0.05, 'square', 0.06);
    this.tone(1320, 0.05, 'square', 0.04, 0, 0.03);
  }
  boost(): void {
    // "vuuush" subindo
    this.tone(180, 0.55, 'sawtooth', 0.08, 4.5);
    this.tone(360, 0.45, 'triangle', 0.06, 3.5, 0.05);
    this.noise(0.5, 0.14, 4500);
  }
  /** subiu de nível: arpejo curto subindo */
  levelUp(): void {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'square', 0.07, 1, i * 0.06));
  }
  /** "boing" de mola */
  jump(): void {
    this.wobble(300, 0.35, 0.16, 2.2, 18);
  }
  land(impact: number): void {
    this.tone(140, 0.1, 'sine', Math.min(0.25, 0.05 + impact * 0.02), 0.6);
  }
  /** batida de desenho animado: "BONK" + buzina de palhaço */
  hit(): void {
    this.tone(180, 0.18, 'square', 0.18, 0.5);
    this.noise(0.12, 0.35, 1400);
    this.tone(330, 0.22, 'square', 0.1, 1, 0.12);
    this.tone(311, 0.26, 'square', 0.1, 1, 0.12);
  }
  /** apito descendo (queda) */
  fall(): void {
    this.wobble(1400, 1.1, 0.13, 0.18, 7);
  }
  nearMiss(): void {
    this.noise(0.18, 0.12, 6000);
    this.tone(900, 0.12, 'sine', 0.07, 1.6);
  }
  /** fanfarrinha estilo kazoo */
  record(): void {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.wobble(f, i === 5 ? 0.45 : 0.16, 0.09, 1, 9, i * 0.12));
  }

  /** nota com vibrato (som de brinquedo) */
  private wobble(freq: number, dur: number, vol: number, slide: number, vib: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.sfx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    lfo.frequency.value = vib;
    lg.gain.value = freq * 0.04;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** Zumbido de rolamento proporcional à velocidade. */
  setRoll(speed: number, onGround: boolean): void {
    if (!this.ctx || !this.master) return;
    if (!this.rollOsc) {
      this.rollOsc = this.ctx.createOscillator();
      this.rollOsc.type = 'triangle';
      this.rollGain = this.ctx.createGain();
      this.rollGain.gain.value = 0;
      this.rollOsc.connect(this.rollGain).connect(this.master);
      this.rollOsc.start();
    }
    const t = this.ctx.currentTime;
    this.rollOsc.frequency.setTargetAtTime(50 + speed * 2.2, t, 0.1);
    this.rollGain?.gain.setTargetAtTime(this.sfx && onGround && speed > 0 ? 0.035 : 0, t, 0.06);
  }

  startMusic(): void {
    if (!this.ctx || !this.music || this.musicTimer !== null) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.schedule(), 100);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private schedule(): void {
    if (!this.ctx || !this.musicGain) return;
    const bpm = 124;
    const sp = 60 / bpm / 2;
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      const bar = Math.floor(this.step / 8) % chords.length;
      const ch = chords[bar] as number[];
      const n = ch[this.step % 3] as number;
      const t = this.nextNote;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = n * (this.step % 8 >= 6 ? 2 : 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sp * 0.45);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      o.connect(f).connect(g).connect(this.musicGain);
      o.start(t);
      o.stop(t + sp);
      if (this.step % 4 === 0) {
        const k = this.ctx.createOscillator();
        const kg = this.ctx.createGain();
        k.frequency.setValueAtTime(120, t);
        k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        kg.gain.setValueAtTime(0.5, t);
        kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        k.connect(kg).connect(this.musicGain);
        k.start(t);
        k.stop(t + 0.2);
      }
      this.nextNote += sp;
      this.step++;
    }
  }
}
