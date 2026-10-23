import { useState, useEffect, useRef } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { useTelegram } from '../hooks/useTelegram';
import type { CaseItem } from './CaseShop';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  caseData: CaseItem;
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/* ─── Пул предметов ─── */
interface DropItem {
  name: string;
  image: string;
  rarity: string;
  chance: number; // %
  price: number;
}

const DEFAULT_POOL: DropItem[] = [
  { name: 'Plush Pepe', image: '/GOLD.png', rarity: 'legendary', chance: 1, price: 500 },
  { name: 'Durov Cap', image: '/Silver.png', rarity: 'epic', chance: 4, price: 200 },
  { name: 'Astral Shard', image: '/CASE_COPPER.png', rarity: 'rare', chance: 10, price: 80 },
  { name: 'Golden Fish', image: '/CaseWOOD.png', rarity: 'rare', chance: 10, price: 75 },
  { name: 'Shadow Veil', image: '/case-test.png', rarity: 'uncommon', chance: 15, price: 40 },
  { name: 'Ruby Heart', image: '/GOLD.png', rarity: 'uncommon', chance: 15, price: 35 },
  { name: 'Emerald Eye', image: '/Silver.png', rarity: 'uncommon', chance: 15, price: 30 },
  { name: 'Moonstone', image: '/CASE_COPPER.png', rarity: 'common', chance: 30, price: 10 },
];

function loadPool(): DropItem[] {
  try {
    const raw = localStorage.getItem('drop_chances');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_POOL;
}

/* ─── Цвет редкости ─── */
function rarityColor(rarity: string): string {
  switch (rarity) {
    case 'legendary': return '#ff4500';
    case 'epic':      return '#a855f7';
    case 'rare':      return '#3b82f6';
    case 'uncommon':  return '#22c55e';
    default:          return '#a0a0a0';
  }
}

export function CasePage({ caseData, onBack, onToast }: Props) {
  const { haptic, vibrate, user } = useTelegram();

  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wonItem, setWonItem] = useState<DropItem | null>(null);
  const [showResult, setShowResult] = useState(false);

  /* Анимация прокрутки */
  const pool = loadPool();
  const [displayImg, setDisplayImg] = useState(pool[0].image);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const spin = async () => {
    if (spinning || loading) return;

    /* Проверка баланса */
    const fakeBalance = parseFloat(localStorage.getItem('fake_balance') || '0');
    if (fakeBalance < caseData.price) {
      haptic('medium');
      onToast('❌ Недостаточно TON на балансе!', 'error');
      return;
    }

    haptic('medium');
    setLoading(true);
    setWonItem(null);
    setShowResult(false);

    try {
      /* Запрос к серверу */
      const response = await fetch('http://localhost:8000/api/open_case', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          case_price: caseData.price,
        }),
      });
      const data = await response.json();

      if (data.success === true) {
        /* Сервер подтвердил — списываем цену локально */
        const newBalance = fakeBalance - caseData.price;
        localStorage.setItem('fake_balance', newBalance.toFixed(4));

        const winner: DropItem = data.item;
        setWonItem(winner);
        setSpinning(true);

        /* Анимация прокрутки — 2 секунды, 20 кадров */
        let tick = 0;
        const maxTicks = 20;

        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          tick++;
          const idx = Math.floor(Math.random() * pool.length);
          setDisplayImg(pool[idx].image);

          if (tick >= maxTicks) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            setSpinning(false);
            setDisplayImg(winner.image);
            setShowResult(true);
            vibrate('success');
            onToast(`🎉 Вы выиграли ${winner.name}!`, 'success');
          }
        }, 100);
      } else {
        onToast(data.error || '❌ Ошибка при открытии кейса', 'error');
      }
    } catch (err) {
      onToast('❌ Не удалось связаться с сервером', 'error');
    } finally {
      setLoading(false);
    }
  };

  const claimPrize = () => {
    if (!wonItem) return;
    haptic('medium');

    /* Сохраняем в localStorage */
    const inventory: DropItem[] = JSON.parse(localStorage.getItem('inventory') || '[]');
    inventory.push({ ...wonItem });
    localStorage.setItem('inventory', JSON.stringify(inventory));

    onToast(`🎁 ${wonItem.name} отправлен в инвентарь!`, 'success');
    setWonItem(null);
    setShowResult(false);
    onBack();
  };

  const closeResult = () => {
    setShowResult(false);
    setWonItem(null);
  };
return (
    <div style={{ padding: spacing.md, color: colors.text, overflow: 'hidden' }}>
      <Button variant="ghost" onClick={onBack} size="sm">← Назад</Button>

      <h1 style={{ marginTop: spacing.md, marginBottom: 4 }}>🎁 {caseData.name}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <img
          src={publicUrl('TON.png')}
          alt="TON"
          style={{ width: 16, height: 16, objectFit: 'contain' }}
        />
        <span style={{ color: colors.gold, fontWeight: 'bold', fontSize: 16 }}>
          {caseData.price.toFixed(2)} TON
        </span>
      </div>

      {/* Превью / анимация прокрутки */}
      <div
        style={{
          marginTop: spacing.md,
          background: colors.bgCard,
          borderRadius: 16,
          padding: 24,
          textAlign: 'center',
          border: `1px solid ${colors.border}`,
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={publicUrl(displayImg.replace(/^\//, ''))}
          onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
          alt="item"
          style={{
            width: 140,
            height: 140,
            objectFit: 'contain',
            transition: 'transform 0.1s',
            transform: spinning ? 'scale(1.08)' : 'scale(1)',
          }}
        />
        <div style={{ marginTop: 12, fontSize: 13, color: colors.textMuted }}>
          {spinning ? '🎲 Прокрутка...' : caseData.name}
        </div>
      </div>

      {/* Возможные предметы */}
      <div
        style={{
          background: colors.bgCard,
          borderRadius: 12,
          padding: spacing.md,
          marginTop: spacing.md,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>
          Возможные предметы ({pool.length} шт.):
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pool.map((p, i) => (
            <span
              key={i}
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                color: rarityColor(p.rarity),
              }}
            >
              {p.name} ({p.chance}%)
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: spacing.lg }}>
        <Button size="lg" fullWidth onClick={spin} disabled={spinning || loading}>
          {loading
            ? '⏳ Загрузка...'
            : spinning
            ? '🎲 Открываем...'
            : `🎰 Открыть кейс (${caseData.price.toFixed(2)} TON)`}
        </Button>
      </div>
{/* ─── Модальное окно результата ─── */}
      {showResult && wonItem && (
        <div
          onClick={closeResult}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: 20,
            animation: 'ug-fade 0.3s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1c1c1e',
              borderRadius: 20,
              padding: '32px 24px',
              textAlign: 'center',
              maxWidth: 320,
              width: '100%',
              border: `2px solid ${rarityColor(wonItem.rarity)}`,
            }}
          >
            <img
              src={publicUrl(wonItem.image.replace(/^\//, ''))}
              onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
              alt={wonItem.name}
              style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 12 }}
            />
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 4 }}>
              {wonItem.rarity.toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: rarityColor(wonItem.rarity),
                marginBottom: 4,
              }}
            >
              🎉 {wonItem.name}
            </div>
            <div style={{ fontSize: 14, color: colors.gold, marginBottom: 16 }}>
              ≈ {wonItem.price.toFixed(2)} TON
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button size="lg" fullWidth onClick={claimPrize}>
                📦 Забрать в инвентарь
              </Button>
              <Button size="sm" fullWidth variant="ghost" onClick={closeResult}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
