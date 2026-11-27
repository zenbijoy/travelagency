/**
 * Operations Screen — light SaaS design system.
 *
 * NOTE: There is currently no tours / live-operations service in the Agency
 * Portal (or shared package). Rather than fabricate tours, metrics or activity,
 * each section shows an explicit "unavailable" state until a real data source
 * is connected. The Schedule form is a preview only and does not persist.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import {
  Icon,
  Button,
  SectionHeader,
  StateView,
  Card,
} from "../../components/ui/DashboardUI";
import { palette, spacing, radius, typography } from "../../theme/tokens";

export default function OperationsScreen({ navigation }: any) {
  const [refreshing, setRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form, setForm] = useState({ title: "", location: "", dates: "" });

  const onRefresh = () => {
    setRefreshing(true);
    // No live-operations data source is connected yet.
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleCreateSchedule = () => {
    setIsModalVisible(false);
    Alert.alert(
      "Not connected",
      "Scheduling is not connected to a live service yet. This form is a preview only.",
    );
    setForm({ title: "", location: "", dates: "" });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={palette.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Operations</Text>
        <View style={styles.headerActions}>
          <Button
            label="Scanner"
            size="sm"
            icon="grid"
            onPress={() => navigation?.navigate?.("Scanner")}
          />
          <Button
            label="Schedule"
            size="sm"
            variant="outline"
            icon="plus"
            onPress={() => setIsModalVisible(true)}
          />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.primary}
            colors={[palette.primary]}
          />
        }
      >
        {/* Live Tours */}
        <View style={styles.section}>
          <SectionHeader title="Live Tours" />
          <Card>
            <StateView
              variant="empty"
              title="No live tours"
              message="Live tour operations need a tours service, which isn't connected yet."
              icon="map"
            />
          </Card>
        </View>

        {/* Operational Status */}
        <View style={styles.section}>
          <SectionHeader title="Operational Status" />
          <Card>
            <StateView
              variant="empty"
              title="No operational data"
              message="On-time, delayed and completion metrics will appear once operations are connected."
              icon="activity"
            />
          </Card>
        </View>

        {/* Live Activity */}
        <View style={styles.section}>
          <SectionHeader title="Live Activity" />
          <Card>
            <StateView
              variant="empty"
              title="No recent activity"
              message="Booking and payment events will stream here when the activity feed is connected."
              icon="clock"
            />
          </Card>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Schedule Modal (preview only) */}
      <Modal
        animationType="slide"
        transparent
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Schedule</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)} hitSlop={8}>
                <Icon name="x" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tour Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Cox's Bazar Beach Escape"
                placeholderTextColor={palette.textMuted}
                value={form.title}
                onChangeText={(text) => setForm({ ...form, title: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Cox's Bazar"
                placeholderTextColor={palette.textMuted}
                value={form.location}
                onChangeText={(text) => setForm({ ...form, location: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date Range</Text>
              <View style={styles.datePickerPlaceholder}>
                <Icon name="calendar" size={18} color={palette.textMuted} />
                <Text style={styles.datePickerText}>Select Dates</Text>
              </View>
            </View>

            <Button
              label="Create Schedule"
              icon="check"
              onPress={handleCreateSchedule}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerTitle: { ...typography.h3, color: palette.text, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  body: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingTop: spacing.md },
  section: { marginBottom: spacing.xl },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  modalTitle: { ...typography.h3, color: palette.text, fontWeight: "800" },
  inputGroup: { marginBottom: spacing.lg },
  inputLabel: { ...typography.label, color: palette.textSecondary, marginBottom: spacing.sm },
  textInput: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: palette.text,
    fontSize: typography.body.fontSize,
    borderWidth: 1,
    borderColor: palette.border,
  },
  datePickerPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  datePickerText: { color: palette.textMuted, fontSize: typography.body.fontSize },
});