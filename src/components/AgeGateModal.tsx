import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Flame, Wind } from 'lucide-react';
import { setStoredAgeVerified, playNotificationSound } from '../utils/storage';
import vapeSmokeAtmosphereImg from '../assets/images/vape_smoke_atmosphere_1793233367830.jpg';

interface AgeGateModalProps {
  onVerified: () => void;
}

export const AgeGateModal: React.FC<AgeGateModalProps> = ({ onVerified }) => {
  const [denied, setDenied] = useState(false);

  const handleConfirm = () => {
    playNotificationSound('vape-hit');
    setStoredAgeVerified(true);
    onVerified();
  };

  const handleDeny = () => {
    setDenied(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-35 pointer-events-none"
        style={{ backgroundImage: `url(${vapeSmokeAtmosphereImg})` }}
      />
      {/* Atmospheric ambient radiant lighting with zero hard edges */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative w-full max-w-lg bg-[#0d0917]/95 border-2 border-purple-500/50 hover:border-cyan-400/60 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-purple-950 text-center text-neutral-100 overflow-hidden transition-all backdrop-blur-2xl">
        {/* Glow accents */}
        <div className="absolute -top-16 -left-16 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-cyan-500/25 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Logo with double neon ring */}
          <div className="mx-auto w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-purple-600 via-cyan-400 to-purple-500 shadow-xl shadow-purple-600/50 mb-4 animate-neon-sign">
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

          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="font-tag text-xs tracking-wider px-3 py-1 bg-purple-950/80 border border-purple-500/50 text-purple-300 rounded-full flex items-center gap-1.5 shadow">
              <Wind className="w-3.5 h-3.5 text-cyan-400" />
              TEMPLO DEL HUMO • SOLO +18
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white font-urban tracking-tight mb-2 uppercase">
            BLACK VAPE <span className="text-purple-400 font-tag text-xl sm:text-2xl lowercase">delivery</span>
          </h2>

          <p className="text-xs sm:text-sm text-neutral-300 mb-6 leading-relaxed max-w-sm mx-auto">
            Venta y recarga de tanques de líquidos a domicilio en Loma de Cabrera exclusivo para mayores de edad. ¿Confirmas tener al menos <strong className="text-cyan-400">18 años</strong> para entrar al catálogo?
          </p>

          {denied ? (
            <div className="p-4 bg-red-950/70 border border-red-800 rounded-2xl text-red-200 text-xs sm:text-sm flex items-start gap-3 text-left">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Acceso Restringido</strong>
                Por regulaciones sanitarias y de protección de menores, debes tener al menos 18 años para comprar o navegar en este portal.
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3.5 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-purple-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer font-urban tracking-wide"
              >
                <CheckCircle2 className="w-4 h-4 text-cyan-300" />
                Soy Mayor de 18 Años
              </button>
              <button
                type="button"
                onClick={handleDeny}
                className="py-3.5 px-5 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white font-medium text-xs sm:text-sm rounded-2xl border border-neutral-800 transition-all cursor-pointer font-urban"
              >
                Soy Menor de Edad
              </button>
            </div>
          )}

          <p className="text-[10px] text-neutral-500 mt-5 font-medium">
            El repartidor podrá solicitar documento de identidad oficial al entregar y llenar el tanque de tu vape.
          </p>
        </div>
      </div>
    </div>
  );
};
