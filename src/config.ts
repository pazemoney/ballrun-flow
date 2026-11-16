/** Configuração central — altere aqui. */
export const APP_VERSION = '4.0.0';
/** Site oficial da Flow (botão "Site oficial"; nunca é necessário para jogar). */
export const SITE_URL = 'https://flowgroupbr.site';
export const SITE_LABEL = 'flowgroupbr.site';
/** Instagram oficial da Flow (mesmo perfil configurado no site da Flow: Fe-no-pai/src/config/site.ts). */
export const INSTAGRAM_URL = 'https://www.instagram.com/flowgroup.br/';
export const INSTAGRAM_LABEL = '@flowgroup.br';
/** TikTok oficial da Flow (verificado em 2026-11-16: @flowgroupbr, bio aponta para flowgroupbr.site). */
export const TIKTOK_URL = 'https://www.tiktok.com/@flowgroupbr';
export const TIKTOK_LABEL = '@flowgroupbr';
/** WhatsApp oficial da Flow (créditos). */
export const WHATSAPP_URL = 'https://wa.me/5527992785043';
/** Endereço do jogo online (Vercel, repositório pazemoney/ballrun-flow). */
export const GAME_URL = 'https://ballrun-flow.vercel.app';
/**
 * Instaladores publicados pelo próprio site (pasta downloads/ do repositório, gravada pelo CI na main).
 * No site usa caminho relativo (funciona em qualquer domínio); nos apps, o endereço completo.
 */
export const DOWNLOADS = {
  android: { file: 'downloads/BallRun-Flow.apk', label: 'Baixar APK (Android)' },
  ios: { file: 'downloads/BallRun-Flow.ipa', label: 'Baixar IPA (iPhone)' },
};
