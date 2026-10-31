import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CheckCircle, Users, XCircle } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { Lottie } from 'lottie-react';
import flyAnim from '/animations/fly.json';
import boomAnim from '/animations/BOOMnoBOMB.json';

interface CrashPageProps {
  balance: number;
  onUpdateBalance: (newBalance: number) => void;
  onToast?: (msg: string, type: 'success' | 'error') => void;
}

type ServerRoundState = 'waiting' | 'flying' | 'crashed';

interface CrashPlayer {
  user_id: string;
  username: string;
  bet: number;
  multiplier?: number;
  cashed_out?: boolean;
}

export const CrashPage: React.FC<CrashPageProps> = ({ balance, onUpdateBalance, onToast }) => {
  const { user } = useTelegram();
  
  // ── Стейты ──
  const [betInput, setBetInput] = useState<string>('1.0');
  const finalBet = parseFloat(betInput) || 0;
  const [multiplier, setMultiplier] = useState<number>(1.00);
  const [gameState, setGameState] = useState<ServerRoundState>('waiting');
  const [hasCashedOut, setHasCashedOut] = useState<boolean>(false);
  const [cashedOutAt, setCashedOutAt] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([1.2, 5.4, 1.0, 14.2, 2.1, 1.8]);
  const [countdown, setCountdown] = useState<number>(15);
  const [hasBet, setHasBet] = useState<boolean>(false);
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const [showBoom, setShowBoom] = useState<boolean>(false);
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>('');
  const [autoCashout, setAutoCashout] = useState<number | null>(null);

  // ── Рефы ──
  const socketRef = useRef<Socket | null>(null);
  const gameStateRef = useRef<ServerRoundState>('waiting');
  const hasBetRef = useRef(false);
  const hasCashedOutRef = useRef(false);
  const autoCashoutRef = useRef<number | null>(null);

  // ── Сокеты ──
  useEffect(() => {
    const socket = io(CONFIG.API_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('crash_timer', (data: { timer: number }) => setCountdown(data.timer));

    socket.on('crash_started', () => {
      setGameState('flying');
      setShowBoom(false);
      setMultiplier(1.0);
      setHasCashedOut(false);
      hasCashedOutRef.current = false;
      setCashedOutAt(0);
    });

    socket.on('crash_tick', (data: { multiplier: number }) => {
      setMultiplier(data.multiplier);
      // Авто-сбор
      if (autoCashoutRef.current !== null && !hasCashedOutRef.current && data.multiplier >= autoCashoutRef.current) {
        handleCashOut(data.multiplier);
      }
    });

    socket.on('crash_ended', (data: { crash_point?: number }) => {
      if (gameStateRef.current === 'crashed') return;
      const finalPt = data?.crash_point || 1.0;
      setMultiplier(finalPt);
      setGameState('crashed');
      gameStateRef.current = 'crashed';
      setShowBoom(true);
      hasCashedOutRef.current = true;
      setHistory((prev) => [finalPt, ...prev].slice(0, 30));
      setHasBet(false);
      hasBetRef.current = false;
      setAutoCashout(null);
      autoCashoutRef.current = null;
    });

    socket.on('crash_players_update', (data: { players: CrashPlayer[] }) => {
      setPlayers(data.players || []);
    });

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // ── Ставка ──
  const placeBet = () => {
    if (gameState !== 'waiting' || finalBet > balance || finalBet <= 0) return;
    onUpdateBalance(-finalBet);
    
    if (autoCashoutInput) {
      const target = parseFloat(autoCashoutInput);
      if (isFinite(target) && target > 1) {
        setAutoCashout(target);
        autoCashoutRef.current = target;
      }
    }

    setHasBet(true);
    hasBetRef.current = true;
    socketRef.current?.emit('crash_bet', {
      user_id: String(user?.id ?? 'unknown'),
      username: user?.first_name || 'Игрок',
      bet: finalBet,
    });
    onToast?.('Ставка принята!', 'success');
  };

  // ── Забрать ──
  const handleCashOut = (manualMultiplier?: number) => {
    if (!hasBetRef.current || hasCashedOutRef.current) return;
    const m = manualMultiplier ?? multiplier;
    const winAmount = finalBet * m;
    
    setCashedOutAt(m);
    setHasCashedOut(true);
    hasCashedOutRef.current = true;
    setAutoCashout(null);
    autoCashoutRef.current = null;
    onUpdateBalance(winAmount);
    onToast?.(`Вы забрали ${winAmount.toFixed(2)} TON по ${m.toFixed(2)}x`, 'success');
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans">
      {/* История */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">История раундов</span>
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide w-full">
          {history.map((h, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap flex-shrink-0 ${h >= 2 ? 'bg-green-500 text-[#0f0f13]' : 'bg-red-500 text-white'}`}>
              {h.toFixed(2)}x
            </span>
          ))}
        </div>
      </div>

      {/* Поле с Lottie */}
      <div className="relative h-[300px] bg-[#1a1a2e] rounded-3xl border border-gray-800 overflow-hidden shadow-lg">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {!showBoom && gameState === 'flying' && (
            <Lottie animationData={flyAnim} loop={true} style={{ width: '100%', height: '100%' }} />
          )}
          {showBoom && (
            <Lottie
              animationData={boomAnim}
              loop={false}
              onComplete={() => { setShowBoom(false); setGameState('waiting'); }}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>

        <div className="absolute top-4 left-4 pointer-events-none">
          <span className={`text-5xl font-black tracking-tighter ${gameState === 'crashed' ? 'text-red-500' : 'text-white'}`}>
            {multiplier.toFixed(2)}x
          </span>
          {hasCashedOut && (
            <div className="mt-2 text-green-400 font-bold text-sm bg-green-900/50 px-3 py-1 rounded-full inline-block">
              Забрано: {(finalBet * cashedOutAt).toFixed(2)} TON
            </div>
          )}
        </div>

        {gameState === 'waiting' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-gray-900/80 text-white font-black text-6xl px-8 py-3 rounded-2xl border border-gray-700/50 shadow-2xl backdrop-blur-sm">
              {countdown}
            </div>
          </div>
        )}
      </div>

      {/* Панель управления */}
      <div className="flex flex-col gap-3 mt-4 bg-[#1a1a2e] rounded-3xl border border-gray-800 p-4">
        {/* Авто-сбор */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Авто-сбор</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="1.1"
              placeholder="1.5"
              value={autoCashoutInput}
              onChange={(e) => setAutoCashoutInput(e.target.value)}
              className="w-20 bg-[#0f0f13] text-white text-center text-xs font-bold rounded-lg border border-gray-700/60 outline-none py-1.5"
            />
            <span className="text-gray-500 text-xs">x</span>
          </div>
        </div>

        {/* Ставка */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={betInput}
            onChange={(e) => setBetInput(e.target.value)}
            className="flex-1 bg-[#0f0f13] text-white text-center text-lg font-bold rounded-xl border border-gray-700/60 outline-none py-3"
          />
          <button
            onClick={placeBet}
            disabled={hasBet || gameState !== 'waiting' || finalBet > balance || finalBet <= 0}
            className={`flex-shrink-0 px-5 font-black text-xl py-3 rounded-xl transition-all ${hasBet || gameState !== 'waiting' || finalBet > balance || finalBet <= 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-400 text-black shadow-lg'}`}
          >
            {!hasBet ? 'Поставить' : `Ставка ${finalBet.toFixed(2)}`}
          </button>
        </div>

        {/* Забрать */}
        {(hasBet || gameState !== 'waiting') && (
          <button
            onClick={() => handleCashOut()}
            disabled={!hasBet || hasCashedOut || finalBet === 0}
            className={`w-full font-black text-xl py-4 rounded-xl transition-all ${!hasBet || hasCashedOut || finalBet === 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-400 text-black shadow-lg'}`}
          >
            {!hasBet ? 'Вы не делали ставку' : hasCashedOut ? 'Вы забрали' : `Забрать ${(finalBet * multiplier).toFixed(2)} TON`}
          </button>
        )}
      </div>

      {/* Таблица игроков */}
      <div className="mt-4 bg-[#1a1a2e] rounded-3xl border border-gray-800 shadow-xl p-4">
        <div className="flex justify-between items-center pb-3 border-b border-gray-700/60 mb-3">
          <span className="text-gray-400 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5"><Users size={14}/> Игроки</span>
          <span className="text-gray-400 text-sm font-bold uppercase tracking-wider">Кэф</span>
        </div>
        {players.length === 0 ? (
          <p className="text-gray-500 text-center text-sm py-6">Ожидание игроков...</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {players.map((p) => {
              const isCurrentUser = p.user_id === String(user?.id ?? 'unknown');
              const isCashedOut = p.cashed_out === true || (isCurrentUser && hasCashedOut);
              return (
                <div key={p.user_id} className="flex items-center justify-between gap-3 bg-[#0f0f13] rounded-xl px-3 py-2 border border-gray-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                      {(p.username || 'Игрок').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-white font-bold text-sm truncate">{p.username || 'Игрок'}</span>
                        {isCashedOut ? (<CheckCircle size={16} className="text-green-500" />) : gameState === 'crashed' ? (<XCircle size={16} className="text-red-500" />) : null}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <img src={publicUrl('TON.png')} alt="TON" className="w-3.5 h-3.5 object-contain" />
                        <span className="text-gray-300 font-semibold text-xs">{p.bet.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isCashedOut ? (
                      <span className="text-green-400 font-black text-sm">{(p.multiplier || cashedOutAt).toFixed(2)}x</span>
                    ) : (
                      <span className="text-green-300/90 font-bold text-sm">{multiplier.toFixed(2)}x</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
