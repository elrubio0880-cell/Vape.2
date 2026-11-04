import React, { useState } from 'react';
import { Order, OrderItem, UserAccount } from '../../types';
import { getStoredClientContact, playNotificationSound } from '../../utils/storage';
import { Clock, RotateCcw, Calendar, CheckCircle2, ShoppingBag, MapPin, Bike, Filter, User, XCircle } from 'lucide-react';

interface OrderHistorySectionProps {
  orders: Order[];
  onRepeatOrder: (items: OrderItem[]) => void;
  onGoToShop: () => void;
  currentUser?: UserAccount | null;
  onTrackOrder?: (orderId: string) => void;
  onUpdateOrderStatus?: (orderId: string, newStatus: Order['status'], note?: string) => void;
}

export const OrderHistorySection: React.FC<OrderHistorySectionProps> = ({
  orders,
  onRepeatOrder,
  onGoToShop,
  currentUser,
  onTrackOrder,
  onUpdateOrderStatus,
}) => {
  const isStaff = currentUser?.role === 'admin' || currentUser?.role === 'delivery';
  const [filterMineOnly, setFilterMineOnly] = useState<boolean>(!isStaff);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const savedContact = getStoredClientContact();
  const activeClientOrderId =
    typeof window !== 'undefined' ? localStorage.getItem('vape_active_client_order_id_v1') : null;

  const displayedOrders = orders.filter((order) => {
    // Admin and Delivery see all orders unless they explicitly toggle a filter
    if (isStaff && !filterMineOnly) {
      return true;
    }

    // For buyers or guests, match strictly by their active order ID, customerId, phone, or saved device contact
    if (activeClientOrderId && order.id === activeClientOrderId) return true;
    if (currentUser?.id && order.customerId && order.customerId === currentUser.id) return true;

    const orderDigits = (order.customerPhone || '').replace(/\D/g, '').slice(-10);
    const userDigits = (currentUser?.phone || '').replace(/\D/g, '').slice(-10);
    const savedDigits = (savedContact.phone || '').replace(/\D/g, '').slice(-10);

    if (orderDigits.length === 10 && (orderDigits === userDigits || orderDigits === savedDigits)) {
      return true;
    }
    if (
      order.customerName &&
      ((currentUser?.name && order.customerName.toLowerCase() === currentUser.name.toLowerCase()) ||
        (savedContact.name && order.customerName.toLowerCase() === savedContact.name.toLowerCase()))
    ) {
      return true;
    }
    return false;
  });

  return (
    <div className="space-y-6">
      <div className="bg-[#0e091a] border border-purple-900/40 rounded-3xl p-5 shadow-2xl shadow-purple-950/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-purple-900/30">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>{isStaff ? 'Registro General de Pedidos' : 'Tus Compras & Entregas'}</span>
            </div>
            <h2 className="text-xl font-black text-white font-urban">
              {isStaff ? 'Historial General de Pedidos' : 'Mis Pedidos Realizados'}
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              {isStaff
                ? 'Monitorea todos los pedidos recibidos en el sistema y su estado de entrega.'
                : 'Consulta tus pedidos de líquidos, repite compras con un solo clic y rastrea en vivo en el mapa.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onGoToShop}
              className="py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-purple-900/40"
            >
              <ShoppingBag className="w-4 h-4 text-cyan-300" />
              <span>Ir a la Tienda</span>
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {displayedOrders.length === 0 ? (
            <div className="text-center py-16 text-neutral-400 text-sm">
              <div className="w-14 h-14 rounded-full bg-purple-900/20 border border-purple-700/30 flex items-center justify-center text-2xl mx-auto mb-3">
                📦
              </div>
              <p className="font-bold text-white">No hay pedidos registrados para mostrar.</p>
              <p className="text-xs text-neutral-500 mt-1">
                {currentUser && filterMineOnly
                  ? 'No tienes pedidos asociados a tu número o cuenta aún.'
                  : 'Aún no se han registrado pedidos en el sistema.'}
              </p>
              {currentUser && filterMineOnly && orders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMineOnly(false)}
                  className="mt-2 text-xs text-cyan-400 hover:underline cursor-pointer"
                >
                  Ver todos los pedidos del sistema ({orders.length})
                </button>
              )}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onGoToShop}
                  className="py-2.5 px-5 bg-gradient-to-r from-purple-600 to-cyan-500 text-white rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-lg shadow-purple-900/40"
                >
                  <span>Pedir Recarga de Vape</span>
                  <span>🛵</span>
                </button>
              </div>
            </div>
          ) : (
            displayedOrders.map((order) => {
              const isActive =
                order.status !== 'entregado' && order.status !== 'cancelado';
              const cancelEntry =
                order.status === 'cancelado'
                  ? [...(order.statusHistory || [])].reverse().find((h) => h.status === 'cancelado' && h.note)
                  : undefined;
              const canRejectOrCancel =
                isActive &&
                onUpdateOrderStatus &&
                (isStaff ||
                  order.status === 'pendiente_cotizacion' ||
                  order.status === 'tarifa_propuesta' ||
                  order.status === 'aprobado_en_preparacion');

              return (
                <div
                  key={order.id}
                  className={`p-5 rounded-2xl bg-[#090611] border transition-all space-y-3 ${
                    isActive
                      ? 'border-cyan-500/50 shadow-lg shadow-cyan-950/30'
                      : 'border-purple-900/30 hover:border-purple-800/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-black text-white font-urban">Pedido #{order.id}</span>
                      <span className="text-xs text-neutral-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        {new Date(order.createdAt).toLocaleDateString()} a las{' '}
                        {new Date(order.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {order.customerName && (
                        <span className="text-xs text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-lg border border-purple-800/40">
                          {order.customerName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full inline-block ${
                          order.status === 'entregado'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : order.status === 'cancelado'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 animate-pulse'
                        }`}
                      >
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Rejection / Cancellation Reason Banner */}
                  {order.status === 'cancelado' && cancelEntry?.note && (
                    <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>
                        <strong>Motivo:</strong> {cancelEntry.note}
                      </span>
                    </div>
                  )}

                  {/* Items */}
                  <div className="space-y-1.5 divide-y divide-purple-950/50 text-xs">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center pt-1.5 first:pt-0">
                        <span className="text-neutral-300">
                          <strong className="text-cyan-400 font-bold">{it.quantity}x</strong> {it.productName}{' '}
                          <span className="text-neutral-500 text-[11px]">
                            ({it.portion === 'tanque_lleno' ? 'Tanque Lleno' : 'Mitad'})
                          </span>
                        </span>
                        <span className="font-bold text-white font-urban">
                          ${it.unitPrice * it.quantity} DOP
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-purple-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-neutral-400">Total: </span>
                      <strong className="text-sm text-cyan-400 font-urban">${order.totalAmount} DOP</strong>
                      <span className="text-[11px] text-neutral-500 ml-1.5">
                        (Envío: ${order.deliveryFee} DOP)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {isActive && onTrackOrder && (
                        <button
                          type="button"
                          onClick={() => onTrackOrder(order.id)}
                          className="py-2 px-3.5 bg-gradient-to-r from-cyan-500 to-teal-500 text-black rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-950 active:scale-95"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Rastrear en Vivo 🛵</span>
                        </button>
                      )}

                      {canRejectOrCancel && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmingCancelId !== order.id) {
                              setConfirmingCancelId(order.id);
                              setTimeout(() => {
                                setConfirmingCancelId((prev) => (prev === order.id ? null : prev));
                              }, 6000);
                              return;
                            }
                            setConfirmingCancelId(null);
                            onUpdateOrderStatus(
                              order.id,
                              'cancelado',
                              isStaff
                                ? `Rechazado por ${currentUser?.role === 'admin' ? 'Admin' : 'Repartidor'}`
                                : 'Cancelado por el cliente desde su historial'
                            );
                            playNotificationSound('alert');
                          }}
                          className={`py-2 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border active:scale-95 ${
                            confirmingCancelId === order.id
                              ? 'bg-red-600 text-white border-red-400 animate-pulse'
                              : 'bg-red-950/40 hover:bg-red-900/70 text-red-300 hover:text-white border-red-500/40'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>
                            {confirmingCancelId === order.id
                              ? '¿Confirmar Rechazo? (Toca de nuevo)'
                              : isStaff
                              ? 'Rechazar Pedido'
                              : 'Cancelar Pedido'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRepeatOrder(order.items)}
                        className="py-2 px-3.5 bg-purple-950/60 hover:bg-purple-900 border border-purple-700/50 text-purple-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Repetir pedido</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
