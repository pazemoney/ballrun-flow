// Gera o ícone do Ball Run (1024×1024) a partir de icone.html + fundo.png (quadro real do jogo).
// Uso: node scripts/icone/gerar.cjs  → icone-1024.png (iPhone/site) e icone-android-1024.png (área segura do Android); depois: python3 scripts/icone/aplicar.py
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
  const p = await (await b.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 })).newPage();
  for (const [hash, out] of [['', 'icone-1024.png'], ['#android', 'icone-android-1024.png']]) {
    await p.goto('file://' + __dirname + '/icone.html' + hash);
    await p.reload();
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(200);
    await p.screenshot({ path: __dirname + '/' + out });
  }
  await b.close();
})();
