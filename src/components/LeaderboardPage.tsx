import { useState, useEffect } from 'react';
import { CONFIG } from '../config';

interface LeaderboardEntry {
  username: string;
  total: number;
}

export function LeaderboardPage() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${CONFIG.API_URL}/api/leaderboard_turnover`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
    })
      .then(res => res.json())
      .then((data: LeaderboardEntry[]) => {
        setLeaders(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const renderMedal = (rank: number) => {
    const icons: Record<number, string> = {
      1: '🥇',
      2: '🥈',
      3: '🥉',
    };
    return <span style={{ fontSize: 20 }}>{icons[rank]}</span>;
  };

  return (
    <div style={{
      padding: '16px',
      color: '#fff',
      maxWidth: 500,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>
          🏆
        </div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 'bold',
          color: '#fff',
          margin: 0,
        }}>
          Топ по обороту
        </h1>
        <p style={{
          fontSize: 12,
          color: '#9ca3af',
          marginTop: 4,
        }}>
          Лидеры по сумме ставок
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: 40,
          color: '#9ca3af',
          fontSize: 14,
        }}>
          Загрузка...
        </div>
      )}

      {/* List */}
      {!loading && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {leaders.map((entry, i) => {
            const rank = i + 1;
            const isPodium = rank <= 3;
            return (
              <div
                key={rank}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: isPodium
                    ? rank === 1
                      ? 'linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.05))'
                      : rank === 2
                        ? 'linear-gradient(135deg, rgba(192,192,192,0.2), rgba(192,192,192,0.05))'
                        : 'linear-gradient(135deg, rgba(205,127,50,0.2), rgba(205,127,50,0.05))'
                    : '#1a1a2e',
                  border: isPodium ? '1px solid rgba(255,255,255,0.1)' : '1px solid #1f2937',
                }}
              >
                {/* Rank number or medal */}
                <div style={{
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  background: isPodium
                    ? rank === 1
                      ? 'rgba(255,215,0,0.3)'
                      : rank === 2
                        ? 'rgba(192,192,192,0.3)'
                        : 'rgba(205,127,50,0.3)'
                    : '#2a2a40',
                  fontSize: isPodium ? undefined : 14,
                  fontWeight: 'bold',
                  color: isPodium ? undefined : '#9ca3af',
                  flexShrink: 0,
                }}>
                  {isPodium ? renderMedal(rank) : rank}
                </div>

                {/* Username */}
                <div style={{
                  flex: 1,
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#fff',
                }}>
                  {entry.username || 'Unknown'}
                </div>

                {/* Total */}
                <div style={{
                  fontSize: 14,
                  fontWeight: 'bold',
                  color: isPodium ? '#fbbf24' : '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  {entry.total.toFixed(1)}
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>TON</span>
                </div>
              </div>
            );
          })}

          {leaders.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: 40,
              color: '#9ca3af',
              fontSize: 14,
            }}>
              Пока нет данных
            </div>
          )}
        </div>
      )}
    </div>
  );
}