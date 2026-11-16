import { describe, it, expect } from 'vitest';
import { FixedLoop } from '../../src/core/loop';
import { BALL_R, FIXED_DT, LAT_ACCEL, LAT_MAX_SPEED, MAX_FRAME_DT } from '../../src/sim/constants';
import { GameSim } from '../../src/sim/game';
import type { Segment } from '../../src/sim/types';

/** Pista sob medida: substitui a gerada (sem gerar mais à frente). */
function customTrack(sim: GameSim, segs: Segment[]): void {
  const t = sim.track;
  t.segments.splice(0, t.segments.length, ...segs);
  t.gen.sEnd = 1e9; // impede o gerador de acrescentar trechos
}
function flat(id: number, s0: number, s1: number, x0 = -3, x1 = 3, h = 0): Segment {
  return { id, kind: 'test', s0, s1, h0: h, h1: h, floors: [{ x0, x1, s0, s1 }], obstacles: [], pads: [], tunnel: false, maxAir: 0, rating: 0, hint: null };
}

function runAtFps(fps: number, seconds: number, seed = 42) {
  const sim = new GameSim('medio', seed);
  const loop = new FixedLoop(() => sim.step());
  const frames = Math.round(seconds * fps);
  for (let f = 0; f < frames; f++) {
    const t = sim.time;
    // mesma sequência de comandos por tempo de simulação
    sim.setTarget(Math.sin(t * 1.3) * 1.2);
    loop.advance(1 / fps);
  }
  return sim;
}

describe('física de passo fixo', () => {
  it('mesmo resultado a 30, 60, 90 e 120 FPS', () => {
    const sims = [30, 60, 90, 120].map((fps) => {
      const sim = new GameSim('medio', 7);
      customTrack(sim, [flat(1, 0, 5000)]);
      const loop = new FixedLoop(() => {
        if (sim.steps >= 600) return;
        sim.setTarget(Math.sin(sim.time * 1.3) * 1.2); // comando em função do tempo da simulação
        sim.step();
      });
      for (let f = 0; f < fps * 6; f++) loop.advance(1 / fps);
      return sim;
    });
    const a = sims[0] as GameSim;
    expect(a.steps).toBe(600);
    for (const s of sims) {
      expect(s.steps).toBe(600);
      expect(s.ball.x).toBe(a.ball.x);
      expect(s.ball.s).toBe(a.ball.s);
      expect(s.ball.y).toBe(a.ball.y);
    }
  });

  it('o acumulador roda os mesmos passos para o mesmo tempo, em qualquer FPS', () => {
    const counts = [30, 60, 90, 120, 144].map((fps) => {
      let n = 0;
      const loop = new FixedLoop(() => n++);
      for (let i = 0; i < fps * 10; i++) loop.advance(1 / fps);
      return n;
    });
    for (const c of counts) expect(Math.abs(c - 1200)).toBeLessThanOrEqual(1);
    const sims = [30, 60, 120].map((fps) => runAtFps(fps, 6));
    const xs = sims.map((s) => s.ball.s);
    // posições diferem no máximo um passo de física
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(40 * FIXED_DT + 1e-9);
  });

  it('voltar do segundo plano não teletransporta (quadro limitado)', () => {
    let n = 0;
    const loop = new FixedLoop(() => n++);
    loop.advance(5); // 5 s parado em segundo plano
    expect(n).toBeLessThanOrEqual(Math.ceil(MAX_FRAME_DT / FIXED_DT));
  });

  it('lateral: velocidade e aceleração limitadas mesmo com gesto absurdo', () => {
    const sim = new GameSim('facil', 1);
    customTrack(sim, [flat(1, 0, 5000, -50, 50)]);
    let prevVx = 0;
    for (let i = 0; i < 240; i++) {
      sim.setTarget(i % 2 ? 1e6 : -1e6);
      sim.step();
      expect(Math.abs(sim.ball.vx)).toBeLessThanOrEqual(LAT_MAX_SPEED + 1e-9);
      expect(Math.abs(sim.ball.vx - prevVx)).toBeLessThanOrEqual(LAT_ACCEL * FIXED_DT + 1e-9);
      prevVx = sim.ball.vx;
    }
  });

  it('para quando o dedo para: sem deslizar nem tremer', () => {
    const sim = new GameSim('facil', 1);
    customTrack(sim, [flat(1, 0, 5000)]);
    sim.setTarget(1.5);
    let signChanges = 0;
    let last = 0;
    for (let i = 0; i < 120; i++) {
      sim.step();
      const sgn = Math.sign(Math.round(sim.ball.vx * 1000));
      if (sgn !== 0 && last !== 0 && sgn !== last) signChanges++;
      if (sgn !== 0) last = sgn;
    }
    expect(Math.abs(sim.ball.x - 1.5)).toBeLessThan(0.01);
    expect(Math.abs(sim.ball.vx)).toBeLessThan(0.05);
    expect(signChanges).toBeLessThanOrEqual(1); // no máximo um pequeno ajuste
    // parada estável: nada se move lateralmente depois
    const x = sim.ball.x;
    for (let i = 0; i < 120; i++) sim.step();
    expect(Math.abs(sim.ball.x - x)).toBeLessThan(1e-3);
  });

  it('sai da borda → cai e termina (uma vez só)', () => {
    const sim = new GameSim('facil', 1);
    customTrack(sim, [flat(1, 0, 5000, -1, 1)]);
    sim.setTarget(5);
    let falls = 0;
    for (let i = 0; i < 600 && sim.state !== 'over'; i++) {
      sim.step();
      falls += sim.drainEvents().filter((e) => e.type === 'fall' || e.type === 'hit').length;
    }
    expect(sim.state).toBe('over');
    expect(sim.cause).toBe('fall');
    expect(falls).toBe(1);
    // passos depois do fim não mudam nada
    const s = sim.ball.s;
    sim.step();
    expect(sim.ball.s).toBe(s);
  });

  it('não atravessa bloco fino em velocidade muito alta (sem tunneling)', () => {
    for (const vs of [20, 40, 80, 160]) {
      const sim = new GameSim('facil', 1);
      const seg = flat(1, 0, 5000);
      seg.obstacles.push({ kind: 'block', x0: -0.5, x1: 0.5, s0: 30, s1: 30.15, h: 1, amp: 0, freq: 0, phase: 0 });
      customTrack(sim, [seg]);
      sim.ball.vs = vs;
      for (let i = 0; i < 2000 && sim.state === 'running'; i++) {
        sim.ball.vs = vs; // força a velocidade
        sim.step();
      }
      expect(sim.cause, `vs=${vs}`).toBe('hit');
      expect(sim.ball.s).toBeLessThan(30.15 + BALL_R + 0.5);
    }
  });

  it('passa rente ao bloco sem morrer (colisor não é maior que o visual)', () => {
    const sim = new GameSim('facil', 1);
    const seg = flat(1, 0, 5000);
    seg.obstacles.push({ kind: 'block', x0: -0.5, x1: 0.5, s0: 30, s1: 31, h: 1, amp: 0, freq: 0, phase: 0 });
    customTrack(sim, [seg]);
    sim.ball.x = 0.5 + BALL_R + 0.01; // 1 cm de folga
    sim.setTarget(sim.ball.x);
    for (let i = 0; i < 600; i++) sim.step();
    expect(sim.state).toBe('running');
  });

  it('rampa: acompanha a subida sem pular e sem atravessar', () => {
    const sim = new GameSim('facil', 1);
    const a = flat(1, 0, 20);
    const ramp: Segment = { ...flat(2, 20, 40), h0: 0, h1: 4 };
    const top = flat(3, 40, 5000, -3, 3, 4);
    customTrack(sim, [a, ramp, top]);
    let maxGap = 0;
    for (let i = 0; i < 700; i++) {
      sim.step();
      const f = sim.track.floorAt(sim.ball.x, sim.ball.s);
      if (f && sim.ball.onGround) maxGap = Math.max(maxGap, Math.abs(sim.ball.y - BALL_R - f.h));
    }
    expect(sim.state).toBe('running');
    expect(sim.ball.y).toBeCloseTo(4 + BALL_R, 1);
    expect(maxGap).toBeLessThan(1e-6);
  });

  it('salto: rampa de lançamento + vão + pouso', () => {
    const sim = new GameSim('facil', 1);
    const slope = 0.18;
    const a = flat(1, 0, 20);
    const ramp: Segment = { ...flat(2, 20, 26), h0: 0, h1: slope * 6 };
    const gap: Segment = { ...flat(3, 26, 30), floors: [], h0: 0, h1: 0, maxAir: 20 };
    const land = flat(4, 30, 5000, -3, 3, 0);
    customTrack(sim, [a, ramp, gap, land]);
    for (let i = 0; i < 20; i++) sim.step();
    sim.ball.vs = 20;
    let jumped = false;
    let landed = false;
    for (let i = 0; i < 600; i++) {
      sim.ball.vs = 20;
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.type === 'jump') jumped = true;
        if (e.type === 'land') landed = true;
      }
    }
    expect(jumped).toBe(true);
    expect(landed).toBe(true);
    expect(sim.state).toBe('running');
  });
});
