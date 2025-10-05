import React, { useState, useEffect, useMemo } from 'react';
import CustomDateRangePicker from './CustomDateRangePicker';

interface Sale {
  id: string;
  createdAt: string;
  total?: string;
  totalCharged?: string;
  charged?: string;
  machine?: {
    id: number;
    friendlyName: string;
  };
  location?: {
    venue?: {
      id: number;
      name: string;
    };
  };
  productSales?: Array<{
    vendStatus: string;
    isRefunded?: boolean;
    category?: string;
    [key: string]: any;
  }>;
  paymentStatusDisplay?: string;
  discountAmount?: string;
  promoCode?: string;
  customerEmail?: string;
  [key: string]: any;
}

interface ApiStats {
  endpoint: string;
  totalAPI: number;
  retrieved: number;
  todaySales: number;
  successfulSales: number;
  totalRevenue: number;
  dashboardSummary?: any;
  todayStats?: any;
  yesterdayStats?: any;
  fetchPeriodStats?: (period: string, customStart?: string, customEnd?: string) => Promise<any>;
}

interface DashboardViewProps {
  salesData: Sale[];
  apiStats: ApiStats;
  machines: any[];
  loadProgress: string;
  isLoading: boolean;
  onLoadAll: () => void;
  dateFilter?: string; // Reçu d'App.tsx mais ignoré
}

const DashboardView = ({ 
  salesData, 
  apiStats, 
  machines, 
  loadProgress, 
  isLoading, 
  onLoadAll,
  dateFilter: appDateFilter // Reçu d'App.tsx mais on l'ignore
}: DashboardViewProps) => {
  // Gestion interne des filtres - indépendant d'App.tsx
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [periodStats, setPeriodStats] = useState<any>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  // Fonction pour charger les stats d'une période
  const loadPeriodStats = async (period: string, customStart?: string, customEnd?: string) => {
    if (!apiStats.fetchPeriodStats) {
      console.warn('fetchPeriodStats non disponible');
      return;
    }

    try {
      setLoadingPeriod(true);
      console.log(`📊 Chargement stats pour: ${period}`, { customStart, customEnd });
      
      const stats = await apiStats.fetchPeriodStats(period, customStart, customEnd);
      console.log(`📊 Stats reçues pour ${period}:`, stats);
      
      setPeriodStats(stats);
    } catch (err) {
      console.error(`❌ Erreur chargement stats ${period}:`, err);
      setPeriodStats(null);
    } finally {
      setLoadingPeriod(false);
    }
  };

  // Charger les stats quand le filtre change
  useEffect(() => {
    if (dateFilter === 'custom' && customStartDate && customEndDate) {
      loadPeriodStats('custom', customStartDate, customEndDate);
    } else if (dateFilter !== 'custom') {
      loadPeriodStats(dateFilter);
    }
  }, [dateFilter, customStartDate, customEndDate, apiStats.fetchPeriodStats]);

  // Fonction pour obtenir le label du filtre
  const getFilterLabel = () => {
  const today = new Date();
  const formatDate = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  switch (dateFilter) {
    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return `Hier (${formatDate(yesterday)})`;
    }
    case 'today': 
      return `Aujourd'hui (${formatDate(today)})`;
    case '7days': {
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      return `7 derniers jours (${formatDate(sevenDaysAgo)} - ${formatDate(today)})`;
    }
    case '30days': {
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      return `30 derniers jours (${formatDate(thirtyDaysAgo)} - ${formatDate(today)})`;
    }
    case 'custom':
      if (customStartDate && customEndDate) {
        return `Période personnalisée (${customStartDate} - ${customEndDate})`;
      }
      return 'Période personnalisée';
    default: 
      return `Aujourd'hui (${formatDate(today)})`;
  }
};

// Appliquer le filtre d'account (propagée depuis App.tsx)
const filteredVenues = useMemo(() => {
  if (!periodStats?.venues) return [];

  const venuesWithAccount = periodStats.venues.map(venue => {
    const venueSale = salesData.find(s => s.venue_name === venue.venue_name);
    return {
      ...venue,
      account_id: venueSale?.account_id
    };
  });

  const accountId = apiStats?.currentAccountId;
  if (accountId) {
    return venuesWithAccount.filter(v => Number(v.account_id) === Number(accountId));
  }

  return venuesWithAccount;
}, [periodStats, salesData, apiStats?.currentAccountId]);

  // Stats à afficher selon la période ET le compte sélectionné
const displayStats = useMemo(() => {
  if (loadingPeriod) {
    return {
      totalRevenue: 0,
      totalOrders: 0,
      successfulOrders: 0,
      activeVenues: 0,
      venues: []
    };
  }

  if (filteredVenues.length > 0) {
    const totalRevenue = filteredVenues.reduce((sum, v) => sum + (v.total_revenue_ttc || 0), 0);
    const totalOrders = filteredVenues.reduce((sum, v) => sum + (v.successful_orders || 0), 0);
    
    return {
      totalRevenue,
      totalOrders,
      successfulOrders: totalOrders,
      activeVenues: filteredVenues.length,
      venues: filteredVenues
    };
  }

  return {
    totalRevenue: 0,
    totalOrders: 0,
    successfulOrders: 0,
    activeVenues: 0,
    venues: []
  };
}, [loadingPeriod, filteredVenues]);

  // Calculer le panier moyen
  const avgBasket = displayStats.successfulOrders > 0 
    ? displayStats.totalRevenue / displayStats.successfulOrders 
    : 0;
	
	useEffect(() => {
  console.log("🎯 Filtrage pour account ID:", apiStats?.currentAccountId);
}, [apiStats?.currentAccountId]);
	

  // Top 5 des venues
 const topVenues = filteredVenues
  .sort((a: any, b: any) => (b.total_revenue_ttc || 0) - (a.total_revenue_ttc || 0))
  .slice(0, 5);
  // Bottom 5 des venues
const bottomVenues = filteredVenues
  .sort((a: any, b: any) => (a.total_revenue_ttc || 0) - (b.total_revenue_ttc || 0))
  .slice(0, 5);

return (
  <div className="space-y-8">
    {/* Header simplifié */}
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl lg:text-3xl font-light text-white">Analytics</h2>
        <p className="text-sm lg:text-base text-slate-400 mt-1">
          Vue d'ensemble de votre activité
        </p>
      </div>

      <button
        onClick={onLoadAll}
        disabled={isLoading}
        className="flex items-center space-x-2 px-4 lg:px-6 py-2 lg:py-3 text-sm lg:text-base bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg disabled:opacity-50"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="font-medium">Recharger</span>
      </button>
    </div>

      {/* FILTRES DE PÉRIODE AU-DESSUS DES KPI */}
     <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl lg:rounded-2xl border border-slate-700/50 p-4 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base lg:text-lg font-medium text-white">
          Période d'analyse
        </h3>
        
        {/* Badge de période actuelle */}
        {dateFilter && (() => {
          const formatDate = (date: Date) => date.toLocaleDateString('fr-FR');
          const today = new Date();
          let displayText = '';
          
          switch (dateFilter) {
            case 'yesterday': {
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              displayText = formatDate(yesterday);
              break;
            }
            case 'today': 
              displayText = formatDate(today);
              break;
            case '7days': {
              const sevenDaysAgo = new Date(today);
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
              displayText = `${formatDate(sevenDaysAgo)} - ${formatDate(today)}`;
              break;
            }
            case '30days': {
              const thirtyDaysAgo = new Date(today);
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
              displayText = `${formatDate(thirtyDaysAgo)} - ${formatDate(today)}`;
              break;
            }
            case 'custom':
              if (customStartDate && customEndDate) {
                displayText = `${customStartDate} - ${customEndDate}`;
              }
              break;
          }
          
          return displayText && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/30 rounded-lg">
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-emerald-300">{displayText}</span>
            </div>
          );
        })()}
      </div>
      
      {/* Boutons de filtre */}
      <div className="flex flex-wrap gap-3">
        {[
          { key: 'yesterday', label: 'Hier' },
          { key: 'today', label: "Aujourd'hui" },
          { key: '7days', label: '7 jours' },
          { key: '30days', label: '30 jours' },
          { key: 'custom', label: 'Personnalisé' }
        ].map(filter => (
          <button
            key={filter.key}
            onClick={() => setDateFilter(filter.key)}
            disabled={loadingPeriod}
            className={`px-4 lg:px-6 py-2 lg:py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
              dateFilter === filter.key
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Sélecteur de dates personnalisées */}
      {dateFilter === 'custom' && (
        <div className="mt-4 pt-4 border-t border-slate-700/50">
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
    </div>
	</div>

      {/* Indicateur de chargement période */}
      {loadingPeriod && (
        <div className="bg-blue-500/20 border border-blue-500 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-blue-200 font-medium">
              Chargement des données pour {getFilterLabel()}...
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl lg:rounded-2xl p-4 lg:p-6 text-white shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 rounded-lg lg:rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
          <p className="text-emerald-100 text-xs lg:text-sm font-medium mb-1">CHIFFRE D'AFFAIRES TTC</p>
          <p className="text-xl lg:text-3xl font-light">
            {displayStats.totalRevenue.toLocaleString('fr-FR', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}€
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 rounded-lg lg:rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-blue-100 text-sm font-medium mb-1">VENTES RÉUSSIES</p>
          <p className="text-xl lg:text-3xl font-light">
            {displayStats.successfulOrders.toLocaleString()}
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 rounded-lg lg:rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <p className="text-purple-100 text-sm font-medium mb-1">VENUES ACTIVES</p>
          <p className="text-xl lg:text-3xl font-light">
            {displayStats.activeVenues}
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-white/20 rounded-lg lg:rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
          <p className="text-orange-100 text-sm font-medium mb-1">PANIER MOYEN</p>
          <p className="text-xl lg:text-3xl font-light">
            {avgBasket.toLocaleString('fr-FR', { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}€
          </p>
        </div>
      </div>

      {/* Top et Bottom 5 des venues - TOUJOURS AFFICHÉS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top 5 */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-4 lg:px-8 py-4 lg:py-6 border-b border-slate-700/50">
            <h3 className="text-base lg:text-lg font-medium text-white mb-2">
              🏆 Top 5 des venues • {getFilterLabel()}
            </h3>
            <p className="text-slate-400 text-sm">
              Meilleures performances
            </p>
          </div>
          
          <div className="p-4 lg:p-6">
            {topVenues.length > 0 ? (
              <div className="space-y-4">
                {topVenues.map((venue: any, index: number) => (
                  <div key={venue.venue_id || index} className="flex items-center justify-between p-3 lg:p-4 bg-slate-700/30 rounded-lg lg:rounded-xl hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold ${
                        index === 0 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                        index === 1 ? 'bg-gradient-to-r from-gray-400 to-gray-500' :
                        index === 2 ? 'bg-gradient-to-r from-yellow-600 to-yellow-700' :
                        'bg-gradient-to-r from-slate-500 to-slate-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="text-sm lg:text-base font-medium text-white">{venue.venue_name || `Venue ${venue.venue_id}`}</h4>
                        <div className="flex items-center space-x-2 lg:space-x-4 text-xs lg:text-sm text-slate-400">
                          <span>{venue.successful_orders || 0} commandes</span>
                          <span>•</span>
                          <span>
                            Panier: {
                              venue.successful_orders > 0 
                                ? ((venue.total_revenue_ttc || 0) / venue.successful_orders).toLocaleString('fr-FR', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  }) 
                                : '0,00'
                            }€
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm lg:text-lg font-semibold text-white">
                        {(venue.total_revenue_ttc || 0).toLocaleString('fr-FR', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        })}€
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-light">
                  Aucune vente trouvée pour cette période
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom 5 */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-700/50">
            <h3 className="text-base lg:text-lg font-medium text-white mb-2">
              📉 Bottom 5 des venues • {getFilterLabel()}
            </h3>
            <p className="text-slate-400 text-sm">
              Performances à améliorer
            </p>
          </div>
          
          <div className="p-4 lg:p-6">
            {bottomVenues.length > 0 ? (
              <div className="space-y-4">
                {bottomVenues.map((venue: any, index: number) => (
                  <div key={venue.venue_id || index} className="flex items-center justify-between p-3 lg:p-4 bg-slate-700/30 rounded-lg lg:rounded-xl hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold bg-gradient-to-r from-red-500 to-red-600">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="text-sm lg:text-base font-medium text-white">{venue.venue_name || `Venue ${venue.venue_id}`}</h4>
                        <div className="flex items-center space-x-2 lg:space-x-4 text-xs lg:text-sm text-slate-400">
                          <span>{venue.successful_orders || 0} commandes</span>
                          <span>•</span>
                          <span>
                            Panier: {
                              venue.successful_orders > 0 
                                ? ((venue.total_revenue_ttc || 0) / venue.successful_orders).toLocaleString('fr-FR', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  }) 
                                : '0,00'
                            }€
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm lg:text-lg font-semibold text-white">
                        {(venue.total_revenue_ttc || 0).toLocaleString('fr-FR', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        })}€
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <p className="text-slate-400 font-light">
                  Aucune vente trouvée pour cette période
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;