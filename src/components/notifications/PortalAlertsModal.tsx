/**
 * Scoped Portal Alerts Modal
 * Reusable tenant-isolated notification inbox modal for Agency & Hotel partner portals.
 * Guarantees strict tenant_id isolation before rendering any operational alert.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PortalScopedAlert } from "../../services/notificationCommandService";

export interface PortalAlertsModalProps {
  visible: boolean;
  portalType: "agency" | "hotel";
  tenantId: string;
  alerts: PortalScopedAlert[];
  onClose: () => void;
  onMarkRead: (alertId: string) => void;
  onMarkAllRead: () => void;
  onRefresh?: () => void;
}

export const PortalAlertsModal: React.FC<PortalAlertsModalProps> = ({
  visible,
  portalType,
  tenantId,
  alerts,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onRefresh,
}) => {
  const scopedAlerts = alerts.filter(
    (a) => a.portal_type === portalType && String(a.tenant_id) === String(tenantId)
  );
  const unreadCount = scopedAlerts.filter((a) => !a.is_read).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {portalType === "agency" ? "Agency Operational Alerts" : "Hotel Operational Alerts"}
              </Text>
              <Text style={styles.tenantSub}>
                Scoped Tenant ID: {tenantId || "Unbound"} • {unreadCount} unread
              </Text>
            </View>
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={onMarkAllRead} style={styles.actionBtn}>
                  <Text style={styles.actionText}>Mark all read</Text>
                </TouchableOpacity>
              )}
              {onRefresh && (
                <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
                  <Ionicons name="refresh" size={16} color="#0284c7" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.list}>
            {scopedAlerts.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="notifications-off-outline" size={28} color="#94a3b8" />
                <Text style={styles.emptyTitle}>No alerts for this {portalType}</Text>
                <Text style={styles.emptySub}>
                  Operational bookings, payouts, KYC, and guest events scoped strictly to {tenantId} appear here.
                </Text>
              </View>
            ) : (
              scopedAlerts.map((alert) => (
                <TouchableOpacity
                  key={alert.id}
                  style={[styles.alertRow, !alert.is_read && styles.alertRowUnread]}
                  onPress={() => onMarkRead(alert.id)}
                >
                  <View style={styles.alertHead}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <View
                      style={[
                        styles.prioPill,
                        alert.priority === "high" || alert.priority === "critical"
                          ? { backgroundColor: "#fee2e2" }
                          : { backgroundColor: "#e0f2fe" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.prioText,
                          alert.priority === "high" || alert.priority === "critical"
                            ? { color: "#b91c1c" }
                            : { color: "#0369a1" },
                        ]}
                      >
                        {alert.priority.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertBody}>{alert.body}</Text>
                  <Text style={styles.alertTime}>
                    {new Date(alert.created_at).toLocaleString()} • {alert.is_read ? "Read" : "Unread"}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "75%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  tenantSub: { fontSize: 11, color: "#64748b", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionBtn: {
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionText: { fontSize: 11, fontWeight: "700", color: "#0284c7" },
  iconBtn: { padding: 4 },
  list: { padding: 12 },
  emptyBox: { alignItems: "center", paddingVertical: 28, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "#334155" },
  emptySub: { fontSize: 12, color: "#64748b", textAlign: "center" },
  alertRow: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
    gap: 4,
  },
  alertRowUnread: {
    borderColor: "#38bdf8",
    backgroundColor: "#f0f9ff",
  },
  alertHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  alertTitle: { fontSize: 13, fontWeight: "700", color: "#0f172a", flex: 1 },
  prioPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  prioText: { fontSize: 10, fontWeight: "700" },
  alertBody: { fontSize: 12, color: "#334155" },
  alertTime: { fontSize: 10, color: "#94a3b8" },
});
