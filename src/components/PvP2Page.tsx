import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const PvP2Page = ({ balance, onUpdateBalance, onToast }: PvP2PageProps) => {
  const { user } = useTelegram();
  const [betInput, setBetInput] = useState('1.0');
  const [phase, setPhase] = useState<Phase>('setup');
  const [players, setPlayers] = useState<Player[]>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [totalPot, setTotalPot] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(15);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [puckPos, setPuckPos] = useState({ x: FIELD_W / 2, y: FIELD_H / 2 });

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

  const startPuckAnimation = () => {
    puckXRef.current = FIELD_W / 2;
    puckYRef.current = FIELD_H / 2;
    puckVxRef.current = randomRange(-3, 3);
    puckVyRef.current = randomRange(-3, 3);
    puckStartTimeRef.current = performance.now();
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
      let vx = puckVxRef.current;
      let vy = puckVyRef.current;
      let px = puckXRef.current + vx;
      let py = puckYRef.current + vy;
      if (px < PUCK_R) { px = PUCK_R; vx = -vx; }
      else if (px > FIELD_W - PUCK_R) { px = FIELD_W - PUCK_R; vx = -vx; }
      if (py < PUCK_R) { py = PUCK_R; vy = -vy; }
      else if (py > FIELD_H - PUCK_R) { py = FIELD_H - PUCK_R; vy = -vy; }
      puckXRef.current = px;
      puckYRef.current = py;
      puckVxRef.current = vx;
      puckVyRef.current = vy;
      setPuckPos({ x: px, y: py });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  };
  useEffect(() => {
    const socket = io(CONFIG.API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => {
      console.log('[PvP2] Socket connected');
      userIdRef.current = socket.id || userIdRef.current;
    });
    socket.on('connect_error', (err: any) => {
      console.error('[PvP2] Socket connection error:', err.message);
    });
    // ── Глобальный таймер раунда (как Crash) ──
    socket.on('hockey_timer', (data: { timer: number }) => {
      setWaitSeconds(data.timer);
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
    });
    // ── Результат раунда (победитель от сервера) ──
    socket.on('hockey_result', (data: { winner_id: string; winner_name: string; total_pot: number }) => {
      setWinnerId(data.winner_id);
      setTotalPot(data.total_pot);
      setShapes((prev) => prev.map((s) => ({ ...s, winner: s.playerId === data.winner_id })));
      if (data.winner_id === userIdRef.current) {
        onUpdateBalance(data.total_pot);
        onToast?.('🏆 You won! +' + data.total_pot.toFixed(2) + ' TON', 'success');
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
        onToast?.('😔 ' + data.winner_name + ' wins!', 'error');
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

  const createGame = () => {
    const bet = parseFloat(betInput);
    if (isNaN(bet) || bet <= 0) { onToast?.('Enter a valid bet amount', 'error'); return; }
    if (bet > balance) { onToast?.('Insufficient balance', 'error'); return; }
    const socket = socketRef.current;
    const uid = socket?.id || 'local_' + Date.now();
    userIdRef.current = uid;
    if (socket) {
      socket.emit('hockey_bet', { user_id: uid, username: 'You', bet });
    }
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
        {(phase==='playing'||phase==='result')&&<g>
          <circle cx={puckPos.x} cy={puckPos.y} r={16} fill="url(#puck-glow)" />
          <circle cx={puckPos.x} cy={puckPos.y} r={PUCK_R} fill="#fff" stroke="#000" strokeWidth={1.5} />
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
            {winnerId===userIdRef.current?'🎉 You win!':(players.find(p=>p.user_id===winnerId)?.username||'Opponent')+' wins!'}
          </div>
          <div style={{fontSize:14,color:colors.textMuted,marginBottom:12}}>
            {winnerId&&players.find((p)=>p.user_id===winnerId)?.username} takes the pot!
          </div>
          <div style={{fontSize:22,fontWeight:'bold',color:colors.success}}>+{displayPot.toFixed(2)} TON</div>
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
          <Button fullWidth onClick={createGame} size="lg"><Swords size={20} /> Сделать ставку</Button>
        </>}
        {phase==='result'&&<div style={{marginTop:12}}><Button fullWidth variant="ghost" onClick={reset}>Play Again</Button></div>}
      </div>
    </div>
  );
};