import type { InvoiceInput } from '@/utils/invoice';

export function saleToInvoiceInput(groupedSale: any): InvoiceInput {
  return {
    transaction_id: String(groupedSale.id),
    created_at: groupedSale.createdAt,
    venue_name: groupedSale.location?.venue?.name,
    machine_name: groupedSale.machine?.friendlyName,
    order_lines: (groupedSale.productSales || []).map((p: any) => ({
      product_name: p.productName || p.name || 'Produit',
      product_category: p.category || '—',
      quantity: p.quantity || 1,
      // Dans ton modèle, p.price (ou totalPaid) est déjà TTC
      price_ttc: Number(p.price ?? p.totalPaid ?? 0),
    })),
    payment_method: groupedSale.paymentMethod || null,
    customer_name: groupedSale.customerName || null,
    customer_email: groupedSale.customerEmail || null,
    // Mets 0.2 si TVA 20% (sinon null => non applicable)
    vat_rate: null
  };
}
