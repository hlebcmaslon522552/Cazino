import { useState } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';

interface Props {
  onBack: () => void;
}

/* --- Хранилище кейсов, добавленных админом --- */
interface CustomCase {
  id: string;
  name: string;
  price: number;
  image: string;
}

function loadCustomCases(): CustomCase[] {
  try {
    const raw = localStorage.getItem('custom_cases');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveCustomCases(list: CustomCase[]) {
  localStorage.setItem('custom_cases', JSON.stringify(list));
}

export function AdminPage({ onBack }: Props) {
  /* -- Начисление баланса -- */
  const [amount, setAmount] = useState('');

  /* -- Добавление нового кейса -- */
  const [caseName, setCaseName] = useState('');
  const [casePrice, setCasePrice] = useState('');

  const inputStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '12px',
    marginBottom: spacing.sm,
    border: `1px solid ${colors.primary}`,
    borderRadius: 12,
    background: colors.bgCard,
    color: colors.text,
    fontSize: 15,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const handleAddBalance = () => {
    const sum = parseFloat(amount);
    if (!sum || sum <= 0) {
      alert('Введите сумму TON больше нуля');
      return;
    }
    const current = parseFloat(localStorage.getItem('fake_balance') || '0');
    const newBalance = current + sum;
    localStorage.setItem('fake_balance', newBalance.toFixed(4));
    setAmount('');
    alert('Начислено ' + sum + ' TON! Текущий баланс: ' + newBalance.toFixed(2) + ' TON');
  };

  const handleClearInventory = () => {
    localStorage.removeItem('inventory');
    alert('Инвентарь очищен!');
  };

  const handleAddCase = () => {
    if (!caseName.trim() || !casePrice.trim()) {
      alert('Заполните название и цену кейса');
      return;
    }
    const price = parseFloat(casePrice);
    if (!price || price <= 0) {
      alert('Цена должна быть больше нуля');
      return;
    }
    const list = loadCustomCases();
    list.push({
      id: 'custom_' + Date.now(),
      name: caseName.trim(),
      price,
      image: '/Cases.png',
    });
    saveCustomCases(list);
    setCaseName('');
    setCasePrice('');
    alert('Кейс добавлен в localStorage!');
  };

  return (
    <div style={{ padding: spacing.md, color: colors.text, paddingBottom: 140 }}>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Назад
      </Button>

      <h1 style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>Панель администратора</h1>

      {/* -- Начисление баланса -- */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: 'bold', letterSpacing: 1 }}>
          БАЛАНС
        </div>
        <input
          type="number"
          step="0.01"
          placeholder="Сумма TON"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={inputStyle}
        />
        <Button fullWidth variant="secondary" onClick={handleAddBalance}>
          Начислить баланс
        </Button>
      </div>

      {/* -- Очистка инвентаря -- */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: 'bold', letterSpacing: 1 }}>
          ИНВЕНТАРЬ
        </div>
        <Button fullWidth variant="danger" onClick={handleClearInventory}>
          Очистить инвентарь
        </Button>
      </div>

      {/* -- Добавление нового кейса -- */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, fontWeight: 'bold', letterSpacing: 1 }}>
          НОВЫЙ КЕЙС
        </div>
        <input
          placeholder="Название кейса"
          value={caseName}
          onChange={(e) => setCaseName(e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          step="0.01"
          placeholder="Цена (TON)"
          value={casePrice}
          onChange={(e) => setCasePrice(e.target.value)}
          style={inputStyle}
        />
        <Button fullWidth onClick={handleAddCase}>
          Добавить кейс
        </Button>
      </div>
    </div>
  );
}
