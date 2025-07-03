import React, { useEffect, useState, useMemo } from "react";
import CustomDateRangePicker from './CustomDateRangePicker';

// Types pour les props
interface Sale {
  id: string;
  createdAt: string;
  charged?: string;
  total?: string;
  totalCharged?: string;
  machine?: {
    id: number;
    friendlyName: string;
  };
  productSales?: Array<{
    vendStatus: string;
    totalPaid?: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface Machine {
  id: number;
  friendlyName: string;
  [key: string]: any;
}

interface ApiStats {
  endpoint: string;
  totalAPI: number;
  retrieved: number;
  [key: string]: any;
}

interface DashboardViewProps {
  salesData: Sale[];
  machines: Machine[];
  onLoadAll: () => void;
  apiStats: ApiStats;
  loadProgress: string;
  isLoading: boolean;
}

const DashboardView: React.FC<DashboardViewProps> = ({ salesData, machines, onLoadAll, apiStats, loadProgress, isLoading }) => {
  // États pour les filtres de dates
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

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

  // Calculer les stats filtrées
  const filteredStats = useMemo(() => {
    if (!salesData || salesData.length === 0) {
      return {
        totalSales: 0,
        totalRevenue: 0,
        statuses: {},
        avgBasket: 0,
        activeMachines: 0,
        successfulSales: 0,
        topMachines: [],
        bottomMachines: []
      };
    }

    const { start, end } = getDateRange();
    
    // Calculer la période précédente pour la comparaison
    const getPreviousPeriod = () => {
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1); // Fin = jour avant le début actuel
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - daysDiff + 1); // Même durée
      return { start: prevStart, end: prevEnd };
    };

    const previousPeriod = getPreviousPeriod();
    
    // Filtrer les ventes pour la période actuelle
    const currentPeriodSales = salesData.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      const saleDateOnly = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
      return saleDateOnly >= start && saleDateOnly <= end;
    });

    // Filtrer les ventes pour la période précédente
    const previousPeriodSales = salesData.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      const saleDateOnly = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate());
      return saleDateOnly >= previousPeriod.start && saleDateOnly <= previousPeriod.end;
    });

    console.log(`📅 Filtre ${dateFilter}: ${currentPeriodSales.length} ventes entre ${start.toLocaleDateString()} et ${end.toLocaleDateString()}`);
    console.log(`📅 Période précédente: ${previousPeriodSales.length} ventes entre ${previousPeriod.start.toLocaleDateString()} et ${previousPeriod.end.toLocaleDateString()}`);

    // ✅ DEBUG : Analyser la structure des ventes et les exclusions
    if (currentPeriodSales.length > 0) {
      console.log('🔍 DEBUG - Structure d\'une vente exemple:', currentPeriodSales[0]);
      console.log('🔍 DEBUG - Clés disponibles:', Object.keys(currentPeriodSales[0]));
      console.log('🔍 DEBUG - Structure machine:', currentPeriodSales[0].machine);
      console.log('🔍 DEBUG - Structure location:', currentPeriodSales[0].location);
      console.log('🔍 DEBUG - Location name:', currentPeriodSales[0].locationName);
      console.log('🔍 DEBUG - ProductSales:', currentPeriodSales[0].productSales?.[0]);
      console.log('🔍 DEBUG - PaymentStatusDisplay:', currentPeriodSales[0].paymentStatusDisplay);
      
      // ✅ DEBUG : Compter les exclusions
      const declinedSales = currentPeriodSales.filter(sale => sale.paymentStatusDisplay === 'DECLINED').length;
      const refundedSales = currentPeriodSales.filter(sale => 
        sale.productSales && sale.productSales.some(ps => ps.isRefunded === true)
      ).length;
      
      console.log(`🚫 DEBUG - Ventes exclues: ${declinedSales} refusées, ${refundedSales} remboursées`);
    }

    // Calculer les métriques par venue pour la période actuelle
    const currentVenueMetrics = new Map();
    const previousVenueMetrics = new Map();

    // Traiter les ventes de la période actuelle
    currentPeriodSales.forEach(sale => {
      // ✅ CORRECTION VendLive : vérifier le statut selon la vraie logique VendLive
      const isChargedOk = sale.charged === 'Yes';
      const hasSuccessfulProduct = sale.productSales && Array.isArray(sale.productSales) && 
                                  sale.productSales.some(ps => ps.vendStatus === 'Success');
      
      // ✅ NOUVEAU : Exclure les paiements refusés et remboursés
      const isNotDeclined = sale.paymentStatusDisplay !== 'DECLINED';
      const isNotRefunded = !sale.productSales || !sale.productSales.some(ps => ps.isRefunded === true);
      
      const isValidSale = (isChargedOk || hasSuccessfulProduct) && isNotDeclined && isNotRefunded;
      
      if (!sale || !isValidSale) return;
      
      // ✅ CORRECTION : Afficher le nom du VENUE au lieu de la machine
      const venueId = sale.location?.venue?.id || sale.location?.id || sale.machine?.id || 'unknown';
      const venueName = sale.location?.venue?.name || sale.locationName || sale.location?.description || `Venue ${venueId}`;
      
      // ✅ CORRECTION : Montant selon la structure VendLive
      const amount = parseFloat(sale.total || sale.totalCharged || '0');
      
      if (isNaN(amount) || amount <= 0) return;

      console.log(`💰 Vente venue ${venueName} (${venueId}): ${amount}€ - Valide: charged=${sale.charged}, declined=${sale.paymentStatusDisplay}, refunded=${sale.productSales?.some(ps => ps.isRefunded)}`);

      if (!currentVenueMetrics.has(venueId)) {
        currentVenueMetrics.set(venueId, {
          id: venueId,
          name: venueName,
          revenue: 0,
          orders: 0
        });
      }

      const metric = currentVenueMetrics.get(venueId);
      metric.revenue += amount;
      metric.orders += 1;
    });

    // Traiter les ventes de la période précédente
    previousPeriodSales.forEach(sale => {
      // ✅ CORRECTION VendLive : vérifier le statut selon la vraie logique VendLive
      const isChargedOk = sale.charged === 'Yes';
      const hasSuccessfulProduct = sale.productSales && Array.isArray(sale.productSales) && 
                                  sale.productSales.some(ps => ps.vendStatus === 'Success');
      
      // ✅ NOUVEAU : Exclure les paiements refusés et remboursés
      const isNotDeclined = sale.paymentStatusDisplay !== 'DECLINED';
      const isNotRefunded = !sale.productSales || !sale.productSales.some(ps => ps.isRefunded === true);
      
      const isValidSale = (isChargedOk || hasSuccessfulProduct) && isNotDeclined && isNotRefunded;
      
      if (!sale || !isValidSale) return;
      
      // ✅ CORRECTION : Afficher le nom du VENUE au lieu de la machine
      const venueId = sale.location?.venue?.id || sale.location?.id || sale.machine?.id || 'unknown';
      const venueName = sale.location?.venue?.name || sale.locationName || sale.location?.description || `Venue ${venueId}`;
      
      // ✅ CORRECTION : Montant selon la structure VendLive
      const amount = parseFloat(sale.total || sale.totalCharged || '0');
      
      if (isNaN(amount) || amount <= 0) return;

      if (!previousVenueMetrics.has(venueId)) {
        previousVenueMetrics.set(venueId, {
          id: venueId,
          name: venueName,
          revenue: 0,
          orders: 0
        });
      }

      const metric = previousVenueMetrics.get(venueId);
      metric.revenue += amount;
      metric.orders += 1;
    });

    // ✅ DEBUG : Vérifier les métriques calculées
    console.log('🏪 DEBUG - Venues trouvés période actuelle:', Array.from(currentVenueMetrics.entries()));
    console.log('🏪 DEBUG - Venues trouvés période précédente:', Array.from(previousVenueMetrics.entries()));

    // Créer le top 5 avec comparaison
    const topMachines = Array.from(currentVenueMetrics.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(current => {
        const previous = previousVenueMetrics.get(current.id) || { revenue: 0, orders: 0 };
        const revenueGrowth = previous.revenue > 0 
          ? ((current.revenue - previous.revenue) / previous.revenue) * 100 
          : current.revenue > 0 ? 100 : 0;
        const ordersGrowth = previous.orders > 0 
          ? ((current.orders - previous.orders) / previous.orders) * 100 
          : current.orders > 0 ? 100 : 0;

        return {
          ...current,
          revenueGrowth,
          ordersGrowth,
          previousRevenue: previous.revenue,
          previousOrders: previous.orders
        };
      });

    // Créer le bottom 5 (pires venues)
    const bottomMachines = Array.from(currentVenueMetrics.values())
      .sort((a, b) => a.revenue - b.revenue)
      .slice(0, 5)
      .map(current => {
        const previous = previousVenueMetrics.get(current.id) || { revenue: 0, orders: 0 };
        const revenueGrowth = previous.revenue > 0 
          ? ((current.revenue - previous.revenue) / previous.revenue) * 100 
          : current.revenue > 0 ? 100 : 0;
        const ordersGrowth = previous.orders > 0 
          ? ((current.orders - previous.orders) / previous.orders) * 100 
          : current.orders > 0 ? 100 : 0;

        return {
          ...current,
          revenueGrowth,
          ordersGrowth,
          previousRevenue: previous.revenue,
          previousOrders: previous.orders
        };
      });

    // ✅ DEBUG : Vérifier le top 5 et bottom 5 final
    console.log('🏆 DEBUG - Top 5 venues calculé:', topMachines);
    console.log('📉 DEBUG - Bottom 5 venues calculé:', bottomMachines);

    // Calculer les stats globales
    let totalSales = 0;
    let totalRevenue = 0;
    const statusCount = {};
    const machineSet = new Set();

    for (const sale of currentPeriodSales) {
      if (!sale || !sale.productSales || !Array.isArray(sale.productSales)) continue;

      for (const item of sale.productSales) {
        const amount = parseFloat(item.totalPaid || 0);
        const status = item.vendStatus || "Inconnu";

        if (amount > 0) {
          totalSales++;
          totalRevenue += amount;
          machineSet.add(sale.machine?.friendlyName);
        }

        statusCount[status] = (statusCount[status] || 0) + 1;
      }
    }

    // Compter les ventes réussies selon la logique VendLive (avec exclusions)
    const successfulSales = currentPeriodSales.filter(sale => {
      const isChargedOk = sale.charged === 'Yes';
      const hasSuccessfulProduct = sale.productSales && 
                                  Array.isArray(sale.productSales) && 
                                  sale.productSales.some(ps => ps.vendStatus === 'Success');
      
      // ✅ NOUVEAU : Exclure les paiements refusés et remboursés
      const isNotDeclined = sale.paymentStatusDisplay !== 'DECLINED';
      const isNotRefunded = !sale.productSales || !sale.productSales.some(ps => ps.isRefunded === true);
      
      const amount = parseFloat(sale.total || sale.totalCharged || '0');
      const hasAmount = !isNaN(amount) && amount > 0;
      
      return (isChargedOk || hasSuccessfulProduct) && isNotDeclined && isNotRefunded && hasAmount;
    }).length;

    const avgBasket = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      totalSales: currentPeriodSales.length,
      totalRevenue,
      statuses: statusCount,
      avgBasket,
      activeMachines: machineSet.size,
      successfulSales,
      topMachines,
      bottomMachines
    };
  }, [salesData, dateFilter, customStartDate, customEndDate]);

  const getFilterLabel = () => {
    switch (dateFilter) {
      case 'yesterday': return 'Hier';
      case 'today': return 'Aujourd\'hui';
      case '7days': return '7 derniers jours';
      case '30days': return '30 derniers jours';
      case 'custom': return 'Période personnalisée';
      default: return 'Aujourd\'hui';
    }
  };

  return (
    <div className="space-y-8">
      {/* Filtres de dates */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h3 className="text-lg font-medium text-white mb-2">Période d'analyse</h3>
            <p className="text-slate-400 text-sm">Sélectionnez la période pour analyser vos données</p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'yesterday', label: 'Hier' },
              { key: 'today', label: 'Aujourd\'hui' },
              { key: '7days', label: '7 jours' },
              { key: '30days', label: '30 jours' },
              { key: 'custom', label: 'Personnalisé' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setDateFilter(filter.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  dateFilter === filter.key
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sélecteur de dates personnalisées */}
        {dateFilter === 'custom' && (
          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <div className="max-w-md">
              <label className="block text-sm font-medium text-slate-300 mb-3">Sélectionnez une période</label>
              <CustomDateRangePicker
                startDate={customStartDate}
                endDate={customEndDate}
                onDateChange={(start, end) => {
                  setCustomStartDate(start);
                  setCustomEndDate(end);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Titre avec période active */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light text-white mb-1">
            Analytics • {getFilterLabel()}
          </h2>
          <p className="text-slate-400 text-sm">
            Vue d'ensemble de votre activité Shape Eat
          </p>
        </div>

        {/* Bouton charger tout */}
        {apiStats && apiStats.retrieved < apiStats.totalAPI && !isLoading && (
          <button
            onClick={onLoadAll}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-sm font-medium">
              Charger tout ({apiStats.totalAPI.toLocaleString()})
            </span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
          <p className="text-emerald-100 text-sm font-medium mb-1">CHIFFRE D'AFFAIRES</p>
          <p className="text-2xl font-light">
            {filteredStats.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <p className="text-blue-100 text-sm font-medium mb-1">VENTES</p>
          <p className="text-2xl font-light">
            {filteredStats.totalSales.toLocaleString()}
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <p className="text-purple-100 text-sm font-medium mb-1">VENUES ACTIVES</p>
          <p className="text-2xl font-light">
            {filteredStats.activeMachines}
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
          <p className="text-orange-100 text-sm font-medium mb-1">PANIER MOYEN</p>
          <p className="text-2xl font-light">
            {filteredStats.avgBasket.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </p>
        </div>
      </div>

      {/* Top 5 et Bottom 5 des venues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top 5 des venues */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-700/50">
            <h3 className="text-lg font-medium text-white mb-2">
              🏆 Top 5 des venues • {getFilterLabel()}
            </h3>
            <p className="text-slate-400 text-sm">
              Meilleures performances
            </p>
          </div>
          
          <div className="p-6">
            {filteredStats.topMachines.length > 0 ? (
              <div className="space-y-4">
                {filteredStats.topMachines.map((machine, index) => (
                  <div key={machine.id} className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl hover:bg-slate-700/50 transition-colors">
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
                        <h4 className="font-medium text-white">{machine.name}</h4>
                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span>{machine.orders} commandes</span>
                          <span>•</span>
                          <span>Panier: {machine.orders > 0 ? (machine.revenue / machine.orders).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}€</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">
                        {machine.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                      </div>
                      <div className="flex items-center justify-end space-x-3 mt-1">
                        {/* Progression CA uniquement */}
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-slate-400">CA:</span>
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium ${
                            machine.revenueGrowth > 0 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : machine.revenueGrowth < 0 
                                ? 'bg-red-500/20 text-red-400' 
                                : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {machine.revenueGrowth > 0 ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : machine.revenueGrowth < 0 ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span>
                              {machine.revenueGrowth > 0 ? '+' : ''}{machine.revenueGrowth.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-light">Aucune vente trouvée pour cette période</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom 5 des venues (pires) */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-700/50">
            <h3 className="text-lg font-medium text-white mb-2">
              📉 Bottom 5 des venues • {getFilterLabel()}
            </h3>
            <p className="text-slate-400 text-sm">
              Performances à améliorer
            </p>
          </div>
          
          <div className="p-6">
            {filteredStats.bottomMachines && filteredStats.bottomMachines.length > 0 ? (
              <div className="space-y-4">
                {filteredStats.bottomMachines.map((machine, index) => (
                  <div key={machine.id} className="flex items-center justify-between p-4 bg-slate-700/30 rounded-xl hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold bg-gradient-to-r from-red-500 to-red-600">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{machine.name}</h4>
                        <div className="flex items-center space-x-4 text-sm text-slate-400">
                          <span>{machine.orders} commandes</span>
                          <span>•</span>
                          <span>Panier: {machine.orders > 0 ? (machine.revenue / machine.orders).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}€</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">
                        {machine.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                      </div>
                      <div className="flex items-center justify-end space-x-3 mt-1">
                        {/* Progression CA uniquement */}
                        <div className="flex items-center space-x-1">
                          <span className="text-xs text-slate-400">CA:</span>
                          <div className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium ${
                            machine.revenueGrowth > 0 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : machine.revenueGrowth < 0 
                                ? 'bg-red-500/20 text-red-400' 
                                : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {machine.revenueGrowth > 0 ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : machine.revenueGrowth < 0 ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span>
                              {machine.revenueGrowth > 0 ? '+' : ''}{machine.revenueGrowth.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <p className="text-slate-400 font-light">Aucune vente trouvée pour cette période</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section debug */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center">
          <span className="mr-2">🔍</span>
          DEBUG - Analyse {getFilterLabel()} (CA filtré - hors refusés/remboursés)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Total ventes période</p>
            <p className="text-white font-medium">{filteredStats.totalSales}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Ventes réussies (après exclusions)</p>
            <p className="text-white font-medium">{filteredStats.successfulSales}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">CA total période (filtré)</p>
            <p className="text-white font-medium">{filteredStats.totalRevenue.toFixed(2)}€</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Statuts uniques</p>
            <p className="text-white font-medium">{Object.keys(filteredStats.statuses).join(", ") || "VIDE"}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Venues actives</p>
            <p className="text-white font-medium">{filteredStats.activeMachines}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Top venues trouvées</p>
            <p className="text-white font-medium">{filteredStats.topMachines.length}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-slate-400 mb-1">Bottom venues trouvées</p>
            <p className="text-white font-medium">{filteredStats.bottomMachines?.length || 0}</p>
          </div>
        </div>

        {/* Indicateur de progression si chargement */}
        {isLoading && (
          <div className="mt-4 flex items-center space-x-3 p-4 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-emerald-400">{loadProgress}</span>
          </div>
        )}

        {/* Stats API */}
        {apiStats && (
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-400">
              📊 DONNÉES API: {apiStats.retrieved.toLocaleString()} / {apiStats.totalAPI.toLocaleString()} ventes récupérées
              {apiStats.endpoint && ` • ${apiStats.endpoint}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardView;