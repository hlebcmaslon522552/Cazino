import { colors, radius } from '../../theme';
import { publicUrl } from '../../helpers/publicUrl';

interface BetInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function BetInput({ value, onChange }: BetInputProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '0 16px',
        background: colors.bgCard,
        border: `1.5px solid ${colors.border}`,
        borderRadius: radius.md,
        boxSizing: 'border-box',
      }}
    >
      <img src={publicUrl('TON.png')} alt="TON" style={{ width: 24, height: 24 }} />
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.');
          if (/^\d*\.?\d*$/.test(raw)) {
            e.target.value = raw;
            onChange(e);
          }
        }}
        placeholder="0.1"
        style={{
          flex: 1,
          padding: '14px 0',
          fontSize: 18,
          fontWeight: 'bold',
          background: 'transparent',
          border: 'none',
          color: colors.text,
          outline: 'none',
        }}
      />
      <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 15 }}>
        TON
      </span>
    </div>
  );
}