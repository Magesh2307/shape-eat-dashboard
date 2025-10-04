import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom'; // Ajoutez cette ligne
import CustomDateRangePicker from './CustomDateRangePicker';
import { generateInvoicePDF, generateInvoiceNumber } from "./utils/invoice";


const parseJsonField = (field: any): any[] => {
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

interface Sale {
  id: string;
  vendlive_id: string;
  transaction_id: string;
  machine_id: number;
  machine_name: string;
  venue_id: number | null;
  venue_name: string | null;
  customer_email: string | null;
  promo_code: string | null;
  total_ttc: number;
  total_ht: number;
  discount_amount: number;
  nb_products: number;
  status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
  products: any[]; // ✅ Le JSON avec les produits
  categories: string[]; // ✅ Le JSON avec les catégories
  
  // ✅ Compatibility pour l'ancien code
  createdAt?: string;
  location?: {
    venue?: {
      id: number;
      name: string;
    };
  };
  total?: string;
  totalCharged?: string;
  charged?: string;
}

interface SalesViewProps {
  sales: any[];
  supabase: any;
}

const toYMD = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    : "";

// Composant Portal pour les dropdowns
const DropdownPortal: React.FC<{
  children: React.ReactNode;
  targetRef: React.RefObject<HTMLElement>;
  isOpen: boolean;
  onClose: () => void;
}> = ({ children, targetRef, isOpen, onClose }) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    const updatePosition = () => {
      if (isOpen && targetRef.current) {
        const rect = targetRef.current.getBoundingClientRect();
        setPosition({
          top: rect.bottom + window.scrollY + 8,
          left: rect.left + window.scrollX,
          width: rect.width
        });
      }
    };

    updatePosition();

    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen, targetRef]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <>
      <div 
        className="fixed inset-0 z-[999]" 
        onClick={onClose}
      />
      <div
        style={{
          position: 'absolute',
          top: position.top,
          left: position.left,
          width: Math.max(position.width, 288),
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
};

const SalesView: React.FC<SalesViewProps> = ({ sales, supabase }) => {
  // État de chargement
  const [isProcessing, setIsProcessing] = useState(false);
  
  // États pour les onglets
  const [activeTab, setActiveTab] = useState<'transactions' | 'products'>('transactions');

  // États communs aux deux onglets
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showTTC, setShowTTC] = useState(true);
  const [generatingInvoiceId, setGeneratingInvoiceId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // États spécifiques à l'onglet produits
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [debouncedProductSearchQuery, setDebouncedProductSearchQuery] = useState('');
  const [productSortBy, setProductSortBy] = useState<'revenue' | 'quantity'>('revenue');
  const [topProductsLimit, setTopProductsLimit] = useState(20);

  // Refs pour les dropdowns
  const venueButtonRef = useRef<HTMLButtonElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);

  const itemsPerPage = 50;
  
const handleGenerateInvoice = async (sale: any) => {
  try {
    setGeneratingInvoiceId(sale.id || sale.vendlive_id);
    
    // Parser les produits depuis le JSON
    const productsArray = parseJsonField(sale.products);
    
    console.log('=== RECHERCHE DES VRAIS PRIX ===');
    console.log('Sale complète:', sale);
    console.log('Produits array:', productsArray);
    
    const orderLines = [];
    let hasValidPrices = true;
    let errorMessages = [];
    
    for (let i = 0; i < productsArray.length; i++) {
      const product = productsArray[i];
      console.log(`\n=== PRODUIT ${i + 1}: ${product.name} ===`);
      console.log('Structure complète du produit:', product);
      
      // Chercher les VRAIS prix appliqués lors de la transaction
      let realPriceTTC = null;
      let realPriceHT = null;
      let realVATRate = null;
      
      // 1. PRIX DIRECTS DANS LE PRODUIT (transaction réelle)
      realPriceTTC = 
        product.actual_price ||
        product.transaction_price ||
        product.sale_price ||
        product.charged_price ||
        product.final_price ||
        product.unit_price_ttc ||
        product.price_ttc ||
        product.selling_price;
      
      realPriceHT = 
        product.actual_price_ht ||
        product.transaction_price_ht ||
        product.sale_price_ht ||
        product.unit_price_ht ||
        product.price_ht ||
        product.base_price;
      
      realVATRate = 
        product.vat_rate ||
        product.tax_rate ||
        product.applied_vat_rate;
      
      // 2. CHERCHER DANS productSales de la vente (données de transaction)
      if (!realPriceTTC || !realPriceHT) {
        const productSales = sale.productSales || sale.order_lines || sale.lines || [];
        const matchingProductSale = productSales.find(ps => 
          ps.product_id === product.id ||
          ps.product?.id === product.id ||
          ps.product_name === product.name ||
          ps.productName === product.name
        );
        
        if (matchingProductSale) {
          console.log('Données trouvées dans productSales:', matchingProductSale);
          
          realPriceTTC = realPriceTTC || 
            matchingProductSale.unit_price_ttc ||
            matchingProductSale.price_ttc ||
            matchingProductSale.selling_price ||
            matchingProductSale.final_price;
          
          realPriceHT = realPriceHT || 
            matchingProductSale.unit_price_ht ||
            matchingProductSale.price_ht ||
            matchingProductSale.base_price;
          
          realVATRate = realVATRate || 
            matchingProductSale.vat_rate ||
            matchingProductSale.tax_rate;
        }
      }
      
      // 3. CHERCHER DANS LES PRIX VENUE (au moment de la vente)
      if (!realPriceTTC || !realPriceHT) {
        const venueId = sale.venue_id || sale.location?.venue?.id;
        
        // Pricing par venue
        if (product.venue_pricing && venueId && product.venue_pricing[venueId]) {
          const venuePricing = product.venue_pricing[venueId];
          console.log(`Pricing venue ${venueId} trouvé:`, venuePricing);
          
          realPriceTTC = realPriceTTC || venuePricing.price_ttc || venuePricing.price;
          realPriceHT = realPriceHT || venuePricing.price_ht || venuePricing.base_price;
          realVATRate = realVATRate || venuePricing.vat_rate || venuePricing.tax_rate;
        }
        
        // Array venues
        if (product.venues && Array.isArray(product.venues) && venueId) {
          const venueData = product.venues.find(v => v.venue_id === venueId || v.id === venueId);
          if (venueData) {
            console.log('Venue data trouvée:', venueData);
            realPriceTTC = realPriceTTC || venueData.price_ttc || venueData.price;
            realPriceHT = realPriceHT || venueData.price_ht;
            realVATRate = realVATRate || venueData.vat_rate;
          }
        }
      }
      
      // VALIDATION : on doit avoir AU MINIMUM les prix TTC ET HT
      console.log(`Prix trouvés pour ${product.name}:`, {
        priceTTC: realPriceTTC,
        priceHT: realPriceHT,
        vatRate: realVATRate
      });
      
      // Si on a TTC mais pas HT, et qu'on a la TVA, on peut calculer
      if (realPriceTTC && !realPriceHT && realVATRate) {
        realPriceHT = realPriceTTC / (1 + realVATRate);
        console.log(`Prix HT calculé avec TVA ${realVATRate}: ${realPriceHT}`);
      }
      
      // Si on a HT mais pas TTC, et qu'on a la TVA, on peut calculer
      if (!realPriceTTC && realPriceHT && realVATRate) {
        realPriceTTC = realPriceHT * (1 + realVATRate);
        console.log(`Prix TTC calculé avec TVA ${realVATRate}: ${realPriceTTC}`);
      }
      
      // ÉCHEC : pas assez de données pour une facture légale
      if (!realPriceTTC || !realPriceHT) {
        hasValidPrices = false;
        const error = `Produit "${product.name}": Prix réels introuvables (TTC: ${realPriceTTC}, HT: ${realPriceHT})`;
        errorMessages.push(error);
        console.error(error);
        continue;
      }
      
      // Calculer la TVA si pas fournie
      if (!realVATRate && realPriceTTC && realPriceHT) {
        realVATRate = (realPriceTTC - realPriceHT) / realPriceHT;
      }
      
      const quantity = product.quantity || 1;
      
      orderLines.push({
        product_name: product.name || 'Produit',
        product_category: product.category || '',
        quantity: quantity,
        price_ttc: parseFloat(realPriceTTC),
        price_ht: parseFloat(realPriceHT),
        vat_rate: realVATRate || 0,
        vat_amount: (realPriceTTC - realPriceHT) * quantity
      });
      
      console.log(`✅ Produit ${product.name} validé:`, {
        quantity: quantity,
        priceTTC: realPriceTTC.toFixed(2),
        priceHT: realPriceHT.toFixed(2),
        vatRate: realVATRate ? `${(realVATRate * 100).toFixed(2)}%` : '0%'
      });
    }
    
    // VÉRIFICATION FINALE
    if (!hasValidPrices) {
      const errorMsg = `Impossible de générer la facture :\n\n${errorMessages.join('\n')}\n\nLes prix réels doivent être disponibles dans les données de transaction.`;
      console.error('ÉCHEC GÉNÉRATION FACTURE:', errorMsg);
      alert(errorMsg);
      return;
    }
    
    // Validation des totaux avec les vrais prix
    const calculatedTotalTTC = orderLines.reduce((sum, line) => sum + (line.price_ttc * line.quantity), 0);
    const calculatedTotalHT = orderLines.reduce((sum, line) => sum + (line.price_ht * line.quantity), 0);
    
    console.log('=== VALIDATION TOTAUX AVEC VRAIS PRIX ===');
    console.log({
      'Total TTC vente': sale.total_ttc,
      'Total TTC calculé (vrais prix)': calculatedTotalTTC.toFixed(2),
      'Écart TTC': Math.abs(calculatedTotalTTC - (sale.total_ttc || 0)).toFixed(2),
      'Total HT vente': sale.total_ht,
      'Total HT calculé (vrais prix)': calculatedTotalHT.toFixed(2),
      'Écart HT': Math.abs(calculatedTotalHT - (sale.total_ht || 0)).toFixed(2)
    });
    
    // Alerte si écart important (peut indiquer un problème de données)
    const ttcGap = Math.abs(calculatedTotalTTC - (sale.total_ttc || 0));
    if (ttcGap > 0.10) {
      const warningMsg = `⚠️ ATTENTION: Écart de ${ttcGap.toFixed(2)}€ entre le total vente (${sale.total_ttc}€) et le total calculé (${calculatedTotalTTC.toFixed(2)}€).\n\nVoulez-vous continuer ?`;
      if (!confirm(warningMsg)) {
        return;
      }
    }
    
    // Construire les données de facture avec les vrais prix
    const invoiceData = {
      transaction_id: sale.transaction_id || sale.id || sale.vendlive_id,
      created_at: sale.created_at,
      venue_name: sale.venue_name,
      order_lines: orderLines,
      payment_method: sale.payment_method || 'CB',
      customer_email: sale.customer_email,
      promo_code: sale.promo_code,
      discount_amount: sale.discount_amount || 0,
      total_ht: calculatedTotalHT,
      total_ttc: calculatedTotalTTC,
      total_tva: calculatedTotalTTC - calculatedTotalHT
    };
    
    console.log('✅ Génération facture avec vrais prix:', invoiceData);
    
    // Générer le PDF
    const { blob, filename } = await generateInvoicePDF(invoiceData);
    
    // Télécharger le fichier
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Erreur génération facture:', error);
    alert('Erreur lors de la génération de la facture');
  } finally {
    setGeneratingInvoiceId(null);
  }
};

  // Vérification des données
  if (!sales || !Array.isArray(sales)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-slate-400">Aucune donnée de vente disponible</p>
          <p className="text-sm text-slate-500 mt-2">Veuillez patienter pendant le chargement...</p>
        </div>
      </div>
    );
  }

  // Debounce pour la recherche avec optimisation
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'transactions') {
        setDebouncedSearchQuery(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'products') {
        setDebouncedProductSearchQuery(productSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [productSearchQuery, activeTab]);

  // Réinitialiser la page lors du changement de recherche
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery, selectedPeriod, selectedVenue, selectedCategories]);

  // Extraire toutes les venues uniques
  const allVenues = useMemo(() => {
  const venuesMap = new Map();

  sales.forEach(sale => {
    if (sale.venue_name) {
      // Source directe normalisée
      venuesMap.set(sale.venue_name, { id: sale.venue_name, name: sale.venue_name });
    } else if (sale.location?.venue?.id && sale.location?.venue?.name) {
      // Fallback JSON location
      venuesMap.set(sale.location.venue.id, {
        id: sale.location.venue.id,
        name: sale.location.venue.name
      });
    } else if (sale.locationName) {
      // Autre fallback
      venuesMap.set(sale.locationName, { id: sale.locationName, name: sale.locationName });
    }
  });

  return Array.from(venuesMap.values());
}, [sales]);

  // Extraire toutes les catégories uniques
  const allCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    sales.forEach(sale => {
      const products = sale.productSales || sale.products || [];
      products.forEach((product: any) => {
        let categoryName = '';
        
        if (typeof product.category === 'string') {
          categoryName = product.category;
        } else if (product.category?.name) {
          categoryName = product.category.name;
        } else if (product.productCategory) {
          categoryName = typeof product.productCategory === 'string' 
            ? product.productCategory 
            : product.productCategory.name || '';
        } else if (product.product?.category) {
          categoryName = typeof product.product.category === 'string'
            ? product.product.category
            : product.product.category.name || '';
        }
        
        if (categoryName && categoryName !== 'Non catégorisé') {
          categoriesSet.add(categoryName);
        }
      });
    });
    return Array.from(categoriesSet).sort();
  }, [sales]);

  // Fonction de filtrage par date optimisée
const getDateFilteredSales = useCallback(() => {
  try {
    let filtered = [...sales];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (selectedPeriod) {
      case 'today':
        filtered = filtered.filter(sale => {
          // ✅ Utiliser created_at OU createdAt
          const dateField = sale.created_at || sale.createdAt;
          if (!dateField) return false;
          const saleDate = new Date(dateField);
          return saleDate >= today;
        });
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        filtered = filtered.filter(sale => {
          const dateField = sale.created_at || sale.createdAt;
          if (!dateField) return false;
          const saleDate = new Date(dateField);
          return saleDate >= yesterday && saleDate < today;
        });
        break;
      case '7days':
		  const sevenDaysAgo = new Date(today);
		  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Changé de -7 à -6
		  filtered = filtered.filter(sale => {
			const dateField = sale.created_at || sale.createdAt;
			if (!dateField) return false;
			const saleDate = new Date(dateField);
			return saleDate >= sevenDaysAgo;
		  });
		  break;
      case '30days':
		  const thirtyDaysAgo = new Date(today);
		  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // Changé de -30 à -29
		  filtered = filtered.filter(sale => {
			const dateField = sale.created_at || sale.createdAt;
			if (!dateField) return false;
			const saleDate = new Date(dateField);
			return saleDate >= thirtyDaysAgo;
		  });
		  break;
      case 'custom':
        if (customDateRange.start && customDateRange.end) {
          const startDate = new Date(customDateRange.start);
          const endDate = new Date(customDateRange.end);
          endDate.setHours(23, 59, 59, 999);
          
          filtered = filtered.filter(sale => {
            const dateField = sale.created_at || sale.createdAt;
            if (!dateField) return false;
            const saleDate = new Date(dateField);
            return saleDate >= startDate && saleDate <= endDate;
          });
        }
        break;
    }
    
    console.log(`📅 Filtre "${selectedPeriod}": ${filtered.length} ventes sur ${sales.length}`);
    return filtered;
  } catch (error) {
    console.error('Error in getDateFilteredSales:', error);
    return [];
  }
}, [sales, selectedPeriod, customDateRange]);

  // Fonction de filtrage par venue
	const getVenueFilteredSales = useCallback((salesData: Sale[]) => {
  if (selectedVenue.length === 0) return salesData;  // Vérifier si l'array est vide
  
  return salesData.filter(sale => {
    return selectedVenue.includes(sale.venue_name || '');
  });
}, [selectedVenue]);

  // Fonction de filtrage par catégorie
  const getCategoryFilteredSales = useCallback((salesData: Sale[]) => {
    if (selectedCategories.length === 0) return salesData;
    
    return salesData.filter(sale => {
      const products = sale.productSales || sale.products || [];
      return products.some((product: any) => {
        let categoryName = '';
        
        if (typeof product.category === 'string') {
          categoryName = product.category;
        } else if (product.category?.name) {
          categoryName = product.category.name;
        } else if (product.productCategory) {
          categoryName = typeof product.productCategory === 'string' 
            ? product.productCategory 
            : product.productCategory.name || '';
        } else if (product.product?.category) {
          categoryName = typeof product.product.category === 'string'
            ? product.product.category
            : product.product.category.name || '';
        }
        
        return selectedCategories.includes(categoryName);
      });
    });
  }, [selectedCategories]);

// Filtrage et tri pour l'onglet transactions avec optimisation
const filteredAndSortedSales = useMemo(() => {
  setIsProcessing(true);
  
  // Utiliser setTimeout pour ne pas bloquer l'UI
  const result = (() => {
    let filtered = getDateFilteredSales();
    filtered = getVenueFilteredSales(filtered);
    filtered = getCategoryFilteredSales(filtered);
    
    // Filtrage par recherche optimisé
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      
      filtered = filtered.filter((sale: any) => {
        // Construction optimisée de la chaîne de recherche
        const searchParts: string[] = [];
        
        // ID
        if (sale.id) searchParts.push(String(sale.id).toLowerCase());
        if (sale.transaction_id) searchParts.push(String(sale.transaction_id).toLowerCase());
        
        // Venue
        if (sale.location?.venue?.name) searchParts.push(sale.location.venue.name.toLowerCase());
        if (sale.venue_name) searchParts.push(sale.venue_name.toLowerCase());
        
        // Montant
        const amount =
          Number(sale.total_ttc ?? NaN) ||
          parseFloat((sale.total as any) || (sale.totalCharged as any) || '0');
        searchParts.push(amount.toFixed(2));
        
        // Code promo
        const promoCode =
          sale.promo_code ||
          (sale as any).promoCode ||
          (sale as any).couponCode ||
          (sale as any).voucherCode ||
          (sale.products || sale.productSales || [])
            .map((p: any) => p.voucherCode || p.promoCode || '')
            .join(' ');
        if (promoCode) searchParts.push(promoCode.toLowerCase());
        
        // Email
        const email =
          sale.customer_email ||
          (sale as any).client_email ||
          sale.customer?.email ||
          (sale as any).email ||
          '';
        if (email) searchParts.push(email.toLowerCase());
        
        // Produits et catégories
        const products = sale.productSales || sale.products || [];
        products.forEach((p: any) => {
          if (p.productName || p.name) {
            searchParts.push((p.productName || p.name).toLowerCase());
          }
          let catName = '';
          if (typeof p.category === 'string') catName = p.category;
          else if (p.category?.name) catName = p.category.name;
          else if (p.productCategory) {
            catName = typeof p.productCategory === 'string'
              ? p.productCategory
              : p.productCategory.name || '';
          }
          if (catName) searchParts.push(catName.toLowerCase());
        });
        
        // 🔍 Vérification finale
        const searchText = searchParts.join(' ');
        return searchText.includes(query); // Utiliser 'query' au lieu de 'debouncedSearchQuery.toLowerCase()'
      });
    }

    // Tri
    if (sortConfig) {
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortConfig.key) {
          case 'date':
            aValue = new Date(a.created_at || a.createdAt).getTime();
            bValue = new Date(b.created_at || b.createdAt).getTime();
            break;
          case 'venue':
            aValue = a.venue_name || a.location?.venue?.name || '';
            bValue = b.venue_name || b.location?.venue?.name || '';
            break;
          case 'amount':
            aValue = parseFloat(a.total_ttc || a.total || a.totalCharged || '0');
            bValue = parseFloat(b.total_ttc || b.total || b.totalCharged || '0');
            break;
          case 'status':
            aValue = (a.status === 'completed' || a.payment_status === 'completed') ? 1 : 0;
            bValue = (b.status === 'completed' || b.payment_status === 'completed') ? 1 : 0;
            break;
          default:
            return 0;
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  })(); // ← Fermeture de la fonction anonyme

  // Démarquer la fin du traitement
  setTimeout(() => setIsProcessing(false), 0);
  
  return result;
}, [sales, debouncedSearchQuery, sortConfig, selectedPeriod, customDateRange, selectedVenue, selectedCategories, getDateFilteredSales, getVenueFilteredSales, getCategoryFilteredSales]); // ← Fermeture du useMemo

  // Calculs pour l'onglet produits optimisé
  const productStats = useMemo(() => {
    // Éviter de recalculer si on n'est pas sur l'onglet produits
    if (activeTab !== 'products') {
      return {
        products: [],
        totalProducts: 0,
        totalQuantity: 0,
        totalRevenue: 0
      };
    }

    let filtered = getDateFilteredSales();
    filtered = getVenueFilteredSales(filtered);
    
    // Agrégation des produits
    const productMap = new Map();
    
filtered.forEach(sale => {
  const products = sale.productSales || sale.products || [];
  const venueId = sale.location?.venue?.id || sale.venue_name || sale.locationName;
  const venueName = sale.venue_name || sale.location?.venue?.name || sale.locationName || 'Venue inconnue';
  
  products.forEach((product: any) => {
    const productName = product.productName || product.name || product.product?.name || 'Produit inconnu';
    
    if (productName === 'Produit inconnu') return;
    
    // Extraire le nom de la catégorie
    let categoryName = '';
    if (typeof product.category === 'string') {
      categoryName = product.category;
    } else if (product.category?.name) {
      categoryName = product.category.name;
    } else if (product.productCategory) {
      categoryName = typeof product.productCategory === 'string' 
        ? product.productCategory 
        : product.productCategory.name || '';
    }
    categoryName = categoryName || 'Non catégorisé';
    
    const quantity = Number(product.quantity ?? 1);
    const priceRaw = product.price_ttc ?? product.priceTTC ?? product.unit_price_ttc ??
      product.price_ht ?? product.priceHT ?? product.unit_price_ht ??
      product.selling_price ?? product.price ?? product.unitPrice ?? 0;

    const price = typeof priceRaw === 'string'
      ? parseFloat(String(priceRaw).replace(',', '.'))
      : Number(priceRaw) || 0;

    const total = quantity * price;
    
    const key = `${productName}_${categoryName}`;
    
    if (productMap.has(key)) {
      const existing = productMap.get(key);
      existing.quantity += quantity;
      existing.revenue += total;
      existing.salesCount += 1;
      
      // Ajouter la venue si elle n'existe pas déjà
      if (venueId && !existing.venues.has(venueId)) {
        existing.venues.set(venueId, venueName);
      }
    } else {
      const venues = new Map();
      if (venueId) venues.set(venueId, venueName);
      
      productMap.set(key, {
        name: productName,
        category: categoryName,
        quantity: quantity,
        revenue: total,
        salesCount: 1,
        venues: venues
      });
    }
  });
});
    
    // Convertir en array et calculer les moyennes
    let products = Array.from(productMap.values()).map(product => ({
      ...product,
      averagePrice: product.revenue / product.quantity,
      venueCount: product.venues.size,
      venuesList: Array.from(product.venues.values())
    }));
    
    // Filtrer par catégorie si nécessaire
    if (selectedCategories.length > 0) {
      products = products.filter(p => selectedCategories.includes(p.category));
    }
    
    // Filtrer par recherche de produit
    if (debouncedProductSearchQuery) {
      const query = debouncedProductSearchQuery.toLowerCase().trim();
      products = products.filter(p => {
        const searchText = `${p.name.toLowerCase()} ${p.category.toLowerCase()}`;
        return searchText.includes(query);
      });
    }
    
    // Trier selon le critère sélectionné
    products.sort((a, b) => {
      if (productSortBy === 'revenue') {
        return b.revenue - a.revenue;
      } else {
        return b.quantity - a.quantity;
      }
    });
    
    // Calculer les totaux
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
    
    // Ajouter les pourcentages
    products = products.map(product => ({
      ...product,
      quantityPercentage: totalQuantity > 0 ? (product.quantity / totalQuantity) * 100 : 0,
      revenuePercentage: totalRevenue > 0 ? (product.revenue / totalRevenue) * 100 : 0
    }));
    
    return {
      products: products.slice(0, topProductsLimit),
      totalProducts: products.length,
      totalQuantity,
      totalRevenue
    };
  }, [activeTab, sales, selectedPeriod, customDateRange, selectedVenue, selectedCategories, debouncedProductSearchQuery, productSortBy, topProductsLimit, getDateFilteredSales, getVenueFilteredSales]);

  // Données pour le graphique
  const chartData = useMemo(() => {
    return productStats.products.slice(0, 10).map((product, index) => ({
      name: product.name.length > 20 ? product.name.substring(0, 20) + '...' : product.name,
      value: productSortBy === 'revenue' ? product.revenue : product.quantity,
      fill: `hsl(${158 + index * 5}, 70%, 50%)`
    }));
  }, [productStats.products, productSortBy]);

  // Pagination pour l'onglet transactions
  const totalPages = Math.ceil(filteredAndSortedSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentSales = filteredAndSortedSales.slice(startIndex, endIndex);

  // Gestion du tri
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return { key, direction: 'desc' };
    });
  };

  // Stats pour l'onglet transactions
	const stats = useMemo(() => {
  // Filtrer les ventes réussies basé sur status ou payment_status
  const validSales = filteredAndSortedSales.filter(sale => 
    sale.status === 'completed' || 
    sale.payment_status === 'completed' ||
    sale.payment_status === 'paid' ||
    sale.status === 'success'
  );
  
  // Calculer le CA total TTC et HT
  const totalRevenue = validSales.reduce((sum, sale) => {
    const amount = sale.total_ttc || parseFloat(sale.total || sale.totalCharged || '0');
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);
  
  const totalRevenueHT = validSales.reduce((sum, sale) => {
    const amount = sale.total_ht || 0;
    return sum + amount;
  }, 0);
  
  // Calculer la TVA (différence entre TTC et HT)
  const totalTVA = totalRevenue - totalRevenueHT;

  return {
    totalSales: filteredAndSortedSales.length,
    successfulSales: validSales.length,
    totalRevenue,
    totalRevenueHT,
    totalTVA
  };
}, [filteredAndSortedSales]);

  // Format date helper
	const formatDate = (dateString: string) => {
	  try {
		if (!dateString) return '-';
		
		// Parser la date ISO
		const date = new Date(dateString);
		
		// Vérifier si la date est valide
		if (isNaN(date.getTime())) {
		  // Si ce n'est pas une date valide, essayer de parser différemment
		  const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
		  if (match) {
			const [_, year, month, day, hour, minute] = match;
			return `${day}/${month}/${year} ${hour}:${minute}`;
		  }
		  return dateString;
		}
		
		// Formater la date
		const day = date.getDate().toString().padStart(2, '0');
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const year = date.getFullYear();
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		
		return `${day}/${month}/${year} ${hours}:${minutes}`;
	  } catch (error) {
		console.error('Erreur formatage date:', error, dateString);
		return dateString;
	  }
	};


  // Format period display
 const asDate = (d: unknown) => {
  if (d instanceof Date) return d;
  const parsed = new Date(d as any);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const getFormattedPeriod = () => {
  switch (selectedPeriod) {
    case 'today': return "Aujourd'hui";
    case 'yesterday': return 'Hier';
    case '7days': return '7 derniers jours';
    case '30days': return '30 derniers jours';
    case 'custom': {
      const s = asDate(customDateRange.start);
      const e = asDate(customDateRange.end);
      return (s && e)
        ? `${s.toLocaleDateString('fr-FR')} - ${e.toLocaleDateString('fr-FR')}`
        : 'Période personnalisée';
    }
    default: return 'Toutes les dates';
  }
};

  // Réinitialiser les filtres
	const resetFilters = () => {
	  setSelectedPeriod('all');
	  setCustomDateRange({ start: null, end: null });
	  setSelectedVenue([]);  // Array vide au lieu de 'all'
	  setSelectedCategories([]);
	  setSearchQuery('');
	  setProductSearchQuery('');
	};

	// hasActiveFilters
	const hasActiveFilters = selectedPeriod !== 'all' || selectedVenue.length > 0 || selectedCategories.length > 0;

  // Message de chargement si traitement en cours
  if (isProcessing && sales.length > 1000) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white bg-emerald-500 hover:bg-emerald-400 transition ease-in-out duration-150">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Traitement en cours...
          </div>
          <p className="text-sm text-slate-500 mt-2">Analyse de {sales.length} ventes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête avec onglets */}
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-light text-white mb-1">Module Ventes</h2>
            <p className="text-sm text-slate-400">Analyse complète de vos ventes et produits</p>
          </div>
          
          {/* Onglets */}
          <div className="flex items-center bg-slate-700/30 rounded-xl p-1">
            <button
              onClick={() => {
                setActiveTab('transactions');
                setProductSearchQuery('');
                setDebouncedProductSearchQuery('');
              }}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'transactions'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>Transactions</span>
              </div>
            </button>
            
            <button
              onClick={() => {
                setActiveTab('products');
                setSearchQuery('');
                setDebouncedSearchQuery('');
              }}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'products'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span>Top Produits</span>
              </div>
            </button>
          </div>
        </div>

        {/* Filtres communs */}
        <div className="space-y-4">
          {/* Première ligne : Période et recherche */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={activeTab === 'transactions' ? "Rechercher par ID, venue, montant..." : "Rechercher par nom de produit..."}
                  value={activeTab === 'transactions' ? searchQuery : productSearchQuery}
                  onChange={(e) => activeTab === 'transactions' ? setSearchQuery(e.target.value) : setProductSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>
            
            {/* Sélecteur de période */}
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                if (e.target.value === 'custom') {
                  setShowDatePicker(true);
                }
              }}
              className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            >
              <option value="all">Toutes les dates</option>
              <option value="today">Aujourd'hui</option>
              <option value="yesterday">Hier</option>
              <option value="7days">7 derniers jours</option>
              <option value="30days">30 derniers jours</option>
              <option value="custom">Période personnalisée</option>
            </select>
          </div>

          {/* Deuxième ligne : Filtres avancés */}
		<div className="grid grid-cols-2 gap-4">
		  {/* Sélecteur de venues */}
		<div className="relative">
		  <button
			ref={venueButtonRef}
			onClick={() => {
			  setShowVenueDropdown(!showVenueDropdown);
			  setShowCategoryDropdown(false);
			}}
			className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white text-left flex items-center justify-between hover:bg-slate-700/70 transition-all duration-200"
		  >
			<span className="truncate">
			  {selectedVenue.length === 0 
				? 'Toutes les venues' 
				: `${selectedVenue.length} venue${selectedVenue.length > 1 ? 's' : ''} sélectionnée${selectedVenue.length > 1 ? 's' : ''}`
			  }
			</span>
			<svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showVenueDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
			</svg>
		  </button>

		  <DropdownPortal 
			targetRef={venueButtonRef} 
			isOpen={showVenueDropdown}
			onClose={() => setShowVenueDropdown(false)}
		  >
			<div className="w-full bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
			  <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-3">
				<button
				  onClick={(e) => {
					e.stopPropagation();
					setSelectedVenue([]);
				  }}
				  className="w-full px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors duration-200 text-sm"
				>
				  Désélectionner tout
				</button>
			  </div>
			  <div className="max-h-48 overflow-y-auto p-2">
				{Array.from(new Set(
				  sales
					.map(sale => sale.venue_name)
					.filter(Boolean)
				)).sort().length > 0 ? (
				  Array.from(new Set(
					sales
					  .map(sale => sale.venue_name)
					  .filter(Boolean)
				  )).sort().map(venue => {
					const isChecked = selectedVenue.includes(venue);
					return (
					  <label 
						key={venue} 
						className="flex items-center px-3 py-2 hover:bg-slate-700/30 rounded-lg cursor-pointer"
					  >
						<input
						  type="checkbox"
						  checked={isChecked}
						  onChange={(e) => {
							if (e.target.checked) {
							  setSelectedVenue([...selectedVenue, venue]);
							} else {
							  setSelectedVenue(selectedVenue.filter(v => v !== venue));
							}
						  }}
						  className="w-4 h-4 text-emerald-500 bg-slate-700 border-slate-600 rounded focus:ring-emerald-500 focus:ring-2"
						/>
						<span className="ml-3 text-sm text-white select-none">{venue}</span>
					  </label>
					);
				  })
				) : (
				  <div className="p-4 text-center text-slate-400 text-sm">
					Aucune venue disponible
				  </div>
				)}
			  </div>
			</div>
		  </DropdownPortal>
		</div>

            {/* Sélecteur de catégories */}
            <div className="relative">
              <button
                ref={categoryButtonRef}
                onClick={() => {
                  setShowCategoryDropdown(!showCategoryDropdown);
                  setShowVenueDropdown(false);
                }}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white text-left flex items-center justify-between hover:bg-slate-700/70 transition-all duration-200"
              >
                <span className="truncate">
                  {selectedCategories.length === 0 
                    ? 'Toutes les catégories' 
                    : selectedCategories.join(', ')
                  }
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <DropdownPortal 
                targetRef={categoryButtonRef} 
                isOpen={showCategoryDropdown}
                onClose={() => setShowCategoryDropdown(false)}
              >
                <div className="w-full bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
                  <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategories([]);
                      }}
                      className="w-full px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors duration-200 text-sm"
                    >
                      Désélectionner tout
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-2">
                    {allCategories.length > 0 ? (
                      allCategories.map(category => {
                        const isChecked = selectedCategories.includes(category);
                        return (
                          <label 
                            key={category} 
                            className="flex items-center px-3 py-2 hover:bg-slate-700/30 rounded-lg cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategories([...selectedCategories, category]);
                                } else {
                                  setSelectedCategories(selectedCategories.filter(cat => cat !== category));
                                }
                              }}
                              className="w-4 h-4 text-emerald-500 bg-slate-700 border-slate-600 rounded focus:ring-emerald-500 focus:ring-2"
                            />
                            <span className="ml-3 text-sm text-white select-none">{category}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-slate-400 text-sm">
                        Aucune catégorie disponible
                      </div>
                    )}
                  </div>
                </div>
              </DropdownPortal>
            </div>
          </div>

          {/* Filtres spécifiques à l'onglet produits */}
          {activeTab === 'products' && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-400">Trier par :</span>
                <select
                  value={productSortBy}
                  onChange={(e) => setProductSortBy(e.target.value as 'revenue' | 'quantity')}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="revenue">Chiffre d'affaires</option>
                  <option value="quantity">Quantité vendue</option>
                </select>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-400">Afficher top :</span>
                <select
                  value={topProductsLimit}
                  onChange={(e) => setTopProductsLimit(parseInt(e.target.value))}
                  className="px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          )}

          {/* Badges de filtres actifs */}
          {hasActiveFilters && (
            <div className="flex items-center flex-wrap gap-2">
              {selectedPeriod !== 'all' && (
                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {getFormattedPeriod()}
                </span>
              )}
              
              {selectedVenue.length > 0 && (
			  <span className="inline-flex items-center px-3 py-1 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm">
				<svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
				</svg>
				<span className="max-w-xs truncate">
				  {selectedVenue.join(', ')}
				</span>
			  </span>
			)}
              
              {selectedCategories.length > 0 && (
                <span className="inline-flex items-center px-3 py-1 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="max-w-xs truncate">
                    {selectedCategories.join(', ')}
                  </span>
                </span>
              )}
              
              <button
                onClick={resetFilters}
                className="ml-auto text-sm text-slate-400 hover:text-white transition-colors duration-200"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>
      </div>

{/* Contenu selon l'onglet actif */}
{activeTab === 'transactions' ? (
  <>
    {/* Stats */}
    <div className="grid grid-cols-3 gap-6">
      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>
        <p className="text-3xl font-light text-white mb-1">{stats.totalSales}</p>
        <p className="text-sm text-slate-400">Transactions totales</p>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p className="text-3xl font-light text-white mb-1">{stats.successfulSales}</p>
        <p className="text-sm text-slate-400">Ventes réussies</p>
      </div>

      <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          {/* Toggle HT/TTC */}
          <div className="relative">
            <div className="flex items-center p-1 bg-slate-700/50 rounded-lg">
              <button
                onClick={() => setShowTTC(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  !showTTC 
                    ? 'bg-emerald-500 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                HT
              </button>
              <button
                onClick={() => setShowTTC(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  showTTC 
                    ? 'bg-emerald-500 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                TTC
              </button>
            </div>
          </div>
        </div>
        
        {/* Montant principal */}
        <p className="text-3xl font-light text-white mb-3">
          {(showTTC ? stats.totalRevenue : stats.totalRevenueHT).toFixed(2)} €
        </p>
        
        {/* Label */}
        <p className="text-sm text-slate-400 mb-3">
          Chiffre d'affaires {showTTC ? 'TTC' : 'HT'}
        </p>
        
        {/* TVA avec meilleur design */}
        <div className="mt-4 pt-4 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">TVA</span>
            <span className="text-sm font-medium text-purple-300">
              {stats.totalTVA.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>
    </div>

          {/* Tableau des transactions */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/30 border-b border-slate-700/50">
  <tr>
    <th className="px-6 py-4 text-left">
      <button onClick={() => handleSort('date')} className="flex items-center space-x-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-white transition-colors duration-200">
        <span>Date</span>
        {sortConfig?.key === 'date' && (
          <svg className={`w-4 h-4 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>
    </th>
    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">ID Transaction</th>
    <th className="px-6 py-4 text-left">
      <button onClick={() => handleSort('venue')} className="flex items-center space-x-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-white transition-colors duration-200">
        <span>Venue</span>
        {sortConfig?.key === 'venue' && (
          <svg className={`w-4 h-4 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>
    </th>
    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Catégorie</th>
    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Produit</th>
    <th className="px-6 py-4 text-right">
      <button onClick={() => handleSort('amount')} className="flex items-center space-x-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-white transition-colors duration-200 ml-auto">
        <span>Montant {showTTC ? 'TTC' : 'HT'}</span>
        {sortConfig?.key === 'amount' && (
          <svg className={`w-4 h-4 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>
    </th>
    <th className="px-6 py-4 text-left">
      <button onClick={() => handleSort('status')} className="flex items-center space-x-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-white transition-colors duration-200">
        <span>Statut</span>
        {sortConfig?.key === 'status' && (
          <svg className={`w-4 h-4 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
          </svg>
        )}
      </button>
    </th>
    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email Client</th>
    <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Réduction</th>
    <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Code Promo</th>
    <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Facture</th>
  </tr>
</thead>
                <tbody className="divide-y divide-slate-700/50">
					{currentSales.map((sale) => {
  const products = sale.productSales || sale.products || [];
  
  // ✅ EXTRACTION CORRECTE selon la structure VendLive
  const categories = [...new Set(products.map((productSale: any) => {
    // Depuis la structure synchronisée (product_category) ou depuis l'API directe
    return productSale.product_category || 
           productSale.product?.category?.name || 
           'Non catégorisé';
  }))].filter(cat => cat !== 'Non catégorisé');

  const productNames = products.map((productSale: any) => {
    // Depuis la structure synchronisée (product_name) ou depuis l'API directe
    return productSale.product_name || 
           productSale.product?.name || 
           'Produit inconnu';
  }).filter((name: string) => name !== 'Produit inconnu');
  
  // ✅ MONTANT DE RÉDUCTION : Somme des discountValue de chaque productSale
  const totalDiscountAmount = products.reduce((sum, productSale) => {
    const discount = parseFloat(
      productSale.discount_amount || // Depuis sync
      productSale.discountValue ||   // Depuis API directe
      '0'
    ) || 0;
    return sum + discount;
  }, 0);
  
  // ✅ CODE PROMO : Depuis la vente globale
const promoCode =
  sale.promo_code ||
  sale.promoCode ||
  sale.couponCode ||
  sale.voucherCode ||
  products.map((p: any) => p.voucherCode || p.promoCode || '').filter(Boolean).join(' ') || '';
  
  // ✅ EMAIL CLIENT : Depuis la vente globale
  const customerEmail = sale.client_email ||       // Depuis sync
                       sale.customer?.email ||    // Depuis API directe
                       '';

  return (
    <tr key={sale.id} className="hover:bg-slate-700/20 transition-colors duration-150">
      {/* Date */}
		<td className="px-6 py-4 whitespace-nowrap text-sm text-white">
		  {sale.created_at ? new Date(sale.created_at).toLocaleDateString('fr-FR', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		  }) : '-'}
		</td>
			  
      {/* ID Transaction */}
  {/* Colonne ID Transaction */}
	<td className="px-6 py-4 text-sm">
	  {sale.transaction_id ? (
		<span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-mono text-xs border border-blue-500/30">
		  #{sale.transaction_id}
		</span>
	  ) : (
		<span className="text-slate-500">-</span>
	  )}
	</td>
      
      {/* Venue */}
<td className="px-6 py-4 text-sm text-white">
  {sale.venue_name || sale.location?.venue?.name || 'Venue inconnue'}
</td>
      {/* ✅ Catégories */}
      <td className="px-6 py-4 text-sm text-slate-300">
	  <div className="flex flex-wrap gap-1">
		{parseJsonField(sale.categories).length > 0 ? (
		  parseJsonField(sale.categories).map((cat: string, idx: number) => (
			<span key={idx} className="inline-block px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
			  {cat}
			</span>
		  ))
		) : (
		  <span className="text-slate-500 italic">Aucune catégorie</span>
		)}
	  </div>
	</td>
      
      {/* ✅ Produits */}
      <td className="px-6 py-4 text-sm text-white">
	  <div className="space-y-1.5">
		{parseJsonField(sale.products).length > 0 ? (
		  parseJsonField(sale.products).map((product: any, idx: number) => (
			<div key={idx} className="flex items-center">
			  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full mr-2 flex-shrink-0"></span>
			  <span className="font-medium">
				{product.name}
				{product.quantity > 1 && (
				  <span className="text-slate-400 ml-1">×{product.quantity}</span>
				)}
			  </span>
			</div>
		  ))
		) : (
		  <span className="text-orange-400 italic">⚠ Aucun produit</span>
		)}
	  </div>
	</td>
		  
      {/* Montant */}
     <td className="px-6 py-4 text-sm text-right">
  <span className="font-medium text-white">
    {showTTC 
      ? (sale.total_ttc ? `${sale.total_ttc.toFixed(2)} €` : '0.00 €')
      : (sale.total_ht ? `${sale.total_ht.toFixed(2)} €` : '0.00 €')
    }
  </span>
</td>
      
      {/* Statut */}
     <td className="px-6 py-4">
	  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
		sale.status === 'completed' || sale.payment_status === 'completed'
		  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
		  : sale.status === 'pending' || sale.payment_status === 'pending'
		  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
		  : 'bg-red-500/20 text-red-300 border border-red-500/30'
	  }`}>
		{sale.status === 'completed' || sale.payment_status === 'completed'
		  ? 'Réussi'
		  : sale.status === 'pending' || sale.payment_status === 'pending'
		  ? 'En attente'
		  : 'Échoué'}
	  </span>
	</td>
      
      {/* ✅ Email Client */}
      <td className="px-6 py-4 text-sm">
  {sale.customer_email || sale.client_email ? (
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <a 
        href={`mailto:${sale.customer_email || sale.client_email}`}
        className="text-blue-400 hover:text-blue-300 hover:underline"
      >
        {sale.customer_email || sale.client_email}
      </a>
    </div>
  ) : (
    <span className="text-slate-500 italic">-</span>
  )}
</td>
      
      {/* ✅ Montant de la réduction */}
      <td className="px-6 py-4 text-sm text-right">
  {sale.discount_amount && sale.discount_amount > 0 ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-orange-500/20 text-orange-300 font-medium border border-orange-500/30">
      -{sale.discount_amount.toFixed(2)} €
    </span>
  ) : (
    <span className="text-slate-500">-</span>
  )}
</td>
      
      {/* ✅ Code Promo */}
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {promoCode ? (
          <span className="inline-flex px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">
            {promoCode}
          </span>
        ) : (
          <span className="text-slate-500">-</span>
        )}
      </td>
	  <td className="px-6 py-4 text-center">
                <button
                  onClick={() => handleGenerateInvoice(sale)}
                  disabled={generatingInvoiceId === (sale.id || sale.vendlive_id)}
                  className="inline-flex items-center px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  title="Générer et télécharger la facture PDF"
                >
                  {generatingInvoiceId === (sale.id || sale.vendlive_id) ? (
                    <>
                      <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Génération...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Facture
                    </>
                  )}
                </button>
              </td>
	  
    </tr>
  );
 })}
      </tbody>
    </table>
  </div>
</div>

	{/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-700/50">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Affichage de {startIndex + 1} à {Math.min(endIndex, filteredAndSortedSales.length)} sur {filteredAndSortedSales.length} résultats
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-slate-700/50 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors duration-200"
                    >
                      Précédent
                    </button>
                    <span className="text-sm text-slate-400">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-slate-700/50 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors duration-200"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              </div>
            )}
		</>
      ) : (
        // Onglet Top Produits
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-white mb-1">{productStats.totalProducts}</p>
              <p className="text-sm text-slate-400">Produits différents</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-white mb-1">{productStats.totalQuantity.toLocaleString()}</p>
              <p className="text-sm text-slate-400">Quantité totale vendue</p>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-white mb-1">{productStats.totalRevenue.toFixed(2)} €</p>
              <p className="text-sm text-slate-400">Chiffre d'affaires total</p>
            </div>
          </div>

          {/* Graphique - Version simplifiée */}
          {chartData.length > 0 && (
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-lg font-light text-white mb-4">
                Top 10 produits
              </h3>
              <div className="space-y-3">
                {chartData.map((item, index) => (
                  <div key={index} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-white truncate max-w-xs">{item.name}</span>
                      <span className="text-sm text-slate-400">
                        {productSortBy === 'revenue' ? `${item.value.toFixed(2)} €` : item.value}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-6">
                      <div
                        className="h-6 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center justify-end pr-2"
                        style={{
                          width: `${(item.value / Math.max(...chartData.map(d => d.value))) * 100}%`
                        }}
                      >
                        <span className="text-xs text-white font-medium">
                          {((item.value / chartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

{/* Tableau des produits */}
<div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="bg-slate-700/30 border-b border-slate-700/50">
        <tr>
          <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Rang</th>
          <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Produit</th>
          <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Catégorie</th>
          <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Quantité vendue</th>
          <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">CA Total</th>
          <th className="px-6 py-4 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Prix moyen</th>
          <th className="px-6 py-4 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Venues</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700/50">
        {productStats.products.map((product, index) => (
          <tr key={`${product.name}_${product.category}`} className="hover:bg-slate-700/20 transition-colors duration-150">
            <td className="px-6 py-4 text-center">
              {index < 3 ? (
                <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                  index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                  index === 1 ? 'bg-slate-400/20 text-slate-300 border border-slate-400/30' :
                  'bg-orange-600/20 text-orange-400 border border-orange-600/30'
                }`}>
                  {index + 1}
                </span>
              ) : (
                <span className="text-slate-400 font-medium">{index + 1}</span>
              )}
            </td>
            <td className="px-6 py-4 text-sm font-medium text-white">
              {product.name}
            </td>
            <td className="px-6 py-4 text-sm text-slate-300">
              <span className="inline-block px-2 py-1 text-xs bg-slate-700/50 rounded">
                {product.category}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-right text-white">
              <div className="flex items-center justify-end space-x-2">
                <span className="font-medium">{product.quantity.toLocaleString()}</span>
                <span className="text-xs text-slate-400">({product.quantityPercentage.toFixed(1)}%)</span>
              </div>
            </td>
            <td className="px-6 py-4 text-sm text-right text-white">
              <div className="flex items-center justify-end space-x-2">
                <span className="font-medium">{product.revenue.toFixed(2)} €</span>
                <span className="text-xs text-slate-400">({product.revenuePercentage.toFixed(1)}%)</span>
              </div>
            </td>
            <td className="px-6 py-4 text-sm text-right text-slate-300">
              {product.averagePrice.toFixed(2)} €
            </td>
            <td className="px-6 py-4 text-center">
              <span className="inline-flex items-center px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded">
                {product.venueCount} venue{product.venueCount > 1 ? 's' : ''}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
        </>
      )}

{/* Modal Date Picker */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl shadow-2xl border border-slate-700">
            <CustomDateRangePicker
              startDate={toYMD(customDateRange.start)}
              endDate={toYMD(customDateRange.end)}
              onDateChange={(start, end) => {
                setCustomDateRange({ start: new Date(start), end: new Date(end) });
                setSelectedPeriod('custom');
                setShowDatePicker(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesView;