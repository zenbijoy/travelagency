import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useProviderHubStore } from "@/features/rider/providerStore";
import { weatherService, ComprehensiveWeatherData } from "@/services/weather/weatherService";
import { photonGeocoder, GeocodingResult } from "@/services/location/photonGeocoder";

const TEAL = "#0D9488";
const GOLD = "#E5A93C";
const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const BORDER = "#334155";

type OpsTab = "staff" | "maintenance" | "attractions_weather" | "templates";

const QUICK_CLIENT_TEMPLATES = [
  {
    id: "tpl-pickup",
    title: "Airport Chauffeur Arrival",
    body: "Assalamu Alaikum! Your ShopnoJatra BRTA-verified chauffeur has arrived at Hazrat Shahjalal International Airport Arrival Gate 2. Please share your 4-digit ride OTP to begin.",
  },
  {
    id: "tpl-monsoon",
    title: "Weather Advisory Update",
    body: "Live meteorological alert: Light coastal rain expected near Marine Drive. All scheduled stops remain covered via sheltered coastal route with zero Weather Guard extra fees.",
  },
];

export default function ProviderMoreScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OpsTab>("staff");

  const staff = useProviderHubStore((s) => s.staff);
  const maintenanceLogs = useProviderHubStore((s) => s.maintenanceLogs);
  const addStaffMember = useProviderHubStore((s) => s.addStaffMember);
  const toggleStaffStatus = useProviderHubStore((s) => s.toggleStaffStatus);
  const addMaintenanceLog = useProviderHubStore((s) => s.addMaintenanceLog);
  const advanceMaintenanceStatus = useProviderHubStore((s) => s.advanceMaintenanceStatus);

  // Staff form
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [staffPhone, setStaffPhone] = useState("");

  // Maintenance form
  const [assetName, setAssetName] = useState("");
  const [issueText, setIssueText] = useState("");

  // Weather & Photon Attractions
  const [cityQuery, setCityQuery] = useState("Cox's Bazar");
  const [weather, setWeather] = useState<ComprehensiveWeatherData | null>(null);
  const [attractions, setAttractions] = useState<GeocodingResult[]>([]);
  const [loadingEnv, setLoadingEnv] = useState(false);

  const loadEnvIntel = async (destination: string) => {
    setLoadingEnv(true);
    try {
      const [wData, geoResults] = await Promise.all([
        weatherService.getComprehensiveWeather(destination),
        photonGeocoder.searchPlaces(`${destination} tourist attraction`, 6),
      ]);
      setWeather(wData);
      setAttractions(geoResults);
    } catch {
      // Non-fatal network error
    } finally {
      setLoadingEnv(false);
    }
  };

  useEffect(() => {
    if (activeTab === "attractions_weather" && !weather) {
      loadEnvIntel(cityQuery).catch(() => {});
    }
  }, [activeTab, weather, cityQuery]);

  const handleAddStaff = () => {
    if (!staffName.trim() || !staffRole.trim()) {
      Alert.alert("Required", "Enter staff name and role.");
      return;
    }
    addStaffMember({
      name: staffName.trim(),
      role: staffRole.trim(),
      phone: staffPhone.trim() || "+8801700000000",
      status: "on_duty",
    });
    setStaffName("");
    setStaffRole("");
    setStaffPhone("");
  };

  const handleAddMaintenance = () => {
    if (!assetName.trim() || !issueText.trim()) {
      Alert.alert("Required", "Enter vehicle/asset name and maintenance issue.");
      return;
    }
    addMaintenanceLog({
      assetName: assetName.trim(),
      issue: issueText.trim(),
      priority: "medium",
    });
    setAssetName("");
    setIssueText("");
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.pageTitle}>⚙️ Provider Operations & Tools</Text>

      {/* Direct Shortcuts to Rider & Contract Portals */}
      <View style={styles.shortcutRow}>
        <Pressable
          style={styles.shortcutCard}
          onPress={() => router.push("/rider" as Parameters<typeof router.push>[0])}
        >
          <Ionicons name="bicycle" size={20} color="#10B981" />
          <Text style={styles.shortcutText}>Open Rider & Dispatch Portal</Text>
        </Pressable>
        <Pressable
          style={styles.shortcutCard}
          onPress={() => router.push("/provider/contract" as Parameters<typeof router.push>[0])}
        >
          <Ionicons name="document-text" size={20} color={GOLD} />
          <Text style={styles.shortcutText}>E-Contracts</Text>
        </Pressable>
      </View>

      {/* Sub-navigation Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
        {(
          [
            { key: "staff", label: "Team & Staff" },
            { key: "maintenance", label: "Fleet Maintenance" },
            { key: "attractions_weather", label: "Weather & Attractions" },
            { key: "templates", label: "Client Templates" },
          ] as Array<{ key: OpsTab; label: string }>
        ).map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* STAFF SECTION */}
      {activeTab === "staff" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Crew & Drivers ({staff.length})</Text>
          {staff.map((m) => (
            <Pressable
              key={m.id}
              style={styles.listRow}
              onPress={() => toggleStaffStatus(m.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{m.name}</Text>
                <Text style={styles.rowSub}>
                  {m.role} • {m.phone}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor:
                      m.status === "on_duty"
                        ? "#065F46"
                        : m.status === "standby"
                        ? "#78350F"
                        : "#334155",
                  },
                ]}
              >
                <Text style={styles.badgeText}>{m.status.toUpperCase()}</Text>
              </View>
            </Pressable>
          ))}

          <Text style={styles.subHeader}>Add Staff Member</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#475569"
            value={staffName}
            onChangeText={setStaffName}
          />
          <TextInput
            style={styles.input}
            placeholder="Role (e.g. Chauffeur / Guide)"
            placeholderTextColor="#475569"
            value={staffRole}
            onChangeText={setStaffRole}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone (+880...)"
            placeholderTextColor="#475569"
            value={staffPhone}
            onChangeText={setStaffPhone}
          />
          <Pressable style={styles.actionBtn} onPress={handleAddStaff}>
            <Text style={styles.actionBtnText}>Add Staff Member</Text>
          </Pressable>
        </View>
      )}

      {/* MAINTENANCE SECTION */}
      {activeTab === "maintenance" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Fleet Inspection & Maintenance ({maintenanceLogs.length})
          </Text>
          {maintenanceLogs.map((log) => (
            <Pressable
              key={log.id}
              style={styles.listRow}
              onPress={() => advanceMaintenanceStatus(log.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{log.assetName}</Text>
                <Text style={styles.rowSub}>{log.issue}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{log.status.toUpperCase()}</Text>
              </View>
            </Pressable>
          ))}

          <Text style={styles.subHeader}>Log Vehicle / Asset Issue</Text>
          <TextInput
            style={styles.input}
            placeholder="Vehicle / Plate (e.g. Toyota HiAce)"
            placeholderTextColor="#475569"
            value={assetName}
            onChangeText={setAssetName}
          />
          <TextInput
            style={styles.input}
            placeholder="Issue description (e.g. Brake pad service)"
            placeholderTextColor="#475569"
            value={issueText}
            onChangeText={setIssueText}
          />
          <Pressable style={styles.actionBtn} onPress={handleAddMaintenance}>
            <Text style={styles.actionBtnText}>Create Maintenance Ticket</Text>
          </Pressable>
        </View>
      )}

      {/* WEATHER & ATTRACTIONS SECTION */}
      {activeTab === "attractions_weather" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Destination Weather & Attractions</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              placeholder="City (Dhaka, Cox's Bazar, Sylhet)"
              placeholderTextColor="#475569"
              value={cityQuery}
              onChangeText={setCityQuery}
            />
            <Pressable
              style={styles.searchBtn}
              onPress={() => loadEnvIntel(cityQuery)}
              disabled={loadingEnv}
            >
              <Text style={styles.actionBtnText}>{loadingEnv ? "..." : "Fetch"}</Text>
            </Pressable>
          </View>

          {weather && (
            <View style={styles.weatherCard}>
              <Text style={styles.weatherCity}>{weather.locationName}</Text>
              <Text style={styles.weatherTemp}>
                {Math.round(weather.current.temperature)}°C • {weather.current.condition}
              </Text>
              <Text style={styles.weatherMeta}>
                Wind {weather.current.windSpeed} km/h • Rain Prob{" "}
                {weather.current.precipitationProbability}% • AQI {weather.current.aqi} (
                {weather.current.aqiCategory})
              </Text>
            </View>
          )}

          <Text style={styles.subHeader}>Nearby Landmarks (Photon OSM)</Text>
          {attractions.length === 0 ? (
            <Text style={styles.rowSub}>No attractions loaded yet. Tap Fetch.</Text>
          ) : (
            attractions.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <Ionicons name="location" size={16} color={TEAL} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.displayName}</Text>
                  <Text style={styles.rowSub}>
                    {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)} • {item.osmType}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* CLIENT TEMPLATES */}
      {activeTab === "templates" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Passenger / Guest Templates</Text>
          {QUICK_CLIENT_TEMPLATES.map((tpl) => (
            <View key={tpl.id} style={styles.templateCard}>
              <Text style={styles.rowTitle}>{tpl.title}</Text>
              <Text style={styles.templateBody}>{tpl.body}</Text>
              <Pressable
                style={styles.shareBtn}
                onPress={() => Share.share({ message: tpl.body }).catch(() => {})}
              >
                <Ionicons name="share-outline" size={14} color="#fff" />
                <Text style={styles.actionBtnText}>Share with Passenger</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY, padding: 16 },
  pageTitle: {
    color: "#F1F5F9",
    fontSize: 22,
    fontWeight: "700",
    paddingTop: 20,
    marginBottom: 14,
  },
  shortcutRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  shortcutCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAVY_LIGHT,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  shortcutText: { color: "#F1F5F9", fontSize: 12, fontWeight: "700", flex: 1 },
  tabRow: { marginBottom: 14 },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: NAVY_LIGHT,
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
  },
  tabPillActive: { backgroundColor: TEAL, borderColor: TEAL },
  tabText: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: "#fff", fontWeight: "700" },
  section: {
    backgroundColor: NAVY_LIGHT,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  sectionTitle: { color: "#F1F5F9", fontSize: 15, fontWeight: "700", marginBottom: 10 },
  subHeader: {
    color: GOLD,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  rowTitle: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  rowSub: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  badge: {
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: "#F8FAFC", fontSize: 10, fontWeight: "700" },
  input: {
    backgroundColor: NAVY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    color: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 8,
  },
  actionBtn: {
    backgroundColor: TEAL,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  searchBtn: {
    backgroundColor: TEAL,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
  },
  weatherCard: {
    backgroundColor: NAVY,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: TEAL + "55",
  },
  weatherCity: { color: GOLD, fontSize: 13, fontWeight: "700" },
  weatherTemp: { color: "#F1F5F9", fontSize: 20, fontWeight: "800", marginVertical: 4 },
  weatherMeta: { color: "#94A3B8", fontSize: 11 },
  templateCard: {
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  templateBody: { color: "#CBD5E1", fontSize: 12, lineHeight: 18, marginVertical: 8 },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: TEAL,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
