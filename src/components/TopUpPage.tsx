import { useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { colors, spacing } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';

interface Props {
  onNavigate?: (tab: any) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  balance?: number;
  onUpdateBalance?: (newBalance: number) => void;
}

export function TopUpPage({ onNavigate, onToast, balance = 0, onUpdateBalance }: Props) {
  const [tab, setTab] = useState<'ton' | 'stars'>('ton');
  const [starsAmount, setStarsAmount] = useState('');
  const { haptic, initData, user } = useTelegram();
  const userId = user?.id?.toString() || '6267608438';

  /* ── TON Connect ──────────────────────────────── */
  const [tonConnectUI] = useTonConnectUI();
  const userAddress = useTonAddress();

  /* ── Helpers ──────────────────────────────────── */
  const getStarsAmount = (): number => {
    const val = parseInt(starsAmount, 10);
    return isNaN(val) ? 0 : val;
  };

  const isPayDisabled = (): boolean => getStarsAmount() < 50;

  const handleTopUp = async () => {
    if (!userAddress) {
      tonConnectUI.openModal();
      return;
    }
    try {
      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 60,
        messages: [{
          address: CONFIG.TON_WALLET, // Берем из конфига
          amount: (CONFIG.TOP_UP_AMOUNT_TON * 1000000000).toString(),
        }],
      };
      await tonConnectUI.sendTransaction(transaction);
      onUpdateBalance?.(CONFIG.TOP_UP_AMOUNT_TON); // Обновляем баланс
      onToast('Баланс пополнен', 'success');
    } catch (e) {
      console.error(e);
      onToast('Ошибка при пополнении', 'error');
    }
  };

  const handlePay = async () => {
    haptic('medium');
    const amount = getStarsAmount();
    try {
      // Запрашиваем инвойс-ссылку у бэкенда
      const res = await fetch(`${CONFIG.API_URL}/api/create_invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({ user_id: userId, amount }),
      });
      const data = await res.json();
      if (!data.invoiceLink) {
        onToast?.(data.error || 'Ошибка при создании инвойса', 'error');
        return;
      }
      // Открываем окно оплаты Telegram
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.openInvoice(data.invoiceLink, (status) => {
          if (status === 'paid') {
            onUpdateBalance?.(amount * 0.01);
            onToast?.('Баланс успешно пополнен!', 'success');
          } else if (status === 'cancelled') {
            onToast?.('Оплата отменена', 'error');
          }
        });
      } else {
        onToast?.('Telegram WebApp недоступен', 'error');
      }
    } catch (e) {
      console.error(e);
      onToast?.('Ошибка при оплате', 'error');
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

      {/* ── Tab: TON (через TON Connect) ───────────── */}
      {tab === 'ton' && (
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8 }}>
            Подключи кошелёк, чтобы пополнить баланс TON в один клик
          </div>
          <button
            onClick={handleTopUp}
            className="w-full bg-blue-500 text-white p-4 rounded-xl font-bold"
          >
            {userAddress ? `Пополнить на ${CONFIG.TOP_UP_AMOUNT_TON} TON` : 'Подключить кошелек'}
          </button>
          {userAddress && (
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8, wordBreak: 'break-all' }}>
              Кошелёк: {userAddress}
            </div>
          )}
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