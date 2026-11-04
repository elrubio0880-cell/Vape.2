import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppSection,
  UserAccount,
  Product,
  Order,
  StoreConfig,
  OrderItem,
  OrderStatus,
  Coordinates,
} from './types';
import {
  getStoredProducts,
  saveProducts,
  getStoredOrders,
  saveOrders,
  getStoredStore,
  saveStore,
  subscribeToSync,
  playNotificationSound,
  getSharedAudioContext,
  setOrdersPurgedByAdmin,
} from './utils/storage';
import { sendPushNotification } from './utils/notifications';
import { calculateDistanceKm, calculateDeliveryFee } from './utils/routing';
import { getCurrentUser, setCurrentUser, ensureBuyerProfileForOrder } from './utils/auth';
import {
  fetchProducts,
  fetchOrders,
  fetchStoreConfig,
  createOrderOnServer,
  assignDriverAtomic,
  markOrderDeliveredOnServer,
  proposeFareOnServer,
  updateOrderStatusOnServer,
  approveOrderFareOnServer,
  updateOrderLocationOnServer,
  subscribeToSupabaseRealtime,
} from './utils/supabaseOrders';
import { fetchUserPointsBalance, awardOrderPointsLocal } from './utils/supabasePoints';
import { Navigation } from './components/Navigation';
import { StoreCatalog } from './components/client/StoreCatalog';
import { NotificationToast, ToastMessage } from './components/NotificationToast';
import { SmokeOverlay } from './components/effects/SmokeOverlay';
import { Flame, Sparkles, MapPin, Bike, Wind } from 'lucide-react';

// Code-splitting via React.lazy for non-landing views and heavy modules (Leaflet map, Admin, Modals)
const AuthModal = React.lazy(() =>
  import('./components/auth/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const OrderCheckoutModal = React.lazy(() =>
  import('./components/client/OrderCheckoutModal').then((m) => ({ default: m.OrderCheckoutModal }))
);
const ClientPointsModal = React.lazy(() =>
  import('./components/client/ClientPointsModal').then((m) => ({ default: m.ClientPointsModal }))
);
const MapaRastreoSection = React.lazy(() =>
  import('./components/client/MapaRastreoSection').then((m) => ({ default: m.MapaRastreoSection }))
);
const OrderHistorySection = React.lazy(() =>
  import('./components/client/OrderHistorySection').then((m) => ({ default: m.OrderHistorySection }))
);
const SellerDashboard = React.lazy(() =>
  import('./components/seller/SellerDashboard').then((m) => ({ default: m.SellerDashboard }))
);

function SectionLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="w-10 h-10 border-4 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-3.5" />
      <span className="text-sm font-bold text-neutral-200">Cargando sección...</span>
      <span className="text-xs text-neutral-500 mt-0.5">Sincronizando datos en tiempo real</span>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUserState] = useState<UserAccount | null>(getCurrentUser);
  const [currentSection, setCurrentSectionState] = useState<AppSection>(() => {
    try {
      const saved = localStorage.getItem('vape_current_section_v1') as AppSection | null;
      const user = getCurrentUser();
      if (saved === 'admin' && user?.role !== 'admin') return 'tienda';
      if (saved && ['tienda', 'mapa', 'pedidos', 'admin'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'tienda';
  });
  const setCurrentSection = useCallback((sec: AppSection) => {
    setCurrentSectionState(sec);
    try {
      localStorage.setItem('vape_current_section_v1', sec);
    } catch {}
  }, []);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>(getStoredProducts);
  const [orders, setOrders] = useState<Order[]>(getStoredOrders);
  const [store, setStore] = useState<StoreConfig>(getStoredStore);

  // Track known order IDs to trigger automatic sound & push alerts on Admin/Delivery panels
  const knownOrderIdsRef = useRef<Set<string> | null>(null);

  // Client view states (persisted in localStorage for current browser session)
  const [activeClientOrderId, setActiveClientOrderIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('vape_active_client_order_id_v1');
    } catch {
      return null;
    }
  });
  const setActiveClientOrderId = useCallback((id: string | null) => {
    setActiveClientOrderIdState(id);
    try {
      if (id) localStorage.setItem('vape_active_client_order_id_v1', id);
      else localStorage.removeItem('vape_active_client_order_id_v1');
    } catch {}
  }, []);
  const [checkoutItems, setCheckoutItems] = useState<OrderItem[] | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Refresh client points from DB or cache
  const refreshCurrentUserPoints = useCallback(async () => {
    if (!currentUser) return;
    const balance = await fetchUserPointsBalance(currentUser.id);
    const updated = { ...currentUser, pointsBalance: balance };
    setCurrentUserState(updated);
    setCurrentUser(updated);
  }, [currentUser]);

  // Load points for logged-in buyer
  useEffect(() => {
    if (currentUser?.id) {
      fetchUserPointsBalance(currentUser.id).then((balance) => {
        if (currentUser.pointsBalance !== balance) {
          const updated = { ...currentUser, pointsBalance: balance };
          setCurrentUserState(updated);
          setCurrentUser(updated);
        }
      });
    }
  }, [currentUser?.id]);

  // Push notification helper
  const addToast = useCallback(
    (title: string, description: string, type: ToastMessage['type'] = 'info') => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, type }]);
    },
    []
  );

  // Automatic audible bell + push notification when a new order arrives for Admin or Delivery
  useEffect(() => {
    if (knownOrderIdsRef.current === null) {
      knownOrderIdsRef.current = new Set(orders.map((o) => o.id));
      return;
    }

    const newlyArrived = orders.filter(
      (o) =>
        !knownOrderIdsRef.current?.has(o.id) &&
        o.status !== 'entregado' &&
        o.status !== 'cancelado'
    );

    knownOrderIdsRef.current = new Set(orders.map((o) => o.id));

    if (newlyArrived.length > 0 && (currentUser?.role === 'admin' || currentUser?.role === 'delivery')) {
      const latest = newlyArrived[0];
      const soundMuted = localStorage.getItem('vape_sound_alerts_muted_v1') === 'true';
      if (!soundMuted) {
        playNotificationSound('new-order');
      }
      sendPushNotification(`🔔 ¡Nuevo Pedido #${latest.id}!`, {
        body: `Cliente: ${latest.customerName} • Total: $${latest.totalAmount} DOP (${latest.deliveryAddressNote || 'Loma de Cabrera'})`,
      });
      addToast(
        `🔔 ¡Nuevo Pedido #${latest.id}!`,
        `${latest.customerName} solicitó ${latest.items.length} líquido(s) • Total $${latest.totalAmount} DOP`,
        'alert'
      );
    }
  }, [orders, currentUser?.role, addToast]);

  // Fetch initial data from Supabase & Subscribe to Realtime
  useEffect(() => {
    fetchProducts().then(setProducts);
    fetchStoreConfig().then(setStore);
    fetchOrders().then(setOrders);

    const unsubRealtime = subscribeToSupabaseRealtime(
      () => {
        fetchOrders().then(setOrders);
      },
      () => {
        fetchProducts().then(setProducts);
      },
      () => {
        fetchStoreConfig().then(setStore);
      }
    );

    const unsubscribeLocal = subscribeToSync(() => {
      setProducts(getStoredProducts());
      setOrders(getStoredOrders());
      setStore(getStoredStore());
      setCurrentUserState(getCurrentUser());
    });

    // Periodic lightweight sync every 12s so Admin & Delivery receive orders even if WebSocket reconnects
    const pollInterval = setInterval(() => {
      fetchOrders().then(setOrders);
    }, 12000);

    // Unlock Web Audio API on first user tap/click anywhere so automatic order chimes always play
    const unlockAudio = () => {
      getSharedAudioContext();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true, passive: true });

    return () => {
      unsubRealtime();
      unsubscribeLocal();
      clearInterval(pollInterval);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Update active client order reference (strictly isolated to the current buyer's order)
  const clientActiveOrder =
    orders.find(
      (o) =>
        o.id === activeClientOrderId &&
        o.status !== 'entregado' &&
        o.status !== 'cancelado'
    ) ||
    (currentUser?.role === 'comprador'
      ? orders.find(
          (o) =>
            o.customerId === currentUser.id &&
            o.status !== 'entregado' &&
            o.status !== 'cancelado'
        )
      : null) ||
    orders.find((o) => o.id === activeClientOrderId) ||
    null;

  const activeOrdersCount =
    currentUser?.role === 'admin' || currentUser?.role === 'delivery'
      ? orders.filter((o) => o.status !== 'entregado' && o.status !== 'cancelado').length
      : clientActiveOrder &&
        clientActiveOrder.status !== 'entregado' &&
        clientActiveOrder.status !== 'cancelado'
      ? 1
      : 0;

  // HANDLERS: Client
  const handleStartCheckout = (items: OrderItem[]) => {
    setCheckoutItems(items);
  };

  const handleSubmitOrder = async (newOrder: Order) => {
    const buyerProfile = ensureBuyerProfileForOrder(
      newOrder.customerName,
      newOrder.customerPhone,
      newOrder.customerId || (currentUser?.role === 'comprador' ? currentUser.id : undefined)
    );

    const res = await createOrderOnServer(
      {
        orderId: newOrder.id,
        customerId: buyerProfile.id,
        orderType: newOrder.orderType || 'regular',
        redemptionId: newOrder.redemptionId,
        pointsRedeemed: newOrder.pointsRedeemed,
        customerName: newOrder.customerName,
        customerPhone: newOrder.customerPhone,
        deliveryAddressNote: newOrder.deliveryAddressNote,
        destination: newOrder.location,
        paymentMethod: newOrder.paymentMethod || 'efectivo',
        cashGiven: newOrder.cashGiven,
        specialNotes: newOrder.specialNotes,
        isRemoteLocation: newOrder.isRemoteLocation,
        detectedRegion: newOrder.detectedRegion,
        locationAccuracyMeters: newOrder.locationAccuracyMeters,
        items: newOrder.items.map((it) => ({
          productId: it.productId,
          portion: it.portion,
          quantity: it.quantity,
        })),
      },
      store,
      products
    );

    if (!res.success || !res.order) {
      addToast('Error al registrar pedido', res.error || 'No se pudo crear el pedido.', 'alert');
      return;
    }

    const confirmedOrder = res.order;
    const updated = [confirmedOrder, ...orders.filter((o) => o.id !== confirmedOrder.id)];
    setOrders(updated);
    saveOrders(updated);
    setCheckoutItems(null);
    setActiveClientOrderId(confirmedOrder.id);

    // If current user is buyer, update their contact info
    if (!currentUser || currentUser.role === 'comprador') {
      const updatedUser = {
        ...buyerProfile,
        name: confirmedOrder.customerName,
        phone: confirmedOrder.customerPhone,
      };
      setCurrentUserState(updatedUser);
      setCurrentUser(updatedUser);
    }

    // PedidosYa experience: switch to map & tracking automatically
    setCurrentSection('mapa');

    addToast(
      '¡Pedido Solicitado!',
      `Pedido #${confirmedOrder.id} enviado. Tarifa de viaje calculada en servidor: $${confirmedOrder.deliveryFee} DOP.`,
      'success'
    );
  };

  const handleCreateOrder = async (newOrder: Order) => {
    const buyerProfile = ensureBuyerProfileForOrder(
      newOrder.customerName,
      newOrder.customerPhone,
      newOrder.customerId || (currentUser?.role === 'comprador' ? currentUser.id : undefined)
    );

    const res = await createOrderOnServer(
      {
        orderId: newOrder.id,
        customerId: buyerProfile.id,
        orderType: newOrder.orderType || 'regular',
        redemptionId: newOrder.redemptionId,
        pointsRedeemed: newOrder.pointsRedeemed,
        customerName: newOrder.customerName,
        customerPhone: newOrder.customerPhone,
        deliveryAddressNote: newOrder.deliveryAddressNote,
        destination: newOrder.location,
        paymentMethod: newOrder.paymentMethod || 'efectivo',
        cashGiven: newOrder.cashGiven,
        specialNotes: newOrder.specialNotes,
        isRemoteLocation: newOrder.isRemoteLocation,
        detectedRegion: newOrder.detectedRegion,
        locationAccuracyMeters: newOrder.locationAccuracyMeters,
        items: newOrder.items.map((it) => ({
          productId: it.productId,
          portion: it.portion,
          quantity: it.quantity,
        })),
      },
      store,
      products
    );

    if (!res.success || !res.order) {
      addToast('Error al registrar pedido', res.error || 'No se pudo crear el pedido.', 'alert');
      return;
    }

    const confirmedOrder = res.order;
    const updated = [confirmedOrder, ...orders.filter((o) => o.id !== confirmedOrder.id)];
    setOrders(updated);
    saveOrders(updated);
    setActiveClientOrderId(confirmedOrder.id);

    if (!currentUser || currentUser.role === 'comprador') {
      const updatedUser = {
        ...buyerProfile,
        name: confirmedOrder.customerName,
        phone: confirmedOrder.customerPhone,
      };
      setCurrentUserState(updatedUser);
      setCurrentUser(updatedUser);
    }

    playNotificationSound('alert');
    addToast(
      '¡Pedido Registrado!',
      `Pedido #${confirmedOrder.id} enviado con tarifa de $${confirmedOrder.deliveryFee} DOP.`,
      'success'
    );
  };

  const handleApproveFare = async (orderId: string) => {
    const target = getStoredOrders().find((o) => o.id === orderId) || orders.find((o) => o.id === orderId);
    if (target) {
      await approveOrderFareOnServer(orderId, target.deliveryFee, target.subtotalLiquid);
    }
    setOrders(getStoredOrders());
    addToast(
      'Tarifa Aprobada',
      'El recibo ha sido confirmado. La tienda está preparando tus líquidos.',
      'success'
    );
  };

  const handleRejectOrder = async (orderId: string, reason?: string) => {
    const cancelNote = reason?.trim() || 'Cliente rechazó tarifa o canceló su solicitud.';
    await updateOrderStatusOnServer(orderId, 'cancelado', cancelNote, currentUser);
    setOrders(getStoredOrders());
    refreshCurrentUserPoints();
    addToast('Pedido Cancelado', cancelNote, 'alert');
  };

  const handleRepeatOrder = (items: OrderItem[]) => {
    setCheckoutItems(items);
  };

  // HANDLERS: Delivery
  const handleProposeFare = async (orderId: string, fee: number) => {
    await proposeFareOnServer(orderId, fee);
    setOrders(getStoredOrders());
    addToast(
      'Tarifa Enviada',
      `Propuesta de $${fee} DOP enviada al cliente. Esperando su aprobación.`,
      'info'
    );
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus, note?: string) => {
    const targetOrder = getStoredOrders().find((o) => o.id === orderId) || orders.find((o) => o.id === orderId);
    if (newStatus === 'entregado') {
      const res = await markOrderDeliveredOnServer(orderId);
      if (!res.success) {
        addToast('Error al entregar pedido', res.error || 'No se pudo completar la entrega.', 'alert');
        return;
      }
      if (targetOrder?.customerId) {
        awardOrderPointsLocal(
          targetOrder.customerId,
          targetOrder.id,
          targetOrder.subtotalLiquid,
          targetOrder.orderType || 'regular'
        );
      }
      fetchProducts().then(setProducts);
      refreshCurrentUserPoints();
    } else if (newStatus === 'en_camino' && currentUser?.role === 'delivery') {
      const res = await assignDriverAtomic(orderId, currentUser);
      if (!res.success) {
        addToast('No se pudo tomar el pedido', res.error || 'Otro repartidor ya tomó este pedido.', 'alert');
        fetchOrders().then(setOrders);
        return;
      }
    } else {
      await updateOrderStatusOnServer(
        orderId,
        newStatus,
        note || `Estado actualizado a ${newStatus}`,
        currentUser
      );
      if (newStatus === 'cancelado') {
        refreshCurrentUserPoints();
      }
    }

    setOrders(getStoredOrders());

    const statusDisplayNames: Record<string, string> = {
      en_camino: 'Repartidor en camino con tus líquidos 🛵',
      llegada_a_destino: '¡El delivery ha llegado a tu ubicación! 📍',
      entregado: 'Pedido entregado y cobrado con éxito ✅',
      cancelado: note ? `Rechazado/Cancelado: ${note}` : 'Pedido rechazado o cancelado ❌',
    };

    if (statusDisplayNames[newStatus]) {
      addToast(
        `Pedido #${orderId}`,
        statusDisplayNames[newStatus],
        newStatus === 'entregado' ? 'success' : 'alert'
      );
    }
  };

  const handleUpdateDriverLocation = (orderId: string, location: Coordinates) => {
    const updated = getStoredOrders().map((o) =>
      o.id === orderId ? { ...o, driverLocation: location } : o
    );
    saveOrders(updated);
    setOrders(updated);
  };

  const handleUpdateOrderLocation = async (orderId: string, location: Coordinates) => {
    const distKm = calculateDistanceKm(store.location, location);
    const feeCalc = calculateDeliveryFee(distKm);
    const target = getStoredOrders().find((o) => o.id === orderId) || orders.find((o) => o.id === orderId);
    if (target) {
      await updateOrderLocationOnServer(
        orderId,
        location,
        target.deliveryAddressNote,
        feeCalc.fee,
        distKm,
        target.subtotalLiquid
      );
    }
    setOrders(getStoredOrders());
    addToast(
      'Ubicación Actualizada',
      `Ubicación fijada a ${distKm.toFixed(1)} km de la tienda (Envío: $${feeCalc.fee} DOP).`,
      'success'
    );
  };

  // HANDLERS: Seller
  const handleSaveProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
    saveProducts(newProducts);
    addToast('Catálogo Actualizado', 'Los cambios en los líquidos se han guardado.', 'success');
  };

  const handleSaveStore = (newStore: StoreConfig) => {
    setStore(newStore);
    saveStore(newStore);
    addToast('Tienda Actualizada', 'La configuración del local físico se ha guardado.', 'success');
  };

  const handleClearOrders = () => {
    setOrdersPurgedByAdmin(true);
    setOrders([]);
    saveOrders([]);
    setActiveClientOrderId(null);
    addToast('Historial Limpiado', 'Se han eliminado los pedidos de prueba.', 'info');
  };


  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUserState(user);
    setCurrentUser(user);

    // If delivery logs in, take them straight to Mapa & Rastreo (their dispatch hub)
    if (user.role === 'delivery') {
      setCurrentSection('mapa');
    } else if (user.role === 'admin') {
      setCurrentSection('admin');
    } else {
      setCurrentSection('tienda');
    }

    addToast('Sesión Iniciada', `Bienvenido ${user.name} (${user.role})`, 'success');
  };

  const handleLogout = () => {
    setCurrentUserState(null);
    setCurrentUser(null);
    setCurrentSection('tienda');
    addToast('Sesión Finalizada', 'Has cerrado sesión.', 'info');
  };

  return (
    <div className="min-h-screen bg-[#08050e] text-neutral-100 flex flex-col font-urban relative selection:bg-purple-600 selection:text-white">
      {/* Atmospheric Smoke & Live Vape Cloud Simulator */}
      <SmokeOverlay />

      {/* Auth Modal for Role Logins (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onAuthSuccess={handleAuthSuccess}
            initialRole={currentUser?.role || 'comprador'}
          />
        )}
      </React.Suspense>

      {/* Push Notifications Toast */}
      <NotificationToast
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* PedidosYa Navigation Header & Tab Bar */}
      <Navigation
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        store={store}
        activeOrdersCount={activeOrdersCount}
        onOpenPoints={() => setIsPointsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 pb-24 sm:p-6 sm:pb-8 lg:p-8 relative z-10">
        {/* SECTION 1: TIENDA (Front-Facing Landing, Just Like PedidosYa - Instant Bundle) */}
        {currentSection === 'tienda' && (
          <div className="space-y-6">
            {/* Fast active order notice banner if any */}
            {clientActiveOrder && (
              <div
                onClick={() => setCurrentSection('mapa')}
                className="bg-[#120924]/90 border-2 border-cyan-400/80 p-4 rounded-3xl cursor-pointer hover:border-cyan-300 transition-all shadow-xl shadow-cyan-950/40 flex items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 flex items-center justify-center font-bold text-2xl group-hover:scale-105 transition-transform">
                    🛵
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-tag tracking-wider text-cyan-300 block">
                      TIENES UN PEDIDO ACTIVO EN CAMINO
                    </span>
                    <strong className="text-sm text-white font-urban block">
                      Pedido #{clientActiveOrder.id} • Estado: {clientActiveOrder.status.replace(/_/g, ' ').toUpperCase()}
                    </strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-black text-cyan-400 group-hover:text-cyan-300">
                  <span>Ver en el mapa</span>
                  <span>➔</span>
                </div>
              </div>
            )}

            {/* Liquid Catalog */}
            <StoreCatalog
              products={products}
              store={store}
              onStartCheckout={handleStartCheckout}
              onCreateOrder={handleCreateOrder}
            />
          </div>
        )}

        {/* SECTION 2: MAPA & RASTREO (Dedicated Live Map View - Lazy Loaded) */}
        {currentSection === 'mapa' && (
          <React.Suspense fallback={<SectionLoadingFallback />}>
            <MapaRastreoSection
              currentUser={currentUser}
              activeOrder={clientActiveOrder}
              orders={orders}
              store={store}
              onApproveFare={handleApproveFare}
              onRejectOrder={handleRejectOrder}
              onNewOrder={() => setActiveClientOrderId(null)}
              onGoToShop={() => setCurrentSection('tienda')}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onProposeFare={handleProposeFare}
              onUpdateDriverLocation={handleUpdateDriverLocation}
              onUpdateOrderLocation={handleUpdateOrderLocation}
            />
          </React.Suspense>
        )}

        {/* SECTION 3: HISTORIAL DE PEDIDOS (Lazy Loaded) */}
        {currentSection === 'pedidos' && (
          <React.Suspense fallback={<SectionLoadingFallback />}>
            <OrderHistorySection
              orders={orders}
              currentUser={currentUser}
              onRepeatOrder={handleRepeatOrder}
              onGoToShop={() => setCurrentSection('tienda')}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onTrackOrder={(orderId) => {
                setActiveClientOrderId(orderId);
                setCurrentSection('mapa');
              }}
            />
          </React.Suspense>
        )}

        {/* SECTION 4: PANEL ADMINISTRADOR (Lazy Loaded) */}
        {currentSection === 'admin' && currentUser?.role === 'admin' && (
          <React.Suspense fallback={<SectionLoadingFallback />}>
            <SellerDashboard
              products={products}
              orders={orders}
              store={store}
              currentUser={currentUser}
              onSaveProducts={handleSaveProducts}
              onSaveStore={handleSaveStore}
              onClearOrders={handleClearOrders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
            />
          </React.Suspense>
        )}
      </main>

      {/* Checkout Modal with Map Pin Drop (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {checkoutItems && (
          <OrderCheckoutModal
            items={checkoutItems}
            store={store}
            onClose={() => setCheckoutItems(null)}
            onSubmitOrder={handleSubmitOrder}
            currentUser={currentUser}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}
      </React.Suspense>

      {/* Client Loyalty & Points Modal (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isPointsModalOpen && currentUser && (
          <ClientPointsModal
            isOpen={isPointsModalOpen}
            onClose={() => setIsPointsModalOpen(false)}
            currentUser={currentUser}
            store={store}
            products={products}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onPointsUpdated={refreshCurrentUserPoints}
          />
        )}
      </React.Suspense>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-6 px-4 text-center text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/logo-black-vape.jpeg" alt="BLACK VAPE" className="w-4 h-4 rounded-full object-cover" />
            <span className="font-bold text-neutral-300 tracking-wider">BLACK VAPE</span>
            <span>• Recarga de Tanque & Delivery en Tiempo Real</span>
          </div>
          <div className="flex items-center gap-4 text-neutral-400 text-[11px]">
            <span>Local Físico: {store.addressText}</span>
            <span>Tel / WhatsApp: {store.phone}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
