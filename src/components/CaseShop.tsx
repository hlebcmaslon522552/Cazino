import { useState } from 'react';
import { colors } from '../theme';
import { Button } from './ui/Button';
import { publicUrl } from '../helpers/publicUrl';

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
}

const CASES_RAW: { id: string; name: string; price: number; image: string }[] = [
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

export function CaseShop({ onBack, onOpenCase }: Props) {
  const [allCases] = useState<CaseItem[]>(loadAllCases);
  const handleSelect = (c: CaseItem) => {
    onOpenCase(c);
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
              border: `1px solid ${colors.border}`,
              transition: 'transform 0.15s, border-color 0.15s',
            }}
          >
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
            {/* Цена с иконкой TON */}
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
          </div>
        ))}
      </div>
    </div>
  );
}