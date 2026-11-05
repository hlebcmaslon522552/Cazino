import { useState, useEffect, useRef } from 'react';
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
import { PvP2Page } from './PvP2Page';
import { ProfilePage } from './ProfilePage';
import { InventoryPage } from './InventoryPage';
import { GiftShop } from './GiftShop';
import { TopUpPage } from './TopUpPage';
import { NewsPage } from './NewsPage';
import { ReferralPage } from './ReferralPage';

import { LeaderboardPage } from './LeaderboardPage';
import { BetHistoryPage } from './BetHistoryPage';
import { BottomNav } from './BottomNav';
import { publicUrl } from '../helpers/publicUrl';
import { useTelegram } from '../hooks/useTelegram';
import { CONFIG } from '../config';

export type Tab = 'home' | 'game' | 'profile' | 'market' | 'topup' | 'news' | 'referral' | 'leaderboard' | 'inventory' | 'bet_history';
export type GameScreen = 'menu' | 'upgrader' | 'case' | 'cases' | 'mines' | 'pvp' | 'plinko' | 'crash';

export function Root() {
  const [activeTab, setActiveTab] = useState<Tab>('game');
  const [gameScreen, setGameScreen] = useState<GameScreen>('menu');
  const [caseData, setCaseData] = useState<CaseItem | null>(null);
  const [refreshVersion] = useState(0);
  const { user } = useTelegram();
  const userId = String(user?.id ?? '6267608438');
  const [balance, setBalance] = useState(0);
  const balanceRef = useRef(0);

  // Держим зеркало баланса в ref, чтобы handleUpdateBalance мог вычислить новый баланс
  // вне updater (fetch внутри updater в StrictMode дублировался бы).
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  // Единый способ получить актуальный баланс — ТОЛЬКО GET /api/balance.
  // POST /api/update_balance удалён: клиент больше НЕ может записать баланс
  // на сервер, иначе любой мог бы «накрутить» себе миллион TON.
  const loadBalance = () => {
    const url = `${CONFIG.API_URL}/api/balance?user_id=${userId}`;
    console.log('BALANCE USER ID:', userId);
    console.log('FETCH:', url);
    fetch(url)
      .then(res => res.json())
      .then(data => {
        console.log('BALANCE RESPONSE:', data);
        if (data && data.balance_ton !== undefined) {
          setBalance(Number(data.balance_ton));
        }
      })
      .catch((e) => {
        console.error("Ошибка загрузки баланса:", e);
      });
  };

  // Загружаем баланс с сервера при старте
  useEffect(() => {
    loadBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleUpdateBalance = (amount: number) => {
    // Сумма используется ТОЛЬКО для мгновенного оптимистичного отклика UI.
    // Деньги в базе двигают исключительно серверные обработчики
    // (победа в игре, депозит, вывод), а баланс всегда перечитывается
    // с сервера через GET /api/balance.
    balanceRef.current = balanceRef.current + amount;
    setBalance(balanceRef.current);

    // После завершения операции синхронизируем баланс с сервером
    loadBalance();
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
  const refreshBalance = loadBalance;

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
            ? <CasePage caseData={caseData} onBack={() => setGameScreen('cases')} onToast={showToast} onUpdateBalance={handleUpdateBalance} balance={balance} />
            : <CaseShop onBack={() => setGameScreen('menu')} onOpenCase={openCase} />)}
          {gameScreen === 'cases' && <CaseShop onBack={() => setGameScreen('menu')} onOpenCase={openCase} />}
          {gameScreen === 'mines' && <MinesPage onBack={() => setGameScreen('menu')} onToast={showToast} balance={balance} onUpdateBalance={handleUpdateBalance} />}
          {gameScreen === 'pvp' && <PvP2Page balance={balance} onUpdateBalance={handleUpdateBalance} onToast={showToast} />}
          {gameScreen === 'plinko' && <PlinkoPage balance={balance} onUpdateBalance={handleUpdateBalance} onBack={() => setGameScreen('menu')} onToast={showToast} />}
          {gameScreen === 'crash' && <CrashPage balance={balance} onUpdateBalance={handleUpdateBalance} onToast={showToast} />}
        </>
      )}
      {activeTab === 'inventory' && (
        <InventoryPage onToast={showToast} onBalanceChange={refreshBalance} />
      )}
      {activeTab === 'profile' && <ProfilePage onNavigate={handleTabChange} balance={balance} />}
      {activeTab === 'market' && (
        <GiftShop balance={balance} onUpdateBalance={handleUpdateBalance} onToast={showToast} />
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
      {activeTab === 'leaderboard' && <LeaderboardPage />}
      {activeTab === 'bet_history' && (
        <BetHistoryPage onBack={() => handleTabChange('profile')} />
      )}

      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      </AppRoot>
    </TonConnectUIProvider>
  );
}