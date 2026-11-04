import React from 'react';
import { Order, StoreConfig, Coordinates } from '../../types';
import { MapView } from '../MapView';
import { playNotificationSound } from '../../utils/storage';
import { subscribeToDriverLocation } from '../../utils/gpsTracking';
import { calculateDistanceKm } from '../../utils/routing';
import { getHighAccuracyGPS } from '../../utils/geocoding';
import { generateWhatsAppLink } from '../../utils/whatsapp';
import { Phone, CheckCircle, Clock, Bike, ShieldCheck, MapPin, Receipt, XCircle, AlertTriangle, Star, WifiOff, Navigation } from 'lucide-react';

interface ClientActiveOrderViewProps {
  order: Order;
  store: StoreConfig;
  onApproveFare: (orderId: string) => void;
  onRejectOrder: (orderId: string) => void;
  onNewOrder: () => void;
  onUpdateOrderLocation?: (orderId: string, newLocation: Coordinates) => void;
}

export const ClientActiveOrderView: React.FC<ClientActiveOrderViewProps> = ({
  order,
  store,
  onApproveFare,
  onRejectOrder,
  onNewOrder,
  onUpdateOrderLocation,
}) => {
  const isPendingQuote = order.status === 'pendiente_cotizacion';
  const isFareProposed = order.status === 'tarifa_propuesta';
  const isInProgress =
    order.status === 'aprobado_en_preparacion' ||
    order.status === 'en_camino' ||
    order.status === 'llegada_a_destino';
  const isCompleted = order.status === 'entregado';
  const isCanceled = order.status === 'cancelado';

  const [rating, setRating] = React.useState<number>(5);
  const [rated, setRated] = React.useState<boolean>(false);
  const [confirmingCancel, setConfirmingCancel] = React.useState<boolean>(false);

  const cancelEntry =
    isCanceled
      ? [...(order.statusHistory || [])].reverse().find((h) => h.status === 'cancelado' && h.note)
      : undefined;

  // Live driver position & signal loss status
  const [liveDriverPos, setLiveDriverPos] = React.useState<Coordinates | null>(order.driverLocation || null);
  const [isDriverSignalLost, setIsDriverSignalLost] = React.useState<boolean>(false);

  // Check if order destination is at the store (0 km) or out of zone (> 25 km)
  const orderDistanceKm = calculateDistanceKm(store.location, order.location);
  const isOrderAtStore = orderDistanceKm < 0.05;
  const isOrderOutOfZone = orderDistanceKm > 15 || Boolean(order.isRemoteLocation);
  const [isFixingLocation, setIsFixingLocation] = React.useState(false);
  const [fixLocationError, setFixLocationError] = React.useState<string | null>(null);

  const handleFixLocationWithGPS = async () => {
    setIsFixingLocation(true);
    setFixLocationError(null);
    try {
      const res = await getHighAccuracyGPS();
      if (res.isSuspiciousIpOrRemote) {
        setFixLocationError(
          `⚠️ Tu red detectó ${res.issueDetection.detectedRegionName}. Arrastra el pin directamente en el mapa hacia tu casa.`
        );
      } else {
        if (onUpdateOrderLocation) {
          onUpdateOrderLocation(order.id, res.coords);
        }
        playNotificationSound('success');
      }
    } catch (err: any) {
      setFixLocationError(err?.message || 'No se pudo obtener el GPS.');
      setTimeout(() => setFixLocationError(null), 5000);
    } finally {
      setIsFixingLocation(false);
    }
  };

  React.useEffect(() => {
    if (!isInProgress || !order.driverId) return;

    const unsubscribe = subscribeToDriverLocation(order.driverId, (state) => {
      setLiveDriverPos(state.coords);
      setIsDriverSignalLost(state.isSignalLost);
    });

    return () => {
      unsubscribe();
    };
  }, [isInProgress, order.driverId]);

  // Live or last known driver coordinate (defaults to store location before GPS starts)
  const currentDriverPos = liveDriverPos || order.driverLocation || store.location;

  const routeWaypoints =
    isInProgress && (liveDriverPos || order.driverLocation)
      ? [store.location, currentDriverPos, order.location]
      : [store.location, order.location];

  return (
    <div className="space-y-5 animate-in fade-in duration-300 font-urban">
      {/* Status banner */}
      <div className="bg-[#0d0918]/95 border-2 border-purple-500/40 rounded-3xl p-5 shadow-2xl shadow-purple-950 relative overflow-hidden">
        {/* Glow */}
        {isFareProposed && (
          <div className="absolute inset-0 bg-cyan-500/10 pointer-events-none animate-pulse" />
        )}
        {order.status === 'llegada_a_destino' && (
          <div className="absolute inset-0 bg-purple-500/20 pointer-events-none animate-pulse" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-purple-900/40 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-tag tracking-wider text-purple-400">PEDIDO #{order.id}</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  isPendingQuote
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : isFareProposed
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : order.status === 'en_camino'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse'
                    : order.status === 'llegada_a_destino'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-bounce'
                    : isCompleted
                    ? 'bg-neutral-800 text-neutral-300'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              {isPendingQuote && 'Esperando Cotización del Delivery...'}
              {isFareProposed && '¡Propuesta de Tarifa Recibida!'}
              {order.status === 'aprobado_en_preparacion' && 'Aprobado • Preparando tus Líquidos'}
              {order.status === 'en_camino' && 'Repartidor en Camino a tu Ubicación 🛵'}
              {order.status === 'llegada_a_destino' && '🛵 ¡El Delivery ha llegado!'}
              {isCompleted && 'Pedido Entregado con Éxito'}
              {isCanceled && 'Pedido Cancelado'}
            </h2>
          </div>

          {/* Action to start new order if done, or cancel if still pending/preparing */}
          <div className="flex items-center gap-2 flex-wrap">
            {(isPendingQuote || isFareProposed || order.status === 'aprobado_en_preparacion') && (
              <button
                type="button"
                onClick={() => {
                  if (!confirmingCancel) {
                    setConfirmingCancel(true);
                    setTimeout(() => setConfirmingCancel(false), 6000);
                    return;
                  }
                  setConfirmingCancel(false);
                  onRejectOrder(order.id);
                }}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  confirmingCancel
                    ? 'bg-red-600 text-white border-red-400 animate-pulse shadow-lg'
                    : 'bg-red-950/50 hover:bg-red-900/70 text-red-300 hover:text-white border-red-500/40'
                }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>
                  {confirmingCancel ? '¿Seguro? Toca para cancelar' : 'Cancelar Pedido'}
                </span>
              </button>
            )}

            {(isCompleted || isCanceled) && (
              <button
                type="button"
                onClick={onNewOrder}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow cursor-pointer"
              >
                Hacer Otro Pedido
              </button>
            )}
          </div>
        </div>

        {/* Rejection / Cancellation Reason Alert Box */}
        {isCanceled && (
          <div className="mt-4 p-4 rounded-2xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm font-bold text-white block">
                Este pedido fue rechazado o cancelado
              </strong>
              <p className="text-red-200/90 mt-0.5">
                {cancelEntry?.note || 'La solicitud fue cancelada.'}
              </p>
            </div>
          </div>
        )}

        {/* inDrive Fare Proposal Confirmation Box */}
        {isFareProposed && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-500/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider block">
                  Propuesta del Repartidor (Estilo inDrive):
                </span>
                <div className="text-2xl font-black text-white mt-1">
                  Tarifa de Envío: <span className="text-blue-400">${order.deliveryFee} DOP</span>
                </div>
                <div className="text-xs text-neutral-300 mt-1">
                  Líquidos: ${order.subtotalLiquid} DOP + Delivery: ${order.deliveryFee} DOP ={' '}
                  <strong className="text-emerald-400 text-sm">
                    Total: ${order.totalAmount} DOP
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmingCancel) {
                      setConfirmingCancel(true);
                      setTimeout(() => setConfirmingCancel(false), 6000);
                      return;
                    }
                    setConfirmingCancel(false);
                    onRejectOrder(order.id);
                  }}
                  className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    confirmingCancel
                      ? 'bg-red-600 text-white ring-2 ring-red-400 animate-pulse'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {confirmingCancel ? '¿Confirmar Rechazo?' : 'Rechazar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playNotificationSound('money');
                    onApproveFare(order.id);
                  }}
                  className="py-2.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-black shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Aprobar y Proceder con el Recibo</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Driver arrival announcement */}
        {order.status === 'llegada_a_destino' && (
          <div className="mt-4 p-4 rounded-2xl bg-purple-950/70 border border-purple-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-purple-200 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🛵</span>
              <div>
                <strong className="text-sm font-bold text-white block">
                  El repartidor está en la puerta
                </strong>
                Por favor sal con tu vape a mano para que te eche el líquido o contesta si te llama.
              </div>
            </div>
            {order.driverPhone && (
              <a
                href={`tel:${order.driverPhone}`}
                className="py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow"
              >
                <Phone className="w-3.5 h-3.5" />
                Llamar al Repartidor
              </a>
            )}
          </div>
        )}

        {/* Rating and review card when completed */}
        {isCompleted && (
          <div className="mt-4 p-4 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div>
              <strong className="text-white font-bold block text-sm">
                ¿Qué tal estuvo tu entrega de líquidos?
              </strong>
              <span className="text-neutral-400">
                Califica el servicio de {order.driverName || 'tu repartidor'}
              </span>
            </div>

            {rated ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-950 text-emerald-300 font-bold border border-emerald-500/40">
                ¡Gracias por tus {rating} estrellas! ⭐
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setRating(star);
                      setRated(true);
                      playNotificationSound('success');
                    }}
                    className={`p-1.5 rounded-lg transition-transform hover:scale-125 cursor-pointer ${
                      star <= rating ? 'text-amber-400' : 'text-neutral-600'
                    }`}
                    title={`Calificar con ${star} estrellas`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Signal Lost warning indicator */}
        {isInProgress && isDriverSignalLost && (
          <div className="mt-3 p-3 rounded-2xl bg-amber-950/70 border border-amber-500/60 text-amber-200 text-xs flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="font-bold block">Repartidor sin señal de satélite</span>
                <span className="text-[11px] text-amber-300">
                  Sin actualización de GPS desde hace más de 60 segundos. Mostrando última posición recibida.
                </span>
              </div>
            </div>
            {order.driverPhone && (
              <a
                href={`tel:${order.driverPhone}`}
                className="py-1 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shrink-0 shadow"
              >
                Llamar
              </a>
            )}
          </div>
        )}

        {/* Warning if order location is out of zone (> 25 km) */}
        {isOrderOutOfZone && !isCompleted && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-950/90 border-2 border-amber-500 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-100 animate-in fade-in">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <strong className="text-white font-bold block text-sm">
                  Ubicación del pedido reportada fuera de Loma de Cabrera ({orderDistanceKm.toFixed(1)} km)
                </strong>
                <p className="text-amber-200 text-xs mt-0.5">
                  Las coordenadas quedaron registradas por antena o IP fuera del municipio. Toca abajo para fijar en Loma de Cabrera o arrastra el pin hacia tu casa en el mapa.
                </p>
                {fixLocationError && (
                  <span className="text-red-400 font-bold block mt-1">{fixLocationError}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (onUpdateOrderLocation) {
                    onUpdateOrderLocation(order.id, { lat: 19.4245, lng: -71.6152 });
                  }
                }}
                className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-amber-400/50 text-amber-200 font-bold text-xs cursor-pointer shadow"
              >
                📍 Centrar en Loma
              </button>
              <button
                type="button"
                onClick={handleFixLocationWithGPS}
                disabled={isFixingLocation}
                className="py-2.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Reintentar GPS</span>
              </button>
            </div>
          </div>
        )}

        {/* Warning if order location was set directly on top of the store */}
        {isOrderAtStore && !isCompleted && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-950/80 border-2 border-amber-500/70 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-100">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">📍</span>
              <div>
                <strong className="text-white font-bold block text-sm">
                  Tu pedido está marcado encima del negocio (Colmado Noadia)
                </strong>
                <p className="text-amber-200 text-xs mt-0.5">
                  La marca del pedido aparece en el local porque se guardaron las coordenadas por defecto. Toca el botón para fijar tu ubicación real por GPS o arrastra el pin en el mapa hacia donde estás.
                </p>
                {fixLocationError && (
                  <span className="text-red-400 font-bold block mt-1">{fixLocationError}</span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleFixLocationWithGPS}
              disabled={isFixingLocation}
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md shrink-0 active:scale-95"
            >
              {isFixingLocation ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Obteniendo GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Fijar mi GPS Real</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Live Map View */}
        <div className="mt-4">
          <MapView
            store={store}
            selectedLocation={order.location}
            targetLabel={order.customerName}
            driverLocation={isInProgress ? currentDriverPos : undefined}
            driverName={order.driverName || 'Delivery Express'}
            isDriverSignalLost={isDriverSignalLost}
            routeWaypoints={routeWaypoints}
            heightClass="h-64 sm:h-80"
            isDraggableTarget={!isCompleted && !!onUpdateOrderLocation}
            flyToSelectedOnChange={true}
            onSelectLocation={(coords) => {
              if (onUpdateOrderLocation) {
                onUpdateOrderLocation(order.id, coords);
              }
            }}
          />
        </div>

        {/* Driver Contact & Direct Phone & WhatsApp Call Buttons */}
        <div className="mt-4 pt-4 border-t border-neutral-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between gap-3">
            <div>
              <span className="text-[10px] text-neutral-400 uppercase font-bold block">
                Repartidor Asignado
              </span>
              <span className="text-sm font-bold text-white">
                {order.driverName || 'Despacho BLACK VAPE (En asignación)'}
              </span>
              <span className="text-xs text-neutral-400 block mt-0.5">
                {order.driverPhone || store.phone || '809-210-4901'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* WhatsApp direct chat */}
              <a
                href={generateWhatsAppLink(
                  order.driverPhone || store.whatsapp || store.phone || '8092104901',
                  `Hola, soy ${order.customerName}. Te escribo sobre mi pedido de recarga #${order.id}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer"
              >
                <span>💬 WhatsApp</span>
              </a>

              {/* Direct Phone Call Button */}
              <a
                href={`tel:${order.driverPhone || store.phone || '8092104901'}`}
                className="flex-1 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Llamada directa al repartidor"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Llamar</span>
              </a>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between gap-3">
            <div>
              <span className="text-[10px] text-neutral-400 uppercase font-bold block">
                Tienda Local
              </span>
              <span className="text-sm font-bold text-white">{store.name}</span>
              <span className="text-xs text-neutral-400 block mt-0.5">{store.phone}</span>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={generateWhatsAppLink(
                  store.whatsapp || store.phone || '8092104901',
                  `Hola BLACK VAPE, tengo una consulta sobre mi pedido #${order.id}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow cursor-pointer"
              >
                <span>💬 WhatsApp</span>
              </a>

              <a
                href={`tel:${store.phone}`}
                className="flex-1 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Llamar</span>
              </a>
            </div>
          </div>
        </div>

        {/* Detailed Order Receipt */}
        <div className="mt-4 p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-cyan-400" />
              <span>Detalle del Recibo (Recargas de Tanque)</span>
            </span>
            <span className="text-xs text-neutral-400">
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="space-y-2 divide-y divide-neutral-900">
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs pt-2 first:pt-0">
                <span className="text-neutral-200">
                  <span className="text-emerald-400 font-bold">{it.quantity}x</span>{' '}
                  {it.productName}{' '}
                  <span className="text-amber-400/90 text-[11px] font-medium">
                    ({it.portion === 'tanque_lleno' ? 'Recarga Tanque Lleno' : 'Recarga Mitad'})
                  </span>
                </span>
                <span className="font-bold text-white">${it.unitPrice * it.quantity} DOP</span>
              </div>
            ))}
          </div>

          {/* Special Notes & Payment info */}
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-1.5 text-xs">
            <div className="flex justify-between text-neutral-400">
              <span>Subtotal Líquidos:</span>
              <span>${order.subtotalLiquid} DOP</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Tarifa de Delivery (Distancia):</span>
              <span className="font-semibold text-cyan-400">
                {isPendingQuote ? 'Pendiente de cotización' : `$${order.deliveryFee} DOP`}
              </span>
            </div>

            {order.paymentMethod && (
              <div className="flex justify-between text-neutral-300 pt-1 border-t border-neutral-900">
                <span>Método de Pago:</span>
                <span className="font-bold uppercase text-white">
                  {order.paymentMethod === 'efectivo'
                    ? '💵 Efectivo'
                    : order.paymentMethod === 'transferencia'
                    ? '📲 Transferencia'
                    : '💳 Tarjeta'}
                </span>
              </div>
            )}

            {order.cashGiven && order.cashGiven > order.totalAmount && (
              <div className="flex justify-between text-emerald-400 font-medium">
                <span>Pagas con ${order.cashGiven} DOP:</span>
                <span>Repartidor lleva cambio de ${order.cashGiven - order.totalAmount} DOP</span>
              </div>
            )}

            {order.specialNotes && (
              <div className="p-2 rounded-lg bg-neutral-900 text-[11px] text-neutral-300 mt-1">
                <strong>Nota al repartidor:</strong> {order.specialNotes}
              </div>
            )}

            <div className="flex justify-between text-sm font-black text-white pt-2 border-t border-neutral-800">
              <span>Total a Pagar:</span>
              <span className="text-emerald-400 text-base">
                ${isPendingQuote ? order.subtotalLiquid : order.totalAmount} DOP
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
