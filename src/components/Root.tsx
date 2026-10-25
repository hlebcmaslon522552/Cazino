import { useState, useEffect } from 'react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { useToast } from './ui/Toast';
import { Header } from './Header';
import { HomePage } from './HomePage';
import { GamePage } from './GamePage';
import { UpgraderPage } from './UpgraderPage';
import { CaseShop, type CaseItem } from './CaseShop';
import { CasePage } from './CasePage';
import { MinesPage } from './MinesPage';
import { PvPPage } from './PvPPage';
import { PlinkoPage } from './PlinkoPage';
import { CrashPage } from './CrashPage';
import { ProfilePage } from './ProfilePage';
import { InventoryPage } from './InventoryPage';
import { TopUpPage } from './TopUpPage';
import { NewsPage } from './NewsPage';
import { ReferralPage } from './ReferralPage';
import { AdminPage } from './AdminPage';
import { BottomNav } from './BottomNav';
import { publicUrl } from '../helpers/publicUrl';
import { getBalance } from '../api';
import { useTelegram } from '../hooks/useTelegram';
import { CONFIG } from '../config';

export type Tab = 'home' | 'game' | 'profile' | 'inventory' | 'topup' | 'news' | 'referral' | 'admin';
export type GameScreen = 'menu' | 'upgrader' | 'case' | 'cases' | 'mines' | 'pvp' | 'plinko' | 'crash';

export function Root() {
  const [activeTab, setActiveTab] = useState<Tab>('game');
  const [gameScreen, setGameScreen] = useState<GameScreen>('menu');
  const [caseData, setCaseData] = useState<CaseItem | null>(null);
  const [refreshVersion] = useState(0);
  const { initData } = useTelegram();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    getBalance(initData).then(setBalance).catch(() => setBalance(0));
  }, [initData]);

  const handleUpdateBalance = (newBalance: number) => {
    setBalance(newBalance);
  };

  /**
   * Изменение баланса «дельтой»: применяет дельту относительно текущего значения
   * и синхронизирует новый баланс с сервером (Ngrok).
   * Функция не возвращает Promise — fetch уходит «в фоне», баланс обновляется мгновенно.
   */
  const changeBalance = (amount: number) => {
    setBalance(prev => {
      const newBalance = prev + amount;
      // Отправляем на сервер (Ngrok)
      const userId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? '6267608438');
      fetch(`${CONFIG.API_URL}/api/update_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ user_id: userId, balance: newBalance }),
      }).catch(console.error);

      return newBalance;
    });
  };
  const { render: renderToast, show: showToast } = useToast();

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'game') setGameScreen('menu');
  };

  const openCase = (c: CaseItem) => {
    setCaseData(c);
    setGameScreen('case');
  };

  /**
   * Вызывается после действий, которые меняют баланс (продажа NFT, пополнение и т.д.),
   * чтобы перезапросить баланс из API и Header обновился автоматически.
   */
  const refreshBalance = () => {
    getBalance(initData).then(setBalance).catch(() => {});
  };

  return (
    <TonConnectUIProvider manifestUrl={`${CONFIG.APP_URL}/tonconnect-manifest.json`}>
      <AppRoot
        appearance="dark"
        style={{
          paddingBottom: '120px',
          minHeight: '100vh',
          backgroundImage: `url("${publicUrl('BackGrand.png')}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          // Полупрозрачный слой поверх фона, чтобы текст был читаемым
          boxShadow: 'inset 0 0 0 2000px rgba(0,0,0,0.7)',
        }}
      >
      {renderToast}

      {/* Верхняя панель с балансом — видна на всех страницах */}
      <Header balance={balance} refreshVersion={refreshVersion} onNavigate={handleTabChange} />

      {activeTab === 'home' && <HomePage onNavigate={handleTabChange} />}
      {activeTab === 'game' && (
        <>
          {gameScreen === 'menu' && <GamePage onOpen={setGameScreen} />}
          {gameScreen === 'upgrader' && <UpgraderPage onBack={() => setGameScreen('menu')} onToast={showToast} />}
          {gameScreen === 'case' && (caseData
            ? <CasePage caseData={caseData} onBack={() => setGameScreen('cases')} onToast={showToast} onUpdateBalance={changeBalance} balance={balance} />
            : <CaseShop onBack={() => setGameScreen('menu')} onOpenCase={openCase} />)}
          {gameScreen === 'cases' && <CaseShop onBack={() => setGameScreen('menu')} onOpenCase={openCase} />}
          {gameScreen === 'mines' && <MinesPage onBack={() => setGameScreen('menu')} onToast={showToast} />}
          {gameScreen === 'pvp' && <PvPPage balance={balance} onUpdateBalance={handleUpdateBalance} onToast={showToast} />}
          {gameScreen === 'plinko' && <PlinkoPage balance={balance} onUpdateBalance={changeBalance} onBack={() => setGameScreen('menu')} onToast={showToast} />}
          {gameScreen === 'crash' && <CrashPage balance={balance} onUpdateBalance={changeBalance} onToast={showToast} />}
        </>
      )}
      {activeTab === 'profile' && <ProfilePage onNavigate={handleTabChange} />}
      {activeTab === 'inventory' && (
        <InventoryPage onToast={showToast} onBalanceChange={refreshBalance} />
      )}
      {activeTab === 'topup' && (
        <TopUpPage
          onNavigate={handleTabChange}
          onToast={showToast}
          balance={balance}
          onUpdateBalance={handleUpdateBalance}
        />
      )}
      {activeTab === 'news' && <NewsPage onBack={() => handleTabChange('profile')} />}
      {activeTab === 'referral' && (
        <ReferralPage onBack={() => handleTabChange('profile')} onToast={showToast} />
      )}
      {activeTab === 'admin' && <AdminPage onBack={() => handleTabChange('profile')} />}

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </AppRoot>
    </TonConnectUIProvider>
  );
}