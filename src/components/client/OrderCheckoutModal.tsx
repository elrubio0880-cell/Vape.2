import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { Coordinates, OrderItem, StoreConfig, Order, PaymentMethod, UserAccount } from '../../types';
import { MapView } from '../MapView';
import { calculateDistanceKm, calculateDeliveryFee, DELIVERY_ZONES } from '../../utils/routing';
import {
  getStoredClientContact,
  saveClientContact,
  playNotificationSound,
  getStoredUserLocation,
  saveStoredUserLocation,
  clearStoredUserLocation,
} from '../../utils/storage';
import {
  reverseGeocode,
  getHighAccuracyGPS,
  SANTO_DOMINGO_SECTORS,
  LOMA_CABRERA_SECTORS,
  detectLocationIssue,
  searchAddressOrPlace,
  findNearestSector,
  SectorItem,
} from '../../utils/geocoding';
import { buildFullCartWhatsAppMessage, generateWhatsAppLink } from '../../utils/whatsapp';
import {
  MapPin,
  Phone,
  User,
  X,
  AlertCircle,
  Sparkles,
  Banknote,
  CreditCard,
  Building2,
  Copy,
  CheckCircle,
  MessageSquare,
  Navigation,
  Compass,
  Search,
  Check,
  Layers,
  ArrowRight,
  Flame,
  MessageCircle,
} from 'lucide-react';

interface OrderCheckoutModalProps {
  items: OrderItem[];
  store: StoreConfig;
  onClose: () => void;
  onSubmitOrder: (order: Order) => void;
  currentUser?: UserAccount | null;
  onOpenAuth?: () => void;
}

export const OrderCheckoutModal: React.FC<OrderCheckoutModalProps> = ({
  items,
  store,
  onClose,
  onSubmitOrder,
  currentUser,
  onOpenAuth,
}) => {
  const savedContact = getStoredClientContact();
  const [customerName, setCustomerName] = useState(currentUser?.name || savedContact.name || '');
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone || savedContact.phone || '');

  // Optional reference for delivery driver (exact location is already set via GPS/Map)
  const [addressReference, setAddressReference] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashOption, setCashOption] = useState<'exacto' | '200' | '500' | '1000' | 'otro'>('exacto');
  const [customCash, setCustomCash] = useState<string>('');
  const [copiedBank, setCopiedBank] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Location State (Default to Parque Central Loma de Cabrera if no cached location, so it never defaults on top of store)
  const [location, setLocation] = useState<Coordinates>(() => {
    const cached = getStoredUserLocation();
    if (cached && calculateDistanceKm(store.location, cached) < 35) return cached;
    return { lat: 19.4245, lng: -71.6152 };
  });
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  // Location Selection Mode Tab: 'gps' | 'buscar' (Map is free & direct)
  const [locationTab, setLocationTab] = useState<'gps' | 'buscar'>('gps');
  const [sectorSearch, setSectorSearch] = useState('');
  const [detectedAddress, setDetectedAddress] = useState<string>(
    'Parque Central Loma de Cabrera, Dajabón'
  );
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  // Auto-reverse geocode whenever coordinates change
  useEffect(() => {
    let active = true;
    setIsResolvingAddress(true);
    reverseGeocode(location)
      .then((addr) => {
        if (active) {
          setDetectedAddress(addr);
          setIsResolvingAddress(false);
        }
      })
      .catch(() => {
        if (active) setIsResolvingAddress(false);
      });

    return () => {
      active = false;
    };
  }, [location.lat, location.lng]);

  // High-accuracy GPS trigger with live satellite calibration feedback
  const handleRequestGPS = async () => {
    setIsLocating(true);
    setGpsStatus({
      type: 'idle',
      message: '🛰️ Conectando con satélites GPS... Calibrando señal...',
    });

    try {
      const result = await getHighAccuracyGPS((acc) => {
        setAccuracyMeters(acc);
        setGpsStatus({
          type: 'idle',
          message: `🛰️ Calibrando satélites GPS... (Precisión actual: ±${acc} metros)`,
        });
      });

      setIsLocating(false);

      if (result.isSuspiciousIpOrRemote) {
        setGpsStatus({
          type: 'error',
          message: `⚠️ Tu conexión reportó IP en ${result.issueDetection.detectedRegionName} (${result.distanceFromStoreKm} km). Centramos el mapa libre en Loma de Cabrera para que toques en tu casa.`,
        });
        // Avoid setting coordinates 150km away; center safely in Loma de Cabrera
        setLocation({ lat: 19.4245, lng: -71.6152 });
      } else {
        setLocation(result.coords);
        setAccuracyMeters(result.accuracyMeters);
        saveStoredUserLocation(result.coords);

        if (result.accuracyMeters <= 35) {
          setGpsStatus({
            type: 'success',
            message: `🎯 Ubicación satelital fijada con precisión de ±${result.accuracyMeters}m.`,
          });
        } else {
          setGpsStatus({
            type: 'success',
            message: `📡 Coordenadas fijadas (±${result.accuracyMeters}m). Puedes arrastrar el pin si deseas afinar la puerta de tu casa.`,
          });
        }
        playNotificationSound('pop');
      }
    } catch (err: any) {
      setIsLocating(false);
      setGpsStatus({
        type: 'error',
        message: err.message || 'No se pudo obtener la ubicación GPS.',
      });
    }
  };

  // Obligatory satellite calibration on opening checkout
  useEffect(() => {
    handleRequestGPS();
  }, []);

  // Distance & Strict 1.5 km = $25 DOP Delivery Calculation
  const distanceKm = calculateDistanceKm(store.location, location);
  const deliveryCalc = calculateDeliveryFee(distanceKm);
  const deliveryFee = deliveryCalc.fee;
  const isAtStoreLocation = distanceKm < 0.04;

  // Real-time location issue detection (remote IP or at store)
  const locationIssue = useMemo(() => {
    return detectLocationIssue(location, accuracyMeters);
  }, [location, accuracyMeters]);

  const subtotalLiquid = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const liquidCostTotal = items.reduce((sum, it) => sum + it.costPrice * it.quantity, 0);
  const immediateTotal = subtotalLiquid + deliveryFee;

  // Cash change calculation
  let cashGiven: number | undefined = undefined;
  let changeDue: number | undefined = undefined;

  if (paymentMethod === 'efectivo') {
    if (cashOption === 'exacto') {
      cashGiven = immediateTotal;
      changeDue = 0;
    } else if (cashOption === '200') {
      cashGiven = 200;
      changeDue = Math.max(0, 200 - immediateTotal);
    } else if (cashOption === '500') {
      cashGiven = 500;
      changeDue = Math.max(0, 500 - immediateTotal);
    } else if (cashOption === '1000') {
      cashGiven = 1000;
      changeDue = Math.max(0, 1000 - immediateTotal);
    } else if (cashOption === 'otro') {
      const parsed = parseFloat(customCash);
      if (!isNaN(parsed) && parsed > 0) {
        cashGiven = parsed;
        changeDue = Math.max(0, parsed - immediateTotal);
      }
    }
  }

  const [liveSearchResults, setLiveSearchResults] = useState<
    Array<{ id: string; name: string; lat: number; lng: number; badge?: string; distanceKm: number }>
  >([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  useEffect(() => {
    const q = sectorSearch.trim();
    if (!q || q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    let isCancelled = false;
    setIsSearchingPlaces(true);
    const timer = setTimeout(() => {
      searchAddressOrPlace(q, store.location)
        .then((res) => {
          if (!isCancelled) {
            setLiveSearchResults(res);
            setIsSearchingPlaces(false);
          }
        })
        .catch(() => {
          if (!isCancelled) setIsSearchingPlaces(false);
        });
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [sectorSearch, store.location]);

  const handleSelectSector = (sector: { id: string; name: string; lat: number; lng: number; badge?: string }) => {
    setLocation({ lat: sector.lat, lng: sector.lng });
    setAccuracyMeters(null);
    setGpsStatus({
      type: 'success',
      message: `Sector fijado en ${sector.name}. Puedes mover el pin sobre el mapa para ajustar a tu puerta exacta.`,
    });
    playNotificationSound('pop');
  };

  const handleCopyBank = () => {
    const text =
      store.bankAccountInfo ||
      'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901';
    navigator.clipboard.writeText(text);
    setCopiedBank(true);
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDominicanPhoneValid = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, '');
    const clean = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return (
      clean.length === 10 &&
      (clean.startsWith('809') || clean.startsWith('829') || clean.startsWith('849'))
    );
  };

  useEffect(() => {
    if (
      (cashOption === '200' || cashOption === '500' || cashOption === '1000') &&
      Number(cashOption) < immediateTotal
    ) {
      setCashOption('exacto');
    }
  }, [immediateTotal, cashOption]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!customerName.trim() || customerName.trim().length < 2) {
      setErrorMessage('Por favor ingresa tu nombre (mínimo 2 letras) para que el delivery pueda identificarte.');
      return;
    }
    if (!isDominicanPhoneValid(customerPhone)) {
      setErrorMessage(
        'Ingresa un teléfono dominicano válido de 10 dígitos (809, 829 o 849) para que el delivery te llame al llegar.'
      );
      return;
    }
    if (paymentMethod === 'efectivo' && cashOption === 'otro') {
      const parsedCash = Number(customCash);
      if (!parsedCash || isNaN(parsedCash) || parsedCash < immediateTotal) {
        setErrorMessage(
          `El monto en efectivo con el que vas a pagar ($${parsedCash || 0} DOP) debe ser igual o mayor al total del pedido ($${immediateTotal} DOP).`
        );
        return;
      }
    }
    setIsSubmitting(true);
    setErrorMessage('');
    saveClientContact({ name: customerName.trim(), phone: customerPhone.trim() });

    // Build concise address note combining optional reference + GPS zone
    const fullAddressParts = addressReference.trim()
      ? `${addressReference.trim()} • [Zona: ${detectedAddress}]`
      : detectedAddress;

    const newOrder: Order = {
      id: `ORD-${Date.now().toString(36).slice(-3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      customerId: currentUser?.role === 'comprador' ? currentUser.id : undefined,
      orderType: 'regular',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddressNote: fullAddressParts,
      specialNotes: specialNotes.trim() || undefined,
      paymentMethod,
      cashGiven,
      changeDue,
      location,
      items,
      subtotalLiquid,
      liquidCostTotal,
      deliveryFee,
      calculatedDeliveryFee: deliveryFee,
      calculatedDistanceKm: distanceKm,
      totalAmount: immediateTotal,
      status: 'pendiente_cotizacion',
      isRemoteLocation: Boolean(distanceKm > 15 || locationIssue?.isSuspicious),
      detectedRegion: locationIssue?.detectedRegionName,
      locationAccuracyMeters: accuracyMeters || undefined,
      statusHistory: [
        {
          status: 'pendiente_cotizacion',
          timestamp: new Date().toISOString(),
          note: `Pedido enviado (${paymentMethod.toUpperCase()}) para recarga de líquidos. Tarifa calculada: $${deliveryFee} DOP (${distanceKm} km, ${deliveryCalc.rateRule}).`,
        },
      ],
    };

    playNotificationSound('alert');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vape-order-submitted'));
    }
    onSubmitOrder(newOrder);
  };

  const handleWhatsAppOrder = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!customerName.trim() || customerName.trim().length < 2) {
      setErrorMessage('Por favor ingresa tu nombre (mínimo 2 letras).');
      return;
    }
    if (!isDominicanPhoneValid(customerPhone)) {
      setErrorMessage('Ingresa un teléfono dominicano válido de 10 dígitos (809, 829 o 849) para coordinar la entrega.');
      return;
    }
    if (paymentMethod === 'efectivo' && cashOption === 'otro') {
      const parsedCash = Number(customCash);
      if (!parsedCash || isNaN(parsedCash) || parsedCash < immediateTotal) {
        setErrorMessage(
          `El monto en efectivo con el que vas a pagar ($${parsedCash || 0} DOP) debe ser igual o mayor al total del pedido ($${immediateTotal} DOP).`
        );
        return;
      }
    }

    setIsSubmitting(true);
    saveClientContact({
      name: customerName.trim(),
      phone: customerPhone.trim(),
    });

    const resolvedCashGiven = paymentMethod === 'efectivo' ? cashGiven : undefined;
    const resolvedChangeDue = paymentMethod === 'efectivo' ? changeDue : undefined;

    const orderId = `ORD-${Date.now().toString(36).slice(-3).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;

    const fullAddressParts = addressReference.trim()
      ? `${addressReference.trim()} • [Zona: ${detectedAddress}]`
      : detectedAddress;

    const newOrder: Order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      customerId: currentUser?.role === 'comprador' ? currentUser.id : undefined,
      orderType: 'regular',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddressNote: fullAddressParts || detectedAddress,
      location,
      items,
      paymentMethod,
      cashGiven: resolvedCashGiven,
      changeDue: resolvedChangeDue,
      specialNotes: specialNotes.trim() || undefined,
      subtotalLiquid,
      liquidCostTotal,
      deliveryFee,
      calculatedDeliveryFee: deliveryFee,
      calculatedDistanceKm: distanceKm,
      totalAmount: immediateTotal,
      status: 'pendiente_cotizacion',
      isRemoteLocation: Boolean(distanceKm > 15 || locationIssue?.isSuspicious),
      detectedRegion: locationIssue?.detectedRegionName,
      locationAccuracyMeters: accuracyMeters || undefined,
      statusHistory: [
        {
          status: 'pendiente_cotizacion',
          timestamp: new Date().toISOString(),
          note: `Pedido enviado vía WhatsApp (${paymentMethod.toUpperCase()}) para recarga de líquidos. Tarifa: $${deliveryFee} DOP.`,
        },
      ],
    };

    playNotificationSound('vape-hit');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vape-order-submitted'));
    }
    onSubmitOrder(newOrder);

    const waMsg = buildFullCartWhatsAppMessage({
      orderId: newOrder.id,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deliveryAddress: fullAddressParts || detectedAddress,
      location,
      items: items.map((it) => ({
        productName: it.productName,
        portion: it.portion,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        productType: it.productType,
        variantColor: it.variantColor,
      })),
      subtotalLiquid,
      deliveryFee,
      totalAmount: immediateTotal,
      paymentMethod,
      cashGiven: resolvedCashGiven,
      changeDue: resolvedChangeDue,
      specialNotes: specialNotes.trim() || undefined,
      storeName: store.name,
      storeAddress: store.addressText,
    });

    const targetPhone = store.whatsapp || store.phone || '8092104901';
    const waUrl = generateWhatsAppLink(targetPhone, waMsg);
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/90 backdrop-blur-xl overflow-y-auto font-urban">
      <div className="relative w-full max-w-3xl bg-[#0d0918]/95 border-2 border-purple-500/50 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-purple-950 text-neutral-100 my-auto">
        {/* Header with BLACK VAPE Brand */}
        <div className="flex items-center justify-between pb-4 border-b border-purple-900/40">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-purple-600 via-cyan-400 to-purple-500 shadow-lg shadow-purple-600/40 shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                <img
                  src="/logo-black-vape.jpeg"
                  alt="BLACK VAPE"
                  className="w-full h-full object-cover scale-105"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg sm:text-xl font-black text-white font-urban tracking-wider text-glow-purple">
                  BLACK VAPE
                </span>
                <span className="text-[10px] uppercase font-tag tracking-wider px-2.5 py-0.5 rounded-md bg-purple-900/50 border border-purple-500/50 text-purple-300">
                  ENTREGA CALLEJERA
                </span>
              </div>
              <p className="text-xs text-neutral-300 font-medium">
                Paso 2 • Confirma tu Ubicación Exacta & Detalles de Recarga
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-neutral-400 hover:text-white transition-all cursor-pointer border border-purple-800/40"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3.5 bg-red-950/70 border border-red-800/80 rounded-2xl text-red-200 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-6">
          {/* SECTION 1: UBICACIÓN ULTRA-PRECISA */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">
                    📍
                  </span>
                  <span>¿Dónde te llevamos la recarga?</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Elige tu método preferido para fijar tu dirección con total precisión:
                </p>
              </div>

              {/* Location Tabs Switcher: Direct GPS & Street Search only */}
              <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setLocationTab('gps')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    locationTab === 'gps'
                      ? 'bg-emerald-500 text-neutral-950 shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>GPS Satelital Directo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocationTab('buscar')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                    locationTab === 'buscar'
                      ? 'bg-emerald-500 text-neutral-950 shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Buscar Dirección</span>
                </button>
              </div>
            </div>

            {/* TAB 1: GPS SATELLITE CALIBRATION */}
            {locationTab === 'gps' && (
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestGPS}
                    disabled={isLocating}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-neutral-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLocating ? (
                      <>
                        <span className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                        <span>Calibrando señal satelital GPS...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-4 h-4 fill-neutral-950" />
                        <span>🎯 Calibrar Mi Ubicación GPS Satelital</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLocation({ lat: 19.4245, lng: -71.6152 });
                      setGpsStatus({
                        type: 'idle',
                        message: '📍 Mapa centrado en Loma de Cabrera (Parque Central). Toca tu casa en el mapa.',
                      });
                    }}
                    className="py-3 px-3.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span>Centrar en Loma</span>
                  </button>
                </div>

                {gpsStatus.message && (
                  <div
                    className={`p-2.5 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                      gpsStatus.type === 'error'
                        ? 'bg-red-950/60 border border-red-800/80 text-red-200'
                        : gpsStatus.type === 'success'
                        ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-200'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-300'
                    }`}
                  >
                    {gpsStatus.type === 'error' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span>{gpsStatus.message}</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BUSCAR LUGAR O CALLE EN LOMA DE CABRERA */}
            {locationTab === 'buscar' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sectorSearch}
                    onChange={(e) => setSectorSearch(e.target.value)}
                    placeholder="Escribe tu calle o sector en Loma de Cabrera (ej: Calle Duarte, El Corozo, Ceiba)..."
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                  {isSearchingPlaces && (
                    <div className="w-3.5 h-3.5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
                </div>

                {liveSearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {liveSearchResults.map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => handleSelectSector(res)}
                        className="p-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/50 rounded-xl text-left text-xs font-semibold text-neutral-200 transition-all cursor-pointer flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="truncate block font-bold text-white text-[11px]">{res.name}</span>
                          <span className="text-[9px] text-neutral-400 block">{res.distanceKm} km del local</span>
                        </div>
                        {res.badge && (
                          <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">
                            {res.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : sectorSearch.trim().length >= 2 ? (
                  <p className="text-[11px] text-neutral-400 italic py-1">
                    No se encontraron coincidencias exactas para "{sectorSearch}". Toca el mapa para fijar tu ubicación directamente.
                  </p>
                ) : null}
              </div>
            )}

            {/* Warning if location is detected out-of-zone (Remote ISP antenna) */}
            {locationIssue.isSuspicious && locationIssue.reason === 'out_of_zone' && (
              <div className="p-3.5 rounded-2xl bg-amber-950/90 border-2 border-amber-500 text-amber-100 text-xs shadow-xl animate-in fade-in space-y-2">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <strong className="text-white block font-bold text-xs">
                      Ubicación de red fuera de zona ({locationIssue.detectedRegionName})
                    </strong>
                    <p className="text-amber-200 text-[11px] mt-0.5 leading-snug">
                      Tu proveedor de internet reportó una antena a {locationIssue.distanceKm} km. El mapa está libre: puedes tocar directamente sobre tu casa en Loma de Cabrera o pulsar Centrar en Loma.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-amber-800/60">
                  <button
                    type="button"
                    onClick={() => {
                      setLocation({ lat: 19.4245, lng: -71.6152 });
                      setGpsStatus({
                        type: 'idle',
                        message: '📍 Mapa centrado en Loma de Cabrera Centro. Toca en tu casa.',
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow cursor-pointer active:scale-95"
                  >
                    📍 Centrar en Loma de Cabrera
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestGPS}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-amber-200 border border-amber-500/50 text-xs font-bold cursor-pointer"
                  >
                    🛰️ Reintentar GPS Satelital
                  </button>
                </div>
              </div>
            )}

            {/* Warning if pin is currently on top of the store */}
            {isAtStoreLocation && (
              <div className="p-3.5 rounded-2xl bg-amber-950/80 border-2 border-amber-500/80 text-amber-100 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <strong className="text-white block font-bold">
                      Marcador encima del negocio (Colmado Noadia)
                    </strong>
                    <span className="text-amber-300 text-[11px] block">
                      El pin de entrega está en el local físico (0.0 km). Toca el botón para fijar tu ubicación por GPS o arrastra el pin en el mapa hacia tu casa.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const parque = LOMA_CABRERA_SECTORS[1];
                      handleSelectSector(parque);
                    }}
                    className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-amber-400/50 text-amber-200 font-bold text-xs cursor-pointer shadow"
                  >
                    📍 Mover a Parque Central
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestGPS}
                    disabled={isLocating}
                    className="py-2 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow shrink-0 active:scale-95"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Detectar mi GPS</span>
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Map with High-Zoom & Draggable Pin */}
            <div className="space-y-1.5 pt-1">
              <MapView
                store={store}
                selectedLocation={location}
                onSelectLocation={(coords) => {
                  setLocation(coords);
                  setAccuracyMeters(null);
                  setGpsStatus({
                    type: 'success',
                    message: '📍 Pin fijado manualmente en el mapa (coordenadas exactas).',
                  });
                }}
                isDraggableTarget={true}
                targetLabel="Entrega BLACK VAPE"
                heightClass="h-64 sm:h-72"
                flyToSelectedOnChange={true}
                accuracyRadiusMeters={accuracyMeters || undefined}
              />
              <p className="text-[11px] text-neutral-400 flex items-center gap-1.5 px-1">
                <span>💡</span>
                <span>
                  <strong>Tip de precisión:</strong> Puedes arrastrar el pin rojo sobre el mapa o tocar la entrada exacta de tu edificio.
                </span>
              </p>
            </div>

            {/* Immediate Delivery Calculation & Distance/Zone Breakdown Card */}
            <div className="p-3.5 bg-neutral-900/95 rounded-2xl border border-cyan-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
              <div className="flex items-start gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border"
                  style={{
                    backgroundColor: `${deliveryCalc.zone.color}20`,
                    borderColor: `${deliveryCalc.zone.color}60`,
                    color: deliveryCalc.zone.color,
                  }}
                >
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded border"
                      style={{
                        backgroundColor: `${deliveryCalc.zone.color}20`,
                        borderColor: `${deliveryCalc.zone.color}60`,
                        color: deliveryCalc.zone.color,
                      }}
                    >
                      {deliveryCalc.zone.shortLabel}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      (Cada 1.5 km = $25 DOP)
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white truncate max-w-sm sm:max-w-md mt-0.5">
                    {isResolvingAddress ? 'Identificando dirección...' : detectedAddress}
                  </p>
                </div>
              </div>

              {/* Immediate metric pills */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-start shrink-0 bg-neutral-950 px-3.5 py-2 rounded-xl border border-neutral-800 text-xs">
                <div>
                  <span className="text-[9px] text-neutral-400 block font-medium">Distancia</span>
                  <span className="font-black text-cyan-400">{distanceKm} km</span>
                </div>
                <div className="w-px h-6 bg-neutral-800" />
                <div>
                  <span className="text-[9px] text-neutral-400 block font-medium">Envío</span>
                  <span className="font-black" style={{ color: deliveryCalc.zone.color }}>
                    ${deliveryFee} DOP
                  </span>
                </div>
                <div className="w-px h-6 bg-neutral-800" />
                <div>
                  <span className="text-[9px] text-neutral-400 block font-medium">Total Inmediato</span>
                  <span className="font-black text-emerald-400 text-sm">
                    ${immediateTotal} DOP
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: DATOS DEL COMPRADOR Y DIRECCIÓN DETALLADA */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-4">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-neutral-800 pb-2.5">
              <span className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs">
                👤
              </span>
              <span>Datos del Comprador & Entrega</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Tu Nombre Completo *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carlos Gómez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Teléfono de Contacto (Para que el delivery te llame) *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="Ej: 809-210-4901"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2.5 pl-9 pr-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Single simplified optional reference field + quick 1-tap chips */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-neutral-300">
                  Referencia rápida para el repartidor{' '}
                  <span className="text-neutral-500 font-normal">(Opcional)</span>
                </label>
                <span className="text-[10px] text-emerald-400 font-semibold">
                  📍 Tu ubicación ya está marcada arriba
                </span>
              </div>
              <input
                type="text"
                placeholder="Ej: Casa crema frente al colmado, portón negro, o te espero afuera..."
                value={addressReference}
                onChange={(e) => setAddressReference(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl py-2.5 px-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  'Salgo afuera al llegar',
                  'Llámame cuando estés afuera',
                  'En la galería / frente a la calle',
                  'Al lado del colmado',
                ].map((chip) => {
                  const isSelected = addressReference.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setAddressReference((prev) =>
                            prev
                              .replace(chip, '')
                              .replace(/^\s*,\s*|\s*,\s*$/g, '')
                              .replace(/\s*,\s*,/g, ', ')
                              .trim()
                          );
                        } else {
                          setAddressReference((prev) =>
                            prev.trim() ? `${prev.trim()}, ${chip}` : chip
                          );
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-neutral-900/90 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
                      }`}
                    >
                      {isSelected ? `✓ ${chip}` : `+ ${chip}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 3: METODO DE PAGO */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3.5">
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-neutral-800 pb-2.5">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs">
                💵
              </span>
              <span>Método de Pago para tu Recarga</span>
            </h3>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('efectivo')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'efectivo'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Banknote className="w-5 h-5" />
                <span className="text-xs font-bold">Efectivo</span>
                <span className="text-[9px] text-neutral-500">Contra entrega</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('transferencia')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'transferencia'
                    ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <Building2 className="w-5 h-5" />
                <span className="text-xs font-bold">Transferencia</span>
                <span className="text-[9px] text-neutral-500">Bancos / Qik</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('tarjeta')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'tarjeta'
                    ? 'bg-violet-500/10 border-violet-500 text-violet-400 shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                <span className="text-xs font-bold">Tarjeta / Link</span>
                <span className="text-[9px] text-neutral-500">Verifone / Enlace</span>
              </button>
            </div>

            {paymentMethod === 'efectivo' && (
              <div className="p-3 bg-neutral-900 rounded-xl border border-neutral-800 space-y-2 text-xs">
                <span className="font-semibold text-neutral-300 block text-[11px]">
                  💵 ¿Con cuánto vas a pagar? (Para que el repartidor lleve cambio):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'exacto', label: 'Monto Exacto', minAmount: 0 },
                    { id: '200', label: '$200 DOP', minAmount: 200 },
                    { id: '500', label: '$500 DOP', minAmount: 500 },
                    { id: '1000', label: '$1,000 DOP', minAmount: 1000 },
                    { id: 'otro', label: 'Otro monto', minAmount: 0 },
                  ]
                    .filter((opt) => opt.minAmount === 0 || opt.minAmount >= immediateTotal)
                    .map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCashOption(opt.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          cashOption === opt.id
                            ? 'bg-emerald-500 text-neutral-950 shadow'
                            : 'bg-neutral-950 text-neutral-300 border border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                </div>

                {cashOption === 'otro' && (
                  <div className="pt-1">
                    <input
                      type="number"
                      min={immediateTotal}
                      placeholder={`Indica con cuánto vas a pagar (mínimo $${immediateTotal} DOP)`}
                      value={customCash}
                      onChange={(e) => setCustomCash(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}

                {changeDue !== undefined && changeDue > 0 && (
                  <div className="text-[11px] text-emerald-400 font-bold flex items-center justify-between pt-1 border-t border-neutral-800">
                    <span>Cambio que te devolverá el repartidor:</span>
                    <span>~${changeDue} DOP</span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'transferencia' && (
              <div className="p-3.5 bg-neutral-900 rounded-xl border border-cyan-500/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-300 text-xs">
                    Datos Bancarios para Transferir a BLACK VAPE:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyBank}
                    className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-white bg-neutral-950 px-2 py-1 rounded-md border border-neutral-800 cursor-pointer"
                  >
                    {copiedBank ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBank ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-neutral-300 font-mono bg-neutral-950 p-2 rounded-lg border border-neutral-800/80">
                  {store.bankAccountInfo || 'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901'}
                </p>
                <p className="text-[10px] text-neutral-400">
                  Puedes transferir ahora o al momento que llegue el repartidor y mostrarle el comprobante.
                </p>
              </div>
            )}
          </div>

          {/* SECTION 4: RESUMEN DEL PEDIDO */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3">
            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Resumen de Recarga ({items.length} productos)
            </h4>

            <div className="space-y-1.5 divide-y divide-neutral-900">
              {items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs pt-1.5 first:pt-0">
                  <span className="text-neutral-200">
                    <strong className="text-emerald-400">{it.quantity}x</strong> {it.productName}{' '}
                    <span className="text-neutral-500 font-semibold">
                      {it.productType === 'vape'
                        ? `(💨 Equipo Vape${it.variantColor ? ` • Color: ${it.variantColor}` : ''} • $${it.unitPrice})`
                        : `(${it.portion === 'tanque_lleno' ? `Tanque Lleno • $${it.unitPrice}` : `Mitad de Tanque • $${it.unitPrice}`})`}
                    </span>
                  </span>
                  <span className="font-bold text-white">${it.unitPrice * it.quantity} DOP</span>
                </div>
              ))}
            </div>

            {/* Delivery fee line item */}
            <div className="pt-2 border-t border-neutral-800 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-neutral-400">
                <span>Subtotal Recargas:</span>
                <span className="font-bold text-white text-sm">${subtotalLiquid} DOP</span>
              </div>
              <div className="flex justify-between items-center text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: deliveryCalc.zone.color }}
                  />
                  <span>Delivery ({distanceKm} km • {deliveryCalc.zone.shortLabel}):</span>
                </span>
                <span className="font-bold text-sm" style={{ color: deliveryCalc.zone.color }}>
                  +${deliveryFee} DOP
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-neutral-400 font-mono">
                <span>Fórmula de cálculo:</span>
                <span>Cada 1.5 km = $25 DOP</span>
              </div>
            </div>

            {/* Total Inmediato */}
            <div className="p-3 bg-neutral-900 rounded-xl border border-emerald-500/40 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">
                  Total Inmediato a Pagar
                </span>
                <span className="text-xs text-neutral-300">
                  (Recargas + Delivery al instante)
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-emerald-400">
                  ${immediateTotal} DOP
                </span>
              </div>
            </div>

            {/* Aviso de Puntos Ganados / Fidelización */}
            {currentUser?.role === 'comprador' ? (
              <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/70 to-indigo-950/70 border border-purple-500/50 flex items-center justify-between gap-3 text-xs shadow-md">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-5 h-5 text-amber-300 shrink-0 animate-pulse" />
                  <div>
                    <span className="font-black text-white font-urban block text-sm">
                      🎁 ¡Ganarás +{Math.floor(subtotalLiquid)} puntos con este pedido!
                    </span>
                    <span className="text-[11px] text-purple-200">
                      Se acreditarán a tu cuenta ({currentUser.name}) automáticamente cuando el repartidor confirme la entrega.
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-purple-900 border border-purple-400/50 text-cyan-300 font-black text-xs shrink-0 font-urban">
                  +{Math.floor(subtotalLiquid)} PTS
                </span>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#130d22] border border-purple-900/60 flex items-center justify-between gap-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-white font-bold block">
                      ¿Quieres acumular +{Math.floor(subtotalLiquid)} puntos?
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Inicia sesión para acumular puntos y canjear llenadas gratis.
                    </span>
                  </div>
                </div>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-3 py-1.5 rounded-xl bg-purple-900/70 hover:bg-purple-800 text-cyan-300 font-black text-xs border border-purple-700/60 transition-colors cursor-pointer shrink-0 font-urban"
                  >
                    Entrar / Registrarme
                  </button>
                )}
              </div>
            )}

            {/* Aviso de Modalidad de Recarga */}
            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200 flex items-start gap-2">
              <span className="text-amber-400 text-sm">💧</span>
              <div>
                <strong>Modalidad de Recarga:</strong> Este pedido es para recargar el líquido directamente en el tanque de tu vape. <strong>No se vende ni entrega el frasco o pote entero</strong>. El repartidor de BLACK VAPE dispensará la cantidad exacta al llegar.
              </div>
            </div>

            {/* Sistema de Cálculo Inmediato */}
            <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <strong>Cálculo Inmediato por Distancia:</strong> A {distanceKm} km de la tienda ({store.addressText}), te corresponde el rango <strong>{deliveryCalc.zone.label}</strong> con tarifa fija de <strong>${deliveryFee} DOP</strong>. Sin sorpresas al momento de la entrega.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-3 px-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-300 font-bold text-xs sm:text-sm rounded-xl transition-all cursor-pointer"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={handleWhatsAppOrder}
              disabled={isSubmitting}
              className="py-3.5 px-4 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/60 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/60"
              title="Enviar este pedido completo con fotos y ubicación al WhatsApp de BLACK VAPE"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>{isSubmitting ? 'Procesando...' : 'Pedir por WhatsApp 💬'}</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-5 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 disabled:opacity-50 text-neutral-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isSubmitting ? 'Registrando Pedido...' : 'Pedir en la Web 🛵'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
