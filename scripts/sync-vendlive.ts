import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// ✅ CHARGER LES DEUX FICHIERS .env ET .env.local
dotenv.config(); // Charge .env
dotenv.config({ path: '.env.local' }); // Charge .env.local

// ✅ UTILISER LES VARIABLES D'ENVIRONNEMENT
const VENDLIVE_API_URL = process.env.VENDLIVE_API_URL;
const VENDLIVE_TOKEN = process.env.VENDLIVE_TOKEN;
const VENDLIVE_ACCOUNT_IDS = (process.env.VENDLIVE_ACCOUNT_IDS)
  .split(',')
  .map(id => id.trim());
  
  const ACCOUNT_NAMES: Record<string, string> = {
  '295': 'Shape Eat',
  '337': 'OA Bobigny',
  '360': 'OA Clichy', 
  '340': 'OA Flandres',
  '339': 'OA Roissy-en-Brie/St-Brice',
  '338': 'OA Pré-St-Gervais'
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 🔍 DEBUG - Vérifier les variables d'environnement
console.log('🔍 SUPABASE_URL:', supabaseUrl ? 'OK' : 'MANQUANT');
console.log('🔍 SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'OK' : 'MANQUANT');
console.log('🔍 VENDLIVE_TOKEN:', VENDLIVE_TOKEN ? 'OK' : 'MANQUANT');
console.log('🔍 VENDLIVE_ACCOUNT_IDS:', VENDLIVE_ACCOUNT_IDS);


if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables Supabase manquantes dans .env.local !');
  process.exit(1);
}

// ✅ CORRECTION : Utiliser les bonnes variables
const supabase = createClient(supabaseUrl, supabaseKey);

interface VendLiveResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: VendLiveSale[];
}

interface VendLiveSale {
  id: number;
  createdAt: string;
  productSales: ProductSale[];
  customer: {
    id: number;
    email: string;
    phoneNumber?: string;
  } | null;
  machine: {
    id: number;
    friendlyName: string;
  };
  location: {
    venue: {
      id: number;
      name: string;
      externalId: string | null;
    };
    id: number;
    description: string;
  };
  transaction: {
    id: number;
  } | null;
  voucherCode: string | null;
  history: {
    id: number;
  };
  total: string;
  totalCharged: string;
  discountTotal: string;
  netVat: string;
  charged: string;
  locationName: string;
}

interface ProductSale {
  id: number;
  timestamp: string;
  netAmount: string;
  totalPaid: string;
  price: string;
  discountValue: string | null;
  isRefunded: boolean;
  vendStatus: string;
  voucherCode: string | null;
  vatRate?: string; // ✅ Ajouté
  product: {
    id: number;
    name: string;
    externalId: string | null;
    category: {
      id: number;
      name: string;
    };
  };
}

interface Order {
  vendlive_id: string;
  sale_id: number; // ✅ Ajouté
  account_id: number;
  account_name: string;
  product_sale_id: number; // ✅ Ajouté
  history_id: number | null; // ✅ Ajouté
  machine_id: number;
  machine_name: string;
  venue_id: number | null;
  venue_name: string | null;
  transaction_id: string | null;
  product_id: number | null; // ✅ Ajouté
  product_name: string;
  product_category: string;
  quantity: number;
  price_ht: number;
  price_ttc: number;
  discount_amount: number;
  vat_rate: number | null; // ✅ Ajouté
  status: string;
  vend_status: string | null; // ✅ Ajouté
  is_refunded: boolean; // ✅ Ajouté
  payment_method: string | null;
  promo_code: string | null;
  client_type: string;
  client_email: string | null;
  created_at: Date;
  raw_data: any; // ✅ Simplifié
}

interface Sale {
  vendlive_id: string;
  account_id: number;
  account_name: string;
  transaction_id: string;
  machine_id: number;
  machine_name: string;
  venue_id: number | null;
  venue_name: string | null;
  customer_email: string | null;
  promo_code: string | null;
  total_ttc: number;
  total_ht: number;
  discount_amount: number;
  nb_products: number;
  status: string;
  payment_status: string;
  created_at: Date;
  updated_at: Date;
  products: any[];
  categories: string[];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function mapStatus(vendStatus: string): string {
  const statusMap: Record<string, string> = {
    'success': 'completed',
    'delivered': 'completed', 
    'paid': 'completed',
    'refunded': 'refunded',
    'failure': 'failed',
    'failed': 'failed',
    'canceled': 'cancelled',
    'cancelled': 'cancelled',
    'pending': 'pending'
  };
  
  const normalized = vendStatus?.toLowerCase() || 'unknown';
  return statusMap[normalized] || 'completed';
}

async function fetchVendLiveData(
  accountId: string,
  startDate: string,
  endDate: string,
  page: number = 1
): Promise<VendLiveResponse> {
  if (!VENDLIVE_TOKEN) {
    throw new Error('VENDLIVE_TOKEN manquant. Définis-le dans .env.local ou via $env:VENDLIVE_TOKEN');
  }

  const url = new URL(VENDLIVE_API_URL);
  url.searchParams.append('accountId', accountId);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('page', page.toString());
  url.searchParams.append('pageSize', '100');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Token ${VENDLIVE_TOKEN}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ Erreur API VendLive: ${response.status} ${response.statusText}`);
    console.error(`❌ Réponse: ${errorBody}`);
    throw new Error(`Erreur API VendLive: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<VendLiveResponse>;
}

function generateUniqueId(sale: VendLiveSale, productSale: ProductSale, index: number, timestamp: number): string {
  const saleId = sale.id;
  const productSaleId = productSale.id;
  const machineId = sale.machine.id;
  const historyId = sale.history.id;
  
  const uniqueId = `${saleId}_${productSaleId}_${machineId}_${historyId}_${index}_${timestamp}`;
  
  return uniqueId;
}

async function processBatch(sales: VendLiveSale[], accountId: string): Promise<number> {
  const orders: Order[] = [];
  let globalCounter = Date.now();
  let skippedUnknown = 0;

  for (const sale of sales) {
    console.log(`🔍 DEBUG Sale ${sale.id}:`);
    console.log(`  - productSales.length: ${sale.productSales?.length || 0}`);
    
    if (!sale.productSales || sale.productSales.length === 0) {
      console.log(`  ⚠️ Pas de productSales pour la vente ${sale.id}`);
      continue;
    }

    const firstProductSale = sale.productSales[0];
    console.log(`  - Premier productSale.product.name: ${firstProductSale.product?.name || 'UNDEFINED'}`);
    console.log(`  - Premier productSale.product.category.name: ${firstProductSale.product?.category?.name || 'UNDEFINED'}`);
    
    sale.productSales.forEach((productSale, psIndex) => {
      globalCounter++;
      
      const uniqueId = generateUniqueId(sale, productSale, psIndex, globalCounter);
      
      const hasProduct = !!productSale.product?.name;
      const productName = (hasProduct && productSale.product!.name) || 'Produit inconnu';
      const productCategory = (hasProduct && (productSale.product!.category?.name || 'Non catégorisé')) || 'Non catégorisé';

      let status = "completed";
      if (productSale.isRefunded) {
        status = "refunded";
      } else if (productSale.vendStatus) {
        status = mapStatus(productSale.vendStatus);
      }

      console.log(`    → EXTRACTED: "${productName}" | Cat: "${productCategory}" | Status: ${status}`);

      const order: Order = {
        vendlive_id: uniqueId,
        sale_id: sale.id,
		account_id: parseInt(accountId),
		 account_name: ACCOUNT_NAMES[accountId],
        product_sale_id: productSale.id,
        history_id: sale.history?.id || null,
        machine_id: sale.machine?.id || null,
        machine_name: sale.machine?.friendlyName || null,
        venue_id: sale.location?.venue?.id || null,
        venue_name: sale.location?.venue?.name || null,
        transaction_id: String(sale.id),
        product_id: productSale.product?.id || null,
        product_name: String(productName || 'Produit inconnu'),
        product_category: String(productCategory || 'Non catégorisé'),
        quantity: 1,
        price_ht: parseFloat(productSale.netAmount || '0'),
        price_ttc: parseFloat(productSale.totalPaid || '0'),
        discount_amount: parseFloat(productSale.discountValue || '0'),
        vat_rate: productSale.vatRate ? parseFloat(productSale.vatRate) : null,
        status: mapStatus(productSale.vendStatus || (productSale.isRefunded ? 'refunded' : 'success')),
        vend_status: productSale.vendStatus || null,
        is_refunded: !!productSale.isRefunded,
        payment_method: null,
        promo_code: productSale.voucherCode || sale.voucherCode || null,
        client_type: 'unknown',
        client_email: sale.customer?.email || null,
        created_at: new Date(productSale.timestamp || sale.createdAt || Date.now()),
        raw_data: { sale, productSale }
      };

      orders.push(order);
    });
  }

  if (skippedUnknown > 0) {
    console.log(`⏭️ ${skippedUnknown} produits ignorés (données manquantes)`);
  }

  console.log(`📊 Batch orders traité: ${orders.length} commandes à insérer`);

  if (orders.length > 0) {
    await insertOrdersBatch(orders);
  }
  
  return orders.length;
}

async function processSalesTable(sales: VendLiveSale[], accountId: string): Promise<number> {
  const salesRows: Sale[] = [];
  
  for (const sale of sales) {
    const productsArray = (sale.productSales || []).map(ps => {
      const hasProduct = !!ps.product && !!ps.product.name;
      const name = hasProduct
        ? ps.product.name
        : (ps.vendStatus ? `Produit ${ps.vendStatus}` : 'Produit inconnu');
      const category = hasProduct
        ? (ps.product?.category?.name || 'Non catégorisé')
        : (ps.isRefunded
            ? 'Remboursement'
            : (['failure','failed','canceled','cancelled','pending']
                .includes((ps.vendStatus || '').toLowerCase())
                  ? 'Transaction'
                  : 'Non catégorisé'));

      return {
        id: ps.id,
        name,
        category,
        quantity: 1,
        price_ttc: parseFloat(ps.totalPaid || "0"),
        price_ht: parseFloat(ps.netAmount || "0"),
        discount: parseFloat(ps.discountValue || "0"),
        vendor_status: ps.vendStatus || null,
        is_refunded: ps.isRefunded || false,
        is_unknown: !hasProduct,
      };
    });

    const validProducts = productsArray;
    const uniqueCategories = Array.from(new Set(
      productsArray.map(p => p.category).filter(Boolean)
    ));

    const saleRow: Sale = {
      vendlive_id: sale.id.toString(),
	  account_id: parseInt(accountId),
	  account_name: ACCOUNT_NAMES[accountId],
      transaction_id: sale.id.toString(),
      machine_id: sale.machine.id,
      machine_name: sale.machine.friendlyName,
      venue_id: sale.location?.venue?.id || null,
      venue_name: sale.location?.venue?.name || null,
      customer_email: sale.customer?.email || null, 
      promo_code: sale.voucherCode || null,
      total_ttc: parseFloat(sale.total || "0"),
      total_ht: parseFloat(sale.netVat || "0"),
      discount_amount: parseFloat(sale.discountTotal || "0"),
      nb_products: validProducts.length,
      status: sale.charged === 'Yes' ? 'completed' : 'failed',
      payment_status: sale.charged === 'Yes' ? 'success' : 'failed',
      created_at: new Date(sale.createdAt),
      updated_at: new Date(),
      products: validProducts,
      categories: uniqueCategories
    };

    salesRows.push(saleRow);
    
    const productNames = validProducts.map(p => p.name).join(', ');
    console.log(`✅ Commande ${sale.id}: ${validProducts.length} produits - ${productNames}`);
  }

  // ✅ CORRECTION : Vérifier que salesRows n'est pas vide
  if (salesRows.length > 0) {
    console.log(`📤 Aperçu des données à insérer:`, {
      vendlive_id: salesRows[0].vendlive_id,
      product_name: salesRows[0].products[0]?.name,
      categories: salesRows[0].categories,
      created_at: salesRows[0].created_at
    });
  }

  console.log(`📊 Batch sales traité: ${salesRows.length} commandes à insérer`);

  if (salesRows.length > 0) {
    await insertSalesBatch(salesRows);
  }

  return salesRows.length;
}

async function insertOrdersBatch(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;

  console.log(`📤 Insertion orders: ${orders.length} lignes...`);

  const uniqueOrders = Object.values(
    orders.reduce((acc, order) => {
      acc[order.vendlive_id] = order;
      return acc;
    }, {} as Record<string, Order>)
  );

  if (uniqueOrders.length !== orders.length) {
    console.log(`🔧 Doublons supprimés: ${orders.length} → ${uniqueOrders.length} lignes uniques`);
  }

  const BATCH_SIZE = 200;
  const totalBatches = Math.ceil(uniqueOrders.length / BATCH_SIZE);
  
  for (let i = 0; i < totalBatches; i++) {
    const batch = uniqueOrders.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    
    console.log(`📤 Insertion orders sous-batch ${i + 1}/${totalBatches}: ${batch.length} lignes`);

    try {
      // ✅ CORRECTION : Syntaxe corrigée
      const { error } = await supabase
        .from('orders')
        .upsert(batch, { 
          onConflict: 'vendlive_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`❌ Erreur orders sous-batch ${i + 1}:`, error);
        throw error;
      }

      console.log(`✅ Orders sous-batch ${i + 1}/${totalBatches} inséré avec succès`);

    } catch (err) {
      console.error(`❌ Erreur fatale orders sous-batch ${i + 1}:`, err);
      throw err;
    }

    if (i < totalBatches - 1) {
      await sleep(500);
    }
  }

  console.log(`✅ Tous les orders sous-batchs insérés: ${uniqueOrders.length} lignes au total`);
}

async function insertSalesBatch(salesRows: Sale[]): Promise<void> {
  if (salesRows.length === 0) return;

  console.log(`📤 Insertion sales: ${salesRows.length} commandes...`);

  try {
    const { error } = await supabase
      .from('sales')
      .upsert(salesRows, { 
        onConflict: 'vendlive_id',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error(`❌ Erreur insertion sales:`, error);
      throw error;
    }

    console.log(`✅ ${salesRows.length} commandes insérées dans sales avec succès`);

  } catch (err) {
    console.error(`❌ Erreur fatale insertion sales:`, err);
    throw err;
  }
}

async function clearOldData(accountId: string): Promise<void> {
  console.log(`🗑️ Suppression des anciennes données pour le compte ${accountId}...`);
  
  const { error: ordersError } = await supabase
    .from('orders')
    .delete()
    .eq('account_id', parseInt(accountId));

  if (ordersError) {
    console.error('❌ Erreur lors de la suppression orders:', ordersError);
    throw ordersError;
  }

  const { error: salesError } = await supabase
    .from('sales')
    .delete()
    .eq('account_id', parseInt(accountId));

  if (salesError) {
    console.error('❌ Erreur lors de la suppression sales:', salesError);
    throw salesError;
  }

  console.log(`✅ Anciennes données supprimées pour le compte ${accountId}`);
}

async function syncVendlive(accountId: string): Promise<void> {
  const syncMode = process.env.SYNC_MODE || 'incremental';
  
  const startDate = process.env.SYNC_START_DATE || '2020-01-01';
  const endDate = process.env.SYNC_END_DATE || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();
  
  const maxPages = parseInt(process.env.MAX_PAGES || '0');

  console.log(`🚀 Synchronisation VendLive (${syncMode})`);
  console.log(`📅 Période: ${startDate} → ${endDate}`);
  console.log(`📄 Pages max: ${maxPages === 0 ? 'ILLIMITÉES' : maxPages}`);

if (syncMode === 'full') {
  await clearOldData(accountId);
}

  let page = 1;
  let totalSales = 0;
  let totalOrders = 0;
  let totalSalesRows = 0;

  try {
    while (maxPages === 0 || page <= maxPages) {
      console.log(`\n📄 === PAGE ${page} ===`);
      
      const data = await fetchVendLiveData(accountId, startDate, endDate, page);
      
      console.log(`📊 Page ${page}: ${data.results.length} ventes récupérées`);
      
      if (data.results.length === 0) {
        console.log('✅ Aucune donnée sur cette page, arrêt');
        break;
      }

	const ordersProcessed = await processBatch(data.results, accountId);
	const salesProcessed = await processSalesTable(data.results, accountId);
      
      totalSales += data.results.length;
      totalOrders += ordersProcessed;
      totalSalesRows += salesProcessed;
      
      await sleep(1000);
      
      page++;
      
      if (!data.next) {
        console.log('✅ Dernière page atteinte - Toutes les données récupérées');
        break;
      }
      
      if (page > 1000) {
        console.log('⚠️ Limite de sécurité atteinte (1000 pages)');
        break;
      }
    }

    console.log(`\n🎉 SYNCHRONISATION TERMINÉE`);
    console.log(`📊 Total ventes API traitées: ${totalSales}`);
    console.log(`📦 Total lignes orders générées: ${totalOrders}`);
    console.log(`🛍️ Total lignes sales générées: ${totalSalesRows}`);

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    throw error;
  }
}

console.log('🚀 Démarrage de la synchronisation...');

async function syncAllAccounts() {
  for (const accountId of VENDLIVE_ACCOUNT_IDS) {
    console.log(`\n🔄 === SYNCHRONISATION COMPTE ${accountId} ===\n`);
    await syncVendlive(accountId);
  }
}

syncAllAccounts()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

export { syncVendlive };