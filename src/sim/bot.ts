import { LAT_GAIN, LAT_MAX_SPEED } from './constants';
import { GameSim } from './game';
import { OBS_MARGIN } from './validator';

/**
 * Jogador automático para testes: planeja com programação dinâmica sobre uma grade (x, s)
 * usando 80% da capacidade lateral real e só o que estaria visível. Se ele morre, a pista foi injusta.
 */
export class Bot {
  private readonly dx = 0.1;
  private readonly horizon = 70;

  constructor(private readonly sim: GameSim, private readonly latFrac = 0.8) {}

  private free(x: number, s: number): boolean {
    const t = this.sim.track;
    const seg = t.segmentAt(s);
    if (!seg) return false;
    const anyFloor = t.segments.some((g) => s >= g.s0 && s <= g.s1 && g.floors.some((f) => s >= f.s0 && s <= f.s1));
    if (!anyFloor) return seg.maxAir > 0; // vão validado: atravessa no ar
    if (!t.floorAt(x - 0.1, s) || !t.floorAt(x + 0.1, s)) return false;
    let blocked = false;
    const m = OBS_MARGIN - 0.05;
    t.forObstacles(s - 2, s + 2, (o) => {
      if (s < o.s0 - m || s > o.s1 + m + 1.0) return false; // folga atrás do bloco: a bola tem inércia
      if (x > o.x0 - o.amp - m && x < o.x1 + o.amp + m) {
        blocked = true;
        return true;
      }
      return false;
    });
    return !blocked;
  }

  /** Decide o alvo lateral para este passo: antecipa com folga; só usa o limite quando precisa. */
  decide(): number {
    for (const frac of [0.3, 0.5, this.latFrac]) {
      const x = this.plan(frac);
      if (x !== null) return x;
    }
    return this.sim.ball.x;
  }

  private plan(frac: number): number | null {
    const b = this.sim.ball;
    const xs: number[] = [];
    for (let x = -4.5; x <= 4.5 + 1e-9; x += this.dx) xs.push(Math.round(x * 10) / 10);
    const v = Math.max(1, b.vs);
    // passo da grade adaptado à velocidade: sempre ~3 células de movimento lateral por passo
    const ds = Math.min(1.0, Math.max(0.25, (3 * this.dx * v) / (LAT_MAX_SPEED * frac)));
    const nS = Math.ceil(this.horizon / ds);
    const rc = Math.max(1, Math.floor((LAT_MAX_SPEED * frac * ds) / v / this.dx + 1e-9));
    // para trás: ok[k][i] = dá para sobreviver de (k, i) até o horizonte
    const ok: boolean[][] = [];
    let next = xs.map(() => true);
    for (let k = nS; k >= 1; k--) {
      const s = b.s + k * ds;
      const cur = xs.map((x, i) => {
        if (!this.free(x, s)) return false;
        for (let d = -rc; d <= rc; d++) if (next[i + d]) return true;
        return false;
      });
      ok[k] = cur;
      next = cur;
    }
    // para frente: células alcançáveis a partir da posição atual
    const curI = Math.max(0, Math.min(xs.length - 1, Math.round((b.x + 4.5) / this.dx)));
    const K = Math.min(nS, Math.max(2, Math.round((v * 0.7) / ds)));
    let reach = xs.map((_, i) => i === curI);
    const reaches: boolean[][] = [reach];
    for (let k = 1; k <= K; k++) {
      const row = ok[k] ?? [];
      const nr = xs.map((_, i) => {
        if (!row[i]) return false;
        for (let d = -rc; d <= rc; d++) if (reach[i + d]) return true;
        return false;
      });
      reach = nr;
      reaches[k] = nr;
    }
    let bestI = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (!reach[i]) continue;
      let room = 0;
      while (reach[i - room - 1] && reach[i + room + 1] && room < 12) room++;
      const score = room - Math.abs(i - curI) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI < 0) return null;
    // volta pelo caminho até o ponto de passagem próximo (não corta a curva por dentro do bloco)
    const kw = Math.min(K, Math.max(1, Math.round(v / (LAT_GAIN * ds)))); // antecipa o atraso do controle (τ = 1/LAT_GAIN)
    let i = bestI;
    for (let k = K - 1; k >= kw; k--) {
      const row = reaches[k] ?? [];
      let bestJ = -1;
      for (let d = 0; d <= rc && bestJ < 0; d++) {
        if (row[i - d]) bestJ = i - d;
        else if (row[i + d]) bestJ = i + d;
      }
      if (bestJ < 0) break;
      i = bestJ;
    }
    return xs[i] ?? b.x;
  }
}
