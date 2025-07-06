// scripts/sync-vendlive.ts (corrigé pour CA exact)
import { createClient } from '@supabase/supabase-js';

// Debug détaillé
console.log('🔍 Debug variables d\'environnement:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_URL length:', process.env.SUPABASE_URL?.length);
console.log('SUPABASE_SERVICE_KEY présent:', !!process.env.SUPABASE_SERVICE_KEY);
console.log('SUPABASE_SERVICE_KEY length:', process.env.SUPABASE_SERVICE_KEY?.length);

// Configuration avec validation
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ojphshzuosbfbftpoigy.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NmYmZ0cG9pZ3kiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzUxNDUyNzcwLCJleHAiOjIwNjcwMjg3NzB9.ze3DvmYHGmDlOvBaE-SxCDaQwzAF6YoLsKjKPebXU4Q';

// Validation
if (!SUPABASE_URL || !SUPABASE_URL.startsWith('https://')) {
  console.error('❌ SUPABASE_URL invalide:', SUPABASE_URL);
  process.exit(1);
}

console.log('✅ URL valide:', SUPABASE_URL);

// Créer le client Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const API_BASE = 'https://vendlive.com';
const API_TOKEN = '2b99d02d6886f67b3a42d82c684108d2eda3d2e1';

const headers = {
  'Authorization': `Token ${API_TOKEN}`,
  'Content-Type': 'application/json',
};

// 🎯 NOUVELLE FONCTION: Validation des ventes comme VendLive
function isValidSale(sale: any): boolean {
  // Vérifier qu'il y a au moins un produit vendu avec succès
  const products = sale.productSales || [];
  const hasValidProduct = products.some((product: any) => 
    product.vendStatus === 'Success' && !product.isRefunded
  );
  
  return hasValidProduct && !sale.isRefunded;
}

// 🎯 NOUVELLE FONCTION: Calculer le montant exact comme VendLive
function getValidSaleAmount(sale: any): number {
  // Utiliser le champ "total" qui contient le CA TTC réel
  const total = parseFloat(sale.total || '0');
  
  // Debug pour comprendre la structure
  console.log('🔍 Sale debug:', {
    id: sale.id,
    total: sale.total,
    totalCharged: sale.totalCharged,
    discountTotal: sale.discountTotal,
    charged: sale.charged,
    isRefunded: sale.isRefunded
  });
  
  return total;
}

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
    
    // 🎯 FILTRAGE EXACT comme VendLive
    const validSales = allSales.filter(isValidSale);
    console.log(`✅ ${validSales.length} ventes valides (${allSales.length - validSales.length} filtrées)`);
    
    if (validSales.length === 0) {
      console.log('✅ Aucune nouvelle vente valide à synchroniser');
      
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
    
    for (const sale of validSales) {
      // Extraire les produits
      const products = sale.productSales || sale.products || [];
      
      // 🎯 MONTANT EXACT selon VendLive
      const saleAmount = getValidSaleAmount(sale);
      const discountAmount = parseFloat(sale.discountTotal || '0');
      
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
          price_ttc: saleAmount, // 🎯 MONTANT EXACT
          status: 'completed', // Déjà filtré donc toujours completed
          created_at: sale.createdAt,
          client_email: sale.customerEmail || sale.customer?.email || null,
          promo_code: sale.voucherCode || null,
          discount_amount: discountAmount
        });
      } else {
        // 🎯 CORRECTION IMPORTANTE: Distribuer le montant total proportionnellement
        const validProducts = products.filter((product: any) => 
          product.vendStatus === 'Success' && !product.isRefunded
        );
        
        // Calculer le total des prix des produits valides
        const totalProductPrices = validProducts.reduce((sum: number, product: any) => {
          return sum + parseFloat(product.price || product.unitPrice || '0');
        }, 0);
        
        // Ratio pour ajuster chaque produit
        const ratio = totalProductPrices > 0 ? saleAmount / totalProductPrices : 1;
        
        for (const product of validProducts) {
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
          
          // 🎯 PRIX AJUSTÉ pour correspondre au total exact de VendLive
          const productPrice = parseFloat(product.price || product.unitPrice || '0');
          const adjustedPrice = productPrice * ratio;
          
          ordersToInsert.push({
            vendlive_id: `${sale.id}_${product.productName || product.name}`,
            machine_id: sale.machine?.id || 0,
            machine_name: sale.machine?.friendlyName || 'Unknown',
            venue_id: sale.location?.venue?.id || null,
            venue_name: sale.location?.venue?.name || 'Unknown',
            product_name: product.productName || product.name || 'Unknown',
            product_category: categoryName,
            quantity: parseInt(product.quantity || '1'),
            price_ttc: adjustedPrice, // 🎯 PRIX AJUSTÉ
            status: 'completed', // Déjà filtré donc toujours completed
            created_at: sale.createdAt,
            client_email: sale.customerEmail || sale.customer?.email || null,
            promo_code: sale.voucherCode || null,
            discount_amount: parseFloat(product.discountValue || '0') * ratio // Réduction ajustée
          });
        }
      }
    }
    
    console.log(`💾 Insertion de ${ordersToInsert.length} lignes...`);
    
    // 🎯 DEBUG: Afficher le total qui sera inséré
    const totalAmount = ordersToInsert.reduce((acc, order) => acc + order.price_ttc, 0);
    console.log(`💰 Total CA à insérer: ${totalAmount.toFixed(2)}€`);
    
    // 4. Insérer par batch
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
    console.log(`📊 ${validSales.length} ventes valides → ${ordersToInsert.length} lignes`);
    console.log(`💰 Total synchronisé: ${totalAmount.toFixed(2)}€`);
    
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