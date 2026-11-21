import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, FlatList, Pressable,
  Modal, TextInput, Alert, Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

type ServiceCategory = "Tour Guide" | "Car Rental" | "Restaurant" | "Event" | "Photographer" | "Local Expert";
type PriceType = "hourly" | "fixed" | "per person";

interface Service {
  id: string;
  title: string;
  category: ServiceCategory;
  price: string;
  priceType: PriceType;
  duration: string;
  maxGroup: string;
  area: string;
  description: string;
  certifications: string;
  instantBooking: boolean;
  status: "Active" | "Inactive";
  photos: number;
}

const CATEGORIES: ServiceCategory[] = ["Tour Guide", "Car Rental", "Restaurant", "Event", "Photographer", "Local Expert"];
const PRICE_TYPES: PriceType[] = ["hourly", "fixed", "per person"];

const MOCK_SERVICES: Service[] = [
  { id: "1", title: "Cox's Bazar Full Day Tour", category: "Tour Guide", price: "2500", priceType: "fixed", duration: "8h", maxGroup: "12", area: "Cox's Bazar", description: "Complete beach tour", certifications: "Tourism Board Certified", instantBooking: true, status: "Active", photos: 6 },
  { id: "2", title: "Luxury Car Rental - Chittagong", category: "Car Rental", price: "3500", priceType: "per person", duration: "Full Day", maxGroup: "4", area: "Chittagong", description: "AC car with driver", certifications: "BRTA Licensed", instantBooking: false, status: "Active", photos: 4 },
  { id: "3", title: "Sundarbans Photography Tour", category: "Photographer", price: "5000", priceType: "fixed", duration: "2 days", maxGroup: "6", area: "Sundarbans", description: "Professional wildlife photography tour", certifications: "NID + Tourism Cert", instantBooking: true, status: "Inactive", photos: 8 },
];

const MOCK_COMPETITORS = [
  { name: "Sylhet Tours BD", service: "Tour Guide", price: "৳2,000", rating: 4.6 },
  { name: "Green Valley Travel", service: "Local Expert", price: "৳1,800", rating: 4.5 },
  { name: "Royal Travel Agency", service: "Car Rental", price: "৳3,000", rating: 4.3 },
];

const CATEGORY_ICONS: Record<ServiceCategory, keyof typeof Ionicons.glyphMap> = {
  "Tour Guide": "compass-outline",
  "Car Rental": "car-outline",
  "Restaurant": "restaurant-outline",
  "Event": "calendar-outline",
  "Photographer": "camera-outline",
  "Local Expert": "person-outline",
};

export default function ProviderServicesScreen() {
  const { isDesktop } = useResponsive();
  const [services, setServices] = useState<Service[]>(MOCK_SERVICES);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ServiceCategory>("Tour Guide");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("fixed");
  const [duration, setDuration] = useState("");
  const [maxGroup, setMaxGroup] = useState("");
  const [area, setArea] = useState("");
  const [certifications, setCertifications] = useState("");
  const [instantBooking, setInstantBooking] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);

  const handleSave = useCallback(() => {
    if (!title.trim()) { Alert.alert("Error", "Service name is required"); return; }
    const newService: Service = {
      id: Date.now().toString(), title: title.trim(), category, description, price,
      priceType, duration, maxGroup, area, certifications, instantBooking, status: "Active", photos: photoCount,
    };
    setServices(prev => [newService, ...prev]);
    setShowModal(false);
    setTitle(""); setDescription(""); setPrice(""); setDuration(""); setMaxGroup(""); setArea(""); setCertifications(""); setPhotoCount(0); setInstantBooking(false);
  }, [title, category, description, price, priceType, duration, maxGroup, area, certifications, instantBooking, photoCount]);

  const toggleStatus = useCallback((id: string) => {
    setServices(prev => prev.map(s => s.id === id ? { ...s, status: s.status === "Active" ? "Inactive" : "Active" } : s));
  }, []);

  const renderService = useCallback(({ item }: { item: Service }) => (
    <View style={styles.serviceCard}>
      <View style={styles.serviceCardHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: TEAL + "22" }]}>
          <Ionicons name={CATEGORY_ICONS[item.category]} size={22} color={TEAL} />
        </View>
        <View style={styles.serviceInfo}>
          <Text style={styles.serviceTitle}>{item.title}</Text>
          <Text style={styles.serviceCategory}>{item.category}</Text>
          <Text style={styles.serviceMeta}>⏱ {item.duration} · 👥 Max {item.maxGroup} · 📸 {item.photos} photos</Text>
        </View>
        <View style={styles.serviceRight}>
          <Text style={styles.servicePrice}>৳{item.price}</Text>
          <Text style={styles.servicePriceType}>/{item.priceType}</Text>
          <Switch value={item.status === "Active"} onValueChange={() => toggleStatus(item.id)} trackColor={{ false: "#334155", true: TEAL }} thumbColor="#fff" />
        </View>
      </View>
      <View style={styles.serviceFooter}>
        <Text style={[styles.statusBadge, { backgroundColor: item.status === "Active" ? "#065F46" : "#7F1D1D", color: item.status === "Active" ? "#6EE7B7" : "#FCA5A5" }]}>{item.status}</Text>
        {item.instantBooking && <Text style={styles.instantBadge}>⚡ Instant Book</Text>}
        <Text style={styles.serviceArea}>📍 {item.area}</Text>
      </View>
    </View>
  ), [toggleStatus]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header & Badges */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>🛠️ My Services</Text>
          <Pressable style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Service</Text>
          </Pressable>
        </View>

        {/* Badges */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgesRow}>
          {[{ label: "Verified", emoji: "✅" }, { label: "Top Rated", emoji: "⭐" }, { label: "Best Value", emoji: "💰" }].map(b => (
            <View key={b.label} style={styles.badge}>
              <Text style={styles.badgeText}>{b.emoji} {b.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Services List */}
        <Text style={styles.sectionTitle}>All Services ({services.length})</Text>
        <FlatList data={services} renderItem={renderService} keyExtractor={i => i.id} scrollEnabled={false} />

        {/* Portfolio */}
        <Text style={styles.sectionTitle}>Portfolio</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioRow}>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={styles.portfolioCard}>
              <Ionicons name="image-outline" size={30} color="#475569" />
              <Text style={styles.portfolioLabel}>Photo {i + 1}</Text>
            </View>
          ))}
          <Pressable style={[styles.portfolioCard, styles.portfolioAdd]} onPress={() => Alert.alert("Portfolio", "Add portfolio item")}>
            <Ionicons name="add-circle-outline" size={30} color={TEAL} />
            <Text style={[styles.portfolioLabel, { color: TEAL }]}>Add Item</Text>
          </Pressable>
        </ScrollView>

        {/* Competitor Analysis */}
        <Text style={styles.sectionTitle}>Competitor Analysis</Text>
        {MOCK_COMPETITORS.map((comp, i) => (
          <View key={i} style={styles.compCard}>
            <View style={styles.compInfo}>
              <Text style={styles.compName}>{comp.name}</Text>
              <Text style={styles.compService}>{comp.service}</Text>
            </View>
            <View style={styles.compMeta}>
              <Text style={styles.compPrice}>{comp.price}</Text>
              <Text style={styles.compRating}>⭐ {comp.rating}</Text>
            </View>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Service Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Service</Text>
            <Pressable onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#94A3B8" /></Pressable>
          </View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.fieldLabel}>Service Name *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. Cox's Bazar Tour" placeholderTextColor="#475569" />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map(cat => (
                <Pressable key={cat} style={[styles.catChip, category === cat && styles.catChipActive]} onPress={() => setCategory(cat)}>
                  <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Describe your service..." placeholderTextColor="#475569" multiline numberOfLines={3} />

            <Text style={styles.fieldLabel}>Price Type</Text>
            <View style={styles.priceTypeRow}>
              {PRICE_TYPES.map(pt => (
                <Pressable key={pt} style={[styles.priceTypeBtn, priceType === pt && styles.priceTypeBtnActive]} onPress={() => setPriceType(pt)}>
                  <Text style={[styles.priceTypeBtnText, priceType === pt && styles.priceTypeBtnTextActive]}>{pt}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Price (৳)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="e.g. 2500" placeholderTextColor="#475569" keyboardType="numeric" />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Duration</Text>
                <TextInput style={styles.input} value={duration} onChangeText={setDuration} placeholder="e.g. 8h" placeholderTextColor="#475569" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.fieldLabel}>Max Group</Text>
                <TextInput style={styles.input} value={maxGroup} onChangeText={setMaxGroup} placeholder="e.g. 10" placeholderTextColor="#475569" keyboardType="numeric" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Service Area</Text>
            <TextInput style={styles.input} value={area} onChangeText={setArea} placeholder="e.g. Cox's Bazar, Chittagong" placeholderTextColor="#475569" />

            <Text style={styles.fieldLabel}>Photos (up to 8)</Text>
            <View style={styles.photosRow}>
              {Array.from({ length: Math.min(photoCount, 8) }, (_, i) => (
                <View key={i} style={styles.photoPlaceholder}><Ionicons name="image" size={20} color={TEAL} /></View>
              ))}
              {photoCount < 8 && (
                <Pressable style={styles.addPhotoBtn} onPress={() => setPhotoCount(c => Math.min(c + 1, 8))}>
                  <Ionicons name="camera-outline" size={20} color="#94A3B8" />
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </Pressable>
              )}
            </View>

            <Text style={styles.fieldLabel}>Certifications</Text>
            <TextInput style={styles.input} value={certifications} onChangeText={setCertifications} placeholder="e.g. Tourism Board Certified" placeholderTextColor="#475569" />

            <View style={styles.instantRow}>
              <Text style={styles.instantLabel}>Instant Booking</Text>
              <Switch value={instantBooking} onValueChange={setInstantBooking} trackColor={{ false: "#334155", true: TEAL }} thumbColor="#fff" />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>Save Service</Text></Pressable>
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 20, marginBottom: 16 },
  pageTitle: { color: "#F1F5F9", fontSize: 20, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: TEAL, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  badgesRow: { marginBottom: 20 },
  badge: { backgroundColor: NAVY_LIGHT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: GOLD },
  badgeText: { color: GOLD, fontSize: 13, fontWeight: "600" },
  sectionTitle: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  serviceCard: { backgroundColor: NAVY_LIGHT, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: BORDER },
  serviceCardHeader: { flexDirection: "row", gap: 12, marginBottom: 10 },
  categoryIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  serviceInfo: { flex: 1 },
  serviceTitle: { color: "#F1F5F9", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  serviceCategory: { color: TEAL, fontSize: 12, marginBottom: 2 },
  serviceMeta: { color: "#64748B", fontSize: 11 },
  serviceRight: { alignItems: "flex-end", gap: 2 },
  servicePrice: { color: GOLD, fontSize: 16, fontWeight: "700" },
  servicePriceType: { color: "#64748B", fontSize: 10 },
  serviceFooter: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: "700", overflow: "hidden" },
  instantBadge: { backgroundColor: "#1D4ED822", color: "#93C5FD", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: "600", overflow: "hidden" },
  serviceArea: { color: "#64748B", fontSize: 11 },
  portfolioRow: { marginBottom: 20 },
  portfolioCard: { width: 90, height: 90, backgroundColor: NAVY_LIGHT, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 10, borderWidth: 1, borderColor: BORDER },
  portfolioAdd: { borderColor: TEAL, borderStyle: "dashed" },
  portfolioLabel: { color: "#64748B", fontSize: 10, marginTop: 4 },
  compCard: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY_LIGHT, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  compInfo: { flex: 1 },
  compName: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  compService: { color: "#94A3B8", fontSize: 11 },
  compMeta: { alignItems: "flex-end", gap: 2 },
  compPrice: { color: GOLD, fontSize: 14, fontWeight: "700" },
  compRating: { color: "#F59E0B", fontSize: 12 },
  modalContainer: { flex: 1, backgroundColor: NAVY },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: BORDER },
  modalTitle: { color: "#F1F5F9", fontSize: 18, fontWeight: "700" },
  modalScroll: { flex: 1, padding: 16 },
  fieldLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginBottom: 6, marginTop: 12, textTransform: "uppercase" },
  input: { backgroundColor: NAVY_LIGHT, borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, color: "#F1F5F9", fontSize: 14, marginBottom: 4 },
  textArea: { height: 80, textAlignVertical: "top" },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: NAVY_LIGHT, borderWidth: 1, borderColor: BORDER },
  catChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  catChipText: { color: "#94A3B8", fontSize: 12 },
  catChipTextActive: { color: "#fff", fontWeight: "600" },
  priceTypeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  priceTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: "center" },
  priceTypeBtnActive: { backgroundColor: TEAL, borderColor: TEAL },
  priceTypeBtnText: { color: "#94A3B8", fontSize: 12 },
  priceTypeBtnTextActive: { color: "#fff", fontWeight: "600" },
  row: { flexDirection: "row" },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  photoPlaceholder: { width: 56, height: 56, backgroundColor: TEAL + "22", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  addPhotoBtn: { width: 56, height: 56, backgroundColor: NAVY_LIGHT, borderRadius: 8, borderWidth: 1, borderColor: BORDER, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  addPhotoText: { color: "#64748B", fontSize: 9, marginTop: 2 },
  instantRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 12 },
  instantLabel: { color: "#F1F5F9", fontSize: 15, fontWeight: "600" },
  saveBtn: { backgroundColor: TEAL, paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
