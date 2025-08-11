import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import DashboardView from './components/DashboardView';
import SalesView from './components/SalesView';
import MachinesView from './components/MachinesView';

// Configuration Supabase
const supabase = createClient(
  'https://ojphshzuosbfbftpoigy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmJmdHBvaWd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQ1Mjc3MCwiZXhwIjoyMDY3MDI4NzcwfQ.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q'
);

// Types simples pour éviter les erreurs d'import
interface Sale {
  id: string;
  total?: string;
  totalCharged?: string;
  charged?: string;
  createdAt: string;
  machine?: {
    id: number;
    friendlyName: string;
  };
  productSales?: Array<{
    vendStatus: string;
    isRefunded?: boolean;
    [key: string]: any;
  }>;
  paymentStatusDisplay?: string;
  location?: {
    venue?: {
      id: number;
      name: string;
    };
    id?: number;
    description?: string;
  };
  locationName?: string;
  [key: string]: any;
}

interface Machine {
  id: string;
  name: string;
  status?: string;
  isEnabled?: boolean;
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
  fetchPeriodStats?: (period: string, customStart?: string, customEnd?: string) => Promise<any>;
}

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sales, setSales] = useState<Sale[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStats, setApiStats] = useState<ApiStats>({
    endpoint: '',
    totalAPI: 0,
    retrieved: 0,
    todaySales: 0,
    successfulSales: 0,
    totalRevenue: 0
  });
  const [loadingProgress, setLoadingProgress] = useState('');

  const headers = {
    'Authorization': `Token ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // Fonction générique pour récupérer les stats selon la période - CORRIGÉE POUR TTC
const fetchPeriodStats = async (period: string, customStart?: string, customEnd?: string) => {
  try {
    console.log(`📊 fetchPeriodStats appelé pour: ${period}`, { customStart, customEnd });
    
    // Déterminer les dates selon la période
    let startDate: string;
    let endDate: string;
    
    if (period === 'today') {
      const today = new Date();
      const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      startDate = startOfDay.toISOString();
      endDate = endOfDay.toISOString();
    } else if (period === 'yesterday') {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const startOfDay = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 23, 59, 59, 999));
      startDate = startOfDay.toISOString();
      endDate = endOfDay.toISOString();
    } else if (period === '7days') {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const startOfPeriod = new Date(Date.UTC(sevenDaysAgo.getUTCFullYear(), sevenDaysAgo.getUTCMonth(), sevenDaysAgo.getUTCDate(), 0, 0, 0));
      const endOfPeriod = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      startDate = startOfPeriod.toISOString();
      endDate = endOfPeriod.toISOString();
    } else if (period === '30days') {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
      const startOfPeriod = new Date(Date.UTC(thirtyDaysAgo.getUTCFullYear(), thirtyDaysAgo.getUTCMonth(), thirtyDaysAgo.getUTCDate(), 0, 0, 0));
      const endOfPeriod = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      startDate = startOfPeriod.toISOString();
      endDate = endOfPeriod.toISOString();
    } else if (period === 'custom' && customStart && customEnd) {
      startDate = `${customStart}T00:00:00Z`;
      endDate = `${customEnd}T23:59:59Z`;
    } else {
      console.warn('Période non reconnue:', period);
      return null;
    }
    
    console.log('🕐 Période sélectionnée:', {
      start: startDate,
      end: endDate
    });
    
    // 📊 PAGINATION : Récupérer TOUTES les données
    let allData = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    
    // D'abord compter le total
    const { count: totalCount } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .eq('status', 'completed');
    
    console.log(`📊 Total à charger pour la période: ${totalCount} ventes`);
    
    // Charger par batch jusqu'à avoir tout
    while (hasMore && offset < (totalCount || 0)) {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        console.error('❌ Erreur batch:', error);
        throw error;
      }
      
      if (data && data.length > 0) {
        allData = [...allData, ...data];
        offset += data.length;
        
        console.log(`📥 Batch chargé: ${allData.length}/${totalCount} ventes`);
        
        // Si on a moins que la limite, on a tout récupéré
        if (data.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
    
    console.log(`✅ Total chargé: ${allData.length} ventes pour la période`);
    
    // Calculer les statistiques avec TOUTES les données
    if (allData.length > 0) {
      const totalRevenue = allData.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
      const activeVenues = [...new Set(allData.map(v => v.venue_id))].length;
      
      // Grouper par venue
      const venueMap = new Map();
      allData.forEach(sale => {
        const venueId = sale.venue_id || 'unknown';
        if (!venueMap.has(venueId)) {
          venueMap.set(venueId, {
            venue_id: sale.venue_id,
            venue_name: sale.venue_name,
            total_revenue_ttc: 0,
            successful_orders: 0
          });
        }
        const venue = venueMap.get(venueId);
        venue.total_revenue_ttc += parseFloat(sale.total_ttc || 0);
        venue.successful_orders++;
      });
      
      const result = {
        total_revenue_ttc: totalRevenue,
        total_revenue_ht: 0,
        total_orders: allData.length,
        successful_orders: allData.length,
        active_machines: activeVenues,
        venues: Array.from(venueMap.values())
      };
      
      console.log('✅ Stats calculées:', result);
      return result;
    }
    
    // Retourner des stats vides si pas de données
    return {
      total_revenue_ttc: 0,
      total_revenue_ht: 0,
      total_orders: 0,
      successful_orders: 0,
      active_machines: 0,
      venues: []
    };
    
  } catch (err) {
    console.error(`❌ Erreur fetchPeriodStats ${period}:`, err);
    return null;
  }
};


  // Fonction de validation centralisée pour le CA réel
  const isValidSaleForRevenue = (sale: Sale): boolean => {
    const isChargedOk = sale.charged === 'Yes';
    const hasSuccessfulProduct = sale.productSales && 
      Array.isArray(sale.productSales) && 
      sale.productSales.some(ps => ps.vendStatus === 'Success');
    const isNotDeclined = sale.paymentStatusDisplay !== 'DECLINED';
    const isNotRefunded = !sale.productSales || 
      !sale.productSales.some(ps => ps.isRefunded === true);
    const hasValidStatus = isChargedOk || hasSuccessfulProduct;
    
    return hasValidStatus && isNotDeclined && isNotRefunded;
  };

  // Fonction pour récupérer le résumé du dashboard depuis la vue
  const fetchDashboardSummary = async () => {
    try {
      const { data, error } = await supabase
        .from('dashboard_summary')
        .select('*')
        .single();
      
      if (error) throw error;
      
      console.log('📊 Dashboard Summary:', data);
      
      // Mettre à jour les stats avec les données de la vue
      if (data) {
        setApiStats(prev => ({
          ...prev,
          totalRevenue: parseFloat(data.total_revenue || 0),
          todaySales: data.total_orders || 0,
          successfulSales: data.successful_orders || 0,
          dashboardSummary: data
        }));
      }
      
      return data;
    } catch (err) {
      console.error('❌ Erreur dashboard_summary:', err);
      return null;
    }
  };

  // Fonction pour transformer les données Supabase au format VendLive
  const transformOrdersToSales = (orders: any[]): Sale[] => {
    const salesMap = new Map();
    let skippedCount = 0;
    
    orders.forEach((order, index) => {
      // Validation des champs critiques
      if (!order.vendlive_id || order.price_ttc === null || order.price_ttc === undefined) {
        console.warn(`⚠️ Ligne ${index} ignorée (données manquantes):`, {
          vendlive_id: order.vendlive_id,
          price_ttc: order.price_ttc,
          product_name: order.product_name
        });
        skippedCount++;
        return;
      }
      
      const saleId = order.vendlive_id.split('_')[0];
      
      if (!salesMap.has(saleId)) {
        salesMap.set(saleId, {
          id: saleId,
          createdAt: order.created_at ? 
            (order.created_at.endsWith('Z') ? order.created_at : order.created_at + 'Z') : 
            new Date().toISOString(),
          total: (order.price_ttc || 0).toString(),
          totalCharged: (order.price_ttc || 0).toString(), 
          charged: order.status === 'completed' ? 'Yes' : 'No',
          machine: {
            id: order.machine_id || 0,
            friendlyName: order.machine_name || 'Machine inconnue'
          },
          location: {
            venue: {
              id: order.venue_id || 0,
              name: order.venue_name || 'Venue inconnue'
            }
          },
          productSales: [],
          discountAmount: (order.discount_amount || 0).toString(),
          promoCode: order.promo_code,
          customerEmail: order.client_email,
          paymentStatusDisplay: order.status === 'refunded' ? 'DECLINED' : 'SUCCESS'
        });
      }
      
      const sale = salesMap.get(saleId);
      sale.productSales.push({
        productName: order.product_name || 'Produit inconnu',
        category: order.product_category || 'Non catégorisé',
        quantity: order.quantity || 1,
        price: order.price_ttc || 0,
        vendStatus: order.status === 'completed' ? 'Success' : 'Failed',
        totalPaid: (order.price_ttc || 0).toString(),
        isRefunded: order.status === 'refunded'
      });
      
      // Mettre à jour le total de la vente
      const currentTotal = parseFloat(sale.total || '0');
      sale.total = (currentTotal + (order.price_ttc || 0)).toString();
      sale.totalCharged = sale.total;
    });
    
    if (skippedCount > 0) {
      console.warn(`⚠️ ${skippedCount} lignes ignorées sur ${orders.length} (données manquantes)`);
    }
    
    const sales = Array.from(salesMap.values());
    console.log(`✅ ${sales.length} ventes transformées avec succès`);
    
    return sales;
  };

  // NOUVELLE fonction pour charger depuis Supabase - CHARGEMENT COMPLET
  const loadDataFromSupabase = async () => {
  try {
    setIsLoading(true);
    setError(null);
    setLoadingProgress('Connexion à Supabase...');
    
    console.log('🔍 Chargement depuis la table sales...');
    
    // 1. Charger le dashboard summary
    const { data: summary, error: summaryError } = await supabase
      .from('dashboard_summary')
      .select('*')
      .single();
    
    if (summary && !summaryError) {
      console.log('📊 Dashboard Summary trouvé:', summary);
      setApiStats(prev => ({
        ...prev,
        dashboardSummary: summary
      }));
    }
    
    // 2. Compter le total dans sales
    setLoadingProgress('Comptage des ventes...');
    const { count: totalCount, error: countError } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Erreur comptage:', countError);
      throw countError;
    }
    
    console.log(`📊 TOTAL dans sales : ${totalCount} ventes`);
    
    if (!totalCount || totalCount === 0) {
      setError('Aucune donnée trouvée dans la table sales. Lancez la synchronisation.');
      setIsLoading(false);
      return;
    }
    
    // 3. Charger toutes les ventes par batch
    let allSales: any[] = [];
    const batchSize = 1000;
    let offset = 0;
    
    while (offset < totalCount) {
      const progress = Math.round((offset / totalCount) * 100);
      setLoadingProgress(`Chargement des ventes... ${offset}/${totalCount} (${progress}%)`);
      
      const { data: batch, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + batchSize - 1);
      
      if (error) {
        console.error(`❌ Erreur batch ${offset}-${offset + batchSize}:`, error);
        throw error;
      }
      
      if (batch && batch.length > 0) {
        allSales = [...allSales, ...batch];
        console.log(`✅ Batch récupéré : ${batch.length} ventes`);
        console.log('🔍 Exemple de vente avec products:', batch[0]);
      }
      
      offset += batchSize;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`🎉 TOTAL CHARGÉ : ${allSales.length} ventes`);
    
    // 4. Pas besoin de transformer ! Les données sont déjà au bon format
    setSales(allSales);
    
    // 5. Calculer les stats
    const totalRevenue = allSales.reduce((sum, sale) => sum + (sale.total_ttc || 0), 0);
    
    setApiStats(prev => ({
      ...prev,
      endpoint: 'Supabase Sales',
      totalAPI: totalCount,
      retrieved: allSales.length,
      totalRevenue: totalRevenue,
      fetchPeriodStats
    }));
    
    setLoadingProgress(`✅ ${allSales.length} ventes chargées !`);
    setIsLoading(false);
    
  } catch (err) {
    console.error('❌ Erreur Supabase:', err);
    setError(err instanceof Error ? err.message : 'Erreur de connexion à la base de données');
    setIsLoading(false);
  }
};

  // BONUS : Fonction de debug pour voir l'état de votre base Supabase
  const debugSupabaseData = async () => {
    try {
      console.log('🔍 DEBUG : Analyse de la base Supabase...');
      
      // Compter dans chaque table
      const { count: ordersCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });
      
      const { count: salesCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });
      
      console.log('📊 RÉSULTATS DU DEBUG :');
      console.log(`- Table 'orders' : ${ordersCount} lignes`);
      console.log(`- Table 'sales' : ${salesCount} lignes`);
      
      // Regarder les dates des données
      const { data: oldestOrder } = await supabase
        .from('orders')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1);
      
      const { data: newestOrder } = await supabase
        .from('orders')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (oldestOrder?.[0] && newestOrder?.[0]) {
        console.log(`📅 Période des données :`);
        console.log(`- Plus ancienne : ${oldestOrder[0].created_at}`);
        console.log(`- Plus récente : ${newestOrder[0].created_at}`);
      }
      
      return { ordersCount, salesCount };
    } catch (err) {
      console.error('❌ Erreur debug:', err);
    }
  };

  // Exposer la fonction debug globalement pour pouvoir l'appeler dans la console
  React.useEffect(() => {
    (window as any).debugSupabaseData = debugSupabaseData;
  }, []);

  // Fonction pour charger les machines
  const fetchMachinesData = async () => {
    try {
      console.log('🏭 Chargement des machines...');
      let allMachines: any[] = [];
      let nextUrl: string | null = `${API_BASE}/api/2.0/machines/`;
      
      while (nextUrl) {
        const response = await fetch(nextUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Erreur machines ${response.status}`);
        }
        
        const data = await response.json();
        allMachines = [...allMachines, ...(data.results || [])];
        nextUrl = data.next;
      }
      
      console.log('🏭 Machines récupérées:', allMachines.length);
      
      // Pour chaque machine, récupérer son statut enabled depuis l'endpoint devices
      const enrichedMachines = await Promise.all(
        allMachines.map(async (machine: any) => {
          try {
            const deviceUrl = `${API_BASE}/api/2.0/devices/?machineId=${machine.id}`;
            const deviceResponse = await fetch(deviceUrl, { headers });
            
            if (deviceResponse.ok) {
              const deviceData = await deviceResponse.json();
              const device = deviceData.results?.[0];
              
              return {
                ...machine,
                isEnabled: device?.enabled !== undefined ? device.enabled : true
              };
            }
          } catch (err) {
            console.warn(`⚠️ Impossible de récupérer le device pour la machine ${machine.id}:`, err);
          }
          
          return {
            ...machine,
            isEnabled: true
          };
        })
      );
      
      setMachines(enrichedMachines);
      console.log('✅ Machines enrichies avec statut enabled');
      
    } catch (err) {
      console.error('❌ Erreur machines:', err);
    }
  };

  // Version complète avec pagination automatique
	const handleLoadAll = async () => {
	  console.log('🔄 Rechargement complet depuis sales');
	  setSales([]);
	  setError(null);
	  
	  try {
		setIsLoading(true);
		
		// Récupérer le résumé
		await fetchDashboardSummary();
		
		// Compter dans sales
		const { count: totalCount } = await supabase
		  .from('sales')
		  .select('*', { count: 'exact', head: true });
		
		console.log(`📊 Total à charger : ${totalCount} ventes`);
		
		if (!totalCount || totalCount === 0) {
		  setError('Aucune vente dans la base');
		  setIsLoading(false);
		  return;
		}
		
		let allSales: any[] = [];
		const batchSize = 1000;
		let offset = 0;
		
		while (offset < totalCount) {
		  const progress = Math.round((offset / totalCount) * 100);
		  setLoadingProgress(`Chargement... ${offset}/${totalCount} (${progress}%)`);
		  
		  const { data: batch, error } = await supabase
			.from('sales')
			.select('*')
			.order('created_at', { ascending: false })
			.range(offset, offset + batchSize - 1);
		  
		  if (error) throw error;
		  
		  allSales = [...allSales, ...(batch || [])];
		  offset += batchSize;
		  
		  await new Promise(resolve => setTimeout(resolve, 100));
		}
		
		console.log(`✅ ${allSales.length} ventes chargées`);
		setSales(allSales);
		
		const totalRevenue = allSales.reduce((sum, sale) => sum + (sale.total_ttc || 0), 0);
		
		setApiStats(prev => ({
		  ...prev,
		  endpoint: 'Supabase Sales',
		  totalAPI: allSales.length,
		  retrieved: allSales.length,
		  totalRevenue: totalRevenue,
		  fetchPeriodStats
		}));
		
		setLoadingProgress(`✅ ${allSales.length} ventes chargées !`);
		setIsLoading(false);
		
	  } catch (err) {
		console.error('❌ Erreur handleLoadAll:', err);
		setError(err instanceof Error ? err.message : 'Erreur lors du rechargement');
		setIsLoading(false);
	  }
	};

  // useEffect principal - Chargement initial avec Supabase
  useEffect(() => {
    const loadData = async () => {
      console.log('🚀 === DÉMARRAGE AVEC SUPABASE ===');
      console.log('📊 Chargement de toutes les données disponibles');
      
      try {
        // Charger les machines
        await fetchMachinesData();
        
        // Charger les ventes depuis Supabase
        await loadDataFromSupabase();
        
        console.log('✅ Initialisation terminée');
      } catch (err) {
        console.error('❌ Erreur initialisation:', err);
        setError('Erreur lors du chargement des données');
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []);

  if (isLoading && sales.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center mb-6 mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-light text-white mb-2">Shape Eat Analytics</h2>
          <p className="text-slate-400 font-light">Chargement des données...</p>
          {loadingProgress && (
            <p className="text-emerald-400 text-sm mt-2">{loadingProgress}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar moderne */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700/50">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Shape Eat</h1>
                <p className="text-xs text-slate-400">Analytics</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            <div className="mb-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Analytics</p>
              
              <button
                onClick={() => setActiveView('dashboard')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeView === 'dashboard'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5v10l5-3 5 3V5a2 2 0 00-2-2H10a2 2 0 00-2 2z" />
                </svg>
                <span>Dashboard</span>
              </button>
              
              <button
                onClick={() => setActiveView('sales')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeView === 'sales'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span>Ventes & Produits</span>
              </button>
              
              <button
                onClick={() => setActiveView('machines')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeView === 'machines'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <span>Machines</span>
              </button>
            </div>
          </nav>

          {/* Stats en bas de sidebar */}
          <div className="p-4 border-t border-slate-700/50">
            <div className="bg-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">
                  Source de données
                </span>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <div className="text-sm text-white font-medium">
                {apiStats.retrieved.toLocaleString()} ventes
              </div>
              <div className="text-xs text-slate-400 mt-1">
                via {apiStats.endpoint || 'Supabase'}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                CA: {apiStats.totalRevenue.toFixed(2)}€
              </div>
              {apiStats.dashboardSummary && (
                <div className="text-xs text-slate-400 mt-2">
                  {apiStats.dashboardSummary.active_machines} machines actives
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="ml-64">
        {/* Header SANS FILTRES */}
        <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-light text-white mb-1">
                {activeView === 'dashboard' && 'Analytics Dashboard'}
                {activeView === 'sales' && 'Ventes & Produits'}
                {activeView === 'machines' && 'Gestion des Machines'}
              </h1>
              <p className="text-slate-400 text-sm">
                {activeView === 'dashboard' && 'Vue d\'ensemble de votre activité Shape Eat'}
                {activeView === 'sales' && 'Analyse complète des ventes et produits'}
                {activeView === 'machines' && 'Supervision de votre parc de machines'}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Bouton pour recharger toutes les données */}
              {!isLoading && (
                <button
                  onClick={handleLoadAll}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm font-medium">
                    Charger tout
                  </span>
                </button>
              )}
              
              {/* Avatar utilisateur */}
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">U</span>
                </div>
                <div className="text-sm">
                  <p className="text-white font-medium">Utilisateur</p>
                  <p className="text-slate-400 text-xs">Admin</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Messages d'erreur */}
        {error && (
          <div className="mx-8 mt-6">
            <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-amber-500/30 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-amber-300">Information</p>
                  <p className="text-sm text-amber-400">{error}</p>
                  {error.includes('Aucune donnée') && (
                    <p className="text-xs text-amber-400 mt-1">
                      Essayez de changer la période ou lancez la synchronisation GitHub Actions
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contenu des vues */}
        <main className="p-8">
          {activeView === 'dashboard' && (
            <DashboardView 
              salesData={sales} 
              apiStats={apiStats}
              machines={machines}
              loadProgress={loadingProgress}
              isLoading={isLoading}
              onLoadAll={handleLoadAll}
            />
          )}
          
          {activeView === 'sales' && (
            <SalesView sales={sales} />
          )}
          
          {activeView === 'machines' && (
            <MachinesView 
              machines={machines} 
              sales={sales}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;