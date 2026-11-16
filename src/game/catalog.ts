/**
 * Catálogo de bolas e rastros. Desbloqueio: grátis, por conquista (id) ou comprando com moedas.
 * Preços baixos e moedas escassas: dá para conseguir tudo jogando, sem pressa.
 */
import type { AbilitySpec, AbilityKind } from '../sim/abilities';

export type Unlock = { kind: 'free' } | { kind: 'ach'; id: string } | { kind: 'coins'; price: number };

export type BallPattern =
  | { p: 'checker'; k: number; a: number; b: number }
  | { p: 'stripes'; n: number; diag?: boolean; a: number; b: number }
  | { p: 'dots'; n: number; r: number; a: number; b: number }
  | { p: 'rings'; n: number; a: number; b: number }
  | { p: 'billiard'; num: number; dark: boolean }
  | { p: 'face'; expr: 'feliz' | 'pisca' | 'bravo' | 'sono' | 'susto' | 'lingua' | 'oculos' | 'bigode' }
  | { p: 'sport'; sport: 'futebol' | 'basquete' | 'tenis' | 'volei' | 'golfe' | 'beisebol' | 'boliche' }
  | { p: 'marble'; dark: boolean }
  | { p: 'noise'; scale: number; a: number; b: number }
  | { p: 'disco' }
  | { p: 'zebra' }
  | { p: 'spots' }
  | { p: 'hex' }
  | { p: 'spiral'; n: number }
  | { p: 'code' }
  | { p: 'binary' }
  | { p: 'pixel' }
  | { p: 'waves'; n: number }
  | { p: 'diamond' }
  | { p: 'eye' }
  | { p: 'planet' }
  | { p: 'plain'; v: number }
  | { p: 'photo' };

export interface BallDef {
  id: string;
  name: string;
  pattern: BallPattern;
  roughness: number;
  metalness: number;
  clearcoat: number;
  bump: number;
  unlock: Unlock;
  ability: AbilitySpec;
}

const B = (id: string, name: string, pattern: BallPattern, unlock: Unlock, mat: Partial<Pick<BallDef, 'roughness' | 'metalness' | 'clearcoat' | 'bump'>> = {}): BallDef => ({
  id, name, pattern, unlock, roughness: mat.roughness ?? 0.32, metalness: mat.metalness ?? 0.05, clearcoat: mat.clearcoat ?? 1, bump: mat.bump ?? 0,
  ability: ABILITIES[id] ?? { kind: 'jump', name: 'Pulo', shout: 'BOING!', desc: 'Pula por cima de um bloco.', cooldown: 4, power: 1 },
});
const A = (kind: AbilityKind, name: string, shout: string, desc: string, cooldown: number, power: number): AbilitySpec => ({ kind, name, shout, desc, cooldown, power });
/** Poder de cada bola: combina com o desenho dela. */
const ABILITIES: Record<string, AbilitySpec> = {
  'xadrez': A('jump', 'Pulo', 'BOING!', 'Pula por cima de um bloco.', 4, 1.0),
  'foto': A('superJump', 'Salto da Fama', 'UHUL!', 'Um salto bem alto, digno de foto.', 8, 1.0),
  'xadrez-miudo': A('tripleHop', 'Pula-pula', 'BOING BOING!', 'Três pulinhos seguidos.', 9, 0.9),
  'xadrez-gigante': A('dash', 'Rolo Compressor', 'AMASSA!', 'Arrancada que esmaga os blocos no caminho.', 18, 0.9),
  'xadrez-noite': A('ghost', 'Sombra da Noite', 'PSST...', 'Some no escuro e atravessa blocos.', 17, 1.0),
  'xadrez-nuvem': A('glide', 'Nuvenzinha', 'FLUTUA!', 'Paraquedas: cai devagar e plana.', 10, 1.0),
  'carinha': A('jump', 'Pulinho Feliz', 'IUPI!', 'Pulo alegre por cima de um bloco.', 4, 1.05),
  'pisca': A('teleport', 'Piscadela', 'PISCOU!', 'Some e aparece mais à frente, num lugar seguro.', 16, 0.9),
  'bravinho': A('dash', 'Fúria', 'SAI DA FRENTE!', 'Arranca bravo e quebra os blocos.', 17, 1.0),
  'soneca': A('slowmo', 'Cochilo', 'ZZZ...', 'O mundo fica em câmera lenta por um instante.', 16, 1.0),
  'susto': A('superJump', 'Pulo do Susto', 'AAAH!', 'Pula alto de susto.', 8, 1.1),
  'lingua': A('tripleHop', 'Bleh-bleh-bleh', 'BLEH!', 'Três pulinhos debochados.', 9, 1.0),
  'oculos': A('ghost', 'Estilo', 'DE BOA.', 'Atravessa blocos sem nem olhar.', 16, 1.05),
  'bigode': A('shield', 'Bigodão Protetor', 'HMPF!', 'Um escudo aguenta uma batida.', 18, 1.0),
  'futebol': A('dash', 'Chute a Gol', 'GOOOL!', 'Chute forte para a frente, derrubando blocos.', 16, 1.0),
  'basquete': A('superJump', 'Enterrada', 'ENTERRA!', 'Salto altíssimo.', 8, 1.2),
  'tenis': A('teleport', 'Saque', 'ACE!', 'Saque instantâneo para a frente.', 15, 1.0),
  'volei': A('glide', 'Manchete', 'LEVANTA!', 'Sobe e plana devagar.', 10, 1.1),
  'golfe': A('rocket', 'Tacada Longa', 'FORE!', 'Voa por cima da pista por um tempo.', 18, 1.0),
  'beisebol': A('dash', 'Home Run', 'HOME RUN!', 'Rebatida: arranca e derruba tudo.', 17, 1.05),
  'boliche': A('dash', 'Strike', 'STRIKE!', 'Derruba os blocos como pinos.', 16, 1.1),
  'bilhar-8': A('teleport', 'Caçapa', 'NA CAÇAPA!', 'Some numa caçapa e sai mais à frente.', 15, 1.05),
  'bilhar-1': A('tripleHop', 'Tabela', 'TOC TOC TOC!', 'Três quiques de tabela.', 8, 1.0),
  'bilhar-3': A('jump', 'Salto de Bola', 'TOC!', 'Pulo rápido e preciso.', 3.5, 1.0),
  'bilhar-7': A('shield', 'Bola da Vez', 'DEFENDIDA!', 'Escudo que absorve uma batida.', 18, 1.05),
  'bilhar-9': A('slowmo', 'Mira', 'FOCO...', 'Câmera lenta para mirar a passagem.', 16, 1.05),
  'marmore': A('shield', 'Pedra Polida', 'TÉIM!', 'Duro feito pedra: aguenta uma batida.', 18, 1.1),
  'marmore-negro': A('freeze', 'Estátua', 'PARADOS!', 'Congela os blocos que se mexem.', 14, 1.1),
  'granito': A('dash', 'Avalanche', 'RRRUMBLE!', 'Desce rolando e esmaga blocos.', 18, 0.95),
  'concreto': A('shield', 'Muralha', 'PAREDÃO!', 'Escudo de concreto para uma batida.', 18, 0.95),
  'cromo': A('dash', 'Turbo Cromado', 'VRUUUM!', 'Arrancada brilhante que quebra blocos.', 16, 1.1),
  'grafite': A('ghost', 'Rascunho', 'APAGA!', 'Fica apagadinho e atravessa blocos.', 16, 0.95),
  'perola': A('glide', 'Bolha de Sabão', 'PLOP!', 'Flutua e cai devagarinho.', 10, 1.05),
  'disco': A('freeze', 'Pausa na Festa', 'CONGELA!', 'Para a música: os blocos móveis param.', 14, 1.0),
  'zebra': A('tripleHop', 'Galope', 'POCOTÓ!', 'Três saltos de galope.', 8, 1.1),
  'onca': A('dash', 'Bote', 'RAWR!', 'Bote rápido que derruba blocos.', 16, 1.05),
  'favo': A('shield', 'Colmeia', 'BZZZ!', 'Abelhas formam um escudo.', 18, 1.0),
  'espiral': A('slowmo', 'Hipnose', 'OLHE A ESPIRAL...', 'Hipnotiza o tempo: câmera lenta.', 16, 1.1),
  'codigo': A('teleport', 'Ctrl+V', 'CTRL+V!', 'Copia e cola a bola mais à frente.', 15, 1.0),
  'binario': A('ghost', 'Glitch', '01001!', 'Vira código e atravessa blocos.', 16, 1.0),
  'pixel': A('superJump', '8 Bits Jump', 'PLIM!', 'Salto de videogame antigo.', 7, 1.05),
  'ondas': A('glide', 'Surfe', 'AÊÊ!', 'Surfa no ar e cai devagar.', 10, 1.0),
  'losango': A('freeze', 'Cristal', 'CRIIIC!', 'Cristaliza e para os blocos móveis.', 14, 0.95),
  'olho': A('slowmo', 'Olho Vivo', 'TÔ DE OLHO!', 'Enxerga tudo em câmera lenta.', 16, 1.0),
  'planeta': A('abduct', 'Abdução', 'ME LEVA!', 'Os vizinhos de outro planeta levam a bola e soltam mais à frente.', 22, 0.95),
  'listras': A('jump', 'Pulo Listrado', 'HOP!', 'Pulo leve por cima de um bloco.', 4, 0.95),
  'listras-finas': A('teleport', 'Leitura de Código', 'BIP!', 'Escaneada: reaparece mais à frente.', 15, 0.95),
  'listras-diag': A('superJump', 'Pirulito', 'DOCINHO!', 'Salto açucarado e alto.', 8, 1.0),
  'bolinhas': A('tripleHop', 'Pipoca', 'PLOC PLOC!', 'Três pulinhos de pipoca.', 8, 0.95),
  'bolinhas-pretas': A('dash', 'Dálmata Veloz', 'AU AU!', 'Corrida de cachorro que derruba blocos.', 17, 1.0),
  'aneis': A('rocket', 'Alvo Certeiro', 'NA MOSCA!', 'Voa direto por cima da pista.', 18, 1.05),
  'lenda': A('abduct', 'Abdução Lendária', 'LEVA EU!', 'Um disco voador leva a bola e solta mais à frente.', 22, 1.0),
};

const free: Unlock = { kind: 'free' };
const coins = (price: number): Unlock => ({ kind: 'coins', price });
const ach = (id: string): Unlock => ({ kind: 'ach', id });

export const BALLS: BallDef[] = [
  B('xadrez', 'Xadrez Flow', { p: 'checker', k: 2.6, a: 232, b: 58 }, free, { bump: 0.6 }),
  B('foto', 'Minha foto', { p: 'photo' }, free),
  B('xadrez-miudo', 'Xadrez Miúdo', { p: 'checker', k: 4.6, a: 225, b: 50 }, coins(20), { bump: 0.5 }),
  B('xadrez-gigante', 'Xadrezão', { p: 'checker', k: 1.4, a: 238, b: 40 }, coins(20), { bump: 0.6 }),
  B('xadrez-noite', 'Xadrez da Madrugada', { p: 'checker', k: 2.6, a: 92, b: 28 }, ach('partidas-10'), { bump: 0.6 }),
  B('xadrez-nuvem', 'Xadrez Nuvem', { p: 'checker', k: 2.6, a: 250, b: 190 }, coins(25), { bump: 0.4 }),
  B('carinha', 'Carinha', { p: 'face', expr: 'feliz' }, coins(15), { roughness: 0.4 }),
  B('pisca', 'Piscadinha', { p: 'face', expr: 'pisca' }, coins(30)),
  B('bravinho', 'Bravinho', { p: 'face', expr: 'bravo' }, ach('batidas-25')),
  B('soneca', 'Soneca', { p: 'face', expr: 'sono' }, coins(30)),
  B('susto', 'Levou Susto', { p: 'face', expr: 'susto' }, ach('quase-30')),
  B('lingua', 'Língua de Fora', { p: 'face', expr: 'lingua' }, coins(40)),
  B('oculos', 'Óculos Escuros', { p: 'face', expr: 'oculos' }, coins(55)),
  B('bigode', 'Seu Bigode', { p: 'face', expr: 'bigode' }, coins(55)),
  B('futebol', 'Pelada', { p: 'sport', sport: 'futebol' }, coins(20), { roughness: 0.45, clearcoat: 0.5 }),
  B('basquete', 'Cesta', { p: 'sport', sport: 'basquete' }, coins(30), { roughness: 0.6, clearcoat: 0.2, bump: 0.8 }),
  B('tenis', 'Saque', { p: 'sport', sport: 'tenis' }, coins(30), { roughness: 0.8, clearcoat: 0 }),
  B('volei', 'Manchete', { p: 'sport', sport: 'volei' }, coins(30), { roughness: 0.5 }),
  B('golfe', 'Golfinho', { p: 'sport', sport: 'golfe' }, ach('partidas-5'), { roughness: 0.5, clearcoat: 0.4, bump: 1.2 }),
  B('beisebol', 'Home Run', { p: 'sport', sport: 'beisebol' }, coins(35), { roughness: 0.6 }),
  B('boliche', 'Strike', { p: 'sport', sport: 'boliche' }, coins(45), { roughness: 0.1 }),
  B('bilhar-8', 'Bola 8', { p: 'billiard', num: 8, dark: true }, ach('pontos-facil-100'), { roughness: 0.12 }),
  B('bilhar-1', 'Bola 1', { p: 'billiard', num: 1, dark: false }, coins(25), { roughness: 0.12 }),
  B('bilhar-3', 'Bola 3', { p: 'billiard', num: 3, dark: false }, coins(25), { roughness: 0.12 }),
  B('bilhar-7', 'Bola 7', { p: 'billiard', num: 7, dark: true }, coins(25), { roughness: 0.12 }),
  B('bilhar-9', 'Bola 9', { p: 'billiard', num: 9, dark: false }, coins(35), { roughness: 0.12 }),
  B('marmore', 'Mármore Flow', { p: 'marble', dark: false }, ach('diario-1'), { roughness: 0.18, bump: 0.2 }),
  B('marmore-negro', 'Mármore Negro', { p: 'marble', dark: true }, coins(70), { roughness: 0.15, bump: 0.2 }),
  B('granito', 'Granito', { p: 'noise', scale: 3, a: 200, b: 70 }, coins(35), { roughness: 0.55, bump: 0.5 }),
  B('concreto', 'Concreto', { p: 'noise', scale: 10, a: 150, b: 120 }, coins(25), { roughness: 0.9, clearcoat: 0, bump: 0.9 }),
  B('cromo', 'Cromado', { p: 'plain', v: 210 }, coins(80), { roughness: 0.04, metalness: 1 }),
  B('grafite', 'Grafite Fosco', { p: 'plain', v: 55 }, coins(40), { roughness: 0.85, clearcoat: 0 }),
  B('perola', 'Pérola', { p: 'plain', v: 240 }, coins(60), { roughness: 0.25, metalness: 0.35 }),
  B('disco', 'Globo de Festa', { p: 'disco' }, ach('pontos-qualquer-500'), { roughness: 0.08, metalness: 0.9, bump: 0.8 }),
  B('zebra', 'Zebra', { p: 'zebra' }, ach('modos-4'), { roughness: 0.4 }),
  B('onca', 'Pintadinha', { p: 'spots' }, coins(45), { roughness: 0.45 }),
  B('favo', 'Favo de Mel', { p: 'hex' }, coins(50), { bump: 0.7 }),
  B('espiral', 'Hipnose', { p: 'spiral', n: 6 }, coins(55)),
  B('codigo', 'Código </>', { p: 'code' }, coins(50)),
  B('binario', 'Binário', { p: 'binary' }, ach('distancia-total-10000')),
  B('pixel', '8 Bits', { p: 'pixel' }, coins(45), { roughness: 0.6, bump: 0.4 }),
  B('ondas', 'Ondinha', { p: 'waves', n: 6 }, coins(35)),
  B('losango', 'Losango', { p: 'diamond' }, coins(40), { bump: 0.5 }),
  B('olho', 'Olhão', { p: 'eye' }, ach('batidas-50'), { roughness: 0.15 }),
  B('planeta', 'Planetinha', { p: 'planet' }, ach('distancia-total-50000'), { roughness: 0.6, bump: 0.9 }),
  B('listras', 'Listradinha', { p: 'stripes', n: 8, a: 236, b: 45 }, coins(20)),
  B('listras-finas', 'Código de Barras', { p: 'stripes', n: 24, a: 236, b: 40 }, coins(30)),
  B('listras-diag', 'Bengala', { p: 'stripes', n: 10, diag: true, a: 240, b: 50 }, coins(35)),
  B('bolinhas', 'Bolinhas', { p: 'dots', n: 10, r: 0.28, a: 240, b: 35 }, coins(20)),
  B('bolinhas-pretas', 'Dálmata', { p: 'dots', n: 7, r: 0.22, a: 35, b: 240 }, coins(30)),
  B('aneis', 'Alvo', { p: 'rings', n: 6, a: 240, b: 40 }, ach('nivel-facil-5')),
  B('lenda', 'Lenda Flow', { p: 'checker', k: 3.3, a: 255, b: 0 }, ach('conquistas-100'), { roughness: 0.05, metalness: 0.6, bump: 0.6 }),
];

export type TrailRibbon = 'none' | 'line' | 'wide' | 'dash' | 'double' | 'zigzag';
export type TrailParticle = 'none' | 'dot' | 'square' | 'star' | 'spark' | 'smoke' | 'ring' | 'confetti' | 'heart' | 'note' | 'bubble' | 'pixel';
export type TrailMotion = 'fall' | 'float' | 'spiral' | 'still' | 'burst';
export type TrailShade = 'white' | 'light' | 'gray' | 'accent';

export interface TrailDef {
  id: string;
  name: string;
  ribbon: TrailRibbon;
  particle: TrailParticle;
  shade: TrailShade;
  density: number; // partículas por quadro
  size: number;
  life: number; // s
  motion: TrailMotion;
  unlock: Unlock;
}

const T = (id: string, name: string, ribbon: TrailRibbon, particle: TrailParticle, shade: TrailShade, motion: TrailMotion, unlock: Unlock, density = 1, size = 1, life = 0.5): TrailDef => ({ id, name, ribbon, particle, shade, motion, unlock, density, size, life });

export const TRAILS: TrailDef[] = [
  T('classico', 'Clássico', 'line', 'dot', 'white', 'fall', free, 1, 1, 0.3),
  T('nenhum', 'Sem rastro', 'none', 'none', 'white', 'still', free, 0),
  T('giz', 'Giz', 'line', 'none', 'light', 'still', coins(15)),
  T('pneu', 'Marca de Pneu', 'double', 'none', 'gray', 'still', coins(15)),
  T('faixa', 'Faixa Larga', 'wide', 'none', 'white', 'still', coins(20)),
  T('tracejado', 'Tracejado', 'dash', 'none', 'white', 'still', coins(20)),
  T('raio', 'Zigue-zague', 'zigzag', 'none', 'white', 'still', coins(30)),
  T('neon', 'Neon do Km', 'line', 'dot', 'accent', 'float', ach('nivel-facil-3'), 1.5, 1, 0.5),
  T('faisca', 'Faísca', 'line', 'spark', 'white', 'burst', coins(30), 2, 0.8, 0.35),
  T('fumaca', 'Fumacinha', 'none', 'smoke', 'gray', 'float', coins(25), 1.2, 2, 0.9),
  T('estrelas', 'Estrelinhas', 'none', 'star', 'white', 'float', coins(35), 1, 1.4, 0.8),
  T('coracoes', 'Coraçõezinhos', 'none', 'heart', 'white', 'float', coins(40), 0.8, 1.4, 0.9),
  T('notas', 'Musiquinha', 'none', 'note', 'light', 'float', coins(40), 0.7, 1.5, 1),
  T('bolhas', 'Bolhas', 'none', 'bubble', 'light', 'float', coins(30), 0.8, 1.6, 1.1),
  T('confete', 'Festa', 'none', 'confetti', 'light', 'fall', ach('recordes-5'), 2, 1, 0.9),
  T('pixels', 'Pixels', 'dash', 'pixel', 'white', 'fall', coins(35), 1.5, 1, 0.6),
  T('aneis', 'Ondas', 'none', 'ring', 'white', 'still', coins(35), 0.5, 2, 0.7),
  T('cometa', 'Cometa', 'wide', 'spark', 'white', 'fall', ach('pontos-qualquer-1000'), 2.5, 1, 0.5),
  T('quadrados', 'Quadradinhos', 'none', 'square', 'light', 'spiral', coins(30), 1.2, 1, 0.7),
  T('poeira', 'Poeira', 'none', 'dot', 'gray', 'fall', coins(15), 2, 0.7, 0.6),
  T('espiral', 'Redemoinho', 'none', 'dot', 'white', 'spiral', coins(45), 2, 0.9, 0.8),
  T('neve', 'Floquinhos', 'none', 'star', 'light', 'fall', ach('zona-5'), 1.5, 0.8, 1),
  T('fantasma', 'Fantasminha', 'wide', 'smoke', 'light', 'float', coins(50), 1, 2.2, 1.1),
  T('turbo', 'Turbo', 'double', 'spark', 'accent', 'burst', ach('aceleradores-25'), 2.5, 0.9, 0.35),
  T('arco', 'Arco do Km', 'wide', 'none', 'accent', 'still', ach('nivel-medio-5'), 0),
  T('chuva', 'Chuvinha', 'line', 'dot', 'light', 'fall', ach('zona-7'), 2, 0.6, 0.5),
  T('estrela-cadente', 'Estrela Cadente', 'line', 'star', 'white', 'fall', coins(60), 1.2, 1.2, 0.6),
  T('cardiaco', 'Batimento', 'zigzag', 'heart', 'accent', 'still', coins(55), 0.4, 1.2, 0.8),
  T('dj', 'Pista de Dança', 'dash', 'note', 'accent', 'float', coins(60), 0.8, 1.5, 0.9),
  T('festa-neon', 'Festa Neon', 'line', 'confetti', 'accent', 'burst', coins(70), 2, 1, 0.8),
  T('bolha-neon', 'Bolhas do Km', 'none', 'bubble', 'accent', 'float', coins(45), 0.9, 1.6, 1.1),
  T('estrela-neon', 'Estrelas do Km', 'none', 'star', 'accent', 'spiral', coins(55), 1.2, 1.2, 0.8),
  T('pixel-neon', 'Arcade', 'zigzag', 'pixel', 'accent', 'fall', coins(65), 1.5, 1, 0.7),
  T('vapor', 'Vapor', 'none', 'smoke', 'white', 'float', coins(35), 1.5, 2.5, 1.2),
  T('rastro-duplo', 'Trilho de Trem', 'double', 'square', 'gray', 'still', coins(40), 0.4, 0.8, 0.8),
  T('serpentina', 'Serpentina', 'zigzag', 'confetti', 'white', 'fall', coins(50), 1.5, 1, 0.8),
  T('vaga-lume', 'Vaga-lumes', 'none', 'dot', 'accent', 'float', ach('tempo-facil-120'), 0.6, 1.8, 1.4),
  T('aneis-neon', 'Ondas do Km', 'none', 'ring', 'accent', 'still', coins(45), 0.5, 2, 0.7),
  T('faisca-neon', 'Faísca do Km', 'line', 'spark', 'accent', 'burst', coins(45), 2, 0.8, 0.35),
  T('poeira-estelar', 'Poeira Estelar', 'none', 'star', 'gray', 'spiral', coins(35), 2, 0.7, 0.9),
  T('meteoro', 'Meteoro', 'wide', 'smoke', 'white', 'fall', ach('nivel-dificil-5'), 2, 1.6, 0.6),
  T('raio-neon', 'Raio do Km', 'zigzag', 'spark', 'accent', 'burst', ach('nivel-extremo-3'), 2, 0.8, 0.4),
  T('tinta', 'Pincelada', 'wide', 'dot', 'light', 'still', coins(30), 1, 1.4, 0.5),
  T('marcador', 'Marca-Texto', 'wide', 'none', 'accent', 'still', coins(25)),
  T('zen', 'Zen', 'line', 'ring', 'light', 'float', coins(40), 0.3, 2.5, 1.3),
  T('bagunca', 'Bagunça', 'dash', 'confetti', 'accent', 'spiral', coins(75), 2.5, 1.1, 0.9),
  T('sorriso', 'Sorrisinho', 'none', 'heart', 'light', 'spiral', coins(45), 1, 1.2, 0.9),
  T('codigo', 'Código </>', 'dash', 'pixel', 'white', 'float', coins(50), 1, 1, 0.9),
  T('lenda', 'Rastro da Lenda', 'double', 'star', 'accent', 'spiral', ach('conquistas-200'), 2, 1.3, 0.9),
  T('flow', 'Flow', 'wide', 'spark', 'white', 'burst', ach('partidas-100'), 2, 1, 0.5),
];

export function findBall(id: string): BallDef | undefined {
  return BALLS.find((b) => b.id === id);
}
export function findTrail(id: string): TrailDef | undefined {
  return TRAILS.find((t) => t.id === id);
}
