import React, { useState, useEffect } from 'react';
import DashboardView from './components/DashboardView';
import SalesView from './components/SalesView';
import MachinesView from './components/MachinesView';

// Types simples pour éviter les erreurs d'import
interface Sale {
  id: string;
  total?: string;        // VendLive utilise 'total'
  totalCharged?: string; // VendLive utilise 'totalCharged'
  charged?: string;      // VendLive utilise 'charged' = "Yes"
  createdAt: string;
  machine?: {
    id: number;
    friendlyName: string;
  };
  productSales?: Array<{
    vendStatus: string;  // VendLive utilise 'vendStatus' = "Success"
    isRefunded?: boolean; // Pour exclure les remboursements
    [key: string]: any;
  }>;
  paymentStatusDisplay?: string; // Pour exclure les paiements refusés
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
  [key: string]: any;
}

interface ApiStats {
  endpoint: string;
  totalAPI: number;
  retrieved: number;
  todaySales: number;
  successfulSales: number;
  totalRevenue: number;
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
  
  // ✅ NOUVEAUX ÉTATS pour le chargement progressif
  const [isProgressiveLoading, setIsProgressiveLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [currentChunk, setCurrentChunk] = useState(0);

  const headers = {
    'Authorization': `Token ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ✅ FONCTION DE VALIDATION CENTRALISÉE pour le CA réel
  const isValidSaleForRevenue = (sale: Sale): boolean => {
    // 1. Vérifier que la vente est confirmée/chargée
    const isChargedOk = sale.charged === 'Yes';
    
    // 2. Vérifier qu'il y a au moins un produit avec vendStatus = Success
    const hasSuccessfulProduct = sale.productSales && 
      Array.isArray(sale.productSales) && 
      sale.productSales.some(ps => ps.vendStatus === 'Success');
    
    // 3. Exclure les paiements refusés
    const isNotDeclined = sale.paymentStatusDisplay !== 'DECLINED';
    
    // 4. Exclure les remboursements
    const isNotRefunded = !sale.productSales || 
      !sale.productSales.some(ps => ps.isRefunded === true);
    
    // 5. Au moins une condition de validation doit être vraie
    const hasValidStatus = isChargedOk || hasSuccessfulProduct;
    
    return hasValidStatus && isNotDeclined && isNotRefunded;
  };

  // ✅ FONCTION pour calculer les stats en temps réel
  const calculateStatsFromRealData = (salesData: Sale[]) => {
    const todayISO = new Date().toISOString().split('T')[0];
    const salesFromToday = salesData.filter(sale => {
      const saleDate = sale.createdAt.split('T')[0];
      return saleDate === todayISO;
    });
    
    const validSalesToday = salesFromToday.filter(isValidSaleForRevenue);
    
    const totalRevenue = validSalesToday.reduce((sum: number, sale: Sale) => {
      const amount = parseFloat(sale.total || sale.totalCharged || '0');
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    return {
      todaySales: salesFromToday.length,
      successfulSales: validSalesToday.length,
      totalRevenue: totalRevenue
    };
  };

  // ✅ FONCTION pour mettre à jour les stats après chaque chunk
  const updateStatsAfterChunk = (allSalesData: Sale[], totalCount: number) => {
    const stats = calculateStatsFromRealData(allSalesData);
    
    setApiStats({
      endpoint: '/api/2.0/order-sales/',
      totalAPI: totalCount,
      retrieved: allSalesData.length,
      ...stats
    });

    console.log(`📊 Stats mises à jour après chunk: ${allSalesData.length}/${totalCount} ventes, CA: ${stats.totalRevenue.toFixed(2)}€`);
  };

  // ✅ NOUVELLE FONCTION : Chargement progressif automatique par tranches de 500
  const startProgressiveLoading = async () => {
    try {
      setIsProgressiveLoading(true);
      setIsLoading(true);
      setError(null);
      let allSales: Sale[] = [];
      let currentPage = 1;
      let totalCount = 0;
      let nextUrl: string | null = null;

      console.log('🚀 === DÉMARRAGE DU CHARGEMENT PROGRESSIF ===');
      
      // ✅ ÉTAPE 1 : Charger la première page pour connaître le total
      const initialUrl = `${API_BASE}/api/2.0/order-sales/?pageSize=500&orderBy=Created%20at`;
      console.log('🔗 Chargement page 1:', initialUrl);
      
      setLoadingProgress('Chargement des 500 premières ventes...');
      
      const firstResponse = await fetch(initialUrl, { headers });
      if (!firstResponse.ok) {
        throw new Error(`Erreur ${firstResponse.status}: ${firstResponse.statusText}`);
      }
      
      const firstData = await firstResponse.json();
      allSales = firstData.results || [];
      totalCount = firstData.count || 0;
      nextUrl = firstData.next;
      
      console.log(`✅ Page 1 chargée: ${allSales.length} ventes sur ${totalCount} total`);
      
      // ✅ ÉTAPE 2 : Mettre à jour l'affichage avec les premières données
      setSales([...allSales]);
      updateStatsAfterChunk(allSales, totalCount);
      setCurrentChunk(1);
      setIsLoading(false); // ✅ Permettre l'affichage de l'interface
      
      // ✅ ÉTAPE 3 : Continuer le chargement par chunks si nécessaire
      while (nextUrl && allSales.length < totalCount) {
        currentPage++;
        
        // ✅ Pause pour que l'utilisateur voit la mise à jour
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const percentage = Math.round((allSales.length / totalCount) * 100);
        setLoadingProgress(`Chargement page ${currentPage}... (${percentage}% - ${allSales.length}/${totalCount})`);
        setCurrentChunk(currentPage);
        
        console.log(`📄 Chargement page ${currentPage}... (${allSales.length}/${totalCount})`);
        
        const pageResponse = await fetch(nextUrl, { headers });
        
        if (!pageResponse.ok) {
          console.warn(`⚠️ ERREUR page ${currentPage}:`, pageResponse.status);
          break;
        }
        
        const pageData = await pageResponse.json();
        const newSales = pageData.results || [];
        
        // ✅ ÉTAPE 4 : Ajouter les nouvelles données
        allSales = [...allSales, ...newSales];
        nextUrl = pageData.next;
        
        console.log(`✅ Page ${currentPage} chargée: +${newSales.length} ventes (total: ${allSales.length})`);
        
        // ✅ ÉTAPE 5 : Mettre à jour l'affichage en temps réel
        setSales([...allSales]);
        updateStatsAfterChunk(allSales, totalCount);
      }
      
      // ✅ ÉTAPE 6 : Chargement terminé
      const finalPercentage = Math.round((allSales.length / totalCount) * 100);
      setLoadingProgress(`✅ Chargement terminé ! ${allSales.length}/${totalCount} ventes (${finalPercentage}%)`);
      
      console.log('🎉 CHARGEMENT PROGRESSIF TERMINÉ:', {
        totalPages: currentPage,
        totalRecupere: allSales.length,
        totalDisponible: totalCount,
        pourcentage: finalPercentage + '%'
      });
      
    } catch (err) {
      console.error('❌ Erreur lors du chargement progressif:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setIsLoading(false);
    } finally {
      setIsProgressiveLoading(false);
    }
  };

  const fetchMachinesData = async () => {
    try {
      console.log('🏭 Chargement des machines...');
      const url = `${API_BASE}/api/2.0/machines/`;
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Erreur machines ${response.status}`);
      }
      
      const data = await response.json();
      const machinesData = data.results || [];
      setMachines(machinesData);
      console.log('🏭 Machines récupérées:', machinesData.length);
      
    } catch (err) {
      console.error('❌ Erreur machines:', err);
    }
  };

  // ✅ FONCTION pour redémarrer le chargement manuel
  const handleLoadAll = () => {
    console.log('🔄 Redémarrage du chargement progressif manuel');
    setSales([]); // Reset des données
    startProgressiveLoading();
  };

  // ✅ DÉMARRAGE AUTOMATIQUE au lancement de l'application
  useEffect(() => {
    const loadData = async () => {
      console.log('🚀 === DÉMARRAGE AUTOMATIQUE DE L\'APPLICATION ===');
      console.log('🎯 Début du chargement progressif automatique par tranches de 500');
      
      try {
        // Charger les machines en parallèle
        await fetchMachinesData();
        
        // Démarrer le chargement progressif des ventes
        await startProgressiveLoading();
        
        console.log('✅ Initialisation terminée');
      } catch (err) {
        console.error('❌ Erreur initialisation:', err);
        setError('Erreur lors du chargement des données');
        setIsLoading(false);
      }
    };
    
    loadData();
  }, []); // Se déclenche une seule fois au mounting

  if (isLoading && sales.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center mb-6 mx-auto animate-pulse">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-light text-white mb-2">Shape Eat Analytics</h2>
          <p className="text-slate-400 font-light">Chargement progressif en cours...</p>
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
                <span>Ventes</span>
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

          {/* Stats en bas de sidebar avec progression en temps réel */}
          <div className="p-4 border-t border-slate-700/50">
            <div className="bg-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">
                  {isProgressiveLoading ? `Page ${currentChunk}` : 'Données chargées'}
                </span>
                {isProgressiveLoading && (
                  <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
              <div className="text-sm text-white font-medium">
                {apiStats.retrieved.toLocaleString()} / {apiStats.totalAPI.toLocaleString()}
              </div>
              <div className="w-full bg-slate-600 rounded-full h-1.5 mt-2">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${apiStats.totalAPI > 0 ? (apiStats.retrieved / apiStats.totalAPI) * 100 : 0}%` }}
                ></div>
              </div>
              <div className="text-xs text-slate-400 mt-2">
                CA réel: {apiStats.totalRevenue.toFixed(2)}€
              </div>
              {isProgressiveLoading && (
                <div className="text-xs text-emerald-400 mt-1">
                  Chargement automatique...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="ml-64">
        {/* Header */}
        <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-light text-white mb-1">
                {activeView === 'dashboard' && 'Analytics Dashboard'}
                {activeView === 'sales' && 'Détail des Ventes'}
                {activeView === 'machines' && 'Gestion des Machines'}
              </h1>
              <p className="text-slate-400 text-sm">
                {activeView === 'dashboard' && 'Vue d\'ensemble de votre activité Shape Eat'}
                {activeView === 'sales' && 'Historique complet des transactions'}
                {activeView === 'machines' && 'Supervision de votre parc de machines'}
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Indicateur de chargement progressif */}
              {isProgressiveLoading && (
                <div className="flex items-center space-x-3 px-4 py-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium text-emerald-400">{loadingProgress}</span>
                </div>
              )}
              
              {/* Bouton pour relancer si nécessaire */}
              {!isProgressiveLoading && apiStats.retrieved < apiStats.totalAPI && (
                <button
                  onClick={handleLoadAll}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-sm font-medium">
                    Recharger tout ({apiStats.totalAPI.toLocaleString()})
                  </span>
                </button>
              )}
              
              {/* Indicateur de chargement terminé */}
              {!isProgressiveLoading && apiStats.retrieved >= apiStats.totalAPI && apiStats.totalAPI > 0 && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 rounded-xl border border-green-500/30">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm font-medium text-green-400">Toutes les données chargées</span>
                </div>
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
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-red-500/30 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-300">Erreur de connexion</p>
                  <p className="text-sm text-red-400">{error}</p>
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
              isLoading={isProgressiveLoading}
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