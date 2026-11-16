import { describe, it, expect } from 'vitest';
import { GameSim } from '../../src/sim/game';
import { Bot } from '../../src/sim/bot';
import { MODES } from '../../src/sim/difficulty';

/**
 * Justiça: um jogador automático que usa só 80% da capacidade lateral real e a MESMA física do jogo
 * precisa sobreviver — no começo e também depois de "horas" de partida (pista começando em 30 km e 120 km,
 * com a velocidade e a complexidade correspondentes).
 */
const SEEDS = Number(process.env.BOT_SEEDS ?? 3);
const DIST = Number(process.env.BOT_DIST ?? 2000);

function play(mode: (typeof MODES)[number], seed: number, distOffset: number, dist: number): string {
  const sim = new GameSim(mode, seed, { distOffset });
  const bot = new Bot(sim);
  let k = 0;
  while (sim.state === 'running' && sim.distance < dist) {
    if (k++ % 2 === 0) sim.setTarget(bot.decide());
    sim.step();
  }
  const seg = sim.track.segmentAt(sim.ball.s);
  return `${seed}@${distOffset}:${Math.round(sim.distance)}:${sim.cause ?? 'ok'}${sim.cause ? ':' + seg?.kind : ''}`;
}

describe('jogabilidade (robô jogador, física real)', () => {
  for (const mode of MODES) {
    it(`${mode}: ${SEEDS} partidas de ${DIST} u desde o início`, () => {
      const r: string[] = [];
      for (let i = 1; i <= SEEDS; i++) r.push(play(mode, 1000 + i * 31, 0, DIST));
      expect(r.filter((x) => !x.endsWith(':ok')), r.join(' ')).toEqual([]);
    }, 900000);
    it(`${mode}: partida longa — trechos a 30 km e 120 km`, () => {
      const r = [play(mode, 77, 30000, DIST / 2), play(mode, 78, 120000, DIST / 2)];
      expect(r.filter((x) => !x.endsWith(':ok')), r.join(' ')).toEqual([]);
    }, 900000);
  }
});
