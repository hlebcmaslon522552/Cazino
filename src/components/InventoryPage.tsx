import { useState, useEffect } from 'react';
import { colors, spacing } from '../theme';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Modal } from './ui/Modal';
import { sellNft, getFloorPrice, fetchInventory } from '../api';
import { useTelegram } from '../hooks/useTelegram';
import { publicUrl } from '../helpers/publicUrl';
import { CONFIG } from '../config';

interface Props {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  /** Вызывается после продажи NFT, чтобы Header обновил баланс */
  onBalanceChange?: () => void;
}

interface Nft {
  id: number;
  name: string;
  image: string;
  collection?: string;
  floor: number;
}

// Курс для пересчета TON в звезды
const MARKET_FEE = 0.15; // 15% комиссия маркета
const STARS_USD = 0.0133; // Курс звезды в долларах
const TON_USD = 5.5; // Примерный курс TON в долларах

function calcStars(floorTon: number): number {
  const usd = floorTon * TON_USD; 
  const afterFee = usd * (1 - MARKET_FEE); 
  return Math.round(afterFee / STARS_USD); 
}

export function InventoryPage({ onToast, onBalanceChange }: Props) {
  const [selected, setSelected] = useState<Nft | null>(null);
  const [items, setItems] = useState<Nft[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellingItemId, setSellingItemId] = useState<number | null>(null);
  const { haptic, vibrate, initData, user } = useTelegram();

  // Загружаем инвентарь с сервера
  useEffect(() => {
    const loadNfts = async () => {
      try {
        const userId = String(user?.id ?? '6267608438');
        const data = await fetchInventory(initData, userId);

        // Для каждого NFT: если floor === null — запрашиваем цену с сервера
        const itemsWithPrices = await Promise.all(
          data.map(async (item: any) => {
            let floor = item.floor ?? item.price ?? 0;
            if (floor === 0 && item.collection) {
              try {
                const priceData = await getFloorPrice(item.collection);
                floor = priceData.floor_price ?? priceData.price ?? 0;
              } catch (err) {
                console.warn('Не удалось получить флор для', item.collection, err);
              }
            }
            return {
              id: Number(item.id ?? Date.now() + Math.random()),
              name: item.name || 'Unknown',
              image: item.image || '',
              collection: item.collection,
              floor: floor,
            } as Nft;
          })
        );

        setItems(itemsWithPrices);
        setLoading(false);
      } catch (err) {
        console.error('Ошибка загрузки инвентаря:', err);
        onToast('Не удалось загрузить инвентарь', 'error');
        setLoading(false);
      }
    };

    loadNfts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSell = async () => {
    if (!selected) return;
    haptic('medium');
    
    try {
      const userId = String(user?.id ?? '6267608438');
      await sellNft(selected.id, initData, selected.floor, userId);
      vibrate('success');
      onToast('Продано!', 'success');
      onBalanceChange?.();

      // Удаляем предмет из сетки
      setItems((prev) => prev.filter((i) => i.id !== selected.id));
      setSelected(null);
    } catch (err) {
      console.error('Ошибка продажи:', err);
      onToast('Ошибка при продаже', 'error');
    }
  };

  /** Быстрая продажа прямо из карточки (без открытия модалки) */
  const handleQuickSell = async (item: Nft) => {
    haptic('medium');
    setSellingItemId(item.id);
    try {
      const userId = String(user?.id ?? '6267608438');
      await sellNft(item.id, initData, item.floor, userId);
      vibrate('success');
      onToast('Продано!', 'success');
      onBalanceChange?.();
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      // Синхронизируем с localStorage
      try {
        const raw = localStorage.getItem('inventory');
        const local: Nft[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem('inventory', JSON.stringify(local.filter((i) => i.id !== item.id)));
      } catch {}
    } catch (err) {
      console.error('Ошибка продажи:', err);
      onToast('Ошибка при продаже', 'error');
    } finally {
      setSellingItemId(null);
    }
  };

  const handleWithdraw = async () => {
    if (!selected) return;
    haptic('medium');

    try {
      const userId = String(user?.id ?? '6267608438');
      const username = user?.username || 'unknown';

      const res = await fetch(`${CONFIG.API_URL}/api/withdraw_nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          username: username,
          nft_name: selected.name,
          nft_price: selected.floor,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка при отправке заявки');
      }

      vibrate('success');
      onToast('Заявка на вывод отправлена администратору. Ожидайте.', 'success');
      setSelected(null);
    } catch (err) {
      console.error('Ошибка при выводе:', err);
      onToast('Ошибка при отправке заявки', 'error');
    }
  };

  // Экран загрузки
  if (loading) {
    return (
      <div style={{ padding: spacing.md, color: colors.text }}>
        <h1 style={{ marginTop: 0 }}>🎒 Инвентарь</h1>
        <p style={{ color: colors.textMuted, textAlign: 'center', marginTop: 50 }}>
          Загрузка инвентаря...
        </p>
      </div>
    );
  }

  // Если пусто
  if (items.length === 0) {
    return (
      <div style={{ padding: spacing.md, color: colors.text, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
        <div style={{ textAlign: 'center' }}>
          <img
            src={publicUrl('NO_Inventory.png')}
            alt="Нет предметов"
            style={{ width: '60%', maxWidth: 200, opacity: 0.7 }}
          />
          <p style={{ color: colors.textMuted, marginTop: 16 }}>
            Нет NFT
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: spacing.md, color: colors.text }}>
      <h1 style={{ marginTop: 0 }}>🎒 Инвентарь</h1>
      <p style={{ color: colors.textMuted, marginTop: -8 }}>{items.length} NFT</p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 12, marginTop: spacing.md,
      }}>
        {items.map((nft) => (
          <Card key={nft.id} onClick={() => { haptic('light'); setSelected(nft); }}>
            <img src={nft.image || publicUrl('NO_Inventory.png')} alt={nft.name} style={{
              width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 12,
            }} />
            <div style={{
              marginTop: 8, color: colors.accent,fontSize: 12, fontWeight: 'bold', letterSpacing: 1, textAlign: 'center',
            }}>
              {nft.name}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              {nft.floor > 0 ? `${nft.floor.toFixed(2)} TON` : '— TON'}
            </div>
            <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                fullWidth
                loading={sellingItemId === nft.id}
                onClick={() => handleQuickSell(nft)}
              >
                💸 Продать
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Модалка предмета */}
      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div style={{ textAlign: 'center' }}>
            <img src={selected.image || publicUrl('NO_Inventory.png')} alt={selected.name} style={{
              width: '80%', maxWidth: '200px', borderRadius: 12, marginBottom: 12,
            }} />
            <div style={{ fontWeight: 'bold', fontSize: 18 }}>{selected.name}</div>
            <div style={{ color: colors.accent, marginTop: 4, fontWeight: 'bold', fontSize: 16 }}>
              {selected.floor > 0 ? `${selected.floor.toFixed(2)} TON` : '— TON'}
            </div>

            <div style={{ marginTop: spacing.lg, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button fullWidth onClick={handleSell}>
                💸 Продать за {calcStars(selected.floor).toLocaleString()} ⭐
              </Button>
              <Button fullWidth variant="secondary" onClick={handleWithdraw}>
                📤 Вывести (холд 1 час)
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setSelected(null)}>
                Отмена
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}