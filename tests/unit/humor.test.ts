import { describe, it, expect } from 'vitest';
import { GAMEOVER, pick } from '../../src/ui/humor';
import { sanitizeFit } from '../../src/ui/photo';
import { ZONES } from '../../src/sim/zones';
import { LOOKS } from '../../src/render/theme';

describe('humor e personalização', () => {
  it('mensagens de fim não repetem as últimas', () => {
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) seen.push(pick(GAMEOVER.hit));
    for (let i = 3; i < seen.length; i++) expect(seen.slice(i - 3, i)).not.toContain(seen[i]);
  });
  it('enquadramento da foto sempre válido', () => {
    expect(sanitizeFit({ zoom: 99, offsetX: -3, offsetY: 7, gray: 'sim' as never })).toEqual({ zoom: 4, offsetX: 0, offsetY: 0.5, gray: false });
    expect(sanitizeFit(undefined)).toEqual({ zoom: 1, offsetX: 0, offsetY: 0, gray: false });
  });
  it('a base de todo ambiente é preto, branco e cinzas (a cor viva vem só do destaque por km)', () => {
    expect(LOOKS.length).toBe(ZONES.length);
    for (const l of LOOKS) {
      for (const v of Object.values(l)) {
        if (typeof v !== 'string') continue;
        const n = parseInt(v.slice(1), 16);
        const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        expect(Math.max(r, g, b) - Math.min(r, g, b), v).toBeLessThanOrEqual(12); // cinza (tolerância mínima)
      }
    }
  });
});
