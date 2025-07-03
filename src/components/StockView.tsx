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
        
        // ✅ Récupérer les stocks de toutes les machines SANS LIMITE
        const allStocks: any[] = [];
        const machineIds = machines.map(m => m.id); // ✅ SUPPRESSION de slice(0, 10)
        
        console.log('🔍 Machines à traiter:', machineIds.length, 'machines total');
        
        for (const currentMachineId of machineIds) {
          try {
            console.log(`📦 Chargement machine ${currentMachineId}...`);
            
            // ✅ PAGINATION COMPLÈTE : Récupérer TOUTES les pages
            let page = 1;
            let hasNext = true;
            const allResults: any[] = [];
            
            while (hasNext) {
              const stockUrl = `${API_BASE}/api/2.0/stock-report/?machineId=${currentMachineId}&page=${page}`;
              const response = await fetch(stockUrl, { headers });
              
              if (!response.ok) {
                console.warn(`⚠️ Erreur machine ${currentMachineId} page ${page}: ${response.status}`);
                break;
              }
              
              const apiData = await response.json();
              const results = apiData.results || [];
              
              console.log(`📄 Machine ${currentMachineId} - Page ${page}: ${results.length} articles`);
              console.log(`📊 Total API count:`, apiData.count || 'non spécifié');
              console.log(`🔗 Next page:`, apiData.next ? 'OUI' : 'NON');
              
              // Ajouter les résultats de cette page
              allResults.push(...results);
              
              // Vérifier s'il y a une page suivante
              hasNext = !!apiData.next;
              page++;
              
              // ✅ Sécurité : Limite raisonnable pour éviter les boucles infinies
              if (page > 50) {
                console.warn(`⚠️ Machine ${currentMachineId}: Arrêt à la page 50 par sécurité`);
                break;
              }
            }
            
            console.log(`✅ Machine ${currentMachineId}: ${allResults.length} articles chargés (${page - 1} pages)`);
            
            // Ajouter l'ID de la machine à chaque item
            allResults.forEach((item: any) => {
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
        console.log(`📋 RÉSUMÉ CHARGEMENT:`);
        console.log(`   - ${machineIds.length} machines traitées`);
        console.log(`   - ${allStocks.length} articles au total`);
        console.log(`   - Moyenne: ${Math.round(allStocks.length / machineIds.length)} articles/machine`);
        
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
          // ✅ MODE REGROUPÉ ULTRA-DÉBUGÉ : Un produit = une ligne avec quantité totale
          const productGroups = new Map();
          
          console.log('=== 🎯 DÉBUT REGROUPEMENT ULTRA-DÉBUGÉ ===');
          console.log('📊 Total items à traiter:', allStocks.length);
          
          // ✅ PREMIER PASSAGE : Lister TOUS les produits trouvés
          console.log('🔍 INVENTAIRE COMPLET DES PRODUITS:');
          const productsFound = new Map();
          allStocks.forEach((item: any, index: number) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const productName = product.name || 'Produit inconnu';
            const quantity = parseInt(stockInfo.current) || 0;
            const shelfChannel = item.shelfChannel || 'N/A';
            
            if (!productsFound.has(productName)) {
              productsFound.set(productName, []);
            }
            productsFound.get(productName).push({
              index,
              quantity,
              shelfChannel,
              productId: product.id,
              machineId: item.machine?.id || item._machineId
            });
          });
          
          // ✅ AFFICHER L'INVENTAIRE COMPLET
          Array.from(productsFound.entries()).forEach(([productName, occurrences]) => {
            const totalQty = occurrences.reduce((sum: number, occ: any) => sum + occ.quantity, 0);
            console.log(`📦 "${productName}": ${totalQty} total sur ${occurrences.length} emplacements`);
            occurrences.forEach((occ: any) => {
              console.log(`   └─ Emplacement ${occ.shelfChannel}: ${occ.quantity} unités (machine ${occ.machineId})`);
            });
          });
          
          // ✅ DEUXIÈME PASSAGE : Regroupement avec debug intensif
          console.log('\n🎯 DÉBUT DU REGROUPEMENT:');
          
          allStocks.forEach((item: any, index: number) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            const quantity = parseInt(stockInfo.current) || 0;
            
            // ✅ CLÉS DE REGROUPEMENT MULTIPLES pour plus de robustesse
            const productId = product.id;
            const productName = product.name || 'Produit inconnu';
            const groupKey = productId || productName;
            
            // Debug pour CHAQUE item
            console.log(`\n🧪 ITEM ${index}: "${productName}"`);
            console.log(`   - ProductID: ${productId}`);
            console.log(`   - GroupKey: ${groupKey}`);
            console.log(`   - Quantity: ${quantity} (raw: ${stockInfo.current})`);
            console.log(`   - ShelfChannel: ${item.shelfChannel}`);
            console.log(`   - Machine: ${machine.id || item._machineId}`);
            
            if (!groupKey) {
              console.log(`   ❌ REJETÉ: Pas de clé de regroupement valide`);
              return;
            }
            
            const location = {
              machineId: machine.id || item._machineId,
              machineName: machine.friendlyName || `Machine ${machine.id || item._machineId}`,
              venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
              shelfChannel: item.shelfChannel || 'N/A',
              quantity: quantity
            };
            
            if (productGroups.has(groupKey)) {
              const existing = productGroups.get(groupKey);
              const oldQuantity = existing.totalQuantity;
              existing.totalQuantity += quantity;
              existing.locations.push(location);
              console.log(`   ✅ AJOUTÉ à groupe existant: ${oldQuantity} + ${quantity} = ${existing.totalQuantity}`);
              console.log(`   📍 Emplacements total: ${existing.locations.length}`);
            } else {
              const newGroup = {
                id: productId || `generated-${productName}`,
                product: {
                  id: productId || `generated-${productName}`,
                  name: productName,
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
              };
              productGroups.set(groupKey, newGroup);
              console.log(`   🆕 NOUVEAU GROUPE créé: ${quantity} unités`);
            }
          });
          
          // ✅ TROISIÈME PASSAGE : Vérifier les résultats finaux
          console.log('\n🎯 RÉSULTATS FINAUX DU REGROUPEMENT:');
          Array.from(productGroups.entries()).forEach(([key, group]) => {
            console.log(`📋 "${group.product.name}": ${group.totalQuantity} unités sur ${group.locations.length} emplacements`);
            group.locations.forEach((loc: any, i: number) => {
              console.log(`   └─ ${loc.shelfChannel}: ${loc.quantity} unités`);
            });
          });
          
          // ✅ VÉRIFICATION SPÉCIALE pour les produits problématiques
          console.log('\n🔍 VÉRIFICATION PRODUITS SPÉCIFIQUES:');
          const shotFraise = Array.from(productGroups.entries()).find(([key, group]) => 
            group.product.name.toLowerCase().includes('shot fraise'));
          if (shotFraise) {
            console.log(`✅ Shot Fraise Gingembre trouvé: ${shotFraise[1].totalQuantity} unités`);
          } else {
            console.log(`❌ Shot Fraise Gingembre NOT FOUND dans les groupes finaux`);
          }
          
          const wokChicken = Array.from(productGroups.entries()).find(([key, group]) => 
            group.product.name.toLowerCase().includes('wok chicken'));
          if (wokChicken) {
            console.log(`✅ Wok Chicken Bowl trouvé: ${wokChicken[1].totalQuantity} unités`);
          } else {
            console.log(`❌ Wok Chicken Bowl NOT FOUND dans les groupes finaux`);
          }
          
          const creamyChicken = Array.from(productGroups.entries()).find(([key, group]) => 
            group.product.name.toLowerCase().includes('creamy chicken'));
          if (creamyChicken) {
            console.log(`✅ Creamy Chicken Rice Bowl trouvé: ${creamyChicken[1].totalQuantity} unités`);
          } else {
            console.log(`❌ Creamy Chicken Rice Bowl NOT FOUND dans les groupes finaux`);
          }
          
          const formattedStocks = Array.from(productGroups.values())
            .map(group => ({
              ...group,
              quantity: group.totalQuantity
            }))
            // ✅ Filtrer SEULEMENT après regroupement complet
            .filter(item => !showOnlyInStock || item.quantity > 0);
          
          console.log('\n🎯 PRODUITS FINAUX ENVOYÉS AU TABLEAU:');
          formattedStocks.forEach(stock => {
            console.log(`📝 ${stock.product.name}: ${stock.quantity} unités`);
          });
          
          console.log('=== 🏁 FIN REGROUPEMENT ULTRA-DÉBUGÉ ===\n');
          
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
        
        // ✅ PAGINATION COMPLÈTE pour une seule machine
        let page = 1;
        let hasNext = true;
        const allResults: any[] = [];
        
        while (hasNext) {
          const stockUrl = `${API_BASE}/api/2.0/stock-report/?machineId=${machineId}&page=${page}`;
          const response = await fetch(stockUrl, { headers });
          
          if (!response.ok) {
            throw new Error(`Erreur ${response.status}: ${response.statusText} (page ${page})`);
          }
          
          const apiData = await response.json();
          const results = apiData.results || [];
          
          console.log(`📄 Machine ${machineId} - Page ${page}: ${results.length} articles`);
          console.log(`📊 Total API count:`, apiData.count || 'non spécifié');
          console.log(`🔗 Next page:`, apiData.next ? 'OUI' : 'NON');
          
          // Ajouter les résultats de cette page
          allResults.push(...results);
          
          // Vérifier s'il y a une page suivante
          hasNext = !!apiData.next;
          page++;
          
          // ✅ Sécurité : Limite raisonnable
          if (page > 50) {
            console.warn(`⚠️ Machine ${machineId}: Arrêt à la page 50 par sécurité`);
            break;
          }
        }
        
        console.log(`✅ Machine ${machineId}: ${allResults.length} articles chargés (${page - 1} pages)`);
        
        if (groupByProduct) {
          // ✅ MODE REGROUPÉ CORRIGÉ pour une machine : Regrouper par produit
          const productGroups = new Map();
          
          console.log('🎯 REGROUPEMENT MACHINE UNIQUE - Analyse des items...');
          
          allResults.forEach((item: any, index: number) => {
            const product = item.product || {};
            const stockInfo = item.stockInformation || {};
            const machine = item.machine || {};
            const quantity = parseInt(stockInfo.current) || 0;
            
            // ✅ CORRECTION : Utiliser le nom du produit comme clé principale si pas d'ID
            const productId = product.id;
            const productName = product.name || 'Produit inconnu';
            const groupKey = productId || productName; // Fallback sur le nom si pas d'ID
            
            console.log(`🧪 Machine ${machineId} - Item ${index} - ${productName}:`, {
              productId: productId,
              productName: productName,
              groupKey: groupKey,
              quantity: quantity,
              shelfChannel: item.shelfChannel,
              stockInfoRaw: stockInfo.current
            });
            
            if (!groupKey) {
              console.log(`❌ Item ${index} ignoré: pas de clé de regroupement valide`);
              return;
            }
            
            // ✅ AUCUN filtrage prématuré - on garde TOUS les produits
            const location = {
              machineId: machine.id || machineId,
              machineName: machine.friendlyName || `Machine ${machineId}`,
              venue: machine.location?.venue?.name || machine.location?.description || 'Venue inconnue',
              shelfChannel: item.shelfChannel || 'N/A',
              quantity: quantity
            };
            
            if (productGroups.has(groupKey)) {
              const existing = productGroups.get(groupKey);
              existing.totalQuantity += quantity;
              existing.locations.push(location);
              console.log(`📦 ${productName}: +${quantity} = ${existing.totalQuantity} total (${existing.locations.length} emplacements)`);
            } else {
              productGroups.set(groupKey, {
                id: productId || `generated-${productName}`,
                product: {
                  id: productId || `generated-${productName}`,
                  name: productName,
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
              console.log(`🆕 Nouveau produit ${productName}: ${quantity} unités`);
            }
          });
          
          // ✅ DEBUG : Vérifier tous les produits regroupés pour cette machine
          console.log('🎯 TOUS LES PRODUITS REGROUPÉS (machine unique):');
          Array.from(productGroups.entries()).forEach(([key, group]) => {
            console.log(`📋 ${group.product.name}: ${group.totalQuantity} unités sur ${group.locations.length} emplacements`);
            group.locations.forEach((loc: any) => {
              console.log(`   └─ ${loc.shelfChannel}: ${loc.quantity} unités`);
            });
          });
          
          const formattedStocks = Array.from(productGroups.values())
            .map(group => ({
              ...group,
              quantity: group.totalQuantity
            }))
            // ✅ Filtrer SEULEMENT après regroupement complet
            .filter(item => !showOnlyInStock || item.quantity > 0);
          
          console.log('🎯 Machine unique - Mode REGROUPÉ FINAL:', {
            totalProductGroups: productGroups.size,
            totalQuantiteGenerale: Array.from(productGroups.values()).reduce((sum, g) => sum + g.totalQuantity, 0),
            produitsFinaux: formattedStocks.length,
            produitsDetailles: formattedStocks.map(stock => ({
              nom: stock.product.name,
              quantite: stock.quantity,
              emplacements: stock.locations.length
            }))
          });
          
          setStocks(formattedStocks);
          
        } else {
          // ✅ MODE DÉTAILLÉ pour une machine : Chaque emplacement = une ligne
          const formattedStocks = allResults.map((item: any) => {
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

      {/* ✅ Section debug étendue pour tracer les problèmes */}
      {selectedMachineId && (
        <div className="bg-blue-500/20 border border-blue-500/30 rounded-xl p-4">
          <h4 className="font-medium text-blue-200 mb-2">🔍 Debug Extraction de Données</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-blue-300 mb-1">Machine sélectionnée</p>
              <p className="text-white font-medium">
                {selectedMachineId === 'all' ? `${machines.length} machines` : selectedMachine?.friendlyName}
              </p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-blue-300 mb-1">Mode d'affichage</p>
              <p className="text-white font-medium">
                {groupByProduct ? 'Regroupé' : 'Détaillé'}
              </p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-blue-300 mb-1">Articles dans le tableau</p>
              <p className="text-white font-medium">{filteredAndSortedStocks.length}</p>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-3">
              <p className="text-blue-300 mb-1">Quantité totale</p>
              <p className="text-white font-medium">{totalQuantity} unités</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-300">
            💡 Vérifiez la console (F12) pour voir :
            <br />• Le nombre de pages récupérées par machine
            <br />• Le total d'articles chargés vs affiché
            <br />• Les logs de pagination détaillés
          </div>
        </div>
      )}

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