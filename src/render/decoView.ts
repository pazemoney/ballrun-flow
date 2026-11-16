import {
  AdditiveBlending, BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace,
} from 'three';
import { floorHeight, type Deco, type Segment } from '../sim/types';

/** Piadas das placas (curtas, sem exagero). */
export const BILLBOARD_JOKES = [
  'SIGA EM FRENTE.\nOU DO LADO.',
  'PROIBIDO\nESTACIONAR A BOLA',
  'FREIO?\nQUE FREIO?',
  'SORRIA, VOCÊ\nESTÁ ROLANDO',
  'BOLA NÃO TEM\nMARCHA RÉ',
  'OS BLOCOS\nNÃO MORDEM*',
  'VOCÊ ESTÁ\nINDO BEM (ACHO)',
  'RECALCULANDO\nROTA...',
  'ATENÇÃO:\nPISO REDONDO',
  'PRODUZIDO\nPELA FLOW',
  'NÃO OLHE PARA\nA PLACA',
  'CUIDADO:\nBLOCO DE MAU HUMOR',
];

interface Item {
  deco: Deco;
  seg: Segment;
  obj: Group;
}

/** Decoração e surpresas raras (pato gigante, disco voador, placas). Nunca colidem. */
export class DecoView {
  readonly group = new Group();
  private items = new Map<number, Item[]>();
  private jokeTex = new Map<number, CanvasTexture>();
  private free: Record<string, Group[]> = { billboard: [], duck: [], ufo: [] };
  origin = 0;
  private white = new MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.35 });
  private gray = new MeshStandardMaterial({ color: '#6c6c72', roughness: 0.5 });
  private dark = new MeshStandardMaterial({ color: '#1a1a1d', roughness: 0.6 });

  constructor() {
    // pré-cria as peças (2 placas, 1 pato, 1 disco): sem engasgo na primeira aparição e memória estável
    for (const kind of ['billboard', 'billboard', 'duck', 'ufo']) this.free[kind]?.push(this.build(kind));
    for (let i = 0; i < BILLBOARD_JOKES.length; i++) this.texFor(i);
  }

  private texFor(i: number): CanvasTexture {
    const idx = i % BILLBOARD_JOKES.length;
    let t = this.jokeTex.get(idx);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#0c0c0e';
      g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#f5f5f5';
      g.lineWidth = 10;
      g.strokeRect(10, 10, 492, 236);
      g.fillStyle = '#f5f5f5';
      g.font = '64px Anton, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = (BILLBOARD_JOKES[idx] ?? '').split('\n');
      lines.forEach((l, k) => g.fillText(l, 256, 128 + (k - (lines.length - 1) / 2) * 72));
    }
    t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    this.jokeTex.set(idx, t);
    return t;
  }

  private build(kind: string): Group {
    const g = new Group();
    if (kind === 'billboard') {
      const post = new Mesh(new BoxGeometry(0.25, 5, 0.25), this.gray);
      post.position.y = -2.5;
      const panel = new Mesh(new PlaneGeometry(4.2, 2.1), new MeshBasicMaterial({ side: DoubleSide }));
      panel.name = 'panel';
      panel.position.y = 1.05;
      g.add(post, panel);
    } else if (kind === 'duck') {
      const body = new Mesh(new SphereGeometry(1.6, 24, 16), this.white);
      body.scale.set(1.25, 0.85, 1);
      const head = new Mesh(new SphereGeometry(0.95, 20, 14), this.white);
      head.position.set(0.9, 1.35, 0);
      const beak = new Mesh(new ConeGeometry(0.4, 0.9, 12), this.gray);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(1.95, 1.25, 0);
      const eye = new Mesh(new SphereGeometry(0.16, 10, 8), this.dark);
      eye.position.set(1.45, 1.65, 0.55);
      const eye2 = eye.clone();
      eye2.position.z = -0.55;
      g.add(body, head, beak, eye, eye2);
    } else {
      const disc = new Mesh(new SphereGeometry(2.4, 28, 12), this.gray);
      disc.scale.y = 0.22;
      const dome = new Mesh(new SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.white);
      dome.position.y = 0.3;
      const beam = new Mesh(new CylinderGeometry(0.4, 2.6, 9, 20, 1, true), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
      beam.position.y = -4.6;
      g.add(disc, dome, beam);
    }
    return g;
  }

  add(seg: Segment): void {
    if (!seg.deco || this.items.has(seg.id)) return;
    const list: Item[] = [];
    for (const d of seg.deco) {
      if (d.kind !== 'billboard' && d.kind !== 'duck' && d.kind !== 'ufo') continue;
      const obj = this.free[d.kind]?.pop() ?? this.build(d.kind);
      if (d.kind === 'billboard') {
        const panel = obj.getObjectByName('panel') as Mesh;
        (panel.material as MeshBasicMaterial).map = this.texFor(d.variant);
        (panel.material as MeshBasicMaterial).needsUpdate = true;
      }
      obj.visible = true;
      this.group.add(obj);
      list.push({ deco: d, seg, obj });
    }
    this.items.set(seg.id, list);
    this.update(0, seg.s0);
  }

  remove(seg: Segment): void {
    const list = this.items.get(seg.id);
    if (!list) return;
    for (const it of list) {
      it.obj.visible = false;
      this.group.remove(it.obj);
      this.free[it.deco.kind]?.push(it.obj);
    }
    this.items.delete(seg.id);
  }

  clear(): void {
    for (const list of [...this.items.values()]) if (list[0]) this.remove(list[0].seg);
    this.items.clear();
  }

  /** Animações das surpresas (pato boiando, disco cruzando o céu). */
  update(time: number, ballS: number): void {
    for (const list of this.items.values()) {
      for (const it of list) {
        const d = it.deco;
        const h = floorHeight(it.seg, Math.min(it.seg.s1, Math.max(it.seg.s0, d.s)));
        const z = -(d.s - this.origin);
        const half = (it.seg.floors[0] ? it.seg.floors[0].x1 - it.seg.floors[0].x0 : 6) / 2;
        if (d.kind === 'billboard') {
          it.obj.position.set(d.side * (half + 3.2), h + 2.2, z);
          it.obj.rotation.y = -d.side * 0.35;
        } else if (d.kind === 'duck') {
          it.obj.position.set(d.side * (half + 5.5), h - 1.5 + Math.sin(time * 1.6) * 0.35, z);
          it.obj.rotation.y = d.side > 0 ? Math.PI + 0.4 : -0.4;
          it.obj.rotation.z = Math.sin(time * 1.3) * 0.08;
        } else {
          // cruza o céu enquanto a bola se aproxima
          const k = Math.max(-1, Math.min(1, (ballS - (d.s - 90)) / 90));
          it.obj.position.set(d.side * k * 28, h + 13 + Math.sin(time * 2) * 0.5, z);
          it.obj.rotation.y = time * 1.5;
        }
      }
    }
  }

  setOrigin(o: number): void {
    this.origin = o;
  }
}
