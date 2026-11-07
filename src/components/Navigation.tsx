import React, { useState, useEffect } from 'react';
import { AppSection, StoreCatalogView, StoreConfig, UserAccount, UserRole } from '../types';
import { requestPushPermission } from '../utils/notifications';
import { PWAInstallButton, OfflineIndicator } from './PWAInstallButton';
import {
  ShoppingCart,
  MapPin,
  Clock,
  Shield,
  User,
  LogOut,
  Bell,
  Wind,
  Sparkles,
  Gift,
  Crown,
  Search,
  Home,
  LayoutGrid,
  Droplet,
  Cpu,
  Lock,
  X,
  Menu,
  ChevronRight,
} from 'lucide-react';

interface NavigationProps {
  currentSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  activeStoreView?: StoreCatalogView;
  onStoreViewChange?: (view: StoreCatalogView) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  cartCount?: number;
  onOpenCart?: () => void;
  currentUser: UserAccount | null;
  onOpenAuth: (role?: UserRole) => void;
  onLogout: () => void;
  store: StoreConfig;
  activeOrdersCount: number;
  onOpenPoints?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentSection,
  onSectionChange,
  activeStoreView = 'inicio',
  onStoreViewChange,
  searchQuery = '',
  onSearchChange,
  cartCount = 0,
  onOpenCart,
  currentUser,
  onOpenAuth,
  onLogout,
  activeOrdersCount,
  onOpenPoints,
}) => {
  const [hasPushPermission, setHasPushPermission] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCategorySheetOpen, setIsCategorySheetOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setHasPushPermission(Notification.permission === 'granted');
    }
  }, []);

  const handleEnablePush = async () => {
    const granted = await requestPushPermission();
    setHasPushPermission(granted);
  };

  const handleSelectStoreTab = (view: StoreCatalogView) => {
    if (currentSection !== 'tienda') {
      onSectionChange('tienda');
    }
    onStoreViewChange?.(view);
    setIsMobileMenuOpen(false);
    setIsCategorySheetOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectMainSection = (sec: AppSection) => {
    onSectionChange(sec);
    setIsMobileMenuOpen(false);
    setIsCategorySheetOpen(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      <OfflineIndicator />

      {/* Top Header - Mobile-First App Bar + Desktop Header */}
      <header className="sticky top-0 z-40 bg-[#050b08]/95 backdrop-blur-xl border-b border-emerald-500/20 shadow-2xl shadow-black/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-6">
          {/* Mobile Left Menu Button (Matches Phone Mockup in Reference Image) */}
          <div className="flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl bg-[#0b1611] border border-emerald-500/30 text-emerald-300 hover:text-white active:scale-95 transition-all cursor-pointer"
              aria-label="Abrir menú principal"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          {/* Zone 1: Brand Logo with Crown (Centered on mobile, left-aligned on desktop) */}
          <div
            onClick={() => handleSelectStoreTab('inicio')}
            className="flex items-center gap-2 cursor-pointer group shrink-0"
          >
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full p-0.5 bg-gradient-to-tr from-emerald-600 via-teal-400 to-emerald-400 shadow-md shadow-emerald-500/30 shrink-0">
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

            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20 shrink-0" />
                <span className="font-black text-sm xs:text-base sm:text-xl text-white font-urban tracking-wider whitespace-nowrap">
                  BLACK <span className="text-emerald-400">VAPE</span>
                </span>
              </div>
              <span className="text-[7px] sm:text-[9px] uppercase tracking-[0.26em] text-emerald-400/80 font-bold block -mt-0.5">
                VAPE SHOP
              </span>
            </div>
          </div>

          {/* Zone 2: Desktop Global Search Input */}
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-emerald-400/80 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                if (currentSection !== 'tienda') onSectionChange('tienda');
                onSearchChange?.(e.target.value);
              }}
              placeholder="Buscar productos (vapers, líquidos, accesorios...)"
              className="w-full bg-[#0b1611] border border-emerald-500/30 focus:border-emerald-400 rounded-full py-2 pl-10 pr-8 text-xs text-white placeholder-neutral-400 focus:outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Zone 3: User / Points / Cart / Admin Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <PWAInstallButton />

            {!hasPushPermission && (
              <button
                type="button"
                onClick={handleEnablePush}
                title="Activar notificaciones de entrega"
                className="hidden lg:flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-[#0b1611] border border-emerald-800/50 hover:border-emerald-500/60 text-[11px] font-bold text-emerald-200 transition-all cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-emerald-400" />
                <span>Avisos</span>
              </button>
            )}

            {/* Points balance button for logged-in buyer (Visible on both Mobile & Desktop!) */}
            {currentUser && currentUser.role === 'comprador' && onOpenPoints && (
              <button
                type="button"
                onClick={onOpenPoints}
                title="Ver tus puntos y canjear llenadas gratis"
                className="flex items-center gap-1 py-1.5 px-2.5 sm:px-3 rounded-full bg-emerald-950/70 border border-emerald-500/40 hover:border-emerald-400 text-[11px] sm:text-xs font-black text-white transition-all cursor-pointer shrink-0 active:scale-95"
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-300 shrink-0" />
                <span className="tabular-nums">{currentUser.pointsBalance ?? 0}</span>
                <span className="text-[9px] sm:text-[10px] text-emerald-300 uppercase">PTS</span>
              </button>
            )}

            {/* User Account / Login (Desktop) */}
            {currentUser ? (
              <div className="hidden sm:flex items-center gap-1.5 bg-[#0b1611] border border-emerald-800/50 rounded-full py-1 px-2.5">
                <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white text-xs truncate max-w-[96px]">
                  {currentUser.name}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenAuth(currentUser.role)}
                  className="text-[10px] font-bold text-emerald-300 hover:text-white px-1.5 py-0.5 rounded cursor-pointer"
                  title="Cambiar cuenta"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="p-1 rounded-full text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Cerrar sesión"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('comprador')}
                className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 rounded-full text-neutral-200 hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer"
              >
                <User className="w-4 h-4 text-emerald-400" />
                <span>Iniciar sesión</span>
              </button>
            )}

            {/* Shopping Cart Button with Live Green Counter Badge */}
            <button
              type="button"
              onClick={() => {
                if (currentSection !== 'tienda') onSectionChange('tienda');
                onOpenCart?.();
              }}
              className="relative p-2 rounded-full bg-[#0b1611] hover:bg-emerald-950/80 border border-emerald-500/35 hover:border-emerald-400 text-white transition-all cursor-pointer active:scale-95"
              aria-label="Abrir carrito de compras"
              title="Ver carrito"
            >
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300" />
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-neutral-950 text-[10px] font-black flex items-center justify-center shadow-md shadow-emerald-500/50 tabular-nums">
                {cartCount}
              </span>
            </button>

            {/* Panel Admin Button */}
            {currentUser?.role === 'admin' ? (
              <button
                type="button"
                onClick={() => onSectionChange(currentSection === 'admin' ? 'tienda' : 'admin')}
                className={`flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-full text-[11px] sm:text-xs font-bold transition-all cursor-pointer border ${
                  currentSection === 'admin'
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-300 shadow-lg shadow-emerald-500/30'
                    : 'bg-[#0b1611] hover:bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Panel Admin</span>
                <span className="sm:hidden">Admin</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth('admin')}
                className="hidden sm:flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-[#0b1611] hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-all cursor-pointer"
                title="Acceso Administrador / Repartidor"
              >
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Panel Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop Category & Section Bar */}
        <nav className="hidden sm:flex max-w-7xl mx-auto px-6 pb-2.5 pt-1 items-center gap-2 overflow-x-auto scrollbar-none border-t border-emerald-950/60">
          <button
            type="button"
            onClick={() => handleSelectStoreTab('inicio')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              currentSection === 'tienda' && activeStoreView === 'inicio'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectStoreTab('vapes')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              currentSection === 'tienda' && activeStoreView === 'vapes'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Vapers</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectStoreTab('liquidos')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              currentSection === 'tienda' && activeStoreView === 'liquidos'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <Droplet className="w-3.5 h-3.5" />
            <span>Líquidos</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectStoreTab('accesorios')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              currentSection === 'tienda' && activeStoreView === 'accesorios'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Accesorios</span>
          </button>

          <div className="h-4 w-px bg-emerald-900/50 mx-1 shrink-0" />

          <button
            type="button"
            onClick={() => onSectionChange('mapa')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap relative cursor-pointer ${
              currentSection === 'mapa'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>
              {currentUser?.role === 'delivery' ? 'Rutas & Despacho' : 'Mapa & Rastreo'}
            </span>
            {activeOrdersCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black tabular-nums ${
                  currentSection === 'mapa'
                    ? 'bg-neutral-950 text-emerald-300'
                    : 'bg-emerald-500 text-neutral-950'
                }`}
              >
                {activeOrdersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSectionChange('pedidos')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              currentSection === 'pedidos'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'text-neutral-300 hover:text-emerald-300 hover:bg-emerald-950/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Mis Pedidos</span>
          </button>

          {currentUser?.role === 'comprador' && onOpenPoints && (
            <button
              type="button"
              onClick={onOpenPoints}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 ml-auto"
            >
              <Gift className="w-3.5 h-3.5 text-amber-300" />
              <span>Club de Puntos ({currentUser.pointsBalance ?? 0} pts)</span>
            </button>
          )}
        </nav>
      </header>

      {/* Mobile Slide-Out Drawer Menu (Opened from top-left ☰ or bottom 'Cuenta' button) */}
      {isMobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex bg-black/85 backdrop-blur-md animate-in fade-in duration-200 font-urban">
          <div className="relative w-[84%] max-w-xs bg-[#06100b] border-r border-emerald-500/35 h-full flex flex-col justify-between p-4 text-white shadow-2xl">
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-emerald-900/50">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/logo-black-vape.jpeg"
                    alt="BLACK VAPE"
                    className="w-9 h-9 rounded-full object-cover border border-emerald-400"
                  />
                  <div>
                    <div className="flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-black text-sm text-white">
                        BLACK <span className="text-emerald-400">VAPE</span>
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400/80 block">
                      Colmado Noadia • Loma de Cabrera
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-xl bg-emerald-950/60 text-neutral-300 hover:text-white border border-emerald-800/40"
                  aria-label="Cerrar menú"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* User Account Card in Drawer */}
              {currentUser ? (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#0b1f16] to-[#050b08] border border-emerald-500/40 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 block">
                        {currentUser.role === 'admin'
                          ? 'Cuenta Administrador'
                          : currentUser.role === 'delivery'
                          ? 'Cuenta Repartidor'
                          : 'Cliente Verificado'}
                      </span>
                      <strong className="text-sm font-black text-white truncate block">
                        {currentUser.name}
                      </strong>
                      {currentUser.phone && (
                        <span className="text-[11px] text-neutral-400 block">{currentUser.phone}</span>
                      )}
                    </div>
                    {currentUser.role === 'comprador' && (
                      <div className="px-2.5 py-1 rounded-xl bg-emerald-950 border border-emerald-400/40 text-right shrink-0">
                        <span className="text-xs font-black text-emerald-300 block tabular-nums">
                          {currentUser.pointsBalance ?? 0} PTS
                        </span>
                        <span className="text-[9px] text-amber-300 block font-bold">Fidelidad</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {currentUser.role === 'comprador' && onOpenPoints && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          onOpenPoints();
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black text-xs flex items-center justify-center gap-1.5 shadow"
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>Club de Puntos</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenAuth(currentUser.role);
                      }}
                      className="py-2 px-2.5 rounded-xl bg-neutral-900 border border-emerald-800/50 text-emerald-300 text-[11px] font-bold"
                    >
                      Cambiar Rol
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onLogout();
                      }}
                      className="p-2 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300"
                      title="Cerrar sesión"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#091510] border border-emerald-500/30 space-y-2">
                  <p className="text-xs text-neutral-300">
                    Identifícate con tu nombre y teléfono para acumular puntos y canjear llenadas gratis.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenAuth('comprador');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black text-xs flex items-center justify-center gap-2 shadow-md"
                  >
                    <User className="w-4 h-4" />
                    <span>Iniciar Sesión / Identificarme</span>
                  </button>
                </div>
              )}

              {/* Store Categories Navigation */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 px-2 block">
                  Catálogo de la Tienda
                </span>
                {[
                  { id: 'inicio' as StoreCatalogView, label: 'Inicio (Todo & Destacados)', icon: Home },
                  { id: 'vapes' as StoreCatalogView, label: 'Sección de Vapers', icon: Wind },
                  { id: 'liquidos' as StoreCatalogView, label: 'Líquidos de Recarga', icon: Droplet },
                  { id: 'accesorios' as StoreCatalogView, label: 'Accesorios & Repuestos', icon: Cpu },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = currentSection === 'tienda' && activeStoreView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectStoreTab(item.id)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
                        active
                          ? 'bg-emerald-500 text-neutral-950 font-black shadow'
                          : 'text-neutral-200 hover:bg-emerald-950/50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 opacity-70" />
                    </button>
                  );
                })}
              </div>

              {/* Orders & Live Tracking Navigation */}
              <div className="space-y-1 pt-2 border-t border-emerald-950/80">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 px-2 block">
                  Entregas & Seguimiento
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectMainSection('mapa')}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
                    currentSection === 'mapa'
                      ? 'bg-emerald-500 text-neutral-950 font-black shadow'
                      : 'text-neutral-200 hover:bg-emerald-950/50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4" />
                    <span>Mapa & Rastreo en Vivo</span>
                  </span>
                  {activeOrdersCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-neutral-950 text-[10px] font-black">
                      {activeOrdersCount} activo
                    </span>
                  ) : (
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMainSection('pedidos')}
                  className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-between transition-all ${
                    currentSection === 'pedidos'
                      ? 'bg-emerald-500 text-neutral-950 font-black shadow'
                      : 'text-neutral-200 hover:bg-emerald-950/50'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Clock className="w-4 h-4" />
                    <span>Mis Pedidos Realizados</span>
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              </div>
            </div>

            {/* Bottom Staff / Admin Access inside Mobile Drawer */}
            <div className="pt-3 border-t border-emerald-900/50">
              {currentUser?.role === 'admin' ? (
                <button
                  type="button"
                  onClick={() => handleSelectMainSection('admin')}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs font-black flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  <span>Ir al Panel de Administración</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenAuth('admin');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-[#091510] border border-emerald-900/60 text-neutral-400 hover:text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Acceso Personal (Admin / Repartidor)</span>
                </button>
              )}
            </div>
          </div>

          {/* Backdrop click to close */}
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
        </div>
      )}

      {/* Mobile Bottom Sheet for Quick Category Selection when tapping 'Categorías' */}
      {isCategorySheetOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex items-end bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 font-urban"
          onClick={() => setIsCategorySheetOpen(false)}
        >
          <div
            className="w-full bg-[#07120d] border-t-2 border-emerald-500/50 rounded-t-3xl p-4 pb-8 space-y-3 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-emerald-900/50">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-emerald-400" />
                <span className="font-black text-sm text-white">Explorar Categorías</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCategorySheetOpen(false)}
                className="p-1 rounded-lg bg-emerald-950/60 text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectStoreTab('inicio')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 ${
                  currentSection === 'tienda' && activeStoreView === 'inicio'
                    ? 'bg-emerald-950 border-emerald-400 text-white'
                    : 'bg-[#050b08] border-emerald-900/50 text-neutral-300'
                }`}
              >
                <Home className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black text-xs block">Inicio</span>
                  <span className="text-[10px] text-neutral-400 block">Todo el catálogo</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectStoreTab('vapes')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 ${
                  currentSection === 'tienda' && activeStoreView === 'vapes'
                    ? 'bg-emerald-950 border-emerald-400 text-white'
                    : 'bg-[#050b08] border-emerald-900/50 text-neutral-300'
                }`}
              >
                <Wind className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black text-xs block">Vapers</span>
                  <span className="text-[10px] text-neutral-400 block">Equipos & colores</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectStoreTab('liquidos')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 ${
                  currentSection === 'tienda' && activeStoreView === 'liquidos'
                    ? 'bg-emerald-950 border-emerald-400 text-white'
                    : 'bg-[#050b08] border-emerald-900/50 text-neutral-300'
                }`}
              >
                <Droplet className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black text-xs block">Líquidos</span>
                  <span className="text-[10px] text-neutral-400 block">RD$100 / RD$50</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectStoreTab('accesorios')}
                className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 ${
                  currentSection === 'tienda' && activeStoreView === 'accesorios'
                    ? 'bg-emerald-950 border-emerald-400 text-white'
                    : 'bg-[#050b08] border-emerald-900/50 text-neutral-300'
                }`}
              >
                <Cpu className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-black text-xs block">Accesorios</span>
                  <span className="text-[10px] text-neutral-400 block">Pods & repuestos</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile-Native Bottom Navigation Bar (Matches Phone Mockup in Reference Image) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#050b08]/95 backdrop-blur-2xl border-t border-emerald-500/25 px-1.5 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom,0px))] grid grid-cols-5 items-center shadow-2xl">
        <button
          type="button"
          onClick={() => handleSelectStoreTab('inicio')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
            currentSection === 'tienda' && activeStoreView === 'inicio'
              ? 'text-emerald-400 font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] leading-tight">Inicio</span>
        </button>

        <button
          type="button"
          onClick={() => setIsCategorySheetOpen((prev) => !prev)}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
            (currentSection === 'tienda' && activeStoreView !== 'inicio') || isCategorySheetOpen
              ? 'text-emerald-400 font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] leading-tight">Categorías</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelectMainSection('mapa')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl relative transition-all cursor-pointer ${
            currentSection === 'mapa'
              ? 'text-emerald-400 font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span className="text-[10px] leading-tight">
            {currentUser?.role === 'delivery' ? 'Rutas' : 'Rastreo'}
          </span>
          {activeOrdersCount > 0 && (
            <span className="absolute top-0.5 right-3 w-4 h-4 rounded-full bg-emerald-500 text-neutral-950 text-[9px] font-black flex items-center justify-center tabular-nums">
              {activeOrdersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleSelectMainSection('pedidos')}
          className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
            currentSection === 'pedidos'
              ? 'text-emerald-400 font-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="text-[10px] leading-tight">Pedidos</span>
        </button>

        {currentUser?.role === 'admin' ? (
          <button
            type="button"
            onClick={() => handleSelectMainSection('admin')}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
              currentSection === 'admin'
                ? 'text-emerald-400 font-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] leading-tight">Admin</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (currentUser) {
                setIsMobileMenuOpen(true);
              } else {
                onOpenAuth('comprador');
              }
            }}
            className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition-all cursor-pointer ${
              currentUser ? 'text-emerald-300 font-bold' : 'text-neutral-400 hover:text-emerald-400'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] leading-tight truncate max-w-[58px]">
              {currentUser ? 'Cuenta' : 'Entrar'}
            </span>
          </button>
        )}
      </nav>
    </>
  );
};
