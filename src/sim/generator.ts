import { Rng } from '../core/rng';
import { BALL_R, BOOST_FACTOR, BOOST_TIME, FWD_DECEL, GRAVITY, SNAP_UP } from './constants';
import { LEVEL_LEN, progressForLevel, type Mode, type Progress } from './difficulty';
import { propagate } from './validator';
import type { Deco, HintKind, Interval, Obstacle, Segment, Strip } from './types';
import { ZONES, ZONE_LEN_MAX, ZONE_LEN_MIN } from './zones';

interface Template {
  kind: string;
  rating: number; // complexidade mínima (tier)
  weight: number;
  build: (g: Generator, p: Progress) => Segment[];
}

const MAX_TRIES = 10;

export interface GenOptions {
  /** só para testes: começa a pista como se já tivesse percorrido essa distância */
  distOffset?: number;
  /** ambientes usados nas últimas partidas (evita começar igual) */
  avoidZones?: number[];
}

/**
 * Gerador procedural: escolhe trechos de uma biblioteca, monta e VALIDA cada trecho
 * (rota segura considerando raio da bola, capacidade lateral e velocidade) antes de inserir.
 * Se nenhum candidato passa, insere um trecho reto (sempre seguro).
 */
export class Generator {
  readonly rng: Rng;
  sEnd = 0;
  h = 0;
  reach: Interval[] = [[0, 0]];
  /** trechos em que a bola pode estar acelerada (faixa ciano + desaceleração) */
  boostZones: [number, number][] = [];
  private nextId = 1;
  private recent: string[] = [];
  private chainLeft = 0;
  private hinted = new Set<HintKind>();
  private prevSeg: Segment | null = null;
  rejected = 0;
  fallbacks = 0;

  readonly distOffset: number;
  /** início de cada ambiente: [s, id] */
  readonly zones: [number, number][] = [];
  private zoneEnd = 0;
  private recentZones: number[] = [];
  readonly decoRng: Rng;

  constructor(readonly mode: Mode, seed: number, opts: GenOptions = {}) {
    this.rng = new Rng(seed);
    this.decoRng = new Rng((seed ^ 0x5bd1e995) >>> 0);
    this.distOffset = opts.distOffset ?? 0;
    this.levelBase = Math.floor(this.distOffset / LEVEL_LEN);
    this.recentZones = [...(opts.avoidZones ?? [])].slice(-3);
    this.nextZone(0);
  }

  /** início de cada acelerador de nível (posições s); cruzar um = subir 1 nível */
  readonly checkpoints: number[] = [];
  private nextCheckpoint = LEVEL_LEN;
  readonly levelBase: number;

  /** nível na posição s (quantos aceleradores ficaram para trás) */
  levelAt(s: number): number {
    let n = 0;
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      if ((this.checkpoints[i] as number) <= s) {
        n = i + 1 + this.prunedCheckpoints;
        break;
      }
    }
    if (n === 0 && this.prunedCheckpoints > 0 && s >= 0) n = this.prunedCheckpoints;
    return this.levelBase + n;
  }
  private prunedCheckpoints = 0;

  progress(s: number): Progress {
    return progressForLevel(this.mode, this.levelAt(s));
  }

  private nextZone(s: number): void {
    const options = ZONES.map((z) => z.id).filter((id) => !this.recentZones.includes(id));
    const pool = options.length ? options : ZONES.map((z) => z.id);
    const id = pool[Math.floor(this.decoRng.next() * pool.length)] ?? 0;
    this.zones.push([s, id]);
    if (this.zones.length > 64) this.zones.shift();
    this.recentZones.push(id);
    if (this.recentZones.length > 3) this.recentZones.shift();
    this.zoneEnd = s + this.decoRng.range(ZONE_LEN_MIN, ZONE_LEN_MAX);
  }

  zoneAt(s: number): number {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i] as [number, number];
      if (s >= z[0]) return z[1];
    }
    return this.zones[0]?.[1] ?? 0;
  }

  /** ambientes já sorteados (para evitar repetir no começo da próxima partida) */
  get zoneHistory(): number[] {
    return this.zones.map((z) => z[1]);
  }

  speedAt = (s: number): number => {
    const v = this.progress(s).speed;
    for (let i = this.boostZones.length - 1; i >= 0; i--) {
      const z = this.boostZones[i] as [number, number];
      if (s >= z[0] && s <= z[1]) return v * BOOST_FACTOR;
      if (z[1] < s - 200) break;
    }
    return v;
  };

  /** Gera o próximo grupo de segmentos (já validado). */
  next(): Segment[] {
    if (this.sEnd >= this.zoneEnd) this.nextZone(this.sEnd);
    if (this.sEnd === 0) return this.commit([this.plain(this.progress(0), 46)], 'start');
    if (this.sEnd >= this.nextCheckpoint - 60) return this.commit(this.checkpoint(), 'checkpoint');
    const p = this.progress(this.sEnd);
    if (this.chainLeft <= 0) {
      this.chainLeft = p.chain;
      const len = Math.max(6, 16 - Math.min(5, p.tier) * 2) + this.rng.range(0, 6);
      return this.commit([this.plain(p, len)], 'breath');
    }
    for (let i = 0; i < MAX_TRIES; i++) {
      const t = this.pickTemplate(p);
      const saved = this.snapshot();
      const group = t.build(this, p);
      const out = this.tryCommit(group, t.kind);
      if (out) {
        this.chainLeft--;
        return out;
      }
      this.restore(saved);
      this.rejected++;
    }
    this.fallbacks++;
    return this.commit([this.plain(p, 10)], 'fallback');
  }

  // ---------- montagem ----------
  id(): number {
    return this.nextId++;
  }

  seg(kind: string, len: number, opts: Partial<Segment> = {}): Segment {
    const s0 = this.cursor;
    const h0 = opts.h0 ?? this.cursorH;
    const h1 = opts.h1 ?? h0;
    const seg: Segment = {
      id: this.id(), kind, s0, s1: s0 + len, h0, h1,
      floors: [], obstacles: [], pads: [], tunnel: false, maxAir: 0, rating: 0, hint: null,
      ...opts,
    };
    seg.s0 = s0;
    seg.s1 = s0 + len;
    this.cursor = seg.s1;
    this.cursorH = h1;
    return seg;
  }

  /** cursor de montagem do grupo atual */
  cursor = 0;
  cursorH = 0;

  full(p: Progress, s0: number, s1: number): Strip {
    return { x0: -p.width / 2, x1: p.width / 2, s0, s1 };
  }

  plain(p: Progress, len: number): Segment {
    this.beginGroup();
    const s = this.seg('plain', len);
    s.floors.push(this.full(p, s.s0, s.s1));
    return s;
  }

  /** Acelerador de nível: faixa larga na pista inteira (impossível não passar) + trecho calmo de adaptação. */
  private checkpoint(): Segment[] {
    const p0 = this.progress(this.sEnd);
    this.beginGroup();
    const approach = this.seg('plain', Math.max(6, this.nextCheckpoint - this.sEnd));
    approach.floors.push(this.full(p0, approach.s0, approach.s1));
    const padLen = 22;
    const pad = this.seg('accelerator', padLen);
    this.checkpoints.push(pad.s0);
    if (this.checkpoints.length > 50) {
      this.checkpoints.shift();
      this.prunedCheckpoints++;
    }
    this.nextCheckpoint = pad.s0 + LEVEL_LEN;
    const p1 = this.progress(pad.s0); // já no nível novo: pista do novo nível
    pad.floors.push(this.full(p1, pad.s0, pad.s1));
    pad.pads.push({ ...this.full(p1, pad.s0 + 1, pad.s1 - 1) });
    pad.tunnel = true;
    const calm = this.seg('plain', 34);
    calm.floors.push(this.full(p1, calm.s0, calm.s1));
    this.chainLeft = 0;
    return [approach, pad, calm];
  }

  beginGroup(): void {
    this.cursor = this.sEnd;
    this.cursorH = this.h;
  }

  block(x0: number, x1: number, s0: number, depth: number, h: number, kind: Obstacle['kind'] = 'block'): Obstacle {
    return { kind, x0, x1, s0, s1: s0 + depth, h, amp: 0, freq: 0, phase: 0 };
  }

  // ---------- validação e registro ----------
  private snapshot() {
    return { rng: this.rngState(), id: this.nextId };
  }
  private rngState(): number {
    return this.rng.state;
  }
  private restore(sv: { rng: number; id: number }): void {
    (this.rng as unknown as { s: number }).s = sv.rng;
    this.rng.next(); // avança para não repetir o mesmo candidato
    this.nextId = sv.id;
  }

  private tryCommit(group: Segment[], kind: string): Segment[] | null {
    if (group.length === 0) return null;
    // contrato: contínuo, sem sobreposição nem buraco entre segmentos
    let s = this.sEnd;
    let h = this.h;
    for (const g of group) {
      if (Math.abs(g.s0 - s) > 1e-6 || g.s1 <= g.s0) return null;
      if (g.h0 > h + 1e-6) return null; // nunca um degrau para cima
      for (const f of g.floors) if (f.s0 < g.s0 - 1e-6 || f.s1 > g.s1 + 1e-6 || f.x1 - f.x0 < 0.8) return null;
      s = g.s1;
      h = g.h1;
    }
    const zonesBefore = this.boostZones.length;
    this.updateBoost(group);
    const ctx = this.prevSeg ? [this.prevSeg] : [];
    const out = propagate(group, this.reach, { speedAt: this.speedAt }, ctx);
    if (!out) {
      this.boostZones.length = zonesBefore;
      return null;
    }
    this.reach = out;
    return this.register(group, kind);
  }

  private commit(group: Segment[], kind: string): Segment[] {
    const r = this.tryCommit(group, kind);
    if (r) return r;
    // trecho reto sempre é seguro: entrada = pista inteira
    const p = this.progress(this.sEnd);
    this.reach = [[-p.width / 2 + 0.2, p.width / 2 - 0.2]];
    const fb = [this.plain(p, 12)];
    this.updateBoost(fb);
    return this.register(fb, 'fallback');
  }

  private updateBoost(group: Segment[]): void {
    for (const g of group) {
      for (const pad of g.pads) {
        const v = this.progress(pad.s1 + 1).speed;
        const vb = v * BOOST_FACTOR;
        const carry = BOOST_TIME * vb + (vb * vb - v * v) / (2 * FWD_DECEL) + 2;
        this.boostZones.push([pad.s0, pad.s1 + carry]);
        if (this.boostZones.length > 4000) this.boostZones.splice(0, 1000);
      }
    }
  }

  private register(group: Segment[], kind: string): Segment[] {
    const zone = this.zoneAt(this.sEnd);
    const zdef = ZONES[zone] ?? ZONES[0];
    for (const g of group) {
      g.zone = this.zoneAt(g.s0);
      for (const o of g.obstacles) {
        if (o.face === undefined && o.kind !== 'spinner' && o.kind !== 'domino' && this.decoRng.chance(0.5)) o.face = this.decoRng.next();
      }
    }
    // surpresas e decoração (nunca colidem)
    const first = group[0];
    if (first && zdef && kind !== 'start') {
      const deco: Deco[] = [];
      const side = (): -1 | 1 => (this.decoRng.chance(0.5) ? -1 : 1);
      if (this.decoRng.chance(zdef.deco.billboard)) deco.push({ kind: 'billboard', s: first.s0 + 6, side: side(), variant: this.decoRng.int(0, 999) });
      if (this.decoRng.chance(zdef.deco.duck)) deco.push({ kind: 'duck', s: first.s0 + 10, side: side(), variant: 0 });
      if (this.decoRng.chance(zdef.deco.ufo)) deco.push({ kind: 'ufo', s: first.s0 + 40, side: side(), variant: 0 });
      if (first.tunnel) deco.push({ kind: 'arch', s: first.s0, side: 1, variant: 0 });
      if (deco.length) first.deco = deco;
    }
    for (const g of group) {
      if (g.obstacles.length && !this.hinted.has('obstacle')) {
        g.hint = 'obstacle';
        this.hinted.add('obstacle');
      } else if (g.pads.length && !this.hinted.has('boost')) {
        g.hint = 'boost';
        this.hinted.add('boost');
      } else if (!this.hinted.has('edge') && g.floors.some((f) => f.x1 - f.x0 < 3.2)) {
        g.hint = 'edge';
        this.hinted.add('edge');
      }
    }
    const last = group[group.length - 1];
    if (last) {
      this.sEnd = last.s1;
      this.h = last.h1;
      this.prevSeg = last;
    }
    this.recent.push(kind);
    if (this.recent.length > 5) this.recent.shift();
    return group;
  }

  private pickTemplate(p: Progress): Template {
    const avail = TEMPLATES.filter((t) => t.rating <= p.tier + 0.25);
    const zw = (ZONES[this.zoneAt(this.sEnd)] ?? ZONES[0])?.weights ?? {};
    const weights = avail.map((t) => {
      let w = t.weight * (zw[t.kind] ?? 1);
      const n = this.recent.lastIndexOf(t.kind);
      if (n >= 0) w /= this.recent.length - n <= 2 ? 5 : 2;
      if (t.kind === 'rampUp' && this.h < -4) w *= 2.5;
      if ((t.kind === 'rampDown' || t.kind === 'stairs' || t.kind === 'jump') && this.h < -8) w *= 0.15;
      if (t.kind === 'rampUp' && this.h > 10) w *= 0.1;
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng.next() * total;
    for (let i = 0; i < avail.length; i++) {
      r -= weights[i] ?? 0;
      if (r <= 0) return avail[i] as Template;
    }
    return avail[avail.length - 1] as Template;
  }

  /** distância de voo da bola lançada de uma rampa (mesma física da simulação) */
  static flightDistance(v: number, slope: number, drop: number): number {
    const vy = slope * v;
    // centro parte de h+r e pousa em (h - drop)+r
    const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
    return v * t;
  }

  /** maior vão curto sem rampa: queda até SNAP_UP*0.6 */
  static hopGap(v: number): number {
    return v * Math.sqrt((2 * SNAP_UP * 0.6) / GRAVITY);
  }
}

// ---------------- biblioteca de trechos ----------------
function rowSpacing(g: Generator, p: Progress): number {
  return p.rowGap * g.speedAt(g.cursor) * g.rng.range(1, 1.25);
}

function opening(p: Progress): number {
  return p.strip + 0.45;
}

const TEMPLATES: Template[] = [
  {
    kind: 'blocks', rating: 0, weight: 5,
    build: (g, p) => {
      g.beginGroup();
      const rows = g.rng.int(2, 3 + Math.min(4, Math.floor(p.tier)));
      const lead = 4;
      const sp = rowSpacing(g, p);
      const len = lead + rows * sp + 2;
      const seg = g.seg('blocks', len);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + lead + r * sp;
        const count = p.tier < 1 ? 1 : g.rng.int(1, 2);
        const placed: Obstacle[] = [];
        for (let c = 0; c < count; c++) {
          const bw = p.width * g.rng.range(0.26, Math.min(0.5, 0.3 + Math.min(5, p.tier) * 0.04));
          const x0 = g.rng.range(-half, half - bw);
          const o = g.block(x0, x0 + bw, s0, g.rng.range(0.9, 1.3), g.rng.range(0.9, 1.5));
          if (placed.some((q) => o.x0 < q.x1 + 0.2 && o.x1 > q.x0 - 0.2)) continue;
          placed.push(o);
        }
        seg.obstacles.push(...placed);
      }
      return [seg];
    },
  },
  {
    kind: 'barrier', rating: 0.6, weight: 4,
    build: (g, p) => {
      g.beginGroup();
      const rows = g.rng.int(1, 2 + Math.min(3, Math.floor(p.tier / 2)));
      const sp = rowSpacing(g, p) * 1.15;
      const seg = g.seg('barrier', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      const o = opening(p) + (p.tier < 2 ? 0.5 : 0);
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        const gx = g.rng.range(-half, half - o);
        const h = g.rng.chance(0.5) ? 1.0 : 1.4;
        if (gx > -half + 0.3) seg.obstacles.push(g.block(-half, gx, s0, 0.8, h, 'wall'));
        if (gx + o < half - 0.3) seg.obstacles.push(g.block(gx + o, half, s0, 0.8, h, 'wall'));
      }
      return [seg];
    },
  },
  {
    kind: 'zigzag', rating: 1, weight: 4,
    build: (g, p) => {
      g.beginGroup();
      const rows = g.rng.int(3, 4 + Math.min(4, Math.floor(p.tier)));
      const sp = rowSpacing(g, p) * 0.95;
      const seg = g.seg('zigzag', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      const o = opening(p) + 0.3;
      let left = g.rng.chance(0.5);
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        const cover = p.width - o;
        if (left) seg.obstacles.push(g.block(-half, -half + cover, s0, 0.9, 1.1));
        else seg.obstacles.push(g.block(half - cover, half, s0, 0.9, 1.1));
        left = !left;
      }
      return [seg];
    },
  },
  {
    kind: 'narrow', rating: 0.8, weight: 4,
    build: (g, p) => {
      g.beginGroup();
      const w = p.strip + g.rng.range(0, 0.6);
      const half = p.width / 2;
      const len = g.rng.range(10, 18 + Math.min(5, p.tier) * 3);
      const seg = g.seg('narrow', len);
      const x0 = g.rng.range(-half, half - w);
      seg.floors.push({ x0, x1: x0 + w, s0: seg.s0, s1: seg.s1 });
      const exit = g.seg('plain', 3);
      exit.floors.push(g.full(p, exit.s0, exit.s1));
      return [seg, exit];
    },
  },
  {
    kind: 'split', rating: 1.6, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      const half = p.width / 2;
      const w = Math.min(p.strip + 0.3, half - 0.6);
      const len = g.rng.range(14, 22);
      const seg = g.seg('split', len);
      seg.floors.push({ x0: -half, x1: -half + w, s0: seg.s0, s1: seg.s1 });
      seg.floors.push({ x0: half - w, x1: half, s0: seg.s0, s1: seg.s1 });
      // às vezes um dos caminhos tem um bloco: escolha da bifurcação
      if (p.tier >= 2.5 && g.rng.chance(0.6)) {
        const left = g.rng.chance(0.5);
        const s0 = seg.s0 + len * g.rng.range(0.4, 0.7);
        seg.obstacles.push(left ? g.block(-half, -half + w, s0, 0.9, 1.1) : g.block(half - w, half, s0, 0.9, 1.1));
      }
      const exit = g.seg('plain', 3);
      exit.floors.push(g.full(p, exit.s0, exit.s1));
      return [seg, exit];
    },
  },
  {
    kind: 'snake', rating: 1.8, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      const half = p.width / 2;
      const w = p.strip + 0.35;
      const pieces = g.rng.int(3, 4 + Math.min(3, Math.floor(p.tier / 2)));
      const pieceLen = g.speedAt(g.cursor) * g.rng.range(0.42, 0.6);
      const seg = g.seg('snake', pieces * pieceLen);
      let x = g.rng.range(-half, half - w);
      for (let i = 0; i < pieces; i++) {
        seg.floors.push({ x0: x, x1: x + w, s0: seg.s0 + i * pieceLen, s1: seg.s0 + (i + 1) * pieceLen });
        // próxima peça deslocada, com sobreposição para a passagem
        const dir = x + w / 2 > 0 ? -1 : g.rng.chance(0.5) ? 1 : -1;
        const shift = dir * g.rng.range(w * 0.45, w * 0.7);
        x = Math.min(half - w, Math.max(-half, x + shift));
      }
      const exit = g.seg('plain', 3);
      exit.floors.push(g.full(p, exit.s0, exit.s1));
      return [seg, exit];
    },
  },
  {
    kind: 'platforms', rating: 1.5, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      const half = p.width / 2;
      const v = g.speedAt(g.cursor);
      const gap = Math.min(1.1, Generator.hopGap(v) * 0.8);
      const n = g.rng.int(3, 5);
      const pl = g.rng.range(4, 6);
      const seg = g.seg('platforms', n * (pl + gap) + 1);
      seg.maxAir = gap + 0.3;
      let x = g.rng.range(-half, half - 2.6);
      for (let i = 0; i < n; i++) {
        const w = g.rng.range(Math.max(1.6, p.strip + 0.4), 2.8);
        x = Math.min(half - w, Math.max(-half, x + g.rng.range(-1.2, 1.2)));
        const s0 = seg.s0 + i * (pl + gap);
        seg.floors.push({ x0: x, x1: x + w, s0, s1: s0 + pl });
      }
      // final: emenda de volta na pista inteira
      seg.floors.push(g.full(p, seg.s1 - 1, seg.s1));
      const lastPl = seg.floors[n - 1];
      if (lastPl) lastPl.s1 = seg.s1 - 1;
      return [seg];
    },
  },
  {
    kind: 'rampUp', rating: 0, weight: 2.5,
    build: (g, p) => {
      g.beginGroup();
      const len = g.rng.range(14, 22);
      const dh = Math.min(len * 0.2, g.rng.range(1.5, 3.5));
      const seg = g.seg('ramp', len, { h1: g.cursorH + dh });
      // contrato: rampa sobe a partir da altura atual (h0 = altura atual)
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const top = g.seg('plain', 4);
      top.floors.push(g.full(p, top.s0, top.s1));
      return [seg, top];
    },
  },
  {
    kind: 'rampDown', rating: 0, weight: 2.5,
    build: (g, p) => {
      g.beginGroup();
      const len = g.rng.range(14, 22);
      const dh = Math.min(len * 0.2, g.rng.range(1.5, 3.5));
      const seg = g.seg('ramp', len, { h1: g.cursorH - dh });
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const bottom = g.seg('plain', 4);
      bottom.floors.push(g.full(p, bottom.s0, bottom.s1));
      return [seg, bottom];
    },
  },
  {
    kind: 'stairs', rating: 0.8, weight: 2,
    build: (g, p) => {
      g.beginGroup();
      const n = g.rng.int(3, 5);
      const out: Segment[] = [];
      for (let i = 0; i < n; i++) {
        const step = g.seg('step', g.rng.range(4, 6), { h0: g.cursorH - (i === 0 ? 0 : 0.7) });
        step.h1 = step.h0;
        g.cursorH = step.h1;
        step.floors.push(g.full(p, step.s0, step.s1));
        step.maxAir = 0;
        out.push(step);
      }
      return out;
    },
  },
  {
    kind: 'tunnel', rating: 0, weight: 2.5,
    build: (g, p) => {
      g.beginGroup();
      const len = g.rng.range(22, 30);
      const seg = g.seg('tunnel', len);
      seg.tunnel = true;
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const out = g.seg('plain', 14);
      out.floors.push(g.full(p, out.s0, out.s1));
      return [seg, out];
    },
  },
  {
    kind: 'jump', rating: 1, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      // salto sem acelerador: a velocidade é constante no nível, então o vão é calculado para ela
      if (Math.abs(g.speedAt(g.cursor) - p.speed) > 1e-6) return []; // nunca logo depois de um acelerador
      const approach = g.seg('approach', 6);
      approach.floors.push(g.full(p, approach.s0, approach.s1));
      const slope = 0.24;
      const rl = 7;
      const ramp = g.seg('launch', rl, { h1: g.cursorH + slope * rl });
      ramp.floors.push(g.full(p, ramp.s0, ramp.s1));
      const vb = p.speed;
      const drop = g.rng.range(0.6, 1.6);
      const dLo = Generator.flightDistance(vb * 0.97, slope, drop);
      const dHi = Generator.flightDistance(vb * 1.03, slope, drop);
      const gapLen = Math.max(2.2, Math.min(8, dLo * g.rng.range(0.45, 0.65)));
      const land = Math.max(18, dHi - gapLen + 8);
      if (dLo < gapLen + 1.2 + BALL_R) return [];
      const gap = g.seg('gap', gapLen, { h0: ramp.h1 - drop, h1: ramp.h1 - drop });
      gap.maxAir = gapLen + 0.01;
      const landing = g.seg('landing', land, { h0: gap.h1, h1: gap.h1 });
      landing.floors.push(g.full(p, landing.s0, landing.s1));
      landing.maxAir = dHi; // o voo cruza o início da plataforma
      gap.maxAir = dHi + 0.5;
      return [approach, ramp, gap, landing];
    },
  },
  {
    kind: 'movers', rating: 2, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      const rows = g.rng.int(2, 3 + Math.min(3, Math.floor(p.tier / 2)));
      const sp = rowSpacing(g, p) * 1.2;
      const seg = g.seg('movers', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      for (let r = 0; r < rows; r++) {
        const bw = p.width * g.rng.range(0.24, 0.3);
        const amp = g.rng.range(0.6, Math.max(0.7, Math.min(1.4, (p.width - bw - 2.6) / 2)));
        const side = g.rng.chance(0.5) ? -1 : 1;
        const center = side * (half - bw / 2 - amp - g.rng.range(0.05, 0.4));
        const o = g.block(center - bw / 2, center + bw / 2, seg.s0 + 4 + r * sp, 1.0, 1.1, 'mover');
        o.amp = amp;
        o.freq = g.rng.range(1.4, 2.2);
        o.phase = g.rng.range(0, Math.PI * 2);
        seg.obstacles.push(o);
      }
      return [seg];
    },
  },
  {
    kind: 'narrowBlocks', rating: 3, weight: 3,
    build: (g, p) => {
      g.beginGroup();
      const half = p.width / 2;
      const w = Math.min(p.width, p.strip * 2 + 1.0);
      const x0 = g.rng.range(-half, half - w);
      const rows = g.rng.int(2, 4);
      const sp = rowSpacing(g, p);
      const seg = g.seg('narrowBlocks', 4 + rows * sp + 2);
      seg.floors.push({ x0, x1: x0 + w, s0: seg.s0, s1: seg.s1 });
      let left = g.rng.chance(0.5);
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        const bw = w / 2 - 0.25;
        seg.obstacles.push(left ? g.block(x0, x0 + bw, s0, 0.9, 1.0) : g.block(x0 + w - bw, x0 + w, s0, 0.9, 1.0));
        left = !left;
      }
      const exit = g.seg('plain', 3);
      exit.floors.push(g.full(p, exit.s0, exit.s1));
      return [seg, exit];
    },
  },
  {
    kind: 'gauntlet', rating: 4, weight: 2.5,
    build: (g, p) => {
      // corredor estreito com blocos em sequência e mudança de direção
      g.beginGroup();
      const half = p.width / 2;
      const rows = g.rng.int(4, 6);
      const sp = rowSpacing(g, p) * 0.9;
      const seg = g.seg('gauntlet', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const o = opening(p) + 0.15;
      let gx = g.rng.range(-half, half - o);
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        if (gx > -half + 0.3) seg.obstacles.push(g.block(-half, gx, s0, 0.7, 1.2, 'wall'));
        if (gx + o < half - 0.3) seg.obstacles.push(g.block(gx + o, half, s0, 0.7, 1.2, 'wall'));
        const maxShift = 0.42 * 13 * (sp / g.speedAt(s0)) * 0.8;
        gx = Math.min(half - o, Math.max(-half, gx + g.rng.range(-maxShift, maxShift)));
      }
      return [seg];
    },
  },
  {
    kind: 'popups', rating: 0.4, weight: 3,
    build: (g, p) => {
      // blocos que brotam do chão quando a bola se aproxima (aparecem com tempo de sobra)
      g.beginGroup();
      const rows = g.rng.int(2, 3 + Math.min(3, Math.floor(p.tier)));
      const sp = rowSpacing(g, p);
      const seg = g.seg('popups', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        const bw = p.width * g.rng.range(0.3, 0.46);
        const x0 = g.rng.range(-half, half - bw);
        seg.obstacles.push(g.block(x0, x0 + bw, s0, 1.0, g.rng.range(1.0, 1.4), 'popup'));
      }
      return [seg];
    },
  },
  {
    kind: 'spinner', rating: 1.2, weight: 3,
    build: (g, p) => {
      // giradores: braço que gira no chão; a validação considera o disco inteiro ocupado
      g.beginGroup();
      const n = g.rng.int(1, 2 + Math.min(2, Math.floor(p.tier / 2)));
      const sp = rowSpacing(g, p) * 1.3;
      const seg = g.seg('spinner', 5 + n * sp + 3);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      for (let i = 0; i < n; i++) {
        const R = g.rng.range(0.9, Math.min(1.6, half - 1.3));
        const cx = g.rng.chance(0.5) ? -half + R + g.rng.range(0, 0.4) : half - R - g.rng.range(0, 0.4);
        const cs = seg.s0 + 5 + i * sp + R;
        const o = g.block(cx - R, cx + R, cs - R, 2 * R, 0.75, 'spinner');
        o.spin = (g.rng.chance(0.5) ? 1 : -1) * g.rng.range(1.4, 2.4);
        o.phase = g.rng.range(0, Math.PI);
        seg.obstacles.push(o);
      }
      return [seg];
    },
  },
  {
    kind: 'dominoes', rating: 0.8, weight: 2.5,
    build: (g, p) => {
      // fileiras de dominós altos e finos com uma passagem
      g.beginGroup();
      const rows = g.rng.int(2, 3 + Math.min(2, Math.floor(p.tier / 2)));
      const sp = rowSpacing(g, p) * 1.1;
      const seg = g.seg('dominoes', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      const o = opening(p) + 0.3;
      for (let r = 0; r < rows; r++) {
        const s0 = seg.s0 + 4 + r * sp;
        const gx = g.rng.range(-half, half - o);
        for (let x = -half; x < half - 0.3; x += 0.7) {
          if (x + 0.35 > gx - 0.05 && x < gx + o + 0.05) continue;
          seg.obstacles.push(g.block(x, Math.min(half, x + 0.35), s0, 0.3, 1.7, 'domino'));
        }
      }
      return [seg];
    },
  },
  {
    kind: 'slalom', rating: 1.3, weight: 2.5,
    build: (g, p) => {
      // cones de slalom: zigue-zague curto e ritmado
      g.beginGroup();
      const n = g.rng.int(4, 6 + Math.min(3, Math.floor(p.tier)));
      const sp = rowSpacing(g, p) * 0.75;
      const seg = g.seg('slalom', 4 + n * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      const amp = Math.min(half - 1.4, g.rng.range(0.8, 1.6));
      for (let i = 0; i < n; i++) {
        const cx = (i % 2 ? 1 : -1) * amp * 0.5;
        const w = p.width * g.rng.range(0.16, 0.22);
        const s0 = seg.s0 + 4 + i * sp;
        // cone central + parede do lado oposto obrigam a contornar
        seg.obstacles.push(g.block(cx - w / 2, cx + w / 2, s0, 0.6, 1.0));
        if (i % 2) seg.obstacles.push(g.block(-half, -half + 0.6, s0, 0.6, 0.8));
        else seg.obstacles.push(g.block(half - 0.6, half, s0, 0.6, 0.8));
      }
      return [seg];
    },
  },
  {
    kind: 'wave', rating: 2.2, weight: 2.5,
    build: (g, p) => {
      // "ola": blocos móveis em fila com fases defasadas
      g.beginGroup();
      const rows = g.rng.int(3, 5);
      const sp = rowSpacing(g, p) * 1.1;
      const seg = g.seg('wave', 4 + rows * sp + 2);
      seg.floors.push(g.full(p, seg.s0, seg.s1));
      const half = p.width / 2;
      const freq = g.rng.range(1.5, 2.2);
      const bw = 1.0;
      // a varredura encosta numa borda e deixa uma faixa livre do outro lado
      const amp = Math.max(0.5, Math.min(1.3, (p.width - bw - 2.6) / 2));
      const side = g.rng.chance(0.5) ? -1 : 1;
      for (let r = 0; r < rows; r++) {
        const c = side * (half - bw / 2 - amp - 0.05);
        const o = g.block(c - bw / 2, c + bw / 2, seg.s0 + 4 + r * sp, 0.9, 1.0, 'mover');
        o.amp = amp;
        o.freq = freq;
        o.phase = r * 0.9;
        seg.obstacles.push(o);
      }
      return [seg];
    },
  },
];

export const TEMPLATE_KINDS = TEMPLATES.map((t) => t.kind);
