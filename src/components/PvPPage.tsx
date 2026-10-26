import { useState, useEffect, useRef } from 'react';
import { Coins, Plus, Clock, Users, User } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';

interface PvPPageProps {
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Phase = 'setup' | 'waiting' | 'timeout' | 'finished';

const COUNTDOWN_SECONDS = 15;

export const PvPPage = ({ balance, onUpdateBalance, onToast }: PvPPageProps) => {
  const [betInput, setBetInput] = useState<string>('1.0');
  const [phase, setPhase] = useState<Phase>('setup');
  const [timer, setTimer] = useState<number>(COUNTDOWN_SECONDS);
  const [opponentJoined, setOpponentJoined] = useState<boolean>(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingRef = useRef<boolean>(false);

  const finalBet = parseFloat(betInput) || 0;

  const clearTimers = () => {
    waitingRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (opponentRef.current) {
      clearTimeout(opponentRef.current);
      opponentRef.current = null;
    }
  };

  // Очищаем таймеры при размонтировании
  useEffect(() => {
    return () => clearTimers();
  }, []);

  const resetToSetup = (refund: boolean, message?: string) => {
    clearTimers();
    setPhase('setup');
    setTimer(COUNTDOWN_SECONDS);
    setOpponentJoined(false);
    setResult(null);
    if (refund) onUpdateBalance(finalBet);
    if (message) onToast?.(message, 'info');
  };

  const createGame = () => {
    if (finalBet <= 0) {
      onToast?.('Введите корректную ставку', 'error');
      return;
    }
    if (finalBet > balance) {
      onToast?.('Недостаточно TON на балансе', 'error');
      return;
    }

    // Списываем ставку
    onUpdateBalance(-finalBet);

    setPhase('waiting');
    setTimer(COUNTDOWN_SECONDS);
    setOpponentJoined(false);
    setResult(null);
    waitingRef.current = true;

    // Запускаем отсчёт 15 секунд
    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearTimers();
          // Соперник не найден — возвращаем ставку
          setPhase('timeout');
          setOpponentJoined(false);
          onUpdateBalance(finalBet);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Имитация: соперник может найтись в течение 15 секунд
    const delay = 5000 + Math.random() * 8000;
    opponentRef.current = setTimeout(() => {
      if (waitingRef.current) {
        setOpponentJoined(true);
      }
    }, delay);
  };

  // Когда соперник найден — подводим итог
  useEffect(() => {
    if (opponentJoined && phase === 'waiting') {
      clearTimers();
      const win = Math.random() > 0.5;
      setResult(win ? 'win' : 'lose');
      setPhase('finished');
      if (win) {
        onUpdateBalance(finalBet * 2);
        onToast?.('🎉 Вы победили! +' + (finalBet * 2).toFixed(2) + ' TON', 'success');
      } else {
        onToast?.('😔 Вы проиграли. Соперник оказался сильнее', 'error');
      }
    }
  }, [opponentJoined, phase, finalBet, onUpdateBalance, onToast]);

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: spacing.md,
    flex: 1,
  };

  const labelStyle: React.CSSProperties = {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  };

  return (
    <div style={{ padding: spacing.md, color: colors.text, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
        ⚔️ PvP Батл
      </h1>
      <p style={{ textAlign: 'center', color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>
        Сразитесь один на один и удвойте ставку!
      </p>

      {/* Два блока: Вы и Соперник */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={labelStyle}>Вы</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                background: colors.bgCardActive,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={22} color={colors.primary} />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 15 }}>Игрок</div>
              <div style={{ color: colors.gold, fontSize: 13, fontWeight: 'bold' }}>
                {finalBet > 0 ? finalBet.toFixed(2) + ' TON' : '—'}
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={labelStyle}>Соперник</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                background: opponentJoined ? colors.bgCardActive : 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} color={opponentJoined ? colors.danger : colors.textDim} />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 15 }}>
                {opponentJoined ? 'Соперник' : 'Ожидание'}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>
                {phase === 'finished'
                  ? result === 'win'
                    ? 'Вы победили'
                    : 'Вы проиграли'
                  : phase === 'waiting'
                  ? 'Поиск...'
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Таймер обратного отсчёта */}
      {phase === 'waiting' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 16,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Clock size={20} color={colors.accent} />
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>Поиск соперника...</span>
          <span style={{ fontWeight: 900, fontSize: 24, color: colors.accent }}>{timer}с</span>
        </div>
      )}

      {/* Сообщение об отсутствии соперника */}
      {phase === 'timeout' && (
        <div
          style={{
            padding: 16,
            background: 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${colors.danger}`,
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 16,
            color: colors.danger,
            fontWeight: 'bold',
          }}
        >
          Соперник не найден. Попробуйте позже
        </div>
      )}

      {/* Результат боя */}
      {phase === 'finished' && (
        <div
          style={{
            padding: 16,
            background: result === 'win' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${result === 'win' ? colors.success : colors.danger}`,
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 16,
            fontWeight: 'bold',
            fontSize: 16,
          }}
        >
          {result === 'win' ? '🎉 Победа!' : '💔 Поражение'}
        </div>
      )}

      {/* Ввод ставки и кнопка создания игры */}
      {(phase === 'setup' || phase === 'timeout') && (
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: spacing.md,
          }}
        >
          <div style={labelStyle}>Ставка (TON)</div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Coins
              size={18}
              color={colors.gold}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="number"
              min="0"
              step="0.1"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 40px',
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                color: colors.text,
                fontSize: 16,
                fontWeight: 'bold',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[0.5, 1, 2, 5].map((val) => (
              <button
                key={val}
                onClick={() => setBetInput(String(val))}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  background: finalBet === val ? colors.bgCardActive : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${finalBet === val ? colors.borderActive : colors.border}`,
                  borderRadius: 10,
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                {val} TON
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 13 }}>
            <span style={{ color: colors.textMuted }}>Баланс</span>
            <span style={{ color: colors.gold, fontWeight: 'bold' }}>{balance.toFixed(2)} TON</span>
          </div>
          <Button fullWidth onClick={createGame} size="lg">
            <Plus size={20} /> Создать игру
          </Button>
        </div>
      )}

      {/* В ожидании — отмена поиска */}
      {phase === 'waiting' && (
        <Button
          fullWidth
          variant="ghost"
          onClick={() => resetToSetup(true, 'Поиск отменён, ставка возвращена')}
        >
          Отменить поиск
        </Button>
      )}

      {/* После результата — играть снова */}
      {phase === 'finished' && (
        <Button
          fullWidth
          size="lg"
          onClick={() => resetToSetup(false, 'Создайте новую игру')}
        >
          <Plus size={20} /> Играть снова
        </Button>
      )}
    </div>
  );
};


