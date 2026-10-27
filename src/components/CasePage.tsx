import { useState, useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { useTelegram } from '../hooks/useTelegram';
import type { CaseItem } from './CaseShop';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';

/* ─── Константы условий бесплатного кейса ─── */
const TG_CHANNEL = '@Test_Erra';
const TG_CHANNEL_LINK = 'https://t.me/Test_Erra';
const BOT_USERNAME = 'GAMERR_777_BOT';

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
  type?: string; // 'ton' — TON-приз: начисляется на баланс, а не в инвентарь
}

/* Пулы предметов по кейсам — синхронизированы с server.py */
const CASE_POOLS: Record<string, DropItem[]> = {
  case_wood: [
    { name: 'Bow Tie', image: '/nft_images/bow_tie.webp', rarity: 'common', chance: 40, price: 5.814 },
    { name: 'Fresh Socks', image: '/nft_images/fresh_socks.webp', rarity: 'uncommon', chance: 30, price: 4.488 },
    { name: 'Candy Cane', image: '/nft_images/candy_cane.webp', rarity: 'uncommon', chance: 20, price: 3.8862 },
    { name: 'Snow Globe', image: '/nft_images/snow_globe.webp', rarity: 'rare', chance: 10, price: 6.426 },
  ],
  case_copper: [
    { name: 'Swiss Watch', image: '/nft_images/swiss_watch.webp', rarity: 'rare', chance: 30, price: 56.0694 },
    { name: 'Signet Ring', image: '/nft_images/signet_ring.webp', rarity: 'rare', chance: 30, price: 36.006 },
    { name: 'Valentine Box', image: '/nft_images/valentine_box.webp', rarity: 'uncommon', chance: 20, price: 12.75 },
    { name: 'Jingle Bells', image: '/nft_images/jingle_bells.webp', rarity: 'uncommon', chance: 20, price: 10.7712 },
  ],
  case_silver: [
    { name: 'Astral Shard', image: '/nft_images/astral_shard.webp', rarity: 'epic', chance: 10, price: 120.819 },
    { name: 'Genie Lamp', image: '/nft_images/genie_lamp.webp', rarity: 'rare', chance: 20, price: 38.7294 },
    { name: 'Toy Bear', image: '/nft_images/toy_bear.webp', rarity: 'rare', chance: 30, price: 34.5984 },
    { name: 'Love Potion', image: '/nft_images/love_potion.webp', rarity: 'uncommon', chance: 40, price: 14.79 },
  ],
  case_gold: [
    { name: 'Heart Locket', image: '/nft_images/heart_locket-removebg-preview.png', rarity: 'legendary', chance: 1, price: 1249.4897 },
    { name: 'Precious Peach', image: '/nft_images/precious_peach.webp', rarity: 'epic', chance: 4, price: 259.5798 },
    { name: 'Durovs Cap', image: '/nft_images/durovs_cap.webp', rarity: 'rare', chance: 15, price: 420.24 },
    { name: 'Mighty Arm', image: '/nft_images/mighty_arm.webp', rarity: 'rare', chance: 30, price: 127.4592 },
    { name: 'Perfume Bottle', image: '/nft_images/perfume_bottle.webp', rarity: 'uncommon', chance: 50, price: 83.1096 },
  ],
  case_free: [
    { name: '0.01 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 55, price: 0.01 },
    { name: '0.1 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 20, price: 0.1 },
    { name: '0.2 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 10, price: 0.2 },
    { name: '0.3 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 7, price: 0.3 },
    { name: '0.5 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 5, price: 0.5 },
    { name: '1 TON', image: '/TON.png', rarity: 'common', type: 'ton', chance: 2.99, price: 1 },
    { name: 'Big Year', image: '/nft_images/big_year.webp', rarity: 'legendary', type: 'item', chance: 0.01, price: 3.89 },
  ],
};

const DEFAULT_POOL: DropItem[] = CASE_POOLS['case_wood'];

/* ─── Источник пула — только обновлённые статические массивы (никакого localStorage/старого кода) ─── */
function loadPool(caseId: string): DropItem[] {
  return CASE_POOLS[caseId] ?? DEFAULT_POOL;
}

/* ─── Форматирование шанса из пула ─── */
const formatChance = (chance: number): string => `${+chance.toFixed(2)}%`;

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
const ITEM_WIDTH = 80;              // ширина слота
const ITEM_STRIP_WIDTH = ITEM_WIDTH - 8; // фактическая ширина элемента в ленте (width: ITEM_WIDTH - 8)
const ITEM_GAP = 4;                 // gap между слотами
const STRIP_PADDING_LEFT = 8;       // paddingLeft ленты
const VIEWPORT_WIDTH = 240;
const ITEMS_COUNT = () => 30 + Math.floor(Math.random() * 11); // 30–40

/* Центр i-го слота в координатах ленты — с учётом gap и padding */
const stripItemCenter = (index: number): number =>
  STRIP_PADDING_LEFT + index * (ITEM_STRIP_WIDTH + ITEM_GAP) + ITEM_STRIP_WIDTH / 2;

export function CasePage({ caseData, onBack, onToast, onUpdateBalance, balance }: Props) {
  const { haptic, vibrate, user } = useTelegram();

  const pool = loadPool(caseData.id);

  const [isSpinning, setIsSpinning] = useState(false);
  const [wonItem, setWonItem] = useState<DropItem | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [spinItems, setSpinItems] = useState<DropItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<DropItem | null>(null);

  /* ─── Условия бесплатного кейса ─── */
  const isFree = caseData.id === 'case_free';
  const [shareDone, setShareDone] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const checkingSub = useRef(false);
  const shareListenerRegistered = useRef(false);
  const conditionsMet = !isFree || (shareDone && subscribed);

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
  const generateSpinArray = (
    winningItem: DropItem,
  ): { items: DropItem[]; winIndex: number } => {
    const count = ITEMS_COUNT();
    const arr: DropItem[] = [];

    /* Win-индекс — ~25, ближе к концу. Именно сюда кладём `winningItem` (data.item). */
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

    return { items: arr, winIndex };
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
      // Точная позиция выигрышного слота: учитываем gap и padding ленты.
      // Раньше тут использовалась формула без gap/padding, из-за чего к
      // финишу лента смещалась на несколько слотов и в центре оказывался НЕ data.item.
      const finalX = -(stripItemCenter(targetIndex) - viewportCenter);
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
      vibrate('error');
      return;
    }

    /* 1. Запрос на сервер — открытие кейса (списание + выбор предмета) */
    setIsSpinning(true);

    try {
      const userId = String(user?.id ?? '6267608438');
      const res = await fetch(`${CONFIG.API_URL}/api/open_case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          case_id: caseData.id,
          case_price: price,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.item) {
        // Сервер вернул ошибку — деньги НЕ списаны (сервер откатывает транзакцию)
        throw new Error(data.error || 'Ошибка при открытии кейса');
      }

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

      /* 3. Генерируем рулетку. `winIndex` — детерминированный индекс, по которому
           в ленту положен ровно `data.item`: центр после анимации = data.item. */
      const serverItem = data.item as DropItem;
      const { items, winIndex } = generateSpinArray(serverItem);

      setSpinItems(items);

      /* 2. Сервер списал деньги — обновляем баланс на фронтенде */
      onUpdateBalance(-price);

      /* 2.1 TON-приз (type === 'ton') — НЕ добавляем в инвентарь (addToInventory не вызывается).
           Сервер уже начислил сумму на баланс; здесь синхронизируем UI. */
      if (serverItem.type === 'ton') {
        onUpdateBalance(serverItem.price);
      }
      haptic('medium');

      /* 3.1 Сервер уже сам записал предмет в inventory при вызове /api/open_case.
           Клиент НЕ вызывает addToInventory — это предотвращает рассинхрон
           и выдачу предмета при ошибках. Просто ждём анимацию. */

      /* 4. Запускаем анимацию рулетки */
      await runSpinAnimation(winIndex);

      /* 4.1 (блок удалён — сервер пишет самостоятельно, await не требуется) */

      /* 5. Анимация завершена — показываем результат */
      setIsSpinning(false);

      setWonItem(serverItem);
      setShowResult(true);
    } catch (e: any) {
      console.error(e);
      onToast(e.message || 'Ошибка сети', 'error');
      setIsSpinning(false);
    }
  };

  /* ─── Закрыть модалку результата ─── */
  const closeResult = () => {
    setShowResult(false);
    setWonItem(null);
  };

  /* ─── Обработчики для бесплатного кейса ─── */

  /** Регистрируем слушатель shareMessageSent (только один раз) */
  const initShareListener = () => {
    if (shareListenerRegistered.current) return;
    shareListenerRegistered.current = true;
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.onEvent) {
      tg.onEvent('shareMessageSent', () => {
        setShareDone(true);
        onToast?.('✅ Сообщение отправлено!', 'success');
      });
    } else if (tg?.addEventListener) {
      tg.addEventListener('shareMessageSent', () => {
        setShareDone(true);
        onToast?.('✅ Сообщение отправлено!', 'success');
      });
    }
  };

  const handleShare = () => {
    haptic('light');
    initShareListener();
    const userId = String(user?.id ?? '6267608438');
    const refLink = `https://t.me/${BOT_USERNAME}?startapp=ref_${userId}`;
    const shareText = '🎁 Забирай бесплатный кейс в Cazino! Переходи по ссылке 👇';
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

    // Условие «Поделиться» засчитываем сразу (имитация): событие shareMessageSent
    // срабатывает только при WebApp.shareMessage(), у нас msg_id нет, поэтому
    // ставим галочку напрямую, а ссылку для репоста всё равно открываем.
    setShareDone(true);
    onToast?.('✅ Сообщение отправлено!', 'success');

    const tg = window.Telegram?.WebApp as any;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else if (tg?.openLink) {
      tg.openLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  const checkSubscription = async (): Promise<boolean> => {
    if (checkingSub.current) return subscribed;
    checkingSub.current = true;
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/check_subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ user_id: String(user?.id ?? '6267608438') })
      });
      const data = await res.json();
      if (data.subscribed) {
        setSubscribed(true);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[checkSubscription] error:', e);
      return false;
    } finally {
      checkingSub.current = false;
    }
  };

  const handleSubscribe = () => {
    haptic('light');
    const tg = window.Telegram?.WebApp as any;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(TG_CHANNEL_LINK);
    } else if (tg?.openLink) {
      tg.openLink(TG_CHANNEL_LINK);
    } else {
      window.open(TG_CHANNEL_LINK, '_blank');
    }
    // Через 2 секунды проверяем подписку: даём пользователю время перейти по ссылке
    // и подписаться на канал. При subscribed: true checkSubscription поставит галочку.
    setTimeout(() => {
      checkSubscription();
    }, 2000);
  };

  /** Проверяем условия на кнопке «Выполнить условия» */
  const handleVerify = async () => {
    haptic('light');
    if (!shareDone) {
      onToast?.('Выполните все условия', 'error');
      return;
    }
    const ok = await checkSubscription();
    if (ok && shareDone) {
      onToast?.('✅ Условия выполнены!', 'success');
    } else {
      onToast?.('Выполните все условия', 'error');
    }
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
        <Button size="lg" fullWidth onClick={handleOpenCase} disabled={!conditionsMet || isSpinning}>
          {isSpinning
            ? '🎲 Открываем...'
            : !conditionsMet
              ? '🎰 Выполните условия, чтобы открыть'
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
        {/* Сетка карточек как в Маркете: grid-cols-2 (2 равные колонки), gap-2 — равномерное распределение */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {pool.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              onClick={() => setSelectedItem(p)}
              style={{
                background: '#1a1a2e',
                borderRadius: 12 /* rounded-xl */,
                border: `1px solid ${colors.border}`,
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.15s, border-color 0.15s',
              }}
            >
              {/* Картинка в пропорции 4:3 */}
              <div
                style={{
                  aspectRatio: '4 / 3',
                  background: '#0f0f13',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: 8,
                }}
              >
                <img
                  src={publicUrl(p.image.replace(/^\//, ''))}
                  alt={p.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
              {/* Название */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  textAlign: 'center',
                  padding: '8px 8px 0',
                  lineHeight: 1.25,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </div>
              {/* Цена в TON */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  color: colors.gold,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '4px 8px 10px',
                }}
              >
                <img src={publicUrl('TON.png')} alt="TON" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                {p.price.toFixed(2)} TON
              </div>
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
              src={publicUrl(wonItem.type === 'ton' ? 'TON.png' : wonItem.image.replace(/^\//, ''))}
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
            <div
              style={{
                fontSize: 14,
                color: colors.gold,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {wonItem.type === 'ton' ? (
                <>
                  <img src={publicUrl('TON.png')} alt="TON" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                  <span>+{wonItem.price.toFixed(2)} TON</span>
                </>
              ) : (
                <>≈ {wonItem.price.toFixed(2)} TON</>
              )}
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
                  {formatChance(selectedItem.chance)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Условия бесплатного кейса (модалка) ─── */}
      {isFree && !conditionsMet && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            animation: 'ug-fade 0.3s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a2e',
              border: '1px solid #22c55e',
              borderRadius: 24,
              padding: 24,
              width: '90%',
              maxWidth: 380,
              color: '#fff',
            }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>
              🎁 Бонусный кейс
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 20 }}>
              Выполните условия, чтобы открыть бесплатный кейс
            </p>

            {/* Условие 1: Поделиться */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 16,
              marginBottom: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: shareDone ? '#22c55e' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {shareDone ? <CheckCircle size={20} color="#fff" /> : '📤'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
                  Отправьте сообщение другу
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {shareDone ? 'Готово ✓' : 'Нажмите кнопку'}
                </div>
              </div>
              {!shareDone && (
                <button onClick={handleShare} style={{
                  background: '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                  Поделиться
                </button>
              )}
            </div>

            {/* Условие 2: Подписка (исправлено: flex justify-between items-center) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 16,
              marginBottom: 20,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: subscribed ? '#22c55e' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {subscribed ? <CheckCircle size={20} color="#fff" /> : '📢'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
                  Подпишитесь на канал {TG_CHANNEL}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {subscribed ? 'Подписка подтверждена ✓' : 'Нажмите кнопку'}
                </div>
              </div>
              {!subscribed && (
                <button onClick={handleSubscribe} style={{
                  background: '#229ed9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                  Подписаться
                </button>
              )}
            </div>

            {/* Кнопка «Выполнить условия» */}
            <button
              onClick={handleVerify}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                fontWeight: 'bold',
                fontSize: 16,
                border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              ✅ Выполнить условия
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
