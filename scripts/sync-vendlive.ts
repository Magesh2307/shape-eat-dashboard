// scripts/sync-vendlive.ts - Version avec logique VendLive correcte
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmJ0cG9pZ3kiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzUxNDUyNzcwLCJleHAiOjIwNjcwMjg3NzB9.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// Traitement par batch avec la logique VendLive correcte
async function processBatch(sales: any[]): Promise<any[]> {
  return sales.map(sale => {
    const products = sale.productSales || [];
    
    // ✅ Pour la vente globale, utiliser totalCharged comme CA TTC
    const saleTotalTTC = parseFloat(sale.totalCharged || '0');
    const saleDiscountTTC = parseFloat(sale.discountTotal || '0');
    
    if (products.length === 0) {
      return [{
        vendlive_id: String(sale.id),
        machine_id: sale.machine?.id || 0,
        machine_name: sale.machine?.friendlyName || 'Unknown',
        venue_id: sale.location?.venue?.id || null,
        venue_name: sale.location?.venue?.name || 'Unknown',
        transaction_id: sale.transaction?.id ? String(sale.transaction.id) : String(sale.id),
        product_name: 'Vente directe',
        product_category: 'Non catégorisé',
        quantity: 1,
        price_ht: 0, // Pas de détail produit
        price_ttc: saleTotalTTC, // ✅ totalCharged = CA TTC
        status: sale.charged === 'Yes' ? 'completed' : 'failed',
        payment_method: sale.paymentMethod || null,
        client_type: sale.customerType || null,
        client_email: sale.customerEmail || null,
        discount_amount: saleDiscountTTC, // ✅ Discount total TTC
        promo_code: sale.voucherCode || null,
        created_at: sale.createdAt,
        synced_at: new Date().toISOString(),
        raw_data: null
      }];
    }
    
    // Pour chaque produit, utiliser les champs VendLive
// Pour chaque produit, utiliser les champs VendLive
return products.map((product: any) => {
  // ✅ Utiliser les champs VendLive corrects
  const totalPaidTTC = parseFloat(product.totalPaid || '0');
  const discountTTC = parseFloat(product.discountValue || '0');
  const vatAmount = parseFloat(product.vatAmount || '0');
  const netAmountHT = parseFloat(product.netAmount || '0');
  const vatRate = parseFloat(product.vatRate || '5.5');
  
  // ✅ IMPORTANT : Déterminer le statut correct
  let status = 'failed'; // Par défaut
  if (product.vendStatus === 'Success' && !product.isRefunded) {
    status = 'completed';
  } else if (product.isRefunded) {
    status = 'refunded';
  } else if (product.vendStatus === 'Failure' || product.vendStatus === 'Failed') {
    status = 'failed';
  }
  
  return {
    vendlive_id: `${sale.id}_${product.productName || product.name || product.id}`,
    machine_id: sale.machine?.id || 0,
    machine_name: sale.machine?.friendlyName || 'Unknown',
    venue_id: sale.location?.venue?.id || null,
    venue_name: sale.location?.venue?.name || 'Unknown',
    transaction_id: sale.transaction?.id ? String(sale.transaction.id) : String(sale.id),
    product_name: product.productName || product.name || 'Unknown',
    product_category: product.category?.name || product.productCategory?.name || 'Non catégorisé',
    quantity: parseInt(product.quantity || '1'),
    price_ht: netAmountHT,
    price_ttc: totalPaidTTC,
    status: status, // ✅ Statut correctement défini
    payment_method: sale.paymentMethod || null,
    client_type: sale.customerType || null,
    client_email: sale.customerEmail || null,
    discount_amount: discountTTC,
    promo_code: sale.voucherCode || null,
    created_at: sale.createdAt,
    synced_at: new Date().toISOString(),
    raw_data: null
  };
});
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
    
    const lastSyncDate = new Date('2025-01-01');
    
    console.log(`📅 Dernière sync: ${lastSyncDate.toISOString()}`);
    
    // 2. Récupérer TOUTES les nouvelles ventes
    let allSales: any[] = [];
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?accountId=295&pageSize=50`;
    let pageCount = 0;
    
    while (nextUrl && pageCount < 20) {
      pageCount++;
      console.log(`📄 Chargement page ${pageCount}...`);
      
      if (pageCount > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      try {
        const response = await fetch(nextUrl, { headers });
        
        if (!response.ok) {
          throw new Error(`Erreur API: ${response.status}`);
        }
        
        const data = await response.json();
        const pageSales = data.results || [];
        
        // Debug : voir la structure d'un productSale
        if (pageCount === 1 && pageSales.length > 0 && pageSales[0].productSales?.length > 0) {
          console.log('📋 Structure d\'un productSale:');
          console.log(JSON.stringify(pageSales[0].productSales[0], null, 2));
        }
        
        const newSales = pageSales.filter((sale: any) => 
          new Date(sale.createdAt) > lastSyncDate
        );
        
        allSales = [...allSales, ...newSales];
        
        if (newSales.length < pageSales.length) {
          console.log('✅ Trouvé des ventes déjà synchronisées, arrêt');
          break;
        }
        
        nextUrl = data.next;
        
        if (allSales.length > 5000) {
          console.log('⚠️ Limite de 5000 ventes atteinte');
          break;
        }
      } catch (fetchError) {
        if (fetchError.cause?.code === 'ECONNRESET' && pageCount > 1) {
          console.warn(`⚠️ Connexion reset page ${pageCount}, on continue avec les données récupérées`);
          break;
        }
        throw fetchError;
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
    
    // 3. Traiter TOUTES les ventes avec la logique correcte
    const ordersToInsert = await processBatch(allSales);
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    // 4. Debug : afficher un exemple
    if (ordersToInsert.length > 0) {
      console.log('📋 Exemple de données à insérer:');
      const example = ordersToInsert.find(o => o.discount_amount > 0) || ordersToInsert[0];
      console.log(JSON.stringify(example, null, 2));
    }
    
    // 5. Calculer les totaux pour vérification
    const totalByVenue = ordersToInsert.reduce((acc, order) => {
      if (order.status === 'completed') {
        const venue = order.venue_name;
        acc[venue] = acc[venue] || { revenue_ttc: 0, revenue_ht: 0, discount: 0, count: 0 };
        acc[venue].revenue_ttc += order.price_ttc;
        acc[venue].revenue_ht += order.price_ht;
        acc[venue].discount += order.discount_amount;
        acc[venue].count++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    console.log('💰 CA et discounts par venue:');
    Object.entries(totalByVenue).forEach(([venue, data]) => {
      console.log(`  - ${venue}:`);
      console.log(`    Commandes: ${data.count}`);
      console.log(`    CA TTC: ${data.revenue_ttc.toFixed(2)}€`);
      console.log(`    CA HT: ${data.revenue_ht.toFixed(2)}€`);
      console.log(`    Discounts: ${data.discount.toFixed(2)}€`);
    });
    
    // 6. Insertion par batch
    const batchSize = 500;
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      
      //const batchFiltered = batch.filter(row => row.status !== 'failed');
      //const excluded = batch.length - batchFiltered.length;
      //
      //if (excluded > 0) {
      //console.log(`⚠️ Exclusion de ${excluded} lignes avec status 'failed'`);
      //}
	  // Utiliser directement batch au lieu de batchFiltered
const { error } = await supabase
  .from('orders')
  .upsert(batch, {  // ✅ batch au lieu de batchFiltered
    onConflict: 'vendlive_id',
    ignoreDuplicates: false
  });
      
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
    
    // 7. Mise à jour de la table sales
    try {
      await updateSalesTable(allSales);
    } catch (err) {
      console.warn('⚠️ Mise à jour de la table sales échouée:', err.message);
    }
    
    // 8. Log final
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
    
    // 9. Mettre à jour les stats journalières
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

// Mise à jour de la table sales avec la logique correcte
async function updateSalesTable(vendliveSales: any[]) {
  console.log('📊 Mise à jour de la table sales...');
  
  const salesToUpsert = vendliveSales.map(sale => {
    // ✅ Calculer le total depuis les productSales avec totalPaid
    let totalTTC = 0;
    let discountTTC = 0;
    let hasSuccessfulProduct = false;
    
    // Parcourir tous les produits pour calculer le total
    if (sale.productSales && sale.productSales.length > 0) {
      sale.productSales.forEach((product: any) => {
        if (product.vendStatus === 'Success' && !product.isRefunded) {
          hasSuccessfulProduct = true;
          totalTTC += parseFloat(product.totalPaid || '0'); // ✅ Utiliser totalPaid
          discountTTC += parseFloat(product.discountValue || '0');
        }
        // Si vendStatus = 'Failure', on ne compte pas ce produit
      });
    } else {
      // Pas de productSales, utiliser les valeurs globales si Success
      if (sale.charged === 'Yes') {
        hasSuccessfulProduct = true;
        totalTTC = parseFloat(sale.totalCharged || '0'); // Fallback
      }
    }
    
    const totalHT = totalTTC / 1.055; // TVA 5.5%
    
    // Déterminer le statut global
    let status = 'failed';
    if (hasSuccessfulProduct) {
      status = 'completed';
    } else if (sale.productSales?.every((ps: any) => ps.isRefunded)) {
      status = 'refunded';
    }
    
    return {
      vendlive_id: String(sale.id),
      transaction_id: sale.transaction?.id ? String(sale.transaction.id) : String(sale.id),
      venue_id: sale.location?.venue?.id || null,
      venue_name: sale.location?.venue?.name || 'Unknown',
      machine_id: sale.machine?.id || 0,
      machine_name: sale.machine?.friendlyName || 'Unknown',
      customer_email: sale.customerEmail || sale.customer?.email || null,
      promo_code: sale.voucherCode || null,
      total_ttc: totalTTC, // ✅ Somme des totalPaid avec vendStatus Success
      total_ht: totalHT.toFixed(2),
      discount_amount: discountTTC,
      nb_products: sale.productSales?.length || 1,
      status: status,
      payment_status: sale.paymentStatusDisplay || sale.paymentStatus,
      created_at: sale.createdAt,
      updated_at: new Date().toISOString()
    };
  });
  
  // Insérer par batch
  const batchSize = 500;
  for (let i = 0; i < salesToUpsert.length; i += batchSize) {
    const batch = salesToUpsert.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('sales')
      .upsert(batch, {
        onConflict: 'vendlive_id',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error('❌ Erreur mise à jour sales:', error);
      throw error;
    }
  }
  
  console.log(`✅ ${salesToUpsert.length} ventes mises à jour dans la table sales`);
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
  
  // Utiliser la table sales
  const { data: salesData } = await supabase
    .from('sales')
    .select('*')
    .gte('created_at', today + 'T00:00:00')
    .lt('created_at', today + 'T23:59:59');
  
  if (salesData && salesData.length > 0) {
    // Grouper par venue depuis sales
    const statsByVenue = salesData.reduce((acc, sale) => {
      const key = `${sale.venue_id}_${sale.venue_name}`;
      if (!acc[key]) {
        acc[key] = {
          date: today,
          venue_id: sale.venue_id,
          venue_name: sale.venue_name,
          machine_id: sale.machine_id || 0,
          machine_name: sale.machine_name,
          total_orders: 0,
          successful_orders: 0,
          refunded_orders: 0,
          total_revenue_ht: 0,
          total_revenue_ttc: 0,
          total_discount: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      
      // Ne pas compter les refunded dans total_orders
      if (sale.status !== 'refunded') {
        acc[key].total_orders++;
      }
      if (sale.status === 'completed') {
        acc[key].successful_orders++;
        acc[key].total_revenue_ttc += parseFloat(sale.total_ttc) || 0;
        acc[key].total_revenue_ht += parseFloat(sale.total_ht) || 0;
        acc[key].total_discount += parseFloat(sale.discount_amount) || 0;
      }
      if (sale.status === 'refunded') {
        acc[key].refunded_orders++;
      }
      
      return acc;
    }, {} as Record<string, any>);
    
    const statsToInsert = Object.values(statsByVenue);
    
    if (statsToInsert.length > 0) {
      const { error } = await supabase.from('daily_stats').insert(statsToInsert);
      if (error) {
        console.error('❌ Erreur mise à jour daily_stats:', error);
      } else {
        console.log(`✅ ${statsToInsert.length} stats journalières mises à jour`);
      }
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