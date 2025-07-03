// scripts/sync-vendlive.ts
import { createClient } from '@supabase/supabase-js';

// Configuration
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'VOTRE_SERVICE_KEY'
);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// Statistiques de sync
let stats = {
  startTime: Date.now(),
  newSales: 0,
  totalRows: 0,
  errors: 0
};

// Fonction principale optimisée
async function syncVendlive() {
  const hour = new Date().getHours();
  const isRushHour = (hour >= 11 && hour <= 14) || (hour >= 7 && hour <= 10);
  
  console.log(`🚀 Synchronisation VendLive → Supabase`);
  console.log(`🕐 Heure: ${new Date().toLocaleString('fr-FR')}`);
  console.log(`⚡ Mode: ${isRushHour ? 'RUSH (sync rapide)' : 'Normal'}`);
  
  try {
    // 1. Déterminer la période à synchroniser
    const syncDays = parseInt(process.env.SYNC_DAYS || '1');
    const { data: lastSync } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    let lastSyncDate = lastSync?.[0]?.created_at 
      ? new Date(lastSync[0].created_at)
      : new Date(Date.now() - syncDays * 24 * 60 * 60 * 1000);
    
    // En mode rush, limiter à 2 heures max
    if (isRushHour) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      if (lastSyncDate < twoHoursAgo) {
        lastSyncDate = twoHoursAgo;
        console.log('⚡ Mode rush: limitation à 2h de données');
      }
    }
    
    console.log(`📅 Sync depuis: ${lastSyncDate.toLocaleString('fr-FR')}`);
    
    // 2. Récupérer les ventes
    let allSales: any[] = [];
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?pageSize=500&orderBy=Created%20at`;
    let pageCount = 0;
    const maxPages = isRushHour ? 5 : 50; // Limiter en rush hour
    
    while (nextUrl && pageCount < maxPages) {
      pageCount++;
      process.stdout.write(`\r📄 Page ${pageCount}...`);
      
      const response = await fetch(nextUrl, { headers });
      
      if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`);
      }
      
      const data = await response.json();
      const pageSales = data.results || [];
      
      const newSales = pageSales.filter((sale: any) => 
        new Date(sale.createdAt) > lastSyncDate
      );
      
      allSales = [...allSales, ...newSales];
      
      if (newSales.length < pageSales.length || !data.next) {
        break;
      }
      
      nextUrl = data.next;
    }
    
    console.log(`\n📦 ${allSales.length} nouvelles ventes trouvées`);
    stats.newSales = allSales.length;
    
    if (allSales.length === 0) {
      console.log('✅ Aucune nouvelle vente à synchroniser');
      await logSync('success', stats);
      return;
    }
    
    // 3. Transformer et insérer
    const ordersToInsert = [];
    
    for (const sale of allSales) {
      const products = sale.productSales || sale.products || [];
      
      if (products.length === 0) {
        ordersToInsert.push(transformSaleToOrder(sale, null));
      } else {
        for (const product of products) {
          ordersToInsert.push(transformSaleToOrder(sale, product));
        }
      }
    }
    
    stats.totalRows = ordersToInsert.length;
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    // 4. Insertion par batch optimisé
    const batchSize = isRushHour ? 200 : 100; // Plus gros batches en rush
    
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      const progress = Math.round((i / ordersToInsert.length) * 100);
      
      process.stdout.write(`\r⏳ Progression: ${progress}%`);
      
      const { error } = await supabase
        .from('orders')
        .upsert(batch, {
          onConflict: 'vendlive_id',
          ignoreDuplicates: true
        });
      
      if (error) {
        console.error(`\n❌ Erreur batch ${Math.floor(i/batchSize) + 1}:`, error);
        stats.errors++;
      }
    }
    
    console.log('\n✅ Insertion terminée');
    
    // 5. Calculer les stats du jour
    await updateDailyStats();
    
    // 6. Log de succès
    await logSync('success', stats);
    
    const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
    console.log(`\n🎉 Synchronisation terminée en ${duration}s`);
    console.log(`📊 Résumé: ${stats.newSales} ventes, ${stats.totalRows} lignes`);
    
  } catch (error) {
    console.error('\n❌ Erreur sync:', error);
    stats.errors++;
    await logSync('failed', stats, error.message);
    throw error;
  }
}

// Transformer une vente en ligne order
function transformSaleToOrder(sale: any, product: any) {
  let categoryName = 'Non catégorisé';
  let productName = 'Vente directe';
  let quantity = 1;
  let price = parseFloat(sale.total || sale.totalCharged || '0');
  
  if (product) {
    productName = product.productName || product.name || 'Unknown';
    quantity = parseInt(product.quantity || '1');
    price = parseFloat(product.price || product.unitPrice || '0');
    
    if (typeof product.category === 'string') {
      categoryName = product.category;
    } else if (product.category?.name) {
      categoryName = product.category.name;
    } else if (product.productCategory) {
      categoryName = typeof product.productCategory === 'string' 
        ? product.productCategory 
        : product.productCategory.name || 'Non catégorisé';
    }
  }
  
  return {
    vendlive_id: product 
      ? `${sale.id}_${productName.replace(/\s+/g, '_')}` 
      : sale.id,
    machine_id: sale.machine?.id || 0,
    machine_name: sale.machine?.friendlyName || 'Unknown',
    venue_id: sale.location?.venue?.id || null,
    venue_name: sale.location?.venue?.name || 'Unknown',
    product_name: productName,
    product_category: categoryName,
    quantity: quantity,
    price_ttc: price,
    status: sale.charged === 'Yes' ? 'completed' : 'refunded',
    created_at: sale.createdAt,
    client_email: sale.customerEmail || sale.customer?.email || null,
    promo_code: sale.promoCode || null,
    discount_amount: parseFloat(sale.discountAmount || '0')
  };
}

// Calculer les stats journalières
async function updateDailyStats() {
  const today = new Date().toISOString().split('T')[0];
  
  const { data } = await supabase
    .from('orders')
    .select('machine_id, machine_name, venue_id, venue_name, price_ttc, status')
    .gte('created_at', today + 'T00:00:00')
    .lte('created_at', today + 'T23:59:59');
  
  if (!data || data.length === 0) return;
  
  // Grouper par machine
  const statsByMachine = new Map();
  
  data.forEach(order => {
    const key = order.machine_id;
    if (!statsByMachine.has(key)) {
      statsByMachine.set(key, {
        date: today,
        machine_id: order.machine_id,
        machine_name: order.machine_name,
        venue_id: order.venue_id,
        venue_name: order.venue_name,
        total_orders: 0,
        successful_orders: 0,
        total_revenue_ttc: 0
      });
    }
    
    const stats = statsByMachine.get(key);
    stats.total_orders++;
    if (order.status === 'completed') {
      stats.successful_orders++;
      stats.total_revenue_ttc += order.price_ttc;
    }
  });
  
  // Upsert les stats
  const dailyStats = Array.from(statsByMachine.values());
  
  await supabase
    .from('daily_stats')
    .upsert(dailyStats, {
      onConflict: 'date,machine_id'
    });
  
  console.log(`📊 Stats mises à jour pour ${dailyStats.length} machines`);
}

// Logger la synchronisation
async function logSync(status: string, stats: any, errorMessage?: string) {
  await supabase
    .from('sync_logs')
    .insert({
      sync_type: 'vendlive_orders',
      status: status,
      records_synced: stats.totalRows,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
      metadata: {
        duration_seconds: (Date.now() - stats.startTime) / 1000,
        new_sales: stats.newSales,
        errors: stats.errors,
        hour: new Date().getHours()
      }
    });
}

// Lancer la sync
syncVendlive()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  });