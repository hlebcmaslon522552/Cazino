import { colors, gradients, radius } from '../../theme';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled = false, loading = false, fullWidth = false,
}: ButtonProps) {
  const base: React.CSSProperties = {
    border: 'none',
    borderRadius: radius.md,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontWeight: 'bold',
    transition: 'opacity 0.15s, transform 0.1s',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: fullWidth ? '100%' : 'auto',
  };

  const sizes = {
    sm: { padding: '8px 12px', fontSize: '13px' },
    md: { padding: '12px 18px', fontSize: '15px' },
    lg: { padding: '18px 24px', fontSize: '18px' },
  };

  const variants: Record<string, React.CSSProperties> = {
    primary: {
      background: disabled || loading ? '#333' : gradients.primary,
      color: '#fff',
    },
    secondary: {
      background: colors.bgCardActive,
      color: colors.primary,
      border: `1px solid ${colors.primary}`,
    },
    danger: {
      background: 'rgba(239, 68, 68, 0.15)',
      color: colors.danger,
      border: `1px solid ${colors.danger}`,
    },
    ghost: {
      background: 'transparent',
      color: colors.textMuted,
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ ...base, ...sizes[size], ...variants[variant] }}
    >
      {loading ? '⏳' : children}
    </button>
  );
}