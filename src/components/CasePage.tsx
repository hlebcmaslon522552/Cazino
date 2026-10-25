import { useState, useEffect, useRef } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { useTelegram } from '../hooks/useTelegram';
import type { CaseItem } from './CaseShop';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { addToInventory } from '../api';

interface Props {
  caseData: CaseItem;
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onUpdateBalance: (amount: number) => void;
  balance: number;
}

/* ─── Пул предметов ─── */
interface DropItem {
  name: string;
  image: string;
  rarity: string;
  chance: number;
  price: number;
  floor?: number;
}

const DEFAULT_POOL: DropItem[] = [
  { name: 'Plush Pepe', image: '/nft_images/plush_pepe.webp', rarity: 'legendary', chance: 1, price: 500 },
  { name: 'Durov Cap', image: '/nft_images/durovs_cap.webp', rarity: 'epic', chance: 4, price: 200 },
  { name: 'Astral Shard', image: '/nft_images/astral_shard.webp', rarity: 'rare', chance: 10, price: 80 },
  { name: 'Golden Fish', image: '/nft_images/bonded_ring.webp', rarity: 'rare', chance: 10, price: 75 },
  { name: 'Shadow Veil', image: '/nft_images/westside_sign.webp', rarity: 'uncommon', chance: 15, price: 40 },
  { name: 'Ruby Heart', image: '/nft_images/heart_locket-removebg-preview.png', rarity: 'uncommon', chance: 15, price: 35 },
  { name: 'Emerald Eye', image: '/nft_images/clover_pin.webp', rarity: 'uncommon', chance: 15, price: 30 },
  { name: 'Moonstone', image: '/nft_images/moon_pendant.webp', rarity: 'common', chance: 30, price: 10 },
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

/* ─── Взвешенный случайный выбор ─── */
function pickRandomItem(pool: DropItem[]): DropItem {
  const total = pool.reduce((s, i) => s + i.chance, 0);
  let r = Math.random() * total;
  for (const item of pool) {
    r -= item.chance;
    if (r <= 0) return item;
  }
  return pool[pool.length - 1];
}

/* ─── Константы рулетки ─── */
const ITEM_WIDTH = 80;
const VIEWPORT_WIDTH = 240;
const ITEMS_COUNT = () => 30 + Math.floor(Math.random() * 11); // 30–40

export function CasePage({ caseData, onBack, onToast, onUpdateBalance, balance }: Props) {
  const { haptic, user, initData } = useTelegram();

  const pool = loadPool();

  const [isSpinning, setIsSpinning] = useState(false);
  const [wonItem, setWonItem] = useState<DropItem | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [spinItems, setSpinItems] = useState<DropItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<DropItem | null>(null);

  const stripRef = useRef<HTMLDivElement>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) clearTimeout(animationTimerRef.current);
    };
  }, []);

  /* ─── Поиск самого дорогого предмета в пуле ─── */
  const getMostExpensive = (): DropItem => {
    return pool.reduce((max, it) => (it.price > max.price ? it : max), pool[0]);
  };

  /* ─── Генерация массива для рулетки с Near Miss ─── */
  const generateSpinArray = (winningItem: DropItem): DropItem[] => {
    const count = ITEMS_COUNT();
    const arr: DropItem[] = [];

    /* Win-индекс — ~25, ближе к концу */
    const winIndex = Math.min(25, count - 3);

    /* Near Miss: 35% — ставим самый дорогой предмет прямо перед выигрышным */
    const triggerNearMiss = Math.random() < 0.35;
    const mostExpensive = getMostExpensive();

    for (let i = 0; i < count; i++) {
      if (i === winIndex) {
        arr.push({ ...winningItem, floor: winningItem.floor ?? winningItem.price });
      } else if (triggerNearMiss && i === winIndex - 1) {
        arr.push({ ...mostExpensive, floor: mostExpensive.floor ?? mostExpensive.price });
      } else {
        const randItem = pickRandomItem(pool);
        arr.push({ ...randItem, floor: randItem.floor ?? randItem.price });
      }
    }

    return arr;
  };

  /* ─── Запуск CSS-анимации translateX ─── */
  const runSpinAnimation = (targetIndex: number): Promise<void> => {
    return new Promise((resolve) => {
      const strip = stripRef.current;
      if (!strip) {
        resolve();
        return;
      }

      const viewportCenter = VIEWPORT_WIDTH / 2;
      const finalX = -(targetIndex * ITEM_WIDTH + ITEM_WIDTH / 2 - viewportCenter);
      const extraSpin = targetIndex * ITEM_WIDTH + 2000; // откат назад для раскрутки

      /* Фаза 1 — мгновенный откат назад (имитация раскрутки) */
      strip.style.transition = 'none';
      strip.style.transform = `translateX(${-extraSpin}px)`;
      void strip.offsetHeight; // принудительный reflow

      /* Фаза 2 — анимация до выигрышной позиции с замедлением */
      strip.style.transition = 'transform 3.8s cubic-bezier(0.05, 0.7, 0.1, 1.0)';
      strip.style.transform = `translateX(${finalX}px)`;

      animationTimerRef.current = setTimeout(resolve, 4000);
    });
  };

  /* ─── Открытие кейса ─── */
  const handleOpenCase = async () => {
    if (isSpinning) return;

    const currentBalance = Number(balance);
    const price = Number(caseData.price);

    if (isNaN(currentBalance) || currentBalance < price) {
      onToast('Недостаточно TON на балансе!', 'error');
      haptic('error');
      return;
    }

    /* 1. Списываем цену кейса */
    onUpdateBalance(-price);
    haptic('medium');

    // Отправляем оборот
    if (price > 0) {
      fetch(`${CONFIG.API_URL}/api/add_turnover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          username: user?.first_name || 'Игрок',
          amount: price,
        }),
      }).catch(() => {});
    }

    /* 2. Запрос на сервер */
    setIsSpinning(true);

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/play_game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || '6267608438',
          game_type: 'case',
          bet_amount: price,
          initData: initData,
        }),
      });

      const data = await res.json();

      if (!data.success || !data.item) {
        throw new Error(data.error || 'Ошибка при открытии кейса');
      }

      /* 3. Сервер вернул успех — генерируем рулетку */
      const serverItem = data.item as DropItem;
      const items = generateSpinArray(serverItem);
      // Ищем индекс выигрышного предмета в массиве
      let winIndex = -1;
      for (let i = 0; i < items.length; i++) {
        const matchPrice = items[i].price === serverItem.price;
        const matchFloor = items[i].floor === serverItem.floor || items[i].floor === serverItem.price;
        if (items[i].name === serverItem.name && (matchPrice || matchFloor)) {
          winIndex = i;
          break;
        }
      }
      const safeWinIndex = winIndex >= 0 ? winIndex : 25;

      setSpinItems(items);

      /* 4. Запускаем анимацию рулетки */
      await runSpinAnimation(safeWinIndex);

      /* 5. Анимация завершена — добавляем в инвентарь, показываем результат */
      setIsSpinning(false);

      const userId = String(user?.id ?? '6267608438');
      const saved = await addToInventory(serverItem, userId);

      if (!saved) {
        onToast('Ошибка сохранения. Деньги возвращены', 'error');
        onUpdateBalance(price);
        return;
      }

      setWonItem(serverItem);
      setShowResult(true);
    } catch (e: any) {
      console.error(e);
      onToast(e.message || 'Ошибка сети', 'error');
      /* Возвращаем деньги при ошибке */
      onUpdateBalance(price);
      setIsSpinning(false);
    }
  };

  /* ─── Закрыть модалку результата ─── */
  const closeResult = () => {
    setShowResult(false);
    setWonItem(null);
  };
return (
    <div style={{ padding: spacing.md, color: colors.text, overflow: 'hidden' }}>
      {/* ─── Кнопка "Назад" ─── */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Назад
      </Button>

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

      {/* ─── РУЛЕТКА ─── */}
      <div
        style={{
          marginTop: spacing.md,
          background: colors.bgCard,
          borderRadius: 16,
          padding: '8px 0',
          border: `1px solid ${colors.border}`,
          position: 'relative',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {/* Указатель (стрелка) */}
        <div
          style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            width: 0,
            height: 0,
            borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent',
            borderTop: '18px solid #ff2d55',
            filter: 'drop-shadow(0 0 6px #ff2d55)',
          }}
        />
        {/* Подсветка указателя */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 2,
            height: '100%',
            background: 'rgba(255,45,85,0.15)',
            zIndex: 9,
            pointerEvents: 'none',
          }}
        />
        {/* Маска по бокам (затемнение) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 20,
            height: '100%',
            background: 'linear-gradient(to right, rgba(21,21,33,1) 0%, transparent 100%)',
            zIndex: 8,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 20,
            height: '100%',
            background: 'linear-gradient(to left, rgba(21,21,33,1) 0%, transparent 100%)',
            zIndex: 8,
            pointerEvents: 'none',
          }}
        />
        {/* Окошко просмотра */}
        <div
          style={{
            width: VIEWPORT_WIDTH,
            maxWidth: '100%',
            height: 100,
            margin: '0 auto',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Лента предметов */}
          <div
            ref={stripRef}
            style={{
              display: 'flex',
              gap: 4,
              height: '100%',
              alignItems: 'center',
              paddingLeft: 8,
              willChange: 'transform',
            }}
          >
            {spinItems.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: ITEM_WIDTH - 8,
                    flexShrink: 0,
                    height: 80,
                    borderRadius: 10,
                    background: '#2a2a40',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.4,
                  }}
                >
                  <span style={{ fontSize: 10, color: '#666' }}>?</span>
                </div>
              ))
            ) : (
              spinItems.map((item, idx) => (
                <div
                  key={`${idx}-${item.name}`}
                  style={{
                    width: ITEM_WIDTH - 8,
                    minWidth: ITEM_WIDTH - 8,
                    flexShrink: 0,
                    height: 80,
                    borderRadius: 10,
                    background: '#2a2a40',
                    border: `2px solid ${rarityColor(item.rarity)}33`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 2px',
                    boxSizing: 'border-box',
                  }}
                >
                  <img
                    src={publicUrl(item.image.replace(/^\//, ''))}
                    alt={item.name}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    style={{ width: 36, height: 36, objectFit: 'contain', display: 'block' }}
                  />
                  <span
                    style={{
                      fontSize: 8,
                      color: rarityColor(item.rarity),
                      fontWeight: 600,
                      marginTop: 2,
                      textAlign: 'center',
                      lineHeight: 1.1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {item.name}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Кнопка открытия ─── */}
      <div style={{ marginTop: spacing.lg }}>
        <Button size="lg" fullWidth onClick={handleOpenCase} disabled={isSpinning}>
          {isSpinning
            ? '🎲 Открываем...'
            : `🎰 Открыть кейс (${caseData.price.toFixed(2)} TON)`}
        </Button>
      </div>

      {/* ─── Возможные предметы ─── */}
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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {pool.map((p, i) => (
            <div
              key={i}
              onClick={() => setSelectedItem(p)}
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '6px 10px',
                fontSize: 12,
                color: rarityColor(p.rarity),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: '#2a2a40',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img
                  src={publicUrl(p.image.replace(/^\//, ''))}
                  alt={p.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span style={{ color: '#f5c842', fontWeight: 600, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <img src={publicUrl('TON.png')} alt="TON" style={{ width: 12, height: 12, objectFit: 'contain' }} />
                {p.price.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
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
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 4 }}>
              Вы выиграли
            </div>
            <img
              src={publicUrl(wonItem.image.replace(/^\//, ''))}
              onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
              alt={wonItem.name}
              style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 12 }}
            />
            <div
              style={{
                fontSize: 22,
                fontWeight: 'bold',
                color: rarityColor(wonItem.rarity),
                marginBottom: 4,
              }}
            >
              {wonItem.name}
            </div>
            <div style={{ fontSize: 14, color: colors.gold, marginBottom: 16 }}>
              ≈ {wonItem.price.toFixed(2)} TON
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button size="lg" fullWidth onClick={closeResult}>
                ✅ Забрать
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Модальное окно предмета ─── */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 320,
              background: '#1c1c2e',
              borderRadius: 24,
              padding: 20,
              border: '1px solid #374151',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
              position: 'relative',
            }}
          >
            {/* Кнопка закрытия */}
            <button
              onClick={() => setSelectedItem(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                color: '#9ca3af',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 24,
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            {/* Заголовок */}
            <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
              Предмет
            </h3>

            {/* Картинка и название */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 16,
                  background: '#2a2a40',
                  border: '2px solid rgba(168,85,247,0.5)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                  flexShrink: 0,
                }}
              >
                <img
                  src={publicUrl(selectedItem.image.replace(/^\//, ''))}
                  alt={selectedItem.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              <div>
                <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 18, lineHeight: 1.2, marginBottom: 4 }}>
                  {selectedItem.name}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a855f7', fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }}></span>
                  {selectedItem.rarity || 'Редкий'}
                </div>
              </div>
            </div>

            {/* Таблица с ценой и шансом */}
            <div
              style={{
                background: '#151521',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid #1f2937',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  borderBottom: '1px solid #1f2937',
                }}
              >
                <span style={{ color: '#9ca3af' }}>Цена</span>
                <span style={{ color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {selectedItem.floor || selectedItem.price}{' '}
                  <img src={publicUrl('TON.png')} alt="TON" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                }}
              >
                <span style={{ color: '#9ca3af' }}>Шанс</span>
                <span style={{ color: '#fff', fontWeight: 'bold' }}>
                  {selectedItem.chance} %
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
