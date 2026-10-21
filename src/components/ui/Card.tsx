import { colors, radius } from '../../theme';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  glow?: 'purple' | 'gold' | 'none';
  padding?: string;
}

export function Card({ children, onClick, glow = 'purple', padding = '16px' }: CardProps) {
  const glowStyle =
    glow === 'purple'
      ? { borderColor: colors.borderActive, boxShadow: `0 0 20px ${colors.purpleGlow}` }
      : glow === 'gold'
      ? { borderColor: colors.gold, boxShadow: `0 0 20px rgba(255, 215, 0, 0.4)` }
      : {};

  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding,
        cursor: onClick ? 'pointer' : 'default',
        color: colors.text,
        ...glowStyle,
      }}
    >
      {children}
    </div>
  );
}