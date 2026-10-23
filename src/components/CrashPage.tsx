import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, RefreshCw, Coins, Clock } from 'lucide-react';

interface CrashPageProps {
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
  onToast?: (msg: string, type: 'success' | 'error') => void;
}

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  x: number;
}

export const CrashPage: React.FC<CrashPageProps> = ({ balance, onUpdateBalance, onToast }) => {
  const [bet, setBet] = useState<number>(1.0);
  const [multiplier, setMultiplier] = useState<number>(1.00);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'crashed'>('waiting');
  
  const [crashPoint, setCrashPoint] = useState<number>(1.00);
  const [hasCashedOut, setHasCashedOut] = useState<boolean>(false);
  const [cashedOutAt, setCashedOutAt] = useState<number>(0);
  
  const [history, setHistory] = useState<number[]>([1.2, 5.4, 1.0, 14.2, 2.1, 1.8]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [countdown, setCountdown] = useState<number>(30);
  
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const lastCandleTimeRef = useRef<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const startGameRef = useRef(startGame);
const generateCrashPoint = (): number => {
    const e = Math.pow(2, 32);
    const h = Math.floor(Math.random() * e);
    const houseEdge = 0.03;
    let point = (100 * e - h) / (e - h) / 100 * (1 - houseEdge);
    if (point < 1.00) return 1.00;
    if (point > 111.00) return 111.00;
    return point;
  };

  const startGame = () => {
    if (bet > balance) { onToast?.('Недостаточно средств', 'error'); return; }
    if (bet <= 0) { onToast?.('Ставка должна быть больше 0', 'error'); return; }

    onUpdateBalance(balance - bet);
    setMultiplier(1.00);
    setCrashPoint(generateCrashPoint());
    setHasCashedOut(false);
    setCandles([{ open: 1.0, close: 1.0, high: 1.0, low: 1.0, x: 0 }]);
    setGameState('playing');
    startTimeRef.current = performance.now();
    lastCandleTimeRef.current = performance.now();
  };
  startGameRef.current = startGame;

  const cashOut = () => {
    if (gameState === 'playing' && !hasCashedOut) {
      const winAmount = bet * multiplier;
      setHasCashedOut(true);
      setCashedOutAt(multiplier);
      onUpdateBalance(balance + winAmount);
      onToast?.(`Вы забрали ${winAmount.toFixed(2)} TON по ${multiplier.toFixed(2)}x`, 'success');
    }
  };

  const resetGame = () => {
    setGameState('waiting');
    setMultiplier(1.00);
    setHasCashedOut(false);
    setCandles([]);
  };
useEffect(() => {
    if (gameState !== 'playing') return;

    const animate = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      
      const newMultiplier = Math.pow(1.00015, elapsed); 

      if (time - lastCandleTimeRef.current > 200) {
        setCandles(prev => {
          const newCandles = [...prev].slice(-5); 
          
          if (newCandles.length > 0) {
            const last = newCandles[newCandles.length - 1];
            last.close = newMultiplier;
            last.high = Math.max(last.high, newMultiplier);
            last.low = Math.min(last.low, newMultiplier);
          }
          
          newCandles.push({ 
            open: newMultiplier, close: newMultiplier, high: newMultiplier, low: newMultiplier, x: 0 
          });
          return newCandles;
        });
        lastCandleTimeRef.current = time;
      }

      if (newMultiplier >= crashPoint) {
        setMultiplier(crashPoint);
        setGameState('crashed');
        setHistory(prev => [crashPoint, ...prev].slice(0, 15));
      } else {
        setMultiplier(newMultiplier);
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [gameState, crashPoint]);

  // Countdown timer in waiting state
  useEffect(() => {
    if (gameState !== 'waiting') {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    setCountdown(30);

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          startGameRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [gameState]);

  const isCrashed = gameState === 'crashed';

  const renderCandles = () => {
    if (candles.length === 0) return null;
    
    const maxVal = Math.max(...candles.map(c => c.high), 1.1);
    const minVal = Math.min(...candles.map(c => c.low), 1.0);
    const range = maxVal - minVal;

    const totalCandles = 6;
    const candleWidth = 100 / totalCandles; 

    return candles.map((candle, i) => {
      const isGreen = candle.close >= candle.open;
      const color = isGreen ? '#00ff88' : '#ff3366';
      
      const bodyTop = 100 - ((Math.max(candle.open, candle.close) - minVal) / range) * 100;
      const bodyBottom = 100 - ((Math.min(candle.open, candle.close) - minVal) / range) * 100;
      const bodyHeight = Math.max(bodyBottom - bodyTop, 1); 
      
      const wickTop = 100 - ((candle.high - minVal) / range) * 100;
      const wickBottom = 100 - ((candle.low - minVal) / range) * 100;
      
      const xPos = (i * candleWidth) + (candleWidth / 2);

      return (
        <g key={i}>
          <line 
            x1={xPos} y1={wickTop} 
            x2={xPos} y2={wickBottom} 
            stroke={color} strokeWidth="0.8" 
          />
          <rect 
            x={xPos - (candleWidth / 2)} 
            y={bodyTop} 
            width={candleWidth} 
            height={bodyHeight} 
            fill={color} 
          />
        </g>
      );
    });
  };
return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans">
      
      {/* История */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        {history.map((h, i) => (
          <span key={i} className={`px-3 py-1 rounded-full text-sm font-bold ${h >= 2 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {h.toFixed(2)}x
          </span>
        ))}
      </div>

      {/* График */}
      <div className="relative h-[350px] min-h-[300px] bg-[#1a1a2e] rounded-3xl border border-gray-800 overflow-hidden shadow-[inset_0_0_50px_rgba(0,0,0,0.5)]">
        
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>

        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {renderCandles()}
          
          {isCrashed && (
            <line 
              x1={candles.length > 0 ? ((candles.length - 1) * (100/6)) + (100/6)/2 : 50} 
              y1="0" 
              x2={candles.length > 0 ? ((candles.length - 1) * (100/6)) + (100/6)/2 : 50} 
              y2="100" 
              stroke="#ff3366" 
              strokeWidth="2" 
              strokeDasharray="3,3"
              style={{ filter: 'drop-shadow(0 0 8px #ff3366)' }}
            />
          )}
        </svg>

        <div className="absolute top-4 left-4 pointer-events-none">
          <span className={`text-5xl font-black tracking-tighter ${isCrashed ? 'text-red-500' : 'text-white'}`} 
                style={{ textShadow: isCrashed ? '0 0 20px rgba(255,51,102,0.8)' : '0 0 20px rgba(255,255,255,0.5)' }}>
            {multiplier.toFixed(2)}x
          </span>
          {hasCashedOut && (
            <div className="mt-2 text-green-400 font-bold text-sm bg-green-900/50 px-3 py-1 rounded-full border border-green-500/50 inline-block">
              Забрано: {(bet * cashedOutAt).toFixed(2)} TON
            </div>
          )}
        </div>

        {isCrashed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-red-600/90 backdrop-blur-md px-8 py-4 rounded-2xl shadow-[0_0_30px_rgba(255,0,0,0.5)] border border-red-400/50 transform -rotate-6 animate-pulse"><span className="text-3xl font-black text-white tracking-widest">RUG PULL</span>
            </div>
          </div>
        )}
      </div>
{/* Нижняя панель */}
      <div className="mt-4 bg-[#1a1a2e] rounded-3xl p-4 border border-gray-800 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col">
            <span className="text-gray-400 text-sm">Ваш баланс</span>
            <span className="text-xl font-bold text-white flex items-center gap-1">
              <Coins size={18} className="text-yellow-500" /> {balance.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-gray-400 text-sm">Потенциал</span>
            <span className="text-xl font-bold text-green-400">
              {gameState === 'playing' ? (bet * multiplier).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        {gameState === 'waiting' && (
          <div className="mb-4">
            <div className="relative">
              <input 
                type="number" 
                value={bet} 
                onChange={(e) => setBet(Number(e.target.value))}
                className="w-full bg-[#0f0f13] border border-gray-700 rounded-xl p-4 text-xl font-bold text-white focus:outline-none focus:border-purple-500 transition-colors pl-12"
              />
              <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500" size={24} />
            </div>
            <div className="flex gap-2 mt-2">
              {[1, 5, 10].map(val => (
                <button key={val} onClick={() => setBet(val)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-sm transition-colors">
                  {val} TON
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'waiting' && (
          <>
            <div className="flex items-center justify-center gap-2 mb-3 text-gray-400">
              <Clock size={16} />
              <span className="text-sm font-semibold">Следующая игра через {countdown}с</span>
            </div>
            <button onClick={startGame} className="w-full bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white font-black text-xl py-4 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
              <TrendingUp size={24} /> Играть
            </button>
          </>
        )}

        {gameState === 'playing' && (
          <button onClick={cashOut} disabled={hasCashedOut} className={`w-full font-black text-xl py-4 rounded-xl transition-all flex items-center justify-center gap-2 
            ${hasCashedOut 
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
              : 'bg-gradient-to-r from-green-500 to-emerald-400 hover:from-green-400 hover:to-emerald-300 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-[0.98]'
            }`}>
            {hasCashedOut ? 'Вы забрали' : `Забрать ${(bet * multiplier).toFixed(2)} TON`}
          </button>
        )}

        {gameState === 'crashed' && (
          <button onClick={resetGame} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-xl py-4 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <RefreshCw size={24} /> Играть заново
          </button>
        )}
      </div>
    </div>
  );
};
