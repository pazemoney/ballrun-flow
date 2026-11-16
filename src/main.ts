import '@fontsource/anton/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import './style.css';
import { App } from './ui/app';
import { isNative, storage } from './platform/platform';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const touch = document.getElementById('touch') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

// Safari iOS: bloqueia zoom por gesto de pinça e duplo toque
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const app = new App(storage(), canvas, touch, ui);
void app.boot();

if (import.meta.env.DEV && new URLSearchParams(location.search).has('bot')) {
  void import('./sim/bot').then(({ Bot }) => {
    let bot: InstanceType<typeof Bot> | null = null;
    let simRef: unknown = null;
    let acc = 0;
    const warp = Number(new URLSearchParams(location.search).get('warp') ?? 1) || 1;
    app.autoplay = (dt) => {
      const sim = app.sim;
      if (!sim) return 0;
      if (simRef !== sim) {
        bot = new Bot(sim);
        simRef = sim;
      }
      acc += Math.min(dt, 0.1) * warp;
      let k = 0;
      while (acc >= 1 / 120) {
        if (k++ % 2 === 0 && sim.state === 'running' && bot) sim.setTarget(bot.decide());
        sim.step();
        acc -= 1 / 120;
      }
      return acc * 120;
    };
  });
}

// Cache offline só na Web publicada (os apps já têm os arquivos locais)
if (!isNative() && 'serviceWorker' in navigator && location.protocol === 'https:' && !navigator.webdriver) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[sw]', e));
  });
}
