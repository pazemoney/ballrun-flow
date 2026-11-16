import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';

/**
 * Só no site (a Vercel define VERCEL=1): copia downloads/ (APK e IPA) para dist/downloads.
 * Os apps nativos NÃO levam os instaladores dentro deles.
 */
const downloads = {
  name: 'ballrun-downloads',
  closeBundle() {
    if (process.env.VERCEL || process.env.WITH_DOWNLOADS) {
      if (existsSync('downloads')) cpSync('downloads', 'dist/downloads', { recursive: true });
    }
  },
};

// base relativa: o mesmo build serve a Vercel (HTTPS) e os apps Capacitor (arquivos locais).
export default defineConfig({
  base: './',
  plugins: [downloads],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
} as never);
