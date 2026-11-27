import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/hooks/useResponsive";
import {
  useHotelPmsStore,
  useHotelPmsComputed,
  CONCIERGE_QUICK_TEMPLATES,
  HotelHousekeepingTask,
  HotelMaintenanceTicket,
  GuestConciergeThread,
  HousekeepingTaskStatus,
} from "@/features/hotel";

const NAVY = "#0F172A";
const NAVY_LIGHT = "#1E293B";
const GOLD = "#E5A93C";
const GREEN = "#22C55E";
const RED = "#EF4444";
const YELLOW = "#F59E0B";
const BLUE = "#3B82F6";
const PURPLE = "#A855F7";

type SectionTab = "housekeeping" | "maintenance" | "concierge" | "staff";

export default function HotelOperationsMoreScreen() {
  const { isDesktop, contentMaxWidth } = useResponsive();
  const {
    workspace,
    initWorkspace,
    transitionHousekeeping,
    transitionMaintenance,
    createMaintenanceTicket,
    sendConciergeMessage,
    patchWorkspace,
  } = useHotelPmsStore();
  const { currentProperty } = useHotelPmsComputed();

  const [activeTab, setActiveTab] = useState<SectionTab>("housekeeping");

  // New Maintenance Modal
  const [ticketModalVisible, setTicketModalVisible] = useState(false);
  const [ticketRoomId, setTicketRoomId] = useState("");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");

  // Concierge Active Thread
  const [selectedThread, setSelectedThread] = useState<GuestConciergeThread | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (workspace.units.length === 0) initWorkspace();
  }, []);

  const propertyTasks = workspace.housekeepingTasks.filter((t) => t.hotelId === currentProperty.id);
  const propertyTickets = workspace.maintenanceTickets.filter((t) => t.hotelId === currentProperty.id);
  const propertyThreads = workspace.conciergeThreads.filter((t) => t.hotelId === currentProperty.id);
  const propertyStaff = workspace.staff.filter((s) => s.hotelId === currentProperty.id);
  const propertyUnits = workspace.units.filter((u) => u.hotelId === currentProperty.id);

  const handleAdvanceHousekeeping = async (task: HotelHousekeepingTask) => {
    let nextStatus: HousekeepingTaskStatus | null = null;
    if (task.status === "dirty") nextStatus = "cleaning";
    else if (task.status === "cleaning") nextStatus = "inspection";
    else if (task.status === "inspection") nextStatus = "ready";

    if (!nextStatus) return;

    const res = await transitionHousekeeping({
      taskId: task.id,
      targetStatus: nextStatus,
      staffName: task.assignedStaffName || "Floor Supervisor",
    });

    if (res.success) {
      Alert.alert("Housekeeping Updated", `Room #${task.roomNumber} → ${nextStatus.toUpperCase()}`);
    } else {
      Alert.alert("Transition Error", res.error || "Invalid state transition");
    }
  };

  const handleAdvanceMaintenance = async (ticket: HotelMaintenanceTicket) => {
    const nextStatus =
      ticket.status === "open" || ticket.status === "assigned" ? "in_progress" : "resolved";

    const res = await transitionMaintenance({
      ticketId: ticket.id,
      targetStatus: nextStatus,
      actualCostBdt: nextStatus === "resolved" ? ticket.estimatedCostBdt || 1000 : undefined,
      resolutionNotes: nextStatus === "resolved" ? "Inspected and repaired by engineering team" : undefined,
    });

    if (res.success) {
      Alert.alert("Ticket Updated", `${ticket.ticketReference} moved to ${nextStatus.toUpperCase()}`);
    }
  };

  const handleCreateTicket = async () => {
    const unitId = ticketRoomId || propertyUnits[0]?.id;
    if (!unitId || !ticketTitle.trim()) {
      Alert.alert("Missing Info", "Please enter issue title.");
      return;
    }

    const res = await createMaintenanceTicket({
      roomUnitId: unitId,
      category: "hvac",
      title: ticketTitle.trim(),
      description: ticketDesc.trim() || ticketTitle.trim(),
      severity: "high",
      estimatedCostBdt: 1500,
      blocksRoomSale: true,
    });

    if (res.success) {
      setTicketModalVisible(false);
      setTicketTitle("");
      setTicketDesc("");
      Alert.alert("Work Order Created", "Maintenance ticket logged & unit protected.");
    }
  };

  const handleSendQuickTemplate = async (thread: GuestConciergeThread, tplText: string, tag: string) => {
    await sendConciergeMessage({
      threadId: thread.id,
      text: tplText,
      senderRole: "hotel",
      senderName: `${currentProperty.name} Desk`,
      tag,
    });
    Alert.alert("Concierge Message Sent", `Template "${tag}" delivered to ${thread.guestName}.`);
  };

  const handleSendCustomReply = async () => {
    if (!selectedThread || !replyText.trim()) return;
    await sendConciergeMessage({
      threadId: selectedThread.id,
      text: replyText.trim(),
      senderRole: "hotel",
      senderName: `${currentProperty.name} Desk`,
    });
    setReplyText("");
    const updated = workspace.conciergeThreads.find((t) => t.id === selectedThread.id);
    if (updated) setSelectedThread(updated);
  };

  const toggleStaffStatus = (staffId: string) => {
    patchWorkspace((draft) => ({
      ...draft,
      staff: draft.staff.map((s) =>
        s.id === staffId
          ? { ...s, status: s.status === "Active" ? "Off Duty" : "Active" }
          : s
      ),
    }));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          isDesktop && { maxWidth: contentMaxWidth, alignSelf: "center" as const, width: "100%" },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Operations & Guest Concierge</Text>
          <Text style={styles.headerSub}>{currentProperty.name} • Live Ops Board</Text>
        </View>

        {/* Sub-module Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {[
            { id: "housekeeping" as SectionTab, label: `Housekeeping (${propertyTasks.length})`, icon: "sparkles-outline" as const },
            { id: "maintenance" as SectionTab, label: `Maintenance (${propertyTickets.length})`, icon: "construct-outline" as const },
            { id: "concierge" as SectionTab, label: `Concierge (${propertyThreads.length})`, icon: "chatbubbles-outline" as const },
            { id: "staff" as SectionTab, label: `Staff (${propertyStaff.length})`, icon: "people-outline" as const },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons name={tab.icon} size={15} color={active ? NAVY : "#94A3B8"} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* TAB 1: HOUSEKEEPING BOARD */}
        {activeTab === "housekeeping" && (
          <View>
            <Text style={styles.sectionTitle}>Turnaround Queue (Dirty → Cleaning → Inspection → Ready)</Text>
            {propertyTasks.map((task) => {
              const color =
                task.status === "ready"
                  ? GREEN
                  : task.status === "inspection"
                  ? PURPLE
                  : task.status === "cleaning"
                  ? BLUE
                  : RED;
              return (
                <View key={task.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.cardTitle}>Room #{task.roomNumber}</Text>
                        {(task.priority === "vip_arrival" || task.priority === "urgent") && (
                          <View style={[styles.badge, { backgroundColor: GOLD + "33" }]}>
                            <Text style={{ color: GOLD, fontSize: 9, fontWeight: "800" }}>
                              {task.priority.replace("_", " ").toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardSub}>
                        {task.taskType.replace("_", " ")} • SLA: {task.slaMinutes} mins
                      </Text>
                      <Text style={styles.cardMeta}>
                        Assignee: {task.assignedStaffName || "Unassigned"}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
                      <Text style={{ color, fontSize: 10, fontWeight: "800" }}>
                        {task.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {task.status !== "ready" && (
                    <Pressable style={styles.actionBtn} onPress={() => handleAdvanceHousekeeping(task)}>
                      <Text style={styles.actionBtnText}>
                        {task.status === "dirty"
                          ? "Start Cleaning →"
                          : task.status === "cleaning"
                          ? "Submit for Inspection →"
                          : "Approve & Mark Ready ✓"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 2: MAINTENANCE BOARD */}
        {activeTab === "maintenance" && (
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Engineering & Repairs</Text>
              <Pressable style={styles.miniAddBtn} onPress={() => setTicketModalVisible(true)}>
                <Ionicons name="add" size={14} color={NAVY} />
                <Text style={{ color: NAVY, fontSize: 11, fontWeight: "800" }}>Report Issue</Text>
              </Pressable>
            </View>

            {propertyTickets.map((t) => {
              const done = t.status === "resolved" || t.status === "closed";
              return (
                <View key={t.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        {t.ticketReference} • Room #{t.roomNumber || "Common"}
                      </Text>
                      <Text style={styles.cardSub}>{t.title}</Text>
                      <Text style={styles.cardMeta}>
                        Severity: {t.severity.toUpperCase()} • Cost: ৳
                        {(t.actualCostBdt || t.estimatedCostBdt).toLocaleString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: (done ? GREEN : YELLOW) + "22" },
                      ]}
                    >
                      <Text style={{ color: done ? GREEN : YELLOW, fontSize: 10, fontWeight: "800" }}>
                        {t.status.replace("_", " ").toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {!done && (
                    <Pressable style={styles.actionBtn} onPress={() => handleAdvanceMaintenance(t)}>
                      <Text style={styles.actionBtnText}>
                        {t.status === "open" || t.status === "assigned"
                          ? "Begin Repair →"
                          : "Mark Resolved & Release Room ✓"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 3: PRE-ARRIVAL CONCIERGE */}
        {activeTab === "concierge" && (
          <View>
            <Text style={styles.sectionTitle}>Guest Concierge & Quick Templates</Text>
            {propertyThreads.map((thread) => (
              <View key={thread.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{thread.guestName}</Text>
                    <Text style={styles.cardSub}>
                      Ref: {thread.bookingReference || "Direct"} • Room {thread.roomNumber || "TBD"}
                    </Text>
                    {thread.specialRequestTags.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {thread.specialRequestTags.map((tag) => (
                          <View key={tag} style={styles.reqChip}>
                            <Text style={styles.reqChipText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Pressable
                    style={styles.chatOpenBtn}
                    onPress={() => setSelectedThread(thread)}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={NAVY} />
                    <Text style={{ color: NAVY, fontSize: 11, fontWeight: "800" }}>Chat</Text>
                  </Pressable>
                </View>

                <Text style={[styles.cardMeta, { marginTop: 10 }]}>One-Tap Concierge Broadcasts:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {CONCIERGE_QUICK_TEMPLATES.map((tpl) => (
                    <Pressable
                      key={tpl.id}
                      style={styles.tplChip}
                      onPress={() => handleSendQuickTemplate(thread, tpl.text, tpl.tag)}
                    >
                      <Text style={styles.tplText}>{tpl.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {/* TAB 4: STAFF ROSTER */}
        {activeTab === "staff" && (
          <View>
            <Text style={styles.sectionTitle}>Hotel Operations Staff ({propertyStaff.length})</Text>
            {propertyStaff.map((member) => (
              <View key={member.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{member.name}</Text>
                    <Text style={styles.cardSub}>
                      {member.role} • {member.department}
                    </Text>
                    <Text style={styles.cardMeta}>{member.phone}</Text>
                  </View>
                  <Pressable
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          member.status === "Active" ? GREEN + "22" : RED + "22",
                      },
                    ]}
                    onPress={() => toggleStaffStatus(member.id)}
                  >
                    <Text
                      style={{
                        color: member.status === "Active" ? GREEN : RED,
                        fontSize: 10,
                        fontWeight: "800",
                      }}
                    >
                      {member.status}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Report Maintenance Ticket Modal */}
      <Modal visible={ticketModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Report Maintenance Issue</Text>
            <TextInput
              placeholder="Issue Title (e.g. AC Filter Replacement)"
              placeholderTextColor="#64748B"
              style={styles.input}
              value={ticketTitle}
              onChangeText={setTicketTitle}
            />
            <TextInput
              placeholder="Details / Room #..."
              placeholderTextColor="#64748B"
              style={styles.input}
              value={ticketDesc}
              onChangeText={setTicketDesc}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => setTicketModalVisible(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { flex: 1 }]} onPress={handleCreateTicket}>
                <Text style={styles.saveText}>Create Ticket</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Concierge Chat Modal */}
      <Modal visible={Boolean(selectedThread)} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>{selectedThread?.guestName} — Concierge Chat</Text>
            <ScrollView style={{ marginVertical: 10, maxHeight: 280 }}>
              {selectedThread?.messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.msgBubble,
                    m.senderRole === "hotel" ? styles.msgHotel : styles.msgGuest,
                  ]}
                >
                  <Text style={styles.msgSender}>{m.senderName}</Text>
                  <Text style={styles.msgBody}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                placeholder="Type message to guest..."
                placeholderTextColor="#64748B"
                style={[styles.input, { flex: 1, marginTop: 0 }]}
                value={replyText}
                onChangeText={setReplyText}
              />
              <Pressable style={styles.sendChatBtn} onPress={handleSendCustomReply}>
                <Ionicons name="send" size={18} color={NAVY} />
              </Pressable>
            </View>
            <Pressable style={styles.cancelBtn} onPress={() => setSelectedThread(null)}>
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { paddingTop: 48, marginBottom: 14 },
  headerTitle: { fontSize: 21, fontWeight: "800", color: "#F1F5F9" },
  headerSub: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  tabBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: NAVY_LIGHT, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, marginRight: 8 },
  tabBtnActive: { backgroundColor: GOLD },
  tabLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  tabLabelActive: { color: NAVY },
  sectionTitle: { color: "#CBD5E1", fontSize: 13, fontWeight: "700", marginBottom: 10 },
  card: { backgroundColor: NAVY_LIGHT, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { color: "#F1F5F9", fontSize: 14, fontWeight: "800" },
  cardSub: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  cardMeta: { color: "#64748B", fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionBtn: { backgroundColor: GOLD + "22", borderWidth: 1, borderColor: GOLD, borderRadius: 10, paddingVertical: 8, alignItems: "center", marginTop: 10 },
  actionBtnText: { color: GOLD, fontSize: 12, fontWeight: "800" },
  miniAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  reqChip: { backgroundColor: BLUE + "22", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  reqChipText: { color: "#60A5FA", fontSize: 10, fontWeight: "700" },
  chatOpenBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  tplChip: { backgroundColor: NAVY, borderWidth: 1, borderColor: "#334155", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 6 },
  tplText: { color: GOLD, fontSize: 11, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalBox: { backgroundColor: NAVY_LIGHT, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#334155" },
  modalTitle: { color: "#F1F5F9", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  input: { backgroundColor: NAVY, color: "#F1F5F9", borderRadius: 10, padding: 11, marginTop: 10, fontSize: 13, borderWidth: 1, borderColor: "#334155" },
  cancelBtn: { marginTop: 12, backgroundColor: "#334155", borderRadius: 12, padding: 12, alignItems: "center" },
  cancelText: { color: "#F1F5F9", fontWeight: "700" },
  saveBtn: { marginTop: 12, backgroundColor: GOLD, borderRadius: 12, padding: 12, alignItems: "center" },
  saveText: { color: NAVY, fontWeight: "800" },
  msgBubble: { padding: 10, borderRadius: 10, marginBottom: 8, maxWidth: "85%" },
  msgHotel: { alignSelf: "flex-end", backgroundColor: "#1D4ED8" },
  msgGuest: { alignSelf: "flex-start", backgroundColor: NAVY },
  msgSender: { color: "#CBD5E1", fontSize: 9, fontWeight: "700", marginBottom: 2 },
  msgBody: { color: "#F8FAFC", fontSize: 12 },
  sendChatBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
});
