import { useEffect, useState } from 'react';

export function useTelegramTheme() {
  const [platform, setPlatform] = useState('base');
  const [appearance, setAppearance] = useState('dark');

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      if (tg.platform) setPlatform(tg.platform);
      if (tg.colorScheme) setAppearance(tg.colorScheme);
    }
  }, []);

  return { platform, appearance };
}