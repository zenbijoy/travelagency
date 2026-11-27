import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { DELIVERY_TIER_OPTIONS } from "../constants/catalog";

interface CartDrawerProps {
  visible: boolean;
  onClose: () => void;
  onProceedCheckout: () => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const CartDrawer: React.FC<CartDrawerProps> = ({
  visible,
  onClose,
  onProceedCheckout,
}) => {
  const cart = useMarketplaceStore((s) => s.cart);
  const deliveryTier = useMarketplaceStore((s) => s.deliveryTier);
  const pricingQuote = useMarketplaceStore((s) => s.pricingQuote);

  const updateCartQuantity = useMarketplaceStore((s) => s.updateCartQuantity);
  const removeFromCart = useMarketplaceStore((s) => s.removeFromCart);
  const clearCart = useMarketplaceStore((s) => s.clearCart);
  const setDeliveryTier = useMarketplaceStore((s) => s.setDeliveryTier);
  const applyPromoCode = useMarketplaceStore((s) => s.applyPromoCode);

  const [promoInput, setPromoInput] = useState("");
  const [promoStatus, setPromoStatus] = useState<string | null>(null);

  const handleApplyPromo = () => {
    if (!promoInput.trim()) return;
    const res = applyPromoCode(promoInput);
    setPromoStatus(res.message);
  };

  const totalEscrowArtisanPayout = pricingQuote.vendorSplits.reduce(
    (acc, cur) => acc + cur.sellerPayoutBdt,
    0
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="cart" size={22} color={THEME_PRIMARY} />
              <Text style={styles.title}>আপনার শপিং ব্যাগ ({cart.length})</Text>
            </View>
            <View style={styles.headerActions}>
              {cart.length > 0 && (
                <TouchableOpacity onPress={clearCart} style={styles.clearBtn}>
                  <Text style={styles.clearBtnText}>সব মুছুন</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {cart.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="bag-handle-outline" size={64} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>আপনার শপিং ব্যাগ খালি</Text>
              <Text style={styles.emptySubtitle}>
                বাংলাদেশের হস্তশিল্প ও আঞ্চলিক ঐতিহ্যবাহী খাঁটি পণ্য আবিষ্কার করুন
              </Text>
              <TouchableOpacity style={styles.shopNowBtn} onPress={onClose}>
                <Text style={styles.shopNowBtnText}>পণ্য দেখুন</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.itemsList}>
                {cart.map((item) => {
                  const effectivePrice =
                    item.negotiatedUnitPriceBdt ?? item.product.price;
                  const itemTotal = effectivePrice * item.quantity;

                  return (
                    <View key={item.lineId} style={styles.cartItem}>
                      <Image
                        source={{ uri: item.product.image_url }}
                        style={styles.itemImage}
                      />
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {item.product.bangla_name}
                        </Text>
                        <Text style={styles.itemSeller} numberOfLines={1}>
                          কারিগর: {item.product.seller_name}
                        </Text>

                        {item.negotiatedUnitPriceBdt !== undefined && (
                          <View style={styles.bargainTag}>
                            <Text style={styles.bargainTagText}>দরদামে হ্রাসকৃত মূল্য</Text>
                          </View>
                        )}

                        <View style={styles.itemPricingRow}>
                          <Text style={styles.itemPrice}>
                            ৳{effectivePrice} × {item.quantity} = ৳{itemTotal}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.stepperCol}>
                        <TouchableOpacity
                          style={styles.trashBtn}
                          onPress={() => removeFromCart(item.lineId)}
                        >
                          <Ionicons name="trash-outline" size={16} color="#DC2626" />
                        </TouchableOpacity>
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() =>
                              updateCartQuantity(item.lineId, item.quantity - 1)
                            }
                          >
                            <Ionicons name="remove" size={14} color="#475569" />
                          </TouchableOpacity>
                          <Text style={styles.qtyText}>{item.quantity}</Text>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() =>
                              updateCartQuantity(item.lineId, item.quantity + 1)
                            }
                          >
                            <Ionicons name="add" size={14} color="#475569" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.sectionTitle}>ডেলিভারি মাধ্যম নির্বাচন করুন:</Text>
              <View style={styles.tierContainer}>
                {DELIVERY_TIER_OPTIONS.map((tier) => {
                  const isSelected = deliveryTier === tier.id;
                  return (
                    <TouchableOpacity
                      key={tier.id}
                      style={[styles.tierCard, isSelected && styles.tierCardActive]}
                      onPress={() => setDeliveryTier(tier.id)}
                    >
                      <View style={styles.tierHeader}>
                        <Ionicons
                          name={tier.icon as any}
                          size={18}
                          color={isSelected ? THEME_PRIMARY : "#64748B"}
                        />
                        <Text
                          style={[
                            styles.tierTitle,
                            isSelected && styles.tierTitleActive,
                          ]}
                        >
                          {tier.titleBn}
                        </Text>
                      </View>
                      <Text style={styles.tierDesc}>{tier.subtitleBn}</Text>
                      <Text style={styles.tierEta}>সময়: {tier.etaBn}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.promoContainer}>
                <View style={styles.promoInputRow}>
                  <TextInput
                    style={styles.promoInput}
                    placeholder="প্রোমো কোড (উদা: HERITAGE10, ARTISAN150)"
                    value={promoInput}
                    onChangeText={setPromoInput}
                    autoCapitalize="characters"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={handleApplyPromo}
                  >
                    <Text style={styles.applyBtnText}>প্রয়োগ</Text>
                  </TouchableOpacity>
                </View>
                {promoStatus && (
                  <Text style={styles.promoStatusText}>{promoStatus}</Text>
                )}
              </View>

              <View style={styles.billBox}>
                <Text style={styles.billTitle}>পেমেন্ট ও এসক্রো হিসাব</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>পণ্য উপমোট:</Text>
                  <Text style={styles.billValue}>৳{pricingQuote.subtotalBdt}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>
                    ডেলিভারি ফি ({pricingQuote.totalWeightKg.toFixed(1)} কেজি):
                  </Text>
                  <Text style={styles.billValue}>৳{pricingQuote.shippingFeeBdt}</Text>
                </View>
                {pricingQuote.totalDiscountBdt > 0 && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabel, { color: THEME_EMERALD }]}>
                      ছাড় ও সাশ্রয়:
                    </Text>
                    <Text style={[styles.billValue, { color: THEME_EMERALD }]}>
                      -৳{pricingQuote.totalDiscountBdt}
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                <View style={styles.billRowTotal}>
                  <Text style={styles.totalLabel}>সর্বমোট প্রদেয়:</Text>
                  <Text style={styles.totalValue}>৳{pricingQuote.totalPayableBdt}</Text>
                </View>

                <View style={styles.escrowNotice}>
                  <Ionicons name="shield-checkmark" size={14} color={THEME_EMERALD} />
                  <Text style={styles.escrowNoticeText}>
                    আর্টিসান এসক্রো সুরক্ষিত: ৳{totalEscrowArtisanPayout} সরাসরি কারিগরের তহবিলে সংরক্ষিত থাকবে।
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.checkoutBtn}
                onPress={onProceedCheckout}
              >
                <Ionicons name="lock-closed" size={16} color="#FFF" />
                <Text style={styles.checkoutBtnText}>
                  নিরাপদ চেকআউট (৳{pricingQuote.totalPayableBdt})
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearBtnText: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  shopNowBtn: {
    backgroundColor: THEME_PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 16,
  },
  shopNowBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  itemsList: {
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    gap: 10,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  itemInfo: {
    flex: 1,
    justifyContent: "center",
  },
  itemName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  itemSeller: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  bargainTag: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  bargainTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: THEME_EMERALD,
  },
  itemPricingRow: {
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  stepperCol: {
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  trashBtn: {
    padding: 4,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    backgroundColor: "#FFF",
  },
  stepBtn: {
    width: 26,
    height: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    width: 24,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
  },
  tierContainer: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 16,
  },
  tierCard: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FAFAFA",
  },
  tierCardActive: {
    borderColor: THEME_PRIMARY,
    backgroundColor: "#FEF3C7",
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tierTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  tierTitleActive: {
    color: THEME_PRIMARY,
    fontWeight: "700",
  },
  tierDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  tierEta: {
    fontSize: 10,
    fontWeight: "600",
    color: THEME_ACCENT,
    marginTop: 2,
  },
  promoContainer: {
    marginBottom: 16,
  },
  promoInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    backgroundColor: "#FFF",
  },
  applyBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 10,
  },
  applyBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  promoStatusText: {
    fontSize: 11,
    color: THEME_EMERALD,
    marginTop: 4,
    fontWeight: "600",
  },
  billBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  billTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  billValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 8,
  },
  billRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  escrowNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  escrowNoticeText: {
    fontSize: 10,
    color: "#059669",
    flex: 1,
    lineHeight: 14,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  checkoutBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
