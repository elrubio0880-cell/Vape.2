import React, { useState, useEffect } from 'react';
import { UserAccount, StoreConfig, Product, RedemptionRequest, PointTransaction, Raffle } from '../../types';
import {
  fetchPointTransactions,
  fetchRedemptions,
  requestRedemption,
  fetchRaffles,
  fetchRaffleParticipants,
} from '../../utils/supabasePoints';
import { formatSantoDomingoDate } from '../../utils/points';
import { playNotificationSound } from '../../utils/storage';
import { reverseGeocode, getHighAccuracyGPS } from '../../utils/geocoding';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Gift,
  Award,
  History,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Droplet,
  MapPin,
  ChevronRight,
  RefreshCw,
  Trophy,
  Ticket,
  Flame,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface ClientPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  store: StoreConfig;
  products: Product[];
  onOpenAuth?: () => void;
  onPointsUpdated?: () => void;
}

type TabType = 'canjear' | 'solicitudes' | 'historial' | 'rifas';

export const ClientPointsModal: React.FC<ClientPointsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  store,
  products,
  onOpenAuth,
  onPointsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('canjear');
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRequest[]>([]);
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form state for new redemption (strictly liquids only)
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    const firstActiveLiquid = products.find(
      (p) => p.isActive && p.stockUnits > 0 && p.productType !== 'vape' && p.productType !== 'accesorio'
    );
    return firstActiveLiquid?.id || '';
  });
  const [addressNote, setAddressNote] = useState('');
  const [coords, setCoords] = useState(store.location || { lat: 19.41688, lng: -71.61287 });
  const [isLocating, setIsLocating] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [submittingRedemption, setSubmittingRedemption] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const pointsCost = store.pointsPerRedemption || 1000;
  const currentPoints = Number(currentUser.pointsBalance || 0);
  const canRedeem = currentPoints >= pointsCost && store.redemptionsEnabled !== false;
  const progressPercent = Math.min(100, Math.round((currentPoints / pointsCost) * 100));

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [txs, reds, rffs] = await Promise.all([
        fetchPointTransactions(currentUser.id),
        fetchRedemptions(),
        fetchRaffles(),
      ]);
      setTransactions(txs);
      setRedemptions(reds.filter((r) => r.userId === currentUser.id));
      setRaffles(rffs.filter((r) => r.status === 'activa' || r.status === 'finalizada'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setFormError('');
      setFormSuccess('');
    }
  }, [isOpen, currentUser.id]);

  if (!isOpen) return null;

  const handleGetGPS = async () => {
    setIsLocating(true);
    setGpsMessage('🛰️ Buscando coordenadas satelitales...');
    try {
      const res = await getHighAccuracyGPS();
      setCoords(res.coords);
      const addr = await reverseGeocode(res.coords);
      setGpsMessage(`Ubicación GPS fijada (±${res.accuracyMeters}m): ${addr}`);
      if (!addressNote.trim()) {
        setAddressNote(addr);
      }
      playNotificationSound('pop');
    } catch (err: any) {
      setGpsMessage(err.message || 'No se pudo obtener GPS.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleRequestRedemption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRedeem) {
      setFormError(`Necesitas al menos ${pointsCost} puntos para canjear.`);
      return;
    }
    const chosenProduct = products.find((p) => p.id === selectedProductId);
    if (!chosenProduct) {
      setFormError('Por favor selecciona un líquido de la lista.');
      return;
    }
    if (!addressNote.trim()) {
      setFormError('Por favor ingresa tu dirección o referencia para el delivery.');
      return;
    }

    setSubmittingRedemption(true);
    setFormError('');
    setFormSuccess('');

    try {
      const res = await requestRedemption({
        userId: currentUser.id,
        userName: currentUser.name,
        userPhone: currentUser.phone || '',
        productId: chosenProduct.id,
        productName: chosenProduct.name,
        portion: 'tanque_lleno',
        deliveryAddressNote: addressNote.trim(),
        destinationLat: coords.lat,
        destinationLng: coords.lng,
        pointsCost,
      });

      if (!res.success) {
        setFormError(res.error || 'No se pudo procesar la solicitud de canje.');
      } else {
        setFormSuccess('¡Solicitud de canje enviada con éxito! El administrador la revisará para despachar tu llenada gratis.');
        playNotificationSound('success');
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#a855f7', '#06b6d4', '#10b981', '#f59e0b'],
        });
        loadData();
        if (onPointsUpdated) onPointsUpdated();
        setTimeout(() => {
          setActiveTab('solicitudes');
        }, 1800);
      }
    } catch (err: any) {
      setFormError(err.message || 'Error inesperado al solicitar canje.');
    } finally {
      setSubmittingRedemption(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#07120d] border-2 border-emerald-500/50 rounded-3xl shadow-2xl shadow-emerald-950/70 flex flex-col max-h-[92vh] overflow-hidden text-neutral-100 font-urban">
        {/* Glow corner accents */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-emerald-600/20 via-teal-500/10 to-transparent pointer-events-none rounded-tr-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-teal-600/20 via-emerald-500/10 to-transparent pointer-events-none rounded-bl-3xl" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-emerald-900/50 bg-[#050b08]/80 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 flex items-center justify-center text-neutral-950 shadow-lg shadow-emerald-500/30 shrink-0">
              <Sparkles className="w-6 h-6 text-neutral-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg sm:text-xl text-white font-urban tracking-wide">
                  Club Black Vape
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/50 text-emerald-300">
                  Fidelización
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Cliente: <span className="text-white font-bold">{currentUser.name}</span> • 1 DOP en compras = 1 Punto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 text-neutral-400 hover:text-white transition-colors cursor-pointer border border-emerald-800/40"
            aria-label="Cerrar modal de puntos"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Points Balance Banner */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#06150e] via-[#0a2117] to-[#06150e] border-b border-emerald-900/50 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block mb-0.5">
                TU SALDO ACUMULADO
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white font-urban tracking-tight tabular-nums">
                  {currentPoints}
                </span>
                <span className="text-sm sm:text-base font-black text-emerald-400">PUNTOS</span>
                <span className="text-xs text-neutral-400">
                  ({Math.floor(currentPoints / pointsCost)} {Math.floor(currentPoints / pointsCost) === 1 ? 'llenada gratis' : 'llenadas gratis'})
                </span>
              </div>
            </div>

            <div className="sm:text-right">
              <span className="text-[11px] text-neutral-400 block mb-1">
                Meta: <span className="font-bold text-amber-300">{pointsCost} pts</span> = 1 Tanque Gratis
              </span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200">
                <Gift className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {canRedeem
                    ? '🎉 ¡Tienes canje disponible!'
                    : `Faltan ${Math.max(0, pointsCost - currentPoints)} pts para tu próximo canje`}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3.5">
            <div className="flex justify-between text-[11px] font-medium text-neutral-400 mb-1">
              <span>Progreso de Fidelización</span>
              <span className="text-emerald-400 font-bold tabular-nums">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full bg-[#040907] rounded-full overflow-hidden p-0.5 border border-emerald-900/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 transition-all duration-500 shadow-md shadow-emerald-500/30"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 border-b border-emerald-950/80 bg-[#050b08]/80 overflow-x-auto scrollbar-none relative z-10">
          <button
            type="button"
            onClick={() => setActiveTab('canjear')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'canjear'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 shadow-md shadow-emerald-500/25'
                : 'text-neutral-400 hover:text-white hover:bg-emerald-950/40'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Canjear Llenada</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('solicitudes')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'solicitudes'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 shadow-md shadow-emerald-500/25'
                : 'text-neutral-400 hover:text-white hover:bg-emerald-950/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Mis Canjes</span>
            {redemptions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-950 border border-emerald-500/60 text-emerald-200">
                {redemptions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historial')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'historial'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 shadow-md shadow-emerald-500/25'
                : 'text-neutral-400 hover:text-white hover:bg-emerald-950/40'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial Puntos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rifas')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'rifas'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 shadow-md shadow-emerald-500/25'
                : 'text-neutral-400 hover:text-white hover:bg-emerald-950/40'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Rifas & Sorteos</span>
            {raffles.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-neutral-950 font-black animate-pulse">
                {raffles.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 relative z-10">
          {/* TAB 1: CANJEAR LLENADA */}
          {activeTab === 'canjear' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-950/35 border border-emerald-500/30 rounded-2xl text-xs text-neutral-300 leading-relaxed">
                <span className="font-bold text-emerald-400 block mb-0.5 uppercase tracking-wide">
                  REGLA OFICIAL DE CANJE:
                </span>
                Por cada <strong className="text-white">1,000 puntos</strong> canjeas{' '}
                <strong className="text-white">1 Llenada de Tanque Completo</strong> del sabor que elijas.
                El costo del líquido es <span className="text-emerald-400 font-bold">100% GRATIS</span>.
                Al llegar el delivery a tu puerta, solo pagas la tarifa oficial de transporte de Loma de Cabrera (RD$25 por cada 1.5 km).
              </div>

              {!canRedeem ? (
                <div className="p-6 rounded-2xl bg-[#050b08] border border-emerald-900/50 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Gift className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-base">Aún no alcanzas los 1,000 puntos</h4>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    Tienes <span className="text-emerald-400 font-bold">{currentPoints} puntos</span>. Cada vez que recibes un pedido por delivery acumulas 1 punto por cada peso gastado.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black text-xs shadow hover:from-emerald-400 hover:to-teal-300 transition-all cursor-pointer"
                    >
                      Seguir Comprando para Sumar
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRequestRedemption} className="space-y-4">
                  {formError && (
                    <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{formError}</span>
                    </div>
                  )}

                  {formSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{formSuccess}</span>
                    </div>
                  )}

                  <div className="p-4 rounded-2xl bg-[#050b08] border border-emerald-900/50 space-y-3">
                    <label className="block text-xs font-bold uppercase text-emerald-400">
                      1. Selecciona el Líquido que quieres para tu tanque
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {products
                        .filter((p) => p.isActive && p.stockUnits > 0 && p.productType !== 'vape' && p.productType !== 'accesorio')
                        .map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => setSelectedProductId(prod.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              selectedProductId === prod.id
                                ? 'bg-emerald-950/70 border-emerald-400 shadow-md shadow-emerald-500/20'
                                : 'bg-[#08130e] border-emerald-950 hover:border-emerald-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-white text-xs block truncate">
                                {prod.name}
                              </span>
                              <span className="text-[10px] text-emerald-300">
                                Stock: {prod.stockUnits} dosis
                              </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 shrink-0">
                              Tanque Gratis
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#050b08] border border-emerald-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase text-emerald-400">
                        2. Dirección o Referencia de Entrega
                      </label>
                      <button
                        type="button"
                        onClick={handleGetGPS}
                        disabled={isLocating}
                        className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{isLocating ? 'Buscando GPS...' : 'Fijar mi GPS'}</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      value={addressNote}
                      onChange={(e) => setAddressNote(e.target.value)}
                      placeholder="Ej: Calle Capotillo #12, frente al parque central, Loma de Cabrera"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#08130e] border border-emerald-800/60 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-emerald-400 transition-colors"
                      required
                    />

                    {gpsMessage && (
                      <p className="text-[11px] text-emerald-300 font-mono flex items-center gap-1">
                        <span>{gpsMessage}</span>
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-teal-950/40 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-white block">Resumen del Canje:</span>
                      <span className="text-neutral-300">
                        Costo: <strong className="text-amber-300">{pointsCost} Puntos</strong> (Quedarán {currentPoints - pointsCost} pts)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-neutral-400 block">Líquido</span>
                      <span className="font-bold text-emerald-400">RD$0 (Gratis)</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingRedemption}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-black text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer font-urban"
                  >
                    {submittingRedemption ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-neutral-950" />
                    ) : (
                      <Gift className="w-4 h-4 text-neutral-950" />
                    )}
                    <span>
                      {submittingRedemption ? 'Enviando solicitud...' : 'Solicitar Llenada Gratis Ahora'}
                    </span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: MIS CANJES */}
          {activeTab === 'solicitudes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  {redemptions.length} {redemptions.length === 1 ? 'solicitud registrada' : 'solicitudes registradas'}
                </span>
                <button
                  type="button"
                  onClick={loadData}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {redemptions.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-[#050b08] border border-emerald-900/40 space-y-2">
                  <Gift className="w-8 h-8 mx-auto text-emerald-500/50" />
                  <p className="text-neutral-300 font-bold">No has solicitado canjes todavía</p>
                  <p className="text-neutral-500">
                    Cuando acumules 1,000 puntos podrás pedir una dosis gratis en la pestaña &quot;Canjear Llenada&quot;.
                  </p>
                </div>
              ) : (
                redemptions.map((red) => (
                  <div
                    key={red.id}
                    className="p-4 rounded-2xl bg-[#050b08] border border-emerald-900/50 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Droplet className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-white text-sm">{red.productName}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                            Tanque Lleno
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-400 block mt-0.5">
                          {formatSantoDomingoDate(red.createdAt)} • Ref: {red.id}
                        </span>
                      </div>

                      {/* Status badge */}
                      <div>
                        {red.status === 'pendiente' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-amber-950/80 text-amber-400 border border-amber-500/50 inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pendiente Aprobación
                          </span>
                        )}
                        {red.status === 'aprobado' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Aprobado
                          </span>
                        )}
                        {red.status === 'en_camino' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-teal-950/80 text-teal-400 border border-teal-500/50 inline-flex items-center gap-1">
                            🛵 En Camino
                          </span>
                        )}
                        {red.status === 'entregado' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 inline-flex items-center gap-1">
                            ✅ Entregado
                          </span>
                        )}
                        {red.status === 'rechazado' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-red-950/80 text-red-400 border border-red-500/50 inline-flex items-center gap-1">
                            ❌ Rechazado
                          </span>
                        )}
                      </div>
                    </div>

                    {red.deliveryAddressNote && (
                      <p className="text-[11px] text-neutral-300 bg-[#08130e] p-2 rounded-xl border border-emerald-950">
                        📍 {red.deliveryAddressNote}
                      </p>
                    )}

                    {red.rejectionReason && (
                      <p className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded-xl border border-red-900/50">
                        Motivo: {red.rejectionReason} (Tus puntos fueron devueltos a tu cuenta)
                      </p>
                    )}

                    {red.status === 'aprobado' && red.orderId && (
                      <p className="text-[11px] text-emerald-300">
                        Se generó el pedido de delivery #{red.orderId}. Puedes seguir al repartidor en la sección &quot;Mapa &amp; Rastreo&quot;.
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: HISTORIAL DE PUNTOS */}
          {activeTab === 'historial' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  {transactions.length} movimientos de auditoría registrados
                </span>
                <button
                  type="button"
                  onClick={loadData}
                  className="text-xs text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-[#050b08] border border-emerald-900/40 space-y-2">
                  <History className="w-8 h-8 mx-auto text-emerald-500/50" />
                  <p className="text-neutral-300 font-bold">Aún no tienes movimientos de puntos</p>
                  <p className="text-neutral-500">
                    Al completar entregas de pedidos tus puntos aparecerán registrados aquí automáticamente.
                  </p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-[#050b08] border border-emerald-900/40 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black text-sm tabular-nums ${
                            tx.points > 0 ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {tx.points > 0 ? `+${tx.points}` : tx.points} pts
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {tx.transactionType === 'ganado_pedido' ||
                          tx.transactionType === 'pedido_entregado' ||
                          tx.transactionType === 'acumulacion_pedido'
                            ? 'Entrega Completada'
                            : tx.transactionType === 'canje_solicitado'
                            ? 'Canje Solicitado'
                            : tx.transactionType === 'canje_aprobado' ||
                              tx.transactionType === 'canje_liquido'
                            ? 'Canje Aprobado'
                            : tx.transactionType === 'devolucion_canje'
                            ? 'Puntos Reembolsados'
                            : tx.transactionType === 'ajuste_manual' ||
                              tx.transactionType === 'ajuste_manual_admin'
                            ? 'Ajuste Manual'
                            : 'Reset de Puntos'}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-300 truncate mt-0.5">
                        {tx.reason || (tx.orderId ? `Pedido #${tx.orderId}` : 'Movimiento')}
                      </p>
                      <span className="text-[10px] text-neutral-500 block">
                        {formatSantoDomingoDate(tx.createdAt)}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-neutral-500 block">Saldo posterior</span>
                      <span className="font-bold text-white text-xs tabular-nums">{tx.balanceAfter} pts</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: RIFAS & SORTEOS */}
          {activeTab === 'rifas' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-gradient-to-r from-amber-950/40 to-emerald-950/50 border border-amber-500/40 rounded-2xl text-xs text-neutral-300 leading-relaxed">
                <span className="font-bold text-amber-300 block mb-0.5 uppercase tracking-wide">
                  SISTEMA DE SORTEOS BLACK VAPE:
                </span>
                Participas automáticamente con tus compras y puntos acumulados. Puedes ganar pods, líquidos premium, baterías o accesorios exclusivos. El administrador realiza los sorteos en vivo con la ruleta animada.
              </div>

              {raffles.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-[#050b08] border border-emerald-900/40 space-y-2">
                  <Trophy className="w-8 h-8 mx-auto text-amber-500/50" />
                  <p className="text-neutral-300 font-bold">No hay rifas activas en este momento</p>
                  <p className="text-neutral-500">
                    Pronto la administración publicará un nuevo sorteo. ¡Mantén tus puntos acumulados!
                  </p>
                </div>
              ) : (
                raffles.map((raf) => (
                  <div
                    key={raf.id}
                    className="p-4 rounded-2xl bg-[#050b08] border border-amber-500/40 space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-amber-400" />
                          <h4 className="font-black text-sm text-white font-urban">{raf.title}</h4>
                        </div>
                        {raf.description && (
                          <p className="text-neutral-400 text-xs mt-1">{raf.description}</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                          raf.status === 'finalizada'
                            ? 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                            : 'bg-amber-500 text-neutral-950 font-black'
                        }`}
                      >
                        {raf.status === 'finalizada' ? '✓ Finalizada' : '● En Curso'}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#08130e] border border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase font-bold block">
                          PREMIO DEL SORTEO
                        </span>
                        <span className="font-black text-amber-300 text-sm">{raf.prizeText}</span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-neutral-400 uppercase font-bold block">
                          MODALIDAD DE BOLETOS
                        </span>
                        <span className="font-bold text-emerald-300 text-xs">
                          {raf.drawType === 'igualitaria' || (raf.drawType as any) === 'igualdad'
                            ? '1 Boleto por Comprador'
                            : 'Ponderado (1 Boleto por cada Punto)'}
                        </span>
                      </div>
                    </div>

                    {raf.status === 'finalizada' ? (
                      <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                          🏆 Ganador Oficial del Sorteo:
                        </span>
                        <div className="font-black text-sm text-white">{raf.winnerName}</div>
                        <span className="text-[10px] text-neutral-400 font-mono block">
                          Boleto premiado: #{raf.winnerTicketNumber} de {raf.totalTickets} •{' '}
                          {raf.drawnAt ? formatSantoDomingoDate(raf.drawnAt) : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <Ticket className="w-4 h-4 text-emerald-400" />
                          <span className="text-neutral-300">
                            Tus boletos estimados:{' '}
                            <strong className="text-white">
                              {raf.drawType === 'igualitaria' || (raf.drawType as any) === 'igualdad'
                                ? currentPoints > 0
                                  ? '1 boleto'
                                  : '0 boletos'
                                : `${currentPoints} boletos`}
                            </strong>
                          </span>
                        </div>
                        <span className="text-neutral-400">Total en juego: {raf.totalTickets} boletos</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-emerald-900/40 bg-[#050b08] flex items-center justify-between gap-2 relative z-10 text-xs">
          <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Puntos auditados en servidor con RLS de Supabase</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
