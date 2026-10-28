import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Coins, Clock, Users } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';
import { loadInventoryFromLocal } from '../api';

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
  const { user, initData } = useTelegram();
  const [betInput, setBetInput] = useState<string>("1.0");
  const finalBet = parseFloat(betInput) || 0;
  const [betType, setBetType] = useState<'ton' | 'nft'>('ton');
  const [selectedNft, setSelectedNft] = useState<any>(null);
  const [showNftModal, setShowNftModal] = useState(false);
  const [nftList, setNftList] = useState<any[]>([]);
  const [multiplier, setMultiplier] = useState<number>(1.00);
  const [gameState, setGameState] = useState<ServerRoundState>('waiting');
  const [crashPoint, setCrashPoint] = useState<number>(1.01);
  const [hasCashedOut, setHasCashedOut] = useState<boolean>(false);
  const [cashedOutAt, setCashedOutAt] = useState<number>(0);
  const [history, setHistory] = useState<number[]>([1.2, 5.4, 1.0, 14.2, 2.1, 1.8]);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([{ x: 0, y: 100 }]);
  const [countdown, setCountdown] = useState<number>(15);
  const [hasBet, setHasBet] = useState<boolean>(false);
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const lastPointTimeRef = useRef<number>(0);
  const crashedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverCrashPointRef = useRef<number>(1.01);

  // ── WebSocket-синхронизация глобального раунда ───────────────────────
  useEffect(() => {
    const socket = io(CONFIG.API_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Crash] Socket connected');
      // ── Первичная синхронизация: игрок может войти в середине раунда ──
      fetch(`${CONFIG.API_URL}/api/crash_state`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      })
        .then(res => res.json())
        .then((data) => {
          if (data.state === 'waiting') {
            setCountdown(data.timer || 15);
          } else if (data.state === 'flying') {
            serverCrashPointRef.current = data.crash_point || 1.01;
            setCrashPoint(data.crash_point || 1.01);
            startTimeRef.current = (data.start_time || 0) * 1000;
            lastPointTimeRef.current = Date.now();
            setGameState('flying');
            setMultiplier(1.00);
            setPoints([{ x: 0, y: 100 }]);
            setHasCashedOut(false);
          }
        })
        .catch(err => console.error('[Crash] Initial state fetch error:', err));
    });

    // ── Глобальный обратный отсчёт ──
    socket.on('crash_timer', (data: { timer: number }) => {
      setCountdown(data.timer);
    });

    // ── Раунд стартовал ──
    socket.on('crash_started', (data: { crash_point: number; start_time: number }) => {
      serverCrashPointRef.current = data.crash_point;
      setCrashPoint(data.crash_point);
      startTimeRef.current = data.start_time * 1000;
      lastPointTimeRef.current = Date.now();
      setGameState('flying');
      setMultiplier(1.00);
      setPoints([{ x: 0, y: 100 }]);
      setHasCashedOut(false);
    });

    // ── Раунд завершился (RUG PULL) ──
    socket.on('crash_ended', () => {
      const finalPt = serverCrashPointRef.current;
      setMultiplier(finalPt);
      setGameState('crashed');
      setHistory(prev => [finalPt, ...prev].slice(0, 15));
      // Новый раунд должен начинаться без «фантомной» ставки
      setHasBet(false);
      if (crashedResetRef.current) clearTimeout(crashedResetRef.current);
      crashedResetRef.current = setTimeout(() => {
        setGameState('waiting');
        setMultiplier(1.00);
        setPoints([{ x: 0, y: 100 }]);
        setHasCashedOut(false);
        setHasBet(false);
        setPlayers([]);
      }, 5000);
    });

    // ── Обновление пула ставок ──
    socket.on('crash_players_update', (data: { players: CrashPlayer[] }) => {
      setPlayers(data.players || []);
    });

    socket.on('disconnect', () => {
      console.log('[Crash] Socket disconnected');
    });

    return () => {
      if (crashedResetRef.current) clearTimeout(crashedResetRef.current);
      socket.disconnect();
    };
  }, []);

  // ── Анимация графика ──
  useEffect(() => {
    if (gameState !== 'flying') return;

    const animate = () => {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      const now = Date.now();
      const elapsed = now - startTimeRef.current;
      const newMultiplier = Math.pow(1.0000833, elapsed);

      if (now - lastPointTimeRef.current > 300 + Math.random() * 200) {
        setPoints(prev => {
          const prevX = prev.length > 0 ? prev[prev.length - 1].x : 0;
          const prevY = prev.length > 0 ? prev[prev.length - 1].y : 100;
          const newX = Math.min(prevX + 10, 100);
          const rawY = prevY - (Math.random() * 8 + 2);
          let newY = Math.min(Math.max(rawY, 10), 100);
          let newPoints = [...prev, { x: newX, y: newY }];
          if (newPoints.length > 10) {
            newPoints = newPoints.map(p => ({ ...p, x: Math.max(p.x - 5, 0) }));
          }
          const lastY = newPoints[newPoints.length - 1].y;
          if (lastY < 20) {
            newPoints = newPoints.map(p => ({ ...p, y: Math.min(p.y + 10, 100) }));
          }
          newPoints = newPoints.map(p => ({ ...p, y: Math.min(Math.max(p.y, 0), 100) }));
          return newPoints;
        });
        lastPointTimeRef.current = now;
      }

      if (newMultiplier >= serverCrashPointRef.current) {
        const finalPt = serverCrashPointRef.current;
        setMultiplier(finalPt);
        setGameState('crashed');
        setHistory(prev => [finalPt, ...prev].slice(0, 15));
        setHasBet(false);
        if (crashedResetRef.current) clearTimeout(crashedResetRef.current);
        crashedResetRef.current = setTimeout(() => {
          setGameState('waiting');
          setMultiplier(1.00);
          setPoints([{ x: 0, y: 100 }]);
          setHasCashedOut(false);
          setHasBet(false);
          setPlayers([]);
        }, 5000);
      } else {
        // Ограничиваем отображение множителя до 100x, чтобы избежать
        // зависания при слишком больших значениях Math.pow
        const clamped = Math.min(newMultiplier, 100);
        setMultiplier(clamped);
        requestRef.current = requestAnimationFrame(animate);
      }
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [gameState]);

  const placeBet = () => {
    if (gameState !== 'waiting') return;
    if (betType === 'ton') {
      if (finalBet > balance) { onToast?.('Недостаточно средств', 'error'); return; }
      if (finalBet <= 0) { onToast?.('Ставка должна быть больше 0', 'error'); return; }
      onUpdateBalance(-finalBet);
    } else {
      if (!selectedNft) { onToast?.('Выберите NFT для ставки', 'error'); return; }
      // Удаляем NFT из localStorage инвентаря
      try {
        const raw = localStorage.getItem('inventory');
        if (raw) {
          const local: any[] = JSON.parse(raw);
          localStorage.setItem('inventory', JSON.stringify(local.filter((i: any) => i.id !== selectedNft.id)));
        }
      } catch {}
      onToast?.(`Ставка NFT: ${selectedNft.model || selectedNft.name}`, 'success');
    }
    setHasBet(true);

    // Отправляем ставку на сервер — он рассылает crash_players_update всем
    const betAmount = betType === 'ton' ? finalBet : (selectedNft?.floor || 0);
    socketRef.current?.emit('crash_bet', {
      user_id: String(user?.id ?? 'unknown'),
      username: user?.first_name || 'Игрок',
      bet: betAmount,
    });

    if (betType === 'ton') onToast?.('Ставка принята!', 'success');

    // Отправляем оборот
    const turnoverAmount = betAmount;
    if (turnoverAmount > 0) {
      fetch(`${CONFIG.API_URL}/api/add_turnover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          username: user?.first_name || 'Игрок',
          amount: turnoverAmount,
        }),
      }).catch(() => {});
    }
  };

  const cashOut = () => {
    // Защита от «фантомной» ставки: забирать можно только после реальной ставки
    if (!hasBet) return;
    if (gameState === 'flying' && !hasCashedOut) {
      const winAmount = betType === 'ton' ? finalBet * multiplier : (selectedNft?.floor || 0) * multiplier;
      setHasCashedOut(true);
      setCashedOutAt(multiplier);
      onUpdateBalance(winAmount);
      onToast?.('Вы забрали ' + winAmount.toFixed(2) + (betType === 'ton' ? ' TON' : ' TON (NFT)') + ' по ' + multiplier.toFixed(2) + 'x', 'success');
    }
  };

  const isCrashed = gameState === 'crashed';

  const renderGraph = () => {
    if (!points || points.length === 0) return null;
    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const circles = points.map((p, i) => {
      const isLast = i === points.length - 1 && isCrashed;
      return (
        <circle key={i} cx={p.x} cy={p.y} r={isLast ? 3 : 1.5} fill={isLast ? "#ff3366" : "#00ff88"} stroke={isLast ? "#000" : "#000"} strokeWidth={isLast ? 1 : 0.5} />
      );
    });
    return (
      <g>
        <polyline points={polylinePoints} fill="none" stroke="#00ff88" strokeWidth="1.5" strokeLinejoin="round" />
        {circles}
      </g>
    );
  };
  return (
    <div className="flex flex-col h-full bg-[#0f0f13] text-white p-4 overflow-hidden font-sans">
      
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">История раундов</span>
        <div className="flex gap-2 overflow-x-auto flex-nowrap justify-start scrollbar-thin" style={{ scrollbarWidth: 'thin', msOverflowStyle: 'auto' }}>
          {history.map((h, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap shrink-0 ${h >= 2 ? 'bg-green-500 text-[#0f0f13] shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}>{h.toFixed(2)}x</span>
          ))}
        </div>
      </div>

      <div className="relative h-[300px] bg-[#1a1a2e] rounded-3xl border border-gray-800 overflow-hidden shadow-lg"><div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {renderGraph()}
          {isCrashed && points.length > 0 && <line x1={points[points.length - 1].x} y1={points[points.length - 1].y} x2={points[points.length - 1].x} y2="100" stroke="#ff3366" strokeWidth="2" strokeDasharray="3,3" style={{ filter: 'drop-shadow(0 0 8px #ff3366)' }} />}
        </svg>
        <div className="absolute top-4 left-4 pointer-events-none">
          <span className={`text-5xl font-black tracking-tighter ${isCrashed ? 'text-red-500' : 'text-white'}`} style={{ textShadow: isCrashed ? '0 0 20px rgba(255,51,102,0.8)' : '0 0 20px rgba(255,255,255,0.5)' }}>{multiplier.toFixed(2)}x</span>
          {hasCashedOut && <div className="mt-2 text-green-400 font-bold text-sm bg-green-900/50 px-3 py-1 rounded-full border border-green-500/50 inline-block">Забрано: {((betType === 'ton' ? finalBet : (selectedNft?.floor || 0)) * cashedOutAt).toFixed(2)} TON</div>}
        </div>
        {isCrashed && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-red-600/90 backdrop-blur-md px-8 py-4 rounded-2xl shadow-lg border border-red-400/50 transform -rotate-6 animate-pulse"><span className="text-3xl font-black text-white tracking-widest">RUG PULL</span></div></div>}
        {gameState === 'waiting' && <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><Clock size={48} className="text-gray-600 mb-2"/><span className="text-4xl font-black text-white">{countdown}</span><span className="text-gray-400 text-sm mt-1">до начала</span></div>}
      </div>

      {/* ── Таблица игроков ── */}
      <div className="mt-4 bg-[#1a1a2e] rounded-3xl border border-gray-800 shadow-xl p-4">
        <div className="flex justify-between items-center pb-3 border-b border-gray-700/60 mb-3">
          <span className="text-gray-400 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5"><Users size={14}/> Пользователь</span>
          <span className="text-gray-400 text-sm font-bold uppercase tracking-wider">Коэффициент</span>
        </div>

        {players.length === 0 ? (
          <p className="text-gray-500 text-center text-sm py-6">Ожидание игроков...</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {players.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between gap-3 bg-[#0f0f13] rounded-xl px-3 py-2 border border-gray-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                    {(p.username || 'Игрок').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-bold text-sm truncate">{p.username || 'Игрок'}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <img src={publicUrl('TON.png')} alt="TON" className="w-3.5 h-3.5 object-contain shrink-0" />
                      <span className="text-gray-300 font-semibold text-xs">{p.bet.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {p.cashed_out ? (
                    <span className="text-green-400 font-black text-sm">{(p.multiplier ?? multiplier).toFixed(2)}x</span>
                  ) : p.multiplier != null ? (
                    <span className="text-white/80 font-bold text-sm">{p.multiplier.toFixed(2)}x</span>
                  ) : (
                    <span className="text-green-300/90 font-bold text-sm">{multiplier.toFixed(2)}x</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 bg-[#1a1a2e] rounded-3xl p-4 border border-gray-800 shadow-xl flex-1 flex flex-col justify-end">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col"><span className="text-gray-400 text-sm">Баланс</span><span className="text-xl font-bold text-white flex items-center gap-1"><Coins size={18} className="text-yellow-500" /> {balance.toFixed(2)}</span></div>
          <div className="flex flex-col text-right"><span className="text-gray-400 text-sm">Потенциал</span><span className="text-xl font-bold text-green-400">{gameState === 'flying' ? ((betType === 'ton' ? finalBet : (selectedNft?.floor || 0)) * multiplier).toFixed(2) : '0.00'}</span></div>
        </div>

        {gameState === 'waiting' && (
          <div className="mb-4">
            {/* TON / NFT табы */}
            <div className="flex bg-[#0f0f13] rounded-xl p-1 mb-3 border border-gray-700">
              <button
                onClick={() => { setBetType('ton'); setSelectedNft(null); }}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${betType === 'ton' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500'}`}
              >
                TON
              </button>
              <button
                onClick={() => { setBetType('nft'); setShowNftModal(true); loadNftList(); }}
                className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${betType === 'nft' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500'}`}
              >
                NFT
              </button>
            </div>

            {betType === 'ton' ? (
              <div className="relative">
                <input type="text" inputMode="decimal" value={betInput} onChange={(e) => { const val = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(val)) setBetInput(val); }} className="w-full bg-[#0f0f13] border border-gray-700 rounded-xl p-4 text-xl font-bold text-white focus:outline-none focus:border-purple-500 pl-12" />
                <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-500" size={24} />
              </div>
            ) : (
              <button
                onClick={() => { loadNftList(); setShowNftModal(true); }}
                className="w-full bg-[#0f0f13] border border-gray-700 rounded-xl p-4 text-left flex items-center gap-3"
              >
                {selectedNft ? (
                  <>
                    <img
                      src={selectedNft.image || selectedNft.thumb}
                      alt={selectedNft.model || selectedNft.name}
                      className="w-10 h-10 rounded-lg object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex-1">
                      <span className="text-white font-bold text-sm block">{selectedNft.model || selectedNft.name}</span>
                      <span className="text-gray-400 text-xs">Floor: {selectedNft.floor?.toFixed(2) || '?'} TON</span>
                    </div>
                    <span className="text-purple-400 text-xs">Изменить</span>
                  </>
                ) : (
                  <span className="text-gray-400 font-medium">Выбрать NFT</span>
                )}
              </button>
            )}

            <button onClick={placeBet} disabled={hasBet} className={`w-full mt-2 py-3 rounded-xl shadow-lg active:scale-[0.98] transition-all font-black ${hasBet ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'}`}>
              {betType === 'ton' ? 'Сделать ставку' : 'Ставка NFT'}
            </button>
          </div>
        )}

        {gameState === 'flying' && (
          <button
            onClick={cashOut}
            disabled={!hasBet || hasCashedOut || (betType === 'ton' && finalBet === 0) || (betType === 'nft' && !selectedNft)}
            className={`w-full font-black text-xl py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${!hasBet || hasCashedOut || (betType === 'ton' && finalBet === 0) || (betType === 'nft' && !selectedNft) ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-400 text-black shadow-lg active:scale-[0.98]'}`}
          >
            {!hasBet
              ? 'Вы не делали ставку'
              : hasCashedOut
                ? 'Вы забрали'
                : (betType === 'ton' && finalBet === 0) || (betType === 'nft' && !selectedNft)
                  ? 'Вы не делали ставку'
                  : betType === 'ton'
                    ? `Забрать ${(finalBet * multiplier).toFixed(2)} TON`
                    : `Забрать ${((selectedNft?.floor || 0) * multiplier).toFixed(2)} TON`}
          </button>
        )}
      </div>

      {/* NFT Selection Modal */}
      {showNftModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setShowNftModal(false)}
        >
          <div
            className="bg-[#1a1a2e] border border-gray-700 rounded-2xl p-4 w-full max-w-sm mx-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold text-lg mb-3">Выберите NFT</h3>
            {nftList.length === 0 ? (
              <p className="text-gray-400 text-center py-8">У вас нет NFT в инвентаре</p>
            ) : (
              <div className="flex flex-col gap-2">
                {nftList.map((nft: any) => (
                  <button
                    key={nft.id}
                    onClick={() => {
                      setSelectedNft(nft);
                      setShowNftModal(false);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      selectedNft?.id === nft.id
                        ? 'border-purple-500 bg-purple-900/30'
                        : 'border-gray-700 bg-[#0f0f13] hover:border-purple-500/50'
                    }`}
                  >
                    <img
                      src={nft.image || nft.thumb}
                      alt={nft.model || nft.name}
                      className="w-12 h-12 rounded-lg object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="flex-1 text-left">
                      <span className="text-white font-bold text-sm block">{nft.model || nft.name}</span>
                      <span className="text-gray-400 text-xs">Floor: {nft.floor?.toFixed(2) || '?'} TON</span>
                    </div>
                    {selectedNft?.id === nft.id && (
                      <span className="text-purple-400 text-xs font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowNftModal(false)}
              className="w-full mt-3 py-2 rounded-xl bg-gray-700 text-gray-300 font-bold"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


