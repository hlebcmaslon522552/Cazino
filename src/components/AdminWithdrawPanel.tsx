import { useState, useEffect } from 'react';
import { CONFIG } from '../config';

interface Request {
  id: number;
  user_id: string;
  name: string;
  image?: string;
  floor: number;
  timestamp: string;
}

export function AdminWithdrawPanel({ onClose }: { onClose: () => void }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${CONFIG.API_URL}/api/admin/requests?user_id=6267608438`)
      .then(res => res.json())
      .then(data => setRequests(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAction = async (inventoryId: number, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/admin/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: '6267608438',
          inventory_id: inventoryId,
          action,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Ошибка сервера: ${res.status}`);
      }

      // Удаляем заявку из списка только при успешном ответе
      setRequests(prev => prev.filter(r => r.id !== inventoryId));
    } catch (err: any) {
      console.error('[AdminWithdrawPanel] Action error:', err);
      alert(`Ошибка: ${err.message}`);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      zIndex: 999999, padding: 20, overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: '#fff' }}>Заявки на вывод</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24 }}>✕</button>
      </div>
      {loading ? (
        <div style={{ color: '#fff' }}>Загрузка...</div>
      ) : requests.length === 0 ? (
        <div style={{ color: '#9ca3af' }}>Нет заявок</div>
      ) : (
        requests.map(req => (
          <div key={req.id} style={{
            background: '#1c1c1e', padding: 16, borderRadius: 12, marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {req.image && (
                <img src={req.image} alt={req.name}
                  style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{req.name}</div>
              <div style={{ color: '#fbbf24', fontSize: 12 }}>{req.floor} TON</div>
              <div style={{ color: '#6b7280', fontSize: 10 }}>ID: {req.id}</div>
            </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleAction(req.id, 'approve')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8 }}>✅</button>
              <button onClick={() => handleAction(req.id, 'reject')} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 8 }}>❌</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}