/**
 * Poderes especiais das bolas (toque duplo na tela / Espaço / duplo clique).
 * 12 mecânicas; cada bola combina uma mecânica com parâmetros, nome, grito e efeito visual próprios.
 * Equilíbrio: ajudam a passar um trecho, com recarga longa; nenhuma deixa a bola imortal por muito tempo.
 */
export type AbilityKind =
  | 'jump' | 'superJump' | 'tripleHop' | 'dash' | 'ghost' | 'shield'
  | 'slowmo' | 'freeze' | 'teleport' | 'abduct' | 'rocket' | 'glide';

export interface AbilitySpec {
  kind: AbilityKind;
  name: string; // nome do poder (aparece na loja e no HUD)
  shout: string; // onomatopeia ao usar
  desc: string;
  cooldown: number; // s
  power: number; // 0.8..1.2 (força/duração relativa)
}

/** Limites de cada mecânica (o power escala dentro deles). */
export const ABILITY_BASE: Record<AbilityKind, { duration: number; minCooldown: number }> = {
  jump: { duration: 0, minCooldown: 3 },
  superJump: { duration: 0, minCooldown: 7 },
  tripleHop: { duration: 0, minCooldown: 8 },
  dash: { duration: 0.75, minCooldown: 16 },
  ghost: { duration: 1.3, minCooldown: 16 },
  shield: { duration: 7, minCooldown: 18 },
  slowmo: { duration: 2.6, minCooldown: 16 },
  freeze: { duration: 3.5, minCooldown: 14 },
  teleport: { duration: 0, minCooldown: 15 },
  abduct: { duration: 1.6, minCooldown: 22 },
  rocket: { duration: 1.4, minCooldown: 18 },
  glide: { duration: 3, minCooldown: 10 },
};

export const ABILITY_ICON: Record<AbilityKind, string> = {
  jump: '⤒', superJump: '⇑', tripleHop: '≋', dash: '➤', ghost: '◌', shield: '◯',
  slowmo: '◷', freeze: '✻', teleport: '✦', abduct: '⌓', rocket: '▲', glide: '☂',
};
