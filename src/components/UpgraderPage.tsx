import { useState, useEffect } from 'react';
import { LottiePlayer } from './ui/LottiePlayer';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { getInitData, fetchInventory, addToInventory } from '../api';

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
  duration: number;         // ms, время вращения
}

function Wheel({ chance, angle, spinning, duration }: WheelProps) {
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
            ? `transform ${duration}ms cubic-bezier(0.12, 0.7, 0.1, 1)`
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

function NftSlot({ label, nft, onClick }: { label: string; nft: Nft | null; onClick: () => void }) {
  return (
    <Card padding="14px" onClick={onClick}>
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

  const [startNft, setStartNft] = useState<Nft | null>(null);
  const [targetNft, setTargetNft] = useState<Nft | null>(null);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [angle, setAngle] = useState(0);
  const [duration, setDuration] = useState(6000);

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

  if (inventoryNfts.length === 0) {
    return (
      <div style={{ padding: spacing.md, color: colors.text }}>
        <Button variant="ghost" onClick={onBack} size="sm">← Назад</Button>
        <h1 style={{ marginTop: spacing.md }}>⬆️ Апгрейдер</h1>
        <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 40 }}>
          Нет NFT для апгрейда
        </p>
      </div>
    );
  }

  const startPrice = startNft?.floor ?? 0;
  const targetPrice = targetNft?.floor ?? 0;

  // Шанс: (цена начального NFT / цена конечного NFT) * 100, потолок 75%.
  const rawChance = targetPrice > 0 ? (startPrice / targetPrice) * 100 : 0;
  const chance = Math.min(rawChance, MAX_CHANCE);

  const startOkay = !!startNft && !!targetNft && targetPrice >= startPrice;
  const canUpgrade = startOkay && !spinning;

  /* ── Сброс ─────────────────────────────────────── */

  const resetGame = () => {
    setResult(null);
    setAngle(0);
  };

  const closeResult = () => setResult(null);

  /* ── Основная механика спина ───────────────────── */

  const upgrade = () => {
    if (!canUpgrade) return;

    haptic('medium');
    resetGame();
    setSpinning(true);

    // Отправляем запрос на сервер
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
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(async (data: { success: boolean; item?: Nft }) => {
        const isWin = data.success === true;
        const userId = String(user?.id ?? '6267608438');

        if (isWin && data.item) {
          // Успех — синхронизируем инвентарь на сервере
          try {
            // 1) Удаляем начальный NFT из инвентаря
            await fetch(`${CONFIG.API_URL}/api/inventory/remove`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, inventory_id: startNft!.id }),
            });
            // 2) Добавляем выигранный (конечный) NFT в инвентарь
            await addToInventory(data.item, userId);
          } catch (e) {
            console.error('Inventory sync error:', e);
          }

          // Обновляем локальное состояние инвентаря
          setInventoryNfts((prev) => {
            let updated = prev.filter((n) => n.id !== startNft!.id);
            if (!updated.find((n) => n.id === data.item!.id)) {
              updated = [...updated, data.item as Nft];
            }
            return updated;
          });
        } else if (!isWin) {
          // Неудача — удаляем начальный NFT из инвентаря на сервере
          try {
            await fetch(`${CONFIG.API_URL}/api/inventory/remove`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: userId, inventory_id: startNft!.id }),
            });
          } catch (e) {
            console.error('Inventory sync error:', e);
          }

          // Обновляем локальное состояние инвентаря — убираем startNft
          setInventoryNfts((prev) => {
            const updated = prev.filter((n) => n.id !== startNft!.id);
            return updated;
          });
        }

        // Рассчитываем угол для анимации (оставляем локальную симуляцию для визуала)
        const winArc = (chance / 100) * 360;
        let finalDeg: number;
        if (isWin) {
          finalDeg = (360 - winArc) + Math.random() * winArc;
        } else {
          finalDeg = Math.random() * (360 - winArc);
        }

        const dur = 5000 + Math.random() * 2000;
        setDuration(dur);

        const start = ((angle % 360) + 360) % 360;
        const delta = ((finalDeg - start) + 360) % 360;
        const fullSpins = (5 + Math.floor(Math.random() * 5)) * 360;
        setAngle(angle + fullSpins + delta);

        setTimeout(() => {
          setSpinning(false);
          setResult(isWin ? 'win' : 'lose');
          vibrate(isWin ? 'success' : 'error');
          if (isWin) {
            onToast('🎉 Апгрейд успешен!', 'success');
          } else {
            onToast('💀 Неудача! Начальный NFT сгорел.', 'error');
          }
        }, dur);
      })
      .catch((err) => {
        console.error('Upgrade error:', err);
        setSpinning(false);
        onToast('Ошибка сервера, попробуйте позже', 'error');
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
        <Wheel chance={chance} angle={angle} spinning={spinning} duration={duration} />
      </div>

      {/* Подпись шанса */}
      <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        <div style={{ fontSize: 13, color: colors.textMuted }}>
          Шанс получения: <b style={{ color: colors.accent }}>{chance.toFixed(1)}%</b>
        </div>
        {targetNft && startNft && targetPrice < startPrice && (
          <div style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>
            Конечный NFT не может быть дешевле начального
          </div>
        )}
      </div>

      {/* Выбор NFT (два блока с «+») */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: spacing.md }}>
        <NftSlot label="Начальный NFT" nft={startNft} onClick={() => { if (!spinning) { haptic('light'); setStartModalOpen(true); } }} />
        <NftSlot label="Конечный NFT" nft={targetNft} onClick={() => { if (!spinning) { haptic('light'); setTargetModalOpen(true); } }} />
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

      {/* ── Модалка: выбор начального NFT ─────────────── */}
      <Modal open={startModalOpen} onClose={() => setStartModalOpen(false)}>
        <div>
          <h3 style={{ marginTop: 0, color: colors.text, fontSize: 17, marginBottom: 12 }}>Выберите начальный NFT</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: '50vh', overflowY: 'auto', padding: '2px 0' }}>
            {inventoryNfts.map((nft) => (
              <NftGridCard
                key={nft.id}
                nft={nft}
                selected={startNft?.id === nft.id}
                onClick={() => {
                  setStartNft(nft);
                  setStartModalOpen(false);
                  resetGame();
                  setAngle(0);
                  haptic('medium');
                }}
              />
            ))}
          </div>
        </div>
      </Modal>

      {/* ── Модалка: выбор конечного NFT (из всего пула, не дешевле начального) ── */}
      <Modal open={targetModalOpen} onClose={() => setTargetModalOpen(false)}>
        <div>
          <h3 style={{ marginTop: 0, color: colors.text, fontSize: 17, marginBottom: 12 }}>Выберите конечный NFT</h3>
          {startNft && (
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10 }}>
              Цель должна быть дороже или равна: <b style={{ color: colors.accent }}>{startNft.floor.toFixed(2)} TON</b>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: '50vh', overflowY: 'auto', padding: '2px 0' }}>
            {allNfts
              .filter((nft) => !startNft || nft.floor >= startNft.floor)
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
            {result === 'win' ? `Вы выиграли ${targetNft?.name ?? ''}` : 'Неудача'}
          </div>
          {result === 'win' && targetNft && (
            <img
              src={publicUrl(targetNft.image.replace(/^\//, ''))}
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
