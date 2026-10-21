import { colors, spacing } from '../theme';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface NewsItem {
  title: string;
  text: string;
  imageUrl: string;
}

interface Props {
  onBack: () => void;
}

export function NewsPage({ onBack }: Props) {
  const raw = localStorage.getItem('app_news');
  const news: NewsItem[] = raw ? JSON.parse(raw) : [];

  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Назад
      </Button>

      <h1 style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>📰 Новости</h1>

      {news.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 48, color: colors.textMuted }}>
          <p style={{ fontSize: 18 }}>📭</p>
          <p>Новостей пока нет</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {news.map((item, index) => (
            <Card key={index}>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    marginBottom: 12,
                    objectFit: 'cover',
                    maxHeight: 200,
                  }}
                />
              )}
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18 }}>{item.title}</h3>
              <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>{item.text}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}