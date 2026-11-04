import React, { useState, useEffect, useMemo } from 'react';
import {
  PointTransaction,
  PointTransactionType,
  RedemptionRequest,
  RedemptionStatus,
  Raffle,
  RaffleParticipant,
  RaffleDrawType,
  UserAccount,
} from '../../types';
import {
  fetchPointTransactions,
  fetchRedemptions,
  approveRedemption,
  rejectOrCancelRedemption,
  adjustUserPoints,
  fetchRegisteredCustomers,
  fetchRaffles,
  createRaffle,
  syncRaffleParticipants,
  executeRaffleDraw,
  fetchRaffleParticipants,
} from '../../utils/supabasePoints';
import { formatSantoDomingoDate } from '../../utils/points';
import { playNotificationSound } from '../../utils/storage';
import { generateWhatsAppLink } from '../../utils/whatsapp';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Gift,
  Users,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Plus,
  Minus,
  MessageCircle,
  MapPin,
  Trophy,
  Dices,
  RefreshCw,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

interface LoyaltyManagementProps {
  currentUser?: UserAccount | null;
}

export const LoyaltyManagement: React.FC<LoyaltyManagementProps> = ({ currentUser }) => {
  const [subTab, setSubTab] = useState<'canjes' | 'clientes' | 'auditoria' | 'rifas'>('canjes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Core Data
  const [redemptions, setRedemptions] = useState<RedemptionRequest[]>([]);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [customers, setCustomers] = useState<
    Array<{ id: string; name: string; phone?: string; email?: string; pointsBalance: number; createdAt?: string }>
  >([]);
  const [raffles, setRaffles] = useState<Raffle[]>([]);

  // Filters
  const [redemptionFilter, setRedemptionFilter] = useState<'todos' | RedemptionStatus>('todos');
  const [customerSearch, setCustomerSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'todos' | PointTransactionType>('todos');
  const [txSearch, setTxSearch] = useState('');

  // Modals
  // 1. Rejection Modal
  const [rejectingRedemption, setRejectingRedemption] = useState<RedemptionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // 2. Adjust Points Modal
  const [adjustingCustomer, setAdjustingCustomer] = useState<{
    id: string;
    name: string;
    pointsBalance: number;
  } | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<number>(100);
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // 3. New Raffle Modal
  const [isCreatingRaffle, setIsCreatingRaffle] = useState(false);
  const [raffleTitle, setRaffleTitle] = useState('');
  const [rafflePrize, setRafflePrize] = useState('');
  const [raffleDesc, setRaffleDesc] = useState('');
  const [raffleDrawType, setRaffleDrawType] = useState<RaffleDrawType>('ponderada');
  const [isSubmittingRaffle, setIsSubmittingRaffle] = useState(false);

  // 4. Raffle Draw Runner Modal
  const [activeDrawRaffle, setActiveDrawRaffle] = useState<Raffle | null>(null);
  const [drawParticipants, setDrawParticipants] = useState<RaffleParticipant[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnWinner, setDrawnWinner] = useState<{
    name: string;
    ticket: number;
    userId: string;
    totalTickets: number;
  } | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);

  // Load all initial data
  const loadAllData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      const [fetchedRedemptions, fetchedTxs, fetchedCusts, fetchedRaffles] = await Promise.all([
        fetchRedemptions(),
        fetchPointTransactions(),
        fetchRegisteredCustomers(),
        fetchRaffles(),
      ]);
      setRedemptions(fetchedRedemptions);
      setTransactions(fetchedTxs);
      setCustomers(fetchedCusts);
      setRaffles(fetchedRaffles);
    } catch (err) {
      console.warn('Error loading loyalty management data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalPointsInCirculation = customers.reduce((sum, c) => sum + (c.pointsBalance || 0), 0);
    const eligibleForFreeRefill = customers.filter((c) => (c.pointsBalance || 0) >= 1000).length;
    const pendingRedemptionsCount = redemptions.filter((r) => r.status === 'pendiente').length;
    const allTimeRedeemedPoints = transactions
      .filter((t) => t.transactionType === 'canje_liquido')
      .reduce((sum, t) => sum + Math.abs(t.points), 0);
    const activeRafflesCount = raffles.filter((r) => r.status === 'activa').length;

    return {
      totalPointsInCirculation,
      eligibleForFreeRefill,
      pendingRedemptionsCount,
      allTimeRedeemedPoints,
      activeRafflesCount,
    };
  }, [customers, redemptions, transactions, raffles]);

  // Handle Approving Redemption
  const handleApprove = async (redemp: RedemptionRequest) => {
    if (!confirm(`¿Confirmas aprobar el canje de ${redemp.productName} para ${redemp.userName || 'el cliente'}?\n\nSe restarán ${redemp.pointsCost} puntos de su saldo y se generará una orden para entrega inmediata.`)) {
      return;
    }

    const adminId = currentUser?.id || 'admin-local';
    const res = await approveRedemption(redemp.id, adminId);
    if (!res.success) {
      setNotice({ text: res.error || 'Error al aprobar el canje.', type: 'error' });
      return;
    }

    playNotificationSound('success');
    setNotice({
      text: `¡Canje #${redemp.id.slice(0, 8)} aprobado exitosamente! Se generó el pedido ${res.orderId || ''} para reparto.`,
      type: 'success',
    });
    await loadAllData(true);
  };

  // Handle Rejecting Redemption
  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRedemption) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 4) {
      setNotice({ text: 'Por favor indica un motivo detallado para el rechazo o cancelación.', type: 'error' });
      return;
    }

    setIsRejecting(true);
    const adminId = currentUser?.id || 'admin-local';
    const res = await rejectOrCancelRedemption(rejectingRedemption.id, rejectionReason.trim(), adminId);
    setIsRejecting(false);

    if (!res.success) {
      setNotice({ text: res.error || 'Error al procesar el rechazo.', type: 'error' });
      return;
    }

    setNotice({
      text: `Solicitud de canje rechazada. Se reembolsaron ${rejectingRedemption.pointsCost} puntos al cliente.`,
      type: 'success',
    });
    setRejectingRedemption(null);
    setRejectionReason('');
    await loadAllData(true);
  };

  // Handle Manual Point Adjustment
  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingCustomer) return;
    if (adjustDelta === 0) {
      setNotice({ text: 'El ajuste no puede ser 0.', type: 'error' });
      return;
    }
    if (adjustingCustomer.pointsBalance + adjustDelta < 0) {
      setNotice({ text: 'El saldo resultante no puede ser negativo.', type: 'error' });
      return;
    }
    if (!adjustReason.trim() || adjustReason.trim().length < 4) {
      setNotice({ text: 'El motivo del ajuste es obligatorio (mínimo 4 caracteres).', type: 'error' });
      return;
    }

    setIsAdjusting(true);
    const adminId = currentUser?.id || 'admin-local';
    const res = await adjustUserPoints(
      adjustingCustomer.id,
      adjustDelta,
      adjustReason.trim(),
      adminId
    );
    setIsAdjusting(false);

    if (!res.success) {
      setNotice({ text: res.error || 'Error al ajustar puntos.', type: 'error' });
      return;
    }

    playNotificationSound('success');
    setNotice({
      text: `Puntos actualizados con éxito. Nuevo saldo de ${adjustingCustomer.name}: ${res.newBalance} pts.`,
      type: 'success',
    });
    setAdjustingCustomer(null);
    setAdjustDelta(100);
    setAdjustReason('');
    await loadAllData(true);
  };

  // Handle Create Raffle
  const handleCreateRaffleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!raffleTitle.trim() || !rafflePrize.trim()) {
      setNotice({ text: 'Título y premio de la rifa son obligatorios.', type: 'error' });
      return;
    }

    setIsSubmittingRaffle(true);
    const res = await createRaffle({
      title: raffleTitle.trim(),
      description: raffleDesc.trim(),
      prizeText: rafflePrize.trim(),
      drawType: raffleDrawType,
    });
    setIsSubmittingRaffle(false);

    if (!res.success) {
      setNotice({ text: res.error || 'Error al crear la rifa.', type: 'error' });
      return;
    }

    playNotificationSound('success');
    setNotice({
      text: `¡Rifa "${raffleTitle}" creada exitosamente con boletos sincronizados!`,
      type: 'success',
    });
    setIsCreatingRaffle(false);
    setRaffleTitle('');
    setRafflePrize('');
    setRaffleDesc('');
    await loadAllData(true);
  };

  // Handle Open Draw Modal
  const handleOpenDrawModal = async (raffle: Raffle) => {
    setActiveDrawRaffle(raffle);
    setDrawnWinner(null);
    const parts = await fetchRaffleParticipants(raffle.id);
    setDrawParticipants(parts);
  };

  // Handle Trigger Live Draw
  const handleTriggerDraw = async () => {
    if (!activeDrawRaffle) return;
    setIsDrawing(true);

    // Spin animation effect
    const spinDegrees = 1800 + Math.floor(Math.random() * 720);
    setWheelRotation((prev) => prev + spinDegrees);

    try {
      const res = await executeRaffleDraw(activeDrawRaffle.id);
      setTimeout(() => {
        setIsDrawing(false);
        if (res.success && res.winnerName) {
          playNotificationSound('success');
          confetti({
            particleCount: 130,
            spread: 85,
            origin: { y: 0.5 },
            colors: ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'],
          });
          setDrawnWinner({
            name: res.winnerName,
            ticket: res.winningTicket || 1,
            userId: res.winnerUserId || '',
            totalTickets: res.totalTickets || 1,
          });
          loadAllData(true);
        } else {
          setNotice({ text: res.error || 'Error al sortear ganador.', type: 'error' });
        }
      }, 3000);
    } catch (err: any) {
      setIsDrawing(false);
      setNotice({ text: err.message || 'Error inesperado durante el sorteo.', type: 'error' });
    }
  };

  // Filtered lists
  const filteredRedemptions = useMemo(() => {
    if (redemptionFilter === 'todos') return redemptions;
    return redemptions.filter((r) => r.status === redemptionFilter);
  }, [redemptions, redemptionFilter]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      let matchesType = txTypeFilter === 'todos' || t.transactionType === txTypeFilter;
      if (!matchesType) {
        if (
          txTypeFilter === 'pedido_entregado' &&
          (t.transactionType === 'ganado_pedido' || t.transactionType === 'acumulacion_pedido')
        ) {
          matchesType = true;
        } else if (txTypeFilter === 'canje_liquido' && t.transactionType === 'canje_aprobado') {
          matchesType = true;
        } else if (
          txTypeFilter === 'ajuste_manual_admin' &&
          t.transactionType === 'ajuste_manual'
        ) {
          matchesType = true;
        } else if (txTypeFilter === 'reset_puntos' && t.transactionType === 'ajuste_reset') {
          matchesType = true;
        }
      }
      const q = txSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        t.userId.toLowerCase().includes(q) ||
        (t.orderId && t.orderId.toLowerCase().includes(q)) ||
        (t.reason && t.reason.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [transactions, txTypeFilter, txSearch]);

  return (
    <div className="space-y-6">
      {/* Toast Notice */}
      {notice && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all shadow-xl ${
            notice.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : 'bg-red-950/80 border-red-500/50 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-neutral-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* METRICS HEADER CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">En Circulación</span>
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-black text-white font-urban">
            {metrics.totalPointsInCirculation.toLocaleString()} <span className="text-xs text-violet-400">PTS</span>
          </div>
          <span className="text-[10px] text-neutral-400 block mt-1">Saldo acumulado por compradores</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Listos para Canje</span>
            <Gift className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-urban">
            {metrics.eligibleForFreeRefill}{' '}
            <span className="text-xs text-neutral-400 font-normal">clientes (≥1,000 pts)</span>
          </div>
          <span className="text-[10px] text-neutral-400 block mt-1">Elegibles para 1 recarga gratis</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Canjes Pendientes</span>
            <div className="relative">
              <Gift className="w-4 h-4 text-amber-400" />
              {metrics.pendingRedemptionsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400 font-urban">
            {metrics.pendingRedemptionsCount}
          </div>
          <span className="text-[10px] text-neutral-400 block mt-1">Requieren aprobación del vendedor</span>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Redimido</span>
            <Trophy className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400 font-urban">
            {metrics.allTimeRedeemedPoints.toLocaleString()} <span className="text-xs text-cyan-300">PTS</span>
          </div>
          <span className="text-[10px] text-neutral-400 block mt-1">Líquidos gratis entregados</span>
        </div>
      </div>

      {/* SUB-TABS NAVIGATION & REFRESH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl shadow-md">
        <div className="inline-flex p-1 bg-neutral-950 rounded-xl overflow-x-auto scrollbar-none gap-1">
          <button
            type="button"
            onClick={() => setSubTab('canjes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'canjes'
                ? 'bg-violet-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Bandeja de Canjes</span>
            {metrics.pendingRedemptionsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-neutral-950 font-black rounded-full text-[10px]">
                {metrics.pendingRedemptionsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('clientes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'clientes'
                ? 'bg-violet-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Clientes & Ajustes</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('auditoria')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'auditoria'
                ? 'bg-violet-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Libro Mayor (Auditoría)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('rifas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              subTab === 'rifas'
                ? 'bg-violet-600 text-white shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Dices className="w-3.5 h-3.5" />
            <span>Rifas & Sorteos</span>
            {metrics.activeRafflesCount > 0 && (
              <span className="px-1.5 py-0.2 bg-emerald-500 text-neutral-950 font-black rounded-full text-[10px]">
                {metrics.activeRafflesCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => loadAllData()}
          disabled={refreshing}
          className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-violet-400' : ''}`} />
          <span>{refreshing ? 'Sincronizando...' : 'Actualizar'}</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* SUB-TAB 1: BANDEJA DE CANJES                                        */}
      {/* =================================================================== */}
      {subTab === 'canjes' && (
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-xl text-xs">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'pendiente', label: 'Pendientes' },
                  { id: 'aprobado', label: 'Aprobados' },
                  { id: 'rechazado', label: 'Rechazados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRedemptionFilter(tab.id)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    redemptionFilter === tab.id
                      ? 'bg-violet-600 text-white'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-neutral-400">
              Mostrando <strong className="text-white">{filteredRedemptions.length}</strong> solicitudes
            </div>
          </div>

          {filteredRedemptions.length === 0 ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-10 text-center space-y-3">
              <Gift className="w-12 h-12 text-neutral-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No hay solicitudes de canje</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Los clientes registrados con 1,000 o más puntos podrán solicitar una recarga de líquido gratis desde su app.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRedemptions.map((redemp) => {
                const isPending = redemp.status === 'pendiente';
                const isApproved = redemp.status === 'aprobado';
                const isRejected = redemp.status === 'rechazado';

                return (
                  <div
                    key={redemp.id}
                    className={`bg-neutral-900 border rounded-2xl p-5 shadow-xl space-y-4 transition-all ${
                      isPending
                        ? 'border-amber-500/50 bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/20'
                        : isApproved
                        ? 'border-emerald-500/40'
                        : 'border-neutral-800 opacity-80'
                    }`}
                  >
                    {/* Header: Status and ID */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isPending
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : isApproved
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-red-500/20 text-red-300 border border-red-500/40'
                            }`}
                          >
                            {isPending ? '⏳ Pendiente Aprobación' : isApproved ? '✓ Aprobado' : '✕ Rechazado'}
                          </span>
                          <span className="text-xs font-mono text-neutral-400">
                            #{redemp.id.slice(0, 10)}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-white mt-1.5 flex items-center gap-1.5">
                          <span>{redemp.userName || 'Cliente Registrado'}</span>
                        </h4>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-violet-400 bg-violet-500/10 border border-violet-500/30 px-2 py-1 rounded-xl">
                          -{redemp.pointsCost} PTS
                        </span>
                        <span className="text-[10px] text-neutral-400 block mt-1">
                          {formatSantoDomingoDate(redemp.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Details Box */}
                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Líquido Solicitado:</span>
                        <strong className="text-white font-semibold">{redemp.productName}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Porción:</span>
                        <span className="font-bold text-emerald-400">
                          {redemp.portion === 'tanque_lleno' ? 'Tanque Lleno (Gratis)' : 'Mitad (Gratis)'}
                        </span>
                      </div>
                      {redemp.userPhone && (
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-400">Teléfono:</span>
                          <a
                            href={`tel:${redemp.userPhone}`}
                            className="text-violet-400 hover:underline font-mono flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3" />
                            {redemp.userPhone}
                          </a>
                        </div>
                      )}
                      {redemp.deliveryAddressNote && (
                        <div className="pt-1 border-t border-neutral-900 text-neutral-300">
                          <span className="text-neutral-400 block text-[11px]">Dirección / Referencia:</span>
                          <p className="italic mt-0.5">{redemp.deliveryAddressNote}</p>
                        </div>
                      )}
                      {redemp.orderId && (
                        <div className="flex items-center justify-between pt-1 border-t border-neutral-900">
                          <span className="text-neutral-400">Pedido Generado:</span>
                          <span className="font-mono text-emerald-400 font-bold">{redemp.orderId}</span>
                        </div>
                      )}
                      {redemp.rejectionReason && (
                        <div className="p-2 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-[11px]">
                          <strong>Motivo de rechazo:</strong> {redemp.rejectionReason}
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      {redemp.userPhone && (
                        <a
                          href={generateWhatsAppLink(
                            redemp.userPhone,
                            `Hola ${redemp.userName || ''}, te escribimos de BLACK VAPE respecto a tu solicitud de canje de ${redemp.productName}.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition-all flex items-center justify-center cursor-pointer"
                          title="Contactar por WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      )}

                      {isPending && (
                        <>
                          <button
                            type="button"
                            onClick={() => setRejectingRedemption(redemp)}
                            className="flex-1 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-red-900/40 text-neutral-300 hover:text-red-300 border border-neutral-700 hover:border-red-500/40 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Rechazar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApprove(redemp)}
                            className="flex-1 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Aprobar Canje</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 2: CLIENTES & AJUSTES MANUALES                              */}
      {/* =================================================================== */}
      {subTab === 'clientes' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
            <Search className="w-4 h-4 text-neutral-400 shrink-0" />
            <input
              type="text"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Buscar cliente por nombre, teléfono o email..."
              className="bg-transparent text-xs text-white placeholder-neutral-500 w-full focus:outline-none"
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="text-neutral-400 hover:text-white text-xs font-bold"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-950 text-neutral-400 uppercase font-mono text-[10px] tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Contacto</th>
                    <th className="py-3 px-4 text-center">Saldo Actual</th>
                    <th className="py-3 px-4 text-center">Llenadas Gratis</th>
                    <th className="py-3 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-neutral-500">
                        No se encontraron clientes registrados con ese criterio.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const freeRefills = Math.floor((cust.pointsBalance || 0) / 1000);
                      return (
                        <tr key={cust.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{cust.name}</div>
                            <span className="text-[10px] text-neutral-500 font-mono">
                              ID: {cust.id.slice(0, 10)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {cust.phone ? (
                              <div className="font-mono text-neutral-300">{cust.phone}</div>
                            ) : (
                              <span className="text-neutral-500 italic">Sin teléfono</span>
                            )}
                            {cust.email && (
                              <div className="text-[10px] text-neutral-500">{cust.email}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-black text-sm text-violet-400 font-urban">
                              {(cust.pointsBalance || 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-neutral-400 block">PTS</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {freeRefills > 0 ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-black text-xs inline-flex items-center gap-1">
                                <Gift className="w-3 h-3" />
                                {freeRefills} {freeRefills === 1 ? 'Llenada' : 'Llenadas'}
                              </span>
                            ) : (
                              <span className="text-neutral-500 text-[11px]">
                                Faltan {1000 - (cust.pointsBalance || 0)} pts
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustingCustomer({
                                  id: cust.id,
                                  name: cust.name,
                                  pointsBalance: cust.pointsBalance || 0,
                                });
                                setAdjustDelta(100);
                                setAdjustReason('');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600 text-violet-300 hover:text-white border border-violet-500/40 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Ajustar Puntos</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 3: LIBRO MAYOR DE AUDITORÍA (AUDIT LEDGER)                 */}
      {/* =================================================================== */}
      {subTab === 'auditoria' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-3 rounded-2xl">
            {/* Type selector */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-neutral-400 shrink-0" />
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value as any)}
                className="bg-neutral-950 border border-neutral-800 rounded-xl py-1.5 px-3 text-xs text-white focus:outline-none focus:border-violet-500"
              >
                <option value="todos">Todos los movimientos</option>
                <option value="pedido_entregado">Puntos ganados por pedido</option>
                <option value="canje_liquido">Canjes aprobados (-1,000 pts)</option>
                <option value="devolucion_canje">Reembolsos de canje (+ pts)</option>
                <option value="ajuste_manual_admin">Ajustes manuales de admin</option>
                <option value="reset_puntos">Reseteos de saldo</option>
              </select>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Buscar por ID de pedido, cliente o motivo..."
                className="bg-neutral-950 border border-neutral-800 rounded-xl py-1.5 px-3 text-xs text-white placeholder-neutral-500 w-full focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-neutral-950 text-neutral-400 uppercase font-mono text-[10px] tracking-wider border-b border-neutral-800">
                  <tr>
                    <th className="py-3 px-4">Fecha & Hora (RD)</th>
                    <th className="py-3 px-4">Tipo Movimiento</th>
                    <th className="py-3 px-4">Cliente / ID</th>
                    <th className="py-3 px-4">Motivo / Pedido</th>
                    <th className="py-3 px-4 text-right">Puntos (+ / -)</th>
                    <th className="py-3 px-4 text-right">Saldo Posterior</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No hay movimientos registrados con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx) => {
                      const isPositive = tx.points > 0;
                      return (
                        <tr key={tx.id} className="hover:bg-neutral-800/30 transition-colors">
                          <td className="py-3 px-4 text-neutral-400 font-mono text-[11px] whitespace-nowrap">
                            {formatSantoDomingoDate(tx.createdAt)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                                tx.transactionType === 'pedido_entregado' ||
                                tx.transactionType === 'ganado_pedido' ||
                                tx.transactionType === 'acumulacion_pedido'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : tx.transactionType === 'canje_liquido' ||
                                    tx.transactionType === 'canje_aprobado'
                                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                  : tx.transactionType === 'devolucion_canje'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {isPositive ? (
                                <ArrowUpRight className="w-3 h-3" />
                              ) : (
                                <ArrowDownLeft className="w-3 h-3" />
                              )}
                              <span>
                                {tx.transactionType === 'pedido_entregado' ||
                                tx.transactionType === 'ganado_pedido' ||
                                tx.transactionType === 'acumulacion_pedido'
                                  ? 'Acumulación Pedido'
                                  : tx.transactionType === 'canje_liquido' ||
                                    tx.transactionType === 'canje_aprobado'
                                  ? 'Canje Aprobado'
                                  : tx.transactionType === 'devolucion_canje'
                                  ? 'Reembolso'
                                  : 'Ajuste Admin'}
                              </span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-neutral-300">
                            {tx.userId.slice(0, 10)}...
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate text-neutral-300">
                            <span>{tx.reason || 'Sin descripción'}</span>
                            {tx.orderId && (
                              <span className="text-[10px] text-violet-400 font-mono block">
                                Ref: #{tx.orderId}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-black font-urban text-sm whitespace-nowrap">
                            <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                              {isPositive ? `+${tx.points}` : `${tx.points}`} PTS
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-neutral-400 whitespace-nowrap">
                            {tx.balanceAfter} pts
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUB-TAB 4: RIFAS & SORTEOS (RULETA Y BOLETOS)                       */}
      {/* =================================================================== */}
      {subTab === 'rifas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-white font-urban">
                Sorteos y Rifas para Compradores
              </h3>
              <p className="text-xs text-neutral-400">
                Crea rifas exclusivas con asignación equitativa (1 boleto por usuario) o proporcional a sus puntos.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsCreatingRaffle(true)}
              className="py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black transition-all shadow-lg shadow-violet-600/30 flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Rifa</span>
            </button>
          </div>

          {raffles.length === 0 ? (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-10 text-center space-y-3">
              <Trophy className="w-12 h-12 text-neutral-600 mx-auto" />
              <h4 className="text-base font-bold text-white">No hay rifas configuradas</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Toca "Nueva Rifa" para sortear pods, tanques o líquidos entre tus compradores más fieles.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {raffles.map((raffle) => {
                const isActive = raffle.status === 'activa';
                const isFinished = raffle.status === 'finalizada';

                return (
                  <div
                    key={raffle.id}
                    className={`bg-neutral-900 border rounded-2xl p-5 shadow-xl space-y-4 ${
                      isActive ? 'border-violet-500/40 bg-gradient-to-br from-neutral-900 to-violet-950/20' : 'border-neutral-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {isActive ? '● Rifa Activa' : '✓ Sorteo Finalizado'}
                        </span>
                        <h4 className="text-base font-black text-white mt-1.5">{raffle.title}</h4>
                      </div>

                      <span className="text-[11px] font-bold text-neutral-400 bg-neutral-950 border border-neutral-800 px-2 py-1 rounded-xl">
                        {raffle.drawType === 'igualitaria' ? '1 Boleto / Usuario' : '1 Boleto / Punto'}
                      </span>
                    </div>

                    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Premio a entregar:</span>
                        <strong className="text-amber-400 font-bold">{raffle.prizeText}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Participantes:</span>
                        <strong className="text-white">{raffle.totalParticipants} usuarios</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Boletos emitidos:</span>
                        <strong className="text-cyan-400 font-mono">{raffle.totalTickets.toLocaleString()} boletos</strong>
                      </div>

                      {isFinished && (
                        <div className="pt-2 border-t border-neutral-800 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/30">
                          <span className="text-emerald-400 font-black text-[11px] uppercase tracking-wider block">
                            🏆 Ganador Oficial:
                          </span>
                          <div className="text-sm font-black text-white mt-0.5">{raffle.winnerName}</div>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            Boleto premiado: #{raffle.winnerTicketNumber} • Sorteado:{' '}
                            {raffle.drawnAt ? formatSantoDomingoDate(raffle.drawnAt) : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {isActive && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await syncRaffleParticipants(raffle.id);
                            if (res.success) {
                              setNotice({
                                text: `Participantes actualizados: ${res.totalParticipants} clientes con ${res.totalTickets} boletos.`,
                                type: 'success',
                              });
                              loadAllData(true);
                            }
                          }}
                          className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Recalcular Boletos</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDrawModal(raffle)}
                          className="flex-1 py-2 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black text-xs transition-all shadow-lg shadow-violet-600/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        >
                          <Dices className="w-4 h-4" />
                          <span>Abrir Ruleta & Sortear</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: RECHAZAR CANJE                                             */}
      {/* =================================================================== */}
      {rejectingRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-base font-black text-white font-urban">Rechazar Solicitud de Canje</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingRedemption(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-300">
              Al rechazar el canje de <strong>{rejectingRedemption.productName}</strong> para{' '}
              <strong>{rejectingRedemption.userName || 'el cliente'}</strong>, los{' '}
              <strong className="text-violet-400">{rejectingRedemption.pointsCost} puntos</strong> serán
              reembolsados de inmediato a su saldo.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Motivo obligatorio del rechazo *
                </label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ej: Líquido temporalmente agotado, favor elegir otra opción o contactar por WhatsApp."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingRedemption(null)}
                  disabled={isRejecting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRejecting || rejectionReason.trim().length < 4}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-black text-white transition-all shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  {isRejecting ? 'Procesando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: AJUSTE MANUAL DE PUNTOS                                    */}
      {/* =================================================================== */}
      {adjustingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-violet-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-base font-black text-white font-urban">Ajuste Manual de Puntos</h3>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingCustomer(null)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-neutral-950 border border-neutral-800 text-xs space-y-1">
              <div className="text-neutral-400">Cliente: <strong className="text-white">{adjustingCustomer.name}</strong></div>
              <div className="text-neutral-400">Saldo actual: <strong className="text-violet-400">{adjustingCustomer.pointsBalance} pts</strong></div>
            </div>

            <form onSubmit={handleConfirmAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Cantidad a ajustar (Positivo para sumar, Negativo para restar) *
                </label>
                <input
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(Number(e.target.value))}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                />

                {/* Quick Presets */}
                <div className="flex items-center gap-2 mt-2">
                  {[
                    { label: '+100', val: 100 },
                    { label: '+500', val: 500 },
                    { label: '+1000', val: 1000 },
                    { label: '-100', val: -100 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setAdjustDelta(p.val)}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-bold text-neutral-300 transition-all cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Preview */}
              <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs flex items-center justify-between">
                <span className="text-neutral-400">Nuevo Saldo Resultante:</span>
                <span
                  className={`font-black text-sm ${
                    adjustingCustomer.pointsBalance + adjustDelta < 0
                      ? 'text-red-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {adjustingCustomer.pointsBalance + adjustDelta} PTS
                </span>
              </div>
              {adjustingCustomer.pointsBalance + adjustDelta < 0 && (
                <div className="text-[11px] text-red-400 font-semibold">
                  ⚠️ Error: El saldo de un cliente no puede quedar en negativo.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Motivo obligatorio del ajuste (Auditoría) *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: Bonificación por fidelidad o cortesía especial"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingCustomer(null)}
                  disabled={isAdjusting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isAdjusting ||
                    adjustDelta === 0 ||
                    adjustingCustomer.pointsBalance + adjustDelta < 0 ||
                    adjustReason.trim().length < 4
                  }
                  className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-black text-white transition-all shadow-lg shadow-violet-600/30 cursor-pointer"
                >
                  {isAdjusting ? 'Guardando...' : 'Aplicar Ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: CREAR NUEVA RIFA                                           */}
      {/* =================================================================== */}
      {isCreatingRaffle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-violet-400">
                <Trophy className="w-5 h-5" />
                <h3 className="text-base font-black text-white font-urban">Nueva Rifa para Clientes</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatingRaffle(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRaffleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Título del Sorteo *
                </label>
                <input
                  type="text"
                  required
                  value={raffleTitle}
                  onChange={(e) => setRaffleTitle(e.target.value)}
                  placeholder="Ej: Sorteo Mensual de Pod Mod & Líquidos"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Premio a Sortear *
                </label>
                <input
                  type="text"
                  required
                  value={rafflePrize}
                  onChange={(e) => setRafflePrize(e.target.value)}
                  placeholder="Ej: Kit Pod Mod Vaporesso XROS + 2 Llenadas de Líquido Gratis"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Modalidad de Boletos *
                </label>
                <select
                  value={raffleDrawType}
                  onChange={(e) => setRaffleDrawType(e.target.value as RaffleDrawType)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="ponderada">Ponderada (1 punto = 1 boleto; más compras = más chances)</option>
                  <option value="igualitaria">Equitativa (1 boleto por cliente con puntos)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Descripción adicional (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={raffleDesc}
                  onChange={(e) => setRaffleDesc(e.target.value)}
                  placeholder="Instrucciones, bases o condiciones para retirar el premio en Santo Domingo..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingRaffle(false)}
                  disabled={isSubmittingRaffle}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRaffle}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-black text-white transition-all shadow-lg shadow-violet-600/30 cursor-pointer"
                >
                  {isSubmittingRaffle ? 'Creando...' : 'Publicar Rifa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: RULETA & EJECUCIÓN DEL SORTEO                              */}
      {/* =================================================================== */}
      {activeDrawRaffle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg bg-neutral-900 border-2 border-violet-500/50 rounded-3xl p-6 shadow-2xl space-y-5 text-center">
            <button
              type="button"
              onClick={() => setActiveDrawRaffle(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-violet-400 uppercase tracking-widest">
                Sorteo en Vivo • BLACK VAPE
              </span>
              <h3 className="text-xl font-black text-white font-urban">
                {activeDrawRaffle.title}
              </h3>
              <p className="text-xs text-amber-400 font-bold">
                Premio: {activeDrawRaffle.prizeText}
              </p>
            </div>

            {/* Visual Roulette Wheel */}
            <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
              <div
                className="w-full h-full rounded-full border-4 border-violet-500 bg-neutral-950 flex items-center justify-center shadow-2xl transition-transform duration-3000 ease-out"
                style={{
                  transform: `rotate(${wheelRotation}deg)`,
                  background: 'conic-gradient(from 0deg, #7c3aed, #06b6d4, #10b981, #f59e0b, #ef4444, #7c3aed)',
                }}
              >
                <div className="w-36 h-36 rounded-full bg-neutral-900 border-2 border-neutral-800 flex flex-col items-center justify-center p-2">
                  <Dices className={`w-10 h-10 text-white ${isDrawing ? 'animate-bounce' : ''}`} />
                  <span className="text-[10px] text-neutral-400 uppercase font-black mt-1">
                    {isDrawing ? 'Sorteando...' : 'Ruleta'}
                  </span>
                </div>
              </div>
              {/* Pointer */}
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-6 bg-amber-400 [clip-path:polygon(50%_100%,0_0,100%_0)] shadow-lg" />
            </div>

            {/* Participants Summary */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-950 p-3 rounded-2xl border border-neutral-800">
              <div>
                <span className="text-neutral-400 block text-[10px]">Participantes</span>
                <strong className="text-white text-sm">{activeDrawRaffle.totalParticipants}</strong>
              </div>
              <div>
                <span className="text-neutral-400 block text-[10px]">Total Boletos</span>
                <strong className="text-cyan-400 text-sm font-mono">
                  {activeDrawRaffle.totalTickets.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Participants and Ticket Intervals List */}
            {drawParticipants.length > 0 && (
              <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-2xl p-3 text-left max-h-36 overflow-y-auto space-y-1.5 scrollbar-thin">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">
                  Distribución de Boletos (Transparente):
                </span>
                {drawParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-neutral-900/60 last:border-none"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-white block truncate">{p.userName}</span>
                      <span className="text-[10px] text-neutral-400">
                        {p.userPointsBalance} pts • {p.ticketCount} {p.ticketCount === 1 ? 'boleto' : 'boletos'}
                      </span>
                    </div>
                    <span className="font-mono text-cyan-400 font-bold text-[11px] shrink-0 bg-cyan-950/50 px-2 py-0.5 rounded-lg border border-cyan-800/40">
                      #{p.ticketStart} al #{p.ticketEnd}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Winner Announcement Card */}
            {drawnWinner && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-emerald-900/60 to-emerald-950/80 border-2 border-emerald-500 shadow-2xl space-y-1 animate-scale-up">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 block">
                  🎉 ¡TENEMOS UN GANADOR! 🎉
                </span>
                <h2 className="text-xl font-black text-white font-urban">
                  {drawnWinner.name}
                </h2>
                <span className="text-xs text-emerald-300 font-mono block">
                  Boleto Ganador: #{drawnWinner.ticket} de {drawnWinner.totalTickets}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveDrawRaffle(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-all cursor-pointer"
              >
                Cerrar
              </button>

              {activeDrawRaffle.status === 'activa' && !drawnWinner && (
                <button
                  type="button"
                  onClick={handleTriggerDraw}
                  disabled={isDrawing || activeDrawRaffle.totalTickets <= 0}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-black text-white transition-all shadow-lg shadow-violet-600/30 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Dices className="w-4 h-4" />
                  <span>{isDrawing ? 'Girando ruleta...' : 'Girar y Sacar Ganador'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
