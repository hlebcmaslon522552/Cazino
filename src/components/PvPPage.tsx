import { useState } from 'react';
import { Coins, Play, Users } from 'lucide-react';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export const PvPPage = () => {
  // Тестовые данные (потом заменишь на реальных игроков с бэкенда)
  const [players, _setPlayers] = useState([
    { id: '1', name: 'Вы', bet: 15.0, color: COLORS[0], isMe: true, winChance: 0.3 },
    { id: '2', name: 'Player2', bet: 25.0, color: COLORS[1], isMe: false, winChance: 0.5 },
    { id: '3', name: 'Player3', bet: 10.0, color: COLORS[2], isMe: false, winChance: 0.2 },
  ]);

  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [rotation, setRotation] = useState(0);

  const getWheelSectors = () => {
    let currentAngle = 0;
    const radius = 130;
    const center = 150;

    return players.map((player) => {
      const angle = player.winChance * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;

      const startRad = (startAngle - 90) * (Math.PI / 180);
      const endRad = (endAngle - 90) * (Math.PI / 180);

      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);

      const largeArcFlag = angle > 180 ? 1 : 0;

      return {
        pathData: `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`,
        color: player.color,
        player: player,
      };
    });
  };

  const startGame = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setWinner(null);

    const spins = 5 + Math.random() * 5;
    const totalRotation = spins * 360;
    setRotation(totalRotation);

    setTimeout(() => {
      setIsSpinning(false);
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      setWinner(randomPlayer);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans relative">

      <div className="flex justify-center items-center mb-2">
        <h2 className="text-3xl font-black bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent italic">
          PVP АРЕНА
        </h2>
      </div>

      {/* РУЛЕТКА И СТРЕЛКА */}
      <div className="relative flex-1 flex items-center justify-center min-h-[300px]">

        {/* Черная стрелка (65px) слева, указывает вправо на рулетку */}
        <div className="absolute left-2 z-20 flex items-center justify-center" style={{ left: '10px' }}>
          <svg
            width="65"
            height="65"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.3))' }}
          >
            {/* Сама стрелка (треугольник, смотрящий вправо) */}
            <path d="M 0 20 L 80 50 L 0 80 Z" fill="#000000" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Колесо рулетки */}
        <div
          className="relative w-[280px] h-[280px] rounded-full border-4 border-gray-800 shadow-[0_0_40px_rgba(168,85,247,0.2)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? 'transform 4s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none',
            }}
        >
          <svg viewBox="0 0 300 300" className="w-full h-full rounded-full">
            {getWheelSectors().map((sector, i) => (
              <path key={i} d={sector.pathData} fill={sector.color} stroke="#1a1a2e" strokeWidth="2" />
            ))}
            {/* Центральный круг (Бублик) */}
            <circle cx="150" cy="150" r="50" fill="#0f0f13" stroke="#2a2a40" strokeWidth="4" />
          </svg>

          {/* Текст в центре */}
          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
            <span className="text-gray-400 text-xs font-bold uppercase tracking-widest">Банк</span>
            <span className="text-2xl font-black text-white">
              {players.reduce((acc, p) => acc + p.bet, 0).toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* ОБЪЯВЛЕНИЕ ПОБЕДИТЕЛЯ */}
      {winner && (
        <div
          className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-2xl border-2 z-30 animate-bounce"
          style={{ borderColor: winner.color }}
        >
          <p className="text-center text-sm text-gray-300">Победитель:</p>
          <p className="text-2xl font-black text-center" style={{ color: winner.color }}>
            {winner.name}
          </p>
        </div>
      )}

      {/* СПИСОК ИГРОКОВ ВНИЗУ */}
      <div className="mt-4 bg-[#1a1a2e] rounded-2xl p-3 border border-gray-800">
        <div className="flex items-center gap-2 mb-2 px-2">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-400 font-bold">Игроки ({players.length})</span>
        </div>

        <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex justify-between items-center bg-[#0f0f13] p-3 rounded-xl border border-gray-800/50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name[0]}
                </div>
                <span className="font-bold text-sm">{player.name}</span>
              </div>
              <div className="flex items-center gap-1 text-yellow-500 font-bold">
                <Coins size={16} />
                <span>{player.bet.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* КНОПКА ВНИЗУ */}
      <button
        onClick={startGame}
        disabled={isSpinning}
        className={`w-full mt-3 py-4 rounded-xl font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95
          ${isSpinning
            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]'
          }`}
      >
        {isSpinning ? 'Крутится...' : (
          <>
            <Play size={24} /> Сделать ставку
          </>
        )}
      </button>

    </div>
  );
};