import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ✅ CHARGER LES DEUX FICHIERS .env ET .env.local
dotenv.config(); // Charge .env
dotenv.config({ path: '.env.local' }); // Charge .env.local

// ✅ UTILISER LES VARIABLES D'ENVIRONNEMENT
const VENDLIVE_API_URL = process.env.VENDLIVE_API_URL || 'https://vendlive.com/api/2.0/order-sales/';
const VENDLIVE_TOKEN = process.env.VENDLIVE_TOKEN || '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';
const VENDLIVE_ACCOUNT_ID = process.env.VENDLIVE_ACCOUNT_ID || '295';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 🔍 DEBUG - Vérifier les variables d'environnement
console.log('🔍 SUPABASE_URL:', supabaseUrl ? 'OK' : 'MANQUANT');
console.log('🔍 SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'OK' : 'MANQUANT');
console.log('🔍 VENDLIVE_TOKEN:', VENDLIVE_TOKEN ? 'OK' : 'MANQUANT');
console.log('🔍 VENDLIVE_ACCOUNT_ID:', VENDLIVE_ACCOUNT_ID);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables Supabase manquantes dans .env.local !');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface VendLiveResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: VendLiveSale[];
}

interface VendLiveSale {
  id: number;
  createdAt: string; // ✅ Corrigé : utilise createdAt au lieu de timestamp
  productSales: ProductSale[];
  customer: {
    id: number;
    email: string;
    phoneNumber?: string; // ✅ Corrigé selon la vraie API
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
    id: number; // ✅ Ajouté
    description: string; // ✅ Ajouté
  };
  transaction: {
    id: number;
  } | null;
  voucherCode: string | null;
  history: {
    id: number;
  };
  // ✅ Ajout des champs manquants selon la vraie API
  total: string;
  totalCharged: string;
  discountTotal: string;
  netVat: string;
  charged: string;
  locationName: string;
}

interface ProductSale {
  id: number;
  timestamp: string; // ✅ timestamp existe bien au niveau productSale
  netAmount: string;
  totalPaid: string;
  price: string; // ✅ Ajouté
  discountValue: string | null;
  isRefunded: boolean;
  vendStatus: string;
  voucherCode: string | null; // ✅ Ajouté
  product: {
    id: number;
    name: string;
    externalId: string | null; // ✅ Ajouté
    category: {
      id: number;
      name: string;
    };
  };
}

interface Order {
  vendlive_id: string;
  machine_id: number;
  machine_name: string;
  venue_id: number | null;
  venue_name: string | null;
  transaction_id: string | null;
  product_name: string;
  product_category: string;
  quantity: number;
  price_ht: number;
  price_ttc: number;
  discount_amount: number;
  promo_code: string | null;
  status: string;
  payment_method: string | null;
  client_type: string;
  client_email: string | null;
  created_at: Date;
  raw_data: string;
}

interface Sale {
  vendlive_id: string;
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
  products: any[]; // ✅ JSON avec la liste des produits
  categories: string[]; // ✅ Liste des catégories uniques
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ FONCTION POUR MAPPER LES STATUTS VENDLIVE VERS LES STATUTS SUPABASE
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
  return statusMap[normalized] || 'completed'; // Par défaut completed pour Success
}	


async function fetchVendLiveData(
  startDate: string,
  endDate: string,
  page: number = 1
): Promise<VendLiveResponse> {
  if (!VENDLIVE_TOKEN) {
    throw new Error('VENDLIVE_TOKEN manquant. Définis-le dans .env.local ou via $env:VENDLIVE_TOKEN');
  }

  const url = new URL(VENDLIVE_API_URL);
  url.searchParams.append('accountId', VENDLIVE_ACCOUNT_ID);
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
  // Générer un ID vraiment unique basé sur plusieurs facteurs
  const saleId = sale.id;
  const productSaleId = productSale.id;
  const machineId = sale.machine.id;
  const historyId = sale.history.id;
  
  // Utiliser timestamp pour garantir l'unicité même avec les mêmes IDs
  const uniqueId = `${saleId}_${productSaleId}_${machineId}_${historyId}_${index}_${timestamp}`;
  
  return uniqueId;
}

// ✅ TRAITEMENT DE LA TABLE ORDERS (existant)
async function processBatch(sales: VendLiveSale[]): Promise<number> {
  const orders: Order[] = [];
  let globalCounter = Date.now(); // Pour garantir l'unicité
  let skippedUnknown = 0;

  for (const sale of sales) {
    console.log(`🔍 DEBUG Sale ${sale.id}:`);
    console.log(`  - productSales.length: ${sale.productSales?.length || 0}`);
    
    if (!sale.productSales || sale.productSales.length === 0) {
      console.log(`  ⚠️ Pas de productSales pour la vente ${sale.id}`);
      continue;
    }

    // Débugger le premier productSale
    const firstProductSale = sale.productSales[0];
    console.log(`  - Premier productSale.product.name: ${firstProductSale.product?.name || 'UNDEFINED'}`);
    console.log(`  - Premier productSale.product.category.name: ${firstProductSale.product?.category?.name || 'UNDEFINED'}`);
    
    // Traiter chaque productSale
	sale.productSales.forEach((productSale, psIndex) => {
  globalCounter++;
  
   const uniqueId = generateUniqueId(sale, productSale, psIndex, globalCounter);
  
  // SI pas de product, logger la structure complète
const hasProduct = !!productSale.product?.name;
const productName =
  (hasProduct && productSale.product!.name) || 'Produit inconnu';
const productCategory =
  (hasProduct && (productSale.product!.category?.name || 'Non catégorisé'))
  || 'Non catégorisé';


  const customerEmail = sale.customer?.email || null;
  const promoCode = productSale.voucherCode || sale.voucherCode || null;
  const discountAmount = parseFloat(productSale.discountValue || "0");
const saleTimestamp = productSale.timestamp || sale.createdAt || null;
  
  // 3️⃣ Déterminer le statut
	let status = "completed";
	if (productSale.isRefunded) {
	  status = "refunded";
	} else if (productSale.vendStatus) {
	  status = mapStatus(productSale.vendStatus);
	}

  // 4️⃣ Logger APRÈS avoir défini toutes les variables
  console.log(`    → EXTRACTED: "${productName}" | Cat: "${productCategory}" | Status: ${status}`);

  // 5️⃣ Créer l'objet order
const order = {
  vendlive_id: uniqueId,
  sale_id: sale.id,
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

// 🆕 NOUVEAU : TRAITEMENT DE LA TABLE SALES
async function processSalesTable(sales: VendLiveSale[]): Promise<number> {
  const salesRows: Sale[] = [];
  
  for (const sale of sales) {
    // 🆕 Construire la liste des produits pour cette commande
const productsArray = (sale.productSales || []).map(ps => {
  const hasProduct = !!ps.product && !!ps.product.name;
  const name = hasProduct
    ? ps.product.name
    : (ps?.promotion?.name || (ps.vendStatus ? `Produit ${ps.vendStatus}` : 'Produit inconnu'));
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
    is_unknown: !hasProduct, // 🆕 pour diagnostic côté UI si tu veux
  };
});

const validProducts = productsArray; // ✅ on ne filtre plus
const uniqueCategories = Array.from(new Set(
  productsArray.map(p => p.category).filter(Boolean)
));

    // 🆕 Créer la ligne pour la table sales
    const saleRow: Sale = {
      vendlive_id: sale.id.toString(),
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
      products: validProducts, // 🆕 Le JSON avec tous les produits
      categories: uniqueCategories // 🆕 Les catégories uniques
    };

    salesRows.push(saleRow);
    
    const productNames = validProducts.map(p => p.name).join(', ');
    console.log(`✅ Commande ${sale.id}: ${validProducts.length} produits - ${productNames}`);
  }
	console.log(`📤 Aperçu des données à insérer:`, {
	  vendlive_id: salesRows[0].vendlive_id,  // ✅ salesRows existe
	  product_name: salesRows[0].products[0]?.name,
	  categories: salesRows[0].categories,
	  created_at: salesRows[0].created_at
	});

  console.log(`📊 Batch sales traité: ${salesRows.length} commandes à insérer`);

  if (salesRows.length > 0) {
    await insertSalesBatch(salesRows);
  }

  return salesRows.length;
}

async function insertOrdersBatch(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;

  console.log(`📤 Insertion orders: ${orders.length} lignes...`);

  // ✅ DÉDUPLICATION GLOBALE AVANT INSERTION
  const uniqueOrders = Object.values(
    orders.reduce((acc, order) => {
      acc[order.vendlive_id] = order; // Garde la dernière occurrence
      return acc;
    }, {} as Record<string, Order>)
  );

  if (uniqueOrders.length !== orders.length) {
    console.log(`🔧 Doublons supprimés: ${orders.length} → ${uniqueOrders.length} lignes uniques`);
  }

  // ✅ INSERTION PAR PETITS SOUS-BATCHS POUR ÉVITER CONFLITS
  const BATCH_SIZE = 200;
  const totalBatches = Math.ceil(uniqueOrders.length / BATCH_SIZE);
  
  for (let i = 0; i < totalBatches; i++) {
    const batch = uniqueOrders.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    
    console.log(`📤 Insertion orders sous-batch ${i + 1}/${totalBatches}: ${batch.length} lignes`);

    try {
      const { error } = await supabase
		await supabase
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

// 🆕 NOUVEAU : INSERTION POUR LA TABLE SALES
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

async function clearOldData(): Promise<void> {
  console.log('🗑️ Suppression des anciennes données...');
  
  // Supprimer orders
  const { error: ordersError } = await supabase
    .from('orders')
    .delete()
    .neq('vendlive_id', '');

  if (ordersError) {
    console.error('❌ Erreur lors de la suppression orders:', ordersError);
    throw ordersError;
  }

  // Supprimer sales
  const { error: salesError } = await supabase
    .from('sales')
    .delete()
    .neq('vendlive_id', '');

  if (salesError) {
    console.error('❌ Erreur lors de la suppression sales:', salesError);
    throw salesError;
  }

  console.log('✅ Anciennes données supprimées (orders + sales)');
}

async function syncVendlive(): Promise<void> {
  const syncMode = process.env.SYNC_MODE || 'incremental';
  
  // 🆕 RÉCUPÉRER TOUTES LES DONNÉES - Période large par défaut
  const startDate = process.env.SYNC_START_DATE || '2020-01-01'; // ✅ Date très ancienne
const endDate = process.env.SYNC_END_DATE || (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1); // demain
  return d.toISOString().split('T')[0];
})();
console.log("📅 Using endDate:", endDate);
  const maxPages = parseInt(process.env.MAX_PAGES || '0'); // ✅ 0 = pas de limite

  console.log(`🚀 Synchronisation VendLive (${syncMode})`);
  console.log(`📅 Période: ${startDate} → ${endDate}`);
  console.log(`📄 Pages max: ${maxPages === 0 ? 'ILLIMITÉES' : maxPages}`);

  if (syncMode === 'full') {
    await clearOldData();
  }

  let page = 1;
  let totalSales = 0;
  let totalOrders = 0;
  let totalSalesRows = 0;

  try {
    while (maxPages === 0 || page <= maxPages) { // ✅ Pas de limite si maxPages = 0
      console.log(`\n📄 === PAGE ${page} ===`);
      
      const data = await fetchVendLiveData(startDate, endDate, page);
      
      console.log(`📊 Page ${page}: ${data.results.length} ventes récupérées`);
      
      if (data.results.length === 0) {
        console.log('✅ Aucune donnée sur cette page, arrêt');
        break;
      }

      // Traiter cette page pour orders
      const ordersProcessed = await processBatch(data.results);
      
      // 🆕 NOUVEAU : Traiter cette page pour sales aussi
      const salesProcessed = await processSalesTable(data.results);
      
      totalSales += data.results.length;
      totalOrders += ordersProcessed;
      totalSalesRows += salesProcessed;
      
      // Pause entre les pages pour éviter la surcharge
      await sleep(1000);
      
      page++;
      
      // Arrêter s'il n'y a plus de pages
      if (!data.next) {
        console.log('✅ Dernière page atteinte - Toutes les données récupérées');
        break;
      }
      
      // ✅ Sécurité : éviter une boucle infinie
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


// Exécution du script
console.log('🚀 Démarrage de la synchronisation...');

syncVendlive()
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