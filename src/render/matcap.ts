import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Matcaps gerados em canvas: dão à bola o acabamento de verniz/cromo de estúdio
 * sem pré-cálculo de ambiente (que travava aparelhos sem GPU forte).
 */
export type Finish = 'gloss' | 'matte' | 'chrome';
const cache = new Map<Finish, CanvasTexture>();

export function matcap(finish: Finish): CanvasTexture {
  const c0 = cache.get(finish);
  if (c0) return c0;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const base = g.createRadialGradient(s * 0.42, s * 0.38, s * 0.02, s * 0.5, s * 0.5, s * 0.52);
  if (finish === 'chrome') {
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.35, '#9a9aa2');
    base.addColorStop(0.6, '#2a2a30');
    base.addColorStop(0.8, '#cfcfd6');
    base.addColorStop(1, '#3a3a40');
  } else if (finish === 'matte') {
    base.addColorStop(0, '#f2f2f2');
    base.addColorStop(0.6, '#a8a8ae');
    base.addColorStop(1, '#3c3c42');
  } else {
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.55, '#bcbcc2');
    base.addColorStop(0.92, '#55555c');
    base.addColorStop(1, '#2a2a30');
  }
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  if (finish !== 'matte') {
    // brilho de verniz (janela de estúdio) e luz de recorte
    const hl = g.createRadialGradient(s * 0.34, s * 0.28, 0, s * 0.34, s * 0.28, s * 0.16);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = s * 0.03;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.46, Math.PI * 0.15, Math.PI * 0.55);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cache.set(finish, t);
  return t;
}

export function finishFor(look: { roughness: number; metalness: number }): Finish {
  if (look.metalness > 0.5) return 'chrome';
  if (look.roughness > 0.6) return 'matte';
  return 'gloss';
}
