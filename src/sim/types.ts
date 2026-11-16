/** Modelo da pista. Coordenadas da simulação: s = avanço (u), x = lateral (u, + = direita), y = altura (u). */
export interface Strip {
  x0: number;
  x1: number;
  s0: number;
  s1: number;
}

export type ObstacleKind = 'block' | 'wall' | 'mover' | 'spinner' | 'popup' | 'domino';

export interface Obstacle {
  kind: ObstacleKind;
  x0: number;
  x1: number;
  s0: number;
  s1: number;
  h: number; // altura acima do piso
  amp: number; // amplitude do movimento lateral (0 = fixo)
  freq: number; // rad/s
  phase: number;
  /** girador: velocidade angular do braço (rad/s); a caixa x0..x1/s0..s1 é o disco varrido */
  spin?: number;
  /** personalidade: semente 0..1 do rosto (olhos, sobrancelha, sono); ausente = sem rosto */
  face?: number;
}

export type DecoKind = 'billboard' | 'duck' | 'ufo' | 'sleepy' | 'arch';
/** Decoração e surpresas: nunca colidem. */
export interface Deco {
  kind: DecoKind;
  s: number;
  side: -1 | 1;
  variant: number;
}

export type HintKind = 'obstacle' | 'edge' | 'boost';

export interface Segment {
  id: number;
  kind: string;
  s0: number;
  s1: number;
  h0: number; // altura do piso na entrada
  h1: number; // altura do piso na saída
  floors: Strip[];
  obstacles: Obstacle[];
  pads: Strip[]; // faixas de aceleração (ciano)
  tunnel: boolean;
  maxAir: number; // maior trecho sem piso permitido (u) — lacunas validadas
  rating: number;
  hint: HintKind | null;
  /** ambiente (mapa) a que o trecho pertence */
  zone?: number;
  deco?: Deco[];
}

export type Interval = [number, number];

export function floorHeight(seg: Segment, s: number): number {
  const len = seg.s1 - seg.s0;
  if (len <= 0) return seg.h0;
  const t = Math.min(1, Math.max(0, (s - seg.s0) / len));
  return seg.h0 + (seg.h1 - seg.h0) * t;
}

export function slopeOf(seg: Segment): number {
  const len = seg.s1 - seg.s0;
  return len > 0 ? (seg.h1 - seg.h0) / len : 0;
}

/** Posição lateral de um obstáculo no tempo t (móveis oscilam). */
export function obstacleOffset(o: Obstacle, t: number): number {
  return o.amp === 0 ? 0 : o.amp * Math.sin(o.freq * t + o.phase);
}

/** Ângulo do braço de um girador no tempo t. */
export function spinnerAngle(o: Obstacle, t: number): number {
  return o.phase + (o.spin ?? 0) * t;
}

export const SPINNER_HALF_WIDTH = 0.2;

// ---- operações com intervalos (validação de rota) ----
export function mergeIntervals(list: Interval[]): Interval[] {
  const a = list.filter((i) => i[1] >= i[0]).sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  for (const it of a) {
    const last = out[out.length - 1];
    if (last && it[0] <= last[1]) last[1] = Math.max(last[1], it[1]);
    else out.push([it[0], it[1]]);
  }
  return out;
}

export function expandIntervals(list: Interval[], e: number): Interval[] {
  return mergeIntervals(list.map(([a, b]) => [a - e, b + e] as Interval));
}

export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi >= lo) out.push([lo, hi]);
    }
  }
  return mergeIntervals(out);
}

export function subtractInterval(list: Interval[], c0: number, c1: number): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of list) {
    if (c1 <= a || c0 >= b) {
      out.push([a, b]);
      continue;
    }
    if (c0 > a) out.push([a, c0]);
    if (c1 < b) out.push([c1, b]);
  }
  return out;
}

export function totalWidth(list: Interval[]): number {
  return list.reduce((acc, [a, b]) => acc + (b - a), 0);
}
