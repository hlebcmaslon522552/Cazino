import { useEffect, useState } from 'react';
import { colors, radius } from '../../theme';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 2500, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const color = {
    success: colors.success,
    error: colors.danger,
    info: colors.primary,
  }[type];

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      padding: '12px 20px',
      background: '#111',
      border: `1px solid ${color}`,
      borderRadius: radius.md,
      color: '#fff',
      fontSize: '14px',
      boxShadow: `0 0 20px ${color}44`,
      maxWidth: '90%',
    }}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const show = (message: string, type: 'success' | 'error' | 'info' = 'info') => setToast({ message, type });
  const hide = () => setToast(null);

  return {
    toast,
    show,
    hide,
    render: toast ? <Toast message={toast.message} type={toast.type} onClose={hide} /> : null,
  };
}