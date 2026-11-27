import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Switch,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  PriceType,
  ProviderServiceItem,
  ServiceCategory,
  useProviderHubStore,
} from "@/features/rider/providerStore";
import { VEHICLE_TIERS } from "@/features/rider/calculators";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

const CATEGORIES: ServiceCategory[] = [
  "Tour Guide",
  "Car Rental",
  "Restaurant",
  "Event",
  "Photographer",
  "Local Expert",
];
const PRICE_TYPES: PriceType[] = ["hourly", "fixed", "per person"];

const CATEGORY_ICONS: Record<ServiceCategory, keyof typeof Ionicons.glyphMap> = {
  "Tour Guide": "compass-outline",
  "Car Rental": "car-outline",
  Restaurant: "restaurant-outline",
  Event: "calendar-outline",
  Photographer: "camera-outline",
  "Local Expert": "person-outline",
};

export default function ProviderServicesScreen() {
  const services = useProviderHubStore((s) => s.services);
  const portfolioUris = useProviderHubStore((s) => s.portfolioUris);
  const isHydrated = useProviderHubStore((s) => s.isHydrated);
  const hydrateProviderHub = useProviderHubStore((s) => s.hydrateProviderHub);
  const addService = useProviderHubStore((s) => s.addService);
  const toggleServiceStatus = useProviderHubStore((s) => s.toggleServiceStatus);
  const addPortfolioPhoto = useProviderHubStore((s) => s.addPortfolioPhoto);

  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("Tour Guide");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [duration, setDuration] = useState("6h");
  const [maxGroup, setMaxGroup] = useState("6");
  const [area, setArea] = useState("Dhaka Metro");
  const [certifications, setCertifications] = useState("Verified Partner");
  const [instantBooking, setInstantBooking] = useState(true);
  const [draftPhotos, setDraftPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!isHydrated) {
      hydrateProviderHub().catch(() => {});
    }
  }, [isHydrated, hydrateProviderHub]);

  const handlePickPhoto = async (forPortfolio = false) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        mediaTypes: ["images"],
      });
      if (!result.canceled && result.assets[0]?.uri) {
        if (forPortfolio) {
          addPortfolioPhoto(result.assets[0].uri);
        } else {
          setDraftPhotos((prev) => [...prev.slice(0, 7), result.assets[0].uri]);
        }
      }
    } catch {
      Alert.alert("Media Access", "Could not open image library.");
    }
  };

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Service name is required.");
      return;
    }
    const numericPrice = Math.max(100, parseFloat(price) || 1500);
    await addService({
      title: title.trim(),
      category,
      description: description.trim() || "Verified ShopnoJatra mobility & travel service.",
      priceBdt: numericPrice,
      priceType,
      duration: duration.trim() || "4h",
      maxGroup: Math.max(1, parseInt(maxGroup, 10) || 4),
      area: area.trim() || "Dhaka",
      certifications: certifications.trim() || "Verified",
      instantBooking,
      photoUrls: draftPhotos,
    });
    setShowModal(false);
    setTitle("");
    setDescription("");
    setPrice("");
    setDraftPhotos([]);
  }, [
    addService,
    title,
    category,
    description,
    price,
    priceType,
    duration,
    maxGroup,
    area,
    certifications,
    instantBooking,
    draftPhotos,
  ]);

  // Compute dynamic market benchmark based on real VEHICLE_TIERS & active services
  const benchmarkRates = [
    {
      segment: "Moto Dispatch Tier",
      benchmark: `৳${VEHICLE_TIERS.bike.baseFareBdt} base + ৳${VEHICLE_TIERS.bike.perKmBdt}/km`,
      detail: VEHICLE_TIERS.bike.tagline,
    },
    {
      segment: "Sedan Chauffeur Tier",
      benchmark: `৳${VEHICLE_TIERS.sedan.baseFareBdt} base + ৳${VEHICLE_TIERS.sedan.perKmBdt}/km`,
      detail: VEHICLE_TIERS.sedan.tagline,
    },
    {
      segment: "Tourist SUV / Intercity",
      benchmark: `৳${VEHICLE_TIERS.suv.baseFareBdt} base + ৳${VEHICLE_TIERS.suv.perKmBdt}/km`,
      detail: VEHICLE_TIERS.suv.tagline,
    },
  ];

  const renderService = useCallback(
    ({ item }: { item: ProviderServiceItem }) => (
      <View style={styles.serviceCard}>
        <View style={styles.serviceCardHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: TEAL + "22" }]}>
            <Ionicons name={CATEGORY_ICONS[item.category]} size={22} color={TEAL} />
          </View>
          <View style={styles.serviceInfo}>
            <Text style={styles.serviceTitle}>{item.title}</Text>
            <Text style={styles.serviceCategory}>{item.category}</Text>
            <Text style={styles.serviceMeta}>
              ⏱ {item.duration} · 👥 Max {item.maxGroup} · 📸 {item.photoUrls.length} photos
            </Text>
          </View>
          <View style={styles.serviceRight}>
            <Text style={styles.servicePrice}>৳{item.priceBdt.toLocaleString()}</Text>
            <Text style={styles.servicePriceType}>/{item.priceType}</Text>
            <Switch
              value={item.status === "Active"}
              onValueChange={() => toggleServiceStatus(item.id)}
              trackColor={{ false: "#334155", true: TEAL }}
              thumbColor="#fff"
            />
          </View>
        </View>
        <View style={styles.serviceFooter}>
          <Text
            style={[
              styles.statusBadge,
              {
                backgroundColor: item.status === "Active" ? "#065F46" : "#7F1D1D",
                color: item.status === "Active" ? "#6EE7B7" : "#FCA5A5",
              },
            ]}
          >
            {item.status}
          </Text>
          {item.instantBooking && (
            <Text style={styles.instantBadge}>⚡ Instant Book</Text>
          )}
          <Text style={styles.serviceArea}>📍 {item.area}</Text>
        </View>
      </View>
    ),
    [toggleServiceStatus]
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>🛠️ My Services</Text>
          <Pressable style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Service</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgesRow}>
          {[
            { label: "BRTA/KYC Verified", emoji: "✅" },
            { label: "Top Rated Partner", emoji: "⭐" },
            { label: "Fair Surge Compliant", emoji: "🛡️" },
          ].map((b) => (
            <View key={b.label} style={styles.badge}>
              <Text style={styles.badgeText}>
                {b.emoji} {b.label}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>Published Catalog ({services.length})</Text>
        <FlatList
          data={services}
          renderItem={renderService}
          keyExtractor={(i) => i.id}
          scrollEnabled={false}
        />

        <Text style={styles.sectionTitle}>Portfolio Gallery ({portfolioUris.length})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioRow}>
          {portfolioUris.map((uri, i) => (
            <Image
              key={`${uri}-${i}`}
              source={{ uri }}
              style={styles.portfolioImage}
            />
          ))}
          <Pressable
            style={[styles.portfolioCard, styles.portfolioAdd]}
            onPress={() => handlePickPhoto(true)}
          >
            <Ionicons name="add-circle-outline" size={30} color={TEAL} />
            <Text style={[styles.portfolioLabel, { color: TEAL }]}>Upload Photo</Text>
          </Pressable>
        </ScrollView>

        <Text style={styles.sectionTitle}>Live Mobility Tier Benchmarks</Text>
        {benchmarkRates.map((comp) => (
          <View key={comp.segment} style={styles.compCard}>
            <View style={styles.compInfo}>
              <Text style={styles.compName}>{comp.segment}</Text>
              <Text style={styles.compService}>{comp.detail}</Text>
            </View>
            <View style={styles.compMeta}>
              <Text style={styles.compPrice}>{comp.benchmark}</Text>
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Service Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Service Offering</Text>
            <Pressable onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Service Name *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Dhaka Airport Chauffeur Transfer"
              placeholderTextColor="#475569"
            />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.catChip, category === cat && styles.catChipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      category === cat && styles.catChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe routes, vehicle, or guide inclusions..."
              placeholderTextColor="#475569"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Price Type</Text>
            <View style={styles.priceTypeRow}>
              {PRICE_TYPES.map((pt) => (
                <Pressable
                  key={pt}
                  style={[
                    styles.priceTypeBtn,
                    priceType === pt && styles.priceTypeBtnActive,
                  ]}
                  onPress={() => setPriceType(pt)}
                >
                  <Text
                    style={[
                      styles.priceTypeBtnText,
                      priceType === pt && styles.priceTypeBtnTextActive,
                    ]}
                  >
                    {pt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Price (৳)</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. 2500"
              placeholderTextColor="#475569"
              keyboardType="numeric"
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Duration</Text>
                <TextInput
                  style={styles.input}
                  value={duration}
                  onChangeText={setDuration}
                  placeholder="e.g. 8h"
                  placeholderTextColor="#475569"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.fieldLabel}>Max Group</Text>
                <TextInput
                  style={styles.input}
                  value={maxGroup}
                  onChangeText={setMaxGroup}
                  placeholder="e.g. 6"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Service Area</Text>
            <TextInput
              style={styles.input}
              value={area}
              onChangeText={setArea}
              placeholder="e.g. Cox's Bazar, Dhaka"
              placeholderTextColor="#475569"
            />

            <Text style={styles.fieldLabel}>Photos ({draftPhotos.length}/8)</Text>
            <View style={styles.photosRow}>
              {draftPhotos.map((uri, i) => (
                <Image key={`${uri}-${i}`} source={{ uri }} style={styles.photoThumb} />
              ))}
              {draftPhotos.length < 8 && (
                <Pressable
                  style={styles.addPhotoBtn}
                  onPress={() => handlePickPhoto(false)}
                >
                  <Ionicons name="camera-outline" size={20} color="#94A3B8" />
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.fieldLabel}>Certifications</Text>
            <TextInput
              style={styles.input}
              value={certifications}
              onChangeText={setCertifications}
              placeholder="e.g. BRTA Licensed / Tourism Certified"
              placeholderTextColor="#475569"
            />

            <View style={styles.instantRow}>
              <Text style={styles.instantLabel}>Instant Booking</Text>
              <Switch
                value={instantBooking}
                onValueChange={setInstantBooking}
                trackColor={{ false: "#334155", true: TEAL }}
                thumbColor="#fff"
              />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Publish Service</Text>
            </Pressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    marginBottom: 16,
  },
  pageTitle: { color: "#F1F5F9", fontSize: 22, fontWeight: "700" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: TEAL,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  badgesRow: { marginBottom: 16 },
  badge: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: GOLD + "55",
  },
  badgeText: { color: GOLD, fontSize: 12, fontWeight: "600" },
  sectionTitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  serviceCard: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  serviceCardHeader: { flexDirection: "row", gap: 12, marginBottom: 10 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInfo: { flex: 1 },
  serviceTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  serviceCategory: { color: TEAL, fontSize: 12, marginBottom: 3 },
  serviceMeta: { color: "#64748B", fontSize: 11 },
  serviceRight: { alignItems: "flex-end", gap: 4 },
  servicePrice: { color: GOLD, fontSize: 16, fontWeight: "700" },
  servicePriceType: { color: "#64748B", fontSize: 10 },
  serviceFooter: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  instantBadge: { color: "#FBBF24", fontSize: 11, fontWeight: "600" },
  serviceArea: { color: "#64748B", fontSize: 11, marginLeft: "auto" },
  portfolioRow: { marginBottom: 20 },
  portfolioCard: {
    width: 100,
    height: 100,
    backgroundColor: NAVY_LIGHT,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  portfolioImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  portfolioAdd: { borderStyle: "dashed", borderColor: TEAL },
  portfolioLabel: { color: "#64748B", fontSize: 11, marginTop: 4 },
  compCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY_LIGHT,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  compInfo: { flex: 1 },
  compName: { color: "#F1F5F9", fontSize: 14, fontWeight: "600" },
  compService: { color: "#64748B", fontSize: 12 },
  compMeta: { alignItems: "flex-end" },
  compPrice: { color: GOLD, fontSize: 13, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: NAVY },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { color: "#F1F5F9", fontSize: 18, fontWeight: "700" },
  modalScroll: { flex: 1, padding: 16 },
  fieldLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#F1F5F9",
    fontSize: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    backgroundColor: NAVY_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  catChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  catChipText: { color: "#94A3B8", fontSize: 12 },
  catChipTextActive: { color: "#fff", fontWeight: "600" },
  priceTypeRow: { flexDirection: "row", gap: 8 },
  priceTypeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: NAVY_LIGHT,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  priceTypeBtnActive: { backgroundColor: TEAL, borderColor: TEAL },
  priceTypeBtnText: { color: "#94A3B8", fontSize: 12 },
  priceTypeBtnTextActive: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row" },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: 64, height: 64, borderRadius: 8 },
  addPhotoBtn: {
    width: 80,
    height: 64,
    backgroundColor: NAVY_LIGHT,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: { color: "#64748B", fontSize: 10, marginTop: 2 },
  instantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingVertical: 8,
  },
  instantLabel: { color: "#F1F5F9", fontSize: 14, fontWeight: "500" },
  saveBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
