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
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMarketplaceStore } from "../store/marketplaceStore";
import { HAMPER_RIBBON_STYLES } from "../constants/catalog";
import { buildHeritageGiftHamper } from "../engines/hamperEngine";
import { RibbonStyleId } from "../types";

interface GiftHamperModalProps {
  visible: boolean;
  onClose: () => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const GiftHamperModal: React.FC<GiftHamperModalProps> = ({
  visible,
  onClose,
}) => {
  const products = useMarketplaceStore((s) => s.products);
  const hamperItems = useMarketplaceStore((s) => s.hamperItems);
  const hamperTitle = useMarketplaceStore((s) => s.hamperTitle);
  const hamperRibbon = useMarketplaceStore((s) => s.hamperRibbon);
  const hamperRecipientName = useMarketplaceStore((s) => s.hamperRecipientName);
  const hamperGiftMessage = useMarketplaceStore((s) => s.hamperGiftMessage);

  const toggleHamperProduct = useMarketplaceStore((s) => s.toggleHamperProduct);
  const setHamperMeta = useMarketplaceStore((s) => s.setHamperMeta);
  const addHamperToCart = useMarketplaceStore((s) => s.addHamperToCart);

  const [recipient, setRecipient] = useState(hamperRecipientName);
  const [message, setMessage] = useState(hamperGiftMessage);

  const configPreview = buildHeritageGiftHamper({
    title: hamperTitle,
    recipientName: recipient,
    giftMessage: message,
    ribbonStyle: hamperRibbon,
    items: hamperItems,
  });

  const handleAddToCart = () => {
    setHamperMeta({ recipientName: recipient, giftMessage: message });
    addHamperToCart();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <MaterialCommunityIcons name="gift-outline" size={24} color={THEME_ACCENT} />
              <View>
                <Text style={styles.title}>ঐতিহ্যবাহী গিফট হ্যাম্পার বিল্ডার</Text>
                <Text style={styles.subtitle}>
                  বাংলাদেশের খাঁটি স্মারক নিয়ে সাজান নিজের উপহারের বাক্স
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.sectionTitle}>রিবন ও মোড়ক নির্বাচন করুন:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ribbonScroll}>
              {HAMPER_RIBBON_STYLES.map((ribbon) => {
                const isSelected = hamperRibbon === ribbon.id;
                return (
                  <TouchableOpacity
                    key={ribbon.id}
                    style={[styles.ribbonCard, isSelected && styles.ribbonCardSelected]}
                    onPress={() =>
                      setHamperMeta({ ribbon: ribbon.id as RibbonStyleId })
                    }
                  >
                    <View
                      style={[
                        styles.ribbonColorDot,
                        { backgroundColor: ribbon.color },
                      ]}
                    />
                    <Text
                      style={[
                        styles.ribbonLabel,
                        isSelected && styles.ribbonLabelSelected,
                      ]}
                    >
                      {ribbon.labelBn}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.boxHeaderRow}>
              <Text style={styles.sectionTitle}>
                হ্যাম্পার বাক্সের পণ্যসমূহ ({hamperItems.length}/6):
              </Text>
              <View style={styles.discountBadge}>
                <Ionicons name="sparkles" size={12} color="#FFF" />
                <Text style={styles.discountBadgeText}>৫% বান্ডেল ছাড়</Text>
              </View>
            </View>

            {hamperItems.length === 0 ? (
              <Text style={styles.emptyItemsText}>
                নিচের তালিকা থেকে অন্তত ১টি পণ্য হ্যাম্পারে যোগ করুন।
              </Text>
            ) : (
              <View style={styles.selectedGrid}>
                {hamperItems.map((item) => (
                  <View key={item.product.id} style={styles.selectedChip}>
                    <Image source={{ uri: item.product.image_url }} style={styles.chipImage} />
                    <View style={styles.chipInfo}>
                      <Text style={styles.chipName} numberOfLines={1}>
                        {item.product.bangla_name}
                      </Text>
                      <Text style={styles.chipPrice}>৳{item.product.price}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleHamperProduct(item.product)}
                      style={styles.chipRemove}
                    >
                      <Ionicons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>হ্যাম্পারে পণ্য যোগ করুন বা বাদ দিন:</Text>
            <View style={styles.catalogItemsList}>
              {products.slice(0, 8).map((prod) => {
                const isInBox = hamperItems.some((i) => i.product.id === prod.id);
                return (
                  <TouchableOpacity
                    key={prod.id}
                    style={[
                      styles.catalogRow,
                      isInBox && styles.catalogRowSelected,
                    ]}
                    onPress={() => toggleHamperProduct(prod)}
                  >
                    <Image source={{ uri: prod.image_url }} style={styles.catalogThumb} />
                    <View style={styles.catalogInfo}>
                      <Text style={styles.catalogBangla} numberOfLines={1}>
                        {prod.bangla_name}
                      </Text>
                      <Text style={styles.catalogRegion}>
                        {prod.region} • ৳{prod.price}
                      </Text>
                    </View>
                    <Ionicons
                      name={isInBox ? "checkmark-circle" : "add-circle-outline"}
                      size={22}
                      color={isInBox ? THEME_EMERALD : "#94A3B8"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>উপহার বার্তা ও প্রাপক:</Text>
            <TextInput
              style={styles.input}
              placeholder="প্রাপকের নাম (যেমন: প্রিয়জন / বিশেষ অতিথি)"
              value={recipient}
              onChangeText={setRecipient}
              placeholderTextColor="#94A3B8"
            />
            <TextInput
              style={[styles.input, styles.messageInput]}
              placeholder="হাতে লেখা শুভেচ্ছা কার্ডের বার্তা..."
              value={message}
              onChangeText={setMessage}
              placeholderTextColor="#94A3B8"
              multiline
            />

            <View style={styles.pricingSummaryBox}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>পণ্যসমূহের মোট মূল্য:</Text>
                <Text style={styles.priceVal}>৳{configPreview.itemsSubtotalBdt}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: THEME_EMERALD }]}>
                  বান্ডেল ছাড় (৫%):
                </Text>
                <Text style={[styles.priceVal, { color: THEME_EMERALD }]}>
                  -৳{configPreview.bundleDiscountBdt}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>প্রিমিয়াম উপহার মোড়ক ও কার্ড:</Text>
                <Text style={styles.priceVal}>৳{configPreview.packagingFeeBdt}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.priceRowTotal}>
                <Text style={styles.totalLabel}>হ্যাম্পার মূল্য:</Text>
                <Text style={styles.totalVal}>৳{configPreview.finalPriceBdt}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.addCartBtn,
                hamperItems.length === 0 && styles.addCartBtnDisabled,
              ]}
              onPress={handleAddToCart}
              disabled={hamperItems.length === 0}
            >
              <MaterialCommunityIcons name="cart-arrow-down" size={20} color="#FFF" />
              <Text style={styles.addCartBtnText}>
                হ্যাম্পার শপিং ব্যাগে যোগ করুন (৳{configPreview.finalPriceBdt})
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
    height: "92%",
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
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    marginTop: 10,
  },
  ribbonScroll: {
    marginBottom: 12,
  },
  ribbonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
    backgroundColor: "#F8FAFC",
  },
  ribbonCardSelected: {
    borderColor: THEME_ACCENT,
    backgroundColor: "#FFFBEB",
  },
  ribbonColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ribbonLabel: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  ribbonLabelSelected: {
    color: THEME_PRIMARY,
    fontWeight: "700",
  },
  boxHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME_EMERALD,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },
  emptyItemsText: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    marginVertical: 10,
  },
  selectedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 10,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 6,
    gap: 8,
    width: "48%",
  },
  chipImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  chipInfo: {
    flex: 1,
  },
  chipName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
  },
  chipPrice: {
    fontSize: 10,
    color: THEME_PRIMARY,
    fontWeight: "600",
  },
  chipRemove: {
    padding: 2,
  },
  catalogItemsList: {
    marginBottom: 12,
  },
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    marginBottom: 6,
    gap: 10,
  },
  catalogRowSelected: {
    backgroundColor: "#ECFDF5",
  },
  catalogThumb: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  catalogInfo: {
    flex: 1,
  },
  catalogBangla: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
  },
  catalogRegion: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#0F172A",
    backgroundColor: "#FFF",
    marginBottom: 8,
  },
  messageInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  pricingSummaryBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 12,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  priceLabel: {
    fontSize: 12,
    color: "#64748B",
  },
  priceVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 6,
  },
  priceRowTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  totalVal: {
    fontSize: 16,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  addCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  addCartBtnDisabled: {
    opacity: 0.5,
  },
  addCartBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
