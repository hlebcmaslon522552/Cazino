export function useTelegram() {
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;

  return {
    user,
    initData: tg?.initData || '',
    theme: tg?.colorScheme || 'dark',
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

// Типы для window.Telegram
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