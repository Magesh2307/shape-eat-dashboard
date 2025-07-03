import React, { useState, useMemo } from 'react';

// Types simples pour éviter les erreurs d'import
interface Sale {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  machineId?: string;
  [key: string]: any;
}

interface Machine {
  id: string;
  name: string;
  status?: string;
  location?: string;
  serialNumber?: string;
  [key: string]: any;
}

interface Props {
  machines: Machine[];
  sales: Sale[];
}

type SortField = 'name' | 'revenue' | 'sales' | 'average';
type SortDirection = 'asc' | 'desc';

export default function MachinesView({ machines = [], sales = [] }: Props) {
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Vérifications de sécurité
  const safeMachines = Array.isArray(machines) ? machines : [];
  const safeSales = Array.isArray(sales) ? sales : [];

  // Calculer les métriques par machine
  const machineMetrics = useMemo(() => {
    const salesByMachine = new Map<string, { revenue: number; count: number; machine: Machine }>();
    
    // Initialiser toutes les machines avec 0
    safeMachines.forEach(machine => {
      if (machine && machine.id) {
        salesByMachine.set(machine.id, {
          revenue: 0,
          count: 0,
          machine: machine
        });
      }
    });
    
    // Ajouter les ventes par machine (toutes les ventes réussies, pas seulement aujourd'hui)
    safeSales.forEach(sale => {
      if (!sale || !sale.machineId || (sale.status !== 'PAID' && sale.status !== 'COMPLETED')) {
        return;
      }
      
      const amount = parseFloat(sale.amount || '0');
      if (isNaN(amount)) return;
      
      if (salesByMachine.has(sale.machineId)) {
        const current = salesByMachine.get(sale.machineId)!;
        current.revenue += amount;
        current.count += 1;
      }
    });
    
    return Array.from(salesByMachine.values());
  }, [safeMachines, safeSales]);

  // Filtrer et trier les machines
  const filteredAndSortedMachines = useMemo(() => {
    let filtered = machineMetrics;
    
    // Filtrage par recherche
    if (searchTerm) {
      filtered = filtered.filter(metric => {
        const machineName = String(metric.machine.name || '').toLowerCase();
        const machineLocation = String(metric.machine.location || '').toLowerCase();
        const machineSerial = String(metric.machine.serialNumber || '').toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        return machineName.includes(searchLower) ||
               machineLocation.includes(searchLower) ||
               machineSerial.includes(searchLower);
      });
    }
    
    // Tri
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = String(a.machine.name || '').localeCompare(String(b.machine.name || ''));
          break;
        case 'revenue':
          comparison = a.revenue - b.revenue;
          break;
        case 'sales':
          comparison = a.count - b.count;
          break;
        case 'average':
          const avgA = a.count > 0 ? a.revenue / a.count : 0;
          const avgB = b.count > 0 ? b.revenue / b.count : 0;
          comparison = avgA - avgB;
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [machineMetrics, searchTerm, sortField, sortDirection]);

  // Statistiques globales
  const globalStats = useMemo(() => {
    const totalRevenue = machineMetrics.reduce((sum, metric) => sum + metric.revenue, 0);
    const totalSales = machineMetrics.reduce((sum, metric) => sum + metric.count, 0);
    const activeMachines = machineMetrics.filter(metric => metric.count > 0).length;
    const averagePerMachine = activeMachines > 0 ? totalRevenue / activeMachines : 0;
    
    return {
      totalRevenue,
      totalSales,
      activeMachines,
      totalMachines: safeMachines.length,
      averagePerMachine
    };
  }, [machineMetrics, safeMachines.length]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusColor = (status?: string) => {
    const statusStr = String(status || '').toLowerCase();
    switch (statusStr) {
      case 'active':
      case 'online':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'inactive':
      case 'offline':
        return 'bg-red-500/20 text-red-400';
      case 'maintenance':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getStatusIcon = (status?: string) => {
    const statusStr = String(status || '').toLowerCase();
    switch (statusStr) {
      case 'active':
      case 'online':
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'inactive':
      case 'offline':
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-light text-white mb-1">Gestion des Machines</h2>
          <p className="text-slate-400 text-sm">
            Supervision et performance de votre parc de machines
          </p>
        </div>
        
        {/* Barre de recherche */}
        <div className="relative w-80">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Rechercher une machine..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all backdrop-blur-sm"
          />
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
          <p className="text-emerald-100 text-sm font-medium mb-1">CA TOTAL</p>
          <p className="text-2xl font-light">
            {globalStats.totalRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
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
            {globalStats.totalSales.toLocaleString()}
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
          <p className="text-purple-100 text-sm font-medium mb-1">MACHINES ACTIVES</p>
          <p className="text-2xl font-light">
            {globalStats.activeMachines}<span className="text-lg text-purple-200">/{globalStats.totalMachines}</span>
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
          <p className="text-orange-100 text-sm font-medium mb-1">MOYENNE/MACHINE</p>
          <p className="text-2xl font-light">
            {globalStats.averagePerMachine.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€
          </p>
        </div>

        <div className="bg-gradient-to-br from-slate-600 to-slate-700 rounded-2xl p-6 text-white shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
          </div>
          <p className="text-slate-300 text-sm font-medium mb-1">TOTAL MACHINES</p>
          <p className="text-2xl font-light">
            {globalStats.totalMachines}
          </p>
        </div>
      </div>

      {/* Tableau des machines */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-700/50">
          <h3 className="text-lg font-medium text-white">
            Liste des machines ({filteredAndSortedMachines.length})
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-700/30">
              <tr>
                <th 
                  className="px-8 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Machine</span>
                    {sortField === 'name' && (
                      <svg className={`w-4 h-4 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th className="px-8 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-8 py-4 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Localisation
                </th>
                <th 
                  className="px-8 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => handleSort('revenue')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Chiffre d'affaires</span>
                    {sortField === 'revenue' && (
                      <svg className={`w-4 h-4 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th 
                  className="px-8 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => handleSort('sales')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Ventes</span>
                    {sortField === 'sales' && (
                      <svg className={`w-4 h-4 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th 
                  className="px-8 py-4 text-right text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => handleSort('average')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Panier moyen</span>
                    {sortField === 'average' && (
                      <svg className={`w-4 h-4 transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredAndSortedMachines.map((metric, index) => (
                <tr key={metric.machine.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-8 py-6 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-medium mr-4 ${
                        metric.count > 0 
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' 
                          : 'bg-gradient-to-r from-slate-500 to-slate-600'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {String(metric.machine.name || 'Machine sans nom')}
                        </div>
                        {metric.machine.serialNumber && (
                          <div className="text-sm text-slate-400">
                            {String(metric.machine.serialNumber)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(metric.machine.status)}`}>
                      {getStatusIcon(metric.machine.status)}
                      <span className="ml-1">
                        {String(metric.machine.status || 'Inconnu')}
                      </span>
                    </span>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap text-sm text-slate-300">
                    {String(metric.machine.location || '-')}
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-white">
                      {metric.revenue.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
                    </div>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap text-right">
                    <div className="text-sm text-slate-300">
                      {metric.count} transactions
                    </div>
                  </td>
                  <td className="px-8 py-6 whitespace-nowrap text-right">
                    <div className="text-sm text-slate-300">
                      {metric.count > 0 
                        ? (metric.revenue / metric.count).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '0,00'
                      }€
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredAndSortedMachines.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-slate-400 font-light">Aucune machine trouvée pour cette recherche</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}