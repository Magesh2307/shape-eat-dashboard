// scripts/sync-vendlive.ts - Version corrigée pour CA exact comme VendLive
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NmYmZ0cG9pZ3kiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzUxNDUyNzcwLCJleHAiOjIwNjcwMjg3NzB9.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// 🚀 OPTIMISATION: Traitement par batch - TOUTES les ventes
async function processBatch(sales: any[]): Promise<any[]> {
  return sales.map(sale => {
    const products = sale.productSales || [];
    const saleAmount = parseFloat(sale.total || '0');
    const discountAmount = parseFloat(sale.discountTotal || '0');
    
    if (products.length === 0) {
      // Si pas de produits, créer une ligne générique
      return [{
        vendlive_id: sale.id,
        machine_id: sale.machine?.id || 0,
        machine_name: sale.machine?.friendlyName || 'Unknown',
        venue_id: sale.location?.venue?.id || null,
        venue_name: sale.location?.venue?.name || 'Unknown',
        product_name: 'Vente directe',
        product_category: 'Non catégorisé',
        quantity: 1,
        price_ttc: saleAmount,
        status: sale.charged === 'Yes' ? 'completed' : 'failed',
        created_at: sale.createdAt,
        client_email: sale.customerEmail || null,
        promo_code: sale.voucherCode || null,
        discount_amount: discountAmount
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
      product_name: product.productName || product.name || 'Unknown',
      product_category: product.category?.name || product.productCategory?.name || 'Non catégorisé',
      quantity: parseInt(product.quantity || '1'),
      price_ttc: parseFloat(product.price || product.unitPrice || '0') * ratio,
      status: product.vendStatus === 'Success' && !product.isRefunded ? 'completed' : 'failed',
      created_at: sale.createdAt,
      client_email: sale.customerEmail || null,
      promo_code: sale.voucherCode || null,
      discount_amount: parseFloat(product.discountValue || '0') * ratio
    }));
  }).flat();
}

// 🚀 SYNC RAPIDE PRINCIPALE
async function syncVendliveFast() {
  const startTime = Date.now();
  console.log('🚀 Synchronisation COMPLÈTE VendLive → Supabase...');
  
  try {
    // 1. Récupérer la dernière sync
    const { data: lastSync } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastSyncDate = lastSync?.[0]?.created_at 
      ? new Date(lastSync[0].created_at)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours max
    
    console.log(`📅 Dernière sync: ${lastSyncDate.toISOString()}`);
    
    // 2. Récupérer TOUTES les nouvelles ventes (sans filtre)
    let allSales: any[] = [];
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?pageSize=500&orderBy=-created_at`;
    let pageCount = 0;
    
    while (nextUrl && pageCount < 10) { // Limite de sécurité
      pageCount++;
      console.log(`📄 Chargement page ${pageCount}...`);
      
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
      if (allSales.length > 2000) {
        console.log('⚠️ Limite de 2000 ventes atteinte');
        break;
      }
    }
    
    console.log(`📦 ${allSales.length} nouvelles ventes trouvées`);
    
    if (allSales.length === 0) {
      console.log('✅ Aucune nouvelle vente');
      await supabase.from('sync_logs').insert({
        sync_type: 'vendlive_orders',
        records_synced: 0,
        status: 'completed',
        completed_at: new Date().toISOString()
      });
      console.log(`⏱️ Durée: ${(Date.now() - startTime) / 1000}s`);
      return;
    }
    
    // 3. Traiter TOUTES les ventes
    const ordersToInsert = await processBatch(allSales);
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    // 4. Calculer les totaux pour vérification
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
    
    // 5. Insertion par batch
    const batchSize = 500;
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('orders')
        .upsert(batch, {
          onConflict: 'vendlive_id',
          ignoreDuplicates: false // Forcer la mise à jour
        });
      
      if (error) {
        console.error('❌ Erreur insertion batch:', error);
        throw error;
      }
      
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} lignes insérées`);
    }
    
    // 6. Mettre à jour les statistiques agrégées
    await updateDailyStats();
    await updateDashboardSummary();
    
    // 7. Log final
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      records_synced: ordersToInsert.length,
      status: 'completed',
      completed_at: new Date().toISOString()
    });
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`🎉 Sync terminée en ${duration}s !`);
    console.log(`📊 ${allSales.length} ventes → ${ordersToInsert.length} lignes`);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString()
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
    const key = `${order.venue_id}_${order.venue_name}`;
    if (!acc[key]) {
      acc[key] = {
        date: today,
        venue_id: order.venue_id,
        venue_name: order.venue_name,
        machine_id: order.machine_id,
        machine_name: order.machine_name,
        total_orders: 0,
        successful_orders: 0,
        total_revenue_ttc: 0,
        total_discount: 0
      };
    }
    
    acc[key].total_orders++;
    if (order.status === 'completed') {
      acc[key].successful_orders++;
      acc[key].total_revenue_ttc += order.price_ttc || 0;
      acc[key].total_discount += order.discount_amount || 0;
    }
    
    return acc;
  }, {} as Record<string, any>);
  
  const statsToInsert = Object.values(statsByVenue);
  
  if (statsToInsert.length > 0) {
    await supabase.from('daily_stats').insert(statsToInsert);
    console.log(`✅ ${statsToInsert.length} stats journalières mises à jour`);
  }
}

// Mettre à jour le dashboard summary
async function updateDashboardSummary() {
  console.log('📊 Mise à jour du dashboard summary...');
  
  const { data: summary } = await supabase.rpc('calculate_dashboard_summary');
  
  if (summary) {
    console.log('✅ Dashboard summary mis à jour:', summary);
  }
}

// Lancer la synchronisation
syncVendliveFast()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));