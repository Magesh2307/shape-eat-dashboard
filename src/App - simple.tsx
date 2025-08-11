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

// Types simples
interface Sale {
  id: string;
  vendlive_id: string;
  created_at: string;
  total_ttc: number;
  total_ht: number;
  discount_amount: number;
  status: string;
  venue_id: number;
  venue_name: string;
  machine_id: number;
  machine_name: string;
  customer_email?: string;
  promo_code?: string;
  nb_products: number;
}

interface Machine {
  id: string;
  name: string;
  status?: string;
  isEnabled?: boolean;
}

function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sales, setSales] = useState<Sale[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fonction unique pour charger les données de Supabase
  const loadDataFromSupabase = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔍 Chargement depuis Supabase...');
      
      // Charger TOUTES les ventes
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Erreur Supabase:', error);
        throw error;
      }
      
      console.log(`✅ ${salesData?.length || 0} ventes chargées depuis Supabase`);
      
      // Directement utiliser les données de la table sales
      setSales(salesData || []);
      
      setIsLoading(false);
      
    } catch (err) {
      console.error('❌ Erreur:', err);
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      setIsLoading(false);
    }
  };

  // Charger au démarrage
  useEffect(() => {
    loadDataFromSupabase();
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-800/95 backdrop-blur-xl border-r border-slate-700/50">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white">Shape Eat</h1>
          <p className="text-slate-400 text-sm">Analytics Dashboard</p>
        </div>
        
        <nav className="mt-8 px-4">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`w-full text-left px-4 py-3 rounded-lg mb-2 transition-all ${
              activeView === 'dashboard'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveView('sales')}
            className={`w-full text-left px-4 py-3 rounded-lg mb-2 transition-all ${
              activeView === 'sales'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Ventes
          </button>
          <button
            onClick={() => setActiveView('machines')}
            className={`w-full text-left px-4 py-3 rounded-lg mb-2 transition-all ${
              activeView === 'machines'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            Machines
          </button>
        </nav>
      </div>

      {/* Contenu principal */}
      <div className="ml-64">
        {/* Header */}
        <header className="bg-slate-800/50 backdrop-blur-xl border-b border-slate-700/50 px-8 py-6">
          <h2 className="text-2xl font-light text-white">
            {activeView === 'dashboard' && 'Tableau de bord'}
            {activeView === 'sales' && 'Historique des ventes'}
            {activeView === 'machines' && 'Gestion des machines'}
          </h2>
        </header>

        {/* Contenu */}
        <main className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {activeView === 'dashboard' && (
            <DashboardView 
              salesData={sales}
              supabase={supabase}
              onReload={loadDataFromSupabase}
            />
          )}
          
          {activeView === 'sales' && (
            <SalesView sales={sales} />
          )}
          
          {activeView === 'machines' && (
            <MachinesView machines={machines} sales={sales} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;