import { useState } from 'react';
import { colors, spacing } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { topUpTon, topUpStars } from '../api';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onNavigate?: (tab: any) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function TopUpPage({ onNavigate, onToast }: Props) {
  const [tab, setTab] = useState<'ton' | 'stars'>('ton');
  const [tonAmount, setTonAmount] = useState('');
  const [starsAmount, setStarsAmount] = useState('');
  const { haptic, initData } = useTelegram();

  /* ── Helpers ──────────────────────────────────── */
  const getTonAmount = (): number => {
    const val = parseFloat(tonAmount);
    return isNaN(val) ? 0 : val;
  };

  const getStarsAmount = (): number => {
    const val = parseInt(starsAmount, 10);
    return isNaN(val) ? 0 : val;
  };

  const isPayDisabled = (): boolean => {
    if (tab === 'ton') return getTonAmount() < 0.1;
    return getStarsAmount() < 50;
  };

  const handlePay = async () => {
    haptic('medium');
    const amount = tab === 'ton' ? getTonAmount() : getStarsAmount();

    if (tab === 'ton') {
      await topUpTon(initData, amount);
      onToast(`Пополнение TON на ${amount.toFixed(2)}`, 'success');
    } else {
      await topUpStars(initData, amount);
      onToast(`Пополнение Stars на ${amount}`, 'success');
    }
  };

  /* ── Render ────────────────────────────────────── */
  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      {/* ← Назад */}
      <div
        onClick={() => { haptic('light'); onNavigate?.('profile'); }}
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: spacing.lg,
          color: colors.textMuted,
          fontSize: 15,
        }}
      >
        ← Назад
      </div>

      {/* ── Tabs ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: spacing.lg }}>
        {/* TON tab */}
        <div
          onClick={() => { setTab('ton'); haptic('light'); }}
          style={{
            flex: 1,
            padding: '12px 8px',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: tab === 'ton' ? colors.primary : colors.bgCard,
            color: colors.text,
            fontWeight: 'bold',
            fontSize: 16,
            transition: 'background 0.15s',
          }}
        >
          <img src={publicUrl('TON.png')} alt="" style={{ width: 24, height: 24 }} />
          TON
        </div>

        {/* Stars tab */}
        <div
          onClick={() => { setTab('stars'); haptic('light'); }}
          style={{
            flex: 1,
            padding: '12px 8px',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: tab === 'stars' ? colors.primary : colors.bgCard,
            color: colors.text,
            fontWeight: 'bold',
            fontSize: 16,
            transition: 'background 0.15s',
          }}
        >
          <img src={publicUrl('star-icon.png')} alt="" style={{ width: 24, height: 24 }} />
          Stars
        </div>
      </div>

      {/* ── Tab: TON ──────────────────────────────── */}
      {tab === 'ton' && (
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8 }}>
            Введите сумму в TON (минимум 0.1)
          </div>
          <input
            type="number"
            value={tonAmount}
            onChange={(e) => setTonAmount(e.target.value)}
            placeholder="0.1"
            min={0.1}
            step={0.1}
            style={{
              width: '100%',
              padding: 16,
              fontSize: 20,
              background: '#111',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              marginTop: 8,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* ── Tab: Stars ────────────────────────────── */}
      {tab === 'stars' && (
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8 }}>
            Введите количество Stars (минимум 50)
          </div>
          <input
            type="number"
            value={starsAmount}
            onChange={(e) => setStarsAmount(e.target.value)}
            placeholder="50"
            min={50}
            style={{
              width: '100%',
              padding: 16,
              fontSize: 20,
              background: '#111',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              marginTop: 8,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* ── Кнопка «Пополнить» ────────────────────── */}
      <button
        onClick={handlePay}
        disabled={isPayDisabled()}
        style={{
          width: '100%',
          padding: '18px 24px',
          fontSize: 20,
          fontWeight: 'bold',
          border: 'none',
          borderRadius: 12,
          cursor: isPayDisabled() ? 'not-allowed' : 'pointer',
          background: '#FFD700',
          color: '#fff',
          textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
          transition: 'opacity 0.15s',
          opacity: isPayDisabled() ? 0.5 : 1,
        }}
      >
        Пополнить
      </button>
    </div>
  );
}