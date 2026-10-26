import { useState, useEffect } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { Button } from './ui/Button';
import { colors, spacing } from '../theme';
import { fetchUserData } from '../api';

interface Props {
  onNavigate: (tab: 'home' | 'game' | 'profile' | 'inventory' | 'topup') => void;
}

export function HomePage({ onNavigate }: Props) {
  const { user } = useTelegram();
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const userId = String(user?.id ?? '6267608438');

    fetchUserData(userId)
      .then((data) => {
        if (cancelled) return;
        // Сервер отдаёт balance_ton, а не balance!
        if (data.balance_ton !== undefined) {
          setBalance(data.balance_ton);
        }
      })
      .catch((err) => {
        console.error('HomePage: fetchUserData error', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>NFT BOT</h1>
      <p style={{ color: colors.textMuted, marginTop: 0 }}>
        Привет, {user?.first_name || 'друг'}!
      </p>

      {/* Баланс TON */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: spacing.lg,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: colors.textMuted, fontSize: 14 }}>Баланс TON</span>
        <span style={{ fontWeight: 'bold', fontSize: 18, color: colors.accent }}>
          {balance.toFixed(2)}
        </span>
      </div>

      <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button size="lg" fullWidth onClick={() => onNavigate('topup')}>
          💳 Пополнить
        </Button>
        <Button size="lg" variant="secondary" fullWidth onClick={() => onNavigate('game')}>
          🎮 Играть
        </Button>
        <Button size="lg" variant="secondary" fullWidth onClick={() => onNavigate('inventory')}>
          🎒 Инвентарь
        </Button>
      </div>
    </div>
  );
}