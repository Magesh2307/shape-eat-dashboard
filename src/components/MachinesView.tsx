export default function MachinesView({ machines }: { machines: any[] }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Actif': return 'bg-green-500 text-green-100';
      case 'Inactif': return 'bg-red-500 text-red-100';
      default: return 'bg-yellow-500 text-yellow-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Actif': return '✅';
      case 'Inactif': return '❌';
      default: return '⚠️';
    }
  };

  const activeMachines = machines.filter(m => m.status === 'Actif').length;
  const totalRevenue = machines.reduce((sum, m) => sum + (m.todaySales || 0), 0);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Liste des machines</h1>
      
      {/* Stats globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
          <p className="text-blue-200 text-sm">Total Machines</p>
          <p className="text-xl font-bold">{machines.length}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
          <p className="text-blue-200 text-sm">Machines Actives</p>
          <p className="text-xl font-bold text-green-400">{activeMachines}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20">
          <p className="text-blue-200 text-sm">CA Total Aujourd'hui</p>
          <p className="text-xl font-bold">€{totalRevenue.toFixed(2)}</p>
        </div>
      </div>

      {/* Liste des machines */}
      <div className="space-y-2">
        {machines.map((m) => (
          <div key={m.id} className="bg-white/10 backdrop-blur-md rounded-lg p-4 border border-white/20 hover:bg-white/15 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-semibold">{m.friendlyName || m.name || `Machine ${m.id}`}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(m.status)}`}>
                    {getStatusIcon(m.status)} {m.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                  {m.venue?.name && (
                    <div>
                      <span className="text-blue-200">Lieu: </span>
                      <span>{m.venue.name}</span>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-blue-200">CA: </span>
                    <span className="font-semibold">€{(m.todaySales || 0).toFixed(2)}</span>
                  </div>

                  {m.last_connection && (
                    <div>
                      <span className="text-blue-200">Dernière activité: </span>
                      <span>{new Date(m.last_connection).toLocaleString('fr-FR')}</span>
                    </div>
                  )}

                  <div className="flex space-x-4">
                    {m.refundedCount > 0 && (
                      <div>
                        <span className="text-orange-300">Remb.: </span>
                        <span className="text-orange-400">{m.refundedCount}</span>
                      </div>
                    )}
                    {m.declinedCount > 0 && (
                      <div>
                        <span className="text-red-300">Refus.: </span>
                        <span className="text-red-400">{m.declinedCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}