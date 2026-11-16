import { hashString } from '../core/rng';
import type { Mode } from '../sim/difficulty';
import type { DeathCause } from '../sim/game';
import { HISTORY_MAX, TUTORIAL_RUNS, type SaveData } from '../storage/save';
import { ACHIEVEMENT_LIST, checkAchievements, type AchDef } from './achievements';
import { BALLS, TRAILS, findBall, findTrail, type Unlock } from './catalog';

export const ACHIEVEMENTS = ACHIEVEMENT_LIST;

export interface RunResult {
  mode: Mode;
  daily: boolean;
  practice: boolean;
  score: number;
  dist: number;
  time: number;
  cause: DeathCause;
  jumps: number;
  boosts: number;
  nearMiss?: number;
  level?: number; // aceleradores cruzados na partida
  maxSpeed?: number; // u/s
  zoneDist?: number[]; // u por ambiente
}

export const DAILY_TARGET = 150;
export const DAILY_MODE: Mode = 'medio';

/** Moedas por partida: poucas, de propósito (1 a cada 500 m + 1 por acelerador). */
export function runCoins(dist: number, levels: number): number {
  return Math.floor(Math.max(0, dist) / 500) + Math.max(0, Math.floor(levels));
}

/** Tem o item? (grátis, conquista feita ou comprado) */
export function owns(s: SaveData, unlock: Unlock, id: string): boolean {
  if (unlock.kind === 'free') return true;
  if (unlock.kind === 'ach') return s.achievements.includes(unlock.id);
  return s.owned.includes(id);
}

export function skinUnlocked(s: SaveData, id: string): boolean {
  const b = findBall(id);
  return !!b && owns(s, b.unlock, b.id);
}

export function trailUnlocked(s: SaveData, id: string): boolean {
  const t = findTrail(id);
  return !!t && owns(s, t.unlock, t.id);
}

export function refreshOwnedCounts(s: SaveData): void {
  s.stats.ownedBalls = BALLS.filter((b) => owns(s, b.unlock, b.id)).length;
  s.stats.ownedTrails = TRAILS.filter((t) => owns(s, t.unlock, t.id)).length;
}

export type BuyResult = { ok: true; unlocked: AchDef[] } | { ok: false; reason: 'nao-existe' | 'ja-tem' | 'nao-vende' | 'sem-moedas' };

/** Compra com moedas (bola ou rastro). Nunca deixa saldo negativo nem cobra duas vezes. */
export function buy(s: SaveData, id: string): BuyResult {
  const item = findBall(id) ?? findTrail(id);
  if (!item) return { ok: false, reason: 'nao-existe' };
  if (owns(s, item.unlock, item.id)) return { ok: false, reason: 'ja-tem' };
  if (item.unlock.kind !== 'coins') return { ok: false, reason: 'nao-vende' };
  if (s.coins < item.unlock.price) return { ok: false, reason: 'sem-moedas' };
  s.coins -= item.unlock.price;
  s.coinsSpent += item.unlock.price;
  s.owned.push(item.id);
  refreshOwnedCounts(s);
  return { ok: true, unlocked: checkAchievements(s) };
}

export function todayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailySeed(date: string): number {
  return hashString(`ballrun-flow-${date}`);
}

export function ensureDaily(s: SaveData, date: string): void {
  if (s.daily.date !== date) s.daily = { date, best: 0, attempts: 0, completed: false };
}

export interface StartInfo {
  tutorial: boolean;
  tip: string | null;
}

/** Chamado UMA vez ao iniciar cada partida. Dicas automáticas só nas 5 primeiras partidas (no total). */
export function startRun(s: SaveData, opts: { mode: Mode; daily: boolean; practice: boolean }): StartInfo {
  if (opts.practice) return { tutorial: true, tip: null }; // treino guiado do menu de ajuda: não conta
  const tutorial = s.tutorial.runs < TUTORIAL_RUNS;
  let tip: string | null = null;
  if (tutorial) {
    const lc = s.tutorial.lastCauses;
    if (lc.length >= 2 && lc[lc.length - 1] === lc[lc.length - 2]) {
      tip = lc[lc.length - 1] === 'fall'
        ? 'Dica: movimentos curtos. A bola acompanha o dedo; não precisa arrastar até a borda.'
        : 'Dica: olhe mais à frente e desvie cedo. Os blocos aparecem bem antes.';
    }
  }
  s.tutorial.runs++;
  if (opts.daily) {
    s.daily.attempts++;
    s.stats.dailyAttempts++;
  }
  return { tutorial, tip };
}

export interface FinishInfo {
  newRecord: boolean;
  prevRecord: number;
  record: number;
  unlocked: AchDef[];
  dailyCompleted: boolean;
  newDist: boolean;
  newTime: boolean;
  coinsRun: number; // moedas da partida (distância + aceleradores)
  coinsAch: number; // moedas das conquistas novas
}

/** Fim de partida: grava recordes, estatísticas, histórico, moedas e conquistas. Treino não grava recorde. */
export function finishRun(s: SaveData, r: RunResult, now = new Date()): FinishInfo {
  s.tutorial.lastCauses = [...s.tutorial.lastCauses, r.cause].slice(-3);
  let prevRecord = 0;
  let record = 0;
  let newRecord = false;
  let dailyCompleted = false;
  let newDist = false;
  let newTime = false;
  let coinsRun = 0;
  const st = s.stats;
  const day = todayKey(now);
  if (!st.days.includes(day)) st.days = [...st.days, day].slice(-400);
  if (r.practice) st.practice++;
  if (!r.practice) {
    const levels = Math.max(0, Math.floor(r.level ?? 0));
    st.games++;
    st.distance += r.dist;
    st.time += r.time;
    st.jumps += r.jumps;
    st.boosts += r.boosts;
    st.nearMiss += r.nearMiss ?? 0;
    st.totalScore += r.score;
    st.levels += levels;
    st.maxSpeed = Math.max(st.maxSpeed, r.maxSpeed ?? 0);
    st.bestRunJumps = Math.max(st.bestRunJumps, r.jumps);
    st.bestRunNear = Math.max(st.bestRunNear, r.nearMiss ?? 0);
    st.bestRunLevels = Math.max(st.bestRunLevels, levels);
    st.runsByMode[r.mode]++;
    st.distByMode[r.mode] += r.dist;
    (r.zoneDist ?? []).forEach((d, i) => {
      if (i < st.zoneDist.length) st.zoneDist[i] = (st.zoneDist[i] ?? 0) + Math.max(0, d);
    });
    if (r.cause === 'hit') st.hits++;
    else st.falls++;
    if (!st.modesPlayed.includes(r.mode)) st.modesPlayed.push(r.mode);
    if (r.daily) {
      prevRecord = s.daily.best;
      newRecord = r.score > s.daily.best;
      s.daily.best = Math.max(s.daily.best, r.score);
      record = s.daily.best;
      if (r.score >= DAILY_TARGET && !s.daily.completed) {
        s.daily.completed = true;
        dailyCompleted = true;
        st.dailyDone++;
      }
    } else {
      prevRecord = s.records[r.mode];
      newRecord = r.score > prevRecord;
      s.records[r.mode] = Math.max(prevRecord, r.score);
      record = s.records[r.mode];
      newDist = r.dist > s.bestDist[r.mode] && s.bestDist[r.mode] > 0;
      newTime = r.time > s.bestTime[r.mode] && s.bestTime[r.mode] > 0;
      s.bestDist[r.mode] = Math.max(s.bestDist[r.mode], r.dist);
      s.bestTime[r.mode] = Math.max(s.bestTime[r.mode], r.time);
      s.bestLevel[r.mode] = Math.max(s.bestLevel[r.mode], levels);
    }
    if (newRecord && prevRecord > 0) st.recordsBroken++;
    coinsRun = runCoins(r.dist, levels);
    s.coins += coinsRun;
    s.coinsEarned += coinsRun;
    s.history.push({ mode: r.daily ? 'diario' : r.mode, score: r.score, dist: Math.round(r.dist), time: Math.round(r.time * 10) / 10, cause: r.cause, date: now.toISOString() });
    if (s.history.length > HISTORY_MAX) s.history.splice(0, s.history.length - HISTORY_MAX);
    s.lastMode = r.mode;
  }
  refreshOwnedCounts(s);
  const unlocked = checkAchievements(s);
  const coinsAch = unlocked.reduce((a, b) => a + b.reward, 0);
  return { newRecord: newRecord && r.score > 0, prevRecord, record, unlocked, dailyCompleted, newDist, newTime, coinsRun, coinsAch };
}
