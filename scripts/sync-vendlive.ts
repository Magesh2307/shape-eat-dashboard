// scripts/sync-vendlive.ts - Version finale corrigée
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmZ0cG9pZ3kiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzUxNDUyNzcwLCJleHAiOjIwNjcwMjg3NzB9.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// Traitement par batch - TOUTES les ventes
async function processBatch(sales: any[]): Promise<any[]> {
  return sales.map(sale => {
    const products = sale.productSales || [];
    const saleAmount = parseFloat(sale.totalCharged || '0');
    const discountAmount = parseFloat(sale.discountTotal || '0');
    
    if (products.length === 0) {
      return [{
        vendlive_id: String(sale.id), // Convertir en string
        machine_id: sale.machine?.id || 0,
        machine_name: sale.machine?.friendlyName || 'Unknown',
        venue_id: sale.location?.venue?.id || null,
        venue_name: sale.location?.venue?.name || 'Unknown',
        transaction_id: sale.transaction?.id ? String(sale.transaction.id) : String(sale.id),
        product_name: 'Vente directe',
        product_category: 'Non catégorisé',
        quantity: 1,
        price_ht: null,
        price_ttc: parseFloat(sale.totalCharged || '0'),
        status: sale.charged === 'Yes' ? 'completed' : 'failed',
        payment_method: sale.paymentMethod || null,
        client_type: sale.customerType || null,
        client_email: sale.customerEmail || null,
        discount_amount: discountAmount,
        promo_code: sale.voucherCode || null,
        created_at: sale.createdAt,
        synced_at: new Date().toISOString(),
        raw_data: null
      }];
    }
    
    // Distribution proportionnelle sur TOUS les produits
    const totalProductPrices = products.reduce((sum: number, p: any) => 
      sum + parseFloat(p.price || p.unitPrice || '0'), 0);
    const ratio = totalProductPrices > 0 ? saleAmount / totalProductPrices : 1;
    
    return products.map((product: any) => ({
      vendlive_id: `${sale.id}_${product.productName || product.name || product.id}`,
      machine_id: sale.machine?.id || 0,
      machine_name: sale.machine?.friendlyName || 'Unknown',
      venue_id: sale.location?.venue?.id || null,
      venue_name: sale.location?.venue?.name || 'Unknown',
      transaction_id: sale.transaction?.id ? String(sale.transaction.id) : String(sale.id),
      product_name: product.productName || product.name || 'Unknown',
      product_category: product.category?.name || product.productCategory?.name || 'Non catégorisé',
      quantity: parseInt(product.quantity || '1'),
      price_ht: null, // Pas disponible dans l'API
      price_ttc: parseFloat(product.price || product.unitPrice || '0') * ratio,
      status: product.vendStatus === 'Success' && !product.isRefunded ? 'completed' : 'failed',
      payment_method: sale.paymentMethod || null,
      client_type: sale.customerType || null,
      client_email: sale.customerEmail || null,
      discount_amount: parseFloat(product.discountValue || '0') * ratio,
      promo_code: sale.voucherCode || null,
      created_at: sale.createdAt,
      synced_at: new Date().toISOString(),
      raw_data: null // Ou JSON.stringify(sale) si vous voulez garder tout
    }));
  }).flat();
}

// SYNC PRINCIPALE
async function syncVendlive() {
  const startTime = Date.now();
  console.log('🚀 Synchronisation VendLive → Supabase...');
  
  try {
    // 1. Récupérer la dernière sync
    const { data: lastSync } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
	const lastSyncDate = new Date('2025-01-01')
    
    console.log(`📅 Dernière sync: ${lastSyncDate.toISOString()}`);
    
    // 2. Récupérer TOUTES les nouvelles ventes
    let allSales: any[] = [];
    // URL simple qui fonctionne
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?accountId=295&pageSize=50`;
    let pageCount = 0;
    
    while (nextUrl && pageCount < 20) { // Limite de sécurité augmentée
      pageCount++;
      console.log(`📄 Chargement page ${pageCount}...`);
      
      // Pause entre les requêtes pour éviter ECONNRESET
      if (pageCount > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Pause 1 seconde
      }
      
      try {
        const response = await fetch(nextUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        const pageSales = data.results || [];
        
        // Filtrer uniquement par date
        const newSales = pageSales.filter((sale: any) => 
          new Date(sale.createdAt) > lastSyncDate
        );
        
        allSales = [...allSales, ...newSales];
        
        // Si on trouve des ventes déjà synchronisées, arrêter
        if (newSales.length < pageSales.length) {
          console.log('✅ Trouvé des ventes déjà synchronisées, arrêt');
          break;
        }
        
        nextUrl = data.next;
        
        // Si on a assez de ventes, arrêter
        if (allSales.length > 5000) {
          console.log('⚠️ Limite de 5000 ventes atteinte');
          break;
        }
      } catch (fetchError) {
        if (fetchError.cause?.code === 'ECONNRESET' && pageCount > 1) {
          console.warn(`⚠️ Connexion reset page ${pageCount}, on continue avec les données récupérées`);
          break; // Continuer avec ce qu'on a
        }
        throw fetchError; // Relancer l'erreur si c'est autre chose
      }
    }
    
    console.log(`📦 ${allSales.length} nouvelles ventes trouvées`);
    
    if (allSales.length === 0) {
      console.log('✅ Aucune nouvelle vente');
      await supabase.from('sync_logs').insert({
        sync_type: 'vendlive_orders',
        records_synced: 0,
        status: 'completed',
        completed_at: new Date().toISOString(),
        started_at: new Date(startTime).toISOString(),
        last_vendlive_id: null,
        metadata: null
      });
      console.log(`⏱️ Durée: ${(Date.now() - startTime) / 1000}s`);
      return;
    }
    
    // 3. Traiter TOUTES les ventes
    const ordersToInsert = await processBatch(allSales);
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    // 4. Debug : afficher un exemple de données
    if (ordersToInsert.length > 0) {
      console.log('📋 Exemple de données à insérer:');
      console.log(JSON.stringify(ordersToInsert[0], null, 2));
    }
    
    // 5. Calculer les totaux pour vérification
    const totalByVenue = ordersToInsert.reduce((acc, order) => {
      if (order.status === 'completed') {
        const venue = order.venue_name;
        acc[venue] = (acc[venue] || 0) + order.price_ttc;
      }
      return acc;
    }, {} as Record<string, number>);
    
    console.log('💰 CA par venue à insérer:');
    Object.entries(totalByVenue).forEach(([venue, total]) => {
      console.log(`  - ${venue}: ${total.toFixed(2)}€`);
    });
    
    // 6. Insertion par batch avec upsert
    const batchSize = 500;
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      
      // Filtrer les lignes avec status 'failed'
      const batchFiltered = batch.filter(row => row.status !== 'failed');
      const excluded = batch.length - batchFiltered.length;
      
      if (excluded > 0) {
        console.log(`⚠️ Exclusion de ${excluded} lignes avec status 'failed'`);
      }
      
      if (batchFiltered.length === 0) {
        console.log(`⏭️ Batch ${Math.floor(i/batchSize) + 1} ignoré (toutes les lignes failed)`);
        continue;
      }
      
      console.log(`📤 Insertion batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(ordersToInsert.length/batchSize)}: ${batchFiltered.length} lignes...`);
      
      const { error } = await supabase
        .from('orders')
        .upsert(batchFiltered, {
          onConflict: 'vendlive_id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error('❌ Erreur insertion batch:', error);
        console.error('Détails:', JSON.stringify(error, null, 2));
        throw error;
      }
      
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batchFiltered.length} lignes insérées`);
    }
    
    // 7. Log final - compter seulement les lignes réellement insérées
    const totalInserted = ordersToInsert.filter(row => row.status !== 'failed').length;
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      records_synced: totalInserted,
      status: 'completed',
      completed_at: new Date().toISOString(),
      started_at: new Date(startTime).toISOString(),
      last_vendlive_id: null,
      metadata: null
    });
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`🎉 Sync terminée en ${duration}s !`);
    console.log(`📊 ${allSales.length} ventes → ${ordersToInsert.length} lignes`);
    
    // 8. Optionnel : Mettre à jour les stats journalières
    try {
      await updateDailyStats();
    } catch (err) {
      console.warn('⚠️ Mise à jour des stats journalières échouée:', err.message);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString(),
      started_at: new Date(startTime).toISOString(),
      records_synced: 0,
      last_vendlive_id: null,
      metadata: null
    });
    throw error;
  }
}

// Mettre à jour les stats journalières
async function updateDailyStats() {
  console.log('📊 Mise à jour des stats journalières...');
  
  const today = new Date().toISOString().split('T')[0];
  
  // Supprimer les stats du jour
  await supabase
    .from('daily_stats')
    .delete()
    .eq('date', today);
  
  // Recalculer
  const { data: todayOrders } = await supabase
    .from('orders')
    .select('*')
    .gte('created_at', today + 'T00:00:00')
    .lt('created_at', today + 'T23:59:59');
  
  if (!todayOrders || todayOrders.length === 0) return;
  
  // Grouper par venue
  const statsByVenue = todayOrders.reduce((acc, order) => {
    const key = `${order.venue_id}_${order.venue_name}_${order.machine_id}`;
    if (!acc[key]) {
      acc[key] = {
        date: today,
        venue_id: order.venue_id,
        venue_name: order.venue_name,
        machine_id: order.machine_id,
        machine_name: order.machine_name,
        total_orders: 0,
        successful_orders: 0,
        refunded_orders: 0,
        total_revenue_ht: 0,
        total_revenue_ttc: 0,
        total_discount: 0,
        unique_products: new Set(),
        subscriber_orders: 0,
        non_subscriber_orders: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    
    acc[key].total_orders++;
    if (order.status === 'completed') {
      acc[key].successful_orders++;
      acc[key].total_revenue_ttc += order.price_ttc || 0;
      acc[key].total_discount += order.discount_amount || 0;
    }
    if (order.status === 'refunded') {
      acc[key].refunded_orders++;
    }
    if (order.product_name) {
      acc[key].unique_products.add(order.product_name);
    }
    
    return acc;
  }, {} as Record<string, any>);
  
  // Convertir pour insertion
  const statsToInsert = Object.values(statsByVenue).map(stat => ({
    ...stat,
    unique_products: stat.unique_products.size
  }));
  
  if (statsToInsert.length > 0) {
    const { error } = await supabase.from('daily_stats').insert(statsToInsert);
    if (error) {
      console.error('❌ Erreur mise à jour daily_stats:', error);
    } else {
      console.log(`✅ ${statsToInsert.length} stats journalières mises à jour`);
    }
  }
}

// Lancer la synchronisation
syncVendlive()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  });