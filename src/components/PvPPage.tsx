import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Coins, User, Swords } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { CONFIG } from '../config';

interface PvPPageProps {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Player {
  user_id: string;
  username: string;
  bet: number;
  color: string;
}

type Phase = 'setup' | 'waiting' | 'spinning' | 'result';

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 132;
const INNER_R = 56;

const polar = (deg: number, rad: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: CX + rad * Math.cos(a), y: CY + rad * Math.sin(a) };
};

const sectorPath = (startDeg: number, endDeg: number) => {
  const o1 = polar(startDeg, OUTER_R);
  const o2 = polar(endDeg, OUTER_R);
  const i1 = polar(startDeg, INNER_R);
  const i2 = polar(endDeg, INNER_R);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    'M ' + o1.x.toFixed(2) + ' ' + o1.y.toFixed(2),
    'A ' + OUTER_R + ' ' + OUTER_R + ' 0 ' + large + ' 1 ' + o2.x.toFixed(2) + ' ' + o2.y.toFixed(2),
    'L ' + i2.x.toFixed(2) + ' ' + i2.y.toFixed(2),
    'A ' + INNER_R + ' ' + INNER_R + ' 0 ' + large + ' 0 ' + i1.x.toFixed(2) + ' ' + i1.y.toFixed(2),
    'Z',
  ].join(' ');
};
export const PvPPage = ({ balance, onUpdateBalance, onToast }: PvPPageProps) => {
  const [betInput, setBetInput] = useState('1.0');
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [totalPot, setTotalPot] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string>('');
  const playersRef = useRef<Player[]>([]);
  const phaseRef = useRef<Phase>('setup');
  const spinAngleRef = useRef(0);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitCountRef = useRef(15);
  const pendingBetRef = useRef(0);
  const [waitSeconds, setWaitSeconds] = useState(15);
  const [waitExpired, setWaitExpired] = useState(false);

  // Синхронизируем актуальные значения для обработчиков socket-событий,
  // которые создаются один раз (useEffect с пустыми зависимостями).
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const applySpin = (angle: number) => {
    spinAngleRef.current = angle;
    setSpinAngle(angle);
  };

  useEffect(() => {
    const socket = io(CONFIG.API_URL, {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[PvP] Socket connected');
    });

    socket.on('pvp_waiting', (data: { room_id: string; message: string }) => {
      setRoomId(data.room_id);
      setIsCreator(true);
      setPhase('waiting');
    });

    socket.on('pvp_started', (data: { room_id: string; players: Player[]; total_pot: number }) => {
      // Соперник найден — останавливаем таймер ожидания, ставка в игре
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      pendingBetRef.current = 0;
      setWaitExpired(false);
      setRoomId(data.room_id);
      playersRef.current = data.players;
      setPlayers(data.players);
      setTotalPot(data.total_pot);
      setPhase('spinning');
      setWinnerId(null);

      // Сначала рисуем рулетку в 0°, затем на следующем кадре запускаем вращение.
      // Если менять угол в том же рендере, где SVG монтируется впервые,
      // CSS-transition не сработает и колесо просто «телепортнётся» в конечную позицию.
      applySpin(0);
      const spinDeg = 3600 + Math.floor(Math.random() * 180);
      spinTimeoutRef.current = setTimeout(() => applySpin(spinDeg), 50);

      // Через 4 секунды просим сервер выбрать победителя — приходит pvp_result.
      spinTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && data.room_id) {
          socketRef.current.emit('spin_pvp', { room_id: data.room_id });
        }
      }, 4000);
    });

    socket.on('pvp_result', (data: { winner_id: string; winner_name: string; total_pot: number }) => {
      const currentPlayers = playersRef.current;
      const playerIdx = currentPlayers.findIndex((p: Player) => p.user_id === data.winner_id);
      if (playerIdx >= 0) {
        const slice = 360 / currentPlayers.length;
        const winnerCenter = -90 + (playerIdx + 0.5) * slice;
        // Угол (0..360), на который надо «довернуть» колесо, чтобы сегмент победителя встал под стрелку.
        const align = (270 - winnerCenter) % 360 || 360;
        const current = spinAngleRef.current;
        const extra = ((align - (current % 360)) + 360) % 360;
        // Всегда прокручиваем вперёд минимум на 4 полных оборота от текущей позиции.
        applySpin(current + 360 * 4 + extra);
      }

      setWinnerId(data.winner_id);
      setTotalPot(data.total_pot);
      setPhase('result');

      if (data.winner_id === userIdRef.current) {
        onUpdateBalance(data.total_pot);
        onToast?.('You take the pot: +' + data.total_pot.toFixed(2) + ' TON', 'success');
      } else {
        onToast?.('Winner ' + data.winner_name + ': +' + data.total_pot.toFixed(2) + ' TON', 'info');
      }
    });
    socket.on('pvp_error', (data: { error: string }) => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      // Ошибка во время ожидания — возвращаем ставку
      if (pendingBetRef.current > 0) {
        onUpdateBalance(pendingBetRef.current);
        pendingBetRef.current = 0;
      }
      setWaitExpired(false);
      setWaitSeconds(15);
      onToast?.(data.error, 'error');
      setPhase('setup');
      setPlayers([]);
      setRoomId(null);
      setIsCreator(false);
      playersRef.current = [];
    });

    socket.on('disconnect', () => {
      if (phaseRef.current === 'waiting' || phaseRef.current === 'spinning') {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        // Отключение во время ожидания — возвращаем ставку
        if (pendingBetRef.current > 0) {
          onUpdateBalance(pendingBetRef.current);
          pendingBetRef.current = 0;
        }
        setWaitExpired(false);
        setWaitSeconds(15);
        onToast?.('Lost connection to server', 'error');
        setPhase('setup');
        setPlayers([]);
        setRoomId(null);
        setIsCreator(false);
        playersRef.current = [];
      }
    });

    socketRef.current = socket;

    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
      socket.disconnect();
    };
  }, []);

  const bet = parseFloat(betInput) || 0;

  const stopCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const startCountdown = () => {
    stopCountdown();
    waitCountRef.current = 15;
    setWaitSeconds(15);
    countdownRef.current = setInterval(() => {
      waitCountRef.current -= 1;
      setWaitSeconds(waitCountRef.current);
      if (waitCountRef.current <= 0) {
        stopCountdown();
        // Соперник не найден за 15 секунд — возвращаем ставку
        if (pendingBetRef.current > 0) {
          onUpdateBalance(pendingBetRef.current);
          pendingBetRef.current = 0;
        }
        setPlayers([]);
        playersRef.current = [];
        setRoomId(null);
        setIsCreator(false);
        setWaitExpired(true);
        setPhase('setup');
        onToast?.('Соперник не найден, ставка возвращена', 'info');
      }
    }, 1000);
  };

  const createGame = () => {
    if (bet <= 0) {
      onToast?.('Enter a valid bet', 'error');
      return;
    }
    if (bet > balance) {
      onToast?.('Not enough TON on balance', 'error');
      return;
    }

    onUpdateBalance(-bet);

    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const userId = String(tgUser?.id ?? '6267608438');
    const username = tgUser?.username || tgUser?.first_name || 'Player';
    userIdRef.current = userId;

    // В рулетке только реальный игрок (себя), ботов нет
    const self: Player = {
      user_id: userId,
      username,
      bet,
      color: '#f43f5e',
    };
    setPlayers([self]);
    playersRef.current = [self];
    pendingBetRef.current = bet;

    // Переходим в ожидание соперника и запускаем таймер на 15 секунд
    setWaitExpired(false);
    setWaitSeconds(15);
    setPhase('waiting');
    startCountdown();

    if (socketRef.current) {
      socketRef.current.emit('join_pvp', {
        user_id: userId,
        username,
        bet,
      });
    }
  };

  const reset = () => {
    stopCountdown();
    pendingBetRef.current = 0;
    setPlayers([]);
    playersRef.current = [];
    setRoomId(null);
    setWinnerId(null);
    applySpin(0);
    setTotalPot(0);
    setIsCreator(false);
    setWaitExpired(false);
    setWaitSeconds(15);
    setPhase('setup');
  };

  const displayPot = totalPot > 0 ? totalPot : players.reduce((sum, p) => sum + p.bet, 0);
return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <h1 style={{ marginTop: 0, marginBottom: 4, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Swords size={22} /> PvP Duel
      </h1>
      <p style={{ color: colors.textMuted, fontSize: 13, marginTop: 0, marginBottom: spacing.lg }}>
        Fight against another player one-on-one!
      </p>

      {(phase === 'spinning' || phase === 'result') && players.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: spacing.lg }}>
          <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
            <div
              style={{
                position: 'absolute',
                top: -2,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '24px solid #ffd700',
                zIndex: 10,
                filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.6))',
              }}
            />

            <svg
              width={SIZE}
              height={SIZE}
              style={{
                transform: 'rotate(' + spinAngle + 'deg)',
                transition: 'transform 4s ease-out',
                willChange: 'transform',
              }}
            >
              {players.map((p, i) => {
                const slice = 360 / players.length;
                const start = i * slice;
                const end = start + slice;
                return (
                  <g key={p.user_id}>
                    <path d={sectorPath(start, end)} fill={p.color} stroke="#1a1a2e" strokeWidth={2} />
                    <text
                      x={CX + ((OUTER_R + INNER_R) / 2) * Math.cos(((start + end) / 2 - 90) * Math.PI / 180)}
                      y={CY + ((OUTER_R + INNER_R) / 2) * Math.sin(((start + end) / 2 - 90) * Math.PI / 180)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={11}
                      fontWeight="bold"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                    >
                      {p.username.length > 8 ? p.username.slice(0, 7) + '...' : p.username}
                    </text>
                  </g>
                );
              })}
              <circle cx={CX} cy={CY} r={INNER_R} fill="#0f0f13" stroke="#333" strokeWidth={2} />
            </svg>
<div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            >
              <div style={{ fontSize: 11, color: colors.textMuted }}>Total Pot</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: colors.gold }}>
                {displayPot.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: colors.textMuted }}>TON</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {players.map((p) => (
              <div
                key={p.user_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  background: winnerId === p.user_id ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                  border: winnerId === p.user_id ? '1px solid #ffd700' : '1px solid transparent',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: p.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: '#fff',
                  }}
                >
                  <User size={14} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 'bold', color: '#fff' }}>
                    {p.username}
                    {winnerId === p.user_id && ' WINNER'}
                  </div>
                  <div style={{ fontSize: 11, color: colors.gold }}>{p.bet.toFixed(2)} TON</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
{phase === 'waiting' && (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid ' + colors.primary,
            borderRadius: 16,
            marginBottom: spacing.lg,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F550;</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: colors.primary }}>
            Ожидание соперника... ({waitSeconds} сек)
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            Your bet: {bet.toFixed(2)} TON
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>
            As soon as another player joins, the duel begins!
          </div>
          {isCreator && roomId && (
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
              Room: {roomId.slice(0, 8)} &bull; You created this match
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <div className="animate-spin inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div
          style={{
            padding: 16,
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid ' + colors.success,
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>&#x1F3C6;</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.gold, marginBottom: 4 }}>
            {players.find((p) => p.user_id === winnerId)?.username} takes the pot!
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.success }}>
            +{displayPot.toFixed(2)} TON
          </div>
        </div>
      )}
{phase === 'setup' && (
        <div
          style={{
            background: colors.bgCard,
            border: '1px solid ' + colors.border,
            borderRadius: 16,
            padding: spacing.md,
          }}
        >
          {waitExpired && (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                textAlign: 'center',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid ' + colors.danger,
                borderRadius: 10,
                fontSize: 13,
                color: colors.danger,
                fontWeight: 'bold',
              }}
            >
              Соперник не найден, ваша ставка возвращена
            </div>
          )}
          <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>Bet (TON)</div>
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
                border: '1px solid ' + colors.border,
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
                  border: '1px solid ' + (bet === val ? colors.borderActive : colors.border),
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
            <span style={{ color: colors.textMuted }}>Balance</span>
            <span style={{ color: colors.gold, fontWeight: 'bold' }}>{balance.toFixed(2)} TON</span>
          </div>
          <Button fullWidth onClick={createGame} size="lg">
            <Swords size={20} /> Find Opponent
          </Button>
        </div>
      )}

      {phase === 'result' && (
        <Button fullWidth variant="ghost" onClick={reset}>
          Play Again
        </Button>
      )}
    </div>
  );
};