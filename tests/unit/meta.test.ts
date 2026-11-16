import { describe, it, expect } from 'vitest';
import { DAILY_TARGET, dailySeed, ensureDaily, finishRun, skinUnlocked, startRun, todayKey, type RunResult } from '../../src/game/meta';
import { defaultSave, MemoryKV, sanitize, SaveStore, TUTORIAL_RUNS } from '../../src/storage/save';
import { StateMachine } from '../../src/core/state';

const run = (over: Partial<RunResult> = {}): RunResult => ({ mode: 'facil', daily: false, practice: false, score: 50, dist: 250, time: 20, cause: 'hit', jumps: 1, boosts: 2, ...over });

describe('tutorial: só nas 5 primeiras partidas, no total', () => {
  it('partidas 1–5 com dicas; 6ª em diante sem, mesmo trocando de modo', () => {
    const s = defaultSave();
    const modes = ['facil', 'extremo', 'medio', 'dificil', 'facil', 'medio', 'extremo', 'facil'] as const;
    modes.forEach((mode, i) => {
      const info = startRun(s, { mode, daily: false, practice: false });
      expect(info.tutorial, `partida ${i + 1}`).toBe(i < TUTORIAL_RUNS);
      finishRun(s, run({ mode }));
    });
  });
  it('persiste ao fechar e abrir (salvar/carregar)', async () => {
    const kv = new MemoryKV();
    const a = new SaveStore(kv);
    await a.load();
    for (let i = 0; i < 4; i++) startRun(a.data, { mode: 'facil', daily: false, practice: false });
    await a.save();
    const b = new SaveStore(kv);
    await b.load();
    expect(startRun(b.data, { mode: 'dificil', daily: false, practice: false }).tutorial).toBe(true); // 5ª
    expect(startRun(b.data, { mode: 'dificil', daily: false, practice: false }).tutorial).toBe(false); // 6ª
  });
  it('treino guiado do menu de ajuda não conta e não grava recorde', () => {
    const s = defaultSave();
    for (let i = 0; i < 3; i++) startRun(s, { mode: 'facil', daily: false, practice: true });
    expect(s.tutorial.runs).toBe(0);
    finishRun(s, run({ practice: true, score: 999 }));
    expect(s.records.facil).toBe(0);
    expect(s.stats.games).toBe(0);
  });
  it('dica contextual após o mesmo erro duas vezes', () => {
    const s = defaultSave();
    startRun(s, { mode: 'facil', daily: false, practice: false });
    finishRun(s, run({ cause: 'fall' }));
    startRun(s, { mode: 'facil', daily: false, practice: false });
    finishRun(s, run({ cause: 'fall' }));
    const info = startRun(s, { mode: 'facil', daily: false, practice: false });
    expect(info.tip).toMatch(/movimentos curtos/);
    // depois do tutorial, nunca mais
    s.tutorial.runs = 10;
    expect(startRun(s, { mode: 'facil', daily: false, practice: false }).tip).toBeNull();
  });
});

describe('recordes e estatísticas', () => {
  it('recorde separado por dificuldade e indicação de novo recorde', () => {
    const s = defaultSave();
    expect(finishRun(s, run({ score: 40 })).newRecord).toBe(true);
    expect(finishRun(s, run({ score: 30 })).newRecord).toBe(false);
    expect(finishRun(s, run({ score: 41 })).newRecord).toBe(true);
    finishRun(s, run({ mode: 'extremo', score: 10 }));
    expect(s.records).toEqual({ facil: 41, medio: 0, dificil: 0, extremo: 10 });
    expect(s.stats.games).toBe(4);
    expect(s.history.length).toBe(4);
  });
  it('pontuação zero não é "novo recorde"', () => {
    const s = defaultSave();
    expect(finishRun(s, run({ score: 0 })).newRecord).toBe(false);
  });
  it('histórico limitado e conquistas/skins liberadas', () => {
    const s = defaultSave();
    for (let i = 0; i < 40; i++) finishRun(s, run({ score: 10 + i }));
    expect(s.history.length).toBe(30);
    expect(s.achievements).toContain('partidas-1');
    expect(s.achievements).toContain('partidas-10');
    expect(skinUnlocked(s, 'golfe')).toBe(true);
    expect(skinUnlocked(s, 'disco')).toBe(false);
    finishRun(s, run({ score: 600, dist: 3000 }));
    expect(skinUnlocked(s, 'disco')).toBe(true);
  });
  it('desafio do dia: seed fixa por data, meta e troca de dia', () => {
    const s = defaultSave();
    expect(dailySeed('2026-11-15')).toBe(dailySeed('2026-11-15'));
    expect(dailySeed('2026-11-15')).not.toBe(dailySeed('2026-11-16'));
    ensureDaily(s, '2026-11-15');
    startRun(s, { mode: 'medio', daily: true, practice: false });
    const f = finishRun(s, run({ mode: 'medio', daily: true, score: DAILY_TARGET }));
    expect(f.dailyCompleted).toBe(true);
    expect(s.records.medio).toBe(0); // desafio não mexe no recorde do modo
    ensureDaily(s, '2026-11-16');
    expect(s.daily.best).toBe(0);
    expect(skinUnlocked(s, 'marmore')).toBe(true);
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('salvamento', () => {
  it('dados corrompidos ou maliciosos viram valores seguros', () => {
    const bad = sanitize({ settings: { volume: 99, sensitivity: 'x', quality: 'ultra' }, records: { facil: -5, medio: 'a', dificil: 1e20, extremo: NaN }, history: [{ mode: 'hack', cause: 'hit' }, 3], tutorial: { runs: -3 }, skin: 42 });
    expect(bad.settings.volume).toBe(1);
    expect(bad.settings.sensitivity).toBe(1);
    expect(bad.settings.quality).toBe('auto');
    expect(bad.records).toEqual({ facil: 0, medio: 0, dificil: 1e9, extremo: 0 });
    expect(bad.history).toEqual([]);
    expect(bad.tutorial.runs).toBe(0);
    expect(bad.skin).toBe('xadrez');
    expect(sanitize(null)).toEqual(defaultSave());
  });
  it('JSON inválido no armazenamento não derruba o jogo', async () => {
    const kv = new MemoryKV();
    await kv.set('ballrun.flow.save', '{quebrado');
    const st = new SaveStore(kv);
    expect((await st.load()).v).toBe(1);
  });
});

describe('máquina de estados', () => {
  it('ciclo completo repetido e transições inválidas ignoradas', () => {
    const sm = new StateMachine();
    expect(sm.go('playing')).toBe(false); // não joga antes de carregar
    expect(sm.go('menu')).toBe(true);
    for (let i = 0; i < 200; i++) {
      expect(sm.go('playing')).toBe(true);
      expect(sm.go('paused')).toBe(true);
      expect(sm.go('paused')).toBe(false);
      expect(sm.go('playing')).toBe(true);
      expect(sm.go('gameover')).toBe(true);
      expect(sm.go('gameover')).toBe(false); // fim de partida não dispara duas vezes
      expect(sm.go('paused')).toBe(false);
      expect(sm.go(i % 2 ? 'playing' : 'menu')).toBe(true);
      if (sm.state === 'playing') sm.go('menu');
    }
    expect(sm.go('loading')).toBe(false);
  });
});

describe('recordes de distância e tempo', () => {
  it('guarda maior distância e maior tempo por modo, sem perder com partidas piores', () => {
    const s = defaultSave();
    finishRun(s, run({ dist: 800, time: 60 }));
    const f = finishRun(s, run({ dist: 1200, time: 50 }));
    expect(f.newDist).toBe(true);
    expect(f.newTime).toBe(false);
    finishRun(s, run({ dist: 100, time: 5 }));
    expect(s.bestDist.facil).toBe(1200);
    expect(s.bestTime.facil).toBe(60);
    expect(s.bestDist.extremo).toBe(0);
  });
  it('cópia de segurança: salvamento principal corrompido usa a cópia', async () => {
    const kv = new MemoryKV();
    const a = new SaveStore(kv);
    await a.load();
    a.data.records.medio = 777;
    await a.save();
    await kv.set('ballrun.flow.save', '{corrompido');
    const b = new SaveStore(kv);
    expect((await b.load()).records.medio).toBe(777);
  });
});
