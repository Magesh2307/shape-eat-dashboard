import React, { useState, useMemo, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import CustomDateRangePicker from './CustomDateRangePicker';

const supabase = createClient(
  'https://ojphshzuosbfbftpoigy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmJmdHBvaWd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQ1Mjc3MCwiZXhwIjoyMDY3MDI4NzcwfQ.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q'
);

// 🔧 INTERFACE BASÉE SUR VOS VRAIES DONNÉES SUPABASE
interface Order {
  id: string;
  vendlive_id: string;
  product_name: string;        // Ajouter
  product_category: string;    // Ajouter
  product_id: string;          // Ajouter
  price_ttc: string;          // Ajouter
  quantity: string;           // Ajouter
  venue_name?: string;
  venue_id?: number;
  status: string;
  is_refunded: boolean;
  created_at: string;
}

interface ProductsViewProps {
  sales: Order[]; // Ce sont des orders individuels depuis App.tsx
}

// 1. Ajouter l'interface ProductSummary
interface ProductSummary {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  totalRevenue: number;
  venues: Set<string>;
}

const ProductsView: React.FC<ProductsViewProps> = ({ sales = [] }) => {
  // Ajouter ces états
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  // Charger les orders au montage
  useEffect(() => {
    const loadOrders = async () => {
      setIsLoadingOrders(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'completed')
          .eq('is_refunded', false)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        console.log('Orders chargés:', data?.length);
        setOrders(data || []);
      } catch (error) {
        console.error('Erreur chargement orders:', error);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    
    loadOrders();
  }, []);

  // États pour les filtres
  const [dateFilter, setDateFilter] = useState<'yesterday' | 'today' | '7days' | '30days' | 'custom'>('30days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('revenue');
  const [showTopN, setShowTopN] = useState(20);

  // Fonction pour obtenir les dates selon le filtre
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (dateFilter) {
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: yesterday, end: yesterday };
        
      case 'today':
        return { start: today, end: today };
        
      case '7days':
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return { start: sevenDaysAgo, end: today };
        
      case '30days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return { start: thirtyDaysAgo, end: today };
        
      case 'custom':
        return {
          start: customStartDate ? new Date(customStartDate) : today,
          end: customEndDate ? new Date(customEndDate) : today
        };
        
      default:
        return { start: today, end: today };
    }
  };

  // Extraire venues et catégories uniques depuis vos vraies données
const { allVenues, allCategories } = useMemo(() => {
  const venuesSet = new Set<string>();
  const categoriesSet = new Set<string>();

  orders.forEach(order => {  // ← Utiliser orders
    if (order.venue_name) {
      venuesSet.add(order.venue_name);
    }
    if (order.product_category) {
      categoriesSet.add(order.product_category);
    }
  });

  return {
    allVenues: Array.from(venuesSet),
    allCategories: Array.from(categoriesSet)
  };
}, [orders]);

  // ✅ CALCUL DES STATS PRODUITS AVEC VOS VRAIES DONNÉES
const productStats = useMemo(() => {
  if (isLoadingOrders) return []; // ← Ajouter cette condition
  
  const { start, end } = getDateRange();
  const productsMap = new Map<string, ProductSummary>();

  // Filtrer les orders
  const filteredOrders = orders.filter(order => { // ← Utiliser orders
    const orderDate = new Date(order.created_at);
    const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
    
    if (orderDateOnly < start || orderDateOnly > end) return false;
    if (selectedVenue !== 'all' && order.venue_name !== selectedVenue) return false;
    if (order.is_refunded) return false;
    if (order.status !== 'completed') return false;
    
    return true;
  });

  console.log(`✅ Filtrage: ${filteredOrders.length} orders valides sur ${orders.length} total`);

  // Agrégation (utiliser filteredSales, pas filteredOrders)
  filteredOrders.forEach((order, index) => {
    const venueName = String(order.venue_name || 'Venue inconnue').trim();
    const productName = String(order.product_name || 'Produit inconnu').trim();
    const category = String(order.product_category || 'Sans catégorie').trim();
    
    // Filtre par catégorie
    if (categoryFilter !== 'all' && category !== categoryFilter) return;
    
    // Filtre par recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!productName.toLowerCase().includes(term) && 
          !category.toLowerCase().includes(term)) {
        return;
      }
    }

    const productId = order.product_id?.toString() || productName;
    const quantity = parseInt(order.quantity) || 1;
const normalizePrice = (price: any): number => {
  if (typeof price === 'number') return price;
  const cleanPrice = String(price || '0')
    .replace(',', '.')
    .replace(/[^\d.-]/g, ''); // Supprime tout sauf chiffres, points et tirets
  return parseFloat(cleanPrice) || 0;
};

const unitPrice = normalizePrice(order.price_ttc);
const revenue = unitPrice * quantity;
    
    // Ignorer si prix à 0
    if (unitPrice <= 0) {
      console.warn(`Prix invalide pour ${productName}:`, { unitPrice });
      return;
    }
    
    if (!productsMap.has(productId)) {
      productsMap.set(productId, {
        productId,
        productName,
        category,
        quantity: 0,
        totalRevenue: 0,
        venues: new Set()
      });
    }
    
    const productSummary = productsMap.get(productId)!;
    productSummary.quantity += quantity;
    productSummary.totalRevenue += revenue;
    productSummary.venues.add(venueName);
  });

  // Convertir en array
  const productsArray = Array.from(productsMap.values());
  
  const totalRevenue = productsArray.reduce((sum, p) => sum + p.totalRevenue, 0);
  const totalQuantity = productsArray.reduce((sum, p) => sum + p.quantity, 0);
  
});
  
  // Trier selon le critère sélectionné
  productsArray.sort((a, b) => {
    if (sortBy === 'quantity') {
      return b.quantity - a.quantity;
    } else {
      return b.totalRevenue - a.totalRevenue;
    }
  });

  // Limiter au top N
  return productsArray.slice(0, showTopN);
}, [orders, dateFilter, customStartDate, customEndDate, selectedVenue, categoryFilter, searchTerm, sortBy, showTopN, isLoadingOrders]);
  // Calculer les totaux
  const totals = useMemo(() => {
    return productStats.reduce((acc, product) => ({
      quantity: acc.quantity + product.quantity,
      revenue: acc.revenue + product.totalRevenue
    }), { quantity: 0, revenue: 0 });
  }, [productStats]);

  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'yesterday': return 'Hier';
      case 'today': return "Aujourd'hui";
      case '7days': return '7 derniers jours';
      case '30days': return '30 derniers jours';
      case 'custom': return 'Période personnalisée';
      default: return '30 derniers jours';
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h2 className="text-xl font-light text-white mb-1">Top Produits</h2>
        <p className="text-slate-400 text-sm">
          Analyse des produits les plus vendus par période et par venue
        </p>
      </div>

      {/* Filtres - Même structure que l'original */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <div className="space-y-4">
          {/* Ligne 1: Filtres de date */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-400 mb-2">Période</label>
              <div className="flex gap-2">
                {[
                  { key: 'yesterday' as const, label: 'Hier' },
                  { key: 'today' as const, label: "Aujourd'hui" },
                  { key: '7days' as const, label: '7 jours' },
                  { key: '30days' as const, label: '30 jours' },
                  { key: 'custom' as const, label: 'Personnalisé' }
                ].map(filter => (
                  <button
                    key={filter.key}
                    onClick={() => setDateFilter(filter.key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      dateFilter === filter.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date personnalisée */}
          {dateFilter === 'custom' && (
            <div className="max-w-md">
              <CustomDateRangePicker
                startDate={customStartDate}
                endDate={customEndDate}
                onDateChange={(start, end) => {
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                }}
              />
            </div>
          )}

          {/* Ligne 2: Autres filtres */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Recherche */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-400 mb-2">Rechercher</label>
              <input
                type="text"
                placeholder="Nom ou catégorie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Venue */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Venue</label>
              <select
                value={selectedVenue}
                onChange={(e) => setSelectedVenue(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Toutes les venues</option>
                {allVenues.map(venue => (
                  <option key={venue} value={venue}>{venue}</option>
                ))}
              </select>
            </div>

            {/* Catégorie */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Catégorie</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">Toutes les catégories</option>
                {allCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Trier par */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">Trier par</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'quantity' | 'revenue')}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="revenue">Chiffre d'affaires</option>
                <option value="quantity">Quantité vendue</option>
              </select>
            </div>
          </div>

          {/* Badges des filtres actifs */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
                📅 {getFilterLabel()}
              </span>
              {selectedVenue !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                  🏢 {selectedVenue}
                </span>
              )}
              {categoryFilter !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                  🏷️ {categoryFilter}
                </span>
              )}
            </div>
            
            {/* Top N selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Afficher top</span>
              <select
                value={showTopN}
                onChange={(e) => setShowTopN(Number(e.target.value))}
                className="px-3 py-1 bg-slate-700/50 border border-slate-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">Produits affichés</h3>
          <p className="text-2xl font-bold text-white">{productStats.length}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">Quantité totale</h3>
          <p className="text-2xl font-bold text-emerald-400">{totals.quantity.toLocaleString()}</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">CA total</h3>
          <p className="text-2xl font-bold text-blue-400">
            {totals.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </p>
        </div>
      </div>

      {/* Tableau des produits - Structure identique mais avec les bonnes données */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-700/30">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Rang
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Produit
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Catégorie
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Quantité
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                  CA Total
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Prix Moyen
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Venues
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {productStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Aucun produit trouvé pour ces critères
                  </td>
                </tr>
              ) : (
                productStats.map((product, index) => {
                  const avgPrice = product.quantity > 0 ? product.totalRevenue / product.quantity : 0;
                  const rankColor = index === 0 ? 'text-yellow-400' : 
                                   index === 1 ? 'text-slate-300' : 
                                   index === 2 ? 'text-orange-400' : 'text-slate-400';
                  
                  return (
                    <tr key={product.productId} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-lg font-bold ${rankColor}`}>
                          #{index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">
                          {product.productName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-600 text-slate-200">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm font-medium text-white">
                          {product.quantity.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-400">
                          {totals.quantity > 0 ? ((product.quantity / totals.quantity) * 100).toFixed(1) : '0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-white">
                          {product.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                        </div>
                        <div className="text-xs text-slate-400">
                          {totals.revenue > 0 ? ((product.totalRevenue / totals.revenue) * 100).toFixed(1) : '0'}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm text-slate-300">
                          {avgPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-sm text-slate-300">
                          {product.venues.size}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Graphique simple en barres - Structure identique */}
      {productStats.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-medium text-white mb-4">
            Visualisation Top 10 - {sortBy === 'revenue' ? 'Chiffre d\'affaires' : 'Quantités'}
          </h3>
          <div className="space-y-3">
            {productStats.slice(0, 10).map((product, index) => {
              const maxValue = productStats[0] ? productStats[0][sortBy === 'revenue' ? 'totalRevenue' : 'quantity'] : 1;
              const currentValue = product[sortBy === 'revenue' ? 'totalRevenue' : 'quantity'];
              const percentage = maxValue > 0 ? (currentValue / maxValue) * 100 : 0;
              
              return (
                <div key={product.productId} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-slate-300 truncate" title={product.productName}>
                    {product.productName}
                  </div>
                  <div className="flex-1">
                    <div className="w-full bg-slate-700 rounded-full h-6 relative overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className="text-xs font-medium text-white">
                          {sortBy === 'revenue' 
                            ? `${currentValue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
                            : currentValue.toLocaleString()
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsView;