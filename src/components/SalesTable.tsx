import React from "react";
import { Badge } from "./ui/badge";


type Sale = {
  id: string;
  createdAtLocalized: string;
  locationName: string;
  totalCharged: number;
  paymentStatusDisplay: string;
  productSales: {
    isRefunded?: boolean;
    errorMessage?: string;
  }[];
};

interface SalesTableProps {
  orderSales: Sale[];
}

function getSaleStatus(sale: Sale) {
  if (sale.productSales.some(p => p.isRefunded)) return "Remboursé";
  if (sale.paymentStatusDisplay === "DECLINED") return "Refusé";
  if (sale.productSales.some(p => p.errorMessage)) return "Erreur";
  return "Validé";
}

function getBadgeVariant(status: string) {
  switch (status) {
    case "Remboursé":
      return "destructive";
    case "Refusé":
      return "warning";
    case "Erreur":
      return "secondary";
    default:
      return "default";
  }
}

const SalesTable: React.FC<SalesTableProps> = ({ orderSales }) => {
  const filteredSales = orderSales.filter(
    sale =>
      sale.productSales.every(p => !p.isRefunded) &&
      sale.paymentStatusDisplay !== "DECLINED"
  );

  return (
    <div className="rounded-xl border p-4 shadow-sm bg-white">
      <h2 className="text-xl font-semibold mb-4">Dernières ventes</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">Date</th>
            <th className="text-left py-2">Salle</th>
            <th className="text-left py-2">Montant</th>
            <th className="text-left py-2">Statut</th>
          </tr>
        </thead>
        <tbody>
          {orderSales.map((sale) => (
            <tr key={sale.id} className="border-b last:border-0">
              <td className="py-2">{sale.createdAtLocalized}</td>
              <td className="py-2">{sale.locationName}</td>
              <td className="py-2">{sale.totalCharged.toFixed(2)} €</td>
              <td className="py-2">
                <Badge variant={getBadgeVariant(getSaleStatus(sale))}>
                  {getSaleStatus(sale)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default SalesTable;
