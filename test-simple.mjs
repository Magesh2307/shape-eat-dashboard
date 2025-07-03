// test-simple.mjs
import { createClient } from '@supabase/supabase-js';

// Votre URL exacte (sans le / à la fin)
const supabaseUrl = 'https://ojphshzuosbfbftpoigy.supabase.co';

// IMPORTANT: Copiez votre clé ANON depuis Supabase Settings > API
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qcGhzaHp1b3NiZmJmdHBvaWd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NTI3NzAsImV4cCI6MjA2NzAyODc3MH0.qNnc0LCB5rapDZBIiq1J2_YggC_tQbp7fvaiobWqKTU';

console.log('🔧 Test de connexion Supabase...');
console.log('URL:', supabaseUrl);

try {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('✅ Client créé');
  
  // Test de connexion
  const { data, error } = await supabase
    .from('orders')
    .select('count')
    .single();
  
  if (error) {
    console.error('❌ Erreur:', error);
  } else {
    console.log('✅ Connexion réussie !');
    console.log('Nombre de commandes:', data?.count || 0);
  }
} catch (err) {
  console.error('❌ Erreur:', err.message);
}