import { BoxGeometry, Euler, Group, Matrix4, PlaneGeometry, Quaternion, TorusGeometry, Vector3 } from 'three';
import { FLOOR_THICK } from '../sim/constants';
import { floorHeight, obstacleOffset, slopeOf, spinnerAngle, SPINNER_HALF_WIDTH, type Obstacle, type Segment } from '../sim/types';
import { InstancePool } from './pool';
import { archMaterial, floorMaterial, obstacleMaterial, padMaterial, tunnelMaterial } from './materials';
import type { ThemeColors } from './theme';

interface Live {
  idx: number;
  o: Obstacle;
  seg: Segment;
  hub?: number;
}

interface Handles {
  seg: Segment;
  floors: number[];
  obstacles: number[];
  pads: number[];
  arches: number[];
  panels: number[];
  live: Live[]; // móveis, giradores e blocos que brotam
}

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();
const p = new Vector3();
const sc = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/**
 * Desenho da pista a partir do modelo da simulação (mesmos números que a colisão usa).
 * Coordenadas do desenho relativas a uma origem móvel (origin): sem tremor de precisão em partidas de horas.
 */
export class TrackView {
  readonly group = new Group();
  private floors: InstancePool;
  private obstacles: InstancePool;
  private pads: InstancePool;
  private arches: InstancePool;
  private panels: InstancePool;
  private handles = new Map<number, Handles>();
  origin = 0;

  constructor(theme: ThemeColors) {
    this.floors = new InstancePool(new BoxGeometry(1, 1, 1), floorMaterial(theme.floor, theme.grid, theme.side), 420);
    this.obstacles = new InstancePool(new BoxGeometry(1, 1, 1), obstacleMaterial(theme.obstacle, theme.obstacleEdge), 420, true, { aFace: 2 });
    const pg = new PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.pads = new InstancePool(pg, padMaterial(theme.pad), 80);
    this.arches = new InstancePool(new TorusGeometry(1, 0.022, 5, 32, Math.PI), archMaterial(theme.grid), 240, false);
    this.panels = new InstancePool(new BoxGeometry(1, 1, 1), tunnelMaterial(theme.tunnel, theme.obstacleEdge), 60);
    for (const pool of [this.floors, this.obstacles, this.pads, this.arches, this.panels]) this.group.add(pool.mesh);
    this.pads.mesh.renderOrder = 2;
  }

  private z(s: number): number {
    return -(s - this.origin);
  }

  add(seg: Segment): void {
    if (this.handles.has(seg.id)) return;
    const h: Handles = { seg, floors: [], obstacles: [], pads: [], arches: [], panels: [], live: [] };
    const slope = slopeOf(seg);
    const ang = Math.atan(slope);
    for (const f of seg.floors) {
      const y0 = floorHeight(seg, f.s0);
      const y1 = floorHeight(seg, f.s1);
      const len = Math.hypot(f.s1 - f.s0, y1 - y0);
      const w = f.x1 - f.x0;
      const i = this.floors.acquire();
      e.set(ang, 0, 0);
      q.setFromEuler(e);
      const cy = (y0 + y1) / 2 - (FLOOR_THICK / 2) * Math.cos(ang);
      const cz = this.z((f.s0 + f.s1) / 2) - (FLOOR_THICK / 2) * Math.sin(ang);
      p.set((f.x0 + f.x1) / 2, cy, cz);
      sc.set(w, FLOOR_THICK, len);
      m.compose(p, q, sc);
      this.floors.set(i, m, w, FLOOR_THICK, len);
      h.floors.push(i);
    }
    for (const o of seg.obstacles) {
      const i = this.obstacles.acquire();
      this.obstacles.setExtra(i, 'aFace', o.face === undefined ? 0 : 1, o.face ?? 0);
      const live: Live = { idx: i, o, seg };
      this.byObs.set(o, live);
      if (o.kind === 'spinner') {
        live.hub = this.obstacles.acquire();
        this.obstacles.setExtra(live.hub, 'aFace', 0, 0);
        h.obstacles.push(live.hub);
      }
      this.place(live, 0, -1e9, 20);
      h.obstacles.push(i);
      if (o.amp !== 0 || o.kind === 'spinner' || o.kind === 'popup') h.live.push(live);
    }
    for (const pad of seg.pads) {
      const i = this.pads.acquire();
      const y0 = floorHeight(seg, pad.s0);
      const y1 = floorHeight(seg, pad.s1);
      const len = Math.hypot(pad.s1 - pad.s0, y1 - y0);
      e.set(ang, 0, 0);
      q.setFromEuler(e);
      p.set((pad.x0 + pad.x1) / 2, (y0 + y1) / 2 + 0.025, this.z((pad.s0 + pad.s1) / 2));
      sc.set(pad.x1 - pad.x0, 1, len);
      m.compose(p, q, sc);
      this.pads.set(i, m, pad.x1 - pad.x0, 1, len);
      h.pads.push(i);
    }
    if (seg.tunnel) {
      const f = seg.floors[0];
      const half = f ? (f.x1 - f.x0) / 2 : 3;
      const R = half + 0.7;
      q.identity();
      for (let s = seg.s0 + 1; s < seg.s1; s += 2.4) {
        const i = this.arches.acquire();
        p.set(0, floorHeight(seg, s), this.z(s));
        sc.set(R, R * 1.1, R);
        m.compose(p, q, sc);
        this.arches.set(i, m, 1, 1, 1);
        h.arches.push(i);
      }
      for (const side of [-1, 1]) {
        const i = this.panels.acquire();
        const len = seg.s1 - seg.s0;
        p.set(side * (half + 0.55), floorHeight(seg, seg.s0) + 1.0, this.z((seg.s0 + seg.s1) / 2));
        sc.set(0.25, 2.4, len);
        m.compose(p, q, sc);
        this.panels.set(i, m, 0.25, 2.4, len);
        h.panels.push(i);
      }
    }
    this.handles.set(seg.id, h);
  }

  /** Posiciona um obstáculo no tempo da simulação (posição desenhada = posição de colisão). */
  private place(l: Live, t: number, ballS: number, speed: number): void {
    const o = l.o;
    if (this.hidden?.has(o)) {
      m.makeScale(0, 0, 0);
      this.obstacles.set(l.idx, m, 0, 0, 0);
      if (l.hub !== undefined) this.obstacles.set(l.hub, m, 0, 0, 0);
      return;
    }
    const base = floorHeight(l.seg, o.s0);
    if (o.kind === 'spinner') {
      const cx = (o.x0 + o.x1) / 2;
      const cs = (o.s0 + o.s1) / 2;
      const L = (o.x1 - o.x0) / 2;
      q.setFromAxisAngle(UP, spinnerAngle(o, t));
      p.set(cx, base + o.h / 2, this.z(cs));
      sc.set(2 * L, o.h, SPINNER_HALF_WIDTH * 2);
      m.compose(p, q, sc);
      this.obstacles.set(l.idx, m, 2 * L, o.h, SPINNER_HALF_WIDTH * 2);
      if (l.hub !== undefined) {
        q.identity();
        p.set(cx, base + 0.55, this.z(cs));
        sc.set(0.5, 1.1, 0.5);
        m.compose(p, q, sc);
        this.obstacles.set(l.hub, m, 0.5, 1.1, 0.5);
      }
      return;
    }
    let h = o.h;
    if (o.kind === 'popup') {
      // brota do chão: começa a v·1,7 s e termina a v·1,3 s de distância (sempre visível com tempo de reagir)
      const ahead = o.s0 - ballS;
      const v = Math.max(8, speed);
      const r = Math.max(0, Math.min(1, (v * 1.7 - ahead) / (v * 0.4)));
      const eased = 1 - (1 - r) ** 3;
      h = Math.max(0.02, o.h * (ballS < -1e8 ? 0 : eased));
    }
    const off = obstacleOffset(o, t);
    const w = o.x1 - o.x0;
    const d = o.s1 - o.s0;
    q.identity();
    p.set((o.x0 + o.x1) / 2 + off, base + h / 2, this.z((o.s0 + o.s1) / 2));
    sc.set(w, h, d);
    m.compose(p, q, sc);
    this.obstacles.set(l.idx, m, w, h, d);
  }

  remove(seg: Segment): void {
    const h = this.handles.get(seg.id);
    if (!h) return;
    for (const i of h.floors) this.floors.release(i);
    for (const i of h.obstacles) this.obstacles.release(i);
    for (const i of h.pads) this.pads.release(i);
    for (const i of h.arches) this.arches.release(i);
    for (const i of h.panels) this.panels.release(i);
    this.handles.delete(seg.id);
  }

  /** blocos esmagados pelo poder (somem do desenho) */
  hidden: WeakSet<Obstacle> | null = null;
  private byObs = new WeakMap<Obstacle, Live>();

  /** Some com um bloco esmagado agora. */
  hide(o: Obstacle): void {
    const l = this.byObs.get(o);
    if (l) this.place(l, 0, 0, 20);
  }

  update(simTime: number, ballS: number, speed: number): void {
    for (const h of this.handles.values()) for (const l of h.live) this.place(l, simTime, ballS, speed);
  }

  /** Muda a origem do desenho e reposiciona tudo (raro: a cada ~2 km). */
  setOrigin(o: number): void {
    if (o === this.origin) return;
    const segs = [...this.handles.values()].map((h) => h.seg);
    for (const s of segs) this.remove(s);
    this.origin = o;
    for (const s of segs) this.add(s);
  }

  clear(): void {
    for (const h of [...this.handles.values()]) this.remove(h.seg);
    this.origin = 0;
  }

  stats(): Record<string, number> {
    return { floors: this.floors.used, obstacles: this.obstacles.used, pads: this.pads.used, arches: this.arches.used, segs: this.handles.size };
  }

  dispose(): void {
    for (const pool of [this.floors, this.obstacles, this.pads, this.arches, this.panels]) pool.dispose();
  }
}
