import { useState, useEffect, useRef } from 'react';
import { Coins, Play, Users, Clock, Plus } from 'lucide-react';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const PVP_STORAGE_KEY = 'pvp_lobby_state';

interface LobbyState {
  myStatus: 'idle' | 'waiting' | 'playing';
  playersCount: number;
  bet: number;
}

function saveLobbyState(state: LobbyState): void {
  try {
    localStorage.setItem(PVP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadLobbyState(): LobbyState | null {
  try {
    const raw = localStorage.getItem(PVP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.myStatus === 'string' && typeof parsed.playersCount === 'number' && typeof parsed.bet === 'number') {
      return parsed as LobbyState;
    }
    return null;
  } catch {
    return null;
  }
}

function clearLobbyState(): void {
  try {
    localStorage.removeItem(PVP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface PvPPageProps {
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
  onToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const PvPPage = ({ balance, onUpdateBalance, onToast }: PvPPageProps) => {
  const [playersCount, setPlayersCount] = useState(0);
  const [myStatus, setMyStatus] = useState<'idle' | 'waiting' | 'playing'>('idle');
  const [timer, setTimer] = useState(15);

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [rotation, setRotation] = useState(0);
  const [bet, setBet] = useState(10);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const statusRef = useRef(myStatus);
  const playersRef = useRef(playersCount);
  const betRef = useRef(bet);
  const balanceRef = useRef(balance);
  const timeOffsetRef = useRef<number>(0);

  // Серверная синхронизация времени
  useEffect(() => {
    fetch(`${CONFIG.API_URL}/api/time`, {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    })
      .then(res => res.json())
      .then(data => {
        const serverTime = data.timestamp;
        timeOffsetRef.current = serverTime - Date.now();
        console.log(`[PvPPage] Time offset: ${timeOffsetRef.current}ms`);
      })
      .catch(err => console.error('[PvPPage] Time sync error:', err));
  }, []);

  // Синхронизируем refs при каждом рендере
  statusRef.current = myStatus;
  playersRef.current = playersCount;
  betRef.current = bet;
  balanceRef.current = balance;

  // Восстанавливаем состояние лобби при монтировании
  useEffect(() => {
    const saved = loadLobbyState();
    if (saved && saved.myStatus === 'waiting') {
      setMyStatus('waiting');
      setPlayersCount(saved.playersCount);
      setBet(saved.bet);
    } else if (saved) {
      // Если статус не 'waiting' — чистим мусор
      clearLobbyState();
    }
  }, []);

  // Синхронизируем с localStorage при изменении ключевых полей
  useEffect(() => {
    const state: LobbyState = { myStatus, playersCount, bet };
    saveLobbyState(state);
  }, [myStatus, playersCount, bet]);

  // При размонтировании (переключение вкладки) — возвращаем ставку, если игрок один
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
      // Если игрок в ожидании и соперников меньше 2 — возвращаем ставку
      if (statusRef.current === 'waiting' && playersRef.current < 2 && betRef.current > 0) {
        onUpdateBalance(betRef.current);
        onToast?.('Ставка возвращена, так как вы покинули лобби', 'info');
      }
      clearLobbyState();
    };
  }, []);

  // Таймер запускается только когда playersCount >= 2
  useEffect(() => {
    if (playersCount >= 2 && !isSpinning && myStatus === 'waiting') {
      setTimer(15);
      timerRef.current = setInterval(() => {
        setTimer(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            startWheelGame();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [playersCount, isSpinning, myStatus]);

  const startWheelGame = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWinner(null);
    setMyStatus('playing');
    const spins = 5 + Math.random() * 5;
    const totalRotation = spins * 360;
    setRotation(totalRotation);
    setTimeout(() => {
      setIsSpinning(false);
      setWinner({ id: 'me', name: 'Вы', color: COLORS[0] });
      // Игра завершена — чистим localStorage, чтобы при возврате начать с чистого листа
      clearLobbyState();
    }, 4000);
  };

  const joinGame = () => {
    if (myStatus !== 'idle') return;
    if (bet > balance) {
      onToast?.('Недостаточно средств', 'error');
      return;
    }
    if (bet <= 0) {
      onToast?.('Ставка должна быть больше 0', 'error');
      return;
    }
    onUpdateBalance(-bet);
    setPlayersCount(1);
    setMyStatus('waiting');
  };

  const createGame = () => { joinGame(); };

  const getWheelSectors = () => {
    const totalSectors = Math.max(playersCount, 1);
    const sectorAngle = 360 / totalSectors;
    const radius = 130;
    const center = 150;
    return Array.from({ length: totalSectors }).map((_, i) => {
      const startAngle = i * sectorAngle;
      const endAngle = (i + 1) * sectorAngle;
      const startRad = (startAngle - 90) * (Math.PI / 180);
      const endRad = (endAngle - 90) * (Math.PI / 180);
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      const largeArcFlag = sectorAngle > 180 ? 1 : 0;
      return {
        pathData: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`,
        color: COLORS[i % COLORS.length],
      };
    });
  };

  const returnToLobby = () => {
    clearLobbyState();
    setMyStatus('idle');
    setPlayersCount(0);
    setWinner(null);
    setRotation(0);
    setIsSpinning(false);
    setTimer(15);
  };

  const renderLobbyStatus = () => {
    if (myStatus === 'idle' && playersCount === 0) {
      return (
        <div className="text-center py-4">
          <Users size={48} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 text-lg font-bold">Нет игроков</p>
          <p className="text-gray-600 text-sm mt-1">Создайте игру и ждите соперников</p>
        </div>
      );
    }
    if (myStatus === 'waiting' && playersCount === 1) {
      return (
        <div className="text-center py-4">
          <div className="animate-pulse flex flex-col items-center gap-2">
            <Clock size={32} className="text-yellow-500" />
            <p className="text-yellow-400 text-lg font-bold">Ожидание игроков...</p>
            <p className="text-gray-500 text-sm">Как только присоединится соперник, начнётся обратный отсчёт</p>
          </div>
        </div>
      );
    }
    if (playersCount >= 2 && myStatus === 'waiting') {
      return (
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-2">
            <Clock size={24} className="text-green-400" />
            <span className="text-green-400 text-xl font-black">До начала: {timer}с</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans relative">
      <div className="flex justify-center items-center mb-2">
        <h2 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent italic">PVP АРЕНА</h2>
      </div>

      {myStatus === 'idle' && playersCount > 0 && (
        <div className="text-center py-2 mb-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <p className="text-yellow-400 text-sm font-bold">В лобби уже есть игроки! Присоединяйся!</p>
        </div>
      )}

      <div className="relative flex-1 flex items-center justify-center min-h-[300px]">
        <div className="absolute left-2 z-20 flex items-center justify-center" style={{ left: '10px' }}>
          <svg width="65" height="65" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' }}>
            <path d="M 0 20 L 80 50 L 0 80 Z" fill="#000000" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="relative w-[280px] h-[280px] rounded-full border-4 border-gray-800 shadow-[0_0_40px_rgba(168,85,247,0.2)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
          }}
        >
          {playersCount > 0 ? (
            <svg viewBox="0 0 300 300" className="w-full h-full rounded-full">
              {getWheelSectors().map((sector, i) => (
                <path key={i} d={sector.pathData} fill={sector.color} stroke="#1a1a2e" strokeWidth="2" />
              ))}
              <circle cx="150" cy="150" r="50" fill="#0f0f13" stroke="#2a2a40" strokeWidth="4" />
            </svg>
          ) : (
            <div className="w-full h-full rounded-full bg-[#1a1a2e] flex items-center justify-center">
              <Users size={64} className="text-gray-700" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Банк</span>
            <span className="text-2xl font-black text-white">{playersCount > 0 ? (playersCount * bet).toFixed(0) : '0'}</span>
          </div>
        </div>
      </div>

      {winner && !isSpinning && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-2xl border-2 z-30 animate-bounce"
          style={{ borderColor: winner.color }}>
          <p className="text-center text-sm text-gray-300">Победитель:</p>
          <p className="text-2xl font-black text-center" style={{ color: winner.color }}>{winner.name}</p>
        </div>
      )}

      <div className="mt-2 bg-[#1a1a2e] rounded-2xl p-3 border border-gray-800">
        <div className="flex items-center gap-2 mb-2 px-2">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-400 font-bold">Игроки ({playersCount})</span>
        </div>
        {renderLobbyStatus()}
      </div>

      {myStatus === 'idle' && (
        <div className="mt-3 bg-[#1a1a2e] rounded-2xl p-3 border border-gray-800">
          <div className="relative">
            <input type="number" value={bet} onChange={(e) => setBet(Number(e.target.value))}
              className="w-full bg-[#0f0f13] border border-gray-700 rounded-xl p-3 text-lg font-bold text-white focus:outline-none focus:border-purple-500 transition-colors pl-10" />
            <Coins className="absolute left-3 top-1/2 -translate-y-1/2 text-yellow-500" size={20} />
          </div>
          <div className="flex gap-2 mt-2">
            {[5, 10, 25, 50].map(val => (
              <button key={val} onClick={() => setBet(val)}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm transition-colors">{val} TON</button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
            <span>Баланс:</span>
            <span className="text-yellow-500 font-bold">{balance.toFixed(2)} TON</span>
          </div>
        </div>
      )}

      {myStatus === 'idle' && playersCount === 0 && (
        <button onClick={createGame}
          className="w-full mt-3 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
          <Plus size={24} /> Создать игру
        </button>
      )}

      {myStatus === 'idle' && playersCount > 0 && (
        <button onClick={joinGame}
          className="w-full mt-3 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
          <Play size={24} /> Войти в игру ({bet} TON)
        </button>
      )}

      {myStatus === 'waiting' && (
        <button onClick={() => {
          // Выход из лобби — возвращаем ставку
          if (playersCount < 2) {
            onUpdateBalance(bet);
            onToast?.('Вы вышли из лобби, ставка возвращена', 'info');
          } else {
            onToast?.('Игра уже началась, выход невозможен', 'error');
            return;
          }
          clearLobbyState();
          setMyStatus('idle');
          setPlayersCount(0);
          setWinner(null);
          setRotation(0);
          setIsSpinning(false);
          setTimer(15);
        }}
          className="w-full mt-3 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700">
          Выйти из лобби
        </button>
      )}

      {isSpinning && (
        <button disabled
          className="w-full mt-3 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 bg-gray-700 text-gray-400 cursor-not-allowed">
          Крутится...
        </button>
      )}

      {winner && !isSpinning && (
        <button onClick={returnToLobby}
          className="w-full mt-3 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]">
          Играть снова
        </button>
      )}
    </div>
  );
};




