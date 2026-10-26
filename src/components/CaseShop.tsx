import { useState, useRef } from 'react';
import { colors } from '../theme';
import { Button } from './ui/Button';
import { publicUrl } from '../helpers/publicUrl';
import { useTelegram } from '../hooks/useTelegram';
import { CONFIG } from '../config';

interface Props {
  onBack: () => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenCase: (caseData: CaseItem) => void;
}

export interface CaseItem {
  id: string;
  name: string;
  price: number;
  image: string;
  isFree?: boolean;
}

const CASES_RAW: { id: string; name: string; price: number; image: string; isFree?: boolean }[] = [
  { id: "case_free", name: "Бонусный кейс", image: "NO_Inventory.png", price: 0, isFree: true },
  { id: "case_wood", name: "Деревянный кейс", image: "CaseWOOD.png", price: 1.00 },
  { id: "case_copper", name: "Медный кейс", image: "CASE_COPPER.png", price: 5.00 },
  { id: "case_silver", name: "Серебряный кейс", image: "Silver.png", price: 10.00 },
  { id: "case_gold", name: "Золотой кейс", image: "GOLD.png", price: 50.00 }
];

const CASES_FALLBACK = publicUrl('NO_Inventory.png');

function caseWithUrl(raw: typeof CASES_RAW[number]): CaseItem {
  return { ...raw, image: publicUrl(raw.image) };
}

const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.src = CASES_FALLBACK;
};

/* Загружаем кейсы, добавленные через админ-панель (localStorage) */
function loadAllCases(): CaseItem[] {
  const base = CASES_RAW.map(caseWithUrl);
  try {
    const raw = localStorage.getItem('custom_cases');
    if (raw) {
      const custom = JSON.parse(raw);
      if (Array.isArray(custom) && custom.length > 0) {
        return [...base, ...custom];
      }
    }
  } catch { /* ignore */ }
  return base;
}

const FREE_CONDITIONS_KEY = 'case_conditions_met';
const SHARE_COUNT_KEY = 'free_case_shares';
const SHARES_NEEDED = 3;
const TG_CHANNEL = '@cazino_channel';
const TG_CHANNEL_LINK = 'https://t.me/cazino_channel';

export function CaseShop({ onBack, onOpenCase, onToast }: Props) {
  const [allCases] = useState<CaseItem[]>(loadAllCases);
  const { user, haptic } = useTelegram();
  const [showFreeModal, setShowFreeModal] = useState(false);
  const [shareCount, setShareCount] = useState(() => {
    try { return parseInt(localStorage.getItem(SHARE_COUNT_KEY) || '0', 10); } catch { return 0; }
  });
  const [subscribed, setSubscribed] = useState(false);
  const checkingSub = useRef(false);

  const conditionsMet = shareCount >= SHARES_NEEDED && subscribed;

  const handleSelect = (c: CaseItem) => {
    if (c.isFree) {
      // Проверяем, выполнял ли пользователь условия ранее
      try {
        const met = localStorage.getItem(FREE_CONDITIONS_KEY);
        if (met === 'true') {
          onOpenCase(c);
          return;
        }
      } catch { /* ignore */ }
      setShowFreeModal(true);
    } else {
      onOpenCase(c);
    }
  };

  const handleShare = () => {
    haptic('light');
    const userId = user?.id ?? '6267608438';
    const botUsername = 'GAMERR_777_BOT';
    const refLink = `https://t.me/${botUsername}?startapp=ref_${userId}`;
    const shareText = `🎁 Забирай бесплатный кейс в Cazino! Переходи по ссылке 👇`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }

    const newCount = shareCount + 1;
    setShareCount(newCount);
    try {
      localStorage.setItem(SHARE_COUNT_KEY, String(newCount));
    } catch { /* ignore */ }
  };

  const handleSubscribe = () => {
    haptic('light');
    // Открываем канал
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(TG_CHANNEL_LINK);
    } else {
      window.open(TG_CHANNEL_LINK, '_blank');
    }
    // Проверяем подписку
    checkSubscription();
  };

  const checkSubscription = async () => {
    if (checkingSub.current) return;
    checkingSub.current = true;
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/check_subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ user_id: String(user?.id ?? '6267608438') })
      });
      const data = await res.json();
      if (data.subscribed) {
        setSubscribed(true);
        onToast?.('✅ Подписка подтверждена!', 'success');
      }
    } catch (e) {
      console.error('[checkSubscription] error:', e);
    } finally {
      checkingSub.current = false;
    }
  };

  const handleClaimFreeCase = () => {
    if (!conditionsMet) return;
    try {
      localStorage.setItem(FREE_CONDITIONS_KEY, 'true');
    } catch { /* ignore */ }
    haptic('medium');
    setShowFreeModal(false);
    const freeCase = allCases.find(c => c.id === 'case_free');
    if (freeCase) onOpenCase(freeCase);
  };

  return (
    <div style={{ padding: '16px', color: colors.text }}>
      {/* Назад */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Назад
      </Button>

      <h1 style={{ marginTop: 0, marginBottom: 4 }}>🎁 Витрина кейсов</h1>
      <p style={{ color: colors.textMuted, marginTop: 0, fontSize: 13 }}>
        Выбери кейс и открой его с NFT внутри
      </p>

      {/* Сетка кейсов */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          marginTop: '16px',
        }}
      >
        {allCases.map((c) => (
          <div
            key={c.id}
            onClick={() => handleSelect(c)}
            style={{
              background: '#1c1c1e',
              borderRadius: '16px',
              padding: '16px',
              textAlign: 'center',
              cursor: 'pointer',
              border: c.isFree ? '1px solid #22c55e' : `1px solid ${colors.border}`,
              transition: 'transform 0.15s, border-color 0.15s',
              position: 'relative',
            }}
          >
            {/* FREE badge */}
            {c.isFree && (
              <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: '#22c55e',
                color: '#000',
                fontSize: 10,
                fontWeight: 'bold',
                padding: '2px 8px',
                borderRadius: 8,
                letterSpacing: 1,
              }}>
                FREE
              </div>
            )}
            {/* Сундук */}
            <img
              src={c.image}
              alt={c.name}
              onError={handleImgError}
              style={{
                width: '100%',
                objectFit: 'contain',
                aspectRatio: '4 / 3',
              }}
            />
            {/* Название */}
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 10 }}>
              {c.name}
            </div>
            {/* Цена */}
            {c.isFree ? (
              <div
                style={{
                  color: '#22c55e',
                  fontSize: 14,
                  fontWeight: 'bold',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                🆓 FREE
              </div>
            ) : (
              <div
                style={{
                  color: colors.gold,
                  fontSize: 14,
                  fontWeight: 'bold',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <img
                  src={publicUrl('TON.png')}
                  alt="TON"
                  style={{ width: 16, height: 16, objectFit: 'contain' }}
                />
                {c.price.toFixed(2)} TON
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Free Case Conditions Modal */}
      {showFreeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowFreeModal(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a2e',
              border: '1px solid #22c55e',
              borderRadius: 24,
              padding: 24,
              width: '90%',
              maxWidth: 380,
              color: '#fff',
            }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 }}>
              🎁 Бонусный кейс
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginBottom: 20 }}>
              Выполните условия, чтобы открыть бесплатный кейс
            </p>

            {/* Condition 1: Share */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 16,
              marginBottom: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: shareCount >= SHARES_NEEDED ? '#22c55e' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {shareCount >= SHARES_NEEDED ? '✅' : '📤'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
                  Отправьте {SHARES_NEEDED} друзьям
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {shareCount >= SHARES_NEEDED ? 'Готово ✓' : `${shareCount}/${SHARES_NEEDED}`}
                </div>
              </div>
              {shareCount < SHARES_NEEDED && (
                <button onClick={handleShare} style={{
                  background: '#22c55e',
                  color: '#000',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                }}>
                  Поделиться
                </button>
              )}
            </div>

            {/* Condition 2: Subscribe */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 16,
              marginBottom: 20,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: subscribed ? '#22c55e' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {subscribed ? '✅' : '📢'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>
                  Подпишитесь на канал {TG_CHANNEL}
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {subscribed ? 'Подписка подтверждена ✓' : 'Нажмите кнопку'}
                </div>
              </div>
              {!subscribed && (
                <button onClick={handleSubscribe} style={{
                  background: '#229ed9',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 16px',
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                }}>
                Подписаться
              </button>
              )}
            </div>

            {/* Claim button */}
            <button
              onClick={handleClaimFreeCase}
              disabled={!conditionsMet}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                fontWeight: 'bold',
                fontSize: 16,
                border: 'none',
                cursor: conditionsMet ? 'pointer' : 'not-allowed',
                background: conditionsMet ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#374151',
                color: conditionsMet ? '#000' : '#9ca3af',
                transition: 'all 0.2s',
                marginBottom: 8,
              }}
            >
              {conditionsMet ? '🎉 Я выполнил — открыть кейс!' : '✅ Выполните условия'}
            </button>

            <button
              onClick={() => setShowFreeModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: 14,
                fontWeight: 'bold',
                fontSize: 13,
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                color: '#6b7280',
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}