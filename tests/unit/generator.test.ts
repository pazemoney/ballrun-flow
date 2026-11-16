import { describe, it, expect } from 'vitest';
import { Generator, TEMPLATE_KINDS } from '../../src/sim/generator';
import { MODES, MODE_PARAMS, progressForLevel, type Mode } from '../../src/sim/difficulty';
import { propagate, freeAt } from '../../src/sim/validator';
import { BALL_R } from '../../src/sim/constants';
import type { Segment } from '../../src/sim/types';

function generate(mode: Mode, seed: number, until: number, distOffset = 0): { segs: Segment[]; gen: Generator } {
  const gen = new Generator(mode, seed, { distOffset });
  const segs: Segment[] = [];
  let guard = 0;
  while (gen.sEnd < until && guard++ < 5000) segs.push(...gen.next());
  return { segs, gen };
}

const SEEDS = Number(process.env.GEN_SEEDS ?? 500);

describe('geração procedural', () => {
  for (const mode of MODES) {
    it(`${mode}: ${SEEDS} seeds × 2500 u (início, 20 km e 150 km) — contratos e rota segura`, () => {
      let fallbacks = 0;
      let total = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const offset = [0, 20000, 150000][seed % 3] ?? 0;
        const { segs, gen } = generate(mode, seed * 7919, 2500, offset);
        total += segs.length;
        fallbacks += gen.fallbacks;
        let prev: Segment | null = null;
        for (const s of segs) {
          // contínuo: sem buraco nem sobreposição entre segmentos
          if (prev) {
            expect(Math.abs(s.s0 - prev.s1)).toBeLessThan(1e-6);
            expect(s.h0).toBeLessThanOrEqual(prev.h1 + 1e-6); // nunca degrau para cima
          }
          expect(s.s1).toBeGreaterThan(s.s0);
          for (const f of s.floors) {
            expect(f.s0).toBeGreaterThanOrEqual(s.s0 - 1e-6);
            expect(f.s1).toBeLessThanOrEqual(s.s1 + 1e-6);
            expect(f.x1 - f.x0).toBeGreaterThanOrEqual(2 * BALL_R); // nunca mais estreito que a bola
          }
          // obstáculos não se sobrepõem e ficam sobre a pista
          for (let i = 0; i < s.obstacles.length; i++) {
            const a = s.obstacles[i]!;
            expect(a.x1).toBeGreaterThan(a.x0);
            expect(a.s1).toBeGreaterThan(a.s0);
            if (a.kind === 'spinner') continue; // disco do girador: validado pelo próprio validador
            const onFloor = s.floors.some((f) => a.s0 >= f.s0 - 1e-6 && a.s1 <= f.s1 + 1e-6 && a.x0 >= f.x0 - 1e-6 && a.x1 <= f.x1 + 1e-6);
            expect(onFloor, `obstáculo fora da pista (${s.kind})`).toBe(true);
            for (let j = i + 1; j < s.obstacles.length; j++) {
              const b = s.obstacles[j]!;
              const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.s0 < b.s1 && a.s1 > b.s0;
              expect(overlap, `obstáculos sobrepostos (${s.kind})`).toBe(false);
            }
          }
          prev = s;
        }
        // revalida a pista inteira do zero: existe rota segura do início ao fim
        const reach = propagate(segs, [[0, 0]], { speedAt: gen.speedAt });
        expect(reach, `${mode} seed ${seed}: sem rota segura`).not.toBeNull();
      }
      expect(fallbacks / total).toBeLessThan(0.02);
    }, 240000);
  }

  it('seed reproduzível: mesma seed, mesma pista', () => {
    const a = generate('dificil', 99, 1500).segs;
    const b = generate('dificil', 99, 1500).segs;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generate('dificil', 100, 1500).segs;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('variedade: todos os tipos aparecem e nada se repete demais', () => {
    const seen = new Set<string>();
    for (const mode of MODES) for (let seed = 1; seed <= 40; seed++) {
      const { segs } = generate(mode, seed, 3000);
      let run = 1;
      for (let i = 1; i < segs.length; i++) {
        const k = segs[i]!.kind;
        seen.add(k);
        if (k === segs[i - 1]!.kind && k !== 'plain' && k !== 'step') run++;
        else run = 1;
        expect(run, `${mode} ${seed}: ${k} repetido`).toBeLessThanOrEqual(3);
      }
    }
    const segKinds = ['accelerator', 'blocks', 'barrier', 'zigzag', 'narrow', 'split', 'snake', 'platforms', 'ramp', 'step', 'tunnel', 'approach', 'launch', 'gap', 'landing', 'movers', 'narrowBlocks', 'gauntlet', 'popups', 'spinner', 'dominoes', 'slalom', 'wave'];
    for (const k of segKinds) expect(seen.has(k), `tipo ${k} nunca apareceu`).toBe(true);
    expect(TEMPLATE_KINDS.length).toBeGreaterThanOrEqual(20);
  });

  it('o validador rejeita uma parede sem passagem', () => {
    const wall: Segment = {
      id: 1, kind: 'x', s0: 0, s1: 20, h0: 0, h1: 0, floors: [{ x0: -3, x1: 3, s0: 0, s1: 20 }],
      obstacles: [{ kind: 'wall', x0: -3, x1: 3, s0: 10, s1: 11, h: 1, amp: 0, freq: 0, phase: 0 }], pads: [], tunnel: false, maxAir: 0, rating: 0, hint: null,
    };
    expect(propagate([wall], [[-3, 3]], { speedAt: () => 15 })).toBeNull();
    // vão menor que a bola + margem: também rejeita
    wall.obstacles = [
      { kind: 'wall', x0: -3, x1: -0.4, s0: 10, s1: 11, h: 1, amp: 0, freq: 0, phase: 0 },
      { kind: 'wall', x0: 0.4, x1: 3, s0: 10, s1: 11, h: 1, amp: 0, freq: 0, phase: 0 },
    ];
    expect(freeAt([wall], 10.5).length).toBe(0);
    expect(propagate([wall], [[-3, 3]], { speedAt: () => 15 })).toBeNull();
  });

  it('o validador considera a capacidade lateral (troca de lado impossível em pouco espaço)', () => {
    const seg: Segment = {
      id: 1, kind: 'x', s0: 0, s1: 30, h0: 0, h1: 0, floors: [{ x0: -3, x1: 3, s0: 0, s1: 30 }],
      obstacles: [
        { kind: 'wall', x0: -3, x1: 1.5, s0: 5, s1: 6, h: 1, amp: 0, freq: 0, phase: 0 },
        { kind: 'wall', x0: -1.5, x1: 3, s0: 7, s1: 8, h: 1, amp: 0, freq: 0, phase: 0 },
      ], pads: [], tunnel: false, maxAir: 0, rating: 0, hint: null,
    };
    // a 30 u/s, ir de x>2.1 para x<-2.1 em 1 u de pista é impossível
    expect(propagate([seg], [[-3, 3]], { speedAt: () => 30 })).toBeNull();
  });
});

describe('dificuldade por nível (acelerador a cada 1 km)', () => {
  for (const mode of MODES) {
    it(`${mode}: velocidade constante no nível; cada acelerador sobe um pouco, sem teto`, () => {
      let prev = progressForLevel(mode, 0);
      for (let L = 1; L <= 600; L++) {
        const p = progressForLevel(mode, L);
        expect(p.speed).toBeGreaterThan(prev.speed);
        expect(p.speed - prev.speed).toBeLessThan(MODE_PARAMS[mode].speed0 * 0.06); // sobe "um pouquinho"
        expect(p.tier).toBeGreaterThan(prev.tier);
        expect(p.rowGap).toBeLessThanOrEqual(prev.rowGap + 1e-12);
        expect(p.rowGap).toBeGreaterThanOrEqual(MODE_PARAMS[mode].gapMin); // tempo de reação tem piso
        prev = p;
      }
      expect(progressForLevel(mode, 600).speed - progressForLevel(mode, 200).speed).toBeGreaterThan(1); // continua subindo
    });
    it(`${mode}: a bola não acelera sozinha entre aceleradores`, () => {
      const g = new Generator(mode, 5);
      while (g.sEnd < 3500) g.next();
      const cps = g.checkpoints;
      expect(cps.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < cps.length; i++) expect(Math.abs(cps[i]! - cps[i - 1]! - 1000)).toBeLessThan(120);
      // fora das zonas de impulso, a velocidade é a do nível e não muda
      const v1 = g.speedAt(cps[0]! + 300);
      expect(g.speedAt(cps[0]! + 800)).toBe(v1);
      expect(g.speedAt(cps[1]! + 300)).toBeGreaterThan(v1);
    });
  }
  it('modos: fácil devagar e espaçado; extremo rápido, próximo e difícil', () => {
    const ps = MODES.map((m) => MODE_PARAMS[m]);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]!.speed0).toBeGreaterThan(ps[i - 1]!.speed0);
      expect(ps[i]!.gap0).toBeLessThan(ps[i - 1]!.gap0);
      expect(ps[i]!.tier0).toBeGreaterThan(ps[i - 1]!.tier0);
    }
  });
  it('acelerador cobre a pista inteira (impossível desviar) e salto nunca usa acelerador', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { segs } = generate('medio', seed, 4000);
      for (const sg of segs) {
        if (sg.kind === 'accelerator') {
          const f = sg.floors[0]!;
          expect(sg.pads[0]!.x0).toBeLessThanOrEqual(f.x0);
          expect(sg.pads[0]!.x1).toBeGreaterThanOrEqual(f.x1);
          expect(sg.pads[0]!.s1 - sg.pads[0]!.s0).toBeGreaterThanOrEqual(18);
        }
        if (sg.kind === 'launch' || sg.kind === 'approach' || sg.kind === 'tunnel') expect(sg.pads.length).toBe(0);
      }
    }
  });
});

describe('ambientes (mapas)', () => {
  it('troca de ambiente na partida e evita repetir os recentes', () => {
    const g = new Generator('medio', 42, { avoidZones: [0, 1, 2] });
    while (g.sEnd < 6000) g.next();
    const hist = g.zoneHistory;
    expect(hist.length).toBeGreaterThanOrEqual(5);
    expect([0, 1, 2]).not.toContain(hist[0]);
    for (let i = 1; i < hist.length; i++) expect(hist[i]).not.toBe(hist[i - 1]);
  });
  it('partidas começam em ambientes variados', () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) firsts.add(new Generator('facil', seed).zoneHistory[0]!);
    expect(firsts.size).toBeGreaterThanOrEqual(6);
  });
});
