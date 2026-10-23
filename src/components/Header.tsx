import { useState, useEffect } from 'react';
import { fetchUserData } from '../api';
import { useTelegram } from '../hooks/useTelegram';
import { colors, spacing } from '../theme';
import { publicUrl } from '../helpers/publicUrl';

interface HeaderProps {
  /**
   * Счётчик для принудительного обновления.
   * Увеличь на 1, когда нужно перезапросить данные (например, после продажи NFT).
   */
  refreshVersion?: number;
  onNavigate?: (tab: 'home' | 'game' | 'profile' | 'inventory' | 'topup' | 'news' | 'referral' | 'admin') => void;
}

/**
 * Верхняя панель с реальным балансом из API.
 * - Автоматически запрашивает данные в useEffect.
 * - При изменении refreshVersion (или initData) выполняет повторный запрос.
 */
export function Header({ refreshVersion = 0, onNavigate }: HeaderProps) {
  const [balanceTon, setBalanceTon] = useState(0);
  const { initData } = useTelegram();

  useEffect(() => {
    let cancelled = false;

    fetchUserData(initData)
      .then((data) => {
        if (cancelled) return;
        setBalanceTon(data.balance_ton);
      })
      .catch((err) => {
        console.error('Header: fetchUserData error', err);
      });

    return () => {
      cancelled = true;
    };
    // Перезапрашиваем при изменении refreshVersion или initData
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshVersion, initData]);

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#1a1a2e',
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(139, 92, 246, 0.5)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      {/* Left: Logo */}
      <div>
        <img src={publicUrl('Logo.png')} alt="Logo" style={{ height: 32 }} />
      </div>

      {/* Right: Balance with TON icon — click navigates to top-up */}
      <div
        onClick={() => onNavigate?.('topup')}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <img src={publicUrl('TON.png')} alt="TON" style={{ width: 24, height: 24 }} />
        <span style={{ fontWeight: 'bold', fontSize: 15, color: colors.text }}>
          {balanceTon.toFixed(4)}
        </span>
      </div>
    </div>
  );
}