// scripts/sync-vendlive.ts
import { createClient } from '@supabase/supabase-js';

// Debug pour voir ce qui est reçu
console.log('🔍 Variables d\'environnement:');
console.log('SUPABASE_URL présent:', !!process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_KEY présent:', !!process.env.SUPABASE_SERVICE_KEY);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NmYmZ0cG9pZ3kiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzUxNDUyNzcwLCJleHAiOjIwNjcwMjg3NzB9.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q';

// Créer le client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// Fonction principale de synchronisation
async function syncVendlive() {
  console.log('🚀 Synchronisation VendLive → Supabase...');
  
  try {
    // 1. Récupérer la dernière date de sync
    const { data: lastSync } = await supabase
      .from('orders')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastSyncDate = lastSync?.[0]?.created_at 
      ? new Date(lastSync[0].created_at)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours par défaut
    
    console.log(`📅 Dernière sync: ${lastSyncDate.toISOString()}`);
    
    // 2. Récupérer les ventes depuis VendLive
    let allSales: any[] = [];
    let nextUrl: string | null = `${API_BASE}/api/2.0/order-sales/?pageSize=500&orderBy=Created%20at`;
    let pageCount = 0;
    
    while (nextUrl) {
      pageCount++;
      console.log(`📄 Chargement page ${pageCount}...`);
      
      const response = await fetch(nextUrl, { headers });
      
      if (!response.ok) {
        throw new Error(`Erreur API: ${response.status}`);
      }
      
      const data = await response.json();
      const pageSales = data.results || [];
      
      // Filtrer uniquement les nouvelles ventes
      const newSales = pageSales.filter((sale: any) => 
        new Date(sale.createdAt) > lastSyncDate
      );
      
      allSales = [...allSales, ...newSales];
      
      // Si on a assez de nouvelles ventes ou plus de pages avec des nouvelles ventes
      if (newSales.length < pageSales.length || !data.next) {
        break;
      }
      
      nextUrl = data.next;
    }
    
    console.log(`📦 ${allSales.length} nouvelles ventes trouvées`);
    
    if (allSales.length === 0) {
      console.log('✅ Aucune nouvelle vente à synchroniser');
      
      // Log même si pas de nouvelles ventes
      await supabase
        .from('sync_logs')
        .insert({
          sync_type: 'vendlive_orders',
          records_synced: 0,
          status: 'completed',
          completed_at: new Date().toISOString()
        });
      
      return;
    }
    
    // 3. Transformer et insérer dans Supabase
    const ordersToInsert = [];
    
    for (const sale of allSales) {
      // Extraire les produits
      const products = sale.productSales || sale.products || [];
      
      // Si pas de produits, créer une ligne générique
      if (products.length === 0) {
        ordersToInsert.push({
          vendlive_id: sale.id,
          machine_id: sale.machine?.id || 0,
          machine_name: sale.machine?.friendlyName || 'Unknown',
          venue_id: sale.location?.venue?.id || null,
          venue_name: sale.location?.venue?.name || 'Unknown',
          product_name: 'Vente directe',
          product_category: 'Non catégorisé',
          quantity: 1,
          price_ttc: parseFloat(sale.total || sale.totalCharged || '0'),
          status: sale.charged === 'Yes' ? 'completed' : 'refunded',
          created_at: sale.createdAt,
          client_email: sale.customerEmail || sale.customer?.email || null,
          promo_code: sale.promoCode || null,
          discount_amount: parseFloat(sale.discountAmount || '0')
        });
      } else {
        // Une ligne par produit
        for (const product of products) {
          // Déterminer la catégorie
          let categoryName = 'Non catégorisé';
          if (typeof product.category === 'string') {
            categoryName = product.category;
          } else if (product.category?.name) {
            categoryName = product.category.name;
          } else if (product.productCategory) {
            categoryName = typeof product.productCategory === 'string' 
              ? product.productCategory 
              : product.productCategory.name || 'Non catégorisé';
          }
          
          ordersToInsert.push({
            vendlive_id: `${sale.id}_${product.productName || product.name}`,
            machine_id: sale.machine?.id || 0,
            machine_name: sale.machine?.friendlyName || 'Unknown',
            venue_id: sale.location?.venue?.id || null,
            venue_name: sale.location?.venue?.name || 'Unknown',
            product_name: product.productName || product.name || 'Unknown',
            product_category: categoryName,
            quantity: parseInt(product.quantity || '1'),
            price_ttc: parseFloat(product.price || product.unitPrice || '0'),
            status: sale.charged === 'Yes' ? 'completed' : 'refunded',
            created_at: sale.createdAt,
            client_email: sale.customerEmail || sale.customer?.email || null,
            promo_code: sale.promoCode || null,
            discount_amount: parseFloat(sale.discountAmount || '0')
          });
        }
      }
    }
    
    // 4. Insérer par batch
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    for (let i = 0; i < ordersToInsert.length; i += 100) {
      const batch = ordersToInsert.slice(i, i + 100);
      
      const { error } = await supabase
        .from('orders')
        .upsert(batch, {
          onConflict: 'vendlive_id',
          ignoreDuplicates: true
        });
      
      if (error) {
        console.error('❌ Erreur insertion:', error);
      } else {
        console.log(`✅ Batch ${Math.floor(i/100) + 1}: ${batch.length} lignes insérées`);
      }
    }
    
    // 5. Log de synchronisation
    await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'vendlive_orders',
        records_synced: ordersToInsert.length,
        status: 'completed',
        completed_at: new Date().toISOString()
      });
    
    console.log('🎉 Synchronisation terminée avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur sync:', error);
    
    // Log d'erreur
    await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'vendlive_orders',
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      });
  }
}

// Lancer directement
syncVendlive()
  .then(() => {
    console.log('✅ Script terminé');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
  });