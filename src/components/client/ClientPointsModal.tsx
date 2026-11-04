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

  // Form state for new redemption
  const [selectedProductId, setSelectedProductId] = useState<string>(() => {
    const firstActive = products.find((p) => p.isActive && p.stockUnits > 0);
    return firstActive?.id || products[0]?.id || '';
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
      <div className="relative w-full max-w-2xl bg-[#0c0817] border-2 border-purple-500/40 rounded-3xl shadow-2xl shadow-purple-950 flex flex-col max-h-[92vh] overflow-hidden text-neutral-100 font-urban">
        {/* Glow corner accents */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-purple-600/20 via-cyan-500/10 to-transparent pointer-events-none rounded-tr-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-cyan-600/20 via-purple-500/10 to-transparent pointer-events-none rounded-bl-3xl" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-purple-900/40 bg-black/40 flex items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-purple-600/30 shrink-0">
              <Sparkles className="w-6 h-6 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg sm:text-xl text-white font-urban tracking-wide">
                  Club Black Vape
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-950 border border-purple-500/50 text-purple-300">
                  Fidelización
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Cliente: <span className="text-white font-bold">{currentUser.name}</span> • 1 DOP en líquidos = 1 Punto
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-neutral-400 hover:text-white transition-colors cursor-pointer border border-purple-800/40"
            aria-label="Cerrar modal de puntos"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Points Balance Banner */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-950/70 via-[#160f2b] to-cyan-950/60 border-b border-purple-900/40 relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-tag uppercase tracking-wider text-purple-300 block mb-0.5">
                TU SALDO ACUMULADO
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-black text-white font-urban tracking-tight text-glow-purple">
                  {currentPoints}
                </span>
                <span className="text-sm sm:text-base font-black text-cyan-300">PUNTOS</span>
                <span className="text-xs text-neutral-400">
                  ({Math.floor(currentPoints / pointsCost)} {Math.floor(currentPoints / pointsCost) === 1 ? 'llenada gratis' : 'llenadas gratis'})
                </span>
              </div>
            </div>

            <div className="sm:text-right">
              <span className="text-[11px] text-neutral-400 block mb-1">
                Meta: <span className="font-bold text-amber-300">{pointsCost} pts</span> = 1 Tanque Gratis
              </span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-900/50 border border-purple-500/40 text-xs text-purple-200">
                <Gift className="w-3.5 h-3.5 text-cyan-300" />
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
              <span className="text-cyan-300 font-bold">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full bg-neutral-900 rounded-full overflow-hidden p-0.5 border border-purple-900/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 transition-all duration-500 shadow-md shadow-cyan-500/30"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 border-b border-purple-950/60 bg-black/30 overflow-x-auto scrollbar-none relative z-10">
          <button
            type="button"
            onClick={() => setActiveTab('canjear')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'canjear'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 border border-purple-400/50'
                : 'text-neutral-400 hover:text-white hover:bg-purple-950/30'
            }`}
          >
            <Gift className="w-3.5 h-3.5 text-cyan-300" />
            <span>Canjear Llenada</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('solicitudes')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'solicitudes'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 border border-purple-400/50'
                : 'text-neutral-400 hover:text-white hover:bg-purple-950/30'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-purple-300" />
            <span>Mis Canjes</span>
            {redemptions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-950 border border-purple-500/60 text-purple-200">
                {redemptions.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historial')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'historial'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 border border-purple-400/50'
                : 'text-neutral-400 hover:text-white hover:bg-purple-950/30'
            }`}
          >
            <History className="w-3.5 h-3.5 text-cyan-300" />
            <span>Historial Puntos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rifas')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'rifas'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30 border border-purple-400/50'
                : 'text-neutral-400 hover:text-white hover:bg-purple-950/30'
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
              <div className="p-3.5 bg-purple-950/40 border border-purple-800/40 rounded-2xl text-xs text-neutral-300 leading-relaxed">
                <span className="font-tag text-cyan-300 block mb-0.5">REGLA OFICIAL DE CANJE:</span>
                Por cada <strong className="text-white">1,000 puntos</strong> canjeas{' '}
                <strong className="text-white">1 Llenada de Tanque Completo</strong> del sabor que elijas.
                El costo del líquido es <span className="text-emerald-400 font-bold">100% GRATIS</span>.
                Al llegar el delivery a tu puerta, solo pagas la tarifa oficial de transporte de Loma de Cabrera ($25 DOP por cada 1.5 km).
              </div>

              {!canRedeem ? (
                <div className="p-6 rounded-2xl bg-black/60 border border-neutral-800 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-purple-950 flex items-center justify-center text-purple-400">
                    <Gift className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-base">Aún no alcanzas los 1,000 puntos</h4>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    Tienes <span className="text-purple-300 font-bold">{currentPoints} puntos</span>. Cada vez que recibes un pedido de líquidos por delivery acumulas 1 punto por cada peso gastado en líquido.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs shadow hover:from-purple-500 hover:to-indigo-500 transition-all cursor-pointer"
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

                  <div className="p-4 rounded-2xl bg-black/50 border border-purple-900/50 space-y-3">
                    <label className="block text-xs font-tag uppercase text-purple-300">
                      1. Selecciona el Líquido que quieres para tu tanque
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                      {products
                        .filter((p) => p.isActive && p.stockUnits > 0)
                        .map((prod) => (
                          <div
                            key={prod.id}
                            onClick={() => setSelectedProductId(prod.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              selectedProductId === prod.id
                                ? 'bg-purple-900/40 border-cyan-400 shadow-md shadow-cyan-500/20'
                                : 'bg-[#140e24] border-purple-950 hover:border-purple-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-white text-xs block truncate">
                                {prod.name}
                              </span>
                              <span className="text-[10px] text-cyan-300">
                                Stock: {prod.stockUnits} dosis
                              </span>
                            </div>
                            <span className="text-[11px] font-tag px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-500/40 shrink-0">
                              Tanque Gratis
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/50 border border-purple-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-tag uppercase text-purple-300">
                        2. Dirección o Referencia de Entrega
                      </label>
                      <button
                        type="button"
                        onClick={handleGetGPS}
                        disabled={isLocating}
                        className="text-[11px] font-bold text-cyan-300 hover:text-cyan-200 flex items-center gap-1 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{isLocating ? 'Buscando GPS...' : 'Fijar mi GPS'}</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      value={addressNote}
                      onChange={(e) => setAddressNote(e.target.value)}
                      placeholder="Ej: Calle Capotillo #12, frente al parque central, Loma de Cabrera"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#140e24] border border-purple-800/60 text-white placeholder-neutral-500 text-xs focus:outline-none focus:border-cyan-400 transition-colors"
                      required
                    />

                    {gpsMessage && (
                      <p className="text-[11px] text-cyan-300 font-mono flex items-center gap-1">
                        <span>{gpsMessage}</span>
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-cyan-950/40 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-bold text-white block">Resumen del Canje:</span>
                      <span className="text-neutral-300">
                        Costo: <strong className="text-amber-300">{pointsCost} Puntos</strong> (Quedarán {currentPoints - pointsCost} pts)
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-neutral-400 block">Líquido</span>
                      <span className="font-bold text-emerald-400">$0 DOP (Gratis)</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingRedemption}
                    className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer font-urban"
                  >
                    {submittingRedemption ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <Gift className="w-4 h-4 text-amber-200" />
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
                  className="text-xs text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {redemptions.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-black/40 border border-neutral-900 space-y-2">
                  <Gift className="w-8 h-8 mx-auto text-purple-700/60" />
                  <p className="text-neutral-300 font-bold">No has solicitado canjes todavía</p>
                  <p className="text-neutral-500">
                    Cuando acumules 1,000 puntos podrás pedir una dosis gratis en la pestaña &quot;Canjear Llenada&quot;.
                  </p>
                </div>
              ) : (
                redemptions.map((red) => (
                  <div
                    key={red.id}
                    className="p-4 rounded-2xl bg-black/60 border border-purple-900/50 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Droplet className="w-4 h-4 text-cyan-400" />
                          <span className="font-bold text-white text-sm">{red.productName}</span>
                          <span className="text-[10px] uppercase font-tag px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
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
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-cyan-950/80 text-cyan-400 border border-cyan-500/50 inline-flex items-center gap-1">
                            🛵 En Camino
                          </span>
                        )}
                        {red.status === 'entregado' && (
                          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-violet-950/80 text-violet-300 border border-violet-500/50 inline-flex items-center gap-1">
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
                      <p className="text-[11px] text-neutral-300 bg-[#140e24] p-2 rounded-xl border border-purple-950">
                        📍 {red.deliveryAddressNote}
                      </p>
                    )}

                    {red.rejectionReason && (
                      <p className="text-[11px] text-red-300 bg-red-950/40 p-2 rounded-xl border border-red-900/50">
                        Motivo: {red.rejectionReason} (Tus puntos fueron devueltos a tu cuenta)
                      </p>
                    )}

                    {red.status === 'aprobado' && red.orderId && (
                      <p className="text-[11px] text-cyan-300">
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
                  className="text-xs text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>

              {transactions.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-black/40 border border-neutral-900 space-y-2">
                  <History className="w-8 h-8 mx-auto text-purple-700/60" />
                  <p className="text-neutral-300 font-bold">Aún no tienes movimientos de puntos</p>
                  <p className="text-neutral-500">
                    Al completar entregas de pedidos tus puntos aparecerán registrados aquí automáticamente.
                  </p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-black/60 border border-purple-900/40 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black text-sm ${
                            tx.points > 0 ? 'text-emerald-400' : 'text-purple-400'
                          }`}
                        >
                          {tx.points > 0 ? `+${tx.points}` : tx.points} pts
                        </span>
                        <span className="text-[10px] font-tag uppercase px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
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
                      <span className="font-bold text-white text-xs">{tx.balanceAfter} pts</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: RIFAS & SORTEOS */}
          {activeTab === 'rifas' && (
            <div className="space-y-3">
              <div className="p-3.5 bg-gradient-to-r from-amber-950/40 to-purple-950/50 border border-amber-500/40 rounded-2xl text-xs text-neutral-300 leading-relaxed">
                <span className="font-tag text-amber-300 block mb-0.5">SISTEMA DE SORTEOS BLACK VAPE:</span>
                Participas automáticamente con tus compras y puntos acumulados. Puedes ganar pods, líquidos premium, baterías o accesorios exclusivos. El administrador realiza los sorteos en vivo con la ruleta animada.
              </div>

              {raffles.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-xs rounded-2xl bg-black/40 border border-neutral-900 space-y-2">
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
                    className="p-4 rounded-2xl bg-black/60 border border-amber-500/40 space-y-3 text-xs"
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

                    <div className="p-3 rounded-xl bg-[#140e24] border border-purple-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 uppercase font-tag block">
                          PREMIO DEL SORTEO
                        </span>
                        <span className="font-black text-amber-300 text-sm">{raf.prizeText}</span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] text-neutral-400 uppercase font-tag block">
                          MODALIDAD DE BOLETOS
                        </span>
                        <span className="font-bold text-cyan-300 text-xs">
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
                      <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <Ticket className="w-4 h-4 text-cyan-300" />
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
        <div className="p-3.5 border-t border-purple-900/40 bg-black/50 flex items-center justify-between gap-2 relative z-10 text-xs">
          <span className="text-[11px] text-neutral-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
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
