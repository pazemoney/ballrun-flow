import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { BallDef, BallPattern } from '../game/catalog';

/** Visual de uma bola: textura equirretangular (2:1) em tons de cinza + relevo opcional. */
export interface Skin {
  id: string;
  name: string;
  roughness: number;
  metalness: number;
  clearcoat: number;
  bump: number;
  trail: string;
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  bumpDraw?: (g: CanvasRenderingContext2D, w: number, h: number) => void;
}

const W = 1024;
const H = 512;

function rnd(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Pinta pixel a pixel a partir da direção 3D (sem beliscão nos polos). */
function perPixel(g: CanvasRenderingContext2D, _w: number, _h: number, fn: (x: number, y: number, z: number) => number): void {
  // usa o tamanho real do canvas (miniaturas são menores; o desenho vetorial usa escala)
  const w = g.canvas.width;
  const h = g.canvas.height;
  const img = g.createImageData(w, h);
  const a = img.data;
  for (let py = 0; py < h; py++) {
    const lat = (0.5 - (py + 0.5) / h) * Math.PI;
    const y = Math.sin(lat);
    const r = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lon = ((px + 0.5) / w) * Math.PI * 2;
      const v = Math.max(0, Math.min(255, fn(r * Math.cos(lon), y, r * Math.sin(lon))));
      const i = (py * w + px) * 4;
      a[i] = a[i + 1] = a[i + 2] = v;
      a[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

/** coordenadas no cubo (para grades quadradas em toda a esfera) */
function cube(x: number, y: number, z: number, k: number): [number, number, number, number] {
  const m = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  const ax = Math.abs(x) === m ? 0 : Math.abs(y) === m ? 1 : 2;
  return [(x / m) * k, (y / m) * k, (z / m) * k, ax];
}

const fibCache = new Map<number, [number, number, number][]>();
function fib(n: number): [number, number, number][] {
  const c = fibCache.get(n);
  if (c) return c;
  const pts: [number, number, number][] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    pts.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
  }
  fibCache.set(n, pts);
  return pts;
}

function nearestDot(x: number, y: number, z: number, n: number): number {
  let best = -2;
  for (const p of fib(n)) {
    const d = p[0] * x + p[1] * y + p[2] * z;
    if (d > best) best = d;
  }
  return Math.acos(Math.min(1, best)); // ângulo até o ponto mais próximo
}

const band = (v: number, n: number) => (Math.floor(v * n) & 1);

function text2(g: CanvasRenderingContext2D, w: number, h: number, txt: string, size: number, color: string, bg: string): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = `900 ${size}px Anton, Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const cx of [w * 0.25, w * 0.75]) g.fillText(txt, cx, h / 2);
}

function face(g: CanvasRenderingContext2D, w: number, h: number, expr: string): void {
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#111';
  g.fillStyle = '#111';
  g.lineCap = 'round';
  for (const cx of [w * 0.25, w * 0.75]) {
    const ey = h * 0.42;
    g.lineWidth = 12;
    const eye = (x: number, closed: boolean) => {
      if (closed) {
        g.beginPath();
        g.arc(x, ey + 6, 18, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse(x, ey, 14, 24, 0, 0, Math.PI * 2);
        g.fill();
      }
    };
    eye(cx - 42, expr === 'sono' || expr === 'pisca');
    eye(cx + 42, expr === 'sono');
    if (expr === 'oculos') {
      g.fillRect(cx - 80, ey - 22, 70, 40);
      g.fillRect(cx + 10, ey - 22, 70, 40);
      g.fillRect(cx - 12, ey - 10, 24, 8);
    }
    if (expr === 'bravo') {
      g.beginPath();
      g.moveTo(cx - 70, ey - 44);
      g.lineTo(cx - 20, ey - 26);
      g.moveTo(cx + 70, ey - 44);
      g.lineTo(cx + 20, ey - 26);
      g.stroke();
    }
    g.beginPath();
    if (expr === 'susto') {
      g.ellipse(cx, h * 0.64, 22, 30, 0, 0, Math.PI * 2);
      g.fill();
    } else if (expr === 'bravo') {
      g.arc(cx, h * 0.72, 46, 1.2 * Math.PI, 1.8 * Math.PI);
      g.stroke();
    } else if (expr === 'sono') {
      g.moveTo(cx - 24, h * 0.62);
      g.lineTo(cx + 24, h * 0.62);
      g.stroke();
      g.font = '900 40px Anton, sans-serif';
      g.fillText('z', cx + 70, h * 0.3);
      g.font = '900 28px Anton, sans-serif';
      g.fillText('z', cx + 95, h * 0.22);
    } else {
      g.arc(cx, h * 0.5, 62, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
    }
    if (expr === 'lingua') {
      g.fillStyle = '#777';
      g.beginPath();
      g.ellipse(cx + 10, h * 0.68, 20, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
    }
    if (expr === 'bigode') {
      g.beginPath();
      g.ellipse(cx - 30, h * 0.6, 34, 12, -0.3, 0, Math.PI * 2);
      g.ellipse(cx + 30, h * 0.6, 34, 12, 0.3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function sport(g: CanvasRenderingContext2D, w: number, h: number, sp: string): void {
  if (sp === 'futebol') perPixel(g, w, h, (x, y, z) => (nearestDot(x, y, z, 12) < 0.36 ? 22 : 242));
  else if (sp === 'basquete') perPixel(g, w, h, (x, y, z) => {
    const seam = Math.min(Math.abs(y), Math.abs(x), Math.abs(z * z - x * x * 0.0 - 0.5 + y * y * 0) * 0.6, Math.abs(Math.sqrt(x * x + y * y) - 0.72) * 0.9);
    return seam < 0.035 ? 15 : 95 + noise3(x * 40, y * 40, z * 40) * 25;
  });
  else if (sp === 'tenis') perPixel(g, w, h, (x, y, z) => (Math.abs(y - 0.55 * Math.sin(Math.atan2(z, x) * 2)) < 0.05 ? 250 : 175 + noise3(x * 60, y * 60, z * 60) * 30));
  else if (sp === 'volei') perPixel(g, w, h, (x, y, z) => {
    const a = Math.abs(x) > Math.abs(y) && Math.abs(x) > Math.abs(z) ? y : Math.abs(y) > Math.abs(z) ? z : x;
    return band((a + 1) * 0.5, 3) ? 238 : 160;
  });
  else if (sp === 'golfe') {
    g.fillStyle = '#f0f0f0';
    g.fillRect(0, 0, w, h);
  } else if (sp === 'beisebol') perPixel(g, w, h, (x, y, z) => {
    const d = Math.abs(y - 0.6 * Math.sin(Math.atan2(z, x) * 2));
    const stitch = d > 0.05 && d < 0.09 && Math.sin(Math.atan2(z, x) * 60) > 0.2;
    return stitch ? 30 : d < 0.012 ? 90 : 244;
  });
  else perPixel(g, w, h, (x, y, z) => {
    const holes = [[0.2, 0.75, 0.6], [0.45, 0.82, 0.35], [0.05, 0.9, 0.42]];
    for (const [hx, hy, hz] of holes) if ((x - (hx ?? 0)) ** 2 + (y - (hy ?? 0)) ** 2 + (z - (hz ?? 0)) ** 2 < 0.012) return 0;
    return 28 + fbm(x * 3, y * 3, z * 3) * 30;
  });
}

function drawPattern(g: CanvasRenderingContext2D, w: number, h: number, p: BallPattern): void {
  switch (p.p) {
    case 'checker': return sphereChecker(g, w, h, false, p.k, p.a, p.b);
    case 'stripes': return perPixel(g, w, h, (x, y) => (band(((p.diag ? (y + x) * 0.7 : y) + 1) * 0.5, p.n) ? p.a : p.b));
    case 'dots': return perPixel(g, w, h, (x, y, z) => (nearestDot(x, y, z, p.n * p.n) < p.r * (6 / p.n) ? p.b : p.a));
    case 'rings': return perPixel(g, w, h, (x) => (band(Math.acos(Math.max(-1, Math.min(1, x))) / Math.PI, p.n * 2) ? p.a : p.b));
    case 'billiard': {
      text2(g, w, h, '', 10, '#000', p.dark ? '#111113' : '#e8e8ec');
      if (!p.dark) {
        g.fillStyle = '#4a4a50';
        g.fillRect(0, h * 0.3, w, h * 0.4);
      }
      for (const cx of [w * 0.25, w * 0.75]) {
        g.fillStyle = '#f5f5f5';
        g.beginPath();
        g.ellipse(cx, h / 2, 70, 80, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0d0d0f';
        g.font = '900 110px Anton, Impact, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(p.num), cx, h / 2 + 6);
      }
      return;
    }
    case 'face': return face(g, w, h, p.expr);
    case 'sport': return sport(g, w, h, p.sport);
    case 'marble': {
      g.fillStyle = p.dark ? '#151517' : '#ececee';
      g.fillRect(0, 0, w, h);
      const r = rnd(p.dark ? 17 : 11);
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.15 + r() * 0.5;
        g.strokeStyle = p.dark ? (r() > 0.5 ? '#9a9aa0' : '#5a5a60') : r() > 0.5 ? '#55555c' : '#9a9aa0';
        g.lineWidth = 1 + r() * 4;
        g.beginPath();
        let x = r() * w;
        let y = r() * h;
        g.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          x += (r() - 0.3) * 90;
          y += (r() - 0.5) * 50;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      return;
    }
    case 'noise': return perPixel(g, w, h, (x, y, z) => p.b + (p.a - p.b) * fbm(x * p.scale + 9, y * p.scale, z * p.scale));
    case 'disco': {
      const r = rnd(5);
      for (let y = 0; y < h; y += 24) for (let x = 0; x < w; x += 24) {
        const v = Math.floor(120 + r() * 135);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + 1, y + 1, 22, 22);
      }
      return;
    }
    case 'zebra': return perPixel(g, w, h, (x, y, z) => (band((x + 1) * 0.5 + fbm(x * 2, y * 2, z * 2) * 0.35, 9) ? 240 : 20));
    case 'spots': return perPixel(g, w, h, (x, y, z) => {
      const n = noise3(x * 5, y * 5, z * 5);
      return n > 0.72 ? 25 : n > 0.62 ? 120 : 228;
    });
    case 'hex': return perPixel(g, w, h, (x, y, z) => {
      const [a, b, c, ax] = cube(x, y, z, 3.2);
      const u = ax === 0 ? b : a;
      const v = ax === 2 ? b : c;
      const q = (2 / 3) * u;
      const rr = (-1 / 3) * u + (Math.sqrt(3) / 3) * v;
      const fx = q - Math.round(q);
      const fy = rr - Math.round(rr);
      return Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fx + fy)) > 0.42 ? 40 : 200 + hash3(Math.round(q), Math.round(rr), ax) * 40;
    });
    case 'spiral': return perPixel(g, w, h, (x, y, z) => (band((Math.atan2(z, x) / Math.PI + y * 1.6 + 2) * 0.5, p.n) ? 238 : 30));
    case 'code': {
      g.fillStyle = '#121214';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e9e9ee';
      g.font = '900 54px Anton, Impact, sans-serif';
      for (let y = 40; y < h; y += 70) for (let x = (y / 70) % 2 ? 0 : 60; x < w; x += 130) g.fillText('</>', x, y);
      return;
    }
    case 'binary': {
      g.fillStyle = '#0e0e10';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9d9de';
      g.font = '700 30px monospace';
      const r = rnd(4);
      for (let y = 30; y < h; y += 34) {
        let line = '';
        for (let i = 0; i < 64; i++) line += r() > 0.5 ? '1' : '0';
        g.fillText(line, 0, y);
      }
      return;
    }
    case 'pixel': return perPixel(g, w, h, (x, y, z) => {
      const [a, b, c] = cube(x, y, z, 6);
      return 40 + Math.floor(hash3(Math.floor(a), Math.floor(b), Math.floor(c)) * 4) * 60;
    });
    case 'waves': return perPixel(g, w, h, (x, y, z) => (band((y + 1) * 0.5 + Math.sin(Math.atan2(z, x) * 4) * 0.06, p.n) ? 236 : 48));
    case 'diamond': return perPixel(g, w, h, (x, y, z) => {
      const [a, b, c, ax] = cube(x, y, z, 2.4);
      const u = ax === 0 ? b : a;
      const v = ax === 2 ? b : c;
      return (Math.floor(u + v) + Math.floor(u - v)) & 1 ? 230 : 60;
    });
    case 'eye': {
      g.fillStyle = '#f7f7f7';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6a6a70';
      g.beginPath();
      g.ellipse(w * 0.75, h / 2, 95, 105, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0a0a0a';
      g.beginPath();
      g.ellipse(w * 0.75, h / 2, 48, 52, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(w * 0.75 - 20, h / 2 - 24, 14, 0, Math.PI * 2);
      g.fill();
      return;
    }
    case 'planet': return perPixel(g, w, h, (x, y, z) => 120 + 70 * Math.sin(y * 9 + fbm(x * 3, y * 3, z * 3) * 3) + (nearestDot(x, y, z, 40) < 0.07 ? -60 : 0));
    case 'plain':
      g.fillStyle = `rgb(${p.v},${p.v},${p.v})`;
      g.fillRect(0, 0, w, h);
      return;
    case 'photo':
      g.fillStyle = '#2a2a2e';
      g.fillRect(0, 0, w, h);
      return;
  }
}

function drawBump(g: CanvasRenderingContext2D, w: number, h: number, p: BallPattern): boolean {
  if (p.p === 'checker') {
    sphereChecker(g, w, h, true, p.k, 255, 0);
    return true;
  }
  if (p.p === 'sport' && p.sport === 'golfe') {
    perPixel(g, w, h, (x, y, z) => (nearestDot(x, y, z, 400) < 0.05 ? 0 : 255));
    return true;
  }
  if (p.p === 'disco') {
    grooves(g, w, h, Math.round(w / 24), Math.round(h / 24));
    return true;
  }
  if (p.p === 'noise') {
    perPixel(g, w, h, (x, y, z) => 255 * fbm(x * 20, y * 20, z * 20));
    return true;
  }
  if (p.p === 'pixel' || p.p === 'diamond' || p.p === 'hex' || p.p === 'planet' || p.p === 'marble' || (p.p === 'sport' && p.sport === 'basquete')) {
    // relevo a partir da própria cor (bordas)
    drawPattern(g, w, h, p);
    return true;
  }
  return false;
}

export function skinFromBall(b: BallDef): Skin {
  return {
    id: b.id, name: b.name, roughness: b.roughness, metalness: b.metalness, clearcoat: b.clearcoat, bump: b.bump, trail: '#ffffff',
    draw: (g, w, h) => drawPattern(g, w, h, b.pattern),
    bumpDraw: b.bump > 0 ? (g, w, h) => {
      if (!drawBump(g, w, h, b.pattern)) {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, w, h);
      }
    } : undefined,
  };
}

/**
 * Xadrez "de verdade" na esfera: a cor de cada pixel vem da direção 3D (cubo de casas),
 * sem o beliscão dos polos de um xadrez desenhado direto no retângulo.
 */
function sphereChecker(g: CanvasRenderingContext2D, _w: number, _h: number, bump: boolean, kk = 2.6, ca = 232, cb = 58): void {
  const w = g.canvas.width;
  const h = g.canvas.height;
  const img = g.createImageData(w, h);
  const a = img.data;
  const k = kk; // casas por raio
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - (y + 0.5) / h) * Math.PI;
    const cy = Math.sin(lat);
    const r = Math.cos(lat);
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2;
      const dx = r * Math.cos(lon);
      const dz = r * Math.sin(lon);
      // projeta no cubo (casas quadradas em todas as faces)
      const m = Math.max(Math.abs(dx), Math.abs(cy), Math.abs(dz));
      const px = (dx / m) * k;
      const py = (cy / m) * k;
      const pz = (dz / m) * k;
      const parity = (Math.floor(px) + Math.floor(py) + Math.floor(pz)) & 1;
      const fx = Math.min(px - Math.floor(px), 1 - (px - Math.floor(px)));
      const fy = Math.min(py - Math.floor(py), 1 - (py - Math.floor(py)));
      const fz = Math.min(pz - Math.floor(pz), 1 - (pz - Math.floor(pz)));
      // distância à junta na face dominante
      const ax = Math.abs(dx) === m ? 9 : fx;
      const ay = Math.abs(cy) === m ? 9 : fy;
      const az = Math.abs(dz) === m ? 9 : fz;
      const edge = Math.min(ax, ay, az);
      const i = (y * w + x) * 4;
      let v: number;
      if (bump) v = edge < 0.035 ? 0 : 255;
      else {
        v = parity ? ca : cb;
        v -= edge < 0.035 ? 30 : 0;
        v += Math.round((fx + fy + fz) * 6);
      }
      a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, v));
      a[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function grooves(g: CanvasRenderingContext2D, w: number, h: number, nx: number, ny: number) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#000000';
  g.lineWidth = 6;
  for (let x = 0; x <= nx; x++) {
    g.beginPath();
    g.moveTo((x * w) / nx, 0);
    g.lineTo((x * w) / nx, h);
    g.stroke();
  }
  for (let y = 0; y <= ny; y++) {
    g.beginPath();
    g.moveTo(0, (y * h) / ny);
    g.lineTo(w, (y * h) / ny);
    g.stroke();
  }
}

export const CUSTOM_SKIN_ID = 'foto';

function canvasTex(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, color: boolean, w = W, h = H): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d indisponível');
  g.setTransform(w / W, 0, 0, h / H, 0, 0);
  draw(g, W, H);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const tex = new CanvasTexture(c);
  if (color) tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function skinTextures(skin: Skin, w = W): { map: Texture; bump: Texture | null } {
  return { map: canvasTex(skin.draw, true, w, w / 2), bump: skin.bumpDraw ? canvasTex(skin.bumpDraw, false, Math.min(w, 512), Math.min(w, 512) / 2) : null };
}

/** Parâmetros de enquadramento da imagem do jogador. */
export interface PhotoFit {
  zoom: number; // 1..4
  offsetX: number; // 0..1 (gira a imagem em volta da bola)
  offsetY: number; // -0.5..0.5
  gray: boolean;
}

/**
 * Compõe a foto na textura 2:1 sem deformar: a imagem mantém a proporção, ocupa a altura × zoom
 * e se repete na horizontal (envolve a bola sem emenda vazia).
 */
export function composePhoto(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, fit: PhotoFit, w = W, h = H): void {
  g.fillStyle = '#1b1b1e';
  g.fillRect(0, 0, w, h);
  const ih = h * fit.zoom;
  const iw = ih * (img.width / Math.max(1, img.height));
  const y = (h - ih) / 2 + fit.offsetY * h;
  let x = (fit.offsetX * w) % iw;
  if (x > 0) x -= iw;
  for (; x < w; x += iw) g.drawImage(img, x, y, iw, ih);
  if (fit.gray) {
    // tons de cinza feitos à mão (o filtro do canvas não existe em Safari antigo)
    const d = g.getImageData(0, 0, w, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const v = 0.299 * (a[i] ?? 0) + 0.587 * (a[i + 1] ?? 0) + 0.114 * (a[i + 2] ?? 0);
      a[i] = a[i + 1] = a[i + 2] = v;
    }
    g.putImageData(d, 0, 0);
  }
}

export function photoTexture(img: CanvasImageSource & { width: number; height: number }, fit: PhotoFit): CanvasTexture {
  return canvasTex((g, w, h) => composePhoto(g, img, fit, w, h), true);
}
