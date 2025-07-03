// Configuration API centralisée pour Shape Eat Dashboard

export const API_CONFIG = {
  BASE_URL: 'https://vendlive.com',
  ACCOUNT_ID: import.meta.env.VITE_ACCOUNT_ID || '295',
  API_KEY: import.meta.env.VITE_API_KEY || '2b99d02d6886f67b3a42d82c684108d2eda3d2e1',
  
  // Endpoints disponibles
  ENDPOINTS: {
    MACHINES: '/api/2.0/machines/',
    ORDER_SALES: '/api/2.0/order-sales/',
    POST_SALE_VALIDATION: (accountId: string) => `/api/2.0/accounts/${accountId}/post-sale-validation-orders/`,
    ACCOUNT_ORDER_SALES: (accountId: string) => `/api/2.0/accounts/${accountId}/order-sales/`,
    STOCK_MOVEMENTS: '/api/2.0/stock-movements/',
    NOTIFICATIONS: '/api/2.0/notifications/',
  },
  
  // Configuration des requêtes
  REQUEST: {
    TIMEOUT: 30000, // 30 secondes
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000, // 1 seconde
  },
  
  // Paramètres de polling
  POLLING: {
    INTERVAL: 60000, // 60 secondes
    ENABLED: true,
  }
} as const;

// Headers par défaut
export const getHeaders = () => ({
  'Authorization': `Token ${API_CONFIG.API_KEY}`,
  'Content-Type': 'application/json',
});

// URLs complètes pour les endpoints
export const getApiUrls = () => ({
  machines: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.MACHINES}`,
  orderSales: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ORDER_SALES}`,
  postSaleValidation: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.POST_SALE_VALIDATION(API_CONFIG.ACCOUNT_ID)}`,
  accountOrderSales: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.ACCOUNT_ORDER_SALES(API_CONFIG.ACCOUNT_ID)}`,
  stockMovements: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STOCK_MOVEMENTS}`,
  notifications: `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NOTIFICATIONS}`,
});

// Fonction utilitaire pour les requêtes API avec retry
export const apiRequest = async <T>(
  url: string, 
  options: RequestInit = {}
): Promise<T> => {
  const headers = getHeaders();
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  };

  let lastError: Error;
  
  for (let attempt = 1; attempt <= API_CONFIG.REQUEST.RETRY_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST.TIMEOUT);
      
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Tentative ${attempt}/${API_CONFIG.REQUEST.RETRY_ATTEMPTS} échouée pour ${url}:`, error);
      
      if (attempt < API_CONFIG.REQUEST.RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, API_CONFIG.REQUEST.RETRY_DELAY * attempt));
      }
    }
  }
  
  throw lastError!;
};

// Fonction pour tester la connectivité API
export const testApiConnectivity = async (): Promise<{
  success: boolean;
  workingEndpoints: string[];
  failedEndpoints: string[];
}> => {
  const urls = getApiUrls();
  const results = {
    success: false,
    workingEndpoints: [] as string[],
    failedEndpoints: [] as string[],
  };
  
  for (const [name, url] of Object.entries(urls)) {
    try {
      await apiRequest(url, { method: 'HEAD' });
      results.workingEndpoints.push(name);
    } catch (error) {
      results.failedEndpoints.push(name);
      console.error(`Endpoint ${name} (${url}) non accessible:`, error);
    }
  }
  
  results.success = results.workingEndpoints.length > 0;
  return results;
};

// Fonctions utilitaires pour les dates
export const dateUtils = {
  getToday: (): string => {
    return new Date().toISOString().split('T')[0];
  },
  
  getDaysAgo: (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  },
  
  isToday: (dateString: string): boolean => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  },
  
  formatDateTime: (dateString: string): string => {
    return new Date(dateString).toLocaleString('fr-FR');
  },
  
  formatDate: (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  },
  
  formatTime: (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};

// Fonctions utilitaires pour les calculs business
export const businessUtils = {
  formatCurrency: (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  },
  
  calculateHT: (totalTTC: number, vatRate: number = 20): number => {
    return totalTTC / (1 + vatRate / 100);
  },
  
  calculateTTC: (totalHT: number, vatRate: number = 20): number => {
    return totalHT * (1 + vatRate / 100);
  },
  
  isSuccessfulSale: (sale: any): boolean => {
    const successStatuses = ['completed', 'processed', 'charged', 'true'];
    const failureStatuses = ['failed', 'cancelled', 'refunded', 'declined'];
    
    // Vérifier les statuts d'échec
    if (failureStatuses.includes(sale.status?.toLowerCase())) return false;
    if (failureStatuses.includes(sale.paymentStatus?.toLowerCase())) return false;
    
    // Vérifier les remboursements/erreurs dans les produits
    if (sale.productSales?.some((p: any) => p.isRefunded || p.errorMessage)) return false;
    if (sale.lineItems?.some((p: any) => p.isRefunded || p.errorMessage)) return false;
    
    // Vérifier les statuts de succès
    if (successStatuses.includes(sale.status?.toLowerCase())) return true;
    if (successStatuses.includes(sale.paymentStatus?.toLowerCase())) return true;
    if (successStatuses.includes(sale.charged?.toLowerCase())) return true;
    
    // Par défaut, considérer comme succès si pas d'indicateur d'échec
    return true;
  }
};

// Configuration pour le développement
export const DEV_CONFIG = {
  ENABLE_CONSOLE_LOGS: true,
  MOCK_DATA: false,
  SIMULATE_ERRORS: false,
  API_DELAY: 0, // Délai artificiel en ms
};

export default API_CONFIG;