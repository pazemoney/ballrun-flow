import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, Mesh, MeshBasicMaterial, NormalBlending, Points, PointsMaterial, Group } from 'three';
import type { TrailDef, TrailParticle } from '../game/catalog';

const N = 90; // pontos da faixa
const MAXP = 220; // partículas

interface RP {
  x: number;
  y: number;
  z: number;
  t: number;
}

const texCache = new Map<TrailParticle, CanvasTexture>();
/** Textura de cada formato de partícula (desenhada uma vez). */
export function particleTexture(kind: TrailParticle): CanvasTexture {
  const c0 = texCache.get(kind);
  if (c0) return c0;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  switch (kind) {
    case 'square': g.fillRect(-16, -16, 32, 32); break;
    case 'pixel': g.fillRect(-20, -20, 40, 40); break;
    case 'confetti': g.fillRect(-24, -9, 48, 18); break;
    case 'star':
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 12 : 28;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
      break;
    case 'heart':
      g.beginPath();
      g.moveTo(0, 22);
      g.bezierCurveTo(-34, -2, -18, -30, 0, -12);
      g.bezierCurveTo(18, -30, 34, -2, 0, 22);
      g.fill();
      break;
    case 'note':
      g.font = '900 52px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('♪', 0, 2);
      break;
    case 'ring': g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke(); break;
    case 'bubble':
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, 0, 24, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(-9, -9, 6, 0, Math.PI * 2);
      g.fill();
      break;
    case 'spark': {
      const grd = g.createLinearGradient(0, -30, 0, 30);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.5, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-4, -30, 8, 60);
      break;
    }
    case 'smoke': {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      grd.addColorStop(0, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-32, -32, 64, 64);
      break;
    }
    default: {
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 28);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(-32, -32, 64, 64);
    }
  }
  const t = new CanvasTexture(c);
  texCache.set(kind, t);
  return t;
}

const SHADES = { white: new Color('#ffffff'), light: new Color('#cfcfd4'), gray: new Color('#8a8a90') };

/** Rastro da bola: faixa no chão que some rápido + partículas. */
export class TrailView {
  readonly group = new Group();
  private def: TrailDef | null = null;
  private pts: RP[] = [];
  private ribbon: Mesh;
  private rPos = new Float32Array(N * 2 * 2 * 3); // até 2 faixas
  private rCol = new Float32Array(N * 2 * 2 * 4);
  private points: Points;
  private pPos = new Float32Array(MAXP * 3);
  private pVel = new Float32Array(MAXP * 3);
  private pLife = new Float32Array(MAXP);
  private pMax = new Float32Array(MAXP);
  private pCol = new Float32Array(MAXP * 3);
  private pNext = 0;
  private pMat: PointsMaterial;
  private acc = 0;
  private time = 0;
  private color = new Color('#ffffff');

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.rPos, 3));
    g.setAttribute('color', new BufferAttribute(this.rCol, 4));
    const idx: number[] = [];
    for (let strip = 0; strip < 2; strip++) {
      const o = strip * N * 2;
      for (let i = 0; i < N - 1; i++) {
        const a = o + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setIndex(idx);
    this.ribbon = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, blending: NormalBlending }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 2;
    const pg = new BufferGeometry();
    pg.setAttribute('position', new BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new BufferAttribute(this.pCol, 3));
    this.pMat = new PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, alphaTest: 0.01 });
    this.points = new Points(pg, this.pMat);
    this.points.frustumCulled = false;
    this.group.add(this.ribbon, this.points);
    for (let i = 0; i < MAXP; i++) this.pPos[i * 3 + 1] = -9999;
  }

  set(def: TrailDef): void {
    this.def = def;
    this.pMat.map = def.particle === 'none' ? null : particleTexture(def.particle);
    this.pMat.size = 0.18 * def.size;
    this.pMat.blending = def.particle === 'smoke' || def.particle === 'confetti' ? NormalBlending : AdditiveBlending;
    this.pMat.needsUpdate = true;
    this.reset();
  }

  reset(): void {
    this.pts = [];
    this.pLife.fill(0);
    for (let i = 0; i < MAXP; i++) this.pPos[i * 3 + 1] = -9999;
  }

  shift(dz: number): void {
    for (const p of this.pts) p.z += dz;
    for (let i = 0; i < MAXP; i++) this.pPos[i * 3 + 2] = (this.pPos[i * 3 + 2] ?? 0) + dz;
  }

  /** Atualiza com a posição da bola (já no espaço do desenho). */
  update(dt: number, x: number, y: number, z: number, floorY: number | null, emitting: boolean, accent: Color): void {
    const def = this.def;
    this.time += dt;
    if (!def) return;
    const shade = def.shade === 'accent' ? accent : SHADES[def.shade];
    this.color.copy(shade);
    // faixa no chão
    if (emitting && floorY !== null && def.ribbon !== 'none') {
      const last = this.pts[this.pts.length - 1];
      if (!last || Math.hypot(last.x - x, last.z - z) > 0.22) {
        this.pts.push({ x, y: floorY + 0.035, z, t: this.time });
        if (this.pts.length > N) this.pts.shift();
      }
    }
    const life = 0.9;
    while (this.pts.length && this.time - (this.pts[0] as RP).t > life) this.pts.shift();
    this.buildRibbon(def, life);
    // partículas
    if (emitting && def.particle !== 'none') {
      this.acc += def.density * dt * 60;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.emit(def, x, y, z);
      }
    }
    for (let i = 0; i < MAXP; i++) {
      const l = this.pLife[i] ?? 0;
      if (l <= 0) {
        this.pPos[i * 3 + 1] = -9999;
        continue;
      }
      const nl = l - dt;
      this.pLife[i] = nl;
      const k = Math.max(0, nl / (this.pMax[i] || 1));
      if (def.motion === 'fall') this.pVel[i * 3 + 1] = (this.pVel[i * 3 + 1] ?? 0) - 6 * dt;
      if (def.motion === 'spiral') {
        const a = this.time * 8 + i;
        this.pVel[i * 3] = Math.cos(a) * 1.5;
        this.pVel[i * 3 + 1] = 0.6;
      }
      for (let c = 0; c < 3; c++) this.pPos[i * 3 + c] = (this.pPos[i * 3 + c] ?? 0) + (this.pVel[i * 3 + c] ?? 0) * dt;
      this.pCol[i * 3] = shade.r * k;
      this.pCol[i * 3 + 1] = shade.g * k;
      this.pCol[i * 3 + 2] = shade.b * k;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  private emit(def: TrailDef, x: number, y: number, z: number): void {
    const i = this.pNext;
    this.pNext = (this.pNext + 1) % MAXP;
    const j = (v: number) => (Math.random() - 0.5) * v;
    this.pPos.set([x + j(0.4), y - 0.2 + j(0.3), z + 0.3], i * 3);
    let v: [number, number, number] = [j(0.6), Math.random() * 0.4, 1.5 + Math.random() * 2];
    if (def.motion === 'float') v = [j(0.8), 0.8 + Math.random() * 0.8, 1 + Math.random()];
    if (def.motion === 'burst') v = [j(4), Math.random() * 3, 3 + Math.random() * 4];
    if (def.motion === 'still') v = [0, 0, 0];
    this.pVel.set(v, i * 3);
    this.pLife[i] = def.life * (0.7 + Math.random() * 0.6);
    this.pMax[i] = this.pLife[i] ?? 1;
  }

  private buildRibbon(def: TrailDef, life: number): void {
    const n = this.pts.length;
    const width = def.ribbon === 'wide' ? 0.75 : def.ribbon === 'line' || def.ribbon === 'zigzag' ? 0.14 : def.ribbon === 'double' ? 0.12 : 0.22;
    const strips = def.ribbon === 'double' ? 2 : 1;
    const c = this.color;
    for (let strip = 0; strip < 2; strip++) {
      for (let i = 0; i < N; i++) {
        const base = (strip * N * 2 + i * 2) * 3;
        const cb = (strip * N * 2 + i * 2) * 4;
        const p = this.pts[i];
        if (!p || strip >= strips || i >= n) {
          this.rPos.fill(0, base, base + 6);
          this.rCol.fill(0, cb, cb + 8);
          continue;
        }
        const age = (this.time - p.t) / life;
        let a = Math.max(0, 1 - age) * (def.ribbon === 'wide' ? 0.45 : 0.85) * Math.min(1, (n - i) / 3 + 0.2);
        if (def.ribbon === 'dash' && Math.floor(i / 2) % 2) a = 0;
        let ox = def.ribbon === 'double' ? (strip ? 0.3 : -0.3) : 0;
        if (def.ribbon === 'zigzag') ox += (i % 2 ? 0.18 : -0.18);
        this.rPos.set([p.x + ox - width / 2, p.y, p.z, p.x + ox + width / 2, p.y, p.z], base);
        this.rCol.set([c.r, c.g, c.b, a, c.r, c.g, c.b, a], cb);
      }
    }
    const g = this.ribbon.geometry;
    (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }
}
