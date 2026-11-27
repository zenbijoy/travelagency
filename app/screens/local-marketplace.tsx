import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  useMarketplaceStore,
  EnrichedProduct,
  ProductCard,
  ProductDetailsModal,
  BargainModal,
  CartDrawer,
  CheckoutModal,
  GiftHamperModal,
  GiProvenanceModal,
  SellerStudioModal,
  OrderTrackingModal,
} from "../../src/features/marketplace";
import { localMarketplaceService } from "../../src/services/localMarketplaceService";
import { MarketplaceOrderRecord } from "../../src/types/localMarketplace";
import {
  CATEGORY_TABS,
  REGION_FILTERS,
} from "../../src/features/marketplace/constants/catalog";

// Warm Terracotta / Amber Heritage Theme
const THEME_PRIMARY = "#78350F"; // Amber-900 / Terracotta
const THEME_ACCENT = "#D97706";  // Amber-600
const THEME_GOLD = "#F59E0B";
const THEME_EMERALD = "#059669";
const THEME_DARK = "#0F172A";

export default function LocalMarketplaceScreen() {
  // Store selectors
  const products = useMarketplaceStore((s) => s.products);
  const selectedRegion = useMarketplaceStore((s) => s.selectedRegion);
  const selectedCategory = useMarketplaceStore((s) => s.selectedCategory);
  const searchQuery = useMarketplaceStore((s) => s.searchQuery);
  const cart = useMarketplaceStore((s) => s.cart);
  const orders = useMarketplaceStore((s) => s.orders);

  const setSelectedRegion = useMarketplaceStore((s) => s.setSelectedRegion);
  const setSelectedCategory = useMarketplaceStore((s) => s.setSelectedCategory);
  const setSearchQuery = useMarketplaceStore((s) => s.setSearchQuery);
  const setTrackingOrderId = useMarketplaceStore((s) => s.setTrackingOrderId);

  // Modal UI States
  const [selectedProduct, setSelectedProduct] = useState<EnrichedProduct | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [cartDrawerVisible, setCartDrawerVisible] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [hamperModalVisible, setHamperModalVisible] = useState(false);
  const [giModalVisible, setGiModalVisible] = useState(false);
  const [inspectGiCode, setInspectGiCode] = useState<string | undefined>();
  const [inspectProductId, setInspectProductId] = useState<string | undefined>();
  const [studioModalVisible, setStudioModalVisible] = useState(false);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Region filter
      if (selectedRegion !== "All" && !p.region.includes(selectedRegion)) {
        return false;
      }
      // Category filter
      if (selectedCategory !== "all" && p.category !== selectedCategory) {
        return false;
      }
      // Search query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBangla = p.bangla_name.toLowerCase().includes(q);
        const matchesRegion = p.region.toLowerCase().includes(q);
        const matchesDesc = p.description.toLowerCase().includes(q);
        const matchesSeller = p.seller_name.toLowerCase().includes(q);
        const matchesGi = p.giTag?.toLowerCase().includes(q);
        if (
          !matchesName &&
          !matchesBangla &&
          !matchesRegion &&
          !matchesDesc &&
          !matchesSeller &&
          !matchesGi
        ) {
          return false;
        }
      }
      return true;
    });
  }, [products, selectedRegion, selectedCategory, searchQuery]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await localMarketplaceService.getProducts();
    } catch (e) {
      // Handled silently
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProductPress = (product: EnrichedProduct) => {
    setSelectedProduct(product);
    setDetailsModalVisible(true);
  };

  const handleInspectGi = (giCode: string, productId: string) => {
    setInspectGiCode(giCode);
    setInspectProductId(productId);
    setGiModalVisible(true);
  };

  const handleOrderSuccess = (order: MarketplaceOrderRecord) => {
    setCheckoutModalVisible(false);
    setCartDrawerVisible(false);
    setTrackingOrderId(order.id);
    setTrackingModalVisible(true);
  };

  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="light-content" backgroundColor={THEME_PRIMARY} />

      {/* Top App Bar & Brand Banner */}
      <LinearGradient
        colors={[THEME_PRIMARY, "#92400E", THEME_ACCENT]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.topNavRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.titleColumn}>
            <View style={styles.brandTitleRow}>
              <MaterialCommunityIcons name="storefront" size={20} color={THEME_GOLD} />
              <Text style={styles.headerTitle}>আঞ্চলিক হাট ও ঐতিহ্য</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              খাঁটি হস্তশিল্প, জিআই পণ্য ও সরাসরি কারিগর বাজার
            </Text>
          </View>

          {/* Cart Icon with Counter Badge */}
          <TouchableOpacity
            style={styles.cartIconButton}
            onPress={() => setCartDrawerVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="cart" size={22} color="#FFF" />
            {totalCartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalCartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder="জামদানি, মধু, নকশিকাঁথা, খাঁটি খাবার খুঁজুন..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Action Pills: Hamper, GI Map, Studio, Orders */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickActionsScroll}
          contentContainerStyle={styles.quickActionsContent}
        >
          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => setHamperModalVisible(true)}
          >
            <MaterialCommunityIcons name="gift-outline" size={15} color={THEME_GOLD} />
            <Text style={styles.actionChipText}>গিফট হ্যাম্পার বিল্ডার</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => {
              setInspectGiCode("SJ-GI-BD-01-NRG");
              setGiModalVisible(true);
            }}
          >
            <MaterialCommunityIcons name="certificate" size={15} color="#A7F3D0" />
            <Text style={styles.actionChipText}>জিআই উৎস মানচিত্র</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionChip}
            onPress={() => setStudioModalVisible(true)}
          >
            <MaterialCommunityIcons name="storefront-outline" size={15} color="#FED7AA" />
            <Text style={styles.actionChipText}>সেলার স্টুডিও</Text>
          </TouchableOpacity>

          {orders.length > 0 && (
            <TouchableOpacity
              style={styles.actionChip}
              onPress={() => {
                setTrackingOrderId(orders[0].id);
                setTrackingModalVisible(true);
              }}
            >
              <MaterialCommunityIcons name="moped" size={15} color="#BFDBFE" />
              <Text style={styles.actionChipText}>লাইভ ডেলিভারি</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </LinearGradient>

      {/* Regional Filters */}
      <View style={styles.regionFilterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionFilterContent}
        >
          {REGION_FILTERS.map((r) => {
            const isSelected = selectedRegion === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.regionPill,
                  isSelected && styles.regionPillSelected,
                ]}
                onPress={() => setSelectedRegion(r.id)}
              >
                <Ionicons
                  name={r.icon as any}
                  size={13}
                  color={isSelected ? "#FFF" : THEME_PRIMARY}
                />
                <Text
                  style={[
                    styles.regionPillText,
                    isSelected && styles.regionPillTextSelected,
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Category Tabs */}
      <View style={styles.categorySection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORY_TABS.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryTab,
                  isSelected && styles.categoryTabSelected,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text
                  style={[
                    styles.categoryTabText,
                    isSelected && styles.categoryTabTextSelected,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Products Feed */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[THEME_PRIMARY]}
          />
        }
      >
        {/* Results Header */}
        <View style={styles.feedHeader}>
          <Text style={styles.resultsCountText}>
            {filteredProducts.length} টি খাঁটি আঞ্চলিক পণ্য পাওয়া গেছে
          </Text>
          <View style={styles.trustBadge}>
            <Ionicons name="shield-checkmark" size={13} color={THEME_EMERALD} />
            <Text style={styles.trustBadgeText}>১০০% ভেরিফাইড কারিগর</Text>
          </View>
        </View>

        {/* Product Cards */}
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="basket-unfill"
              size={56}
              color="#CBD5E1"
            />
            <Text style={styles.emptyTitle}>কোনো পণ্য খুঁজে পাওয়া যায়নি</Text>
            <Text style={styles.emptySub}>
              অন্য কোনো অঞ্চল বা অনুসন্ধান শব্দ দিয়ে চেষ্টা করুন।
            </Text>
            <TouchableOpacity
              style={styles.resetFilterBtn}
              onPress={() => {
                setSelectedRegion("All");
                setSelectedCategory("all");
                setSearchQuery("");
              }}
            >
              <Text style={styles.resetFilterBtnText}>সব পণ্য দেখুন</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onPress={handleProductPress}
              onInspectGi={handleInspectGi}
            />
          ))
        )}
      </ScrollView>

      {/* Modular Modals */}
      <ProductDetailsModal
        product={selectedProduct}
        visible={detailsModalVisible}
        onClose={() => setDetailsModalVisible(false)}
        onInspectGi={handleInspectGi}
      />

      <BargainModal />

      <CartDrawer
        visible={cartDrawerVisible}
        onClose={() => setCartDrawerVisible(false)}
        onProceedCheckout={() => {
          setCartDrawerVisible(false);
          setCheckoutModalVisible(true);
        }}
      />

      <CheckoutModal
        visible={checkoutModalVisible}
        onClose={() => setCheckoutModalVisible(false)}
        onOrderSuccess={handleOrderSuccess as any}
      />

      <GiftHamperModal
        visible={hamperModalVisible}
        onClose={() => setHamperModalVisible(false)}
      />

      <GiProvenanceModal
        visible={giModalVisible}
        onClose={() => setGiModalVisible(false)}
        initialCode={inspectGiCode}
      />

      <SellerStudioModal
        visible={studioModalVisible}
        onClose={() => setStudioModalVisible(false)}
      />

      <OrderTrackingModal
        visible={trackingModalVisible}
        onClose={() => setTrackingModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  topNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  titleColumn: {
    flex: 1,
    marginLeft: 10,
  },
  brandTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#FED7AA",
    marginTop: 2,
  },
  cartIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "500",
  },
  quickActionsScroll: {
    marginTop: 4,
  },
  quickActionsContent: {
    gap: 8,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  actionChipText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  regionFilterSection: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  regionFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  regionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  regionPillSelected: {
    backgroundColor: THEME_PRIMARY,
    borderColor: THEME_PRIMARY,
  },
  regionPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME_PRIMARY,
  },
  regionPillTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  categorySection: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  categoryTabSelected: {
    backgroundColor: THEME_ACCENT,
  },
  categoryTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  categoryTabTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  feedContent: {
    padding: 16,
  },
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  resultsCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  trustBadgeText: {
    fontSize: 11,
    color: THEME_EMERALD,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  resetFilterBtn: {
    backgroundColor: THEME_PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFilterBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
