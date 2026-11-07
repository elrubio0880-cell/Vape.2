import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppSection,
  StoreCatalogView,
  UserAccount,
  Product,
  Order,
  StoreConfig,
  OrderItem,
  OrderStatus,
  Coordinates,
  UserRole,
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
import { Crown, MessageCircle } from 'lucide-react';

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
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>('comprador');
  const openAuthModal = useCallback(
    (role?: UserRole) => {
      setAuthInitialRole(role || currentUser?.role || 'comprador');
      setIsAuthModalOpen(true);
    },
    [currentUser?.role]
  );
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [activeStoreView, setActiveStoreView] = useState<StoreCatalogView>('inicio');
  const [storeSearchQuery, setStoreSearchQuery] = useState<string>('');
  const [cartCount, setCartCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('vape_cart_items_v1');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.reduce((sum: number, it: any) => sum + Number(it.quantity || 0), 0)
        : 0;
    } catch {
      return 0;
    }
  });
  const [openCartSignal, setOpenCartSignal] = useState<number>(0);

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
          productType: it.productType,
          portion: it.portion,
          quantity: it.quantity,
          variantId: it.variantId,
          variantColor: it.variantColor,
          variantImage: it.variantImage,
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
          productType: it.productType,
          portion: it.portion,
          quantity: it.quantity,
          variantId: it.variantId,
          variantColor: it.variantColor,
          variantImage: it.variantImage,
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
    <div className="min-h-screen bg-[#050b08] text-neutral-100 flex flex-col font-urban relative selection:bg-emerald-500 selection:text-neutral-950">
      {/* Atmospheric Smoke & Live Vape Cloud Simulator */}
      <SmokeOverlay />

      {/* Auth Modal for Role Logins (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => setIsAuthModalOpen(false)}
            onAuthSuccess={handleAuthSuccess}
            initialRole={authInitialRole}
          />
        )}
      </React.Suspense>

      {/* Push Notifications Toast */}
      <NotificationToast
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Storefront Navigation Header & Tab Bar */}
      <Navigation
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
        activeStoreView={activeStoreView}
        onStoreViewChange={setActiveStoreView}
        searchQuery={storeSearchQuery}
        onSearchChange={setStoreSearchQuery}
        cartCount={cartCount}
        onOpenCart={() => setOpenCartSignal((prev) => prev + 1)}
        currentUser={currentUser}
        onOpenAuth={openAuthModal}
        onLogout={handleLogout}
        store={store}
        activeOrdersCount={activeOrdersCount}
        onOpenPoints={() => setIsPointsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3.5 pb-24 sm:p-6 sm:pb-10 lg:p-8 relative">
        {/* SECTION 1: TIENDA (Front-Facing Storefront) */}
        {currentSection === 'tienda' && (
          <div className="space-y-5">
            {/* Fast active order notice banner if any */}
            {clientActiveOrder && (
              <div
                onClick={() => setCurrentSection('mapa')}
                className="bg-[#071610]/95 border border-emerald-400/70 p-3.5 sm:p-4 rounded-2xl cursor-pointer hover:border-emerald-300 transition-all shadow-xl shadow-black/60 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center justify-center font-bold text-xl group-hover:scale-105 transition-transform">
                    🛵
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">
                      TIENES UN PEDIDO ACTIVO EN CAMINO
                    </span>
                    <strong className="text-xs sm:text-sm text-white font-urban block">
                      Pedido #{clientActiveOrder.id} • Estado:{' '}
                      {clientActiveOrder.status.replace(/_/g, ' ').toUpperCase()}
                    </strong>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-black text-emerald-400 group-hover:text-emerald-300 shrink-0">
                  <span>Ver mapa</span>
                  <span>→</span>
                </div>
              </div>
            )}

            {/* Buyer Storefront Catalog */}
            <StoreCatalog
              products={products}
              store={store}
              onStartCheckout={handleStartCheckout}
              onCreateOrder={handleCreateOrder}
              activeView={activeStoreView}
              onViewChange={setActiveStoreView}
              externalSearchQuery={storeSearchQuery}
              onExternalSearchChange={setStoreSearchQuery}
              onCartCountChange={setCartCount}
              openCartSignal={openCartSignal}
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

      {/* Storefront Footer (Matches Reference Image) */}
      <footer className="relative z-10 border-t border-emerald-950/80 bg-[#040906]/95 py-8 px-4 sm:px-6 pb-24 sm:pb-8 text-xs text-neutral-400">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Col 1: Brand */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-emerald-400" />
              <span className="font-black text-base text-white tracking-wider font-urban">
                BLACK <span className="text-emerald-400">VAPE</span>
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Tu vape shop de confianza. Vapers, líquidos de recarga y accesorios originales con delivery en tiempo real.
            </p>
          </div>

          {/* Col 2: Categorías */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Categorías</h4>
            <ul className="space-y-1 text-[11px]">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSection('tienda');
                    setActiveStoreView('inicio');
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Inicio & Más Vendidos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSection('tienda');
                    setActiveStoreView('vapes');
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Vapers & Equipos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSection('tienda');
                    setActiveStoreView('liquidos');
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Líquidos de Recarga (RD$100 / RD$50)
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentSection('tienda');
                    setActiveStoreView('accesorios');
                  }}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Accesorios
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Navegación Rápida */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Tu Pedido</h4>
            <ul className="space-y-1 text-[11px]">
              <li>
                <button
                  type="button"
                  onClick={() => setCurrentSection('mapa')}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Mapa & Rastreo en Vivo
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setCurrentSection('pedidos')}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Historial de Pedidos
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  Mi Cuenta / Acceso
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Ubicación & WhatsApp */}
          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">
              Contacto & Local
            </h4>
            <p className="text-[11px] text-neutral-400">{store.addressText}</p>
            <a
              href={`https://wa.me/1${(store.whatsapp || store.phone || '8092104901').replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-neutral-950 border border-emerald-500/30 font-bold text-xs transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp: {store.phone}</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
