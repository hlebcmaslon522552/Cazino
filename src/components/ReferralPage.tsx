import { useTelegram } from '../hooks/useTelegram';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui/Button';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function ReferralPage({ onBack, onToast }: Props) {
  const { user, haptic } = useTelegram();
  const botUsername = 'GAMERR_777_BOT';
  const refLink = `https://t.me/${botUsername}?startapp=ref_${user?.id || '6267608438'}`;

  const handleCopy = async () => {
    haptic('light');
    try {
      await navigator.clipboard.writeText(refLink);
      haptic('medium');
      onToast('🔗 Ссылка скопирована!', 'success');
    } catch {
      // Fallback для webview, где Clipboard API недоступен
      try {
        const ta = document.createElement('textarea');
        ta.value = refLink;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        haptic('medium');
        onToast('🔗 Ссылка скопирована!', 'success');
      } catch {
        onToast('❌ Не удалось скопировать ссылку', 'error');
      }
    }
  };

  const handleShare = () => {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const userId = tgUser ? tgUser.id : '6267608438';
    const botUsername = 'GAMERR_777_BOT';

    const refLink = `https://t.me/${botUsername}?startapp=ref_${userId}`;
    const shareText = `🎁 Открывай бесплатный кейс — каждые 24 часа!\n\nПолучи +20% к удаче на первое открытие по ссылке ниже 👇`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundImage: `url("${publicUrl('Phon_ref_.png')}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: colors.text,
        padding: spacing.md,
      }}
    >
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Назад
      </Button>

      {/* Карточка с закруглёнными углами */}
      <div
        style={{
          maxWidth: 420,
          margin: `${spacing.lg} auto 0`,
          background: 'rgba(10, 12, 24, 0.85)',
          borderRadius: '24px',
          padding: spacing.lg,
          border: '1px solid rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(6px)',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div style={{ fontSize: 42, lineHeight: 1 }}>🤝</div>
        <h1 style={{ marginTop: 12, marginBottom: 4 }}>Приглашай друзей</h1>
        <p
          style={{
            marginTop: 0,
            marginBottom: spacing.md,
            fontWeight: 'bold',
            color: colors.gold,
          }}
        >
          Получай 10% от пополнений
        </p>

        {/* Реферальная ссылка */}
        <div style={{ textAlign: 'left', marginBottom: spacing.md }}>
          <div
            style={{
              fontSize: 11,
              color: colors.textMuted,
              marginBottom: 6,
              fontWeight: 'bold',
              letterSpacing: 1,
            }}
          >
            ТВОЯ РЕФЕРАЛЬНАЯ ССЫЛКА
          </div>
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              borderRadius: radius.md,
              padding: '12px',
              fontSize: 13,
              wordBreak: 'break-all',
              color: '#8ab4ff',
              fontFamily: 'monospace',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {refLink}
          </div>
        </div>

        <Button variant="primary" size="md" fullWidth onClick={handleCopy}>
          📋 Скопировать
        </Button>

        <div style={{ marginTop: spacing.md }} />

        <img
          src="/RefAd.png"
          alt="Ref Ad"
          className="w-full rounded-xl mb-4"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          style={{ width: '100%', borderRadius: '12px', marginBottom: spacing.md }}
        />

        <Button variant="secondary" size="md" fullWidth onClick={handleShare}>
          🤝 Пригласить
        </Button>

        {/* Статистика */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: spacing.lg,
          }}
        >
          {[
            { value: '0', label: 'Приглашено' },
            { value: '0 TON', label: 'Заработано', gold: true },
            { value: '10%', label: 'Бонус' },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: 16,
                padding: '12px 8px',
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 'bold',
                  color: s.gold ? colors.gold : colors.text,
                }}
              >
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}