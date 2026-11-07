import React, { useState, useEffect, useRef } from 'react';
import {
  Product,
  PortionType,
  OrderItem,
  StoreConfig,
  Order,
  VapeVariant,
  StoreCatalogView,
} from '../../types';
import { CartDrawerModal } from './CartDrawerModal';
import { QuickWhatsAppOrderModal } from './QuickWhatsAppOrderModal';
import { playNotificationSound } from '../../utils/storage';
import { generateWhatsAppLink } from '../../utils/whatsapp';
import vapeSmokeAtmosphereImg from '../../assets/images/vape_smoke_atmosphere_1793233367830.jpg';
import {
  Droplet,
  Check,
  Plus,
  AlertTriangle,
  Search,
  ShoppingCart,
  Wind,
  MessageCircle,
  Palette,
  X,
  ArrowRight,
  Crown,
  Truck,
  ShieldCheck,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Cpu,
  Home,
} from 'lucide-react';

interface StoreCatalogProps {
  products: Product[];
  onStartCheckout: (items: OrderItem[]) => void;
  store?: StoreConfig;
  onCreateOrder?: (order: Order) => void;
  activeView?: StoreCatalogView;
  onViewChange?: (view: StoreCatalogView) => void;
  externalSearchQuery?: string;
  onExternalSearchChange?: (q: string) => void;
  onCartCountChange?: (count: number) => void;
  openCartSignal?: number;
}

export const StoreCatalog: React.FC<StoreCatalogProps> = ({
  products,
  onStartCheckout,
  store,
  onCreateOrder,
  activeView,
  onViewChange,
  externalSearchQuery,
  onExternalSearchChange,
  onCartCountChange,
  openCartSignal = 0,
}) => {
  const [internalTab, setInternalTab] = useState<StoreCatalogView>('inicio');
  const activeCatalogTab: StoreCatalogView = activeView ?? internalTab;
  const setActiveCatalogTab = (next: StoreCatalogView) => {
    setInternalTab(next);
    onViewChange?.(next);
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [sortBy, setSortBy] = useState<string>('recomendados');
  const [internalSearch, setInternalSearch] = useState<string>('');
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearch;
  const setSearchQuery = (q: string) => {
    setInternalSearch(q);
    onExternalSearchChange?.(q);
  };

  const [selectedNicotine, setSelectedNicotine] = useState<string>('all');
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<Record<string, string>>(
    {}
  );
  const [heroSlideIndex, setHeroSlideIndex] = useState<number>(0);
  const [homeFilter, setHomeFilter] = useState<'todos' | 'vapes' | 'liquidos' | 'accesorios'>(
    'todos'
  );

  const featuredSectionRef = useRef<HTMLDivElement | null>(null);

  // Immediate Cross-Sell Modal state when a customer adds a Vape
  const [upsellVapeModal, setUpsellVapeModal] = useState<{
    vapeProduct: Product;
    variant?: VapeVariant;
  } | null>(null);
  const [upsellSearch, setUpsellSearch] = useState<string>('');

  const [cartItems, setCartItems] = useState<OrderItem[]>(() => {
    try {
      const raw = localStorage.getItem('vape_cart_items_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [quickWhatsAppState, setQuickWhatsAppState] = useState<{
    product: Product;
    variant?: VapeVariant;
  } | null>(null);

  const categories = ['Todos', 'Frutales', 'Mentolados', 'Bebidas', 'Postres', 'Tabacos'];

  const activeProducts = products.filter((p) => p.isActive);
  const activeVapes = activeProducts.filter((p) => p.productType === 'vape');
  const activeAccessories = activeProducts.filter((p) => p.productType === 'accesorio');
  const activeLiquids = activeProducts.filter(
    (p) => p.productType !== 'vape' && p.productType !== 'accesorio'
  );

  // Open Cart Drawer when triggered from top Navigation bar
  useEffect(() => {
    if (openCartSignal > 0) {
      setIsCartDrawerOpen(true);
    }
  }, [openCartSignal]);

  // Keep cart items synchronized if Admin edits product prices, names, or stock
  useEffect(() => {
    if (!products || products.length === 0) return;
    setCartItems((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const synced = prev
        .map((item) => {
          const prod = products.find((p) => p.id === item.productId);
          if (!prod || !prod.isActive || prod.stockUnits <= 0) {
            changed = true;
            return null;
          }
          const isUnit =
            prod.productType === 'vape' ||
            prod.productType === 'accesorio' ||
            item.productType === 'vape' ||
            item.productType === 'accesorio';
          const matchedVariant =
            isUnit && prod.variants && item.variantId
              ? prod.variants.find((v) => v.id === item.variantId)
              : undefined;
          const maxAvailable = matchedVariant ? matchedVariant.stockUnits : prod.stockUnits;
          if (maxAvailable <= 0) {
            changed = true;
            return null;
          }
          const expectedPrice = isUnit
            ? prod.priceFullTank || 650
            : item.portion === 'tanque_lleno'
            ? prod.priceFullTank || 100
            : prod.priceHalfTank || 50;
          const expectedName =
            isUnit && matchedVariant
              ? `${prod.name} (${matchedVariant.colorName})`
              : prod.name;
          const clampedQty = Math.min(item.quantity, maxAvailable);
          if (
            item.unitPrice !== expectedPrice ||
            item.costPrice !== prod.costPrice ||
            item.productName !== expectedName ||
            item.quantity !== clampedQty
          ) {
            changed = true;
            return {
              ...item,
              productName: expectedName,
              unitPrice: expectedPrice,
              costPrice: prod.costPrice,
              quantity: clampedQty,
            };
          }
          return item;
        })
        .filter(Boolean) as OrderItem[];
      return changed ? synced : prev;
    });
  }, [products]);

  const totalLiquidAmount = cartItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const totalItemsCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  useEffect(() => {
    onCartCountChange?.(totalItemsCount);
    try {
      localStorage.setItem('vape_cart_items_v1', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems, totalItemsCount, onCartCountChange]);

  useEffect(() => {
    const handleClearOnSubmit = () => {
      setCartItems([]);
      try {
        localStorage.removeItem('vape_cart_items_v1');
      } catch {}
    };
    window.addEventListener('vape-order-submitted', handleClearOnSubmit);
    return () => window.removeEventListener('vape-order-submitted', handleClearOnSubmit);
  }, []);

  // Auto-advance hero showcase slides when there are multiple products
  const heroSlides = [
    {
      badge: 'EXPERIENCIA PREMIUM EN VAPERS',
      title: 'BLACK VAPE',
      subtitle: 'EXPERIENCIA PREMIUM EN VAPERS',
      tags: 'Vapers • Líquidos de Recarga • Accesorios',
      ctaText: 'Comprar Ahora',
      targetTab: 'inicio' as StoreCatalogView,
    },
    {
      badge: 'EQUIPOS VAPE ORIGINALES',
      title: 'VAPERS & COLORES',
      subtitle: 'ELIGE TU EQUIPO Y RECÁRGALO AL INSTANTE',
      tags: 'Equipos Multi-Color • Recarga Lista • Delivery en Moto',
      ctaText: 'Ver Vapers',
      targetTab: 'vapes' as StoreCatalogView,
    },
    {
      badge: 'MODALIDAD RECARGA EN SITIO',
      title: 'LÍQUIDOS DE RECARGA',
      subtitle: 'TANQUE LLENO RD$100 • MITAD RD$50',
      tags: 'Frutales • Mentolados • Postres • Sales de Nicotina',
      ctaText: 'Ver Líquidos',
      targetTab: 'liquidos' as StoreCatalogView,
    },
  ];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  const getActiveVariantForVape = (product: Product): VapeVariant | undefined => {
    if (!product.variants || product.variants.length === 0) return undefined;
    const chosenId = selectedVariantByProduct[product.id];
    if (chosenId) {
      const found = product.variants.find((v) => v.id === chosenId);
      if (found) return found;
    }
    return product.variants.find((v) => v.stockUnits > 0) || product.variants[0];
  };

  const handleAddPortion = (product: Product, portion: PortionType) => {
    const totalForProductInCart = cartItems
      .filter((it) => it.productId === product.id)
      .reduce((sum, it) => sum + it.quantity, 0);

    if (totalForProductInCart >= product.stockUnits) {
      playNotificationSound('alert');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vape-smoke-burst', {
            detail: {
              flavor: `⚠️ Stock máximo alcanzado para ${product.name} (${product.stockUnits} disponibles)`,
            },
          })
        );
      }
      return;
    }

    const unitPrice =
      portion === 'tanque_lleno' ? product.priceFullTank || 100 : product.priceHalfTank || 50;
    playNotificationSound('vape-hit');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vape-smoke-burst', {
          detail: {
            flavor: `💨 Agregado: ${product.name} (${
              portion === 'tanque_lleno' ? `Tanque Lleno RD$${unitPrice}` : `Mitad RD$${unitPrice}`
            })`,
          },
        })
      );
    }
    const costPrice = product.costPrice;

    setCartItems((prev) => {
      const currentSum = prev
        .filter((it) => it.productId === product.id)
        .reduce((sum, it) => sum + it.quantity, 0);
      if (currentSum >= product.stockUnits) return prev;

      const existingIdx = prev.findIndex(
        (it) => it.productId === product.id && it.portion === portion && !it.variantId
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + 1 };
        return copy;
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            productName: product.name,
            productType: 'liquido',
            portion,
            unitPrice,
            costPrice,
            quantity: 1,
          },
        ];
      }
    });
  };

  const handleAddUnitProduct = (
    product: Product,
    variant?: VapeVariant,
    openLiquidSuggestion: boolean = true
  ) => {
    const isAccessory = product.productType === 'accesorio';
    const activeVar = variant || getActiveVariantForVape(product);
    const maxStock = activeVar ? activeVar.stockUnits : product.stockUnits;

    const currentInCart = cartItems
      .filter(
        (it) =>
          it.productId === product.id && (activeVar ? it.variantId === activeVar.id : true)
      )
      .reduce((sum, it) => sum + it.quantity, 0);

    if (currentInCart >= maxStock || maxStock <= 0) {
      playNotificationSound('alert');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vape-smoke-burst', {
            detail: {
              flavor: `⚠️ Stock máximo alcanzado para ${product.name}${
                activeVar ? ` (${activeVar.colorName})` : ''
              }`,
            },
          })
        );
      }
      return;
    }

    const unitPrice = product.priceFullTank || 650;
    const displayName = activeVar ? `${product.name} (${activeVar.colorName})` : product.name;

    playNotificationSound('vape-hit');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vape-smoke-burst', {
          detail: {
            flavor: `💨 Agregado al carrito: ${displayName} (RD$${unitPrice})`,
          },
        })
      );
    }

    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) =>
          it.productId === product.id &&
          (activeVar ? it.variantId === activeVar.id : !it.variantId)
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + 1 };
        return copy;
      } else {
        return [
          ...prev,
          {
            productId: product.id,
            productName: displayName,
            productType: isAccessory ? 'accesorio' : 'vape',
            portion: 'tanque_lleno',
            unitPrice,
            costPrice: product.costPrice,
            quantity: 1,
            variantId: activeVar?.id,
            variantColor: activeVar?.colorName,
            variantImage: activeVar?.imageUrl || product.imageUrl,
          },
        ];
      }
    });

    if (!isAccessory && openLiquidSuggestion && activeLiquids.length > 0) {
      setUpsellSearch('');
      setUpsellVapeModal({ vapeProduct: product, variant: activeVar });
    }
  };

  const handleRemovePortion = (productId: string, portion: PortionType, variantId?: string) => {
    playNotificationSound('pop');
    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) =>
          it.productId === productId &&
          it.portion === portion &&
          (variantId ? it.variantId === variantId : !it.variantId)
      );
      if (existingIdx >= 0) {
        const copy = [...prev];
        if (copy[existingIdx].quantity > 1) {
          copy[existingIdx].quantity -= 1;
          return copy;
        } else {
          return copy.filter((_, idx) => idx !== existingIdx);
        }
      }
      return prev;
    });
  };

  const handleUpdateQuantity = (
    productId: string,
    portion: PortionType,
    delta: number,
    variantId?: string
  ) => {
    if (delta > 0) {
      const product = products.find((p) => p.id === productId);
      if (!product) return;
      if (product.productType === 'vape' || product.productType === 'accesorio') {
        const variant = product.variants?.find((v) => v.id === variantId);
        handleAddUnitProduct(product, variant, false);
      } else {
        handleAddPortion(product, portion);
      }
    } else {
      handleRemovePortion(productId, portion, variantId);
    }
  };

  const getCartQuantity = (productId: string, portion: PortionType, variantId?: string) => {
    const item = cartItems.find(
      (it) =>
        it.productId === productId &&
        it.portion === portion &&
        (variantId ? it.variantId === variantId : !it.variantId)
    );
    return item ? item.quantity : 0;
  };

  // Filter products for current tab or search
  const filteredProducts = activeProducts
    .filter((p) => {
      const isVape = p.productType === 'vape';
      const isAccessory = p.productType === 'accesorio';
      const isLiquid = !isVape && !isAccessory;

      // When user types a search query, search across all products if on 'inicio', or within the selected tab
      if (activeCatalogTab === 'vapes' && !isVape) return false;
      if (activeCatalogTab === 'accesorios' && !isAccessory) return false;
      if (activeCatalogTab === 'liquidos' && !isLiquid) return false;

      if (activeCatalogTab === 'liquidos') {
        if (
          selectedCategory !== 'Todos' &&
          p.flavorCategory.toLowerCase() !== selectedCategory.toLowerCase()
        ) {
          return false;
        }
        if (selectedNicotine === 'low' && p.nicotineMg > 6) return false;
        if (selectedNicotine === 'medium' && (p.nicotineMg <= 6 || p.nicotineMg > 35))
          return false;
        if (selectedNicotine === 'high' && (p.nicotineMg < 50 || p.nicotineMg > 55)) return false;
        if (selectedNicotine === '70' && p.nicotineMg !== 70) return false;
        if (selectedNicotine === '100' && p.nicotineMg !== 100) return false;
        if (selectedNicotine === 'extreme' && p.nicotineMg < 70) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchCat = p.flavorCategory.toLowerCase().includes(q);
        const matchColor = p.variants?.some((v) => v.colorName.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchCat && !matchColor) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'precio_asc') return a.priceFullTank - b.priceFullTank;
      if (sortBy === 'precio_desc') return b.priceFullTank - a.priceFullTank;
      if (sortBy === 'nombre_asc') return a.name.localeCompare(b.name);
      return 0;
    });

  const handleOpenWhatsAppSupport = () => {
    const phone = store?.whatsapp || store?.phone || '8092104901';
    const url = generateWhatsAppLink(
      phone,
      '¡Hola BLACK VAPE! Quisiera información sobre sus vapers, líquidos de recarga y accesorios disponibles.'
    );
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Reusable Product Card (Mobile 2-Column App Style + Desktop Card Style from Reference Image)
  // Uses ONLY compatible fields: Real Stock/Category info, Real Photo, Color Swatches, Real RD$ Price, Add to Cart & WhatsApp
  const renderProductCard = (product: Product) => {
    const isVape = product.productType === 'vape';
    const isAccessory = product.productType === 'accesorio';
    const isUnit = isVape || isAccessory;

    if (isUnit) {
      const activeVar = getActiveVariantForVape(product);
      const displayImage = activeVar?.imageUrl || product.imageUrl;
      const varStock = activeVar ? activeVar.stockUnits : product.stockUnits;
      const isOutOfStock = product.stockUnits <= 0 || varStock <= 0;
      const unitCartCount = getCartQuantity(product.id, 'tanque_lleno', activeVar?.id);

      return (
        <div
          key={product.id}
          className={`group relative bg-[#08130e]/95 hover:bg-[#0c1c15] border border-emerald-500/25 hover:border-emerald-400/70 rounded-2xl sm:rounded-3xl p-3 sm:p-4 transition-all duration-200 flex flex-col justify-between shadow-lg hover:shadow-emerald-950/50 hover:-translate-y-0.5 ${
            isOutOfStock ? 'opacity-60' : ''
          }`}
        >
          <div>
            {/* Product Image Container */}
            <div className="relative w-full h-40 sm:h-52 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-b from-[#0d1f17] to-[#050b08] mb-2.5 sm:mb-3 border border-emerald-900/40 flex items-center justify-center">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={`${product.name} ${activeVar?.colorName || ''}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                  }}
                />
              ) : (
                <Wind className="w-10 h-10 text-emerald-500/40" />
              )}

              {/* Top-left Stock / Category indicator */}
              <div className="absolute top-2 left-2">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-neutral-950 text-[9px] sm:text-[10px] font-black uppercase tracking-wide shadow">
                  {isAccessory ? 'Accesorio' : 'Vaper'}
                </span>
              </div>

              {/* Top-right Quick WhatsApp Order icon button */}
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => setQuickWhatsAppState({ product, variant: activeVar })}
                title="Pedir directo por WhatsApp"
                className="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/75 hover:bg-emerald-500 text-emerald-400 hover:text-neutral-950 border border-emerald-500/40 flex items-center justify-center transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Bottom stock indicator */}
              <div className="absolute bottom-1.5 right-2">
                {varStock <= 0 ? (
                  <span className="text-[9px] sm:text-[10px] font-bold text-red-400 bg-black/80 px-1.5 py-0.5 rounded">
                    Agotado
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-300/90 bg-black/75 px-1.5 py-0.5 rounded tabular-nums">
                    Stock: {varStock}
                  </span>
                )}
              </div>
            </div>

            {/* Product Title & Clean Metadata */}
            <h3 className="font-black text-xs sm:text-base text-white group-hover:text-emerald-300 transition-colors font-urban line-clamp-1">
              {product.name}
            </h3>

            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-neutral-400 mt-0.5">
              <span className="truncate">{product.flavorCategory || 'Equipos Vape'}</span>
              {activeVar && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300 font-medium truncate">
                    {activeVar.colorName}
                  </span>
                </>
              )}
            </div>

            {/* Compact Color Variant Swatches */}
            {product.variants && product.variants.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {product.variants.map((v, vIdx) => {
                  const isSelected = activeVar?.id === v.id;
                  const out = v.stockUnits <= 0;
                  const sameNameCount = product.variants!.filter(
                    (other) =>
                      other.colorName.trim().toLowerCase() === v.colorName.trim().toLowerCase()
                  ).length;
                  const displayColorName =
                    sameNameCount > 1 ? `${v.colorName} #${vIdx + 1}` : v.colorName;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() =>
                        setSelectedVariantByProduct((prev) => ({
                          ...prev,
                          [product.id]: v.id,
                        }))
                      }
                      className={`py-0.5 px-2 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 border ${
                        isSelected
                          ? 'bg-emerald-950 border-emerald-400 text-white'
                          : out
                          ? 'bg-black/40 border-neutral-800 text-neutral-500 opacity-50'
                          : 'bg-black/60 border-neutral-800 text-neutral-300 hover:border-emerald-500/40'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
                        style={{ backgroundColor: v.colorHex || '#10b981' }}
                      />
                      <span className="truncate max-w-[68px]">{displayColorName}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Price & Add to Cart Action (Matches Reference Image) */}
          <div className="mt-2.5 sm:mt-3 pt-2 border-t border-emerald-950/80 space-y-2">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-sm sm:text-lg font-black text-white font-urban tabular-nums">
                RD${product.priceFullTank.toLocaleString()}
              </span>
              {isVape && activeLiquids.length > 0 && (
                <span className="text-[9px] sm:text-[10px] text-emerald-400 font-semibold hidden sm:inline">
                  + Recarga opcional
                </span>
              )}
            </div>

            {unitCartCount === 0 ? (
              <button
                type="button"
                disabled={isOutOfStock}
                onClick={() => handleAddUnitProduct(product, activeVar, isVape)}
                className="w-full min-h-[38px] sm:min-h-[42px] py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-white font-black text-[11px] sm:text-xs transition-all active:scale-95 shadow-md shadow-emerald-950 cursor-pointer flex items-center justify-center gap-1.5 border border-emerald-400/40"
              >
                <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                <span className=" sm:hidden">Agregar</span>
                <span className="hidden sm:inline">Agregar al carrito</span>
              </button>
            ) : (
              <div className="flex items-center justify-between bg-[#050b08] border border-emerald-500/60 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => handleRemovePortion(product.id, 'tanque_lleno', activeVar?.id)}
                  className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-white font-black text-sm cursor-pointer rounded-lg hover:bg-emerald-950/60"
                >
                  -
                </button>
                <span className="text-xs font-black text-emerald-400 px-2 font-urban tabular-nums">
                  {unitCartCount} en carrito
                </span>
                <button
                  type="button"
                  onClick={() => handleAddUnitProduct(product, activeVar, isVape)}
                  className="w-8 h-8 flex items-center justify-center text-neutral-300 hover:text-white font-black text-sm cursor-pointer rounded-lg hover:bg-emerald-950/60"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // LIQUID PRODUCT CARD (Supports Full Tank $100 / Half Tank $50 in compact 2-col mobile & 4-col desktop)
    const fullCount = getCartQuantity(product.id, 'tanque_lleno');
    const halfCount = getCartQuantity(product.id, 'mitad');
    const isOutOfStock = product.stockUnits <= 0;
    const fullPrice = product.priceFullTank || 100;
    const halfPrice = product.priceHalfTank || 50;

    return (
      <div
        key={product.id}
        className={`group relative bg-[#08130e]/95 hover:bg-[#0c1c15] border border-emerald-500/25 hover:border-emerald-400/70 rounded-2xl sm:rounded-3xl p-3 sm:p-4 transition-all duration-200 flex flex-col justify-between shadow-lg hover:shadow-emerald-950/50 hover:-translate-y-0.5 ${
          isOutOfStock ? 'opacity-60' : ''
        }`}
      >
        <div>
          {/* Product Image Container */}
          <div className="relative w-full h-40 sm:h-52 rounded-xl sm:rounded-2xl overflow-hidden bg-gradient-to-b from-[#0d1f17] to-[#050b08] mb-2.5 sm:mb-3 border border-emerald-900/40 flex items-center justify-center">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                }}
              />
            ) : (
              <Droplet className="w-10 h-10 text-emerald-500/40" />
            )}

            {/* Top-left Nicotine / Category tag */}
            <div className="absolute top-2 left-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-neutral-950 text-[9px] sm:text-[10px] font-black uppercase tracking-wide shadow tabular-nums">
                {product.nicotineMg}mg Salt
              </span>
            </div>

            {/* Top-right Quick WhatsApp Order icon button */}
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => setQuickWhatsAppState({ product })}
              title="Pedir este líquido por WhatsApp"
              className="absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-black/75 hover:bg-emerald-500 text-emerald-400 hover:text-neutral-950 border border-emerald-500/40 flex items-center justify-center transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Bottom stock indicator */}
            <div className="absolute bottom-1.5 right-2">
              {product.stockUnits <= 3 ? (
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-300 bg-black/80 px-1.5 py-0.5 rounded flex items-center gap-0.5 tabular-nums">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                  Quedan {product.stockUnits}
                </span>
              ) : (
                <span className="text-[9px] sm:text-[10px] font-semibold text-emerald-300/90 bg-black/75 px-1.5 py-0.5 rounded tabular-nums">
                  Stock: {product.stockUnits}
                </span>
              )}
            </div>
          </div>

          {/* Title & Clean Metadata */}
          <h3 className="font-black text-xs sm:text-base text-white group-hover:text-emerald-300 transition-colors font-urban line-clamp-1">
            {product.name}
          </h3>

          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-neutral-400 mt-0.5">
            <span className="truncate">{product.flavorCategory}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400 font-medium truncate">Recarga en sitio</span>
          </div>
        </div>

        {/* Liquid Price & Portion Action Buttons */}
        <div className="mt-2.5 sm:mt-3 pt-2 border-t border-emerald-950/80 space-y-1.5">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-sm sm:text-lg font-black text-white font-urban tabular-nums">
              RD${fullPrice}
            </span>
            <span className="text-[10px] sm:text-xs text-emerald-400 font-bold tabular-nums">
              Mitad RD${halfPrice}
            </span>
          </div>

          {/* Primary Button: Tanque Lleno */}
          {fullCount === 0 ? (
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => handleAddPortion(product, 'tanque_lleno')}
              className="w-full min-h-[36px] sm:min-h-[40px] py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-white font-black text-[11px] sm:text-xs transition-all active:scale-95 shadow-md shadow-emerald-950 cursor-pointer flex items-center justify-center gap-1 border border-emerald-400/40"
            >
              <ShoppingCart className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>Lleno RD${fullPrice}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between bg-[#050b08] border border-emerald-500/60 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => handleRemovePortion(product.id, 'tanque_lleno')}
                className="w-7 h-7 flex items-center justify-center text-neutral-300 hover:text-white font-black text-xs cursor-pointer rounded-lg hover:bg-emerald-950/60"
              >
                -
              </button>
              <span className="text-[11px] font-black text-emerald-400 px-1 font-urban tabular-nums">
                Lleno: {fullCount}
              </span>
              <button
                type="button"
                onClick={() => handleAddPortion(product, 'tanque_lleno')}
                className="w-7 h-7 flex items-center justify-center text-neutral-300 hover:text-white font-black text-xs cursor-pointer rounded-lg hover:bg-emerald-950/60"
              >
                +
              </button>
            </div>
          )}

          {/* Secondary Compact Button: Mitad de Tanque */}
          {halfCount === 0 ? (
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={() => handleAddPortion(product, 'mitad')}
              className="w-full py-1.5 px-2 rounded-lg bg-[#050b08] hover:bg-emerald-950/60 disabled:opacity-40 text-emerald-300 border border-emerald-500/30 text-[10px] sm:text-[11px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Mitad Tanque RD${halfPrice}</span>
            </button>
          ) : (
            <div className="flex items-center justify-between bg-[#050b08] border border-teal-500/50 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => handleRemovePortion(product.id, 'mitad')}
                className="w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-white font-black text-xs cursor-pointer rounded"
              >
                -
              </button>
              <span className="text-[10px] font-black text-teal-300 px-1 font-urban tabular-nums">
                Mitad: {halfCount}
              </span>
              <button
                type="button"
                onClick={() => handleAddPortion(product, 'mitad')}
                className="w-6 h-6 flex items-center justify-center text-neutral-300 hover:text-white font-black text-xs cursor-pointer rounded"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const currentHero = heroSlides[heroSlideIndex] || heroSlides[0];
  const showcaseVape = activeVapes[0];
  const showcaseSecondVape = activeVapes[1];
  const showcaseLiquid = activeLiquids[0];
  const showcaseSecondLiquid = activeLiquids[1];
  const showcaseAccessory = activeAccessories[0];

  // Build up to 3 showcase items for the Hero glowing emerald pedestal
  const pedestalItems = [
    showcaseVape,
    showcaseSecondVape || showcaseSecondLiquid,
    showcaseLiquid,
  ].filter(Boolean) as Product[];

  // Featured / Best-Selling mix (interleave vapes, liquids, and accessories for the top "Más Vendidos" section)
  const featuredMix: Product[] = [];
  const maxFeatured = Math.min(8, activeProducts.length);
  const pool = [...activeVapes, ...activeLiquids, ...activeAccessories];
  for (const item of pool) {
    if (featuredMix.length < maxFeatured && !featuredMix.some((f) => f.id === item.id)) {
      featuredMix.push(item);
    }
  }

  return (
    <div className="space-y-5 sm:space-y-7 relative">
      {/* MOBILE-FIRST SEARCH BAR & CATEGORY PILLS (Matches Mobile App Reference Mockup) */}
      <div className="sm:hidden space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar productos (vapers, líquidos, accesorios...)"
            className="w-full bg-[#091510]/95 border border-emerald-500/35 focus:border-emerald-400 rounded-full py-2.5 pl-10 pr-9 text-xs text-white placeholder-neutral-400 focus:outline-none shadow-lg"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mobile Quick Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveCatalogTab('inicio')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              activeCatalogTab === 'inicio'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'bg-[#091510] text-neutral-300 border border-emerald-500/25'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Inicio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCatalogTab('vapes')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              activeCatalogTab === 'vapes'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'bg-[#091510] text-neutral-300 border border-emerald-500/25'
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Vapers ({activeVapes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCatalogTab('liquidos')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              activeCatalogTab === 'liquidos'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'bg-[#091510] text-neutral-300 border border-emerald-500/25'
            }`}
          >
            <Droplet className="w-3.5 h-3.5" />
            <span>Líquidos ({activeLiquids.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveCatalogTab('accesorios')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
              activeCatalogTab === 'accesorios'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-neutral-950 font-black shadow-md shadow-emerald-500/30'
                : 'bg-[#091510] text-neutral-300 border border-emerald-500/25'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Accesorios ({activeAccessories.length})</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: INICIO (Everything in one mobile-first & desktop storefront)
         ===================================================================== */}
      {activeCatalogTab === 'inicio' && !searchQuery.trim() ? (
        <div className="space-y-5 sm:space-y-8">
          {/* 1. HERO BANNER SHOWCASE (Matches Reference Image Desktop & Mobile) */}
          <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-emerald-500/40 bg-gradient-to-r from-[#040a07] via-[#081811] to-[#040a07] shadow-2xl shadow-black/90">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen pointer-events-none"
              style={{ backgroundImage: `url(${vapeSmokeAtmosphereImg})` }}
            />
            <div className="absolute -top-24 -left-24 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-80 h-80 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />

            {/* Left / Right Slide Arrows (Desktop) */}
            <button
              type="button"
              onClick={() =>
                setHeroSlideIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
              }
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-emerald-500/80 border border-emerald-500/40 text-white hover:text-neutral-950 items-center justify-center transition-all cursor-pointer"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-emerald-500/80 border border-emerald-500/40 text-white hover:text-neutral-950 items-center justify-center transition-all cursor-pointer"
              aria-label="Siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div className="relative px-3.5 py-4 sm:px-14 sm:py-10 grid grid-cols-12 items-center gap-2 sm:gap-6">
              {/* Left Text Column (7 cols on mobile & desktop so mobile matches the side-by-side reference layout) */}
              <div className="col-span-7 lg:col-span-7 space-y-1.5 sm:space-y-4 text-left z-10 min-w-0">
                <div className="inline-flex items-center gap-1.5 text-emerald-400">
                  <Crown className="w-4 h-4 sm:w-8 sm:h-8 stroke-[2.2] drop-shadow-[0_0_10px_rgba(16,185,129,0.6)] shrink-0" />
                  <span className="text-[9px] sm:text-xs font-bold uppercase tracking-widest text-emerald-300/90 hidden sm:inline">
                    {currentHero.badge}
                  </span>
                </div>

                <h1 className="text-[15px] sm:text-4xl lg:text-5xl font-black italic tracking-tight text-white font-urban leading-[1.1]">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-400">
                    {currentHero.title}
                  </span>
                  <span className="block text-[11px] sm:text-2xl lg:text-3xl not-italic font-extrabold text-white mt-0.5 sm:mt-1 leading-tight">
                    {currentHero.subtitle}
                  </span>
                </h1>

                <p className="text-[9.5px] sm:text-sm text-neutral-300 font-medium line-clamp-2 leading-snug">
                  {currentHero.tags}
                </p>

                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentHero.targetTab !== 'inicio') {
                        setActiveCatalogTab(currentHero.targetTab);
                      } else {
                        featuredSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    className="py-2 sm:py-3 px-3.5 sm:px-7 rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-neutral-950 font-black text-[11px] sm:text-sm shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
                    <span>{currentHero.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
                  </button>
                </div>
              </div>

              {/* Right Visual Product Pedestal with Glowing Emerald Neon Ring */}
              <div className="col-span-5 lg:col-span-5 flex flex-col items-center justify-center relative">
                <div className="relative w-32 h-32 sm:w-72 sm:h-56 flex items-center justify-center">
                  {/* Glowing Neon Emerald Ring */}
                  <div className="absolute w-28 h-28 sm:w-52 sm:h-52 rounded-full border-[2px] sm:border-[3px] border-emerald-400/85 shadow-[0_0_30px_rgba(16,185,129,0.7),inset_0_0_20px_rgba(16,185,129,0.35)] pointer-events-none" />

                  {/* Product Showcase Images from Real Catalog */}
                  <div className="relative z-10 flex items-end justify-center gap-1.5 sm:gap-3 px-1">
                    {pedestalItems.length > 0 ? (
                      pedestalItems.map((item, idx) => (
                        <div
                          key={item.id}
                          onClick={() =>
                            setActiveCatalogTab(
                              item.productType === 'vape'
                                ? 'vapes'
                                : item.productType === 'accesorio'
                                ? 'accesorios'
                                : 'liquidos'
                            )
                          }
                          className={`cursor-pointer transition-transform duration-300 hover:scale-105 rounded-xl sm:rounded-2xl overflow-hidden border border-emerald-400/50 bg-[#050b08] shadow-[0_10px_25px_rgba(0,0,0,0.95)] ${
                            pedestalItems.length === 2
                              ? idx === 0
                                ? 'w-14 h-20 sm:w-28 sm:h-36 -rotate-3 z-20'
                                : 'w-14 h-20 sm:w-28 sm:h-36 rotate-3 z-10'
                              : idx === 1
                              ? 'w-14 h-22 sm:w-28 sm:h-40 z-20 -translate-y-1'
                              : 'w-12 h-18 sm:w-24 sm:h-34 z-10 opacity-95'
                          }`}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                            }}
                          />
                        </div>
                      ))
                    ) : (
                      <img
                        src="/logo-black-vape.jpeg"
                        alt="BLACK VAPE"
                        className="w-20 h-20 sm:w-40 sm:h-40 rounded-full object-cover border-2 border-emerald-400 shadow-2xl"
                      />
                    )}
                  </div>

                  {/* Glowing Pedestal Base */}
                  <div className="absolute bottom-0.5 w-28 sm:w-64 h-2.5 sm:h-4 rounded-full bg-gradient-to-r from-emerald-950 via-emerald-400/70 to-emerald-950 blur-[1px] border border-emerald-300/70 shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
                </div>
              </div>
            </div>

            {/* Slide Indicator Dots */}
            <div className="relative pb-2.5 sm:pb-3 flex items-center justify-center gap-2">
              {heroSlides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setHeroSlideIndex(idx)}
                  aria-label={`Ir a diapositiva ${idx + 1}`}
                  className={`h-1.5 sm:h-2 rounded-full transition-all cursor-pointer ${
                    heroSlideIndex === idx
                      ? 'w-5 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                      : 'w-2 bg-neutral-600 hover:bg-neutral-400'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 2. 4-ITEM TRUST & BENEFITS BAR (Matches Both Mobile & Desktop Reference Image) */}
          <div className="grid grid-cols-4 gap-1 sm:gap-4 p-2 sm:p-4 rounded-2xl bg-[#07120d]/95 border border-emerald-500/25 shadow-lg">
            <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 px-0.5 sm:px-3 py-1 border-r border-emerald-900/40">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Truck className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
              <div>
                <span className="font-bold text-[9.5px] sm:text-xs text-white block leading-tight">
                  Delivery rápido
                </span>
                <span className="text-[9px] sm:text-[11px] text-neutral-400 hidden sm:block">
                  En tu zona (1.5km = RD$25)
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 px-0.5 sm:px-3 py-1 border-r border-emerald-900/40">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
              <div>
                <span className="font-bold text-[9.5px] sm:text-xs text-white block leading-tight">
                  Compra segura
                </span>
                <span className="text-[9px] sm:text-[11px] text-neutral-400 hidden sm:block">
                  Tus datos protegidos
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 px-0.5 sm:px-3 py-1 border-r border-emerald-900/40">
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <PackageCheck className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
              <div>
                <span className="font-bold text-[9.5px] sm:text-xs text-white block leading-tight">
                  Originales
                </span>
                <span className="text-[9px] sm:text-[11px] text-neutral-400 hidden sm:block">
                  Marcas 100% auténticas
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenWhatsAppSupport}
              className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 px-0.5 sm:px-3 py-1 hover:bg-emerald-950/40 rounded-xl transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <MessageCircle className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
              <div>
                <span className="font-bold text-[9.5px] sm:text-xs text-white block leading-tight">
                  Soporte WhatsApp
                </span>
                <span className="text-[9px] sm:text-[11px] text-emerald-400 hidden sm:block">
                  Te ayudamos siempre
                </span>
              </div>
            </button>
          </div>

          {/* 3. EXPLORA POR CATEGORÍA (Structured 2-Zone Cards with Zero Overlap on Mobile & Desktop) */}
          <div className="space-y-2.5 sm:space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                <h2 className="text-sm sm:text-xl font-black text-white font-urban">
                  Explora por Categoría
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveCatalogTab('vapes')}
                className="text-[11px] sm:text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                <span>Ver todas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {/* Category 1: Vapers */}
              <button
                type="button"
                onClick={() => setActiveCatalogTab('vapes')}
                className="group relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#0b1f16] to-[#050b08] border border-emerald-500/30 hover:border-emerald-400 p-2 sm:p-3 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-950/60 hover:-translate-y-0.5"
              >
                {/* Top Visual Stage (No overlap with footer title or arrow) */}
                <div className="relative w-full h-20 sm:h-28 rounded-xl overflow-hidden bg-[#040906] border border-emerald-500/20 flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_70%)] pointer-events-none" />
                  {showcaseVape?.imageUrl ? (
                    <>
                      <img
                        src={showcaseVape.imageUrl}
                        alt="Vapers"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050b08]/85 via-transparent to-black/30 pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center">
                      <Wind className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
                    </div>
                  )}

                  {/* Top-left floating badge */}
                  <span className="absolute top-1.5 left-1.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-emerald-500/40 text-[8.5px] sm:text-[10px] font-black text-emerald-300 tabular-nums shadow">
                    {activeVapes.length} {activeVapes.length === 1 ? 'equipo' : 'equipos'}
                  </span>
                </div>

                {/* Bottom Footer Bar: Title + Arrow cleanly separated */}
                <div className="pt-2 sm:pt-2.5 px-0.5 flex items-center justify-between gap-1 w-full">
                  <div className="min-w-0">
                    <span className="font-black text-xs sm:text-base text-white group-hover:text-emerald-300 transition-colors font-urban block truncate">
                      Vapers
                    </span>
                    <span className="hidden sm:block text-[11px] text-neutral-400 truncate">
                      Equipos & colores
                    </span>
                  </div>
                  <span className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-neutral-950 group-hover:border-emerald-300 transition-all shrink-0">
                    <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                  </span>
                </div>
              </button>

              {/* Category 2: Líquidos */}
              <button
                type="button"
                onClick={() => setActiveCatalogTab('liquidos')}
                className="group relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#0b1f16] to-[#050b08] border border-emerald-500/30 hover:border-emerald-400 p-2 sm:p-3 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-950/60 hover:-translate-y-0.5"
              >
                {/* Top Visual Stage */}
                <div className="relative w-full h-20 sm:h-28 rounded-xl overflow-hidden bg-[#040906] border border-emerald-500/20 flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_70%)] pointer-events-none" />
                  {showcaseLiquid?.imageUrl ? (
                    <>
                      <img
                        src={showcaseLiquid.imageUrl}
                        alt="Líquidos"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050b08]/85 via-transparent to-black/30 pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center">
                      <Droplet className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
                    </div>
                  )}

                  {/* Top-left floating badge */}
                  <span className="absolute top-1.5 left-1.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-emerald-500/40 text-[8.5px] sm:text-[10px] font-black text-emerald-300 tabular-nums shadow">
                    RD$100 / $50
                  </span>
                </div>

                {/* Bottom Footer Bar: Title + Arrow cleanly separated */}
                <div className="pt-2 sm:pt-2.5 px-0.5 flex items-center justify-between gap-1 w-full">
                  <div className="min-w-0">
                    <span className="font-black text-xs sm:text-base text-white group-hover:text-emerald-300 transition-colors font-urban block truncate">
                      Líquidos
                    </span>
                    <span className="hidden sm:block text-[11px] text-neutral-400 truncate">
                      Recarga en sitio
                    </span>
                  </div>
                  <span className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-neutral-950 group-hover:border-emerald-300 transition-all shrink-0">
                    <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                  </span>
                </div>
              </button>

              {/* Category 3: Accesorios */}
              <button
                type="button"
                onClick={() => setActiveCatalogTab('accesorios')}
                className="group relative rounded-2xl overflow-hidden bg-gradient-to-b from-[#0b1f16] to-[#050b08] border border-emerald-500/30 hover:border-emerald-400 p-2 sm:p-3 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-950/60 hover:-translate-y-0.5"
              >
                {/* Top Visual Stage */}
                <div className="relative w-full h-20 sm:h-28 rounded-xl overflow-hidden bg-[#040906] border border-emerald-500/20 flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_70%)] pointer-events-none" />
                  {showcaseAccessory?.imageUrl ? (
                    <>
                      <img
                        src={showcaseAccessory.imageUrl}
                        alt="Accesorios"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/logo-black-vape.jpeg';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050b08]/85 via-transparent to-black/30 pointer-events-none" />
                    </>
                  ) : (
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-emerald-500/15 border border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center">
                      <Cpu className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-400 group-hover:scale-110 transition-transform" />
                    </div>
                  )}

                  {/* Top-left floating badge */}
                  <span className="absolute top-1.5 left-1.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-emerald-500/40 text-[8.5px] sm:text-[10px] font-black text-emerald-300 tabular-nums shadow">
                    {activeAccessories.length > 0
                      ? `${activeAccessories.length} disp.`
                      : 'Pods & Coils'}
                  </span>
                </div>

                {/* Bottom Footer Bar: Title + Arrow cleanly separated */}
                <div className="pt-2 sm:pt-2.5 px-0.5 flex items-center justify-between gap-1 w-full">
                  <div className="min-w-0">
                    <span className="font-black text-xs sm:text-base text-white group-hover:text-emerald-300 transition-colors font-urban block truncate">
                      Accesorios
                    </span>
                    <span className="hidden sm:block text-[11px] text-neutral-400 truncate">
                      Pods & repuestos
                    </span>
                  </div>
                  <span className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-neutral-950 group-hover:border-emerald-300 transition-all shrink-0">
                    <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* 4. PRODUCTOS DESTACADOS & MÁS VENDIDOS (2-Column Mobile Grid / 4-Column Desktop Grid) */}
          <div ref={featuredSectionRef} className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  <h2 className="text-sm sm:text-xl font-black text-white font-urban">
                    Productos Destacados & Más Vendidos
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('liquidos')}
                  className="sm:hidden text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver más</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Quick Filter Pills inside Productos Destacados */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
                {[
                  { id: 'todos', label: `Todos (${activeProducts.length})` },
                  { id: 'vapes', label: `Vapers (${activeVapes.length})` },
                  { id: 'liquidos', label: `Líquidos (${activeLiquids.length})` },
                  { id: 'accesorios', label: `Accesorios (${activeAccessories.length})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setHomeFilter(pill.id as any)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                      homeFilter === pill.id
                        ? 'bg-emerald-500 text-neutral-950 font-black shadow-sm shadow-emerald-500/30'
                        : 'bg-[#08130e] text-neutral-300 hover:text-white border border-emerald-500/25'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const displayedHomeProducts = featuredMix.filter((p) => {
                if (homeFilter === 'vapes') return p.productType === 'vape';
                if (homeFilter === 'accesorios') return p.productType === 'accesorio';
                if (homeFilter === 'liquidos')
                  return p.productType !== 'vape' && p.productType !== 'accesorio';
                return true;
              });

              if (displayedHomeProducts.length === 0) {
                return (
                  <div className="py-10 px-4 text-center text-neutral-400 text-xs sm:text-sm bg-[#07120d] rounded-2xl border border-emerald-900/40 space-y-2">
                    <p className="font-bold text-white">
                      {activeProducts.length === 0
                        ? 'Cargando catálogo desde la base de datos...'
                        : `No hay productos registrados en la categoría seleccionada.`}
                    </p>
                    {homeFilter !== 'todos' && (
                      <button
                        type="button"
                        onClick={() => setHomeFilter('todos')}
                        className="mt-1 px-3.5 py-1.5 rounded-full bg-emerald-500 text-neutral-950 font-black text-xs cursor-pointer"
                      >
                        Ver todos los productos ({activeProducts.length})
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
                  {displayedHomeProducts.map((product) => renderProductCard(product))}
                </div>
              );
            })()}
          </div>

          {/* 5. EXTRA VAPERS SECTION (Only shown when there are additional Vapes beyond Featured) */}
          {activeVapes.length > 4 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  <h2 className="text-sm sm:text-xl font-black text-white font-urban">
                    Más Equipos Vape
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('vapes')}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver todos ({activeVapes.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
                {activeVapes.slice(0, 4).map((vape) => renderProductCard(vape))}
              </div>
            </div>
          )}

          {/* 6. EXTRA LÍQUIDOS SECTION (Only shown when there are additional Liquids beyond Featured) */}
          {activeLiquids.length > 4 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplet className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                  <h2 className="text-sm sm:text-xl font-black text-white font-urban">
                    Catálogo de Líquidos de Recarga
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('liquidos')}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver todos ({activeLiquids.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
                {activeLiquids.slice(0, 4).map((liquid) => renderProductCard(liquid))}
              </div>
            </div>
          )}

          {/* 7. PROMOTIONAL HIGHLIGHT CARDS FOR REAL STORE SECTIONS (Vapers & Líquidos) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {/* Promo Card 1: Vapers & Colores */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r from-[#071610] via-[#0b2218] to-[#06120d] border border-emerald-500/35 p-4 sm:p-6 flex items-center justify-between gap-3 shadow-xl">
              <div className="space-y-1.5 sm:space-y-2 z-10 max-w-[68%]">
                <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-400 block">
                  SECCIÓN DE VAPERS
                </span>
                <h3 className="text-base sm:text-2xl font-black italic text-white font-urban leading-tight">
                  EQUIPOS VAPE & COLORES
                </h3>
                <p className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed">
                  Elige tu color favorito y agrégale su recarga de líquido al instante.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('vapes')}
                  className="mt-1 inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3.5 sm:px-4 rounded-full bg-emerald-950/90 hover:bg-emerald-500 text-emerald-300 hover:text-neutral-950 border border-emerald-400/50 text-[11px] sm:text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Explorar Vapers</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {showcaseVape?.imageUrl ? (
                <div className="w-20 h-24 sm:w-28 sm:h-32 rounded-xl sm:rounded-2xl overflow-hidden border border-emerald-500/40 bg-[#040906] shadow-2xl shrink-0">
                  <img
                    src={showcaseVape.imageUrl}
                    alt="Equipos Vape"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <Wind className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-400/40 shrink-0" />
              )}
            </div>

            {/* Promo Card 2: Recarga de Líquidos en Sitio */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-r from-[#071610] via-[#0d241a] to-[#06120d] border border-emerald-500/35 p-4 sm:p-6 flex items-center justify-between gap-3 shadow-xl">
              <div className="space-y-1.5 sm:space-y-2 z-10 max-w-[68%]">
                <span className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-widest text-emerald-400 block">
                  MODALIDAD RECARGA EN SITIO
                </span>
                <h3 className="text-base sm:text-2xl font-black italic text-white font-urban leading-tight">
                  RECARGA TU TANQUE AL TOQUE
                </h3>
                <p className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed">
                  Tanque Lleno <strong className="text-emerald-400">RD$100</strong> • Mitad{' '}
                  <strong className="text-emerald-300">RD$50</strong> dispensado directo en tu vape.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveCatalogTab('liquidos')}
                  className="mt-1 inline-flex items-center gap-1.5 py-1.5 sm:py-2 px-3.5 sm:px-4 rounded-full bg-emerald-950/90 hover:bg-emerald-500 text-emerald-300 hover:text-neutral-950 border border-emerald-400/50 text-[11px] sm:text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Ver Líquidos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {showcaseLiquid?.imageUrl ? (
                <div className="w-20 h-24 sm:w-28 sm:h-32 rounded-xl sm:rounded-2xl overflow-hidden border border-emerald-500/40 bg-[#040906] shadow-2xl shrink-0">
                  <img
                    src={showcaseLiquid.imageUrl}
                    alt="Líquidos de Recarga"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <Droplet className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-400/40 shrink-0" />
              )}
            </div>
          </div>
        </div>
      ) : (
        /* =====================================================================
           VIEWS 2, 3, 4 (OR SEARCH RESULTS): VAPERS / LÍQUIDOS / ACCESORIOS
           ===================================================================== */
        <div className="space-y-4 sm:space-y-5">
          {/* Section Header & Filter Controls */}
          <div className="p-3.5 sm:p-5 rounded-2xl bg-[#07120d]/95 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCatalogTab('inicio');
                  }}
                  className="text-xs font-bold text-emerald-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Volver a Inicio</span>
                </button>
              </div>
              <h2 className="text-base sm:text-2xl font-black text-white font-urban mt-1">
                {searchQuery.trim()
                  ? `Resultados para "${searchQuery}"`
                  : activeCatalogTab === 'vapes'
                  ? 'Sección de Vapers & Equipos'
                  : activeCatalogTab === 'accesorios'
                  ? 'Sección de Accesorios, Pods & Repuestos'
                  : 'Sección de Líquidos de Recarga'}
              </h2>
              <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5">
                {activeCatalogTab === 'vapes'
                  ? 'Elige el color de tu equipo vape y agrégale su líquido favorito al instante.'
                  : activeCatalogTab === 'accesorios'
                  ? 'Pods, resistencias (coils), cargadores y accesorios originales.'
                  : 'El delivery llega con el frasco original y recarga tu tanque en el acto: Lleno RD$100 o Mitad RD$50.'}
              </p>
            </div>

            {/* Sort & Nicotine Selectors */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 sm:flex-none bg-[#0b1812] border border-emerald-500/30 text-neutral-200 text-xs font-bold rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-400 cursor-pointer"
              >
                <option value="recomendados">Más Vendidos</option>
                <option value="precio_asc">Precio: Menor a Mayor</option>
                <option value="precio_desc">Precio: Mayor a Menor</option>
                <option value="nombre_asc">Nombre: A - Z</option>
              </select>

              {activeCatalogTab === 'liquidos' && (
                <select
                  value={selectedNicotine}
                  onChange={(e) => setSelectedNicotine(e.target.value)}
                  className="flex-1 sm:flex-none bg-[#0b1812] border border-emerald-500/30 text-neutral-200 text-xs font-bold rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-400 cursor-pointer"
                >
                  <option value="all">Todas las Nicotinas</option>
                  <option value="low">0 - 6mg (Freebase)</option>
                  <option value="medium">20 - 35mg (Salt Regular)</option>
                  <option value="high">50 - 55mg (Salt Fuerte)</option>
                  <option value="70">70mg (Salt Extra Fuerte)</option>
                  <option value="100">100mg (Salt Extremo)</option>
                </select>
              )}
            </div>
          </div>

          {/* Flavor Sub-Category Pills for Liquids */}
          {activeCatalogTab === 'liquidos' && (
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-emerald-500 text-neutral-950 font-black shadow-md shadow-emerald-500/25'
                      : 'bg-[#08130e] text-neutral-300 hover:text-white border border-emerald-500/25'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Responsive 2-Column Mobile / 4-Column Desktop Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="py-12 sm:py-16 px-4 text-center bg-[#07120d]/90 rounded-3xl border border-emerald-500/20 space-y-3">
              <p className="text-sm font-bold text-white">
                {activeCatalogTab === 'accesorios'
                  ? 'Aún no hay accesorios cargados en el inventario.'
                  : 'No se encontraron productos con esos filtros.'}
              </p>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                {activeCatalogTab === 'accesorios'
                  ? 'Puedes consultar disponibilidad de pods, resistencias o cargadores directamente por nuestro WhatsApp o explorar los vapers y líquidos disponibles.'
                  : 'Intenta cambiar tu búsqueda o vuelve al Inicio para ver todos los productos destacados.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('Todos');
                    setSelectedNicotine('all');
                    setActiveCatalogTab('inicio');
                  }}
                  className="py-2 px-4 rounded-full bg-emerald-500 text-neutral-950 font-black text-xs cursor-pointer"
                >
                  Ver Todos en Inicio
                </button>
                <button
                  type="button"
                  onClick={handleOpenWhatsAppSupport}
                  className="py-2 px-4 rounded-full bg-[#0b1812] border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Consultar por WhatsApp</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-5">
              {filteredProducts.map((product) => renderProductCard(product))}
            </div>
          )}
        </div>
      )}

      {/* IMMEDIATE LIQUID CROSS-SELL MODAL WHEN ORDERING A VAPE */}
      {upsellVapeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 font-urban">
          <div className="relative w-full max-w-2xl bg-[#07120d] border-2 border-emerald-400/70 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-emerald-950/80 text-white max-h-[90dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-2.5 pb-3.5 border-b border-emerald-900/50">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-black border border-emerald-500/50 p-1.5 shrink-0 flex items-center justify-center">
                  <img
                    src={
                      upsellVapeModal.variant?.imageUrl || upsellVapeModal.vapeProduct.imageUrl
                    }
                    alt={upsellVapeModal.vapeProduct.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400/50 text-emerald-300 text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">
                    <Check className="w-3 h-3" />
                    ¡Vape agregado a tu carrito!
                  </span>
                  <h3 className="text-sm sm:text-xl font-black text-white mt-1 leading-snug">
                    ¿Le echamos líquido a tu{' '}
                    <span className="text-emerald-400">
                      {upsellVapeModal.vapeProduct.name}
                      {upsellVapeModal.variant ? ` (${upsellVapeModal.variant.colorName})` : ''}
                    </span>
                    ?
                  </h3>
                  <p className="text-[11px] sm:text-xs text-neutral-300 mt-0.5">
                    Aprovecha el envío: elige tu sabor favorito y recibe tu Vape ya recargado.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUpsellVapeModal(null)}
                className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer shrink-0"
                aria-label="Cerrar sugerencia"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search bar inside Upsell Modal */}
            <div className="my-2.5 sm:my-3 relative">
              <Search className="w-4 h-4 text-emerald-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={upsellSearch}
                onChange={(e) => setUpsellSearch(e.target.value)}
                placeholder="Buscar sabor de líquido (menta, mango, uva, fresa...)"
                className="w-full bg-black/70 border border-emerald-800/60 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            {/* Liquid Flavors List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {activeLiquids
                .filter((liq) => {
                  if (liq.stockUnits <= 0) return false;
                  if (!upsellSearch.trim()) return true;
                  const q = upsellSearch.toLowerCase();
                  return (
                    liq.name.toLowerCase().includes(q) ||
                    liq.flavorCategory.toLowerCase().includes(q) ||
                    (liq.description || '').toLowerCase().includes(q)
                  );
                })
                .map((liq) => {
                  const fullInCart = getCartQuantity(liq.id, 'tanque_lleno');
                  const halfInCart = getCartQuantity(liq.id, 'mitad');

                  return (
                    <div
                      key={liq.id}
                      className="p-2.5 sm:p-3 rounded-2xl bg-black/70 border border-emerald-900/50 hover:border-emerald-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={liq.imageUrl}
                          alt={liq.name}
                          className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-contain bg-neutral-950 border border-emerald-800/40 p-1 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                            <span className="text-emerald-400 font-bold">{liq.flavorCategory}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-white">{liq.nicotineMg}mg</span>
                          </div>
                          <h4 className="font-black text-xs sm:text-sm text-white truncate mt-0.5">
                            {liq.name}
                          </h4>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAddPortion(liq, 'tanque_lleno')}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                            fullInCart > 0
                              ? 'bg-emerald-500 text-neutral-950 border-emerald-300 shadow-lg'
                              : 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border-emerald-500/50'
                          }`}
                        >
                          <Droplet className="w-3.5 h-3.5 fill-current shrink-0" />
                          <span>
                            {fullInCart > 0
                              ? `✓ Lleno (${fullInCart})`
                              : `+ Lleno RD$${liq.priceFullTank || 100}`}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddPortion(liq, 'mitad')}
                          className={`py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
                            halfInCart > 0
                              ? 'bg-teal-500 text-neutral-950 border-teal-300 shadow-lg'
                              : 'bg-teal-950/70 hover:bg-teal-900 text-teal-300 border-teal-500/50'
                          }`}
                        >
                          <Droplet className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {halfInCart > 0
                              ? `✓ Mitad (${halfInCart})`
                              : `+ Mitad RD$${liq.priceHalfTank || 50}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer Actions */}
            <div className="pt-3.5 mt-2.5 border-t border-emerald-900/50 flex flex-col sm:flex-row items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setUpsellVapeModal(null)}
                className="w-full sm:w-auto py-2.5 sm:py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-bold cursor-pointer transition-all"
              >
                Seguir viendo la tienda
              </button>

              <button
                type="button"
                onClick={() => {
                  setUpsellVapeModal(null);
                  onStartCheckout(cartItems);
                }}
                className="w-full sm:flex-1 py-3 sm:py-3.5 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-black text-xs sm:text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <span>Confirmar Pedido (RD${totalLiquidAmount.toLocaleString()})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Cart Bar (Positioned above mobile bottom nav bar) */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-[68px] sm:bottom-4 left-2.5 right-2.5 sm:left-4 sm:right-4 z-40 max-w-xl mx-auto bg-[#06110c]/95 backdrop-blur-2xl border-2 border-emerald-500/70 rounded-2xl sm:rounded-3xl p-2.5 sm:p-4 shadow-2xl shadow-black flex items-center justify-between gap-2.5 sm:gap-4">
          <div
            onClick={() => setIsCartDrawerOpen(true)}
            className="cursor-pointer group flex items-center gap-2.5 sm:gap-3 min-h-[40px]"
          >
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-neutral-950 font-black text-xs sm:text-base flex items-center justify-center shadow-lg shadow-emerald-500/30 font-urban tabular-nums shrink-0">
              {totalItemsCount}
            </div>
            <div>
              <div className="text-sm sm:text-lg font-black text-white group-hover:text-emerald-300 transition-colors font-urban tabular-nums">
                RD${totalLiquidAmount.toLocaleString()}
              </div>
              <span className="text-[10px] sm:text-[11px] text-emerald-400 block font-semibold">
                Ver carrito & detalle →
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onStartCheckout(cartItems)}
            className="min-h-[42px] px-3.5 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-black text-xs sm:text-sm rounded-xl sm:rounded-2xl shadow-xl shadow-emerald-500/30 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer font-urban whitespace-nowrap"
          >
            <span>Confirmar Pedido</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      <CartDrawerModal
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onClearCart={() => setCartItems([])}
        onProceedToCheckout={() => onStartCheckout(cartItems)}
      />

      {/* Quick WhatsApp Order Modal */}
      {quickWhatsAppState && store && (
        <QuickWhatsAppOrderModal
          product={quickWhatsAppState.product}
          initialVariant={quickWhatsAppState.variant}
          availableLiquids={activeLiquids}
          store={store}
          onClose={() => setQuickWhatsAppState(null)}
          onCreateOrder={(order) => {
            onCreateOrder?.(order);
            setQuickWhatsAppState(null);
          }}
        />
      )}
    </div>
  );
};
