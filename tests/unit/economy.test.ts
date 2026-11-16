import { describe, it, expect } from 'vitest';
import { ACHIEVEMENT_LIST, checkAchievements } from '../../src/game/achievements';
import { BALLS, TRAILS } from '../../src/game/catalog';
import { buy, finishRun, owns, runCoins, startRun, type RunResult } from '../../src/game/meta';
import { defaultSave } from '../../src/storage/save';
import { ACCENTS, LOOKS, applyAccent, applyLook, luminance, makeTheme } from '../../src/render/theme';

const run = (o: Partial<RunResult> = {}): RunResult => ({ mode: 'facil', daily: false, practice: false, score: 60, dist: 300, time: 25, cause: 'hit', jumps: 0, boosts: 0, level: 0, ...o });

describe('conquistas, bolas e rastros', () => {
  it('cerca de 500 conquistas, ids únicos, recompensa pequena', () => {
    expect(ACHIEVEMENT_LIST.length).toBeGreaterThanOrEqual(480);
    expect(new Set(ACHIEVEMENT_LIST.map((a) => a.id)).size).toBe(ACHIEVEMENT_LIST.length);
    for (const a of ACHIEVEMENT_LIST) {
      expect(a.reward).toBeGreaterThanOrEqual(1);
      expect(a.reward).toBeLessThanOrEqual(25);
      expect(a.target).toBeGreaterThan(0);
    }
  });
  it('50 bolas e 50 rastros; padrão xadrez e foto grátis; preços baixos; conquistas citadas existem', () => {
    expect(BALLS.length).toBeGreaterThanOrEqual(50);
    expect(TRAILS.length).toBeGreaterThanOrEqual(50);
    const ids = new Set(ACHIEVEMENT_LIST.map((a) => a.id));
    for (const it of [...BALLS, ...TRAILS]) {
      if (it.unlock.kind === 'coins') {
        expect(it.unlock.price).toBeGreaterThanOrEqual(10);
        expect(it.unlock.price).toBeLessThanOrEqual(100);
      }
      if (it.unlock.kind === 'ach') expect(ids.has(it.unlock.id), it.unlock.id).toBe(true);
    }
    expect(new Set(BALLS.map((b) => b.id)).size).toBe(BALLS.length);
    expect(new Set(TRAILS.map((b) => b.id)).size).toBe(TRAILS.length);
    expect(BALLS[0]!.id).toBe('xadrez');
    expect(BALLS.find((b) => b.id === 'foto')!.unlock.kind).toBe('free');
    const s = defaultSave();
    expect(owns(s, BALLS[0]!.unlock, 'xadrez')).toBe(true);
    expect(s.skin).toBe('xadrez');
  });
  it('moedas escassas: poucas por partida; tudo pode ser comprado com as conquistas', () => {
    expect(runCoins(3000, 3)).toBe(9);
    expect(runCoins(450, 0)).toBe(0);
    const priced = [...BALLS, ...TRAILS].reduce((a, b) => a + (b.unlock.kind === 'coins' ? b.unlock.price : 0), 0);
    const fromAch = ACHIEVEMENT_LIST.reduce((a, b) => a + b.reward, 0);
    expect(fromAch).toBeGreaterThan(priced * 0.6); // a maior parte do catálogo vem só das conquistas
  });
  it('compra: sem moedas recusa; com moedas compra uma vez; conquista não se compra', () => {
    const s = defaultSave();
    const item = BALLS.find((b) => b.unlock.kind === 'coins')!;
    const price = (item.unlock as { price: number }).price;
    expect(buy(s, item.id)).toEqual({ ok: false, reason: 'sem-moedas' });
    s.coins = price + 3;
    const r = buy(s, item.id);
    expect(r.ok).toBe(true);
    const bonus = r.ok ? r.unlocked.reduce((a, b) => a + b.reward, 0) : 0; // conquistas de coleção
    expect(s.coins).toBe(3 + bonus);
    expect(s.coinsSpent).toBe(price);
    expect(buy(s, item.id)).toEqual({ ok: false, reason: 'ja-tem' });
    const locked = BALLS.find((b) => b.unlock.kind === 'ach')!;
    s.coins = 999;
    expect(buy(s, locked.id)).toEqual({ ok: false, reason: 'nao-vende' });
    expect(buy(s, 'nao-existe')).toEqual({ ok: false, reason: 'nao-existe' });
  });
  it('fim de partida dá moedas e conquistas; nada vira negativo; reiniciar não apaga', () => {
    const s = defaultSave();
    startRun(s, { mode: 'facil', daily: false, practice: false });
    const f = finishRun(s, run({ dist: 2600, score: 520, level: 2, maxSpeed: 14, zoneDist: [2600, 0, 0, 0, 0, 0, 0, 0] }));
    expect(f.coinsRun).toBe(7);
    expect(f.unlocked.length).toBeGreaterThan(5);
    expect(s.coins).toBe(f.coinsRun + f.coinsAch);
    expect(s.bestLevel.facil).toBe(2);
    expect(s.stats.zoneDist[0]).toBe(2600);
    const before = s.achievements.length;
    expect(checkAchievements(s)).toEqual([]); // idempotente
    expect(s.achievements.length).toBe(before);
    // partida pior não mexe nos recordes
    finishRun(s, run({ dist: 100, score: 20 }));
    expect(s.records.facil).toBe(520);
    // treino não dá moedas
    const c = s.coins;
    const tr = finishRun(s, run({ practice: true, dist: 5000 }));
    expect(tr.coinsRun).toBe(0); // só a conquista do treino dá moeda
    expect(s.coins).toBe(c + tr.coinsAch);
  });
});

describe('cores e destaque dos obstáculos', () => {
  const hue = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 0.05) return -1;
    let h = mx === r ? (g - b) / (mx - mn) : mx === g ? 2 + (b - r) / (mx - mn) : 4 + (r - g) / (mx - mn);
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  it('sem amarelo/dourado no destaque (identidade Flow)', () => {
    for (const a of ACCENTS) {
      const h = hue(a);
      expect(h >= 38 && h <= 70, a).toBe(false);
    }
  });
  it('obstáculo sempre destaca da pista: contraste ≥ 3:1 em todo ambiente e toda cor', () => {
    for (const [zi, l] of LOOKS.entries()) {
      const lf = luminance(l.floor);
      for (const [pal, n] of [['vivo', ACCENTS.length], ['flow', 1]] as const) for (let lv = 0; lv < n; lv++) {
        const t = makeTheme();
        applyLook(t, zi, zi, 1);
        applyAccent(t, lv, pal);
        const a = `#${t.obstacle.getHexString()}`;
        const lo = luminance(a);
        const ratio = (Math.max(lo, lf) + 0.05) / (Math.min(lo, lf) + 0.05);
        expect(ratio, `${a} sobre ${l.floor}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
