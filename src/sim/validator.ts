import { BALL_R, LAT_MAX_SPEED } from './constants';
import {
  expandIntervals, intersectIntervals, mergeIntervals, subtractInterval,
  type Interval, type Segment,
} from './types';

/** Margens da validação: a rota precisa caber com folga, não "no limite". */
export const EDGE_MARGIN = 0.12; // centro da bola a 12 cm da borda
export const OBS_MARGIN = BALL_R + 0.15; // centro da bola longe do bloco: raio + 15 cm
export const VALID_LAT = LAT_MAX_SPEED * 0.42; // capacidade lateral usada na validação (42% da real: tempo de reação e inércia)
export const SLICE = 0.25; // resolução da validação (u)

/** Intervalos de x em que o centro da bola pode estar em s, com margens. */
export function freeAt(segs: readonly Segment[], s: number, edge = EDGE_MARGIN, obs = OBS_MARGIN): Interval[] {
  let floors: Interval[] = [];
  for (const seg of segs) {
    if (s < seg.s0 - 1e-6 || s > seg.s1 + 1e-6) continue;
    for (const f of seg.floors) {
      if (s >= f.s0 - 1e-6 && s <= f.s1 + 1e-6) floors.push([f.x0 + edge, f.x1 - edge]);
    }
  }
  floors = mergeIntervals(floors);
  for (const seg of segs) {
    if (s < seg.s0 - obs || s > seg.s1 + obs) continue;
    for (const o of seg.obstacles) {
      if (s < o.s0 - obs || s > o.s1 + obs) continue;
      // obstáculo móvel ocupa toda a faixa varrida (conservador)
      floors = subtractInterval(floors, o.x0 - o.amp - obs, o.x1 + o.amp + obs);
    }
  }
  return floors;
}

export function hasFloor(segs: readonly Segment[], s: number): boolean {
  for (const seg of segs) {
    if (s < seg.s0 - 1e-6 || s > seg.s1 + 1e-6) continue;
    for (const f of seg.floors) if (s >= f.s0 - 1e-6 && s <= f.s1 + 1e-6) return true;
  }
  return false;
}

export interface ValidateCtx {
  speedAt: (s: number) => number; // velocidade de avanço esperada em s (considera aceleração)
}

/**
 * Propaga o conjunto de posições laterais alcançáveis através dos segmentos.
 * Retorna o conjunto na saída, ou null se em algum ponto não há rota segura.
 */
export function propagate(group: readonly Segment[], entry: Interval[], ctx: ValidateCtx, context: readonly Segment[] = []): Interval[] | null {
  if (group.length === 0) return entry;
  const all = [...context, ...group];
  let reach = entry;
  const first = group[0];
  const last = group[group.length - 1];
  if (!first || !last) return entry;
  // amostras numa grade global (múltiplos de SLICE): validar por partes = validar tudo de uma vez
  let k = Math.ceil((first.s0 - 1e-9) / SLICE);
  let air = 0;
  for (;;) {
    const s = k * SLICE;
    if (s > last.s1 + 1e-9) break;
    k++;
    const v = Math.max(1, ctx.speedAt(s));
    const seg = group.find((g) => s >= g.s0 - 1e-6 && s <= g.s1 + 1e-6) ?? last;
    reach = expandIntervals(reach, (VALID_LAT * SLICE) / v);
    if (!hasFloor(all, s)) {
      air += SLICE;
      if (air > seg.maxAir + 1e-6) return null;
    } else {
      air = 0;
      reach = intersectIntervals(reach, freeAt(all, s));
      if (reach.length === 0) return null;
    }
  }
  if (air > 0) return null; // grupo não pode terminar no ar
  return reach;
}
