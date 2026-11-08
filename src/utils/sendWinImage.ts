import { CONFIG } from '../config';
import { generateWinImage } from './generateWinImage';

export interface WinImageParams {
  user_id: string;
  gameType: string;
  username?: string;
  multiplier: number;
  winAmount: number;
  betAmount?: number;
  extraInfo?: string;
}

/**
 * Отправляет админу «скриншот» крупного выигрыша.
 *
 * 1. Генерирует картинку на Canvas (клиентская генерация) и отправляет её
 *    base64 на /api/send_win_image. Сервер проверяет сумму по bet_history
 *    (анти-подделка) и шлёт админу фото.
 * 2. Если картинка не сгенерировалась (нет Canvas и т.п.) — отправляем на
 *    сервер запрос БЕЗ картинки, и сервер уходит в резервный текстовый
 *    режим (sendMessage вместо sendPhoto).
 */
export async function sendWinImage(params: WinImageParams): Promise<boolean> {
  // 1. Генерация картинки на клиенте (необязательна — есть текстовый фолбэк)
  let imageBase64 = '';
  try {
    imageBase64 = await generateWinImage({
      gameType: params.gameType,
      username: params.username || 'Player',
      multiplier: params.multiplier,
      winAmount: params.winAmount,
      extraInfo: params.extraInfo ?? (params.betAmount != null ? `Ставка: ${params.betAmount} TON` : undefined),
    });
  } catch (err) {
    console.error('[sendWinImage] Не удалось сгенерировать картинку, шлём текст:', err);
  }

  // 2. Отправка на сервер
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/send_win_image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({
        user_id: params.user_id,
        game_type: params.gameType,
        multiplier: params.multiplier,
        win_amount: params.winAmount,
        image_base64: imageBase64,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[sendWinImage] Сервер отклонил запрос (${res.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sendWinImage] Ошибка сети:', err);
    return false;
  }
}