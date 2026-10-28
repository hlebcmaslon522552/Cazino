import { useState, useEffect } from 'react';
import { LottiePlayer } from './ui/LottiePlayer';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { getInitData, fetchInventory } from '../api';

/* ===================================================================
   NFT данные (из all_gifts.json)
   =================================================================== */

interface Nft {
  // id может быть числом (из инвентаря сервера) или строкой (из my_nfts.json)
  id: number | string;
  name: string;
  floor: number;
  image: string;
}

/* ===================================================================
   Компонент карточки NFT для сетки выбора
   =================================================================== */

function NftGridCard({
  nft,
  selected,
  disabled,
  onClick,
}: {
  nft: Nft;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        aspectRatio: '3 / 4',
        background: disabled ? 'rgba(255,255,255,0.04)' : '#1c1c1e',
        borderRadius: 12,
        border: `1.5px solid ${
          disabled
            ? 'rgba(255,255,255,0.08)'
            : selected
              ? colors.accent
              : 'rgba(255,255,255,0.1)'
        }`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 8,
        opacity: disabled ? 0.45 : 1,
        transition: 'border-color 0.15s',
        overflow: 'hidden',
      }}
    >
      <img
        src={publicUrl(nft.image.replace(/^\//, ''))}
        alt={nft.name}
        style={{
          width: '100%',
          flex: 1,
          objectFit: 'contain',
          borderRadius: 8,
          minHeight: 0,
        }}
        onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 6,
          color: '#ffffff',
          fontSize: 12,
          fontWeight: 'bold',
        }}
      >
        <img
          src={publicUrl('TON.png')}
          alt="TON"
          style={{ width: 14, height: 14, objectFit: 'contain' }}
        />
        {nft.floor.toFixed(2)}
      </div>
    </div>
  );
}

/* ===================================================================
   Константы игры
   =================================================================== */

const MAX_CHANCE = 75;    // потолок шанса (%)
const MAX_START_NFTS = 4; // макс. количество начальных NFT для мультиставки
const STROKE = 16;        // толщина чёрной обводки (строго 16px)

/* Геометрия круга (viewBox 0 0 300 300, центр 150,150) */
const CX = 150;
const CY = 150;
const DISC_R = 107;          // радиус тёмной заливки #2a2a2a
const ARC_R = 121;           // радиус оранжевой дуги (полоса 107..135)
const ARC_W = 28;            // толщина дуги
const BORDER_R = 140;        // радиус чёрной обводки (полоса 132..148)
const CIRC = 2 * Math.PI * ARC_R;

/* ===================================================================
   Вспомогательные функции по геометрии
   =================================================================== */

// Точка на окружности. deg = 0 → 12 часов, далее по часовой стрелке.
function pt(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

/* ── 10 рисок по краю; на 12 часах — жирная чёрная риска-указатель ── */
function Ticks() {
  const ticks = [];
  for (let i = 0; i < 10; i++) {
    const deg = i * 36;
    const isTop = i === 0;
    const inner = pt(isTop ? 88 : 94, deg);
    const outer = pt(isTop ? 98 : 102, deg);
    ticks.push(
      <line
        key={i}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke={isTop ? '#000' : '#4a4a4a'}
        strokeWidth={isTop ? 7 : 2.5}
        strokeLinecap="butt"
      />
    );
  }
  return <g>{ticks}</g>;
}

/* ===================================================================
   Круг с оранжевой дугой
   =================================================================== */

interface WheelProps {
  chance: number;           // шанс в % (0..75)
  angle: number;            // текущий угол вращения дуги (град)
  spinning: boolean;
}

function Wheel({ chance, angle, spinning }: WheelProps) {
  const dash = (chance / 100) * CIRC;

  return (
    <div style={{ position: 'relative', width: 300, height: 300 }}>
      {/* База: тёмный диск + риски + стрелка-указатель (не вращается) */}
      <svg width={300} height={300} viewBox="0 0 300 300" style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <circle cx={CX} cy={CY} r={DISC_R} fill="#2a2a2a" />
        <Ticks />
        {/* Жирная чёрная риска-указатель на 12 часов */}
        <polygon
          points={`${CX},${CY - 112} ${CX - 8},${CY - 98} ${CX - 8},${CY - 96} ` +
                  `${CX - 4},${CY - 96} ${CX - 4},${CY - 88} ${CX + 4},${CY - 88} ` +
                  `${CX + 4},${CY - 96} ${CX + 8},${CY - 96} ${CX + 8},${CY - 98}`}
          fill="#000"
        />
      </svg>

      {/* Оранжевая дуга (шансы). Вращается с плавным замедлением */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          transform: `rotate(${angle}deg)`,
          transformOrigin: '50% 50%',
          transition: spinning
            ? 'transform 3s ease-out'
            : 'none',
        }}
      >
        <svg width={300} height={300} viewBox="0 0 300 300">
          <circle
            cx={CX} cy={CY} r={ARC_R}
            fill="none"
            stroke={colors.accent}
            strokeWidth={ARC_W}
            strokeLinecap="butt"          // прямые (острые) концы дуги
            strokeDasharray={`${dash} ${CIRC - dash}`}
            strokeDashoffset={CIRC / 4}   // старт дуги — на 12 часов
          />
        </svg>
      </div>

      {/* Чёрная обводка 16px поверх оранжевой дуги */}
      <svg width={300} height={300} viewBox="0 0 300 300" style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <circle cx={CX} cy={CY} r={BORDER_R} fill="none" stroke="#000" strokeWidth={STROKE} />
      </svg>

      {/* Процент шанса в центре */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 'bold', color: colors.text, lineHeight: 1 }}>
          {Math.round(chance)}
          <span style={{ fontSize: 22 }}>%</span>
        </div>
        <div style={{ fontSize: 11, color: colors.textMuted, letterSpacing: 3, marginTop: 4 }}>ШАНС</div>
      </div>
    </div>
  );
}

/* ===================================================================
   Поле выбора / отображения NFT (блок с «+»)
   =================================================================== */

function NftSlot({ label, nft, onClick, disabled }: { label: string; nft: Nft | null; onClick: () => void; disabled?: boolean }) {
  return (
    <div onClick={disabled ? undefined : onClick} style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <Card padding="14px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 118, justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 6 }}>{label}</div>
        {nft ? (
          <>
            <img
                src={publicUrl(nft.image.replace(/^\//, ''))}
                alt=""
                style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 8 }}
                onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
              />
            <div style={{ fontSize: 12, fontWeight: 'bold', color: colors.text, marginTop: 4 }}>{nft.name}</div>
            <div style={{ fontSize: 11, color: colors.accent, marginTop: 2 }}>{nft.floor.toFixed(2)} TON</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, fontWeight: 300, color: colors.textMuted, lineHeight: 1 }}>+</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>выбрать</div>
          </>
        )}
        </div>
      </Card>
    </div>
  );
}

/* ===================================================================
   Страница апгрейда
   =================================================================== */

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function UpgraderPage({ onBack, onToast }: Props) {
  const { haptic, vibrate, user } = useTelegram();

  // «Начальный NFT» — берётся ТОЛЬКО из инвентаря пользователя (сервер)
  const [inventoryNfts, setInventoryNfts] = useState<Nft[]>([]);
  // «Конечный NFT» — берётся из ВСЕГО пула предметов (my_nfts.json)
  const [allNfts, setAllNfts] = useState<Nft[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(true);

  const [startNfts, setStartNfts] = useState<Nft[]>([]);
  const [targetNft, setTargetNft] = useState<Nft | null>(null);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [resultDisplayName, setResultDisplayName] = useState('');
  const [resultDisplayImage, setResultDisplayImage] = useState('');
  const [angle, setAngle] = useState(0);

  // Загружаем «начальные» NFT из инвентаря через API
  useEffect(() => {
    const initData = getInitData();
    const userId = String(user?.id ?? '6267608438');
    fetchInventory(initData, userId)
      .then((data) => {
        const mapped: Nft[] = data.map((item) => ({
          id: item.id,
          name: item.model,
          floor: item.floor,
          image: item.image,
        }));
        setInventoryNfts(mapped);
        setLoadingNfts(false);
      })
      .catch(() => {
        setLoadingNfts(false);
      });
  }, []);

  // Загружаем «конечные» NFT из общего пула предметов (my_nfts.json)
  useEffect(() => {
    fetch(publicUrl('my_nfts.json'))
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load my_nfts.json');
        return res.json();
      })
      .then((data: Array<{ id: number | string; name: string; floor: number; image: string }>) => {
        const mapped: Nft[] = data.map((item) => ({
          id: item.id,
          name: item.name,
          floor: Number(item.floor) || 0,
          image: item.image,
        }));
        setAllNfts(mapped);
      })
      .catch((e) => {
        console.error('Ошибка загрузки пула NFT:', e);
        setAllNfts([]);
      });
  }, []);

  /* ── Вычисляемые значения ─────────────────────── */

  if (loadingNfts) {
    return (
      <div style={{ padding: spacing.md, color: colors.text }}>
        <Button variant="ghost" onClick={onBack} size="sm">← Назад</Button>
        <h1 style={{ marginTop: spacing.md }}>⬆️ Апгрейдер</h1>
        <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
          Загрузка NFT...
        </p>
      </div>
    );
  }

  const startPrice = startNfts.reduce((sum, n) => sum + n.floor, 0);
  const targetPrice = targetNft?.floor ?? 0;

  // Шанс: (цена начального NFT / цена конечного NFT) * 100, потолок 75%.
  const rawChance = targetPrice > 0 ? (startPrice / targetPrice) * 100 : 0;
  const chance = Math.min(rawChance, MAX_CHANCE);

  const startOkay = startNfts.length > 0 && !!targetNft && targetPrice >= startPrice;
  const canUpgrade = startOkay && !spinning;

  /* ── Сброс ─────────────────────────────────────── */

  const resetGame = () => {
    setResult(null);
    setResultDisplayName('');
    setResultDisplayImage('');
    setAngle(0);
  };

  const closeResult = () => {
    setResult(null);
    setResultDisplayName('');
    setResultDisplayImage('');
    setStartNfts([]);
    setTargetNft(null);
  };

  /* ── Управление мультиставкой (до 4 NFT) ─────────── */

  const addStartNft = (nft: Nft) => {
    if (startNfts.length >= MAX_START_NFTS) {
      onToast(`Можно выбрать не больше ${MAX_START_NFTS} NFT`, 'info');
      return;
    }
    // Запрет дублей: один и тот же NFT нельзя добавить дважды
    if (startNfts.some((s) => s.id === nft.id)) {
      onToast('Этот NFT уже добавлен', 'info');
      return;
    }
    setStartNfts((prev) => [...prev, nft]);
    setStartModalOpen(false);
    resetGame();
    setAngle(0);
    haptic('medium');
  };

  const removeStartNft = (id: number | string) => {
    setStartNfts((prev) => prev.filter((n) => n.id !== id));
    resetGame();
    haptic('light');
  };

  /* ── Основная механика спина ───────────────────── */

  const upgrade = () => {
    if (!canUpgrade) return;

    haptic('medium');
    resetGame();
    setSpinning(true);

    const userId = String(user?.id ?? '6267608438');
    // Копируем ID всех startNfts до setTimeout (массив может измениться)
    const removedNftIds = startNfts.map((n) => n.id);

    // Единственный источник результата — СЕРВЕР (server-side random).
    // Сначала ждём решение /api/play_game, затем крутим рулетку на сектор,
    // соответствующий СЕРВЕРНОМУ success. Локальный Math.random() больше
    // НЕ определяет победу — иначе у клиента и сервера два НЕЗАВИСИМЫХ
    // исхода, и NFT может «прилететь» игроку при проигрыше (и наоборот).
    fetch(`${CONFIG.API_URL}/api/play_game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_type: 'upgrade',
        start_price: startPrice,
        end_price: targetPrice,
        target_name: targetNft?.name || '',
        target_floor: targetNft?.floor || 0,
        target_image: targetNft?.image || '',
        user_id: user?.id || '6267608438',
        initData: getInitData(),
        // Дополнительная информация для мультиставки (игнорируется сервером)
        start_ids: removedNftIds,
        start_names: startNfts.map((n) => n.name),
        start_images: startNfts.map((n) => n.image),
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((data: { success: boolean; item?: Nft }) => {
        // Читаем СЕРВЕРНЫЙ success (не полагаемся только на наличие item)
        const serverWin = data.success === true;
        const wonNft = data.item;

        // Анимация: угол остановки стрелки — по серверному результату
        const winArc = (chance / 100) * 360;
        const finalDeg = serverWin
          ? (360 - winArc) + Math.random() * winArc
          : Math.random() * (360 - winArc);
        const fullSpins = (5 + Math.floor(Math.random() * 5)) * 360;
        setAngle(angle + fullSpins + finalDeg);

        // Через 3 секунды останавливаем анимацию, показываем результат
        // и только потом удаляем NFT с сервера (не прерывая анимацию).
        setTimeout(async () => {
          // 1. Сохраняем имя и картинку для модалки результата (пока стейты ещё валидны)
          const savedName = targetNft?.name ?? '';
          const savedImage = targetNft?.image ?? '';

          // 2. Очищаем выбранные NFT ДО показа результата,
          //    чтобы после закрытия модалки слоты уже были пустыми
          setStartNfts([]);
          setTargetNft(null);
          setResultDisplayName(savedName);
          setResultDisplayImage(savedImage);

          // 3. Останавливаем спин, показываем результат (модалка/тост)
          setSpinning(false);
          setResult(serverWin ? 'win' : 'lose');
          vibrate(serverWin ? 'success' : 'error');
          if (serverWin) {
            onToast('🎉 Апгрейд успешен!', 'success');
          } else {
            onToast('💀 Неудача! Начальные NFT сгорели.', 'error');
          }

          // 4. Удаляем ВСЕ начальные NFT с сервера (асинхронно, не ломает UI).
          //    Выполняется ПОСЛЕ показа результата, чтобы анимация не оборвалась.
          for (const nftId of removedNftIds) {
            try {
              await fetch(`${CONFIG.API_URL}/api/inventory/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, inventory_id: nftId }),
              });
            } catch (e) {
              console.error('Inventory sync error:', e);
            }
          }

          // 5. Локальное состояние инвентаря — по серверному ответу
          setInventoryNfts((prev) => {
            let updated = prev.filter((n) => !removedNftIds.includes(n.id));
            if (serverWin && wonNft && !updated.find((n) => n.id === wonNft.id)) {
              updated = [...updated, wonNft as Nft];
            }
            return updated;
          });
        }, 3000);
      })
      .catch((err) => {
        console.error('Upgrade error:', err);
        setSpinning(false);
        onToast('Ошибка сервера при синхронизации, попробуйте позже', 'error');
      });
  };

  return (
    <><div style={{ padding: spacing.md, color: colors.text, paddingBottom: 120, userSelect: 'none' }}>
      <style>{`
        @keyframes ug-fade {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }
        `}</style>

      {/* Навигация: ← Назад */}
      <div style={{ marginBottom: spacing.md, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← Назад</Button>
      </div>

      {/* Заголовок */}
      <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        <div style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: 1, color: colors.text }}>⚡ Апгрейд</div>
      </div>

      {/* Круг с оранжевой дугой */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: spacing.sm }}>
        <Wheel chance={chance} angle={angle} spinning={spinning} />
      </div>

      {/* Подпись шанса */}
      <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        <div style={{ fontSize: 13, color: colors.textMuted }}>
          Шанс получения: <b style={{ color: colors.accent }}>{chance.toFixed(1)}%</b>
        </div>
        {targetNft && startNfts.length > 0 && targetPrice < startPrice && (
          <div style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
            Конечный NFT не может быть дешевле суммы начальных
          </div>
        )}
      </div>

      {/* Выбор NFT: мультиставка (до 4 начальных) + конечный */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: colors.textMuted }}>
          Начальный NFT{startNfts.length > 0 ? ` (${startNfts.length}/${MAX_START_NFTS})` : ''}
        </div>
        {startNfts.length > 0 && (
          <div style={{ fontSize: 11, color: colors.accent, fontWeight: 'bold' }}>
            Сумма ставки: {startPrice.toFixed(2)} TON
          </div>
        )}
      </div>

      {startNfts.length === 0 ? (
        <NftSlot
          label="Начальный NFT"
          nft={null}
          disabled={spinning}
          onClick={() => { if (!spinning) { haptic('light'); setStartModalOpen(true); } }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(startNfts.length + 1, MAX_START_NFTS)}, 1fr)`, gap: 8, marginBottom: spacing.md }}>
          {startNfts.map((nft) => (
            <div
              key={nft.id}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: '#1c1c1e',
                borderRadius: 12,
                border: '1.5px solid rgba(255,255,255,0.1)',
                padding: 8,
                minHeight: 118,
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                disabled={spinning}
                onClick={() => removeStartNft(nft.id)}
                aria-label="Удалить NFT"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#ffffff',
                  fontSize: 12,
                  lineHeight: 1,
                  cursor: spinning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  opacity: spinning ? 0.5 : 1,
                }}
              >
                ✕
              </button>
              <img
                src={publicUrl(nft.image.replace(/^\//, ''))}
                alt={nft.name}
                style={{ width: 46, height: 46, objectFit: 'contain', borderRadius: 8 }}
                onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
              />
              <div style={{ fontSize: 10, fontWeight: 'bold', color: colors.text, marginTop: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nft.name}</div>
              <div style={{ fontSize: 10, color: colors.accent, marginTop: 2 }}>{nft.floor.toFixed(2)} TON</div>
            </div>
          ))}
          {startNfts.length < MAX_START_NFTS && (
            <div
              onClick={spinning ? undefined : () => { haptic('light'); setStartModalOpen(true); }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 118,
                border: '1.5px dashed rgba(255,255,255,0.2)',
                borderRadius: 12,
                color: colors.textMuted,
                cursor: spinning ? 'not-allowed' : 'pointer',
                opacity: spinning ? 0.5 : 1,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 300, lineHeight: 1 }}>+</div>
              <div style={{ fontSize: 10, marginTop: 4 }}>Добавить</div>
            </div>
          )}
        </div>
      )}

      {/* Конечный NFT */}
      <div style={{ marginBottom: spacing.md }}>
        <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 8 }}>Конечный NFT</div>
        <NftSlot
          label="Конечный NFT"
          nft={targetNft}
          disabled={spinning}
          onClick={() => { if (!spinning) { haptic('light'); setTargetModalOpen(true); } }}
        />
      </div>

      {/* Кнопка запуска */}
      <div style={{ marginTop: spacing.md }}>
        <Button
          size="lg"
          fullWidth
          onClick={upgrade}
          disabled={!canUpgrade}
          loading={spinning}
        >
          {spinning ? 'Крутится...' : `🎰 Апгрейд${chance ? ` • ${chance.toFixed(1)}%` : ''}`}
        </Button>
      </div>
</div>

      {/* ── Модалка: выбор начального NFT (мультиставка до 4) ── */}
      <Modal open={startModalOpen} onClose={() => setStartModalOpen(false)}>
        <div>
          <h3 style={{ marginTop: 0, color: colors.text, fontSize: 17, marginBottom: 8 }}>Выберите начальный NFT</h3>
          {startNfts.length > 0 && (
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
              Выбрано: <b style={{ color: colors.accent }}>{startNfts.length}/{MAX_START_NFTS}</b>
            </div>
          )}
          {inventoryNfts.length === 0 ? (
            <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 20 }}>
              У вас нет NFT. Купите в Маркете
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: '50vh', overflowY: 'auto', padding: '2px 0' }}>
              {inventoryNfts.map((nft) => {
                const alreadyAdded = startNfts.some((s) => s.id === nft.id);
                const limitReached = startNfts.length >= MAX_START_NFTS;
                return (
                  <NftGridCard
                    key={nft.id}
                    nft={nft}
                    selected={alreadyAdded}
                    disabled={alreadyAdded || (limitReached && !alreadyAdded)}
                    onClick={() => addStartNft(nft)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Модалка: выбор конечного NFT (из всего пула, не дешевле суммы начальных) ── */}
      <Modal open={targetModalOpen} onClose={() => setTargetModalOpen(false)}>
        <div>
          <h3 style={{ marginTop: 0, color: colors.text, fontSize: 17, marginBottom: 12 }}>Выберите конечный NFT</h3>
          {startNfts.length > 0 && (
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
              Цель должна быть дороже или равна: <b style={{ color: colors.accent }}>{startPrice.toFixed(2)} TON</b>
            </div>
          )}
          {allNfts.length === 0 ? (
            <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 20 }}>
              У вас нет NFT. Купите в Маркете
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: '50vh', overflowY: 'auto', padding: '2px 0' }}>
              {allNfts
                .filter((nft) => nft.floor >= startPrice && !startNfts.some((s) => s.id === nft.id))
                .map((nft) => (
                  <NftGridCard
                    key={nft.id}
                    nft={nft}
                    selected={targetNft?.id === nft.id}
                    onClick={() => {
                      setTargetNft(nft);
                      setTargetModalOpen(false);
                      resetGame();
                      setAngle(0);
                      haptic('medium');
                    }}
                  />
                ))}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Результат: победа / проигрыш ───────────────── */}
      {result && (
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
          <div style={{ width: 'min(320px, 80vw)' }}>
            <LottiePlayer
              path={result === 'win' ? publicUrl('animations/CUP.json') : publicUrl('animations/NO.json')}
              loop={false}
            />
          </div>
          <div style={{ fontSize: 26, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginTop: 8 }}>
            {result === 'win' ? `Вы выиграли ${resultDisplayName}` : 'Неудача'}
          </div>
          {result === 'win' && resultDisplayImage && (
            <img
              src={publicUrl(resultDisplayImage.replace(/^\//, ''))}
              alt=""
              style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 12, border: '3px solid rgba(255,255,255,0.25)', marginTop: 14 }}
              onError={(e) => { e.currentTarget.src = publicUrl('NO_Inventory.png'); }}
            />
          )}
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 18 }}>Нажмите, чтобы закрыть</div>
        </div>
      )}
    </>
  );
}
