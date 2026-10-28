import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Coins, Swords } from 'lucide-react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { CONFIG } from '../config';
import { useTelegram } from '../hooks/useTelegram';

interface PvP2PageProps {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface Player {
  user_id: string;
  username: string;
  bet: number;
  color: string;
}

interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number;
  bet: number;
  playerId: string;
  winner: boolean;
}

type Phase = 'setup' | 'playing' | 'result';

const FIELD_W = 500;
const FIELD_H = 300;
const PUCK_R = 8;
const PUCK_DURATION_MS = 3000;
// Множитель скорости шайбы: на каждом шаге x += vx * PUCK_SPEED (x3 — в 3 раза быстрее)
const PUCK_SPEED = 3;
// Затухание скорости каждый кадр — плавная остановка шайбы без рывка
const PUCK_FRICTION = 0.98;

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const PvP2Page: React.FC<PvP2PageProps> = ({ balance, onUpdateBalance, onToast }) => {
  const { user } = useTelegram();
  const [betInput, setBetInput] = useState('1.0');
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [totalPot, setTotalPot] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(15);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [puckPos, setPuckPos] = useState({ x: FIELD_W / 2, y: FIELD_H / 2 });
  const [isJoining, setIsJoining] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const userIdRef = useRef<string>('');
  const phaseRef = useRef<Phase>('setup');
  const animFrameRef = useRef<number>(0);
  const puckStartTimeRef = useRef<number>(0);
  const puckVxRef = useRef(0);
  const puckVyRef = useRef(0);
  const puckXRef = useRef(FIELD_W / 2);
  const puckYRef = useRef(FIELD_H / 2);
  const totalPotRef = useRef(0);
  // Ссылка на <g> шайбы — двигаем через transform, а не через setState каждый кадр
  const puckRef = useRef<SVGGElement | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
const reset = () => {
    setPhase('setup');
    setPlayers([]);
    setWinnerId(null);
    setTotalPot(0);
    setWaitSeconds(15);
    setShapes([]);
    setPuckPos({ x: FIELD_W / 2, y: FIELD_H / 2 });
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = 0; }
  };

  // При монтировании шайбы сразу ставим её в puckPos — без «вспышки» в углу (0,0).
  // useCallback со стабильной ссылкой: React НЕ перезапишет transform при обычных ре-рендерах.
  const attachPuckRef = useCallback((el: SVGGElement | null) => {
    puckRef.current = el;
    if (el) {
      el.setAttribute('transform', `translate(${puckPos.x}, ${puckPos.y})`);
    }
  }, [puckPos.x, puckPos.y]);

  const startPuckAnimation = () => {
    puckXRef.current = FIELD_W / 2;
    puckYRef.current = FIELD_H / 2;
    // Базовая скорость (множитель PUCK_SPEED применяется в шаге движения)
    puckVxRef.current = randomRange(-3, 3);
    puckVyRef.current = randomRange(-3, 3);
    // Страховка от «застревания» на чисто вертикальной/горизонтальной траектории
    if (puckVxRef.current === 0) puckVxRef.current = Math.random() > 0.5 ? 1 : -1;
    if (puckVyRef.current === 0) puckVyRef.current = Math.random() > 0.5 ? 1 : -1;
    puckStartTimeRef.current = performance.now();
    if (puckRef.current) {
      puckRef.current.setAttribute('transform', `translate(${FIELD_W / 2}, ${FIELD_H / 2})`);
    }
    const animate = (now: number) => {
      const elapsed = now - puckStartTimeRef.current;
      if (elapsed >= PUCK_DURATION_MS) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
        const finalX = puckXRef.current;
        const finalY = puckYRef.current;
        setPuckPos({ x: finalX, y: finalY });
        return;
      }
      const vx = puckVxRef.current;
      const vy = puckVyRef.current;
      // Скорость: x += vx * PUCK_SPEED, y += vy * PUCK_SPEED (в 3 раза быстрее)
      let px = puckXRef.current + vx * PUCK_SPEED;
      let py = puckYRef.current + vy * PUCK_SPEED;
      // Отскок от стенок: отражаем скорость (vx *= -1), не давая шайбе застрять
      if (px < PUCK_R) { px = PUCK_R; puckVxRef.current = -vx; }
      else if (px > FIELD_W - PUCK_R) { px = FIELD_W - PUCK_R; puckVxRef.current = -vx; }
      if (py < PUCK_R) { py = PUCK_R; puckVyRef.current = -vy; }
      else if (py > FIELD_H - PUCK_R) { py = FIELD_H - PUCK_R; puckVyRef.current = -vy; }
      puckXRef.current = px;
      puckYRef.current = py;
      // Плавная остановка: скорость затухает каждый кадр (vx *= 0.98, vy *= 0.98)
      puckVxRef.current *= PUCK_FRICTION;
      puckVyRef.current *= PUCK_FRICTION;
      // Двигаем шайбу через transform без setState — SVG не перерисовывается каждый кадр
      if (puckRef.current) {
        puckRef.current.setAttribute('transform', `translate(${px}, ${py})`);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  };
  useEffect(() => {
    const socket = io(CONFIG.API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      console.log('[PvP2] Socket connected');
      // userIdRef хранит ТОЛЬКО реальный Telegram ID (заполняется в createGame из useTelegram).
      // Не перезаписываем его socket.id, иначе в hockey_result не совпадёт победитель.
    });
    socket.on('connect_error', (err: any) => {
      console.error('[PvP2] Socket connection error:', err.message);
    });
    // ── Глобальный таймер раунда (как Crash) ──
    socket.on('hockey_timer', (data: { timer: number }) => {
      setWaitSeconds(data.timer);
      // Окно раунда истекло, а hockey_started не пришёл (мало игроков) — разблокируем кнопку.
      if (data.timer <= 0) {
        setIsJoining(false);
      }
    });
    // ── Обновление списка игроков в пуле ──
    socket.on('hockey_players_update', (data: { players: Player[] }) => {
      setPlayers(data.players);
    });
    // ── Старт раунда (сервер шлёт игроков и фигуры) ──
    socket.on('hockey_started', (data: { players: Player[]; shapes: Shape[]; total_pot: number }) => {
      setPlayers(data.players);
      setShapes(data.shapes);
      setTotalPot(data.total_pot);
      totalPotRef.current = data.total_pot;
      setPhase('playing');
      setIsJoining(false);
    });
    // ── Результат раунда (победитель от сервера) ──
    socket.on('hockey_result', (data: { winner_id: string; winner_name: string; total_pot: number }) => {
      setWinnerId(data.winner_id);
      setIsJoining(false);
      setTotalPot(data.total_pot);
      setShapes((prev) => prev.map((s) => ({ ...s, winner: s.playerId === data.winner_id })));
      if (data.winner_id === userIdRef.current) {
        onUpdateBalance(data.total_pot);
        onToast?.('🏆 Вы победили! +' + data.total_pot.toFixed(2) + ' TON', 'success');
        // Записываем выигрыш в историю (для статистики max_win)
        const winHistoryUserId = String(user?.id ?? data.winner_id);
        fetch(`${CONFIG.API_URL}/api/add_bet_history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
          body: JSON.stringify({
            user_id: winHistoryUserId,
            game_type: 'hockey',
            bet_type: 'ton',
            amount: data.total_pot,
            item_name: '',
            kind: 'win',
          }),
        }).catch(() => {});
      } else {
        onToast?.('😔 ' + data.winner_name + ' побеждает!', 'error');
      }
      setPhase('result');
    });
    socket.on('disconnect', () => { console.log('[PvP2] Socket disconnected'); });
    socketRef.current = socket;
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      socket.disconnect();
    };
  }, []);
useEffect(() => {
    if (phase === 'playing') {
      const timer = setTimeout(() => { startPuckAnimation(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  // После показа результата через 3 сек автоматически возвращаемся в setup
  useEffect(() => {
    if (phase === 'result') {
      const t = setTimeout(() => { reset(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // Мгновенная «территория» игрока: рисуется сразу после ставки, пока сервер
  // не пришлёт официальные фигуры в hockey_started (соло-игра — вся арена).
  const generateShape = (existing: Shape[], bet: number, isPlayer: boolean): Shape => {
    const totalBet = bet + existing.reduce((sum, sh) => sum + sh.bet, 0);
    const w = Math.max(FIELD_W * (bet / totalBet), 1);
    return {
      x: existing.reduce((sum, sh) => sum + sh.w, 0),
      y: 0,
      w,
      h: FIELD_H,
      hue: isPlayer ? 270 : 35,
      bet,
      playerId: isPlayer ? (userIdRef.current || 'local_player') : 'opponent',
      winner: false,
    };
  };

  const createGame = () => {
    const bet = parseFloat(betInput);
    if (isNaN(bet) || bet <= 0) { onToast?.('Enter a valid bet amount', 'error'); return; }
    if (bet > balance) { onToast?.('Insufficient balance', 'error'); return; }
    if (isJoining) return;
    const socket = socketRef.current;
    if (!socket) { onToast?.('Connection not ready, try again', 'error'); return; }
    setIsJoining(true);
    try {
      // Списание — ровно один раз за нажатие (вызывается только здесь, вне эффектов)
      onUpdateBalance(-bet);
      // Мгновенно показываем территорию игрока (соло-игра занимает 100% арены)
      const newShape = generateShape([], bet, true);
      setShapes([newShape]);
      // Только реальный Telegram ID из useTelegram; socket.id не используем
      const uid = user?.id?.toString() || 'unknown';
      userIdRef.current = uid;
      socket.emit('hockey_bet', { user_id: uid, username: 'You', bet });
      // Записываем ставку в историю
      const historyUserId = String(user?.id ?? uid);
      fetch(`${CONFIG.API_URL}/api/add_bet_history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          user_id: historyUserId,
          game_type: 'hockey',
          bet_type: 'ton',
          amount: bet,
          item_name: '',
        }),
      }).catch(() => {});
      onToast?.('Bet placed! Waiting for the round...', 'info');
    } catch (err) {
      console.error('[PvP2] Bet error:', err);
      onToast?.('Failed to place bet, try again', 'error');
      // Разблокируем кнопку ТОЛЬКО при ошибке (в finally — не сбрасываем!)
      setIsJoining(false);
    }
    // Намеренно НЕ сбрасываем isJoining здесь: кнопка остаётся заблокированной,
    // пока не придёт hockey_started или не истечёт таймер (hockey_timer <= 0).
  };

  const renderArena = () => {
    const pid = 'stripe-pat';
    return (
      <svg viewBox={`0 0 ${FIELD_W} ${FIELD_H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
        <defs>
          <pattern id={pid} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="transparent" />
            <rect width="4" height="8" fill="rgba(0,0,0,0.15)" />
          </pattern>
          <radialGradient id="puck-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="#1a1a2e" rx="8" ry="8" />
        <line x1={FIELD_W/2} y1="0" x2={FIELD_W/2} y2={FIELD_H} stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="6,4" />
        <circle cx={FIELD_W/2} cy={FIELD_H/2} r={40} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        {shapes.map((shape) => (
          <g key={shape.playerId}>
            <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="4" ry="4"
              fill={'hsl('+shape.hue+',70%,'+(shape.winner?'55%':'45%')+')'} fillOpacity="0.85"
              stroke={shape.winner?'#22c55e':'#000'} strokeWidth={shape.winner?3:1.5}
              style={{transition:'stroke 0.3s,fill 0.3s',filter:shape.winner?'drop-shadow(0 0 8px rgba(34,197,94,0.7))':'none'}} />
            <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="4" ry="4" fill={`url(#${pid})`} pointerEvents="none" />
            {(shape.w<10||shape.h<10)&&<rect x={shape.x-1} y={shape.y-1} width={shape.w+2} height={shape.h+2} rx="4" ry="4" fill="none" stroke="#fff" strokeWidth={2} pointerEvents="none" />}
          </g>
        ))}
        {(phase==='playing'||phase==='result')&&<g ref={attachPuckRef} style={{willChange:'transform'}}>
          <circle cx={0} cy={0} r={16} fill="url(#puck-glow)" />
          <circle cx={0} cy={0} r={PUCK_R} fill="#fff" stroke="#000" strokeWidth={1.5} />
        </g>}
      </svg>
    );
  };
const bet = parseFloat(betInput)||0;
  const displayPot = totalPot>0?totalPot:bet;

  return (
    <div style={{padding:spacing.md,color:colors.text,maxWidth:500,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:spacing.md}}>
        <Swords size={24} color={colors.primary} />
        <h2 style={{margin:0,fontSize:22,fontWeight:'bold'}}>🏒 Hockey Global</h2>
      </div>
      <div style={{aspectRatio:'5/3',maxWidth:400,margin:'0 auto',marginBottom:spacing.md,background:'#0f0f13',border:'2px solid #a855f7',borderRadius:12,overflow:'hidden'}}>
        {renderArena()}
      </div>
      <div style={{background:colors.bgCard,border:'1px solid '+colors.border,borderRadius:16,padding:spacing.md}}>
        {phase==='playing'&&<div style={{textAlign:'center'}}>
          <div style={{fontSize:16,fontWeight:'bold',color:colors.success,marginBottom:8}}>🏒 Игра идёт!</div>
          <div style={{fontSize:13,color:colors.textMuted}}>Шайба движется...</div>
          {players.length>0&&<div style={{display:'flex',justifyContent:'space-around',marginTop:12,fontSize:13}}>
            {players.map((p,i)=><div key={i} style={{color:colors.textMuted}}>{p.username}: {p.bet.toFixed(1)} TON</div>)}
          </div>}
        </div>}
        {phase==='result'&&<div style={{textAlign:'center'}}>
          <div style={{fontSize:18,fontWeight:'bold',color:winnerId===userIdRef.current?colors.success:colors.text,marginBottom:8}}>
            {winnerId===userIdRef.current?'🎉 Вы победили!':(players.find(p=>p.user_id===winnerId)?.username||'Соперник')+' побеждает!'}
          </div>
          <div style={{fontSize:14,color:colors.textMuted,marginBottom:12}}>
            {winnerId===userIdRef.current?'Вы забираете банк!':((players.find((p)=>p.user_id===winnerId)?.username||'Соперник')+' забирает банк!')}
          </div>
          <div style={{fontSize:22,fontWeight:'bold',color:colors.success}}>+{displayPot.toFixed(2)} TON</div>
          <div style={{fontSize:12,color:colors.textMuted,marginTop:6}}>Комиссия казино: 2.5%</div>
        </div>}
        {phase==='setup'&&<>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,fontSize:13}}>
            <span style={{color:colors.textMuted}}>⏳ Round starts in</span>
            <span style={{color:colors.primary,fontWeight:'bold',fontSize:16}}>{waitSeconds}s</span>
          </div>
          {players.length>0&&<div style={{marginBottom:12,padding:'8px 12px',background:'rgba(168,85,247,0.08)',borderRadius:10,fontSize:12}}>
            <div style={{color:colors.primary,fontWeight:'bold',marginBottom:4}}>Players in pool ({players.length})</div>
            {players.map((p,i)=><div key={i} style={{color:colors.textMuted,display:'flex',justifyContent:'space-between',padding:'2px 0'}}>
              <span>{p.username}</span><span style={{color:colors.gold}}>{p.bet.toFixed(1)} TON</span>
            </div>)}
          </div>}
          <div style={{color:colors.textMuted,fontSize:13,marginBottom:8}}>Bet (TON)</div>
          <div style={{position:'relative',marginBottom:12}}>
            <Coins size={18} color={colors.gold} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)'}} />
            <input type="number" min="0" step="0.1" value={betInput} onChange={(e)=>setBetInput(e.target.value)}
              style={{width:'100%',padding:'12px 12px 12px 40px',background:'rgba(0,0,0,0.4)',border:'1px solid '+colors.border,borderRadius:12,color:colors.text,fontSize:16,fontWeight:'bold',outline:'none',boxSizing:'border-box'}} />
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            {[0.5,1,2,5].map((val)=>(
              <button key={val} onClick={()=>setBetInput(String(val))}
                style={{flex:1,padding:'8px 0',background:bet===val?colors.bgCardActive:'rgba(255,255,255,0.05)',border:'1px solid '+(bet===val?colors.borderActive:colors.border),borderRadius:10,color:colors.text,fontSize:13,fontWeight:'bold',cursor:'pointer'}}>
                {val} TON
              </button>
            ))}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:16,fontSize:13}}>
            <span style={{color:colors.textMuted}}>Balance</span>
            <span style={{color:colors.gold,fontWeight:'bold'}}>{balance.toFixed(2)} TON</span>
          </div>
          <Button fullWidth onClick={createGame} size="lg" disabled={isJoining}><Swords size={20} /> {isJoining ? 'Поиск соперника...' : 'Сделать ставку'}</Button>
        </>}
        {phase==='result'&&<div style={{marginTop:12}}><Button fullWidth variant="ghost" onClick={reset}>Играть заново</Button></div>}
      </div>
    </div>
  );
};