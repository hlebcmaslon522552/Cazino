import { ASSETS } from '../assets';
import { ShoppingBag, Swords, User, Trophy, Backpack } from 'lucide-react';

type Tab = 'game' | 'profile' | 'market' | 'topup' | 'news' | 'referral' | 'leaderboard' | 'inventory';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: Tab; icon: React.ReactNode }[] = [
    { id: 'market',      icon: <ShoppingBag size={20} /> },
    { id: 'game',        icon: <Swords size={20} /> },
    { id: 'inventory',   icon: <Backpack size={20} /> },
    { id: 'leaderboard', icon: <Trophy size={20} /> },
    { id: 'profile',     icon: <User size={20} /> },
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
        className="relative w-full h-full rounded-full overflow-hidden"
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

        <div className="flex items-center justify-between w-full px-2 max-w-md mx-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.id}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: isActive ? 1 : 0.55,
                  filter: isActive
                    ? 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.9))'
                    : 'none',
                  transition: 'opacity 0.25s, filter 0.25s',
                }}
              >
                <div style={{ color: isActive ? '#fff' : '#999' }}>
                  {tab.icon}
                </div>
                <span
                  className="text-[8px] leading-tight truncate w-full text-center"
                  style={{
                    fontWeight: 600,
                    color: isActive ? '#fff' : '#999',
                  }}
                >
                  {labelMap[tab.id] || tab.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}