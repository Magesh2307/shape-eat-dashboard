import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient';
import DashboardView from './components/DashboardView';
import SalesView from './components/SalesView';
import MachinesView from './components/MachinesView';
import LoginForm from './components/LoginForm';

// 🔒 Service sécurisé utilisant UNIQUEMENT Supabase
class SecureApiService {
  // Récupérer les machines directement depuis Supabase
  async fetchMachines() {
    console.log('📡 Récupération machines depuis Supabase...');
    
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) {
        console.error('❌ Erreur Supabase machines:', error);
        throw error;
      }
      
      console.log(`✅ ${data?.length || 0} machines récupérées depuis Supabase`);
      return data || [];
    } catch (error) {
      console.error('❌ Erreur fetchMachines:', error);
      return [];
    }
  }

  // Récupérer les ventes directement depuis Supabase
  async fetchSales(filters?: { startDate?: string; endDate?: string; limit?: number }) {
    console.log('📡 Récupération ventes depuis Supabase...');

    try {
      let query = supabase.from('sales').select('*');

      if (filters?.startDate && filters?.endDate) {
        query = query
          .gte('created_at', filters.startDate)
          .lte('created_at', filters.endDate);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Erreur Supabase sales:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} ventes récupérées depuis Supabase`);
      return data || [];
    } catch (error) {
      console.error('❌ Erreur fetchSales:', error);
      return [];
    }
  }

  // Vérifier la santé de Supabase
  async checkHealth() {
    console.log('⚙️ Vérification Supabase...');
    
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('❌ Supabase indisponible:', error);
        return null;
      }
      
      console.log('✅ Supabase est opérationnel');
      return { status: 'OK' };
    } catch (error) {
      console.error('❌ Erreur health check:', error);
      return null;
    }
  }
}

// Types
interface User {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
}

interface Session {
  access_token: string;
  refresh_token: string;
  user: User;
}

interface Sale {
  id: string;
  account_id?: number;
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

const validateSaleData = (sale: any): boolean => {
  if (!sale || typeof sale !== 'object') return false;
  if (!sale.vendlive_id) return false;
  
  const totalTTC = parseFloat(sale.total_ttc);
  if (isNaN(totalTTC) || totalTTC < 0) return false;
  
  return true;
};

const normalizeOrderData = (order: any) => {
  if (!validateSaleData(order)) {
    console.warn('Données invalides ignorées:', order?.vendlive_id);
    return null;
  }

  let categories = [];
  try {
    if (typeof order.categories === 'string') {
      categories = JSON.parse(order.categories);
    } else if (Array.isArray(order.categories)) {
      categories = order.categories;
    }
  } catch (e) {
    console.warn('Categories JSON invalide pour:', order.vendlive_id);
    categories = [];
  }

  return {
    ...order,
    total_ttc: Math.max(0, parseFloat(order.total_ttc || '0')),
    total_ht: Math.max(0, parseFloat(order.total_ht || '0')),
    discount_amount: parseFloat(order.discount_amount || '0'),
    products: Array.isArray(order.products) ? order.products : [],
    categories,
    venue_id: order.venue_id ? parseInt(order.venue_id) : null,
    machine_id: order.machine_id ? parseInt(order.machine_id) : null,
    venue_name: String(order.venue_name || '').trim(),
    machine_name: String(order.machine_name || '').trim(),
    created_at: order.created_at
  };
};

function App() {
  const [apiService] = useState(() => new SecureApiService());
  
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');
  const [sales, setSales] = useState<Sale[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiStats, setApiStats] = useState<ApiStats>({
    endpoint: 'Supabase',
    totalAPI: 0,
    retrieved: 0,
    todaySales: 0,
    successfulSales: 0,
    totalRevenue: 0
  });
  const [loadingProgress, setLoadingProgress] = useState('');
  const [accountFilter, setAccountFilter] = useState<'all' | number>('all');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Gestion de l'authentification
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Fonction fetchPeriodStats
  const fetchPeriodStats = async (period: string, customStart?: string, customEnd?: string) => {
    try {
      console.log(`📊 fetchPeriodStats appelé pour: ${period}`, { customStart, customEnd });
      
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
      
      console.log('🕐 Période sélectionnée:', { start: startDate, end: endDate });
      
      let allData = [];
      let offset = 0;
      const limit = 1000;
      let hasMore = true;
      
      const { count: totalCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .eq('status', 'completed');
      
      console.log(`📊 Total à charger pour la période: ${totalCount} commandes`);
      
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
          const normalizedData = data.map(normalizeOrderData).filter(Boolean);
          allData = [...allData, ...normalizedData];
          offset += data.length;
          
          console.log(`🔥 Batch chargé: ${allData.length}/${totalCount} commandes`);
          
          if (data.length < limit) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      console.log(`✅ Total chargé: ${allData.length} commandes pour la période`);
      
      if (allData.length > 0) {
        const totalRevenue = allData.reduce((sum, v) => sum + parseFloat(v.total_ttc || '0'), 0);
        const activeVenues = [...new Set(allData.map(v => v.venue_id))].length;
        
        const venueMap = new Map();
        allData.forEach(order => {
          const venueId = order.venue_id || 'unknown';
          if (!venueMap.has(venueId)) {
            venueMap.set(venueId, {
              venue_id: order.venue_id,
              venue_name: order.venue_name,
              total_revenue_ttc: 0,
              successful_orders: 0
            });
          }
          const venue = venueMap.get(venueId);
          venue.total_revenue_ttc += parseFloat(order.total_ttc || '0');
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

  const loadDataFromSupabase = async () => {
    setIsLoading(true);
    try {
      let allSales: any[] = [];
      const batchSize = 1000;
      let hasMore = true;
      let offset = 0;

      while (hasMore) {
        let query = supabase
          .from('sales')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (accountFilter !== 'all') {
          query = query.eq('account_id', accountFilter);
        }

        const { data: batch, error } = await query;

        if (error) throw error;
        
        if (batch && batch.length > 0) {
          const normalizedBatch = batch.map(sale => ({
            ...sale,
            total_ttc: parseFloat(sale.total_ttc || '0'),
            total_ht: parseFloat(sale.total_ht || '0'),
            discount_amount: parseFloat(sale.discount_amount || '0'),
            is_refunded: Boolean(sale.is_refunded),
            products: Array.isArray(sale.products) ? sale.products : [],
            categories: typeof sale.categories === 'string' 
              ? JSON.parse(sale.categories || '[]')
              : (Array.isArray(sale.categories) ? sale.categories : [])
          }));
          
          allSales = [...allSales, ...normalizedBatch];
          offset += batchSize;
          
          if (batch.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      const filteredSales = accountFilter === 'all' 
        ? allSales 
        : allSales.filter(sale => sale.account_id === accountFilter);
      
      setSales(filteredSales);
      
      const totalRevenue = allSales
        .filter(sale => sale.status === 'completed' && !sale.is_refunded)
        .reduce((sum, sale) => sum + parseFloat(sale.total_ttc || '0'), 0);

      setApiStats(prev => ({
        ...prev,
        endpoint: 'Supabase',
        totalAPI: allSales.length,
        retrieved: allSales.length,
        totalRevenue: totalRevenue,
        fetchPeriodStats
      }));
      
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
      setError('Erreur lors du chargement des données');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMachinesData = async () => {
    try {
      console.log('📡 Chargement des machines depuis Supabase...');
      const machinesData = await apiService.fetchMachines();

      const filtered = accountFilter === 'all'
        ? machinesData
        : machinesData.filter(m => Number(m.account_id) === Number(accountFilter));

      console.log('✅ Machines filtrées:', filtered.length);
      setMachines(filtered);
    } catch (err) {
      console.error('❌ Erreur machines:', err);
      setError('Erreur lors du chargement des machines');
    }
  };

  const handleLoadAll = async () => {
    console.log('🔄 Rechargement complet');
    setSales([]);
    setError(null);
    
    try {
      setIsLoading(true);
      
      await fetchMachinesData();
      
      const { count: totalCount } = await supabase
        .from('sales')
        .select('*', { count: 'exact', head: true });
      
      console.log(`📊 Total à charger : ${totalCount} sales`);
      
      if (!totalCount || totalCount === 0) {
        setError('Aucune commande dans la base');
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
        
        if (batch && batch.length > 0) {
          const normalizedBatch = batch
            .map(normalizeOrderData)
            .filter(Boolean);
          allSales = [...allSales, ...normalizedBatch];
        }
        
        offset += batchSize;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ ${allSales.length} sales normalisées`);
      setSales(allSales);
      
      const totalRevenue = allSales
        .filter(sale => sale.status === 'completed' && !sale.is_refunded)
        .reduce((sum, sale) => sum + parseFloat(sale.total_ttc || '0'), 0);

      const successfulSales = allSales.filter(sale => sale.status === 'completed' && !sale.is_refunded).length;

      setApiStats(prev => ({
        ...prev,
        endpoint: 'Supabase',
        totalAPI: allSales.length,
        retrieved: allSales.length,
        totalRevenue: totalRevenue,
        successfulSales: successfulSales,
        fetchPeriodStats
      }));
      
      setLoadingProgress(`✅ ${allSales.length} commandes chargées !`);
      setIsLoading(false);
      
    } catch (err) {
      console.error('❌ Erreur handleLoadAll:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du rechargement');
      setIsLoading(false);
    }
  };

  const filteredSales = useMemo(() => {
    if (accountFilter === 'all') return sales;
    return sales.filter(sale => Number(sale.account_id) === Number(accountFilter));
  }, [sales, accountFilter]);

  const filteredMachines = useMemo(() => {
    if (accountFilter === 'all') return machines;
    return machines.filter(machine => {
      const machineSales = sales.filter(
        s => Number(s.machine_id) === Number(machine.id)
      );
      return machineSales.some(
        s => Number(s.account_id) === Number(accountFilter)
      );
    });
  }, [machines, sales, accountFilter]);

  useEffect(() => {
    if (!session || loading) return;

    const loadData = async () => {
      console.log('🚀 === DÉMARRAGE AVEC SUPABASE ===');
      try {
        await fetchMachinesData();
        await loadDataFromSupabase();
        console.log('✅ Initialisation terminée');
      } catch (err) {
        console.error('❌ Erreur initialisation:', err);
        setError('Erreur lors du chargement des données');
        setIsLoading(false);
      }
    };

    loadData();
  }, [session, loading, accountFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center mb-6 mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-light text-white mb-2">Vérification de l'authentification...</h2>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

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
      {/* Reste du code UI identique... */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700/50 transform transition-transform duration-200 lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
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

          <div className="p-4 border-t border-slate-700/50">
            <div className="bg-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">Source de données</span>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              </div>
              <div className="text-sm text-white font-medium">
                {apiStats.retrieved.toLocaleString()} ventes
              </div>
              <div className="text-xs text-slate-400 mt-1">
                via {apiStats.endpoint}
              </div>
              <div className="text-xs text-slate-400 mt-2">
                CA: {apiStats.totalRevenue.toFixed(2)}€
              </div>
            </div>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="lg:ml-64">
        <div className="bg-slate-700/50 border-b border-slate-700/50 px-4 lg:px-8 py-3">
          <div className="flex items-center space-x-3">
            <label className="text-sm text-slate-400">Compte:</label>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Tous les comptes</option>
              <option value="295">Shape Eat</option>
              <option value="337">OA Bobigny</option>
              <option value="360">OA Clichy</option>
              <option value="340">OA Flandres</option>
              <option value="339">OA Roissy-en-Brie/St-Brice</option>
              <option value="338">OA Pré-St-Gervais</option>
            </select>
          </div>
        </div>

        <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-white mr-4"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex-1">
              <h1 className="text-lg lg:text-2xl font-light text-white mb-1">
                {activeView === 'dashboard' && 'Analytics Dashboard'}
                {activeView === 'sales' && 'Ventes & Produits'}
                {activeView === 'machines' && 'Gestion des Machines'}
              </h1>
              <p className="hidden lg:block text-slate-400 text-sm">
                {activeView === 'dashboard' && 'Vue d\'ensemble de votre activité Shape Eat'}
                {activeView === 'sales' && 'Analyse complète des ventes et produits'}
                {activeView === 'machines' && 'Supervision de votre parc de machines'}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {!isLoading && (
                <button
                  onClick={handleLoadAll}
                  className="hidden lg:flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-sm font-medium">Charger tout</span>
                </button>
              )}
              
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {session?.user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="hidden lg:block text-sm">
                  <p className="text-white font-medium">{session?.user?.email || 'Utilisateur'}</p>
                  <p className="text-slate-400 text-xs">Admin</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="ml-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200"
                  title="Se déconnecter"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>

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
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="p-8">
          {activeView === 'dashboard' && (
            <DashboardView
              salesData={filteredSales}
              apiStats={{
                ...apiStats,
                currentAccountId: accountFilter === 'all' ? null : Number(accountFilter),
              }}
              machines={filteredMachines}
              loadProgress={loadingProgress}
              isLoading={isLoading}
              onLoadAll={handleLoadAll}
            />
          )}

          {activeView === 'sales' && (
            <SalesView sales={filteredSales} supabase={supabase} />
          )}

          {activeView === 'machines' && (
            <MachinesView 
              machines={filteredMachines}
              sales={filteredSales}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;