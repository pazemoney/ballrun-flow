import { Color } from 'three';

/**
 * Visual de cada ambiente — só preto, branco e cinzas (identidade Flow).
 * Índice = id do ambiente em sim/zones.ts. A troca entre ambientes é suave (80 u).
 */
export interface Look {
  floor: string; grid: string; side: string;
  city: string; cityFill: string; window: string; windowRate: number;
  fog: string; fogNear: number; fogFar: number;
  obstacle: string; obstacleEdge: string; pad: string; tunnel: string;
  stars: number; sun: number; snow: number; rain: number; cityShow: number;
}

export const LOOKS: Look[] = [
  // 0 Centro à Noite
  { floor: '#3c3c43', grid: '#cfcfd6', side: '#1a1a1e', city: '#6e6e76', cityFill: '#0d0d10', window: '#f3f1ea', windowRate: 0.42, fog: '#060607', fogNear: 45, fogFar: 160, obstacle: '#2f2f35', obstacleEdge: '#f5f5f5', pad: '#ffffff', tunnel: '#202024', stars: 0.4, sun: 0, snow: 0, rain: 0, cityShow: 1 },
  // 1 Parque Maluco
  { floor: '#404047', grid: '#e8e8ee', side: '#1d1d22', city: '#8a8a92', cityFill: '#101013', window: '#ffffff', windowRate: 0.6, fog: '#08080a', fogNear: 50, fogFar: 170, obstacle: '#2f2f35', obstacleEdge: '#ffffff', pad: '#ffffff', tunnel: '#26262b', stars: 0.6, sun: 0, snow: 0, rain: 0, cityShow: 0.9 },
  // 2 Céu Aberto
  { floor: '#46464d', grid: '#e2e2e8', side: '#222227', city: '#4a4a52', cityFill: '#0b0b0d', window: '#cfcfd4', windowRate: 0.15, fog: '#0b0b0d', fogNear: 60, fogFar: 190, obstacle: '#2f2f35', obstacleEdge: '#ffffff', pad: '#ffffff', tunnel: '#242428', stars: 1, sun: 0, snow: 0, rain: 0, cityShow: 0.35 },
  // 3 Neblina
  { floor: '#404046', grid: '#c4c4cb', side: '#222226', city: '#5c5c64', cityFill: '#1a1a1d', window: '#d9d9dd', windowRate: 0.3, fog: '#1c1c20', fogNear: 30, fogFar: 125, obstacle: '#2f2f35', obstacleEdge: '#f0f0f0', pad: '#ffffff', tunnel: '#2a2a2f', stars: 0, sun: 0, snow: 0, rain: 0, cityShow: 1 },
  // 4 Labirinto
  { floor: '#36363c', grid: '#bdbdc4', side: '#161619', city: '#7a7a82', cityFill: '#0a0a0c', window: '#e8e8ec', windowRate: 0.5, fog: '#050506', fogNear: 45, fogFar: 160, obstacle: '#2f2f35', obstacleEdge: '#ffffff', pad: '#ffffff', tunnel: '#1c1c20', stars: 0.2, sun: 0, snow: 0, rain: 0, cityShow: 1 },
  // 5 Nevasca
  { floor: '#55555c', grid: '#f0f0f4', side: '#2c2c31', city: '#7c7c84', cityFill: '#16161a', window: '#ffffff', windowRate: 0.35, fog: '#202024', fogNear: 35, fogFar: 140, obstacle: '#2f2f35', obstacleEdge: '#ffffff', pad: '#ffffff', tunnel: '#303036', stars: 0, sun: 0, snow: 1, rain: 0, cityShow: 1 },
  // 6 Eclipse
  { floor: '#2e2e33', grid: '#e8e8ee', side: '#121214', city: '#3c3c42', cityFill: '#050506', window: '#ffffff', windowRate: 0.2, fog: '#030303', fogNear: 55, fogFar: 180, obstacle: '#2f2f35', obstacleEdge: '#ffffff', pad: '#ffffff', tunnel: '#18181b', stars: 0.8, sun: 1, snow: 0, rain: 0, cityShow: 0.7 },
  // 7 Tempestade
  { floor: '#38383e', grid: '#c8c8ce', side: '#18181b', city: '#56565e', cityFill: '#0c0c0e', window: '#dcdce0', windowRate: 0.38, fog: '#0d0d10', fogNear: 40, fogFar: 150, obstacle: '#2f2f35', obstacleEdge: '#f2f2f2', pad: '#ffffff', tunnel: '#222226', stars: 0, sun: 0, snow: 0, rain: 1, cityShow: 1 },
];

const COLOR_KEYS = ['floor', 'grid', 'side', 'city', 'cityFill', 'window', 'fog', 'obstacle', 'obstacleEdge', 'pad', 'tunnel'] as const;
const NUM_KEYS = ['windowRate', 'fogNear', 'fogFar', 'stars', 'sun', 'snow', 'rain', 'cityShow'] as const;
type ColorKey = (typeof COLOR_KEYS)[number];
type NumKey = (typeof NUM_KEYS)[number];

export type ThemeColors = Record<ColorKey, Color> & Record<NumKey, number>;

export function makeTheme(): ThemeColors {
  const l = LOOKS[0] as Look;
  const t = {} as ThemeColors;
  for (const k of COLOR_KEYS) t[k] = new Color(l[k]);
  for (const k of NUM_KEYS) t[k] = l[k];
  return t;
}

const ca = new Color();
const cb = new Color();
/** Mistura suave entre o ambiente atual e o anterior (blend 0..1). */
export function applyLook(out: ThemeColors, from: number, to: number, blend: number): void {
  const a = LOOKS[from] ?? (LOOKS[0] as Look);
  const b = LOOKS[to] ?? (LOOKS[0] as Look);
  const k = Math.max(0, Math.min(1, blend));
  for (const key of COLOR_KEYS) out[key].copy(ca.set(a[key])).lerp(cb.set(b[key]), k);
  for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
}

/**
 * Cor de destaque que muda a cada km (a cada acelerador): cidade, janelas, obstáculos e acelerador.
 * Sem amarelo/dourado (identidade Flow). No modo "Flow P&B" o destaque é branco.
 */
export const ACCENTS = ['#ff3fd8', '#2ef2ff', '#9b6bff', '#3dff8a', '#ff5468', '#4d94ff', '#ff8ce0', '#7dffe3', '#c86bff', '#ffffff'];
export type Palette = 'vivo' | 'flow';

const acc = new Color();
const white = new Color('#ffffff');
const tmp = new Color();
/** Aplica o destaque por cima do ambiente. level pode ser fracionário (transição suave). */
export function applyAccent(out: ThemeColors, level: number, palette: Palette): void {
  if (palette === 'flow') {
    acc.set('#f2f2f4');
  } else {
    const i = Math.floor(level);
    const f = level - i;
    acc.set(ACCENTS[((i % ACCENTS.length) + ACCENTS.length) % ACCENTS.length] ?? '#ffffff');
    tmp.set(ACCENTS[(((i + 1) % ACCENTS.length) + ACCENTS.length) % ACCENTS.length] ?? '#ffffff');
    acc.lerp(tmp, Math.max(0, Math.min(1, f)));
  }
  // obstáculo: corpo claro/colorido + contorno escuro (destaca da pista cinza em qualquer ambiente)
  out.obstacle.copy(acc).lerp(white, palette === 'flow' ? 0 : 0.18);
  out.obstacleEdge.set('#0c0c0e');
  out.pad.copy(acc).lerp(white, 0.1);
  if (palette === 'vivo') {
    out.window.copy(acc).lerp(white, 0.45);
    out.city.copy(acc).multiplyScalar(0.75);
    out.grid.lerp(acc, 0.25);
  }
}

/** Luminância relativa (WCAG) de uma cor sRGB #rrggbb. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] ?? 0) + 0.7152 * (ch[1] ?? 0) + 0.0722 * (ch[2] ?? 0);
}
