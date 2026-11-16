import { CanvasTexture, DirectionalLight, AmbientLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, WebGLRenderer, RepeatWrapping } from 'three';
import { composePhoto, type PhotoFit } from '../render/skins';

export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_SIDE = 1024; // a foto guardada nunca passa disso (leve e rápida)
export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif', 'image/bmp'];

export interface StoredPhoto {
  data: string; // JPEG (data URL) já reduzido
  fit: PhotoFit;
}

export const DEFAULT_FIT: PhotoFit = { zoom: 1, offsetX: 0, offsetY: 0, gray: false };

export class PhotoError extends Error {}

/** Valida e decodifica a imagem sem travar; devolve um canvas reduzido (máx. 1024 px). */
export async function loadPhotoFile(file: File): Promise<HTMLCanvasElement> {
  if (!file) throw new PhotoError('Nenhum arquivo escolhido.');
  const typeOk = file.type ? file.type.startsWith('image/') : /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name);
  if (!typeOk) throw new PhotoError('Esse arquivo não é uma imagem. Use JPG, PNG ou WEBP.');
  if (file.size > MAX_FILE_BYTES) throw new PhotoError('Imagem grande demais (máximo 30 MB).');
  if (file.size === 0) throw new PhotoError('O arquivo está vazio.');
  const url = URL.createObjectURL(file);
  try {
    const img = await decode(url);
    return downscale(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function decode(src: string, timeoutMs = 10000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = window.setTimeout(() => reject(new PhotoError('A imagem demorou demais para abrir.')), timeoutMs);
    img.onload = () => {
      window.clearTimeout(t);
      if (!img.naturalWidth || !img.naturalHeight) reject(new PhotoError('Não consegui ler essa imagem.'));
      else resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(t);
      reject(new PhotoError('Não consegui abrir essa imagem (formato não suportado neste aparelho).'));
    };
    img.decoding = 'async';
    img.src = src;
  });
}

export function downscale(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d');
  if (!g) throw new PhotoError('Este aparelho não conseguiu processar a imagem.');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function toStored(src: HTMLCanvasElement, fit: PhotoFit): StoredPhoto {
  return { data: src.toDataURL('image/jpeg', 0.86), fit: { ...fit } };
}

export function sanitizeFit(f: Partial<PhotoFit> | undefined): PhotoFit {
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { zoom: n(f?.zoom, 1, 1, 4), offsetX: n(f?.offsetX, 0, 0, 1), offsetY: n(f?.offsetY, 0, -0.5, 0.5), gray: f?.gray === true };
}

/** Pré-visualização 3D (bola girando). Um contexto WebGL pequeno, criado e liberado com o painel. */
export class PhotoPreview {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(30, 1, 0.1, 10);
  private mat = new MeshPhysicalMaterial({ roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
  private mesh: Mesh;
  private tex: CanvasTexture;
  private texCanvas = document.createElement('canvas');
  private raf = 0;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(canvas.clientWidth || 200, canvas.clientHeight || 200, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.texCanvas.width = 1024;
    this.texCanvas.height = 512;
    this.tex = new CanvasTexture(this.texCanvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.wrapS = RepeatWrapping;
    this.mat.map = this.tex;
    this.mesh = new Mesh(new SphereGeometry(1, 64, 40), this.mat);
    this.scene.add(this.mesh, new AmbientLight('#ffffff', 1.2));
    const l = new DirectionalLight('#ffffff', 2.5);
    l.position.set(-2, 3, 4);
    this.scene.add(l);
    this.camera.position.set(0, 0, 4.4);
    const loop = () => {
      if (this.disposed) return;
      this.mesh.rotation.y += 0.012;
      this.mesh.rotation.x = 0.25;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  update(src: HTMLCanvasElement | null, fit: PhotoFit): void {
    const g = this.texCanvas.getContext('2d');
    if (!g) return;
    if (src) composePhoto(g, src, fit, 1024, 512);
    else {
      g.fillStyle = '#2a2a2e';
      g.fillRect(0, 0, 1024, 512);
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/**
 * Miniaturas das bolas desenhadas só na CPU (sem WebGL): cada pixel do círculo vira um ponto da esfera,
 * busca a cor na textura (equirretangular) e recebe luz de estúdio. Nenhum contexto gráfico extra.
 */
export function renderSkinThumbs(items: { id: string; map: import('three').Texture; bump: import('three').Texture | null; look: { roughness: number; metalness: number; clearcoat: number; bump: number } }[], size = 96): Map<string, string> {
  const out = new Map<string, string>();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return out;
  // luz e rotação fixas (bola levemente girada, luz do alto à esquerda)
  const L = [-0.45, 0.6, 0.66];
  const rx = 0.35;
  const ry = -0.6;
  for (const it of items) {
    const src = it.map.image as HTMLCanvasElement | undefined;
    const sg = src?.getContext?.('2d');
    if (!src || !sg) continue;
    const tw = src.width;
    const th = src.height;
    const tex = sg.getImageData(0, 0, tw, th).data;
    const img = g.createImageData(size, size);
    const a = img.data;
    const glossy = it.look.roughness < 0.6;
    const metal = it.look.metalness > 0.5;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px + 0.5) / size * 2 - 1;
        const y = 1 - (py + 0.5) / size * 2;
        const r2 = x * x + y * y;
        const i = (py * size + px) * 4;
        if (r2 > 1) {
          a[i + 3] = 0;
          continue;
        }
        const z = Math.sqrt(1 - r2);
        // gira o ponto para escolher a parte da textura que aparece
        const y1 = y * Math.cos(rx) - z * Math.sin(rx);
        const z1 = y * Math.sin(rx) + z * Math.cos(rx);
        const x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
        const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
        const lon = Math.atan2(z2, x2);
        const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
        const u = Math.floor(((lon / (Math.PI * 2) + 1) % 1) * tw);
        const v = Math.floor((0.5 - lat / Math.PI) * th);
        const ti = (Math.min(th - 1, v) * tw + Math.min(tw - 1, u)) * 4;
        const diff = Math.max(0, x * L[0]! + y * L[1]! + z * L[2]!);
        const rim = Math.pow(1 - z, 3) * 0.35;
        const hx = x * L[0]! + y * L[1]! + z * L[2]!;
        const spec = glossy ? Math.pow(Math.max(0, hx), metal ? 18 : 40) * (metal ? 0.9 : 0.75) : 0;
        const k = metal ? 0.35 + diff * 0.9 : 0.42 + diff * 0.72;
        for (let ch = 0; ch < 3; ch++) a[i + ch] = Math.min(255, (tex[ti + ch] ?? 0) * k + 255 * (spec + rim));
        // borda suave
        a[i + 3] = Math.round(255 * Math.min(1, (1 - Math.sqrt(r2)) * size * 0.5));
      }
    }
    g.clearRect(0, 0, size, size);
    g.putImageData(img, 0, 0);
    out.set(it.id, c.toDataURL('image/png'));
  }
  return out;
}
