import { Generator, type GenOptions } from './generator';
import type { Mode } from './difficulty';
import { floorHeight, slopeOf, type Obstacle, type Segment } from './types';
import { EDGE_TOL } from './constants';

export interface FloorHit {
  h: number;
  slope: number;
  seg: Segment;
}

/** Janela da pista gerada à frente da bola; segmentos que ficaram para trás são descartados. */
export class Track {
  readonly gen: Generator;
  readonly segments: Segment[] = [];
  private cursor = 0;
  onAdd: ((s: Segment) => void) | null = null;
  onRemove: ((s: Segment) => void) | null = null;

  constructor(readonly mode: Mode, readonly seed: number, opts: GenOptions = {}) {
    this.gen = new Generator(mode, seed, opts);
  }

  ensure(sAhead: number): void {
    let guard = 0;
    while (this.gen.sEnd < sAhead && guard++ < 200) {
      for (const seg of this.gen.next()) {
        this.segments.push(seg);
        this.onAdd?.(seg);
      }
    }
  }

  prune(sBehind: number): void {
    while (this.segments.length > 1) {
      const first = this.segments[0];
      if (!first || first.s1 >= sBehind) break;
      this.segments.shift();
      this.cursor = Math.max(0, this.cursor - 1);
      this.onRemove?.(first);
    }
  }

  indexAt(s: number): number {
    const segs = this.segments;
    if (segs.length === 0) return -1;
    let i = Math.min(this.cursor, segs.length - 1);
    while (i > 0 && (segs[i] as Segment).s0 > s) i--;
    while (i < segs.length - 1 && (segs[i] as Segment).s1 < s) i++;
    this.cursor = i;
    return i;
  }

  segmentAt(s: number): Segment | undefined {
    const i = this.indexAt(s);
    return i >= 0 ? this.segments[i] : undefined;
  }

  /** Piso sob o centro da bola (x, s). Na fronteira entre segmentos, vale o mais alto. */
  floorAt(x: number, s: number): FloorHit | null {
    const i = this.indexAt(s);
    if (i < 0) return null;
    let best: FloorHit | null = null;
    for (let k = Math.max(0, i - 1); k <= Math.min(this.segments.length - 1, i + 1); k++) {
      const seg = this.segments[k] as Segment;
      if (s < seg.s0 || s > seg.s1) continue;
      for (const f of seg.floors) {
        if (s < f.s0 || s > f.s1 || x < f.x0 - EDGE_TOL || x > f.x1 + EDGE_TOL) continue;
        const h = floorHeight(seg, s);
        if (!best || h > best.h) best = { h, slope: slopeOf(seg), seg };
      }
    }
    return best;
  }

  forObstacles(s0: number, s1: number, cb: (o: Obstacle, seg: Segment) => boolean | void): void {
    const i = this.indexAt(s0);
    if (i < 0) return;
    for (let k = Math.max(0, i - 1); k < this.segments.length; k++) {
      const seg = this.segments[k] as Segment;
      if (seg.s0 > s1) break;
      if (seg.s1 < s0) continue;
      for (const o of seg.obstacles) if (cb(o, seg) === true) return;
    }
  }

  onPad(x: number, s: number): boolean {
    const seg = this.segmentAt(s);
    if (!seg) return false;
    return seg.pads.some((p) => s >= p.s0 && s <= p.s1 && x >= p.x0 && x <= p.x1);
  }
}
