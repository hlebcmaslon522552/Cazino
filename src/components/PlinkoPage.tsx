import { useEffect, useMemo, useRef, useState } from 'react';
import { Player as LottiePlayer } from '@lottiefiles/react-lottie-player';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { getBalance, updateBalance } from '../api';

/* ===================================================================
   Интерфейсы
   =================================================================== */

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface SlotConfig {
  mult: number;
  color: string;
}

interface Result {
  id: number;
  multiplier: number;
  win: number;
  won: boolean;
}

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  slot: number | null;   // индекс слота после приземления
  multiplier: number;    // множитель слота
  bet: number;           // ставка за этот шарик
  finished: boolean;     // упал в слот
  startTime: number;     // performance.now() в момент запуска партии
  spawnDelay: number;    // мс до появления шарика (очередь)
}

interface Peg {
  x: number;
  y: number;
}

/* ===================================================================
   Константы
   =================================================================== */

const PEG_R = 4;                       // радиус колышка, px
const BALL_R = 8;                      // радиус шарика, px
const COLLIDE_DIST = BALL_R + PEG_R;   // дистанция коллизии = 12
const GRAVITY = 0.15;                  // гравитация
const TOP_OFFSET = 64;                 // Y первого ряда колышков
const ROW_GAP = 32;                    // вертикальный шаг между рядами
const DROP_START_Y = 28;               // Y точки старта шарика
const SLOT_H = 34;                     // высота слота
const SPAWN_STEP = 180;                // мс между появлением шариков
const MIN_BET = 0.1;

const ROWS_OPTIONS = [8, 12, 16];
const BALLS_OPTIONS = [1, 3, 5, 10, 30];

/* Честные множители как в Stake. Симметричные массивы: центр → край  */
const MULTIS_8  = [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6];
const MULTIS_12 = [10.0, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10.0];
const MULTIS_16 = [15.0, 5.0, 2.0, 1.6, 1.2, 1.0, 0.8, 0.5, 0.3, 0.5, 0.8, 1.0, 1.2, 1.6, 2.0, 5.0, 15.0];

/* Цвета для групп множителей: низкие зелёные → средние жёлтые → высокие красные → легендарные */
const MULT_COLORS = [
  '#22c55e', '#84cc16', '#eab308', '#f97316',
  '#ef4444', '#d946ef', '#a855f7', '#7c3aed',
];

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Строит конфигурацию слотов из заранее заданных массивов множителей. */
function buildSlots(rows: number): SlotConfig[] {
  const arr: number[] = rows === 8 ? MULTIS_8 : rows === 12 ? MULTIS_12 : MULTIS_16;
  return arr.map((mult, i) => {
    // цвет от центра (0) к краям
    const dist = Math.abs(i - (arr.length - 1) / 2);
    const color = MULT_COLORS[Math.min(Math.floor(dist), MULT_COLORS.length - 1)];
    return { mult, color };
  });
}

/* ===================================================================
   Страница «Плинко»
   =================================================================== */

export function PlinkoPage({ onBack, onToast }: Props) {
  const { haptic, initData } = useTelegram();

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardW, setBoardW] = useState(0);

  /* ── Настройки ─────────────────────────── */
  const [rows, setRows] = useState(12);
  const [ballsCount, setBallsCount] = useState(1);
  const [betAmount, setBetAmount] = useState('1.00');

  /* ── Игровое состояние ─────────────────── */
  const [balls, setBalls] = useState<Ball[]>([]);
  const [isDropping, setIsDropping] = useState(false);
  const [lastWin, setLastWin] = useState<Result | null>(null);
  const [balance, setBalance] = useState(15);

  const ballsRef = useRef<Ball[]>([]);
  const nextId = useRef(1);
  const isDroppingRef = useRef(false);
  const ballsFinishedRef = useRef(0);
  const expectedBallsRef = useRef(0);

  const stake = Math.max(MIN_BET, parseFloat(betAmount) || MIN_BET);

  /* ── Геометрия поля ────────────────────── */
  const slotsCfg = useMemo(() => buildSlots(rows), [rows]);
  const multipliers = useMemo(() => slotsCfg.map(s => s.mult), [slotsCfg]);
  const n = multipliers.length;
  // Ширина одного слота = ширина поля / количество слотов (n)
  const slotW = boardW > 0 ? boardW / n : 0;
  const slotTop = TOP_OFFSET + rows * ROW_GAP + 2;
  const totalH = slotTop + SLOT_H + 14;

  const pegs = useMemo<Peg[]>(() => {
    const list: Peg[] = [];
    if (boardW <= 0) return list;
    const sp = boardW / (rows + 1);
    for (let r = 0; r < rows; r++) {
      const startX = (boardW - r * sp) / 2; // центрируем ряд
      for (let j = 0; j <= r; j++) {
        list.push({ x: startX + j * sp, y: TOP_OFFSET + r * ROW_GAP });
      }
    }
    return list;
  }, [boardW, rows]);

  // Загрузка баланса
  useEffect(() => {
    let cancelled = false;
    getBalance(initData)
      .then((b) => { if (!cancelled) setBalance(b); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initData]);

  // Замер ширины поля
  useEffect(() => {
    const measure = () => {
      if (boardRef.current) setBoardW(boardRef.current.offsetWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => ro.disconnect();
  }, []);


  /* ── Завершение полёта шарика: фиксируем слот и начисляем выигрыш ── */
  const finishBall = (b: Ball) => {
    if (b.finished) return;

    const totalSlots = multipliers.length;
    const slotWidth = boardW / totalSlots;
    let slotIndex = Math.floor(b.x / slotWidth);

    // Защита от вылета за пределы массива
    if (slotIndex < 0) slotIndex = 0;
    if (slotIndex >= totalSlots) slotIndex = totalSlots - 1;

    const winMultiplier = multipliers[slotIndex];

    b.slot = slotIndex;
    b.multiplier = winMultiplier;
    b.finished = true;
    b.y = slotTop + SLOT_H / 2 - BALL_R; // шарик ложится на дно слота
    b.vy = 0;
    b.vx = 0;

    console.log("Шарик упал в слот:", slotIndex, "Множитель:", winMultiplier);

    // считаем выполненный шарик
    ballsFinishedRef.current++;

    const win = round2(b.bet * b.multiplier);
    const won = b.multiplier > 1;
    setBalance((prev) => round2(prev + win));
    updateBalance(initData, win).catch(() => {});
    if (won) {
      haptic('medium');
      setLastWin({ id: b.id, multiplier: b.multiplier, win, won: true });
      onToast(`🎉 Выигрыш +${win.toFixed(2)} TON (${b.multiplier.toFixed(2)}x)`, 'success');
    } else {
      haptic('light');
    }
  };

  /* ── Игровой цикл физики (requestAnimationFrame) ── */
  useEffect(() => {
    let raf = 0;
    let changed = false;
    const step = () => {
      const active = ballsRef.current;

      const now = performance.now();
      changed = false;

      for (const b of active) {
        if (b.finished) continue;

        // задержка появления: шарики запускаются по очереди
        if (now - b.startTime < b.spawnDelay) {
          continue;
        }

        changed = true;

        // гравитация
        b.vy += GRAVITY;
        b.x += b.vx;
        b.y += b.vy;

        // коллизии ТОЛЬКО с колышками (ball-vs-ball отключены — сквозной пролёт)
        for (const p of pegs) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.0001 && dist < COLLIDE_DIST) {
            const overlap = COLLIDE_DIST - dist;
            b.x += (dx / dist) * overlap;
            b.y += (dy / dist) * overlap;
            b.vx += (dx / dist) * 0.5 + (Math.random() - 0.5) * 0.8;
            b.vy *= 0.5;
          }
        }

        // боковые стенки
        if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.5; }
        if (b.x + BALL_R > boardW) { b.x = boardW - BALL_R; b.vx = -Math.abs(b.vx) * 0.5; }

        // падение в слот
        if (b.y > slotTop + SLOT_H * 0.25) {
          finishBall(b);
          changed = true;
        }
      }

      // Удаляем finished-шарики, которые уже ушли далеко вниз (чистим массив)
      const cleaned = active.filter(b => !(b.finished && b.y > slotTop + SLOT_H * 2));
      if (cleaned.length !== active.length) {
        ballsRef.current = cleaned;
        setBalls(cleaned);
      } else if (changed) {
        setBalls([...active]);
      }

      // партия завершена, когда все запущенные шарики финишировали
      if (ballsFinishedRef.current >= expectedBallsRef.current && isDroppingRef.current) {
        isDroppingRef.current = false;
        setIsDropping(false);
      }

      // Всегда планируем следующий кадр, чтобы цикл не останавливался
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pegs, slotW, slotTop, slotsCfg, n, boardW]);

  /* ── Запуск партии ────────────────────── */
  const drop = () => {
    if (boardW === 0 || isDroppingRef.current) return;
    if (stake < MIN_BET) {
      haptic('heavy');
      onToast(`❌ Ставка не может быть меньше ${MIN_BET.toFixed(2)} TON`, 'error');
      return;
    }
    const totalStake = round2(stake * ballsCount);
    if (balance < totalStake) {
      haptic('heavy');
      onToast('❌ Недостаточно средств на балансе', 'error');
      return;
    }

    haptic('medium');
    setBalance((prev) => round2(prev - totalStake));
    updateBalance(initData, -totalStake).catch(() => {});
    setIsDropping(true);
    isDroppingRef.current = true;
    ballsFinishedRef.current = 0;
    expectedBallsRef.current = ballsCount;
    setLastWin(null);

    const now = performance.now();
    const created: Ball[] = [];
    for (let i = 0; i < ballsCount; i++) {
      created.push({
        id: nextId.current++,
        x: boardW / 2,
        y: DROP_START_Y,
        vx: 0,
        vy: 0,
        slot: null,
        multiplier: 0,
        bet: stake,
        finished: false,
        startTime: now,
        spawnDelay: i * SPAWN_STEP, // очередь: каждый следующий на 300 мс позже
      });
    }
    ballsRef.current = [...ballsRef.current, ...created];
    setBalls(ballsRef.current);
  };

  const reset = () => {
    haptic('light');
    ballsRef.current = [];
    setBalls([]);
    setLastWin(null);
  };

  const handleRows = (r: number) => {
    reset();
    setRows(r);
  };

  const handleBetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    const clean = parts[0] + (parts.length > 1 ? '.' + parts[1].slice(0, 2) : '');
    setBetAmount(clean);
  };


  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <style>{`
        @keyframes pl-pop {
          from { opacity: 0; transform: translateY(6px) scale(0.9); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Верх: назад */}
      <div style={{ marginBottom: spacing.md }}>
        <Button variant="ghost" size="sm" onClick={onBack}>← Назад</Button>
      </div>

      <h1 style={{ margin: 0, fontSize: 22, textAlign: 'center' }}>🟡 Плинко</h1>
      <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 4, fontSize: 13 }}>
        {n} слотов · {rows} рядов · Баланс: <b style={{ color: colors.gold }}>{balance.toFixed(2)} TON</b>
      </p>

      {/* ── Настройки ─────────────────────────── */}
      <div style={{ marginTop: spacing.md, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>

        {/* Количество рядов */}
        <Card padding="14px">
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
            РЯДЫ ({rows})
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {ROWS_OPTIONS.map((r) => (
              <button
                key={r}
                disabled={isDropping}
                onClick={() => { haptic('light'); handleRows(r); }}
                style={{
                  flex: '1 1 0',
                  padding: '8px 0',
                  borderRadius: radius.md,
                  border: r === rows ? `1px solid ${colors.primary}` : `1px solid ${colors.border}`,
                  background: r === rows ? colors.bgCardActive : colors.bgCard,
                  color: r === rows ? colors.primary : colors.textMuted,
                  fontWeight: 'bold',
                  cursor: isDropping ? 'not-allowed' : 'pointer',
                  opacity: isDropping ? 0.5 : 1,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </Card>

        {/* Количество шариков */}
        <Card padding="14px">
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
            КОЛИЧЕСТВО ШАРИКОВ
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {BALLS_OPTIONS.map((count) => (
              <div key={count} style={{ flex: 1, minWidth: 0 }}>
                <Button
                  fullWidth
                  disabled={isDropping}
                  variant={ballsCount === count ? 'primary' : 'secondary'}
                  onClick={() => { haptic('light'); setBallsCount(count); }}
                >
                  {count === 1 ? '1 шарик' : `${count} шариков`}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Ставка */}
        <Card padding="14px">
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
            СТАВКА ЗА ШАРИК (TON)
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={betAmount}
            disabled={isDropping}
            onChange={handleBetChange}
            placeholder={`мин ${MIN_BET.toFixed(2)}`}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              background: '#0d0d14',
              color: colors.text,
              fontSize: 16,
              fontWeight: 'bold',
              outline: 'none',
            }}
          />
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
            Итого за серию: {(stake * ballsCount).toFixed(2)} TON · Макс. выигрыш:{' '}
            {(stake * Math.max(...slotsCfg.map((s) => s.mult))).toFixed(2)} TON
          </div>
        </Card>
      </div>


      {/* ── Игровое поле ───────────────────────── */}
      <div
        ref={boardRef}
        style={{
          width: '100%',
          marginTop: spacing.md,
          background: 'radial-gradient(circle at 50% 0%, #181820, #0a0a0f)',
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {boardW > 0 && (
          <div style={{ position: 'relative', width: boardW, height: totalH, margin: '0 auto' }}>
            {/* Колышки */}
            {pegs.map((p, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: p.x - PEG_R,
                  top: p.y - PEG_R,
                  width: PEG_R * 2,
                  height: PEG_R * 2,
                  borderRadius: '50%',
                  background: '#ffffff',
                  boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                  zIndex: 2,
                }}
              />
            ))}

            {/* Слоты с множителями */}
            {slotsCfg.map((s, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * slotW,
                  top: slotTop,
                  width: slotW,
                  height: SLOT_H,
                  boxSizing: 'border-box',
                  background: s.color,
                  border: '2px solid #111',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                  }}
                >
                  {s.mult}x
                </span>
              </div>
            ))}

            {/* Шарики */}
            {balls.map((b) => {
              const show = performance.now() - b.startTime >= b.spawnDelay;
              if (!show) return null;
              return (
                <div
                  key={b.id}
                  style={{
                    position: 'absolute',
                    left: b.x - BALL_R,
                    top: b.y - BALL_R,
                    width: BALL_R * 2,
                    height: BALL_R * 2,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 30%, #fff6a8, #fbbf24 55%, #d97706)',
                    boxShadow: '0 0 10px rgba(251,191,36,0.9), inset -2px -3px 4px rgba(0,0,0,0.25)',
                    zIndex: 5,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Кнопка «Играть» ──────────────────── */}
      <div style={{ marginTop: spacing.md }}>
        <button
          onClick={drop}
          disabled={isDropping || boardW === 0}
          style={{
            width: '100%',
            padding: '18px 24px',
            fontSize: 18,
            fontWeight: 'bold',
            color: '#fff',
            background: isDropping ? '#333' : 'linear-gradient(135deg, #8b5cf6, #ff8c00)',
            border: 'none',
            borderRadius: radius.md,
            cursor: isDropping ? 'not-allowed' : 'pointer',
            opacity: isDropping ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {isDropping ? `⏳ Идет игра (${ballsFinishedRef.current}/${ballsCount})` : `🎮 Играть (${(stake * ballsCount).toFixed(2)} TON)`}
        </button>
      </div>

      {/* ── Победный баннер ──────────────────── */}
      {lastWin && lastWin.won && (
        <div
          key={lastWin.id}
          style={{
            marginTop: spacing.md,
            padding: spacing.md,
            borderRadius: radius.md,
            textAlign: 'center',
            background: 'rgba(255,215,0,0.12)',
            border: `1px solid ${colors.gold}`,
            animation: 'pl-pop 0.3s ease-out',
          }}
        >
          <LottiePlayer
            src={publicUrl('animations/firework.json')}
            autoplay
            loop={false}
            style={{ width: 180, height: 180, margin: '0 auto' }}
          />
          <div style={{ fontWeight: 'bold', fontSize: 17, color: colors.gold }}>
            Выигрыш: {lastWin.multiplier.toFixed(2)}x
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
            +{lastWin.win.toFixed(2)} TON
          </div>
        </div>
      )}

      {/* Сброс */}
      <div style={{ marginTop: spacing.sm }}>
        <Button size="md" variant="ghost" fullWidth onClick={reset} disabled={isDropping}>
          🧹 Сбросить шарики
        </Button>
      </div>
    </div>
  );
}

