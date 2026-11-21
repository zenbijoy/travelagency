import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";
const BLUE = "#3B82F6";
const PURPLE = "#A855F7";

// ==================== TYPES ====================
type StaffRole = "Manager" | "Reception" | "Housekeeping" | "Maintenance";
type CleanStatus = "Clean" | "Dirty" | "In Progress";
type MaintenanceStatus = "Open" | "In Progress" | "Resolved";

interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  avatar: string;
  phone: string;
}

interface HousekeepingTask {
  id: string;
  roomNumber: string;
  status: CleanStatus;
  assignedTo: string;
}

interface MaintenanceRequest {
  id: string;
  issue: string;
  roomNumber: string;
  assignedTo: string;
  status: MaintenanceStatus;
  priority: "Low" | "Medium" | "High";
}

interface NearbyAttraction {
  id: string;
  name: string;
  distance: string;
  emoji: string;
}

interface WeatherDay {
  day: string;
  temp: string;
  icon: string;
}

interface MessageTemplate {
  id: string;
  label: string;
  text: string;
}

interface Property {
  id: string;
  name: string;
}

// ==================== MOCK DATA ====================
const STAFF: StaffMember[] = [
  { id: "1", name: "Rafiq Ahmed", role: "Manager", avatar: "RA", phone: "+8801711234567" },
  { id: "2", name: "Suma Akter", role: "Reception", avatar: "SA", phone: "+8801811234567" },
  { id: "3", name: "Jamal Hossain", role: "Housekeeping", avatar: "JH", phone: "+8801911234567" },
  { id: "4", name: "Babu Mia", role: "Maintenance", avatar: "BM", phone: "+8801611234567" },
];

const ROLE_COLORS: Record<StaffRole, string> = {
  Manager: GOLD,
  Reception: BLUE,
  Housekeeping: GREEN,
  Maintenance: PURPLE,
};

const HK_TASKS: HousekeepingTask[] = [
  { id: "1", roomNumber: "101", status: "Clean", assignedTo: "Jamal Hossain" },
  { id: "2", roomNumber: "201", status: "Dirty", assignedTo: "Jamal Hossain" },
  { id: "3", roomNumber: "301", status: "In Progress", assignedTo: "Jamal Hossain" },
  { id: "4", roomNumber: "401", status: "Clean", assignedTo: "Jamal Hossain" },
];

const MAINT_REQUESTS: MaintenanceRequest[] = [
  { id: "1", issue: "AC not working", roomNumber: "201", assignedTo: "Babu Mia", status: "Open", priority: "High" },
  { id: "2", issue: "Light bulb broken", roomNumber: "101", assignedTo: "Babu Mia", status: "In Progress", priority: "Low" },
  { id: "3", issue: "Leaking tap", roomNumber: "305", assignedTo: "Babu Mia", status: "Resolved", priority: "Medium" },
];

const ATTRACTIONS: NearbyAttraction[] = [
  { id: "1", name: "Shaheed Minar", distance: "0.5 km", emoji: "🏛️" },
  { id: "2", name: "Ramna Park", distance: "1.2 km", emoji: "🌳" },
  { id: "3", name: "Dhaka Zoo", distance: "3.8 km", emoji: "🦁" },
];

const MSG_TEMPLATES: MessageTemplate[] = [
  { id: "1", label: "Welcome", text: "Welcome to Grand Palace Hotel! We hope you enjoy your stay. Please let us know if you need anything." },
  { id: "2", label: "Check-in Ready", text: "Your room is ready for check-in. Please come to the reception with your ID." },
  { id: "3", label: "Late Check-out", text: "Your late checkout request has been approved. You may stay until 2 PM." },
  { id: "4", label: "Thank You", text: "Thank you for staying with us! We hope to see you again soon. Please leave a review!" },
];

const PROPERTIES: Property[] = [
  { id: "1", name: "Grand Palace Hotel" },
  { id: "2", name: "City View Inn" },
  { id: "3", name: "Riverside Suites" },
];

// ==================== COMPONENTS ====================

function SectionCard({ title, icon, color, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; color: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={sc.container}>
      <Pressable style={sc.header} onPress={() => setExpanded(!expanded)}>
        <View style={[sc.iconWrap, { backgroundColor: color + "22" }]}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text style={sc.title}>{title}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
      </Pressable>
      {expanded && <View style={sc.body}>{children}</View>}
    </View>
  );
}

function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherDay[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch("https://wttr.in/Dhaka?format=j1");
        const data = await res.json() as { weather: Array<{ hourly: Array<{ tempC: string }>, date: string }> };
        const days = data.weather.slice(0, 7).map((d, i) => ({
          day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d.date).getDay()],
          temp: `${d.hourly[4]?.tempC ?? "?"}°C`,
          icon: i % 2 === 0 ? "☀️" : "🌤️",
        }));
        setWeather(days);
      } catch {
        setWeather([
          { day: "Mon", temp: "28°C", icon: "☀️" },
          { day: "Tue", temp: "26°C", icon: "🌤️" },
          { day: "Wed", temp: "29°C", icon: "☀️" },
          { day: "Thu", temp: "27°C", icon: "⛅" },
          { day: "Fri", temp: "25°C", icon: "🌧️" },
          { day: "Sat", temp: "30°C", icon: "☀️" },
          { day: "Sun", temp: "28°C", icon: "🌤️" },
        ]);
      } finally {
        setLoading(false);
      }
    };
    void fetchWeather();
  }, []);

  if (loading) return <ActivityIndicator color={GOLD} />;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {(weather ?? []).map((d, i) => (
        <View key={i} style={ww.card}>
          <Text style={ww.icon}>{d.icon}</Text>
          <Text style={ww.temp}>{d.temp}</Text>
          <Text style={ww.day}>{d.day}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function MoreScreen() {
  const [selectedProperty, setSelectedProperty] = useState(PROPERTIES[0]);
  const [propertyDropdown, setPropertyDropdown] = useState(false);
  const [isOffline] = useState(false);
  const [hkTasks, setHkTasks] = useState<HousekeepingTask[]>(HK_TASKS);
  const [maintRequests, setMaintRequests] = useState<MaintenanceRequest[]>(MAINT_REQUESTS);
  const { isDesktop } = useResponsive();

  const cycleCleanStatus = (id: string) => {
    const order: CleanStatus[] = ["Clean", "Dirty", "In Progress"];
    setHkTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: order[(order.indexOf(t.status) + 1) % 3] } : t)
    );
  };

  const cycleMaintStatus = (id: string) => {
    const order: MaintenanceStatus[] = ["Open", "In Progress", "Resolved"];
    setMaintRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status: order[(order.indexOf(r.status) + 1) % 3] } : r)
    );
  };

  const CLEAN_COLORS: Record<CleanStatus, string> = { Clean: GREEN, Dirty: RED, "In Progress": YELLOW };
  const MAINT_COLORS: Record<MaintenanceStatus, string> = { Open: RED, "In Progress": YELLOW, Resolved: GREEN };
  const PRIORITY_COLORS = { Low: GREEN, Medium: YELLOW, High: RED };

  return (
    <View style={styles.container}>
      {/* Offline / Multi-property header */}
      <View style={styles.header}>
        <Text style={styles.title}>More Features</Text>
        <View style={styles.headerRight}>
          {isOffline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={14} color={RED} />
              <Text style={styles.offlineText}>Offline</Text>
            </View>
          )}
          <Pressable style={styles.propSelector} onPress={() => setPropertyDropdown(!propertyDropdown)}>
            <Ionicons name="business-outline" size={14} color={GOLD} />
            <Text style={styles.propName} numberOfLines={1}>{selectedProperty.name}</Text>
            <Ionicons name="chevron-down" size={14} color="#94A3B8" />
          </Pressable>
        </View>
      </View>

      {propertyDropdown && (
        <View style={styles.propDropdown}>
          {PROPERTIES.map((p) => (
            <Pressable key={p.id} style={styles.propOption} onPress={() => { setSelectedProperty(p); setPropertyDropdown(false); }}>
              <Text style={[styles.propOptionText, p.id === selectedProperty.id && { color: GOLD }]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Staff Management */}
        <SectionCard title="Staff Management" icon="people-outline" color={GOLD}>
          {STAFF.map((member) => (
            <View key={member.id} style={sm.item}>
              <View style={sm.avatar}>
                <Text style={sm.avatarText}>{member.avatar}</Text>
              </View>
              <View style={sm.info}>
                <Text style={sm.name}>{member.name}</Text>
                <Text style={sm.phone}>{member.phone}</Text>
              </View>
              <View style={[sm.roleBadge, { backgroundColor: ROLE_COLORS[member.role] + "22" }]}>
                <Text style={[sm.roleText, { color: ROLE_COLORS[member.role] }]}>{member.role}</Text>
              </View>
            </View>
          ))}
        </SectionCard>

        {/* Housekeeping */}
        <SectionCard title="Housekeeping Tasks" icon="home-outline" color={GREEN}>
          {hkTasks.map((task) => (
            <Pressable key={task.id} style={hk.item} onPress={() => cycleCleanStatus(task.id)}>
              <Text style={hk.room}>Room {task.roomNumber}</Text>
              <Text style={hk.assignee}>{task.assignedTo}</Text>
              <View style={[hk.badge, { backgroundColor: CLEAN_COLORS[task.status] + "33" }]}>
                <Text style={[hk.badgeText, { color: CLEAN_COLORS[task.status] }]}>{task.status}</Text>
              </View>
            </Pressable>
          ))}
        </SectionCard>

        {/* Maintenance */}
        <SectionCard title="Maintenance Requests" icon="build-outline" color={PURPLE}>
          {maintRequests.map((req) => (
            <Pressable key={req.id} style={mr.item} onPress={() => cycleMaintStatus(req.id)}>
              <View style={mr.left}>
                <Text style={mr.issue}>{req.issue}</Text>
                <Text style={mr.room}>Room {req.roomNumber} · {req.assignedTo}</Text>
              </View>
              <View style={mr.right}>
                <View style={[mr.priority, { backgroundColor: PRIORITY_COLORS[req.priority] + "33" }]}>
                  <Text style={[mr.priorityText, { color: PRIORITY_COLORS[req.priority] }]}>{req.priority}</Text>
                </View>
                <View style={[mr.status, { backgroundColor: MAINT_COLORS[req.status] + "33" }]}>
                  <Text style={[mr.statusText, { color: MAINT_COLORS[req.status] }]}>{req.status}</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </SectionCard>

        {/* Nearby Attractions */}
        <SectionCard title="Nearby Attractions" icon="map-outline" color={BLUE}>
          {ATTRACTIONS.map((attr) => (
            <View key={attr.id} style={na.item}>
              <Text style={na.emoji}>{attr.emoji}</Text>
              <Text style={na.name}>{attr.name}</Text>
              <Text style={na.dist}>{attr.distance}</Text>
            </View>
          ))}
          <Pressable style={na.addBtn}>
            <Ionicons name="add-circle-outline" size={16} color={BLUE} />
            <Text style={na.addText}>Add Attraction</Text>
          </Pressable>
        </SectionCard>

        {/* Weather Widget */}
        <SectionCard title="7-Day Weather Forecast" icon="partly-sunny-outline" color={YELLOW}>
          <WeatherWidget />
        </SectionCard>

        {/* AI Analytics */}
        <SectionCard title="Analytics & AI Insights" icon="analytics-outline" color={PURPLE}>
          <View style={ai.insight}>
            <Text style={ai.text}>📈 Occupancy this month: 76% (+8% vs last month)</Text>
          </View>
          <View style={ai.insight}>
            <Text style={ai.text}>🏆 Peak months: December, February, Eid season</Text>
          </View>
          <View style={ai.insight}>
            <Text style={ai.text}>💡 Recommendation: Offer early-bird discounts for January</Text>
          </View>
          <View style={ai.insight}>
            <Text style={ai.text}>⭐ Average guest rating: 4.7/5.0</Text>
          </View>
        </SectionCard>

        {/* Message Templates */}
        <SectionCard title="Guest Message Templates" icon="chatbubble-ellipses-outline" color={GREEN}>
          {MSG_TEMPLATES.map((tpl) => (
            <Pressable key={tpl.id} style={mt.item}>
              <Text style={mt.label}>{tpl.label}</Text>
              <Text style={mt.text} numberOfLines={2}>{tpl.text}</Text>
            </Pressable>
          ))}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 52 },
  title: { fontSize: 22, fontWeight: "800", color: "#F1F5F9" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  offlineBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: RED + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  offlineText: { color: RED, fontSize: 11, fontWeight: "600" },
  propSelector: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: NAVY_LIGHT, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 160 },
  propName: { color: GOLD, fontSize: 11, fontWeight: "600", flex: 1 },
  propDropdown: { backgroundColor: NAVY_LIGHT, borderRadius: 12, marginHorizontal: 16, padding: 8, zIndex: 100 },
  propOption: { paddingHorizontal: 12, paddingVertical: 10 },
  propOptionText: { color: "#94A3B8", fontSize: 14 },
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
});

const sc = StyleSheet.create({
  container: { backgroundColor: NAVY_LIGHT, borderRadius: 16, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: "#F1F5F9", fontSize: 15, fontWeight: "700" },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
});

const sm = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD + "33", alignItems: "center", justifyContent: "center" },
  avatarText: { color: GOLD, fontSize: 12, fontWeight: "700" },
  info: { flex: 1 },
  name: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  phone: { color: "#64748B", fontSize: 11 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  roleText: { fontSize: 11, fontWeight: "700" },
});

const hk = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY, borderRadius: 10, padding: 10, gap: 10 },
  room: { color: "#F1F5F9", fontSize: 13, fontWeight: "600", flex: 1 },
  assignee: { color: "#64748B", fontSize: 11, flex: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700" },
});

const mr = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", backgroundColor: NAVY, borderRadius: 10, padding: 10 },
  left: { flex: 1 },
  issue: { color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  room: { color: "#64748B", fontSize: 11, marginTop: 2 },
  right: { gap: 4 },
  priority: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  priorityText: { fontSize: 10, fontWeight: "700" },
  status: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: "700" },
});

const na = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#334155" },
  emoji: { fontSize: 20 },
  name: { flex: 1, color: "#F1F5F9", fontSize: 13, fontWeight: "600" },
  dist: { color: "#64748B", fontSize: 12 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8 },
  addText: { color: BLUE, fontSize: 13, fontWeight: "600" },
});

const ww = StyleSheet.create({
  card: { alignItems: "center", backgroundColor: NAVY, borderRadius: 12, padding: 12, marginRight: 8, minWidth: 60 },
  icon: { fontSize: 20 },
  temp: { color: "#F1F5F9", fontSize: 13, fontWeight: "700", marginTop: 4 },
  day: { color: "#64748B", fontSize: 10, marginTop: 2 },
});

const ai = StyleSheet.create({
  insight: { backgroundColor: NAVY, borderRadius: 10, padding: 12, marginBottom: 6 },
  text: { color: "#94A3B8", fontSize: 13, lineHeight: 18 },
});

const mt = StyleSheet.create({
  item: { backgroundColor: NAVY, borderRadius: 10, padding: 12, marginBottom: 6 },
  label: { color: GOLD, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  text: { color: "#94A3B8", fontSize: 12, lineHeight: 18 },
});
