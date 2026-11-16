export type AppState = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';

const ALLOWED: Record<AppState, AppState[]> = {
  loading: ['menu'],
  menu: ['playing'],
  playing: ['paused', 'gameover', 'menu', 'playing'],
  paused: ['playing', 'menu'],
  gameover: ['playing', 'menu'],
};

/** Máquina de estados única. Transição inválida é ignorada (ex.: toque duplo em JOGAR). */
export class StateMachine {
  private s: AppState = 'loading';
  private listeners: ((to: AppState, from: AppState) => void)[] = [];
  transitions = 0;

  get state(): AppState {
    return this.s;
  }

  can(to: AppState): boolean {
    return ALLOWED[this.s].includes(to);
  }

  go(to: AppState): boolean {
    if (!this.can(to)) return false;
    const from = this.s;
    this.s = to;
    this.transitions++;
    for (const l of this.listeners) l(to, from);
    return true;
  }

  on(l: (to: AppState, from: AppState) => void): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }
}
