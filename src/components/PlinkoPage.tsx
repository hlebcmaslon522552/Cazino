import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player as LottiePlayer } from '@lottiefiles/react-lottie-player';
import { CONFIG } from '../config';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';

/* ===================================================================
   Интерфейсы
   =================================================================== */

interface Props {
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
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
  slot: number | null;        // индекс слота после приземления
  multiplier: number;         // множитель слота
  serverMultiplier: number | null; // множитель от сервера (для выплаты)
  bet: number;                // ставка за этот шарик
  finished: boolean;          // упал в слот
  startTime: number;          // performance.now() в момент запуска партии
  spawnDelay: number;         // мс до появления шарика (очередь)
  targetSlot: number | null;  // целевой слот от сервера (если есть)
  pattern: number[];          // последовательность отскоков для визуального паттерна
  patternIdx: number;         // текущий индекс в паттерне отскоков
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
const GRAVITY = 0.2;                  // гравитация
const TOP_OFFSET = 64;                 // Y первого ряда колышков
const ROW_GAP = 32;                    // вертикальный шаг между рядами
const DROP_START_Y = 28;               // Y точки старта шарика
const SLOT_H = 34;                     // высота слота
const SPAWN_STEP = 180;                // мс между появлением шариков
const MIN_BET = 0.1;

const ROWS_OPTIONS = [8, 10, 12];
const BALLS_OPTIONS = [1, 3, 5, 10, 30];

/* Честные множители как в Stake. Симметричные массивы: центр → край  */
const MULTIS_8  = [5.6, 2.1, 0.8, 0.5, 0.5, 0.5, 0.8, 2.1, 5.6];
const MULTIS_10 = [8.0, 2.8, 1.4, 1.0, 0.6, 0.5, 0.6, 1.0, 1.4, 2.8, 8.0];
const MULTIS_12 = [10.0, 3.0, 1.6, 1.4, 0.8, 0.5, 0.5, 0.5, 0.8, 1.4, 1.6, 3.0, 10.0];

/* Паттерны отскоков для визуального разнообразия падения (-1 = влево, 1 = вправо) */
const BOUNCE_PATTERNS: number[][] = [
  [-1,  1,  1, -1, -1,  1],
  [ 1, -1, -1,  1,  1, -1],
  [-1, -1,  1,  1, -1,  1],
  [ 1,  1, -1, -1,  1, -1],
  [-1,  1, -1,  1, -1,  1],
  [ 1, -1,  1, -1,  1, -1],
];

/* Цвета для групп множителей: низкие зелёные → средние жёлтые → высокие красные → легендарные */
const MULT_COLORS = [
  '#22c55e', '#84cc16', '#eab308', '#f97316',
  '#ef4444', '#d946ef', '#a855f7', '#7c3aed',
];

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Строит конфигурацию слотов из заранее заданных массивов множителей. */
function buildSlots(rows: number): SlotConfig[] {
  const arr: number[] = rows === 8 ? MULTIS_8 : rows === 10 ? MULTIS_10 : MULTIS_12;
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

export function PlinkoPage({ balance, onUpdateBalance, onBack, onToast }: Props) {
  const { haptic, user } = useTelegram();

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

  const ballsRef = useRef<Ball[]>([]);
  const nextId = useRef(1);
  const isDroppingRef = useRef(false);
  const ballsFinishedRef = useRef(0);
  const expectedBallsRef = useRef(0);
  const serverSlotsRef = useRef<(number | null)[]>([]);

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
    // Чистое расстояние между колышками по X: ширина поля / (количество рядов + 1)
    const spacingX = boardW / (rows + 1);
    // Проверка физического зазора: шарик (2*BALL_R) должен проходить между колышками
    // Если spacingX <= (BALL_R + PEG_R) * 2 — уменьшаем радиусы
    const minGap = (BALL_R + PEG_R) * 2;
    let ballR = BALL_R;
    let pegR = PEG_R;
    let collideDist = COLLIDE_DIST;
    if (spacingX <= minGap) {
      // Уменьшаем радиусы пропорционально, чтобы spacingX > (ballR + pegR) * 2
      const ratio = (spacingX * 0.98) / (minGap);
      ballR = Math.floor(ballR * ratio * 10) / 10;
      pegR = Math.floor(pegR * ratio * 10) / 10;
      collideDist = ballR + pegR;
    }
    // Вертикальный шаг = доступная высота / количество рядов
    const pegAreaHeight = slotTop - TOP_OFFSET;
    const spacingY = pegAreaHeight / rows;

    for (let r = 0; r < rows; r++) {
      // Центрированный сдвиг: (boardW - r * spacingX) / 2
      const startX = (boardW - r * spacingX) / 2;
      for (let j = 0; j <= r; j++) {
        list.push({
          x: startX + j * spacingX,
          y: r * spacingY + TOP_OFFSET,
        });
      }
    }
    return list;
  }, [boardW, rows, slotTop]);

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
        b.vy = Math.min(b.vy, 4);
        b.x += b.vx;
        b.vx *= 0.95;
        b.y += b.vy * 0.7;

        // коллизии ТОЛЬКО с колышками (ball-vs-ball отключены — сквозной пролёт)
        for (const p of pegs) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.0001 && dist < COLLIDE_DIST) {
            const overlap = (BALL_R + PEG_R) - dist;
            b.x += (dx / dist) * overlap;
            b.y += (dy / dist) * overlap;
            // Направление отскока: паттерн + случайный фактор
            const patternDir = b.pattern.length > 0
              ? b.pattern[b.patternIdx % b.pattern.length]
              : (Math.random() > 0.5 ? 1 : -1);
            const randFactor = (Math.random() - 0.5) * 1.5;
            b.vx += patternDir * 0.8 + randFactor * 0.5;
            b.vx = Math.max(-3, Math.min(3, b.vx));
            b.patternIdx++;
          }
        }

        // боковые стенки (упругость ≈ 0, шарик не отлетает)
        if (b.x - BALL_R < 0) { b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.1; }
        if (b.x + BALL_R > boardW) { b.x = boardW - BALL_R; b.vx = -Math.abs(b.vx) * 0.1; }

        // Коррекция курса: последние 20% — плавно направляем в целевой слот
        if (b.targetSlot !== null) {
          const progress = (b.y - DROP_START_Y) / (slotTop - DROP_START_Y);
          if (progress > 0.8) {
            const targetX = (b.targetSlot + 0.5) * (boardW / multipliers.length);
            const diff = targetX - b.x;
            b.vx += diff * 0.03;
            b.vx *= 0.9;
          }
        }

        // падение в слот
        if (b.y > slotTop + SLOT_H * 0.25) {
          // ① Сначала вычисляем слот по координате X шарика
          const totalSlots = multipliers.length;
          const slotWidth = boardW / totalSlots;
          let slotIndex = Math.floor(b.x / slotWidth);
          if (slotIndex < 0) slotIndex = 0;
          if (slotIndex >= totalSlots) slotIndex = totalSlots - 1;

          // Используем множитель слота, куда физически упал шарик
          const winMultiplier = multipliers[slotIndex];

          // Серверный множитель — только для проверки (логируем рассинхрон)
          if (b.serverMultiplier !== null && b.serverMultiplier !== undefined) {
            console.log(
              "Шарик упал в слот:", slotIndex,
              "Физ. множитель:", winMultiplier,
              "Серверный:", b.serverMultiplier,
              "Рассинхрон:", winMultiplier !== b.serverMultiplier
            );
          }

          b.slot = slotIndex;
          b.multiplier = winMultiplier;
          b.y = slotTop + SLOT_H / 2 - BALL_R;
          b.vy = 0;
          b.vx = 0;

          console.log("Шарик упал в слот:", slotIndex, "Множитель:", winMultiplier);

          // ② Затем начисляем выигрыш по физическому слоту
          ballsFinishedRef.current++;
          const win = round2(b.bet * winMultiplier);
          const won = winMultiplier > 1;
          onUpdateBalance(win);
          if (won) {
            haptic('medium');
            setLastWin({ id: b.id, multiplier: b.multiplier, win, won: true });
            onToast(`🎉 Выигрыш +${win.toFixed(2)} TON (${b.multiplier.toFixed(2)}x)`, 'success');
          } else {
            haptic('light');
          }

          // ③ После всего помечаем шарик finished — filter после цикла удалит его
          b.finished = true;
          changed = true;
        }
      }

      // Удаляем finished-шарики сразу (очищаем массив)
      const cleaned = active.filter(b => !b.finished);
      if (cleaned.length !== active.length) {
        ballsRef.current = cleaned;
        setBalls(cleaned);
      } else if (changed) {
        setBalls([...active]);
      }

      // Когда массив пустеет — разблокируем кнопку
      if (cleaned.length === 0 && isDroppingRef.current) {
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
  const drop = async () => {
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

    // Спрашиваем серверные множители
    interface ServerSlot {
      slotIndex: number | null;
      multiplier: number | null;
    }
    const serverData: ServerSlot[] = [];
    try {
      const results = await Promise.all(
        Array.from({ length: ballsCount }, () =>
          fetch(`${CONFIG.API_URL}/api/plinko_drop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bet_amount: stake, rows }),
          }).then(r => r.json())
        )
      );
      for (const res of results) {
        if (res && typeof res.slotIndex === 'number' && res.slotIndex >= 0 && res.slotIndex < multipliers.length) {
          // Сервер возвращает slotIndex, совместимый с нашим массивом множителей
          serverData.push({ slotIndex: res.slotIndex, multiplier: res.multiplier ?? multipliers[res.slotIndex] });
        } else if (res && typeof res.multiplier === 'number') {
          // Fallback: ищем множитель в массиве (для старых версий сервера)
          const slotIdx = multipliers.indexOf(res.multiplier);
          serverData.push({ slotIndex: slotIdx >= 0 ? slotIdx : null, multiplier: res.multiplier });
        } else {
          serverData.push({ slotIndex: null, multiplier: null });
        }
      }
    } catch {
      // Если сервер недоступен — играем локально
      for (let i = 0; i < ballsCount; i++) serverData.push({ slotIndex: null, multiplier: null });
    }
    serverSlotsRef.current = serverData.map(d => d.slotIndex);

    onUpdateBalance(-totalStake);

    // Отправляем оборот
    if (totalStake > 0) {
      fetch(`${CONFIG.API_URL}/api/add_turnover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          username: user?.first_name || 'Игрок',
          amount: totalStake,
        }),
      }).catch(() => {});
    }
    setIsDropping(true);
    isDroppingRef.current = true;
    ballsFinishedRef.current = 0;
    expectedBallsRef.current = ballsCount;
    setLastWin(null);

    const now = performance.now();
    const created: Ball[] = [];
    for (let i = 0; i < ballsCount; i++) {
      const sd = serverData[i] || { slotIndex: null, multiplier: null };
      let startX = boardW / 2;
      let startVx = 0;

      // Выбираем случайный паттерн отскоков для этого шарика
      const pattern = BOUNCE_PATTERNS[Math.floor(Math.random() * BOUNCE_PATTERNS.length)];

      if (sd.slotIndex !== null) {
        const totalSlots = multipliers.length;
        const third = totalSlots / 3;
        // Определяем начальную скорость по положению целевого слота
        if (sd.slotIndex < third) {
          // Левая треть — импульс влево
          startVx = -2;
        } else if (sd.slotIndex >= totalSlots - third) {
          // Правая треть — импульс вправо
          startVx = 2;
        } else {
          // Центр — небольшой случайный импульс
          startVx = (Math.random() - 0.5) * 0.5;
        }
      } else {
        // Нет сервера — случайный разброс (как было)
        startX = boardW / 2 + (Math.random() - 0.5) * 10;
        startVx = (Math.random() - 0.5) * 0.2;
      }

      created.push({
        id: nextId.current++,
        x: startX,
        y: DROP_START_Y,
        vx: startVx,
        vy: 0,
        slot: null,
        multiplier: 0,
        serverMultiplier: sd.multiplier,
        bet: stake,
        finished: false,
        startTime: now,
        spawnDelay: i * SPAWN_STEP, // очередь: каждый следующий на 300 мс позже
        targetSlot: sd.slotIndex,
        pattern: pattern,
        patternIdx: 0,
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

