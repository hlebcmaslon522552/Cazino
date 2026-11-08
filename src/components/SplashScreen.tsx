import { useState, useEffect } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

const messages = [
  "Загружаем картинки...",
  "Настраиваем сервер...",
  "Подключаем вас...",
  "Почти готово..."
];

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Меняем текст каждые 1.2 секунды
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, 1200);

    // Имитация прогресса (заполняется за 4 секунды)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 100;
        const next = prev + Math.random() * 15; // Случайный прирост для реализма
        return next > 100 ? 100 : next;
      });
    }, 300);

    // По завершении загрузки вызываем onComplete
    const timer = setTimeout(() => {
      setProgress(100);
      setTimeout(onComplete, 500); // Небольшая задержка перед скрытием
    }, 4000);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#0a0a0f',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: 24,
    }}>
      {/* Логотип/Иконка */}
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: 'linear-gradient(135deg, #a855f7, #3b82f6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, marginBottom: 32,
        boxShadow: '0 0 40px rgba(168, 85, 247, 0.4)'
      }}>
        🎰
      </div>

      {/* Спиннер */}
      <div style={{
        width: 48, height: 48,
        border: '4px solid rgba(168, 85, 247, 0.3)',
        borderTopColor: '#a855f7',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: 32,
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Текст */}
      <div style={{
        color: '#fff', fontSize: 18, fontWeight: 'bold',
        marginBottom: 16, textAlign: 'center',
        minHeight: 24, // Чтобы текст не "прыгал"
      }}>
        {messages[messageIndex]}
      </div>

      {/* Прогресс-бар */}
      <div style={{
        width: '80%', maxWidth: 300, height: 8,
        background: 'rgba(255,255,255,0.1)', borderRadius: 4,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          background: 'linear-gradient(90deg, #a855f7, #3b82f6)',
          borderRadius: 4,
          transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ color: '#6b7280', fontSize: 12 }}>
        {Math.round(progress)}%
      </div>
    </div>
  );
}