import { MODES, type Mode } from '../sim/difficulty';
import type { DeathCause } from '../sim/game';

export const SAVE_VERSION = 1;
export const TUTORIAL_RUNS = 5;
export const HISTORY_MAX = 30;

export interface Settings {
  volume: number; // 0..1
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  sensitivity: number; // 0.6..1.6
  quality: 'auto' | 'alta' | 'baixa';
  reducedMotion: boolean;
  palette: 'vivo' | 'flow';
}

export interface Stats {
  games: number; distance: number; time: number; hits: number; falls: number; jumps: number; boosts: number; nearMiss: number;
  modesPlayed: Mode[];
  totalScore: number; levels: number; maxSpeed: number; recordsBroken: number; practice: number;
  zoneDist: number[]; days: string[]; bestRunJumps: number; bestRunNear: number; bestRunLevels: number;
  runsByMode: Record<Mode, number>; distByMode: Record<Mode, number>;
  dailyDone: number; dailyAttempts: number; photoUsed: boolean; ownedBalls: number; ownedTrails: number;
}

export interface RunRecord {
  mode: Mode | 'diario';
  score: number;
  dist: number;
  time: number;
  cause: DeathCause;
  date: string; // ISO
}

export interface SaveData {
  v: number;
  settings: Settings;
  records: Record<Mode, number>;
  bestDist: Record<Mode, number>; // maior distância (u)
  bestTime: Record<Mode, number>; // maior tempo de sobrevivência (s)
  daily: { date: string; best: number; attempts: number; completed: boolean };
  stats: Stats;
  bestLevel: Record<Mode, number>;
  coins: number;
  coinsEarned: number;
  coinsSpent: number;
  owned: string[]; // bolas e rastros comprados
  trail: string;
  history: RunRecord[];
  tutorial: { runs: number; lastCauses: DeathCause[] };
  achievements: string[];
  skin: string;
  lastMode: Mode;
  recentZones: number[];
}

const zeroModes = (): Record<Mode, number> => ({ facil: 0, medio: 0, dificil: 0, extremo: 0 });

export function defaultStats(): Stats {
  return {
    games: 0, distance: 0, time: 0, hits: 0, falls: 0, jumps: 0, boosts: 0, nearMiss: 0, modesPlayed: [],
    totalScore: 0, levels: 0, maxSpeed: 0, recordsBroken: 0, practice: 0,
    zoneDist: [0, 0, 0, 0, 0, 0, 0, 0], days: [], bestRunJumps: 0, bestRunNear: 0, bestRunLevels: 0,
    runsByMode: zeroModes(), distByMode: zeroModes(), dailyDone: 0, dailyAttempts: 0, photoUsed: false, ownedBalls: 0, ownedTrails: 0,
  };
}

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    settings: { volume: 0.8, music: true, sfx: true, haptics: true, sensitivity: 1, quality: 'auto', reducedMotion: false, palette: 'vivo' },
    records: { facil: 0, medio: 0, dificil: 0, extremo: 0 },
    bestDist: { facil: 0, medio: 0, dificil: 0, extremo: 0 },
    bestTime: { facil: 0, medio: 0, dificil: 0, extremo: 0 },
    daily: { date: '', best: 0, attempts: 0, completed: false },
    stats: defaultStats(),
    bestLevel: { facil: 0, medio: 0, dificil: 0, extremo: 0 },
    coins: 0,
    coinsEarned: 0,
    coinsSpent: 0,
    owned: [],
    trail: 'classico',
    history: [],
    tutorial: { runs: 0, lastCauses: [] },
    achievements: [],
    skin: 'xadrez',
    lastMode: 'facil',
    recentZones: [],
  };
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string): string => (typeof v === 'string' && v.length < 200 ? v : d);
const isMode = (v: unknown): v is Mode => typeof v === 'string' && (MODES as readonly string[]).includes(v);
const isCause = (v: unknown): v is DeathCause => v === 'hit' || v === 'fall';
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Valida e normaliza dados lidos (corrompidos ou de versão antiga nunca derrubam o jogo). */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  const r = obj(raw);
  const st = obj(r.settings);
  d.settings = {
    volume: num(st.volume, d.settings.volume, 0, 1),
    music: bool(st.music, d.settings.music),
    sfx: bool(st.sfx, d.settings.sfx),
    haptics: bool(st.haptics, d.settings.haptics),
    sensitivity: num(st.sensitivity, 1, 0.6, 1.6),
    quality: st.quality === 'alta' || st.quality === 'baixa' ? st.quality : 'auto',
    reducedMotion: bool(st.reducedMotion, false),
    palette: st.palette === 'flow' ? 'flow' : 'vivo',
  };
  const rec = obj(r.records);
  const bd = obj(r.bestDist);
  const bt = obj(r.bestTime);
  for (const m of MODES) {
    d.records[m] = Math.floor(num(rec[m], 0, 0, 1e9));
    d.bestDist[m] = num(bd[m], 0, 0, 1e12);
    d.bestTime[m] = num(bt[m], 0, 0, 1e9);
  }
  const dy = obj(r.daily);
  d.daily = { date: str(dy.date, ''), best: Math.floor(num(dy.best, 0, 0, 1e9)), attempts: Math.floor(num(dy.attempts, 0, 0, 1e9)), completed: bool(dy.completed, false) };
  const ss = obj(r.stats);
  const ds = defaultStats();
  const cnt = (v: unknown) => Math.floor(num(v, 0, 0, 1e12));
  const modes = (v: unknown) => {
    const o = obj(v);
    const out = zeroModes();
    for (const m of MODES) out[m] = num(o[m], 0, 0, 1e12);
    return out;
  };
  d.stats = {
    ...ds,
    games: cnt(ss.games), distance: num(ss.distance, 0, 0, 1e12), time: num(ss.time, 0, 0, 1e12),
    hits: cnt(ss.hits), falls: cnt(ss.falls), jumps: cnt(ss.jumps), boosts: cnt(ss.boosts), nearMiss: cnt(ss.nearMiss),
    modesPlayed: Array.isArray(ss.modesPlayed) ? [...new Set(ss.modesPlayed.filter(isMode))] : [],
    totalScore: cnt(ss.totalScore), levels: cnt(ss.levels), maxSpeed: num(ss.maxSpeed, 0, 0, 1e4), recordsBroken: cnt(ss.recordsBroken), practice: cnt(ss.practice),
    zoneDist: Array.from({ length: 8 }, (_, i) => num(Array.isArray(ss.zoneDist) ? ss.zoneDist[i] : 0, 0, 0, 1e12)),
    days: Array.isArray(ss.days) ? [...new Set(ss.days.filter((x): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)))].slice(-400) : [],
    bestRunJumps: cnt(ss.bestRunJumps), bestRunNear: cnt(ss.bestRunNear), bestRunLevels: cnt(ss.bestRunLevels),
    runsByMode: modes(ss.runsByMode), distByMode: modes(ss.distByMode),
    dailyDone: cnt(ss.dailyDone), dailyAttempts: cnt(ss.dailyAttempts), photoUsed: bool(ss.photoUsed, false),
    ownedBalls: cnt(ss.ownedBalls), ownedTrails: cnt(ss.ownedTrails),
  };
  const bl = obj(r.bestLevel);
  for (const m of MODES) d.bestLevel[m] = Math.floor(num(bl[m], 0, 0, 1e6));
  d.coins = Math.floor(num(r.coins, 0, 0, 1e9));
  d.coinsEarned = Math.floor(num(r.coinsEarned, 0, 0, 1e9));
  d.coinsSpent = Math.floor(num(r.coinsSpent, 0, 0, 1e9));
  d.owned = Array.isArray(r.owned) ? [...new Set(r.owned.filter((x): x is string => typeof x === 'string' && x.length < 60))] : [];
  d.trail = str(r.trail, 'classico');
  d.history = Array.isArray(r.history)
    ? r.history.slice(-HISTORY_MAX).map(obj).filter((h) => (isMode(h.mode) || h.mode === 'diario') && isCause(h.cause)).map((h) => ({
        mode: h.mode as Mode | 'diario',
        score: Math.floor(num(h.score, 0, 0, 1e9)),
        dist: num(h.dist, 0, 0, 1e9),
        time: num(h.time, 0, 0, 1e9),
        cause: h.cause as DeathCause,
        date: str(h.date, ''),
      }))
    : [];
  const tu = obj(r.tutorial);
  d.tutorial = { runs: Math.floor(num(tu.runs, 0, 0, 1e9)), lastCauses: Array.isArray(tu.lastCauses) ? tu.lastCauses.filter(isCause).slice(-3) : [] };
  d.achievements = Array.isArray(r.achievements) ? [...new Set(r.achievements.filter((a): a is string => typeof a === 'string'))] : [];
  d.skin = str(r.skin, 'xadrez');
  d.recentZones = Array.isArray(r.recentZones) ? r.recentZones.filter((z): z is number => Number.isInteger(z) && z >= 0 && z < 64).slice(-6) : [];
  d.lastMode = isMode(r.lastMode) ? r.lastMode : 'facil';
  return d;
}

/** Armazenamento: localStorage no navegador; Capacitor Preferences nos apps (não é limpo pelo sistema). */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class MemoryKV implements KV {
  readonly data = new Map<string, string>();
  async get(k: string) {
    return this.data.get(k) ?? null;
  }
  async set(k: string, v: string) {
    this.data.set(k, v);
  }
}

export class LocalKV implements KV {
  async get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  async set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      console.warn('[save] localStorage indisponível', e);
    }
  }
}

const KEY = 'ballrun.flow.save';
const BACKUP = 'ballrun.flow.save.bak';
export const PHOTO_KEY = 'ballrun.flow.photo';

/** Salvamento com cópia de segurança: se a principal corromper, a cópia anterior é usada. */
export class SaveStore {
  data: SaveData = defaultSave();
  constructor(readonly kv: KV) {}

  async load(): Promise<SaveData> {
    for (const key of [KEY, BACKUP]) {
      try {
        const raw = await this.kv.get(key);
        if (!raw) continue;
        this.data = sanitize(JSON.parse(raw));
        return this.data;
      } catch (e) {
        console.warn(`[save] ${key} inválido`, e);
      }
    }
    this.data = defaultSave();
    return this.data;
  }

  async save(): Promise<void> {
    const json = JSON.stringify(this.data);
    await this.kv.set(KEY, json);
    await this.kv.set(BACKUP, json);
  }
}
