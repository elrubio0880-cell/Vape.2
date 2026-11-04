import React, { useState, useEffect } from 'react';
import { Product, PortionType, StoreConfig, Coordinates, Order, OrderStatus } from '../../types';
import {
  X,
  MessageCircle,
  MapPin,
  Navigation,
  Sparkles,
  Droplet,
  Plus,
  Minus,
  CheckCircle2,
  Wind,
  Phone,
  User,
  ExternalLink,
} from 'lucide-react';
import { calculateDistanceKm, calculateDeliveryFee } from '../../utils/routing';
import { SANTO_DOMINGO_SECTORS, reverseGeocode, findNearestSector, getHighAccuracyGPS } from '../../utils/geocoding';
import { buildSingleProductWhatsAppMessage, generateWhatsAppLink } from '../../utils/whatsapp';
import { playNotificationSound, getStoredClientContact, setStoredClientContact, getStoredUserLocation, saveStoredUserLocation } from '../../utils/storage';

interface QuickWhatsAppOrderModalProps {
  product: Product;
  store: StoreConfig;
  onClose: () => void;
  onCreateOrder: (order: Order) => void;
}

export const QuickWhatsAppOrderModal: React.FC<QuickWhatsAppOrderModalProps> = ({
  product,
  store,
  onClose,
  onCreateOrder,
}) => {
  const [portion, setPortion] = useState<PortionType>('tanque_lleno');
  const [quantity, setQuantity] = useState<number>(1);

  // Client info
  const initialContact = getStoredClientContact();
  const [customerName, setCustomerName] = useState(initialContact.name || '');
  const [customerPhone, setCustomerPhone] = useState(initialContact.phone || '');
  const [deliveryAddressNote, setDeliveryAddressNote] = useState('');

  // Location state (defaults to stored user location or Parque Central Loma de Cabrera)
  const [location, setLocation] = useState<Coordinates>(() => {
    const cached = getStoredUserLocation();
    if (cached && calculateDistanceKm(store.location, cached) <= 35) return cached;
    return { lat: 19.4245, lng: -71.6152 };
  });
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locatingStatus, setLocatingStatus] = useState<string>('');
  const [detectedAddress, setDetectedAddress] = useState<string>('Loma de Cabrera, Dajabón');
  const [errorMessage, setErrorMessage] = useState('');

  const unitPrice = portion === 'tanque_lleno' ? product.priceFullTank : product.priceHalfTank;
  const subtotalLiquid = unitPrice * quantity;
  const distanceKm = calculateDistanceKm(store.location, location);
  const deliveryCalc = calculateDeliveryFee(distanceKm);
  const deliveryFee = deliveryCalc.fee;
  const totalAmount = subtotalLiquid + deliveryFee;
  const isAtStoreLocation = distanceKm < 0.04;

  // Resolve address when coords change
  useEffect(() => {
    let active = true;
    reverseGeocode(location).then((addr) => {
      if (active) setDetectedAddress(addr);
    });
    return () => {
      active = false;
    };
  }, [location]);

  // High-accuracy GPS Request with satellite calibration
  const handleGetGPS = async () => {
    setIsLocating(true);
    setErrorMessage('');
    setLocatingStatus('🛰️ Calibrando satélites GPS...');

    try {
      const res = await getHighAccuracyGPS((acc) => {
        setAccuracyMeters(acc);
        setLocatingStatus(`🛰️ Calibrando satélites... (±${acc}m)`);
      });

      if (res.isSuspiciousIpOrRemote) {
        setIsLocating(false);
        setAccuracyMeters(res.accuracyMeters);
        const safeFallback = { lat: 19.4245, lng: -71.6152 };
        setLocation(safeFallback);
        setLocatingStatus('⚠️ Antena IP fuera de Loma detectada. Selecciona tu sector abajo.');
        setErrorMessage(
          `Tu proveedor de internet reportó una antena en ${res.issueDetection.detectedRegionName || 'otra ciudad'} (~${res.distanceFromStoreKm} km). Hemos centrado el mapa en Loma de Cabrera para que elijas tu sector exacto.`
        );
        return;
      }

      setLocation(res.coords);
      setAccuracyMeters(res.accuracyMeters);
      saveStoredUserLocation(res.coords);
      setIsLocating(false);
      setLocatingStatus(
        res.accuracyMeters <= 35
          ? `🎯 GPS Satelital fijado (±${res.accuracyMeters}m)`
          : `📡 Coordenadas fijadas (±${res.accuracyMeters}m)`
      );
      playNotificationSound('pop');
    } catch (err: any) {
      setIsLocating(false);
      setLocatingStatus('');
      setErrorMessage(err.message || 'No se pudo obtener el GPS. Puedes seleccionar tu sector abajo.');
    }
  };

  // Auto-locate on mount if no cached location or if at store
  useEffect(() => {
    const cached = getStoredUserLocation();
    if (!cached || calculateDistanceKm(store.location, cached) < 0.05) {
      handleGetGPS();
    }
  }, []);

  const handleSelectSector = (secLat: number, secLng: number, secName: string) => {
    setLocation({ lat: secLat, lng: secLng });
    setDetectedAddress(secName);
    playNotificationSound('pop');
  };

  // Build order object
  const createSystemOrder = (): Order => {
    const orderId = `ORD-${Math.floor(100 + Math.random() * 900)}`;
    const newOrder: Order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      customerName: customerName.trim() || 'Cliente WhatsApp',
      customerPhone: customerPhone.trim(),
      deliveryAddressNote: deliveryAddressNote.trim()
        ? `${detectedAddress} (${deliveryAddressNote.trim()})`
        : detectedAddress,
      location,
      items: [
        {
          productId: product.id,
          productName: product.name,
          portion,
          unitPrice,
          costPrice: product.costPrice,
          quantity,
        },
      ],
      subtotalLiquid,
      liquidCostTotal: product.costPrice * quantity,
      deliveryFee,
      calculatedDeliveryFee: deliveryFee,
      proposedDeliveryFee: deliveryFee,
      calculatedDistanceKm: distanceKm,
      totalAmount,
      status: 'pendiente_cotizacion' as OrderStatus,
      paymentMethod: 'efectivo',
      isRemoteLocation: distanceKm > 15,
      locationAccuracyMeters: accuracyMeters ?? undefined,
      statusHistory: [
        {
          status: 'pendiente_cotizacion' as OrderStatus,
          timestamp: new Date().toISOString(),
          note: `Pedido solicitado vía WhatsApp directo para ${product.name}`,
        },
      ],
    };
    return newOrder;
  };

  const handleSendWhatsApp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || customerName.trim().length < 2) {
      setErrorMessage('Por favor ingresa tu nombre (mínimo 2 letras).');
      return;
    }

    const rawDigits = customerPhone.replace(/\D/g, '');
    const cleanDigits = rawDigits.length === 11 && rawDigits.startsWith('1') ? rawDigits.slice(1) : rawDigits;
    if (
      cleanDigits.length !== 10 ||
      (!cleanDigits.startsWith('809') && !cleanDigits.startsWith('829') && !cleanDigits.startsWith('849'))
    ) {
      setErrorMessage('Ingresa un teléfono dominicano válido de 10 dígitos (809, 829 o 849).');
      return;
    }

    setStoredClientContact({ name: customerName.trim(), phone: customerPhone.trim() });

    playNotificationSound('vape-hit');

    // 1. Create order in the local system so delivery drivers receive it!
    const newOrder = createSystemOrder();
    onCreateOrder(newOrder);

    // 2. Generate WhatsApp message with product photo, Google Maps link, and full details
    const msg = buildSingleProductWhatsAppMessage({
      productName: product.name,
      flavorCategory: product.flavorCategory,
      nicotineMg: product.nicotineMg,
      imageUrl: product.imageUrl,
      portion,
      quantity,
      unitPrice,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: deliveryAddressNote.trim()
        ? `${detectedAddress} • Nota: ${deliveryAddressNote.trim()}`
        : detectedAddress,
      customerCoords: location,
      storeName: store.name,
      storeAddress: store.addressText,
      deliveryFee,
    });

    const targetPhone = store.whatsapp || store.phone || '8092104901';
    const waUrl = generateWhatsAppLink(targetPhone, msg);

    // Open WhatsApp
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const lomaSectors = SANTO_DOMINGO_SECTORS.slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto font-urban">
      <div className="relative w-full max-w-lg bg-[#0e0a1a] border-2 border-emerald-500/50 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-emerald-950/60 text-white my-auto max-h-[92vh] overflow-y-auto">
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-purple-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </span>
            <div>
              <span className="text-[10px] font-tag uppercase tracking-wider text-emerald-400 block">
                PEDIDO RÁPIDO POR WHATSAPP
              </span>
              <h3 className="text-base sm:text-lg font-black text-white">
                Recarga Express en 1 Clic
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product preview card with photo */}
        <div className="mt-4 p-3.5 rounded-2xl bg-black/70 border border-purple-900/50 flex items-center gap-3.5">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-black shrink-0 border border-purple-800/60 p-1 flex items-center justify-center">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="px-2 py-0.5 rounded text-[9px] font-tag bg-purple-900/60 text-purple-300 border border-purple-700/50">
                {product.flavorCategory}
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                {product.nicotineMg}mg
              </span>
            </div>
            <h4 className="font-black text-sm text-white truncate">{product.name}</h4>
            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
              Salida: {store.name} ({store.addressText})
            </p>
          </div>
        </div>

        <form onSubmit={handleSendWhatsApp} className="mt-4 space-y-4">
          {/* Portion Selection */}
          <div>
            <label className="block text-xs font-bold text-neutral-300 mb-1.5">
              Selecciona Tamaño de Recarga para tu Tanque:
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPortion('tanque_lleno')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  portion === 'tanque_lleno'
                    ? 'bg-emerald-950/60 border-emerald-400 text-white shadow-lg shadow-emerald-950'
                    : 'bg-black/50 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Tanque Lleno</span>
                  <Droplet className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                </div>
                <div className="text-sm font-black text-emerald-400 mt-1">
                  ${product.priceFullTank || 100} DOP <span className="text-[10px] font-normal text-neutral-400">(100%)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPortion('mitad')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  portion === 'mitad'
                    ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-lg shadow-cyan-950'
                    : 'bg-black/50 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Mitad Tanque</span>
                  <Droplet className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-sm font-black text-cyan-400 mt-1">
                  ${product.priceHalfTank || 50} DOP <span className="text-[10px] font-normal text-neutral-400">(50%)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Quantity stepper */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-black/60 border border-neutral-800">
            <div>
              <span className="text-xs font-bold text-white block">Cantidad de Tanques:</span>
              <span className="text-[11px] text-neutral-400">
                ${unitPrice} DOP c/u = ${subtotalLiquid} DOP
              </span>
            </div>
            <div className="flex items-center gap-2 bg-[#120c22] border border-purple-800/60 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors font-black text-sm"
              >
                -
              </button>
              <span className="text-sm font-black text-white px-2 min-w-[24px] text-center">
                {quantity}
              </span>
              <button
                type="button"
                disabled={quantity >= product.stockUnits}
                onClick={() => setQuantity((q) => Math.min(product.stockUnits, q + 1))}
                className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg hover:bg-neutral-800 transition-colors font-black text-sm cursor-pointer"
                title={quantity >= product.stockUnits ? `Máximo disponible: ${product.stockUnits}` : 'Aumentar cantidad'}
              >
                +
              </button>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Tu Nombre *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Ej: Carlos Rodríguez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-black/70 border border-neutral-800 rounded-xl py-2 px-3 pl-8 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <User className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1">
                Teléfono / WhatsApp *
              </label>
              <div className="relative">
                <input
                  type="tel"
                  required
                  placeholder="Ej: 809-210-4901"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-black/70 border border-neutral-800 rounded-xl py-2 px-3 pl-8 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <Phone className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

            {/* Location picker */}
          <div className="p-3.5 rounded-2xl bg-black/70 border border-neutral-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>¿Dónde te llevamos la recarga?</span>
              </span>
              <button
                type="button"
                onClick={handleGetGPS}
                disabled={isLocating}
                className="px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-600/50 text-[11px] font-bold text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Navigation className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'Obteniendo GPS...' : 'Usar mi GPS'}</span>
              </button>
            </div>

            {isAtStoreLocation && (
              <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-500/70 text-amber-200 text-[11px] flex items-center justify-between gap-2">
                <span>⚠️ Marcador sobre el negocio. Pulsa 'Usar mi GPS' o elige tu sector abajo para calcular el delivery real.</span>
                <button
                  type="button"
                  onClick={handleGetGPS}
                  className="px-2.5 py-1 rounded bg-amber-500 text-black font-black text-[10px] shrink-0"
                >
                  Fijar GPS
                </button>
              </div>
            )}

            {locatingStatus && (
              <p className="text-[11px] font-medium text-cyan-300 bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-800/50">
                {locatingStatus}
              </p>
            )}

            {/* Quick sectors chips in Loma de Cabrera */}
            <div>
              <span className="text-[10px] text-neutral-400 block mb-1">
                Sectores comunes en Loma de Cabrera:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-none">
                {lomaSectors.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSelectSector(sec.lat, sec.lng, sec.name)}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer border ${
                      detectedAddress.includes(sec.name)
                        ? 'bg-cyan-600 text-white border-cyan-400'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction note */}
            <div>
              <input
                type="text"
                placeholder="Punto de referencia o casa (Ej: Casa azul frente al parque)"
                value={deliveryAddressNote}
                onChange={(e) => setDeliveryAddressNote(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Location & Delivery Fee Breakdown */}
            <div className="p-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 text-[11px] text-neutral-300 space-y-1">
              <div className="flex justify-between">
                <span>Distancia desde Colmado Noadia:</span>
                <span className="font-bold text-cyan-400">{distanceKm} km</span>
              </div>
              <div className="flex justify-between">
                <span>Tarifa Delivery ({deliveryCalc.zone.shortLabel}):</span>
                <span className="font-bold text-emerald-400">${deliveryFee} DOP</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-neutral-800 text-xs font-black text-white">
                <span>TOTAL A PAGAR:</span>
                <span className="text-emerald-400 font-urban text-sm">${totalAmount} DOP</span>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3.5 px-5 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs sm:text-sm rounded-xl shadow-xl shadow-emerald-950/80 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Enviar Pedido a WhatsApp de BLACK VAPE</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
