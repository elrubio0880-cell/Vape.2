import React, { useState, useEffect, useRef } from 'react';
import { Order, StoreConfig, Coordinates, OrderStatus } from '../../types';
import { MapView } from '../MapView';
import { calculateDistanceKm, optimizeMultiStopRoute, calculateDeliveryFee, DELIVERY_ZONES } from '../../utils/routing';
import { playNotificationSound } from '../../utils/storage';
import {
  formatWhatsAppPhone,
  generateWhatsAppLink,
  WhatsAppTemplates,
  generateGoogleMapsMultiStopUrl,
} from '../../utils/whatsapp';
import {
  Bike,
  Phone,
  Navigation,
  CheckCircle,
  Clock,
  MapPin,
  Send,
  AlertCircle,
  Route,
  ChevronRight,
  TrendingUp,
  MessageCircle,
  Banknote,
  Building,
  CreditCard,
  FileText,
  CheckSquare,
  Square,
  ExternalLink,
  Layers,
  Sparkles,
  CheckCheck,
  XCircle,
} from 'lucide-react';

import {
  startDriverLiveGPS,
  requestScreenWakeLock,
  isNearDestination,
  publishDriverLocation,
} from '../../utils/gpsTracking';
import { UserAccount } from '../../types';

interface DeliveryDashboardProps {
  orders: Order[];
  store: StoreConfig;
  onUpdateOrderStatus: (orderId: string, newStatus: Order['status'], note?: string) => void;
  onProposeFare: (orderId: string, fee: number) => void;
  onUpdateDriverLocation?: (orderId: string, location: Coordinates) => void;
  currentUser?: UserAccount | null;
}

export const DeliveryDashboard: React.FC<DeliveryDashboardProps> = ({
  orders,
  store,
  onUpdateOrderStatus,
  onProposeFare,
  onUpdateDriverLocation,
  currentUser,
}) => {
  // Active undelivered orders
  const activeOrders = orders.filter(
    (o) => o.status !== 'entregado' && o.status !== 'cancelado'
  );

  // Multi-selection state for batch routing
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(() =>
    activeOrders.map((o) => o.id)
  );

  // Inspector focus order
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  // Real-time new arrival notification state & sound trigger
  const previousOrderCountRef = useRef<number>(orders.length);
  const [newArrivalBanner, setNewArrivalBanner] = useState<{
    id: string;
    name: string;
    isRemote?: boolean;
    distanceKm?: number;
    detectedRegion?: string;
  } | null>(null);

  useEffect(() => {
    if (orders.length > previousOrderCountRef.current) {
      const newest = orders[0];
      const dist = calculateDistanceKm(store.location, newest.location);
      const isRemote = Boolean(newest.isRemoteLocation || dist > 15);

      const soundMuted = localStorage.getItem('vape_sound_alerts_muted_v1') === 'true';
      if (!soundMuted) {
        playNotificationSound('new-order');
      }
      setNewArrivalBanner({
        id: newest.id,
        name: newest.customerName,
        isRemote,
        distanceKm: dist,
        detectedRegion: newest.detectedRegion,
      });

      // Automatically add newly arrived active order to selection
      setSelectedOrderIds((prev) => (prev.includes(newest.id) ? prev : [newest.id, ...prev]));

      const timeout = setTimeout(() => {
        setNewArrivalBanner(null);
      }, 12000);
      return () => clearTimeout(timeout);
    }
    previousOrderCountRef.current = orders.length;
  }, [orders, store.location]);

  // Keep selected IDs synced with valid active orders
  useEffect(() => {
    setSelectedOrderIds((prev) => {
      const validIds = activeOrders.map((o) => o.id);
      const filtered = prev.filter((id) => validIds.includes(id));
      // If none selected but there are active orders, select all by default
      return filtered.length === 0 && activeOrders.length > 0 ? validIds : filtered;
    });
  }, [orders]);

  // Orders selected for simultaneous route
  const selectedOrders = activeOrders.filter((o) => selectedOrderIds.includes(o.id));

  // Optimized multi-stop route for selected orders (or all active if none selected)
  const routeTargetOrders = selectedOrders.length > 0 ? selectedOrders : activeOrders;
  const optimizedRoute = optimizeMultiStopRoute(store.location, store.name, routeTargetOrders);

  // Driver GPS position
  const [driverPos, setDriverPos] = useState<Coordinates>(() => {
    const firstActiveWithPos = orders.find(
      (o) => o.status !== 'entregado' && o.status !== 'cancelado' && o.driverLocation
    );
    return firstActiveWithPos?.driverLocation || store.location;
  });

  // Real GPS & Screen Wake Lock state
  const [isLiveGpsActive, setIsLiveGpsActive] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | undefined>(undefined);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const wakeLockCleanupRef = useRef<(() => void) | null>(null);
  const gpsCleanupRef = useRef<(() => void) | null>(null);
  const hasNotifiedArrivalRef = useRef<Record<string, boolean>>({});

  const driverId = currentUser?.id || 'repartidor-actual';

  // Toggle or auto-start Live GPS
  const startGps = () => {
    gpsCleanupRef.current?.();
    setGpsError(null);
    setIsLiveGpsActive(true);

    const cleanup = startDriverLiveGPS(
      driverId,
      (coords, speed) => {
        setDriverPos(coords);
        setGpsSpeedKmh(speed);
        setGpsError(null);

        // Check active orders in transit for proximity (<150m)
        activeOrders.forEach((ord) => {
          if (ord.status === 'en_camino') {
            onUpdateDriverLocation?.(ord.id, coords);

            if (isNearDestination(coords, ord.location, 0.15)) {
              if (!hasNotifiedArrivalRef.current[ord.id]) {
                hasNotifiedArrivalRef.current[ord.id] = true;
                onUpdateOrderStatus(ord.id, 'llegada_a_destino', 'GPS: Repartidor llegó a menos de 150m del destino');
                playNotificationSound('alert');
              }
            }
          }
        });
      },
      (errMessage) => {
        setGpsError(errMessage);
      }
    );
    gpsCleanupRef.current = cleanup;
  };

  const stopGps = () => {
    gpsCleanupRef.current?.();
    gpsCleanupRef.current = null;
    setIsLiveGpsActive(false);
  };

  const toggleWakeLock = async () => {
    if (isWakeLockActive) {
      wakeLockCleanupRef.current?.();
      wakeLockCleanupRef.current = null;
      setIsWakeLockActive(false);
    } else {
      const cleanup = await requestScreenWakeLock((active) => {
        setIsWakeLockActive(active);
      });
      wakeLockCleanupRef.current = cleanup;
    }
  };

  // Clean up GPS and Wake Lock on unmount
  useEffect(() => {
    return () => {
      gpsCleanupRef.current?.();
      wakeLockCleanupRef.current?.();
    };
  }, []);

  // Currently focused order in the right pane
  const currentFocusedOrder =
    orders.find((o) => o.id === focusedOrderId) ||
    routeTargetOrders[0] ||
    orders[0];

  const handleToggleSelect = (orderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.length === activeOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(activeOrders.map((o) => o.id));
    }
  };

  const handleSelectFare = (orderId: string, fee: number) => {
    onProposeFare(orderId, fee);
    playNotificationSound('money');
  };

  const [confirmingDeliverId, setConfirmingDeliverId] = useState<string | null>(null);
  const [confirmingBatchDeliver, setConfirmingBatchDeliver] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(
    'Fuera de cobertura (Fuera de Loma de Cabrera)'
  );

  const QUICK_REJECT_REASONS = [
    'Fuera de cobertura (Fuera de Loma de Cabrera)',
    'Líquido agotado temporalmente',
    'Cliente no responde llamadas / WhatsApp',
    'Dirección incompleta o no localizada',
    'Pedido duplicado o de prueba',
  ];

  const handleConfirmRejectOrder = (order: Order) => {
    const finalReason = rejectReason.trim() || 'Pedido rechazado por despacho';
    onUpdateOrderStatus(order.id, 'cancelado', `Rechazado: ${finalReason}`);
    playNotificationSound('alert');
    setRejectingOrderId(null);
  };

  // Batch action: Accept all selected orders and launch simultaneous route
  const handleBatchAcceptAndRoute = async () => {
    if (selectedOrders.length === 0) return;

    // Start live GPS automatically when departing
    if (!isLiveGpsActive) {
      startGps();
    }

    for (const ord of selectedOrders) {
      if (ord.status !== 'en_camino') {
        await Promise.resolve(
          onUpdateOrderStatus(ord.id, 'en_camino', 'Repartidor aceptó y salió a ruta simultánea')
        );
      }
    }

    playNotificationSound('alert');
  };

  // Batch action: Mark all selected orders as delivered
  const handleBatchMarkDelivered = async () => {
    if (selectedOrders.length === 0) return;
    if (!confirmingBatchDeliver) {
      setConfirmingBatchDeliver(true);
      setTimeout(() => setConfirmingBatchDeliver(false), 6000);
      return;
    }
    setConfirmingBatchDeliver(false);
    for (const ord of selectedOrders) {
      await Promise.resolve(
        onUpdateOrderStatus(ord.id, 'entregado', 'Entregado en ruta simultánea')
      );
    }
    playNotificationSound('success');
  };

  // Open external Google Maps route with multiple stops
  const handleOpenGoogleMapsMultiStop = () => {
    const waypoints = optimizedRoute.orderedOrders.map((o) => o.location);
    const url = generateGoogleMapsMultiStopUrl(store.location, waypoints);
    window.open(url, '_blank');
  };

  // Manual fallback step for desktop or test simulation
  const handleSimulateStep = (order: Order) => {
    const nextLat = driverPos.lat + (order.location.lat - driverPos.lat) * 0.45;
    const nextLng = driverPos.lng + (order.location.lng - driverPos.lng) * 0.45;
    const newPos = { lat: nextLat, lng: nextLng };
    setDriverPos(newPos);

    publishDriverLocation(driverId, newPos);
    onUpdateDriverLocation?.(order.id, newPos);

    if (order.status === 'aprobado_en_preparacion' || order.status === 'tarifa_propuesta') {
      onUpdateOrderStatus(order.id, 'en_camino', 'Repartidor en trayecto con GPS');
    }

    const dist = calculateDistanceKm(newPos, order.location);
    if (dist <= 0.15 && order.status === 'en_camino') {
      onUpdateOrderStatus(order.id, 'llegada_a_destino', 'Repartidor en la puerta del cliente (<150m)');
      playNotificationSound('alert');
    }
  };

  const totalAmountSelected = selectedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalSubtotalLiquids = selectedOrders.reduce((sum, o) => sum + o.subtotalLiquid, 0);
  const totalDeliveryFees = selectedOrders.reduce((sum, o) => sum + o.deliveryFee, 0);

  return (
    <div className="space-y-6 font-urban">
      {/* Real-time incoming order audio/visual banner */}
      {newArrivalBanner && (
        <div
          className={`p-4 rounded-3xl font-black shadow-2xl flex items-center justify-between gap-4 animate-bounce ${
            newArrivalBanner.isRemote
              ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-neutral-950 border-2 border-amber-300'
              : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-neutral-950'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-black/20 flex items-center justify-center text-xl shrink-0">
              {newArrivalBanner.isRemote ? '⚠️' : '🔔'}
            </span>
            <div>
              <span className="text-[10px] uppercase tracking-wider block opacity-90">
                {newArrivalBanner.isRemote
                  ? `¡ALERTA! PEDIDO CON UBICACIÓN LEJANA (~${newArrivalBanner.distanceKm} KM)`
                  : '¡NUEVO PEDIDO RECIBIDO EN TIEMPO REAL!'}
              </span>
              <p className="text-sm sm:text-base leading-tight">
                Pedido #{newArrivalBanner.id} para <strong>{newArrivalBanner.name}</strong>{' '}
                {newArrivalBanner.isRemote
                  ? `marcó una IP/antena en ${newArrivalBanner.detectedRegion || 'otra provincia'}. Verifica con el cliente por WhatsApp.`
                  : 'ha entrado a la cola de despacho.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFocusedOrderId(newArrivalBanner.id);
              setNewArrivalBanner(null);
            }}
            className="py-2 px-4 rounded-xl bg-neutral-950 text-white text-xs font-black hover:bg-neutral-900 transition-all cursor-pointer shrink-0 shadow-lg"
          >
            Ver Pedido ➔
          </button>
        </div>
      )}

      {/* Top Delivery Header Banner */}
      <div className="bg-[#0e0a1a]/95 border-2 border-cyan-500/40 rounded-3xl p-5 shadow-2xl shadow-cyan-950/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 flex items-center justify-center">
              <Bike className="w-5 h-5" />
            </span>
            <span className="text-xs font-tag uppercase tracking-wider text-cyan-300">
              DESPACHO CALLEJERO • MOTORIZADOS
            </span>
            <button
              type="button"
              onClick={() => playNotificationSound('new-order')}
              className="py-1 px-2.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-[11px] font-bold text-cyan-200 transition-all cursor-pointer flex items-center gap-1"
              title="Activar y probar timbre sonoro de nuevos pedidos"
            >
              <span>🔔 Probar Timbre</span>
            </button>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white mt-1 font-urban">
            Ruta Simultánea y Despacho en Tiempo Real
          </h2>
          <p className="text-xs text-neutral-300 mt-0.5">
            Selecciona varios pedidos a la vez, traza una ruta unificada con Google Maps y cobra al instante.
          </p>
        </div>

        {/* Route Stats */}
        <div className="flex items-center gap-3 bg-neutral-950/80 border border-neutral-800 p-3 rounded-2xl">
          <div className="text-center px-3 border-r border-neutral-800">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block">
              En Ruta
            </span>
            <span className="text-lg font-black text-white">{selectedOrders.length}</span>
          </div>
          <div className="text-center px-3 border-r border-neutral-800">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block">
              Distancia
            </span>
            <span className="text-lg font-black text-cyan-400">
              {optimizedRoute.totalDistanceKm} km
            </span>
          </div>
          <div className="text-center px-3">
            <span className="text-[10px] uppercase font-bold text-neutral-400 block">
              Tiempo Est.
            </span>
            <span className="text-lg font-black text-emerald-400">
              ~{optimizedRoute.estimatedMinutes} min
            </span>
          </div>
        </div>
      </div>

      {/* Realtime Live GPS & Screen Wake Lock Controller */}
      <div className="bg-neutral-900/95 border-2 border-cyan-500/30 rounded-3xl p-4 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black ${
            isLiveGpsActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50' : 'bg-neutral-800 text-neutral-400'
          }`}>
            <Navigation className={`w-5 h-5 ${isLiveGpsActive ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                isLiveGpsActive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
              }`} />
              <span className="text-xs font-black uppercase text-white font-urban">
                {isLiveGpsActive ? 'GPS en Vivo: Transmitiendo satélite' : 'GPS en Reposo'}
              </span>
              {gpsSpeedKmh !== undefined && (
                <span className="text-[11px] font-mono font-bold bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                  {gpsSpeedKmh} km/h
                </span>
              )}
            </div>
            {gpsError ? (
              <p className="text-xs text-amber-400 mt-0.5 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{gpsError}</span>
              </p>
            ) : (
              <p className="text-xs text-neutral-400 mt-0.5 font-mono">
                Lat: {driverPos.lat.toFixed(5)}, Lng: {driverPos.lng.toFixed(5)} • Transmisión c/6s a clientes
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live GPS button */}
          <button
            type="button"
            onClick={isLiveGpsActive ? stopGps : startGps}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              isLiveGpsActive
                ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700'
                : 'bg-cyan-500 hover:bg-cyan-400 text-neutral-950 shadow-md shadow-cyan-500/20'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{isLiveGpsActive ? 'Pausar GPS' : 'Activar GPS en Vivo'}</span>
          </button>

          {/* Screen Wake Lock toggle button */}
          <button
            type="button"
            onClick={toggleWakeLock}
            className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              isWakeLockActive
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
            }`}
            title="Mantiene la pantalla del celular encendida mientras conduces la moto para no perder la ruta ni suspender el navegador"
          >
            <span>{isWakeLockActive ? '☀️ Pantalla Activa: ON' : '🌙 Pantalla Siempre Activa'}</span>
          </button>
        </div>
      </div>

      {/* BATCH ACTION CONTROLLER: "Aceptar varios pedidos y una ruta por ahí mismo" */}
      <div className="bg-gradient-to-r from-violet-950/90 via-neutral-950 to-[#0e0a1a] border-2 border-purple-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-400/50 flex items-center justify-center font-black">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-tag tracking-wider text-purple-300">
                  DESPACHO SIMULTÁNEO DE PEDIDOS
                </span>
                <span className="text-xs bg-purple-900/60 text-purple-200 px-2 py-0.5 rounded-full font-bold border border-purple-700/50">
                  {selectedOrders.length} seleccionados
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white">
                Aceptar Varios Pedidos & Trazar Ruta Simultánea
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold border border-neutral-700 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              {selectedOrderIds.length === activeOrders.length ? (
                <>
                  <Square className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Deseleccionar Todos</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Seleccionar Todos ({activeOrders.length})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Batch action quick buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-purple-500/20">
          {/* Action 1: Accept all and mark en_camino */}
          <button
            type="button"
            onClick={handleBatchAcceptAndRoute}
            disabled={selectedOrders.length === 0}
            className={`py-3 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              selectedOrders.length > 0
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-neutral-950 shadow-cyan-500/25'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
          >
            <Bike className="w-4 h-4 fill-neutral-950" />
            <span>🛵 Aceptar {selectedOrders.length} Pedidos y Salir</span>
          </button>

          {/* Action 2: Open External Google Maps Multi-Stop Navigation */}
          <button
            type="button"
            onClick={handleOpenGoogleMapsMultiStop}
            disabled={selectedOrders.length === 0}
            className={`py-3 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95 ${
              selectedOrders.length > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 shadow-emerald-500/25'
                : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
            }`}
            title="Abre la ruta con todas las paradas en Google Maps oficial con navegación para motoristas"
          >
            <ExternalLink className="w-4 h-4" />
            <span>🗺️ Abrir Ruta en Google Maps ({selectedOrders.length} Paradas)</span>
          </button>

          {/* Action 3: Mark all delivered */}
          <button
            type="button"
            onClick={handleBatchMarkDelivered}
            disabled={selectedOrders.length === 0}
            className={`py-3 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border active:scale-95 ${
              selectedOrders.length > 0
                ? confirmingBatchDeliver
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-300 ring-2 ring-emerald-400 animate-pulse'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-400 border-emerald-500/40 hover:border-emerald-400'
                : 'bg-neutral-900/50 text-neutral-600 border-neutral-800 cursor-not-allowed'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            <span>
              {confirmingBatchDeliver
                ? `¿Confirmar ${selectedOrders.length} Entregados? (Toca de nuevo)`
                : `✅ Marcar ${selectedOrders.length} Como Entregados`}
            </span>
          </button>
        </div>

        {/* Selected Route Financial Summary */}
        {selectedOrders.length > 0 && (
          <div className="bg-neutral-950/90 border border-neutral-800/80 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">
                  Suma Líquidos
                </span>
                <span className="font-bold text-white">${totalSubtotalLiquids} DOP</span>
              </div>
              <div className="border-l border-neutral-800 pl-4">
                <span className="text-neutral-400 block text-[10px] uppercase font-bold">
                  Total Delivery
                </span>
                <span className="font-bold text-cyan-400">${totalDeliveryFees} DOP</span>
              </div>
              <div className="border-l border-neutral-800 pl-4">
                <span className="text-emerald-400 block text-[10px] uppercase font-black">
                  Total a Cobrar en Calle
                </span>
                <span className="font-black text-emerald-400 text-sm sm:text-base">
                  ${totalAmountSelected} DOP
                </span>
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 font-mono">
              Salida: {store.name} ({store.addressText})
            </div>
          </div>
        )}
      </div>

      {/* Main Map with Multi-Stop Polyline Route */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">
              Mapa en Vivo: Trazado Continuo de la Ruta Seleccionada ({optimizedRoute.orderedOrders.length} Paradas)
            </h3>
          </div>
          <span className="text-xs text-neutral-400">
            Toca el pin de cualquier cliente para ver sus líquidos y llamarlo
          </span>
        </div>

        <MapView
          store={store}
          activeOrders={routeTargetOrders}
          driverLocation={driverPos}
          driverName="Mi Moto (Delivery)"
          routeWaypoints={optimizedRoute.waypoints}
          highlightOrderId={currentFocusedOrder?.id}
          onOrderSelect={(id) => setFocusedOrderId(id)}
          heightClass="h-80 sm:h-96"
        />
      </div>

      {/* Sequential Multi-Stop Strip */}
      {optimizedRoute.legs.length > 0 && (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
              Secuencia Óptima de Paradas Trazada en Ruta:
            </span>
            <span className="text-[11px] text-cyan-400 font-bold">
              {optimizedRoute.totalDistanceKm} km en total
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <div className="px-3 py-1.5 rounded-xl bg-violet-950/60 border border-violet-800/80 text-violet-300 text-xs font-bold shrink-0 flex items-center gap-1.5">
              <span>🏬 Salida: {store.name}</span>
            </div>

            {optimizedRoute.orderedOrders.map((ord, idx) => {
              const isSelected = currentFocusedOrder?.id === ord.id;
              return (
                <React.Fragment key={ord.id}>
                  <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setFocusedOrderId(ord.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-cyan-500 text-neutral-950 shadow-lg shadow-cyan-500/20'
                        : 'bg-neutral-950 text-neutral-300 border border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <span>
                      #{idx + 1} {ord.customerName}
                    </span>
                    <span className="text-[10px] opacity-80">(${ord.totalAmount})</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders Grid & Active Order Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Active Orders List with Multi-Select Checkboxes */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Pedidos para Reparto</span>
              <span className="text-xs text-neutral-400">({activeOrders.length} activos)</span>
            </h3>
            <span className="text-[11px] text-purple-400 font-bold">
              {selectedOrderIds.length} marcados para ruta conjunta
            </span>
          </div>

          {activeOrders.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-900 border border-neutral-800 text-center text-neutral-500 text-sm">
              No hay pedidos pendientes en este momento. Los nuevos pedidos aparecerán aquí automáticamente en tiempo real.
            </div>
          ) : (
            activeOrders.map((order) => {
              const distToStore = calculateDistanceKm(store.location, order.location);
              const isFocused = currentFocusedOrder?.id === order.id;
              const isChecked = selectedOrderIds.includes(order.id);

              return (
                <div
                  key={order.id}
                  onClick={() => setFocusedOrderId(order.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isFocused
                      ? 'bg-neutral-900 border-cyan-500/80 shadow-xl shadow-cyan-950/40 ring-1 ring-cyan-500/50'
                      : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Checkbox for batch multi-order inclusion */}
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={(e) => handleToggleSelect(order.id, e)}
                        className="mt-0.5 p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all cursor-pointer"
                        title={isChecked ? 'Quitar de la ruta' : 'Incluir en la ruta conjunta'}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-cyan-400 fill-cyan-400/20" />
                        ) : (
                          <Square className="w-5 h-5 text-neutral-600" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-white">#{order.id}</span>
                          <span className="text-xs font-semibold text-neutral-300">
                            {order.customerName}
                          </span>
                        </div>
                        {(() => {
                          const orderCalc = calculateDeliveryFee(distToStore);
                          return (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] text-cyan-400 font-semibold">
                                📍 {distToStore} km
                              </span>
                              <span
                                className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded border"
                                style={{
                                  backgroundColor: `${orderCalc.zone.color}20`,
                                  borderColor: `${orderCalc.zone.color}60`,
                                  color: orderCalc.zone.color,
                                }}
                              >
                                {orderCalc.zone.shortLabel}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Remote / Suspicious location warning */}
                        {Boolean(order.isRemoteLocation || distToStore > 15) && (
                          <div className="mt-2 p-2 rounded-xl bg-amber-950/80 border border-amber-500/70 flex items-start justify-between gap-2 text-xs">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <span className="text-sm shrink-0">⚠️</span>
                              <div>
                                <span className="font-bold text-amber-300 block text-[11px]">
                                  Ubicación lejana ({distToStore} km)
                                </span>
                                <span className="text-[10px] text-amber-200/90 block leading-tight">
                                  Posible IP en {order.detectedRegion || 'otra provincia'}. Confirma dirección real.
                                </span>
                              </div>
                            </div>
                            <a
                              href={generateWhatsAppLink(
                                order.customerPhone,
                                `Hola ${order.customerName}, somos de Black Vape Loma de Cabrera. Notamos que tu pedido #${order.id} marcó una ubicación a ${distToStore} km fuera de la zona. ¿Podrías confirmarnos tu dirección en Loma de Cabrera o enviarnos tu ubicación actual por WhatsApp?`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shrink-0 flex items-center gap-1 shadow cursor-pointer active:scale-95"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Confirmar</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase block ${
                          order.status === 'pendiente_cotizacion'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                            : order.status === 'tarifa_propuesta'
                            ? 'bg-blue-500/20 text-blue-400'
                            : order.status === 'en_camino'
                            ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                            : order.status === 'llegada_a_destino'
                            ? 'bg-purple-500/20 text-purple-400 animate-bounce'
                            : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs font-black text-white block">
                        ${order.totalAmount} DOP
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedOrderId(order.id);
                          setRejectingOrderId(order.id);
                        }}
                        className="mt-0.5 py-1 px-2 rounded-lg bg-red-950/60 hover:bg-red-900/80 border border-red-500/40 text-red-300 hover:text-white text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                        title="Rechazar o cancelar este pedido"
                      >
                        <XCircle className="w-3 h-3" />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  </div>

                  {/* Liquid payload preview */}
                  <div className="mt-3 pt-2.5 border-t border-neutral-800/80 text-xs text-neutral-300 space-y-1">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          <strong className="text-emerald-400">{it.quantity}x</strong>{' '}
                          {it.productName}{' '}
                          <span className="text-neutral-500">
                            ({it.portion === 'tanque_lleno' ? 'Tanque Lleno' : 'Mitad'})
                          </span>
                        </span>
                        <span className="font-bold text-white">${it.unitPrice * it.quantity}</span>
                      </div>
                    ))}
                  </div>

                  {/* Delivery fare proposal strip for pending orders */}
                  {order.status === 'pendiente_cotizacion' && (
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          ⚡ Elegir tarifa según distancia (1.5 km = $25 DOP):
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          Sugerida: ${calculateDeliveryFee(distToStore).fee} DOP
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {([25, 50, 75, 100, 125, 150] as const).map((tier) => {
                          const isSuggested = calculateDeliveryFee(distToStore).fee === tier;
                          return (
                            <button
                              key={tier}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFare(order.id, tier);
                              }}
                              className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 text-center ${
                                isSuggested
                                  ? 'bg-cyan-500 text-neutral-950 ring-2 ring-cyan-300'
                                  : 'bg-neutral-950 hover:bg-neutral-800 text-cyan-400 border border-neutral-800'
                              }`}
                            >
                              ${tier}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right: Selected Order Detail Inspector & Live Controls */}
        <div className="lg:col-span-6">
          {currentFocusedOrder ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-2xl space-y-5 sticky top-20">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                    Detalle del Pedido Seleccionado
                  </span>
                  <h3 className="text-lg font-black text-white">
                    Pedido #{currentFocusedOrder.id} • {currentFocusedOrder.customerName}
                  </h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-300">
                  Total: ${currentFocusedOrder.totalAmount} DOP
                </span>
              </div>

              {/* Remote location banner for focused order */}
              {(() => {
                const dist = calculateDistanceKm(store.location, currentFocusedOrder.location);
                if (!currentFocusedOrder.isRemoteLocation && dist <= 15) return null;
                return (
                  <div className="p-3.5 rounded-2xl bg-amber-950/80 border-2 border-amber-500 text-amber-100 text-xs space-y-2">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xl shrink-0">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <strong className="text-amber-300 font-bold block">
                          Ubicación fuera de Loma de Cabrera (~{dist} km)
                        </strong>
                        <p className="text-[11px] text-amber-200/90 mt-0.5 leading-snug">
                          El cliente reportó coordenadas en {currentFocusedOrder.detectedRegion || 'otra provincia'}. Comunícate por WhatsApp para verificar si se encuentra en Loma de Cabrera antes de iniciar el trayecto.
                        </p>
                      </div>
                    </div>
                    <a
                      href={generateWhatsAppLink(
                        currentFocusedOrder.customerPhone,
                        `Hola ${currentFocusedOrder.customerName}, somos de Black Vape Loma de Cabrera. Notamos que tu pedido #${currentFocusedOrder.id} marcó una ubicación a ${dist} km fuera de la zona. ¿Podrías confirmarnos tu dirección en Loma de Cabrera o enviarnos tu ubicación actual por WhatsApp?`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow active:scale-98 transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-black" />
                      <span>Confirmar Dirección por WhatsApp</span>
                    </a>
                  </div>
                );
              })()}

              {/* Customer direct contact & WhatsApp buttons */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-neutral-950 to-neutral-950 border border-emerald-500/30 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                      Contacto del Cliente
                    </span>
                    <strong className="text-base text-white block">
                      {currentFocusedOrder.customerName}
                    </strong>
                    <span className="text-xs text-neutral-400">
                      Tel: {currentFocusedOrder.customerPhone}
                    </span>
                    {currentFocusedOrder.deliveryAddressNote && (
                      <p className="text-xs text-neutral-300 mt-1 italic">
                        📍 {currentFocusedOrder.deliveryAddressNote}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-2 shrink-0">
                    <a
                      href={`tel:${currentFocusedOrder.customerPhone}`}
                      className="py-2.5 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      title="Llamada telefónica directa"
                    >
                      <Phone className="w-3.5 h-3.5 fill-neutral-950" />
                      <span>Llamar</span>
                    </a>

                    <a
                      href={generateWhatsAppLink(
                        currentFocusedOrder.customerPhone,
                        WhatsAppTemplates.driverToClient(
                          currentFocusedOrder.customerName,
                          currentFocusedOrder.id,
                          currentFocusedOrder.deliveryAddressNote
                        )
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2.5 px-3.5 rounded-xl bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold text-xs border border-emerald-500/50 shadow-lg shadow-emerald-950/50 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                      title="Escribir al WhatsApp del cliente"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>

                {/* Quick arrival WhatsApp notice if in arrival status */}
                {currentFocusedOrder.status === 'llegada_a_destino' && (
                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-purple-300 font-semibold">
                      📍 Has llegado. ¿No sale el cliente?
                    </span>
                    <a
                      href={generateWhatsAppLink(
                        currentFocusedOrder.customerPhone,
                        WhatsAppTemplates.driverArrival(
                          currentFocusedOrder.customerName,
                          currentFocusedOrder.id
                        )
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition-all shrink-0 flex items-center gap-1"
                    >
                      <span>💬 Avisar por WhatsApp</span>
                    </a>
                  </div>
                )}
              </div>

              {/* Payment Method & Cash Change Breakdown */}
              <div className="p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 space-y-2">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  Instrucciones de Cobro & Pago:
                </span>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentFocusedOrder.paymentMethod === 'transferencia' ? (
                      <Building className="w-4 h-4 text-cyan-400" />
                    ) : currentFocusedOrder.paymentMethod === 'tarjeta' ? (
                      <CreditCard className="w-4 h-4 text-purple-400" />
                    ) : (
                      <Banknote className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="text-xs font-bold text-white capitalize">
                      {currentFocusedOrder.paymentMethod === 'transferencia'
                        ? 'Transferencia Bancaria'
                        : currentFocusedOrder.paymentMethod === 'tarjeta'
                        ? 'Tarjeta / Pago Digital'
                        : 'Pago en Efectivo'}
                    </span>
                  </div>

                  <span className="text-xs font-black text-emerald-400">
                    Total a Cobrar: ${currentFocusedOrder.totalAmount} DOP
                  </span>
                </div>

                {/* If Cash: breakdown given and change required */}
                {(!currentFocusedOrder.paymentMethod || currentFocusedOrder.paymentMethod === 'efectivo') && (
                  <div className="mt-2 p-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs">
                    {currentFocusedOrder.cashGiven && currentFocusedOrder.cashGiven > currentFocusedOrder.totalAmount ? (
                      <div className="space-y-1">
                        <div className="flex justify-between text-neutral-300">
                          <span>Paga con billete de:</span>
                          <span className="font-bold text-white">${currentFocusedOrder.cashGiven} DOP</span>
                        </div>
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>💵 Llevar de cambio al cliente:</span>
                          <span>${currentFocusedOrder.changeDue ?? (currentFocusedOrder.cashGiven - currentFocusedOrder.totalAmount)} DOP</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-neutral-400">
                        💵 Llevar monto exacto (${currentFocusedOrder.totalAmount} DOP) o consultar cambio con el cliente.
                      </span>
                    )}
                  </div>
                )}

                {/* If Special delivery notes */}
                {currentFocusedOrder.specialNotes && (
                  <div className="mt-2 p-2.5 rounded-xl bg-neutral-900 border border-amber-500/20 text-xs flex items-start gap-2">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-300 block text-[10px] uppercase">
                        Nota especial del cliente:
                      </span>
                      <p className="text-neutral-200 italic mt-0.5">
                        "{currentFocusedOrder.specialNotes}"
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Liquids to Deliver */}
              <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                  Líquidos para este cliente:
                </span>
                <div className="space-y-2 divide-y divide-neutral-900 text-xs">
                  {currentFocusedOrder.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center pt-2 first:pt-0">
                      <div>
                        <span className="text-white font-bold">{it.quantity}x {it.productName}</span>
                        <span className="text-cyan-400 ml-2">
                          ({it.portion === 'tanque_lleno' ? 'Tanque Lleno' : 'Mitad'})
                        </span>
                      </div>
                      <span className="font-bold text-white">${it.unitPrice * it.quantity} DOP</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Fee Setter / Distance calculation */}
              {(() => {
                const selectedDist = calculateDistanceKm(store.location, currentFocusedOrder.location);
                const selectedCalc = calculateDeliveryFee(selectedDist);

                return (
                  <div className="p-4 rounded-2xl bg-neutral-950/70 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300 uppercase tracking-wider block">
                        Tarifa de Delivery (1.5 km = $25 DOP):
                      </span>
                      <span className="text-xs font-black text-emerald-400">
                        {selectedCalc.zone.shortLabel} ({selectedDist} km)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                      {([25, 50, 75, 100, 125, 150] as const).map((tier) => {
                        const isCurrentFee = currentFocusedOrder.deliveryFee === tier;
                        const isCalculatedFee = selectedCalc.fee === tier;

                        return (
                          <button
                            key={tier}
                            type="button"
                            onClick={() => handleSelectFare(currentFocusedOrder.id, tier)}
                            className={`py-2 px-1 rounded-xl text-xs font-black transition-all cursor-pointer text-center relative ${
                              isCurrentFee
                                ? 'bg-cyan-500 text-neutral-950 shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-300'
                                : 'bg-neutral-900 text-cyan-400 border border-neutral-800 hover:border-neutral-700'
                            }`}
                          >
                            <span>${tier}</span>
                            {isCalculatedFee && (
                              <span className="absolute -top-1.5 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-neutral-900" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Real-time Order State Controls */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block">
                  Actualizar Estado de Este Pedido:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSimulateStep(currentFocusedOrder)}
                    className="py-2.5 px-3 rounded-xl bg-cyan-600/80 hover:bg-cyan-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
                    title="Avanza manualmente el repartidor para pruebas en computadoras sin satélite GPS"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Avanzar GPS (Prueba/Demo)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateOrderStatus(currentFocusedOrder.id, 'en_camino');
                      playNotificationSound('alert');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Bike className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Marcar En Camino</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateOrderStatus(currentFocusedOrder.id, 'llegada_a_destino');
                      playNotificationSound('alert');
                    }}
                    className="py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer active:scale-95"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Llegué a la Ubicación</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirmingDeliverId !== currentFocusedOrder.id) {
                        setConfirmingDeliverId(currentFocusedOrder.id);
                        setTimeout(() => {
                          setConfirmingDeliverId((prev) =>
                            prev === currentFocusedOrder.id ? null : prev
                          );
                        }, 6000);
                        return;
                      }
                      setConfirmingDeliverId(null);
                      onUpdateOrderStatus(currentFocusedOrder.id, 'entregado');
                      playNotificationSound('success');
                    }}
                    className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg cursor-pointer active:scale-95 ${
                      confirmingDeliverId === currentFocusedOrder.id
                        ? 'bg-amber-400 hover:bg-amber-300 text-neutral-950 ring-2 ring-white animate-pulse'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-emerald-500/20'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>
                      {confirmingDeliverId === currentFocusedOrder.id
                        ? `¿Confirmar Cobro $${currentFocusedOrder.totalAmount}?`
                        : 'Entregado & Cobrado'}
                    </span>
                  </button>
                </div>

                {/* Reject / Cancel Order Trigger & Inline Reason Selector */}
                {currentFocusedOrder.status !== 'entregado' &&
                  currentFocusedOrder.status !== 'cancelado' && (
                    <div className="pt-2">
                      {rejectingOrderId !== currentFocusedOrder.id ? (
                        <button
                          type="button"
                          onClick={() => setRejectingOrderId(currentFocusedOrder.id)}
                          className="w-full py-2.5 px-3 rounded-xl bg-red-950/50 hover:bg-red-900/70 border border-red-500/40 hover:border-red-400 text-red-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        >
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span>Rechazar / Cancelar Este Pedido</span>
                        </button>
                      ) : (
                        <div className="p-4 rounded-2xl bg-red-950/40 border-2 border-red-500/60 space-y-3 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-red-300 flex items-center gap-1.5">
                              <XCircle className="w-4 h-4 text-red-400" />
                              <span>Rechazar Pedido #{currentFocusedOrder.id}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setRejectingOrderId(null)}
                              className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>

                          <div>
                            <span className="text-[11px] font-bold text-neutral-300 block mb-1.5">
                              Selecciona o escribe el motivo del rechazo:
                            </span>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {QUICK_REJECT_REASONS.map((reason) => (
                                <button
                                  key={reason}
                                  type="button"
                                  onClick={() => setRejectReason(reason)}
                                  className={`py-1 px-2.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                                    rejectReason === reason
                                      ? 'bg-red-600 text-white border-red-400 shadow'
                                      : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-red-500/40'
                                  }`}
                                >
                                  {reason}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="Escribe el motivo del rechazo..."
                              className="w-full bg-neutral-950 border border-red-500/40 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-red-400"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmRejectOrder(currentFocusedOrder)}
                              className="py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-950/60 cursor-pointer active:scale-95 transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Confirmar Rechazo</span>
                            </button>

                            <a
                              href={generateWhatsAppLink(
                                currentFocusedOrder.customerPhone,
                                WhatsAppTemplates.orderRejected(
                                  currentFocusedOrder.customerName,
                                  currentFocusedOrder.id,
                                  rejectReason.trim() || 'Pedido rechazado por despacho'
                                )
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleConfirmRejectOrder(currentFocusedOrder)}
                              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/60 cursor-pointer active:scale-95 transition-all"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Rechazar y Avisar WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-neutral-900 border border-neutral-800 text-center text-neutral-500 text-sm">
              Selecciona un pedido para inspeccionar o gestionar su trayecto.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
