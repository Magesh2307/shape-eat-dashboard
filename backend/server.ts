// backend/server.ts - VERSION CORRIGÉE
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ CORRECTION 1: Vérifier les variables d'environnement
const VENDLIVE_TOKEN = process.env.VENDLIVE_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const VENDLIVE_BASE_URL = 'https://vendlive.com';

if (!VENDLIVE_TOKEN) {
  console.error('❌ VENDLIVE_TOKEN manquant dans .env');
  process.exit(1);
}

console.log('✅ Configuration chargée:');
console.log('- Token VendLive:', VENDLIVE_TOKEN ? '✓' : '✗');
console.log('- Frontend URL:', FRONTEND_URL);
console.log('- Port:', PORT);

// ✅ CORRECTION 2: Configuration CORS améliorée
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ✅ Logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 ${timestamp} - ${req.method} ${req.path}`);
  next();
});

// Headers pour VendLive
const getVendliveHeaders = (): Record<string, string> => ({
  'Authorization': `Token ${VENDLIVE_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'ShapeEat-Backend/1.0'
});

// Fonction utilitaire pour appels API
async function makeVendliveRequest(endpoint: string): Promise<any> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const url = `${VENDLIVE_BASE_URL}${endpoint}`;
    console.log(`🔄 Appel VendLive: ${url}`);
    
    const response = await fetch(url, {
      headers: getVendliveHeaders(),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Erreur API VendLive ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Erreur appel VendLive ${endpoint}:`, error);
    throw error;
  }
}

// ✅ Route de santé
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    vendlive_configured: !!VENDLIVE_TOKEN,
    backend_version: '1.0.0'
  });
});

// ✅ CORRECTION 3: Route /api/machines corrigée avec gestion d'erreurs
app.get('/api/machines', async (req: Request, res: Response) => {
  try {
    console.log('🔒 Début récupération des machines...');
    
    let allMachines: any[] = [];
    let nextUrl: string | null = '/api/2.0/machines/';
    let pageCount = 0;
    const maxPages = 50;
    
    // Récupérer toutes les machines
    while (nextUrl && pageCount < maxPages) {
      console.log(`📄 Page ${pageCount + 1}: ${nextUrl}`);
      
      const data = await makeVendliveRequest(nextUrl);
      
      if (data.results && Array.isArray(data.results)) {
        allMachines = [...allMachines, ...data.results];
        console.log(`✓ ${data.results.length} machines ajoutées (total: ${allMachines.length})`);
      }
      
      // Gérer la pagination
      if (data.next) {
        const url = new URL(data.next);
        nextUrl = url.pathname + url.search;
      } else {
        nextUrl = null;
      }
      
      pageCount++;
    }
    
    console.log(`✅ Total machines récupérées: ${allMachines.length}`);
    
    // Enrichir avec le statut enabled
    const enrichedMachines = await Promise.allSettled(
      allMachines.map(async (machine: any) => {
        try {
          const deviceEndpoint = `/api/2.0/devices/?machineId=${machine.id}`;
          const deviceData = await makeVendliveRequest(deviceEndpoint);
          const device = deviceData.results?.[0];
          
          return {
            ...machine,
            isEnabled: device?.enabled !== undefined ? device.enabled : true,
            lastCheck: new Date().toISOString()
          };
        } catch (err) {
          console.warn(`⚠️ Erreur device pour machine ${machine.id}:`, err);
          return {
            ...machine,
            isEnabled: true,
            lastCheck: new Date().toISOString()
          };
        }
      })
    );
    
    // Extraire les résultats réussis
    const successfulResults = enrichedMachines
      .filter(result => result.status === 'fulfilled')
      .map((result: any) => result.value);
    
    console.log(`✅ ${successfulResults.length} machines enrichies avec succès`);
    
    res.json({
      success: true,
      data: successfulResults,
      total: successfulResults.length
    });
    
  } catch (error: any) {
    console.error('❌ Erreur /api/machines:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des machines',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ✅ Route /api/sales
app.get('/api/sales', async (req: Request, res: Response) => {
  try {
    console.log('📊 Récupération des ventes...');
    
    const { startDate, endDate, limit = '1000' } = req.query;
    
    const limitNum = parseInt(limit as string, 10);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 10000) {
      return res.status(400).json({
        success: false,
        error: 'Paramètre limit invalide (1-10000)'
      });
    }
    
    let allSales: any[] = [];
    let nextUrl: string | null = '/api/2.0/sales/';
    let pageCount = 0;
    const maxPages = 100;
    
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate as string);
    if (endDate) params.append('endDate', endDate as string);
    params.append('limit', limitNum.toString());
    
    if (params.toString()) {
      nextUrl += '?' + params.toString();
    }
    
    while (nextUrl && pageCount < maxPages && allSales.length < limitNum) {
      const data = await makeVendliveRequest(nextUrl);
      
      if (data.results && Array.isArray(data.results)) {
        allSales = [...allSales, ...data.results];
      }
      
      if (data.next) {
        const url = new URL(data.next);
        nextUrl = url.pathname + url.search;
      } else {
        nextUrl = null;
      }
      
      pageCount++;
      
      if (pageCount % 10 === 0) {
        console.log(`📈 ${allSales.length} ventes récupérées (page ${pageCount})`);
      }
    }
    
    allSales = allSales.slice(0, limitNum);
    
    console.log(`✅ ${allSales.length} ventes récupérées`);
    
    res.json({
      success: true,
      data: allSales,
      total: allSales.length
    });
    
  } catch (error: any) {
    console.error('❌ Erreur /api/sales:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des ventes',
      message: error.message
    });
  }
});

// ✅ Route test connexion
app.get('/api/test-connection', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Test connexion VendLive...');
    
    const data = await makeVendliveRequest('/api/2.0/machines/?limit=1');
    
    res.json({
      success: true,
      message: 'Connexion VendLive OK',
      data: {
        machines_found: data.results?.length || 0,
        api_responsive: true,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error: any) {
    console.error('❌ Test connexion échoué:', error);
    res.status(500).json({
      success: false,
      error: 'Test de connexion échoué',
      message: error.message
    });
  }
});

// ✅ Gestion des erreurs globale
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Erreur serveur:', error);
  
  res.status(500).json({
    success: false,
    error: 'Erreur serveur interne',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// ✅ Route 404
app.use('*', (req: Request, res: Response) => {
  console.warn(`⚠️ Route non trouvée: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: 'Endpoint non trouvé',
    path: req.originalUrl,
    method: req.method
  });
});

// ✅ Démarrage du serveur
app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log(`🔒 Backend sécurisé démarré`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔗 Frontend autorisé: ${FRONTEND_URL}`);
  console.log(`🔑 Token VendLive: ${VENDLIVE_TOKEN ? 'Configuré ✅' : 'Manquant ❌'}`);
  console.log('🚀 ================================\n');
  
  // Test de connexion au démarrage
  makeVendliveRequest('/api/2.0/machines/?limit=1')
    .then(() => console.log('✅ Test connexion VendLive réussi'))
    .catch((err) => console.error('❌ Test connexion VendLive échoué:', err.message));
});

export default app;