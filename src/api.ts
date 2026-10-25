import { initData } from '@tma.js/sdk-react';

// Заглушка. Позже заменишь на реальные запросы к твоему Python-боту.
// Бот должен отдавать данные по initData — проверять её на бэке.

export interface UserData {
  balance_ton: number;
  balance_stars: number;
  inventory_count: number;
}

export interface InventoryItem {
  id: number;
  model: string;
  image: string;
  floor: number;
}

const API_URL = 'https://cazino-api.fxtun.ru';

export const getInitData = (): string => {
  try {
    // Используем SDK v3 для получения сырой строки
    return initData.raw || '';
  } catch (e) {
    return '';
  }
};

/**
 * fetchUserData — запрашивает баланс пользователя по user_id.
 * Сервер возвращает { balance_ton: number }.
 */
export const fetchUserData = async (userId: string) => {
  const res = await fetch(`${API_URL}/api/balance?user_id=${userId}`, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });
  if (!res.ok) {
    throw new Error(`fetchUserData failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ balance_ton: number }>;
};

export async function fetchInventory(initData: string): Promise<InventoryItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/inventory`, {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'X-Init-Data': initData,
      },
    });
    if (!res.ok) {
      throw new Error(`fetchInventory failed: ${res.status} ${res.statusText}`);
    }
    const data: InventoryItem[] = await res.json();
    // Если API вернул данные — синхронизируем в localStorage
    if (Array.isArray(data) && data.length > 0) {
      localStorage.setItem('inventory', JSON.stringify(data));
    }
    return data;
  } catch (err) {
    console.warn('fetchInventory error, fallback to localStorage:', err);
    return loadInventoryFromLocal();
  }
}

export async function topUpTon(_initData: string, amount: number): Promise<boolean> {
  // ЗАГЛУШКА
  console.log('topUpTon', amount);
  return new Promise((resolve) => setTimeout(() => resolve(true), 500));
}

export async function topUpStars(_initData: string, amount: number): Promise<boolean> {
  console.log('topUpStars', amount);
  return new Promise((resolve) => setTimeout(() => resolve(true), 500));
}

/**
 * addToInventory — сохраняет предмет в localStorage (ключ 'inventory')
 * как запасной вариант, если бэкенд не отвечает.
 * Принимает любой объект (InventoryItem, DropItem и т.д.)
 */
export function addToInventory(item: unknown): void {
  try {
    const raw = localStorage.getItem('inventory');
    const list: unknown[] = raw ? JSON.parse(raw) : [];
    // Избегаем дубликатов по id (если есть)
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord.id != null) {
      if (!list.some((i) => (i as Record<string, unknown>).id === itemRecord.id)) {
        list.push(item);
        localStorage.setItem('inventory', JSON.stringify(list));
      }
    } else {
      list.push(item);
      localStorage.setItem('inventory', JSON.stringify(list));
    }
  } catch (e) {
    console.warn('addToInventory localStorage error:', e);
  }
}

/**
 * loadInventoryFromLocal — читает инвентарь из localStorage.
 */
export function loadInventoryFromLocal(): InventoryItem[] {
  try {
    const raw = localStorage.getItem('inventory');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function sellNft(
  itemId: number,
  initData: string,
  price: number,
  userId: string,
): Promise<{ success: boolean; new_balance: number }> {
  const res = await fetch(`${API_URL}/api/sell_nft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'X-Init-Data': initData,
    },
    body: JSON.stringify({ user_id: userId, price }),
  });
  if (!res.ok) {
    throw new Error(`sellNft failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function withdrawNft(itemId: number, initData: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/withdraw_nft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'X-Init-Data': initData,
    },
    body: JSON.stringify({ item_id: itemId }),
  });
  if (!res.ok) {
    throw new Error(`withdrawNft failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
/**
 * getBalance — реальный запрос баланса пользователя через fetchUserData.
 * Извлекает userId из Telegram WebApp или использует значение по умолчанию.
 */
export const getBalance = async (): Promise<number> => {
  const userId = String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id ?? '6267608438');
  const data = await fetchUserData(userId);
  return data.balance_ton;
};

export const getFloorPrice = async (collectionName: string) => {
  const res = await fetch(`${API_URL}/api/get_floor?collection=${collectionName}`, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  });
  if (!res.ok) {
    throw new Error(`getFloorPrice failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
};