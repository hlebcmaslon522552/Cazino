import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { CheckCircle, Clock, Users, XCircle, Zap } from 'lucide-react';
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
  // ── Авто-сбор ──
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>('');
  const [autoCashout, setAutoCashout] = useState<number | null>(null);
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const lastPointTimeRef = useRef<number>(0);
  const crashedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animMultiplierRef = useRef<number>(1.0);

  const serverCrashPointRef = useRef<number>(1.01);

  // ── Зафиксированные коэффициенты игроков, забравших выигрыш ─────────────
  // Сервер присылает в crash_players_update только {user_id, username, bet},
  // поэтому момент забора храним локально: user_id -> multiplier (cashedOutAt).
  // Пока игрок играет — в таблице показываем живой multiplier, после забора —
  // замороженное значение, чтобы оно не продолжало расти с каждым тиком.
  const frozenCashoutsRef = useRef<Record<string, number>>({});
  // ── Рефы авто-сбора: RAF-цикл создаёт замыкание один раз на старте раунда, ──
  // поэтому актуальные значения стейта читаем через refs, обновляемые на рендере.
  const autoCashoutRef = useRef<number | null>(null);
  const hasCashedOutRef = useRef(false);
  const cashOutRef = useRef<(manualMultiplier?: number) => void>(() => {});

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
            animMultiplierRef.current = 1.0;
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
      animMultiplierRef.current = 1.0;
      setGameState('flying');
      setMultiplier(1.00);
      setPoints([{ x: 0, y: 100 }]);
      setHasCashedOut(false);
      setCashedOutAt(0);
      // Новый раунд: стираем заморозки коэффициентов предыдущего раунда
      frozenCashoutsRef.current = {};
    });

    // ── Раунд завершился (RUG PULL) ──
    socket.on('crash_ended', () => {
      const finalPt = serverCrashPointRef.current;
      setMultiplier(finalPt);
      setGameState('crashed');
      setHistory(prev => [finalPt, ...prev].slice(0, 30));
      // Новый раунд должен начинаться без «фантомной» ставки
      setHasBet(false);
      // Раунд завершился — цель авто-сбора больше неактуальна
      setAutoCashout(null);
      autoCashoutRef.current = null;
      if (crashedResetRef.current) clearTimeout(crashedResetRef.current);
      crashedResetRef.current = setTimeout(() => {
        setGameState('waiting');
        setMultiplier(1.00);
        setPoints([{ x: 0, y: 100 }]);
        setHasCashedOut(false);
        setCashedOutAt(0);
        setHasBet(false);
        setAutoCashout(null);
        autoCashoutRef.current = null;
        // После окончания раунда очищаем данные игроков
        setPlayers([]);
        frozenCashoutsRef.current = {};
      }, 1500);
    });

    // ── Обновление пула ставок ──
    socket.on('crash_players_update', (data: { players: CrashPlayer[] }) => {
      // Сервер присылает только {user_id, username, bet}: при перезаписи списка
      // сохраняем локальную заморозку коэффициента игроков, уже забравших выигрыш,
      // чтобы их коэффициент в таблице не начинал расти снова.
      setPlayers(prev => {
        const prevById = new Map(prev.map(p => [p.user_id, p]));
        return (data.players || []).map(snp => {
          const prevEntry = prevById.get(snp.user_id);
          return prevEntry?.cashed_out
            ? { ...snp, cashed_out: true, multiplier: prevEntry.multiplier }
            : snp;
        });
      });
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
      animMultiplierRef.current += 0.0001;
      const newMultiplier = animMultiplierRef.current;

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
        setHistory(prev => [finalPt, ...prev].slice(0, 30));
        setHasBet(false);
        // Раунд завершился — цель авто-сбора больше неактуальна
        setAutoCashout(null);
        autoCashoutRef.current = null;
        if (crashedResetRef.current) clearTimeout(crashedResetRef.current);
        crashedResetRef.current = setTimeout(() => {
          setGameState('waiting');
          setMultiplier(1.00);
          setPoints([{ x: 0, y: 100 }]);
          setHasCashedOut(false);
          setCashedOutAt(0);
          setHasBet(false);
          setAutoCashout(null);
          autoCashoutRef.current = null;
          // После окончания раунда очищаем данные игроков
          setPlayers([]);
          frozenCashoutsRef.current = {};
        }, 1500);
      } else {
        // Ограничиваем отображение множителя до 100x, чтобы избежать
        // зависания при слишком больших значениях Math.pow
        const clamped = Math.min(newMultiplier, 100);
        setMultiplier(clamped);

        // ── Авто-сбор ──
        // Срабатывает строго один раз: после cashOut() hasCashedOutRef сразу
        // становится true, поэтому в следующих тиках проверка не пройдёт,
        // а после достижения цели (setAutoCashout(null)) останется выключенным.
        if (
          autoCashoutRef.current !== null &&
          !hasCashedOutRef.current &&
          clamped >= autoCashoutRef.current
        ) {
          cashOutRef.current(clamped);
        }
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

    // ── Авто-сбор: запоминаем целевой коэффициент при ставке, ──
    // если переключатель включён и в поле введено корректное значение (> 1.00)
    if (autoCashoutEnabled) {
      const target = parseFloat(autoCashoutInput);
      if (isFinite(target) && target > 1) {
        setAutoCashout(target);
      } else {
        setAutoCashout(null);
        onToast?.('Укажите корректный коэффициент авто-сбора (> 1.00)', 'error');
      }
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

    // Записываем ставку в историю (TON и NFT)
    fetch(`${CONFIG.API_URL}/api/add_bet_history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({
        user_id: user?.id ?? 'unknown',
        game_type: 'crash',
        bet_type: betType,
        amount: turnoverAmount,
        item_name: betType === 'nft' ? (selectedNft?.model || selectedNft?.name || '') : '',
      }),
    }).catch(() => {});
  };

  const cashOut = (manualMultiplier?: number) => {
    // Защита от «фантомной» ставки: забирать можно только после реальной ставки
    if (!hasBet) return;
    if (gameState === 'flying' && !hasCashedOut) {
      // Авто-сбор передаёт точный множитель из RAF-цикла (момент достижения цели),
      // ручной забор берёт актуальный multiplier из текущего рендера
      const m = manualMultiplier ?? multiplier;
      const winAmount = betType === 'ton' ? finalBet * m : (selectedNft?.floor || 0) * m;
      const currentUserId = String(user?.id ?? 'unknown');

      // Фиксируем коэффициент текущего игрока ровно на моменте забора (cashedOutAt).
      // В таблице этот игрок будет показывать замороженное значение, а не живой
      // растущий multiplier (серверные обновления не затирают frozenCashoutsRef).
      setCashedOutAt(m);
      frozenCashoutsRef.current = { ...frozenCashoutsRef.current, [currentUserId]: m };
      setPlayers(prev =>
        prev.map(p =>
          p.user_id === currentUserId ? { ...p, cashed_out: true, multiplier: m } : p
        )
      );

      setHasCashedOut(true);
      // Синхронная защита от повторного срабатывания авто-сбора: даже если RAF
      // или клик по кнопке произойдёт до ближайшего ре-рендера — забора не будет
      hasCashedOutRef.current = true;
      // Цель авто-сбора достигнута — снимаем её
      setAutoCashout(null);
      onUpdateBalance(winAmount);

      // Записываем выигрыш в историю (для статистики max_win)
      fetch(`${CONFIG.API_URL}/api/add_bet_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: user?.id ?? 'unknown',
          game_type: 'crash',
          bet_type: betType,
          amount: winAmount,
          item_name: betType === 'nft' ? (selectedNft?.model || selectedNft?.name || '') : '',
          kind: 'win',
        }),
      }).catch(() => {});

      onToast?.('Вы забрали ' + winAmount.toFixed(2) + (betType === 'ton' ? ' TON' : ' TON (NFT)') + ' по ' + m.toFixed(2) + 'x', 'success');
    }
  };

  // Держим refs авто-сбора актуальными на каждом рендере: RAF-цикл (замыкание,
  // созданное на старте раунда) читает именно эти refs, а не устаревший стейт.
  autoCashoutRef.current = autoCashout;
  hasCashedOutRef.current = hasCashedOut;
  cashOutRef.current = cashOut;

  const toggleAutoCashout = () => {
    // Выключение тумблера снимает запомненную цель; при повторном включении
    // цель установится заново в момент нажатия «Сделать ставку».
    setAutoCashoutEnabled(v => !v);
    setAutoCashout(null);
  };

  const isCrashed = gameState === 'crashed';
  // Примерная координата y цели авто-сбора на графике (0..100): 1.00x — верх,
  // чем выше коэффициент, тем ниже линия. Нужна и для линии, и для плашки.
  const autoCashoutY =
    autoCashout !== null && gameState === 'flying' && !hasCashedOut
      ? Math.min(Math.max(100 - (autoCashout - 1) * 55, 12), 98)
      : null;

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
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2 scrollbar-hide w-full">
          {history.map((h, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-black whitespace-nowrap flex-shrink-0 ${h >= 2 ? 'bg-green-500 text-[#0f0f13] shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}>{h.toFixed(2)}x</span>
          ))}
        </div>
      </div>

      <div className="relative h-[300px] bg-[#1a1a2e] rounded-3xl border border-gray-800 overflow-hidden shadow-lg"><div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {renderGraph()}
          {isCrashed && points.length > 0 && <line x1={points[points.length - 1].x} y1={points[points.length - 1].y} x2={points[points.length - 1].x} y2="100" stroke="#ff3366" strokeWidth="2" strokeDasharray="3,3" style={{ filter: 'drop-shadow(0 0 8px #ff3366)' }} />}
          {autoCashoutY !== null && (
            <line x1="0" y1={autoCashoutY} x2="100" y2={autoCashoutY} stroke="#00ff88" strokeWidth="1.5" strokeDasharray="6,4" style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.6))' }} />
          )}
        </svg>
        <div className="absolute top-4 left-4 pointer-events-none">
          <span className={`text-5xl font-black tracking-tighter ${isCrashed ? 'text-red-500' : 'text-white'}`} style={{ textShadow: isCrashed ? '0 0 20px rgba(255,51,102,0.8)' : '0 0 20px rgba(255,255,255,0.5)' }}>{multiplier.toFixed(2)}x</span>
          {hasCashedOut && <div className="mt-2 text-green-400 font-bold text-sm bg-green-900/50 px-3 py-1 rounded-full border border-green-500/50 inline-block">Забрано: {((betType === 'ton' ? finalBet : (selectedNft?.floor || 0)) * cashedOutAt).toFixed(2)} TON</div>}
          {autoCashoutY !== null && autoCashout !== null && (
            <div className="absolute right-3 pointer-events-none" style={{ bottom: `${100 - autoCashoutY}%` }}>
              <span className="text-green-400 font-bold text-xs bg-green-900/60 px-2.5 py-1 rounded-full border border-green-500/60 shadow-[0_0_10px_rgba(34,197,94,0.5)] whitespace-nowrap">
                Авто-сбор: {autoCashout.toFixed(2)}x
              </span>
            </div>
          )}
        </div>
        {isCrashed && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="bg-red-600/90 backdrop-blur-md px-8 py-4 rounded-2xl shadow-lg border border-red-400/50 transform -rotate-6 animate-pulse"><span className="text-3xl font-black text-white tracking-widest">RUG PULL</span></div></div>}
        {gameState === 'waiting' && <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><Clock size={48} className="text-gray-600 mb-2"/><span className="text-4xl font-black text-white">{countdown}</span><span className="text-gray-400 text-sm mt-1">до начала</span></div>}
      </div>

      

      <div className="mt-4 bg-[#1a1a2e] rounded-3xl p-4 border border-gray-800 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col"><span className="text-gray-400 text-sm">Баланс</span><span className="text-xl font-bold text-white flex items-center gap-1"><img src="/TON.png" alt="TON" style={{ width: 16, height: 16, objectFit: 'contain' }} /> {balance.toFixed(2)}</span></div>
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
                <img src="/TON.png" alt="TON" className="absolute left-4 top-1/2 -translate-y-1/2" style={{ width: 16, height: 16, objectFit: 'contain' }} />
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

            {/* ── Авто-сбор ── */}
            <div className={`mt-3 rounded-xl border p-3 transition-colors ${autoCashoutEnabled ? 'border-green-500/40 bg-green-900/10' : 'border-gray-700 bg-[#0f0f13]'}`}>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={toggleAutoCashout}
                  className="flex items-center gap-2 text-gray-300 font-bold text-sm select-none shrink-0"
                >
                  <Zap size={14} className="text-green-400" />
                  Авто-сбор
                </button>
                {autoCashout !== null && (
                  <span className="text-green-400 text-[10px] font-black uppercase tracking-wider bg-green-900/60 px-2 py-0.5 rounded-full border border-green-500/50 whitespace-nowrap">
                    активен · {autoCashout.toFixed(2)}x
                  </span>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCashoutEnabled}
                  onClick={toggleAutoCashout}
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${autoCashoutEnabled ? 'bg-green-500' : 'bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${autoCashoutEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {autoCashoutEnabled && (
                <div className="mt-3">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="1.50"
                      value={autoCashoutInput}
                      onChange={(e) => { const val = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(val)) setAutoCashoutInput(val); }}
                      className="w-full bg-[#0f0f13] border border-gray-700 rounded-xl p-3 pr-10 text-lg font-bold text-white focus:outline-none focus:border-green-500"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-green-400 font-black text-sm pointer-events-none">x</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-2 flex items-center justify-between">
                    <span>Авто-сбор на</span>
                    <span className="text-green-400 font-bold">{(parseFloat(autoCashoutInput.replace(',', '.')) || 0).toFixed(2)}x</span>
                  </p>
                </div>
              )}
            </div>

            <button onClick={placeBet} disabled={hasBet} className={`w-full mt-2 py-3 rounded-xl shadow-lg active:scale-[0.98] transition-all font-black ${hasBet ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'}`}>
              {betType === 'ton' ? 'Сделать ставку' : 'Ставка NFT'}
            </button>
          </div>
        )}

        {gameState === 'flying' && (
          <button
            onClick={() => cashOut()}
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
            {players.map((p) => {
              const isCurrentUser = p.user_id === String(user?.id ?? 'unknown');
              // Игрок забрал выигрыш: статус от сервера, локальный кашаут текущего
              // игрока или запись в карте замороженных коэффициентов
              const isCashedOut =
                p.cashed_out === true ||
                (isCurrentUser && hasCashedOut) ||
                typeof frozenCashoutsRef.current[p.user_id] === 'number';
              // Коэффициент зафиксирован в момент забора (cashedOutAt) и НЕ растёт,
              // даже когда живой multiplier продолжает увеличиваться
              const frozenAt =
                p.multiplier ??
                (isCurrentUser ? cashedOutAt : frozenCashoutsRef.current[p.user_id]) ??
                multiplier;

              return (
                <div key={p.user_id} className="flex items-center justify-between gap-3 bg-[#0f0f13] rounded-xl px-3 py-2 border border-gray-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-black text-sm shrink-0">
                    {(p.username || 'Игрок').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-white font-bold text-sm truncate">{p.username || 'Игрок'}</span>
                      {isCashedOut ? (
                        <CheckCircle size={16} className="text-green-500 shrink-0" />
                      ) : gameState === 'crashed' ? (
                        <XCircle size={16} className="text-red-500 shrink-0" />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <img src={publicUrl('TON.png')} alt="TON" className="w-3.5 h-3.5 object-contain shrink-0" />
                      <span className="text-gray-300 font-semibold text-xs">{p.bet.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {isCashedOut ? (
                    <span className="text-green-400 font-black text-sm">{frozenAt.toFixed(2)}x</span>
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


