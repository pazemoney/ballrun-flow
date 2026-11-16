import { AudioEngine } from '../audio/audio';
import { DOWNLOADS, SITE_URL, SITE_LABEL, APP_VERSION, WHATSAPP_URL, INSTAGRAM_URL, INSTAGRAM_LABEL, GAME_URL, TIKTOK_URL, TIKTOK_LABEL } from '../config';
import { InputController } from '../core/input';
import { FixedLoop } from '../core/loop';
import { randomSeed } from '../core/rng';
import { StateMachine, type AppState } from '../core/state';
import {
  ACHIEVEMENTS, buy, DAILY_MODE, DAILY_TARGET, dailySeed, ensureDaily, finishRun, refreshOwnedCounts, skinUnlocked, startRun, todayKey, trailUnlocked,
  type FinishInfo, type RunResult,
} from '../game/meta';
import { bindNative, exitApp, isNative, openExternal, platformName, vibrate } from '../platform/platform';
import { GameRenderer } from '../render/scene';
import { CUSTOM_SKIN_ID, photoTexture, skinFromBall, skinTextures, type PhotoFit } from '../render/skins';
import { BALLS, TRAILS, findBall, findTrail, type Unlock } from '../game/catalog';
import { ABILITY_ICON } from '../sim/abilities';
import { ACH_BY_ID, ACH_GROUPS } from '../game/achievements';
import { particleTexture } from '../render/trails';
import { DEFAULT_FIT, decode, downscale, loadPhotoFile, PhotoError, PhotoPreview, renderSkinThumbs, sanitizeFit, toStored, type StoredPhoto } from './photo';
import { BOOM_FALL, BOOM_HIT, BOOM_JUMP, BOOM_NEAR, GAMEOVER, pick, RECORD_LINES } from './humor';
import { ZONES } from '../sim/zones';
import { MODE_PARAMS, MODES, type Mode } from '../sim/difficulty';
import { GameSim, type SimEvent } from '../sim/game';
import type { HintKind } from '../sim/types';
import { PHOTO_KEY, SaveStore, TUTORIAL_RUNS, type KV } from '../storage/save';
import { el, esc, fmtDist, fmtInt, fmtTime } from './dom';
import { ICON, faceSvg } from './icons';
import logoUrl from '../assets/logo-flow.jpg';
import brandUrl from '../assets/flow-group-branca.png';

const MODE_DESC: Record<Mode, string> = {
  facil: 'Para relaxar: pista larga e blocos sem pressa.',
  medio: 'Mais blocos, curvas e uns giradores animados.',
  dificil: 'Rápido, pistas finas e blocos de mau humor.',
  extremo: 'Para quem gosta de sofrer (com carinho).',
};

const HINT_TEXT: Record<HintKind | 'start' | 'startDesk', string> = {
  start: 'Deslize o dedo para os lados para mover a bola',
  startDesk: 'Arraste o mouse ou use ← → (A / D) para mover a bola',
  obstacle: 'Blocos à frente: desvie para o espaço livre',
  edge: 'Pista estreita: fique em cima, sem exagerar no movimento',
  boost: 'Faixa branca de setas: acelera e lança a bola sobre os vãos',
};

interface RunOpts {
  mode: Mode;
  daily: boolean;
  practice: boolean;
}

/** Orquestra estados, partida, interface, áudio e persistência. */
export class App {
  readonly sm = new StateMachine();
  readonly save: SaveStore;
  readonly audio = new AudioEngine();
  renderer: GameRenderer | null = null;
  input: InputController;
  sim: GameSim | null = null;
  private loop: FixedLoop;
  /** só no modo de desenvolvimento (?bot): o robô de teste joga para inspeção visual */
  autoplay: ((dt: number) => number) | null = null;
  private raf = 0;
  private lastT = 0;
  private menuMode: Mode = 'facil';
  private run: RunOpts = { mode: 'facil', daily: false, practice: false };
  private tutorialOn = false;
  private shownHints = new Set<string>();
  private recordAnnounced = false;
  private prevRecord = 0;
  private finishInfo: FinishInfo | null = null;
  private hintTimer = 0;
  private accelTimer = 0;
  private toastTimer = 0;
  private hudScore = -1;
  private modalBack: (() => void) | null = null;
  private lastAction = 0;
  private loadingEl: HTMLElement;
  private menuEl: HTMLElement;
  private hudEl: HTMLElement;
  private overlayEl: HTMLElement;
  private hintEl: HTMLElement;
  private accelEl: HTMLElement;
  private toastEl: HTMLElement;
  private fxEl: HTMLElement;
  private photo: HTMLCanvasElement | null = null;
  private photoFit: PhotoFit = { ...DEFAULT_FIT };
  private editPhoto: HTMLCanvasElement | null = null;
  private editFit: PhotoFit = { ...DEFAULT_FIT };
  private preview: PhotoPreview | null = null;
  private photoMsg = '';
  private nearMiss = 0;
  private lastNearFx = 0;
  private lastZone = -1;
  private gameoverLine = '';
  readonly root: HTMLElement;

  constructor(kv: KV, private readonly canvas: HTMLCanvasElement, touch: HTMLElement, root: HTMLElement) {
    this.root = root;
    this.save = new SaveStore(kv);
    this.input = new InputController(touch);
    this.loop = new FixedLoop(() => this.sim?.step());
    this.input.onPower = () => this.usePower();
    this.loadingEl = el('div', 'loading', `
      <img src="${logoUrl}" alt="Flow" width="180" height="180">
      <h1>BALL RUN</h1>
      <div class="bar"><i></i></div>
      <p data-msg>Carregando</p>
      <small class="madeby">Produzido pela Flow</small>`);
    this.fxEl = el('div', 'fx');
    this.fxEl.setAttribute('aria-hidden', 'true');
    this.menuEl = el('div', 'menu hidden');
    this.hudEl = el('div', 'hud hidden');
    this.overlayEl = el('div', 'overlay hidden');
    this.hintEl = el('div', 'hint hidden');
    this.accelEl = el('div', 'accel', 'Acelerar');
    this.toastEl = el('div', 'toast hidden');
    for (const e of [this.hudEl, this.hintEl, this.accelEl, this.fxEl, this.toastEl, this.menuEl, this.overlayEl, this.loadingEl]) root.appendChild(e);
    this.accelEl.setAttribute('aria-hidden', 'true');
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'file') this.onInput(e);
    });
    this.sm.on((to, from) => this.onState(to, from));
    (window as unknown as { __ballrun?: App }).__ballrun = this; // ganchos de teste (sem dados pessoais)
  }

  // ------------------------------------------------------------------ boot
  async boot(): Promise<void> {
    const bar = this.loadingEl.querySelector('.bar i') as HTMLElement;
    const msg = this.loadingEl.querySelector('[data-msg]') as HTMLElement;
    const stepTo = (p: number, t: string) => {
      bar.style.width = `${Math.round(p * 100)}%`;
      msg.textContent = t;
    };
    try {
      stepTo(0.1, 'Carregando progresso');
      await withTimeout(this.save.load(), 4000, 'progresso');
      this.applySettings();
      ensureDaily(this.save.data, todayKey());
      this.menuMode = this.save.data.lastMode;
      await withTimeout(this.loadPhoto(), 5000, 'foto').catch(() => undefined);
      stepTo(0.3, 'Carregando fontes');
      await withTimeout(loadFonts(), 5000, 'fontes').catch(() => undefined); // fonte reserva se falhar
      stepTo(0.5, 'Carregando imagens');
      await withTimeout(Promise.all([loadImage(logoUrl), loadImage(brandUrl)]), 6000, 'imagens');
      stepTo(0.7, 'Preparando a pista 3D');
      this.renderer = new GameRenderer(this.canvas);
      this.renderer.setQuality(this.save.data.settings.quality);
      this.renderer.reducedMotion = this.save.data.settings.reducedMotion;
      this.applySkin();
      this.applyTrail();
      this.renderer.palette = this.save.data.settings.palette;
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (this.sm.state === 'playing') this.pause();
      });
      // pista de fundo do menu e compilação dos shaders antes de jogar
      this.sim = new GameSim(this.menuMode, 12345);
      this.renderer.attach(this.sim);
      this.renderer.render(0, 0, 0);
      this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera);
      stepTo(1, 'Pronto');
      await sleep(250);
    } catch (e) {
      console.error('[boot]', e);
      const webgl = String(e).includes('WebGL') || !this.renderer;
      msg.textContent = webgl ? 'Este aparelho/navegador não conseguiu iniciar o 3D (WebGL). Atualize o navegador ou ative a aceleração gráfica.' : 'Falha ao carregar. Verifique a conexão e tente de novo.';
      const retry = el('button', 'btn ghost', 'Tentar de novo');
      retry.style.padding = '0 22px';
      retry.addEventListener('click', () => location.reload());
      this.loadingEl.appendChild(retry);
      return;
    }
    window.addEventListener('resize', () => this.renderer?.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer?.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onBackground();
      else this.onForeground();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') this.back();
      if ((e.key === 'Enter' || e.key === ' ') && this.sm.state === 'menu' && this.overlayEl.classList.contains('hidden')) {
        e.preventDefault();
        this.startGame({ mode: this.menuMode, daily: false, practice: false });
      }
    });
    await bindNative({ back: () => this.back(), background: () => this.onBackground(), foreground: () => this.onForeground() });
    this.sm.go('menu');
    // eslint-disable-next-line no-console
    console.info(`[ballrun] menu pronto (${platformName()}, ${location.protocol}//${location.host})`);
    this.loadingEl.classList.add('out');
    setTimeout(() => this.loadingEl.remove(), 600);
  }

  private applySettings(): void {
    const s = this.save.data.settings;
    this.audio.setVolume(s.volume);
    this.audio.sfx = s.sfx;
    this.audio.music = s.music;
    this.input.sensitivity = s.sensitivity;
  }

  private applySkin(): void {
    const d = this.save.data;
    if (d.skin === CUSTOM_SKIN_ID && this.photo) {
      this.renderer?.setBallTexture(photoTexture(this.photo, this.photoFit), null, { roughness: 0.32, metalness: 0.05, clearcoat: 1, bump: 0, trail: '#ffffff' });
      return;
    }
    const ball = findBall(d.skin);
    const def = ball && ball.id !== CUSTOM_SKIN_ID && skinUnlocked(d, ball.id) ? ball : (BALLS[0] as (typeof BALLS)[number]);
    this.renderer?.setSkin(skinFromBall(def), 512);
  }

  private applyTrail(): void {
    const d = this.save.data;
    const t = findTrail(d.trail);
    this.renderer?.setTrail(t && trailUnlocked(d, t.id) ? t : (TRAILS[0] as (typeof TRAILS)[number]));
  }

  /** Foto da bola guardada à parte (não pesa no salvamento principal). */
  private async loadPhoto(): Promise<void> {
    try {
      const raw = await this.save.kv.get(PHOTO_KEY);
      if (!raw) return;
      const st = JSON.parse(raw) as Partial<StoredPhoto>;
      if (typeof st.data !== 'string' || !st.data.startsWith('data:image/')) return;
      this.photo = downscale(await decode(st.data));
      this.photoFit = sanitizeFit(st.fit);
    } catch (e) {
      console.warn('[foto] não carregou', e);
      this.photo = null;
    }
  }

  // ------------------------------------------------------------------ estados
  private onState(to: AppState, from: AppState): void {
    this.menuEl.classList.toggle('hidden', to !== 'menu');
    this.hudEl.classList.toggle('hidden', to !== 'playing' && to !== 'paused');
    this.input.enabled = to === 'playing';
    if (to !== 'playing') this.input.reset();
    if (to === 'menu') {
      this.closeModal();
      this.renderMenu();
      // entrada animada do menu (só quando chega ao menu, não a cada troca de dificuldade)
      this.menuEl.classList.remove('enter');
      void this.menuEl.offsetWidth;
      this.menuEl.classList.add('enter');
      window.setTimeout(() => this.menuEl.classList.remove('enter'), 1400);
      this.audio.stopMusic();
      this.audio.setRoll(0, false);
      this.hideTransient();
      this.startRaf();
    }
    if (to === 'playing') {
      this.closeModal();
      this.loop.reset();
      this.lastT = performance.now();
      this.audio.resume();
      if (this.save.data.settings.music) this.audio.startMusic();
      this.startRaf();
    }
    if (to === 'paused') {
      this.audio.stopMusic();
      this.audio.setRoll(0, false);
      this.showPause();
    }
    if (to === 'gameover') {
      this.audio.stopMusic();
      this.audio.setRoll(0, false);
      this.hideTransient();
      this.showGameOver();
    }
    void from;
  }

  private startRaf(): void {
    cancelAnimationFrame(this.raf);
    this.lastT = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.1, Math.max(0, (t - this.lastT) / 1000));
      this.lastT = t;
      const st = this.sm.state;
      if (st === 'playing') this.frame(dt);
      else if (st === 'menu') this.menuFrame(dt);
      if (st === 'playing' || st === 'menu') this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private menuFrame(dt: number): void {
    this.renderer?.render(1, dt, 0);
  }

  /** Um quadro de jogo: entrada → física em passo fixo → eventos → desenho interpolado. */
  frame(dt: number): void {
    const sim = this.sim;
    const r = this.renderer;
    if (!sim || !r) return;
    if (sim.state === 'running') {
      const w = sim.track.gen.progress(sim.ball.s).width;
      this.input.unitsPerScreen = Math.max(5, w);
      sim.setTarget(this.input.consume(sim.targetX, sim.ball.x, dt));
    }
    const alpha = this.autoplay ? this.autoplay(dt) : this.loop.advance(dt * sim.timeScale);
    for (const ev of sim.drainEvents()) this.onSimEvent(ev);
    r.render(alpha, dt, this.groundH());
    if (r.zoneId !== this.lastZone && sim.state === 'running') {
      // novo ambiente: placa curta com o nome
      if (this.lastZone >= 0 || sim.distance < 5) this.zoneBanner(ZONES[r.zoneId]?.name ?? '');
      this.lastZone = r.zoneId;
    }
    this.audio.setRoll(sim.ball.vs, sim.ball.onGround && sim.state === 'running');
    this.updateHud();
    this.updatePower();
    if (this.tutorialOn && sim.ability && sim.time > 6 && sim.state === 'running' && !this.shownHints.has('power')) {
      this.shownHints.add('power');
      this.showHint(`Toque 2 vezes na tela: ${sim.ability.name}! ${sim.ability.desc}`, 4);
    }
    this.tickTransient(dt);
    if (sim.state === 'over') this.endRun();
  }

  private groundH(): number {
    const sim = this.sim;
    if (!sim) return 0;
    const f = sim.track.floorAt(sim.ball.x, sim.ball.s);
    return f ? f.h : sim.ball.y - 0.45;
  }

  // ------------------------------------------------------------------ partida
  startGame(opts: RunOpts): void {
    if (!this.renderer) return;
    const now = performance.now();
    if (now - this.lastAction < 350) return; // toque duplo não inicia duas partidas
    this.lastAction = now;
    const from = this.sm.state;
    if (from !== 'menu' && from !== 'gameover' && from !== 'paused' && from !== 'playing') return;
    this.audio.unlock();
    this.audio.click();
    ensureDaily(this.save.data, todayKey());
    const seed = opts.daily ? dailySeed(this.save.data.daily.date) : randomSeed();
    this.run = opts;
    const info = startRun(this.save.data, opts);
    void this.save.save();
    this.tutorialOn = info.tutorial;
    this.shownHints.clear();
    this.recordAnnounced = false;
    this.prevRecord = opts.daily ? this.save.data.daily.best : this.save.data.records[opts.mode];
    this.hudScore = -1;
    this.sim = new GameSim(opts.mode, seed, { avoidZones: opts.daily ? [] : this.save.data.recentZones });
    const firstZone = this.sim.track.gen.zoneHistory[0];
    if (!opts.daily && firstZone !== undefined) {
      this.save.data.recentZones = [...this.save.data.recentZones, firstZone].slice(-6);
      void this.save.save();
    }
    const ballDef = findBall(this.save.data.skin) ?? BALLS[0];
    this.sim.ability = ballDef ? ballDef.ability : null;
    this.renderer.attach(this.sim);
    this.nearMiss = 0;
    this.lastZone = -1;
    this.renderHud();
    this.hideTransient();
    if (info.tip) this.showHint(info.tip, 5);
    else if (this.tutorialOn) this.showHint(matchMedia('(pointer: fine)').matches ? HINT_TEXT.startDesk : HINT_TEXT.start, 4);
    if (this.sm.state !== 'playing') this.sm.go('playing');
    else this.onState('playing', 'playing');
    // eslint-disable-next-line no-console
    console.info(`[ballrun] partida iniciada (${opts.mode}${opts.daily ? ', desafio' : ''})`);
  }

  private onSimEvent(ev: SimEvent): void {
    this.renderer?.onEvent(ev);
    const haptics = this.save.data.settings.haptics;
    switch (ev.type) {
      case 'boost':
        this.audio.boost();
        this.accelEl.classList.add('on');
        this.accelTimer = 1.1;
        this.speedLines();
        if (this.tutorialOn && !this.shownHints.has('boost')) {
          this.shownHints.add('boost');
          this.showHint(HINT_TEXT.boost, 3);
        }
        break;
      case 'jump':
        this.audio.jump();
        if (Math.random() < 0.3) this.boom(pick(BOOM_JUMP), 'small');
        break;
      case 'level':
        this.audio.levelUp();
        this.levelBanner(ev.level);
        break;
      case 'nearMiss':
        this.nearMiss++;
        if (performance.now() - this.lastNearFx > 1500) {
          this.lastNearFx = performance.now();
          this.audio.nearMiss();
          this.boom(pick(BOOM_NEAR), 'small');
        }
        break;
      case 'land':
        this.audio.land(ev.impact);
        if (haptics && ev.impact > 6) void vibrate('light');
        break;
      case 'hit':
        this.audio.hit();
        this.boom(pick(BOOM_HIT), 'big');
        if (haptics) void vibrate('heavy');
        break;
      case 'fall':
        this.audio.fall();
        this.boom(pick(BOOM_FALL), 'big');
        if (haptics) void vibrate('heavy');
        break;
      case 'ability':
        this.audio.jump();
        this.boom(ev.shout, 'big');
        if (haptics) void vibrate('light');
        if (!this.shownHints.has('power-used')) this.shownHints.add('power-used');
        break;
      case 'smash':
        this.audio.hit();
        if (Math.random() < 0.5) this.boom(pick(['CRASH!', 'POW!', 'KABUM!', 'TOMA!']), 'small');
        if (haptics) void vibrate('light');
        break;
      case 'shieldPop':
        this.boom('PLOFT!', 'big');
        break;
      case 'hint':
        if (this.tutorialOn && !this.shownHints.has(ev.hint)) {
          this.shownHints.add(ev.hint);
          this.showHint(HINT_TEXT[ev.hint], 3.2);
        }
        break;
    }
  }

  private endRun(): void {
    const sim = this.sim;
    if (!sim || this.sm.state !== 'playing') return; // fim de partida só uma vez
    const res: RunResult = {
      mode: this.run.mode, daily: this.run.daily, practice: this.run.practice,
      score: sim.score, dist: sim.distance, time: sim.time, cause: sim.cause ?? 'hit', jumps: sim.jumps, boosts: sim.boosts, nearMiss: this.nearMiss,
      level: sim.level - sim.track.gen.levelBase, maxSpeed: sim.maxSpeed, zoneDist: [...sim.zoneDist],
    };
    this.finishInfo = finishRun(this.save.data, res);
    void this.save.save();
    this.gameoverLine = pick(GAMEOVER[res.cause]);
    if (this.finishInfo.newRecord && !this.run.practice) {
      this.audio.record();
      this.confetti(140);
    }
    this.sm.go('gameover');
  }

  pause(): void {
    if (this.sm.state !== 'playing') return;
    this.sm.go('paused');
  }

  resume(): void {
    if (this.sm.state !== 'paused') return;
    this.sm.go('playing');
  }

  quitToMenu(): void {
    if (this.sm.state === 'playing' || this.sm.state === 'paused' || this.sm.state === 'gameover') {
      // partida abandonada não grava pontuação (evita manipulação); fundo do menu volta para a pista do modo
      this.sm.go('menu');
      if (this.renderer) {
        this.sim = new GameSim(this.menuMode, 12345);
        this.renderer.attach(this.sim);
      }
    }
  }

  private back(): void {
    if (!this.overlayEl.classList.contains('hidden') && this.modalBack) {
      this.modalBack();
      return;
    }
    switch (this.sm.state) {
      case 'playing':
        this.pause();
        break;
      case 'paused':
        this.resume();
        break;
      case 'gameover':
        this.quitToMenu();
        break;
      case 'menu':
        void exitApp();
        break;
      default:
        break;
    }
  }

  private onBackground(): void {
    if (this.sm.state === 'playing') this.pause();
    this.audio.suspend();
  }

  private onForeground(): void {
    this.lastT = performance.now();
    this.loop.reset();
    if (this.sm.state === 'menu') this.audio.resume();
  }

  // ------------------------------------------------------------------ HUD
  private renderHud(): void {
    const label = this.run.practice ? 'TREINO' : this.run.daily ? 'DESAFIO' : `MODO ${MODE_PARAMS[this.run.mode].label}`;
    this.hudEl.innerHTML = `
      <button class="round" data-act="pause" aria-label="Pausar">${ICON.pause}</button>
      <div class="pill">
        <div class="box"><small>${esc(label)}</small><strong data-score>0</strong></div>
        <div class="box rec"><small>Recorde</small><strong data-rec>${fmtInt(this.prevRecord)}</strong></div>
      </div>
      <div class="box lvl"><small>Nível</small><strong data-level>${this.sim?.level ?? 0}</strong></div>
      ${this.sim?.ability ? `<button class="power" data-act="power" data-testid="power" aria-label="Poder: ${esc(this.sim.ability.name)} (toque duas vezes na tela)"><i style="--p:1"></i><span>${ABILITY_ICON[this.sim.ability.kind]}</span><small>${esc(this.sim.ability.name)}</small></button>` : ''}`;
    this.powerEl = this.hudEl.querySelector('.power');
    this.powerReady = true;
  }

  private powerEl: HTMLElement | null = null;
  private powerReady = true;

  /** Toque duplo / Espaço / botão: usa o poder da bola. */
  private usePower(): void {
    const sim = this.sim;
    if (!sim || this.sm.state !== 'playing' || this.autoplay) return;
    if (!sim.useAbility()) {
      if (sim.state === 'running' && sim.abilityCharge() < 1) this.powerEl?.classList.add('nope');
      window.setTimeout(() => this.powerEl?.classList.remove('nope'), 300);
    }
  }

  private updatePower(): void {
    const sim = this.sim;
    if (!sim || !this.powerEl) return;
    const c = sim.abilityCharge();
    (this.powerEl.firstElementChild as HTMLElement).style.setProperty('--p', c.toFixed(3));
    const ready = c >= 1;
    if (ready !== this.powerReady) {
      this.powerReady = ready;
      this.powerEl.classList.toggle('ready', ready);
      if (ready && sim.state === 'running') this.audio.click();
    }
    this.powerEl.classList.toggle('active', sim.dashT > 0 || sim.ghostT > 0 || sim.shieldT > 0 || sim.slowT > 0 || sim.freezeT > 0 || sim.glideT > 0 || sim.carryT > 0);
  }

  private updateHud(): void {
    const sim = this.sim;
    if (!sim) return;
    const sc = sim.score;
    if (sc === this.hudScore) return;
    this.hudScore = sc;
    const s = this.hudEl.querySelector('[data-score]');
    if (s) s.textContent = fmtInt(sc);
    if (!this.run.practice && sc > this.prevRecord) {
      const r = this.hudEl.querySelector('[data-rec]');
      if (r) r.textContent = fmtInt(sc);
      if (!this.recordAnnounced && this.prevRecord > 0) {
        this.recordAnnounced = true;
        this.showToast(pick(RECORD_LINES));
        this.audio.record();
        this.confetti(60);
      }
    }
  }

  /** Onomatopeia de desenho animado na posição da bola. */
  private boom(text: string, size: 'big' | 'small'): void {
    if (!this.renderer || this.fxEl.childElementCount > 5) return;
    const p = this.renderer.ballScreen();
    const b = el('div', `boom ${size}`);
    b.textContent = text;
    b.style.left = `${Math.round(p.x)}px`;
    b.style.top = `${Math.round(p.y - (size === 'big' ? 70 : 50))}px`;
    b.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 18)}deg`);
    this.fxEl.appendChild(b);
    window.setTimeout(() => b.remove(), size === 'big' ? 1300 : 900);
  }

  /** Linhas de velocidade + flash quando passa no acelerador. */
  private speedLines(): void {
    if (this.fxEl.querySelector('.speedlines')) return;
    const d = el('div', 'speedlines');
    const color = this.renderer ? `#${this.renderer.theme.pad.getHexString()}` : '#ffffff';
    d.style.setProperty('--sl', color);
    if (this.save.data.settings.reducedMotion) d.classList.add('calm');
    this.fxEl.appendChild(d);
    window.setTimeout(() => d.remove(), 900);
  }

  private levelBanner(level: number): void {
    const b = el('div', 'levelup');
    b.innerHTML = `<small>Acelerador</small><b>NÍVEL ${level}</b>`;
    this.fxEl.appendChild(b);
    window.setTimeout(() => b.remove(), 1800);
    const lv = this.hudEl.querySelector('[data-level]');
    if (lv) lv.textContent = String(level);
  }

  private zoneBanner(name: string): void {
    if (!name) return;
    const b = el('div', 'zone');
    b.innerHTML = `<small>Bem-vindo ao</small><b>${esc(name)}</b>`;
    this.fxEl.appendChild(b);
    window.setTimeout(() => b.remove(), 2600);
  }

  /** Confete em preto, branco e cinza (comemora recorde). */
  confetti(n: number): void {
    if (this.save.data.settings.reducedMotion) n = Math.min(n, 20);
    const c = el('canvas', 'confetti') as HTMLCanvasElement;
    const w = (c.width = window.innerWidth);
    const h = (c.height = window.innerHeight);
    this.fxEl.appendChild(c);
    const g = c.getContext('2d');
    if (!g) {
      c.remove();
      return;
    }
    const shades = ['#ffffff', '#d6d6da', '#9a9aa0', '#5c5c62', '#ffffff'];
    const parts = Array.from({ length: n }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35, vx: (Math.random() - 0.5) * 9, vy: -6 - Math.random() * 9,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, s: 5 + Math.random() * 7, c: shades[Math.floor(Math.random() * shades.length)] ?? '#fff',
    }));
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = (t - t0) / 1000;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.r);
        g.globalAlpha = Math.max(0, 1 - k / 2.4);
        g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
      if (k < 2.4) requestAnimationFrame(tick);
      else c.remove();
    };
    requestAnimationFrame(tick);
  }

  private showHint(text: string, sec: number): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = sec;
  }

  private showToast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = 2;
  }

  private tickTransient(dt: number): void {
    if (this.hintTimer > 0 && (this.hintTimer -= dt) <= 0) this.hintEl.classList.add('hidden');
    if (this.accelTimer > 0 && (this.accelTimer -= dt) <= 0) this.accelEl.classList.remove('on');
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.classList.add('hidden');
  }

  private hideTransient(): void {
    this.hintTimer = this.accelTimer = this.toastTimer = 0;
    this.hintEl.classList.add('hidden');
    this.accelEl.classList.remove('on');
    this.toastEl.classList.add('hidden');
  }

  // ------------------------------------------------------------------ menu
  renderMenu(): void {
    const d = this.save.data;
    const m = this.menuMode;
    const p = MODE_PARAMS[m];
    const idx = MODES.indexOf(m);
    ensureDaily(d, todayKey());
    const unlockedCount = d.achievements.length;
    const dl = `<button data-act="downloads" data-testid="downloads">Onde jogar</button>`;
    const ballName = d.skin === CUSTOM_SKIN_ID && this.photo ? 'Minha foto' : (findBall(d.skin)?.name ?? 'Xadrez Flow');
    this.menuEl.innerHTML = `
      <div class="menu-inner">
        <div class="topbar">
          <img class="brand" src="${brandUrl}" alt="Flow Group" width="50" height="34">
          <div class="icons">
            <button class="icon-btn" data-act="records" aria-label="Recordes">${ICON.trophy}</button>
            <button class="icon-btn" data-act="settings" aria-label="Configurações">${ICON.gear}</button>
            <button class="icon-btn" data-act="help" aria-label="Ajuda">${ICON.help}</button>
          </div>
        </div>
        <div class="title">
          <h1>BALL RUN</h1>
          <div class="by">Produzido pela Flow</div>
          <p>Deslize o dedo para os lados, desvie dos blocos (alguns têm cara de poucos amigos) e role o máximo que conseguir.</p>
        </div>
        <div class="card diff" style="--c:${p.shade}">
          <div class="diff-row">
            <button class="diff-arrow" data-act="prev" aria-label="Dificuldade anterior" ${idx === 0 ? 'disabled' : ''}>‹</button>
            ${faceSvg(m, p.shade)}
            <button class="diff-arrow" data-act="next" aria-label="Próxima dificuldade" ${idx === MODES.length - 1 ? 'disabled' : ''}>›</button>
          </div>
          <div class="diff-name" style="color:${p.shade}">${p.label}</div>
          <div class="diff-desc">${MODE_DESC[m]}</div>
          <div class="slider" role="radiogroup" aria-label="Dificuldade">
            ${MODES.map((k) => `<button data-act="mode" data-mode="${k}" style="--c:${MODE_PARAMS[k].shade}" aria-pressed="${k === m}" aria-label="${MODE_PARAMS[k].label}">${MODE_PARAMS[k].label}</button>`).join('')}
          </div>
          <div class="diff-rec">Recorde: <b data-testid="menu-record">${fmtInt(d.records[m])}</b> · ${fmtDist(d.bestDist[m])} · ${fmtTime(d.bestTime[m])}</div>
        </div>
        <button class="play" data-act="play" data-testid="play">JOGAR</button>
        <div class="row">
          <button class="tile" data-act="ball" data-testid="ball-tile"><b>Loja e bola</b><span>${ICON.coin} ${fmtInt(d.coins)} · ${esc(ballName)}</span></button>
          <button class="tile" data-act="daily"><b>Desafio do dia</b><span>${d.daily.completed ? 'Concluído ✓' : `Meta ${DAILY_TARGET} pts`} · melhor ${fmtInt(d.daily.best)}</span></button>
        </div>
        <div class="row">
          <button class="tile" data-act="achievements"><b>Conquistas</b><span>${unlockedCount}/${ACHIEVEMENTS.length}</span></button>
          <button class="tile" data-act="records"><b>Recordes</b><span>pontos, distância e tempo</span></button>
        </div>
        <div class="links">
          <button data-act="site" data-testid="link-site">${ICON.globe}<span>${SITE_LABEL}</span></button>
          <button data-act="insta" data-testid="link-insta">${ICON.insta}<span>${INSTAGRAM_LABEL}</span></button>
          <button data-act="tiktok" data-testid="link-tiktok">${ICON.tiktok}<span>TikTok</span></button>
        </div>
        <div class="footer">
          <span>Produzido pela Flow</span>
          <button data-act="credits">Créditos</button>
          ${dl}
          <span>v${APP_VERSION}</span>
        </div>
      </div>`;
  }

  // ------------------------------------------------------------------ modais
  private openModal(html: string, onBack: () => void): void {
    this.overlayEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    this.overlayEl.classList.remove('hidden');
    this.modalBack = onBack;
    const sheet = this.overlayEl.querySelector('.sheet') as HTMLElement | null;
    sheet?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  private closeModal(): void {
    this.disposePreview();
    this.overlayEl.classList.add('hidden');
    this.overlayEl.innerHTML = '';
    this.modalBack = null;
  }

  private showPause(): void {
    const s = this.save.data.settings;
    this.openModal(`
      <h2>PAUSA</h2>
      <div class="btns">
        <button class="btn" data-act="resume" data-testid="resume">CONTINUAR</button>
        <button class="btn ghost" data-act="restart" data-testid="restart">Reiniciar</button>
        <button class="btn ghost" data-act="menu" data-testid="to-menu">Voltar ao menu</button>
      </div>
      <div class="set"><span>Efeitos sonoros</span><button class="switch" role="switch" aria-label="Efeitos sonoros" data-act="toggle" data-key="sfx" aria-checked="${s.sfx}"></button></div>
      <div class="set"><span>Música</span><button class="switch" role="switch" aria-label="Música" data-act="toggle" data-key="music" aria-checked="${s.music}"></button></div>
      <p class="small">Reiniciar ou sair encerra esta partida sem salvar a pontuação.</p>`, () => this.resume());
  }

  private showGameOver(): void {
    const sim = this.sim;
    const f = this.finishInfo;
    if (!sim || !f) return;
    const label = this.run.practice ? 'TREINO' : this.run.daily ? 'DESAFIO DO DIA' : MODE_PARAMS[this.run.mode].label;
    const unlocked = f.unlocked.length
      ? `<h3>Conquista${f.unlocked.length > 1 ? 's' : ''} nova${f.unlocked.length > 1 ? 's' : ''} (${f.unlocked.length})</h3><div class="list">${f.unlocked.slice(0, 4).map((a) => `<div class="li"><b>${esc(a.name)}</b><span>${esc(a.desc)} · +${a.reward}</span></div>`).join('')}${f.unlocked.length > 4 ? `<p class="small">e mais ${f.unlocked.length - 4}…</p>` : ''}</div>`
      : '';
    const daily = this.run.daily ? `<p class="small">${f.dailyCompleted ? 'Desafio do dia concluído! Bola Mármore liberada.' : `Meta do desafio: ${DAILY_TARGET} pontos.`}</p>` : '';
    const badges = this.run.practice ? '' : [f.newRecord ? 'NOVO RECORDE' : '', f.newDist ? 'MAIS LONGE' : '', f.newTime ? 'MAIS TEMPO' : ''].filter(Boolean).map((b) => `<span class="badge">${b}</span>`).join('');
    const m = this.run.mode;
    this.openModal(`
      <h2>FIM DE PARTIDA</h2>
      <p class="quip" data-testid="quip">${esc(this.gameoverLine)}</p>
      <div class="score-big" data-testid="final-score">${fmtInt(sim.score)}</div>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      <div class="stats">
        <div class="stat"><small>Recorde</small><b>${this.run.practice ? '—' : fmtInt(f.record)}</b></div>
        <div class="stat"><small>Modo</small><b>${esc(label)}</b></div>
        <div class="stat"><small>Distância</small><b>${fmtDist(sim.distance)}</b><em>melhor ${fmtDist(this.save.data.bestDist[m])}</em></div>
        <div class="stat"><small>Tempo</small><b>${fmtTime(sim.time)}</b><em>melhor ${fmtTime(this.save.data.bestTime[m])}</em></div>
      </div>
      ${daily}
      ${this.run.practice ? '' : `<div class="earned" data-testid="coins-earned">${ICON.coin}<b>+${f.coinsRun + f.coinsAch}</b><span>moedas (${f.coinsRun} da partida${f.coinsAch ? ` · ${f.coinsAch} de conquistas` : ''}) · nível ${sim.level}</span></div>`}
      ${unlocked}
      <div class="btns two">
        <button class="btn ghost" data-act="menu" aria-label="Menu" data-testid="go-menu">${ICON.home}</button>
        <button class="btn" data-act="again" data-testid="again">JOGAR NOVAMENTE</button>
      </div>`, () => this.quitToMenu());
  }

  private showRecords(): void {
    const d = this.save.data;
    const st = d.stats;
    const hist = [...d.history].reverse().slice(0, 12);
    this.openModal(`
      <h2>RECORDES</h2>
      <div class="rtable">
        <div class="rrow head"><span>Modo</span><span>Pontos</span><span>Distância</span><span>Tempo</span></div>
        ${MODES.map((m) => `<div class="rrow"><b>${MODE_PARAMS[m].label}</b><b data-testid="rec-${m}">${fmtInt(d.records[m])}</b><span data-testid="dist-${m}">${fmtDist(d.bestDist[m])}</span><span data-testid="time-${m}">${fmtTime(d.bestTime[m])}</span></div>`).join('')}
        <div class="rrow"><b>DESAFIO</b><b>${fmtInt(d.daily.best)}</b><span>—</span><span>—</span></div>
      </div>
      <h3>Estatísticas</h3>
      <div class="stats">
        <div class="stat"><small>Partidas</small><b>${fmtInt(st.games)}</b></div>
        <div class="stat"><small>Distância total</small><b>${fmtDist(st.distance)}</b></div>
        <div class="stat"><small>Tempo jogado</small><b>${fmtTime(st.time)}</b></div>
        <div class="stat"><small>Saltos</small><b>${fmtInt(st.jumps)}</b></div>
        <div class="stat"><small>Batidas</small><b>${fmtInt(st.hits)}</b></div>
        <div class="stat"><small>Quedas</small><b>${fmtInt(st.falls)}</b></div>
        <div class="stat"><small>Por um triz</small><b>${fmtInt(st.nearMiss)}</b></div>
        <div class="stat"><small>Conquistas</small><b>${d.achievements.length}/${ACHIEVEMENTS.length}</b></div>
      </div>
      <h3>Últimas partidas</h3>
      <div class="list">${hist.length ? hist.map((h) => `<div class="li"><span>${new Date(h.date).toLocaleDateString('pt-BR')} · ${h.mode === 'diario' ? 'Desafio' : MODE_PARAMS[h.mode].label} · ${fmtDist(h.dist)} · ${fmtTime(h.time)}</span><b>${fmtInt(h.score)}</b></div>`).join('') : '<p class="small">Nenhuma partida ainda.</p>'}</div>
      <p class="small">Salvos neste aparelho (com cópia de segurança). Reiniciar uma partida nunca apaga recordes.</p>
      <button class="btn" data-act="close">FECHAR</button>`, () => this.closeModal());
  }

  private showSettings(): void {
    const s = this.save.data.settings;
    const seg = (key: string, opts: [string, string][], cur: string) =>
      `<div class="seg">${opts.map(([v, l]) => `<button data-act="setopt" data-key="${key}" data-val="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
    this.openModal(`
      <h2>AJUSTES</h2>
      <div class="set"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-key="volume" aria-label="Volume"></div>
      <div class="set"><span>Efeitos sonoros</span><button class="switch" role="switch" aria-label="Efeitos sonoros" data-act="toggle" data-key="sfx" aria-checked="${s.sfx}"></button></div>
      <div class="set"><span>Música</span><button class="switch" role="switch" aria-label="Música" data-act="toggle" data-key="music" aria-checked="${s.music}"></button></div>
      <div class="set"><span>Vibração</span><button class="switch" role="switch" aria-label="Vibração" data-act="toggle" data-key="haptics" aria-checked="${s.haptics}"></button></div>
      <div class="set"><span>Sensibilidade</span><input type="range" min="0.6" max="1.6" step="0.05" value="${s.sensitivity}" data-key="sensitivity" aria-label="Sensibilidade"></div>
      <div class="set"><span>Gráficos</span>${seg('quality', [['auto', 'Auto'], ['alta', 'Alta'], ['baixa', 'Leve']], s.quality)}</div>
      <div class="set"><span>Cores do cenário</span>${seg('palette', [['vivo', 'Mudam a cada km'], ['flow', 'Flow P&B']], s.palette)}</div>
      <div class="set"><span>Reduzir movimento</span><button class="switch" role="switch" aria-label="Reduzir movimento" data-act="toggle" data-key="reducedMotion" aria-checked="${s.reducedMotion}"></button></div>
      <button class="btn" data-act="close">FECHAR</button>
      <button class="btn danger" data-act="reset">Apagar progresso</button>`, () => this.closeModal());
  }

  private showHelp(): void {
    this.openModal(`
      <h2>COMO JOGAR</h2>
      <div class="steps">
        <div class="step"><div class="ico">↔</div><p><b>Deslize</b> o dedo para os lados (no computador: mouse ou ← → / A D). A bola segue o movimento, sem precisar tocar nela.</p></div>
        <div class="step"><div class="ico">■</div><p><b>Desvie</b> dos blocos escuros de borda branca. Alguns olham para você. Não leve para o lado pessoal.</p></div>
        <div class="step"><div class="ico">⟳</div><p><b>Giradores, vai-e-vem e blocos que brotam do chão</b> sempre deixam uma passagem. Sempre.</p></div>
        <div class="step"><div class="ico">»</div><p><b>Faixas de setas</b> aceleram ("Acelerar") e lançam a bola sobre os vãos.</p></div>
        <div class="step"><div class="ico">★</div><p><b>Pontos:</b> 1 a cada 5 m. A velocidade sobe devagar e nunca para de subir. Até onde você vai?</p></div>
      </div>
      <button class="btn" data-act="practice">TREINO GUIADO</button>
      <p class="small">O treino guiado usa o modo FÁCIL com dicas e não vale recorde.</p>
      <button class="btn ghost" data-act="close">Fechar</button>`, () => this.closeModal());
  }

  private thumbs = new Map<string, string>();
  private thumbQueue: string[] = [];
  private thumbBusy = false;
  /** Miniatura 3D da bola; se ainda não existe, entra na fila e aparece assim que ficar pronta. */
  private ballThumb(id: string): string {
    const t = this.thumbs.get(id);
    if (t) return t;
    if (!this.thumbQueue.includes(id)) this.thumbQueue.push(id);
    if (!this.thumbBusy) {
      this.thumbBusy = true;
      window.setTimeout(() => this.thumbStep(), 30);
    }
    return '';
  }

  private thumbStep(): void {
    const ids = this.thumbQueue.splice(0, 6);
    if (!ids.length) {
      this.thumbBusy = false;
      return;
    }
    const items = ids.map((bid) => findBall(bid)).filter((b): b is NonNullable<typeof b> => !!b).map((b) => {
      const sk = skinFromBall(b);
      return { id: b.id, ...skinTextures(sk, 128), look: sk };
    });
    for (const [k, v] of renderSkinThumbs(items, 96)) {
      this.thumbs.set(k, v);
      const el2 = this.overlayEl.querySelector<HTMLElement>(`[data-thumb="${k}"]`);
      if (el2) el2.style.backgroundImage = `url(${v})`;
    }
    for (const it of items) {
      it.map.dispose();
      it.bump?.dispose();
    }
    window.setTimeout(() => this.thumbStep(), 16);
  }

  private trailThumbs = new Map<string, string>();
  private trailThumb(id: string): string {
    const cached = this.trailThumbs.get(id);
    if (cached) return cached;
    const t = findTrail(id);
    const c = document.createElement('canvas');
    c.width = c.height = 112;
    const g = c.getContext('2d');
    if (!t || !g) return '';
    const col = t.shade === 'accent' ? '#ff3fd8' : t.shade === 'gray' ? '#8a8a90' : t.shade === 'light' ? '#cfcfd4' : '#ffffff';
    g.fillStyle = '#2a2a2f';
    g.fillRect(0, 0, 112, 112);
    g.strokeStyle = col;
    g.lineCap = 'round';
    const w = t.ribbon === 'wide' ? 22 : t.ribbon === 'none' ? 0 : 6;
    if (w) {
      g.lineWidth = w;
      g.globalAlpha = t.ribbon === 'wide' ? 0.5 : 0.9;
      if (t.ribbon === 'dash') g.setLineDash([10, 10]);
      const offs = t.ribbon === 'double' ? [-14, 14] : [0];
      for (const o of offs) {
        g.beginPath();
        for (let y = 112; y >= 30; y -= 6) {
          const x = 56 + o + (t.ribbon === 'zigzag' ? ((y / 6) % 2 ? 8 : -8) : 0);
          if (y === 112) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    if (t.particle !== 'none') {
      const img = (particleTexture(t.particle).image as HTMLCanvasElement);
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 64;
      const tg = tmp.getContext('2d');
      if (tg) {
        tg.drawImage(img, 0, 0);
        tg.globalCompositeOperation = 'source-in';
        tg.fillStyle = col;
        tg.fillRect(0, 0, 64, 64);
      }
      for (const [x, y, s2] of [[36, 40, 22], [74, 28, 18], [60, 64, 26], [40, 84, 16], [78, 78, 20]] as const) g.drawImage(tmp, x - s2 / 2, y - s2 / 2, s2, s2);
    }
    // bola
    const grd = g.createRadialGradient(50, 92, 2, 56, 98, 18);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#55555b');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(56, 98, 14, 0, Math.PI * 2);
    g.fill();
    const url = c.toDataURL('image/png');
    this.trailThumbs.set(id, url);
    return url;
  }

  private unlockLabel(u: Unlock): string {
    if (u.kind === 'coins') return `${ICON.coin} ${u.price}`;
    if (u.kind === 'ach') return `${ICON.lock} ${esc(ACH_BY_ID.get(u.id)?.name ?? 'Conquista')}`;
    return '';
  }

  private shopTab: 'bolas' | 'rastros' = 'bolas';

  /** Loja e personalização: bolas, rastros e foto do jogador. */
  private showBall(): void {
    const d = this.save.data;
    refreshOwnedCounts(d);
    const hasPhoto = !!this.photo;
    this.disposePreview();
    this.editPhoto = this.photo;
    this.editFit = { ...this.photoFit };
    const photoUrl = this.photo ? this.photo.toDataURL('image/jpeg', 0.7) : '';
    const tabs = `<div class="seg tabs"><button data-act="shoptab" data-tab="bolas" aria-pressed="${this.shopTab === 'bolas'}">Bolas · ${d.stats.ownedBalls}/${BALLS.length}</button><button data-act="shoptab" data-tab="rastros" aria-pressed="${this.shopTab === 'rastros'}" data-testid="tab-rastros">Rastros · ${d.stats.ownedTrails}/${TRAILS.length}</button></div>`;
    let grid: string;
    if (this.shopTab === 'bolas') {
      grid = BALLS.map((b) => {
        if (b.id === CUSTOM_SKIN_ID) {
          return `<button class="skin" data-act="${hasPhoto ? 'skin' : 'photo-edit'}" data-skin="${CUSTOM_SKIN_ID}" aria-pressed="${d.skin === CUSTOM_SKIN_ID && hasPhoto}" data-testid="skin-photo">
            <i style="${hasPhoto ? `background-image:url(${photoUrl})` : ''}" class="${hasPhoto ? 'flat' : 'plus'}">${hasPhoto ? '' : '+'}</i>Minha foto<em class="ab">${ABILITY_ICON[b.ability.kind]} ${esc(b.ability.name)}</em><small>${hasPhoto ? (d.skin === CUSTOM_SKIN_ID ? 'Em uso' : 'Usar') : 'Escolher imagem'}</small></button>`;
        }
        const ok = skinUnlocked(d, b.id);
        return `<button class="skin ${ok ? '' : 'locked'}" data-act="skin" data-skin="${b.id}" aria-pressed="${d.skin === b.id}" data-testid="ball-${b.id}">
          <i data-thumb="${b.id}" style="${(() => { const u = this.ballThumb(b.id); return u ? `background-image:url(${u})` : ''; })()}"></i>${esc(b.name)}<em class="ab">${ABILITY_ICON[b.ability.kind]} ${esc(b.ability.name)}</em><small>${ok ? (d.skin === b.id ? 'Em uso' : 'Usar') : this.unlockLabel(b.unlock)}</small></button>`;
      }).join('');
    } else {
      grid = TRAILS.map((t) => {
        const ok = trailUnlocked(d, t.id);
        return `<button class="skin ${ok ? '' : 'locked'}" data-act="trail" data-trail="${t.id}" aria-pressed="${d.trail === t.id}" data-testid="trail-${t.id}">
          <i class="flat sq" style="background-image:url(${this.trailThumb(t.id)})"></i>${esc(t.name)}<small>${ok ? (d.trail === t.id ? 'Em uso' : 'Usar') : this.unlockLabel(t.unlock)}</small></button>`;
      }).join('');
    }
    this.openModal(`
      <h2>LOJA</h2>
      <div class="wallet" data-testid="wallet">${ICON.coin}<b>${fmtInt(d.coins)}</b><span>moedas · ganhe jogando e com conquistas</span></div>
      ${tabs}
      ${this.shopTab === 'bolas' ? (() => { const cur = findBall(d.skin) ?? BALLS[0]; return cur ? `<div class="power-info" data-testid="power-info"><b>${ABILITY_ICON[cur.ability.kind]} ${esc(cur.ability.name)}</b><span>${esc(cur.ability.desc)} Toque 2 vezes na tela (no computador: Espaço). Cada bola tem um poder diferente.</span></div>` : ''; })() : ''}
      <div class="skins">${grid}</div>
      ${hasPhoto && this.shopTab === 'bolas' ? '<button class="btn ghost" data-act="photo-edit" data-testid="photo-edit">Ajustar ou trocar minha foto</button>' : ''}
      <button class="btn" data-act="close">FECHAR</button>`, () => this.closeModal());
  }

  /** Tenta comprar; devolve true se comprou. */
  private tryBuy(id: string): boolean {
    const d = this.save.data;
    const item = findBall(id) ?? findTrail(id);
    if (!item) return false;
    if (item.unlock.kind === 'ach') {
      this.showToast(`Desbloqueia com a conquista "${ACH_BY_ID.get(item.unlock.id)?.name ?? ''}": ${ACH_BY_ID.get(item.unlock.id)?.desc ?? ''}`);
      this.startToastClock();
      return false;
    }
    const r = buy(d, id);
    if (!r.ok) {
      if (r.reason === 'sem-moedas' && item.unlock.kind === 'coins') this.showToast(`Faltam ${item.unlock.price - d.coins} moedas`);
      this.startToastClock();
      return false;
    }
    void this.save.save();
    this.audio.record();
    this.showToast(`Comprou: ${item.name}!`);
    this.startToastClock();
    return true;
  }

  /** Editor da foto: escolher, pré-visualizar em 3D, enquadrar, zoom, P&B, remover. */
  private showPhotoEditor(): void {
    this.disposePreview();
    const f = this.editFit;
    const has = !!this.editPhoto;
    this.openModal(`
      <h2>MINHA FOTO</h2>
      <div class="pv"><canvas class="pv-canvas" width="220" height="220" data-testid="photo-preview"></canvas>${has ? '' : '<p class="small">Escolha uma imagem da galeria ou do computador. Ela envolve a bola inteira.</p>'}</div>
      <p class="photo-msg" role="alert" data-testid="photo-msg">${esc(this.photoMsg)}</p>
      <label class="btn ghost file">${has ? 'Trocar imagem' : 'Escolher imagem'}<input type="file" accept="image/*" data-key="photo-file" data-testid="photo-file"></label>
      ${has ? `
      <div class="set"><span>Zoom</span><input type="range" min="1" max="4" step="0.05" value="${f.zoom}" data-key="photo-zoom" aria-label="Zoom"></div>
      <div class="set"><span>Girar</span><input type="range" min="0" max="1" step="0.01" value="${f.offsetX}" data-key="photo-x" aria-label="Posição horizontal"></div>
      <div class="set"><span>Altura</span><input type="range" min="-0.5" max="0.5" step="0.01" value="${f.offsetY}" data-key="photo-y" aria-label="Posição vertical"></div>
      <div class="set"><span>Preto e branco</span><button class="switch" role="switch" aria-label="Preto e branco" data-act="photo-gray" aria-checked="${f.gray}"></button></div>
      <button class="btn" data-act="photo-use" data-testid="photo-use">USAR NA BOLA</button>
      <button class="btn danger" data-act="photo-remove" data-testid="photo-remove">Remover foto</button>` : ''}
      <button class="btn ghost" data-act="ball">Voltar</button>`, () => this.showBall());
    const cv = this.overlayEl.querySelector('.pv-canvas') as HTMLCanvasElement | null;
    if (cv) {
      try {
        this.preview = new PhotoPreview(cv);
        this.preview.update(this.editPhoto, this.editFit);
      } catch (e) {
        console.warn('[foto] prévia indisponível', e);
      }
    }
  }

  private disposePreview(): void {
    this.preview?.dispose();
    this.preview = null;
  }

  private async onPhotoFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoMsg = 'Abrindo imagem…';
    const msg = this.overlayEl.querySelector('.photo-msg');
    if (msg) msg.textContent = this.photoMsg;
    try {
      this.editPhoto = await loadPhotoFile(file);
      this.editFit = { ...DEFAULT_FIT };
      this.photoMsg = 'Pronto! Ajuste e toque em USAR NA BOLA.';
    } catch (e) {
      this.photoMsg = e instanceof PhotoError ? e.message : 'Não consegui abrir essa imagem. Tente outra.';
    }
    if (this.overlayEl.querySelector('.pv-canvas')) this.showPhotoEditor();
  }

  private async usePhoto(): Promise<void> {
    if (!this.editPhoto) return;
    try {
      await this.save.kv.set(PHOTO_KEY, JSON.stringify(toStored(this.editPhoto, this.editFit)));
      this.photo = this.editPhoto;
      this.photoFit = { ...this.editFit };
      this.save.data.skin = CUSTOM_SKIN_ID;
      this.save.data.stats.photoUsed = true;
      await this.save.save();
      this.applySkin();
      this.photoMsg = '';
      this.disposePreview();
      this.showBall();
    } catch (e) {
      console.warn('[foto] não salvou', e);
      this.photoMsg = 'Não consegui salvar a foto neste aparelho (espaço cheio?).';
      this.showPhotoEditor();
    }
  }

  private async removePhoto(): Promise<void> {
    await this.save.kv.set(PHOTO_KEY, '');
    this.photo = null;
    this.editPhoto = null;
    this.photoFit = { ...DEFAULT_FIT };
    if (this.save.data.skin === CUSTOM_SKIN_ID) this.save.data.skin = 'xadrez';
    await this.save.save();
    this.applySkin();
    this.photoMsg = 'Foto removida.';
    this.showPhotoEditor();
  }

  private achGroup = ACH_GROUPS[0] ?? 'Pontos';
  private showAchievements(): void {
    const d = this.save.data;
    const have = new Set(d.achievements);
    const chips = ACH_GROUPS.map((g) => {
      const total = ACHIEVEMENTS.filter((a) => a.group === g);
      const done = total.filter((a) => have.has(a.id)).length;
      return `<button data-act="achgroup" data-g="${esc(g)}" aria-pressed="${g === this.achGroup}">${esc(g)} ${done}/${total.length}</button>`;
    }).join('');
    const items = ACHIEVEMENTS.filter((a) => a.group === this.achGroup).map((a) => {
      const ok = have.has(a.id);
      const v = Math.min(a.target, a.metric(d));
      const pct = Math.round((v / a.target) * 100);
      return `<div class="ach ${ok ? 'done' : ''}"><div><b>${ok ? '✓ ' : ''}${esc(a.name)}</b><span>${esc(a.desc)}</span>${ok ? '' : `<i style="--p:${pct}%"></i>`}</div><em>+${a.reward}</em></div>`;
    }).join('');
    this.openModal(`
      <h2>CONQUISTAS</h2>
      <p class="small" data-testid="ach-count">${have.size} de ${ACHIEVEMENTS.length} · cada uma dá moedas</p>
      <div class="chips">${chips}</div>
      <div class="list">${items}</div>
      <button class="btn" data-act="close">FECHAR</button>`, () => this.closeModal());
  }

  private showDaily(): void {
    const d = this.save.data;
    ensureDaily(d, todayKey());
    this.openModal(`
      <h2>DESAFIO DO DIA</h2>
      <p>A mesma pista para todo o dia de hoje (${new Date().toLocaleDateString('pt-BR')}), no modo ${MODE_PARAMS[DAILY_MODE].label}. Faça <b>${DAILY_TARGET} pontos</b> para concluir e liberar a bola Mármore.</p>
      <div class="stats">
        <div class="stat"><small>Melhor hoje</small><b>${fmtInt(d.daily.best)}</b></div>
        <div class="stat"><small>Tentativas</small><b>${fmtInt(d.daily.attempts)}</b></div>
      </div>
      <p class="small">Usa a data deste aparelho. Sem conexão e sem ranking online.</p>
      <button class="btn" data-act="playdaily">JOGAR DESAFIO</button>
      <button class="btn ghost" data-act="close">Fechar</button>`, () => this.closeModal());
  }

  /** Redes oficiais da Flow (créditos, fim de partida e downloads). */
  private socialRow(): string {
    return `<div class="social">
      <button data-act="insta" data-testid="social-insta">${ICON.insta}<span>Instagram<small>${INSTAGRAM_LABEL}</small></span></button>
      <button data-act="tiktok" data-testid="social-tiktok">${ICON.tiktok}<span>TikTok<small>${TIKTOK_LABEL}</small></span></button>
      <button data-act="whats" data-testid="social-whats">${ICON.whats}<span>WhatsApp<small>(27) 99278-5043</small></span></button>
      <button data-act="site" data-testid="social-site">${ICON.globe}<span>Site<small>${SITE_LABEL}</small></span></button>
    </div>`;
  }

  private showCredits(): void {
    this.openModal(`
      <div class="brandline"><img src="${brandUrl}" alt="Flow Group" width="79" height="54"></div>
      <h2>CRÉDITOS</h2>
      <p>A <b>Flow Group</b> é uma empresa de software: uma empresa de tecnologia que faz tudo, de sites e sistemas a apps, automações, vídeo e design.</p>
      <p>Fizemos o <b>Ball Run</b> num tempo livre, só para mostrar o nosso trabalho. Pista, efeitos, poderes, piadas e sons foram criados para este jogo.</p>
      <h3>Siga a Flow</h3>
      ${this.socialRow()}
      <button class="btn" data-act="site">SITE OFICIAL</button>
      <button class="btn ghost" data-act="whats">Falar com a Flow no WhatsApp</button>
      <h3>Tecnologia de terceiros</h3>
      <p class="small" style="text-align:left">Three.js (licença MIT) · Capacitor (MIT) · fontes Anton e Montserrat (SIL Open Font License).</p>
      <button class="btn ghost" data-act="close">Fechar</button>`, () => this.closeModal());
  }

  private showDownloads(): void {
    const abs = (f: string) => (isNative() ? `${GAME_URL}/${f}` : f);
    const plat = platformName();
    const here = (p: string) => (plat === p ? '<em class="here">você está aqui</em>' : '');
    this.openModal(`
      <h2>ONDE JOGAR</h2>
      <p>É o mesmo jogo nos três: mesma pista, bolas, poderes e conquistas.</p>
      <div class="where">
        <div class="wcard"><b>${ICON.globe} Online, em qualquer aparelho ${here('web')}</b><span>Abre no navegador do celular ou do computador. Nada para instalar.</span>
          <button class="btn" data-act="open-game" data-testid="open-game">JOGAR NO SITE</button></div>
        <div class="wcard"><b>${ICON.ball} Android, sem internet ${here('android')}</b><span>Baixe o APK e abra. Se o Android perguntar, permita instalar "apps desconhecidos" para o navegador.</span>
          <a class="btn" href="${esc(abs(DOWNLOADS.android.file))}" download="BallRun-Flow.apk" data-testid="dl-apk" target="_blank" rel="noopener">${esc(DOWNLOADS.android.label)}</a></div>
        <div class="wcard"><b>${ICON.ball} iPhone, sem internet ${here('ios')}</b><span>O IPA é de teste, sem assinatura da Apple: o iPhone só instala por um app de instalação lateral (AltStore, Sideloadly ou similar), que assina com o seu ID Apple. Sem isso, jogue pelo site: no Safari, Compartilhar › Adicionar à Tela de Início, e ele abre como app, até sem internet depois da 1ª vez.</span>
          <a class="btn ghost" href="${esc(abs(DOWNLOADS.ios.file))}" download="BallRun-Flow.ipa" data-testid="dl-ipa" target="_blank" rel="noopener">${esc(DOWNLOADS.ios.label)}</a></div>
      </div>
      <button class="btn ghost" data-act="close">Fechar</button>`, () => this.closeModal());
  }

  private confirmReset(): void {
    this.openModal(`
      <h2>APAGAR TUDO?</h2>
      <p>Recordes, estatísticas, conquistas, bolas liberadas e o contador do tutorial voltam a zero. Não dá para desfazer.</p>
      <button class="btn danger" data-act="doreset">Sim, apagar</button>
      <button class="btn" data-act="settings">CANCELAR</button>`, () => this.showSettings());
  }

  // ------------------------------------------------------------------ eventos de UI
  private onClick(e: Event): void {
    const link = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (link && isNative()) {
      // nos apps, links (downloads) abrem no navegador do aparelho
      e.preventDefault();
      void openExternal(link.href);
      return;
    }
    const t = (e.target as Element).closest<HTMLElement>('[data-act]');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const act = t.dataset.act ?? '';
    this.audio.unlock();
    if (act !== 'play' && act !== 'again' && act !== 'playdaily' && act !== 'practice' && act !== 'restart') this.audio.click();
    const d = this.save.data;
    switch (act) {
      case 'play':
        this.startGame({ mode: this.menuMode, daily: false, practice: false });
        break;
      case 'again':
        this.startGame({ ...this.run });
        break;
      case 'restart':
        this.startGame({ ...this.run });
        break;
      case 'playdaily':
        this.closeModal();
        this.startGame({ mode: DAILY_MODE, daily: true, practice: false });
        break;
      case 'practice':
        this.closeModal();
        this.startGame({ mode: 'facil', daily: false, practice: true });
        break;
      case 'power':
        this.usePower();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'menu':
        this.quitToMenu();
        break;
      case 'prev':
      case 'next':
      case 'mode': {
        const i = MODES.indexOf(this.menuMode);
        const nm = act === 'mode' ? (t.dataset.mode as Mode) : MODES[Math.max(0, Math.min(MODES.length - 1, i + (act === 'next' ? 1 : -1)))];
        if (nm && MODES.includes(nm)) {
          this.menuMode = nm;
          d.lastMode = nm;
          void this.save.save();
          if (this.renderer) {
            this.sim = new GameSim(nm, 12345);
            this.renderer.attach(this.sim);
          }
          this.renderMenu();
        }
        break;
      }
      case 'records':
        this.showRecords();
        break;
      case 'settings':
        this.showSettings();
        break;
      case 'help':
        this.showHelp();
        break;
      case 'skins':
      case 'ball':
        this.showBall();
        break;
      case 'photo-edit':
        this.photoMsg = '';
        this.editPhoto = this.photo;
        this.editFit = { ...this.photoFit };
        this.showPhotoEditor();
        break;
      case 'photo-use':
        void this.usePhoto();
        break;
      case 'photo-remove':
        void this.removePhoto();
        break;
      case 'photo-gray':
        this.editFit.gray = !this.editFit.gray;
        t.setAttribute('aria-checked', String(this.editFit.gray));
        this.preview?.update(this.editPhoto, this.editFit);
        break;
      case 'insta':
        void openExternal(INSTAGRAM_URL);
        break;
      case 'tiktok':
        void openExternal(TIKTOK_URL);
        break;
      case 'achievements':
        this.showAchievements();
        break;
      case 'daily':
        this.showDaily();
        break;
      case 'credits':
        this.showCredits();
        break;
      case 'open-game':
        void openExternal(GAME_URL);
        break;
      case 'downloads':
        this.showDownloads();
        break;
      case 'site':
        void openExternal(SITE_URL);
        break;
      case 'whats':
        void openExternal(WHATSAPP_URL);
        break;
      case 'close':
        this.closeModal();
        if (this.sm.state === 'menu') this.renderMenu();
        break;
      case 'skin': {
        const id = t.dataset.skin ?? '';
        if (id !== CUSTOM_SKIN_ID && !skinUnlocked(d, id) && !this.tryBuy(id)) {
          this.showBall();
          break;
        }
        if (id === CUSTOM_SKIN_ID && !this.photo) break;
        d.skin = id;
        void this.save.save();
        this.applySkin();
        this.showBall();
        break;
      }
      case 'trail': {
        const id = t.dataset.trail ?? '';
        if (!trailUnlocked(d, id) && !this.tryBuy(id)) {
          this.showBall();
          break;
        }
        d.trail = id;
        void this.save.save();
        this.applyTrail();
        this.showBall();
        break;
      }
      case 'shoptab':
        this.shopTab = t.dataset.tab === 'rastros' ? 'rastros' : 'bolas';
        this.showBall();
        break;
      case 'achgroup':
        this.achGroup = t.dataset.g ?? this.achGroup;
        this.showAchievements();
        break;
      case 'toggle': {
        const key = t.dataset.key as 'sfx' | 'music' | 'haptics' | 'reducedMotion';
        d.settings[key] = !d.settings[key];
        t.setAttribute('aria-checked', String(d.settings[key]));
        this.applySettings();
        if (key === 'music') {
          if (!d.settings.music) this.audio.stopMusic();
        }
        if (key === 'reducedMotion' && this.renderer) this.renderer.reducedMotion = d.settings.reducedMotion;
        void this.save.save();
        break;
      }
      case 'setopt': {
        if (t.dataset.key === 'palette') {
          d.settings.palette = t.dataset.val === 'flow' ? 'flow' : 'vivo';
          if (this.renderer) this.renderer.palette = d.settings.palette;
          void this.save.save();
          t.parentElement?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        }
        if (t.dataset.key === 'quality') {
          const v = t.dataset.val === 'alta' || t.dataset.val === 'baixa' ? t.dataset.val : 'auto';
          d.settings.quality = v;
          this.renderer?.setQuality(v);
          void this.save.save();
          t.parentElement?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        }
        break;
      }
      case 'reset':
        this.confirmReset();
        break;
      case 'doreset': {
        const fresh = new SaveStore({ get: async () => null, set: async () => undefined });
        void fresh.load().then((def) => {
          this.save.data = def;
          void this.save.save();
          this.applySettings();
          this.applySkin();
          this.renderer?.setQuality(def.settings.quality);
          this.menuMode = def.lastMode;
          this.closeModal();
          this.renderMenu();
          this.showToast('Progresso apagado');
          this.startToastClock();
        });
        break;
      }
      default:
        break;
    }
  }

  /** Toasts no menu (sem loop de jogo rodando) */
  private startToastClock(): void {
    window.setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }

  private onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (t.type === 'file' && t.dataset.key === 'photo-file') {
      void this.onPhotoFile(t);
      return;
    }
    if (t.type !== 'range') return;
    if (t.dataset.key?.startsWith('photo-')) {
      const v = Number(t.value);
      if (!Number.isFinite(v)) return;
      if (t.dataset.key === 'photo-zoom') this.editFit.zoom = v;
      if (t.dataset.key === 'photo-x') this.editFit.offsetX = v;
      if (t.dataset.key === 'photo-y') this.editFit.offsetY = v;
      this.editFit = sanitizeFit(this.editFit);
      this.preview?.update(this.editPhoto, this.editFit);
      return;
    }
    const v = Number(t.value);
    if (!Number.isFinite(v)) return;
    if (t.dataset.key === 'volume') {
      this.save.data.settings.volume = Math.min(1, Math.max(0, v));
      this.audio.setVolume(this.save.data.settings.volume);
    } else if (t.dataset.key === 'sensitivity') {
      this.save.data.settings.sensitivity = Math.min(1.6, Math.max(0.6, v));
      this.input.sensitivity = this.save.data.settings.sensitivity;
    }
    void this.save.save();
  }

  /** Estado resumido para testes automatizados. */
  debug(): Record<string, unknown> {
    return {
      state: this.sm.state,
      score: this.sim?.score ?? 0,
      dist: this.sim?.distance ?? 0,
      ballX: this.sim?.ball.x ?? 0,
      targetX: this.sim?.targetX ?? 0,
      simState: this.sim?.state,
      steps: this.sim?.steps ?? 0,
      time: this.sim?.time ?? 0,
      tutorialOn: this.tutorialOn,
      tutorialRuns: this.save.data.tutorial.runs,
      hintVisible: !this.hintEl.classList.contains('hidden'),
      hintText: this.hintEl.textContent,
      render: this.renderer?.debugStats() ?? {},
      tutorialLimit: TUTORIAL_RUNS,
      skin: this.save.data.skin,
      trail: this.save.data.trail,
      coins: this.save.data.coins,
      level: this.sim?.level ?? 0,
      achievements: this.save.data.achievements.length,
      hasPhoto: !!this.photo,
      zone: this.renderer?.zoneId,
      bestDist: this.save.data.bestDist,
      bestTime: this.save.data.bestTime,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`tempo esgotado: ${what}`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function loadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`imagem não carregou: ${src}`));
    img.src = src;
  });
}

async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.all([document.fonts.load('40px Anton'), document.fonts.load('600 14px Montserrat'), document.fonts.load('800 14px Montserrat')]);
}
