import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, Matrix4, MeshBasicMaterial, Points, PointsMaterial, Quaternion, Vector3 } from 'three';
import { Rng } from '../core/rng';
import { cityMaterial } from './materials';
import { InstancePool } from './pool';
import type { ThemeColors } from './theme';

interface Building {
  idx: number;
  roof: number;
  z: number;
  x: number;
  w: number;
  d: number;
  h: number;
  y: number;
  seed: number;
  antenna: boolean;
  layer: number;
}

const NEAR = 70;
const FAR = 70;
const SPAN = 320;
const m = new Matrix4();
const q = new Quaternion();
const p = new Vector3();
const sc = new Vector3();

/** Cidade dos dois lados (decoração: nunca colide). Prédios reciclados; antenas com luz piscando. */
export class CityView {
  readonly group = new Group();
  readonly pool: InstancePool;
  private roofPool: InstancePool;
  private list: Building[] = [];
  private rng = new Rng(7);
  private lights: Points;
  private lightPos: Float32Array;
  private lightMat: PointsMaterial;
  private baseY = 0;

  constructor(theme: ThemeColors, dotTex: import('three').Texture) {
    const total = NEAR + FAR;
    this.pool = new InstancePool(new BoxGeometry(1, 1, 1), cityMaterial(theme.city, theme.cityFill, theme.window), total, true, { aSeed: 1 });
    this.roofPool = new InstancePool(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: new Color('#5a5a60') }), total, false);
    this.lightPos = new Float32Array(total * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.lightPos, 3));
    this.lightMat = new PointsMaterial({ size: 0.9, map: dotTex, color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.lights = new Points(g, this.lightMat);
    this.lights.frustumCulled = false;
    this.group.add(this.pool.mesh, this.roofPool.mesh, this.lights);
    for (let i = 0; i < total; i++) {
      this.list.push({ idx: this.pool.acquire(), roof: this.roofPool.acquire(), z: 0, x: 0, w: 0, d: 0, h: 0, y: 0, seed: 0, antenna: false, layer: i < NEAR ? 0 : 1 });
    }
  }

  reset(baseY: number): void {
    this.baseY = baseY;
    this.list.forEach((b, i) => this.place(b, 20 - ((i % NEAR) / NEAR) * SPAN, i % 2 === 0 ? -1 : 1, true));
  }

  private place(b: Building, z: number, side: number, fresh: boolean): void {
    const r = this.rng;
    if (fresh) {
      const far = b.layer === 1;
      b.w = r.range(far ? 6 : 3.5, far ? 12 : 8);
      b.d = r.range(far ? 6 : 3.5, far ? 12 : 8);
      b.h = r.range(far ? 45 : 18, far ? 115 : 62);
      b.x = side * (far ? r.range(24, 58) : r.range(9.5, 21));
      b.y = this.baseY - 34;
      b.seed = r.next();
      b.antenna = r.chance(0.45);
    }
    b.z = z;
    q.identity();
    p.set(b.x, b.y + b.h / 2, z);
    sc.set(b.w, b.h, b.d);
    m.compose(p, q, sc);
    this.pool.set(b.idx, m, b.w, b.h, b.d);
    this.pool.setExtra(b.idx, 'aSeed', b.seed);
    const i = b.idx;
    if (b.antenna) {
      const ah = 3 + b.seed * 6;
      p.set(b.x + (b.seed - 0.5) * b.w * 0.5, b.y + b.h + ah / 2, z);
      sc.set(0.25, ah, 0.25);
      m.compose(p, q, sc);
      this.roofPool.set(b.roof, m, 1, 1, 1);
      this.lightPos.set([p.x, b.y + b.h + ah + 0.2, z], i * 3);
    } else {
      // caixa d'água / casa de máquinas no telhado
      p.set(b.x, b.y + b.h + 0.8, z);
      sc.set(b.w * 0.35, 1.6, b.d * 0.35);
      m.compose(p, q, sc);
      this.roofPool.set(b.roof, m, 1, 1, 1);
      this.lightPos.set([0, -9999, 0], i * 3);
    }
    (this.lights.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  /** Recicla prédios que ficaram atrás da câmera para o fundo. */
  update(camZ: number, baseY: number, time: number, show: number): void {
    this.baseY = baseY;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i] as Building;
      if (b.z > camZ + 30) this.place(b, b.z - SPAN, i % 2 === 0 ? -1 : 1, true);
    }
    this.lightMat.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 3));
    this.group.visible = show > 0.05;
    this.group.position.y = (1 - show) * -40; // "Céu Aberto": a cidade afunda lá embaixo
  }

  /** Desloca tudo quando a origem do desenho muda. */
  shift(dz: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i] as Building;
      this.place(b, b.z + dz, i % 2 === 0 ? -1 : 1, false);
    }
  }
}
