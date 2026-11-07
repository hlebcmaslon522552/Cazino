import { useState, useEffect, useCallback } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { fetchTasks, claimTask, type DailyTask } from '../api';
import { colors, spacing, radius, gradients } from '../theme';
import { Clock, Gift, Zap, Trophy, Target, Gamepad2 } from 'lucide-react';

const TASK_ICONS: Record<string, React.ReactNode> = {
  daily_login: <Zap size={22} />,
  daily_bet: <Gamepad2 size={22} />,
  daily_win: <Trophy size={22} />,
  daily_crash: <Target size={22} />,
  daily_bet_5: <Gamepad2 size={22} />,
  daily_crash_win_5x: <Target size={22} />,
  daily_pvp_win: <Trophy size={22} />,
  daily_case_open: <Gift size={22} />,
};

const TASK_COLORS: Record<string, string> = {
  daily_login: '#a855f7',
  daily_bet: '#3b82f6',
  daily_win: '#22c55e',
  daily_crash: '#ef4444',
  daily_bet_5: '#3b82f6',
  daily_crash_win_5x: '#ef4444',
  daily_pvp_win: '#22c55e',
  daily_case_open: '#a855f7',
};

interface Props {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string) => void;
}

export function TasksPage({ balance, onUpdateBalance, onToast }: Props) {
  const { user } = useTelegram();
  const userId = String(user?.id ?? '6267608438');
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');

  // Расчёт времени до следующего сброса (00:00 UTC)
  const updateTimer = useCallback(() => {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const diffMs = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    setTimeLeft(`${hours}ч ${minutes}м`);
  }, []);

  useEffect(() => {
    updateTimer();
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [updateTimer]);

  const loadTasks = useCallback(() => {
    setLoading(true);
    fetchTasks(userId).then((data) => {
      setTasks(data);
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, balance]);

  const handleClaim = async (taskId: string) => {
    setClaimingId(taskId);
    const result = await claimTask(userId, taskId);
    setClaimingId(null);
    if (result && result.success) {
      onUpdateBalance(result.balance_ton - balance);
      onToast?.('🎉 Награда получена!');
      loadTasks();
    } else {
      onToast?.('❌ Ошибка при получении награды');
    }
  };



  return (
    <div style={{ padding: spacing.md, color: colors.text, paddingBottom: 140 }}>
      {/* Заголовок */}
      <div style={{ marginBottom: spacing.lg }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 'bold', letterSpacing: 1 }}>
          Ежедневные задания
        </h2>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 8,
          color: colors.textMuted,
          fontSize: 13,
        }}>
          <Clock size={14} />
          <span>До сброса: {timeLeft}</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.textMuted }}>
          Загрузка заданий...
        </div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.textMuted }}>
          Нет доступных заданий
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasks.map((task) => {
            const isCompleted = task.progress >= task.goal;
            const isClaimed = task.claimed;
            const progressPercent = Math.min((task.progress / task.goal) * 100, 100);
            const taskColor = TASK_COLORS[task.id] || colors.primary;


            return (
              <div
                key={task.id}
                style={{
                  background: colors.bgCard,
                  borderRadius: radius.md,
                  padding: '14px 16px',
                  border: `1px solid ${isClaimed ? 'rgba(34,197,94,0.2)' : isCompleted ? `${taskColor}44` : colors.border}`,
                  transition: 'all 0.2s',
                  opacity: isClaimed ? 0.7 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Иконка */}
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: `${taskColor}22`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: taskColor,
                    flexShrink: 0,
                  }}>
                    {TASK_ICONS[task.id] || <Gift size={22} />}
                  </div>

                  {/* Название и прогресс */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 'bold',
                      fontSize: 14,
                      marginBottom: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      {task.title}
                      {isClaimed && <span style={{ fontSize: 12 }}>✅</span>}
                    </div>

                    {/* Прогресс-бар */}
                    <div style={{
                      width: '100%',
                      height: 6,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 3,
                      overflow: 'hidden',
                      marginTop: 6,
                      marginBottom: 4,
                    }}>
                      <div style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: isClaimed
                          ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                          : `linear-gradient(90deg, ${taskColor}, ${taskColor}aa)`,
                        borderRadius: 3,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                      color: colors.textMuted,
                    }}>
                      <span>{task.progress}/{task.goal}</span>
                      <span>+{task.reward.toFixed(1)} TON</span>
                    </div>
                  </div>

                  {/* Кнопка/статус */}
                  <div style={{ flexShrink: 0 }}>
                    {isClaimed ? (
                      <div style={{
                        fontSize: 11,
                        color: '#22c55e',
                        fontWeight: 'bold',
                        textAlign: 'center',
                      }}>
                        Получено
                      </div>
                    ) : isCompleted ? (
                      <button
                        onClick={() => handleClaim(task.id)}
                        disabled={claimingId === task.id}
                        style={{
                          padding: '8px 14px',
                          border: 'none',
                          borderRadius: radius.pill,
                          background: gradients.primary,
                          color: '#fff',
                          fontWeight: 'bold',
                          fontSize: 12,
                          cursor: 'pointer',
                          transition: 'transform 0.1s',
                          opacity: claimingId === task.id ? 0.6 : 1,
                        }}
                        onMouseDown={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
                        }}
                        onMouseUp={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                        }}
                      >
                        {claimingId === task.id ? '...' : 'Забрать'}
                      </button>
                    ) : (
                      <div style={{
                        fontSize: 11,
                        color: colors.textDim,
                        fontWeight: 'bold',
                        textAlign: 'center',
                      }}>
                        В процессе
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Подпись */}
      <div style={{ textAlign: 'center', color: '#666', fontSize: 12, marginTop: 32, marginBottom: 16 }}>
        Задания обновляются каждый день в 00:00 UTC
      </div>
    </div>
  );
}
