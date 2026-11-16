import { MODES, MODE_PARAMS, type Mode } from '../sim/difficulty';
import { ZONES } from '../sim/zones';
import type { SaveData } from '../storage/save';

export interface AchDef {
  id: string;
  name: string;
  desc: string;
  group: string;
  target: number;
  metric: (s: SaveData) => number;
  reward: number; // moedas
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
const fmt = (n: number) => n.toLocaleString('pt-BR');
const km = (u: number) => (u >= 1000 ? `${fmt(u / 1000)} km` : `${u} m`);
const tempo = (sec: number) => (sec >= 3600 ? `${sec / 3600} h` : sec >= 60 ? `${sec / 60} min` : `${sec} s`);
const maxOf = (r: Record<Mode, number>) => Math.max(...MODES.map((m) => r[m]));

const list: AchDef[] = [];
function family(group: string, title: string, values: number[], id: (v: number) => string, desc: (v: number) => string, metric: (s: SaveData) => number, rewardBase = 1): void {
  values.forEach((v, i) => {
    list.push({ id: id(v), name: `${title} ${ROMAN[i] ?? i + 1}`, desc: desc(v), group, target: v, metric, reward: Math.min(25, rewardBase + i * 2) });
  });
}

// ---- pontos ----
for (const m of MODES) {
  const L = MODE_PARAMS[m].label;
  family('Pontos', `Pontuador ${L}`, [50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 15000, 20000], (v) => `pontos-${m}-${v}`, (v) => `Faça ${fmt(v)} pontos no ${L}`, (s) => s.records[m]);
}
family('Pontos', 'Craque', [100, 250, 500, 1000, 2500, 5000], (v) => `pontos-qualquer-${v}`, (v) => `Faça ${fmt(v)} pontos em qualquer modo`, (s) => Math.max(maxOf(s.records), s.daily.best), 2);
family('Pontos', 'Acumulador', [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000], (v) => `pontos-total-${v}`, (v) => `Some ${fmt(v)} pontos no total`, (s) => s.stats.totalScore);

// ---- níveis (aceleradores) ----
for (const m of MODES) {
  const L = MODE_PARAMS[m].label;
  family('Níveis', `Pé no fundo ${L}`, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30], (v) => `nivel-${m}-${v}`, (v) => `Chegue ao nível ${v} no ${L}`, (s) => s.bestLevel[m], 2);
}
family('Níveis', 'Turbinado', [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500], (v) => `aceleradores-${v}`, (v) => `Passe por ${fmt(v)} aceleradores no total`, (s) => s.stats.levels);
family('Níveis', 'Escalada', [2, 3, 4, 5, 7, 10, 15, 20, 25, 30, 40, 50], (v) => `aceleradores-partida-${v}`, (v) => `Passe ${v} aceleradores numa única partida`, (s) => s.stats.bestRunLevels, 2);
family('Níveis', 'Papa-léguas', [40, 50, 60, 70, 80, 90, 100, 110, 120, 135, 150], (v) => `velocidade-${v}`, (v) => `Atinja ${v} km/h`, (s) => Math.floor(s.stats.maxSpeed * 3.6));

// ---- distância ----
family('Distância', 'Estradeiro', [250, 500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000], (v) => `dist-partida-${v}`, (v) => `Percorra ${km(v)} numa partida`, (s) => maxOf(s.bestDist));
for (const m of MODES) {
  const L = MODE_PARAMS[m].label;
  family('Distância', `Maratonista ${L}`, [500, 1000, 2000, 3000, 5000, 10000], (v) => `dist-${m}-${v}`, (v) => `Percorra ${km(v)} numa partida do ${L}`, (s) => s.bestDist[m], 2);
  family('Distância', `Quilometragem ${L}`, [5000, 20000, 50000, 100000, 250000], (v) => `km-${m}-${v}`, (v) => `Some ${km(v)} no ${L}`, (s) => s.stats.distByMode[m], 2);
}
family('Distância', 'Viajante', [1000, 2500, 5000, 10000, 20000, 30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000, 750000, 1000000], (v) => `distancia-total-${v}`, (v) => `Some ${km(v)} rolados no total`, (s) => s.stats.distance);

// ---- tempo ----
for (const m of MODES) {
  const L = MODE_PARAMS[m].label;
  family('Tempo', `Resistência ${L}`, [30, 60, 120, 180, 300, 600, 1200, 3600], (v) => `tempo-${m}-${v}`, (v) => `Sobreviva ${tempo(v)} numa partida do ${L}`, (s) => s.bestTime[m], 2);
}
family('Tempo', 'Viciado (no bom sentido)', [600, 1800, 3600, 7200, 18000, 36000, 72000, 180000], (v) => `tempo-total-${v}`, (v) => `Jogue ${tempo(v)} no total`, (s) => s.stats.time);

// ---- partidas ----
family('Partidas', 'Persistente', [1, 3, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000], (v) => `partidas-${v}`, (v) => `Jogue ${fmt(v)} partida${v > 1 ? 's' : ''}`, (s) => s.stats.games);
for (const m of MODES) {
  const L = MODE_PARAMS[m].label;
  family('Partidas', `Fã do ${L}`, [1, 5, 10, 25, 50, 100, 250, 500], (v) => `partidas-${m}-${v}`, (v) => `Jogue ${fmt(v)} partida${v > 1 ? 's' : ''} no ${L}`, (s) => s.stats.runsByMode[m]);
}
family('Partidas', 'Explorador', [2, 3, 4], (v) => `modos-${v}`, (v) => `Jogue em ${v} modos diferentes`, (s) => s.stats.modesPlayed.length, 2);
family('Partidas', 'Aprendiz', [1, 5, 10], (v) => `treino-${v}`, (v) => `Faça ${v} treino${v > 1 ? 's' : ''} guiado${v > 1 ? 's' : ''}`, (s) => s.stats.practice);
family('Partidas', 'Freguês', [2, 3, 5, 7, 14, 30, 60, 100, 200, 365], (v) => `dias-${v}`, (v) => `Jogue em ${v} dias diferentes`, (s) => s.stats.days.length, 2);
family('Partidas', 'Quebra-recorde', [1, 5, 10, 25, 50, 100], (v) => `recordes-${v}`, (v) => `Bata seu recorde ${v} vez${v > 1 ? 'es' : ''}`, (s) => s.stats.recordsBroken, 2);

// ---- estilo (humor) ----
family('Estilo', 'Canguru', [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000], (v) => `saltos-${v}`, (v) => `Salte ${fmt(v)} vão${v > 1 ? 's' : ''}`, (s) => s.stats.jumps);
family('Estilo', 'Pula-pula', [3, 5, 10, 20, 30, 50], (v) => `saltos-partida-${v}`, (v) => `Salte ${v} vãos numa partida`, (s) => s.stats.bestRunJumps, 2);
family('Estilo', 'Por um triz', [1, 10, 30, 50, 100, 250, 500, 1000, 2500, 5000], (v) => `quase-${v}`, (v) => `Passe raspando em ${fmt(v)} obstáculo${v > 1 ? 's' : ''}`, (s) => s.stats.nearMiss);
family('Estilo', 'Raspão profissional', [3, 5, 10, 20, 30, 50], (v) => `quase-partida-${v}`, (v) => `Passe raspando ${v} vezes numa partida`, (s) => s.stats.bestRunNear, 2);
family('Estilo', 'Beijoqueiro', [1, 10, 25, 50, 100, 250, 500, 1000], (v) => `batidas-${v}`, (v) => `Bata em ${fmt(v)} bloco${v > 1 ? 's' : ''} (eles nem ligam)`, (s) => s.stats.hits);
family('Estilo', 'Paraquedista', [1, 10, 25, 50, 100, 250, 500, 1000], (v) => `quedas-${v}`, (v) => `Caia da pista ${fmt(v)} vez${v > 1 ? 'es' : ''}`, (s) => s.stats.falls);
list.push({ id: 'foto', name: 'Essa bola sou eu', desc: 'Use uma foto sua na bola', group: 'Estilo', target: 1, metric: (s) => (s.stats.photoUsed ? 1 : 0), reward: 5 });

// ---- ambientes ----
ZONES.forEach((z) => {
  list.push({ id: `zona-${z.id}`, name: `Turista: ${z.name}`, desc: `Visite o ambiente ${z.name}`, group: 'Ambientes', target: 1, metric: (s) => ((s.stats.zoneDist[z.id] ?? 0) > 0 ? 1 : 0), reward: 2 });
  family('Ambientes', `Morador: ${z.name}`, [500, 2000, 5000, 10000, 25000], (v) => `zona-${z.id}-${v}`, (v) => `Role ${km(v)} no ${z.name}`, (s) => s.stats.zoneDist[z.id] ?? 0, 2);
});
list.push({ id: 'zonas-todas', name: 'Volta ao mundo', desc: 'Visite os 8 ambientes', group: 'Ambientes', target: ZONES.length, metric: (s) => s.stats.zoneDist.filter((d) => d > 0).length, reward: 15 });

// ---- moedas e coleção ----
family('Coleção', 'Cofrinho', [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000], (v) => `moedas-${v}`, (v) => `Ganhe ${fmt(v)} moedas no total`, (s) => s.coinsEarned);
family('Coleção', 'Poupança', [50, 100, 200, 500, 1000], (v) => `moedas-saldo-${v}`, (v) => `Junte ${fmt(v)} moedas de saldo`, (s) => s.coins);
family('Coleção', 'Gastador', [10, 50, 100, 250, 500, 1000, 2500], (v) => `gastou-${v}`, (v) => `Gaste ${fmt(v)} moedas na loja`, (s) => s.coinsSpent);
family('Coleção', 'Colecionador de bolas', [3, 5, 10, 15, 20, 25, 30, 40, 50], (v) => `bolas-${v}`, (v) => `Tenha ${v} bolas`, (s) => s.stats.ownedBalls, 2);
family('Coleção', 'Rastreador', [3, 5, 10, 15, 20, 25, 30, 40, 50], (v) => `rastros-${v}`, (v) => `Tenha ${v} rastros`, (s) => s.stats.ownedTrails, 2);

// ---- desafio do dia ----
family('Desafio do dia', 'Desafiante', [1, 3, 5, 10, 20, 30, 50, 100], (v) => `diario-${v}`, (v) => `Conclua ${v} desafio${v > 1 ? 's' : ''} do dia`, (s) => s.stats.dailyDone, 3);
family('Desafio do dia', 'Teimoso', [1, 10, 25, 50, 100], (v) => `diario-tentativas-${v}`, (v) => `Tente ${v} vez${v > 1 ? 'es' : ''} o desafio do dia`, (s) => s.stats.dailyAttempts);

// ---- metaconquistas ----
family('Conquistas', 'Caçador de conquistas', [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450], (v) => `conquistas-${v}`, (v) => `Desbloqueie ${v} conquistas`, (s) => s.achievements.length, 3);

export const ACHIEVEMENT_LIST: readonly AchDef[] = list;
export const ACH_BY_ID = new Map(list.map((a) => [a.id, a]));
export const ACH_GROUPS = [...new Set(list.map((a) => a.group))];

/** Marca as conquistas alcançadas (repete até estabilizar: metaconquistas e saldo). Devolve as novas. */
export function checkAchievements(s: SaveData): AchDef[] {
  const got = new Set(s.achievements);
  const fresh: AchDef[] = [];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const a of list) {
      if (got.has(a.id)) continue;
      if (a.metric(s) >= a.target) {
        got.add(a.id);
        s.achievements.push(a.id);
        s.coins += a.reward;
        s.coinsEarned += a.reward;
        fresh.push(a);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return fresh;
}
