import React, { useState, useEffect, useMemo } from 'react';

interface StockViewProps {
  machines: any[];
  sales: any[];
}

const StockView: React.FC<StockViewProps> = ({ machines = [], sales = [] }) => {
  // États pour les stocks et filtres
  const [stocks, setStocks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ NOUVEAU : État pour la machine sélectionnée
  const [selectedMachineId, setSelectedMachineId] = useState<string>('all');

  // États pour les filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'quantity' | 'alpha'>('quantity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);
  // ✅ NOUVEAU : Toggle pour regrouper par produit
  const [groupByProduct, setGroupByProduct] = useState(false);

  // Configuration API
  const API_BASE = 'https://vendlive.com';
  const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';
  
  const headers = {
    'Authorization': `Token ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  // ✅ Initialiser avec "Toutes les machines" par défaut
  useEffect(() => {
    if (machines.length > 0 && !selectedMachineId) {
      setSelectedMachineId('all');
    }
  }, [machines, selectedMachineId]);

  // Fonction pour récupérer les stocks d'UNE machine OU de TOUTES
  const fetchStockDataForMachine = async (machineId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (!machineId) {
        setError('Aucune machine sélectionnée');
        return;
      }
      
      if (machineId === 'all') {
        console.log('=== CHARGEMENT STOCKS TOUTES MACHINES ===');
        console.log('🎯 Mode regroupement:', groupByProduct);
        console.log('🎯 Filtre stock > 0:', showOnlyInStock);
        
        // ✅ Récupérer les stocks de toutes les machines
        const allStocks: any[] = [];
        const machineIds = machines.map(m => m.id).slice(0, 10); // Limiter à 10 machines
        
        console.log('🔍 Machines à traiter:', machineIds);
        
        for (const currentMachineId of machineIds) {
          try {
            console.log(`📦 Chargement machine ${currentMachineId}...`);
            
            const stockUrl = `${API_BASE}/api/2.0/stock-report/?machineId=${currentMachineId}`;
            const response = await fetch(stockUrl, { headers });
            
            if (!response.ok) {
              console.warn(`⚠️ Erreur machine ${currentMachineId}: ${response.status}`);
              continue;
            }
            
            const apiData = await response.json();
            const results = apiData.results || [];
            
            console.log(`✅ Machine ${currentMachineId}: ${results.length} articles`);
            
            // Ajouter l'ID de la machine à chaque item
            results.forEach((item: any) => {
              allStocks.push({
                ...item,
                _machineId: currentMachineId
              });
            });
            
          } catch (err) {
            console.error(`❌ Erreur machine ${currentMachineId}:`, err);
          }
        }
        
        console.log(`🎯 TOTAL articles récupérés: ${allStocks.length}`);
        
        if (allStocks.length === 0) {
          console.warn('❌ Aucun article récupéré de toutes les machines');
          setStocks([]);
          return;
        }
        
        // ✅ DEBUG : Examiner les premiers items
        console.log('🔍 SAMPLE DATA (toutes machines):', allStocks.slice(0, 3).map(item => ({
          productId: item.product?.id,
          productName: item.product?.name,
          quantity: item.stockInformation?.current,
          machineId: item.machine?.id || item._machineId
        })));
        
        if (groupByProduct) {
          // ✅ MODE REGROUPÉ : Un produit = une ligne avec quantité totale
          const productGroups = new Map();
          
          allStocks.forEach((item: any, index: number) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            const quantity = stockInfo.current || 0;
            
            // Debug pour les premiers items
            if (index < 5) {
              console.log(`🧪 Item ${index} (mode regroupé) - ${product.name}:`, {
                productId: product.id,
                quantity: quantity,
                machineId: machine.id || item._machineId,
                showOnlyInStock: showOnlyInStock,
                willBeIncluded: !showOnlyInStock || quantity > 0
              });
            }
            
            const productId = product.id;
            if (!productId) {
              if (index < 5) console.log(`❌ Item ${index} ignoré: pas de product.id`);
              return;
            }
            
            // ✅ PAS de filtrage ici, on garde tout pour le regroupement
            const location = {
              machineId: machine.id || item._machineId,
              machineName: machine.friendlyName || `Machine ${machine.id || item._machineId}`,
              venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
              shelfChannel: item.shelfChannel || 'N/A',
              quantity: quantity
            };
            
            if (productGroups.has(productId)) {
              const existing = productGroups.get(productId);
              existing.totalQuantity += quantity;
              existing.locations.push(location);
              if (index < 10) console.log(`📦 Produit existant ${product.name}: +${quantity} = ${existing.totalQuantity} total`);
            } else {
              productGroups.set(productId, {
                id: productId,
                product: {
                  id: productId,
                  name: product.name || 'Produit inconnu',
                  category: product.category
                },
                totalQuantity: quantity,
                locations: [location],
                shelfChannel: 'Multi',
                machine: {
                  id: 'multi',
                  name: 'Toutes machines',
                  venue: 'Toutes salles'
                },
                stockValue: (stockInfo.totalCost || 0) / 100
              });
              if (index < 10) console.log(`🆕 Nouveau produit ${product.name}: ${quantity} unités`);
            }
          });
          
          console.log('🎯 RÉSULTAT REGROUPEMENT:', {
            totalProductGroups: productGroups.size,
            exemples: Array.from(productGroups.entries()).slice(0, 3).map(([id, group]) => ({
              id,
              name: group.product.name,
              totalQuantity: group.totalQuantity,
              locations: group.locations.length
            }))
          });
          
          const formattedStocks = Array.from(productGroups.values())
            .map(group => ({
              ...group,
              quantity: group.totalQuantity
            }))
            // ✅ Filtrer SEULEMENT après regroupement
            .filter(item => !showOnlyInStock || item.quantity > 0);
          
          console.log('🎯 Mode REGROUPÉ - Produits avant filtrage:', productGroups.size);
          console.log('🎯 Mode REGROUPÉ - Produits après filtrage:', formattedStocks.length);
          console.log('🎯 Quantité totale:', formattedStocks.reduce((sum, item) => sum + item.quantity, 0));
          
          setStocks(formattedStocks);
          
        } else {
          // ✅ MODE DÉTAILLÉ : Chaque emplacement = une ligne
          const detailedStocks: any[] = [];
          
          allStocks.forEach((item: any) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            const quantity = stockInfo.current || 0;
            
            if (showOnlyInStock && quantity === 0) return;
            if (!product.id) return;
            
            detailedStocks.push({
              id: `${product.id}-${machine.id || item._machineId}-${item.shelfChannel}`,
              product: {
                id: product.id,
                name: product.name || 'Produit inconnu',
                category: product.category
              },
              quantity: quantity,
              shelfChannel: item.shelfChannel || 'N/A',
              machine: {
                id: machine.id || item._machineId,
                name: machine.friendlyName || `Machine ${machine.id || item._machineId}`,
                venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue'
              },
              locations: [{
                machineId: machine.id || item._machineId,
                machineName: machine.friendlyName || `Machine ${machine.id || item._machineId}`,
                venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
                shelfChannel: item.shelfChannel || 'N/A',
                quantity: quantity
              }],
              stockValue: (stockInfo.totalCost || 0) / 100
            });
          });
          
          console.log('🎯 Mode DÉTAILLÉ - Lignes individuelles:', detailedStocks.length);
          console.log('🎯 Quantité totale:', detailedStocks.reduce((sum, item) => sum + item.quantity, 0));
          
          setStocks(detailedStocks);
        }
        
      } else {
        console.log(`=== CHARGEMENT STOCKS MACHINE ${machineId} ===`);
        
        // ✅ LOGIQUE SIMPLE pour une seule machine
        const stockUrl = `${API_BASE}/api/2.0/stock-report/?machineId=${machineId}`;
        const response = await fetch(stockUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const apiData = await response.json();
        const results = apiData.results || [];
        
        console.log(`✅ Machine ${machineId}: ${results.length} articles récupérés`);
        
        if (groupByProduct) {
          // ✅ MODE REGROUPÉ pour une machine : Regrouper par produit
          const productGroups = new Map();
          
          results.forEach((item: any) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            const quantity = stockInfo.current || 0;
            
            if (showOnlyInStock && quantity === 0) return;
            
            const productId = product.id;
            if (!productId) return;
            
            const location = {
              machineId: machine.id || machineId,
              machineName: machine.friendlyName || `Machine ${machineId}`,
              venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
              shelfChannel: item.shelfChannel || 'N/A',
              quantity: quantity
            };
            
            if (productGroups.has(productId)) {
              const existing = productGroups.get(productId);
              existing.totalQuantity += quantity;
              existing.locations.push(location);
            } else {
              productGroups.set(productId, {
                id: productId,
                product: {
                  id: productId,
                  name: product.name || 'Produit inconnu',
                  category: product.category
                },
                totalQuantity: quantity,
                locations: [location],
                shelfChannel: 'Multi',
                machine: {
                  id: machine.id || machineId,
                  name: machine.friendlyName || `Machine ${machineId}`,
                  venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue'
                },
                stockValue: (stockInfo.totalCost || 0) / 100
              });
            }
          });
          
          const formattedStocks = Array.from(productGroups.values())
            .map(group => ({
              ...group,
              quantity: group.totalQuantity
            }));
          
          console.log('🎯 Machine unique - Mode REGROUPÉ:', formattedStocks.length);
          setStocks(formattedStocks);
          
        } else {
          // ✅ MODE DÉTAILLÉ pour une machine : Chaque emplacement = une ligne
          const formattedStocks = results.map((item: any) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            
            const quantity = stockInfo.current || 0;
            
            return {
              id: `${product.id}-${machine.id || machineId}-${item.shelfChannel}`,
              product: {
                id: product.id,
                name: product.name || 'Produit inconnu',
                category: product.category
              },
              quantity: quantity,
              shelfChannel: item.shelfChannel || 'N/A',
              machine: {
                id: machine.id || machineId,
                name: machine.friendlyName || `Machine ${machineId}`,
                venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue'
              },
              locations: [{
                machineId: machine.id || machineId,
                machineName: machine.friendlyName || `Machine ${machineId}`,
                venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
                shelfChannel: item.shelfChannel || 'N/A',
                quantity: quantity
              }],
              expiryDate: item.expiryDateByItems?.[0] || null,
              stockValue: (stockInfo.totalCost || 0) / 100
            };
          }).filter(item => !showOnlyInStock || item.quantity > 0);
          
          console.log('🎯 Machine unique - Mode DÉTAILLÉ:', formattedStocks.length);
          setStocks(formattedStocks);
        }
      }
      
    } catch (err) {
      console.error('❌ Erreur fatale:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Se déclencher quand la machine sélectionnée change OU le mode de regroupement
  useEffect(() => {
    if (selectedMachineId) {
      console.log('🔍 Machine sélectionnée changée:', selectedMachineId);
      console.log('🔍 Mode regroupement:', groupByProduct);
      fetchStockDataForMachine(selectedMachineId);
    }
  }, [selectedMachineId, showOnlyInStock, groupByProduct]);

  // Filtrer et trier les stocks
  const filteredAndSortedStocks = useMemo(() => {
    let filtered = stocks;
    
    // Filtre par recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(stock => 
        stock.product.name.toLowerCase().includes(term) ||
        stock.product.category?.name?.toLowerCase().includes(term) ||
        stock.machine.name.toLowerCase().includes(term)
      );
    }
    
    // Tri
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        case 'alpha':
          comparison = a.product.name.localeCompare(b.product.name);
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    return filtered;
  }, [stocks, searchTerm, sortBy, sortOrder]);

  // Calculer les stats
  const totalQuantity = filteredAndSortedStocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const totalValue = filteredAndSortedStocks.reduce((sum, stock) => sum + (stock.stockValue || 0), 0);
  const lowStockCount = filteredAndSortedStocks.filter(stock => stock.quantity <= 2).length;
  const selectedMachine = selectedMachineId !== 'all' ? machines.find(m => m.id == selectedMachineId) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Chargement des stocks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-6">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-500/30 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-red-300">Erreur de chargement</p>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <button
            onClick={() => fetchStockDataForMachine(selectedMachineId)}
            className="flex items-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <span>Réessayer</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ✅ NOUVEAU : Sélecteur de machine */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-medium text-white mb-4">Sélectionner une machine</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Machine / Salle</label>
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Choisir une machine...</option>
              <option value="all">🌟 Toutes les machines</option>
              {machines.map(machine => (
                <option key={machine.id} value={machine.id}>
                  {machine.friendlyName} - {machine.location?.venue?.name || machine.location?.description || 'Venue inconnue'}
                </option>
              ))}
            </select>
          </div>
          {selectedMachineId && (
            <div className="bg-slate-700/30 rounded-xl p-4">
              <h4 className="font-medium text-white mb-2">Sélection actuelle</h4>
              {selectedMachineId === 'all' ? (
                <div className="text-sm text-slate-300 space-y-1">
                  <p><span className="text-slate-400">Scope:</span> Toutes les machines</p>
                  <p><span className="text-slate-400">Machines:</span> {machines.length} machines</p>
                  <p><span className="text-slate-400">Mode:</span> Regroupement par produit</p>
                </div>
              ) : (
                <div className="text-sm text-slate-300 space-y-1">
                  <p><span className="text-slate-400">Nom:</span> {selectedMachine?.friendlyName}</p>
                  <p><span className="text-slate-400">ID:</span> {selectedMachine?.id}</p>
                  <p><span className="text-slate-400">Salle:</span> {selectedMachine?.location?.venue?.name || selectedMachine?.location?.description || 'Venue inconnue'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">
            {groupByProduct ? 'Produits Uniques' : 'Total Lignes'}
          </h3>
          <p className="text-2xl font-bold text-white">{filteredAndSortedStocks.length}</p>
          <p className="text-xs text-slate-500">
            {groupByProduct ? 'regroupés' : 'emplacements'}
          </p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">
            {groupByProduct ? 'Produits en Stock' : 'Emplacements Remplis'}
          </h3>
          <p className="text-2xl font-bold text-emerald-400">{filteredAndSortedStocks.filter(s => s.quantity > 0).length}</p>
          <p className="text-xs text-slate-500">avec stock</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">Quantité Totale</h3>
          <p className="text-2xl font-bold text-emerald-400">{totalQuantity}</p>
          <p className="text-xs text-slate-500">unités</p>
        </div>
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h3 className="text-sm font-medium text-slate-400 mb-1">
            {groupByProduct ? 'Multi-emplacements' : 'Mode Affichage'}
          </h3>
          <p className="text-2xl font-bold text-purple-400">
            {groupByProduct ? 
              filteredAndSortedStocks.filter(s => s.locations && s.locations.length > 1).length :
              'Détaillé'
            }
          </p>
          <p className="text-xs text-slate-500">
            {groupByProduct ? 'produits dispersés' : 'par emplacement'}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher par produit ou catégorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="min-w-48">
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-');
                setSortBy(newSortBy as any);
                setSortOrder(newSortOrder as any);
              }}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="quantity-desc">Quantité: Plus ↗ Moins</option>
              <option value="quantity-asc">Quantité: Moins ↗ Plus</option>
              <option value="alpha-asc">Nom: A ↗ Z</option>
              <option value="alpha-desc">Nom: Z ↗ A</option>
            </select>
          </div>
          <div className="flex items-center space-x-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyInStock}
                onChange={(e) => setShowOnlyInStock(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${showOnlyInStock ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform mt-1 ${showOnlyInStock ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </div>
              <span className="ml-2 text-sm text-slate-300">Stock &gt; 0</span>
            </label>
            
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={groupByProduct}
                onChange={(e) => setGroupByProduct(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-11 h-6 rounded-full transition-colors ${groupByProduct ? 'bg-blue-600' : 'bg-slate-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform mt-1 ${groupByProduct ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </div>
              <span className="ml-2 text-sm text-slate-300">Regrouper produits</span>
            </label>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">
          {selectedMachineId === 'all' ? 
            `Stocks - Toutes les machines (${filteredAndSortedStocks.length} ${groupByProduct ? 'produits regroupés' : 'emplacements'})` :
            selectedMachine ? 
              `Stocks - ${selectedMachine.friendlyName} (${filteredAndSortedStocks.length} ${groupByProduct ? 'produits regroupés' : 'emplacements'})` :
              'Stocks (sélectionnez une machine)'
          }
        </h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchStockDataForMachine(selectedMachineId)}
            disabled={isLoading || !selectedMachineId}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Table des stocks - MÊMES COLONNES que la version qui marchait */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Produit</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Catégorie</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Quantité</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Emplacement</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Machine</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Salle</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedStocks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    {!selectedMachineId ? 'Sélectionnez une machine pour voir les stocks' : 
                     selectedMachineId === 'all' ? 
                       `Aucun stock trouvé sur toutes les machines (mode ${groupByProduct ? 'regroupé' : 'détaillé'})` :
                       `Aucun stock trouvé (mode ${groupByProduct ? 'regroupé' : 'détaillé'})`
                    }
                  </td>
                </tr>
              ) : (
                filteredAndSortedStocks.map((stock) => {
                  const isLowStock = stock.quantity <= 2;
                  const isOutOfStock = stock.quantity === 0;
                  
                  return (
                    <tr key={stock.id} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{stock.product.name}</div>
                        <div className="text-sm text-slate-400">
                          ID: {stock.product.id}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                          {stock.product.category?.name || 'Non catégorisé'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xl font-bold ${
                          isOutOfStock ? 'text-red-400' : 
                          isLowStock ? 'text-orange-400' : 
                          'text-emerald-400'
                        }`}>
                          {stock.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {groupByProduct && stock.locations && stock.locations.length > 1 ? (
                          <div className="space-y-1 max-w-xs">
                            {stock.locations.slice(0, 3).map((location: any, i: number) => (
                              <div key={i} className="flex items-center space-x-2">
                                <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                                  {location.shelfChannel}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {location.quantity}
                                </span>
                              </div>
                            ))}
                            {stock.locations.length > 3 && (
                              <div className="text-xs text-slate-500">
                                +{stock.locations.length - 3} autre{stock.locations.length - 3 > 1 ? 's' : ''}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                            {stock.shelfChannel}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {groupByProduct && stock.locations && stock.locations.length > 1 ? (
                          <div className="space-y-1 max-w-xs">
                            {stock.locations.slice(0, 2).map((location: any, i: number) => (
                              <div key={i} className="text-sm text-white truncate">
                                {location.machineName}
                              </div>
                            ))}
                            {stock.locations.length > 2 && (
                              <div className="text-xs text-slate-500">
                                +{stock.locations.length - 2} autre{stock.locations.length - 2 > 1 ? 's' : ''}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-white">
                            {stock.machine.name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {groupByProduct && stock.locations && stock.locations.length > 1 ? (
                          <div className="space-y-1">
                            {[...new Set(stock.locations.map((loc: any) => loc.venue))].slice(0, 2).map((venue: string) => (
                              <div key={venue} className="text-sm text-white">
                                {venue}
                              </div>
                            ))}
                            {[...new Set(stock.locations.map((loc: any) => loc.venue))].length > 2 && (
                              <div className="text-xs text-slate-500">
                                +{[...new Set(stock.locations.map((loc: any) => loc.venue))].length - 2} autre{[...new Set(stock.locations.map((loc: any) => loc.venue))].length - 2 > 1 ? 's' : ''}...
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-white">
                            {stock.machine.venue}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col space-y-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isOutOfStock 
                              ? 'bg-red-100 text-red-800' 
                              : isLowStock 
                                ? 'bg-orange-100 text-orange-800' 
                                : 'bg-green-100 text-green-800'
                          }`}>
                            {isOutOfStock ? 'Rupture' : isLowStock ? 'Stock faible' : 'Disponible'}
                          </span>
                          {groupByProduct && stock.locations && stock.locations.length > 1 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Multi-emplacements ({stock.locations.length})
                            </span>
                          )}
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
    </div>
  );
};

export default StockView;