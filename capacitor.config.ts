import type { CapacitorConfig } from '@capacitor/cli';

// Os apps carregam os arquivos locais de dist/ (sem server.url): o jogo roda offline.
const config: CapacitorConfig = {
  appId: 'site.flowgroupbr.ballrun',
  appName: 'Ball Run',
  webDir: 'dist',
  backgroundColor: '#07060c',
  android: { allowMixedContent: false },
  ios: { contentInset: 'never', backgroundColor: '#07060c' },
};

export default config;
