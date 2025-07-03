import React, { useState, useMemo } from 'react';
import StockView from './StockView'; // Import du composant stocks créé précédemment

interface MachineData {
  id: number;
  friendlyName: string;
  isEnabled: boolean;
  location?: {
    id: number;
    venue?: {
      id: number;
      name: string;
    };
    description?: string;
  };
  locationName?: string;
  // Autres propriétés possibles
  status?: string;
  enabled?: boolean;
}

interface MachinesViewProps {
  machines: MachineData[];
  sales: any[]; // ✅ Obligatoire maintenant pour éviter les undefined
  loading?: boolean;
}

const MachinesView: React.FC<MachinesViewProps> = ({ machines = [], sales = [], loading = false }) => {
  // État pour gérer les onglets
  const [activeTab, setActiveTab] = useState<'machines' | 'stocks'>('machines');
  
  // ✅ DEBUG : Vérifier les props reçues
  console.log('🔍 DEBUG MachinesView - Props reçues:');
  console.log('• machines:', machines.length, 'éléments');
  console.log('• sales:', sales.length, 'éléments');
  console.log('• loading:', loading);
  
  // États pour les filtres des machines
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Debug pour voir la structure des données
  console.log('🔍 DEBUG - Machines data:', machines);
  if (machines.length > 0) {
    console.log('🔍 DEBUG - Structure d\'une machine:', machines[0]);
  }

  // Grouper les machines par venue
  const machinesByVenue = useMemo(() => {
    const grouped = new Map();

    machines.forEach(machine => {
      // Extraire les informations du venue
      const venueId = machine.location?.venue?.id || machine.location?.id || 'unknown';
      const venueName = machine.location?.venue?.name || 
                       machine.locationName || 
                       machine.location?.description || 
                       'Venue not assigned';

      // Utiliser le champ isEnabled qui vient maintenant de l'endpoint devices
      const isActive = machine.isEnabled !== undefined ? machine.isEnabled : true;

      console.log(`🔍 Machine ${machine.id} (${machine.friendlyName}): isEnabled=${isActive}, venue=${venueName}`);

      const machineInfo = {
        id: machine.id,
        name: machine.friendlyName || `Machine ${machine.id}`,
        status: isActive ? 'active' : 'inactive',
        isEnabled: isActive
      };

      if (!grouped.has(venueId)) {
        grouped.set(venueId, {
          venueId,
          venueName,
          machines: []
        });
      }

      grouped.get(venueId).machines.push(machineInfo);
    });

    return Array.from(grouped.values());
  }, [machines]);

  // Filtrer selon les critères de recherche et statut
  const filteredVenues = useMemo(() => {
    return machinesByVenue
      .map(venue => ({
        ...venue,
        machines: venue.machines.filter(machine => {
          const matchesSearch = !searchTerm || 
            venue.venueName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            machine.name.toLowerCase().includes(searchTerm.toLowerCase());
          
          const matchesStatus = statusFilter === 'all' || 
            (statusFilter === 'enabled' && machine.isEnabled) ||
            (statusFilter === 'disabled' && !machine.isEnabled);

          return matchesSearch && matchesStatus;
        })
      }))
      .filter(venue => venue.machines.length > 0);
  }, [machinesByVenue, searchTerm, statusFilter]);

  // Calculer les statistiques
  const stats = useMemo(() => {
    const totalMachines = machines.length;
    const enabledMachines = machines.filter(m => 
      m.isEnabled !== undefined ? m.isEnabled : true
    ).length;
    const disabledMachines = totalMachines - enabledMachines;

    return { totalMachines, enabledMachines, disabledMachines };
  }, [machines]);

  console.log('🏪 DEBUG - Venues groupés:', filteredVenues);
  console.log('📊 DEBUG - Stats:', stats);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec onglets */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
        <div className="flex border-b border-slate-700/50">
          <button
            onClick={() => setActiveTab('machines')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'machines'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Machines ({stats.totalMachines})</span>
            </div>
          </button>
          
          <button
            onClick={() => setActiveTab('stocks')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'stocks'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span>Stocks</span>
            </div>
          </button>
        </div>
      </div>

      {/* Contenu selon l'onglet actif */}
      {activeTab === 'machines' ? (
        <>
          {/* Stats des machines */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-1">Total Machines</h3>
              <p className="text-2xl font-bold text-white">{stats.totalMachines}</p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-1">Actives</h3>
              <p className="text-2xl font-bold text-green-400">{stats.enabledMachines}</p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
              <h3 className="text-sm font-medium text-slate-400 mb-1">Inactives</h3>
              <p className="text-2xl font-bold text-red-400">{stats.disabledMachines}</p>
            </div>
          </div>

          {/* Filtres des machines */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Rechercher venue ou machine..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  Toutes
                </button>
                <button
                  onClick={() => setStatusFilter('enabled')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === 'enabled'
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  Actives
                </button>
                <button
                  onClick={() => setStatusFilter('disabled')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === 'disabled'
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  Inactives
                </button>
              </div>
            </div>
          </div>

          {/* Tableau des machines par venue */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Machine</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Statut</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVenues.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                        {machines.length === 0 ? 'Aucune machine trouvée' : 'Aucun résultat pour ces filtres'}
                      </td>
                    </tr>
                  ) : (
                    filteredVenues.map((venue) => (
                      <React.Fragment key={venue.venueId}>
                        {/* Ligne du venue */}
                        <tr className="border-b border-slate-700/30 bg-slate-700/20">
                          <td className="px-6 py-3">
                            <div className="font-medium text-white text-lg">
                              🏪 {venue.venueName}
                            </div>
                            <div className="text-sm text-slate-400">
                              {venue.machines.length} machine{venue.machines.length > 1 ? 's' : ''}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex gap-1">
                              {venue.machines.map(machine => (
                                <span
                                  key={machine.id}
                                  className={`inline-block w-2 h-2 rounded-full ${
                                    machine.isEnabled ? 'bg-green-400' : 'bg-red-400'
                                  }`}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <button className="text-blue-400 hover:text-blue-300 text-sm">
                              Gérer le venue
                            </button>
                          </td>
                        </tr>
                        {/* Lignes des machines */}
                        {venue.machines.map((machine) => (
                          <tr key={machine.id} className="border-b border-slate-700/20 hover:bg-slate-700/10">
                            <td className="px-6 py-3 pl-12">
                              <div className="text-white">
                                🤖 {machine.name}
                              </div>
                              <div className="text-sm text-slate-400">
                                ID: {machine.id}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  machine.isEnabled
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {machine.isEnabled ? 'ACTIVE' : 'INACTIVE'}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <div className="flex gap-2">
                                <button className="text-blue-400 hover:text-blue-300 text-sm">
                                  Modifier
                                </button>
                                <button
                                  className={`text-sm ${
                                    machine.isEnabled
                                      ? 'text-red-400 hover:text-red-300'
                                      : 'text-green-400 hover:text-green-300'
                                  }`}
                                >
                                  {machine.isEnabled ? 'Désactiver' : 'Activer'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Onglet Stocks avec props explicites */
        <div>
          <StockView 
            machines={machines} 
            sales={sales || []} 
          />
        </div>
      )}
    </div>
  );
};

export default MachinesView;