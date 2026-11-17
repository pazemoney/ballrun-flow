import { describe, it, expect } from 'vitest';
import { GameSim } from '../../src/sim/game';
import { dailySeed, DAILY_MODE } from '../../src/game/meta';
import { MODES, type Mode } from '../../src/sim/difficulty';

/** Maior trecho (em segundos de jogo) entre o fim de um bloco e o começo do próximo. */
function maiorVazio(mode: Mode, seed: number, dist = 6000): number {
  const sim = new GameSim(mode, seed, { avoidZones: [] });
  const seen = new Set<number>();
  const iv: [number, number][] = [];
  for (let s = 0; s < dist; s += 50) {
    sim.track.ensure(s);
    for (const g of sim.track.segments) if (!seen.has(g.id)) { seen.add(g.id); for (const o of g.obstacles) iv.push([o.s0, o.s1]); }
  }
  iv.sort((a, b) => a[0] - b[0]);
  let end = iv[0]?.[1] ?? 0;
  let pior = 0;
  for (let i = 1; i < iv.length; i++) {
    const [s0, s1] = iv[i]!;
    if (s0 > 60) pior = Math.max(pior, (s0 - end) / sim.track.gen.progress(end).speed); // ignora a largada
    end = Math.max(end, s1);
  }
  return pior;
}

describe('pista nunca fica muito tempo sem obstáculos', () => {
  it('desafio do dia (7 dias): no máximo 8 s sem bloco', () => {
    for (const d of ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) {
      expect(maiorVazio(DAILY_MODE, dailySeed(d)), d).toBeLessThanOrEqual(8);
    }
  });
  for (const mode of MODES) {
    // fácil é lento e espaçado de propósito (34 km/h): 10 s; os outros, 8 s
    const lim = mode === 'facil' ? 10 : 8;
    it(`${mode}: no máximo ${lim} s sem bloco`, () => {
      for (const seed of [11, 22, 33, 44]) expect(maiorVazio(mode, seed), `${mode} ${seed}`).toBeLessThanOrEqual(lim);
    });
  }
});
