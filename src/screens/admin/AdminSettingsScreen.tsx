import { showLocalizedAlert } from "../../utils/localizedAlert";
/**
 * Admin Settings Screen - Admin Panel
 * Manage system settings, security, feature flags, and configurations
 */

import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Switch,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { adminService } from "@/services/adminService";
import { AdminUser } from "@/types/admin";
import { supabase } from "@/utils/supabase";
import { useRBAC } from "./rbac";
import { executeAdminCommand, UpdateSystemSettingCommand } from "./commands";

/**
 * Settings Section Component
 */
const SettingsSection: React.FC<{
  title: string;
  children: React.ReactNode;
  icon?: string;
}> = ({ title, children, icon }) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && (
          <MaterialCommunityIcons name={icon as any} size={20} color="#667eea" />
        )}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <LinearGradient
        colors={["#ffffff", "#f9fafb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.sectionContent}
      >
        {children}
      </LinearGradient>
    </View>
  );
};

/**
 * Settings Row Component
 */
const SettingsRow: React.FC<{
  label: string;
  value?: string;
  onPress?: () => void;
  rightComponent?: React.ReactNode;
  showChevron?: boolean;
  icon?: string;
}> = ({ label, value, onPress, rightComponent, showChevron = true, icon }) => {
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress && !rightComponent}>
      <View style={styles.settingsRow}>
        <View style={styles.rowLeft}>
          {icon && (
            <MaterialCommunityIcons
              name={icon as any}
              size={18}
              color="#6b7280"
              style={styles.rowIcon}
            />
          )}
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>{label}</Text>
            {value && <Text style={styles.rowValue}>{value}</Text>}
          </View>
        </View>
        <View style={styles.rowRight}>
          {rightComponent}
          {showChevron && (
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color="#d1d5db"
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

/**
 * Toggle Setting Component
 */
const ToggleSetting: React.FC<{
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  icon?: string;
}> = ({ label, value, onToggle, icon }) => {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.rowLeft}>
        {icon && (
          <MaterialCommunityIcons
            name={icon as any}
            size={18}
            color="#6b7280"
            style={styles.rowIcon}
          />
        )}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#e5e7eb", true: "#667eea" }}
        thumbColor={value ? "#667eea" : "#f3f4f6"}
      />
    </View>
  );
};

/**
 * Admin Settings Screen
 */
export const AdminSettingsScreen: React.FC<{ admin: AdminUser | null }> = ({
  admin: propsAdmin,
}) => {
  const { admin: rbacAdmin, hasPermission } = useRBAC();
  const admin = propsAdmin || rbacAdmin;
  const activeAdmin = admin;
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    maintenanceMode: false,
    debugMode: false,
    auditLogging: true,
    ipWhitelisting: false,
    twoFactorRequired: true,
    apiRateLimiting: true,
    backupDaily: true,
    dataEncryption: true,
  });

  const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);
  const [backupModalVisible, setBackupModalVisible] = useState(false);
  const [apiKeyModalVisible, setApiKeyModalVisible] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");

  const loadSettingsFromDb = async () => {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*");
      if (data && data.length > 0) {
        const map: any = {};
        data.forEach((s: any) => {
          if (s.setting_key) {
            map[s.setting_key] = s.setting_value === "true" || s.setting_value === true;
          }
        });
        setSettings((prev) => ({ ...prev, ...map }));
      }
    } catch (err) {
      console.warn("Error loading system settings:", err);
    }
  };

  useEffect(() => {
    loadSettingsFromDb();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSettingsFromDb();
    setRefreshing(false);
  };

  const handleToggleSetting = async (key: keyof typeof settings) => {
    if (!activeAdmin) {
      showLocalizedAlert("Governance Block", "No verified administrator session found.");
      return;
    }
    if (!hasPermission("settings.manage")) {
      showLocalizedAlert("Access Denied", "You lack 'settings.manage' permission to modify system settings.");
      return;
    }
    const nextVal = !settings[key];
    const prevVal = settings[key];
    setSettings((prev) => ({
      ...prev,
      [key]: nextVal,
    }));
    try {
      const command = new UpdateSystemSettingCommand(String(key), nextVal);
      const cmdRes = await executeAdminCommand(command, activeAdmin);
      if (!cmdRes.success) {
        setSettings((prev) => ({
          ...prev,
          [key]: prevVal,
        }));
        showLocalizedAlert("Permission Error", cmdRes.error || "Failed to update setting due to RBAC policy.");
      }
    } catch (err: any) {
      console.warn("Failed to persist and audit system setting:", err);
      setSettings((prev) => ({
        ...prev,
        [key]: prevVal,
      }));
      showLocalizedAlert("Permission Error", err.message || "Failed to update setting due to RBAC policy.");
    }
  };

  const handleBackup = async () => {
    if (!activeAdmin || !hasPermission("settings.manage")) {
      showLocalizedAlert("Access Denied", "Only authorized super administrators can initiate backups.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("system_backup").insert({
        backup_name: `manual_snapshot_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
        backup_type: "full",
        backup_date: new Date().toISOString(),
        created_by: activeAdmin.id,
      });
      if (error) throw error;
      await adminService.logActivity({
        admin_id: activeAdmin.id,
        action: "MANUAL_BACKUP_REQUESTED",
        module: "settings",
        entity_type: "system_backup",
        details: { description: "Logged manual backup request in system_backup registry" },
      });
      showLocalizedAlert(
        "Backup Request Recorded",
        "Backup snapshot job queued in system_backup. Point-in-time managed snapshots remain controlled by Supabase."
      );
      setBackupModalVisible(false);
    } catch (error: any) {
      showLocalizedAlert("Error", error?.message || "Failed to record backup request.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    if (!activeAdmin || !hasPermission("settings.manage")) {
      showLocalizedAlert("Access Denied", "Missing 'settings.manage' permission.");
      return;
    }
    if (typeof globalThis.crypto === "undefined" || typeof globalThis.crypto.getRandomValues !== "function") {
      showLocalizedAlert("Security Restriction", "Cryptographic CSPRNG unavailable on this runtime. Generate keys on backend.");
      return;
    }
    setLoading(true);
    try {
      const bytes = new Uint8Array(24);
      globalThis.crypto.getRandomValues(bytes);
      const entropyHex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const generatedKey = `snj_live_${entropyHex.substring(0, 36)}`;
      const maskedPrefix = `${generatedKey.slice(0, 12)}••••••••${generatedKey.slice(-4)}`;

      const { error } = await supabase.from("api_keys_admin").insert({
        api_key_name: `Admin Key (${new Date().toISOString().slice(0, 10)})`,
        api_key_secret: maskedPrefix,
        created_by: activeAdmin.id,
        is_active: true,
        rate_limit: 1000,
      });
      if (error) throw error;

      setNewApiKey(generatedKey);
      showLocalizedAlert(
        "API Key Registered",
        "Copy your key now. Only a masked reference is stored in the registry."
      );
    } catch (error: any) {
      showLocalizedAlert("Error", error?.message || "Failed to generate API key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#667eea", "#764ba2"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Admin Settings</Text>
        <Text style={styles.headerSubtitle}>
          System configuration & preferences
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* System Status */}
          <SettingsSection title="System Status" icon="database">
            <SettingsRow
              label="System Status"
              value={settings.maintenanceMode ? "Maintenance" : "Operational"}
              showChevron={false}
              icon="check-circle"
            />
            <SettingsRow
              label="Database Connection"
              value="Connected"
              showChevron={false}
              icon="check-circle"
            />
            <SettingsRow
              label="API Health"
              value="Healthy"
              showChevron={false}
              icon="check-circle"
            />
            <SettingsRow
              label="Last Backup"
              value="2 hours ago"
              showChevron={false}
              icon="backup-restore"
            />
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection title="Notifications" icon="bell">
            <ToggleSetting
              label="Email Notifications"
              value={settings.emailNotifications}
              onToggle={() => handleToggleSetting("emailNotifications")}
              icon="email"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="SMS Notifications"
              value={settings.smsNotifications}
              onToggle={() => handleToggleSetting("smsNotifications")}
              icon="message"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="Push Notifications"
              value={settings.pushNotifications}
              onToggle={() => handleToggleSetting("pushNotifications")}
              icon="bell-ring"
            />
          </SettingsSection>

          {/* Security Settings */}
          <SettingsSection title="Security" icon="shield-account">
            <ToggleSetting
              label="Audit Logging"
              value={settings.auditLogging}
              onToggle={() => handleToggleSetting("auditLogging")}
              icon="file-document"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="IP Whitelisting"
              value={settings.ipWhitelisting}
              onToggle={() => handleToggleSetting("ipWhitelisting")}
              icon="security"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="2FA Required"
              value={settings.twoFactorRequired}
              onToggle={() => handleToggleSetting("twoFactorRequired")}
              icon="two-factor-authentication"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="Data Encryption"
              value={settings.dataEncryption}
              onToggle={() => handleToggleSetting("dataEncryption")}
              icon="lock"
            />
          </SettingsSection>

          {/* API Configuration */}
          <SettingsSection title="API Configuration" icon="api">
            <SettingsRow
              label="Rate Limiting"
              value={settings.apiRateLimiting ? "Enabled" : "Disabled"}
              icon="speedometer"
              showChevron={false}
              rightComponent={
                <Switch
                  value={settings.apiRateLimiting}
                  onValueChange={() => handleToggleSetting("apiRateLimiting")}
                />
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Generate API Key"
              icon="key"
              onPress={() => setApiKeyModalVisible(true)}
            />
            <View style={styles.divider} />
            <SettingsRow
              label="API Documentation"
              icon="book-open"
              onPress={() =>
                showLocalizedAlert("API Documentation", `FastAPI OpenAPI Docs: ${process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000"}/docs`)
              }
            />
          </SettingsSection>

          {/* Database Settings */}
          <SettingsSection title="Database" icon="database-settings">
            <ToggleSetting
              label="Daily Backups"
              value={settings.backupDaily}
              onToggle={() => handleToggleSetting("backupDaily")}
              icon="backup-restore"
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Create Manual Backup"
              icon="plus-circle"
              onPress={() => setBackupModalVisible(true)}
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Backup History"
              icon="history"
              onPress={() =>
                showLocalizedAlert("Backup History", "Last 10 backups shown")
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Database Size"
              value="2.4 GB"
              icon="database"
              showChevron={false}
            />
          </SettingsSection>

          {/* System Maintenance */}
          <SettingsSection title="System Maintenance" icon="wrench">
            <ToggleSetting
              label="Maintenance Mode"
              value={settings.maintenanceMode}
              onToggle={() => handleToggleSetting("maintenanceMode")}
              icon="alert-circle"
            />
            <View style={styles.divider} />
            <ToggleSetting
              label="Debug Mode"
              value={settings.debugMode}
              onToggle={() => handleToggleSetting("debugMode")}
              icon="bug"
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Clear Cache"
              icon="delete"
              onPress={() =>
                showLocalizedAlert("Cache Cleared", "Application cache cleared")
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              label="System Logs"
              icon="file-document-multiple"
              onPress={() =>
                showLocalizedAlert("System Logs", "View latest system logs")
              }
            />
          </SettingsSection>

          {/* Localization */}
          <SettingsSection title="Localization" icon="globe">
            <SettingsRow
              label="Language"
              value="English (US)"
              icon="translate"
              onPress={() =>
                showLocalizedAlert("Language", "Change admin panel language")
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Timezone"
              value="UTC+6 (BST - Dhaka)"
              icon="clock"
              onPress={() => showLocalizedAlert("Timezone", "Primary operations timezone set to Asia/Dhaka (UTC+6)")}
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Date Format"
              value="MM/DD/YYYY"
              icon="calendar"
              onPress={() => showLocalizedAlert("Date Format", "Choose date format")}
            />
          </SettingsSection>

          {/* Admin Account */}
          <SettingsSection title="Admin Account" icon="account">
            <SettingsRow
              label="Admin Name"
               value={(activeAdmin as any)?.name || "Administrator"}
              icon="account-circle"
              showChevron={false}
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Admin Role"
              value={activeAdmin?.role || "Super Admin"}
              icon="shield"
              showChevron={false}
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Change Password"
              icon="lock"
              onPress={() =>
                showLocalizedAlert("Change Password", "Update your password")
              }
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Two-Factor Authentication"
              icon="two-factor-authentication"
              onPress={() => showLocalizedAlert("2FA", "Configure 2FA settings")}
            />
          </SettingsSection>

          {/* About */}
          <SettingsSection title="About" icon="information">
            <SettingsRow
              label="Admin Panel Version"
              value="2.0.0"
              showChevron={false}
              icon="tag"
            />
            <View style={styles.divider} />
            <SettingsRow
              label="API Version"
              value="1.5.0"
              showChevron={false}
              icon="tag"
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Database Version"
              value="PostgreSQL 13"
              showChevron={false}
              icon="database"
            />
            <View style={styles.divider} />
            <SettingsRow
              label="Help & Support"
              icon="help-circle"
              onPress={() =>
                showLocalizedAlert(
                  "Platform Operations Support",
                  "Support: operations@shopnojatra.com\nEmergency NOC: +880 1700-000000\nInternal Slack: #ops-shopnojatra",
                )
              }
            />
          </SettingsSection>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* Backup Modal */}
      <Modal
        visible={backupModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBackupModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Database Backup</Text>
              <TouchableOpacity onPress={() => setBackupModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1f2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                This will create a complete backup of your database. This
                process may take a few minutes.
              </Text>

              <View style={styles.infoBox}>
                <MaterialCommunityIcons
                  name="information"
                  size={20}
                  color="#3b82f6"
                />
                <Text style={styles.infoText}>
                  Backups are stored securely and can be restored at any time.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setBackupModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.confirmButton]}
                  onPress={handleBackup}
                  disabled={loading}
                >
                  <Text style={styles.confirmButtonText}>
                    {loading ? "Creating..." : "Create Backup"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* API Key Modal */}
      <Modal
        visible={apiKeyModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setApiKeyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate API Key</Text>
              <TouchableOpacity onPress={() => setApiKeyModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1f2937" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                Create a new API key for third-party integrations.
              </Text>

              {newApiKey && (
                <View style={styles.apiKeyBox}>
                  <Text style={styles.apiKeyLabel}>Your API Key:</Text>
                  <View style={styles.apiKeyDisplay}>
                    <Text style={styles.apiKeyText}>{newApiKey}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        showLocalizedAlert("Copied", "API key copied to clipboard");
                      }}
                    >
                      <MaterialCommunityIcons
                        name="content-copy"
                        size={18}
                        color="#667eea"
                      />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.apiKeyWarning}>
                    ⚠️ Save this key securely. You won't be able to view it
                    again.
                  </Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setApiKeyModalVisible(false);
                    setNewApiKey("");
                  }}
                >
                  <Text style={styles.cancelButtonText}>Close</Text>
                </TouchableOpacity>
                {!newApiKey && (
                  <TouchableOpacity
                    style={[styles.button, styles.confirmButton]}
                    onPress={handleGenerateApiKey}
                    disabled={loading}
                  >
                    <Text style={styles.confirmButtonText}>
                      {loading ? "Generating..." : "Generate Key"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#ffffff80",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f2937",
  },
  sectionContent: {
    borderRadius: 12,
    overflow: "hidden",
  },
  settingsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 24,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 12,
    color: "#6b7280",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  infoText: {
    fontSize: 12,
    color: "#1e40af",
    flex: 1,
  },
  apiKeyBox: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  apiKeyLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  apiKeyDisplay: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  apiKeyText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "monospace",
    color: "#1f2937",
  },
  apiKeyWarning: {
    fontSize: 12,
    color: "#f59e0b",
    fontStyle: "italic",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    color: "#1f2937",
    fontWeight: "600",
    fontSize: 14,
  },
  confirmButton: {
    backgroundColor: "#667eea",
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default AdminSettingsScreen;
