// Types principaux pour l'application Shape Eat

export interface Machine {
  id: number;
  name?: string;
  friendlyName?: string;
  venue?: { 
    name?: string;
    id?: number;
    externalId?: string;
  };
  location?: {
    description?: string;
  };
  status?: string;
  last_connection?: string | null;
  enabled?: boolean;
  todaySales?: number;
  currency?: {
    symbol?: string;
  };
  lastVend?: string | null;
  refundedCount?: number;
  declinedCount?: number;
}

export interface OrderSale {
  id: number;
  total: string;
  createdAt: string;
  createdAtLocalized?: string;
  locationName?: string;
  totalCharged?: string | number;
  paymentStatusDisplay?: string;
  charged?: string;
  machine: {
    id: number;
    friendlyName: string;
  };
  location?: {
    venue?: {
      name?: string;
    };
  };
  productSales: Array<{
    product: {
      name: string;
      category?: {
        name: string;
      };
    };
    price: string;
    isRefunded?: boolean;
    errorMessage?: string;
  }>;
  customer?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface Channel {
  id: number;
  product: {
    name: string;
    category?: {
      name: string;
    };
  };
  stockLevel: number;
  lowStockLevel: number;
  idealCapacity: number;
  shelf: number;
  channel: number;
}

export interface StockAlert {
  machineId: number;
  machineName: string;
  channelId: number;
  productName: string;
  stockLevel: number;
  percentage: number;
}

export interface StockMovement {
  id: number;
  quantity: number;
  eventType: string;
  movementType: string;
  createdAtUtc: string;
  machine: {
    id: number;
    friendlyName: string;
  };
  product: {
    id: number;
    externalId: string;
    category: {
      name: string;
    };
  };
  operator?: {
    name: string;
  };
}