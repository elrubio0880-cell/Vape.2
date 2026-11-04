import React, { useState } from 'react';
import { Order, StoreConfig, UserAccount, Coordinates } from '../../types';
import { MapView } from '../MapView';
import { ClientActiveOrderView } from './ClientActiveOrderView';
import { DeliveryDashboard } from '../delivery/DeliveryDashboard';
import { DELIVERY_ZONES, calculateDistanceKm, calculateDeliveryFee } from '../../utils/routing';
import { getStoredUserLocation, saveStoredUserLocation, playNotificationSound } from '../../utils/storage';
import { getHighAccuracyGPS } from '../../utils/geocoding';
import { MapPin, ShoppingBag, Store, Phone, Clock, Radar, Sparkles, Navigation, CheckCircle2 } from 'lucide-react';

interface MapaRastreoSectionProps {
  currentUser: UserAccount | null;
  activeOrder: Order | null;
  orders: Order[];
  store: StoreConfig;
  onApproveFare: (orderId: string) => void;
  onRejectOrder: (orderId: string) => void;
  onNewOrder: () => void;
  onGoToShop: () => void;
  onUpdateOrderStatus: (orderId: string, newStatus: Order['status'], note?: string) => void;
  onProposeFare: (orderId: string, fee: number) => void;
  onUpdateDriverLocation?: (orderId: string, location: Coordinates) => void;
  onUpdateOrderLocation?: (orderId: string, newLocation: Coordinates) => void;
}

export const MapaRastreoSection: React.FC<MapaRastreoSectionProps> = ({
  currentUser,
  activeOrder,
  orders,
  store,
  onApproveFare,
  onRejectOrder,
  onNewOrder,
  onGoToShop,
  onUpdateOrderStatus,
  onProposeFare,
  onUpdateDriverLocation,
  onUpdateOrderLocation,
}) => {
  // If logged in as Delivery or Admin, show delivery dispatch hub directly
  if (currentUser?.role === 'delivery' || currentUser?.role === 'admin') {
    return (
      <DeliveryDashboard
        orders={orders}
        store={store}
        currentUser={currentUser}
        onUpdateOrderStatus={onUpdateOrderStatus}
        onProposeFare={onProposeFare}
        onUpdateDriverLocation={onUpdateDriverLocation}
      />
    );
  }

  // If buyer has active order, show active order tracking
  if (activeOrder) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white">Seguimiento en Vivo de tu Pedido</h2>
            <p className="text-xs text-neutral-400">
              Rastreo en tiempo real, cotización de tarifa y contacto telefónico directo.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToShop}
            className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
          >
            Ver más líquidos en Tienda
          </button>
        </div>

        <ClientActiveOrderView
          order={activeOrder}
          store={store}
          onApproveFare={onApproveFare}
          onRejectOrder={onRejectOrder}
          onNewOrder={onNewOrder}
          onUpdateOrderLocation={onUpdateOrderLocation}
        />
      </div>
    );
  }

  // State for user's personal location preview when no order is active
  const [userLocation, setUserLocation] = useState<Coordinates | null>(() => getStoredUserLocation());
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  const userDistanceKm = userLocation ? calculateDistanceKm(store.location, userLocation) : null;
  const userDeliveryCalc = userDistanceKm !== null ? calculateDeliveryFee(userDistanceKm) : null;

  const handleDetectGPS = async () => {
    setIsLocating(true);
    setGpsStatusMsg('🛰️ Conectando con satélites GPS...');
    try {
      const res = await getHighAccuracyGPS((acc) => {
        setGpsStatusMsg(`🛰️ Calibrando satélites (±${acc}m)...`);
      });
      if (res.isSuspiciousIpOrRemote) {
        setGpsStatusMsg(
          `⚠️ Tu red reportó ${res.issueDetection.detectedRegionName}. Selecciona tu sector en el mapa.`
        );
        setTimeout(() => setGpsStatusMsg(null), 6000);
      } else {
        setUserLocation(res.coords);
        saveStoredUserLocation(res.coords);
        playNotificationSound('pop');
        setGpsStatusMsg(`🎯 ¡Ubicación detectada! Precisión ±${res.accuracyMeters}m`);
        setTimeout(() => setGpsStatusMsg(null), 4000);
      }
    } catch (err: any) {
      setGpsStatusMsg(err?.message || 'No se pudo obtener el GPS.');
      setTimeout(() => setGpsStatusMsg(null), 5000);
    } finally {
      setIsLocating(false);
    }
  };

  // If no active order, show physical store location map and user's relation to it
  return (
    <div className="space-y-6">
      <div className="bg-[#0e091a] border border-purple-900/40 rounded-3xl p-5 shadow-2xl shadow-purple-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-purple-900/30">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Store className="w-4 h-4" />
              <span>Sede Central & Cobertura de Entrega</span>
            </div>
            <h2 className="text-xl font-black text-white font-urban">
              Ubicación de BLACK VAPE & Tu Posición en Loma de Cabrera
            </h2>
            <p className="text-xs text-neutral-300 mt-1">
              Sede física en <strong>{store.name}</strong> ({store.addressText}). Regla oficial de delivery: <strong>cada 1.5 km = $25 DOP</strong> ($25, $50, $75, etc.).
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleDetectGPS}
              disabled={isLocating}
              className="py-2.5 px-4 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/60 text-blue-200 hover:text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-md active:scale-95"
            >
              {isLocating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Localizando GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5 text-blue-400" />
                  <span>Detectar mi Ubicación GPS</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onGoToShop}
              className="py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl shadow-lg shadow-purple-900/40 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-cyan-300" />
              <span>Pedir Líquidos</span>
            </button>
          </div>
        </div>

        {/* GPS Status pill notice if present */}
        {gpsStatusMsg && (
          <div className="mt-3 p-3 rounded-2xl bg-blue-950/70 border border-blue-500/50 text-blue-200 text-xs flex items-center gap-2 animate-in fade-in">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-bold">{gpsStatusMsg}</span>
          </div>
        )}

        {/* User Distance & Fare preview card if user location detected */}
        {userLocation && userDistanceKm !== null && userDeliveryCalc && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-purple-950/60 border border-cyan-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 flex items-center justify-center text-xl shrink-0 font-black">
                📍
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-400 block tracking-wider">
                  DISTANCIA CALCULADA A TU CASA
                </span>
                <strong className="text-sm text-white font-urban block">
                  Estás a <span className="text-cyan-300 font-black">{userDistanceKm.toFixed(2)} km</span> de BLACK VAPE (Colmado Noadia)
                </strong>
                <span className="text-xs text-neutral-400 block mt-0.5">
                  Tarifa estimada de viaje: <span className="text-emerald-400 font-black">${userDeliveryCalc.fee} DOP</span> ({userDeliveryCalc.zone.label})
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onGoToShop}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 self-end sm:self-auto"
            >
              <span>Hacer Pedido para Esta Ubicación</span>
              <span>🛵</span>
            </button>
          </div>
        )}

        {/* Store Map with concentric delivery rings & user's actual location */}
        <div className="mt-5">
          <MapView
            store={store}
            selectedLocation={userLocation || undefined}
            targetLabel="Tu Casa / Entrega"
            heightClass="h-80 sm:h-96"
            showDeliveryZones={true}
            routeWaypoints={userLocation ? [store.location, userLocation] : []}
            isDraggableTarget={true}
            onSelectLocation={(coords) => {
              setUserLocation(coords);
              saveStoredUserLocation(coords);
            }}
          />
        </div>

        {/* Delivery Radial Zones Legend Strip */}
        <div className="mt-4 p-4 rounded-2xl bg-neutral-950/90 border border-neutral-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider font-urban">
                Rangos Visuales de Entrega a la Redonda del Local
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-md border border-cyan-800/60 self-start sm:self-auto">
              Regla: Cada 1.5 km = $25 DOP
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {DELIVERY_ZONES.map((zone) => (
              <div
                key={zone.tier}
                className="p-2.5 rounded-xl border bg-black/50 flex flex-col justify-between transition-all hover:border-neutral-600"
                style={{ borderColor: `${zone.color}40` }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: zone.color }}
                  />
                  <span className="text-[11px] font-black font-urban text-white truncate">
                    Zona {zone.tier}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-black block" style={{ color: zone.color }}>
                    ${zone.fee} DOP
                  </span>
                  <span className="text-[10px] text-neutral-400 block font-mono">
                    Hasta {zone.maxKm} km
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Store Information Cards */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800">
            <span className="text-[10px] text-neutral-400 uppercase font-bold block">
              Dirección del Local
            </span>
            <strong className="text-sm text-white block mt-0.5">{store.addressText}</strong>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-neutral-400 uppercase font-bold block">
                Teléfono de la Tienda
              </span>
              <strong className="text-sm text-white block mt-0.5">{store.phone}</strong>
            </div>
            <a
              href={`tel:${store.phone}`}
              className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              title="Llamar a la tienda"
            >
              <Phone className="w-4 h-4" />
            </a>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800">
            <span className="text-[10px] text-neutral-400 uppercase font-bold block">
              Horario de Reparto
            </span>
            <div className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Abierto • Entregas inmediatas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
