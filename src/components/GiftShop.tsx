import { useState, useEffect } from 'react';
import { Coins, ShoppingBag, Loader } from 'lucide-react';
import { CONFIG } from '../config';
import { useTelegram } from '../hooks/useTelegram';

interface NftItem {
  id: string;
  name: string;
  image: string;
  collection: string;
  floor: number;
}

interface GiftShopProps {
  balance: number;
  onUpdateBalance: (amount: number) => void;
  onToast?: (msg: string, type: 'success' | 'error') => void;
}

export function GiftShop({ balance, onUpdateBalance, onToast }: GiftShopProps) {
  const [items, setItems] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const { user } = useTelegram();

  useEffect(() => {
    fetch('/my_nfts.json')
      .then(res => res.json())
      .then((data: NftItem[]) => {
        // Фильтруем только те, у которых цена > 0
        setItems(data.filter(item => item.floor > 0));
        setLoading(false);
      })
      .catch(err => {
        console.error('Ошибка загрузки маркета:', err);
        onToast?.('Не удалось загрузить товары', 'error');
        setLoading(false);
      });
  }, []);

  const handleBuy = async (item: NftItem) => {
    if (buyingId) return;
    if (item.floor > balance) {
      onToast?.('Недостаточно TON', 'error');
      return;
    }

    setBuyingId(item.id);

    try {
      // Используем серверный эндпоинт /api/buy_nft,
      // который сам проверяет баланс, списывает TON и добавляет в инвентарь
      const userId = String(user?.id ?? '6267608438');
      const res = await fetch(`${CONFIG.API_URL}/api/buy_nft`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'ngrok-skip-browser-warning': 'true' 
        },
        body: JSON.stringify({ user_id: userId, item: item })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        // Сервер сам списал TON — обновляем баланс из ответа
        if (typeof data.new_balance === 'number') {
          onUpdateBalance(data.new_balance - balance);
        } else {
          // fallback: списываем локально
          onUpdateBalance(-item.floor);
        }
        onToast?.(`🎉 ${item.name} куплен и отправлен в инвентарь!`, 'success');
      } else {
        // Сервер вернул ошибку — TON не списываем
        onToast?.(data.error || 'Ошибка. Деньги не списаны', 'error');
      }
    } catch (err) {
      console.error('Ошибка покупки:', err);
      onToast?.('Ошибка. Деньги не списаны', 'error');
      // Баланс не трогаем — списания не было
    } finally {
      setBuyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white p-4 mt-20">
        <Loader size={32} className="animate-spin text-gray-400 mb-4" />
        <p className="text-gray-400">Загрузка маркета...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-white p-4 overflow-y-auto font-sans">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingBag size={24} className="text-purple-400" />
        <h1 className="text-2xl font-black">Маркет NFT</h1>
      </div>

      <div className="flex items-center gap-2 mb-4 bg-[#1a1a2e] rounded-xl px-4 py-3 border border-gray-800">
        <Coins size={18} className="text-yellow-500" />
        <span className="text-sm text-gray-400">Баланс:</span>
        <span className="text-lg font-bold">{balance.toFixed(2)} TON</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-[#1a1a2e] rounded-2xl border border-white/10 overflow-hidden flex flex-col"
          >
            <div className="aspect-[4/3] bg-[#0f0f13] overflow-hidden">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="p-3 flex flex-col gap-2 flex-1">
              <div>
                <p className="text-sm font-bold text-white truncate">{item.name}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <Coins size={12} className="text-yellow-500" />
                  {item.floor.toFixed(2)} TON
                </p>
              </div>
              <button
                onClick={() => handleBuy(item)}
                disabled={buyingId === item.id || item.floor > balance}
                className={`w-full mt-auto py-2 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${
                  buyingId === item.id
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : item.floor > balance
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow-lg hover:opacity-90'
                }`}
              >
                {buyingId === item.id ? (
                  <span className="flex items-center justify-center gap-1">
                    <Loader size={14} className="animate-spin" /> Покупка...
                  </span>
                ) : (
                  'Купить'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-20 text-gray-500">
          <ShoppingBag size={48} className="mb-4 opacity-50" />
          <p>Товары временно недоступны</p>
        </div>
      )}
    </div>
  );
}