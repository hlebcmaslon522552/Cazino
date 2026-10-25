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
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f0f13] border-t border-gray-800 flex items-center justify-around px-1 z-50">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.id}
            className="w-1/5 h-full flex flex-col items-center justify-center gap-1"
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
              className="text-[7px] font-medium leading-none text-gray-400 truncate"
              style={{
                color: isActive ? '#fff' : '#999',
              }}
            >
              {labelMap[tab.id] || tab.id}
            </span>
          </button>
        );
      })}
    </nav>
  );
}