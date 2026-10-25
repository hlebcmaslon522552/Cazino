import { useState, useEffect } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useTelegram } from '../hooks/useTelegram';
import { fetchUserData, fetchInventory } from '../api';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onNavigate: (tab: any) => void;
}

interface Nft {
  id: number;
  model: string;
  image: string;
  floor: number;
}

export function ProfilePage({ onNavigate }: Props) {
  const { user, haptic, initData } = useTelegram();

  const [balanceTon, setBalanceTon] = useState(0);
  const [balanceStars, setBalanceStars] = useState(0);
  const [items, setItems] = useState<Nft[]>([]);
  const [loading, setLoading] = useState(true);

  // Данные пользователя из Telegram
  const [userName, setUserName] = useState('Пользователь');
  const [username, setUsername] = useState('@username');
  const [avatarUrl, setAvatarUrl] = useState('');

  const refLink = `https://t.me/YourBot?start=ref_${user?.id || 123}`;

  useEffect(() => {
    // Извлекаем данные пользователя напрямую из Telegram WebApp
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser) {
      setUserName(tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : ''));
      setUsername(tgUser.username ? '@' + tgUser.username : '');
      setAvatarUrl(tgUser.photo_url || '');
    }

    let cancelled = false;
    const userId = String(user?.id ?? '6267608438');
    Promise.all([fetchUserData(initData), fetchInventory(initData, userId)])
      .then(([userData, inventory]) => {
        if (cancelled) return;
        setBalanceTon((userData as any).balance_ton ?? 0);
        setBalanceStars((userData as any).balance_stars ?? 0);
        setItems(inventory);
        setLoading(false);
      })
      .catch((err) => { console.error(err); setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyRef = async () => {
    haptic('light');
    try {
      await navigator.clipboard.writeText(refLink);
      haptic('medium');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = refLink;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
  };

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
          <span style={{ fontWeight: 'bold', fontSize: 15 }}>{balanceTon.toFixed(4)}</span>
        </div>
      </div>

      {/* ── Баннер рефералки ──────────────────────── */}
      <div style={{ backgroundImage: `url("${publicUrl('Phon_ref_.png')}")`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 16, padding: '24px 20px', marginBottom: spacing.lg, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', borderRadius: 16 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 }}>ПОЛУЧАЙ</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#ffd700', marginBottom: spacing.md }}>5% С ИХ ТРАТ</div>
          <Button variant="primary" fullWidth onClick={handleCopyRef}>📋 Пригласить</Button>
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

      {/* ── Навигационные кнопки ────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: spacing.md }}>
        <Button size="lg" fullWidth onClick={() => onNavigate('referral')}>
          👥 Рефералы
        </Button>
      </div>

      {/* ── Подпись ────────────────────────────────── */}
      <div style={{ textAlign: 'center', color: '#666', fontSize: 12, marginTop: 32, marginBottom: 16 }}>
        By @ERR_279
      </div>

      {/* ── Админ-панель (красная, в самом низу) ──────────────── */}
      {/* Проверка Telegram ID закомментирована (временно) — страница открыта всем */}
      <div style={{ marginTop: spacing.lg }}>
        <Button size="lg" fullWidth variant="danger" onClick={() => onNavigate('admin')}>
          ⚙️ Админ-Панель
        </Button>
      </div>
    </div>
  );
}