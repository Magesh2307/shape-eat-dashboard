import React, { useState, useMemo } from 'react';
import CustomDateRangePicker from './CustomDateRangePicker';

interface Sale {
  id: string;
  createdAt: string;
  total?: string;
  totalCharged?: string;
  productSales?: Array<{
    product?: {
      id: number;
      name: string;
      category?: {
        name: string;
      };
    };
    productName?: string;
    totalPaid?: string;
    vendStatus: string;
    isRefunded?: boolean;
  }>;
  location?: {
    venue?: {
      id: number;
      name: string;
    };
  };
  locationName?: string;
}

interface ProductSummary {
  productId: string;
  productName: string;
  category: string;
  quantity: number;
  totalRevenue: number;
  venues: Set<string>;
}

interface ProductsViewProps {
  sales: Sale[];
}

const ProductsView: React.FC<ProductsViewProps> = ({ sales = [] }) => {
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

  // Extraire toutes les venues et catégories uniques
  const { allVenues, allCategories } = useMemo(() => {
    const venuesSet = new Set<string>();
    const categoriesSet = new Set<string>();

    sales.forEach(sale => {
      const venueName = sale.location?.venue?.name || sale.locationName || 'Venue inconnue';
      venuesSet.add(venueName);

      sale.productSales?.forEach(ps => {
        const category = ps.product?.category?.name || 'Sans catégorie';
        categoriesSet.add(category);
      });
    });

    return {
      allVenues: Array.from(venuesSet).sort(),
      allCategories: Array.from(categoriesSet).sort()
    };
  }, [sales]);

  // Calculer les statistiques des produits
  const productStats = useMemo(() => {
    const { start, end } = getDateRange();
    const productsMap = new Map<string, ProductSummary>();

    // Filtrer les ventes par date et venue
    const filteredSales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      const saleDateOnly = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
      
      // Filtre par date
      if (saleDateOnly < start || saleDateOnly > end) return false;
      
      // Filtre par venue
      const venueName = sale.location?.venue?.name || sale.locationName || 'Venue inconnue';
      if (selectedVenue !== 'all' && venueName !== selectedVenue) return false;
      
      return true;
    });

    // Agréger les données par produit
    filteredSales.forEach(sale => {
      const venueName = sale.location?.venue?.name || sale.locationName || 'Venue inconnue';
      
      sale.productSales?.forEach(ps => {
        // Exclure les remboursements et les ventes échouées
        if (ps.isRefunded || ps.vendStatus !== 'Success') return;
        
        const productId = ps.product?.id?.toString() || ps.productName || 'unknown';
        const productName = ps.product?.name || ps.productName || 'Produit inconnu';
        const category = ps.product?.category?.name || 'Sans catégorie';
        const revenue = parseFloat(ps.totalPaid || sale.total || sale.totalCharged || '0');
        
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
        
        const product = productsMap.get(productId)!;
        product.quantity += 1;
        product.totalRevenue += revenue;
        product.venues.add(venueName);
      });
    });

    // Convertir en array et trier
    const productsArray = Array.from(productsMap.values());
    
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
  }, [sales, dateFilter, customStartDate, customEndDate, selectedVenue, categoryFilter, searchTerm, sortBy, showTopN]);

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

      {/* Filtres */}
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
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8z" clipRule="evenodd" />
                </svg>
                {getFilterLabel()}
              </span>
              {selectedVenue !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                  {selectedVenue}
                </span>
              )}
              {categoryFilter !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                  </svg>
                  {categoryFilter}
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

      {/* Tableau des produits */}
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
                  const avgPrice = product.totalRevenue / product.quantity;
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
                          {((product.quantity / totals.quantity) * 100).toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-white">
                          {product.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                        </div>
                        <div className="text-xs text-slate-400">
                          {((product.totalRevenue / totals.revenue) * 100).toFixed(1)}%
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

      {/* Graphique simple en barres */}
      {productStats.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-medium text-white mb-4">
            Visualisation Top 10 - {sortBy === 'revenue' ? 'Chiffre d\'affaires' : 'Quantités'}
          </h3>
          <div className="space-y-3">
            {productStats.slice(0, 10).map((product, index) => {
              const maxValue = productStats[0][sortBy === 'revenue' ? 'totalRevenue' : 'quantity'];
              const currentValue = product[sortBy === 'revenue' ? 'totalRevenue' : 'quantity'];
              const percentage = (currentValue / maxValue) * 100;
              
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