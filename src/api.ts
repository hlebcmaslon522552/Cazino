import { initData } from '@tma.js/sdk-react';
import { CONFIG } from './config';

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
  status?: string; // 'available' | 'hold' (на выводе) | 'sold'
}



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
  const url = `${CONFIG.API_URL}/api/balance?user_id=${userId}`;
  const res = await fetch(url, {
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

export async function fetchInventory(initData: string, userId: string): Promise<InventoryItem[]> {
  try {
    const url = `${CONFIG.API_URL}/api/inventory?user_id=${userId}`;

    // Отправляем X-Init-Data ТОЛЬКО если он реально доступен.
    // Если initData пуст/невалиден — сервер может вернуть 403,
    // поэтому при его отсутствии заголовок просто не добавляем.
    const tgInitData = window.Telegram?.WebApp?.initData || '';
    const effectiveInitData = initData || tgInitData;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    };
    if (effectiveInitData) {
      headers['X-Init-Data'] = effectiveInitData;
    }

    const res = await fetch(url, { headers });

    // 403 (нет/невалидный initData) НЕ ломает интерфейс:
    // просто показываем пустой инвентарь (или сообщение «Нет данных»).
    if (res.status === 403) {
      return [];
    }
    if (!res.ok) {
      throw new Error(`fetchInventory failed: ${res.status} ${res.statusText}`);
    }
    const data: InventoryItem[] = await res.json();
    return data;
  } catch (err) {
    return [];
  }
}

export async function topUpTon(_initData: string, _amount: number): Promise<boolean> {
  // ЗАГЛУШКА
  return new Promise((resolve) => setTimeout(() => resolve(true), 500));
}

export async function topUpStars(_initData: string, _amount: number): Promise<boolean> {
  return new Promise((resolve) => setTimeout(() => resolve(true), 500));
}

export const addToInventory = async (item: any, userId: string): Promise<boolean> => {
  try {
    const url = `${CONFIG.API_URL}/api/inventory/add`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'ngrok-skip-browser-warning': 'true' 
      },
      body: JSON.stringify({ user_id: userId, item: item })
    });
    return res.ok; // true, если сервер ответил 200 OK
  } catch (e) {
    console.error('Ошибка добавления в инвентарь:', e);
    return false;
  }
};

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
  const url = `${CONFIG.API_URL}/api/sell_nft`;
  const res = await fetch(url, {
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
  const url = `${CONFIG.API_URL}/api/withdraw_nft`;
  const res = await fetch(url, {
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
  // Берём userId из SDK (signal state), а не из window.Telegram
  const sdkUser = initData.state()?.user;
  const userId = String(sdkUser?.id ?? '6267608438');
  const data = await fetchUserData(userId);
  return data.balance_ton;
};

export const getFloorPrice = async (collectionName: string) => {
  const url = `${CONFIG.API_URL}/api/get_floor?collection=${collectionName}`;
  const res = await fetch(url, {
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

// ── Daily Tasks API ────────────────────────────────────────────────

export interface DailyTask {
  id: string;
  title: string;
  goal: number;
  reward: number;
  progress: number;
  claimed: boolean;
}

export interface TasksResponse {
  tasks: DailyTask[];
}

export const fetchTasks = async (userId: string): Promise<DailyTask[]> => {
  const url = `${CONFIG.API_URL}/api/tasks?user_id=${userId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    if (!res.ok) {
      return [];
    }
    const data: TasksResponse = await res.json();
    return data.tasks || [];
  } catch (err) {
    return [];
  }
};

export interface ClaimTaskResult {
  success: boolean;
  reward: number;
  balance_ton: number;
}

export const claimTask = async (userId: string, taskId: string): Promise<ClaimTaskResult | null> => {
  const url = `${CONFIG.API_URL}/api/tasks/claim`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ user_id: userId, task_id: taskId }),
    });
    if (!res.ok) {
      return null;
    }
    const data: ClaimTaskResult = await res.json();
    return data;
  } catch (err) {
    return null;
  }
};