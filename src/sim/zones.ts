/**
 * Ambientes (mapas). Cada partida passa por vários, em ordem sorteada e sem repetir os recentes.
 * Cada ambiente muda o estilo da pista (pesos dos trechos) e o visual (render/theme.ts).
 */
export interface ZoneDef {
  id: number;
  name: string;
  weights: Record<string, number>; // multiplicador por tipo de trecho
  deco: { billboard: number; duck: number; ufo: number };
}

export const ZONES: ZoneDef[] = [
  { id: 0, name: 'Centro à Noite', weights: { blocks: 1.4, movers: 1.3, popups: 1.2 }, deco: { billboard: 0.16, duck: 0.01, ufo: 0.02 } },
  { id: 1, name: 'Parque Maluco', weights: { spinner: 2.4, wave: 2, popups: 1.6, dominoes: 1.4 }, deco: { billboard: 0.22, duck: 0.04, ufo: 0.01 } },
  { id: 2, name: 'Céu Aberto', weights: { platforms: 2.2, jump: 2, split: 1.6, snake: 1.4, narrow: 1.3 }, deco: { billboard: 0.05, duck: 0.03, ufo: 0.05 } },
  { id: 3, name: 'Neblina', weights: { snake: 1.6, narrow: 1.5, zigzag: 1.3 }, deco: { billboard: 0.08, duck: 0.02, ufo: 0.02 } },
  { id: 4, name: 'Labirinto', weights: { barrier: 2.2, gauntlet: 2.2, narrowBlocks: 1.8, slalom: 1.4 }, deco: { billboard: 0.12, duck: 0.01, ufo: 0.01 } },
  { id: 5, name: 'Nevasca', weights: { zigzag: 1.6, slalom: 1.8, blocks: 1.2, stairs: 1.5 }, deco: { billboard: 0.1, duck: 0.03, ufo: 0.01 } },
  { id: 6, name: 'Eclipse', weights: { dominoes: 2, tunnel: 1.6, rampUp: 1.3, rampDown: 1.3 }, deco: { billboard: 0.06, duck: 0.01, ufo: 0.04 } },
  { id: 7, name: 'Tempestade', weights: { movers: 1.8, wave: 1.5, popups: 1.5, spinner: 1.3 }, deco: { billboard: 0.1, duck: 0.02, ufo: 0.02 } },
];

export const ZONE_LEN_MIN = 700;
export const ZONE_LEN_MAX = 1100;
