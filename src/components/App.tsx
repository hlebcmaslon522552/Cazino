import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, HashRouter } from 'react-router-dom';
import { useLaunchParams, useSignal, miniApp } from '@tma.js/sdk-react';
import { AppRoot } from '@telegram-apps/telegram-ui';

import { routes } from '@/navigation/routes.tsx';
import { publicUrl } from '../helpers/publicUrl';
import { preloadImages } from '../utils/preloadImages';
import { SplashScreen } from './SplashScreen';

/** Статические UI-ресурсы, которые рендерятся сразу после сплэш-экрана. */
const STATIC_IMAGES_TO_PRELOAD = [
  'BackGrand.png',
  'Logo.png',
  'TON.png',
  'star-icon.png',
  'NO_Inventory.png',
  'Cases.png',
  'Up.png',
  'Mines.png',
  'PLINKO.png',
  'Crash.png',
  'CaseWOOD.png',
  'CASE_COPPR.png',
  'Silver.png',
  'GOLD.png',
  'TonB.png',
  'TonV.png',
  'TON1.png',
  'Phon_ref_.png',
  'nav-bg.png',
  'case-test.png',
];

export function App() {
  const lp = useLaunchParams();
  const isDark = useSignal(miniApp.isDark);
  const [isLoading, setIsLoading] = useState(true);

  // Предзагрузка всех картинок в кэш при первом запуске приложения.
  useEffect(() => {
    const staticImages = STATIC_IMAGES_TO_PRELOAD.map((p) => publicUrl(p));

    // Пул маркета/инвентаря лежит в статическом /my_nfts.json — после его ответа
    // прогреваем кэш всеми картинками NFT (маркет и кейсы откроются мгновенно).
    fetch(publicUrl('my_nfts.json'))
      .then((res) => res.json())
      .then((data: { image?: string }[]) => {
        const nftImages = (Array.isArray(data) ? data : [])
          .map((item) => item.image)
          .filter((img): img is string => typeof img === 'string' && img.length > 0)
          .map((img) => publicUrl(img));

        // Не блокируем сплэш: он сам гаснет через 4 секунды.
        preloadImages([...staticImages, ...nftImages]);
      })
      .catch(() => {
        preloadImages(staticImages);
      });
  }, []);

  const handleSplashComplete = useCallback(() => setIsLoading(false), []);

  // Сплэш-экран показываем один раз — при первом запуске приложения.
  if (isLoading) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <AppRoot
      appearance={isDark ? 'dark' : 'light'}
      platform={['macos', 'ios'].includes(lp.tgWebAppPlatform) ? 'ios' : 'base'}
    >
      <HashRouter>
        <Routes>
          {routes.map((route) => <Route key={route.path} {...route} />)}
          <Route path="*" element={<Navigate to="/"/>}/>
        </Routes>
      </HashRouter>
    </AppRoot>
  );
}
