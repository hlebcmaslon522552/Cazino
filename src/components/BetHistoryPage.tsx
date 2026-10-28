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

export function BetHistoryPage({ onBack }: Props) {
  const { user } = useTelegram();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [bets, setBets] = useState<BetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = String(user?.id ?? '6267608438');

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };

    Promise.all([
      fetch(`${CONFIG.API_URL}/api/user_stats?user_id=${userId}`, { headers })
        .then((res) => res.json())
        .catch(() => null),
      fetch(`${CONFIG.API_URL}/api/bet_history?user_id=${userId}`, { headers })
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

      {/* ── Список последних ставок ─────────────────── */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 'bold', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' }}>
          Последние ставки
        </div>

        {/* BET_LIST */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 14 }}>
            Загрузка...
          </div>
        ) : bets.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32, fontSize: 14 }}>
            Пока нет ставок
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bets.map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: '#1a1a2e',
                  border: '1px solid #1f2937',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {GAME_LABELS[b.game_type] || b.game_type}
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
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fbbf24', flexShrink: 0 }}>
                  {Number(b.amount).toFixed(2)} TON
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}