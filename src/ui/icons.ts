import type { Mode } from '../sim/difficulty';

export const ICON = {
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  ball: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/></svg>',
  insta: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/></svg>',
  whats: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1.2 1.8.8c-.2 1-1 1.7-2 1.7A6.3 6.3 0 0 1 8 9c0-1 .7-1.8 1.7-2l.8 1.8z"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  coin: '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#f2f2f4" stroke="#0b0b0f" stroke-width="1.5"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#0b0b0f" stroke-width="1.4"/><path d="M10.3 9.6l-1.8 2.4 1.8 2.4M13.7 9.6l1.8 2.4-1.8 2.4" fill="none" stroke="#0b0b0f" stroke-width="1.3" stroke-linecap="round"/></svg>',
  lock: '<svg class="lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  home: '<svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>',
};

/** Rostos do seletor de dificuldade (desenho próprio, monocromático). */
export function faceSvg(mode: Mode, shade: string): string {
  const ink = '#0b0b0f';
  const eyes: Record<Mode, string> = {
    facil: `<circle cx="35" cy="42" r="6" fill="${ink}"/><circle cx="65" cy="42" r="6" fill="${ink}"/>`,
    medio: `<rect x="29" y="38" width="12" height="9" rx="4" fill="${ink}"/><rect x="59" y="38" width="12" height="9" rx="4" fill="${ink}"/>`,
    dificil: `<path d="M26 34l16 8M74 34l-16 8" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><circle cx="36" cy="47" r="5" fill="${ink}"/><circle cx="64" cy="47" r="5" fill="${ink}"/>`,
    extremo: `<path d="M27 36l9 6-6 3 10 6M73 36l-9 6 6 3-10 6" stroke="${ink}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
  };
  const mouth: Record<Mode, string> = {
    facil: `<path d="M33 62q17 14 34 0" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    medio: `<path d="M35 66h30" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`,
    dificil: `<path d="M34 72q16-12 32 0" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
    extremo: `<path d="M30 70l8-6 6 6 6-6 6 6 6-6 8 6" stroke="${ink}" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
  };
  // chifrinhos do EXTREMO (desenhados atrás da cabeça)
  const horns = mode === 'extremo'
    ? `<g class="horns"><path d="M24 30 C14 18 14 6 22 0 C22 10 28 18 38 22 Z" fill="${shade}" stroke="#0b0b0f" stroke-width="3" stroke-linejoin="round"/><path d="M76 30 C86 18 86 6 78 0 C78 10 72 18 62 22 Z" fill="${shade}" stroke="#0b0b0f" stroke-width="3" stroke-linejoin="round"/></g>`
    : '';
  return `<svg class="face face-${mode}" viewBox="0 -4 100 104" aria-hidden="true">${horns}<circle cx="50" cy="52" r="40" fill="${shade}"/><circle cx="50" cy="52" r="40" fill="url(#shine)"/><g transform="translate(0 2)"><g class="eyes">${eyes[mode]}</g>${mouth[mode]}</g><defs><radialGradient id="shine" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs></svg>`;
}
