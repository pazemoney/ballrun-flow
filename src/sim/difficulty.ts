export type Mode = 'facil' | 'medio' | 'dificil' | 'extremo';
export const MODES: readonly Mode[] = ['facil', 'medio', 'dificil', 'extremo'];

/** Distância entre aceleradores de nível (u ≈ m). */
export const LEVEL_LEN = 1000;

export interface ModeParams {
  id: Mode;
  label: string;
  shade: string; // cor do modo (rosto, nome, seletor): verde, amarelo, vermelho, roxo
  speed0: number; // velocidade constante no nível 0 (u/s)
  levelGain: number; // ganho de velocidade por acelerador (fração da velocidade inicial)
  width: number; // largura da pista
  widthMin: number;
  strip: number; // largura das passagens estreitas
  stripMin: number;
  tier0: number; // complexidade dos obstáculos no nível 0
  tierPerLevel: number;
  gap0: number; // segundos entre fileiras de obstáculos no nível 0
  gapMin: number; // piso: nunca menos tempo de reação que isso
  gapPerLevel: number;
}

/**
 * Regra do jogo:
 * - a bola anda numa velocidade CONSTANTE por modo; só os aceleradores (a cada 1 km) mudam a velocidade;
 * - cada acelerador sobe 1 nível: um pouco mais rápido, obstáculos mais próximos e mais difíceis;
 * - FÁCIL = devagar, obstáculos bem espaçados e simples; EXTREMO = começa rápido, obstáculos próximos e difíceis;
 * - não há nível máximo; o ganho por nível diminui devagar (nunca zera), e o tempo de reação tem piso.
 */
export const MODE_PARAMS: Record<Mode, ModeParams> = {
  facil: {
    id: 'facil', label: 'FÁCIL', shade: '#35d07f', speed0: 9.5, levelGain: 0.04,
    width: 5.2, widthMin: 4.8, strip: 2.3, stripMin: 1.7, tier0: 0, tierPerLevel: 0.35,
    gap0: 2.0, gapMin: 1.1, gapPerLevel: 0.06,
  },
  medio: {
    id: 'medio', label: 'MÉDIO', shade: '#ffd23f', speed0: 13, levelGain: 0.045,
    width: 4.9, widthMin: 4.5, strip: 1.85, stripMin: 1.45, tier0: 1.0, tierPerLevel: 0.5,
    gap0: 1.45, gapMin: 0.9, gapPerLevel: 0.05,
  },
  dificil: {
    id: 'dificil', label: 'DIFÍCIL', shade: '#ff4d5e', speed0: 17, levelGain: 0.04,
    width: 4.6, widthMin: 4.3, strip: 1.55, stripMin: 1.3, tier0: 2.4, tierPerLevel: 0.55,
    gap0: 1.1, gapMin: 0.78, gapPerLevel: 0.04,
  },
  extremo: {
    id: 'extremo', label: 'EXTREMO', shade: '#a64dff', speed0: 21.5, levelGain: 0.035,
    width: 4.4, widthMin: 4.2, strip: 1.35, stripMin: 1.2, tier0: 3.8, tierPerLevel: 0.65,
    gap0: 0.9, gapMin: 0.68, gapPerLevel: 0.03,
  },
};

export interface Progress {
  level: number;
  speed: number;
  width: number;
  strip: number;
  tier: number;
  rowGap: number;
  chain: number;
}

/** Soma do ganho dos níveis 1..L: cresce sempre (sem teto), cada vez um pouco menos. */
export function levelBoost(L: number): number {
  let h = 0;
  for (let k = 1; k <= L; k++) h += 1 / (1 + 0.04 * k);
  return h;
}

const cache = new Map<string, Progress>();
/** Parâmetros do nível L (constantes dentro do nível). */
export function progressForLevel(mode: Mode, level: number): Progress {
  const L = Math.max(0, Math.floor(level));
  const key = `${mode}:${L}`;
  const c = cache.get(key);
  if (c) return c;
  const p = MODE_PARAMS[mode];
  const k = 1 - Math.exp(-L / 8);
  const tier = p.tier0 + p.tierPerLevel * L;
  const r: Progress = {
    level: L,
    speed: p.speed0 * (1 + p.levelGain * levelBoost(L)),
    width: p.width + (p.widthMin - p.width) * k,
    strip: p.strip + (p.stripMin - p.strip) * k,
    tier,
    rowGap: Math.max(p.gapMin, p.gap0 - p.gapPerLevel * L),
    chain: 1 + Math.min(6, Math.floor(tier * 0.7)),
  };
  if (cache.size > 4000) cache.clear();
  cache.set(key, r);
  return r;
}

/** Compatibilidade: nível pela distância nominal (1 acelerador a cada LEVEL_LEN). */
export function progressAt(mode: Mode, dist: number): Progress {
  return progressForLevel(mode, Math.floor(Math.max(0, dist) / LEVEL_LEN));
}

export function scoreFor(dist: number, unit: number): number {
  return Math.max(0, Math.floor(dist / unit));
}
