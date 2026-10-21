import { colors, radius } from '../../theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function Modal({ open, onClose, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#111',
          border: `1px solid ${colors.borderActive}`,
          borderRadius: radius.lg,
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          color: colors.text,
        }}
      >
        {children}
      </div>
    </div>
  );
}