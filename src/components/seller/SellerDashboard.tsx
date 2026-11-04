import React, { useState, useRef, useEffect } from 'react';
import { Product, Order, StoreConfig, Coordinates, UserAccount } from '../../types';
import { calculateFinancialStats, generateInventoryReport, generateReportCSV, TimeFilter } from '../../utils/finance';
import { calculateDistanceKm } from '../../utils/routing';
import { generateWhatsAppLink, WhatsAppTemplates } from '../../utils/whatsapp';
import { compressProductImage, playNotificationSound } from '../../utils/storage';
import {
  saveProductToServer,
  deleteProductFromServer,
  saveStoreConfigToServer,
  clearTestOrdersOnServer,
} from '../../utils/supabaseOrders';
import { MapView } from '../MapView';
import {
  DollarSign,
  TrendingUp,
  Package,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  Store,
  CheckCircle2,
  X,
  XCircle,
  Droplet,
  MapPin,
  Calendar,
  Sparkles,
  Download,
  MessageCircle,
  Building,
  RotateCcw,
  ShieldAlert,
  Upload,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  BellRing,
} from 'lucide-react';

import { DriverManagement } from './DriverManagement';
import { LoyaltyManagement } from './LoyaltyManagement';

interface SellerDashboardProps {
  products: Product[];
  orders: Order[];
  store: StoreConfig;
  currentUser?: UserAccount | null;
  onSaveProducts: (products: Product[]) => void;
  onSaveStore: (store: StoreConfig) => void;
  onClearOrders?: () => void;
  onResetDemoData?: () => void;
  onUpdateOrderStatus?: (orderId: string, newStatus: Order['status'], note?: string) => void;
}

const PRESET_IMAGES = [
  { name: 'Horny Flava Ice Mint', url: '/liquidos/horny-flava-ice-mint-bubblegum-120ml-liquids-liquids-melca-distro-605_500x.webp' },
  { name: 'Mistiq Melón Ice', url: '/liquidos/mistiq-flava-melon-120ml-liquids-liquids-melca-distro-899_500x.webp' },
  { name: 'Pod Juice Energy Freeze', url: '/liquidos/pod-juice-salt-energy-freeze-30ml-55mg-liquids-juice-liquids-melca-distro-438_500x.webp' },
  { name: 'Pop Iced Big Apple', url: '/liquidos/pop-iced-big-apple-100ml-liquids-liquids-pop-vapors-melca-distro-934_500x.webp' },
  { name: 'Pop Iced Blueberry Lemonade', url: '/liquidos/pop-iced-blueberry-lemonade-100ml-liquids-liquids-pop-vapors-melca-distro-958_500x.webp' },
  { name: 'Pop Iced Grape', url: '/liquidos/pop-iced-grape-100ml-liquids-liquids-pop-vapors-melca-distro-444_500x.webp' },
  { name: 'Pop Iced Mango Dragon Fruit', url: '/liquidos/pop-iced-mango-dragon-fruit-100ml-liquids-liquids-pop-vapors-melca-distro-892_500x.webp' },
  { name: 'Pop Iced Mango Strawberry', url: '/liquidos/pop-iced-mango-strawberry-100ml-liquids-fresa-liquids-pop-vapors-melca-distro-715_500x.webp' },
  { name: 'Pop Iced Strawberry Watermelon', url: '/liquidos/pop-iced-strawberry-watermelon-100ml-liquids-liquids-pop-vapors-melca-distro-629_500x.webp' },
];

export const SellerDashboard: React.FC<SellerDashboardProps> = ({
  products,
  orders,
  store,
  currentUser,
  onSaveProducts,
  onSaveStore,
  onClearOrders,
  onUpdateOrderStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'finanzas' | 'inventario' | 'repartidores' | 'tienda' | 'puntos'>('finanzas');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Sound alerts state for Admin panel
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('vape_sound_alerts_muted_v1') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSoundMuted = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    try {
      localStorage.setItem('vape_sound_alerts_muted_v1', next ? 'true' : 'false');
    } catch {}
    if (!next) {
      playNotificationSound('new-order');
    }
  };

  // Double confirmation modal state for test order purge
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [clearLoading, setClearLoading] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  // Admin inline order rejection state
  const [adminRejectingOrderId, setAdminRejectingOrderId] = useState<string | null>(null);
  const [adminRejectReason, setAdminRejectReason] = useState<string>(
    'Fuera de cobertura (Fuera de Loma de Cabrera)'
  );
  const ADMIN_REJECT_REASONS = [
    'Fuera de cobertura (Fuera de Loma de Cabrera)',
    'Líquido agotado temporalmente',
    'Cliente no responde llamadas / WhatsApp',
    'Dirección incompleta o no localizada',
    'Pedido duplicado o de prueba',
  ];

  // Store settings form state
  const [storeName, setStoreName] = useState(store.name);
  const [storeAddress, setStoreAddress] = useState(store.addressText);
  const [storePhone, setStorePhone] = useState(store.phone || '8092104901');
  const [storeWhatsapp, setStoreWhatsapp] = useState(store.whatsapp || '8092104901');
  const [storeBankAccountInfo, setStoreBankAccountInfo] = useState(
    store.bankAccountInfo || 'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901'
  );
  const [storeCoords, setStoreCoords] = useState<Coordinates>(store.location);
  const [storeSavedNotice, setStoreSavedNotice] = useState(false);

  useEffect(() => {
    setStoreName(store.name);
    setStoreAddress(store.addressText);
    setStorePhone(store.phone || '8092104901');
    setStoreWhatsapp(store.whatsapp || '8092104901');
    setStoreBankAccountInfo(
      store.bankAccountInfo ||
        'Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia) • WhatsApp Comprobante: 809-210-4901'
    );
    setStoreCoords(store.location);
  }, [store]);

  // New / Edited product form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Frutales');
  const [formNicotine, setFormNicotine] = useState(35);
  const [formImageUrl, setFormImageUrl] = useState(PRESET_IMAGES[0].url);
  const [formStock, setFormStock] = useState(25);
  const [formCostPrice, setFormCostPrice] = useState(20);
  const [formPriceFullTank, setFormPriceFullTank] = useState(100);
  const [formPriceHalfTank, setFormPriceHalfTank] = useState(50);
  const [formDescription, setFormDescription] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [compressionSummary, setCompressionSummary] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('todo');

  const stats = calculateFinancialStats(orders, timeFilter);
  const inventoryReport = generateInventoryReport(products, orders);

  const pendingActiveOrders = orders.filter(
    (o) => o.status !== 'entregado' && o.status !== 'cancelado'
  );

  const remoteLocationOrders = orders.filter((o) => {
    if (o.status === 'cancelado' || o.status === 'entregado') return false;
    const dist = o.calculatedDistanceKm ?? calculateDistanceKm(store.location, o.location);
    return Boolean(o.isRemoteLocation || dist > 15);
  });

  const handleDownloadCSV = () => {
    const csvData = generateReportCSV(stats, inventoryReport, orders);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reporte-financiero-vapeexpress-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickRestock = (productId: string, quantity: number = 20) => {
    let restockedItem: Product | null = null;
    const updated = products.map((p) => {
      if (p.id === productId) {
        restockedItem = { ...p, stockUnits: Math.max(0, p.stockUnits + quantity) };
        return restockedItem;
      }
      return p;
    });
    onSaveProducts(updated);
    if (restockedItem) {
      saveProductToServer(restockedItem).catch(console.warn);
    }
  };

  const handleImageFileSelect = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageUploadError('Por favor selecciona un archivo de imagen válido (JPG, PNG, WEBP).');
      return;
    }

    setImageUploadError(null);
    setCompressionSummary(null);
    setIsUploadingImage(true);
    setUploadedFileName(file.name);

    try {
      const result = await compressProductImage(file);
      setFormImageUrl(result.dataUrl);
      setCompressionSummary(
        `Comprimida automáticamente: ${result.compressedKb} KB (${result.width}x${result.height}px • Ahorro de ${result.savedPercent}% en memoria)`
      );
    } catch (err: any) {
      setImageUploadError(err.message || 'No se pudo optimizar la imagen seleccionada.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('Frutales');
    setFormNicotine(35);
    setFormImageUrl(PRESET_IMAGES[0].url);
    setFormStock(30);
    setFormCostPrice(20);
    setFormPriceFullTank(100);
    setFormPriceHalfTank(50);
    setFormDescription('');
    setUploadedFileName(null);
    setCompressionSummary(null);
    setImageUploadError(null);
    setIsAddingNew(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.flavorCategory);
    setFormNicotine(p.nicotineMg);
    setFormImageUrl(p.imageUrl);
    setFormStock(p.stockUnits);
    setFormCostPrice(p.costPrice);
    setFormPriceFullTank(p.priceFullTank || 100);
    setFormPriceHalfTank(p.priceHalfTank || 50);
    setFormDescription(p.description || '');
    setUploadedFileName(p.imageUrl.startsWith('data:image') ? 'Imagen optimizada en memoria' : null);
    setCompressionSummary(null);
    setImageUploadError(null);
    setIsAddingNew(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingProduct) {
      const updatedProduct: Product = {
        ...editingProduct,
        name: formName.trim(),
        flavorCategory: formCategory,
        nicotineMg: Number(formNicotine),
        imageUrl: formImageUrl || PRESET_IMAGES[0].url,
        stockUnits: Number(formStock),
        costPrice: Number(formCostPrice),
        priceFullTank: Number(formPriceFullTank) || 100,
        priceHalfTank: Number(formPriceHalfTank) || 50,
        description: formDescription.trim(),
      };
      const updated = products.map((p) => (p.id === editingProduct.id ? updatedProduct : p));
      onSaveProducts(updated);
      saveProductToServer(updatedProduct).catch(console.warn);
    } else {
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        name: formName.trim(),
        flavorCategory: formCategory,
        nicotineMg: Number(formNicotine),
        imageUrl: formImageUrl || PRESET_IMAGES[0].url,
        stockUnits: Number(formStock),
        costPrice: Number(formCostPrice),
        priceFullTank: Number(formPriceFullTank) || 100,
        priceHalfTank: Number(formPriceHalfTank) || 50,
        description: formDescription.trim(),
        isActive: true,
      };
      onSaveProducts([...products, newProduct]);
      saveProductToServer(newProduct).catch(console.warn);
    }

    setIsAddingNew(false);
    setEditingProduct(null);
  };

  const handleDeleteProduct = (productId: string) => {
    if (confirm('¿Seguro que deseas eliminar este líquido del catálogo?')) {
      onSaveProducts(products.filter((p) => p.id !== productId));
      deleteProductFromServer(productId).catch(console.warn);
    }
  };

  const handleSaveStoreConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const newStore: StoreConfig = {
      name: storeName.trim(),
      addressText: storeAddress.trim(),
      phone: storePhone.trim(),
      whatsapp: storeWhatsapp.trim(),
      bankAccountInfo: storeBankAccountInfo.trim(),
      location: storeCoords,
      isOpen: true,
    };
    onSaveStore(newStore);
    saveStoreConfigToServer(newStore).catch(console.warn);
    setStoreSavedNotice(true);
    setTimeout(() => setStoreSavedNotice(false), 3000);
  };

  const handleExecuteClearOrders = async () => {
    if (confirmPhrase.trim().toUpperCase() !== 'BORRAR') {
      setClearError('Debes escribir exactamente "BORRAR" para confirmar.');
      return;
    }

    if (!currentUser || currentUser.role !== 'admin') {
      setClearError('Acceso denegado: solo un administrador autenticado puede purgar pedidos.');
      return;
    }

    setClearLoading(true);
    setClearError(null);

    try {
      const res = await clearTestOrdersOnServer(currentUser);
      if (!res.success) {
        setClearError(res.error || 'Error al purgar pedidos en el servidor.');
        setClearLoading(false);
        return;
      }
      onClearOrders?.();
      setIsClearModalOpen(false);
      setConfirmPhrase('');
    } catch (err: any) {
      setClearError(err.message || 'Error inesperado al purgar pedidos.');
    } finally {
      setClearLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Seller Bar */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-violet-950/40 border border-neutral-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                <Store className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                Panel del Vendedor & Administrador
              </span>

              {/* Automatic Sound Alert Status & Test Button */}
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  type="button"
                  onClick={toggleSoundMuted}
                  className={`py-1 px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    soundMuted
                      ? 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                      : 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50'
                  }`}
                  title="Activar o silenciar timbre automático cuando entra un pedido nuevo"
                >
                  {soundMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Timbre Silenciado</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>Timbre Automático Activo</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => playNotificationSound('new-order')}
                  className="py-1 px-2.5 rounded-xl bg-violet-950/50 hover:bg-violet-900/60 border border-violet-500/40 text-[11px] font-bold text-violet-200 transition-all cursor-pointer flex items-center gap-1"
                  title="Probar sonido de alerta de nuevo pedido"
                >
                  <BellRing className="w-3 h-3 text-amber-300" />
                  <span>Probar Timbre</span>
                </button>
              </div>
            </div>
            <h2 className="text-xl font-black text-white mt-1">
              Finanzas, Inventario y Localización
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Monitorea ingresos divididos por líquido y delivery, costos unitarios y reportes de optimización de stock.
            </p>
          </div>

          {/* Tab Pills */}
          <div className="inline-flex flex-wrap p-1 bg-neutral-950 border border-neutral-800 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('finanzas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'finanzas'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              📊 Finanzas & Ganancias
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventario')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'inventario'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              🧪 Gestión de Líquidos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('repartidores')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'repartidores'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              🛵 Repartidores
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tienda')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'tienda'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              📍 Tienda en Mapa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('puntos')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'puntos'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>✨ Club de Puntos</span>
            </button>
          </div>
        </div>

        {/* Live Active Orders Alert Bar & Quick Reject/Manage inside Admin */}
        {pendingActiveOrders.length > 0 && (
          <div className="p-4 rounded-2xl bg-cyan-950/35 border border-cyan-500/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shrink-0">
                  <BellRing className="w-4 h-4 animate-bounce" />
                </span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 block">
                    PEDIDOS ACTIVOS EN COLA ({pendingActiveOrders.length})
                  </span>
                  <p className="text-xs text-white font-bold">
                    Puedes rechazar un pedido aquí mismo o ir a &ldquo;Mapa & Rastreo&rdquo; para trazar ruta en vivo 🛵
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
              {pendingActiveOrders.map((ord) => {
                const dist = ord.calculatedDistanceKm ?? calculateDistanceKm(store.location, ord.location);
                const isRejectingThis = adminRejectingOrderId === ord.id;

                return (
                  <div
                    key={ord.id}
                    className="p-3 rounded-2xl bg-neutral-950/90 border border-cyan-500/30 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-white">#{ord.id}</span>
                          <span className="font-bold text-cyan-300">{ord.customerName}</span>
                          <span className="text-[10px] font-mono bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded text-neutral-300">
                            📍 {dist} km • ${ord.totalAmount} DOP
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-400 block mt-0.5 truncate">
                          {ord.deliveryAddressNote || 'Ubicación GPS en mapa'} • Tel: {ord.customerPhone}
                        </span>
                        <span className="text-[10px] text-emerald-400 block mt-0.5">
                          {ord.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}
                        </span>
                      </div>

                      {onUpdateOrderStatus && !isRejectingThis && (
                        <button
                          type="button"
                          onClick={() => setAdminRejectingOrderId(ord.id)}
                          className="py-1.5 px-2.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-500/50 text-red-300 hover:text-white font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rechazar</span>
                        </button>
                      )}
                    </div>

                    {isRejectingThis && onUpdateOrderStatus && (
                      <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/60 space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-red-300 uppercase">
                            Motivo de rechazo para #{ord.id}:
                          </span>
                          <button
                            type="button"
                            onClick={() => setAdminRejectingOrderId(null)}
                            className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {ADMIN_REJECT_REASONS.map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setAdminRejectReason(reason)}
                              className={`py-0.5 px-2 rounded text-[10px] font-bold cursor-pointer border ${
                                adminRejectReason === reason
                                  ? 'bg-red-600 text-white border-red-400'
                                  : 'bg-neutral-950 text-neutral-300 border-neutral-800'
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          value={adminRejectReason}
                          onChange={(e) => setAdminRejectReason(e.target.value)}
                          placeholder="Motivo del rechazo..."
                          className="w-full bg-neutral-950 border border-red-500/40 rounded-lg py-1.5 px-2.5 text-xs text-white focus:outline-none focus:border-red-400"
                        />

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateOrderStatus(
                                ord.id,
                                'cancelado',
                                `Rechazado por Admin: ${adminRejectReason.trim() || 'Pedido rechazado'}`
                              );
                              playNotificationSound('alert');
                              setAdminRejectingOrderId(null);
                            }}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Confirmar Rechazo</span>
                          </button>

                          <a
                            href={generateWhatsAppLink(
                              ord.customerPhone,
                              WhatsAppTemplates.orderRejected(
                                ord.customerName,
                                ord.id,
                                adminRejectReason.trim() || 'Pedido rechazado'
                              )
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              onUpdateOrderStatus(
                                ord.id,
                                'cancelado',
                                `Rechazado por Admin: ${adminRejectReason.trim() || 'Pedido rechazado'}`
                              );
                              playNotificationSound('alert');
                              setAdminRejectingOrderId(null);
                            }}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Rechazar y Avisar WA</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Remote location orders critical alert banner */}
      {remoteLocationOrders.length > 0 && (
        <div className="p-4 rounded-3xl bg-amber-950/80 border-2 border-amber-500 shadow-2xl space-y-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-400/40 flex items-center justify-center text-lg shrink-0">
              ⚠️
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black text-amber-300">
                {remoteLocationOrders.length} Pedido(s) con Ubicación Fuera de Loma de Cabrera Detectada
              </h4>
              <p className="text-xs text-amber-200/90 mt-0.5">
                El navegador o la red del cliente reportó coordenadas en otra provincia (ej. Santo Domingo / Santiago). Verifica la dirección exacta en Loma de Cabrera o rechaza el pedido si está fuera de cobertura.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
            {remoteLocationOrders.map((o) => {
              const dist = o.calculatedDistanceKm ?? calculateDistanceKm(store.location, o.location);
              return (
                <div
                  key={o.id}
                  className="p-3 bg-neutral-950/90 rounded-2xl border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">#{o.id} • {o.customerName}</span>
                      <span className="text-[10px] font-mono text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">
                        ~{dist} km
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block mt-0.5 truncate">
                      {o.deliveryAddressNote || 'Sin dirección detallada'}
                    </span>
                    <span className="text-[10px] text-neutral-500 block">
                      Tel: {o.customerPhone} • {o.items.length} líquidos
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={generateWhatsAppLink(
                        o.customerPhone,
                        `Hola ${o.customerName}, somos de Black Vape Loma de Cabrera. Notamos que tu pedido #${o.id} marcó una ubicación a ${dist} km fuera de la zona. ¿Podrías confirmarnos tu dirección en Loma de Cabrera o enviarnos tu ubicación actual por WhatsApp?`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center justify-center gap-1 shadow active:scale-95 transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Confirmar</span>
                    </a>

                    {onUpdateOrderStatus && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminRejectReason('Fuera de cobertura (Fuera de Loma de Cabrera)');
                          setAdminRejectingOrderId(o.id);
                        }}
                        className="py-1.5 px-2.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-black text-xs flex items-center justify-center gap-1 shadow active:scale-95 transition-all cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 1: FINANCES & EARNINGS */}
      {activeTab === 'finanzas' && (
        <div className="space-y-6">
          {/* Period Filter and CSV Export Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 p-3.5 rounded-2xl">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-xs text-neutral-400 font-semibold mr-1 shrink-0">Filtrar período:</span>
              {(
                [
                  { id: 'hoy', label: 'Hoy' },
                  { id: 'semana', label: 'Esta Semana' },
                  { id: 'mes', label: 'Este Mes' },
                  { id: 'todo', label: 'Todo el Histórico' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTimeFilter(f.id)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    timeFilter === f.id
                      ? 'bg-violet-600 text-white shadow'
                      : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadCSV}
              className="py-2 px-4 rounded-xl bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs font-bold text-neutral-200 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Descargar Reporte CSV</span>
            </button>
          </div>

          {/* Main Financial Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                Vendido Hoy ({stats.ordersTodayCount})
              </span>
              <div className="text-xl font-black text-white mt-1">${stats.salesToday} DOP</div>
              <span className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-semibold">
                <TrendingUp className="w-3 h-3" />
                Día en curso
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                Esta Semana ({stats.ordersWeekCount})
              </span>
              <div className="text-xl font-black text-violet-300 mt-1">${stats.salesWeek} DOP</div>
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Últimos 7 días
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                Ingresos Mes ({stats.ordersMonthCount})
              </span>
              <div className="text-xl font-black text-cyan-400 mt-1">${stats.salesMonth} DOP</div>
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Mes calendario
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                Total Período ({stats.ordersCompletedCount})
              </span>
              <div className="text-xl font-black text-white mt-1">
                ${stats.salesAllTime} DOP
              </div>
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Filtro: {timeFilter}
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block">
                Líquido Despachado
              </span>
              <div className="text-xl font-black text-amber-300 mt-1">
                {stats.totalLiquidDispensed}
              </div>
              <span className="text-[10px] text-amber-400/90 mt-1 block">
                Porciones recargadas
              </span>
            </div>

            <div className="p-4 rounded-3xl bg-gradient-to-tr from-emerald-950/60 to-neutral-900 border border-emerald-500/40 shadow-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                Ganancia Neta Total
              </span>
              <div className="text-xl font-black text-emerald-300 mt-1">
                ${stats.totalNetProfit} DOP
              </div>
              <span className="text-[10px] text-emerald-400 mt-1 block font-medium">
                Líquido + 100% Delivery
              </span>
            </div>
          </div>

          {/* Empty state banner if no completed orders in selected period */}
          {stats.ordersCompletedCount === 0 && (
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 text-neutral-400 text-xs flex items-center gap-3">
              <span className="text-xl">ℹ️</span>
              <div>
                <strong className="text-white block font-bold">
                  Sin pedidos entregados en este período ({timeFilter})
                </strong>
                <span>
                  Los totales de venta y ganancias se calcularán automáticamente tan pronto los repartidores entreguen pedidos a clientes.
                </span>
              </div>
            </div>
          )}

          {/* Breakdown: Liquid Profit vs. Delivery Profit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-5 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Droplet className="w-5 h-5 fill-emerald-400" />
                  </span>
                  <div>
                    <h4 className="font-bold text-sm text-white">Ganancia Neta por Líquido</h4>
                    <p className="text-xs text-neutral-400">
                      Ventas de líquido menos precio de costo unitario
                    </p>
                  </div>
                </div>
                <div className="text-xl font-black text-emerald-400">
                  ${stats.profitLiquids} DOP
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-950 text-xs text-neutral-300 space-y-1.5 border border-neutral-800/80">
                <div className="flex justify-between">
                  <span>Precios de venta estándar:</span>
                  <span className="font-semibold text-white">Tanque Lleno $100 / Mitad $50</span>
                </div>
                <div className="flex justify-between">
                  <span>Costo promedio base por porción:</span>
                  <span className="font-semibold text-amber-400">~$20 - $25 DOP</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-neutral-800">
                  <span>Margen de ganancia en líquidos:</span>
                  <span className="font-bold text-emerald-400">~75% - 80%</span>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <DollarSign className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-sm text-white">Recaudación por Delivery</h4>
                    <p className="text-xs text-neutral-400">
                      Total recaudado en tarifas de viaje ($25/$50/$75/$100)
                    </p>
                  </div>
                </div>
                <div className="text-xl font-black text-cyan-400">
                  ${stats.profitDelivery} DOP
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-neutral-950 text-xs text-neutral-300 space-y-1.5 border border-neutral-800/80">
                <div className="p-2 rounded-xl bg-violet-950/40 border border-violet-800/50 text-[11px] text-violet-300 font-medium">
                  ℹ️ <strong>Nota de Política:</strong> El 100% de la tarifa de delivery se computa como recaudación y ganancia del negocio (combustible y logística de flota).
                </div>
                <div className="flex justify-between">
                  <span>Tarifas fijadas por distancia:</span>
                  <span className="font-semibold text-white">$25, $50, $75, $100 DOP</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-neutral-800">
                  <span>Repartos completados:</span>
                  <span className="font-bold text-cyan-400">{stats.ordersCompletedCount} viajes</span>
                </div>
              </div>
            </div>
          </div>

          {/* Automatic Inventory Performance Report Table */}
          <div className="p-5 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Reporte Automático de Rendimiento & Optimización
                </span>
                <h3 className="text-base font-black text-white mt-0.5">
                  Análisis de Rotación de Inventario y Ganancia por Sabor
                </h3>
              </div>
              <button
                type="button"
                onClick={openAddModal}
                className="py-2 px-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Líquido</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="text-[11px] text-neutral-400 uppercase bg-neutral-950/60 border-y border-neutral-800">
                  <tr>
                    <th className="py-2.5 px-3">Líquido</th>
                    <th className="py-2.5 px-3">Stock Actual</th>
                    <th className="py-2.5 px-3">Vendidos</th>
                    <th className="py-2.5 px-3">Ingresos Brutos</th>
                    <th className="py-2.5 px-3">Ganancia Neta</th>
                    <th className="py-2.5 px-3">Estado / Sugerencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {inventoryReport.map((item) => (
                    <tr key={item.productId} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-3 px-3 font-bold text-white">{item.name}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-sm">{item.stockRemaining}</span> porciones
                      </td>
                      <td className="py-3 px-3 font-semibold text-neutral-300">{item.unitsSold}</td>
                      <td className="py-3 px-3 font-semibold text-neutral-300">
                        ${item.totalRevenue} DOP
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-400">
                        ${item.totalProfit} DOP
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {item.status === 'CRITICO' && (
                            <span className="px-2.5 py-1 rounded-lg bg-red-950 border border-red-700/80 text-red-300 text-[10px] font-bold whitespace-nowrap">
                              ⚠️ Crítico: Reabastecer ya
                            </span>
                          )}
                          {item.status === 'BAJO' && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-950 border border-amber-700/80 text-amber-300 text-[10px] font-bold whitespace-nowrap">
                              ⚡ Stock bajo
                            </span>
                          )}
                          {item.status === 'OPTIMO' && (
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-950 border border-emerald-700/80 text-emerald-300 text-[10px] font-bold whitespace-nowrap">
                              ✓ Nivel saludable
                            </span>
                          )}

                          {item.status !== 'OPTIMO' && (
                            <button
                              type="button"
                              onClick={() => handleQuickRestock(item.productId, 20)}
                              className="px-2 py-0.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-cyan-300 text-[10px] font-bold transition-all border border-neutral-700 hover:border-cyan-500/50 cursor-pointer"
                              title="Añadir +20 porciones al inventario"
                            >
                              +20 Lote
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCT & INVENTORY MANAGEMENT */}
      {activeTab === 'inventario' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-white">Catálogo de Líquidos Subidos</h3>
            <button
              type="button"
              onClick={openAddModal}
              className="py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Nuevo Líquido</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                className="bg-neutral-900 border border-neutral-800 rounded-3xl p-4 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-40 rounded-2xl overflow-hidden bg-neutral-950 mb-3 border border-neutral-800">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-neutral-950/80 text-[10px] font-bold text-neutral-200">
                      {product.flavorCategory}
                    </div>
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-neutral-900/90 text-[10px] font-bold text-emerald-400">
                      Stock: {product.stockUnits}
                    </div>
                  </div>

                  <h4 className="font-bold text-sm text-white">{product.name}</h4>
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-400 mt-1">
                    <span>
                      {product.nicotineMg}mg • Costo: <strong className="text-amber-300">${product.costPrice} DOP</strong>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickRestock(product.id, -1)}
                        className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[11px] cursor-pointer"
                        title="Restar 1 unidad de stock"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickRestock(product.id, 1)}
                        className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-emerald-300 font-bold text-[11px] cursor-pointer"
                        title="Sumar 1 unidad de stock"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickRestock(product.id, 10)}
                        className="px-2 py-0.5 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] cursor-pointer"
                        title="Sumar 10 unidades de stock"
                      >
                        +10
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 p-2 rounded-xl bg-neutral-950 text-xs text-neutral-300 space-y-1 border border-neutral-800">
                    <div className="flex justify-between">
                      <span>Tanque Lleno:</span>
                      <strong className="text-emerald-400">${product.priceFullTank || 100} DOP</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Mitad de Tanque:</span>
                      <strong className="text-cyan-400">${product.priceHalfTank || 50} DOP</strong>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-800 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(product)}
                    className="flex-1 py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Editar Costo / Stock / Foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(product.id)}
                    className="p-2 rounded-xl bg-neutral-800 hover:bg-red-950 text-neutral-400 hover:text-red-300 text-xs transition-all cursor-pointer"
                    title="Eliminar producto"
                    aria-label="Eliminar producto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: DRIVER MANAGEMENT */}
      {activeTab === 'repartidores' && <DriverManagement />}

      {/* TAB 4: PHYSICAL STORE LOCATION ON MAP */}
      {activeTab === 'tienda' && (
        <div className="space-y-5">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center gap-2 text-violet-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Store className="w-4 h-4" />
              <span>Configuración de la Tienda Física</span>
            </div>
            <h3 className="text-lg font-black text-white">
              Marcador y Ubicación del Local Físico
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Los usuarios que hagan pedidos verán este marcador en el mapa para saber exactamente
              dónde está tu local de líquidos y calcular la distancia de reparto.
            </p>

            {storeSavedNotice && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Ubicación y datos de la tienda guardados exitosamente!</span>
              </div>
            )}

            <form onSubmit={handleSaveStoreConfig} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Nombre del Local
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Dirección Física
                  </label>
                  <input
                    type="text"
                    required
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Teléfono Central
                  </label>
                  <input
                    type="tel"
                    required
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* WhatsApp and Banking Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>WhatsApp Oficial para Clientes & Pedidos (RD)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Ej: 809-210-4901"
                    value={storeWhatsapp}
                    onChange={(e) => setStoreWhatsapp(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-neutral-400 mt-1 block">
                    Permite a los compradores y repartidores abrir chats directos de WhatsApp con 1 toque.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Datos Bancarios para Transferencias</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Banreservas / Popular • Titular: Noadia Claribel (Colmado Noadia)"
                    value={storeBankAccountInfo}
                    onChange={(e) => setStoreBankAccountInfo(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-neutral-400 mt-1 block">
                    Se muestra en el Checkout con botón de 1 toque para copiar cuando el cliente elige Transferencia.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-violet-400" />
                  <span>Fijar Marcador en el Mapa (Toca el mapa para reubicar la tienda):</span>
                </label>

                <MapView
                  store={{ ...store, location: storeCoords }}
                  selectedLocation={storeCoords}
                  onSelectLocation={(coords) => setStoreCoords(coords)}
                  isDraggableTarget={true}
                  targetLabel="Tienda Física"
                  heightClass="h-72 sm:h-80"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="py-3 px-6 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Configuración de la Tienda</span>
                </button>
              </div>
            </form>

            {/* Pre-launch Testing & Clean-up Tools (Admin Protected) */}
            <div className="mt-8 pt-6 border-t border-neutral-800">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400 block mb-1">
                Herramientas de Mantenimiento (Solo Administrador)
              </span>
              <p className="text-xs text-neutral-400 mb-4">
                Utilidades seguras para el administrador. Permite limpiar pedidos de prueba del servidor con doble verificación de seguridad antes de recibir clientes reales.
              </p>

              <div className="flex flex-wrap gap-3">
                {onClearOrders && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser || currentUser.role !== 'admin') {
                        return;
                      }
                      setConfirmPhrase('');
                      setClearError(null);
                      setIsClearModalOpen(true);
                    }}
                    className="py-2.5 px-4 bg-red-950/40 hover:bg-red-950 border border-red-800/60 hover:border-red-500 text-red-300 hover:text-red-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpiar Pedidos de Prueba en Servidor (Doble Confirmación)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: LOYALTY AND POINTS MANAGEMENT */}
      {activeTab === 'puntos' && <LoyaltyManagement currentUser={currentUser} />}

      {/* Add / Edit Product Modal */}
      {isAddingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-7 shadow-2xl text-neutral-100 my-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <h3 className="text-lg font-black text-white">
                {editingProduct ? 'Editar Líquido' : 'Subir Nuevo Líquido'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer"
                aria-label="Cerrar modal de producto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Nombre del Líquido *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Menta Polar Glacial o Mango Freeze"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">Categoría</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="Frutales">Frutales</option>
                    <option value="Mentolados">Mentolados</option>
                    <option value="Postres">Postres</option>
                    <option value="Tabacos">Tabacos</option>
                    <option value="Bebidas">Bebidas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Nicotina (mg)
                  </label>
                  <select
                    value={formNicotine}
                    onChange={(e) => setFormNicotine(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value={0}>0 mg (Sin nicotina)</option>
                    <option value={3}>3 mg (Freebase suave)</option>
                    <option value={6}>6 mg (Freebase medio)</option>
                    <option value={20}>20 mg (Salt suave)</option>
                    <option value={35}>35 mg (Salt medio)</option>
                    <option value={50}>50 mg (Salt fuerte)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Stock Inicial (Porciones) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Precio de Costo (DOP por porción) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              {/* Editable Public Prices */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Precio Tanque Lleno (DOP) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formPriceFullTank}
                    onChange={(e) => setFormPriceFullTank(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-300 mb-1">
                    Precio Medio Tanque (DOP) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formPriceHalfTank}
                    onChange={(e) => setFormPriceHalfTank(Number(e.target.value))}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-cyan-400 font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Photo upload from Desktop/Device, presets, or custom URL */}
              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-neutral-300">
                  Foto del Líquido (Sube desde tu Escritorio con compresión inteligente o elige del catálogo)
                </label>

                {/* Desktop Upload & Live Preview Box */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 rounded-2xl bg-neutral-950 border border-neutral-800">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 shrink-0 flex items-center justify-center mx-auto sm:mx-0">
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="Vista previa"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="w-7 h-7 text-neutral-600" />
                    )}
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const droppedFile = e.dataTransfer?.files?.[0];
                      if (droppedFile) handleImageFileSelect(droppedFile);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 p-3 rounded-xl border-2 border-dashed border-violet-500/40 hover:border-violet-400 bg-violet-950/15 hover:bg-violet-950/30 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/avif,image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageFileSelect(file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <div className="flex items-center gap-1.5 text-violet-300 font-bold text-xs">
                      <Upload className="w-4 h-4 text-violet-400" />
                      <span>
                        {isUploadingImage
                          ? 'Comprimiendo foto para ahorrar memoria...'
                          : 'Subir imagen desde el Escritorio / Celular'}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-400">
                      {uploadedFileName
                        ? `✓ Archivo cargado: ${uploadedFileName}`
                        : 'Haz clic aquí o arrastra una foto (compresión automática WebP)'}
                    </span>
                    {compressionSummary && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-lg mt-0.5">
                        ⚡ {compressionSummary}
                      </span>
                    )}
                  </div>
                </div>

                {imageUploadError && (
                  <p className="text-[11px] text-red-400 font-semibold">{imageUploadError}</p>
                )}

                {/* Preset Thumbnails */}
                <div>
                  <span className="text-[10px] font-semibold text-neutral-400 block mb-1.5">
                    O selecciona una foto del catálogo base:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
                    {PRESET_IMAGES.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setFormImageUrl(img.url);
                          setUploadedFileName(null);
                          setImageUploadError(null);
                        }}
                        className={`h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-neutral-950 p-1 flex items-center justify-center ${
                          formImageUrl === img.url
                            ? 'border-violet-500 scale-105 shadow'
                            : 'border-neutral-800 opacity-60 hover:opacity-100'
                        }`}
                        title={img.name}
                      >
                        <img src={img.url} alt={img.name} className="w-full h-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom URL fallback */}
                <input
                  type="text"
                  placeholder="O pega aquí una URL de imagen externa (https://...)"
                  value={formImageUrl.startsWith('data:image') ? '' : formImageUrl}
                  onChange={(e) => {
                    setFormImageUrl(e.target.value);
                    setUploadedFileName(null);
                  }}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-xs text-neutral-300 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1">
                  Descripción del Sabor (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas de sabor, frescura, dulzor..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="py-3 px-5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-violet-600/30 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Líquido</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOUBLE CONFIRMATION MODAL: Purge Test Orders (Admin Only) */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-md bg-neutral-900 border-2 border-red-600/50 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <span className="p-2.5 rounded-2xl bg-red-500/20 border border-red-500/40">
                <ShieldAlert className="w-6 h-6 text-red-400" />
              </span>
              <div>
                <h3 className="text-base font-black text-white font-urban">
                  ¿Confirmas purgar todos los pedidos?
                </h3>
                <span className="text-[11px] text-red-400 font-bold uppercase tracking-wider block">
                  Acción irreversible • Solo Administrador
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 space-y-2">
              <p>
                Esta acción eliminará de forma permanente <strong>{orders.length} pedidos</strong> registrados en la base de datos (incluyendo historial de estados y líquidos despachados).
              </p>
              <p className="text-amber-400 font-semibold">
                ⚠️ Todas las métricas de ingresos, ganancias y ventas del dashboard volverán a $0 DOP.
              </p>
            </div>

            {clearError && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-semibold">
                {clearError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                Para confirmar la eliminación, escribe la palabra <span className="text-red-400 font-mono">BORRAR</span>:
              </label>
              <input
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="Escribe BORRAR"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2.5 px-3 text-sm text-white font-mono uppercase focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsClearModalOpen(false);
                  setConfirmPhrase('');
                  setClearError(null);
                }}
                disabled={clearLoading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-300 transition-all cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExecuteClearOrders}
                disabled={confirmPhrase.trim().toUpperCase() !== 'BORRAR' || clearLoading}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                  confirmPhrase.trim().toUpperCase() === 'BORRAR' && !clearLoading
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 cursor-pointer active:scale-95'
                    : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearLoading ? 'Eliminando...' : 'Sí, Purgar Pedidos'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
