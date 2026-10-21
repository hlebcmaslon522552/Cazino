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

const API_URL = 'http://192.168.31.221:8000';

/**
 * fetchUserData — запрашивает баланс пользователя по user_id.
 * Сервер возвращает { balance_ton: number }.
 */
export const fetchUserData = async (userId: string) => {
  const res = await fetch(`${API_URL}/api/balance?user_id=${userId}`);
  if (!res.ok) {
    throw new Error(`fetchUserData failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ balance_ton: number }>;
};

export async function fetchInventory(initData: string): Promise<InventoryItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/inventory`, {
      headers: { 'X-Init-Data': initData },
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
 */
export function addToInventory(item: InventoryItem): void {
  try {
    const raw = localStorage.getItem('inventory');
    const list: InventoryItem[] = raw ? JSON.parse(raw) : [];
    // Избегаем дубликатов по id
    if (!list.some((i) => i.id === item.id)) {
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

export async function sellNft(itemId: number, initData: string): Promise<{ stars: number }> {
  const res = await fetch(`${API_URL}/api/sell_nft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Init-Data': initData,
    },
    body: JSON.stringify({ item_id: itemId }),
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
      'X-Init-Data': initData,
    },
    body: JSON.stringify({ item_id: itemId }),
  });
  if (!res.ok) {
    throw new Error(`withdrawNft failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
let mockBalance = 15.0; // Стартовый баланс (15 TON)

export async function getBalance(_initData: string): Promise<number> {
  return mockBalance;
}

export async function updateBalance(_initData: string, amount: number): Promise<number> {
  mockBalance += amount;
  return mockBalance;
}

export const getFloorPrice = async (collectionName: string) => {
  const res = await fetch(`http://localhost:8000/api/get_floor?collection=${collectionName}`);
  if (!res.ok) {
    throw new Error(`getFloorPrice failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
};