import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Switch,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useResponsive } from "@/hooks/useResponsive";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";

type RoomType = "Single" | "Double" | "Suite" | "Deluxe";
type RoomStatus = "Available" | "Occupied" | "Maintenance";

interface Amenity {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface Room {
  id: string;
  number: string;
  type: RoomType;
  pricePerNight: number;
  status: RoomStatus;
  maxGuests: number;
  amenities: string[];
  photos: string[];
  aiTags: string[];
  dynamicPricingEnabled: boolean;
  seasonalMultiplier: number;
}

const AMENITIES: Amenity[] = [
  { id: "wifi", label: "WiFi", icon: "wifi-outline" },
  { id: "ac", label: "Air Conditioning", icon: "snow-outline" },
  { id: "tv", label: "TV", icon: "tv-outline" },
  { id: "minibar", label: "Mini Bar", icon: "wine-outline" },
  { id: "balcony", label: "Balcony", icon: "partly-sunny-outline" },
  { id: "jacuzzi", label: "Jacuzzi", icon: "water-outline" },
  { id: "parking", label: "Parking", icon: "car-outline" },
  { id: "breakfast", label: "Breakfast", icon: "restaurant-outline" },
];

const AI_TAGS_BY_TYPE: Record<RoomType, string[]> = {
  Single: ["City View", "Quiet Floor"],
  Double: ["Garden View", "Couple Suite"],
  Suite: ["Ocean View", "Premium", "VIP"],
  Deluxe: ["Mountain View", "Luxury", "Corner Room"],
};

const INITIAL_ROOMS: Room[] = [
  { id: "1", number: "101", type: "Single", pricePerNight: 3200, status: "Available", maxGuests: 1, amenities: ["wifi", "ac", "tv"], photos: [], aiTags: ["City View", "Quiet Floor"], dynamicPricingEnabled: false, seasonalMultiplier: 1.0 },
  { id: "2", number: "201", type: "Double", pricePerNight: 5500, status: "Occupied", maxGuests: 2, amenities: ["wifi", "ac", "tv", "minibar"], photos: [], aiTags: ["Garden View", "Couple Suite"], dynamicPricingEnabled: true, seasonalMultiplier: 1.2 },
  { id: "3", number: "301", type: "Suite", pricePerNight: 12000, status: "Available", maxGuests: 4, amenities: ["wifi", "ac", "tv", "minibar", "jacuzzi", "balcony"], photos: [], aiTags: ["Ocean View", "Premium", "VIP"], dynamicPricingEnabled: true, seasonalMultiplier: 1.5 },
  { id: "4", number: "401", type: "Deluxe", pricePerNight: 8500, status: "Maintenance", maxGuests: 3, amenities: ["wifi", "ac", "tv", "balcony", "parking"], photos: [], aiTags: ["Mountain View", "Luxury"], dynamicPricingEnabled: false, seasonalMultiplier: 1.0 },
];

const STATUS_COLORS: Record<RoomStatus, string> = {
  Available: GREEN,
  Occupied: RED,
  Maintenance: YELLOW,
};

function StatusBadge({ status }: { status: RoomStatus }) {
  return (
    <View style={[badge.container, { backgroundColor: STATUS_COLORS[status] + "33" }]}>
      <View style={[badge.dot, { backgroundColor: STATUS_COLORS[status] }]} />
      <Text style={[badge.text, { color: STATUS_COLORS[status] }]}>{status}</Text>
    </View>
  );
}

function AiTagChip({ label }: { label: string }) {
  return (
    <View style={chip.container}>
      <Ionicons name="sparkles" size={10} color={GOLD} />
      <Text style={chip.text}>{label}</Text>
    </View>
  );
}

interface RoomModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (room: Omit<Room, "id">) => void;
  initial?: Room | null;
}

function RoomModal({ visible, onClose, onSave, initial }: RoomModalProps) {
  const [number, setNumber] = useState(initial?.number ?? "");
  const [type, setType] = useState<RoomType>(initial?.type ?? "Single");
  const [price, setPrice] = useState(String(initial?.pricePerNight ?? ""));
  const [maxGuests, setMaxGuests] = useState(String(initial?.maxGuests ?? "1"));
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(initial?.amenities ?? []);
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [dynamicPricing, setDynamicPricing] = useState(initial?.dynamicPricingEnabled ?? false);
  const [multiplier, setMultiplier] = useState(String(initial?.seasonalMultiplier ?? "1.0"));
  const [galleryIndex, setGalleryIndex] = useState(0);

  const toggleAmenity = (id: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const pickImage = async () => {
    if (photos.length >= 10) {
      Alert.alert("Limit reached", "Max 10 photos per room.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const handleSave = () => {
    if (!number || !price) {
      Alert.alert("Error", "Room number and price are required.");
      return;
    }
    onSave({
      number,
      type,
      pricePerNight: Number(price),
      status: "Available",
      maxGuests: Number(maxGuests),
      amenities: selectedAmenities,
      photos,
      aiTags: AI_TAGS_BY_TYPE[type],
      dynamicPricingEnabled: dynamicPricing,
      seasonalMultiplier: Number(multiplier),
    });
    onClose();
  };

  const ROOM_TYPES: RoomType[] = ["Single", "Double", "Suite", "Deluxe"];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modal.overlay}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>{initial ? "Edit Room" : "Add New Room"}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </Pressable>
          </View>
          <ScrollView style={modal.scroll}>
            <Text style={modal.label}>Room Number</Text>
            <TextInput style={modal.input} value={number} onChangeText={setNumber} placeholder="e.g. 101" placeholderTextColor="#64748B" />

            <Text style={modal.label}>Room Type</Text>
            <View style={modal.typeRow}>
              {ROOM_TYPES.map((t) => (
                <Pressable key={t} style={[modal.typeBtn, type === t && modal.typeBtnActive]} onPress={() => setType(t)}>
                  <Text style={[modal.typeText, type === t && modal.typeTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={modal.label}>Price / Night (৳)</Text>
            <TextInput style={modal.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="e.g. 5000" placeholderTextColor="#64748B" />

            <Text style={modal.label}>Max Guests</Text>
            <TextInput style={modal.input} value={maxGuests} onChangeText={setMaxGuests} keyboardType="numeric" placeholder="e.g. 2" placeholderTextColor="#64748B" />

            <Text style={modal.label}>Amenities</Text>
            <View style={modal.amenitiesGrid}>
              {AMENITIES.map((amenity) => {
                const selected = selectedAmenities.includes(amenity.id);
                return (
                  <Pressable
                    key={amenity.id}
                    style={[modal.amenityChip, selected && modal.amenityChipActive]}
                    onPress={() => toggleAmenity(amenity.id)}
                  >
                    <Ionicons name={amenity.icon} size={14} color={selected ? GOLD : "#94A3B8"} />
                    <Text style={[modal.amenityText, selected && modal.amenityTextActive]}>{amenity.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={modal.row}>
              <Text style={modal.label}>Dynamic Pricing</Text>
              <Switch value={dynamicPricing} onValueChange={setDynamicPricing} thumbColor={dynamicPricing ? GOLD : "#64748B"} trackColor={{ false: "#334155", true: GOLD + "66" }} />
            </View>
            {dynamicPricing && (
              <>
                <Text style={modal.label}>Seasonal Multiplier</Text>
                <TextInput style={modal.input} value={multiplier} onChangeText={setMultiplier} keyboardType="decimal-pad" placeholder="e.g. 1.5" placeholderTextColor="#64748B" />
              </>
            )}

            <Text style={modal.label}>Photos ({photos.length}/10)</Text>
            <Pressable style={modal.photoBtn} onPress={pickImage}>
              <Ionicons name="camera-outline" size={20} color={GOLD} />
              <Text style={modal.photoBtnText}>Upload Photo</Text>
            </Pressable>

            {photos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {photos.map((uri, idx) => (
                  <View key={idx} style={modal.photoThumb}>
                    <Image source={{ uri }} style={modal.photoImage} />
                    <Pressable
                      style={modal.photoRemove}
                      onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Ionicons name="close-circle" size={18} color={RED} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </ScrollView>

          <Pressable style={modal.saveBtn} onPress={handleSave}>
            <Text style={modal.saveBtnText}>{initial ? "Update Room" : "Add Room"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function RoomsScreen() {
  const { isDesktop, getGridItemWidth } = useResponsive();
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const numCols = isDesktop ? 3 : 1;
  const itemWidth = getGridItemWidth(12, 16, numCols);

  const handleSave = (data: Omit<Room, "id">) => {
    if (editingRoom) {
      setRooms((prev) =>
        prev.map((r) => (r.id === editingRoom.id ? { ...data, id: editingRoom.id } : r))
      );
    } else {
      setRooms((prev) => [...prev, { ...data, id: String(Date.now()) }]);
    }
    setEditingRoom(null);
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Room", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => setRooms((prev) => prev.filter((r) => r.id !== id)) },
    ]);
  };

  const renderRoom = ({ item }: { item: Room }) => (
    <View style={[roomCard.container, { width: numCols > 1 ? itemWidth : "100%" }]}>
      <View style={roomCard.photoArea}>
        {item.photos.length > 0 ? (
          <Image source={{ uri: item.photos[0] }} style={roomCard.photo} />
        ) : (
          <View style={roomCard.photoPlaceholder}>
            <Ionicons name="bed-outline" size={40} color="#334155" />
          </View>
        )}
        <StatusBadge status={item.status} />
      </View>

      <View style={roomCard.body}>
        <View style={roomCard.row}>
          <Text style={roomCard.number}>Room {item.number}</Text>
          <Text style={roomCard.type}>{item.type}</Text>
        </View>
        <Text style={roomCard.price}>৳{item.pricePerNight.toLocaleString()}/night</Text>
        {item.dynamicPricingEnabled && (
          <Text style={roomCard.dynPrice}>Dynamic: ×{item.seasonalMultiplier}</Text>
        )}
        <Text style={roomCard.guests}>Up to {item.maxGuests} guests</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          {item.aiTags.map((tag) => (
            <AiTagChip key={tag} label={tag} />
          ))}
        </ScrollView>

        <View style={roomCard.amenitiesRow}>
          {item.amenities.slice(0, 4).map((aid) => {
            const a = AMENITIES.find((x) => x.id === aid);
            return a ? <Ionicons key={aid} name={a.icon} size={14} color="#64748B" /> : null;
          })}
          {item.amenities.length > 4 && (
            <Text style={roomCard.moreAmenities}>+{item.amenities.length - 4}</Text>
          )}
        </View>

        <View style={roomCard.actions}>
          <Pressable
            style={roomCard.editBtn}
            onPress={() => { setEditingRoom(item); setModalVisible(true); }}
          >
            <Ionicons name="pencil-outline" size={14} color={GOLD} />
            <Text style={roomCard.editText}>Edit</Text>
          </Pressable>
          <Pressable style={roomCard.deleteBtn} onPress={() => handleDelete(item.id)}>
            <Ionicons name="trash-outline" size={14} color={RED} />
            <Text style={roomCard.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Room Management</Text>
        <Pressable style={styles.addBtn} onPress={() => { setEditingRoom(null); setModalVisible(true); }}>
          <Ionicons name="add" size={18} color={NAVY} />
          <Text style={styles.addBtnText}>Add Room</Text>
        </Pressable>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        numColumns={numCols}
        key={numCols}
        columnWrapperStyle={numCols > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <RoomModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingRoom(null); }}
        onSave={handleSave}
        initial={editingRoom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 52 },
  title: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addBtnText: { color: NAVY, fontWeight: "700", fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 32 },
});

const roomCard = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 16, marginBottom: 14, overflow: "hidden" },
  photoArea: { height: 160, position: "relative" },
  photo: { width: "100%", height: "100%", resizeMode: "cover" },
  photoPlaceholder: { width: "100%", height: "100%", backgroundColor: "#1E3A5F", alignItems: "center", justifyContent: "center" },
  body: { padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  number: { fontSize: 16, fontWeight: "800", color: "#F1F5F9" },
  type: { fontSize: 12, color: "#94A3B8", backgroundColor: "#334155", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  price: { fontSize: 15, fontWeight: "700", color: GOLD, marginBottom: 2 },
  dynPrice: { fontSize: 11, color: "#A855F7", marginBottom: 4 },
  guests: { fontSize: 12, color: "#64748B", marginBottom: 6 },
  amenitiesRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6, marginBottom: 10 },
  moreAmenities: { color: "#64748B", fontSize: 11 },
  actions: { flexDirection: "row", gap: 8 },
  editBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: GOLD + "22", borderRadius: 10, paddingVertical: 8 },
  editText: { color: GOLD, fontSize: 13, fontWeight: "600" },
  deleteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: RED + "22", borderRadius: 10, paddingVertical: 8 },
  deleteText: { color: RED, fontSize: 13, fontWeight: "600" },
});

const badge = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 4, position: "absolute", top: 10, right: 10, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: "700" },
});

const chip = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD + "22", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginRight: 6 },
  text: { color: GOLD, fontSize: 10, fontWeight: "600" },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  container: { backgroundColor: NAVY_LIGHT, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", paddingBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#334155" },
  title: { fontSize: 18, fontWeight: "800", color: "#F1F5F9" },
  scroll: { paddingHorizontal: 20, paddingTop: 12, maxHeight: 480 },
  label: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#0F172A", borderRadius: 12, padding: 14, color: "#F1F5F9", fontSize: 14, borderWidth: 1, borderColor: "#334155" },
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeBtn: { flex: 1, minWidth: 70, alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, borderColor: "#334155" },
  typeBtnActive: { borderColor: GOLD, backgroundColor: GOLD + "22" },
  typeText: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  typeTextActive: { color: GOLD },
  amenitiesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenityChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#334155" },
  amenityChipActive: { borderColor: GOLD, backgroundColor: GOLD + "22" },
  amenityText: { color: "#94A3B8", fontSize: 12 },
  amenityTextActive: { color: GOLD },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  photoBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: GOLD + "22", borderRadius: 12, padding: 12, marginTop: 8 },
  photoBtnText: { color: GOLD, fontWeight: "600" },
  photoThumb: { position: "relative", marginRight: 8 },
  photoImage: { width: 70, height: 70, borderRadius: 10 },
  photoRemove: { position: "absolute", top: -4, right: -4 },
  saveBtn: { backgroundColor: GOLD, borderRadius: 14, padding: 16, marginHorizontal: 20, marginTop: 12, alignItems: "center" },
  saveBtnText: { color: NAVY, fontSize: 16, fontWeight: "800" },
});
