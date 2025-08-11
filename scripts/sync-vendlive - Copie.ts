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
  timestamp: string;
  productSales: ProductSale[];
  customer: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
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
  };
  transaction: {
    id: number;
  } | null;
  voucherCode: string | null;
  history: {
    id: number;
  };
}

interface ProductSale {
  id: number;
  netAmount: string;
  totalPaid: string;
  discountValue: string | null;
  isRefunded: boolean;
  vendStatus: string;
  product: {
    id: number;
    name: string;
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
  return statusMap[normalized] || 'unknown';
}

async function fetchVendLiveData(startDate: string, endDate: string, page: number = 1): Promise<VendLiveResponse> {
  const url = new URL(VENDLIVE_API_URL);
  url.searchParams.append('accountId', VENDLIVE_ACCOUNT_ID);
  url.searchParams.append('startDate', startDate);
  url.searchParams.append('endDate', endDate);
  url.searchParams.append('page', page.toString());
  url.searchParams.append('pageSize', '100');

  console.log(`🔄 Récupération page ${page}: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Token ${VENDLIVE_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Erreur API VendLive: ${response.status} ${response.statusText}`);
  }

  return await response.json();
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

async function processBatch(sales: VendLiveSale[]): Promise<number> {
  const orders: Order[] = [];
  let globalCounter = Date.now(); // Pour garantir l'unicité
  let skippedUnknown = 0;

  for (const sale of sales) {
    console.log(`🔍 DEBUG Sale ${sale.id}:`);
    console.log(`  - productSales.length: ${sale.productSales?.length || 0}`);
    
    // ✅ DEBUG COMPLET - VOIR TOUTE LA STRUCTURE
    console.log(`  - Toutes les clés de 'sale':`, Object.keys(sale));
    if (sale.productSales && sale.productSales[0]) {
      console.log(`  - Toutes les clés de 'productSales[0]':`, Object.keys(sale.productSales[0]));
    }
    
    if (!sale.productSales || sale.productSales.length === 0) {
      console.log(`  ⚠️ Pas de productSales pour la vente ${sale.id}`);
      continue;
    }

    // Débugger le premier productSale
    const firstProductSale = sale.productSales[0];
    console.log(`  - Premier productSale.id: ${firstProductSale.id}`);
    console.log(`  - Premier productSale.product.name: ${firstProductSale.product?.name || 'UNDEFINED'}`);
    console.log(`  - Premier productSale.product.category.name: ${firstProductSale.product?.category?.name || 'UNDEFINED'}`);
    console.log(`  - Sale createdAt: ${sale.createdAt || 'UNDEFINED'}`); // ✅ BON CHAMP
    console.log(`  - ProductSale timestamp: ${firstProductSale.timestamp || 'UNDEFINED'}`); // ✅ BON CHAMP
    // Traiter chaque productSale
    sale.productSales.forEach((productSale, psIndex) => {
      globalCounter++; // Incrémenter pour chaque ligne
      
      // Générer un ID unique
      const uniqueId = generateUniqueId(sale, productSale, psIndex, globalCounter);

      // Extraire les données du produit
	const productName = productSale.product?.name ?? null;
	const productCategory = productSale.product?.category?.name ?? null;

	if (!productName || !productCategory) {
	   console.log(`⏭️ Produit ignoré: nom="${productName}" cat="${productCategory}"`);
	   skippedUnknown++;
	   return;
	}

      const customerEmail = sale.customer?.email || null;
      const promoCode = sale.voucherCode || null;
      const discountAmount = parseFloat(productSale.discountValue || "0");
      
      // Déterminer le statut
      let status = "unknown";
      if (productSale.isRefunded) {
        status = "refunded";
      } else if (productSale.vendStatus) {
        status = mapStatus(productSale.vendStatus); // ✅ UTILISER LA FONCTION DE MAPPING
      }

      console.log(`    → EXTRACTED: "${productName}" | Cat: "${productCategory}" | Email: "${customerEmail}" | Promo: "${promoCode}" | Status: Success`);

      // ✅ RÉCUPÉRER LE TIMESTAMP DEPUIS LES BONS CHAMPS
      const saleTimestamp = productSale.timestamp || sale.createdAt || null;
      
      // Créer l'objet order
      const order: Order = {
        vendlive_id: uniqueId,
        machine_id: sale.machine.id,
        machine_name: sale.machine.friendlyName,
        venue_id: sale.location?.venue?.id || null,
        venue_name: sale.location?.venue?.name || null,
        transaction_id: sale.id?.toString() || null,
        product_name: productName,
        product_category: productCategory,
        quantity: 1,
        price_ht: parseFloat(productSale.netAmount),
        price_ttc: parseFloat(productSale.totalPaid),
        discount_amount: discountAmount,
        promo_code: promoCode,
        status: status,
        payment_method: null,
        client_type: "unknown",
        client_email: customerEmail,
        created_at: saleTimestamp ? new Date(saleTimestamp) : new Date(), // ✅ UTILISER LES VRAIS TIMESTAMPS
        raw_data: JSON.stringify({ sale, productSale }),
      };

      orders.push(order);
    });
  }

  if (skippedUnknown > 0) {
    console.log(`⏭️ ${skippedUnknown} produits "Unknown" ignorés`);
  }

  console.log(`📊 Batch traité: ${orders.length} commandes à insérer`);

  if (orders.length === 0) {
    console.log(`⚠️ Aucune commande à insérer dans ce batch`);
    return 0;
  }

  // La déduplication se fait maintenant dans insertOrdersBatch()
  await insertOrdersBatch(orders);
  
  // ✅ RETOURNER LE NOMBRE DE COMMANDES TRAITÉES
  return orders.length;
}

async function insertOrdersBatch(orders: Order[]): Promise<void> {
  if (orders.length === 0) return;

  console.log(`📤 Insertion batch global: ${orders.length} lignes...`);

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
  const BATCH_SIZE = 200; // Taille réduite pour éviter conflits PostgreSQL
  const totalBatches = Math.ceil(uniqueOrders.length / BATCH_SIZE);
  
  console.log(`📦 Total sous-batchs à insérer: ${totalBatches}`);

  for (let i = 0; i < totalBatches; i++) {
    const batch = uniqueOrders.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    
    console.log(`📤 Insertion sous-batch ${i + 1}/${totalBatches}: ${batch.length} lignes`);

    // Vérification supplémentaire : aucun doublon dans ce sous-batch
    const batchIds = batch.map(o => o.vendlive_id);
    const uniqueBatchIds = new Set(batchIds);
    
    if (batchIds.length !== uniqueBatchIds.size) {
      console.error(`❌ ERREUR: Doublons détectés dans le sous-batch ${i + 1} !`);
      console.error(`IDs en doublon:`, batchIds.filter((id, index) => batchIds.indexOf(id) !== index));
      throw new Error(`Doublons dans le sous-batch ${i + 1}`);
    }

    try {
      const { error } = await supabase
        .from('orders')
        .upsert(batch, { 
          onConflict: 'vendlive_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`❌ Erreur sous-batch ${i + 1}:`, error);
        console.error(`Détails:`, JSON.stringify(error, null, 2));
        throw error;
      }

      console.log(`✅ Sous-batch ${i + 1}/${totalBatches} inséré avec succès`);

    } catch (err) {
      console.error(`❌ Erreur fatale sous-batch ${i + 1}:`, err);
      throw err;
    }

    // Petite pause entre les sous-batchs pour éviter saturation
    if (i < totalBatches - 1) { // Pas de pause après le dernier batch
      await sleep(500);
    }
  }

  console.log(`✅ Tous les sous-batchs insérés avec succès: ${uniqueOrders.length} lignes au total`);
}

async function clearOldData(): Promise<void> {
  console.log('🗑️ Suppression des anciennes données...');
  
  // ✅ SUPPRESSION SÉCURISÉE SANS ERREUR UUID
  const { error } = await supabase
    .from('orders')
    .delete()
    .neq('vendlive_id', ''); // Utiliser un champ texte au lieu de l'UUID

  if (error) {
    console.error('❌ Erreur lors de la suppression:', error);
    throw error;
  }

  console.log('✅ Anciennes données supprimées');
}

async function syncVendlive(): Promise<void> {
  const syncMode = process.env.SYNC_MODE || 'incremental';
  const startDate = process.env.SYNC_START_DATE || '2024-01-01';
  const endDate = new Date().toISOString().split('T')[0];
  const maxPages = parseInt(process.env.MAX_PAGES || '100');

  console.log(`🚀 Synchronisation VendLive (${syncMode})`);
  console.log(`📅 Période: ${startDate} → ${endDate}`);
  console.log(`📄 Pages max: ${maxPages}`);

  if (syncMode === 'full') {
    await clearOldData();
  }

  let page = 1;
  let totalSales = 0;
  let totalOrders = 0;

  try {
    while (page <= maxPages) {
      console.log(`\n📄 === PAGE ${page} ===`);
      
      const data = await fetchVendLiveData(startDate, endDate, page);
      
      console.log(`📊 Page ${page}: ${data.results.length} ventes récupérées`);
      
      if (data.results.length === 0) {
        console.log('✅ Aucune donnée sur cette page, arrêt');
        break;
      }

      // Traiter cette page
      const ordersProcessed = await processBatch(data.results);
      
      totalSales += data.results.length;
      totalOrders += ordersProcessed; // ✅ INCRÉMENTER LE COMPTEUR TOTAL
      
      // Pause entre les pages pour éviter la surcharge
      await sleep(1000);
      
      page++;
      
      // Arrêter s'il n'y a plus de pages
      if (!data.next) {
        console.log('✅ Dernière page atteinte');
        break;
      }
    }

    console.log(`\n🎉 SYNCHRONISATION TERMINÉE`);
    console.log(`📊 Total ventes traitées: ${totalSales}`);
    console.log(`📦 Total commandes générées: ${totalOrders}`);

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    throw error;
  }
}

// Exécution du script
// ✅ FORCER L'EXÉCUTION DIRECTE
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