import { describe, it, expect } from 'vitest';
import { GameSim } from '../../src/sim/game';
import { Bot } from '../../src/sim/bot';
import { BALLS } from '../../src/game/catalog';
import { ABILITY_BASE, type AbilityKind } from '../../src/sim/abilities';
import { MODES } from '../../src/sim/difficulty';

const DIST = Number(process.env.ABIL_DIST ?? 900);
const SEEDS = process.env.ABIL_SEEDS ? process.env.ABIL_SEEDS.split(',').map(Number) : [11];

function specOf(kind: AbilityKind) {
  const b = BALLS.find((x) => x.ability.kind === kind);
  if (!b) throw new Error('sem bola com ' + kind);
  return b.ability;
}

describe('poderes especiais das bolas', () => {
  it('toda bola tem um poder com nome, grito, descrição e recarga mínima', () => {
    const kinds = new Set<string>();
    for (const b of BALLS) {
      const a = b.ability;
      kinds.add(a.kind);
      expect(a.name.length, b.id).toBeGreaterThan(2);
      expect(a.desc.length, b.id).toBeGreaterThan(8);
      expect(a.cooldown, b.id).toBeGreaterThanOrEqual(ABILITY_BASE[a.kind].minCooldown);
      expect(a.power, b.id).toBeGreaterThan(0.5);
      expect(a.power, b.id).toBeLessThanOrEqual(1.3);
    }
    expect(kinds.size).toBe(Object.keys(ABILITY_BASE).length);
    expect(BALLS[0]?.ability.kind).toBe('jump');
  });

  it('não dispara duas vezes: respeita a recarga', () => {
    for (const kind of Object.keys(ABILITY_BASE) as AbilityKind[]) {
      const sim = new GameSim('medio', 5);
      sim.ability = specOf(kind);
      for (let i = 0; i < 240; i++) sim.step();
      expect(sim.useAbility(), kind).toBe(true);
      expect(sim.useAbility(), kind).toBe(false);
      for (let i = 0; i < 30; i++) sim.step();
      expect(sim.useAbility(), kind).toBe(false);
      expect(sim.abilityCharge()).toBeLessThan(1);
    }
  });

  it('pulo tira a bola do chão e ela volta a pousar', () => {
    const sim = new GameSim('facil', 9);
    sim.ability = specOf('jump');
    for (let i = 0; i < 120; i++) sim.step();
    expect(sim.useAbility()).toBe(true);
    let maxUp = 0;
    const y0 = sim.ball.y;
    for (let i = 0; i < 240 && sim.state === 'running'; i++) {
      sim.step();
      maxUp = Math.max(maxUp, sim.ball.y - y0);
    }
    expect(maxUp).toBeGreaterThan(1.2);
    expect(sim.ball.onGround || sim.state !== 'running').toBe(true);
  });

  it('arrancada esmaga blocos e escudo absorve uma batida (bola sem desviar)', () => {
    for (const kind of ['dash', 'shield', 'ghost'] as AbilityKind[]) {
      let saved = 0;
      let smashedAll = 0;
      for (const seed of [3, 4, 5, 6]) {
        const sim = new GameSim('dificil', seed);
        sim.ability = specOf(kind);
        let smashed = 0;
        // sem desviar: espera o 1º bloco chegar perto e usa o poder
        for (let i = 0; i < 120 * 40 && sim.state === 'running'; i++) {
          sim.setTarget(sim.ball.x);
          let ahead = false;
          sim.track.forObstacles(sim.ball.s + 0.5, sim.ball.s + 3, (o) => {
            if (sim.ball.x > o.x0 - 0.5 && sim.ball.x < o.x1 + 0.5 && o.amp === 0) ahead = true;
            return ahead;
          });
          if (ahead) sim.useAbility();
          sim.step();
          for (const ev of sim.drainEvents()) if (ev.type === 'smash') smashed++;
          if (sim.abilityUses > 0 && sim.dashT <= 0 && sim.ghostT <= 0 && sim.shieldT <= 0 && sim.time > 1) break;
        }
        if (sim.abilityUses > 0 && sim.cause !== 'hit') saved++;
        smashedAll += smashed;
      }
      expect(saved, kind).toBeGreaterThanOrEqual(3);
      if (kind !== 'ghost') expect(smashedAll, kind).toBeGreaterThan(0);
    }
  });

  it('teletransporte, disco voador e foguete sempre deixam a bola num lugar seguro', () => {
    for (const kind of ['teleport', 'abduct', 'rocket', 'glide', 'slowmo', 'freeze', 'dash', 'ghost', 'shield'] as AbilityKind[]) {
      const fails: string[] = [];
      for (const mode of MODES) {
        for (const seed of SEEDS) {
          const sim = new GameSim(mode, seed);
          sim.ability = specOf(kind);
          const bot = new Bot(sim);
          let k = 0;
          while (sim.state === 'running' && sim.distance < DIST) {
            if (sim.abilityCharge() >= 1 && sim.ball.onGround) sim.useAbility();
            if (k++ % 2 === 0) sim.setTarget(bot.decide());
            sim.step();
            sim.drainEvents();
          }
          if (sim.state !== 'running') fails.push(`${mode}/${seed}:${Math.round(sim.distance)}:${sim.cause}`);
          expect(sim.abilityUses, `${kind} ${mode}`).toBeGreaterThan(0);
        }
      }
      expect(fails, kind).toEqual([]);
    }
  }, 900000);
});
