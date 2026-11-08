export interface WinImageData {
  gameType: string;
  username: string;
  multiplier: number;
  winAmount: number;
  extraInfo?: string;
}

/**
 * Рисует «экран игры» на Canvas (800x500) — с градиентом, рамкой и крупным
 * множителем, как реальный скриншот игрового заноса.
 * Возвращает base64-строку БЕЗ префикса "data:image/png;base64,".
 */
export async function generateWinImage(data: WinImageData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  // Фон (как в игре)
  const gradient = ctx.createLinearGradient(0, 0, 800, 500);
  gradient.addColorStop(0, '#0a0a1a');
  gradient.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 500);

  // Рамка
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 780, 480);

  // Текст
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🔥 КРУПНЫЙ ЗАНОС 🔥', 400, 60);

  ctx.fillStyle = '#a855f7';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(data.gameType.toUpperCase(), 400, 110);

  ctx.fillStyle = '#e5e7eb';
  ctx.font = '22px Arial';
  ctx.fillText(`@${data.username}`, 400, 150);

  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 100px Arial';
  ctx.fillText(`${data.multiplier}x`, 400, 270);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 36px Arial';
  ctx.fillText(`💰 ${data.winAmount.toFixed(2)} TON`, 400, 340);

  if (data.extraInfo) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '20px Arial';
    ctx.fillText(data.extraInfo, 400, 390);
  }

  ctx.fillStyle = '#6b7280';
  ctx.font = '18px Arial';
  ctx.fillText('🎰 Играй и выигрывай!', 400, 450);

  // Возвращаем base64 без префикса
  return canvas.toDataURL('image/png').split(',')[1];
}