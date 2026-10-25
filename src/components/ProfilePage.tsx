import { useState, useEffect } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useTelegram } from '../hooks/useTelegram';
import { fetchUserData, fetchInventory } from '../api';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onNavigate: (tab: any) => void;
  balance: number;
}

interface Nft {
  id: number;
  model: string;
  image: string;
  floor: number;
}

export function ProfilePage({ onNavigate, balance }: Props) {
  const { user, initData } = useTelegram();

  const [balanceStars, setBalanceStars] = useState(0);
  const [items, setItems] = useState<Nft[]>([]);
  const [loading, setLoading] = useState(true);

  // Данные пользователя из Telegram WebApp
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  // Вычисляем при каждом рендере, чтобы данные подтянулись даже если Telegram инициализировался позже
  const userName = tgUser?.first_name
    ? tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')
    : 'Пользователь';
  const username = tgUser?.username ? '@' + tgUser.username : '@username';
  const avatarUrl = tgUser?.photo_url || '';

  useEffect(() => {
    let cancelled = false;
    const userId = String(user?.id ?? '6267608438');
    Promise.all([fetchUserData(initData), fetchInventory(initData, userId)])
      .then(([userData, inventory]) => {
        if (cancelled) return;
        setBalanceStars((userData as any).balance_stars ?? 0);
        setItems(inventory);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstLetter = userName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div style={{ padding: spacing.md, color: colors.text, paddingBottom: 140 }}>
      {/* ── Шапка профиля ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: spacing.lg }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 'bold', color: '#fff' }}>
            {firstLetter}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: 17 }}>{userName}</div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>{username}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <img src={publicUrl('TON.png')} alt="" style={{ width: 20, height: 20 }} />
          <span style={{ fontWeight: 'bold', fontSize: 15 }}>{Number(balance).toFixed(4)}</span>
        </div>
      </div>

      {/* ── Баннер рефералки ──────────────────────── */}
      <style>{`
        .invite-btn-wrap button {
          cursor: pointer;
          transition: transform 0.1s ease;
        }
        .invite-btn-wrap button:active {
          transform: scale(0.95);
        }
      `}</style>

      <div style={{ backgroundImage: `url("${publicUrl('Phon_ref_.png')}")`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 16, padding: '24px 20px', marginBottom: spacing.lg, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', borderRadius: 16 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 }}>ПОЛУЧАЙ</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#ffd700', marginBottom: spacing.md }}>5% С ИХ ТРАТ</div>
          <div className="invite-btn-wrap">
            <Button variant="primary" fullWidth onClick={() => onNavigate('referral')}>📋 Пригласить</Button>
          </div>
        </div>
      </div>

      {/* ── Баланс Stars ────────────────────────────── */}
      <Card padding="14px 16px" glow="none" onClick={() => onNavigate('topup')}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15 }}>⭐ Stars</span>
          <span style={{ fontWeight: 'bold', fontSize: 16 }}>{balanceStars.toLocaleString()}</span>
        </div>
      </Card>

      {/* ── Блок Инвентаря ─────────────────────────── */}
      <div style={{ marginTop: spacing.lg, marginBottom: spacing.lg }}>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10, fontWeight: 'bold', letterSpacing: 1 }}>ИНВЕНТАРЬ</div>
        {loading ? (
          <p style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>Загрузка...</p>
        ) : items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 20 }}>
            <img src={publicUrl('NO_Inventory.png')} alt="" style={{ width: 80, height: 80, marginBottom: 8, opacity: 0.6 }} />
            <div style={{ color: colors.textMuted, fontSize: 14 }}>Нет NFT</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {items.map((nft) => (
              <Card key={nft.id} padding="10px" glow="none">
                <img src={nft.image} alt={nft.model} style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 10 }} />
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 'bold', textAlign: 'center', color: colors.accent }}>{nft.model}</div>
                <div style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center' }}>{nft.floor.toFixed(2)} TON</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Подпись ────────────────────────────────── */}
      <div style={{ textAlign: 'center', color: '#666', fontSize: 12, marginTop: 32, marginBottom: 16 }}>
        By @ERR_279
      </div>

      </div>
  );
}