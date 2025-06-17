import { useEffect, useState } from "react";
import MachinesView from "./components/MachinesView";
import SalesView from "./components/SalesView";
import StockMovementsView from "./components/StockMovementsView";
import Sidebar from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import type { Machine, OrderSale, StockAlert, Channel } from "./types";

const API_BASE_URL = "https://vendlive.com";
const API_TOKEN = import.meta.env.VITE_API_KEY || "2b99d02d6886f67b3a42d82c684108d2eda3d2e1";

function App() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orderSales, setOrderSales] = useState<OrderSale[]>([]);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const [activeView, setActiveView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const headers = {
        "Authorization": `Token ${API_TOKEN}`,
        "Content-Type": "application/json",
      };

      // 1. Récupération des machines
      const machinesResponse = await fetch(`${API_BASE_URL}/api/2.0/machines/`, { headers });
      
      if (!machinesResponse.ok) {
        throw new Error(`Erreur API machines: ${machinesResponse.status}`);
      }

      const machinesData = await machinesResponse.json();
      const machinesList = machinesData.results || [];

      // 2. Enrichissement avec les devices et vérification du stock
      const stockAlertsTemp: StockAlert[] = [];
      
      const detailedMachines = await Promise.all(
        machinesList.map(async (machine: any) => {
          try {
            // Récupération des devices
            const deviceResponse = await fetch(
              `${API_BASE_URL}/api/2.0/devices/?machineId=${machine.id}`,
              { headers }
            );
            
            let deviceEnabled = false;
            if (deviceResponse.ok) {
              const deviceData = await deviceResponse.json();
              const device = deviceData.results?.[0];
              deviceEnabled = device?.enabled || false;
            }

            // Vérification du stock
            try {
              const channelsResponse = await fetch(
                `${API_BASE_URL}/api/2.0/channels/?machineId=${machine.id}`,
                { headers }
              );
              
              if (channelsResponse.ok) {
                const channelsData = await channelsResponse.json();
                const channels: Channel[] = channelsData.results || [];
                
                channels.forEach((channel) => {
                  if (channel.idealCapacity > 0) {
                    const stockPercentage = (channel.stockLevel / channel.idealCapacity) * 100;
                    if (stockPercentage < 30) {
                      stockAlertsTemp.push({
                        machineId: machine.id,
                        machineName: machine.friendlyName || `Machine ${machine.id}`,
                        channelId: channel.id,
                        productName: channel.product?.name || 'Produit inconnu',
                        stockLevel: channel.stockLevel,
                        percentage: stockPercentage
                      });
                    }
                  }
                });
              }
            } catch (error) {
              console.warn(`Erreur channels machine ${machine.id}:`, error);
            }

            return {
              id: machine.id,
              name: machine.friendlyName || `Machine ${machine.id}`,
              friendlyName: machine.friendlyName,
              venue: machine.venue,
              location: machine.location,
              status: deviceEnabled ? 'Actif' : 'Inactif',
              enabled: deviceEnabled,
              last_connection: machine.lastVend || null,
              currency: machine.currency,
              todaySales: 0,
              refundedCount: 0,
              declinedCount: 0,
            } as Machine;
          } catch (error) {
            console.error(`Erreur device machine ${machine.id}:`, error);
            return {
              id: machine.id,
              name: machine.friendlyName || `Machine ${machine.id}`,
              friendlyName: machine.friendlyName,
              venue: machine.venue,
              status: 'Erreur',
              todaySales: 0,
              refundedCount: 0,
              declinedCount: 0,
            } as Machine;
          }
        })
      );

      // 3. Récupération des ventes du jour
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      const salesResponse = await fetch(
        `${API_BASE_URL}/api/2.0/order-sales/?startDate=${startOfDay}&endDate=${endOfDay}&pageSize=100`,
        { headers }
      );

      if (salesResponse.ok) {
        const salesData = await salesResponse.json();
        const sales = salesData.results || [];
        
        // Adapter les données pour SalesTable
        const formattedSales = sales.map((sale: any) => ({
          ...sale,
          createdAtLocalized: new Date(sale.createdAt).toLocaleString('fr-FR'),
          locationName: sale.location?.venue?.name || sale.machine?.friendlyName || 'N/A',
          totalCharged: parseFloat(sale.totalCharged || sale.total || "0"),
          paymentStatusDisplay: sale.charged === 'PAID' ? 'PAID' : sale.charged === 'DECLINED' ? 'DECLINED' : sale.charged,
        }));

        setOrderSales(formattedSales);

        // Calculer les statistiques par machine
        const salesByMachine = formattedSales.reduce((acc: Record<number, number>, sale: any) => {
          const machineId = sale.machine.id;
          const amount = sale.totalCharged;
          if (sale.productSales?.every((p: any) => !p.isRefunded) && sale.paymentStatusDisplay !== 'DECLINED') {
            acc[machineId] = (acc[machineId] || 0) + amount;
          }
          return acc;
        }, {});

        const refundedByMachine = sales.filter((sale: any) =>
          sale.productSales?.some((p: any) => p.isRefunded)
        ).reduce((acc: Record<number, number>, sale: any) => {
          const machineId = sale.machine.id;
          acc[machineId] = (acc[machineId] || 0) + 1;
          return acc;
        }, {});

        const declinedByMachine = sales.filter((sale: any) =>
          sale.charged === 'DECLINED' || sale.paymentStatusDisplay === 'DECLINED'
        ).reduce((acc: Record<number, number>, sale: any) => {
          const machineId = sale.machine.id;
          acc[machineId] = (acc[machineId] || 0) + 1;
          return acc;
        }, {});

        // Mettre à jour les machines avec les statistiques
        detailedMachines.forEach(machine => {
          machine.todaySales = salesByMachine[machine.id] || 0;
          machine.refundedCount = refundedByMachine[machine.id] || 0;
          machine.declinedCount = declinedByMachine[machine.id] || 0;
        });
      }

      setMachines(detailedMachines);
      setStockAlerts(stockAlertsTemp);

    } catch (error) {
      console.error("Erreur lors de la récupération des données:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    fetchData(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl flex items-center space-x-3">
          <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full"></div>
          <span>Chargement du dashboard Shape Eat...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-900 to-purple-900">
      <Sidebar onSelectView={setActiveView} activeView={activeView} />
      
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 text-white">
          {/* Header avec bouton refresh */}
          <div className="flex justify-end mb-6">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {refreshing ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span>Actualiser</span>
            </button>
          </div>

          {/* Contenu principal */}
          {activeView === "dashboard" && (
            <DashboardView 
              machines={machines} 
              orderSales={orderSales} 
              stockAlerts={stockAlerts} 
            />
          )}
          {activeView === "machines" && <MachinesView machines={machines} />}
          {activeView === "sales" && <SalesView orderSales={orderSales} />}
          {activeView === "stock" && <StockMovementsView />}
        </div>
      </main>
    </div>
  );
}

export default App;