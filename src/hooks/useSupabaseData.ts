// src/hooks/useSupabaseData.ts
import { createClient } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useSalesData() {
  const [sales, setSales] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    async function loadData() {
      // Charger les 30 derniers jours
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        // Grouper par transaction
        const salesMap = new Map();
        
        data.forEach(order => {
          const transactionId = order.vendlive_id.split('_')[0];
          
          if (!salesMap.has(transactionId)) {
            salesMap.set(transactionId, {
              id: transactionId,
              createdAt: order.created_at,
              total: order.price_ttc,
              charged: order.status === 'completed' ? 'Yes' : 'No',
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
              productSales: []
            });
          }
          
          salesMap.get(transactionId).productSales.push({
            productName: order.product_name,
            category: order.product_category,
            quantity: order.quantity,
            price: order.price_ttc
          });
        });
        
        setSales(Array.from(salesMap.values()));
      }
      
      setIsLoading(false);
    }
    
    loadData();
  }, []);
  
  return { sales, isLoading };
}