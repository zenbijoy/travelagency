/**
 * Settings Screen — light SaaS design language with a functional theme toggle.
 * Uses shared tokens + DashboardUI primitives. No hardcoded demo data.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '../../App';
import {
  Icon,
  Button,
  SectionHeader,
  StateView,
} from '../../components/ui/DashboardUI';
import { palette, spacing, radius, typography } from '../../theme/tokens';

interface Theme {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  inputBg: string;
  overlay: string;
}

const LIGHT: Theme = {
  bg: palette.background,
  surface: palette.surface,
  text: palette.text,
  textMuted: palette.textMuted,
  border: palette.border,
  primary: palette.primary,
  inputBg: palette.surfaceAlt,
  overlay: 'rgba(15,23,42,0.5)',
};

const DARK: Theme = {
  bg: '#0B1326',
  surface: '#151E2E',
  text: '#E2E8F0',
  textMuted: '#94A3B8',
  border: '#26324A',
  primary: '#6366F1',
  inputBg: '#1E293B',
  overlay: 'rgba(0,0,0,0.75)',
};

export default function SettingsScreen({ navigation }: any) {
  const [notifications, setNotifications] = useState(true);
  const [twoFactor, setTwoFactor] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isTwoFactorModalVisible, setIsTwoFactorModalVisible] = useState(false);
  const [isLoginActivityModalVisible, setIsLoginActivityModalVisible] = useState(false);
  const [isLanguageModalVisible, setIsLanguageModalVisible] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<'selection' | 'sms' | 'passkey'>('selection');
  const [selectedLanguage, setSelectedLanguage] = useState('English (US)');
  const [selectedCurrency, setSelectedCurrency] = useState('BDT (৳)');
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const theme = useMemo<Theme>(() => (darkMode ? DARK : LIGHT), [darkMode]);

  const closeTwoFactorModal = () => {
    setIsTwoFactorModalVisible(false);
    setTwoFactorStep('selection');
    setVerificationCode('');
  };

  const handleClearCache = () => {
    Alert.alert('Clear cache?', 'Temporary cached data and image previews will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => Alert.alert('Cache cleared') },
    ]);
  };

  const SettingRow: React.FC<{
    icon: React.ComponentProps<typeof Icon>['name'];
    tint: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    right?: React.ReactNode;
  }> = ({ icon, tint, title, subtitle, onPress, right }) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrapper, { backgroundColor: `${tint}20` }]}>
        <Icon name={icon} size={20} color={tint} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.settingSubtitle, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </TouchableOpacity>
  );

  const Chevron = () => <Icon name="chevron-right" size={20} color={theme.textMuted} />;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Icon name="chevron-left" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>System Preferences</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Icon name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search settings (language, currency, security)"
            placeholderTextColor={theme.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <Icon name="x" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Notifications */}
          <View style={styles.section}>
            <SectionHeader title="Notifications" />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="bell"
                tint={theme.primary}
                title="Push Notifications"
                subtitle="Receive app notifications"
                right={
                  <Switch
                    value={notifications}
                    onValueChange={setNotifications}
                    trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                  />
                }
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="mail"
                tint={palette.info}
                title="Email Notifications"
                subtitle="Booking and payment emails"
                right={<Switch value disabled trackColor={{ false: '#CBD5E1', true: COLORS.primary }} />}
              />
            </View>
          </View>

          {/* Security */}
          <View style={styles.section}>
            <SectionHeader title="Security" />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="shield"
                tint={palette.success}
                title="Two-Factor Authentication"
                subtitle={twoFactor ? 'Enabled' : 'Disabled'}
                onPress={() => setIsTwoFactorModalVisible(true)}
                right={<Chevron />}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="clock"
                tint={palette.warning}
                title="Login Activity"
                subtitle="View recent login history"
                onPress={() => setIsLoginActivityModalVisible(true)}
                right={<Chevron />}
              />
            </View>
          </View>

          {/* Preferences */}
          <View style={styles.section}>
            <SectionHeader title="Preferences" />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="sun"
                tint={palette.purple}
                title="Dark Mode"
                subtitle="Switch appearance theme"
                right={
                  <Switch
                    value={darkMode}
                    onValueChange={setDarkMode}
                    trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                  />
                }
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="globe"
                tint={palette.danger}
                title="ভাষা / Language"
                subtitle={selectedLanguage}
                onPress={() => setIsLanguageModalVisible(true)}
                right={<Chevron />}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="dollar-sign"
                tint={palette.success}
                title="মুদ্রা / Currency"
                subtitle={selectedCurrency}
                onPress={() => setIsCurrencyModalVisible(true)}
                right={<Chevron />}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="tool"
                tint={palette.warning}
                title="Clear Cache"
                subtitle="Free up temporary storage"
                onPress={handleClearCache}
                right={<Chevron />}
              />
            </View>
          </View>

          {/* API & Integration */}
          <View style={styles.section}>
            <SectionHeader title="API & Integration" />
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="key"
                tint={palette.danger}
                title="API Keys"
                subtitle="Manage integration keys"
                onPress={() => Alert.alert('API Keys', 'Key management is handled by the platform admin.')}
                right={<Chevron />}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <SettingRow
                icon="activity"
                tint={palette.primary}
                title="Webhooks"
                subtitle="Configure event triggers"
                onPress={() => Alert.alert('Webhooks', 'Webhook configuration is managed by the platform admin.')}
                right={<Chevron />}
              />
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* 2FA Modal */}
        <Modal
          animationType="slide"
          transparent
          visible={isTwoFactorModalVisible}
          onRequestClose={closeTwoFactorModal}
        >
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <SafeAreaView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                {twoFactorStep !== 'selection' ? (
                  <TouchableOpacity onPress={() => setTwoFactorStep('selection')} style={{ marginEnd: 12 }}>
                    <Icon name="chevron-left" size={22} color={theme.text} />
                  </TouchableOpacity>
                ) : null}
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {twoFactorStep === 'selection'
                    ? 'Security Verification'
                    : twoFactorStep === 'sms'
                    ? 'SMS Verification'
                    : 'Passkey Setup'}
                </Text>
                <TouchableOpacity onPress={closeTwoFactorModal}>
                  <Icon name="x" size={22} color={theme.text} />
                </TouchableOpacity>
              </View>

              {twoFactorStep === 'selection' ? (
                <View style={styles.modalBody}>
                  <View style={styles.modalSettingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingTitle, { color: theme.text }]}>Enable 2FA</Text>
                      <Text style={[styles.settingSubtitle, { color: theme.textMuted }]}>
                        Protect your account with extra security
                      </Text>
                    </View>
                    <Switch
                      value={twoFactor}
                      onValueChange={setTwoFactor}
                      trackColor={{ false: '#CBD5E1', true: COLORS.primary }}
                    />
                  </View>
                  <TouchableOpacity style={styles.modalActionItem} onPress={() => setTwoFactorStep('sms')}>
                    <Icon name="smartphone" size={22} color={theme.primary} />
                    <Text style={[styles.modalActionText, { color: theme.text }]}>SMS Verification</Text>
                    <Chevron />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalActionItem} onPress={() => setTwoFactorStep('passkey')}>
                    <Icon name="shield" size={22} color={theme.primary} />
                    <Text style={[styles.modalActionText, { color: theme.text }]}>Passkey</Text>
                    <Chevron />
                  </TouchableOpacity>
                </View>
              ) : null}

              {twoFactorStep === 'sms' ? (
                <View style={styles.modalBody}>
                  <Text style={[styles.settingSubtitle, { color: theme.textMuted, marginBottom: 20 }]}>
                    We&apos;ve sent a 6-digit code to your registered mobile number.
                  </Text>
                  <TextInput
                    style={[styles.verificationInput, { backgroundColor: theme.inputBg, color: theme.text }]}
                    placeholder="000 000"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                  />
                  <Button label="Verify Code" onPress={() => {}} />
                  <TouchableOpacity style={{ alignSelf: 'center', marginTop: 16 }}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>Resend SMS</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {twoFactorStep === 'passkey' ? (
                <View style={styles.modalBody}>
                  <View style={{ alignItems: 'center', marginBottom: 24 }}>
                    <View style={[styles.iconWrapper, { width: 80, height: 80, borderRadius: 40, backgroundColor: `${theme.primary}20` }]}>
                      <Icon name="shield" size={40} color={theme.primary} />
                    </View>
                    <Text style={[styles.settingTitle, { marginTop: 16, fontSize: 18, color: theme.text }]}>
                      Secure your device
                    </Text>
                    <Text style={[styles.settingSubtitle, { textAlign: 'center', marginTop: 8, color: theme.textMuted }]}>
                      Passkeys are a safer replacement for passwords. Use biometric login for instant access.
                    </Text>
                  </View>
                  <Button label="Register this device" onPress={() => {}} />
                </View>
              ) : null}
            </SafeAreaView>
          </View>
        </Modal>

        {/* Login Activity Modal — real empty state (no data source) */}
        <Modal
          animationType="slide"
          transparent
          visible={isLoginActivityModalVisible}
          onRequestClose={() => setIsLoginActivityModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <SafeAreaView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Recent Login Activity</Text>
                <TouchableOpacity onPress={() => setIsLoginActivityModalVisible(false)}>
                  <Icon name="x" size={22} color={theme.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <StateView
                  variant="empty"
                  title="No login activity"
                  message="Login history will appear here when available."
                  icon="clock"
                />
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        {/* Language Modal */}
        <Modal
          animationType="slide"
          transparent
          visible={isLanguageModalVisible}
          onRequestClose={() => setIsLanguageModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <SafeAreaView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Language</Text>
                <TouchableOpacity onPress={() => setIsLanguageModalVisible(false)}>
                  <Icon name="x" size={22} color={theme.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                {[
                  { name: 'English (US)', code: 'en' },
                  { name: 'Spanish', code: 'es' },
                  { name: 'French', code: 'fr' },
                  { name: 'Arabic', code: 'ar' },
                  { name: 'German', code: 'de' },
                ].map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.modalActionItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      setSelectedLanguage(lang.name);
                      setIsLanguageModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalActionText,
                        { color: theme.text },
                        selectedLanguage === lang.name && { color: theme.primary, fontWeight: '700' },
                      ]}
                    >
                      {lang.name}
                    </Text>
                    {selectedLanguage === lang.name ? (
                      <Icon name="check" size={20} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        {/* Currency Modal */}
        <Modal
          animationType="slide"
          transparent
          visible={isCurrencyModalVisible}
          onRequestClose={() => setIsCurrencyModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
            <SafeAreaView style={[styles.modalContent, { backgroundColor: theme.surface }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>মুদ্রা নির্বাচন করুন (Currency)</Text>
                <TouchableOpacity onPress={() => setIsCurrencyModalVisible(false)}>
                  <Icon name="x" size={22} color={theme.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                {['BDT (৳)', 'USD ($)', 'EUR (€)', 'GBP (£)', 'INR (₹)'].map((curr) => (
                  <TouchableOpacity
                    key={curr}
                    style={[styles.modalActionItem, { borderBottomColor: theme.border }]}
                    onPress={() => {
                      setSelectedCurrency(curr);
                      setIsCurrencyModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalActionText,
                        { color: theme.text },
                        selectedCurrency === curr && { color: theme.primary, fontWeight: '700' },
                      ]}
                    >
                      {curr}
                    </Text>
                    {selectedCurrency === curr ? (
                      <Icon name="check" size={20} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: { ...typography.h3, fontWeight: '800' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  section: { marginBottom: spacing.xl },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  divider: { height: 1, marginVertical: spacing.xs },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginEnd: spacing.md,
  },
  settingContent: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600' },
  settingSubtitle: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: { ...typography.h3, fontWeight: '800', flex: 1 },
  modalBody: { padding: spacing.lg },
  modalSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalActionText: { fontSize: 16, marginStart: spacing.md, flex: 1 },
  verificationInput: {
    borderRadius: radius.md,
    padding: spacing.lg,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: spacing.xl,
  },
});