import {
  AdditiveBlending, AmbientLight, BufferAttribute, BufferGeometry, CanvasTexture, Color, DirectionalLight, Mesh,
  MeshBasicMaterial, MeshMatcapMaterial, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial,
  Quaternion, RingGeometry, Scene, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
  CylinderGeometry,
  ConeGeometry,
  Group,
  DoubleSide,
} from 'three';
import { matcap, finishFor } from './matcap';
import { BALL_R } from '../sim/constants';
import type { GameSim, SimEvent } from '../sim/game';
import { CityView } from './cityView';
import { DecoView } from './decoView';
import { shared } from './materials';
import { skinTextures, type Skin } from './skins';
import { applyAccent, applyLook, makeTheme, type Palette, type ThemeColors } from './theme';
import { TrackView } from './trackView';
import { TrailView } from './trails';
import type { TrailDef } from '../game/catalog';

export type Quality = 'auto' | 'alta' | 'baixa';

const MAX_P = 260;
const SKY_P = 500;
const ORIGIN_STEP = 2100; // múltiplo de 3 e 1,5 (a grade da pista continua sem emenda)
const tmpV = new Vector3();
const tmpQ = new Quaternion();
const axis = new Vector3();

/** Tudo o que é desenhado. Lê a simulação; nunca a altera. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(62, 1, 0.1, 500);
  readonly theme: ThemeColors = makeTheme();
  private trackView: TrackView;
  private city: CityView;
  private deco: DecoView;
  private ball: Mesh;
  private ballMat: MeshMatcapMaterial;
  private shadow: Mesh;
  private particles: Points;
  private pPos: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pCol: Float32Array;
  private pNext = 0;
  private sky: Points;
  private skyPos: Float32Array;
  private skyMat: PointsMaterial;
  private weather: Points;
  private wPos: Float32Array;
  private wMat: PointsMaterial;
  private sun: Mesh;
  private stars: Sprite[] = [];
  private trail = new TrailView();
  private wave: Mesh;
  private waveT = -1;
  private sim: GameSim | null = null;
  private camX = 0;
  private camY = 3;
  private camFov = 62;
  private lastBall = new Vector3();
  private squash = 0;
  private shake = 0;
  private hitT = -1;
  private hitDir = 1;
  private fallSpin = 0;
  private trailColor = new Color('#ffffff');
  private origin = 0;
  private quality: Quality = 'auto';
  private frameTimes: number[] = [];
  private dprCap = 2;
  private dot: CanvasTexture;
  zoneId = 0;
  palette: Palette = 'vivo';
  reducedMotion = false;
  private idleT = 0;
  // efeitos dos poderes especiais
  private ufo = new Group();
  private ufoBeam: Mesh;
  private bubble: Mesh;
  private flame: Mesh;
  private ring: Mesh;
  private ufoT = -1;
  coverCam: { dx: number; dy: number; dz: number; lx: number; ly: number; fov: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(this.theme.fog, 1);
    this.scene.background = this.theme.fog;
    this.scene.add(new AmbientLight('#ffffff', 0.35));
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(-3, 8, 4);
    this.scene.add(sun);
    const rim = new DirectionalLight('#ffffff', 1.1);
    rim.position.set(4, 3, -6);
    this.scene.add(rim);

    this.dot = dotTexture();
    this.trackView = new TrackView(this.theme);
    this.scene.add(this.trackView.group);
    this.city = new CityView(this.theme, this.dot);
    this.scene.add(this.city.group);
    this.deco = new DecoView();
    this.scene.add(this.deco.group);

    this.ballMat = new MeshMatcapMaterial({ matcap: matcap('gloss') });
    this.ball = new Mesh(new SphereGeometry(BALL_R, 64, 40), this.ballMat);
    this.scene.add(this.ball);

    this.shadow = new Mesh(new PlaneGeometry(BALL_R * 2.6, BALL_R * 2.6), new MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 3;
    this.scene.add(this.shadow);

    // partículas (rastro, poeira, faíscas)
    const pg = new BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pVel = new Float32Array(MAX_P * 3);
    this.pLife = new Float32Array(MAX_P);
    this.pCol = new Float32Array(MAX_P * 3);
    pg.setAttribute('position', new BufferAttribute(this.pPos, 3));
    pg.setAttribute('color', new BufferAttribute(this.pCol, 3));
    this.particles = new Points(pg, new PointsMaterial({ size: 0.14, map: this.dot, alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // céu: estrelas (acompanham a câmera)
    this.skyPos = new Float32Array(SKY_P * 3);
    for (let i = 0; i < SKY_P; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.08 + Math.random() * 0.9;
      const r = 300;
      this.skyPos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.7 + 10, -Math.abs(Math.sin(a) * Math.cos(e) * r) - 40], i * 3);
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new BufferAttribute(this.skyPos, 3));
    this.skyMat = new PointsMaterial({ size: 1.6, map: this.dot, color: '#ffffff', transparent: true, depthWrite: false, sizeAttenuation: true, fog: false });
    this.sky = new Points(sg, this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // clima: neve / chuva (caixa em volta da câmera)
    this.wPos = new Float32Array(SKY_P * 3);
    for (let i = 0; i < SKY_P; i++) this.wPos.set([(Math.random() - 0.5) * 40, Math.random() * 24, -Math.random() * 60], i * 3);
    const wg = new BufferGeometry();
    wg.setAttribute('position', new BufferAttribute(this.wPos, 3));
    this.wMat = new PointsMaterial({ size: 0.12, map: this.dot, color: '#ffffff', transparent: true, depthWrite: false });
    this.weather = new Points(wg, this.wMat);
    this.weather.frustumCulled = false;
    this.scene.add(this.weather);

    // eclipse: disco branco com miolo preto no horizonte
    this.sun = new Mesh(new RingGeometry(18, 24, 64), new MeshBasicMaterial({ color: '#ffffff', transparent: true, fog: false, depthWrite: false }));
    const core = new Mesh(new SphereGeometry(18, 32, 16), new MeshBasicMaterial({ color: '#000000', fog: false }));
    this.sun.add(core);
    this.scene.add(this.sun);

    this.scene.add(this.trail.group);

    // onda de choque do acelerador
    this.wave = new Mesh(new RingGeometry(0.85, 1, 64), new MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending }));
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.visible = false;
    this.wave.renderOrder = 4;
    this.scene.add(this.wave);

    // estrelinhas de desenho animado quando bate
    const starTex = starTexture();
    for (let i = 0; i < 4; i++) {
      const sp = new Sprite(new SpriteMaterial({ map: starTex, transparent: true, depthTest: false }));
      sp.scale.setScalar(0.32);
      sp.visible = false;
      sp.renderOrder = 10;
      this.stars.push(sp);
      this.scene.add(sp);
    }
    // disco voador (rapto), bolha (escudo), chama (foguete), anel (congelar / câmera lenta)
    const hull = new MeshBasicMaterial({ color: '#d9dde4' });
    const dark = new MeshBasicMaterial({ color: '#2a2d33' });
    const disc = new Mesh(new CylinderGeometry(1.25, 0.55, 0.32, 32), hull);
    const rim2 = new Mesh(new CylinderGeometry(1.32, 1.32, 0.08, 32), dark);
    const dome = new Mesh(new SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new MeshBasicMaterial({ color: '#9fffd0', transparent: true, opacity: 0.85 }));
    dome.position.y = 0.12;
    const alien = new Mesh(new SphereGeometry(0.22, 16, 10), new MeshBasicMaterial({ color: '#35d07f' }));
    alien.position.y = 0.3;
    this.ufoBeam = new Mesh(new ConeGeometry(1.0, 3.4, 24, 1, true), new MeshBasicMaterial({ color: '#b8ffd9', transparent: true, opacity: 0.32, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    this.ufoBeam.position.y = -1.8;
    this.ufo.add(disc, rim2, dome, alien, this.ufoBeam);
    this.ufo.visible = false;
    this.scene.add(this.ufo);
    this.bubble = new Mesh(new SphereGeometry(BALL_R * 1.55, 32, 20), new MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.28, depthWrite: false, blending: AdditiveBlending }));
    this.bubble.visible = false;
    this.scene.add(this.bubble);
    this.flame = new Mesh(new ConeGeometry(0.28, 1.1, 16), new MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
    this.flame.rotation.x = Math.PI;
    this.flame.visible = false;
    this.scene.add(this.flame);
    this.ring = new Mesh(new RingGeometry(0.9, 1, 48), new MeshBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.6, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.resize();
  }

  /** Efeitos visuais dos poderes (chamado a cada quadro com a bola já posicionada). */
  private updateAbilityFx(sim: GameSim, x: number, y: number, z: number, time: number, dt: number): void {
    const carry = sim.carryT > 0 ? sim.carryKind : null;
    // disco voador: desce, leva a bola e sobe embora
    if (carry === 'abduct') this.ufoT = Math.max(this.ufoT, 0);
    if (this.ufoT >= 0) {
      this.ufoT += dt;
      const leaving = carry !== 'abduct';
      if (leaving) this.ufoT = Math.max(this.ufoT, 10);
      const up = leaving ? (this.ufoT - 10) * 9 : Math.max(0, 1 - this.ufoT * 3) * 6;
      this.ufo.visible = !leaving || up < 14;
      this.ufo.position.set(x + Math.sin(time * 3) * 0.12, y + 2.1 + up, z);
      this.ufo.rotation.y = time * 2.5;
      this.ufoBeam.visible = !leaving;
      if (leaving && up >= 14) this.ufoT = -1;
    }
    // foguete: chama embaixo da bola
    this.flame.visible = carry === 'rocket';
    if (carry === 'rocket') {
      this.flame.position.set(x, y - BALL_R - 0.45, z + 0.1);
      this.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      if (Math.random() < 0.7) this.burst(x, y - BALL_R - 0.6, z + 0.2, 2, this.theme.pad, 2);
    }
    // escudo: bolha pulsando
    this.bubble.visible = sim.shieldT > 0;
    if (this.bubble.visible) {
      this.bubble.position.set(x, y, z);
      const blink = sim.shieldT < 1.2 ? (Math.sin(time * 25) > 0 ? 1 : 0.3) : 1;
      this.bubble.scale.setScalar(1 + Math.sin(time * 6) * 0.04);
      (this.bubble.material as MeshBasicMaterial).opacity = 0.28 * blink;
    }
    // fantasma: bola meio transparente
    const ghost = sim.ghostT > 0;
    if (this.ballMat.transparent !== ghost) {
      this.ballMat.transparent = ghost;
      this.ballMat.needsUpdate = true;
    }
    this.ballMat.opacity = ghost ? 0.35 + 0.15 * Math.sin(time * 12) : 1;
    // congelar / câmera lenta: anel no chão em volta da bola
    const ringOn = sim.freezeT > 0 || sim.slowT > 0;
    this.ring.visible = ringOn;
    if (ringOn) {
      this.ring.position.set(x, (sim.track.floorAt(x, sim.ball.s)?.h ?? y - BALL_R) + 0.04, z);
      this.ring.scale.setScalar(1.2 + ((time * 1.5) % 1) * 1.6);
      (this.ring.material as MeshBasicMaterial).color.set(sim.freezeT > 0 ? '#bfe9ff' : '#d6b8ff');
      (this.ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - ((time * 1.5) % 1));
    }
    // arrancada: rastro de faíscas
    if (sim.dashT > 0) this.burst(x, y, z + 0.4, 3, this.theme.obstacleEdge, 3);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.dprCap = q === 'alta' ? 2 : q === 'baixa' ? 1 : 1.75;
    this.frameTimes = [];
    this.resize();
  }

  /** Troca a textura da bola (skin pronta ou foto do jogador). */
  setBallTexture(map: Texture, bump: Texture | null, look: Pick<Skin, 'roughness' | 'metalness' | 'clearcoat' | 'bump' | 'trail'>): void {
    const m = this.ballMat;
    if (m.map && m.map !== map) m.map.dispose();
    if (m.bumpMap && m.bumpMap !== bump) m.bumpMap.dispose();
    m.map = map;
    m.bumpMap = bump;
    m.bumpScale = look.bump * 2.5;
    m.matcap = matcap(finishFor(look));
    m.needsUpdate = true;
    this.trailColor.set(look.trail);
  }

  setTrail(def: TrailDef): void {
    this.trail.set(def);
  }

  setSkin(skin: Skin, size = 512): void {
    const t = skinTextures(skin, size);
    this.setBallTexture(t.map, t.bump, skin);
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camFov = this.camera.aspect > 0.9 ? 50 : 62;
    this.camera.fov = this.camFov;
    this.camera.updateProjectionMatrix();
  }

  /** Liga a pista de uma nova partida (limpa tudo da anterior). */
  attach(sim: GameSim): void {
    if (this.sim) {
      this.sim.track.onAdd = null;
      this.sim.track.onRemove = null;
    }
    this.trackView.clear();
    this.trackView.hidden = sim.smashed;
    this.ufoT = -1;
    this.ufo.visible = false;
    this.deco.clear();
    this.origin = 0;
    this.deco.setOrigin(0);
    this.pLife.fill(0);
    this.trail.reset();
    this.sim = sim;
    sim.track.onAdd = (s) => {
      this.trackView.add(s);
      this.deco.add(s);
    };
    sim.track.onRemove = (s) => {
      this.trackView.remove(s);
      this.deco.remove(s);
    };
    for (const s of sim.track.segments) {
      this.trackView.add(s);
      this.deco.add(s);
    }
    this.city.reset(0);
    this.camX = 0;
    this.camY = sim.ball.y + 2.7;
    this.lastBall.set(sim.ball.x, sim.ball.y, -sim.ball.s);
    this.ball.quaternion.identity();
    this.ball.rotation.set(0, 0, 0);
    this.squash = 0;
    this.shake = 0;
    this.hitT = -1;
    this.fallSpin = 0;
    for (const st of this.stars) st.visible = false;
    const z = sim.track.gen.zoneAt(0);
    applyLook(this.theme, z, z, 1);
    applyAccent(this.theme, sim.track.gen.levelAt(0), this.palette);
    this.zoneId = z;
  }

  onEvent(ev: SimEvent): void {
    const sim = this.sim;
    const b = sim?.ball;
    if (!sim || !b) return;
    const z = -(b.s - this.origin);
    if (ev.type === 'hit') {
      this.burst(b.x, b.y, z, 40, this.theme.obstacleEdge, 6);
      this.hitT = 0;
      const o = sim.lastHit;
      this.hitDir = o ? Math.sign(b.x - (o.x0 + o.x1) / 2) || 1 : 1;
      if (!this.reducedMotion) this.shake = 0.3;
    } else if (ev.type === 'land') {
      this.squash = Math.min(0.25, ev.impact * 0.035);
      this.burst(b.x, b.y - BALL_R, z, 14, this.theme.grid, 2.5);
    } else if (ev.type === 'boost') {
      this.burst(b.x, b.y - BALL_R, z, 40, this.theme.pad, 5);
      // faíscas voando para trás dos dois lados
      for (let k = 0; k < 40; k++) {
        const i = this.pNext;
        this.pNext = (this.pNext + 1) % MAX_P;
        const side = k % 2 ? 1 : -1;
        this.pPos.set([b.x + side * (0.4 + Math.random() * 1.6), b.y - 0.2 + Math.random() * 0.8, z - Math.random() * 3], i * 3);
        this.pVel.set([side * Math.random() * 2, Math.random() * 1.5, 18 + Math.random() * 12], i * 3);
        this.pLife[i] = 0.5 + Math.random() * 0.4;
        this.pCol.set([this.theme.pad.r, this.theme.pad.g, this.theme.pad.b], i * 3);
      }
      this.waveT = 0;
    } else if (ev.type === 'fall') {
      this.fallSpin = 9;
    } else if (ev.type === 'smash') {
      // bloco esmagado: some e vira estilhaço
      this.trackView.hide(ev.o);
      this.burst(ev.x, ev.y, -(ev.s - this.origin), 46, this.theme.obstacleEdge, 9);
      if (!this.reducedMotion) this.shake = Math.max(this.shake, 0.18);
    } else if (ev.type === 'shieldPop') {
      this.burst(b.x, b.y, z, 36, new Color('#9fd8ff'), 6);
    } else if (ev.type === 'ability') {
      if (ev.kind === 'teleport') {
        // estouro onde chegou (o de saída fica para trás na pista)
        this.burst(b.x, b.y, z, 40, new Color('#ffffff'), 5);
        this.lastBall.set(b.x, b.y, z);
      } else if (ev.kind === 'jump' || ev.kind === 'superJump' || ev.kind === 'tripleHop' || ev.kind === 'glide') {
        this.burst(b.x, b.y - BALL_R, z, 18, this.theme.grid, 3);
        this.squash = 0.2;
      } else if (ev.kind === 'dash') {
        this.waveT = 0;
      }
    }
  }

  private burst(x: number, y: number, z: number, n: number, color: Color, speed: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % MAX_P;
      this.pPos.set([x, y, z], i * 3);
      this.pVel.set([(Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.3) * speed], i * 3);
      this.pLife[i] = 0.5 + Math.random() * 0.5;
      this.pCol.set([color.r, color.g, color.b], i * 3);
    }
  }

  /** Posição da bola na tela (px CSS) — para as onomatopeias. */
  ballScreen(): { x: number; y: number } {
    tmpV.copy(this.ball.position).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (tmpV.x * 0.5 + 0.5) * r.width, y: (-tmpV.y * 0.5 + 0.5) * r.height };
  }

  private updateZone(s: number): void {
    const sim = this.sim;
    if (!sim) return;
    const zones = sim.track.gen.zones;
    let i = zones.length - 1;
    while (i > 0 && (zones[i] as [number, number])[0] > s) i--;
    const cur = zones[i] ?? [0, 0];
    const prev = zones[i - 1] ?? cur;
    const blend = Math.min(1, (s - cur[0]) / 80);
    applyLook(this.theme, prev[1], cur[1], i === 0 ? 1 : blend);
    this.zoneId = cur[1];
    // destaque muda a cada km (acelerador), com transição de 60 u
    const gen = sim.track.gen;
    const level = gen.levelAt(s);
    let cp = -Infinity;
    for (const c of gen.checkpoints) if (c <= s) cp = c;
    const k = Number.isFinite(cp) ? Math.min(1, (s - cp) / 60) : 1;
    applyAccent(this.theme, Math.max(0, level - 1 + k), this.palette);
  }

  /** Desenha o quadro: interpola entre o passo anterior e o atual (alfa). */
  render(alpha: number, frameDt: number, groundH: number): void {
    const sim = this.sim;
    const dt = Math.min(0.1, Math.max(0, frameDt));
    shared.uTime.value += dt;
    const time = shared.uTime.value;
    if (sim) {
      const a = sim.prev;
      const b = sim.ball;
      const x = a.x + (b.x - a.x) * alpha;
      const y = a.y + (b.y - a.y) * alpha;
      const s = a.s + (b.s - a.s) * alpha;

      // origem móvel do desenho: precisão constante em partidas de horas
      const o = Math.floor(s / ORIGIN_STEP) * ORIGIN_STEP;
      if (o !== this.origin) {
        const dz = o - this.origin;
        this.origin = o;
        this.trackView.setOrigin(o);
        this.deco.setOrigin(o);
        this.city.shift(dz);
        this.trail.shift(dz);
        for (let i = 0; i < MAX_P; i++) this.pPos[i * 3 + 2] = (this.pPos[i * 3 + 2] ?? 0) + dz;
        this.lastBall.z += dz;
      }
      const z = -(s - this.origin);

      // rolamento proporcional ao deslocamento real; girando louca ao cair
      const dx = x - this.lastBall.x;
      const dz = z - this.lastBall.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-5 && dist < 5) {
        tmpQ.setFromAxisAngle(axis.set(dz, 0, -dx).normalize(), dist / BALL_R);
        this.ball.quaternion.premultiply(tmpQ);
      }
      if (this.fallSpin > 0) {
        tmpQ.setFromAxisAngle(axis.set(1, 0.4, 0.2).normalize(), this.fallSpin * dt);
        this.ball.quaternion.premultiply(tmpQ);
      }
      this.lastBall.set(x, y, z);
      this.squash = Math.max(0, this.squash - dt * 1.6);
      // batida: achata contra o bloco, quica e treme (desenho animado)
      let sx = 1 + this.squash * 0.5;
      let sy = 1 - this.squash;
      let sz = 1 + this.squash * 0.5;
      let ox = 0;
      let oy = 0;
      if (this.hitT >= 0) {
        this.hitT += dt;
        const k = this.hitT;
        const pancake = Math.max(0, 1 - k * 4) * 0.55;
        const wob = Math.sin(k * 30) * Math.exp(-k * 5) * 0.18;
        sz = 1 - pancake + wob;
        sx = 1 + pancake * 0.6 - wob * 0.5;
        sy = 1 + pancake * 0.4 - wob * 0.5;
        oy = Math.max(0, Math.sin(Math.min(1, k * 2.2) * Math.PI)) * 0.6;
        ox = this.hitDir * Math.min(1, k * 2) * 0.35;
        this.stars.forEach((st, i) => {
          st.visible = k > 0.08;
          const ang = time * 5 + (i / this.stars.length) * Math.PI * 2;
          st.position.set(x + ox + Math.cos(ang) * 0.55, y + oy + 0.65 + Math.sin(ang * 2) * 0.05, z + Math.sin(ang) * 0.35);
        });
      } else for (const st of this.stars) st.visible = false;
      if (this.waveT >= 0) {
        this.waveT += dt;
        const k = this.waveT / 0.7;
        this.wave.visible = k < 1;
        this.wave.position.set(x, (sim.track.floorAt(x, s)?.h ?? y - BALL_R) + 0.05, z);
        this.wave.scale.setScalar(0.6 + k * 7);
        const wm = this.wave.material as MeshBasicMaterial;
        wm.color.copy(this.theme.pad);
        wm.opacity = Math.max(0, 1 - k);
        if (k >= 1) this.waveT = -1;
      }
      this.ball.scale.set(sx, sy, sz);
      this.ball.position.set(x + ox, y - BALL_R * this.squash + oy, z);

      // sombra
      const fl = sim.track.floorAt(x, s);
      const above = fl ? y + oy - BALL_R - fl.h : -1;
      // só há sombra se a bola estiver EM CIMA da pista (caindo abaixo dela: sem sombra; nunca cresce além do tamanho real)
      if (fl && sim.state !== 'over' && above > -0.08) {
        this.shadow.visible = true;
        this.shadow.position.set(x + ox, fl.h + 0.03, z);
        const k = Math.min(1, Math.max(0, 1 - above / 3));
        (this.shadow.material as MeshBasicMaterial).opacity = 0.75 * k;
        this.shadow.scale.setScalar(0.7 + 0.3 * k);
      } else this.shadow.visible = false;

      // câmera: segue suave; ao cair, fica e olha para baixo
      const kx = 1 - Math.exp(-7 * dt);
      const ky = 1 - Math.exp(-4.5 * dt);
      this.camX += (x * 0.6 - this.camX) * kx;
      const falling = sim.state !== 'running' && sim.cause === 'fall';
      if (!falling) this.camY += (groundH + 2.75 - this.camY) * ky;
      let jx = 0;
      let jy = 0;
      if (this.shake > 0) {
        this.shake = Math.max(0, this.shake - dt);
        jx = (Math.random() - 0.5) * this.shake * 0.5;
        jy = (Math.random() - 0.5) * this.shake * 0.5;
      }
      const wide = this.camera.aspect > 0.9 ? 1 : 0;
      this.camera.position.set(this.camX + jx, this.camY + jy + wide * 0.9, z + 5.4 + wide * 2.2);
      this.camera.lookAt(tmpV.set(this.camX * 1.15, falling ? y : this.camY - 2.2, z - 9));
      if (this.coverCam) {
        // só para gerar a capa (modo de desenvolvimento): câmera baixa e perto da bola
        const c = this.coverCam;
        this.camera.position.set(x + c.dx, y + c.dy, z + c.dz);
        this.camera.lookAt(tmpV.set(x + c.lx, y + c.ly, z - 12));
      }
      const targetFov = (this.coverCam?.fov ?? this.camFov) + (sim.boosting && !this.reducedMotion ? 7 : 0);
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-5 * dt));
      this.camera.updateProjectionMatrix();

      // ambiente: cores, neblina (nunca curta demais para a velocidade), céu e clima
      this.updateZone(s);
      const th = this.theme;
      shared.uFogColor.value.copy(th.fog);
      this.renderer.setClearColor(th.fog, 1);
      const far = Math.max(th.fogFar, b.vs * 3.4);
      shared.uFogFar.value = far;
      shared.uFogNear.value = Math.min(th.fogNear, far * 0.45);
      shared.uWindowRate.value = th.windowRate;
      shared.uBall.value.set(x, y, z);
      this.sky.position.set(this.camera.position.x, groundH, z);
      this.skyMat.opacity = th.stars * (0.6 + 0.4 * Math.sin(time * 0.7));
      this.sky.visible = th.stars > 0.02;
      this.sun.visible = th.sun > 0.02;
      this.sun.position.set(0, groundH + 30, z - 260);
      (this.sun.material as MeshBasicMaterial).opacity = th.sun;
      this.updateWeather(dt, z, groundH);

      this.trackView.update(sim.obsTime, b.s, b.vs);
      this.updateAbilityFx(sim, x + ox, y + oy, z, time, dt);
      this.deco.update(time, b.s);
      this.city.update(z, groundH, time, th.cityShow);

      // rastro (faixa no chão + partículas do estilo escolhido)
      const fl2 = sim.track.floorAt(x, s);
      this.trail.update(dt, x, y, z, fl2 && b.onGround ? fl2.h : null, sim.state === 'running', this.theme.pad);
    }
    // partículas
    for (let i = 0; i < MAX_P; i++) {
      const life = this.pLife[i] ?? 0;
      if (life <= 0) {
        this.pPos[i * 3 + 1] = -9999;
        continue;
      }
      const nl = life - dt;
      this.pLife[i] = nl;
      this.pVel[i * 3 + 1] = (this.pVel[i * 3 + 1] ?? 0) - 9 * dt;
      for (let c = 0; c < 3; c++) this.pPos[i * 3 + c] = (this.pPos[i * 3 + c] ?? 0) + (this.pVel[i * 3 + c] ?? 0) * dt;
      const fade = Math.max(0, Math.min(1, nl * 2.5));
      for (let c = 0; c < 3; c++) this.pCol[i * 3 + c] = (this.pCol[i * 3 + c] ?? 0) * (0.9 + 0.1 * fade);
    }
    (this.particles.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.particles.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
    this.autoQuality(frameDt);
  }

  private updateWeather(dt: number, z: number, groundH: number): void {
    const th = this.theme;
    const amount = Math.max(th.snow, th.rain);
    this.weather.visible = amount > 0.02;
    if (!this.weather.visible) return;
    const rain = th.rain > th.snow;
    this.wMat.size = rain ? 0.07 : 0.16;
    this.wMat.opacity = amount * (rain ? 0.55 : 0.9);
    const vy = rain ? 26 : 2.2;
    for (let i = 0; i < SKY_P; i++) {
      const j = i * 3;
      let wy = (this.wPos[j + 1] ?? 0) - vy * dt;
      let wx = (this.wPos[j] ?? 0) + (rain ? -2 : Math.sin(wy + i) * 0.8) * dt;
      if (wy < -4) {
        wy += 28;
        wx = (Math.random() - 0.5) * 40;
      }
      this.wPos[j] = wx;
      this.wPos[j + 1] = wy;
    }
    this.weather.position.set(this.camera.position.x, groundH, z);
    (this.weather.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  private autoQuality(frameDt: number): void {
    if (this.quality !== 'auto' || frameDt <= 0) return;
    this.frameTimes.push(frameDt);
    if (this.frameTimes.length < 120) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    if (avg > 0.024 && this.dprCap > 1) {
      this.dprCap = Math.max(1, this.dprCap - 0.35);
      this.resize();
    }
  }

  /** Menu: a bola respira de leve na pista. */
  idle(dt: number): void {
    this.idleT += dt;
    this.render(1, dt, 0);
  }

  debugStats(): Record<string, number> {
    const info = this.renderer.info;
    return { ...this.trackView.stats(), calls: info.render.calls, geometries: info.memory.geometries, textures: info.memory.textures, origin: this.origin, zone: this.zoneId };
  }
}

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(c);
}

function starTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.translate(32, 32);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 27;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111111';
    g.lineWidth = 4;
    g.fill();
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}
