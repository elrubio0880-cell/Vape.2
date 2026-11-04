import React, { useState, useEffect } from 'react';
import { AppSection, StoreConfig, UserAccount } from '../types';
import { requestPushPermission } from '../utils/notifications';
import { PWAInstallButton, OfflineIndicator } from './PWAInstallButton';
import {
  Flame,
  ShoppingBag,
  MapPin,
  Clock,
  Shield,
  User,
  LogOut,
  LogIn,
  Bike,
  Bell,
  Wind,
  Sparkles,
  Gift,
} from 'lucide-react';

interface NavigationProps {
  currentSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  currentUser: UserAccount | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  store: StoreConfig;
  activeOrdersCount: number;
  onOpenPoints?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentSection,
  onSectionChange,
  currentUser,
  onOpenAuth,
  onLogout,
  store,
  activeOrdersCount,
  onOpenPoints,
}) => {
  const [hasPushPermission, setHasPushPermission] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasPushPermission(Notification.permission === 'granted');
    }
  }, []);

  const handleEnablePush = async () => {
    const granted = await requestPushPermission();
    setHasPushPermission(granted);
  };

  return (
    <>
      <OfflineIndicator />

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0a0712]/95 backdrop-blur-xl border-b border-purple-900/30 shadow-2xl shadow-purple-950/40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          {/* Brand with Street Graffiti Flair */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="relative group cursor-pointer shrink-0" onClick={() => onSectionChange('tienda')}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full p-0.5 bg-gradient-to-tr from-purple-600 via-cyan-400 to-purple-500 shadow-md shadow-purple-500/40 shrink-0">
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
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 flex items-center justify-center text-[9px] font-black text-black ring-2 ring-[#0a0712]">
                💨
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-black text-base sm:text-xl text-white font-urban tracking-wider text-glow-purple whitespace-nowrap">
                  BLACK VAPE
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-tag px-1.5 sm:px-2 py-0.5 rounded-md bg-purple-900/40 border border-purple-500/50 text-purple-300 shrink-0">
                  <span className="inline sm:hidden">RD</span>
                  <span className="hidden sm:inline">VAPE SHOP</span>
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-neutral-400 truncate max-w-[140px] sm:max-w-none flex items-center gap-1 font-medium">
                <span className="text-cyan-400 shrink-0">📍</span>
                <span className="truncate">{store.addressText}</span>
              </p>
            </div>
          </div>

          {/* User profile / Login button / PWA Install / Push button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />

            {!hasPushPermission && (
              <button
                type="button"
                onClick={handleEnablePush}
                title="Activar notificaciones de entrega"
                className="hidden md:flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-purple-950/40 border border-purple-800/60 hover:border-purple-600 text-[11px] font-bold text-purple-200 transition-all cursor-pointer shadow-sm"
              >
                <Bell className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                <span>Activar Avisos</span>
              </button>
            )}

            {currentUser && currentUser.role === 'comprador' && onOpenPoints && (
              <button
                type="button"
                onClick={onOpenPoints}
                title="Ver tus puntos y canjear llenadas gratis"
                className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-900/80 to-purple-950 border border-purple-500/60 hover:border-cyan-400 text-xs font-black text-white transition-all shadow-md shadow-purple-900/40 cursor-pointer active:scale-95 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span className="font-urban">{currentUser.pointsBalance ?? 0}</span>
                <span className="text-[10px] text-cyan-300 uppercase font-tag">PTS</span>
              </button>
            )}

            {currentUser ? (
              <div className="flex items-center gap-1 sm:gap-2 bg-[#140e24] border border-purple-800/50 rounded-2xl py-1 px-1.5 sm:px-3 shadow-inner shrink-0">
                <div className="flex items-center gap-1 sm:gap-1.5 text-xs">
                  {currentUser.role === 'admin' ? (
                    <span className="w-6 h-6 rounded-lg bg-violet-600/30 text-violet-300 flex items-center justify-center text-xs font-black border border-violet-500/40 shrink-0">
                      🛡️
                    </span>
                  ) : currentUser.role === 'delivery' ? (
                    <span className="w-6 h-6 rounded-lg bg-cyan-600/30 text-cyan-300 flex items-center justify-center text-xs font-black border border-cyan-500/40 shrink-0">
                      🛵
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-lg bg-purple-600/30 text-purple-300 flex items-center justify-center text-xs font-black border border-purple-500/40 shrink-0">
                      👤
                    </span>
                  )}
                  <div className="hidden sm:block text-left">
                    <span className="font-bold text-white block text-xs truncate max-w-[120px] font-urban">
                      {currentUser.name}
                    </span>
                    <span className="text-[9px] text-purple-300 uppercase font-tag tracking-wider">
                      {currentUser.role === 'admin'
                        ? 'ADMINISTRADOR'
                        : currentUser.role === 'delivery'
                        ? 'REPARTIDOR'
                        : 'COMPRADOR'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="text-[10px] sm:text-[11px] font-bold text-neutral-300 hover:text-cyan-300 px-1.5 sm:px-2 py-1 rounded-lg hover:bg-neutral-800/60 transition-colors cursor-pointer"
                  title="Cambiar cuenta"
                >
                  Cambiar
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1 sm:p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="py-1.5 px-3 sm:px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer font-urban"
              >
                <LogIn className="w-3.5 h-3.5 text-cyan-300" />
                <span>Entrar</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop Tabs Bar */}
        <nav className="hidden sm:flex max-w-7xl mx-auto px-4 pb-2.5 pt-1 items-center gap-2 overflow-x-auto scrollbar-none border-t border-purple-950/60">
          <button
            type="button"
            onClick={() => onSectionChange('tienda')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer font-urban ${
              currentSection === 'tienda'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/40 text-glow-purple border border-purple-400/50'
                : 'text-neutral-400 hover:text-white hover:bg-purple-950/30'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-cyan-300" />
            <span>Tienda de Líquidos</span>
          </button>

          <button
            type="button"
            onClick={() => onSectionChange('mapa')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap relative cursor-pointer font-urban ${
              currentSection === 'mapa'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 text-neutral-950 shadow-lg shadow-cyan-500/30 font-bold border border-cyan-300'
                : 'text-neutral-400 hover:text-white hover:bg-cyan-950/30'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>
              {currentUser?.role === 'delivery' ? 'Rutas & Despacho' : 'Mapa & Rastreo'}
            </span>
            {activeOrdersCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  currentSection === 'mapa'
                    ? 'bg-neutral-950 text-cyan-300'
                    : 'bg-gradient-to-r from-red-600 to-orange-500 text-white animate-pulse'
                }`}
              >
                {activeOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSectionChange('pedidos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer font-urban ${
              currentSection === 'pedidos'
                ? 'bg-neutral-800 text-white shadow border border-neutral-700'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
            }`}
          >
            <Clock className="w-4 h-4 text-purple-400" />
            <span>Historial de Pedidos</span>
          </button>

          {currentUser?.role === 'comprador' && onOpenPoints && (
            <button
              type="button"
              onClick={onOpenPoints}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer font-urban bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 border border-purple-800/60 hover:border-cyan-400 shadow-sm"
            >
              <Gift className="w-4 h-4 text-amber-300" />
              <span>Club de Puntos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-black">
                {currentUser.pointsBalance ?? 0} pts
              </span>
            </button>
          )}

          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onSectionChange('admin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer font-urban ${
                currentSection === 'admin'
                  ? 'bg-gradient-to-r from-purple-700 to-violet-800 text-white shadow-lg shadow-violet-700/40 border border-purple-400/60'
                  : 'text-purple-400 hover:text-white hover:bg-purple-950/40'
              }`}
            >
              <Shield className="w-4 h-4 text-cyan-300" />
              <span>Panel Administrador</span>
            </button>
          )}
        </nav>
      </header>

      {/* Mobile-Native Bottom Navigation Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0712]/95 backdrop-blur-2xl border-t border-purple-900/40 px-2 pt-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] flex items-center justify-around shadow-2xl">
        <button
          type="button"
          onClick={() => onSectionChange('tienda')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            currentSection === 'tienda' ? 'text-purple-400 font-bold' : 'text-neutral-500'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[10px] font-bold">Tienda</span>
        </button>

        <button
          type="button"
          onClick={() => onSectionChange('mapa')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl relative transition-all cursor-pointer ${
            currentSection === 'mapa' ? 'text-cyan-400 font-bold' : 'text-neutral-500'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span className="text-[10px] font-bold">
            {currentUser?.role === 'delivery' ? 'Rutas' : 'Rastreo'}
          </span>
          {activeOrdersCount > 0 && (
            <span className="absolute top-0.5 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse">
              {activeOrdersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onSectionChange('pedidos')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            currentSection === 'pedidos' ? 'text-white font-bold' : 'text-neutral-500'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px] font-bold">Pedidos</span>
        </button>

        {currentUser?.role === 'comprador' && onOpenPoints && (
          <button
            type="button"
            onClick={onOpenPoints}
            className="flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer text-purple-300"
          >
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span className="text-[10px] font-bold">{currentUser.pointsBalance ?? 0} pts</span>
          </button>
        )}

        {currentUser?.role === 'admin' && (
          <button
            type="button"
            onClick={() => onSectionChange('admin')}
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
              currentSection === 'admin' ? 'text-purple-300 font-bold' : 'text-neutral-500'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] font-bold">Admin</span>
          </button>
        )}
      </nav>
    </>
  );
};
