import { useState } from 'react';

interface Props {
  onBack: () => void;
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function PvPPage({ onBack: _onBack, onToast: _onToast }: Props) {
  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [bet] = useState<number>(15.00); // Ставка по умолчанию

  const handleJoinGame = () => {
    // Тут проверка баланса (если нужно)
    setHasJoined(true);
    // Тут логика отправки запроса на сервер для поиска игры
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans relative">
      
      {/* Заголовок */}
      <div className="flex justify-center items-center mb-6">
        <img src="/Logo.png" alt="Casino Logo" className="h-8 object-contain" />
      </div>

      <h2 className="text-2xl font-black text-center mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
        PvP Батл
      </h2>
      
      <div className="flex-1 flex gap-3 mb-6">
        {/* Твоя зона */}
        <div className="flex-1 bg-[#1a1a2e] rounded-2xl border-2 border-blue-500 p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all">
          <div className="absolute top-0 w-full h-1.5 bg-blue-500 shadow-[0_0_15px_#3b82f6]"></div>
          
          {/* Аватар игрока (заглушка) */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mb-3 border-2 border-blue-400 shadow-lg">
            <span className="text-3xl font-black text-white">ВЫ</span>
          </div>
          
          <span className="font-bold text-lg text-blue-400">Ваша ставка</span>
          <span className="text-white font-black text-2xl mt-1">{bet.toFixed(2)} TON</span>
          
          {hasJoined ? (
            <div className="mt-4 text-green-400 font-bold text-sm bg-green-900/30 px-3 py-1 rounded-full border border-green-500/30 animate-pulse">
              Ожидание соперника...
            </div>
          ) : (
            <div className="mt-4 text-gray-500 text-sm">Не в игре</div>
          )}
        </div>

        {/* VS разделитель */}
        <div className="flex flex-col justify-center items-center">
          <span className="text-4xl font-black text-gray-700 italic" style={{ textShadow: '0 0 10px rgba(255,255,255,0.1)' }}>VS</span>
        </div>

        {/* Зона противника */}
        <div className="flex-1 bg-[#1a1a2e] rounded-2xl border-2 border-red-500/30 p-4 flex flex-col items-center justify-center relative overflow-hidden opacity-60">
          <div className="absolute top-0 w-full h-1.5 bg-red-500 shadow-[0_0_15px_#ef4444]"></div>
          
          {/* Силуэт противника */}
          <div className="w-20 h-20 rounded-full bg-gray-800 border-2 border-red-500/50 mb-3 flex items-center justify-center shadow-inner">
            <span className="text-4xl text-gray-600 font-black">?</span>
          </div>
          
          <span className="font-bold text-lg text-red-400">Соперник</span>
          <span className="text-gray-500 font-black text-2xl mt-1">?</span>
          
          <div className="mt-4 text-gray-500 text-sm">Ожидание...</div>
        </div>
      </div>
      
      {/* Кнопка входа */}
      <div className="mt-auto mb-4">
        <button 
          onClick={handleJoinGame} 
          disabled={hasJoined}
          className={`w-full py-4 rounded-xl font-black text-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2
            ${hasJoined 
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
            }`}
        >
          {hasJoined ? 'Ожидание...' : 'Войти в игру'}
        </button>
      </div>
    </div>
  );
}
