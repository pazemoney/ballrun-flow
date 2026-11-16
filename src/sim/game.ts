import {
  BALL_R, BOOST_ACCEL, BOOST_FACTOR, BOOST_TIME, FIXED_DT, FWD_ACCEL, FWD_DECEL, GRAVITY, HIT_SHRINK,
  LAT_ACCEL, LAT_AIR_FACTOR, LAT_GAIN, LAT_MAX_SPEED, SCORE_UNIT, SNAP_DOWN, SNAP_UP,
} from './constants';
import { scoreFor, type Mode } from './difficulty';
import { Track } from './track';
import type { GenOptions } from './generator';
import { ABILITY_BASE, type AbilityKind, type AbilitySpec } from './abilities';
import { freeAt } from './validator';
import { floorHeight, obstacleOffset, spinnerAngle, SPINNER_HALF_WIDTH, type HintKind, type Obstacle } from './types';

export type DeathCause = 'hit' | 'fall';
export type SimEvent =
  | { type: 'boost' }
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'hit' }
  | { type: 'fall' }
  | { type: 'hint'; hint: HintKind; at: number }
  | { type: 'nearMiss' }
  | { type: 'level'; level: number }
  | { type: 'ability'; kind: AbilityKind; shout: string }
  | { type: 'abilityEnd'; kind: AbilityKind }
  | { type: 'smash'; x: number; s: number; y: number; o: Obstacle }
  | { type: 'shieldPop' };

export interface BallState {
  x: number;
  y: number;
  s: number;
  vx: number;
  vy: number;
  vs: number;
  onGround: boolean;
}

export type SimState = 'running' | 'dying' | 'over';

const LOOKAHEAD = 230; // u gerados à frente
const BEHIND = 30;

/** Uma partida: física de passo fixo + pista + pontuação. Sem dependência de tela (testável). */
export class GameSim {
  readonly track: Track;
  ball: BallState;
  prev: BallState;
  time = 0;
  state: SimState = 'running';
  cause: DeathCause | null = null;
  targetX = 0;
  boostTimer = 0;
  jumps = 0;
  boosts = 0;
  private dyingT = 0;
  private lastGroundH = 0;
  private wasOnPad = false;
  private airTime = 0;
  private hintedSegs = new Set<number>();
  readonly events: SimEvent[] = [];
  /** nível atual (aceleradores cruzados) */
  level = 0;
  /** maior velocidade alcançada (u/s) */
  maxSpeed = 0;
  // ---- poder especial da bola ----
  ability: AbilitySpec | null = null;
  abilityReadyAt = 0;
  abilityUses = 0;
  /** relógio dos obstáculos móveis (para quando o poder "congelar" age) */
  obsTime = 0;
  dashT = 0;
  ghostT = 0;
  shieldT = 0;
  slowT = 0;
  freezeT = 0;
  glideT = 0;
  carryT = 0;
  carryKind: 'abduct' | 'rocket' | null = null;
  private carryX = 0;
  private hopsLeft = 0;
  readonly smashed = new WeakSet<Obstacle>();
  lastSmashed: Obstacle | null = null;
  /** distância percorrida em cada ambiente */
  readonly zoneDist: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  steps = 0;

  private nearSeen = new WeakSet<Obstacle>();
  private hitObstacle: Obstacle | null = null;

  constructor(readonly mode: Mode, readonly seed: number, readonly opts: GenOptions = {}) {
    this.track = new Track(mode, seed, opts);
    this.track.ensure(LOOKAHEAD);
    const v0 = this.track.gen.progress(0).speed;
    this.level = this.track.gen.levelAt(0);
    this.ball = { x: 0, y: BALL_R, s: 2, vx: 0, vy: 0, vs: v0, onGround: true };
    this.prev = { ...this.ball };
  }

  get distance(): number {
    return Math.max(0, this.ball.s - 2);
  }
  get score(): number {
    return scoreFor(this.distance, SCORE_UNIT);
  }
  get boosting(): boolean {
    return this.boostTimer > 0 || this.dashT > 0;
  }

  /** escala de tempo do jogo (câmera lenta do poder) */
  get timeScale(): number {
    return this.slowT > 0 ? 0.55 : 1;
  }

  /** passa por blocos sem morrer? */
  get invulnerable(): boolean {
    return this.dashT > 0 || this.ghostT > 0 || (this.carryKind === 'abduct' && this.carryT > 0);
  }

  /** 0..1: quanto falta para o poder recarregar (1 = pronto) */
  abilityCharge(): number {
    if (!this.ability) return 0;
    const cd = Math.max(this.ability.cooldown, ABILITY_BASE[this.ability.kind].minCooldown);
    return Math.max(0, Math.min(1, 1 - (this.abilityReadyAt - this.time) / cd));
  }

  /** Lugar seguro (no chão, longe de blocos) em s; devolve x ou null. */
  private safeX(s: number, near: number): number | null {
    const free = freeAt(this.track.segments, s);
    let best: number | null = null;
    let bd = Infinity;
    for (const [a, b] of free) {
      if (b - a < 0.05) continue;
      const x = Math.max(a, Math.min(b, near));
      const d = Math.abs(x - near) - (b - a) * 0.01;
      if (d < bd) {
        bd = d;
        best = Math.abs(x - near) < 1e-9 ? x : (a + b) / 2 + Math.max(-(b - a) / 2, Math.min((b - a) / 2, near - (a + b) / 2));
      }
    }
    return best;
  }

  /** Usa o poder especial. Devolve false se não está pronto ou não dá para usar agora. */
  useAbility(): boolean {
    const a = this.ability;
    const b = this.ball;
    if (!a || this.state !== 'running' || this.time < this.abilityReadyAt || this.carryT > 0) return false;
    const base = ABILITY_BASE[a.kind];
    const p = a.power;
    switch (a.kind) {
      case 'jump':
      case 'superJump':
      case 'tripleHop':
        if (!b.onGround) return false;
        b.vy = (a.kind === 'superJump' ? 13 : a.kind === 'tripleHop' ? 7.6 : 10) * p;
        b.onGround = false;
        this.airTime = 0;
        this.hopsLeft = a.kind === 'tripleHop' ? 2 : 0;
        break;
      case 'dash':
        this.dashT = base.duration * p;
        break;
      case 'ghost':
        this.ghostT = base.duration * p;
        break;
      case 'shield':
        this.shieldT = base.duration * p;
        break;
      case 'slowmo':
        this.slowT = base.duration * p;
        break;
      case 'freeze':
        this.freezeT = base.duration * p;
        break;
      case 'glide':
        this.glideT = base.duration * p;
        if (b.onGround) {
          b.vy = 6;
          b.onGround = false;
          this.airTime = 0;
        }
        break;
      case 'teleport': {
        let done = false;
        for (let k = 0; k < 6 && !done; k++) {
          const ns = b.s + 11 * p + k * 1.5;
          const x = this.safeX(ns, b.x);
          const f = x !== null ? this.track.floorAt(x, ns) : null;
          if (x !== null && f) {
            b.s = ns;
            b.x = x;
            b.y = f.h + BALL_R;
            b.vy = 0;
            b.vx = 0;
            b.onGround = true;
            this.targetX = x;
            this.lastGroundH = f.h;
            this.prev = { ...b }; // sem varredura de colisão pelo "salto" do teletransporte
            done = true;
          }
        }
        if (!done) return false;
        break;
      }
      case 'abduct':
      case 'rocket':
        this.carryKind = a.kind;
        this.carryT = base.duration * p;
        this.carryX = b.x;
        b.onGround = false;
        break;
    }
    this.abilityReadyAt = this.time + Math.max(a.cooldown, base.minCooldown);
    this.abilityUses++;
    this.events.push({ type: 'ability', kind: a.kind, shout: a.shout });
    return true;
  }

  private tickAbility(dt: number): void {
    const end = (k: AbilityKind) => this.events.push({ type: 'abilityEnd', kind: k });
    if (this.dashT > 0 && (this.dashT -= dt) <= 0) end('dash');
    if (this.ghostT > 0 && (this.ghostT -= dt) <= 0) end('ghost');
    if (this.shieldT > 0 && (this.shieldT -= dt) <= 0) end('shield');
    if (this.slowT > 0 && (this.slowT -= dt) <= 0) end('slowmo');
    if (this.freezeT > 0 && (this.freezeT -= dt) <= 0) end('freeze');
    if (this.glideT > 0 && (this.glideT -= dt) <= 0) end('glide');
    if (this.freezeT <= 0) this.obsTime += dt;
  }

  setTarget(x: number): void {
    if (!Number.isFinite(x)) return;
    const w = this.track.gen.progress(this.ball.s).width;
    const lim = Math.max(w, 6) / 2 + 1.2;
    this.targetX = Math.max(-lim, Math.min(lim, x));
  }

  /** Avança exatamente um passo fixo da simulação. */
  step(): void {
    if (this.state === 'over') return;
    const dt = FIXED_DT;
    this.prev = { ...this.ball };
    this.time += dt;
    this.steps++;
    const b = this.ball;

    if (this.state === 'dying') {
      this.dyingT += dt;
      if (this.cause === 'fall') {
        b.vy -= GRAVITY * dt;
        b.y += b.vy * dt;
        b.s += b.vs * dt;
        b.x += b.vx * dt;
        b.vs *= 0.995;
      } else {
        b.vs *= 0.85;
        b.vx *= 0.85;
        b.s += b.vs * dt;
      }
      if (this.dyingT > (this.cause === 'fall' ? 0.9 : 0.55)) this.state = 'over';
      return;
    }

    // --- avanço ---
    const prog = this.track.gen.progress(b.s);
    if (prog.level > this.level) {
      this.level = prog.level;
      this.events.push({ type: 'level', level: prog.level });
    }
    const onPad = b.onGround && this.track.onPad(b.x, b.s);
    if (onPad) {
      if (!this.wasOnPad) {
        this.boosts++;
        this.events.push({ type: 'boost' });
      }
      this.boostTimer = BOOST_TIME;
    } else if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
    }
    this.wasOnPad = onPad;
    this.tickAbility(dt);
    const carryBoost = this.carryT > 0 ? (this.carryKind === 'abduct' ? 1.5 : 1.15) : 1;
    const target = prog.speed * (this.boostTimer > 0 ? BOOST_FACTOR : 1) * (this.dashT > 0 ? 1.7 : 1) * carryBoost;
    if (b.vs < target) b.vs = Math.min(target, b.vs + (this.boostTimer > 0 || this.dashT > 0 || this.carryT > 0 ? BOOST_ACCEL : FWD_ACCEL) * dt);
    else if (b.vs > target) b.vs = Math.max(target, b.vs - FWD_DECEL * dt);

    // --- lateral: segue o alvo do dedo com aceleração e velocidade limitadas ---
    const ctrl = b.onGround ? 1 : LAT_AIR_FACTOR;
    let want = (this.targetX - b.x) * LAT_GAIN;
    want = Math.max(-LAT_MAX_SPEED, Math.min(LAT_MAX_SPEED, want));
    const maxDv = LAT_ACCEL * ctrl * dt;
    b.vx += Math.max(-maxDv, Math.min(maxDv, want - b.vx));

    b.x += b.vx * dt;
    b.s += b.vs * dt;
    if (b.vs > this.maxSpeed && this.dashT <= 0 && this.carryT <= 0) this.maxSpeed = b.vs; // poder não conta para recorde de velocidade
    const zi = this.track.gen.zoneAt(b.s);
    this.zoneDist[zi] = (this.zoneDist[zi] ?? 0) + b.vs * dt;

    // --- voo do poder (disco voador / foguete): sem gravidade, acima dos blocos ---
    if (this.carryT > 0) {
      const under = this.track.floorAt(b.x, b.s);
      if (under) this.lastGroundH = under.h;
      const ref = under ? under.h : this.lastGroundH;
      const ty = ref + BALL_R + (this.carryKind === 'abduct' ? 3.2 : 2.5);
      b.y += (ty - b.y) * Math.min(1, dt * 7);
      b.vy = 0;
      b.onGround = false;
      if (this.carryKind === 'abduct') {
        // o disco leva a bola para um lugar seguro mais à frente
        const sx = this.safeX(b.s + b.vs * 0.6, this.carryX);
        if (sx !== null) this.carryX = sx;
        b.x += (this.carryX - b.x) * Math.min(1, dt * 4);
        b.vx = 0;
        this.targetX = b.x;
      }
      this.carryT -= dt;
      if (this.carryT <= 0) {
        // só solta com chão (e sem bloco) embaixo; senão segura mais um pouco (no máximo 1,5 s)
        const land = this.track.floorAt(b.x, b.s + b.vs * 0.25);
        const safe = this.safeX(b.s + b.vs * 0.25, b.x);
        if ((!land || safe === null || Math.abs(safe - b.x) > 0.3) && this.carryT > -1.5) {
          this.carryT = Math.max(this.carryT, 0.02);
          if (safe !== null) this.carryX = safe;
          if (this.carryKind === 'rocket' && safe !== null) {
            b.x += (safe - b.x) * Math.min(1, dt * 4);
            this.targetX = b.x;
          }
        } else {
          const k = this.carryKind as AbilityKind;
          this.carryKind = null;
          this.carryT = 0;
          this.airTime = 0;
          this.events.push({ type: 'abilityEnd', kind: k });
        }
      }
      if (this.collides()) {
        this.die('hit');
        return;
      }
      this.track.ensure(b.s + LOOKAHEAD);
      this.track.prune(b.s - BEHIND);
      return;
    }

    // --- vertical ---
    const floor = this.track.floorAt(b.x, b.s);
    if (b.onGround) {
      const bottom = b.y - BALL_R;
      if (floor && floor.h <= bottom + SNAP_UP && floor.h >= bottom - SNAP_DOWN) {
        b.y = floor.h + BALL_R;
        b.vy = floor.slope * b.vs;
        this.lastGroundH = floor.h;
      } else if (floor && floor.h > bottom + SNAP_UP) {
        this.die('hit');
        return;
      } else {
        b.onGround = false; // saiu da borda / fim da rampa: mantém vy (salto natural)
        this.airTime = 0;
        if (b.vy > 1) {
          this.jumps++;
          this.events.push({ type: 'jump' });
        }
      }
    }
    if (!b.onGround) {
      this.airTime += dt;
      b.vy -= GRAVITY * (this.glideT > 0 && b.vy < 0 ? 0.25 : 1) * dt;
      b.y += b.vy * dt;
      const f2 = this.track.floorAt(b.x, b.s);
      const bottom = b.y - BALL_R;
      if (f2 && bottom <= f2.h && bottom >= f2.h - SNAP_UP && b.vy <= 0) {
        const impact = -b.vy;
        b.y = f2.h + BALL_R;
        b.vy = f2.slope * b.vs;
        b.onGround = true;
        this.lastGroundH = f2.h;
        if (this.airTime > 0.12) this.events.push({ type: 'land', impact });
        if (this.hopsLeft > 0) {
          this.hopsLeft--;
          b.vy = 7 * (this.ability?.power ?? 1);
          b.onGround = false;
          this.airTime = 0;
        }
      } else if (b.y < this.lastGroundH - 2.5) {
        this.die('fall');
        return;
      }
    }

    // --- colisão com obstáculos (varredura entre a posição anterior e a atual) ---
    if (this.collides()) {
      this.die('hit');
      return;
    }

    // --- dicas contextuais (o tutorial decide se mostra) ---
    for (const seg of this.track.segments) {
      if (seg.s0 > b.s + 70) break;
      if (seg.hint && !this.hintedSegs.has(seg.id) && seg.s0 - b.s < 62 && seg.s0 > b.s + 8) {
        this.hintedSegs.add(seg.id);
        this.events.push({ type: 'hint', hint: seg.hint, at: seg.s0 });
      }
    }

    this.track.ensure(b.s + LOOKAHEAD);
    this.track.prune(b.s - BEHIND);
  }

  /** obstáculo da última batida (para a animação engraçada) */
  get lastHit(): Obstacle | null {
    return this.hitObstacle;
  }

  /** Distância da superfície do obstáculo ao centro da bola no ponto (px, ps, py). */
  private clearance(o: Obstacle, base: number, px: number, ps: number, py: number): number {
    const y0 = base;
    const y1 = base + o.h - HIT_SHRINK;
    const cy = Math.max(y0, Math.min(py, y1));
    if (o.kind === 'spinner') {
      const cx = (o.x0 + o.x1) / 2;
      const cs = (o.s0 + o.s1) / 2;
      const L = (o.x1 - o.x0) / 2 - HIT_SHRINK;
      const a = spinnerAngle(o, this.obsTime);
      const dx = px - cx;
      const ds = ps - cs;
      const u = dx * Math.cos(a) + ds * Math.sin(a);
      const v = -dx * Math.sin(a) + ds * Math.cos(a);
      const cu = Math.max(-L, Math.min(u, L));
      const cv = Math.max(-SPINNER_HALF_WIDTH, Math.min(v, SPINNER_HALF_WIDTH));
      return Math.sqrt((u - cu) ** 2 + (v - cv) ** 2 + (py - cy) ** 2);
    }
    const off = obstacleOffset(o, this.obsTime);
    const x0 = o.x0 + off + HIT_SHRINK;
    const x1 = o.x1 + off - HIT_SHRINK;
    const s0 = o.s0 + HIT_SHRINK;
    const s1 = o.s1 - HIT_SHRINK;
    const cx = Math.max(x0, Math.min(px, x1));
    const cs = Math.max(s0, Math.min(ps, s1));
    return Math.sqrt((px - cx) ** 2 + (ps - cs) ** 2 + (py - cy) ** 2);
  }

  private collides(): boolean {
    const a = this.prev;
    const b = this.ball;
    const dist = Math.hypot(b.x - a.x, b.s - a.s, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / (BALL_R * 0.5)));
    let hit = false;
    this.track.forObstacles(Math.min(a.s, b.s) - 2, b.s + 2, (o, seg) => {
      if (this.smashed.has(o)) return false;
      const base = floorHeight(seg, o.s0);
      let minC = Infinity;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const c = this.clearance(o, base, a.x + (b.x - a.x) * t, a.s + (b.s - a.s) * t, a.y + (b.y - a.y) * t);
        if (c < minC) minC = c;
        if (c < BALL_R) {
          if (this.ghostT > 0 || (this.carryKind === 'abduct' && this.carryT > 0)) return false; // atravessa
          if (this.dashT > 0 || this.shieldT > 0) {
            // esmaga o bloco (arrancada) ou o escudo absorve a batida
            this.smashed.add(o);
            this.lastSmashed = o;
            this.events.push({ type: 'smash', x: (o.x0 + o.x1) / 2, s: (o.s0 + o.s1) / 2, y: base + o.h / 2, o });
            if (this.dashT <= 0) {
              this.shieldT = 0;
              this.events.push({ type: 'shieldPop' });
            }
            return false;
          }
          hit = true;
          this.hitObstacle = o;
          return true;
        }
      }
      // passou raspando: só uma vez por obstáculo, depois de passar
      if (minC < BALL_R + 0.22 && b.s > o.s1 && !this.nearSeen.has(o)) {
        this.nearSeen.add(o);
        this.events.push({ type: 'nearMiss' });
      }
      return false;
    });
    return hit;
  }

  private die(cause: DeathCause): void {
    if (this.state !== 'running') return; // nunca dispara duas vezes
    this.state = 'dying';
    this.cause = cause;
    this.dyingT = 0;
    this.events.push({ type: cause === 'hit' ? 'hit' : 'fall' });
    if (cause === 'hit') {
      this.ball.vs = Math.min(this.ball.vs, 4);
    }
  }

  drainEvents(): SimEvent[] {
    return this.events.splice(0, this.events.length);
  }
}
