// 🔒 backend/src/server.ts - Backend TypeScript sécurisé
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 🔒 Interfaces TypeScript
interface VendliveResponse {
  results?: any[];
  next?: string | null;
  count?: number;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  vendlive_configured: boolean;
  backend_version: string;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  total?: number;
  error?: string;
  message?: string;
}

// 🔒 Middleware de sécurité
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// 🔒 Variables sécurisées (côté serveur uniquement)
const VENDLIVE_TOKEN = process.env.VENDLIVE_TOKEN;
const VENDLIVE_BASE_URL = 'https://vendlive.com';

// Vérification des variables requises
if (!VENDLIVE_TOKEN) {
  console.error('❌ VENDLIVE_TOKEN manquant dans .env');
  process.exit(1);
}

console.log('🔒 Token Vendlive configuré:', VENDLIVE_TOKEN ? '✅' : '❌');

// 🔒 Headers sécurisés pour l'API Vendlive
const getVendliveHeaders = (): Record<string, string> => ({
  'Authorization': `Token ${VENDLIVE_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'ShapeEat-Backend/1.0'
});

// 🔒 Fonction utilitaire pour les appels API sécurisés
async function makeVendliveRequest(endpoint: string): Promise<VendliveResponse> {
  try {
    const response = await fetch(`${VENDLIVE_BASE_URL}${endpoint}`, {
      headers: getVendliveHeaders(),
      timeout: 30000 // 30 secondes timeout
    });

    if (!response.ok) {
      throw new Error(`Erreur API Vendlive ${response.status}: ${response.statusText}`);
    }

    return await response.json() as VendliveResponse;
  } catch (error) {
    console.error(`❌ Erreur appel Vendlive ${endpoint}:`, error);
    throw error;
  }
}

// 🔒 Middleware de logging des requêtes
app.use((req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// 🔒 Route de santé (health check)
app.get('/health', (req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    vendlive_configured: !!VENDLIVE_TOKEN,
    backend_version: '1.0.0'
  });
});

// 🔒 Route sécurisée pour les machines
app.get('/api/machines', async (req: Request, res: Response<ApiResponse>) => {
  try {
    console.log('🭭 Récupération des machines via backend sécurisé...');
    
    let allMachines: any[] = [];
    let nextUrl: string | null = '/api/2.0/machines/';
    let pageCount = 0;
    const maxPages = 50; // Limite de sécurité
    
    while (nextUrl && pageCount < maxPages) {
      const data = await makeVendliveRequest(nextUrl);
      
      if (data.results) {
        allMachines = [...allMachines, ...data.results];
      }
      
      nextUrl = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
      pageCount++;
    }
    
    // Enrichir chaque machine avec son statut enabled
    const enrichedMachines = await Promise.all(
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
          console.warn(`⚠️ Impossible de récupérer le device pour la machine ${machine.id}`);
          return {
            ...machine,
            isEnabled: true,
            lastCheck: new Date().toISOString()
          };
        }
      })
    );
    
    console.log(`✅ ${enrichedMachines.length} machines récupérées et enrichies`);
    
    res.json({
      success: true,
      data: enrichedMachines,
      total: enrichedMachines.length
    });
    
  } catch (error: any) {
    console.error('❌ Erreur /api/machines:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des machines',
      message: error.message
    });
  }
});

// 🔒 Route sécurisée pour les ventes
app.get('/api/sales', async (req: Request, res: Response<ApiResponse>) => {
  try {
    console.log('📊 Récupération des ventes via backend sécurisé...');
    
    const { startDate, endDate, limit = '1000' } = req.query;
    
    // Validation des paramètres
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
    const maxPages = 100; // Limite de sécurité
    
    // Construire l'URL avec les paramètres
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate as string);
    if (endDate) params.append('endDate', endDate as string);
    params.append('limit', limitNum.toString());
    
    if (params.toString()) {
      nextUrl += '?' + params.toString();
    }
    
    while (nextUrl && pageCount < maxPages && allSales.length < limitNum) {
      const data = await makeVendliveRequest(nextUrl);
      
      if (data.results) {
        allSales = [...allSales, ...data.results];
      }
      
      nextUrl = data.next ? new URL(data.next).pathname + new URL(data.next).search : null;
      pageCount++;
      
      // Éviter les timeouts pour de gros volumes
      if (pageCount % 10 === 0) {
        console.log(`📈 Progression: ${allSales.length} ventes récupérées (page ${pageCount})`);
      }
    }
    
    // Limiter au nombre demandé
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

// 🔒 Route proxy générique pour l'API Vendlive
app.get('/api/vendlive/*', async (req: Request, res: Response) => {
  try {
    const apiPath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const fullPath = `/api/2.0/${apiPath}${queryString ? '?' + queryString : ''}`;
    
    console.log(`🔄 Proxy vers: ${VENDLIVE_BASE_URL}${fullPath}`);
    
    const data = await makeVendliveRequest(fullPath);
    res.json(data);
    
  } catch (error: any) {
    console.error('❌ Erreur proxy:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'appel API',
      message: error.message
    });
  }
});

// 🔒 Route pour tester la connexion Vendlive
app.get('/api/test-connection', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Test de connexion Vendlive...');
    
    const data = await makeVendliveRequest('/api/2.0/machines/?limit=1');
    
    res.json({
      success: true,
      message: 'Connexion Vendlive OK',
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

// 🔒 Middleware de gestion d'erreurs globale
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Erreur serveur non gérée:', error);
  
  res.status(500).json({
    success: false,
    error: 'Erreur serveur interne',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 🔒 Route 404 pour les endpoints non trouvés
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint non trouvé',
    path: req.originalUrl,
    method: req.method
  });
});

// 🚀 Démarrage du serveur
app.listen(PORT, () => {
  console.log('🚀 ================================');
  console.log(`🔒 Backend sécurisé démarré sur http://localhost:${PORT}`);
  console.log(`🌐 CORS autorisé pour: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔑 Token Vendlive: ${VENDLIVE_TOKEN ? 'Configuré ✅' : 'Manquant ❌'}`);
  console.log('🚀 ================================');
  
  // Test de connexion au démarrage
  makeVendliveRequest('/api/2.0/machines/?limit=1')
    .then(() => console.log('✅ Connexion Vendlive testée avec succès'))
    .catch((err) => console.error('❌ Test connexion Vendlive échoué:', err.message));
});

export default app;