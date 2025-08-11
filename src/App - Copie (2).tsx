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

interface DailyStats {
  date: string;
  venue_id: number;
  venue_name: string;
  machine_id: number;
  machine_name: string;
  total_orders: number;
  successful_orders: number;
  total_revenue_ttc: number;
  total_discount: number;
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
  todayStats?: {
    total_revenue: number;
    total_orders: number;
    successful_orders: number;
    active_machines: number;
    venues: DailyStats[];
  };
  yesterdayStats?: {
    total_revenue: number;
    total_orders: number;
    successful_orders: number;
    active_machines: number;
    venues: DailyStats[];
  };
  fetchPeriodStats?: (period: string) => Promise<any>;
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
 // Fonction générique pour récupérer les stats selon la période - VERSION COMPLÈTE
// Fonction générique pour récupérer les stats selon la période
const fetchPeriodStats = async (period: string, customStart?: string, customEnd?: string) => {
  try {
    console.log(`📊 fetchPeriodStats appelé pour: ${period}`, { customStart, customEnd });
    
    // 1. Gestion de TODAY
    if (period === 'today') {
      const today = new Date();
      const startOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      
      console.log('🕐 Today range:', {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
      });
      
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .eq('status', 'completed');
      
      if (error) {
        console.error('❌ Erreur requête today:', error);
        throw error;
      }
      
      console.log(`📊 Today: ${data?.length || 0} ventes trouvées`);
      
      if (data && data.length > 0) {
        const totalRevenue = data.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
        const activeVenues = [...new Set(data.map(v => v.venue_id))].length;
        
        // Grouper par venue
        const venueMap = new Map();
        data.forEach(sale => {
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
          total_orders: data.length,
          successful_orders: data.length,
          active_machines: activeVenues,
          venues: Array.from(venueMap.values())
        };
        
        console.log('✅ Stats today calculées:', result);
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
    }
    
    // 2. Gestion de YESTERDAY
    if (period === 'yesterday') {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const startOfDay = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0));
      const endOfDay = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 23, 59, 59, 999));
      
      console.log('🕐 Yesterday range:', {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString()
      });
      
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .eq('status', 'completed');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const totalRevenue = data.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
        const activeVenues = [...new Set(data.map(v => v.venue_id))].length;
        
        // Grouper par venue
        const venueMap = new Map();
        data.forEach(sale => {
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
        
        return {
          total_revenue_ttc: totalRevenue,
          total_revenue_ht: 0,
          total_orders: data.length,
          successful_orders: data.length,
          active_machines: activeVenues,
          venues: Array.from(venueMap.values())
        };
      }
      
      return {
        total_revenue_ttc: 0,
        total_revenue_ht: 0,
        total_orders: 0,
        successful_orders: 0,
        active_machines: 0,
        venues: []
      };
    }
    
    // 3. Gestion de 7DAYS
    if (period === '7days') {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // -6 pour inclure aujourd'hui
      
      const startOfPeriod = new Date(Date.UTC(sevenDaysAgo.getUTCFullYear(), sevenDaysAgo.getUTCMonth(), sevenDaysAgo.getUTCDate(), 0, 0, 0));
      const endOfPeriod = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfPeriod.toISOString())
        .lte('created_at', endOfPeriod.toISOString())
        .eq('status', 'completed');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const totalRevenue = data.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
        const activeVenues = [...new Set(data.map(v => v.venue_id))].length;
        
        // Grouper par venue
        const venueMap = new Map();
        data.forEach(sale => {
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
        
        return {
          total_revenue_ttc: totalRevenue,
          total_revenue_ht: 0,
          total_orders: data.length,
          successful_orders: data.length,
          active_machines: activeVenues,
          venues: Array.from(venueMap.values())
        };
      }
      
      return {
        total_revenue_ttc: 0,
        total_revenue_ht: 0,
        total_orders: 0,
        successful_orders: 0,
        active_machines: 0,
        venues: []
      };
    }
    
    // 4. Gestion de 30DAYS
    if (period === '30days') {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // -29 pour inclure aujourd'hui
      
      const startOfPeriod = new Date(Date.UTC(thirtyDaysAgo.getUTCFullYear(), thirtyDaysAgo.getUTCMonth(), thirtyDaysAgo.getUTCDate(), 0, 0, 0));
      const endOfPeriod = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
      
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', startOfPeriod.toISOString())
        .lte('created_at', endOfPeriod.toISOString())
        .eq('status', 'completed');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const totalRevenue = data.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
        const activeVenues = [...new Set(data.map(v => v.venue_id))].length;
        
        // Grouper par venue
        const venueMap = new Map();
        data.forEach(sale => {
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
        
        return {
          total_revenue_ttc: totalRevenue,
          total_revenue_ht: 0,
          total_orders: data.length,
          successful_orders: data.length,
          active_machines: activeVenues,
          venues: Array.from(venueMap.values())
        };
      }
      
      return {
        total_revenue_ttc: 0,
        total_revenue_ht: 0,
        total_orders: 0,
        successful_orders: 0,
        active_machines: 0,
        venues: []
      };
    }
    
    // 5. Gestion des périodes CUSTOM
    if (period === 'custom' && customStart && customEnd) {
      console.log('🕐 Custom range:', {
        start: `${customStart}T00:00:00Z`,
        end: `${customEnd}T23:59:59Z`
      });
      
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .gte('created_at', `${customStart}T00:00:00Z`)
        .lte('created_at', `${customEnd}T23:59:59Z`)
        .eq('status', 'completed');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const totalRevenue = data.reduce((sum, v) => sum + parseFloat(v.total_ttc || 0), 0);
        const activeVenues = [...new Set(data.map(v => v.venue_id))].length;
        
        // Grouper par venue
        const venueMap = new Map();
        data.forEach(sale => {
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
        
        return {
          total_revenue_ttc: totalRevenue,
          total_revenue_ht: 0,
          total_orders: data.length,
          successful_orders: data.length,
          active_machines: activeVenues,
          venues: Array.from(venueMap.values())
        };
      }
      
      return {
        total_revenue_ttc: 0,
        total_revenue_ht: 0,
        total_orders: 0,
        successful_orders: 0,
        active_machines: 0,
        venues: []
      };
    }
	return null;
  } catch (err) {
    console.error(`❌ Erreur fetchPeriodStats ${period}:`, err);
    return null;
  }
};
    

  // Mettre à jour fetchRecentDailyStats pour utiliser la fonction générique
  const fetchRecentDailyStats = async () => {
  const [todayStats, yesterdayStats] = await Promise.all([
    fetchPeriodStats('today'),
    fetchPeriodStats('yesterday')
  ]);
  
  console.log('📊 Stats loaded:', { todayStats, yesterdayStats });
  
setApiStats(prev => ({
  ...prev,
  todayStats,
  yesterdayStats,
  fetchPeriodStats // ✅ Ajouté
}));

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

  // NOUVELLE fonction pour charger depuis Supabase (modifiée pour charger TOUT)
  const loadDataFromSupabase = async () => {
  try {
    setIsLoading(true);
    setError(null);
    setLoadingProgress('Connexion à Supabase...');
    
    console.log('🔍 Chargement depuis Supabase...');
    
    // IMPORTANT : Récupérer d'abord dashboard_summary
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
    
    // Ensuite, charger TOUTES les données (sans filtre de date)
    setLoadingProgress('Récupération de toutes les ventes...');
    
    const { data: salesData, error, count } = await supabase
      .from('sales')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100000);
    
    if (error) {
      console.error('❌ Erreur Supabase:', error);
      throw error;
    }
    
    console.log(`✅ ${salesData?.length || 0} lignes chargées depuis Supabase (total: ${count})`);
    
    if (!salesData || salesData.length === 0) {
      setError('Aucune donnée trouvée dans la base. Lancez la synchronisation GitHub Actions.');
      setIsLoading(false);
      return;
    }
    
    // Transformer les données
    const transformedSales = transformOrdersToSales(salesData || []);
    setSales(transformedSales);
    
    // Calculer les stats générales
    setApiStats(prev => ({
      ...prev,
      endpoint: 'Supabase',
      totalAPI: count || transformedSales.length,
      retrieved: transformedSales.length,
      fetchPeriodStats // ✅ Exposer la fonction
    }));
    
    setLoadingProgress('✅ Chargement terminé !');
    setIsLoading(false);
    
    console.log(`🎉 Dashboard prêt : ${transformedSales.length} ventes chargées`);
    
  } catch (err) {
    console.error('❌ Erreur Supabase:', err);
    setError(err instanceof Error ? err.message : 'Erreur de connexion à la base de données');
    setIsLoading(false);
  }
};

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
    console.log('🔄 Rechargement complet avec pagination');
    setSales([]);
    setError(null);
    
    try {
      setIsLoading(true);
      
      // Récupérer le résumé d'abord
      await fetchDashboardSummary();
      
      // Récupérer les stats récentes
      await fetchRecentDailyStats();
      
      // Compter le total
      const { count: totalCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });
      
      console.log(`📊 Total à charger : ${totalCount} lignes`);
      
      if (!totalCount || totalCount === 0) {
        setError('Aucune donnée dans la base');
        setIsLoading(false);
        return;
      }
      
      let allOrders: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      
      // Charger par batch
      while (offset < totalCount) {
        const progress = Math.round((offset / totalCount) * 100);
        setLoadingProgress(`Chargement... ${offset}/${totalCount} (${progress}%)`);
        
        const { data: batch, error } = await supabase
  .from('sales')
  .select('*')
  .order('created_at', { ascending: false })
  .range(offset, offset + batchSize - 1);
        
        if (error) {
          console.error(`❌ Erreur batch ${offset}-${offset + batchSize}:`, error);
          throw error;
        }
        
        allOrders = [...allOrders, ...(batch || [])];
        offset += batchSize;
        
        // Pause pour éviter de surcharger
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ ${allOrders.length} commandes chargées au total`);
      
      // Transformer toutes les données
      const transformedSales = transformOrdersToSales(allOrders);
      setSales(transformedSales);
      
      // Calculer les stats
      setApiStats(prev => ({
  ...prev,
  endpoint: 'Supabase (Complet)',
  totalAPI: transformedSales.length,
  retrieved: transformedSales.length,
  fetchPeriodStats // ✅ Ajouté
}));
      
      setLoadingProgress(`✅ ${transformedSales.length} ventes chargées !`);
      setIsLoading(false);
      
    } catch (err) {
      console.error('❌ Erreur handleLoadAll:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du rechargement complet');
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
			
			// Charger les stats récentes (aujourd'hui et hier)
			await fetchRecentDailyStats();
			
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
			{/* ... contenu de la sidebar ... */}
		  </div>

		  {/* Contenu principal */}
		  <div className="ml-64">
			{/* Header */}
			<header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-8 py-6">
			  {/* ... contenu du header ... */}
			</header>

			{/* Messages d'erreur */}
			{error && (
			  <div className="mx-8 mt-6">
				{/* ... message d'erreur ... */}
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
	}
export default App;