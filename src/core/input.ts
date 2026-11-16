/**
 * Controle: arrastar o dedo/mouse move o alvo lateral da bola (relativo, sem "pular" para onde tocou).
 * Teclado: ← → / A D movem o alvo continuamente. Só o primeiro dedo controla; botões não movem a bola.
 */
export class InputController {
  private pointerId: number | null = null;
  private lastX = 0;
  private keys = { left: false, right: false };
  /** deslocamento lateral acumulado desde a última leitura (u) */
  private pending = 0;
  enabled = false;
  sensitivity = 1;
  /** largura da pista em u correspondente à largura da tela */
  unitsPerScreen = 7;
  dragging = false;
  private disposers: (() => void)[] = [];
  /** toque duplo na tela (ou Espaço/↑ no teclado) = poder especial */
  onPower: (() => void) | null = null;
  private lastTap = { t: -1e9, x: 0, y: 0 };

  constructor(private readonly surface: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K | string, fn: (e: never) => void, opt?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opt);
      this.disposers.push(() => el.removeEventListener(ev, fn as EventListener, opt));
    };
    on(surface, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(surface, 'pointermove', (e: PointerEvent) => this.move(e));
    on(surface, 'pointerup', (e: PointerEvent) => this.up(e));
    on(surface, 'pointercancel', (e: PointerEvent) => this.up(e));
    on(surface, 'lostpointercapture', (e: PointerEvent) => this.up(e));
    // Safari iOS: impede rolagem/zoom da página durante o controle
    on(surface, 'touchmove', (e: TouchEvent) => e.preventDefault(), { passive: false });
    on(surface, 'touchstart', (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => this.key(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.key(e, false));
    on(window, 'blur', () => this.reset());
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, [data-ui]')) return;
    // toque duplo: dois toques rápidos e perto um do outro (qualquer dedo)
    const now = e.timeStamp || performance.now();
    const near = Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 70;
    if (now - this.lastTap.t < 320 && near) {
      this.lastTap.t = -1e9;
      this.onPower?.();
    } else this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.dragging = true;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* alguns navegadores recusam captura: segue sem ela */
    }
  }

  private move(e: PointerEvent): void {
    if (!this.enabled || e.pointerId !== this.pointerId) return;
    const w = Math.max(240, Math.min(this.surface.clientWidth || window.innerWidth, 900));
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.pending += (dx / w) * this.unitsPerScreen * 1.25 * this.sensitivity;
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.dragging = false;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.left = down;
    else if (k === 'arrowright' || k === 'd') this.keys.right = down;
    else if (k === ' ' || k === 'arrowup' || k === 'w') {
      if (down && !e.repeat && this.enabled) this.onPower?.();
    } else return;
    if (this.enabled) e.preventDefault();
  }

  /** Lê o movimento desde o último quadro e devolve o novo alvo. */
  consume(currentTarget: number, ballX: number, dt: number): number {
    let t = currentTarget + this.pending;
    this.pending = 0;
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (dir !== 0) t = ballX + dir * 1.2 * this.sensitivity; // segura a tecla: anda; solta: para
    else if (this.keyWasDown) t = ballX;
    this.keyWasDown = dir !== 0;
    void dt;
    return t;
  }
  private keyWasDown = false;

  reset(): void {
    this.pending = 0;
    this.pointerId = null;
    this.dragging = false;
    this.keys.left = this.keys.right = false;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
