import { useState } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { useTelegram } from '../hooks/useTelegram';

interface Props {
  onBack: () => void;
}

const TOTAL_SECTORS = 1000;

function Wheel({ winSectors, totalSectors }: { winSectors: number; totalSectors: number }) {
  const cx = 150, cy = 150, r = 140;
  const paths = [];

  for (let i = 0; i < totalSectors; i++) {
    const a1 = (i / totalSectors) * 360;
    const a2 = ((i + 1) / totalSectors) * 360;
    const isWin = i < winSectors;

    const x1 = cx + r * Math.cos((a1 * Math.PI) / 180);
    const y1 = cy + r * Math.sin((a1 * Math.PI) / 180);
    const x2 = cx + r * Math.cos((a2 * Math.PI) / 180);
    const y2 = cy + r * Math.sin((a2 * Math.PI) / 180);

    paths.push(
      <path
        key={i}
        d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
        fill={isWin ? colors.accent : '#000'}
        stroke="#111"
        strokeWidth={0.3}
      />
    );
  }

  return (
    <svg width="300" height="300" viewBox="0 0 300 300" style={{ filter: `drop-shadow(0 0 20px ${colors.accent}66)` }}>
      {paths}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.borderActive} strokeWidth={3} />
      <circle cx={cx} cy={cy} r={10} fill={colors.primary} />
    </svg>
  );
}

export function WheelPage({ onBack }: Props) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const { haptic, vibrate } = useTelegram();
  const chance = 0.8;

  const winSectors = Math.round(chance * TOTAL_SECTORS);

  const spin = () => {
    if (spinning) return;
    haptic('medium');
    setSpinning(true);
    setResult(null);

    const isWin = Math.random() < chance;
    const targetSector = isWin
      ? Math.floor(Math.random() * winSectors)
      : winSectors + Math.floor(Math.random() * (TOTAL_SECTORS - winSectors));

    const targetAngle = (targetSector / TOTAL_SECTORS) * 360;
    const fullSpins = (5 + Math.floor(Math.random() * 5)) * 360;
    setAngle(angle + fullSpins + (targetAngle - (angle % 360)));

    setTimeout(() => {
      setSpinning(false);
      setResult(isWin ? 'win' : 'lose');
      vibrate(isWin ? 'success' : 'error');
    }, 4000);
  };

  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <Button variant="ghost" onClick={onBack} size="sm">← Назад</Button>

      <h1 style={{ marginTop: 0 }}>🎡 Колесо удачи</h1>
      <p style={{ color: colors.textMuted }}>
        Шанс: <b style={{ color: colors.accent }}>{(chance * 100).toFixed(1)}%</b>
      </p>

      <div style={{
        display: 'flex', justifyContent: 'center', margin: `${spacing.lg} 0`,
        transform: `rotate(${angle}deg)`,
        transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
      }}>
        <Wheel winSectors={winSectors} totalSectors={TOTAL_SECTORS} />
      </div>

      <Button size="lg" fullWidth onClick={spin} disabled={spinning}>
        {spinning ? 'Крутится...' : '🎡 Крутить'}
      </Button>

      {result && (
        <div style={{
          marginTop: spacing.md,
          padding: spacing.md,
          borderRadius: 12,
          textAlign: 'center',
          fontSize: '18px',
          fontWeight: 'bold',
          background: result === 'win' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          color: result === 'win' ? colors.success : colors.danger,
          border: `1px solid ${result === 'win' ? colors.success : colors.danger}`,
        }}>
          {result === 'win' ? '🎉 Выигрыш!' : '💀 Проигрыш'}
        </div>
      )}
    </div>
  );
}