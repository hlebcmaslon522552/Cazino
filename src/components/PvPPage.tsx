import { useState, useEffect, useRef } from 'react';
import { Coins, Plus, Clock, Users, User } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';

interface PvPPageProps {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const COUNTDOWN_SECONDS = 15;

export const PvPPage = ({ balance, onUpdateBalance, onToast }: PvPPageProps) => {
  const [betInput, setBetInput] = useState('1.0');
  const [phase, setPhase] = useState<'setup' | 'waiting' | 'timeout'>('setup');
  const [timer, setTimer] = useState(COUNTDOWN_SECONDS);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<'setup' | 'waiting' | 'timeout'>('setup');
  phaseRef.current = phase;

  const bet = parseFloat(betInput) || 0;

  const clearTimers = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (opponentRef.current) {
      clearTimeout(opponentRef.current);
      opponentRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  const resetToSetup = (msg?: string) => {
    clearTimers();
    setTimer(COUNTDOWN_SECONDS);
    setPhase('setup');
    if (msg) onToast?.(msg, 'info');
  };

  const createGame = () => {
    if (bet <= 0) {
      onToast?.('Введите корректную ставку', 'error');
      return;
    }
    if (bet > balance) {
      onToast?.('Недостаточно TON на балансе', 'error');
      return;
    }

    // Списываем ставку
    onUpdateBalance(-bet);

    setTimer(COUNTDOWN_SECONDS);
    setPhase('waiting');

    // Обратный отсчёт 15 секунд
    intervalRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearTimers();
          // Соперник не найден — возвращаем ставку
          setPhase('timeout');
          onUpdateBalance(bet);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Имитация поиска соперника
    const delay = 6000 + Math.random() * 4000;
    opponentRef.current = setTimeout(() => {
      if (phaseRef.current === 'waiting') {
        clearTimers();
        setPhase('timeout');
        onUpdateBalance(bet);
        onToast?.('🎉 Соперник найден! +' + (bet * 2).toFixed(2) + ' TON', 'success');
      }
    }, delay);
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
        <div
          style={{
            flex: 1,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: spacing.md,
          }}
        >
          <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Вы</div>
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
                {bet > 0 ? bet.toFixed(2) + ' TON' : '—'}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: spacing.md,
          }}
        >
          <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Соперник</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                background: phase === 'waiting' ? colors.bgCardActive : 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} color={phase === 'waiting' ? colors.accent : colors.textDim} />
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 15 }}>
                {phase === 'waiting' ? 'Поиск' : 'Ожидание'}
              </div>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>
                {phase === 'waiting' ? 'Ищем соперника...' : '—'}
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

      {/* Ввод ставки и кнопка создания игры */}
      {phase !== 'waiting' && (
        <div
          style={{
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            padding: spacing.md,
          }}
        >
          <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Ставка (TON)</div>
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
                  background: bet === val ? colors.bgCardActive : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${bet === val ? colors.borderActive : colors.border}`,
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
          onClick={() => {
            clearTimers();
            onUpdateBalance(bet);
            resetToSetup('Поиск отменён, ставка возвращена');
          }}
        >
          Отменить поиск
        </Button>
      )}
    </div>
  );
};
