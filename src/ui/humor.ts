/** Textos engraçados (curtos; sem exagero). Sorteio sem repetir os últimos. */
export const GAMEOVER: Record<'hit' | 'fall', string[]> = {
  hit: [
    'O bloco nem se mexeu. Você, sim.',
    'Beijou o bloco. Ele não retribuiu.',
    'Isso foi um abraço muito forte.',
    'O bloco pediu para avisar: ele estava ali primeiro.',
    'Batida registrada. Seguro não cobre.',
    'Plano: desviar. Execução: criativa.',
    'Faltou só um tiquinho para a esquerda. Ou direita.',
    'O bloco agradece a visita.',
    'Você testou a resistência do bloco. Ele passou.',
    'Esse bloco vai contar essa história por anos.',
  ],
  fall: [
    'A bola foi conhecer o andar de baixo.',
    'Tchau, bolinha! Manda notícias.',
    'Saiu da pista para buscar um café.',
    'A gravidade venceu esta rodada.',
    'Atalho encontrado. Infelizmente para baixo.',
    'Pista? Que pista?',
    'Ela só queria ver a vista lá de baixo.',
    'Rolou para fora da sua vida. Por enquanto.',
    'Missão: ficar na pista. Status: quase.',
    'Faltou chão. Sobrou coragem.',
  ],
};

export const BOOM_HIT = ['PLOFT!', 'BONK!', 'TUM!', 'POF!', 'OPA!', 'CATAPLOFT!'];
export const BOOM_FALL = ['AAAAA...', 'TCHAUUU!', 'UÉ?', 'FIIIIU...'];
export const BOOM_NEAR = ['UFA!', 'RASPOU!', 'POR POUCO!', 'UUH!'];
export const BOOM_JUMP = ['IÚÚ!', 'VOOU!', 'OPA!'];
export const RECORD_LINES = ['NOVO RECORDE!', 'RECORDE BATIDO!', 'ISSO É HISTÓRICO!'];

const recent = new Map<string[], string[]>();
export function pick(list: string[]): string {
  const last = recent.get(list) ?? [];
  const pool = list.filter((s) => !last.includes(s));
  const v = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length ? pool.length : list.length))] ?? list[0] ?? '';
  last.push(v);
  if (last.length > Math.min(3, list.length - 1)) last.shift();
  recent.set(list, last);
  return v;
}
