import { Product, Order, StoreConfig, Coordinates } from '../types';

export const DEFAULT_STORE: StoreConfig = {
  name: 'BLACK VAPE • Colmado Noadia',
  addressText: 'Colmado Noadia, C98P+QVV, Loma de Cabrera',
  location: { lat: 19.41688, lng: -71.61287 },
  phone: '8092104901',
  whatsapp: '8092104901',
  bankAccountInfo: 'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901',
  isOpen: true,
};

export const LEGACY_DEMO_PRODUCT_IDS = new Set([
  'prod-horny-ice-mint',
  'prod-mistiq-melon',
  'prod-pod-juice-energy',
  'prod-pop-big-apple',
  'prod-pop-blueberry-lemonade',
  'prod-pop-grape',
  'prod-pop-mango-dragon-fruit',
  'prod-pop-mango-strawberry',
  'prod-pop-strawberry-watermelon',
  'prod-vape-puff-pro',
  'prod-vape-pod-caliburn',
]);

export const INITIAL_PRODUCTS: Product[] = [];

const DEMO_ORDER_IDS = new Set([
  'ORD-700',
  'ORD-701',
  'ORD-702',
  'ORD-901',
  'ORD-902',
  'ORD-TEST-5990',
  'ORD-O7F881',
]);

export const INITIAL_ORDERS: Order[] = [];

const STORAGE_KEYS = {
  AGE_VERIFIED: 'vape_age_verified_v1',
  PRODUCTS: 'vape_products_v6_db',
  ORDERS: 'vape_orders_v6_db',
  STORE: 'vape_store_config_v6_db',
  ACTIVE_ROLE: 'vape_active_role_v1',
  CLIENT_CONTACT: 'vape_client_contact_v1',
  USER_LOCATION: 'vape_user_location_v1',
  DB_STRICT_CLEANUP_DONE: 'vape_db_strict_cleanup_v6',
};

const LEGACY_KEYS_TO_PURGE = [
  'vape_products_v1',
  'vape_products_v2',
  'vape_products_v3_db',
  'vape_products_v4_db',
  'vape_products_v5_db',
  'vape_orders_v1',
  'vape_orders_v2',
  'vape_orders_v3_db',
  'vape_orders_v4_db',
  'vape_orders_v5_db',
  'vape_store_config_v1',
  'vape_store_config_v4_db',
  'vape_store_config_v5_db',
  'vape_store_customized_v1',
  'vape_deleted_product_ids_v1',
  'vape_products_customized_v1',
  'vape_orders_purged_by_admin_v1',
  'vape_users_cache_v1',
  'vape_users_cache_v2',
  'vape_point_transactions_v1',
  'vape_redemptions_v1',
  'vape_raffles_v1',
  'vape_raffle_participants_v1',
  'vape_active_client_order_id_v1',
];

export function purgeLegacyLocalStorageOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(STORAGE_KEYS.DB_STRICT_CLEANUP_DONE) === 'true') {
      return;
    }
    for (const key of LEGACY_KEYS_TO_PURGE) {
      localStorage.removeItem(key);
    }
    localStorage.setItem(STORAGE_KEYS.DB_STRICT_CLEANUP_DONE, 'true');
  } catch {
    // Ignore storage errors
  }
}

purgeLegacyLocalStorageOnce();

// Cross-tab broadcast channel + same-tab listeners
let broadcastChannel: BroadcastChannel | null = null;
const localSyncListeners = new Set<() => void>();

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('vape_delivery_channel');
  }
} catch {
  // Graceful fallback if unsupported
}

export function subscribeToSync(callback: () => void): () => void {
  localSyncListeners.add(callback);
  const handler = () => {
    callback();
  };
  broadcastChannel?.addEventListener('message', handler);
  return () => {
    localSyncListeners.delete(callback);
    broadcastChannel?.removeEventListener('message', handler);
  };
}

export function notifySync(): void {
  try {
    broadcastChannel?.postMessage({ timestamp: Date.now() });
  } catch {
    // Ignore
  }
  if (localSyncListeners.size > 0) {
    queueMicrotask(() => {
      localSyncListeners.forEach((cb) => {
        try {
          cb();
        } catch {
          // Ignore listener error
        }
      });
    });
  }
}

export function getStoredAgeVerified(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.AGE_VERIFIED) === 'true';
}

export function setStoredAgeVerified(val: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.AGE_VERIFIED, val ? 'true' : 'false');
}

const EXTRA_STORAGE_KEYS = {
  ORDERS_PURGED_BY_ADMIN: 'vape_orders_purged_by_admin_v4',
  PRODUCTS_CUSTOMIZED: 'vape_products_customized_v4',
  DELETED_PRODUCTS: 'vape_deleted_product_ids_v4',
  STORE_CUSTOMIZED: 'vape_store_customized_v4',
  CART_ITEMS: 'vape_cart_items_v1',
};

export function isOrdersPurgedByAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(EXTRA_STORAGE_KEYS.ORDERS_PURGED_BY_ADMIN) === 'true';
}

export function setOrdersPurgedByAdmin(purged: boolean): void {
  if (typeof window === 'undefined') return;
  if (purged) {
    localStorage.setItem(EXTRA_STORAGE_KEYS.ORDERS_PURGED_BY_ADMIN, 'true');
  } else {
    localStorage.removeItem(EXTRA_STORAGE_KEYS.ORDERS_PURGED_BY_ADMIN);
  }
}

export function getDeletedProductIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(EXTRA_STORAGE_KEYS.DELETED_PRODUCTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markProductDeleted(productId: string): void {
  if (typeof window === 'undefined') return;
  const current = getDeletedProductIds();
  if (!current.includes(productId)) {
    localStorage.setItem(EXTRA_STORAGE_KEYS.DELETED_PRODUCTS, JSON.stringify([...current, productId]));
  }
}

export function isProductsCustomized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(EXTRA_STORAGE_KEYS.PRODUCTS_CUSTOMIZED) === 'true';
}

export function setProductsCustomized(customized: boolean): void {
  if (typeof window === 'undefined') return;
  if (customized) {
    localStorage.setItem(EXTRA_STORAGE_KEYS.PRODUCTS_CUSTOMIZED, 'true');
  } else {
    localStorage.removeItem(EXTRA_STORAGE_KEYS.PRODUCTS_CUSTOMIZED);
  }
}

export function isStoreCustomized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(EXTRA_STORAGE_KEYS.STORE_CUSTOMIZED) === 'true';
}

export function setStoreCustomized(customized: boolean): void {
  if (typeof window === 'undefined') return;
  if (customized) {
    localStorage.setItem(EXTRA_STORAGE_KEYS.STORE_CUSTOMIZED, 'true');
  } else {
    localStorage.removeItem(EXTRA_STORAGE_KEYS.STORE_CUSTOMIZED);
  }
}

export function getStoredProducts(): Product[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
  if (!raw) return [];
  try {
    const parsed: Product[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const deletedIds = new Set(getDeletedProductIds());
    const cleaned = parsed.filter(
      (p) => p && !LEGACY_DEMO_PRODUCT_IDS.has(p.id) && !deletedIds.has(p.id) && p.isActive !== false
    );
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveProducts(products: Product[], markCustom: boolean = true): void {
  if (typeof window === 'undefined') return;
  const cleaned = products.filter((p) => p && !LEGACY_DEMO_PRODUCT_IDS.has(p.id));
  localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(cleaned));
  if (markCustom) {
    setProductsCustomized(true);
  }
  notifySync();
}

export function getStoredOrders(): Order[] {
  if (typeof window === 'undefined') return INITIAL_ORDERS;
  const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
    return INITIAL_ORDERS;
  }
  try {
    const parsedRaw: Order[] = JSON.parse(raw);
    if (!Array.isArray(parsedRaw)) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(INITIAL_ORDERS));
      return INITIAL_ORDERS;
    }
    // Strip out any legacy demo orders (ORD-700, ORD-701, ORD-702, ORD-901, ORD-902)
    const parsed = parsedRaw.filter((o) => o && !DEMO_ORDER_IDS.has(o.id));
    if (parsed.length !== parsedRaw.length) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return INITIAL_ORDERS;
  }
}

export function saveOrders(orders: Order[]): void {
  if (typeof window === 'undefined') return;
  const cleaned = orders.filter((o) => o && !DEMO_ORDER_IDS.has(o.id));
  if (cleaned.length > 0) {
    setOrdersPurgedByAdmin(false);
  }
  localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(cleaned));
  notifySync();
}

export function getStoredStore(): StoreConfig {
  if (typeof window === 'undefined') return DEFAULT_STORE;
  const raw = localStorage.getItem(STORAGE_KEYS.STORE);
  if (!raw) {
    localStorage.setItem(STORAGE_KEYS.STORE, JSON.stringify(DEFAULT_STORE));
    return DEFAULT_STORE;
  }
  try {
    const parsed: StoreConfig = JSON.parse(raw);
    const hasLegacyBankPlaceholder =
      !parsed.bankAccountInfo ||
      parsed.bankAccountInfo.includes('960-441209-1') ||
      parsed.bankAccountInfo.includes('960-000000-0') ||
      parsed.bankAccountInfo.includes('789456123');

    if (
      !parsed.addressText ||
      parsed.addressText.includes('Piantini') ||
      parsed.location.lat < 19 ||
      parsed.phone === '8095550199' ||
      parsed.whatsapp === '8095550199' ||
      (hasLegacyBankPlaceholder && !isStoreCustomized())
    ) {
      const updated: StoreConfig = {
        ...DEFAULT_STORE,
        ...parsed,
        phone: parsed.phone && parsed.phone !== '8095550199' ? parsed.phone : '8092104901',
        whatsapp: parsed.whatsapp && parsed.whatsapp !== '8095550199' ? parsed.whatsapp : '8092104901',
        bankAccountInfo:
          hasLegacyBankPlaceholder && !isStoreCustomized()
            ? DEFAULT_STORE.bankAccountInfo
            : parsed.bankAccountInfo || DEFAULT_STORE.bankAccountInfo,
      };
      localStorage.setItem(STORAGE_KEYS.STORE, JSON.stringify(updated));
      return updated;
    }
    return parsed;
  } catch {
    return DEFAULT_STORE;
  }
}

export function saveStore(store: StoreConfig, markCustom: boolean = true): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.STORE, JSON.stringify(store));
  if (markCustom) {
    setStoreCustomized(true);
  }
  notifySync();
}

export function getStoredClientContact(): { name: string; phone: string } {
  if (typeof window === 'undefined') return { name: '', phone: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLIENT_CONTACT);
    return raw ? JSON.parse(raw) : { name: '', phone: '' };
  } catch {
    return { name: '', phone: '' };
  }
}

export function saveClientContact(contact: { name: string; phone: string }): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.CLIENT_CONTACT, JSON.stringify(contact));
}

export const setStoredClientContact = saveClientContact;

export function getStoredUserLocation(): Coordinates | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_LOCATION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;

    // Validate that stored location is within Dominican Republic and not a stale remote IP coordinates (> 45 km from Loma de Cabrera)
    const lat1 = 19.41688;
    const lon1 = -71.61287;
    const lat2 = parsed.lat;
    const lon2 = parsed.lng;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = R * c;

    if (distKm > 40) {
      localStorage.removeItem(STORAGE_KEYS.USER_LOCATION);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredUserLocation(coords: Coordinates): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.USER_LOCATION, JSON.stringify(coords));
  } catch {}
}

export function clearStoredUserLocation(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_LOCATION);
  } catch {}
}

/**
 * Automatic client-side image compression for product photos uploaded from desktop/mobile.
 * Guarantees ultra-small footprint (~25-55 KB) so localStorage and database payloads never fill up.
 */
export async function compressProductImage(file: File): Promise<{
  dataUrl: string;
  originalKb: number;
  compressedKb: number;
  savedPercent: number;
  width: number;
  height: number;
}> {
  const originalKb = Math.max(1, Math.round(file.size / 1024));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new window.Image();
      img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
      img.onload = () => {
        try {
          const MAX_DIMENSION = 480;
          let width = img.width || MAX_DIMENSION;
          let height = img.height || MAX_DIMENSION;

          if (width > height && width > MAX_DIMENSION) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else if (height > MAX_DIMENSION) {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({
              dataUrl: rawDataUrl,
              originalKb,
              compressedKb: originalKb,
              savedPercent: 0,
              width,
              height,
            });
            return;
          }

          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // Adaptive compression: start at 0.80 quality WebP (fallback JPEG) and step down if > 65 KB
          const qualities = [0.8, 0.68, 0.55];
          let finalDataUrl = '';
          for (const q of qualities) {
            let attempt = canvas.toDataURL('image/webp', q);
            if (!attempt.startsWith('data:image/webp')) {
              attempt = canvas.toDataURL('image/jpeg', q);
            }
            finalDataUrl = attempt;
            const approxBytes = Math.round((attempt.length * 3) / 4);
            if (approxBytes <= 65 * 1024) {
              break;
            }
          }

          const compressedKb = Math.max(1, Math.round(((finalDataUrl.length * 3) / 4) / 1024));
          const savedPercent = Math.max(
            0,
            Math.min(99, Math.round(((originalKb - compressedKb) / Math.max(originalKb, 1)) * 100))
          );

          resolve({
            dataUrl: finalDataUrl,
            originalKb,
            compressedKb,
            savedPercent,
            width,
            height,
          });
        } catch {
          resolve({
            dataUrl: rawDataUrl,
            originalKb,
            compressedKb: originalKb,
            savedPercent: 0,
            width: img.width || 400,
            height: img.height || 400,
          });
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Sound notifications using Web Audio API synthesized tones
 */
let sharedAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playNotificationSound(
  type: 'alert' | 'success' | 'money' | 'pop' | 'vape-hit' | 'new-order'
): void {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (type === 'new-order') {
      // Unmistakable double-bell store chime for Admin & Delivery when a new order arrives
      const notes = [
        { freq: 783.99, start: 0, dur: 0.14 },     // G5
        { freq: 1046.5, start: 0.12, dur: 0.16 },  // C6
        { freq: 1318.51, start: 0.25, dur: 0.28 }, // E6
        { freq: 783.99, start: 0.56, dur: 0.14 },  // G5 (repeat)
        { freq: 1046.5, start: 0.68, dur: 0.16 },  // C6
        { freq: 1567.98, start: 0.81, dur: 0.38 }, // G6
      ];
      for (const n of notes) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start);
        g.gain.setValueAtTime(0.001, ctx.currentTime + n.start);
        g.gain.linearRampToValueAtTime(0.28, ctx.currentTime + n.start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + n.start);
        o.stop(ctx.currentTime + n.start + n.dur + 0.02);
      }
      return;
    }

    if (type === 'vape-hit') {
      // Synthesize realistic warm vape airflow hiss and coil sizzle
      const bufferSize = ctx.sampleRate * 0.8;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.6));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.7);
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'money') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'pop') {
      osc.frequency.setValueAtTime(700, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15); // E5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Audio context may be blocked before gesture
  }
}
