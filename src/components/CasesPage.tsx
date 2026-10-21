import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Case {
  id: number;
  title: string;
  price: number;
  image: string;
}

const CASES: Case[] = [
  { id: 1, title: 'Villian Box',  price: 12.0, image: '/GOLD.png' },
  { id: 2, title: "Animal's Box", price: 8.0,  image: '/CASE_COPPER.png' },
  { id: 3, title: 'Lovely',       price: 11.0, image: '/Silver.png' },
  { id: 4, title: 'Bloom',        price: 6.0,  image: '/CaseWOOD.png' },
];

export function CasesPage({ onBack, onToast }: Props) {
  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <Button variant="ghost" onClick={onBack} size="sm">← Назад</Button>

      <h1 style={{ marginTop: spacing.md }}>🎁 Кейсы</h1>
      <p style={{ color: colors.textMuted, marginTop: spacing.xs }}>Выбери кейс для открытия</p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginTop: spacing.md,
        }}
      >
        {CASES.map((c) => (
          <div
            key={c.id}
            onClick={() => onToast(`Кейс выбран: ${c.title}`, 'info')}
            style={{
              background: '#1a1a1a',
              borderRadius: 16,
              padding: 12,
              cursor: 'pointer',
            }}
          >
            <img
              src={c.image}
              alt={c.title}
              style={{
                width: '100%',
                aspectRatio: '1',
                objectFit: 'cover',
                borderRadius: 16,
                background: '#000',
              }}
            />
            <div style={{ marginTop: 10, color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>
              {c.title}
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <img src={publicUrl('TON.png')} alt="TON" style={{ width: 16, height: 16 }} />
              <span style={{ color: colors.text, fontWeight: 'bold', fontSize: 14 }}>
                {c.price.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}