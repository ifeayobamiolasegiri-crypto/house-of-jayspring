import React, { useState, useEffect } from 'react';
import { 
  Currency, 
  Product, 
  ProductCategory, 
  CartItem, 
  Order, 
  User, 
  ProductReview,
  StorePost,
  CategoryItem,
  SiteSettings,
  DEFAULT_SITE_SETTINGS
} 
import { CURRENCIES, normalizeOrder } from './utils/formatters';
import { INITIAL_PRODUCTS } from './data/products';
import { INITIAL_POSTS } from './data/posts';
import { PROMO_VOUCHERS } from './utils/promo';
import { testConnection, auth, logOutFirebase, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { FlashSalesSection } from './components/FlashSalesSection';
import { OfficialStoresSection } from './components/OfficialStoresSection';
import { PartnersSection } from './components/PartnersSection';
import { StoreAnnouncements } from './components/StoreAnnouncements';
import { ProductCatalog } from './components/ProductCatalog';
import { ProductDetailModal } from './components/ProductDetailModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { AuthModal } from './components/AuthModal';
import { OrderTrackingModal } from './components/OrderTrackingModal';
import { WishlistModal } from './components/WishlistModal';
import { AdminModal } from './components/AdminModal';
import { CustomerDashboardModal } from './components/CustomerDashboardModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { RecentlyViewedSection } from './components/RecentlyViewedSection';
import { WhatsAppChatButton } from './components/WhatsAppChatButton';
import { Footer } from './components/Footer';

export const App: React.FC = () => {
  // Products State with server synchronization & local fallback
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('hj_products_v3');
    if (saved) {
      try {
        const parsed: Product[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map(p => p.id));
        const missingDefaults = INITIAL_PRODUCTS.filter(p => !existingIds.has(p.id));
        return [...parsed, ...missingDefaults];
      } catch (e) {
        return INITIAL_PRODUCTS;
      }
    }
    return INITIAL_PRODUCTS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('hj_products_v3', JSON.stringify(products));
    } catch (err) {
      console.warn('Local storage cache limit, product data preserved safely on server database');
    }
  }, [products]);

  // Categories State with server persistence & fallback
  const [categories, setCategories] = useState<CategoryItem[]>(() => {
    const saved = localStorage.getItem('hj_categories');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      { id: 'all', label: 'All Categories', icon: 'Building2', description: 'All marketplace catalog items' },
      { id: 'kids-fashion', label: "Kids' Clothes & Shoes", icon: 'Baby', description: 'Children clothing, footwear and baby essentials' },
      { id: 'phones-tablets', label: 'Phones & Tablets', icon: 'Smartphone', description: 'Smartphones, UK used iPhones, iPads and accessories' },
      { id: 'electronics', label: 'Electronics & TV', icon: 'Tv', description: 'Smart televisions, soundbars, audio and home entertainment' },
      { id: 'appliances', label: 'Appliances', icon: 'Utensils', description: 'Kitchen and home appliances, blenders and microwaves' },
      { id: 'solar-power', label: 'Solar & Inverter', icon: 'Sun', description: 'Solar inverters, deep-cycle lithium batteries and panels' },
      { id: 'fashion', label: 'Fashion & Shoes', icon: 'Shirt', description: 'Designer clothes, agbada couture and luxury footwear' },
      { id: 'computing', label: 'Computing', icon: 'Laptop', description: 'Laptops, desktop computers, monitors and PC accessories' },
      { id: 'supermarket', label: 'Supermarket', icon: 'ShoppingBag', description: 'Groceries, provisions, toiletries and packaged foods' },
      { id: 'beauty', label: 'Health & Beauty', icon: 'Sparkles', description: 'Fragrances, skincare, cosmetics and grooming' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('hj_categories', JSON.stringify(categories));
  }, [categories]);

  // Sync Products & Categories with permanent server database
  const fetchProductsFromServer = async () => {
    try {
      const res = await fetch('/api/products');
      if (res.ok) {
        const serverProds: Product[] = await res.json();
        if (Array.isArray(serverProds) && serverProds.length > 0) {
          setProducts((currentLocal) => {
            const serverMap = new Map<string, Product>();
            serverProds.forEach((sp) => {
              if (sp && sp.id) serverMap.set(sp.id, sp);
            });

            // Retain any products created or modified locally that server hasn't caught yet
            const missingOnServer: Product[] = [];
            currentLocal.forEach((lp) => {
              if (lp && lp.id && !serverMap.has(lp.id)) {
                missingOnServer.push(lp);
                // Push unsynced product to server in background so it permanently persists
                fetch('/api/products', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(lp),
                }).catch((e) => console.error('Auto-sync missing product error:', e));
              }
            });

            const merged = [...missingOnServer, ...serverProds];
            try {
              localStorage.setItem('hj_products_v3', JSON.stringify(merged));
            } catch (storageErr) {
              console.warn('Storage quota reached, products safely kept in memory and server database');
            }
            return merged;
          });
        }
      }
    } catch (e) {
      console.log('Error syncing products with database:', e);
    }
  };

  // Explicit Publish handler to push all inventory and categories live to website
  const handlePublishProducts = async (productsToPublish?: Product[]): Promise<boolean> => {
    const targetProducts = productsToPublish && productsToPublish.length > 0 ? productsToPublish : products;
    try {
      showToast('Publishing catalog changes live to website...');
      const res = await fetch('/api/products/publish-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: targetProducts }),
      });
      if (res.ok) {
        setProducts(targetProducts);
        try {
          localStorage.setItem('hj_products_v3', JSON.stringify(targetProducts));
        } catch (e) {}
        await fetchCategoriesFromServer();
        showToast(`✓ Published! ${targetProducts.length} products are live on the general website.`);
        return true;
      }
    } catch (err) {
      console.error('Error publishing products:', err);
    }
    // Fallback: save to localStorage
    try {
      localStorage.setItem('hj_products_v3', JSON.stringify(targetProducts));
    } catch (e) {}
    showToast('✓ Saved to website catalog.');
    return true;
  };

  const fetchCategoriesFromServer = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const serverCats: CategoryItem[] = await res.json();
        if (Array.isArray(serverCats) && serverCats.length > 0) {
          setCategories((prev) => {
            const map = new Map<string, CategoryItem>();
            // 1. Add server categories
            serverCats.forEach((c) => {
              if (c && c.id) map.set(c.id.toLowerCase(), c);
            });
            // 2. Preserve any previously existing categories not yet returned by server
            prev.forEach((c) => {
              if (c && c.id && !map.has(c.id.toLowerCase())) {
                map.set(c.id.toLowerCase(), c);
              }
            });
            // 3. Ensure any product in products has its category represented
            products.forEach((p) => {
              if (p.category && p.category !== 'all') {
                const normId = p.category.toLowerCase().trim();
                if (!map.has(normId)) {
                  const autoLabel = normId.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
                  map.set(normId, {
                    id: normId,
                    label: autoLabel,
                    icon: 'Tag',
                    description: `Browse ${autoLabel} products`,
                  });
                }
              }
            });
            const merged = Array.from(map.values());
            localStorage.setItem('hj_categories', JSON.stringify(merged));
            return merged;
          });
        }
      }
    } catch (e) {
      console.log('Error syncing categories with database:', e);
    }
  };

  useEffect(() => {
    fetchProductsFromServer();
    fetchCategoriesFromServer();
    // Poll every 4 seconds so that changes on one device sync immediately to all devices
    const interval = setInterval(() => {
      fetchProductsFromServer();
      fetchCategoriesFromServer();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Store Announcements & Posts State with localStorage fallback
  const [posts, setPosts] = useState<StorePost[]>(() => {
    const saved = localStorage.getItem('hj_posts_v2');
    if (saved) {
      try {
        const parsed: StorePost[] = JSON.parse(saved);
        const existingIds = new Set(parsed.map(p => p.id));
        const missingDefaults = INITIAL_POSTS.filter(p => !existingIds.has(p.id));
        return [...parsed, ...missingDefaults];
      } catch (e) {
        return INITIAL_POSTS;
      }
    }
    return INITIAL_POSTS;
  });

  useEffect(() => {
    localStorage.setItem('hj_posts_v2', JSON.stringify(posts));
  }, [posts]);

  // Active Category & Search
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Currency State
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(CURRENCIES.NGN);

  // Site Settings & SEO Synchronization
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
    const saved = localStorage.getItem('hj_site_settings');
    if (saved) {
      try {
        return { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {}
    }
    return DEFAULT_SITE_SETTINGS;
  });

  const handleUpdateSiteSettings = (newSettings: SiteSettings) => {
    setSiteSettings(newSettings);
    localStorage.setItem('hj_site_settings', JSON.stringify(newSettings));
  };

  // Synchronize Google Site Verification meta tag with current settings
  useEffect(() => {
    try {
      const meta = document.getElementById('google-site-verification-meta');
      if (meta && siteSettings.googleVerificationCode) {
        meta.setAttribute('content', siteSettings.googleVerificationCode.trim());
      }
    } catch (e) {}
  }, [siteSettings.googleVerificationCode]);

  // Deep-linking from Google search, sitemaps, or shared URLs (?product=, ?category=, ?search=)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const prodId = params.get('product');
      const cat = params.get('category');
      const search = params.get('search') || params.get('q');

      if (cat) {
        setActiveCategory(cat as ProductCategory);
      }
      if (search) {
        setSearchQuery(search);
      }
      if (prodId && products.length > 0) {
        const found = products.find(p => p.id === prodId || p.id === decodeURIComponent(prodId));
        if (found) {
          setSelectedProduct(found);
        }
      }
    } catch (e) {}
  }, [products]);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('hj_cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('hj_cart', JSON.stringify(cart));
  }, [cart]);

  // Wishlist State
  const [wishlist, setWishlist] = useState<Product[]>(() => {
    const saved = localStorage.getItem('hj_wishlist');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('hj_wishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  // Orders State (synced with permanent server database)
  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('hj_orders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeOrder);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const fetchOrdersFromServer = async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const rawServerOrders = await res.json();
        if (Array.isArray(rawServerOrders)) {
          const serverOrders: Order[] = rawServerOrders.map(normalizeOrder);
          setOrders((currentLocal) => {
            const normalizedLocal = currentLocal.map(normalizeOrder);
            const matchesOrder = (a: Order, b: Order) => {
              const aId = (a.id || '').trim().toLowerCase();
              const bId = (b.id || '').trim().toLowerCase();
              const aTrk = (a.trackingNumber || '').trim().toLowerCase();
              const bTrk = (b.trackingNumber || '').trim().toLowerCase();
              return (aId && bId && aId === bId) || (aTrk && bTrk && aTrk === bTrk);
            };

            // Build merged list starting from server orders
            const merged: Order[] = serverOrders.map((so) => {
              // Find matching local order
              const localMatch = normalizedLocal.find((lo) => matchesOrder(lo, so));
              if (!localMatch) return so;

              // CRITICAL: If local order was confirmed by admin, NEVER downgrade it back to pending
              // due to polling race conditions.
              const isLocalConfirmed = localMatch.paymentStatus === 'confirmed';
              const isServerPending = so.paymentStatus === 'pending_verification';

              if (isLocalConfirmed && isServerPending) {
                // Immediately sync the confirmed status back to the server in background
                fetch(`/api/orders/${encodeURIComponent(so.id || so.trackingNumber)}/payment`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'confirmed' }),
                }).catch(() => {});

                return {
                  ...so,
                  paymentStatus: 'confirmed',
                  status: so.status === 'order_placed' ? 'payment_approved' : so.status,
                  adminApprovedAt: localMatch.adminApprovedAt || so.adminApprovedAt,
                };
              }

              // Also if status was advanced locally (e.g. ready for delivery), preserve it
              if (localMatch.status !== 'order_placed' && so.status === 'order_placed') {
                return {
                  ...so,
                  status: localMatch.status,
                  paymentStatus: 'confirmed',
                };
              }

              return so;
            });

            // Preserve any local orders that haven't reached the server yet
            currentLocal.forEach((lo) => {
              const exists = merged.some((m) => matchesOrder(m, lo));
              if (!exists) {
                merged.push(lo);
                fetch('/api/orders', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(lo),
                }).catch(() => {});
              }
            });

            localStorage.setItem('hj_orders', JSON.stringify(merged));
            return merged;
          });
        }
      }
    } catch (e) {
      console.log('Error fetching orders from server:', e);
    }
  };

  useEffect(() => {
    localStorage.setItem('hj_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    fetchOrdersFromServer();
    // Real-time synchronization polling every 3.5 seconds
    const interval = setInterval(fetchOrdersFromServer, 3500);
    return () => clearInterval(interval);
  }, []);

  // User Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('hj_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('hj_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('hj_current_user');
    }
  }, [currentUser]);

  // Firebase Firestore Connection Test and Auth State Listener
  useEffect(() => {
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const docSnap = await getDoc(userDocRef);
          const names = (fbUser.displayName || 'Valued Customer').split(' ');
          const isAdminUser = fbUser.email === 'ifeayobamiolasegiri@gmail.com' || fbUser.email === 'olasegiri@gmail.com';
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCurrentUser({
              id: fbUser.uid,
              firstName: data.firstName || names[0] || 'Valued',
              lastName: data.lastName || names.slice(1).join(' ') || 'Shopper',
              email: data.email || fbUser.email || '',
              phone: data.phone || fbUser.phoneNumber || '',
              state: data.state || 'Lagos',
              lga: data.lga || 'Ikeja',
              streetAddress: data.streetAddress || '',
              createdAt: data.createdAt || new Date().toISOString(),
              emailVerified: fbUser.emailVerified,
              role: isAdminUser ? 'admin' : (data.role || 'customer'),
            });
          }
        } catch (err) {
          console.warn('Firebase user sync note:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Voucher State
  const [appliedVoucherCode, setAppliedVoucherCode] = useState<string | null>(null);

  // Recently Viewed Products State with LocalStorage Persistence
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>(() => {
    const saved = localStorage.getItem('hj_recently_viewed');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('hj_recently_viewed', JSON.stringify(recentlyViewed));
  }, [recentlyViewed]);

  // Site Visitor Analytics Tracker
  useEffect(() => {
    try {
      let visitorId = localStorage.getItem('hj_visitor_id');
      if (!visitorId) {
        visitorId = 'vis_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
        localStorage.setItem('hj_visitor_id', visitorId);
      }

      const alreadyLogged = sessionStorage.getItem('hj_visit_pinged');
      if (!alreadyLogged) {
        sessionStorage.setItem('hj_visit_pinged', 'true');
        fetch('/api/analytics/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            visitorId,
            path: window.location.pathname || '/',
            referrer: document.referrer || '',
          }),
        }).catch((err) => console.log('Analytics ping error:', err));
      }
    } catch (e) {
      // ignore in iframe environments
    }
  }, []);

  // Modals Open State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authReason, setAuthReason] = useState<'checkout' | 'account' | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState<boolean>(false);
  const [trackingQuery, setTrackingQuery] = useState<string>('');
  const [isWishlistOpen, setIsWishlistOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [isCustomerDashboardOpen, setIsCustomerDashboardOpen] = useState<boolean>(false);
  const [customerDashboardTab, setCustomerDashboardTab] = useState<'overview' | 'orders' | 'addresses' | 'wishlist' | 'profile' | 'vouchers'>('overview');

  const handleOpenCustomerDashboard = (tab: 'overview' | 'orders' | 'addresses' | 'wishlist' | 'profile' | 'vouchers' = 'overview') => {
    setCustomerDashboardTab(tab);
    setIsCustomerDashboardOpen(true);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    localStorage.setItem('hj_current_user', JSON.stringify(updatedUser));
    try {
      setDoc(doc(db, 'users', updatedUser.id), updatedUser, { merge: true }).catch((e) => console.warn('Firestore user update note:', e));
    } catch (e) {
      console.warn('Firestore user update note:', e);
    }
    showToast('Account details updated successfully');
  };

  // Handle Select Product & Track in Recently Viewed
  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [product, ...filtered].slice(0, 15);
    });
  };

  // Clear Recently Viewed History
  const handleClearRecentlyViewed = () => {
    setRecentlyViewed([]);
    localStorage.removeItem('hj_recently_viewed');
    showToast('Recently viewed history cleared');
  };

  // Notification Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Cart Handlers
  const handleAddToCart = (product: Product, quantity: number = 1, color?: string, size?: string) => {
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          item.selectedColor === color &&
          item.selectedSize === size
      );

      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += quantity;
        return updated;
      }
      return [...prev, { product, quantity, selectedColor: color, selectedSize: size }];
    });
    showToast(`Added "${product.name.slice(0, 32)}..." to your cart`);
  };

  const handleUpdateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveCartItem(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity } : item))
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Buy Now Handler (Requires Auth)
  const handleBuyNow = (product: Product, quantity: number = 1, color?: string, size?: string) => {
    // Add to cart first
    handleAddToCart(product, quantity, color, size);
    setSelectedProduct(null);

    if (!currentUser) {
      setAuthReason('checkout');
      setIsAuthModalOpen(true);
    } else {
      setIsCheckoutOpen(true);
    }
  };

  // Checkout Open Handler (Requires Auth)
  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    if (!currentUser) {
      setAuthReason('checkout');
      setIsAuthModalOpen(true);
    } else {
      setIsCheckoutOpen(true);
    }
  };

  // Wishlist Handlers
  const handleToggleWishlist = (product: Product) => {
    setWishlist((prev) => {
      const exists = prev.some((p) => p.id === product.id);
      if (exists) {
        showToast(`Removed from saved items`);
        return prev.filter((p) => p.id !== product.id);
      } else {
        showToast(`Saved to your wishlist!`);
        return [...prev, product];
      }
    });
  };

  const isInWishlist = (productId: string) => wishlist.some((p) => p.id === productId);

  // Voucher Handlers
  const handleApplyVoucher = (code: string): { success: boolean; message: string } => {
    const voucher = PROMO_VOUCHERS[code];
    if (!voucher) {
      return { success: false, message: 'Invalid or expired voucher code' };
    }
    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    if (subtotal < voucher.minSpend) {
      return { 
        success: false, 
        message: `Voucher requires minimum order of ₦${voucher.minSpend.toLocaleString('en-NG')}` 
      };
    }
    setAppliedVoucherCode(code);
    return { success: true, message: `Promo code ${code} applied successfully! (${voucher.description})` };
  };

  const handleRemoveVoucher = () => {
    setAppliedVoucherCode(null);
  };

  // Order Completion Handler (Submits to Server Database)
  const handleOrderComplete = async (order: Order) => {
    // Optimistic local update
    setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id && o.trackingNumber !== order.trackingNumber)]);
    handleClearCart();
    setAppliedVoucherCode(null);
    showToast(`Order #${order.trackingNumber} placed! Pending admin payment approval.`);

    // Persist to Firebase Firestore
    try {
      setDoc(doc(db, 'orders', order.id), order).catch((e) => console.warn('Firestore order sync note:', e));
    } catch (e) {
      console.warn('Firestore order sync note:', e);
    }

    // Persist to backend server so admin sees it instantly
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setOrders((prev) => [data.order, ...prev.filter((o) => o.id !== data.order.id && o.trackingNumber !== data.order.trackingNumber)]);
        }
      }
    } catch (err) {
      console.error('Failed to save order to server:', err);
    }
  };

  // Auth Handlers
  const handleOpenAuth = (reason: 'checkout' | 'account' = 'account') => {
    setAuthReason(reason);
    setIsAuthModalOpen(true);
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    showToast(`Welcome back, ${user.firstName}!`);
    if (authReason === 'checkout') {
      setIsCheckoutOpen(true);
    }
  };

  const handleLogout = () => {
    logOutFirebase().catch(() => {});
    setCurrentUser(null);
    showToast('Signed out successfully');
  };

  // Review Handler
  const handleAddReview = (productId: string, newReview: Omit<ProductReview, 'id'>) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === productId) {
          const updatedReviews = [
            { id: `rev-${Date.now()}`, ...newReview },
            ...(p.reviews || []),
          ];
          const newAvgRating = Number(
            (updatedReviews.reduce((sum, r) => sum + r.rating, 0) / updatedReviews.length).toFixed(1)
          );
          return {
            ...p,
            reviews: updatedReviews,
            rating: newAvgRating,
            reviewCount: (p.reviewCount || 0) + 1,
          };
        }
        return p;
      })
    );
    showToast('Your verified review was submitted!');
  };

  // Admin Product Handlers (Synced to permanent server database)
  const handleAddProduct = async (newProd: Product) => {
    setProducts((prev) => [newProd, ...prev]);
    showToast(`Product "${newProd.name.slice(0, 24)}..." published!`);

    // Ensure product's category is instantly added to categories list
    if (newProd.category && newProd.category !== 'all') {
      const normCat = newProd.category.toLowerCase().trim();
      setCategories((prev) => {
        if (prev.some((c) => c.id.toLowerCase() === normCat)) return prev;
        const autoLabel = normCat.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
        const updated = [
          ...prev,
          {
            id: normCat,
            label: autoLabel,
            icon: 'Tag',
            description: `Browse ${autoLabel} products`,
          }
        ];
        localStorage.setItem('hj_categories', JSON.stringify(updated));
        return updated;
      });
    }

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProd),
      });
      if (res.ok) {
        fetchProductsFromServer();
        fetchCategoriesFromServer();
      }
    } catch (err) {
      console.error('Error saving product to server database:', err);
    }
  };

  const handleUpdateProduct = async (updatedProd: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? updatedProd : p)));
    showToast('Product updated');

    if (updatedProd.category && updatedProd.category !== 'all') {
      const normCat = updatedProd.category.toLowerCase().trim();
      setCategories((prev) => {
        if (prev.some((c) => c.id.toLowerCase() === normCat)) return prev;
        const autoLabel = normCat.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
        const updated = [
          ...prev,
          {
            id: normCat,
            label: autoLabel,
            icon: 'Tag',
            description: `Browse ${autoLabel} products`,
          }
        ];
        localStorage.setItem('hj_categories', JSON.stringify(updated));
        return updated;
      });
    }

    try {
      const res = await fetch(`/api/products/${updatedProd.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProd),
      });
      if (res.ok) {
        fetchProductsFromServer();
        fetchCategoriesFromServer();
      }
    } catch (err) {
      console.error('Error updating product on server database:', err);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    showToast('Product deleted from inventory');

    try {
      await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      fetchProductsFromServer();
    } catch (err) {
      console.error('Error deleting product from server database:', err);
    }
  };

  // Admin Category Handlers (Synced to permanent server database)
  const handleAddCategory = async (newCat: { id?: string; label: string; icon?: string; description?: string }) => {
    const slug = (newCat.id || newCat.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).trim();
    const item: CategoryItem = {
      id: slug,
      label: newCat.label.trim(),
      icon: newCat.icon || 'Tag',
      description: newCat.description,
    };

    setCategories((prev) => [...prev.filter(c => c.id.toLowerCase() !== slug.toLowerCase()), item]);
    showToast(`Category "${newCat.label}" added to database!`);

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        fetchCategoriesFromServer();
        return true;
      }
    } catch (err) {
      console.error('Error saving category to server database:', err);
    }
    return true;
  };

  const handleEditCategory = async (categoryId: string, updated: { label: string; description?: string; newId?: string }): Promise<boolean> => {
    const targetSlug = (updated.newId || categoryId).trim().toLowerCase();
    const cleanLabel = updated.label.trim();

    // Optimistically update categories
    setCategories((prev) =>
      prev.map((c) =>
        c.id.toLowerCase() === categoryId.toLowerCase()
          ? {
              ...c,
              id: targetSlug,
              label: cleanLabel,
              description: updated.description !== undefined ? updated.description : c.description,
            }
          : c
      )
    );

    // If ID/slug changed, update products in local state too
    if (categoryId.toLowerCase() !== targetSlug.toLowerCase()) {
      setProducts((prev) =>
        prev.map((p) =>
          p.category && p.category.toLowerCase() === categoryId.toLowerCase()
            ? { ...p, category: targetSlug }
            : p
        )
      );
    }

    showToast(`Category "${cleanLabel}" updated!`);

    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: cleanLabel,
          description: updated.description,
          newId: targetSlug,
        }),
      });
      if (res.ok) {
        fetchCategoriesFromServer();
        fetchProductsFromServer();
        return true;
      }
    } catch (err) {
      console.error('Error updating category on server:', err);
    }
    return true;
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    showToast('Category removed');

    try {
      await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
      fetchCategoriesFromServer();
    } catch (err) {
      console.error('Error deleting category from server database:', err);
    }
  };

  const handleResetDefaultProducts = () => {
    setProducts(INITIAL_PRODUCTS);
    localStorage.setItem('hj_products_v3', JSON.stringify(INITIAL_PRODUCTS));
    showToast('Inventory synced with latest UK Used & new catalog items!');
  };

  const handleUpdateOrderStatus = async (
    orderId: string, 
    status: Order['status'], 
    trackingNote?: string, 
    location?: string, 
    estimatedDate?: string
  ) => {
    // Send update to server backend
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, trackingNote, location, estimatedDate }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setOrders((prev) => prev.map((o) => (o.id === orderId || o.trackingNumber === orderId ? data.order : o)));
        }
      }
    } catch (err) {
      console.error('Error updating order status on server:', err);
    }

    // Local optimistic update
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId || o.trackingNumber === orderId) {
          const updates = [...o.deliveryUpdates];
          let defaultNote = trackingNote;
          let defaultLoc = location || 'House of Jayspring Logistics Hub';
          const nowStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

          if (!defaultNote) {
            if (status === 'ready_for_delivery') {
              defaultNote = 'Order packed, sealed, and marked ready for delivery driver dispatch.';
              defaultLoc = 'Central Dispatch Depot, Lagos';
            } else if (status === 'ready_for_pickup') {
              defaultNote = `Order is prepared and ready for customer pickup at ${o.shippingAddress.pickupStationName || 'Store Counter'}. Please present Order #${o.trackingNumber}.`;
              defaultLoc = o.shippingAddress.pickupStationName || 'Retail Pickup Hub';
            } else if (status === 'payment_approved') {
              defaultNote = 'Payment approved and verified by admin. Processing order items.';
              defaultLoc = 'Order Operations Desk';
            } else if (status === 'processing') {
              defaultNote = 'Warehouse staff picked items and undergoing quality check.';
              defaultLoc = 'Quality Assurance Dept';
            } else if (status === 'dispatched') {
              defaultNote = 'Package handed over to interstate courier transit line.';
              defaultLoc = 'National Logistics Transit Hub';
            } else if (status === 'out_for_delivery') {
              defaultNote = 'Dispatch rider assigned and out on route for doorstep delivery.';
              defaultLoc = `${o.shippingAddress.lga || 'City'} Delivery Zone`;
            } else if (status === 'delivered') {
              defaultNote = 'Parcel delivered successfully to recipient.';
              defaultLoc = `${o.shippingAddress.streetAddress}, ${o.shippingAddress.state}`;
            }
          }

          if (defaultNote) {
            updates.unshift({
              status: status.replace(/_/g, ' ').toUpperCase(),
              description: defaultNote,
              timestamp: nowStr,
              location: defaultLoc,
            });
          }

          return {
            ...o,
            status,
            deliveryUpdates: updates,
            estimatedDeliveryDate: estimatedDate || o.estimatedDeliveryDate,
          };
        }
        return o;
      })
    );
    showToast(`Order status updated to "${status.replace(/_/g, ' ').toUpperCase()}"`);
  };

  const handleConfirmPayment = async (
    orderId: string, 
    status: 'confirmed' | 'pending_verification' | 'failed'
  ) => {
    // Send payment clearance update to server backend
    try {
      const res = await fetch(`/api/orders/${orderId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setOrders((prev) => prev.map((o) => (o.id === orderId || o.trackingNumber === orderId ? data.order : o)));
        }
      }
    } catch (err) {
      console.error('Error confirming payment on server:', err);
    }

    // Local optimistic update
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId || o.trackingNumber === orderId) {
          const updates = [...o.deliveryUpdates];
          const nowStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          
          if (status === 'confirmed') {
            updates.unshift({
              status: 'PAYMENT APPROVED & VERIFIED',
              description: 'Store administrator approved payment clearance. Order authorized for warehouse staging and dispatch.',
              timestamp: nowStr,
              location: 'Finance & Accounts Desk',
            });
          } else if (status === 'failed') {
            updates.unshift({
              status: 'PAYMENT FLAGGED / UNCONFIRMED',
              description: 'Payment was not cleared by store administrator. Please contact support or provide verified transaction proof.',
              timestamp: nowStr,
              location: 'Finance & Accounts Desk',
            });
          }

          return {
            ...o,
            paymentStatus: status,
            adminApprovedAt: status === 'confirmed' ? nowStr : undefined,
            status: status === 'confirmed' && o.status === 'order_placed' ? 'payment_approved' : o.status,
            deliveryUpdates: updates,
          };
        }
        return o;
      })
    );
    showToast(status === 'confirmed' ? 'Payment APPROVED by Store Admin!' : `Payment marked as ${status.toUpperCase()}`);
  };

  const handleAddPost = (newPost: StorePost) => {
    setPosts((prev) => [newPost, ...prev]);
    showToast(`Post "${newPost.title.slice(0, 24)}..." broadcasted live!`);
  };

  const handleUpdatePost = (updatedPost: StorePost) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    showToast('Announcement post updated');
  };

  const handleDeletePost = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast('Announcement removed');
  };

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSelectCategory = (cat: ProductCategory) => {
    setActiveCategory(cat);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F5F5] selection:bg-[#F68B1E] selection:text-white relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-gray-700 text-xs font-bold animate-fadeIn flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F68B1E] animate-ping"></span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Header (NO top ticker) */}
      <Navbar
        activeCategory={activeCategory}
        onSelectCategory={handleSelectCategory}
        customCategories={categories}
        cartCount={cartTotalCount}
        wishlistCount={wishlist.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenOrderTracking={() => {
          setTrackingQuery('');
          setIsTrackingModalOpen(true);
        }}
        onOpenAiAssistant={() => setIsAiAssistantOpen(true)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onOpenCustomerDashboard={handleOpenCustomerDashboard}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCurrency={selectedCurrency}
        onSelectCurrency={setSelectedCurrency}
        currentUser={currentUser}
        onOpenAuth={() => handleOpenAuth('account')}
        onLogout={handleLogout}
      />

      {/* Store Announcements Banner */}
      <StoreAnnouncements posts={posts} />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section (only when on All Categories and no search) */}
        {activeCategory === 'all' && !searchQuery && (
          <>
            <Hero
              onSelectCategory={handleSelectCategory}
            />
            <FlashSalesSection
              products={products}
              selectedCurrency={selectedCurrency}
              onSelectProduct={handleSelectProduct}
              onAddToCart={handleAddToCart}
              onToggleWishlist={handleToggleWishlist}
              isInWishlist={isInWishlist}
            />
            <OfficialStoresSection onSelectCategory={handleSelectCategory} />
          </>
        )}

        {/* Product Catalog Grid */}
        <ProductCatalog
          products={products}
          selectedCategory={activeCategory}
          onSelectCategory={handleSelectCategory}
          selectedCurrency={selectedCurrency}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onToggleWishlist={handleToggleWishlist}
          isInWishlist={isInWishlist}
          searchQuery={searchQuery}
        />

        {/* Strategic Partners Section */}
        <PartnersSection />

        {/* Recently Viewed Products Section */}
        <RecentlyViewedSection
          products={recentlyViewed}
          selectedCurrency={selectedCurrency}
          onSelectProduct={handleSelectProduct}
          onAddToCart={handleAddToCart}
          onToggleWishlist={handleToggleWishlist}
          isInWishlist={isInWishlist}
          onClearHistory={handleClearRecentlyViewed}
        />
      </main>

      {/* Footer */}
      <Footer
        currentUser={currentUser}
        onSelectCategory={handleSelectCategory}
        onOpenOrderTracking={() => {
          setTrackingQuery('');
          setIsTrackingModalOpen(true);
        }}
        onOpenCustomerDashboard={handleOpenCustomerDashboard}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        selectedCurrency={selectedCurrency}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onToggleWishlist={handleToggleWishlist}
        isWishlisted={selectedProduct ? isInWishlist(selectedProduct.id) : false}
        onAddReview={handleAddReview}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        selectedCurrency={selectedCurrency}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onProceedToCheckout={handleProceedToCheckout}
        appliedVoucherCode={appliedVoucherCode}
        onApplyVoucher={handleApplyVoucher}
        onRemoveVoucher={handleRemoveVoucher}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cart}
        selectedCurrency={selectedCurrency}
        appliedVoucherCode={appliedVoucherCode}
        onOrderComplete={handleOrderComplete}
        onTrackOrder={(trackingNum) => {
          setTrackingQuery(trackingNum);
          setIsTrackingModalOpen(true);
        }}
        currentUser={currentUser}
        onOpenAuth={() => handleOpenAuth('checkout')}
      />

      {/* Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setAuthReason(null);
        }}
        onLoginSuccess={handleLoginSuccess}
        reason={authReason}
      />

      {/* Order Tracking Modal */}
      <OrderTrackingModal
        isOpen={isTrackingModalOpen}
        onClose={() => setIsTrackingModalOpen(false)}
        orders={orders}
        selectedCurrency={selectedCurrency}
        initialTrackingQuery={trackingQuery}
      />

      {/* Wishlist Modal */}
      <WishlistModal
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlist={wishlist}
        selectedCurrency={selectedCurrency}
        onAddToCart={handleAddToCart}
        onRemoveFromWishlist={(id) => {
          setWishlist((prev) => prev.filter((p) => p.id !== id));
        }}
        onSelectProduct={handleSelectProduct}
      />

      {/* Customer Account Dashboard Modal */}
      <CustomerDashboardModal
        isOpen={isCustomerDashboardOpen}
        onClose={() => setIsCustomerDashboardOpen(false)}
        currentUser={currentUser}
        onUpdateUser={handleUpdateUser}
        orders={orders}
        wishlist={wishlist}
        onRemoveFromWishlist={(id) => {
          setWishlist((prev) => prev.filter((p) => p.id !== id));
        }}
        onAddToCart={handleAddToCart}
        selectedCurrency={selectedCurrency}
        onTrackOrder={(trackingNum) => {
          setTrackingQuery(trackingNum);
          setIsTrackingModalOpen(true);
        }}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenAuth={() => handleOpenAuth('account')}
        onLogout={handleLogout}
        onApplyVoucher={(code) => {
          setAppliedVoucherCode(code);
          showToast(`Voucher ${code} applied! Ready to use at checkout.`);
        }}
        initialTab={customerDashboardTab}
      />

      {/* Admin Portal Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        currentUser={currentUser}
        products={products}
        categories={categories}
        onAddCategory={handleAddCategory}
        onEditCategory={handleEditCategory}
        onDeleteCategory={handleDeleteCategory}
        onAddProduct={handleAddProduct}
        onUpdateProduct={handleUpdateProduct}
        onDeleteProduct={handleDeleteProduct}
        onPublishProducts={handlePublishProducts}
        onResetDefaultProducts={handleResetDefaultProducts}
        orders={orders}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onConfirmPayment={handleConfirmPayment}
        posts={posts}
        onAddPost={handleAddPost}
        onUpdatePost={handleUpdatePost}
        onDeletePost={handleDeletePost}
        selectedCurrency={selectedCurrency}
        siteSettings={siteSettings}
        onUpdateSiteSettings={handleUpdateSiteSettings}
      />

      {/* AI Assistant Modal */}
      <AiAssistantModal
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        products={products}
        onSelectCategory={setActiveCategory}
        onSelectProduct={handleSelectProduct}
      />

      {/* Floating WhatsApp Support Button */}
      <WhatsAppChatButton currentUser={currentUser} />

    </div>
  );
};
