import { FIXED_DT, MAX_FRAME_DT } from '../sim/constants';

/**
 * Acumulador de passo fixo: a física roda sempre em FIXED_DT, independente de 30/60/90/120 FPS.
 * Retorna alfa (0..1) para interpolar o desenho entre o passo anterior e o atual.
 */
export class FixedLoop {
  private acc = 0;
  constructor(private readonly step: () => void, private readonly dt = FIXED_DT, private readonly maxFrame = MAX_FRAME_DT) {}

  advance(frameDt: number): number {
    if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
    this.acc += Math.min(frameDt, this.maxFrame);
    let guard = 0;
    while (this.acc >= this.dt && guard++ < 64) {
      this.step();
      this.acc -= this.dt;
    }
    return this.acc / this.dt;
  }

  reset(): void {
    this.acc = 0;
  }
}
