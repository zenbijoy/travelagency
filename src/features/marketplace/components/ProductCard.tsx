import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { EnrichedProduct } from "../types";
import { useMarketplaceStore } from "../store/marketplaceStore";

interface ProductCardProps {
  product: EnrichedProduct;
  onPress: (product: EnrichedProduct) => void;
  onInspectGi?: (giCode: string, productId: string) => void;
}

const THEME_PRIMARY = "#78350F";
const THEME_ACCENT = "#D97706";
const THEME_EMERALD = "#059669";

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onInspectGi,
}) => {
  const addToCart = useMarketplaceStore((s) => s.addToCart);
  const openBargainModal = useMarketplaceStore((s) => s.openBargainModal);
  const activeBargain = useMarketplaceStore((s) => s.activeBargains[product.id]);

  const isNegotiated =
    activeBargain?.status === "accepted" ||
    activeBargain?.status === "auto_accepted";
  const displayPrice = isNegotiated
    ? activeBargain.agreedUnitPriceBdt ??
      activeBargain.counterUnitPriceBdt ??
      product.price
    : product.price;

  const discountPercent = product.original_price
    ? Math.round(
        ((product.original_price - product.price) / product.original_price) * 100
      )
    : 0;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => onPress(product)}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: product.image_url }}
          style={styles.image}
          resizeMode="cover"
        />

        <View style={styles.regionPill}>
          <Ionicons name="location-sharp" size={11} color="#FFF" />
          <Text style={styles.regionPillText}>{product.region}</Text>
        </View>

        {product.giCertified && (
          <TouchableOpacity
            style={styles.giPill}
            onPress={() => onInspectGi?.(product.giCode, product.id)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="certificate" size={12} color="#FFF" />
            <Text style={styles.giPillText}>GI Verified</Text>
          </TouchableOpacity>
        )}

        {discountPercent > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>-{discountPercent}%</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.banglaName} numberOfLines={1}>
          {product.bangla_name}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>

        <View style={styles.artisanRow}>
          <Ionicons name="shield-checkmark" size={13} color={THEME_EMERALD} />
          <Text style={styles.artisanName} numberOfLines={1}>
            {product.artisan?.name || product.seller_name}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.weightText}>{product.weight_or_unit}</Text>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color="#D97706" />
            <Text style={styles.ratingText}>{product.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCountText}>({product.reviews_count})</Text>
          </View>
        </View>

        {isNegotiated && (
          <View style={styles.bargainLockedTag}>
            <Ionicons name="pricetag" size={11} color={THEME_EMERALD} />
            <Text style={styles.bargainLockedText}>
              Negotiated: ৳{displayPrice}
            </Text>
          </View>
        )}

        <View style={styles.footerRow}>
          <View>
            <View style={styles.priceRow}>
              <Text style={styles.currencySymbol}>৳</Text>
              <Text style={styles.priceText}>{displayPrice}</Text>
            </View>
            {product.original_price && (
              <Text style={styles.originalPrice}>৳{product.original_price}</Text>
            )}
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.bargainButton}
              onPress={() => openBargainModal(product.id)}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubbles-outline" size={14} color={THEME_ACCENT} />
              <Text style={styles.bargainButtonText}>দরদাম</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cartButton}
              onPress={() =>
                addToCart(
                  product,
                  1,
                  isNegotiated ? displayPrice : undefined,
                  isNegotiated ? activeBargain?.id : undefined
                )
              }
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={15} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  imageContainer: {
    height: 160,
    width: "100%",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  regionPill: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  regionPillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  giPill: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME_EMERALD,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  giPillText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  discountBadge: {
    position: "absolute",
    bottom: 8,
    left: 10,
    backgroundColor: "#DC2626",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  content: {
    padding: 12,
  },
  banglaName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 2,
  },
  name: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 6,
  },
  artisanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  artisanName: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  weightText: {
    fontSize: 11,
    color: "#94A3B8",
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
  },
  reviewCountText: {
    fontSize: 10,
    color: "#94A3B8",
  },
  bargainLockedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  bargainLockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME_EMERALD,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME_PRIMARY,
  },
  priceText: {
    fontSize: 18,
    fontWeight: "800",
    color: THEME_PRIMARY,
  },
  originalPrice: {
    fontSize: 11,
    color: "#94A3B8",
    textDecorationLine: "line-through",
  },
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bargainButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  bargainButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME_ACCENT,
  },
  cartButton: {
    backgroundColor: THEME_PRIMARY,
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
