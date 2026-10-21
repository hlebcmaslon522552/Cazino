import { useEffect, useRef, useState } from 'react';
import { colors, radius, spacing } from '../theme';

/* ===================================================================
   Интерфейсы
   =================================================================== */

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Candle {
  t: number;    // время закрытия свечи (секунды от старта раунда)
  open: number; // цена (множитель) в начале свечи
  close: number;// цена (множитель) в конце свечи
  high: number; // максимум за свечу (верх фитиля)
  low: number;  // минимум за свечу (низ фитиля)
}

type Phase = 'setup' | 'playing' | 'crashed' | 'won';

/* ===================================================================
   Константы
   =================================================================== */

const MIN_BET = 0.1;

/* ===================================================================
   Страница «Crash»
   =================================================================== */

export function CrashPage({ onBack, onToast }: Props) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [betAmount, setBetAmount] = useState('0.1');
  const [multiplier, setMultiplier] = useState(1);
  const [, setIsGameStarted] = useState(false);
  const [rugPulled, setRugPulled] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [autoCashout, setAutoCashout] = useState(false);
  const [autoCashoutValue, setAutoCashoutValue] = useState('1.2');
  const [resultWin, setResultWin] = useState(0);

  // Рефы, чтобы игровой цикл не зависел от устаревших значений в замыкании
  const elapsedRef = useRef(0);
  const multiplierRef = useRef(1);
  const startTimeRef = useRef(0);
  const lastCandleTimeRef = useRef(0);
  const crashPointRef = useRef(2.0);
  const requestRef = useRef<number>(0);

  const betPrice = Math.max(MIN_BET, parseFloat(betAmount) || 0);
  const autoValue = Math.max(1.01, parseFloat(autoCashoutValue) || 1.2);
  const potentialWin = betPrice * multiplier;

  /* ── Игровой цикл роста множителя ─────────────────────────── */
  const startPlaying = () => {
    elapsedRef.current = 0;
    multiplierRef.current = 1;
    setMultiplier(1);
    setCandles([]);
    setRugPulled(false);
    setIsGameStarted(true);
    setPhase('playing');
  };

  const triggerRugPull = () => {
    setRugPulled(true);
    // Одна длинная красная свеча, уходящая за нижний край экрана
    setCandles((prev) => {
      const last = prev[prev.length - 1];
      const open = last ? last.close : 1;
      const t = last ? last.t + 0.001 : 0.001;
      return [...prev, { t, open, close: 0.15, high: open, low: 0.05 }];
    });
    setPhase('crashed');
    setIsGameStarted(false);
    onToast('RUG PULL!', 'error');
  };

  const doCashout = () => {
    const win = betPrice * multiplierRef.current;
    setResultWin(win);
    setPhase('won');
    setIsGameStarted(false);
    onToast(`Вы забрали ${win.toFixed(2)} TON!`, 'success');
  };

  // Старт раунда — сразу запускаем игру (без фазы ожидания)
  const startRound = () => {
    elapsedRef.current = 0;
    multiplierRef.current = 1;
    setMultiplier(1);
    setCandles([]);
    setRugPulled(false);
    setResultWin(0);
    crashPointRef.current = 1 + Math.random() * 4; // случайная точка краша от 1x до 5x
    startPlaying();
  };

  /* ── Рост множителя через requestAnimationFrame ───────────── */
  useEffect(() => {
    if (phase !== 'playing') return;

    const animate = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;

      const newMultiplier = Math.pow(1.0006, elapsed);

      // ЛОГИКА ОБНОВЛЕНИЯ СВЕЧЕЙ (только 6 штук)
      if (time - lastCandleTimeRef.current > 200) {
        setCandles(prev => {
          const newCandles = [...prev].slice(-5);

          if (newCandles.length > 0) {
            const last = newCandles[newCandles.length - 1];
            last.close = newMultiplier;
            last.high = Math.max(last.high, newMultiplier);
            last.low = Math.min(last.low, newMultiplier);
          }

          newCandles.push({
            t: elapsed, open: newMultiplier, close: newMultiplier, high: newMultiplier, low: newMultiplier,
          });
          return newCandles;
        });
        lastCandleTimeRef.current = time;
      }

      if (newMultiplier >= crashPointRef.current) {
        setMultiplier(crashPointRef.current);
        triggerRugPull();
      } else {
        setMultiplier(newMultiplier);
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const cashout = () => {
    if (phase !== 'playing') return;
    doCashout();
  };

  const renderCandles = () => {
    if (candles.length === 0) return null;

    const maxVal = Math.max(...candles.map(c => c.high), 1.1);
    const minVal = Math.min(...candles.map(c => c.low), 1.0);
    const range = maxVal - minVal;

    return candles.map((candle, i) => {
      const isGreen = candle.close >= candle.open;
      const color = isGreen ? '#00ff88' : '#ff3366';

      const bodyTop = 100 - ((Math.max(candle.open, candle.close) - minVal) / range) * 100;
      const bodyBottom = 100 - ((Math.min(candle.open, candle.close) - minVal) / range) * 100;
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1);

      const wickTop = 100 - ((candle.high - minVal) / range) * 100;
      const wickBottom = 100 - ((candle.low - minVal) / range) * 100;

      const candleWidth = 100 / 6;
      const xPos = (i * candleWidth) + (candleWidth / 2);

      return (
        <g key={i}>
          <line
            x1={xPos} y1={wickTop}
            x2={xPos} y2={wickBottom}
            stroke={color} strokeWidth="0.8"
          />
          <rect
            x={xPos - (candleWidth * 0.35)}
            y={bodyTop}
            width={candleWidth * 0.7}
            height={bodyHeight}
            fill={color}
            rx="1"
          />
        </g>
      );
    });
  };

  return (
    <div style={{ padding: spacing.md, color: colors.text, maxWidth: 500, margin: '0 auto', fontFamily: 'Calibri, sans-serif' }}>
      {/* Назад */}
      <div style={{ marginBottom: spacing.md }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 16, cursor: 'pointer', padding: '4px 0', fontWeight: 'bold', fontFamily: 'Calibri, sans-serif' }}
        >
          {'\u2190 Назад'}
        </button>
      </div>

      {/* График */}
      <div
        style={{
          position: 'relative',
          height: 300,
          borderRadius: radius.lg,
          overflow: 'hidden',
          background: '#000',
          border: `1px solid ${colors.border}`,
        }}
      >
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', display: 'block' }}>
          {/* Ровная сетка */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={'h' + i} x1={0} x2={100} y1={(i / 4) * 100} y2={(i / 4) * 100} stroke="rgba(255,255,255,0.07)" strokeWidth={0.3} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={'v' + i} x1={(i / 5) * 100} x2={(i / 5) * 100} y1={0} y2={100} stroke="rgba(255,255,255,0.07)" strokeWidth={0.3} />
          ))}

          {renderCandles()}

          {rugPulled && (
            <line
              x1={candles.length > 0 ? ((candles.length - 1) * (100/6)) + (100/6)/2 : 50}
              y1="0"
              x2={candles.length > 0 ? ((candles.length - 1) * (100/6)) + (100/6)/2 : 50}
              y2="100"
              stroke="#ff3366"
              strokeWidth="2"
              strokeDasharray="3,3"
              style={{ filter: 'drop-shadow(0 0 8px #ff3366)' }}
            />
          )}
        </svg>

        {/* RUG PULL — аккуратная плашка по центру (width: 80%, borderRadius: 16px) */}
        {rugPulled && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '80%',
                borderRadius: '16px',
                background: '#ef4444',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: 24,
                padding: '12px 20px',
                textAlign: 'center',
                boxShadow: '0 0 30px rgba(239,68,68,0.5)',
                letterSpacing: 2,
              }}
            >
              RUG PULL
            </div>
          </div>
        )}

        {/* Текущий множитель — крупно зелёным в левом нижнем углу */}
        {(phase === 'playing' || phase === 'crashed') && (
          <div
            style={{
              position: 'absolute',
              left: 14,
              bottom: 10,
              fontSize: 34,
              fontWeight: 'bold',
              color: rugPulled ? colors.danger : colors.success,
              textShadow: '0 0 12px rgba(0,0,0,0.9)',
            }}
          >
            {rugPulled ? '0.00x' : `${multiplier.toFixed(2)}x`}
          </div>
        )}

        {/* Множитель 1.00x когда игра не запущена */}
        {phase === 'setup' && (
          <div
            style={{
              position: 'absolute',
              left: 14,
              bottom: 10,
              fontSize: 34,
              fontWeight: 'bold',
              color: colors.success,
              textShadow: '0 0 12px rgba(0,0,0,0.9)',
            }}
          >
            1.00x
          </div>
        )}
      </div>
      {/* Настройка ставки */}
      {phase === 'setup' && (
        <div style={{ marginTop: spacing.md }}>
          <label style={{ fontSize: 13, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
            Сумма ставки (TON)
          </label>
          <input
            type="number" min="0.1" step="0.01" value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)} placeholder="0.1"
            style={{
              width: '100%', padding: '14px 16px', fontSize: 18, fontWeight: 'bold',
              background: colors.bgCard, border: `1.5px solid ${colors.border}`,
              borderRadius: radius.md, color: colors.text, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
            Минимум {MIN_BET.toFixed(1)} TON
          </div>

          {/* Авто-сбор */}
          <div style={{ marginTop: spacing.md, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setAutoCashout((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                background: autoCashout ? colors.bgCardActive : colors.bgCard,
                border: `1.5px solid ${autoCashout ? colors.primary : colors.border}`,
                borderRadius: radius.pill, cursor: 'pointer', color: colors.text, fontWeight: 'bold', fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 20, height: 20, borderRadius: radius.pill,
                  background: autoCashout ? colors.primary : '#555',
                  position: 'relative', flexShrink: 0,
                }}
              >
                {autoCashout && <span style={{ position: 'absolute', left: 6, top: 3, color: '#fff', fontSize: 12 }}>&#10003;</span>}
              </span>
              Авто-сбор
            </button>
            <input
              type="number" min="1.01" step="0.1" value={autoCashoutValue}
              onChange={(e) => setAutoCashoutValue(e.target.value)} placeholder="1.2"
              disabled={!autoCashout}
              style={{
                flex: 1, padding: '10px 12px', fontSize: 15, fontWeight: 'bold',
                background: colors.bgCard, border: `1.5px solid ${colors.border}`,
                borderRadius: radius.md, color: colors.text, outline: 'none',
                opacity: autoCashout ? 1 : 0.5,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 'bold', color: colors.textMuted }}>x</span>
          </div>

          {/* TODO: Место под картинку Crash. */}
          <div style={{ marginTop: spacing.md }}>{/* TODO: Место под картинку Crash. */}</div>

          <button
            onClick={startRound}
            style={{
              width: '100%', marginTop: spacing.md, padding: '18px 24px', fontSize: 20, fontWeight: 'bold',
              color: '#ffffff', background: colors.primary, border: 'none',
              borderRadius: radius.md, cursor: 'pointer', letterSpacing: 1,
              boxShadow: `0 4px 16px ${colors.purpleGlow}`,
            }}
          >
            Сделать ставку
          </button>
        </div>
      )}

      {/* Игра */}
      {(phase === 'playing' || phase === 'crashed' || phase === 'won') && (
        <div style={{ marginTop: spacing.md }}>
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', background: colors.bgCard, borderRadius: radius.md,
              border: `1px solid ${colors.border}`, marginBottom: spacing.md,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>Ставка</div>
              <div style={{ fontSize: 15, fontWeight: 'bold' }}>{betPrice.toFixed(2)} TON</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: colors.textMuted }}>Потенциальный выигрыш</div>
              <div style={{ fontSize: 15, fontWeight: 'bold', color: colors.gold }}>
                {potentialWin.toFixed(2)} TON
              </div>
            </div>
          </div>

          {/* Забрать (зелёная кнопка) */}
          {phase === 'playing' && (
            <button
              onClick={cashout}
              style={{
                width: '100%', padding: '16px 24px', fontSize: 18, fontWeight: 'bold',
                color: '#ffffff', background: '#22c55e', border: 'none',
                borderRadius: radius.md, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(34,197,94,0.4)',
              }}
            >
              Забрать {potentialWin.toFixed(2)} TON
            </button>
          )}

          {autoCashout && phase === 'playing' && (
            <div style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
              Авто-сбор на {autoValue.toFixed(2)}x
            </div>
          )}

          {/* RUG PULL результат */}
          {phase === 'crashed' && (
            <div style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, textAlign: 'center', background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.danger}` }}>
              <div style={{ fontSize: 26 }}>&#128168;</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.danger, marginTop: 4 }}>
                RUG PULL! Ставка сгорела
              </div>
            </div>
          )}

          {/* Выигрыш */}
          {phase === 'won' && (
            <div style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, textAlign: 'center', background: 'rgba(34,197,94,0.15)', border: `1px solid ${colors.success}` }}>
              <div style={{ fontSize: 26 }}>&#127881;</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.success, marginTop: 4 }}>
                Вы забрали {resultWin.toFixed(2)} TON!
              </div>
            </div>
          )}

          {/* Пост-игровые действия */}
          {(phase === 'crashed' || phase === 'won') && (
            <div style={{ marginTop: spacing.md, display: 'flex', gap: 8 }}>
              <button onClick={startRound} style={{ flex: 1, padding: '14px 18px', fontSize: 15, fontWeight: 'bold', color: '#fff', background: colors.primary, border: 'none', borderRadius: radius.md, cursor: 'pointer', fontFamily: 'Calibri, sans-serif' }}>
                &#128257; Заново
              </button>
              <button onClick={() => { setPhase('setup'); setIsGameStarted(false); }} style={{ flex: 1, padding: '14px 18px', fontSize: 15, fontWeight: 'bold', color: colors.primary, background: colors.bgCardActive, border: `1px solid ${colors.primary}`, borderRadius: radius.md, cursor: 'pointer', fontFamily: 'Calibri, sans-serif' }}>
                &#9881;&#65039; Сменить ставку
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}




