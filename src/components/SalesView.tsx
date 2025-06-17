import SalesTable from './SalesTable';

export default function SalesView({ orderSales }: { orderSales: any[] }) {
  // Filtrer les ventes valides (non remboursées et non refusées)
  const validSales = orderSales.filter(sale => 
    sale.productSales?.every((p: any) => !p.isRefunded) && 
    sale.paymentStatusDisplay !== 'DECLINED'
  );

  const total = validSales.reduce((sum, s) => sum + (s.totalCharged || parseFloat(s.total || "0")), 0);

  const byMachineId: Record<number, { name: string; total: number; count: number }> = {};
  const byCategory: Record<string, number> = {};

  validSales.forEach(sale => {
    const id = sale.machine.id;
    const name = sale.machine.friendlyName || `Machine ${id}`;
    const saleTotal = sale.totalCharged || parseFloat(sale.total || "0");

    // Par machine
    if (!byMachineId[id]) {
      byMachineId[id] = { name, total: saleTotal, count: 1 };
    } else {
      byMachineId[id].total += saleTotal;
      byMachineId[id].count += 1;
    }

    // Par catégorie
    sale.productSales?.forEach((ps: any) => {
      const category = ps.product?.category?.name || 'Autre';
      byCategory[category] = (byCategory[category] || 0) + parseFloat(ps.price || "0");
    });
  });

  const topMachines = Object.values(byMachineId).sort((a, b) => b.total - a.total).slice(0, 5);
  const best = topMachines[0];
  const averageTicket = validSales.length > 0 ? total / validSales.length : 0;

  // Stats des ventes refusées/remboursées
  const refundedSales = orderSales.filter(sale => 
    sale.productSales?.some((p: any) => p.isRefunded)
  );
  const declinedSales = orderSales.filter(sale => 
    sale.paymentStatusDisplay === 'DECLINED'
  );

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Ventes du jour</h1>
      
      {/* Stats principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <p className="text-blue-200 text-sm mb-2">CA Total</p>
          <p className="text-3xl font-bold">€{total.toFixed(2)}</p>
          <p className="text-green-400 text-sm mt-1">Ventes validées</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <p className="text-blue-200 text-sm mb-2">Nombre de ventes</p>
          <p className="text-3xl font-bold">{validSales.length}</p>
          <p className="text-blue-300 text-sm mt-1">€{averageTicket.toFixed(2)}/vente</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <p className="text-blue-200 text-sm mb-2">Remboursements</p>
          <p className="text-3xl font-bold text-orange-400">{refundedSales.length}</p>
          <p className="text-orange-300 text-sm mt-1">Ventes remboursées</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <p className="text-blue-200 text-sm mb-2">Paiements refusés</p>
          <p className="text-3xl font-bold text-red-400">{declinedSales.length}</p>
          <p className="text-red-300 text-sm mt-1">Transactions échouées</p>
        </div>
      </div>

      {/* Top machine */}
      {best && (
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 mb-8">
          <p className="text-lg mb-2">🏆 Meilleure machine du jour</p>
          <p className="text-2xl font-bold">{best.name}</p>
          <p className="text-blue-300">€{best.total.toFixed(2)} • {best.count} ventes</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Top 5 machines */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-semibold mb-4">Top 5 Machines</h3>
          <div className="space-y-3">
            {topMachines.map((machine, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl font-bold text-blue-300">#{index + 1}</span>
                  <div>
                    <p className="font-medium">{machine.name}</p>
                    <p className="text-sm text-blue-300">{machine.count} ventes</p>
                  </div>
                </div>
                <p className="font-semibold">€{machine.total.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Top catégories */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
          <h3 className="text-lg font-semibold mb-4">Top Catégories</h3>
          <div className="space-y-3">
            {Object.entries(byCategory)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([category, total], index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl font-bold text-purple-300">#{index + 1}</span>
                    <p className="font-medium">{category}</p>
                  </div>
                  <p className="font-semibold">€{total.toFixed(2)}</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Table des ventes avec votre composant */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/20">
        <SalesTable orderSales={orderSales} />
      </div>
    </div>
  );
}