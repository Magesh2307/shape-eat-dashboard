// Types pour les ventes
export interface Sale {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  machineId?: string;
  machineName?: string;
  productName?: string;
  customerEmail?: string;
  paymentMethod?: string;
  [key: string]: any;
}

// Types pour les machines
export interface Machine {
  id: string;
  name: string;
  status?: string;
  location?: string;
  serialNumber?: string;
  model?: string;
  [key: string]: any;
}

// Types pour les statistiques API
export interface ApiStats {
  endpoint: string;
  totalAPI: number;
  retrieved: number;
  todaySales: number;
  successfulSales: number;
  totalRevenue: number;
}

// Types pour les produits
export interface Product {
  id: string;
  name: string;
  price: string;
  category?: string;
  [key: string]: any;
}

// Types pour les commandes
export interface Order {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  items?: OrderItem[];
  [key: string]: any;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: string;
}

// Types pour les filtres de période
export type PeriodFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';