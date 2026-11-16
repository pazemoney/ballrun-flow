export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

export function fmtInt(n: number): string {
  return Math.floor(n).toLocaleString('pt-BR');
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtDist(u: number): string {
  // 1 u = 1 m na escala do jogo
  return u >= 1000 ? `${(u / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km` : `${Math.round(u)} m`;
}
