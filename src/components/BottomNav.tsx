import { ASSETS } from '../assets';
import { ShoppingBag, Swords, User, Trophy, Backpack } from 'lucide-react';

type Tab = 'game' | 'profile' | 'market' | 'topup' | 'news' | 'referral' | 'admin' | 'leaderboard' | 'inventory';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: Tab; left: string; icon: React.ReactNode }[] = [
    { id: 'market',      left: '10%',   icon: <ShoppingBag size={20} /> },
    { id: 'game',        left: '30%',   icon: <Swords size={20} /> },
    { id: 'inventory',   left: '50%',   icon: <Backpack size={20} /> },
    { id: 'leaderboard', left: '70%',   icon: <Trophy size={20} /> },
    { id: 'profile',     left: '90%',   icon: <User size={20} /> },
  ];

  const labelMap: Record<string, string> = {
    market: 'Маркет',
    game: 'Игры',
    inventory: 'Инвентарь',
    leaderboard: 'Топ',
    profile: 'Профиль',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '440px',
        zIndex: 100,
        aspectRatio: '2048 / 400',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <img
          src={ASSETS.navBg}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.id}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: tab.left,
                transform: 'translateX(-50%)',
                width: '20%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                zIndex: 1,
                opacity: isActive ? 1 : 0.55,
                filter: isActive
                  ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.9))'
                  : 'none',
                transition: 'opacity 0.25s, filter 0.25s',
              }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
                <div style={{ color: isActive ? '#fff' : '#999' }}>
                  {tab.icon}
                </div>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: isActive ? '#fff' : '#999',
                  textTransform: 'capitalize',
                }}>
                  {labelMap[tab.id] || tab.id}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}