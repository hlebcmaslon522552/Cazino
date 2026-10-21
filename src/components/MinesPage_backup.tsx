import { useState, type CSSProperties } from 'react';
import { Player as LottiePlayer } from '@lottiefiles/react-lottie-player';
import { useState, type CSSProperties } from 'react';
import { useState, type CSSProperties } from 'react';
import { Player as LottiePlayer } from '@lottiefiles/react-lottie-player';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { useTelegram } from '../hooks/useTelegram';

/* ===================================================================
   Интерфейсы и мок-данные
   =================================================================== */

interface Nft {
  id: number;
  name: string;
  price: number;
  image: string;
}

const MOCK_NFTS: Nft[] = [
  { id: 1, name: 'Plush Pepe',   price: 5.2,  image: 'https://nft.fragment.com/gift/plushpepe-1.large.jpg' },
  { id: 2, name: 'Hex Pot',      price: 3.8,  image: 'https://nft.fragment.com/gift/hexpot-1.large.jpg' },
  { id: 3, name: 'Astral Shard', price: 12.4, image: 'https://nft.fragment.com/gift/astralshard-1.large.jpg' },
  { id: 4, name: 'Loot Bag',     price: 8.1,  image: 'https://nft.fragment.com/gift/lootbag-1.large.jpg' },
  { id: 5, name: 'Jolly Chimp',  price: 6.3,  image: 'https://nft.fragment.com/gift/jollychimp-1.large.jpg' },
];

/* ===================================================================
   Константы
   =================================================================== */

const TON_AMOUNTS = [1, 5, 10];
const BOMB_DELAY = 400;       // сначала 0.4 с показываем 💣, потом 💥
const MULTIPLIER_STEP = 0.2;  // +0.2x за каждую безопасную клетку
const CASHOUT_FEE = 0.95;     // небольшой маржинальный коэффициент

interface Difficulty {
  id: string;
  label: string;
  size: number;
  mines: number;
}

const DIFFICULTIES: Difficulty[] = [
  { id: '3x3',   label: '3 × 3',   size: 3,  mines: 1 },
  { id: '9x9',   label: '9 × 9',   size: 9,  mines: 10 },
  { id: '12x12', label: '12 × 12', size: 12, mines: 20 },
];

/* ===================================================================
   Страница «Мины»
   =================================================================== */

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Phase = 'setup' | 'playing' | 'won' | 'lost';

export function MinesPage({ onBack, onToast }: Props) {
  const { haptic, vibrate } = useTelegram();

  /* ── Ставка (как в Апгрейдере) ─────────── */
  const [betType, setBetType] = useState<'ton' | 'nft'>('ton');
  const [tonAmount, setTonAmount] = useState(1);
  const [betNft, setBetNft] = useState<Nft | null>(null);
  const [betModalOpen, setBetModalOpen] = useState(false);

  /* ── Сложность ──────────────────────────── */
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);

  /* ── Игровое состояние ──────────────────── */
  const [phase, setPhase] = useState<Phase>('setup');
  const [mineIndexes, setMineIndexes] = useState<number[]>([]);
  const [openSafe, setOpenSafe] = useState<number[]>([]);
  const [openMines, setOpenMines] = useState<number[]>([]);
  const [bombCell, setBombCell] = useState<number | null>(null);
  const [bombStage, setBombStage] = useState<'bomb' | 'boom' | null>(null);

  /* ── Производные значения ───────────────── */
  const totalCells = difficulty.size * difficulty.size;
  const safeTotal = totalCells - difficulty.mines;
  const stakePrice = betType === 'ton' ? tonAmount : (betNft?.price ?? 0);
  const multiplier = 1 + openSafe.length * MULTIPLIER_STEP;
  const potentialWin = stakePrice * multiplier * CASHOUT_FEE;
  const money = betType === 'ton' ? `${tonAmount} TON` : `${betNft?.price.toFixed(2) ?? '–'} TON`;

  const canStart = phase === 'setup' && stakePrice > 0;
  const canCashout = phase === 'playing' && openSafe.length > 0;

  /* ── Старт игры: расставляем мины случайно ─ */
  const startGame = () => {
    if (stakePrice <= 0 || difficulty.mines >= totalCells) return;
    haptic('medium');

    const cells = Array.from({ length: totalCells }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    setMineIndexes(cells.slice(0, difficulty.mines));
    setOpenSafe([]);
    setOpenMines([]);
    setBombCell(null);
    setBombStage(null);
    setPhase('playing');
  };

  /* ── Клик по клетке ─────────────────────── */
  const handleCellClick = (index: number) => {
    if (phase !== 'playing' || bombStage !== null) return;
    if (openSafe.includes(index) || openMines.includes(index)) return;

    // Мина: 💣 → 0.4 с → 💥 → проигрыш
    if (mineIndexes.includes(index)) {
      haptic('heavy');
      setBombCell(index);
      setBombStage('bomb');

      window.setTimeout(() => {
        setBombStage('boom');
        setOpenMines(mineIndexes); // показываем все мины
        vibrate('error');
        onToast('💥 BOOM!', 'error');
        setPhase('lost');
      }, BOMB_DELAY);
      return;
    }

    // Безопасная клетка: 💎 и +0.2x к множителю
    haptic('light');
    const next = [...openSafe, index];
    setOpenSafe(next);

    if (next.length === safeTotal) {
      const win = stakePrice * (1 + next.length * MULTIPLIER_STEP) * CASHOUT_FEE;
      vibrate('success');
      onToast(`🎉 Все клетки открыты! Выигрыш ${win.toFixed(2)} TON`, 'success');
      setPhase('won');
    }
  };

  /* ── Забрать приз ───────────────────────── */
  const cashout = () => {
    if (!canCashout) return;
    haptic('medium');
    vibrate('success');
    onToast(`🎉 Вы забрали ${potentialWin.toFixed(2)} TON!`, 'success');
    setPhase('won');
  };

  /* ── Визуал клетки ──────────────────────── */
  const cellFont = difficulty.size <= 3 ? 22 : difficulty.size <= 9 ? 15 : 11;
  const cellGap = difficulty.size >= 9 ? 4 : 8;
  const cellRadius = difficulty.size >= 9 ? 4 : 8;

  const renderCell = (index: number) => {
    const isBombCell = bombCell === index;
    const isMine = openMines.includes(index);
    const isSafe = openSafe.includes(index);
    const closed = !isBombCell && !isMine && !isSafe;

    let icon = '';
    let background = '';
    let border = '';
    let animation: string | undefined;
    let cursor: CSSProperties['cursor'] = 'default';

    if (closed) {
      // Закрытая клетка: чёрный квадрат с фиолетовой обводкой и градиентом к краям
      icon = '';
      background = 'radial-gradient(circle, #1a1a1a, #000)';
      border = `1px solid ${colors.primary}`;
      cursor = phase === 'playing' ? 'pointer' : 'default';
    } else if (isBombCell && bombStage === 'boom') {
      // Взрыв 💥
      icon = '💥';
      background = 'radial-gradient(circle, #ff8c00, #7f1d1d)';
      border = `1px solid ${colors.accent}`;
      animation = 'mn-boom 0.5s ease-out';
    } else if (isBombCell) {
      // Бомба 💣 (первые 0.4 секунды)
      icon = '💣';
      background = 'radial-gradient(circle, #3f3f46, #111)';
      border = `1px solid ${colors.accent}`;
      animation = 'mn-pop 0.25s ease-out';
    } else if (isMine) {
      // Остальные мины уже после взрыва
      icon = '💣';
      background = 'radial-gradient(circle, #3f3f46, #09090b)';
      border = '1px solid #71717a';
    } else if (isSafe) {
      // Открытая безопасная клетка: зелёный фон + 💎
      icon = '💎';
      background = 'radial-gradient(circle, #22c55e, #15803d)';
      border = `1px solid ${colors.success}`;
      animation = 'mn-pop 0.25s ease-out';
    }

    return (
      <div
        key={index}
        onClick={() => handleCellClick(index)}
        style={{
          aspectRatio: '1',
          borderRadius: cellRadius,
          border,
          background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: cellFont,
          cursor,
          animation,
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {icon}
      </div>
    );
  };

  return (
    <>
      {/* Анимации */}
      <style>{`
        @keyframes mn-pop {
          from { transform: scale(0.4); opacity: 0.4; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes mn-boom {
          0%   { transform: scale(0.5); opacity: 0.5; }
          50%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div style={{ padding: spacing.md, color: colors.text, paddingBottom: 120, userSelect: 'none' }}>
        {/* Шапка */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Button variant="ghost" size="sm" onClick={onBack}>← Назад</Button>
          <div style={{ fontSize: 14, color: colors.textMuted }}>
            Баланс: <span style={{ color: colors.gold, fontWeight: 'bold' }}>15.00 TON</span>
          </div>
        </div>

        {/* Заголовок */}
        <div style={{ textAlign: 'center', marginBottom: spacing.md }}>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, letterSpacing: 1 }}>
            💣 Мины
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
            Открывай безопасные клетки, собирай множитель и забирай приз!
          </div>
        </div>

        {/* ═══════ ЭКРАН НАСТРОЕК ═══════ */}
        {phase === 'setup' && (
          <>
            {/* Ставка */}
            <Card padding="14px" glow="purple">
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
                СТАВКА
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
                <Button variant={betType === 'ton' ? 'primary' : 'ghost'} size="sm" onClick={() => { setBetType('ton'); haptic('light'); }}>💰 TON</Button>
                <Button variant={betType === 'nft' ? 'primary' : 'ghost'} size="sm" onClick={() => { setBetType('nft'); haptic('light'); }}>🎴 NFT</Button>
              </div>

              {betType === 'ton' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {TON_AMOUNTS.map((amount) => (
                    <div key={amount} style={{ flex: 1, minWidth: 0 }}>
                      <Button
                        fullWidth
                        variant={tonAmount === amount ? 'primary' : 'secondary'}
                        onClick={() => { setTonAmount(amount); haptic('light'); }}
                      >
                        {amount} TON
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => { setBetModalOpen(true); haptic('light'); }}
                >
                  {betNft ? `🔄 Сменить NFT (${betNft.price.toFixed(2)} TON)` : '🎴 Выбрать NFT для ставки'}
                </Button>
              )}
            </Card>

            {/* Сложность */}
            <div style={{ marginTop: spacing.md }}>
              <Card padding="14px" glow="purple">
                <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8, fontWeight: 'bold', letterSpacing: 1 }}>
                  СЛОЖНОСТЬ
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {DIFFICULTIES.map((d) => (
                    <div key={d.id} style={{ flex: 1, minWidth: 0 }}>
                      <Button
                        fullWidth
                        variant={difficulty.id === d.id ? 'primary' : 'secondary'}
                        onClick={() => { setDifficulty(d); haptic('light'); }}
                      >
                        {d.label}
                      </Button>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 8 }}>
                  Клеток: {totalCells} · Мины: {difficulty.mines}
                </div>
              </Card>
            </div>

            {/* Старт */}
            <div style={{ marginTop: spacing.lg }}>
              <Button size="lg" fullWidth onClick={startGame} disabled={!canStart}>
                💣 Начать игру
              </Button>
              {!canStart && (
                <div style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
                  {betType === 'nft' && !betNft ? 'Выберите NFT для ставки' : 'Выберите ставку, чтобы начать'}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════ ИГРОВОЙ ЭКРАН ═══════ */}
        {phase !== 'setup' && (
          <>
            {/* Статус: множитель и потенциальный выигрыш */}
            {phase === 'playing' && (
              <Card padding="12px 14px" glow="purple">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: colors.textMuted }}>Множитель</div>
                    <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.accent }}>
                      ×{multiplier.toFixed(1)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: colors.textMuted }}>Потенциальный выигрыш</div>
                    <div style={{ fontSize: 22, fontWeight: 'bold', color: colors.gold }}>
                      {potentialWin.toFixed(2)} TON
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, textAlign: 'center' }}>
                  Ставка: <b>{money}</b> · Мины: <b>{difficulty.mines}</b> · Открыто: <b>{openSafe.length}/{safeTotal}</b>
                </div>
              </Card>
            )}

            {/* Поле */}
            <div style={{ marginTop: spacing.md }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${difficulty.size}, 1fr)`,
                gap: `${cellGap}px`,
                maxWidth: 460,
                margin: '0 auto',
              }}>
                {Array.from({ length: totalCells }, (_, i) => renderCell(i))}
              </div>
            </div>

            {/* Кнопка «Забрать приз» */}
            {phase === 'playing' && (
              <div style={{ marginTop: spacing.lg }}>
                <Button size="lg" fullWidth onClick={cashout} disabled={!canCashout}>
                  💎 Забрать приз
                </Button>
                <div style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
                  Каждая безопасная клетка даёт +0.2x к множителю
                </div>
              </div>
            )}

            {/* Результат */}
            {phase === 'won' && (
              <div style={{
                marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, textAlign: 'center',
                background: 'rgba(34,197,94,0.15)', border: `1px solid ${colors.success}`,
              }}>
                <div style={{ fontSize: 26 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.success, marginTop: 4 }}>
                  Вы забрали {potentialWin.toFixed(2)} TON!
                </div>
              </div>
            )}
            {phase === 'lost' && (
              <div style={{
                marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, textAlign: 'center',
                background: 'rgba(239,68,68,0.15)', border: `1px solid ${colors.danger}`,
              }}>
                <div style={{ fontSize: 26 }}>💥</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.danger, marginTop: 4 }}>
                  BOOM! Ставка сгорела
                </div>
              </div>
            )}

            {/* Действия после игры */}
            {(phase === 'won' || phase === 'lost') && (
              <div style={{ marginTop: spacing.md, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Button size="md" fullWidth onClick={startGame}>🔁 Заново</Button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Button size="md" variant="secondary" fullWidth onClick={() => setPhase('setup')}>
                    ⚙️ Сменить ставку
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Модалка: выбор NFT для ставки */}
      <Modal open={betModalOpen} onClose={() => setBetModalOpen(false)}>
        <div>
          <h3 style={{ marginTop: 0, color: colors.text, fontSize: 17 }}>Выберите NFT для ставки</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: '50vh', overflowY: 'auto', marginTop: 8 }}>
            {MOCK_NFTS.map((nft) => (
              <div
                key={nft.id}
                onClick={() => { setBetNft(nft); setBetModalOpen(false); haptic('medium'); }}
                style={{
                  padding: 8, borderRadius: 10,
                  border: `1.5px solid ${betNft?.id === nft.id ? colors.accent : colors.border}`,
                  background: colors.bgCard, cursor: 'pointer', textAlign: 'center',
                }}
              >
                <img src={nft.image} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 6 }} />
                <div style={{ fontSize: 10, color: colors.accent, marginTop: 4, fontWeight: 'bold' }}>{nft.price.toFixed(2)} TON</div>
                <div style={{ fontSize: 9, color: colors.textMuted }}>{nft.name}</div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

