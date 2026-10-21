import { ASSETS } from '../assets';

type Tab = 'home' | 'game' | 'profile' | 'inventory' | 'topup' | 'news' | 'referral' | 'admin';

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: Tab; left: string }[] = [
    { id: 'inventory', left: '16.66%' },
    { id: 'game',    left: '50%' },
    { id: 'profile', left: '83.33%' },
  ];

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
                width: '30%',
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
            />
          );
        })}
      </div>
    </div>
  );
}