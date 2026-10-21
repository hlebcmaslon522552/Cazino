import { colors, spacing } from '../theme';
import { publicUrl } from '../helpers/publicUrl';

interface Props {
  onOpen: (screen: 'upgrader' | 'case' | 'mines' | 'pvp' | 'plinko' | 'crash') => void;
}

interface GameDef {
  id: string;
  image: string;
}

const GAMES: GameDef[] = [
  { id: 'upgrader', image: 'Up.png' },
  { id: 'case', image: 'Cases.png' },
  { id: 'mines', image: 'Mines.png' },
  { id: 'pvp', image: 'PvP.png' },
  { id: 'plinko', image: 'PLINKO.png' },
  { id: 'crash', image: 'Crash.png' },
];

export function GamePage({ onOpen }: Props) {
  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <h1 style={{ marginTop: 0 }}>🎮 Игры</h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginTop: spacing.md,
        }}
      >
        {GAMES.map((g) => (
          <div
            key={g.id}
            onClick={() => onOpen(g.id as Parameters<Props['onOpen']>[0])}
            style={{
              position: 'relative',
              aspectRatio: '3 / 4',
              borderRadius: '16px',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
          >
            {/* Картинка фоном */}
            <img
              src={publicUrl(g.image)}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                zIndex: 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

