import { Swords, User, Trophy, Backpack, ListChecks, ShoppingBag } from 'lucide-react';

type Tab = 'home' | 'game' | 'profile' | 'market' | 'topup' | 'news' | 'referral' | 'leaderboard' | 'inventory' | 'bet_history' | 'tasks';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: Tab; icon: React.ReactNode }[] = [
    { id: 'market',      icon: <ShoppingBag size={18} /> },
    { id: 'game',        icon: <Swords size={18} /> },
    { id: 'inventory',   icon: <Backpack size={18} /> },
    { id: 'leaderboard', icon: <Trophy size={18} /> },
    { id: 'tasks',       icon: <ListChecks size={18} /> },
    { id: 'profile',     icon: <User size={18} /> },
  ];

  const labelMap: Record<string, string> = {
    tasks: 'Задания',
    market: 'Маркет',
    game: 'Игры',
    inventory: 'Инвентарь',
    leaderboard: 'Топ',
    profile: 'Профиль',
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-14 bg-[#0f0f13] border-t border-gray-800 flex items-center justify-around px-0.5 gap-0.5 z-50">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={tab.id}
            className="w-1/6 h-full flex flex-col items-center justify-center gap-0.5"
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
              className="text-[10px] font-medium leading-none text-gray-400 truncate"
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