import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share, PlusSquare, X, WifiOff, CheckCircle2 } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        title="Instalar App BLACK VAPE en tu celular o PC"
        className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-600/30 hover:from-cyan-500/30 hover:to-purple-600/50 border border-cyan-400/50 hover:border-cyan-300 text-[11px] font-black text-cyan-200 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
        <span className="hidden md:inline">Instalar App</span>
        <span className="inline md:hidden">App</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#0f0a1c] border-2 border-purple-500/50 p-6 shadow-2xl text-neutral-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-purple-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-tag uppercase tracking-wider text-cyan-400 block">
                    MODO APLICACIÓN MÓVIL
                  </span>
                  <h3 className="text-base font-black text-white font-urban">
                    Instalar BLACK VAPE
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-neutral-300">
                <p className="text-neutral-200 font-semibold">
                  Instala la tienda en tu iPhone o iPad en 2 pasos rápidos:
                </p>
                <div className="p-3 rounded-2xl bg-neutral-950 border border-purple-900/50 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      Toca el botón <strong>Compartir</strong>{' '}
                      <Share className="w-3.5 h-3.5 text-cyan-400 inline" /> en la barra de Safari.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      Desliza hacia abajo y selecciona{' '}
                      <strong>Agregar a pantalla de inicio</strong>{' '}
                      <PlusSquare className="w-3.5 h-3.5 text-purple-400 inline" />.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-neutral-300">
                <p className="text-neutral-200 font-semibold">
                  Agrega BLACK VAPE a tu pantalla de inicio para entrar en 1 toque como app nativa:
                </p>
                <div className="p-3 rounded-2xl bg-neutral-950 border border-purple-900/50 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>
                      Abre el menú de tu navegador (los <strong>3 puntos ⋮</strong> arriba a la derecha en Chrome o el icono de instalar en la barra de direcciones).
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>
                      Toca en <strong>&ldquo;Instalar aplicación&rdquo;</strong> o{' '}
                      <strong>&ldquo;Agregar a la pantalla principal&rdquo;</strong>.
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500/95 border border-amber-300 px-3.5 py-2 text-xs font-black text-neutral-950 shadow-xl">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Modo sin internet — Usando catálogo y pedidos guardados en memoria</span>
    </div>
  );
};
