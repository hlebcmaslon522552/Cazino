import { useState } from 'react';
import { Coins, Plus, User, Trophy } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';

interface PvPPageProps {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Player {
  id: number;
  name: string;
  bet: number;
  color: string;
}

type Phase = 'setup' | 'spinning' | 'result';

// Геометрия рулетки
const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 132;
const INNER_R = 56;

const SLICE_COLORS = [
  '#f43f5e',
  '#8b5cf6',
  '#22c55e',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
  '#10b981',
  '#f97316',
];

const BOT_NAMES = [
  'CryptoMax',
  'TonKiller',
  'Shadow99',
  'PixelWolf',
  'NeonGhost',
  'LuckyLord',
  'BullRider',
  'DarkAce',
];

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
    `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)}`,
    `L ${i2.x.toFixed(2)} ${i2.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    'Z',
  ].join(' ');
};

export const PvPPage = ({ balance, onUpdateBalance, onToast }: PvPPageProps) => {
  const [betInput, setBetInput] = useState('1.0');
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [spinAngle, setSpinAngle] = useState(0);
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const bet = parseFloat(betInput) || 0;
  const totalPot = players.reduce((sum, p) => sum + p.bet, 0);

  const spin = () => {
    setPhase('spinning');
    setWinnerId(null);

    // Случайный победитель из списка игроков
    const winnerIdx = Math.floor(Math.random() * players.length);
    const winner = players[winnerIdx];

    // Центр сектора победителя должен оказаться под стрелкой (верх, -90°)
    const slice = 360 / players.length;
    const winnerCenter = -90 + (winnerIdx + 0.5) * slice;
    const target = 360 * (3 + Math.floor(Math.random() * 2)) + (270 - winnerCenter);
    setSpinAngle(target);

    // По истечении анимации начисляем банк победителю
    setTimeout(() => {
      onUpdateBalance(totalPot);
      setWinnerId(winner.id);
      setPhase('result');
      if (winner.id === 0) {
        onToast?.('🎉 Победа! Вы забираете банк: +' + totalPot.toFixed(2) + ' TON', 'success');
      } else {
        onToast?.('Победил ' + winner.name + ': +' + totalPot.toFixed(2) + ' TON', 'info');
      }
    }, 3600);
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

    // Списываем ставку игрока
    onUpdateBalance(-bet);

    // Игрок + случайные соперники (для наглядности рулетки)
    const botsCount = 2 + Math.floor(Math.random() * 3); // 2-4 соперника
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, botsCount);

    const roster: Player[] = [
      { id: 0, name: 'Вы', bet, color: SLICE_COLORS[0] },
      ...names.map((name, i) => ({
        id: i + 1,
        name,
        bet: Math.max(0.5, Math.round((0.5 + Math.random() * 4) * 10) / 10),
        color: SLICE_COLORS[(i + 1) % SLICE_COLORS.length],
      })),
    ];
    setPlayers(roster);

    // Небольшая задержка, чтобы сектора отрисовались, затем вращение
    setTimeout(spin, 350);
  };

  const reset = () => {
    setPlayers([]);
    setSpinAngle(0);
    setWinnerId(null);
    setPhase('setup');
  };

  // --- Построение секторов рулетки ---
  const slices = players.length > 0 ? players.length : 1;
  const sliceAngle = 360 / slices;

  return (
    <div style={{ padding: spacing.md, color: colors.text, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
        ⚔️ PvP Рулетка
      </h1>
      <p style={{ textAlign: 'center', color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>
        Сделайте ставку в TON и заберите весь банк!
      </p>

      {/* Рулетка со стрелкой */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent',
            borderTop: '65px solid #111111',
            marginBottom: -4,
            zIndex: 2,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
          }}
        />

        <div style={{ position: 'relative' }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            {/* Фон круга */}
            <circle cx={CX} cy={CY} r={OUTER_R + 10} fill="#1a1a2e" stroke="rgba(139,92,246,0.35)" strokeWidth={2} />

            {/* Сектора */}
            {Array.from({ length: slices }).map((_, i) => (
              <path
                key={i}
                d={sectorPath(-90 + i * sliceAngle, -90 + (i + 1) * sliceAngle)}
                fill={players[i] ? players[i].color : colors.bgCardActive}
                stroke="#0f0f1a"
                strokeWidth={3}
              />
            ))}

            {/* Пометки секторов */}
            {players.length > 0 &&
              Array.from({ length: players.length }).map((_, i) => {
                const mid = -90 + (i + 0.5) * sliceAngle;
                const pos = polar(mid, (OUTER_R + INNER_R) / 2);
                return (
                  <text
                    key={i}
                    x={pos.x}
                    y={pos.y}
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight="bold"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ pointerEvents: 'none' }}
                  >
                    {i === 0 ? 'Вы' : players[i].name.slice(0, 5)}
                  </text>
                );
              })}
          </svg>

          {/* Вращающаяся часть рулетки (сектора поверх неподвижной стрелки) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `rotate(${spinAngle}deg)`,
              transition:
                phase === 'spinning'
                  ? 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
                  : 'none',
              willChange: 'transform',
            }}
          >
            {/* Центр — Total Pot */}
            <div
              style={{
                width: INNER_R * 2,
                height: INNER_R * 2,
                borderRadius: '50%',
                background: '#14141f',
                border: `2px solid ${colors.gold}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 18px rgba(139, 92, 246, 0.4)',
              }}
            >
              <div style={{ color: colors.textMuted, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
                Total Pot
              </div>
              <div style={{ color: colors.gold, fontSize: 18, fontWeight: 900 }}>
                {totalPot.toFixed(2)}
              </div>
              <div style={{ color: colors.gold, fontSize: 11, fontWeight: 'bold' }}>TON</div>
            </div>
          </div>
        </div>
      </div>


      {/* Список игроков */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>Игроки ({players.length})</div>
        {players.length === 0 ? (
          <div
            style={{
              padding: 16,
              background: colors.bgCard,
              border: `1px solid ${colors.border}`,
              borderRadius: 16,
              textAlign: 'center',
              color: colors.textMuted,
              fontSize: 13,
            }}
          >
            Пока никто не сделал ставку. Создайте игру!
          </div>
        ) : (
          players.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 10,
                marginBottom: 8,
                background: colors.bgCard,
                border: winnerId === p.id ? `1px solid ${colors.gold}` : `1px solid ${colors.border}`,
                borderRadius: 14,
                boxShadow: winnerId === p.id ? '0 0 20px rgba(255, 215, 0, 0.4)' : 'none',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: p.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {winnerId === p.id ? (
                  <Trophy size={20} color="#111" />
                ) : (
                  <User size={20} color="#111" />
                )}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ color: colors.textMuted, fontSize: 12 }}>Ставка</div>
              </div>
              <div style={{ color: colors.gold, fontWeight: 'bold', fontSize: 14 }}>
                {p.bet.toFixed(2)} TON
              </div>
              {winnerId === p.id && (
                <div style={{ color: colors.gold, fontWeight: 'bold', fontSize: 12, background: 'rgba(255,215,0,0.15)', borderRadius: 8, padding: '4px 8px' }}>
                  ПОБЕДИТЕЛЬ
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Статус вращения / результат */}
      {phase === 'spinning' && (
        <div style={{ textAlign: 'center', color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>
          🎡 Рулетка вращается...
        </div>
      )}
      {phase === 'result' && (
        <div
          style={{
            padding: 16,
            background: 'rgba(34,197,94,0.12)',
            border: `1px solid ${colors.success}`,
            borderRadius: 16,
            textAlign: 'center',
            marginBottom: 16,
            color: colors.success,
            fontWeight: 'bold',
          }}
        >
          🏆 {players.find((p) => p.id === winnerId)?.name} забирает банк: +{totalPot.toFixed(2)} TON
        </div>
      )}

      {/* Ввод ставки и создание игры */}
      {phase === 'setup' && (
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

      {/* Результат — сыграть ещё */}
      {phase === 'result' && (
        <Button fullWidth variant="ghost" onClick={reset}>
          Сыграть ещё
        </Button>
      )}
    </div>
  );
};

