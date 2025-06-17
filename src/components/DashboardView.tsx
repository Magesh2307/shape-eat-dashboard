import type { Machine, OrderSale, StockAlert } from "../types";

interface DashboardViewProps {
  machines: Machine[];
  orderSales: OrderSale[];
  stockAlerts: StockAlert[];
}

export default function DashboardView({ machines, orderSales, stockAlerts }: DashboardViewProps) {
  // Filtrer les ventes valides
  const validSales = orderSales.filter((sale: any) => 
    sale.productSales?.every((p: any) => !p.isRefunded) && 
    sale.paymentStatusDisplay !== 'DECLINED'
  );

  const totalRevenue = validSales.reduce((sum, sale: any) => 
    sum + (sale.totalCharged || parseFloat(sale.total || "0")), 0
  );
  const activeMachines = machines.filter(machine => machine.status === 'Actif').length;
  const totalSales = validSales.length;
  const averageTicket = totalSales > 0 ? totalRevenue / totalSales : 0;
  const totalRefunds = orderSales.filter((sale: any) => 
    sale.productSales?.some((p: any) => p.isRefunded)
  ).length;
  const totalDeclined = orderSales.filter((sale: any) => 
    sale.paymentStatusDisplay === 'DECLINED'
  ).length;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      {/* KPIs principaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">CA Aujourd'hui</p>
              <p className="text-2xl font-bold">€{totalRevenue.toFixed(2)}</p>
              <p className="text-green-400 text-sm mt-1">Ventes validées</p>
            </div>
            <span className="text-3xl">💰</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Machines Actives</p>
              <p className="text-2xl font-bold">{activeMachines}/{machines.length}</p>
              <p className="text-blue-300 text-sm mt-1">
                {machines.length > 0 ? Math.round((activeMachines / machines.length) * 100) : 0}% uptime
              </p>
            </div>
            <span className="text-3xl">🏪</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Ventes du Jour</p>
              <p className="text-2xl font-bold">{totalSales}</p>
              <p className="text-blue-300 text-sm mt-1">€{averageTicket.toFixed(2)}/vente</p>
            </div>
            <span className="text-3xl">🛒</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Alertes Stock</p>
              <p className="text-2xl font-bold">{stockAlerts.length}</p>
              <p className="text-yellow-400 text-sm mt-1">Produits &lt; 30%</p>
            </div>
            <span className="text-3xl">⚠️</span>
          </div>
        </div>
      </div>

      {/* KPIs secondaires */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Remboursements</p>
              <p className="text-xl font-bold text-orange-400">{totalRefunds}</p>
            </div>
            <span className="text-2xl">💸</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">Paiements refusés</p>
              <p className="text-xl font-bold text-red-400">{totalDeclined}</p>
            </div>
            <span className="text-2xl">❌</span>
          </div>
        </div>
      </div>

      {/* Alertes de stock */}
      {stockAlerts.length > 0 && (
        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
          <h3 className="text-yellow-200 font-semibold mb-2 flex items-center space-x-2">
            <span>⚠️</span>
            <span>Alertes de stock faible</span>
          </h3>
          <div className="space-y-1">
            {stockAlerts.slice(0, 5).map((alert, index) => (
              <p key={index} className="text-yellow-300 text-sm">
                • {alert.machineName}: {alert.productName} ({Math.round(alert.percentage)}% restant)
              </p>
            ))}
            {stockAlerts.length > 5 && (
              <p className="text-yellow-300 text-sm italic">
                ... et {stockAlerts.length - 5} autres alertes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top machines et dernières ventes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 3 machines */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-semibold mb-4">🏆 Top 3 Machines par CA</h3>
          <div className="space-y-3">
            {machines
              .sort((a, b) => (b.todaySales || 0) - (a.todaySales || 0))
              .slice(0, 3)
              .map((machine, index) => (
                <div key={machine.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-blue-300">#{index + 1}</span>
                    <div>
                      <p className="font-medium">{machine.friendlyName || machine.name}</p>
                      <p className="text-sm text-blue-300">{machine.venue?.name || 'N/A'}</p>
                    </div>
                  </div>
                  <p className="font-semibold">€{(machine.todaySales || 0).toFixed(2)}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Dernières ventes */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-semibold mb-4">💳 Dernières ventes</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {validSales.slice(0, 5).map((sale: any) => (
              <div key={sale.id} className="flex justify-between items-center p-2 bg-white/5 rounded">
                <div className="flex-1">
                  <p className="font-medium">{sale.machine.friendlyName}</p>
                  <p className="text-sm text-blue-300">
                    {sale.createdAtLocalized || new Date(sale.createdAt).toLocaleTimeString('fr-FR')}
                  </p>
                </div>
                <p className="font-semibold">€{sale.totalCharged || sale.total}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}