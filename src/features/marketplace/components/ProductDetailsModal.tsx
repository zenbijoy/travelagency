import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { EnrichedProduct } from "../types";
import { useMarketplaceStore } from "../store/marketplaceStore";

interface ProductDetailsModalProps {
  product: EnrichedProduct | null;
  visible: boolean;
  onClose: () => void;
  onInspectGi: (giCode: string, productId: string) => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({
  product,
  visible,
  onClose,
  onInspectGi,
}) => {
  const addToCart = useMarketplaceStore((s) => s.addToCart);
  const openBargainModal = useMarketplaceStore((s) => s.openBargainModal);

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  if (!product) return null;

  const images = product.galleryImages && product.galleryImages.length > 0
    ? product.galleryImages
    : [product.image_url];

  const handleBargain = () => {
    onClose();
    openBargainModal(product.id);
  };

  const handleAddToCart = () => {
    addToCart(product, 1);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {product.bangla_name}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Gallery Image */}
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: images[activeImageIndex] || product.image_url }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              {product.giCertified && (
                <TouchableOpacity
                  style={styles.giBadge}
                  onPress={() => onInspectGi(product.giCode, product.id)}
                >
                  <MaterialCommunityIcons name="certificate" size={14} color="#FFF" />
                  <Text style={styles.giBadgeText}>জিআই প্রত্যয়িত</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Gallery Thumbnails */}
            {images.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
                {images.map((img, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setActiveImageIndex(i)}
                    style={[
                      styles.thumbBtn,
                      activeImageIndex === i && styles.thumbBtnActive,
                    ]}
                  >
                    <Image source={{ uri: img }} style={styles.thumbImg} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Title & Price */}
            <View style={styles.metaSection}>
              <Text style={styles.banglaName}>{product.bangla_name}</Text>
              <Text style={styles.englishName}>{product.name}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currency}>৳</Text>
                <Text style={styles.price}>{product.price}</Text>
                {product.original_price && (
                  <Text style={styles.origPrice}>৳{product.original_price}</Text>
                )}
                <View style={styles.unitBadge}>
                  <Text style={styles.unitText}>{product.weight_or_unit}</Text>
                </View>
              </View>
            </View>

            {/* Artisan Profile Card */}
            {product.artisan && (
              <View style={styles.artisanCard}>
                <Image source={{ uri: product.artisan.avatar }} style={styles.artisanAvatar} />
                <View style={styles.artisanInfo}>
                  <View style={styles.artisanNameRow}>
                    <Text style={styles.artisanName}>{product.artisan.banglaName}</Text>
                    <Ionicons name="checkmark-circle" size={14} color={THEME_EMERALD} />
                  </View>
                  <Text style={styles.artisanRole}>
                    {product.artisan.role} • {product.artisan.experienceYears} বছরের অভিজ্ঞতা
                  </Text>
                  <Text style={styles.artisanStory}>{product.artisan.story}</Text>
                  <Text style={styles.artisanCoop}>
                    সমিতি: {product.artisan.cooperative}
                  </Text>
                </View>
              </View>
            )}

            {/* Description */}
            <Text style={styles.sectionHeading}>পণ্যের বিবরণ:</Text>
            <Text style={styles.description}>{product.description}</Text>

            {/* Features */}
            <Text style={styles.sectionHeading}>বিশেষ বৈশিষ্ট্যসমূহ:</Text>
            <View style={styles.featureList}>
              {product.features.map((feat, i) => (
                <View key={i} style={styles.featureRow}>
                  <Ionicons name="sparkles" size={12} color={THEME_ACCENT} />
                  <Text style={styles.featureText}>{feat}</Text>
                </View>
              ))}
            </View>

            {/* Craft Specs */}
            {product.dimensionsMeta && (
              <View style={styles.specsBox}>
                <Text style={styles.specsTitle}>কারিগরির উপকরণ ও স্পেসিফিকেশন</Text>
                <View style={styles.specRow}>
                  <Text style={styles.specLabel}>উপকরণ:</Text>
                  <Text style={styles.specVal}>{product.dimensionsMeta.materials}</Text>
                </View>
                <View style={styles.specRow}>
                  <Text style={styles.specLabel}>তৈরির পদ্ধতি:</Text>
                  <Text style={styles.specVal}>{product.dimensionsMeta.craftMethod}</Text>
                </View>
                <View style={styles.specRow}>
                  <Text style={styles.specLabel}>প্যাকেজিং:</Text>
                  <Text style={styles.specVal}>{product.dimensionsMeta.packaging}</Text>
                </View>
              </View>
            )}

            {/* Customer Reviews Snippet */}
            {product.customerReviews && product.customerReviews.length > 0 && (
              <View style={styles.reviewsSection}>
                <Text style={styles.sectionHeading}>
                  ক্রেতাদের অভিজ্ঞতা ও রিভিউ ({product.customerReviews.length}):
                </Text>
                {product.customerReviews.map((rev) => (
                  <View key={rev.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewAuthor}>{rev.author}</Text>
                      <View style={styles.starRow}>
                        <Ionicons name="star" size={12} color="#D97706" />
                        <Text style={styles.reviewRating}>{rev.rating}</Text>
                      </View>
                    </View>
                    <Text style={styles.reviewComment}>{rev.comment}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Actions */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.bargainCta}
                onPress={handleBargain}
              >
                <Ionicons name="chatbubbles" size={16} color={THEME_ACCENT} />
                <Text style={styles.bargainCtaText}>দরদাম করুন</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addCartCta}
                onPress={handleAddToCart}
              >
                <Ionicons name="cart" size={16} color="#FFF" />
                <Text style={styles.addCartCtaText}>কার্টে যোগ করুন</Text>
              </TouchableOpacity>
            </View>
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
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    padding: 16,
  },
  imageContainer: {
    height: 220,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#F3F4F6",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  giBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: THEME_EMERALD,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  giBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  thumbRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 12,
  },
  thumbBtn: {
    width: 50,
    height: 50,
    borderRadius: 8,
    overflow: "hidden",
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbBtnActive: {
    borderColor: THEME_PRIMARY,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  metaSection: {
    marginVertical: 10,
  },
  banglaName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  englishName: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 8,
  },
  currency: {
    fontSize: 16,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  price: {
    fontSize: 22,
    fontWeight: "900",
    color: THEME_PRIMARY,
  },
  origPrice: {
    fontSize: 12,
    color: "#94A3B8",
    textDecorationLine: "line-through",
    marginLeft: 4,
  },
  unitBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: "auto",
  },
  unitText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  artisanCard: {
    flexDirection: "row",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginVertical: 12,
  },
  artisanAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  artisanInfo: {
    flex: 1,
  },
  artisanNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  artisanName: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  artisanRole: {
    fontSize: 11,
    color: "#B45309",
    marginTop: 2,
  },
  artisanStory: {
    fontSize: 11,
    color: "#475569",
    marginTop: 4,
    lineHeight: 16,
  },
  artisanCoop: {
    fontSize: 10,
    color: "#78350F",
    marginTop: 4,
    fontWeight: "600",
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 12,
    marginBottom: 6,
  },
  description: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
  },
  featureList: {
    gap: 4,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featureText: {
    fontSize: 12,
    color: "#334155",
  },
  specsBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
    marginVertical: 12,
    gap: 4,
  },
  specsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  specLabel: {
    fontSize: 11,
    color: "#64748B",
  },
  specVal: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E293B",
  },
  reviewsSection: {
    marginTop: 8,
  },
  reviewCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  reviewAuthor: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E293B",
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reviewRating: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  reviewComment: {
    fontSize: 11,
    color: "#475569",
    lineHeight: 15,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    marginBottom: 24,
  },
  bargainCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    paddingVertical: 14,
    borderRadius: 12,
  },
  bargainCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME_ACCENT,
  },
  addCartCta: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: THEME_PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addCartCtaText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
});
