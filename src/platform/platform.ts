import { Capacitor } from '@capacitor/core';
import { LocalKV, type KV } from '../storage/save';

export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platformName = (): string => Capacitor.getPlatform();

class PrefsKV implements KV {
  async get(k: string) {
    const { Preferences } = await import('@capacitor/preferences');
    const r = await Preferences.get({ key: k });
    return r.value;
  }
  async set(k: string, v: string) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: k, value: v });
  }
}

export function storage(): KV {
  return isNative() ? new PrefsKV() : new LocalKV();
}

export async function openExternal(url: string): Promise<void> {
  try {
    if (isNative()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (e) {
    console.warn('[link] não abriu', e);
  }
}

export async function vibrate(ms: 'light' | 'heavy'): Promise<void> {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ms === 'heavy' ? ImpactStyle.Heavy : ImpactStyle.Light });
    } else if ('vibrate' in navigator) {
      navigator.vibrate(ms === 'heavy' ? 60 : 15);
    }
  } catch {
    /* vibração é opcional */
  }
}

/** Botão voltar (Android) e app indo para segundo plano. */
export async function bindNative(handlers: { back: () => void; background: () => void; foreground: () => void }): Promise<void> {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => handlers.back());
  await App.addListener('appStateChange', ({ isActive }) => (isActive ? handlers.foreground() : handlers.background()));
}

export async function exitApp(): Promise<void> {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
