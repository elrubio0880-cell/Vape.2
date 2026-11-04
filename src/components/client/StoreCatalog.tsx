import React, { useState } from 'react';
import { Product, PortionType, OrderItem, StoreConfig, Order } from '../../types';
import { CartDrawerModal } from './CartDrawerModal';
import { QuickWhatsAppOrderModal } from './QuickWhatsAppOrderModal';
import { playNotificationSound } from '../../utils/storage';
import {
  Flame,
  Droplet,
  Sparkles,
  Check,
  Plus,
  AlertTriangle,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  Wind,
  Zap,
  MessageCircle,
} from 'lucide-react';

interface StoreCatalogProps {
  products: Product[];
  onStartCheckout: (items: OrderItem[]) => void;
  store?: StoreConfig;
  onCreateOrder?: (order: Order) => void;
}

export const StoreCatalog: React.FC<StoreCatalogProps> = ({
  products,
  onStartCheckout,
  store,
  onCreateOrder,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedBrand, setSelectedBrand] = useState<string>('Todas');
  const [sortBy, setSortBy] = useState<string>('recomendados');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNicotine, setSelectedNicotine] = useState<string>('all');
  const [cartItems, setCartItems] = useState<OrderItem[]>(() => {
    try {
      const raw = localStorage.getItem('vape_cart_items_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [quickWhatsAppProduct, setQuickWhatsAppProduct] = useState<Product | null>(null);

  const categories = ['Todos', 'Frutales', 'Mentolados', 'Bebidas', 'Postres', 'Tabacos'];
  const brands = ['Todas', 'Pop Vapors', 'Horny Flava', 'Mistiq Flava', 'Pod Juice'];

  // Keep cart items synchronized if Admin edits product prices, names, or stock
  React.useEffect(() => {
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
          const expectedPrice =
            item.portion === 'tanque_lleno' ? prod.priceFullTank || 100 : prod.priceHalfTank || 50;
          const clampedQty = Math.min(item.quantity, prod.stockUnits);
          if (
            item.unitPrice !== expectedPrice ||
            item.costPrice !== prod.costPrice ||
            item.productName !== prod.name ||
            item.quantity !== clampedQty
          ) {
            changed = true;
            return {
              ...item,
              productName: prod.name,
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

  const filteredProducts = products
    .filter((p) => {
      if (!p.isActive) return false;

      // Category filter
      if (selectedCategory !== 'Todos' && p.flavorCategory.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Brand filter
      if (selectedBrand !== 'Todas' && !p.name.toLowerCase().includes(selectedBrand.toLowerCase())) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        const matchCat = p.flavorCategory.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchCat) return false;
      }

      // Nicotine filter
      if (selectedNicotine === 'low' && p.nicotineMg > 6) return false;
      if (selectedNicotine === 'medium' && (p.nicotineMg <= 6 || p.nicotineMg > 35)) return false;
      if (selectedNicotine === 'high' && p.nicotineMg < 50) return false;

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'precio_asc') return a.priceFullTank - b.priceFullTank;
      if (sortBy === 'precio_desc') return b.priceFullTank - a.priceFullTank;
      if (sortBy === 'nombre_asc') return a.name.localeCompare(b.name);
      return 0;
    });

  React.useEffect(() => {
    try {
      localStorage.setItem('vape_cart_items_v1', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  React.useEffect(() => {
    const handleClearOnSubmit = () => {
      setCartItems([]);
      try {
        localStorage.removeItem('vape_cart_items_v1');
      } catch {}
    };
    window.addEventListener('vape-order-submitted', handleClearOnSubmit);
    return () => window.removeEventListener('vape-order-submitted', handleClearOnSubmit);
  }, []);

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

    const unitPrice = portion === 'tanque_lleno' ? (product.priceFullTank || 100) : (product.priceHalfTank || 50);
    playNotificationSound('vape-hit');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vape-smoke-burst', {
          detail: {
            flavor: `💨 Agregado al vape: ${product.name} (${portion === 'tanque_lleno' ? `Tanque Lleno $${unitPrice}` : `Mitad $${unitPrice}`})`,
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
        (it) => it.productId === product.id && it.portion === portion
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
            portion,
            unitPrice,
            costPrice,
            quantity: 1,
          },
        ];
      }
    });
  };

  const handleRemovePortion = (productId: string, portion: PortionType) => {
    playNotificationSound('pop');
    setCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.productId === productId && it.portion === portion
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

  const handleUpdateQuantity = (productId: string, portion: PortionType, delta: number) => {
    if (delta > 0) {
      const product = products.find((p) => p.id === productId);
      if (product) handleAddPortion(product, portion);
    } else {
      handleRemovePortion(productId, portion);
    }
  };

  const getCartQuantity = (productId: string, portion: PortionType) => {
    const item = cartItems.find((it) => it.productId === productId && it.portion === portion);
    return item ? item.quantity : 0;
  };

  const totalLiquidAmount = cartItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const totalItemsCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <div className="space-y-7 relative z-10">
      {/* Street Art Hero Showcase - Inspired by Joker Logo & Graffiti Culture */}
      <div className="relative rounded-3xl overflow-hidden border-2 border-purple-500/40 bg-[#0e091a] shadow-2xl shadow-purple-950/80">
        {/* Restored Urban Street Graffiti Wall layer */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-[0.22] mix-blend-overlay pointer-events-none filter contrast-125"
          style={{ backgroundImage: `url('/assets/graffiti-wall.jpg')` }}
        />
        {/* Atmospheric ambient radiant lighting */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-600/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-purple-950/50 via-transparent to-cyan-950/40 pointer-events-none" />

        <div className="relative p-6 sm:p-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex-1 space-y-3.5 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/80 border border-purple-500/50 text-purple-300 text-xs font-tag tracking-wider shadow">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              EL TEMPLO DEL HUMO • RECARGA CALLEJERA EXPRESS
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white font-urban tracking-tight uppercase leading-tight">
              ¿SED DE VAPOR? <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-cyan-300 to-lime-300 text-glow-purple">
                TE LLENAMOS EL TANQUE AL INSTANTE
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-neutral-300 font-medium max-w-xl mx-auto lg:mx-0 leading-relaxed">
              No compres el pote entero si solo quieres recargar. Nuestro delivery llega en moto con los frascos y te echa la porción exacta directo en tu vape: 
              <strong className="text-emerald-400"> Tanque Lleno por $100 DOP</strong> o <strong className="text-cyan-400">Mitad por $50 DOP</strong>. ¡Humo fresco y denso al toque!
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-purple-800/60 text-[11px] font-bold text-purple-200">
                <Wind className="w-4 h-4 text-cyan-400" />
                <span>Nubes Ultra Espesas 70/30</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-purple-800/60 text-[11px] font-bold text-cyan-200">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Golpe de Garganta Puro</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 border border-purple-800/60 text-[11px] font-bold text-lime-300">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Delivery Rápido en Moto</span>
              </div>
            </div>
          </div>

          {/* Joker Black Vape Visual Centerpiece with glowing aura */}
          <div className="relative shrink-0 flex flex-col items-center">
            <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full p-1.5 bg-gradient-to-tr from-purple-600 via-cyan-400 to-purple-500 shadow-2xl shadow-purple-600/60 animate-neon-sign group">
              <div className="w-full h-full rounded-full overflow-hidden bg-black flex items-center justify-center">
                <img
                  src="/logo-black-vape.jpeg"
                  alt="BLACK VAPE Joker"
                  className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-500"
                />
              </div>

              {/* Glowing vapor badge */}
              <div className="absolute -bottom-2 -left-2 px-3 py-1 rounded-full bg-neutral-950/90 border-2 border-cyan-400 text-cyan-300 text-[10px] font-black uppercase tracking-wider font-tag shadow-lg">
                100% STREET JUICE
              </div>
            </div>

            {/* Price Tags Stencil */}
            <div className="mt-4 flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/60 text-center shadow">
                <span className="block text-[9px] font-tag text-emerald-400 uppercase">LLENO</span>
                <span className="block text-sm font-black text-white font-urban">$100 DOP</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-500/60 text-center shadow">
                <span className="block text-[9px] font-tag text-cyan-400 uppercase">MITAD</span>
                <span className="block text-sm font-black text-white font-urban">$50 DOP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Street Notice Banner: Cómo Funciona la Recarga */}
      <div className="relative rounded-3xl bg-gradient-to-r from-[#180f2c] via-[#0e091a] to-[#0a1524] border border-purple-800/40 p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-700 border border-purple-400/50 flex items-center justify-center text-white shrink-0 shadow-lg shadow-purple-600/30">
              <Droplet className="w-6 h-6 fill-cyan-400 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-tag text-[11px] px-2.5 py-0.5 rounded-md bg-purple-900/60 text-purple-200 border border-purple-500/40 uppercase">
                  MODALIDAD CALLEJERA • RECARGA EN SITIO
                </span>
                <span className="text-xs sm:text-sm font-black text-white font-urban">
                  ¡No se vende el frasco entero!
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                El repartidor llega en su moto con el frasco original sellado y dispensa el líquido directamente en el tanque de tu vape. Pagas solo lo que fumas: <strong>$100 DOP (Lleno)</strong> o <strong>$50 DOP (Mitad)</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 bg-black/60 border border-purple-900/50 rounded-2xl p-2 px-3 text-xs justify-around sm:justify-start">
            <div className="text-center px-3 border-r border-purple-900/50">
              <span className="text-[10px] text-purple-300 font-tag block uppercase">TANQUE LLENO</span>
              <span className="font-black text-emerald-400 text-base font-urban">$100 DOP</span>
            </div>
            <div className="text-center px-3">
              <span className="text-[10px] text-cyan-300 font-tag block uppercase">MITAD TANQUE</span>
              <span className="font-black text-cyan-400 text-base font-urban">$50 DOP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters Strip */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por sabor, menta, fruta o marca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#120c1f] border border-purple-900/50 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-400 transition-colors shadow-inner font-medium"
          />
        </div>

        {/* Sort and Nicotine filters */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#120c1f] border border-purple-900/50 text-neutral-300 text-xs font-bold rounded-2xl py-2.5 px-3 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="recomendados">⭐ Más Pedidos & Recomendados</option>
            <option value="nombre_asc">Nombre: A - Z</option>
            <option value="precio_asc">Precio: Menor a Mayor</option>
            <option value="precio_desc">Precio: Mayor a Menor</option>
          </select>

          <select
            value={selectedNicotine}
            onChange={(e) => setSelectedNicotine(e.target.value)}
            className="bg-[#120c1f] border border-purple-900/50 text-neutral-300 text-xs font-bold rounded-2xl py-2.5 px-3 focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            <option value="all">Todas las Nicotinas</option>
            <option value="low">0 - 6mg (Freebase)</option>
            <option value="medium">20 - 35mg (Salt Regular)</option>
            <option value="high">50 - 55mg (Salt Golpe Intenso)</option>
          </select>

          {totalItemsCount > 0 && (
            <button
              type="button"
              onClick={() => setIsCartDrawerOpen(true)}
              className="py-2.5 px-4 bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-xs rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-purple-600/30 shrink-0 ml-auto sm:ml-0 font-urban"
            >
              <ShoppingBag className="w-4 h-4 text-cyan-200 fill-cyan-200" />
              <span>Canasta ({totalItemsCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Category & Brand Filter Strip */}
      <div className="space-y-2.5">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-tag text-purple-400 uppercase tracking-wider shrink-0 mr-1">
            CATEGORÍA:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all cursor-pointer font-urban ${
                selectedCategory === cat
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 border border-purple-400'
                  : 'bg-[#120c1f] text-neutral-400 hover:text-white border border-purple-900/40 hover:border-purple-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Brand Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-tag text-cyan-400 uppercase tracking-wider shrink-0 mr-1">
            MARCA:
          </span>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBrand(b)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedBrand === b
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-sm'
                  : 'bg-black/60 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
              }`}
            >
              {b}
            </button>
          ))}

          {(selectedCategory !== 'Todos' || selectedBrand !== 'Todas' || searchQuery || selectedNicotine !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('Todos');
                setSelectedBrand('Todas');
                setSearchQuery('');
                setSelectedNicotine('all');
                setSortBy('recomendados');
              }}
              className="px-2.5 py-1 text-[11px] text-purple-400 hover:text-red-400 underline cursor-pointer shrink-0 ml-2 font-medium"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Street Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full py-16 text-center text-neutral-500 text-sm font-medium bg-[#0e0a17] rounded-3xl border border-purple-900/30">
            No se encontraron líquidos que coincidan con tu búsqueda. Prueba con otro sabor o categoría.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const fullCount = getCartQuantity(product.id, 'tanque_lleno');
            const halfCount = getCartQuantity(product.id, 'mitad');
            const isOutOfStock = product.stockUnits <= 0;

            return (
              <div
                key={product.id}
                className={`group relative bg-[#0e0a1a]/90 hover:bg-[#130d24] border-2 border-purple-900/40 hover:border-cyan-400/70 rounded-3xl p-4 transition-all duration-300 flex flex-col justify-between shadow-xl hover:shadow-2xl hover:shadow-purple-950/60 hover:-translate-y-1 ${
                  isOutOfStock ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <div>
                  {/* Image showcase with neon aura */}
                  <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black mb-3.5 border border-purple-900/50 group-hover:border-cyan-500/50 transition-colors">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0a1a] via-transparent to-transparent pointer-events-none" />

                    {/* Category tag */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2.5 py-1 bg-black/85 backdrop-blur border border-purple-500/60 rounded-lg text-[10px] font-tag text-purple-300 uppercase tracking-wider shadow">
                        {product.flavorCategory}
                      </span>
                      <span className="px-2 py-1 bg-black/85 backdrop-blur border border-cyan-500/60 rounded-lg text-[10px] font-bold text-cyan-300 shadow">
                        {product.nicotineMg}mg Salt
                      </span>
                    </div>

                    {/* Vapor Cloud Density Badge */}
                    <div className="absolute bottom-2.5 left-2.5">
                      <span className="px-2 py-0.5 bg-purple-950/90 backdrop-blur border border-purple-500/50 text-purple-300 text-[10px] font-bold rounded-md flex items-center gap-1 shadow">
                        <Wind className="w-3 h-3 text-cyan-400" />
                        Nube 98% Densa
                      </span>
                    </div>

                    {/* Stock tag */}
                    <div className="absolute bottom-2.5 right-2.5">
                      {product.stockUnits <= 3 ? (
                        <span className="px-2 py-0.5 bg-red-950/90 border border-red-700/80 text-red-300 text-[10px] font-bold rounded-md flex items-center gap-1 shadow">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          ¡Solo {product.stockUnits} disp.!
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-black/80 border border-purple-800 text-purple-200 text-[10px] font-bold rounded-md shadow">
                          Stock: {product.stockUnits}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Flavor Description */}
                  <h3 className="font-black text-base sm:text-lg text-white group-hover:text-cyan-300 transition-colors font-urban">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-xs text-neutral-300 mt-1 line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  )}
                  <span className="text-[10px] font-tag text-purple-400 block mt-1.5">
                    * El delivery dispensa esta dosis en tu vape al llegar.
                  </span>
                </div>

                {/* Portion Selection Controls - Tanque Lleno $100 / Mitad $50 */}
                <div className="mt-4 pt-3.5 border-t border-purple-900/40 space-y-2">
                  <span className="text-[10px] font-tag text-cyan-400 uppercase tracking-wider block">
                    SELECCIONA CARGA PARA TU TANQUE:
                  </span>

                  {/* Tanque Lleno */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/60 border border-emerald-900/60 hover:border-emerald-500/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Droplet className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                        <span className="text-xs font-bold text-white font-urban">Tanque Lleno</span>
                      </div>
                      <span className="text-xs font-black text-emerald-400 block mt-0.5 font-urban">
                        ${product.priceFullTank || 100} DOP <span className="text-[10px] font-normal text-neutral-400">(recarga al 100%)</span>
                      </span>
                    </div>

                    {fullCount === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAddPortion(product, 'tanque_lleno')}
                        className="min-h-[44px] min-w-[110px] px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-emerald-950/80 cursor-pointer font-urban flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Echar Lleno</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-[#120c1f] border border-emerald-500/50 rounded-xl p-1 shadow">
                        <button
                          type="button"
                          onClick={() => handleRemovePortion(product.id, 'tanque_lleno')}
                          className="w-9 h-9 min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white font-black text-base cursor-pointer rounded-lg hover:bg-neutral-800 active:scale-90 transition-transform"
                          aria-label="Restar una dosis"
                        >
                          -
                        </button>
                        <span className="text-xs font-black text-emerald-400 px-2 font-urban min-w-[20px] text-center">{fullCount}</span>
                        <button
                          type="button"
                          onClick={() => handleAddPortion(product, 'tanque_lleno')}
                          className="w-9 h-9 min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white font-black text-base cursor-pointer rounded-lg hover:bg-neutral-800 active:scale-90 transition-transform"
                          aria-label="Sumar una dosis"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Mitad */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/60 border border-cyan-900/60 hover:border-cyan-500/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Droplet className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-white font-urban">Mitad de Tanque</span>
                      </div>
                      <span className="text-xs font-black text-cyan-400 block mt-0.5 font-urban">
                        ${product.priceHalfTank || 50} DOP <span className="text-[10px] font-normal text-neutral-400">(media carga)</span>
                      </span>
                    </div>

                    {halfCount === 0 ? (
                      <button
                        type="button"
                        onClick={() => handleAddPortion(product, 'mitad')}
                        className="min-h-[44px] min-w-[110px] px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-500 hover:from-cyan-500 hover:to-blue-400 text-white rounded-xl text-xs font-black transition-all active:scale-95 shadow-lg shadow-cyan-950/80 cursor-pointer font-urban flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Echar Mitad</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-[#120c1f] border border-cyan-500/50 rounded-xl p-1 shadow">
                        <button
                          type="button"
                          onClick={() => handleRemovePortion(product.id, 'mitad')}
                          className="w-9 h-9 min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white font-black text-base cursor-pointer rounded-lg hover:bg-neutral-800 active:scale-90 transition-transform"
                          aria-label="Restar una dosis"
                        >
                          -
                        </button>
                        <span className="text-xs font-black text-cyan-400 px-2 font-urban min-w-[20px] text-center">{halfCount}</span>
                        <button
                          type="button"
                          onClick={() => handleAddPortion(product, 'mitad')}
                          className="w-9 h-9 min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white font-black text-base cursor-pointer rounded-lg hover:bg-neutral-800 active:scale-90 transition-transform"
                          aria-label="Sumar una dosis"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Direct WhatsApp Order Option */}
                  <button
                    type="button"
                    onClick={() => setQuickWhatsAppProduct(product)}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-emerald-950/40 active:scale-95 mt-2"
                    title="Pedir este líquido directo por WhatsApp con foto y ubicación"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400 fill-emerald-400/20" />
                    <span>Pedir por WhatsApp 💬</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Cart Bar with Neon Street Drip Style */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-18 sm:bottom-4 left-3 right-3 sm:left-4 sm:right-4 z-40 max-w-xl mx-auto bg-[#0d0818]/95 backdrop-blur-2xl border-2 border-purple-500/70 rounded-3xl p-3.5 sm:p-4 shadow-2xl shadow-purple-950 flex items-center justify-between gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-4">
          <div
            onClick={() => setIsCartDrawerOpen(true)}
            className="cursor-pointer group flex items-center gap-3 min-h-[44px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-400 text-white font-black text-base flex items-center justify-center shadow-lg shadow-purple-600/40 font-urban animate-pulse">
              {totalItemsCount}
            </div>
            <div>
              <div className="text-base sm:text-lg font-black text-white group-hover:text-cyan-300 transition-colors font-urban">
                ${totalLiquidAmount} DOP
              </div>
              <span className="text-[10px] sm:text-[11px] text-purple-300 block font-tag">
                Ver canasta & dosis ➔
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onStartCheckout(cartItems)}
            className="min-h-[48px] px-5 sm:px-6 py-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-purple-600/40 active:scale-95 transition-all flex items-center gap-2 cursor-pointer font-urban tracking-wide"
          >
            <span>Fijar Mapa & Pedir</span>
            <span className="text-base">🛵💨</span>
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
      {quickWhatsAppProduct && store && (
        <QuickWhatsAppOrderModal
          product={quickWhatsAppProduct}
          store={store}
          onClose={() => setQuickWhatsAppProduct(null)}
          onCreateOrder={(order) => {
            onCreateOrder?.(order);
            setQuickWhatsAppProduct(null);
          }}
        />
      )}
    </div>
  );
};
