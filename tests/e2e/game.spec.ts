import { test, expect, type Page } from '@playwright/test';

type Dbg = { state: string; score: number; dist: number; ballX: number; targetX: number; simState: string; steps: number; time: number; tutorialOn: boolean; tutorialRuns: number; hintVisible: boolean; render: Record<string, number> };
const dbg = (page: Page) => page.evaluate(() => (window as unknown as { __ballrun: { debug: () => Dbg } }).__ballrun.debug());

async function open(page: Page, errors: string[]) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
}

/** Arrasto de dedo/mouse sobre a área de jogo. */
async function drag(page: Page, dx: number) {
  const vp = page.viewportSize()!;
  const y = vp.height * 0.75;
  const x0 = vp.width / 2;
  const isTouch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  if (isTouch) {
    // eventos de ponteiro do tipo toque (como no celular)
    await page.locator('#touch').dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: x0, clientY: y, isPrimary: true });
    for (let i = 1; i <= 8; i++) await page.locator('#touch').dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x0 + (dx * i) / 8, clientY: y, isPrimary: true });
    await page.locator('#touch').dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x0 + dx, clientY: y, isPrimary: true });
  } else {
    await page.mouse.move(x0, y);
    await page.mouse.down();
    await page.mouse.move(x0 + dx, y, { steps: 8 });
    await page.mouse.up();
  }
}

test('carrega o menu sem erros e sem rolagem lateral', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await expect(page.locator('.menu h1')).toHaveText('BALL RUN');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // nada cortado: JOGAR inteiro dentro da tela
  const b = await page.getByTestId('play').boundingBox();
  const vp = page.viewportSize()!;
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(vp.width);
  expect(errors).toEqual([]);
});

test('partida: joga, controla, pausa, retoma, reinicia e volta ao menu', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('play').click();
  await expect(page.locator('.hud')).toBeVisible();
  await expect.poll(async () => (await dbg(page)).dist, { timeout: 15000 }).toBeGreaterThan(3);
  const d = await dbg(page);
  expect(d.state).toBe('playing');
  // controle: arrastar para a direita move o alvo e a bola
  const x0 = d.ballX;
  await drag(page, 70);
  await expect.poll(async () => (await dbg(page)).targetX, { timeout: 5000 }).toBeGreaterThan(x0 + 0.3);
  await expect.poll(async () => (await dbg(page)).ballX, { timeout: 5000 }).toBeGreaterThan(x0 + 0.2);
  // pausa congela física, tempo e pontuação
  await page.locator('[data-act=pause]').click();
  await expect(page.getByTestId('resume')).toBeVisible();
  const p1 = await dbg(page);
  await page.waitForTimeout(1000);
  const p2 = await dbg(page);
  expect(p2.state).toBe('paused');
  expect(p2.steps).toBe(p1.steps);
  expect(p2.score).toBe(p1.score);
  // retomar não teletransporta
  await page.getByTestId('resume').click();
  await page.waitForTimeout(200);
  const p3 = await dbg(page);
  expect(p3.state).toBe('playing');
  expect(p3.dist - p2.dist).toBeLessThan(10);
  expect(p3.dist).toBeGreaterThanOrEqual(p2.dist);
  // reiniciar zera a partida
  await page.locator('[data-act=pause]').click();
  await page.getByTestId('restart').click();
  await page.waitForTimeout(300);
  const r = await dbg(page);
  expect(r.state).toBe('playing');
  expect(r.dist).toBeLessThan(p3.dist);
  // menu
  await page.locator('[data-act=pause]').click();
  await page.getByTestId('to-menu').click();
  await expect(page.locator('.menu')).toBeVisible();
  expect((await dbg(page)).state).toBe('menu');
  expect(errors).toEqual([]);
});

test('fim de partida ao cair da pista; jogar novamente; toque duplo não abre duas partidas', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  const before = (await dbg(page)).tutorialRuns;
  await page.getByTestId('play').dblclick();
  await page.waitForTimeout(400);
  expect((await dbg(page)).tutorialRuns).toBe(before + 1);
  // empurra a bola para fora da pista
  for (let i = 0; i < 4; i++) await drag(page, 160);
  await expect(page.getByTestId('again')).toBeVisible({ timeout: 15000 });
  expect((await dbg(page)).state).toBe('gameover');
  await expect(page.getByTestId('final-score')).toBeVisible();
  await page.getByTestId('again').click();
  await page.waitForTimeout(500);
  expect((await dbg(page)).state).toBe('playing');
  expect(errors).toEqual([]);
});

test('teclado no computador e Esc pausa', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'só no desktop');
  const errors: string[] = [];
  await open(page, errors);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const x0 = (await dbg(page)).ballX;
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await dbg(page)).ballX, { timeout: 5000 }).toBeLessThan(x0 - 0.5);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.press('Escape');
  expect((await dbg(page)).state).toBe('paused');
  await page.keyboard.press('Escape');
  expect((await dbg(page)).state).toBe('playing');
  expect(errors).toEqual([]);
});

test('tutorial some depois de 5 partidas, mesmo após recarregar', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  for (let i = 1; i <= 6; i++) {
    await page.getByTestId('play').click();
    await page.waitForTimeout(300);
    const d = await dbg(page);
    expect(d.tutorialOn, `partida ${i}`).toBe(i <= 5);
    expect(d.hintVisible, `dica na partida ${i}`).toBe(i <= 5);
    await page.locator('[data-act=pause]').click();
    await page.getByTestId('to-menu').click();
    if (i === 3) {
      await page.reload();
      await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
    }
  }
  expect(errors).toEqual([]);
});

test('dificuldade, ajustes e recordes persistem após recarregar', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('[data-act=mode][data-mode=extremo]').click();
  await expect(page.locator('.diff-name')).toHaveText('EXTREMO');
  await page.locator('[data-act=settings]').click();
  await page.locator('[data-key=music]').click();
  await page.locator('.sheet [data-act=close]').click();
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.diff-name')).toHaveText('EXTREMO');
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('[data-key=music]')).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});

test('todos os botões do menu abrem e fecham', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  for (const act of ['records', 'settings', 'help', 'daily', 'ball', 'achievements', 'credits', 'downloads']) {
    await page.locator(`.menu [data-act=${act}]`).first().click();
    await expect(page.locator('.overlay .sheet')).toBeVisible();
    await page.locator('.overlay [data-act=close]').last().click();
    await expect(page.locator('.overlay')).toBeHidden();
  }
  // seletor por setas
  await page.locator('[data-act=next]').click();
  await expect(page.locator('.diff-name')).toHaveText('MÉDIO');
  await page.locator('[data-act=prev]').click();
  await expect(page.locator('.diff-name')).toHaveText('FÁCIL');
  // desafio do dia e treino guiado iniciam partidas
  await page.locator('.menu [data-act=daily]').click();
  await page.locator('[data-act=playdaily]').click();
  await page.waitForTimeout(300);
  expect((await dbg(page)).state).toBe('playing');
  await page.locator('[data-act=pause]').click();
  await page.getByTestId('to-menu').click();
  await page.locator('.menu [data-act=help]').click();
  await page.locator('[data-act=practice]').click();
  await page.waitForTimeout(300);
  expect((await dbg(page)).state).toBe('playing');
  expect(errors).toEqual([]);
});

test('sessão longa: várias partidas seguidas sem vazar memória da GPU', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  const geo: number[] = [];
  const tex: number[] = [];
  for (let i = 0; i < 14; i++) {
    await page.getByTestId('play').click();
    await page.waitForTimeout(700);
    const d = await dbg(page);
    geo.push(d.render.geometries ?? 0);
    tex.push(d.render.textures ?? 0);
    await page.locator('[data-act=pause]').click();
    await page.getByTestId('to-menu').click();
  }
  console.warn('geometrias', geo.join(','), 'texturas', tex.join(','));
  // sobe só até os limites fixos dos caches (peças das surpresas e as 12 placas de piada), nunca por partida
  expect(Math.max(...geo)).toBeLessThanOrEqual(40);
  expect(Math.max(...tex)).toBeLessThanOrEqual(6 + 12 + 4);
  expect(errors).toEqual([]);
});

test('botões do fim de partida cabem numa linha (telas estreitas)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('play').click();
  for (let i = 0; i < 4; i++) await drag(page, 140);
  const again = page.getByTestId('again');
  await expect(again).toBeVisible({ timeout: 15000 });
  const h = await again.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }));
  expect(h.sh).toBeLessThanOrEqual(h.ch + 1);
  expect(h.sw).toBeLessThanOrEqual(h.cw + 1);
});


type Dbg2 = Dbg & { skin: string; hasPhoto: boolean; bestDist: Record<string, number> };
const dbg2 = (page: Page) => page.evaluate(() => (window as unknown as { __ballrun: { debug: () => Dbg2 } }).__ballrun.debug());

function pngBuffer(): Buffer {
  // PNG 2x1 válido (cinza e branco)
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGNgYGD4z8DAAAAEBAEA6ROhLQAAAABJRU5ErkJggg==', 'base64');
}

test('foto na bola: inválida, grande demais, válida, persiste, remove', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.locator('.menu [data-act=ball]').first().click();
  await page.getByTestId('skin-photo').click();
  const input = page.getByTestId('photo-file');
  // arquivo que não é imagem
  await input.setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('oi') });
  await expect(page.getByTestId('photo-msg')).toContainText('não é uma imagem');
  // grande demais (31 MB) não trava
  await page.getByTestId('photo-file').setInputFiles({ name: 'enorme.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(31 * 1024 * 1024, 1) });
  await expect(page.getByTestId('photo-msg')).toContainText('grande demais');
  // imagem corrompida com tipo de imagem
  await page.getByTestId('photo-file').setInputFiles({ name: 'quebrada.png', mimeType: 'image/png', buffer: Buffer.from('não sou png') });
  await expect(page.getByTestId('photo-msg')).toContainText('Não consegui');
  // válida
  await page.getByTestId('photo-file').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: pngBuffer() });
  await expect(page.getByTestId('photo-use')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-key=photo-zoom]').fill('2');
  await page.getByTestId('photo-use').click();
  await expect.poll(async () => (await dbg2(page)).skin).toBe('foto');
  // persiste depois de recarregar
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => (await dbg2(page)).hasPhoto).toBe(true);
  expect((await dbg2(page)).skin).toBe('foto');
  // jogar com a foto não dá erro
  await page.getByTestId('play').click();
  await expect.poll(async () => (await dbg(page)).dist, { timeout: 15000 }).toBeGreaterThan(2);
  await page.locator('[data-act=pause]').click();
  await page.getByTestId('to-menu').click();
  // remover volta para a bola padrão
  await page.locator('.menu [data-act=ball]').first().click();
  await page.getByTestId('photo-edit').click();
  await page.getByTestId('photo-remove').click();
  await expect.poll(async () => (await dbg2(page)).skin).toBe('xadrez');
  expect((await dbg2(page)).hasPhoto).toBe(false);
  expect(errors).toEqual([]);
});

test('recordes de distância e tempo sobrevivem a recarregar; links da Flow', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('play').click();
  await expect.poll(async () => (await dbg(page)).dist, { timeout: 15000 }).toBeGreaterThan(8);
  for (let i = 0; i < 4; i++) await drag(page, 160);
  await expect(page.getByTestId('again')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('quip')).not.toBeEmpty();
  const best = (await dbg2(page)).bestDist.facil ?? 0;
  expect(best).toBeGreaterThan(5);
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
  expect((await dbg2(page)).bestDist.facil).toBe(best);
  await page.locator('.menu [data-act=records]').first().click();
  await expect(page.getByTestId('dist-facil')).not.toHaveText('0 m');
  await page.locator('.overlay [data-act=close]').click();
  await expect(page.getByTestId('link-site')).toContainText('flowgroupbr.site');
  await expect(page.getByTestId('link-insta')).toContainText('@flowgroup.br');
  await expect(page.locator('.menu .footer')).toContainText('Produzido pela Flow');
  expect(errors).toEqual([]);
});

test('loja: compra bola com moedas, equipa rastro, salva e mantém após recarregar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // jogador com 60 moedas
  await page.addInitScript(() => {
    if (!localStorage.getItem('ballrun.flow.save')) localStorage.setItem('ballrun.flow.save', JSON.stringify({ coins: 60 }));
  });
  await page.goto('/');
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
  await page.locator('.menu [data-act=ball]').first().click();
  await expect(page.getByTestId('wallet')).toContainText('60');
  // bola de 20 moedas
  await page.getByTestId('ball-xadrez-miudo').click();
  await expect.poll(async () => (await dbg2(page)).skin).toBe('xadrez-miudo');
  await expect(page.getByTestId('wallet')).not.toContainText('60');
  // sem moedas suficientes: não compra
  const before = await page.evaluate(() => (window as unknown as { __ballrun: { save: { data: { coins: number } } } }).__ballrun.save.data.coins);
  await page.getByTestId('ball-cromo').click(); // 80 moedas
  await expect.poll(async () => (await dbg2(page)).skin).toBe('xadrez-miudo');
  expect(await page.evaluate(() => (window as unknown as { __ballrun: { save: { data: { coins: number } } } }).__ballrun.save.data.coins)).toBe(before);
  // rastro grátis
  await page.getByTestId('tab-rastros').click();
  await page.getByTestId('trail-nenhum').click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __ballrun: { debug: () => { trail: string } } }).__ballrun.debug().trail))).toBe('nenhum');
  await page.reload();
  await expect(page.locator('.menu')).toBeVisible({ timeout: 30000 });
  expect((await dbg2(page)).skin).toBe('xadrez-miudo');
  await page.locator('.menu [data-act=achievements]').first().click();
  await expect(page.getByTestId('ach-count')).toContainText('de 5');
  expect(errors).toEqual([]);
});

test('poder especial: dois toques na tela pulam (bola inicial), recarga impede repetir; botão do poder aparece', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('play').click();
  await expect.poll(async () => (await dbg(page)).state).toBe('playing');
  await expect(page.getByTestId('power')).toBeVisible();
  await expect(page.getByTestId('power')).toContainText('Pulo');
  // espera a bola estar no chão e o poder carregado
  await expect.poll(async () => page.evaluate(() => { const s = (window as unknown as { __ballrun: { sim: { abilityCharge: () => number; ball: { onGround: boolean } } } }).__ballrun.sim; return s.abilityCharge() >= 1 && s.ball.onGround; }), { timeout: 20000 }).toBe(true);
  const vp = page.viewportSize()!;
  const tap = async (t: number) => {
    await page.locator('#touch').dispatchEvent('pointerdown', { pointerId: 20 + t, pointerType: 'touch', clientX: vp.width / 2, clientY: vp.height * 0.7, isPrimary: true });
    await page.locator('#touch').dispatchEvent('pointerup', { pointerId: 20 + t, pointerType: 'touch', clientX: vp.width / 2, clientY: vp.height * 0.7, isPrimary: true });
  };
  await tap(1);
  await tap(2);
  const used = () => page.evaluate(() => (window as unknown as { __ballrun: { sim: { abilityUses: number } } }).__ballrun.sim.abilityUses);
  await expect.poll(used).toBe(1);
  // mais dois toques logo depois: está recarregando, não dispara de novo
  await page.waitForTimeout(400);
  await tap(3);
  await tap(4);
  await page.waitForTimeout(200);
  expect(await used()).toBe(1);
  expect(errors).toEqual([]);
});

test('onde jogar e créditos: site, APK, IPA e redes oficiais da Flow', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('downloads').click();
  await expect(page.getByTestId('dl-apk')).toHaveAttribute('href', /downloads\/BallRun-Flow\.apk$/);
  await expect(page.getByTestId('dl-ipa')).toHaveAttribute('href', /downloads\/BallRun-Flow\.ipa$/);
  // no site não há botão para abrir o próprio site (só nos apps)
  await expect(page.getByTestId('open-game')).toHaveCount(0);
  await page.locator('.overlay [data-act=close]').click();
  await page.locator('.menu [data-act=credits]').click();
  await expect(page.locator('.overlay')).toContainText('empresa de software');
  await expect(page.locator('.overlay')).toContainText('tempo livre');
  await expect(page.getByTestId('social-tiktok')).toContainText('@flowgroupbr');
  await expect(page.getByTestId('social-insta')).toContainText('@flowgroup.br');
  await expect(page.getByTestId('social-whats')).toBeVisible();
  await expect(page.getByTestId('link-tiktok')).toContainText('@flowgroupbr');
  expect(errors).toEqual([]);
});

test('menu: JOGAR com altura real, X fecha as janelas e o tutorial aparece no navegador', async ({ page }) => {
  const errors: string[] = [];
  // navegador comum (não robô): o tutorial "adicionar à tela inicial" deve aparecer
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  await open(page, errors);
  await expect(page.getByTestId('tip-continue')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.overlay')).toContainText('JOGUE COMO APP');
  // regressão: o JOGAR tinha 2 px de altura no iPhone
  expect(await page.getByTestId('play').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(40);
  await page.locator('.overlay > .x').click();
  await expect(page.locator('.overlay')).toHaveClass(/hidden/);
  // X também fecha a lista de conquistas (sem precisar descer até o fim)
  await page.locator('.menu [data-act=achievements]').click();
  await expect(page.locator('.overlay > .x')).toBeVisible();
  await page.locator('.overlay > .x').click();
  await expect(page.locator('.overlay')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});

test('menu: APK e IPA aparecem na tela inicial do site (sem precisar achar o rodapé)', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await expect(page.getByTestId('menu-apk')).toHaveAttribute('href', /downloads\/BallRun-Flow\.apk$/);
  await expect(page.getByTestId('menu-ipa')).toHaveAttribute('href', /downloads\/BallRun-Flow\.ipa$/);
  expect(errors).toEqual([]);
});

test('X da pausa continua a partida (não deixa o jogo parado sem botão)', async ({ page }) => {
  const errors: string[] = [];
  await open(page, errors);
  await page.getByTestId('play').click();
  await expect.poll(async () => (await dbg(page)).state).toBe('playing');
  await page.locator('[data-act=pause]').click();
  await expect.poll(async () => (await dbg(page)).state).toBe('paused');
  await page.locator('.overlay > .x').click();
  await expect.poll(async () => (await dbg(page)).state).toBe('playing');
  await expect(page.locator('.overlay')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});
