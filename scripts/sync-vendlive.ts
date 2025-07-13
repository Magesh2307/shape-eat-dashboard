// scripts/sync-vendlive.ts - Version avec synchronisation historique complète
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

// ⚠️ PARAMÈTRES DE SYNCHRONISATION - OPTIMISÉS POUR RÉCUPÉRER TOUT
const SYNC_MODE = process.env.SYNC_MODE || 'full'; // 'full' pour tout récupérer
const SYNC_START_DATE = process.env.SYNC_START_DATE || '2023-01-01'; // Date de début pour sync complète
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '2000'); // Limite de pages à récupérer (augmentée)
const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || '100'); // Taille de page (augmentée)

// Traitement par batch avec la logique VendLive correcte
async function processBatch(sales: any[]): Promise<any[]> {
  return sales.map(sale => {
    const products = sale.productSales || [];
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
        price_ht: 0,
        price_ttc: saleTotalTTC,
        status: sale.charged === 'Yes' ? 'completed' : 'failed',
        payment_method: sale.paymentMethod || null,
        client_type: sale.customerType || null,
        client_email: sale.customerEmail || null,
        discount_amount: saleDiscountTTC,
        promo_code: sale.voucherCode || null,
        created_at: sale.createdAt,
        synced_at: new Date().toISOString(),
        raw_data: null
      }];
    }
    
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

// SYNC PRINCIPALE - OPTIMISÉE POUR RÉCUPÉRER TOUT
async function syncVendlive() {
  const startTime = Date.now();
  console.log('🚀 Synchronisation VendLive → Supabase...');
  console.log(`📋 Mode: ${SYNC_MODE}`);
  console.log(`📄 Taille de page: ${PAGE_SIZE}`);
  console.log(`📊 Limite de pages: ${MAX_PAGES}`);
  
  try {
    // 1. Déterminer la date de début
    let lastSyncDate: Date;
    
    if (SYNC_MODE === 'full') {
      // Mode full : prendre la date configurée
      lastSyncDate = new Date(SYNC_START_DATE);
      console.log(`📅 Synchronisation COMPLÈTE depuis: ${lastSyncDate.toISOString()}`);
    } else {
      // Mode incrémental : récupérer la dernière sync
      const { data: lastSync } = await supabase
        .from('orders')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (lastSync && lastSync.length > 0) {
        lastSyncDate = new Date(lastSync[0].created_at);
        // Reculer d'un jour pour être sûr de ne rien rater
        lastSyncDate.setDate(lastSyncDate.getDate() - 1);
      } else {
        // Pas de données, commencer depuis le début configuré
        lastSyncDate = new Date(SYNC_START_DATE);
      }
      console.log(`📅 Synchronisation incrémentale depuis: ${lastSyncDate.toISOString()}`);
    }
    
    // 2. Récupérer TOUTES les ventes depuis cette date
    let allSales: any[] = [];
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?accountId=295&pageSize=${PAGE_SIZE}&ordering=-createdAt`;
    let pageCount = 0;
    let oldestDateFound = new Date();
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    console.log(`🔄 Début de la récupération des données...`);
    
    while (nextUrl && pageCount < MAX_PAGES) {
      pageCount++;
      console.log(`📄 Chargement page ${pageCount}/${MAX_PAGES}... (${allSales.length} ventes récupérées)`);
      
      // Pause progressive pour éviter les timeouts
      if (pageCount > 1) {
        const pauseTime = Math.min(pageCount * 100, 3000); // Maximum 3 secondes
        await new Promise(resolve => setTimeout(resolve, pauseTime));
      }
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 secondes timeout
        
        const response = await fetch(nextUrl, { 
          headers,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          if (response.status === 429) {
            console.log('⏳ Rate limit atteint, pause de 15 secondes...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            pageCount--; // Ne pas compter cette tentative
            continue;
          }
          throw new Error(`Erreur API: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const pageSales = data.results || [];
        
        // Reset compteur d'erreurs en cas de succès
        consecutiveErrors = 0;
        
        // ✅ Log plus détaillé
        if (pageSales.length > 0) {
          const oldestInPage = new Date(pageSales[pageSales.length - 1].createdAt);
          const newestInPage = new Date(pageSales[0].createdAt);
          
          console.log(`  📊 Page ${pageCount}: ${pageSales.length} ventes`);
          console.log(`  📅 Période: ${oldestInPage.toISOString().split('T')[0]} → ${newestInPage.toISOString().split('T')[0]}`);
          
          if (oldestInPage < oldestDateFound) {
            oldestDateFound = oldestInPage;
          }
        } else {
          console.log(`  📋 Page ${pageCount}: vide, arrêt de la récupération`);
          break;
        }
        
        // Debug : voir la structure d'un productSale sur la première page
        if (pageCount === 1 && pageSales.length > 0 && pageSales[0].productSales?.length > 0) {
          console.log('📋 Structure d\'un productSale:');
          console.log(JSON.stringify(pageSales[0].productSales[0], null, 2));
        }
        
        // ✅ En mode FULL, prendre TOUTES les ventes sans filtrage par date
        if (SYNC_MODE === 'full') {
          allSales = [...allSales, ...pageSales];
          console.log(`  ✅ Mode FULL: ${pageSales.length} ventes ajoutées (Total: ${allSales.length})`);
        } else {
          // Mode incrémental : filtrer par date
          const newSales = pageSales.filter((sale: any) => 
            new Date(sale.createdAt) > lastSyncDate
          );
          allSales = [...allSales, ...newSales];
          console.log(`  ✅ Mode INCRÉMENTAL: ${newSales.length}/${pageSales.length} ventes nouvelles (Total: ${allSales.length})`);
          
          // Si on a atteint des ventes plus anciennes que notre cible, on peut arrêter
          if (oldestDateFound < lastSyncDate && newSales.length === 0) {
            console.log('✅ Toutes les nouvelles ventes récupérées');
            break;
          }
        }
        
        nextUrl = data.next;
        
        // ✅ Log de progression plus fréquent
        if (allSales.length > 0 && allSales.length % 1000 === 0) {
          console.log(`🚀 PROGRESSION: ${allSales.length} ventes récupérées...`);
          console.log(`📊 Estimation: ${Math.round((pageCount / MAX_PAGES) * 100)}% des pages possibles traitées`);
        }
        
      } catch (fetchError) {
        consecutiveErrors++;
        console.error(`❌ Erreur page ${pageCount} (${consecutiveErrors}/${maxConsecutiveErrors}):`, fetchError.message);
        
        if (fetchError.name === 'AbortError') {
          console.log('⏳ Timeout de 45s atteint, pause de 10 secondes...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        } else if (fetchError.code === 'ECONNRESET' || fetchError.code === 'ENOTFOUND') {
          console.log('🌐 Erreur réseau, pause de 5 secondes puis reprise...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`❌ Trop d'erreurs consécutives (${consecutiveErrors}), arrêt`);
          if (allSales.length === 0) {
            throw new Error('Impossible de récupérer des données');
          }
          console.warn(`⚠️ Continuation avec ${allSales.length} ventes récupérées`);
          break;
        }
        
        pageCount--; // Ne pas compter cette tentative ratée
        continue;
      }
    }
    
    // ✅ Log final plus détaillé
    console.log(`\n🎯 RÉSULTAT DE LA RÉCUPÉRATION:`);
    console.log(`  📦 ${allSales.length} ventes récupérées au total`);
    console.log(`  📄 ${pageCount} pages traitées sur ${MAX_PAGES} maximum`);
    if (allSales.length > 0) {
      console.log(`  📅 Période couverte: ${oldestDateFound.toISOString().split('T')[0]} → ${allSales[0]?.createdAt?.split('T')[0] || 'N/A'}`);
      
      // Stats par venue
      const venueStats = allSales.reduce((acc, sale) => {
        const venue = sale.location?.venue?.name || 'Unknown';
        acc[venue] = (acc[venue] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`  🏢 Venues trouvées: ${Object.keys(venueStats).length}`);
      const topVenues = Object.entries(venueStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
      topVenues.forEach(([venue, count]) => {
        console.log(`    - ${venue}: ${count} ventes`);
      });
    }
    
    if (allSales.length === 0) {
      console.log('⚠️ AUCUNE vente récupérée !');
      await supabase.from('sync_logs').insert({
        sync_type: 'vendlive_orders',
        records_synced: 0,
        status: 'completed',
        completed_at: new Date().toISOString(),
        started_at: new Date(startTime).toISOString(),
        last_vendlive_id: null,
        metadata: {
          mode: SYNC_MODE,
          lastSyncDate: lastSyncDate.toISOString(),
          pagesProcessed: pageCount,
          message: 'Aucune nouvelle vente trouvée'
        }
      });
      console.log(`⏱️ Durée: ${(Date.now() - startTime) / 1000}s`);
      return;
    }
    
    // 3. Traiter TOUTES les ventes avec la logique correcte
    console.log(`\n💾 TRAITEMENT DES DONNÉES...`);
    const ordersToInsert = await processBatch(allSales);
    console.log(`✅ ${ordersToInsert.length} lignes prêtes pour insertion`);
    
    // 4. Debug : afficher un exemple
    if (ordersToInsert.length > 0) {
      console.log('\n📋 Exemple de données à insérer:');
      const example = ordersToInsert.find(o => o.discount_amount > 0) || ordersToInsert[0];
      console.log(JSON.stringify(example, null, 2));
    }
    
    // 5. Calculer les totaux pour vérification
    console.log(`\n📊 ANALYSE DES DONNÉES...`);
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
    Object.entries(totalByVenue)
      .sort(([,a], [,b]) => b.revenue_ttc - a.revenue_ttc)
      .slice(0, 10)
      .forEach(([venue, data]) => {
        console.log(`  - ${venue}:`);
        console.log(`    Commandes: ${data.count}`);
        console.log(`    CA TTC: ${data.revenue_ttc.toFixed(2)}€`);
        console.log(`    CA HT: ${data.revenue_ht.toFixed(2)}€`);
        console.log(`    Discounts: ${data.discount.toFixed(2)}€`);
      });
    
    // 6. Insertion par batch avec upsert
    console.log(`\n📤 INSERTION EN BASE...`);
    const batchSize = 500;
    let totalInserted = 0;
    
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      const batchNumber = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(ordersToInsert.length/batchSize);
      
      console.log(`📤 Insertion batch ${batchNumber}/${totalBatches}: ${batch.length} lignes...`);
      
      const { error: insertError } = await supabase
        .from('orders')
        .upsert(batch, {
          onConflict: 'vendlive_id',
          ignoreDuplicates: false
        });
      
      if (insertError) {
        console.error('❌ Erreur insertion batch:', insertError);
        console.error('Détails:', JSON.stringify(insertError, null, 2));
        throw insertError;
      }
      
      totalInserted += batch.length;
      const progress = Math.round((totalInserted / ordersToInsert.length) * 100);
      console.log(`✅ Batch ${batchNumber}: ${batch.length} lignes insérées (${progress}% - Total: ${totalInserted})`);
      
      // Petite pause entre les batch pour ne pas surcharger
      if (batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 7. Mise à jour de la table sales
    try {
      console.log('\n📊 Mise à jour de la table sales...');
      await updateSalesTable(allSales);
    } catch (err) {
      console.warn('⚠️ Mise à jour de la table sales échouée:', err.message);
    }
    
    // 8. Log final
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      records_synced: totalInserted,
      status: 'completed',
      completed_at: new Date().toISOString(),
      started_at: new Date(startTime).toISOString(),
      last_vendlive_id: allSales[0]?.id || null,
      metadata: {
        mode: SYNC_MODE,
        lastSyncDate: lastSyncDate.toISOString(),
        pagesProcessed: pageCount,
        oldestDateFound: oldestDateFound.toISOString(),
        newestDateFound: allSales[0]?.createdAt || null,
        salesRetrieved: allSales.length,
        ordersInserted: totalInserted,
        venuesFound: Object.keys(totalByVenue).length
      }
    });
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`\n🎉 SYNCHRONISATION TERMINÉE !`);
    console.log(`⏱️ Durée: ${Math.round(duration)}s (${Math.round(duration/60)}min)`);
    console.log(`📊 ${allSales.length} ventes → ${ordersToInsert.length} lignes → ${totalInserted} insérées`);
    console.log(`🏢 ${Object.keys(totalByVenue).length} venues avec des ventes`);
    console.log(`💰 CA total: ${Object.values(totalByVenue).reduce((sum, v) => sum + v.revenue_ttc, 0).toFixed(2)}€`);
    
    // 9. Mettre à jour les stats journalières pour toutes les dates affectées
    if (SYNC_MODE === 'full') {
      try {
        console.log('\n📊 Mise à jour complète des stats journalières...');
        await updateAllDailyStats();
      } catch (err) {
        console.warn('⚠️ Mise à jour des stats journalières échouée:', err.message);
      }
    } else {
      try {
        await updateDailyStats();
      } catch (err) {
        console.warn('⚠️ Mise à jour des stats journalières échouée:', err.message);
      }
    }
    
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error);
    await supabase.from('sync_logs').insert({
      sync_type: 'vendlive_orders',
      status: 'failed',
      error_message: error.message,
      completed_at: new Date().toISOString(),
      started_at: new Date(startTime).toISOString(),
      records_synced: 0,
      last_vendlive_id: null,
      metadata: {
        mode: SYNC_MODE,
        error: error.toString(),
        stack: error.stack
      }
    });
    throw error;
  }
}

// Mise à jour de la table sales avec la logique VendLive correcte
async function updateSalesTable(vendliveSales: any[]) {
  console.log('📊 Mise à jour de la table sales...');
  
  const salesToUpsert = vendliveSales.map(sale => {
    // ✅ Calculer le total depuis les productSales avec totalPaid
    let totalTTC = 0;
    let totalHT = 0;
    let discountTTC = 0;
    let hasSuccessfulProduct = false;
    
    // Parcourir tous les produits pour calculer le total
    if (sale.productSales && sale.productSales.length > 0) {
      sale.productSales.forEach((product: any) => {
        if (product.vendStatus === 'Success' && !product.isRefunded) {
          hasSuccessfulProduct = true;
          totalTTC += parseFloat(product.totalPaid || '0');
          totalHT += parseFloat(product.netAmount || '0');
          discountTTC += parseFloat(product.discountValue || '0');
        }
        // Si vendStatus = 'Failure', on ne compte pas ce produit
      });
    } else {
      // Pas de productSales, utiliser les valeurs globales si Success
      if (sale.charged === 'Yes') {
        hasSuccessfulProduct = true;
        totalTTC = parseFloat(sale.totalCharged || '0');
        totalHT = totalTTC / 1.055;
        discountTTC = parseFloat(sale.discountTotal || '0');
      }
    }
    
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
      total_ht: totalHT,
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
  let totalSalesInserted = 0;
  
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
    
    totalSalesInserted += batch.length;
    console.log(`✅ Sales batch ${Math.floor(i/batchSize) + 1}: ${batch.length} ventes (Total: ${totalSalesInserted})`);
  }
  
  console.log(`✅ ${salesToUpsert.length} ventes mises à jour dans la table sales`);
}

// Mettre à jour les stats journalières (aujourd'hui seulement)
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

// Nouvelle fonction pour mettre à jour TOUTES les stats journalières
async function updateAllDailyStats() {
  console.log('📊 Recalcul complet des stats journalières...');
  
  // Effacer toutes les stats existantes
  await supabase.from('daily_stats').delete().neq('date', '1900-01-01'); // Trick pour tout supprimer
  
  // Récupérer toutes les dates distinctes
  const { data: dates } = await supabase
    .from('sales')
    .select('created_at')
    .order('created_at', { ascending: true });
  
  if (!dates || dates.length === 0) return;
  
  // Extraire les dates uniques
  const uniqueDates = [...new Set(dates.map(d => d.created_at.split('T')[0]))];
  console.log(`📅 ${uniqueDates.length} jours à traiter`);
  
  let processedDates = 0;
  
  // Traiter par batch de dates
  for (const date of uniqueDates) {
    const { data: salesData } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', date + 'T00:00:00')
      .lt('created_at', date + 'T23:59:59');
    
    if (salesData && salesData.length > 0) {
      // Même logique que updateDailyStats mais pour une date spécifique
      const statsByVenue = salesData.reduce((acc, sale) => {
        const key = `${sale.venue_id}_${sale.venue_name}`;
        if (!acc[key]) {
          acc[key] = {
            date: date,
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
        if (!error) {
          processedDates++;
          if (processedDates % 10 === 0 || processedDates === uniqueDates.length) {
            console.log(`✅ ${processedDates}/${uniqueDates.length} jours traités`);
          }
        }
      }
    }
  }
  
  console.log(`✅ Recalcul des stats journalières terminé : ${processedDates}/${uniqueDates.length} jours`);
}

// Lancer la synchronisation
console.log('🚀 Démarrage du script de synchronisation VendLive...');
console.log(`📅 Date: ${new Date().toISOString()}`);
console.log(`🔧 Configuration:`);
console.log(`  - Mode: ${SYNC_MODE}`);
console.log(`  - Date de début: ${SYNC_START_DATE}`);
console.log(`  - Pages max: ${MAX_PAGES}`);
console.log(`  - Taille de page: ${PAGE_SIZE}`);

syncVendlive()
  .then(() => {
    console.log('\n✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Erreur fatale:', err);
    console.error('Stack:', err.stack);
    process.exit(1);
  });