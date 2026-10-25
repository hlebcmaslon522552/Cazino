import { useState } from 'react';
import { LottiePlayer } from './ui/LottiePlayer';
import { BetInput } from './ui/BetInput';
import { colors, radius, spacing } from '../theme';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { useTelegram } from '../hooks/useTelegram';

/* ===================================================================
   Константы
   =================================================================== */

interface Difficulty {
  id: string;
  label: string;
  size: number;
  mines: number;
}

const DIFFICULTIES: Difficulty[] = [
  { id: '3x3', label: '3 × 3', size: 3, mines: 2 },   // было 3, −5% → 2.85 → 2
  { id: '6x6', label: '6 × 6', size: 6, mines: 10 },  // было 11, −5% → 10.45 → 10
  { id: '9x9', label: '9 × 9', size: 9, mines: 22 },  // было 24, −5% → 22.8 → 22
];

/* ===================================================================
   Страница «Мины»
   =================================================================== */

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  balance: number;
  onUpdateBalance: (amount: number) => void;
}

type Phase = 'setup' | 'playing' | 'won' | 'lost';

export function MinesPage({ onBack, onToast, balance, onUpdateBalance }: Props) {
  const { user } = useTelegram();
  const [betAmount, setBetAmount] = useState('0.1');
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [revealedMines, setRevealedMines] = useState<number[]>([]);
  const [openSafe, setOpenSafe] = useState<number[]>([]);
  const [hitMineIndex, setHitMineIndex] = useState<number | null>(null);
  const [showBomb, setShowBomb] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const totalCells = difficulty.size * difficulty.size;
  const safeTotal = totalCells - difficulty.mines;
  const stakePrice = Math.max(0.1, parseFloat(betAmount) || 0);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);
  const potentialWin = stakePrice * currentMultiplier;
  const canStart = phase === 'setup' && stakePrice > 0 && Number(balance) >= Number(stakePrice);
  const canCashout = phase === 'playing' && openSafe.length > 0 && !isGameOver;

  /* ── Старт игры ─────────────────────────── */
  const startGame = async () => {
    if (stakePrice <= 0 || difficulty.mines >= totalCells) return;

    if (Number(balance) < Number(stakePrice)) {
      onToast('Недостаточно средств', 'error');
      return;
    }

    onUpdateBalance(-Number(stakePrice));

    // Отправляем оборот
    if (stakePrice > 0) {
      fetch(`${CONFIG.API_URL}/api/add_turnover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          username: user?.first_name ?? user?.username ?? 'Unknown',
          amount: stakePrice,
        }),
      }).catch(() => {});
    }

    setOpenSafe([]);
    setHitMineIndex(null);
    setShowBomb(false);
    setFadeOut(false);
    setIsGameOver(false);
    setRevealedMines([]);
    setCurrentMultiplier(1.0);

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/mines_start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          bet: stakePrice,
          size: difficulty.size,
          mines_count: difficulty.mines
        })
      });
      const data = await res.json();
      if (data.status === 'started') {
        setPhase('playing');
      } else {
        onToast('Ошибка при старте игры', 'error');
      }
    } catch (e) {
      console.error('mines_start error:', e);
      onToast('Ошибка сети', 'error');
    }
  };

  /* ── Клик по клетке ─────────────────────── */
  const handleCellClick = async (index: number) => {
    if (phase !== 'playing' || showBomb) return;
    if (openSafe.includes(index)) return;

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/mines_click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          cell_index: index
        })
      });
      const data = await res.json();

      if (data.status === 'boom') {
        setIsGameOver(true);
        setHitMineIndex(index);
        setRevealedMines(data.mine_indexes ?? []);
        setShowBomb(true);
        onToast('💥 БОМБА!', 'error');
        setTimeout(() => setFadeOut(true), 200);
        setTimeout(() => setPhase('lost'), 1200);
      } else if (data.status === 'safe') {
        const updated = [...openSafe, index];
        setOpenSafe(updated);
        setCurrentMultiplier(data.new_multiplier ?? currentMultiplier);

        if (updated.length >= safeTotal) {
          setPhase('won');
          onToast('🎉 Вы открыли все клетки!', 'success');
        }
      }
    } catch (e) {
      console.error('mines_click error:', e);
      onToast('Ошибка сети', 'error');
    }
  };

  /* ── Забрать ─────────────────────────────── */
  const cashout = () => {
    if (!canCashout) return;
    onUpdateBalance(potentialWin);
    setPhase('won');
    onToast(`💰 Вы забрали ${potentialWin.toFixed(2)} TON!`, 'success');
  };

  const gridGap = difficulty.size >= 9 ? 3 : 4;
  return (
    <div style={{ padding: spacing.md, color: colors.text, maxWidth: 500, margin: '0 auto' }}>
      {/* ← Назад */}
      <div style={{ marginBottom: spacing.md }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 16, cursor: 'pointer', padding: '4px 0', fontWeight: 'bold' }}
        >
          ← Назад
        </button>
      </div>

      {/* ── Setup ───────────────────────────── */}
      {phase === 'setup' && (
        <div>
          <div style={{ marginBottom: spacing.md }}>
            <label style={{ fontSize: 13, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
              Сумма ставки (TON)
            </label>
            <BetInput value={betAmount} onChange={(e) => setBetAmount(e.target.value)} />
          </div>

          <div style={{ marginBottom: spacing.lg }}>
            <label style={{ fontSize: 13, color: colors.textMuted, display: 'block', marginBottom: 8 }}>
              Сложность
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d)}
                  style={{
                    flex: 1, padding: '12px 8px', fontSize: 14, fontWeight: 'bold',
                    border: `1.5px solid ${difficulty.id === d.id ? colors.primary : colors.border}`,
                    borderRadius: radius.md,
                    background: difficulty.id === d.id ? colors.bgCardActive : colors.bgCard,
                    color: difficulty.id === d.id ? colors.primary : colors.textMuted,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {d.label}
                  <div style={{ fontSize: 10, fontWeight: 'normal', marginTop: 2, opacity: 0.7 }}>
                    {d.mines} мин
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startGame}
            disabled={!canStart}
            style={{
              width: '100%', padding: '18px 24px', fontSize: 20, fontWeight: 'bold',
              color: '#ffffff', background: !canStart ? '#555' : '#ef4444',
              border: 'none', borderRadius: radius.md, cursor: canStart ? 'pointer' : 'not-allowed',
              letterSpacing: 1, transition: 'background 0.15s',
              boxShadow: canStart ? '0 4px 16px rgba(239,68,68,0.4)' : 'none',
            }}
          >
            PLAY
          </button>
        </div>
      )}

{/* ── Game ────────────────────────────── */}
      {(phase === 'playing' || phase === 'won' || phase === 'lost') && (
        <div>
          {/* Info bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: spacing.md, padding: '10px 14px',
            background: colors.bgCard, borderRadius: radius.md, border: `1px solid ${colors.border}`,
          }}>
            <div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>Ставка</div>
              <div style={{ fontSize: 15, fontWeight: 'bold' }}>{stakePrice.toFixed(2)} TON</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: colors.textMuted }}>Множитель</div>
              <div style={{ fontSize: 15, fontWeight: 'bold', color: colors.gold }}>
                ×{currentMultiplier.toFixed(2)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: colors.textMuted }}>Безопасно</div>
              <div style={{ fontSize: 15, fontWeight: 'bold', color: colors.success }}>
                {openSafe.length}/{safeTotal}
              </div>
            </div>
          </div>

          {/* Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${difficulty.size}, 1fr)`,
            gap: gridGap, position: 'relative',
          }}>
            {Array.from({ length: totalCells }, (_, i) => {
              const isSafe = openSafe.includes(i);
              const isHit = hitMineIndex === i;
              // Не прячем оставшиеся мины — при проигрыше их нужно показать
              const shouldHide = phase === 'lost' && fadeOut && !isHit && !isSafe && !revealedMines.includes(i);
              const bg = isSafe ? '#22c55e' : colors.bgCard;
              const borderColor = isSafe ? 'rgba(255,255,255,0.3)' : colors.border;
              const borderWidth = isSafe ? '2px' : '1.5px';

              return (
                <div key={i} onClick={() => handleCellClick(i)} style={{
                  aspectRatio: '1', background: bg, border: `${borderWidth} solid ${borderColor}`,
                  borderRadius: radius.sm, cursor: phase === 'playing' && !isSafe ? 'pointer' : 'default',
                  transition: shouldHide ? 'opacity 0.5s, transform 0.4s' : 'background 0.15s',
                  opacity: shouldHide ? 0 : 1, transform: shouldHide ? 'scale(0.8)' : 'scale(1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: difficulty.size >= 9 ? 14 : 18, position: 'relative', overflow: 'hidden',
                }}>
                  {phase === 'lost' && isHit && (
                    <span style={{ fontSize: difficulty.size >= 9 ? 22 : 30, zIndex: 1 }}>💥</span>
                  )}
                  {phase === 'lost' && !isHit && revealedMines.includes(i) && (
                    <span style={{ fontSize: difficulty.size >= 9 ? 16 : 22, opacity: 0.5, filter: 'grayscale(1)' }}>💣</span>
                  )}
                  {phase === 'won' && revealedMines.includes(i) && (
                    <span style={{ fontSize: difficulty.size >= 9 ? 16 : 22, opacity: 0.3 }}>💣</span>
                  )}
                </div>
              );
            })}

            {/* Lottie bomb overlay (прячем как только наступает проигрыш, чтобы показать мины на поле) */}
            {showBomb && phase !== 'lost' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                zIndex: 10, pointerEvents: 'none',
              }}>
                <div style={{ width: '80%', maxWidth: 300 }}>
                  <LottiePlayer path={publicUrl('animations/BOMB.json')} loop={false} />
                </div>
              </div>
            )}
          </div>

          {/* Cashout button */}
          {phase === 'playing' && (
            <div style={{ marginTop: spacing.lg }}>
              <button onClick={cashout} disabled={!canCashout} style={{
                width: '100%', padding: '16px 24px', fontSize: 18, fontWeight: 'bold',
                color: '#ffffff', background: !canCashout ? '#555' : '#22c55e',
                border: 'none', borderRadius: radius.md, cursor: canCashout ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
                boxShadow: canCashout ? '0 4px 16px rgba(34,197,94,0.4)' : 'none',
              }}>
                Забрать {potentialWin.toFixed(2)} TON
              </button>
              <div style={{ fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 6 }}>
                Каждая безопасная клетка даёт +0.2x к множителю
              </div>
            </div>
          )}

          {/* Win result */}
          {phase === 'won' && (
            <div style={{
              marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md,
              textAlign: 'center', background: 'rgba(34,197,94,0.15)',
              border: `1px solid ${colors.success}`,
            }}>
              <div style={{ fontSize: 26 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.success, marginTop: 4 }}>
                Вы забрали {potentialWin.toFixed(2)} TON!
              </div>
            </div>
          )}

          {/* Lose result */}
          {phase === 'lost' && (
            <div style={{
              marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md,
              textAlign: 'center', background: 'rgba(239,68,68,0.15)',
              border: `1px solid ${colors.danger}`,
            }}>
              <div style={{ fontSize: 26 }}>💥</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: colors.danger, marginTop: 4 }}>
                BOOM! Ставка сгорела
              </div>
            </div>
          )}

          {/* Post-game actions */}
          {(phase === 'won' || phase === 'lost') && (
            <div style={{ marginTop: spacing.md, display: 'flex', gap: 8 }}>
              <button onClick={startGame} style={{
                flex: 1, padding: '14px 18px', fontSize: 15, fontWeight: 'bold',
                color: '#ffffff', background: colors.primary, border: 'none',
                borderRadius: radius.md, cursor: 'pointer',
              }}>
                🔁 Заново
              </button>
              <button onClick={() => setPhase('setup')} style={{
                flex: 1, padding: '14px 18px', fontSize: 15, fontWeight: 'bold',
                color: colors.primary, background: colors.bgCardActive,
                border: `1px solid ${colors.primary}`, borderRadius: radius.md, cursor: 'pointer',
              }}>
                ⚙️ Сменить ставку
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

