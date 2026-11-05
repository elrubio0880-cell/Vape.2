import React from 'react';
import { OrderItem, PortionType } from '../../types';
import { ShoppingBag, X, Plus, Minus, Trash2, ArrowRight, Wind, Droplet } from 'lucide-react';

interface CartDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: OrderItem[];
  onUpdateQuantity: (productId: string, portion: PortionType, delta: number, variantId?: string) => void;
  onClearCart: () => void;
  onProceedToCheckout: () => void;
}

export const CartDrawerModal: React.FC<CartDrawerModalProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onClearCart,
  onProceedToCheckout,
}) => {
  if (!isOpen) return null;

  const totalAmount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const totalCount = items.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0d0918] border-l-2 border-purple-500/50 h-full flex flex-col shadow-2xl shadow-purple-950 text-neutral-100 animate-in slide-in-from-right duration-300 font-urban">
        {/* Header */}
        <div className="p-5 border-b border-purple-900/40 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-600/30">
              <ShoppingBag className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="font-black text-lg text-white font-urban">Tu Canasta Black Vape</h3>
              <p className="text-xs text-purple-300 font-tag">
                {totalCount} {totalCount === 1 ? 'producto seleccionado' : 'productos seleccionados'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 text-neutral-400 hover:text-white transition-colors cursor-pointer border border-purple-800/40"
            aria-label="Cerrar canasta"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Service disclaimer note */}
          {items.length > 0 && (
            <div className="p-3.5 bg-gradient-to-r from-purple-950/60 to-cyan-950/60 border border-purple-500/40 rounded-2xl text-xs text-purple-200 leading-relaxed shadow">
              <span className="font-tag text-cyan-300 block mb-0.5">ENTREGA & RECARGA EN SITIO:</span>
              El repartidor te lleva tus equipos Vape nuevos y dispensa las porciones de líquido directamente en tu tanque al momento.
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-20 text-neutral-500 text-sm space-y-3">
              <Wind className="w-12 h-12 mx-auto stroke-purple-600/50 animate-pulse" />
              <p className="text-purple-300 font-tag text-base">Tu canasta está vacía</p>
              <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                Selecciona tus líquidos de recarga o equipos Vape en la tienda.
              </p>
            </div>
          ) : (
            items.map((it) => {
              const isVape = it.productType === 'vape';
              return (
                <div
                  key={`${it.productId}-${it.portion}-${it.variantId || 'std'}`}
                  className="p-3.5 rounded-2xl bg-black/60 border border-purple-900/50 hover:border-cyan-400/50 transition-colors flex items-center justify-between gap-3 shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {it.variantImage && (
                      <img
                        src={it.variantImage}
                        alt={it.productName}
                        className="w-11 h-11 rounded-xl object-contain bg-black border border-cyan-500/40 p-1 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <h4 className="font-black text-sm text-white font-urban truncate">
                        {it.productName}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span
                          className={`text-[10px] font-tag uppercase px-2 py-0.5 rounded-md ${
                            isVape
                              ? 'bg-cyan-950/90 text-cyan-300 border border-cyan-400/50'
                              : it.portion === 'tanque_lleno'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                              : 'bg-cyan-950/80 text-cyan-400 border border-cyan-500/40'
                          }`}
                        >
                          {isVape
                            ? `💨 Equipo Vape${it.variantColor ? ` • Color: ${it.variantColor}` : ''}`
                            : it.portion === 'tanque_lleno'
                            ? '💧 Tanque Lleno'
                            : '💧 Mitad Tanque'}
                        </span>
                        <span className="text-xs font-black text-white font-urban">
                          ${it.unitPrice} DOP c/u
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quantity steppers */}
                  <div className="flex items-center gap-2 bg-[#140e24] border border-purple-800/60 rounded-xl p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(it.productId, it.portion, -1, it.variantId)}
                      className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer font-black text-xs"
                      aria-label="Restar uno"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span
                      className={`text-xs font-black px-1 font-urban ${
                        isVape
                          ? 'text-cyan-300'
                          : it.portion === 'tanque_lleno'
                          ? 'text-emerald-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      {it.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(it.productId, it.portion, 1, it.variantId)}
                      className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer font-black text-xs"
                      aria-label="Sumar uno"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with summary and action */}
        {items.length > 0 && (
          <div className="p-5 border-t border-purple-900/40 bg-black/60 space-y-4">
            <div className="space-y-1.5 text-xs text-neutral-300">
              <div className="flex justify-between items-center">
                <span className="font-medium text-neutral-400">Subtotal Productos:</span>
                <span className="font-black text-white text-base font-urban">${totalAmount} DOP</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-cyan-300 font-tag pt-1 border-t border-purple-900/40">
                <span>Tarifa Delivery en Vivo:</span>
                <span className="font-bold text-emerald-400">Cada 1.5 km = $25 DOP</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-amber-300 pt-1 border-t border-purple-900/40 font-urban">
                <span className="flex items-center gap-1">
                  <span>🎁</span>
                  <span>Puntos a acumular:</span>
                </span>
                <span className="font-black text-amber-300">+{Math.floor(totalAmount)} pts</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClearCart}
                className="p-3.5 bg-neutral-900 hover:bg-red-950 text-neutral-400 hover:text-red-300 rounded-2xl text-xs transition-colors cursor-pointer border border-neutral-800"
                title="Vaciar canasta"
                aria-label="Vaciar canasta"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onProceedToCheckout();
                }}
                className="flex-1 py-3.5 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-600/40 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer font-urban tracking-wide"
              >
                <span>Fijar Mapa & Solicitar</span>
                <ArrowRight className="w-4 h-4 text-cyan-200" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
