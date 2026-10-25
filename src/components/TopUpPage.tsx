import { useState } from 'react';
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { colors, spacing } from '../theme';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';

const STARS_PER_TON = 100;

interface Props {
  onNavigate?: (tab: any) => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  balance?: number;
  onUpdateBalance?: (newBalance: number) => void;
}

export function TopUpPage({ onNavigate, onToast, balance = 0, onUpdateBalance }: Props) {
  const [tab, setTab] = useState<'ton' | 'stars'>('ton');
  const [inputAmount, setInputAmount] = useState('');
  const numericAmount = parseFloat(inputAmount.replace(',', '.')) || 0;
  const { haptic, initData, user } = useTelegram();
  const userId = user?.id?.toString() || '6267608438';

  /* ── TON Connect ──────────────────────────────── */
  const [tonConnectUI] = useTonConnectUI();
  const userAddress = useTonAddress();

  /* ── Helpers ──────────────────────────────────── */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(',', '.');
    if (/^\d*\.?\d*$/.test(val)) setInputAmount(val);
  };

  const handleDisconnect = async () => {
    haptic('light');
    try {
      await tonConnectUI.disconnect();
      onToast('Кошелек отвязан', 'info');
    } catch (e) {
      onToast('Ошибка отвязки', 'error');
    }
  };

  const handleMainButtonClick = async () => {
    if (tab === 'ton') {
      if (!userAddress) { tonConnectUI.openModal(); return; }
      if (numericAmount < 0.1) { onToast('Минимум 0.1 TON', 'error'); return; }
      try {
        const transaction = {
          validUntil: Math.floor(Date.now() / 1000) + 60,
          messages: [{ address: CONFIG.TON_WALLET, amount: (numericAmount * 1000000000).toString() }],
        };
        await tonConnectUI.sendTransaction(transaction);
        onUpdateBalance?.(numericAmount);
        onToast('Баланс пополнен', 'success');
      } catch (e) { onToast('Ошибка при пополнении', 'error'); }
    } else {
      if (numericAmount < 50) { onToast('Минимум 50 Stars', 'error'); return; }
      try {
        const res = await fetch(`${CONFIG.API_URL}/api/create_invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({ user_id: userId, amount: Math.round(numericAmount) }),
        });
        const data = await res.json();
        if (!data.invoiceLink) { onToast(data.error || 'Ошибка', 'error'); return; }
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.openInvoice(data.invoiceLink, (status) => {
            if (status === 'paid') {
              const tonReceived = numericAmount / STARS_PER_TON;
              onUpdateBalance?.(tonReceived);
              onToast(`Баланс пополнен на ${tonReceived.toFixed(2)} TON!`, 'success');
            }
          });
        }
      } catch (e) { onToast('Ошибка при оплате', 'error'); }
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

      <div style={{ marginBottom: spacing.md }}>
        <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 8 }}>
          {tab === 'ton' ? 'Введите сумму в TON (мин. 0.1)' : 'Введите сумму в Stars (мин. 50)'}
        </div>
        <input
          type="text" inputMode="decimal" value={inputAmount} onChange={handleInputChange}
          placeholder={tab === 'ton' ? '1.0' : '50'}
          style={{ width: '100%', padding: 16, fontSize: 20, background: '#111', color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 12, boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 13, color: colors.accent, marginTop: 8, fontWeight: 'bold' }}>
          {tab === 'ton' ? (userAddress ? `К оплате: ${(numericAmount * STARS_PER_TON).toFixed(0)} Stars` : '') : (numericAmount >= 50 ? `Вы получите: ${(numericAmount / STARS_PER_TON).toFixed(2)} TON` : '')}
        </div>
        
        {tab === 'ton' && userAddress && (<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: colors.bgCard, padding: 12, borderRadius: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12, color: colors.textMuted }}>{userAddress.slice(0, 4)}...{userAddress.slice(-4)}</div>
            <button onClick={handleDisconnect} style={{ background: 'rgba(255,50,50,0.2)', color: '#ff4444', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>Отвязать</button>
          </div>
        )}
      </div>

      {/* ── Кнопка «Пополнить» ────────────────────── */}
      <button onClick={handleMainButtonClick} disabled={!inputAmount} style={{ width: '100%', padding: '18px 24px', fontSize: 18, fontWeight: 'bold', border: 'none', borderRadius: 12, cursor: !inputAmount ? 'not-allowed' : 'pointer', background: tab === 'ton' ? '#0098EA' : '#FFD700', color: '#fff', textShadow: '1px 1px 0 #000', opacity: !inputAmount ? 0.5 : 1 }}>
        {tab === 'ton' ? (userAddress ? `Пополнить на ${numericAmount} TON` : 'Подключить кошелек') : `Оплатить ${numericAmount} Stars`}
      </button>
    </div>
  );
}