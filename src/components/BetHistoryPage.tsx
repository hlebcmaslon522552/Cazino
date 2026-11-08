import { useState, useEffect } from 'react';
import { CONFIG } from '../config';
import { useTelegram } from '../hooks/useTelegram';

/* ===================================================================
   Интерфейсы
   =================================================================== */

interface BetHistoryEntry {
  id: number;
  user_id: string;
  game_type: string;
  bet_type: string;
  amount: number;
  item_name: string;
  timestamp: string;
  kind: string; // 'bet' | 'win' | 'deposit'
}

interface UserStats {
  max_win: number;
  rarest_item: { name: string; image: string; price: number } | null;
}

interface Props {
  onBack?: () => void;
}

const GAME_LABELS: Record<string, string> = {
  crash: 'Краш',
  plinko: 'Плинко',
  mines: 'Бомбы',
  hockey: 'Хоккей',
};

const GAME_ICONS: Record<string, string> = {
  crash: '💥',
  plinko: '🔽',
  mines: '💣',
  hockey: '🏒',
};

const formatTime = (ts: string) => {
  if (!ts) return '';
  const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* ===================================================================
   Страница «История ставок»
   =================================================================== */

type FilterKind = 'all' | 'win' | 'bet' | 'deposit';

const FILTER_BUTTONS: { key: FilterKind; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'win', label: 'Выигрыши' },
  { key: 'bet', label: 'Проигрыши' },
  { key: 'deposit', label: 'Пополнения' },
];

export function BetHistoryPage({ onBack }: Props) {
  const { user } = useTelegram();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [bets, setBets] = useState<BetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKind>('all');

  const userId = String(user?.id ?? '6267608438');

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };

    const urlStats = `${CONFIG.API_URL}/api/user_stats?user_id=${userId}`;
    const urlHistory = `${CONFIG.API_URL}/api/bet_history?user_id=${userId}`;
    Promise.all([
      fetch(urlStats, { headers })
        .then((res) => res.json())
        .catch(() => null),
      fetch(urlHistory, { headers })
        .then((res) => res.json())
        .catch(() => []),
    ]).then(([statsData, historyData]) => {
      if (cancelled) return;
      setStats(statsData && typeof statsData === 'object' && !Array.isArray(statsData) ? statsData : null);
      setBets(Array.isArray(historyData) ? historyData : []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  const filteredBets = bets.filter((b) => {
    if (filter === 'all') return true;
    return b.kind === filter;
  });

  return (
    <div style={{ padding: '16px', color: '#fff', maxWidth: 500, margin: '0 auto', paddingBottom: 150 }}>
      {/* ← Назад */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#a855f7',
            fontSize: 16,
            cursor: 'pointer',
            padding: '4px 0',
            fontWeight: 'bold',
          }}
        >
          ← Назад
        </button>
      )}

      <h1 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 16px', textAlign: 'center' }}>
        📜 История ставок
      </h1>

      {/* ── Блоки статистики ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Блок 1: самый большой выигрыш */}
        <div className="rounded-xl p-3 bg-[#1a1a2e] border border-gray-700">
          <div style={{ fontSize: 26, lineHeight: 1 }}>🏆</div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 'bold', letterSpacing: 1, marginTop: 8, textTransform: 'uppercase' }}>
            Самый большой выигрыш
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, marginTop: 6, color: '#fbbf24' }}>
            {stats ? `${Number(stats.max_win).toFixed(2)} TON` : '—'}
          </div>
        </div>

        {/* Блок 2: редкий дроп */}
        <div className="rounded-xl p-3 bg-[#1a1a2e] border border-gray-700">
          <div style={{ fontSize: 26, lineHeight: 1 }}>💎</div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 'bold', letterSpacing: 1, marginTop: 8, textTransform: 'uppercase' }}>
            Редкий дроп
          </div>
          {stats?.rarest_item ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <img
                src={stats.rarest_item.image}
                alt={stats.rarest_item.name}
                style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stats.rarest_item.name}
                </div>
                <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginTop: 2 }}>
                  {Number(stats.rarest_item.price).toFixed(2)} TON
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Нет данных</div>
          )}
        </div>
      </div>

      {/* ── Фильтры ──────────────────────────────────── */}
      <div className="flex gap-2 mt-4 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {FILTER_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            onClick={() => setFilter(btn.key)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
              filter === btn.key
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-[#1a1a2e] text-gray-400 border border-gray-800 hover:border-purple-500'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Список ставок ─────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 14 }}>
            Загрузка...
          </div>
        ) : filteredBets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 14 }}>
            Нет записей
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredBets.map((b) => {
              const isWin = b.kind === 'win';
              const isDeposit = b.kind === 'deposit';

              let icon: string;
              let colorClass: string;
              let amountColor: string = '#4ade80';

              if (isDeposit) {
                icon = '💰';
                colorClass = 'border-blue-500/30 bg-blue-500/5';
                amountColor = '#60a5fa';
              } else if (isWin) {
                icon = '🏆';
                colorClass = 'border-green-500/30 bg-green-500/5';
                amountColor = '#4ade80';
              } else {
                icon = GAME_ICONS[b.game_type] || '💀';
                colorClass = 'border-red-500/30 bg-red-500/5';
                amountColor = '#f87171';
              }

              return (
                <div
                  key={b.id}
                  className={`rounded-xl p-3 bg-[#1a1a2e] border ${colorClass}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Иконка слева */}
                  <div style={{ fontSize: 24, flexShrink: 0, width: 32, textAlign: 'center' }}>
                    {icon}
                  </div>

                  {/* Центр: игра + время */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {GAME_LABELS[b.game_type] || b.game_type || (isDeposit ? 'Пополнение' : 'Ставка')}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: b.bet_type === 'nft' ? 'rgba(168,85,247,0.25)' : 'rgba(59,130,246,0.25)',
                          color: b.bet_type === 'nft' ? '#c084fc' : '#60a5fa',
                        }}
                      >
                        {b.bet_type === 'nft' ? 'NFT' : 'TON'}
                      </span>
                    </div>
                    {b.item_name ? (
                      <div style={{ fontSize: 12, color: '#c084fc', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.item_name}
                      </div>
                    ) : null}
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{formatTime(b.timestamp)}</div>
                  </div>

                  {/* Справа: сумма */}
                  <div style={{ fontSize: 15, fontWeight: 900, color: amountColor, flexShrink: 0, textAlign: 'right' }}>
                    {isDeposit || isWin ? '+' : ''}{Number(b.amount).toFixed(2)} TON
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}