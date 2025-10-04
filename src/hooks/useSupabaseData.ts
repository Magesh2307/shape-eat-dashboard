// src/hooks/useSupabaseData.ts
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

export function useSalesData() {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // ✅ DATES DE FILTRE
      const startDate = new Date(Date.UTC(2024, 0, 1));
      const endDate = new Date(); // Aujourd'hui
      
      console.log(`🔍 Chargement des données de ${startDate.toISOString()} à ${endDate.toISOString()}`);

      // ✅ REQUÊTE AVEC FILTRES POUR EXCLURE LES DONNÉES INVALIDES
      const { data: allData, error } = await supabase
        .from('orders')
        .select(`
          vendlive_id,
          created_at,
          machine_id,
          machine_name,
          venue_id,
          venue_name,
          transaction_id,
          product_name,
          product_category,
          quantity,
          price_ttc,
          price_ht,
          discount_amount,
          status,
          payment_method,
          promo_code,
          client_email,
          raw_data
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .neq('product_name', 'Unknown') // ✅ EXCLURE LES PRODUITS INCONNUS
        .not('product_name', 'is', null) // ✅ EXCLURE LES PRODUITS NULL
        .neq('status', 'refunded') // ✅ EXCLURE LES REMBOURSÉS (optionnel)
        .order('created_at', { ascending: false })
        .range(0, 9999); // Force jusqu'à 10,000 résultats

      if (error) {
        console.error('❌ Erreur Supabase:', error);
        setIsLoading(false);
        return;
      }

      // ✅ DEBUG : VOIR LES DONNÉES RÉCUPÉRÉES
      console.log(`🔍 Données Supabase reçues:`, allData?.slice(0, 3)); // 3 premiers éléments
      console.log(`✅ Total lignes chargées: ${allData?.length || 0} orders valides`);

      if (!allData || allData.length === 0) {
        console.log(`⚠️ Aucune donnée trouvée`);
        setSales([]);
        setIsLoading(false);
        return;
      }

      // ✅ GROUPER PAR TRANSACTION POUR CRÉER LES VENTES
      const salesMap = new Map();

      for (const order of allData) {
        // Utiliser le premier segment de vendlive_id comme transaction ID
        const transactionId = order.vendlive_id.split('_')[0];

        if (!salesMap.has(transactionId)) {
          salesMap.set(transactionId, {
            id: transactionId,
            vendlive_id: order.vendlive_id,
            createdAt: order.created_at,
            total: 0, // Sera calculé ci-dessous
            discountTotal: 0, // Sera calculé ci-dessous
            charged: order.status === 'completed' ? 'Yes' : 'No',
            paymentStatusDisplay: order.status,
            machine: {
              id: order.machine_id,
              friendlyName: order.machine_name
            },
            location: {
              venue: {
                id: order.venue_id,
                name: order.venue_name
              }
            },
            customer: {
              email: order.client_email
            },
            voucherCode: order.promo_code,
            productSales: []
          });
        }

        const sale = salesMap.get(transactionId);

        // Ajouter le produit à la vente
        sale.productSales.push({
          productName: order.product_name,
          category: order.product_category,
          quantity: order.quantity || 1,
          price: parseFloat(order.price_ttc) || 0,
          netAmount: parseFloat(order.price_ht) || 0,
          discountValue: parseFloat(order.discount_amount) || 0,
          isRefunded: order.status === 'refunded',
          vendStatus: order.status
        });

        // Calculer les totaux pour cette vente
        sale.total += parseFloat(order.price_ttc) || 0;
        sale.discountTotal += parseFloat(order.discount_amount) || 0;
      }

      const finalSales = Array.from(salesMap.values());
      
      console.log(`📊 Ventes uniques après grouping: ${finalSales.length}`);
      console.log(`🔍 Exemple de vente groupée:`, finalSales[0]);
      
      setSales(finalSales);
      setIsLoading(false);
    }

    loadData();
  }, []);

  return { sales, isLoading };
}

// ✅ HOOK POUR LES DONNÉES DE STOCK (optionnel)
export function useStockData() {
  const [stock, setStock] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStockData() {
      const { data, error } = await supabase
        .from('stock_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, 9999);

      if (error) {
        console.error('❌ Erreur stock:', error);
        setIsLoading(false);
        return;
      }

      console.log(`✅ Stock chargé: ${data?.length || 0} items`);
      setStock(data || []);
      setIsLoading(false);
    }

    loadStockData();
  }, []);

  return { stock, isLoading };
}

// ✅ HOOK AVEC FILTRES PERSONNALISÉS
export function useSalesDataWithFilters(filters = {}) {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFilteredData() {
      let query = supabase
        .from('orders')
        .select('*')
        .neq('product_name', 'Unknown')
        .not('product_name', 'is', null);

      // Appliquer les filtres dynamiquement
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }
      if (filters.machineId) {
        query = query.eq('machine_id', filters.machineId);
      }
      if (filters.venueId) {
        query = query.eq('venue_id', filters.venueId);
      }
      if (filters.category) {
        query = query.eq('product_category', filters.category);
      }
      if (filters.excludeRefunded) {
        query = query.neq('status', 'refunded');
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(0, 9999);

      if (error) {
        console.error('❌ Erreur filtres:', error);
        setIsLoading(false);
        return;
      }

      console.log(`✅ Données filtrées: ${data?.length || 0} orders`);
      setSales(data || []);
      setIsLoading(false);
    }

    loadFilteredData();
  }, [filters]);

  return { sales, isLoading };
}