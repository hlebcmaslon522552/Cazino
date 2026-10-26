import { initData, useSignal, miniApp } from '@tma.js/sdk-react';

export function useTelegram() {
  const initDataState = useSignal(initData.state);
  const initDataRaw = useSignal(initData.raw);
  const isDark = useSignal(miniApp.isDark);

  const user = initDataState?.user;

  // Haptic / showAlert / openInvoice — всё ещё через глобальный объект,
  // так как SDK их не экспортирует напрямую
  const tg = window.Telegram?.WebApp;

  return {
    user,
    initData: initDataRaw || '',
    theme: isDark ? 'dark' : 'light',
    showAlert: (msg: string) => tg?.showAlert(msg),
    haptic: (style: 'light' | 'medium' | 'heavy' = 'light') => {
      tg?.HapticFeedback?.impactOccurred(style);
    },
    vibrate: (type: 'success' | 'error' | 'warning') => {
      if (type === 'success') tg?.HapticFeedback?.notificationOccurred('success');
      if (type === 'error') tg?.HapticFeedback?.notificationOccurred('error');
      if (type === 'warning') tg?.HapticFeedback?.notificationOccurred('warning');
    },
  };
}

// Типы для window.Telegram (только для haptic / showAlert / openInvoice)
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        colorScheme: 'light' | 'dark';
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        showAlert: (msg: string) => void;
        HapticFeedback?: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
        };
        openInvoice: (url: string, callback: (status: string) => void) => void;
      };
    };
  }
}