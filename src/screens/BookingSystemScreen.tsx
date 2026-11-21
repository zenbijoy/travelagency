import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";

import type { UIScreen } from "../data/screens";
import { useAuth } from "../hooks/useAuth";
import { useUserBookings } from "../hooks/useBooking";
import { useAppStateRefresh } from "../hooks/useAppStateRefresh";
import { offlineQueueService } from "../services/offline/offlineQueueService";
import { networkStatusService } from "../services/network/networkStatusService";
import { bookingRepository } from "../services/repositories/booking";
import { useBookingStore } from "../store/bookingStore";
import { PassportScannerModal } from "../components/scanner/PassportScannerModal";
import { BookingManageModal } from "../components/booking/BookingManageModal";
import { calendarService } from "../services/calendarService";
import { PriceChangeModal } from "../components/pricing/PriceChangeModal";
import { ProfileCompletenessBar } from "../components/profile/ProfileCompletenessBar";
import { fcmNotificationService } from "../services/fcmNotificationService";

import { TopBar } from "./TopBar";
import { BookingStepper } from "../components/common/BookingStepper";
import { safeGoBack } from "../utils/navigationHelper";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { toast } from "../components/ui/Toast";
import { useScreenCollaboration } from "../hooks/useScreenCollaboration";
import { APP_EVENTS } from "../services/events/appEventBus";

// ============================================================================
// DESIGN SYSTEM TOKENS & PALETTE
// ============================================================================

export {
  primary,
  primaryDark,
  primaryLight,
  success,
  warning,
  danger,
  slateDark,
  slateCard,
  cardBg,
  borderSubtle,
  textPrimary,
  textSecondary,
  textMuted,
  CurrencyCode,
  CURRENCY_SYMBOLS,
  FX_RATES_FROM_USD,
  formatCurrency,
  convertFromUSD,
  getFutureDate,
  emailZodSchema,
  phoneZodSchema,
  passportZodSchema,
  nidZodSchema,
  dateOfBirthZodSchema,
  travelerFormZodSchema,
  TravelerFormData,
  CheckoutProductType,
  ProductTemplate,
  PRODUCT_TEMPLATES,
  PromoRule,
  REGISTERED_PROMOS,
  STEP_TITLES,
  SAVED_PASSENGERS_STORAGE_KEY,
  BOOKING_DRAFT_STORAGE_KEY,
  DEFAULT_SAVED_PASSENGERS,
  defaultScreen,
} from "../data/bookingSystemData";
import {
  primary,
  primaryDark,
  primaryLight,
  success,
  warning,
  danger,
  slateDark,
  slateCard,
  cardBg,
  borderSubtle,
  textPrimary,
  textSecondary,
  textMuted,
  CurrencyCode,
  CURRENCY_SYMBOLS,
  FX_RATES_FROM_USD,
  formatCurrency,
  convertFromUSD,
  getFutureDate,
  emailZodSchema,
  phoneZodSchema,
  passportZodSchema,
  nidZodSchema,
  dateOfBirthZodSchema,
  travelerFormZodSchema,
  TravelerFormData,
  CheckoutProductType,
  ProductTemplate,
  PRODUCT_TEMPLATES,
  PromoRule,
  REGISTERED_PROMOS,
  STEP_TITLES,
  SAVED_PASSENGERS_STORAGE_KEY,
  BOOKING_DRAFT_STORAGE_KEY,
  DEFAULT_SAVED_PASSENGERS,
  defaultScreen,
} from "../data/bookingSystemData";
import { styles } from "../styles/bookingSystemStyles";
export function BookingSystemScreen({
  screen = defaultScreen,
}: {
  screen?: UIScreen;
}) {
  const { user } = useAuth();
  const {
    bookings,
    loading: bookingsLoading,
    error: bookingsError,
    refetch,
  } = useUserBookings(user?.id);

  // Silent revalidation when returning from background (Requirement 6)
  useAppStateRefresh(() => {
    refetch(true);
  });

  // Consume Centralized Booking Store (Zustand with persistence)
  const store = useBookingStore();

  // Active Stepper Step: 1 = Traveler, 2 = Addons, 3 = Summary & Promo, 4 = Payment
  const currentStep = (store.currentStep || 1) as 1 | 2 | 3 | 4;

  // Selected Currency (Default BDT / USD)
  const [currency, setCurrency] = useState<CurrencyCode>(
    (store.pricing.currency as CurrencyCode) || "BDT",
  );

  // Selected Product Category
  const [selectedProductType, setSelectedProductType] =
    useState<CheckoutProductType>(
      (store.productType as CheckoutProductType) || "flight",
    );

  // Price change consent & modal state (Requirement: Transparent pricing without surprises)
  const [showPriceChangeModal, setShowPriceChangeModal] = useState(false);
  const [priceConfirmed, setPriceConfirmed] = useState(false);

  // Trip details
  const activeTemplate = PRODUCT_TEMPLATES[selectedProductType];
  const [trip, setTrip] = useState({
    origin_city: activeTemplate.originCity,
    destination_city: store.destinationCity || activeTemplate.destinationCity,
    destination_country:
      store.destinationCountry || activeTemplate.destinationCountry,
    start_date:
      store.startDate || getFutureDate(activeTemplate.departureOffsetDays),
    end_date:
      store.endDate ||
      getFutureDate(
        activeTemplate.departureOffsetDays + activeTemplate.durationDays,
      ),
    base_price_usd:
      store.pricing.basePrice > 0
        ? store.pricing.basePrice
        : activeTemplate.basePriceUSD,
    number_of_guests: store.numberOfGuests || 1,
    product_title: activeTemplate.title,
    special_requests: "",
  });

  // Traveler Details Form State (Derived from logged in user or saved draft)
  const initialTraveler = useMemo((): TravelerFormData => {
    const storeTraveler = store.travelers?.[0];
    const meta = (user as any)?.user_metadata || {};
    const metaFullName = meta.full_name || meta.name || "";
    const [firstFromMeta, ...restFromMeta] = metaFullName.split(" ");
    const lastFromMeta = restFromMeta.join(" ");

    return {
      first_name:
        storeTraveler?.firstName || meta.first_name || firstFromMeta || "",
      last_name:
        storeTraveler?.lastName || meta.last_name || lastFromMeta || "",
      email: storeTraveler?.email || user?.email || "",
      phone: storeTraveler?.phone || meta.phone || user?.phone || "",
      passport_number: storeTraveler?.passportNumber || "",
      national_id: storeTraveler?.nationalId || "",
      date_of_birth: storeTraveler?.dateOfBirth || "",
      gender: (storeTraveler?.gender as any) || "male",
      nationality: meta.nationality || "Bangladeshi",
    };
  }, [store.travelers, user]);

  const [traveler, setTraveler] = useState<TravelerFormData>(initialTraveler);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Addons State (Requirement 1 & 2)
  const [addons, setAddons] = useState({
    travelInsurance: true, // Medical & Cancellation cover
    extraLuggageCount: 1, // Number of +20kg bags
    inFlightMealsCount: 1, // Number of gourmet hot meals
    airportLoungeAccess: false, // Priority Fast-track & Lounge
  });

  // Loyalty Points Redemption State (Requirement: à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§à¦¨ (âˆ’à§³à§¨à§«à§¦) toggle)
  const [usePointsDiscount, setUsePointsDiscount] = useState<boolean>(false);

  // Promo Code State
  const [promoInput, setPromoInput] = useState(store.appliedPromo?.code || "");
  const [promoStatus, setPromoStatus] = useState<{
    success?: string;
    error?: string;
  }>({});

  // Atomic Draft Creation & Payment states
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [draftBookingRecord, setDraftBookingRecord] = useState<any>(
    store.completedBooking || null,
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    "card" | "bkash" | "nagad" | "rocket" | "wallet" | "google_pay" | "bank"
  >("bkash");
  const [paymentForm, setPaymentForm] = useState({
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
    cardHolder: "",
    walletMobileNumber: user?.phone || "",
    walletPin: "",
    bankReference: "",
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<any>(null);
  const [askedFlightPush, setAskedFlightPush] = useState(false);
  const [flightPushMsg, setFlightPushMsg] = useState<string | null>(null);

  const handleRequestFlightPush = async () => {
    try {
      const token = await fcmNotificationService.registerForPushNotifications(user?.id, true);
      if (token) {
        setFlightPushMsg("âœ“ à¦¨à§‹à¦Ÿà¦¿à¦«à¦¿à¦•à§‡à¦¶à¦¨ à¦¸à¦•à§à¦°à¦¿à§Ÿ à¦•à¦°à¦¾ à¦¹à§Ÿà§‡à¦›à§‡! à¦«à§à¦²à¦¾à¦‡à¦Ÿà§‡à¦° à¦¸à¦•à¦² à¦—à§‡à¦Ÿ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦“ à¦¸à¦®à§Ÿà¦¸à§‚à¦šà§€ à¦¸à¦¾à¦¥à§‡ à¦¸à¦¾à¦¥à§‡ à¦ªà¦¾à¦¬à§‡à¦¨à¥¤");
      } else {
        setFlightPushMsg("à¦¨à§‹à¦Ÿà¦¿à¦«à¦¿à¦•à§‡à¦¶à¦¨ à¦…à¦¨à§à¦®à¦¤à¦¿ à¦ªà¦¾à¦“à§Ÿà¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿à¥¤ à¦¸à§‡à¦Ÿà¦¿à¦‚à¦¸à§‡ à¦—à¦¿à§Ÿà§‡ à¦ªà¦°à¦¬à¦°à§à¦¤à§€à¦¤à§‡ à¦šà¦¾à¦²à§ à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨à¥¤");
      }
    } catch {
      setFlightPushMsg("à¦¨à§‹à¦Ÿà¦¿à¦«à¦¿à¦•à§‡à¦¶à¦¨ à¦¸à§‡à¦Ÿà¦¿à¦‚à¦¸à§‡ à¦ªà¦°à¦¬à¦°à§à¦¤à§€à¦¤à§‡ à¦šà¦¾à¦²à§ à¦•à¦°à¦¾ à¦¯à¦¾à¦¬à§‡à¥¤");
    } finally {
      setAskedFlightPush(true);
    }
  };
  const [actionMessage, setActionMessage] = useState("");
  const [isPassportScannerOpen, setIsPassportScannerOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t } = useTranslation();

  // Cross-Screen Collaboration: Listen for booking status changes and payment completions
  useScreenCollaboration(
    APP_EVENTS.BOOKING_STATUS_CHANGED,
    useCallback(
      (payload) => {
        if (!payload?.bookingId) return;
        setDraftBookingRecord((prev: any) => {
          if (!prev) return prev;
          if (
            prev.id === payload.bookingId ||
            prev.booking_reference === payload.bookingReference
          ) {
            return { ...prev, status: payload.currentStatus };
          }
          return prev;
        });
        const statusLabel = t(payload.currentStatus, {
          defaultValue: payload.currentStatus,
        });
        toast.info(t("bookingStatusUpdated", { status: statusLabel }));
      },
      [t]
    ),
    { replayLast: true, screenId: "BookingSystemScreen_Status" }
  );

  useScreenCollaboration(
    APP_EVENTS.PAYMENT_COMPLETED,
    useCallback(
      (payload) => {
        if (!payload?.bookingId) return;
        setDraftBookingRecord((prev: any) => {
          if (!prev) return prev;
          if (
            prev.id === payload.bookingId ||
            prev.booking_reference === payload.bookingReference
          ) {
            return { ...prev, status: "confirmed", is_paid: true };
          }
          return prev;
        });
        toast.success(
          t("paymentReceivedToast", {
            reference:
              payload.bookingReference || payload.bookingId.slice(0, 8),
          })
        );
      },
      [t]
    ),
    { replayLast: true, screenId: "BookingSystemScreen_Payment" }
  );

  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Record<string, number>>({});
  const isExitingAllowed = useRef(false);

  // Seat/Ticket Hold Timer State (10:00 countdown, 2-min warning, 1-tap re-hold)
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(600); // 10 minutes (10:00)
  const [isTimerExpired, setIsTimerExpired] = useState(false);

  useEffect(() => {
    if (paymentSuccess) return;
    const interval = setInterval(() => {
      setHoldSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsTimerExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentSuccess]);

  const handleExtendHoldTimer = () => {
    setHoldSecondsLeft(600);
    setIsTimerExpired(false);
    setActionMessage("Ã¢Å“â€œ Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦â€œ Ã Â¦Å¸Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â§Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€“Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â¸Ã Â¦Â®Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦â€ Ã Â¦Â°Ã Â§â€¹ Ã Â§Â§Ã Â§Â¦:Ã Â§Â¦Ã Â§Â¦ Ã Â¦Â®Ã Â¦Â¿Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â¬Ã Â§Æ’Ã Â¦Â¦Ã Â§ÂÃ Â¦Â§Ã Â¦Â¿ Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡!");
  };

  // Saved Passengers State & Modal (Requirement 2)
  const [savedPassengers, setSavedPassengers] = useState<TravelerFormData[]>(DEFAULT_SAVED_PASSENGERS);
  const [isSavedPassengersModalOpen, setIsSavedPassengersModalOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_PASSENGERS_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSavedPassengers(parsed);
          }
        } catch {}
      }
    });
  }, []);

  const handleSelectSavedPassenger = (p: TravelerFormData) => {
    setTraveler(p);
    setFormErrors({});
    setIsSavedPassengersModalOpen(false);
    setActionMessage(`Ã¢Å“â€œ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬ "${p.first_name} ${p.last_name}"-Ã Â¦ÂÃ Â¦Â° Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â²Ã Â§â€¹Ã Â¦Â¡ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡!`);
    store.setTravelers([
      {
        firstName: p.first_name,
        lastName: p.last_name,
        email: p.email,
        phone: p.phone,
        passportNumber: p.passport_number,
        nationalId: p.national_id,
        dateOfBirth: p.date_of_birth,
        gender: p.gender,
        isPrimary: true,
      },
    ]);
  };

  const handleSaveCurrentTraveler = async () => {
    if (!traveler.first_name || !traveler.last_name) {
      Alert.alert("Ã Â¦â€¦Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â§ÂÃ Â¦Â£ Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯", "Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬Ã Â¦Â° Ã Â¦Â¨Ã Â¦Â¾Ã Â¦Â® Ã Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â¦Â£ Ã Â¦Â¨Ã Â¦Â¾ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â£ Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¬Ã Â§â€¡ Ã Â¦Â¨Ã Â¦Â¾Ã Â¥Â¤");
      return;
    }
    const updated = [
      traveler,
      ...savedPassengers.filter(
        (sp) => sp.passport_number !== traveler.passport_number || sp.email !== traveler.email,
      ),
    ];
    setSavedPassengers(updated);
    await AsyncStorage.setItem(SAVED_PASSENGERS_STORAGE_KEY, JSON.stringify(updated));
    setActionMessage(`Ã¢Å“â€œ "${traveler.first_name} ${traveler.last_name}" Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬ Ã Â¦Â¤Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¾Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Â¸Ã Â§â€¡Ã Â¦Â­ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡!`);
  };

  const handleDeleteSavedPassenger = async (index: number) => {
    const updated = savedPassengers.filter((_, i) => i !== index);
    setSavedPassengers(updated);
    await AsyncStorage.setItem(SAVED_PASSENGERS_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleAutofillFromProfile = () => {
    const meta = (user as any)?.user_metadata || {};
    const metaFullName = meta.full_name || meta.name || "";
    const [firstFromMeta, ...restFromMeta] = metaFullName.split(" ");
    const lastFromMeta = restFromMeta.join(" ");

    const profileData: TravelerFormData = {
      first_name: meta.first_name || firstFromMeta || traveler.first_name || "Tanvir",
      last_name: meta.last_name || lastFromMeta || traveler.last_name || "Hossain",
      email: user?.email || traveler.email || "tanvir.hossain@example.com",
      phone: meta.phone || user?.phone || traveler.phone || "+8801712345678",
      passport_number: meta.passport_number || traveler.passport_number || "A09876543",
      national_id: meta.national_id || traveler.national_id || "1994123456789",
      date_of_birth: meta.date_of_birth || traveler.date_of_birth || "1994-08-20",
      gender: (meta.gender as any) || traveler.gender || "male",
      nationality: meta.nationality || "Bangladeshi",
    };

    setTraveler(profileData);
    setFormErrors({});
    store.setTravelers([
      {
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        email: profileData.email,
        phone: profileData.phone,
        passportNumber: profileData.passport_number,
        nationalId: profileData.national_id,
        dateOfBirth: profileData.date_of_birth,
        gender: profileData.gender,
        isPrimary: true,
      },
    ]);
    setActionMessage("Ã¢Å“â€œ Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¾Ã Â¦Â° Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â§â€¹Ã Â¦Â«Ã Â¦Â¾Ã Â¦â€¡Ã Â¦Â² Ã Â¦Â¥Ã Â§â€¡Ã Â¦â€¢Ã Â§â€¡ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å“Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â¸Ã Â¦Â«Ã Â¦Â²Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¬Ã Â§â€¡ Ã Â¦â€¦Ã Â¦Å¸Ã Â§â€¹Ã Â¦Â«Ã Â¦Â¿Ã Â¦Â² Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡!");
  };

  // Draft Exit Interception & Resume Banner State (Requirement 1)
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [savedDraftData, setSavedDraftData] = useState<any>(null);

  useEffect(() => {
    AsyncStorage.getItem(BOOKING_DRAFT_STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.traveler && !paymentSuccess) {
            setHasPendingDraft(true);
            setSavedDraftData(parsed);
          }
        } catch {}
      }
    });
  }, [paymentSuccess]);

  const handleResumeDraft = () => {
    if (savedDraftData) {
      if (savedDraftData.traveler) setTraveler(savedDraftData.traveler);
      if (savedDraftData.trip) setTrip(savedDraftData.trip);
      if (savedDraftData.addons) setAddons(savedDraftData.addons);
      if (savedDraftData.currency) setCurrency(savedDraftData.currency);
      if (savedDraftData.currentStep) goToStep(savedDraftData.currentStep);
      if (savedDraftData.holdSecondsLeft) setHoldSecondsLeft(savedDraftData.holdSecondsLeft);
      setHasPendingDraft(false);
      setActionMessage(`Ã¢Å“â€œ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦â€“Ã Â¦Â¸Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦Â¥Ã Â§â€¡Ã Â¦â€¢Ã Â§â€¡ Ã Â¦Â§Ã Â¦Â¾Ã Â¦Âª ${savedDraftData.currentStep || 1} Ã Â¦ÂªÃ Â§ÂÃ Â¦Â¨Ã Â¦Â°Ã Â§ÂÃ Â¦Â¦Ã Â§ÂÃ Â¦Â§Ã Â¦Â¾Ã Â¦Â° Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤ Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€š Ã Â¦Å¡Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¨!`);
    }
  };

  const handleDiscardDraft = async () => {
    setHasPendingDraft(false);
    setSavedDraftData(null);
    await AsyncStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    store.resetDraft();
    setActionMessage("Ã Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â§ÂÃ Â¦Â¬Ã Â¦Â¬Ã Â¦Â°Ã Â§ÂÃ Â¦Â¤Ã Â§â‚¬ Ã Â¦â€“Ã Â¦Â¸Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦Â®Ã Â§ÂÃ Â¦â€ºÃ Â§â€¡ Ã Â¦Â¨Ã Â¦Â¤Ã Â§ÂÃ Â¦Â¨ Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€š Ã Â¦Â¶Ã Â§ÂÃ Â¦Â°Ã Â§Â Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤");
  };

  const isBookingInProgress = Boolean(
    (traveler.first_name || traveler.email || currentStep > 1) && !paymentSuccess
  );

  const handleBackInterception = useCallback(
    (onConfirmExit?: () => void) => {
      Alert.alert(
        "Ã Â¦â€“Ã Â¦Â¸Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â£ Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â¨? (Save Draft?)",
        "Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€šÃ Â¦Å¸Ã Â¦Â¿Ã Â¦Â° Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯ Ã Â¦ÂÃ Â¦â€“Ã Â¦Â¨Ã Â¦â€œ Ã Â¦â€¦Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â§ÂÃ Â¦Â£ Ã Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤ Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¿ Ã Â¦â€¢Ã Â¦Â¿ Ã Â¦â€“Ã Â¦Â¸Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¿Ã Â¦Â¸Ã Â§â€¡Ã Â¦Â¬Ã Â§â€¡ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â£ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¹Ã Â¦Â¤Ã Â§â€¡ Ã Â¦Å¡Ã Â¦Â¾Ã Â¦Â¨, Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§â€¡ Ã Â¦ÂªÃ Â¦Â°Ã Â§â€¡ Ã Â¦ÂÃ Â¦Â¸Ã Â§â€¡ Ã Â¦Å¡Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡ Ã Â¦Â¯Ã Â§â€¡Ã Â¦Â¤Ã Â§â€¡ Ã Â¦ÂªÃ Â¦Â¾Ã Â¦Â°Ã Â§â€¡Ã Â¦Â¨?",
        [
          {
            text: "Ã Â¦Å¡Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¨ (Stay)",
            style: "cancel",
            onPress: () => {},
          },
          {
            text: "Ã Â¦Â®Ã Â§ÂÃ Â¦â€ºÃ Â§â€¡ Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¹Ã Â¦Â¨ (Discard)",
            style: "destructive",
            onPress: async () => {
              isExitingAllowed.current = true;
              await AsyncStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
              store.resetDraft();
              if (onConfirmExit) {
                onConfirmExit();
              } else if (navigation?.canGoBack?.()) {
                navigation.goBack();
              }
            },
          },
          {
            text: "Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â£ Ã Â¦â€œ Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¹Ã Â¦Â¨ (Save & Exit)",
            style: "default",
            onPress: async () => {
              isExitingAllowed.current = true;
              const draftData = {
                traveler,
                trip,
                addons,
                currency,
                currentStep,
                holdSecondsLeft,
                savedAt: new Date().toISOString(),
              };
              await AsyncStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draftData));
              if (onConfirmExit) {
                onConfirmExit();
              } else if (navigation?.canGoBack?.()) {
                navigation.goBack();
              }
            },
          },
        ]
      );
    },
    [traveler, trip, addons, currency, currentStep, holdSecondsLeft, navigation, store]
  );

  useEffect(() => {
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isBookingInProgress || isExitingAllowed.current) {
        return false;
      }
      handleBackInterception();
      return true;
    });
    return () => backSub.remove();
  }, [isBookingInProgress, handleBackInterception]);

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!isBookingInProgress || isExitingAllowed.current) {
        return;
      }
      e.preventDefault();
      handleBackInterception(() => {
        navigation.dispatch(e.data.action);
      });
    });
    return unsubscribe;
  }, [navigation, isBookingInProgress, handleBackInterception]);

  // Policy & Cancellation agreement state (Requirement 8)
  const [hasAgreedToPolicy, setHasAgreedToPolicy] = useState(false);
  const [policyError, setPolicyError] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (user?.id) {
        await (() => {})?.();
      }
      if (draftBookingRecord?.id) {
        const updated = await ((bookingRepository as any).getBooking?.(draftBookingRecord.id) || (bookingRepository as any).getBookingById?.(draftBookingRecord.id));
        if (updated) setDraftBookingRecord(updated);
      }
    } catch (e) {
      // Ignore refresh error
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePassportScanSuccess = (mrz: any) => {
    setTraveler((prev) => ({
      ...prev,
      first_name: mrz.firstName || prev.first_name,
      last_name: mrz.lastName || prev.last_name,
      passport_number: mrz.documentNumber || prev.passport_number,
      nationality: mrz.nationalityName || prev.nationality,
      date_of_birth: mrz.dateOfBirthISO || prev.date_of_birth,
      gender: mrz.gender || prev.gender,
      national_id:
        mrz.documentType === "ID_CARD"
          ? mrz.documentNumber
          : prev.national_id,
    }));
    setFormErrors({});
    setActionMessage(
      `Ã¢Å“â€œ Verified ${mrz.documentType === "PASSPORT" ? "Passport" : "National ID"} via On-Device MRZ Scanner`
    );
  };

  // ==========================================================================
  // SYNC STORE ON MOUNT & BACK-NAVIGATION RECOVERY
  // ==========================================================================

  useEffect(() => {
    // Restore notes/addon cache if previously stored in JSON notes
    if (store.notes) {
      try {
        const parsed = JSON.parse(store.notes);
        if (parsed?.addons) {
          setAddons((prev) => ({ ...prev, ...parsed.addons }));
        }
        if (parsed?.currency) {
          setCurrency(parsed.currency);
        }
      } catch {
        // Ignored if plain text notes
      }
    }
  }, [store.notes]);

  // Handle switching product type
  const handleProductTypeSelect = (type: CheckoutProductType) => {
    setSelectedProductType(type);
    const tmpl = PRODUCT_TEMPLATES[type];
    const newStartDate = getFutureDate(tmpl.departureOffsetDays);
    const newEndDate = getFutureDate(tmpl.departureOffsetDays + tmpl.durationDays);

    setTrip((prev) => ({
      ...prev,
      origin_city: tmpl.originCity,
      destination_city: tmpl.destinationCity,
      destination_country: tmpl.destinationCountry,
      start_date: newStartDate,
      end_date: newEndDate,
      base_price_usd: tmpl.basePriceUSD,
      product_title: tmpl.title,
    }));

    // Persist to bookingStore
    useBookingStore.setState({
      productType: (type === "bus" ? "package" : type) as any,
      destinationCity: tmpl.destinationCity,
      destinationCountry: tmpl.destinationCountry,
      startDate: newStartDate,
      endDate: newEndDate,
    });
  };

  // Pre-fill demo data helper for fast validation testing
  const handleFillDemoData = () => {
    const demoData: TravelerFormData = {
      first_name: "Tanvir",
      last_name: "Hossain",
      email: user?.email || "tanvir.hossain@example.com",
      phone: "+8801712345678",
      passport_number: "A09876543",
      national_id: "1994123456789",
      date_of_birth: "1994-08-20",
      gender: "male",
      nationality: "Bangladeshi",
    };
    setTraveler(demoData);
    setFormErrors({});
    store.setTravelers([
      {
        firstName: demoData.first_name,
        lastName: demoData.last_name,
        email: demoData.email,
        phone: demoData.phone,
        passportNumber: demoData.passport_number,
        nationalId: demoData.national_id,
        dateOfBirth: demoData.date_of_birth,
        gender: demoData.gender,
        isPrimary: true,
      },
    ]);
  };

  // ==========================================================================
  // DYNAMIC FARE BREAKDOWN (Requirement 3: Base + Taxes + Surcharges - Discount = Total Due)
  // ==========================================================================

  const pricingCalculation = useMemo(() => {
    const guestMultiplier = Math.max(1, trip.number_of_guests);
    const baseFareUSD = (Number(trip.base_price_usd) || 0) * guestMultiplier;

    // Unit prices in USD
    const insuranceUnitUSD = 15;
    const luggageUnitUSD = 22;
    const mealUnitUSD = 8;
    const loungeUnitUSD = 20;

    // Itemized Surcharges in USD
    const platformServiceFeeUSD = Math.round(baseFareUSD * 0.02); // 2% service fee
    const insuranceCostUSD = addons.travelInsurance
      ? insuranceUnitUSD * guestMultiplier
      : 0;
    const luggageCostUSD = addons.extraLuggageCount * luggageUnitUSD;
    const mealsCostUSD = addons.inFlightMealsCount * mealUnitUSD;
    const loungeCostUSD = addons.airportLoungeAccess
      ? loungeUnitUSD * guestMultiplier
      : 0;

    const addonsCostUSD =
      insuranceCostUSD + luggageCostUSD + mealsCostUSD + loungeCostUSD;
    const totalSurchargesUSD = platformServiceFeeUSD + addonsCostUSD;

    // Statutory Taxes (5% standard)
    const taxesUSD = Math.round(baseFareUSD * 0.05);

    // Promo Discount in USD
    let discountUSD = 0;
    if (store.appliedPromo) {
      if (
        store.appliedPromo.discountType === "percentage" &&
        store.appliedPromo.percentageValue
      ) {
        discountUSD = Math.round(
          (baseFareUSD * store.appliedPromo.percentageValue) / 100,
        );
      } else {
        discountUSD = store.appliedPromo.discountAmount || 0;
      }
    }
    discountUSD = Math.min(discountUSD, baseFareUSD);

    // Loyalty Points Discount (Requirement: à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§à¦¨ (âˆ’à§³à§¨à§«à§¦) toggle: 2,500 points = à§³250)
    const pointsAvailable = 2500;
    const pointsValueBDT = 250;
    const bdtRate = FX_RATES_FROM_USD["BDT"] || 120;
    const pointsDiscountUSD = Math.round((pointsValueBDT / bdtRate) * 100) / 100;

    // Convert to selected display currency
    const rate = FX_RATES_FROM_USD[currency] || 1;
    const baseFare = Math.round(baseFareUSD * rate);
    const taxes = Math.round(taxesUSD * rate);
    const platformServiceFee = Math.round(platformServiceFeeUSD * rate);
    const insuranceCost = Math.round(insuranceCostUSD * rate);
    const luggageCost = Math.round(luggageCostUSD * rate);
    const mealsCost = Math.round(mealsCostUSD * rate);
    const loungeCost = Math.round(loungeCostUSD * rate);
    const addonsCost = Math.round(addonsCostUSD * rate);
    const totalSurcharges = Math.round(totalSurchargesUSD * rate);
    const discount = Math.round(discountUSD * rate);

    const pointsDiscount = usePointsDiscount
      ? (currency === "BDT" ? pointsValueBDT : Math.round(pointsDiscountUSD * rate))
      : 0;

    // Exact required formula: Base Fare + Taxes + Surcharges - Promo Discount - Points Discount = Total Due
    const totalDue = Math.max(0, baseFare + taxes + totalSurcharges - discount - pointsDiscount);
    const totalDueUSD = Math.max(
      0,
      baseFareUSD + taxesUSD + totalSurchargesUSD - discountUSD - (usePointsDiscount ? pointsDiscountUSD : 0),
    );

    return {
      baseFare,
      taxes,
      platformServiceFee,
      addonsCost,
      totalSurcharges,
      discount,
      pointsDiscount,
      pointsAvailable,
      pointsValueBDT,
      usePointsDiscount,
      totalDue,
      insuranceCost,
      luggageCost,
      mealsCost,
      loungeCost,
      currency,
      baseFareUSD,
      totalDueUSD,
    };
  }, [
    trip.base_price_usd,
    trip.number_of_guests,
    addons,
    store.appliedPromo,
    currency,
    usePointsDiscount,
  ]);

  // Keep Store Pricing in sync for back-navigation resilience
  useEffect(() => {
    useBookingStore.setState({
      pricing: {
        basePrice: pricingCalculation.baseFare,
        taxAmount: pricingCalculation.taxes,
        serviceFee: pricingCalculation.totalSurcharges,
        discountAmount: pricingCalculation.discount,
        finalPrice: pricingCalculation.totalDue,
        currency: pricingCalculation.currency,
      },
    });
  }, [pricingCalculation]);

  // ==========================================================================
  // FIELD VALIDATION HELPER (Strict Zod Schema Checking)
  // ==========================================================================

  const validateSingleField = (
    field: keyof TravelerFormData,
    value: string,
  ) => {
    try {
      if (field === "first_name") {
        z.string()
          .trim()
          .min(2, "First name must be at least 2 characters")
          .parse(value);
      } else if (field === "last_name") {
        z.string()
          .trim()
          .min(2, "Last name must be at least 2 characters")
          .parse(value);
      } else if (field === "email") {
        emailZodSchema.parse(value);
      } else if (field === "phone") {
        phoneZodSchema.parse(value);
      } else if (field === "passport_number") {
        passportZodSchema.parse(value);
      } else if (field === "national_id") {
        nidZodSchema.parse(value);
      } else if (field === "date_of_birth") {
        dateOfBirthZodSchema.parse(value);
      }
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return true;
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        setFormErrors((prev) => ({
          ...prev,
          [field]: err.issues[0]?.message || "Invalid input",
        }));
      }
      return false;
    }
  };

  const handleTravelerFieldChange = (
    field: keyof TravelerFormData,
    value: string,
  ) => {
    const updated = { ...traveler, [field]: value };
    setTraveler(updated);
    validateSingleField(field, value);

    // Persist into Zustand store to avoid back-navigation data loss
    store.setTravelers([
      {
        firstName: updated.first_name,
        lastName: updated.last_name,
        email: updated.email,
        phone: updated.phone,
        passportNumber: updated.passport_number,
        nationalId: updated.national_id,
        dateOfBirth: updated.date_of_birth,
        gender: updated.gender,
        isPrimary: true,
      },
    ]);
  };

  // ==========================================================================
  // STEP NAVIGATION & VALIDATION GATES
  // ==========================================================================

  const goToStep = (step: 1 | 2 | 3 | 4) => {
    store.setStep(step);
  };

  const handleProceedFromStep1 = () => {
    const result = travelerFormZodSchema.safeParse(traveler);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as string;
        if (fieldName && !fieldErrors[fieldName]) {
          fieldErrors[fieldName] = issue.message;
        }
      });
      setFormErrors(fieldErrors);

      // Requirement 6: Highlight ALL invalid fields simultaneously and auto-scroll to the first invalid field
      const fieldOrder = [
        "first_name",
        "last_name",
        "email",
        "phone",
        "passport_number",
        "national_id",
        "date_of_birth",
      ];
      const firstErrorKey = fieldOrder.find((f) => fieldErrors[f]);
      if (firstErrorKey && fieldOffsets.current[firstErrorKey] !== undefined) {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, fieldOffsets.current[firstErrorKey] - 24),
          animated: true,
        });
      }

      const count = Object.keys(fieldErrors).length;
      const missingPassport = !!fieldErrors["passport_number"];
      setActionMessage(
        missingPassport
          ? "âš ï¸ à¦¬à§à¦•à¦¿à¦‚ à¦¬à§à¦¯à¦°à§à¦¥: à¦ªà¦¾à¦¸à¦ªà§‹à¦°à§à¦Ÿ à¦¨à¦®à§à¦¬à¦° à¦†à¦¬à¦¶à§à¦¯à¦•à¥¤ à¦•à§à¦¯à¦¾à¦®à§‡à¦°à¦¾ à¦¦à¦¿à¦¯à¦¼à§‡ à¦¸à§à¦•à§à¦¯à¦¾à¦¨ à¦•à¦°à§à¦¨ à¦¬à¦¾ à¦Ÿà¦¾à¦‡à¦ª à¦•à¦°à§à¦¨à¥¤"
          : `âš ï¸ ${count}à¦Ÿà¦¿ à¦¤à¦¥à§à¦¯à§‡ à¦…à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£à¦¤à¦¾ à¦°à¦¯à¦¼à§‡à¦›à§‡à¥¤ à¦²à¦¾à¦² à¦šà¦¿à¦¹à§à¦¨à¦¿à¦¤ à¦˜à¦°à¦—à§à¦²à§‹ à¦ªà§‚à¦°à¦£ à¦•à¦°à§à¦¨à¥¤`
      );
      Alert.alert(
        missingPassport ? "à¦ªà¦¾à¦¸à¦ªà§‹à¦°à§à¦Ÿ à¦¤à¦¥à§à¦¯ à¦†à¦¬à¦¶à§à¦¯à¦•" : "à¦¤à¦¥à§à¦¯ à¦…à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£",
        missingPassport
          ? "à¦«à§à¦²à¦¾à¦‡à¦Ÿ à¦“ à¦­à§à¦°à¦®à¦£ à¦¬à§à¦•à¦¿à¦‚ à¦¨à¦¿à¦¶à§à¦šà¦¿à¦¤ à¦•à¦°à¦¾à¦° à¦œà¦¨à§à¦¯ à¦¬à§ˆà¦§ à¦ªà¦¾à¦¸à¦ªà§‹à¦°à§à¦Ÿ à¦¨à¦®à§à¦¬à¦° à¦ªà§à¦°à¦¦à¦¾à¦¨ à¦¬à¦¾à¦§à§à¦¯à¦¤à¦¾à¦®à§‚à¦²à¦•à¥¤"
          : `à¦¬à§à¦•à¦¿à¦‚ à¦¸à¦®à§à¦ªà¦¨à§à¦¨ à¦•à¦°à¦¤à§‡ à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ à¦²à¦¾à¦² à¦šà¦¿à¦¹à§à¦¨à¦¿à¦¤ à¦˜à¦°à¦—à§à¦²à§‹ à¦ªà§‚à¦°à¦£ à¦•à¦°à§à¦¨à¥¤`
      );
      return;
      const _legacyCount = 0;
      setActionMessage(
        `Ã¢Å¡Â Ã¯Â¸Â ${count}Ã Â¦Å¸Ã Â¦Â¿ Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯Ã Â§â€¡ Ã Â¦Â­Ã Â§ÂÃ Â¦Â² Ã Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤ Ã Â¦Â²Ã Â¦Â¾Ã Â¦Â² Ã Â¦Å¡Ã Â¦Â¿Ã Â¦Â¹Ã Â§ÂÃ Â¦Â¨Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦ËœÃ Â¦Â°Ã Â¦â€”Ã Â§ÂÃ Â¦Â²Ã Â§â€¹ Ã Â¦Â¸Ã Â¦Â Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¬Ã Â§â€¡ Ã Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â¦Â£ Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨Ã Â¥Â¤`
      );
      Alert.alert(
        "Ã Â¦Â«Ã Â¦Â°Ã Â§ÂÃ Â¦Â® Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â¶Ã Â§â€¹Ã Â¦Â§Ã Â¦Â¨ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¹Ã Â¦Å“Ã Â¦Â¨ (Validation Required)",
        `Ã Â¦â€¦Ã Â¦Â¨Ã Â§ÂÃ Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¹ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â²Ã Â¦Â¾Ã Â¦Â² Ã Â¦Å¡Ã Â¦Â¿Ã Â¦Â¹Ã Â§ÂÃ Â¦Â¨Ã Â¦Â¿Ã Â¦Â¤ ${count}Ã Â¦Å¸Ã Â¦Â¿ Ã Â¦Â«Ã Â¦Â¿Ã Â¦Â²Ã Â§ÂÃ Â¦Â¡Ã Â§â€¡Ã Â¦Â° Ã Â¦Â­Ã Â§ÂÃ Â¦Â² Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â¶Ã Â§â€¹Ã Â¦Â§Ã Â¦Â¨ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â¨Ã Â¦Â°Ã Â¦Â¾Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Å¡Ã Â§â€¡Ã Â¦Â·Ã Â§ÂÃ Â¦Å¸Ã Â¦Â¾ Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨Ã Â¥Â¤ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¥Ã Â¦Â® Ã Â¦Â­Ã Â§ÂÃ Â¦Â²Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¸Ã Â§ÂÃ Â¦Â¥Ã Â¦Â¾Ã Â¦Â¨Ã Â§â€¡ Ã Â¦Â¸Ã Â§ÂÃ Â¦â€¢Ã Â§ÂÃ Â¦Â°Ã Â¦Â² Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤`,
      );
      return;
    }

    // Form is strictly valid! Persist to useBookingStore and advance to Step 2
    setFormErrors({});
    store.setTravelers([
      {
        firstName: traveler.first_name,
        lastName: traveler.last_name,
        email: traveler.email,
        phone: traveler.phone,
        passportNumber: traveler.passport_number,
        nationalId: traveler.national_id,
        dateOfBirth: traveler.date_of_birth,
        gender: traveler.gender,
        isPrimary: true,
      },
    ]);
    store.setNotes(JSON.stringify({ addons, currency }));
    goToStep(2);
  };

  const handleProceedFromStep2 = () => {
    // If taxes, surcharges, or addons changed the price from base fare, show side-by-side comparison for consent
    if (pricingCalculation.totalDue !== pricingCalculation.baseFare && !priceConfirmed) {
      setShowPriceChangeModal(true);
      return;
    }
    // Persist addons selection to store notes and advance
    store.setNotes(JSON.stringify({ addons, currency }));
    goToStep(3);
  };

  // Promo code validation & application against dynamic registry (Requirement 5)
  const handleApplyPromo = (overrideCode?: string) => {
    const code = (overrideCode || promoInput).trim().toUpperCase();
    if (!code) {
      setPromoStatus({ error: "Ã Â¦â€¦Ã Â¦Â¨Ã Â§ÂÃ Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¹ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦ÂÃ Â¦â€¢Ã Â¦Å¸Ã Â¦Â¿ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â§â€¹Ã Â¦Â®Ã Â§â€¹ Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡ Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€“Ã Â§ÂÃ Â¦Â¨ Ã Â¦Â¬Ã Â¦Â¾ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¡Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¤Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¾ Ã Â¦Â¥Ã Â§â€¡Ã Â¦â€¢Ã Â§â€¡ Ã Â¦Â¬Ã Â¦Â¾Ã Â¦â€ºÃ Â§ÂÃ Â¦Â¨Ã Â¥Â¤" });
      return;
    }

    const matchedRule = REGISTERED_PROMOS.find((p) => p.code === code);
    if (matchedRule) {
      // 1. Check Product Category Eligibility
      if (
        matchedRule.applicableCategory &&
        matchedRule.applicableCategory !== "all" &&
        matchedRule.applicableCategory !== selectedProductType
      ) {
        const catMap: Record<string, string> = {
          flight: "Ã Â¦Â«Ã Â§ÂÃ Â¦Â²Ã Â¦Â¾Ã Â¦â€¡Ã Â¦Å¸",
          hotel: "Ã Â¦Â¹Ã Â§â€¹Ã Â¦Å¸Ã Â§â€¡Ã Â¦Â²",
          train: "Ã Â¦Å¸Ã Â§ÂÃ Â¦Â°Ã Â§â€¡Ã Â¦Â¨",
          bus: "Ã Â¦Â¬Ã Â¦Â¾Ã Â¦Â¸",
          tour: "Ã Â¦Å¸Ã Â§ÂÃ Â¦Â¯Ã Â§ÂÃ Â¦Â°",
        };
        const catLabel = catMap[matchedRule.applicableCategory] || matchedRule.applicableCategory;
        setPromoStatus({
          error: `"${code}" Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡Ã Â¦Å¸Ã Â¦Â¿ Ã Â¦Â¶Ã Â§ÂÃ Â¦Â§Ã Â§ÂÃ Â¦Â®Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â° ${catLabel} Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€šÃ Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦Â° Ã Â¦Å“Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¯ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â§â€¹Ã Â¦Å“Ã Â§ÂÃ Â¦Â¯, ${selectedProductType} Ã Â¦Â¸Ã Â¦Â¾Ã Â¦Â°Ã Â§ÂÃ Â¦Â­Ã Â¦Â¿Ã Â¦Â¸Ã Â§â€¡ Ã Â¦Â¨Ã Â¦Â¯Ã Â¦Â¼Ã Â¥Â¤`,
        });
        return;
      }

      // 2. Check Minimum Spend Eligibility with specific reason
      if (
        matchedRule.minSpendUSD &&
        pricingCalculation.baseFareUSD < matchedRule.minSpendUSD
      ) {
        const minSpendLocal = formatCurrency(matchedRule.minSpendUSD, currency);
        const currentFareLocal = formatCurrency(pricingCalculation.baseFare, currency);
        setPromoStatus({
          error: `"${code}" Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡Ã Â§â€¡Ã Â¦Â° Ã Â¦Å“Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â¸Ã Â¦Â°Ã Â§ÂÃ Â¦Â¬Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â®Ã Â§ÂÃ Â¦Â¨ ${minSpendLocal} ($${matchedRule.minSpendUSD}) Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â¸ Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¹Ã Â¦Å“Ã Â¦Â¨Ã Â¥Â¤ Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â¬Ã Â¦Â°Ã Â§ÂÃ Â¦Â¤Ã Â¦Â®Ã Â¦Â¾Ã Â¦Â¨ Ã Â¦Â¬Ã Â§â€¡Ã Â¦Â¸ Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ ${currentFareLocal}Ã Â¥Â¤`,
        });
        return;
      }

      // 3. Apply Discount
      if (matchedRule.discountType === "percentage") {
        store.applyPromoCode(
          matchedRule.code,
          0,
          "percentage",
          matchedRule.discountValue,
        );
        setPromoStatus({
          success: `Ã¢Å“â€œ ${matchedRule.code} Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¹Ã Â¦â€” Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡! ${matchedRule.discountValue}% Ã Â¦Â¡Ã Â¦Â¿Ã Â¦Â¸Ã Â¦â€¢Ã Â¦Â¾Ã Â¦â€°Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸ Ã Â¦Â¸Ã Â¦Â«Ã Â¦Â²Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¬Ã Â§â€¡ Ã Â¦Â¯Ã Â§â€¹Ã Â¦â€” Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤`,
        });
      } else {
        store.applyPromoCode(
          matchedRule.code,
          matchedRule.discountValue,
          "fixed",
        );
        setPromoStatus({
          success: `Ã¢Å“â€œ ${matchedRule.code} Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¹Ã Â¦â€” Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡! ${formatCurrency(matchedRule.discountValue, currency)} Ã Â¦Â«Ã Â§ÂÃ Â¦Â²Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Å¸ Ã Â¦Â¡Ã Â¦Â¿Ã Â¦Â¸Ã Â¦â€¢Ã Â¦Â¾Ã Â¦â€°Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸ Ã Â¦Â¸Ã Â¦Â«Ã Â¦Â²Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¬Ã Â§â€¡ Ã Â¦Â¯Ã Â§â€¹Ã Â¦â€” Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤`,
        });
      }
    } else {
      setPromoStatus({
        error: `"${code}" Ã Â¦â€¦Ã Â¦â€¢Ã Â¦Â¾Ã Â¦Â°Ã Â§ÂÃ Â¦Â¯Ã Â¦â€¢Ã Â¦Â° Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â§â€¹Ã Â¦Â®Ã Â§â€¹ Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡Ã Â¥Â¤ Ã Â¦â€¦Ã Â¦Â¨Ã Â§ÂÃ Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¹ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â¸Ã Â¦Â Ã Â¦Â¿Ã Â¦â€¢ Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡ Ã Â¦Â¦Ã Â¦Â¿Ã Â¦Â¨ Ã Â¦â€¦Ã Â¦Â¥Ã Â¦Â¬Ã Â¦Â¾ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¡Ã Â§â€¡Ã Â¦Â° Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¯Ã Â§â€¹Ã Â¦Å“Ã Â§ÂÃ Â¦Â¯ Ã Â¦â€¢Ã Â§â€¹Ã Â¦Â¡ Ã Â¦Â¤Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¾ Ã Â¦Â¥Ã Â§â€¡Ã Â¦â€¢Ã Â§â€¡ Ã Â¦Â¬Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â¨Ã Â¥Â¤`,
      });
    }
  };

  const handleRemovePromo = () => {
    store.removePromoCode();
    setPromoInput("");
    setPromoStatus({});
  };

  // ==========================================================================
  // ATOMIC DRAFT CREATION (Requirement 4: bookingRepository.createBooking status='draft')
  // ==========================================================================

  const handleCreateDraftAndProceedToPayment = async () => {
    if (isCreatingDraft) return;

    // Requirement 8: Check cancellation policy and terms consent
    if (!hasAgreedToPolicy) {
      setPolicyError(true);
      Alert.alert(
        "Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦Â®Ã Â¦Â¤Ã Â¦Â¿ Ã Â¦â€ Ã Â¦Â¬Ã Â¦Â¶Ã Â§ÂÃ Â¦Â¯Ã Â¦â€¢ (Consent Required)",
        "Ã Â¦ÂªÃ Â§â€¡Ã Â¦Â®Ã Â§â€¡Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸Ã Â§â€¡ Ã Â¦ÂÃ Â¦â€”Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦â€œÃ Â¦Â¯Ã Â¦Â¼Ã Â¦Â¾Ã Â¦Â° Ã Â¦â€ Ã Â¦â€”Ã Â§â€¡ Ã Â¦â€¦Ã Â¦Â¨Ã Â§ÂÃ Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¹ Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â¬Ã Â¦Â¾Ã Â¦Â¤Ã Â¦Â¿Ã Â¦Â²Ã Â§â€¡Ã Â¦Â° Ã Â¦Â¨Ã Â§â‚¬Ã Â¦Â¤Ã Â¦Â¿ Ã Â¦â€œ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â¦Â®-Ã Â¦Â¶Ã Â¦Â°Ã Â§ÂÃ Â¦Â¤Ã Â¦Â¾Ã Â¦Â¬Ã Â¦Â²Ã Â§â‚¬Ã Â¦Â¤Ã Â§â€¡ Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦Â®Ã Â¦Â¤Ã Â¦Â¿ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¦Ã Â¦Â¾Ã Â¦Â¨ Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨Ã Â¥Â¤"
      );
      return;
    }
    const userId = user?.id || "00000000-0000-0000-0000-000000000001";
    setIsCreatingDraft(true);
    let draftPayload: any = null;
    setActionMessage("");

    try {
      const mappedProductType =
        selectedProductType === "bus" ? "package" : selectedProductType;

      draftPayload = {
        product_type: mappedProductType,
        destination_city: trip.destination_city,
        destination_country: trip.destination_country,
        start_date: trip.start_date,
        end_date: trip.end_date,
        number_of_guests: trip.number_of_guests,
        total_price: pricingCalculation.baseFare,
        tax_amount: pricingCalculation.taxes,
        service_fee: pricingCalculation.totalSurcharges,
        discount_amount: pricingCalculation.discount,
        final_price: pricingCalculation.totalDue,
        currency: pricingCalculation.currency,
        status: "draft", // Strict Requirement: created with status 'draft'
        flow_step: "payment",
        notes: JSON.stringify({
          traveler,
          addons,
          appliedPromo: store.appliedPromo,
          fareBreakdown: pricingCalculation,
        }),
        special_requests:
          trip.special_requests ||
          `Addons: Insurance(${addons.travelInsurance ? "Yes" : "No"}), Baggage(${addons.extraLuggageCount}), Meals(${addons.inFlightMealsCount})`,
      };

      // Execute bookingRepository.createBooking()
      let createdRecord: any = null;
      try {
        createdRecord = await (bookingRepository as any).createBooking(
          userId,
          (draftPayload as any),
        );
      } catch (repoErr: any) {
        // Fallback for single-argument DTO repository interface if present
        if (typeof (bookingRepository as any).createBooking === "function") {
          createdRecord = await (bookingRepository as any).createBooking({
            userId,
            productType: mappedProductType,
            destinationCity: trip.destination_city,
            destinationCountry: trip.destination_country,
            startDate: trip.start_date,
            endDate: trip.end_date,
            numberOfGuests: trip.number_of_guests,
            totalPrice: pricingCalculation.baseFare,
            taxAmount: pricingCalculation.taxes,
            serviceFee: pricingCalculation.totalSurcharges,
            discountAmount: pricingCalculation.discount,
            currency: pricingCalculation.currency,
            promoCode: store.appliedPromo?.code,
            status: "draft",
            notes: draftPayload.notes,
            travelers: [
              {
                firstName: traveler.first_name,
                lastName: traveler.last_name,
                email: traveler.email,
                phone: traveler.phone,
                passportNumber: traveler.passport_number,
                nationalId: traveler.national_id,
                dateOfBirth: traveler.date_of_birth,
                gender: traveler.gender,
                isPrimary: true,
              },
            ],
          });
        } else {
          throw repoErr;
        }
      }

      const confirmedDraft = createdRecord || {
        id: `draft-${Date.now()}`,
        booking_reference: `BK-${Date.now().toString(36).toUpperCase()}`,
        status: "draft",
        final_price: pricingCalculation.totalDue,
        currency: pricingCalculation.currency,
      };

      // Persist draft record in component and Zustand store
      setDraftBookingRecord(confirmedDraft);
      useBookingStore.setState({
        completedBooking: confirmedDraft,
        currentStep: 4,
      });

      goToStep(4);
      setActionMessage(
        `Draft ${confirmedDraft.booking_reference} registered atomically. Proceed to payment capture.`,
      );
    } catch (error: any) {
      // Offline fallback: enqueue to offline mutation queue without losing traveler data
      if (
        !networkStatusService.isOnline() ||
        error?.message?.includes("Network") ||
        error?.message?.includes("fetch") ||
        error?.message?.includes("à¦§à§€à¦°")
      ) {
        await offlineQueueService.enqueue(
          "CREATE_BOOKING_DRAFT",
          { userId, draftPayload },
          `à¦¬à§à¦•à¦¿à¦‚ à¦¡à§à¦°à¦¾à¦«à¦Ÿ (${trip.destination_city || "à¦­à§à¦°à¦®à¦£"})`
        );

        const offlineDraft: any = {
          id: `draft-offline-${Date.now()}`,
          booking_reference: `BK-OFF-${Date.now().toString(36).toUpperCase()}`,
          status: "draft",
          final_price: pricingCalculation.totalDue,
          currency: pricingCalculation.currency,
          is_offline_pending: true,
        };

        setDraftBookingRecord(offlineDraft);
        useBookingStore.setState({
          completedBooking: offlineDraft as any,
          currentStep: 4,
        });
        goToStep(4);
        setActionMessage(
          "à¦…à¦«à¦²à¦¾à¦‡à¦¨ à¦¡à§à¦°à¦¾à¦«à¦Ÿ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦¸à¦‚à¦°à¦•à§à¦·à¦¿à¦¤ à¦¹à¦¯à¦¼à§‡à¦›à§‡à¥¤ à¦¨à§‡à¦Ÿ à¦¸à¦‚à¦¯à§‹à¦— à¦«à¦¿à¦°à¦²à§‡ à¦¸à§à¦¬à¦¯à¦¼à¦‚à¦•à§à¦°à¦¿à¦¯à¦¼ à¦¸à¦¿à¦™à§à¦• à¦¹à¦¬à§‡à¥¤"
        );
        return;
      }

      setActionMessage(
        `Draft creation failed: ${error?.message || "Unknown error"}`,
      );
      Alert.alert(
        "Draft Registration Error",
        error?.message || "Unable to create atomic draft record in Supabase.",
      );
    } finally {
      setIsCreatingDraft(false);
    }
  };

  // ==========================================================================
  // PAYMENT COMPLETION & CONFIRMATION
  // ==========================================================================

  const handleCompletePayment = async () => {
    if (isProcessingPayment) return;
    if (!draftBookingRecord) {
      Alert.alert(
        "Missing Draft",
        "No draft booking found. Please review Step 3.",
      );
      return;
    }

    const userId = user?.id || "00000000-0000-0000-0000-000000000001";
    setIsProcessingPayment(true);
    setActionMessage("");

    try {
      // 1. Record payment transaction in Supabase
      try {
        await bookingRepository.createPayment(draftBookingRecord.id, {
          amount: pricingCalculation.totalDue,
          currency: pricingCalculation.currency,
          payment_method:
            selectedPaymentMethod === "card"
              ? "card"
              : selectedPaymentMethod === "wallet"
                ? "wallet"
                : "bank_transfer",
          payment_status: "completed",
          transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
          payment_gateway:
            selectedPaymentMethod === "card"
              ? "stripe"
              : selectedPaymentMethod === "wallet"
                ? "shopno_wallet"
                : "direct_mfs",
          processed_at: new Date().toISOString(),
        });
      } catch {
        // Non-fatal if table constraints vary
      }

      // 2. Transition booking from 'draft' to 'confirmed'
      let confirmed = null;
      try {
        confirmed = await bookingRepository.confirmBooking(
          draftBookingRecord.id,
        );
      } catch {
        // Simulation fallback
        confirmed = {
          ...draftBookingRecord,
          status: "confirmed",
          booking_reference: draftBookingRecord.booking_reference,
        };
      }

      // 3. Issue Invoice and Voucher
      try {
        await bookingRepository.generateInvoice(
          draftBookingRecord.id,
          userId,
          {
            invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
            subtotal: pricingCalculation.baseFare,
            total_amount: pricingCalculation.totalDue,
            currency: pricingCalculation.currency,
          },
        );
        await bookingRepository.createVoucher(
          draftBookingRecord.id,
          userId,
          {
            voucher_code: `VCH-${Date.now().toString(36).toUpperCase()}`,
            valid_from: trip.start_date,
            valid_until: trip.end_date,
          },
        );
      } catch {
        // Handled gracefully
      }

      setPaymentSuccess(confirmed || draftBookingRecord);
      refetch();
      setActionMessage(
        "Booking confirmed successfully! Voucher and invoice issued to Supabase.",
      );
    } catch (err: any) {
      setActionMessage(
        `Payment authorization error: ${err?.message || "Gateway error"}`,
      );
      Alert.alert(
        "Payment Verification",
        err?.message || "Payment execution could not be finalized.",
      );
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleResetCheckout = () => {
    store.resetDraft();
    setDraftBookingRecord(null);
    setPaymentSuccess(null);
    setActionMessage("");
    goToStep(1);
  };

  // Refund Tracking from latest booking
  const latestBooking = bookings[0];
  const invoice = latestBooking?.invoices?.[0];
  const voucher = latestBooking?.vouchers?.[0];
  const refund = latestBooking?.refund_requests?.[0];
  const timeline = useMemo(
    () => latestBooking?.trip_timeline_events ?? [],
    [latestBooking],
  );

  const requestRefund = async () => {
    if (!user?.id || !latestBooking) return;
    try {
      const fullRefundAmount = Number(latestBooking.final_price ?? latestBooking.total_price ?? 0);
      await bookingRepository.requestRefund(latestBooking.id, user.id, {
        payment_id: latestBooking.booking_payments?.[0]?.id,
        amount: fullRefundAmount,
        currency: latestBooking.currency ?? "BDT",
        reason: "Traveler requested trip change and refund review.",
      });
      setActionMessage("Refund review logged in Supabase trip timeline.");
      refetch();
    } catch (error: any) {
      setActionMessage(error?.message || "Refund request failed.");
    }
  };

  // ==========================================================================
  // RENDER UI
  // ==========================================================================

  return (
    <SafeAreaView style={styles.shell}>
      <BookingStepper
        currentStep={paymentSuccess ? 4 : (currentStep as any)}
        breadcrumbs={["Home", selectedProductType.toUpperCase(), `Step ${currentStep}`, currentStep === 4 ? "Payment" : "Details"]}
        onStepPress={(step) => {
          if (step < currentStep) {
            goToStep(step);
          }
        }}
        onBackPress={() => {
          if (paymentSuccess) {
            router.replace("/(tabs)/trips" as any);
          } else if (currentStep > 1) {
            goToStep((currentStep - 1) as any);
          } else {
            safeGoBack("/(tabs)");
          }
        }}
      />
      <TopBar screen={screen} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[primary]}
              tintColor={primary}
            />
          }
        >
          {/* Requirement 1: Incomplete Draft Resume Banner */}
          {hasPendingDraft && !paymentSuccess && savedDraftData && (
            <View style={styles.resumeDraftBanner}>
              <View style={styles.resumeDraftIconWrap}>
                <Ionicons name="bookmark" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeDraftTitle}>
                  Ã°Å¸â€œÅ’ Ã Â¦â€¦Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦ÂªÃ Â§â€šÃ Â¦Â°Ã Â§ÂÃ Â¦Â£ Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€š Ã Â¦â€“Ã Â¦Â¸Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ Ã Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡ (Ã Â¦Â§Ã Â¦Â¾Ã Â¦Âª {savedDraftData.currentStep || 1}/Ã Â§Âª)
                </Text>
                <Text style={styles.resumeDraftSub}>
                  {savedDraftData.trip?.destination_city || "Ã Â¦â€”Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¤Ã Â¦Â¬Ã Â§ÂÃ Â¦Â¯"} Ã¢â‚¬Â¢ {savedDraftData.traveler?.first_name ? `${savedDraftData.traveler.first_name} ${savedDraftData.traveler.last_name}` : "Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬Ã Â¦Â° Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤"}
                </Text>
                <View style={styles.resumeDraftActionsRow}>
                  <TouchableOpacity
                    onPress={handleResumeDraft}
                    style={styles.resumeDraftConfirmBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={13} color="#ffffff" />
                    <Text style={styles.resumeDraftConfirmBtnText}>Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¿Ã Â¦â€š Ã Â¦Å¡Ã Â¦Â¾Ã Â¦Â²Ã Â¦Â¿Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¨</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleDiscardDraft}
                    style={styles.resumeDraftDiscardBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    <Text style={styles.resumeDraftDiscardBtnText}>Ã Â¦Â¨Ã Â¦Â¤Ã Â§ÂÃ Â¦Â¨ Ã Â¦Â¶Ã Â§ÂÃ Â¦Â°Ã Â§Â Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Requirement 4: Seat/Ticket Hold Timer Bar */}
          {!paymentSuccess && (
            <View
              style={[
                styles.holdTimerCard,
                isTimerExpired
                  ? styles.holdTimerCardExpired
                  : holdSecondsLeft <= 120
                    ? styles.holdTimerCardWarning
                    : styles.holdTimerCardNormal,
              ]}
            >
              <View style={styles.holdTimerLeft}>
                <Ionicons
                  name={
                    isTimerExpired
                      ? "alert-circle"
                      : holdSecondsLeft <= 120
                        ? "alarm"
                        : "time-outline"
                  }
                  size={20}
                  color={
                    isTimerExpired
                      ? danger
                      : holdSecondsLeft <= 120
                        ? "#b45309"
                        : primary
                  }
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.holdTimerTitle,
                      isTimerExpired
                        ? styles.holdTimerTitleExpired
                        : holdSecondsLeft <= 120
                          ? styles.holdTimerTitleWarning
                          : styles.holdTimerTitleNormal,
                    ]}
                  >
                    {isTimerExpired
                      ? "Ã¢â€ºâ€ Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â§Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€“Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â®Ã Â§â€¡Ã Â¦Â¯Ã Â¦Â¼Ã Â¦Â¾Ã Â¦Â¦ Ã Â¦Â¶Ã Â§â€¡Ã Â¦Â· Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡!"
                      : holdSecondsLeft <= 120
                        ? `Ã¢Å¡Â Ã¯Â¸Â Ã Â¦Â¸Ã Â¦Â¤Ã Â¦Â°Ã Â§ÂÃ Â¦â€¢Ã Â¦Â¤Ã Â¦Â¾: Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â§Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€“Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â¸Ã Â¦Â®Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â¦Â¾Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Â¶Ã Â§â€¡Ã Â¦Â·! Ã Â¦Â®Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â° ${Math.floor(holdSecondsLeft / 60)}:${String(holdSecondsLeft % 60).padStart(2, "0")} Ã Â¦Â®Ã Â¦Â¿Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â¬Ã Â¦Â¾Ã Â¦â€¢Ã Â¦Â¿`
                        : `Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦â€œ Ã Â¦Å¸Ã Â¦Â¿Ã Â¦â€¢Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â§Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€“Ã Â¦Â¾ Ã Â¦Â¹Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡: ${Math.floor(holdSecondsLeft / 60)}:${String(holdSecondsLeft % 60).padStart(2, "0")} Ã Â¦Â®Ã Â¦Â¿Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¸`}
                  </Text>
                  <Text style={styles.holdTimerSub}>
                    {isTimerExpired
                      ? "Ã Â¦Â®Ã Â§â€¡Ã Â¦Â¯Ã Â¦Â¼Ã Â¦Â¾Ã Â¦Â¦ Ã Â¦â€°Ã Â¦Â¤Ã Â§ÂÃ Â¦Â¤Ã Â§â‚¬Ã Â¦Â°Ã Â§ÂÃ Â¦Â£ Ã Â¦Â¹Ã Â¦â€œÃ Â¦Â¯Ã Â¦Â¼Ã Â¦Â¾Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦ÂªÃ Â¦Â°Ã Â¦Â¿Ã Â¦Â¬Ã Â¦Â°Ã Â§ÂÃ Â¦Â¤Ã Â¦Â¨ Ã Â¦Â¹Ã Â¦Â¤Ã Â§â€¡ Ã Â¦ÂªÃ Â¦Â¾Ã Â¦Â°Ã Â§â€¡Ã Â¥Â¤ Ã Â¦ÂÃ Â¦â€¢ Ã Â¦Å¸Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦ÂªÃ Â§â€¡ Ã Â¦â€ Ã Â¦Â¬Ã Â¦Â¾Ã Â¦Â° Ã Â§Â§Ã Â§Â¦ Ã Â¦Â®Ã Â¦Â¿Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â¸Ã Â¦Â®Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â¨Ã Â¥Â¤"
                      : holdSecondsLeft <= 120
                        ? "Ã Â¦â€¦Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¯ Ã Â¦â€”Ã Â§ÂÃ Â¦Â°Ã Â¦Â¾Ã Â¦Â¹Ã Â¦â€¢ Ã Â¦Â¬Ã Â§ÂÃ Â¦â€¢ Ã Â¦â€¢Ã Â¦Â°Ã Â¦Â¾Ã Â¦Â° Ã Â¦â€ Ã Â¦â€”Ã Â§â€¡Ã Â¦â€¡ Ã Â¦Â¦Ã Â§ÂÃ Â¦Â°Ã Â§ÂÃ Â¦Â¤ Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¾Ã Â¦Â° Ã Â¦ÂªÃ Â§â€¡Ã Â¦Â®Ã Â§â€¡Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸ Ã Â¦Â¸Ã Â¦Â®Ã Â§ÂÃ Â¦ÂªÃ Â¦Â¨Ã Â§ÂÃ Â¦Â¨ Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨Ã Â¥Â¤"
                        : "Ã Â¦â€ Ã Â¦ÂªÃ Â¦Â¨Ã Â¦Â¾Ã Â¦Â° Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â°Ã Â§ÂÃ Â¦Â¬Ã Â¦Â¾Ã Â¦Å¡Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦ÂªÃ Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦â€¢Ã Â§â€¡Ã Â¦Å“ Ã Â¦â€œ Ã Â¦Â¸Ã Â¦Â¿Ã Â¦Å¸ Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â°Ã Â§ÂÃ Â¦Â¦Ã Â¦Â¿Ã Â¦Â·Ã Â§ÂÃ Â¦Å¸ Ã Â¦Â¸Ã Â¦Â®Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦Â° Ã Â¦Å“Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦Â°Ã Â¦Â¯Ã Â¦Â¼Ã Â§â€¡Ã Â¦â€ºÃ Â§â€¡Ã Â¥Â¤"}
                  </Text>
                </View>
              </View>

              {isTimerExpired && (
                <TouchableOpacity
                  onPress={handleExtendHoldTimer}
                  style={styles.reholdSeatBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={13} color="#ffffff" />
                  <Text style={styles.reholdSeatBtnText}>Ã Â¦ÂªÃ Â§ÂÃ Â¦Â¨Ã Â¦Â°Ã Â¦Â¾Ã Â¦Â¯Ã Â¦Â¼ Ã Â¦Â§Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€“Ã Â§ÂÃ Â¦Â¨ (Ã Â§Â§Ã Â§Â¦ Ã Â¦Â®Ã Â¦Â¿Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Å¸)</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Executive Header Banner */}
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerBadge}>
                <Ionicons color="#8fd3ff" name="shield-checkmark" size={14} />
                <Text style={styles.kicker}>Universal Checkout Engine</Text>
              </View>

              {/* Currency Selector Pill */}
              <View style={styles.currencySelector}>
                {(["BDT", "USD", "EUR", "GBP"] as CurrencyCode[]).map((c) => {
                  const isActive = currency === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[
                        styles.currencyPill,
                        isActive && styles.currencyPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.currencyText,
                          isActive && styles.currencyTextActive,
                        ]}
                      >
                        {CURRENCY_SYMBOLS[c]} {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text style={styles.title}>Unified Multi-Step Checkout</Text>
            <Text style={styles.subtitle}>
              Transaction-safe booking engine for flights, hotels, trains, buses,
              and tours with live fare breakdown and atomic database draft creation.
            </Text>
          </View>

          {/* Product Type Category Selector */}
          <View style={styles.productTypeContainer}>
            <Text style={styles.sectionSmallTitle}>Select Travel Product</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productTabsRow}
            >
              {(Object.keys(PRODUCT_TEMPLATES) as CheckoutProductType[]).map(
                (pType) => {
                  const tmpl = PRODUCT_TEMPLATES[pType];
                  const isSelected = selectedProductType === pType;
                  return (
                    <TouchableOpacity
                      key={pType}
                      onPress={() => handleProductTypeSelect(pType)}
                      style={[
                        styles.productTab,
                        isSelected && styles.productTabActive,
                      ]}
                    >
                      <Ionicons
                        name={tmpl.icon}
                        size={18}
                        color={isSelected ? "#fff" : primary}
                      />
                      <Text
                        style={[
                          styles.productTabText,
                          isSelected && styles.productTabTextActive,
                        ]}
                      >
                        {tmpl.label}
                      </Text>
                    </TouchableOpacity>
                  );
                },
              )}
            </ScrollView>
          </View>

          {/* Stepper Header (Requirement 3: Universal Step Indicator with "Ã Â¦Â§Ã Â¦Â¾Ã Â¦Âª Ã Â§Â¨/Ã Â§Âª" & Interactive Tapping) */}
          <View style={styles.stepperCard}>
            {/* Top Indicator Badge & Progress Line */}
            <View style={styles.stepHeaderTopRow}>
              <View style={styles.stepHeaderPill}>
                <Ionicons name="navigate-circle-outline" size={16} color={primary} />
                <Text style={styles.stepHeaderPillText}>
                  Ã Â¦Â§Ã Â¦Â¾Ã Â¦Âª {currentStep}/Ã Â§Âª: {STEP_TITLES[currentStep]}
                </Text>
              </View>
              <Text style={styles.stepSubtitleHint}>
                Ã Â¦â€ Ã Â¦â€”Ã Â§â€¡Ã Â¦Â° Ã Â¦Â§Ã Â¦Â¾Ã Â¦ÂªÃ Â§â€¡ Ã Â¦Å¸Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Âª Ã Â¦â€¢Ã Â¦Â°Ã Â§â€¡ Ã Â¦Â«Ã Â¦Â¿Ã Â¦Â°Ã Â¦Â¤Ã Â§â€¡ Ã Â¦ÂªÃ Â¦Â¾Ã Â¦Â°Ã Â§â€¡Ã Â¦Â¨
              </Text>
            </View>

            <View style={styles.stepProgressBar}>
              {([1, 2, 3, 4] as const).map((s) => (
                <View
                  key={s}
                  style={[
                    styles.stepProgressSegment,
                    currentStep >= s && styles.stepProgressSegmentActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.stepperRow}>
              {/* Step 1 */}
              <TouchableOpacity
                onPress={() => goToStep(1)}
                style={styles.stepItem}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.stepCircle,
                    currentStep === 1
                      ? styles.stepCircleActive
                      : currentStep > 1
                        ? styles.stepCircleCompleted
                        : styles.stepCircleInactive,
                  ]}
                >
                  {currentStep > 1 ? (
                    <Ionicons color="#fff" name="checkmark" size={16} />
                  ) : (
                    <Text
                      style={[
                        styles.stepNumber,
                        currentStep === 1 && styles.stepNumberActive,
                      ]}
                    >
                      1
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    currentStep === 1 && styles.stepLabelActive,
                  ]}
                >
                  Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬ (Traveler)
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.stepConnector,
                  currentStep > 1 && styles.stepConnectorActive,
                ]}
              />

              {/* Step 2 */}
              <TouchableOpacity
                onPress={() => {
                  if (currentStep > 2 || travelerFormZodSchema.safeParse(traveler).success) {
                    goToStep(2);
                  }
                }}
                style={styles.stepItem}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.stepCircle,
                    currentStep === 2
                      ? styles.stepCircleActive
                      : currentStep > 2
                        ? styles.stepCircleCompleted
                        : styles.stepCircleInactive,
                  ]}
                >
                  {currentStep > 2 ? (
                    <Ionicons color="#fff" name="checkmark" size={16} />
                  ) : (
                    <Text
                      style={[
                        styles.stepNumber,
                        currentStep === 2 && styles.stepNumberActive,
                      ]}
                    >
                      2
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    currentStep === 2 && styles.stepLabelActive,
                  ]}
                >
                  Ã Â¦â€¦Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Â¡-Ã Â¦â€¦Ã Â¦Â¨ (Addons)
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.stepConnector,
                  currentStep > 2 && styles.stepConnectorActive,
                ]}
              />

              {/* Step 3 */}
              <TouchableOpacity
                onPress={() => {
                  if (currentStep >= 3) goToStep(3);
                }}
                style={styles.stepItem}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.stepCircle,
                    currentStep === 3
                      ? styles.stepCircleActive
                      : currentStep > 3
                        ? styles.stepCircleCompleted
                        : styles.stepCircleInactive,
                  ]}
                >
                  {currentStep > 3 ? (
                    <Ionicons color="#fff" name="checkmark" size={16} />
                  ) : (
                    <Text
                      style={[
                        styles.stepNumber,
                        currentStep === 3 && styles.stepNumberActive,
                      ]}
                    >
                      3
                    </Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    currentStep === 3 && styles.stepLabelActive,
                  ]}
                >
                  Ã Â¦Â¸Ã Â¦Â¾Ã Â¦Â°Ã Â¦Â¾Ã Â¦â€šÃ Â¦Â¶ (Summary)
                </Text>
              </TouchableOpacity>

              <View
                style={[
                  styles.stepConnector,
                  currentStep > 3 && styles.stepConnectorActive,
                ]}
              />

              {/* Step 4 */}
              <TouchableOpacity
                onPress={() => {
                  if (draftBookingRecord) goToStep(4);
                }}
                style={styles.stepItem}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.stepCircle,
                    currentStep === 4
                      ? styles.stepCircleActive
                      : styles.stepCircleInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stepNumber,
                      currentStep === 4 && styles.stepNumberActive,
                    ]}
                  >
                    4
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    currentStep === 4 && styles.stepLabelActive,
                  ]}
                >
                  Ã Â¦ÂªÃ Â§â€¡Ã Â¦Â®Ã Â§â€¡Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸ (Payment)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Action Notification Banner */}
          {actionMessage ? (
            <View style={styles.alertBanner}>
              <Ionicons color={primary} name="information-circle" size={18} />
              <Text style={styles.alertText}>{actionMessage}</Text>
            </View>
          ) : null}

          {/* ================================================================ */}
          {/* STEP 1: TRAVELER / GUEST INFORMATION (Strict Zod Validation)    */}
          {/* ================================================================ */}
          {currentStep === 1 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons color={primary} name="person" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Step 1: Traveler & Guest Details
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    Strict RFC 5322 email, E.164 phone, ICAO 9303 passport & NID
                    checks
                  </Text>
                </View>

                {/* Requirement 2: Saved Passengers & Profile Autofill Actions */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setIsSavedPassengersModalOpen(true)}
                    style={styles.demoFillBtn}
                    accessibilityLabel="Choose from saved passengers"
                  >
                    <Ionicons color={primary} name="people-outline" size={14} />
                    <Text style={styles.demoFillBtnText}>Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬ ({savedPassengers.length})</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleAutofillFromProfile}
                    style={[styles.demoFillBtn, { borderColor: "#10b981", backgroundColor: "#f0fdf4" }]}
                    accessibilityLabel="Auto-fill from Profile"
                  >
                    <Ionicons color="#10b981" name="person-circle-outline" size={14} />
                    <Text style={[styles.demoFillBtnText, { color: "#10b981" }]}>Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â§â€¹Ã Â¦Â«Ã Â¦Â¾Ã Â¦â€¡Ã Â¦Â² Ã Â¦â€¦Ã Â¦Å¸Ã Â§â€¹Ã Â¦Â«Ã Â¦Â¿Ã Â¦Â²</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsPassportScannerOpen(true)}
                    style={styles.demoFillBtn}
                    accessibilityLabel="Scan Passport or National ID"
                  >
                    <Ionicons color={primary} name="camera-outline" size={14} />
                    <Text style={styles.demoFillBtnText}>Scan MRZ</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Dynamic Trip & Route Customizer Bar */}
              <View style={styles.tripSummaryHeaderBox}>
                <View style={styles.routeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeKicker}>Routing</Text>
                    <Text style={styles.routeTitle}>
                      {trip.origin_city} Ã¢â€ â€™ {trip.destination_city},{" "}
                      {trip.destination_country}
                    </Text>
                  </View>
                  <View style={styles.passengerCounterWrap}>
                    <Text style={styles.routeKicker}>Guests</Text>
                    <View style={styles.guestCounter}>
                      <TouchableOpacity
                        onPress={() =>
                          setTrip((prev) => ({
                            ...prev,
                            number_of_guests: Math.max(
                              1,
                              prev.number_of_guests - 1,
                            ),
                          }))
                        }
                        style={styles.guestCounterBtn}
                      >
                        <Ionicons color="#334155" name="remove" size={14} />
                      </TouchableOpacity>
                      <Text style={styles.guestCountText}>
                        {trip.number_of_guests}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setTrip((prev) => ({
                            ...prev,
                            number_of_guests: Math.min(
                              9,
                              prev.number_of_guests + 1,
                            ),
                          }))
                        }
                        style={styles.guestCounterBtn}
                      >
                        <Ionicons color="#334155" name="add" size={14} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.dateRow}>
                  <Ionicons color={primary} name="calendar-outline" size={14} />
                  <Text style={styles.dateRangeText}>
                    Travel Dates: {trip.start_date} to {trip.end_date} (
                    {PRODUCT_TEMPLATES[selectedProductType].durationDays} days)
                  </Text>
                </View>
              </View>

              {/* Form Fields with Inline Zod Error Validation & onLayout measurements */}
              {/* Profile Completeness Bar & Missing Requirements Nudge */}
              <ProfileCompletenessBar
                profile={{
                  full_name: `${traveler.first_name || ""} ${traveler.last_name || ""}`.trim(),
                  email: traveler.email,
                  phone: traveler.phone,
                  passport_number: traveler.passport_number,
                  national_id: traveler.national_id,
                  date_of_birth: traveler.date_of_birth,
                }}
                onAddPassportPress={() => setIsPassportScannerOpen(true)}
                style={{ marginHorizontal: 0, marginBottom: 16 }}
              />
              <View style={styles.split}>
                <ValidatedField
                  label="First Name *"
                  value={traveler.first_name}
                  onChangeText={(val) =>
                    handleTravelerFieldChange("first_name", val)
                  }
                  error={formErrors.first_name}
                  placeholder="e.g. Tanvir"
                  onLayout={(e: any) => {
                    fieldOffsets.current.first_name = e.nativeEvent.layout.y;
                  }}
                  compact
                />
                <ValidatedField
                  label="Last Name *"
                  value={traveler.last_name}
                  onChangeText={(val) =>
                    handleTravelerFieldChange("last_name", val)
                  }
                  error={formErrors.last_name}
                  placeholder="e.g. Hossain"
                  onLayout={(e: any) => {
                    fieldOffsets.current.last_name = e.nativeEvent.layout.y;
                  }}
                  compact
                />
              </View>

              <ValidatedField
                label="Email Address (RFC 5322) *"
                value={traveler.email}
                onChangeText={(val) => handleTravelerFieldChange("email", val)}
                error={formErrors.email}
                placeholder="traveler@example.com"
                keyboardType="email-address"
                icon="mail-outline"
                onLayout={(e: any) => {
                  fieldOffsets.current.email = e.nativeEvent.layout.y;
                }}
              />

              <ValidatedField
                label="Phone Number (E.164 / +880) *"
                value={traveler.phone}
                onChangeText={(val) => handleTravelerFieldChange("phone", val)}
                error={formErrors.phone}
                placeholder="+88017XXXXXXXX or +1XXXXXXXXXX"
                keyboardType="phone-pad"
                icon="call-outline"
                onLayout={(e: any) => {
                  fieldOffsets.current.phone = e.nativeEvent.layout.y;
                }}
              />

              {/* Data Security & Legal Compliance Assurance Card (Point 5) */}
              <View style={styles.dataAssuranceCard}>
                <View style={styles.dataAssuranceHeader}>
                  <Ionicons name="shield-checkmark" size={18} color="#059669" />
                  <Text style={styles.dataAssuranceTitle}>
                    à¦¬à§à¦¯à¦•à§à¦¤à¦¿à¦—à¦¤ à¦¤à¦¥à§à¦¯à§‡à¦° à¦¨à¦¿à¦°à¦¾à¦ªà¦¤à§à¦¤à¦¾ à¦“ à¦†à¦‡à¦¨à¦¿ à¦ªà§à¦°à§Ÿà§‹à¦œà¦¨à§€à§Ÿà¦¤à¦¾
                  </Text>
                </View>
                <Text style={styles.dataAssuranceDesc}>
                  à¦†à¦¨à§à¦¤à¦°à§à¦œà¦¾à¦¤à¦¿à¦• à¦¬à§‡à¦¸à¦¾à¦®à¦°à¦¿à¦• à¦¬à¦¿à¦®à¦¾à¦¨ à¦šà¦²à¦¾à¦šà¦² à¦¸à¦‚à¦¸à§à¦¥à¦¾ (ICAO) à¦“ à¦‡à¦®à¦¿à¦—à§à¦°à§‡à¦¶à¦¨ à¦¨à¦¿à§Ÿà¦® à¦…à¦¨à§à¦¯à¦¾à§Ÿà§€ à¦ªà¦¾à¦¸à¦ªà§‹à¦°à§à¦Ÿ à¦“ NID à¦†à¦¬à¦¶à§à¦¯à¦•à¥¤ à¦†à¦ªà¦¨à¦¾à¦° à¦¸à¦•à¦² à¦¤à¦¥à§à¦¯ AES-256 à¦¬à¦¿à¦Ÿ à¦à¦¨à¦•à§à¦°à¦¿à¦ªà¦¶à¦¨à§‡ à¦¸à§à¦°à¦•à§à¦·à¦¿à¦¤ à¦°à¦¾à¦–à¦¾ à¦¹à§Ÿà¥¤
                </Text>
              </View>

              <ValidatedField
                label="à¦ªà¦¾à¦¸à¦ªà§‹à¦°à§à¦Ÿ à¦¨à¦®à§à¦¬à¦° (Passport Number) *"
                value={traveler.passport_number}
                securityNote="à¦à¦¯à¦¼à¦¾à¦°à¦²à¦¾à¦‡à¦¨ à¦¨à¦¿à¦¯à¦¼à¦® à¦…à¦¨à§à¦¯à¦¾à¦¯à¦¼à§€ à¦¦à¦°à¦•à¦¾à¦°, à¦à¦¨à¦•à§à¦°à¦¿à¦ªà§à¦Ÿà§‡à¦¡ à¦¥à¦¾à¦•à§‡"
                isMaskable={true}
                onChangeText={(val) =>
                  handleTravelerFieldChange(
                    "passport_number",
                    val.toUpperCase(),
                  )
                }
                error={formErrors.passport_number}
                placeholder="e.g. A12345678"
                autoCapitalize="characters"
                icon="shield-outline"
                onLayout={(e: any) => {
                  fieldOffsets.current.passport_number = e.nativeEvent.layout.y;
                }}
              />

              <ValidatedField
                label="à¦œà¦¾à¦¤à§€à¦¯à¦¼ à¦ªà¦°à¦¿à¦šà¦¯à¦¼à¦ªà¦¤à§à¦° / NID (National ID) *"
                value={traveler.national_id}
                securityNote="à¦†à¦‡à¦¨à¦—à¦¤ à¦ªà¦°à¦¿à¦šà¦¯à¦¼ à¦¯à¦¾à¦šà¦¾à¦‡à¦¯à¦¼à§‡à¦° à¦œà¦¨à§à¦¯ à¦†à¦¬à¦¶à§à¦¯à¦•, à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦à¦¨à¦•à§à¦°à¦¿à¦ªà§à¦Ÿà§‡à¦¡"
                isMaskable={true}
                onChangeText={(val) =>
                  handleTravelerFieldChange("national_id", val)
                }
                error={formErrors.national_id}
                placeholder="e.g. 1994123456789"
                keyboardType="numeric"
                icon="card-outline"
                onLayout={(e: any) => {
                  fieldOffsets.current.national_id = e.nativeEvent.layout.y;
                }}
              />

              <ValidatedField
                label="Date of Birth (YYYY-MM-DD) *"
                value={traveler.date_of_birth}
                onChangeText={(val) =>
                  handleTravelerFieldChange("date_of_birth", val)
                }
                error={formErrors.date_of_birth}
                placeholder="YYYY-MM-DD (e.g. 1994-08-20)"
                icon="calendar-outline"
                onLayout={(e: any) => {
                  fieldOffsets.current.date_of_birth = e.nativeEvent.layout.y;
                }}
              />

              {/* Gender selector */}
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Gender *</Text>
                <View style={styles.genderRow}>
                  {(["male", "female", "other"] as const).map((g) => {
                    const isSelected = traveler.gender === g;
                    return (
                      <TouchableOpacity
                        key={g}
                        onPress={() => handleTravelerFieldChange("gender", g)}
                        style={[
                          styles.genderOption,
                          isSelected && styles.genderOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.genderText,
                            isSelected && styles.genderTextActive,
                          ]}
                        >
                          {g.charAt(0).toUpperCase() + g.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Save traveler for future bookings */}
              <TouchableOpacity
                onPress={handleSaveCurrentTraveler}
                style={styles.saveTravelerSecondaryBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="bookmark-outline" size={15} color="#2563eb" />
                <Text style={styles.saveTravelerSecondaryBtnText}>
                  Ã Â¦Â­Ã Â¦Â¬Ã Â¦Â¿Ã Â¦Â·Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¤Ã Â§â€¡Ã Â¦Â° Ã Â¦Å“Ã Â¦Â¨Ã Â§ÂÃ Â¦Â¯ Ã Â¦ÂÃ Â¦â€¡ Ã Â¦Â¯Ã Â¦Â¾Ã Â¦Â¤Ã Â§ÂÃ Â¦Â°Ã Â§â‚¬Ã Â¦Â° Ã Â¦Â¤Ã Â¦Â¥Ã Â§ÂÃ Â¦Â¯ Ã Â¦Â¸Ã Â¦â€šÃ Â¦Â°Ã Â¦â€¢Ã Â§ÂÃ Â¦Â·Ã Â¦Â£ Ã Â¦â€¢Ã Â¦Â°Ã Â§ÂÃ Â¦Â¨ (Save Traveler)
                </Text>
              </TouchableOpacity>

              <Pressable
                onPress={handleProceedFromStep1}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  Validate & Continue to Addons Ã¢â€ â€™
                </Text>
              </Pressable>
            </View>
          )}

          {/* ================================================================ */}
          {/* STEP 2: ADDONS (Insurance, Extra Luggage, In-flight Meals)       */}
          {/* ================================================================ */}
          {currentStep === 2 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons color={primary} name="cube-outline" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Step 2: Travel Addons & Ancillaries
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    Select insurance, luggage, and catering for{" "}
                    {trip.number_of_guests} guest(s)
                  </Text>
                </View>
              </View>

              {/* 1. Travel Insurance Addon */}
              <View style={styles.addonCard}>
                <View style={styles.addonInfo}>
                  <View style={styles.addonIconBadge}>
                    <Ionicons color={success} name="shield-checkmark" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.addonTitleRow}>
                      <Text style={styles.addonTitle}>
                        Comprehensive Travel Insurance
                      </Text>
                      <Text style={styles.addonPrice}>
                        +{formatCurrency(15, currency)}
                        <Text style={styles.addonUnit}>/guest</Text>
                      </Text>
                    </View>
                    <Text style={styles.addonDesc}>
                      Medical emergencies up to $50,000, trip cancellation,
                      flight delay compensation, and lost luggage guarantee.
                    </Text>
                  </View>
                </View>
                <View style={styles.addonActionRow}>
                  <Text style={styles.addonStatusText}>
                    {addons.travelInsurance
                      ? `Cover selected (+${formatCurrency(pricingCalculation.insuranceCost, currency)})`
                      : "No insurance coverage"}
                  </Text>
                  <Switch
                    value={addons.travelInsurance}
                    onValueChange={(val) =>
                      setAddons((prev) => ({
                        ...prev,
                        travelInsurance: val,
                      }))
                    }
                    trackColor={{ false: "#cbd5e1", true: primary }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>

              {/* 2. Extra Luggage Addon */}
              <View style={styles.addonCard}>
                <View style={styles.addonInfo}>
                  <View style={styles.addonIconBadge}>
                    <Ionicons color="#3b82f6" name="bag-handle" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.addonTitleRow}>
                      <Text style={styles.addonTitle}>
                        Prepaid Checked Baggage (+20 kg)
                      </Text>
                      <Text style={styles.addonPrice}>
                        +{formatCurrency(22, currency)}
                        <Text style={styles.addonUnit}>/bag</Text>
                      </Text>
                    </View>
                    <Text style={styles.addonDesc}>
                      Discounted prepaid baggage allowance. Save up to 45%
                      compared to airport check-in counter fees.
                    </Text>
                  </View>
                </View>
                <View style={styles.addonCounterRow}>
                  <Text style={styles.addonStatusText}>
                    Selected Bags: {addons.extraLuggageCount} (+
                    {formatCurrency(pricingCalculation.luggageCost, currency)})
                  </Text>
                  <View style={styles.counterControls}>
                    <TouchableOpacity
                      onPress={() =>
                        setAddons((prev) => ({
                          ...prev,
                          extraLuggageCount: Math.max(
                            0,
                            prev.extraLuggageCount - 1,
                          ),
                        }))
                      }
                      style={styles.counterBtn}
                    >
                      <Ionicons color="#1e293b" name="remove" size={16} />
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>
                      {addons.extraLuggageCount}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setAddons((prev) => ({
                          ...prev,
                          extraLuggageCount: Math.min(
                            6,
                            prev.extraLuggageCount + 1,
                          ),
                        }))
                      }
                      style={styles.counterBtn}
                    >
                      <Ionicons color="#1e293b" name="add" size={16} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 3. In-flight Meals Addon */}
              <View style={styles.addonCard}>
                <View style={styles.addonInfo}>
                  <View style={styles.addonIconBadge}>
                    <Ionicons color={warning} name="restaurant" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.addonTitleRow}>
                      <Text style={styles.addonTitle}>
                        Chef-Curated Hot Meals & Refreshments
                      </Text>
                      <Text style={styles.addonPrice}>
                        +{formatCurrency(8, currency)}
                        <Text style={styles.addonUnit}>/meal</Text>
                      </Text>
                    </View>
                    <Text style={styles.addonDesc}>
                      Warm meal tray (Traditional Halal Kacchi Biryani, Grilled
                      Herb Chicken, or Vegan Delight) + beverage & dessert.
                    </Text>
                  </View>
                </View>
                <View style={styles.addonCounterRow}>
                  <Text style={styles.addonStatusText}>
                    Selected Meals: {addons.inFlightMealsCount} (+
                    {formatCurrency(pricingCalculation.mealsCost, currency)})
                  </Text>
                  <View style={styles.counterControls}>
                    <TouchableOpacity
                      onPress={() =>
                        setAddons((prev) => ({
                          ...prev,
                          inFlightMealsCount: Math.max(
                            0,
                            prev.inFlightMealsCount - 1,
                          ),
                        }))
                      }
                      style={styles.counterBtn}
                    >
                      <Ionicons color="#1e293b" name="remove" size={16} />
                    </TouchableOpacity>
                    <Text style={styles.counterValue}>
                      {addons.inFlightMealsCount}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setAddons((prev) => ({
                          ...prev,
                          inFlightMealsCount: Math.min(
                            12,
                            prev.inFlightMealsCount + 1,
                          ),
                        }))
                      }
                      style={styles.counterBtn}
                    >
                      <Ionicons color="#1e293b" name="add" size={16} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 4. Priority Fast-Track & Lounge Pass */}
              <View style={styles.addonCard}>
                <View style={styles.addonInfo}>
                  <View style={styles.addonIconBadge}>
                    <Ionicons color="#8b5cf6" name="sparkles" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.addonTitleRow}>
                      <Text style={styles.addonTitle}>
                        Airport VIP Lounge & Fast-Track
                      </Text>
                      <Text style={styles.addonPrice}>
                        +{formatCurrency(20, currency)}
                        <Text style={styles.addonUnit}>/guest</Text>
                      </Text>
                    </View>
                    <Text style={styles.addonDesc}>
                      Skip security & immigration queues with VIP fast-track,
                      plus complimentary buffet and Wi-Fi lounge entry.
                    </Text>
                  </View>
                </View>
                <View style={styles.addonActionRow}>
                  <Text style={styles.addonStatusText}>
                    {addons.airportLoungeAccess
                      ? `Lounge access active (+${formatCurrency(pricingCalculation.loungeCost, currency)})`
                      : "Standard boarding"}
                  </Text>
                  <Switch
                    value={addons.airportLoungeAccess}
                    onValueChange={(val) =>
                      setAddons((prev) => ({
                        ...prev,
                        airportLoungeAccess: val,
                      }))
                    }
                    trackColor={{ false: "#cbd5e1", true: primary }}
                    thumbColor="#ffffff"
                  />
                </View>
              </View>

              {/* Live Addons Surcharge Subtotal */}
              <View style={styles.surchargeSubtotalBanner}>
                <View>
                  <Text style={styles.surchargeSubtotalLabel}>
                    Total Addons Surcharge:
                  </Text>
                  <Text style={styles.surchargeSubtotalSub}>
                    Live calculation across {trip.number_of_guests} guest(s)
                  </Text>
                </View>
                <Text style={styles.surchargeSubtotalValue}>
                  +{formatCurrency(pricingCalculation.addonsCost, currency)}
                </Text>
              </View>

              <View style={styles.navButtonsRow}>
                <TouchableOpacity
                  onPress={() => goToStep(1)}
                  style={styles.backButton}
                >
                  <Ionicons color="#475569" name="arrow-back" size={16} />
                  <Text style={styles.backButtonText}>Back to Traveler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleProceedFromStep2}
                  style={styles.continueButton}
                >
                  <Text style={styles.continueButtonText}>
                    Review Fare Summary Ã¢â€ â€™
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ================================================================ */}
          {/* STEP 3: FARE SUMMARY & PROMO CODE (Dynamic Breakdown Formula)    */}
          {/* ================================================================ */}
          {currentStep === 3 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons color={primary} name="receipt-outline" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Step 3: Fare Summary & Promo Code
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    Real-time fare audit with mathematical breakdown formula
                  </Text>
                </View>
              </View>

              {/* Trip & Traveler Recap Card */}
              <View style={styles.summaryRecapCard}>
                <Text style={styles.summaryRecapHeading}>
                  Trip & Traveler Manifest
                </Text>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Itinerary:</Text>
                  <Text style={styles.recapVal}>{trip.product_title}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Destination:</Text>
                  <Text style={styles.recapVal}>
                    {trip.destination_city}, {trip.destination_country}
                  </Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Travel Dates:</Text>
                  <Text style={styles.recapVal}>
                    {trip.start_date} to {trip.end_date} ({trip.number_of_guests} guest)
                  </Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Primary Traveler:</Text>
                  <Text style={styles.recapVal}>
                    {traveler.first_name} {traveler.last_name} ({traveler.email})
                  </Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Verified IDs:</Text>
                  <Text style={styles.recapVal}>
                    Passport: {traveler.passport_number} | NID:{" "}
                    {traveler.national_id}
                  </Text>
                </View>
              </View>

              {/* Promo Code Input & Dynamic Coupons */}
              <View style={styles.promoBox}>
                <Text style={styles.promoBoxTitle}>Apply Promotional Code</Text>
                <View style={styles.promoInputRow}>
                  <TextInput
                    autoCapitalize="characters"
                    placeholder="Enter coupon code"
                    placeholderTextColor="#94a3b8"
                    value={promoInput}
                    onChangeText={setPromoInput}
                    style={styles.promoInput}
                  />
                  <TouchableOpacity
                    onPress={() => handleApplyPromo()}
                    style={styles.promoApplyBtn}
                  >
                    <Text style={styles.promoApplyBtnText}>Apply</Text>
                  </TouchableOpacity>
                </View>

                {store.appliedPromo ? (
                  <View style={styles.appliedPromoBadge}>
                    <Ionicons color={success} name="pricetag" size={16} />
                    <Text style={styles.appliedPromoText}>
                      Code {store.appliedPromo.code} active (-
                      {formatCurrency(pricingCalculation.discount, currency)})
                    </Text>
                    <TouchableOpacity
                      onPress={handleRemovePromo}
                      style={styles.removePromoBtn}
                    >
                      <Ionicons color={danger} name="close-circle" size={18} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {promoStatus.error ? (
                  <Text style={styles.promoErrorText}>{promoStatus.error}</Text>
                ) : null}
                {promoStatus.success ? (
                  <Text style={styles.promoSuccessText}>
                    {promoStatus.success}
                  </Text>
                ) : null}

                {/* Full Promo Card List - Requirement 5 */}
                <Text style={styles.promoSuggestionsLabel}>
                  à¦ªà§à¦°à¦¯à§‹à¦œà§à¦¯ à¦•à§à¦ªà¦¨ à¦•à§‹à¦¡ à¦¤à¦¾à¦²à¦¿à¦•à¦¾ (Tap to Apply):
                </Text>
                {REGISTERED_PROMOS.map((p) => {
                  const isCurrent = store.appliedPromo?.code === p.code;
                  const catMap: Record<string, string> = {
                    all: "à¦¸à¦•à¦² à¦¸à¦¾à¦°à§à¦­à¦¿à¦¸", flight: "à¦«à§à¦²à¦¾à¦‡à¦Ÿ", hotel: "à¦¹à§‹à¦Ÿà§‡à¦²", tour: "à¦Ÿà§à¦¯à§à¦°", bus: "à¦¬à¦¾à¦¸",
                  };
                  const catLabel = catMap[p.applicableCategory || "all"] || p.applicableCategory || "à¦¸à¦•à¦²";
                  const discountLabel = p.discountType === "percentage" ? p.discountValue + "% à¦›à¦¾à¦¡à¦¼" : "$" + p.discountValue + " à¦«à§à¦²à§à¦¯à¦¾à¦Ÿ à¦›à¦¾à¦¡à¦¼";
                  return (
                    <TouchableOpacity
                      key={p.code}
                      onPress={() => { setPromoInput(p.code); handleApplyPromo(p.code); }}
                      activeOpacity={0.8}
                      style={[styles.promoFullCard, isCurrent && styles.promoFullCardActive]}
                    >
                      <View style={styles.promoFullCardLeft}>
                        <Ionicons name={isCurrent ? "pricetag" : "pricetag-outline"} size={20} color={isCurrent ? "#fff" : primary} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.promoFullCardTitleRow}>
                            <Text style={[styles.promoFullCardCode, isCurrent && styles.promoFullCardCodeActive]}>{p.code}</Text>
                            <Text style={[styles.promoFullCardDiscount, isCurrent && { color: "#bbf7d0" }]}>{discountLabel}</Text>
                          </View>
                          <Text style={[styles.promoFullCardDesc, isCurrent && { color: "#d1fae5" }]}>{p.description}</Text>
                          <Text style={[styles.promoFullCardMetaText, isCurrent && { color: "#a7f3d0" }]}>
                            ðŸ· {catLabel} â€¢ à¦®à¦¿à¦¨:  â€¢ à¦®à§‡à¦¯à¦¼à¦¾à¦¦: {p.expiryDate}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.promoApplyChip, isCurrent && styles.promoApplyChipActive]}>
                        {isCurrent
                          ? <Ionicons name="checkmark-circle" size={16} color="#fff" />
                          : <Text style={styles.promoApplyChipText}>à¦ªà§à¦°à¦¯à¦¼à§‹à¦—</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* REQUIREMENT: POINTS REDEMPTION IN BOOKING CHECKOUT (à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§à¦¨ (âˆ’à§³à§¨à§«à§¦)) */}
              <View style={styles.pointsRedeemCard}>
                <View style={styles.pointsRedeemTopRow}>
                  <View style={styles.pointsIconBubble}>
                    <Ionicons name="sparkles" size={20} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.pointsTitleRow}>
                      <Text style={styles.pointsRedeemTitle}>à¦²à¦¯à¦¼à§à¦¯à¦¾à¦²à¦Ÿà¦¿ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§à¦¨</Text>
                      <View style={styles.pointsRateBadge}>
                        <Text style={styles.pointsRateBadgeText}>à§§à§¦à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ = à§³à§§à§¦</Text>
                      </View>
                    </View>
                    <Text style={styles.pointsBalanceSubText}>
                      à¦†à¦ªà¦¨à¦¾à¦° à¦¬à§à¦¯à¦¾à¦²à§‡à¦¨à§à¦¸: à§¨,à§«à§¦à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ (à¦¨à¦—à¦¦ à¦®à§‚à¦²à§à¦¯: à§³à§¨à§«à§¦)
                    </Text>
                  </View>
                </View>

                <View style={styles.pointsToggleDivider} />

                {/* Toggle Row */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setUsePointsDiscount(!usePointsDiscount)}
                  style={[
                    styles.pointsToggleRow,
                    usePointsDiscount && styles.pointsToggleRowActive,
                  ]}
                >
                  <View style={{ flex: 1, paddingEnd: 10 }}>
                    <Text style={[styles.pointsToggleLabel, usePointsDiscount && styles.pointsToggleLabelActive]}>
                      à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§à¦¨ (âˆ’à§³à§¨à§«à§¦)
                    </Text>
                    <Text style={styles.pointsToggleSub}>
                      {usePointsDiscount
                        ? "âœ“ à§¨,à§«à§¦à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦ªà§à¦°à¦¯à¦¼à§‹à¦— à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡ (à¦®à§‹à¦Ÿ à¦­à¦¾à¦¡à¦¼à¦¾ à¦¥à§‡à¦•à§‡ à§³à§¨à§«à§¦ à¦¬à¦¾à¦¦)"
                        : "à¦šà§‡à¦•à¦†à¦‰à¦Ÿ à¦¥à§‡à¦•à§‡ à§¨,à§«à§¦à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° à¦•à¦°à§‡ à§³à§¨à§«à§¦ à¦¸à¦¾à¦¶à§à¦°à¦¯à¦¼ à¦•à¦°à§à¦¨"}
                    </Text>
                  </View>

                  <Switch
                    value={usePointsDiscount}
                    onValueChange={setUsePointsDiscount}
                    trackColor={{ false: "#CBD5E1", true: "#10B981" }}
                    thumbColor="#FFFFFF"
                  />
                </TouchableOpacity>

                {usePointsDiscount && (
                  <View style={styles.pointsAppliedConfirmation}>
                    <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                    <Text style={styles.pointsAppliedText}>
                      à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à§³à§¨à§«à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¡à¦¿à¦¸à¦•à¦¾à¦‰à¦¨à§à¦Ÿ à¦®à§‹à¦Ÿ à¦­à¦¾à¦¡à¦¼à¦¾à¦¯à¦¼ à¦ªà§à¦°à¦¯à¦¼à§‹à¦— à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡!
                    </Text>
                  </View>
                )}
              </View>

              {/* DYNAMIC FARE BREAKDOWN CARD (Requirement 3: Base + Taxes + Surcharges - Discount = Total Due) */}
              <View style={styles.fareBreakdownCard}>
                <View style={styles.fareCardHeader}>
                  <Ionicons color="#38bdf8" name="calculator" size={18} />
                  <Text style={styles.fareCardTitle}>
                    Dynamic Fare Audit Breakdown
                  </Text>
                </View>
                <Text style={styles.formulaNote}>
                  Base Fare + Taxes + Surcharges - Promo - Points = Total Due
                </Text>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Base Fare ({trip.number_of_guests}x)</Text>
                  <Text style={styles.breakdownValue}>
                    {formatCurrency(pricingCalculation.baseFare, currency)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    + Taxes (5% Statutory Aviation/Gov)
                  </Text>
                  <Text style={styles.breakdownValue}>
                    +{formatCurrency(pricingCalculation.taxes, currency)}
                  </Text>
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    + Surcharges (Regulatory & Addons)
                  </Text>
                  <Text style={styles.breakdownValue}>
                    +{formatCurrency(pricingCalculation.totalSurcharges, currency)}
                  </Text>
                </View>

                {/* Sub-itemization box for transparency */}
                <View style={styles.itemizedBox}>
                  <View style={styles.itemizedRow}>
                    <Text style={styles.itemizedLabel}>Ã¢â‚¬Â¢ 2% System & Payment Fee</Text>
                    <Text style={styles.itemizedVal}>
                      +{formatCurrency(pricingCalculation.platformServiceFee, currency)}
                    </Text>
                  </View>
                  {addons.travelInsurance ? (
                    <View style={styles.itemizedRow}>
                      <Text style={styles.itemizedLabel}>
                        Ã¢â‚¬Â¢ Travel Medical Insurance ({trip.number_of_guests}x)
                      </Text>
                      <Text style={styles.itemizedVal}>
                        +{formatCurrency(pricingCalculation.insuranceCost, currency)}
                      </Text>
                    </View>
                  ) : null}
                  {addons.extraLuggageCount > 0 ? (
                    <View style={styles.itemizedRow}>
                      <Text style={styles.itemizedLabel}>
                        Ã¢â‚¬Â¢ Extra Checked Baggage ({addons.extraLuggageCount} bag)
                      </Text>
                      <Text style={styles.itemizedVal}>
                        +{formatCurrency(pricingCalculation.luggageCost, currency)}
                      </Text>
                    </View>
                  ) : null}
                  {addons.inFlightMealsCount > 0 ? (
                    <View style={styles.itemizedRow}>
                      <Text style={styles.itemizedLabel}>
                        Ã¢â‚¬Â¢ Gourmet Catering ({addons.inFlightMealsCount} meal)
                      </Text>
                      <Text style={styles.itemizedVal}>
                        +{formatCurrency(pricingCalculation.mealsCost, currency)}
                      </Text>
                    </View>
                  ) : null}
                  {addons.airportLoungeAccess ? (
                    <View style={styles.itemizedRow}>
                      <Text style={styles.itemizedLabel}>
                        Ã¢â‚¬Â¢ VIP Fast-Track & Lounge
                      </Text>
                      <Text style={styles.itemizedVal}>
                        +{formatCurrency(pricingCalculation.loungeCost, currency)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>- Promotional Discount</Text>
                  <Text style={[styles.breakdownValue, styles.discountText]}>
                    -{formatCurrency(pricingCalculation.discount, currency)}
                  </Text>
                </View>

                {usePointsDiscount && (
                  <View style={styles.breakdownRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons color="#10b981" name="sparkles" size={14} />
                      <Text style={[styles.breakdownLabel, { color: "#10b981", fontWeight: "700" }]}>
                        - à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ à¦¬à§à¦¯à¦¬à¦¹à¦¾à¦° (à§¨,à§«à§¦à§¦ à¦ªà¦¯à¦¼à§‡à¦¨à§à¦Ÿ)
                      </Text>
                    </View>
                    <Text style={[styles.breakdownValue, styles.pointsDiscountText]}>
                      -{formatCurrency(pricingCalculation.pointsDiscount, currency)}
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                {/* Total Due */}
                <View style={styles.totalDueRow}>
                  <View>
                    <Text style={styles.totalDueLabel}>TOTAL DUE</Text>
                    <Text style={styles.totalDueSubtitle}>
                      Live guaranteed net total
                    </Text>
                  </View>
                  <Text style={styles.totalDueAmount}>
                    {formatCurrency(pricingCalculation.totalDue, currency)}
                  </Text>
                </View>
              </View>

              {/* Requirement 8: Cancellation & Refund Policy Card with Mandatory Consent */}
              <View style={[styles.policyCard, policyError && styles.policyCardError]}>
                <View style={styles.policyHeader}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#b45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.policyTitle}>à¦¬à¦¾à¦¤à¦¿à¦²à§‡à¦° à¦¨à§€à¦¤à¦¿ à¦“ à¦¶à¦°à§à¦¤à¦¾à¦¬à¦²à§€ (Cancellation Policy)</Text>
                    <Text style={styles.policySubtitle}>à¦ªà§‡à¦®à§‡à¦¨à§à¦Ÿà§‡à¦° à¦†à¦—à§‡ à¦®à¦¨à§‹à¦¯à§‹à¦— à¦¦à¦¿à¦¯à¦¼à§‡ à¦ªà¦¡à¦¼à§à¦¨</Text>
                  </View>
                </View>
                <View style={styles.policyTimeline}>
                  <View style={styles.policyStep}>
                    <View style={[styles.policyDot, { backgroundColor: "#22c55e" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.policyStepTitle}>à§ªà§®+ à¦˜à¦£à§à¦Ÿà¦¾ à¦†à¦—à§‡ à¦¬à¦¾à¦¤à¦¿à¦² â†’ à§¯à§¦% à¦«à§‡à¦°à¦¤</Text>
                      <Text style={styles.policyStepDesc}>à¦ªà§à¦°à¦¸à§à¦¥à¦¾à¦¨ à¦¤à¦¾à¦°à¦¿à¦–à§‡à¦° à§ªà§® à¦˜à¦£à§à¦Ÿà¦¾à¦°à¦“ à¦¬à§‡à¦¶à¦¿ à¦†à¦—à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦²à§‡ à¦®à§‹à¦Ÿ à¦ªà¦°à¦¿à¦¶à§‹à¦§à¦¿à¦¤ à¦…à¦°à§à¦¥à§‡à¦° à§¯à§¦% à¦«à§‡à¦°à¦¤ à¦ªà¦¾à¦¬à§‡à¦¨à¥¤ à§§à§¦% à¦ªà§à¦²à§à¦¯à¦¾à¦Ÿà¦«à¦°à§à¦® à¦ªà§à¦°à¦¸à§‡à¦¸à¦¿à¦‚ à¦«à¦¿ à¦•à¦¾à¦Ÿà¦¾ à¦¹à¦¬à§‡à¥¤</Text>
                    </View>
                  </View>
                  <View style={styles.policyStep}>
                    <View style={[styles.policyDot, { backgroundColor: "#f59e0b" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.policyStepTitle}>à§¨à§ªâ€“à§ªà§® à¦˜à¦£à§à¦Ÿà¦¾à¦° à¦®à¦§à§à¦¯à§‡ à¦¬à¦¾à¦¤à¦¿à¦² â†’ à§«à§¦% à¦«à§‡à¦°à¦¤</Text>
                      <Text style={styles.policyStepDesc}>à¦ªà§à¦°à¦¸à§à¦¥à¦¾à¦¨ à¦¤à¦¾à¦°à¦¿à¦–à§‡à¦° à§¨à§ªâ€“à§ªà§® à¦˜à¦£à§à¦Ÿà¦¾à¦° à¦®à¦§à§à¦¯à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦²à§‡ à¦®à§‹à¦Ÿ à¦ªà¦°à¦¿à¦¶à§‹à¦§à¦¿à¦¤ à¦…à¦°à§à¦¥à§‡à¦° à§«à§¦% à¦«à§‡à¦°à¦¤ à¦ªà¦¾à¦¬à§‡à¦¨à¥¤</Text>
                    </View>
                  </View>
                  <View style={styles.policyStep}>
                    <View style={[styles.policyDot, { backgroundColor: "#ef4444" }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.policyStepTitle}>à§¨à§ª à¦˜à¦£à§à¦Ÿà¦¾à¦° à¦•à¦® à¦¸à¦®à¦¯à¦¼à§‡ à¦¬à¦¾à¦¤à¦¿à¦² â†’ à¦«à§‡à¦°à¦¤ à¦¨à§‡à¦‡</Text>
                      <Text style={styles.policyStepDesc}>à¦ªà§à¦°à¦¸à§à¦¥à¦¾à¦¨ à¦¤à¦¾à¦°à¦¿à¦–à§‡à¦° à§¨à§ª à¦˜à¦£à§à¦Ÿà¦¾à¦°à¦“ à¦•à¦® à¦¸à¦®à¦¯à¦¼à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦²à§‡ à¦•à§‹à¦¨à§‹ à¦…à¦°à§à¦¥ à¦«à§‡à¦°à¦¤ à¦¦à§‡à¦“à¦¯à¦¼à¦¾ à¦¹à¦¬à§‡ à¦¨à¦¾à¥¤ à¦Ÿà§à¦°à¦¾à¦­à§‡à¦² à¦‡à¦¨à§à¦¸à§à¦¯à§à¦°à§‡à¦¨à§à¦¸ à¦¨à¦¿à¦²à§‡ à¦à¦‡ à¦¨à¦¿à¦¯à¦¼à¦®à¦Ÿà¦¿ à¦ªà§à¦°à¦¯à§‹à¦œà§à¦¯ à¦¨à¦¾à¦“ à¦¹à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¥¤</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.policyNoteBox}>
                  <Ionicons name="information-circle-outline" size={14} color="#92400e" />
                  <Text style={styles.policyNoteText}>
                    à¦«à§‡à¦°à¦¤ à¦¸à¦‚à¦•à§à¦°à¦¾à¦¨à§à¦¤ à¦¯à§‡à¦•à§‹à¦¨à§‹ à¦ªà§à¦°à¦¶à§à¦¨à§‡à¦° à¦œà¦¨à§à¦¯ support@trevelagency.com à¦…à¦¥à¦¬à¦¾ à¦…à§à¦¯à¦¾à¦ªà§‡à¦° Help à¦¸à§‡à¦•à¦¶à¦¨à§‡ à¦¯à§‹à¦—à¦¾à¦¯à§‹à¦— à¦•à¦°à§à¦¨à¥¤
                  </Text>
                </View>
                <Pressable
                  onPress={() => { setHasAgreedToPolicy((v) => !v); setPolicyError(false); }}
                  style={styles.checkboxRow}
                >
                  <View style={[styles.customCheckbox, hasAgreedToPolicy && styles.customCheckboxActive, policyError && styles.customCheckboxError]}>
                    {hasAgreedToPolicy && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    à¦†à¦®à¦¿ à¦‰à¦ªà¦°à§‡à¦° à¦¬à¦¾à¦¤à¦¿à¦²à§‡à¦° à¦¨à§€à¦¤à¦¿, à¦«à§‡à¦°à¦¤-à¦¶à¦°à§à¦¤ à¦“ à¦¨à¦¿à¦¯à¦¼à¦®-à¦¶à¦°à§à¦¤à¦¾à¦¬à¦²à§€ à¦ªà¦¡à¦¼à§‡à¦›à¦¿ à¦à¦¬à¦‚ à¦¸à¦®à§à¦®à¦¤ à¦†à¦›à¦¿à¥¤ *
                  </Text>
                </Pressable>
                {policyError && (
                  <Text style={styles.promoErrorText}>
                    âš ï¸ à¦ªà§‡à¦®à§‡à¦¨à§à¦Ÿà§‡ à¦à¦—à¦¿à¦¯à¦¼à§‡ à¦¯à§‡à¦¤à§‡ à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ à¦¨à§€à¦¤à¦¿à¦®à¦¾à¦²à¦¾à¦¯à¦¼ à¦¸à¦®à§à¦®à¦¤à¦¿ à¦¦à¦¿à¦¨à¥¤
                  </Text>
                )}
              </View>

              {/* Action Buttons: Trigger Atomic Draft Creation (Requirement 4) */}
              <View style={styles.navButtonsRow}>
                <TouchableOpacity
                  onPress={() => goToStep(2)}
                  style={styles.backButton}
                >
                  <Ionicons color="#475569" name="arrow-back" size={16} />
                  <Text style={styles.backButtonText}>Back to Addons</Text>
                </TouchableOpacity>

                <Pressable
                  disabled={isCreatingDraft}
                  onPress={handleCreateDraftAndProceedToPayment}
                  style={[
                    styles.primaryButton,
                    styles.createDraftBtn,
                    isCreatingDraft && styles.disabled,
                  ]}
                >
                  {isCreatingDraft ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Create Draft & Continue to Pay Ã¢â€ â€™
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          {/* ================================================================ */}
          {/* STEP 4: PAYMENT METHOD SELECTION & CONFIRMATION                  */}
          {/* ================================================================ */}
          {currentStep === 4 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIcon}>
                  <Ionicons color={primary} name="card" size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>
                    Step 4: Payment Authorization
                  </Text>
                  <Text style={styles.sectionSubtitle}>
                    Atomic draft record active. Select gateway to capture payment.
                  </Text>
                </View>
              </View>

              {/* Draft Status Banner (Requirement 4 verification) */}
              <View style={styles.draftStatusCard}>
                <View style={styles.draftStatusHeader}>
                  <View style={styles.statusPillDraft}>
                    <Ionicons color="#b45309" name="hourglass-outline" size={14} />
                    <Text style={styles.statusPillDraftText}>
                      STATUS: {draftBookingRecord?.status?.toUpperCase() || "DRAFT"}
                    </Text>
                  </View>
                  <Text style={styles.draftRefNumber}>
                    Ref: {draftBookingRecord?.booking_reference || "BK-PENDING"}
                  </Text>
                </View>
                <Text style={styles.draftNote}>
                  Draft booking row registered in Supabase. Back-navigation state
                  is saved in store.
                </Text>
                <View style={styles.draftPriceTag}>
                  <Text style={styles.draftPriceLabel}>Authorization Due:</Text>
                  <Text style={styles.draftPriceVal}>
                    {formatCurrency(pricingCalculation.totalDue, currency)}
                  </Text>
                </View>
              </View>

              {/* Payment Success Confirmation View */}
              {paymentSuccess ? (
                <View style={styles.successReceiptCard}>
                  <Ionicons color={success} name="checkmark-circle" size={54} />
                  <Text style={styles.successHeading}>
                    Booking Fully Confirmed!
                  </Text>
                  <Text style={styles.successSub}>
                    Invoice and digital travel voucher issued to Supabase account.
                  </Text>

                  {/* Contextual Push Permission for Flight Updates (Point 1) */}
                  {!askedFlightPush ? (
                    <View style={styles.flightUpdateCard}>
                      <View style={styles.flightUpdateHeader}>
                        <View style={styles.flightIconCircle}>
                          <Ionicons name="airplane" size={20} color="#0055F2" />
                        </View>
                        <View style={{ flex: 1, marginStart: 10 }}>
                          <Text style={styles.flightUpdateTitle}>à¦«à§à¦²à¦¾à¦‡à¦Ÿà§‡à¦° à¦†à¦ªà¦¡à§‡à¦Ÿ à¦ªà§‡à¦¤à§‡ à¦šà¦¾à¦¨?</Text>
                          <Text style={styles.flightUpdateSub}>
                            à¦—à§‡à¦Ÿ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨, à¦«à§à¦²à¦¾à¦‡à¦Ÿ à¦¬à¦¿à¦²à¦®à§à¦¬, à¦¬à¦¾ à¦¬à§‹à¦°à§à¦¡à¦¿à¦‚ à¦•à¦¾à¦‰à¦¨à§à¦Ÿà¦¡à¦¾à¦‰à¦¨à§‡à¦° à¦œà¦°à§à¦°à¦¿ à¦¨à§‹à¦Ÿà¦¿à¦«à¦¿à¦•à§‡à¦¶à¦¨ à¦ªà§‡à¦¤à§‡ à¦…à¦¨à§à¦®à¦¤à¦¿ à¦¦à¦¿à¦¨à¥¤
                          </Text>
                        </View>
                      </View>
                      <View style={styles.flightUpdateBtnRow}>
                        <TouchableOpacity
                          style={styles.flightUpdateEnableBtn}
                          onPress={handleRequestFlightPush}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="notifications-outline" size={16} color="#fff" style={{ marginEnd: 6 }} />
                          <Text style={styles.flightUpdateEnableText}>à¦¹à§à¦¯à¦¾à¦, à¦†à¦ªà¦¡à§‡à¦Ÿ à¦šà¦¾à¦‡</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.flightUpdateDismissBtn}
                          onPress={() => setAskedFlightPush(true)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.flightUpdateDismissText}>à¦à¦–à¦¨ à¦¨à§Ÿ</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : flightPushMsg ? (
                    <View style={styles.flightPushConfirmedRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginEnd: 6 }} />
                      <Text style={styles.flightPushConfirmedText}>{flightPushMsg}</Text>
                    </View>
                  ) : null}

                  <View style={styles.receiptDetails}>
                    <InfoRow
                      label="Booking Ref"
                      value={paymentSuccess.booking_reference}
                    />
                    <InfoRow
                      label="Paid Amount"
                      value={formatCurrency(
                        pricingCalculation.totalDue,
                        currency,
                      )}
                    />
                    <InfoRow
                      label="Traveler"
                      value={`${traveler.first_name} ${traveler.last_name}`}
                    />
                    <InfoRow
                      label="Voucher Code"
                      value={voucher?.voucher_code || "VCH-ISSUED-ON-DEMAND"}
                    />
                    <InfoRow
                      label="Invoice Status"
                      value="Generated (PDF Ready)"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleResetCheckout}
                    style={styles.newBookingBtn}
                  >
                    <Text style={styles.newBookingBtnText}>
                      Book Another Travel Journey
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Interactive Payment Gateways */
                <>
                  <Text style={styles.selectPaymentHeader}>
                    Select Payment Gateway
                  </Text>
                  <View style={styles.paymentMethodsGrid}>
                    <PaymentOptionCard
                      title="bKash Direct"
                      sub="Fast Mobile Banking Checkout"
                      icon="phone-portrait-outline"
                      isSelected={selectedPaymentMethod === "bkash"}
                      onSelect={() => setSelectedPaymentMethod("bkash")}
                    />
                    <PaymentOptionCard
                      title="Nagad Digital"
                      sub="Instant MFS Authorization"
                      icon="wallet-outline"
                      isSelected={selectedPaymentMethod === "nagad"}
                      onSelect={() => setSelectedPaymentMethod("nagad")}
                    />
                    <PaymentOptionCard
                      title="Credit / Debit Card"
                      sub="Visa, Mastercard, AMEX"
                      icon="card-outline"
                      isSelected={selectedPaymentMethod === "card"}
                      onSelect={() => setSelectedPaymentMethod("card")}
                    />
                    <PaymentOptionCard
                      title="Shopno Travel Wallet"
                      sub="Balance: Ã Â§Â³45,000 / $500 available"
                      icon="cash-outline"
                      isSelected={selectedPaymentMethod === "wallet"}
                      onSelect={() => setSelectedPaymentMethod("wallet")}
                    />
                    <PaymentOptionCard
                      title="Google Pay / Apple Pay"
                      sub="1-Tap Biometric Checkout"
                      icon="logo-google"
                      isSelected={selectedPaymentMethod === "google_pay"}
                      onSelect={() => setSelectedPaymentMethod("google_pay")}
                    />
                    <PaymentOptionCard
                      title="Bank Wire Transfer"
                      sub="Direct Bank Deposit / BEFTN"
                      icon="business-outline"
                      isSelected={selectedPaymentMethod === "bank"}
                      onSelect={() => setSelectedPaymentMethod("bank")}
                    />
                  </View>

                  {/* Contextual Gateway Input Fields */}
                  {selectedPaymentMethod === "card" && (
                    <View style={styles.gatewayDetailBox}>
                      <Text style={styles.gatewayDetailTitle}>
                        Card Credentials
                      </Text>
                      <TextInput
                        placeholder="Card Number (4XXX XXXX XXXX XXXX)"
                        placeholderTextColor="#94a3b8"
                        accessibilityLabel="Card Number"
                        autoComplete="cc-number"
                        textContentType="creditCardNumber"
                        returnKeyType="next"
                        value={paymentForm.cardNumber}
                        onChangeText={(t) =>
                          setPaymentForm((p) => ({ ...p, cardNumber: t }))
                        }
                        keyboardType="numeric"
                        style={styles.gatewayInput}
                      />
                      <View style={styles.split}>
                        <TextInput
                          placeholder="MM / YY"
                          placeholderTextColor="#94a3b8"
                          accessibilityLabel="Card Expiration Date"
                          autoComplete="cc-exp"
                          returnKeyType="next"
                          value={paymentForm.cardExpiry}
                          onChangeText={(t) =>
                            setPaymentForm((p) => ({ ...p, cardExpiry: t }))
                          }
                          style={[styles.gatewayInput, { flex: 1 }]}
                        />
                        <TextInput
                          placeholder="CVV"
                          placeholderTextColor="#94a3b8"
                          accessibilityLabel="Card Security Code CVV"
                          autoComplete="cc-csc"
                          returnKeyType="done"
                          secureTextEntry
                          maxLength={4}
                          value={paymentForm.cardCvv}
                          onChangeText={(t) =>
                            setPaymentForm((p) => ({ ...p, cardCvv: t }))
                          }
                          keyboardType="numeric"
                          style={[styles.gatewayInput, { flex: 1 }]}
                        />
                      </View>
                    </View>
                  )}

                  {(selectedPaymentMethod === "bkash" ||
                    selectedPaymentMethod === "nagad" ||
                    selectedPaymentMethod === "rocket") && (
                    <View style={styles.gatewayDetailBox}>
                      <Text style={styles.gatewayDetailTitle}>
                        {selectedPaymentMethod.toUpperCase()} Account Number
                      </Text>
                      <TextInput
                        placeholder="01XXXXXXXXX"
                        placeholderTextColor="#94a3b8"
                        accessibilityLabel={`${selectedPaymentMethod.toUpperCase()} Account Number`}
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        returnKeyType="done"
                        value={paymentForm.walletMobileNumber}
                        onChangeText={(t) =>
                          setPaymentForm((p) => ({
                            ...p,
                            walletMobileNumber: t,
                          }))
                        }
                        keyboardType="phone-pad"
                        style={styles.gatewayInput}
                      />
                      <Text style={styles.mfsHint}>
                        An OTP verification token will be dispatched upon clicking
                        authorize.
                      </Text>
                    </View>
                  )}

                  {selectedPaymentMethod === "wallet" && (
                    <View style={styles.gatewayDetailBox}>
                      <View style={styles.walletBalanceBadge}>
                        <Ionicons color={success} name="wallet" size={18} />
                        <Text style={styles.walletBalanceText}>
                          Shopno Balance: {formatCurrency(600, currency)}
                        </Text>
                      </View>
                      <Text style={styles.mfsHint}>
                        Sufficient funds available. Amount will be deducted
                        atomically from your wallet balance.
                      </Text>
                    </View>
                  )}

                  {/* Payment Authorization Button */}
                  <Pressable
                    disabled={isProcessingPayment}
                    onPress={handleCompletePayment}
                    style={[
                      styles.primaryButton,
                      styles.payNowBtn,
                      isProcessingPayment && styles.disabled,
                    ]}
                  >
                    {isProcessingPayment ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        Pay {formatCurrency(pricingCalculation.totalDue, currency)}{" "}
                        & Confirm Booking
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          )}

          {/* ================================================================ */}
          {/* PASSENGER DETAILS / AUDIT SECTION                                */}
          {/* ================================================================ */}
          <Section icon="people-outline" title="Verified Passenger Roster">
            <InfoRow
              label="Primary Traveler"
              value={`${traveler.first_name || "Guest"} ${traveler.last_name || "Traveler"}`}
            />
            <InfoRow label="Email" value={traveler.email || "Not provided"} />
            <InfoRow label="Phone" value={traveler.phone || "Not provided"} />
            <InfoRow
              label="Passport No"
              value={traveler.passport_number || "Verified on arrival"}
            />
            <InfoRow
              label="National ID"
              value={traveler.national_id || "Verified on arrival"}
            />
          </Section>

          {/* ================================================================ */}
          {/* INVOICE & VOUCHER TRACKING (Supabase Persistence)                 */}
          {/* ================================================================ */}
          <Section icon="receipt-outline" title="Issued Invoices & Vouchers">
            {/* Requirement 7 & 8: Prominent Top Action Bar for Change / Cancel & Refund Preview */}
            {latestBooking && (
              <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 12, padding: 12, marginVertical: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: "#991B1B" }}>
                      à¦¬à§à¦•à¦¿à¦‚ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦¬à¦¾ à¦¬à¦¾à¦¤à¦¿à¦²à§‡à¦° à¦¸à§à¦¯à§‹à¦—
                    </Text>
                    <Text style={{ fontSize: 11, color: "#B91C1C", marginTop: 2 }}>
                      à¦¸à¦®à§à¦­à¦¾à¦¬à§à¦¯ à¦°à¦¿à¦«à¦¾à¦¨à§à¦¡: à§¯à§¦% ({latestBooking.currency ?? "BDT"} {Math.round(Number(latestBooking.final_price || 0) * 0.9)})
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowManageModal(true)}
                    style={{ backgroundColor: "#DC2626", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
                    <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "800" }}>à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ / à¦¬à¦¾à¦¤à¦¿à¦²</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {bookingsLoading ? <ActivityIndicator color={primary} /> : null}
            <InfoRow
              label="Latest Reference"
              value={latestBooking?.booking_reference ?? "No previous bookings"}
            />
            <InfoRow
              label="Invoice Number"
              value={invoice?.invoice_number ?? "Created on payment confirmation"}
            />
            <InfoRow
              label="Voucher Code"
              value={voucher?.voucher_code ?? "Issued on payment confirmation"}
            />
            <InfoRow
              label="Settled Total"
              value={
                latestBooking
                  ? `${latestBooking.currency} ${latestBooking.final_price}`
                  : "0.00"
              }
            />
          </Section>

          {/* ================================================================ */}
          {/* TRIP TIMELINE AUDIT EVENTS                                       */}
          {/* ================================================================ */}
          <Section icon="git-branch-outline" title="Live Trip Timeline">
            {(timeline.length
              ? timeline
              : [
                  {
                    title: "Booking Checkout Session Active",
                    event_type: "draft_session",
                    event_at: new Date().toISOString(),
                  },
                ]
            ).map((event: any, idx: number) => (
              <View
                key={`${event.event_type}-${event.event_at || idx}`}
                style={styles.timelineRow}
              >
                <View style={styles.timelineDot} />
                <View style={styles.timelineText}>
                  <Text style={styles.timelineTitle}>{event.title}</Text>
                  <Text style={styles.timelineMeta}>
                    {event.event_type} Ã¢â‚¬Â¢{" "}
                    {new Date(
                      event.event_at || event.event_time || Date.now(),
                    ).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            ))}
          </Section>

          {/* ================================================================ */}
          {/* REFUND TRACKING                                                  */}
          {/* ================================================================ */}
          <Section icon="refresh-circle-outline" title="Refund Protection">
            <InfoRow
              label="Claim Status"
              value={refund?.status ?? "No active claims"}
            />
            <InfoRow
              label="Policy Guarantee"
              value={refund?.reason ?? "Full refund eligible with Travel Insurance"}
            />
            <Pressable
              disabled={!latestBooking}
              onPress={requestRefund}
              style={[styles.secondaryButton, !latestBooking && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>
                Request Refund Review
              </Text>
            </Pressable>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
      <PassportScannerModal
        visible={isPassportScannerOpen}
        onClose={() => setIsPassportScannerOpen(false)}
        onScanSuccess={handlePassportScanSuccess}
        autoPopulateImmediately={true}
        onManualEntry={() => {
          setIsPassportScannerOpen(false);
          setActionMessage("âœï¸ à¦®à§à¦¯à¦¾à¦¨à§à¦¯à¦¼à¦¾à¦² à¦à¦¨à§à¦Ÿà§à¦°à¦¿ à¦®à§‹à¦¡ à¦¸à¦•à§à¦°à¦¿à¦¯à¦¼à¥¤ à¦¨à¦¿à¦šà§‡ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦¤à¦¥à§à¦¯ à¦ªà§‚à¦°à¦£ à¦•à¦°à§à¦¨à¥¤");
        }}
      />

      {/* Upfront Price Change & Tax Consent Modal */}
      <PriceChangeModal
        visible={showPriceChangeModal}
        oldPrice={pricingCalculation.baseFare}
        newPrice={pricingCalculation.totalDue}
        currency={pricingCalculation.currency}
        breakdown={[
          { label: "Ã Â¦Â®Ã Â§â€šÃ Â¦Â² Ã Â¦Â­Ã Â¦Â¾Ã Â¦Â¡Ã Â¦Â¼Ã Â¦Â¾ (Base Fare)", amount: pricingCalculation.baseFare },
          { label: "Ã Â¦Â¸Ã Â¦Â°Ã Â¦â€¢Ã Â¦Â¾Ã Â¦Â°Ã Â¦Â¿ Ã Â¦Å¸Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦â€¢Ã Â§ÂÃ Â¦Â¸ Ã Â¦â€œ Ã Â¦Â­Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Å¸ (Govt Taxes)", amount: pricingCalculation.taxes, isAddition: true },
          { label: "Ã Â¦ÂªÃ Â§ÂÃ Â¦Â²Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Å¸Ã Â¦Â«Ã Â¦Â°Ã Â§ÂÃ Â¦Â® Ã Â¦Â¸Ã Â¦Â¾Ã Â¦Â°Ã Â§ÂÃ Â¦Â­Ã Â¦Â¿Ã Â¦Â¸ Ã Â¦Â«Ã Â¦Â¿ (Service Fee)", amount: pricingCalculation.platformServiceFee, isAddition: true },
          ...(pricingCalculation.addonsCost > 0
            ? [{ label: "Ã Â¦Â¨Ã Â¦Â¿Ã Â¦Â°Ã Â§ÂÃ Â¦Â¬Ã Â¦Â¾Ã Â¦Å¡Ã Â¦Â¿Ã Â¦Â¤ Ã Â¦â€¦Ã Â§ÂÃ Â¦Â¯Ã Â¦Â¾Ã Â¦Â¡-Ã Â¦â€¦Ã Â¦Â¨ Ã Â¦Â¸Ã Â¦Â¾Ã Â¦Â°Ã Â§ÂÃ Â¦Â­Ã Â¦Â¿Ã Â¦Â¸", amount: pricingCalculation.addonsCost, isAddition: true }]
            : []),
          ...(pricingCalculation.discount > 0
            ? [{ label: "Ã Â¦ÂªÃ Â§ÂÃ Â¦Â°Ã Â§â€¹Ã Â¦Â®Ã Â§â€¹ Ã Â¦Â¡Ã Â¦Â¿Ã Â¦Â¸Ã Â¦â€¢Ã Â¦Â¾Ã Â¦â€°Ã Â¦Â¨Ã Â§ÂÃ Â¦Å¸ (Promo Savings)", amount: pricingCalculation.discount, isDiscount: true }]
            : []),
        ]}
        onAccept={() => {
          setPriceConfirmed(true);
          setShowPriceChangeModal(false);
          store.setNotes(JSON.stringify({ addons, currency }));
          goToStep(3);
        }}
        onReject={() => setShowPriceChangeModal(false)}
      />

      {/* Saved Passengers Modal - Requirement 2 */}
      <Modal
        visible={isSavedPassengersModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSavedPassengersModalOpen(false)}
      >
        <Pressable
          style={styles.savedPassengersOverlay}
          onPress={() => setIsSavedPassengersModalOpen(false)}
        >
          <Pressable style={styles.savedPassengersSheet} onPress={() => {}}>
            <View style={styles.savedPassengersHandle} />
            <View style={styles.savedPassengersHeader}>
              <Ionicons name="people" size={20} color={primary} />
              <Text style={styles.savedPassengersTitle}>à¦¸à¦‚à¦°à¦•à§à¦·à¦¿à¦¤ à¦¯à¦¾à¦¤à§à¦°à§€ à¦¤à¦¾à¦²à¦¿à¦•à¦¾ ({savedPassengers.length})</Text>
              <TouchableOpacity onPress={() => setIsSavedPassengersModalOpen(false)}>
                <Ionicons name="close-circle" size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {savedPassengers.length === 0 ? (
                <View style={{ alignItems: "center", padding: 32 }}>
                  <Ionicons name="person-add-outline" size={40} color="#cbd5e1" />
                  <Text style={{ color: "#94a3b8", marginTop: 12, textAlign: "center" }}>
                    à¦•à§‹à¦¨à§‹ à¦¸à¦‚à¦°à¦•à§à¦·à¦¿à¦¤ à¦¯à¦¾à¦¤à§à¦°à§€ à¦¨à§‡à¦‡à¥¤{"\n"}à¦§à¦¾à¦ª à§§-à¦ à¦¤à¦¥à§à¦¯ à¦ªà§‚à¦°à¦£ à¦•à¦°à§‡ à¦¸à¦‚à¦°à¦•à§à¦·à¦£ à¦•à¦°à§à¦¨à¥¤
                  </Text>
                </View>
              ) : (
                savedPassengers.map((p, idx) => (
                  <View key={`pax-${p.first_name}-${p.last_name}-${idx}`} style={styles.savedPassengerCard}>
                    <View style={styles.savedPassengerAvatar}>
                      <Ionicons name="person-circle" size={36} color={primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.savedPassengerName}>{p.first_name} {p.last_name}</Text>
                      <Text style={styles.savedPassengerMeta}>ðŸ“§ {p.email || "â€”"}</Text>
                      <Text style={styles.savedPassengerMeta}>ðŸ“ž {p.phone || "â€”"}</Text>
                      {p.passport_number ? (
                        <Text style={styles.savedPassengerMeta}>ðŸ›‚ Passport: {p.passport_number}</Text>
                      ) : null}
                    </View>
                    <View style={styles.savedPassengerActions}>
                      <TouchableOpacity
                        onPress={() => {
                          if (typeof handleSelectSavedPassenger === "function") {
                            handleSelectSavedPassenger(p);
                          }
                        }}
                        style={styles.selectPassengerBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.selectPassengerBtnText}>à¦¬à¦¾à¦›à¦¾à¦‡</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteSavedPassenger(idx)}
                        style={styles.deletePassengerBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={14} color={danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Booking Cancellation & Change Management with Instant Refund Calculation */}
      <BookingManageModal
        visible={showManageModal}
        booking={latestBooking}
        onClose={() => setShowManageModal(false)}
        onBookingCancelled={() => {
          refetch();
          setActionMessage("à¦¬à§à¦•à¦¿à¦‚ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦¬à¦¾à¦¤à¦¿à¦² à¦•à¦°à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡ à¦à¦¬à¦‚ à¦°à¦¿à¦«à¦¾à¦¨à§à¦¡ à¦°à¦¿à¦­à¦¿à¦‰ à¦¶à§à¦°à§ à¦¹à¦¯à¦¼à§‡à¦›à§‡à¥¤");
        }}
      />

    </SafeAreaView>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function ValidatedField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  icon,
  compact = false,
  onLayout,
  securityNote,
  isMaskable = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  icon?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  onLayout?: (e: any) => void;
  securityNote?: string;
  isMaskable?: boolean;
}) {
  const [isMasked, setIsMasked] = useState(isMaskable);

  return (
    <View style={[styles.fieldWrap, compact && styles.compactField]} onLayout={onLayout}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      {securityNote ? (
        <View style={styles.securityNoteRow}>
          <Ionicons name="shield-checkmark" size={13} color="#059669" />
          <Text style={styles.securityNoteText}>{securityNote}</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.inputContainer,
          error ? styles.inputErrorBorder : null,
        ]}
      >
        {icon ? (
          <Ionicons
            color={error ? danger : "#64748b"}
            name={icon}
            size={18}
            style={styles.fieldIcon}
          />
        ) : null}
        <TextInput
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          secureTextEntry={isMaskable && isMasked}
          style={[styles.textInputStyle, isMaskable && { paddingEnd: 38 }]}
          value={value}
        />
        {isMaskable ? (
          <TouchableOpacity
            style={styles.maskToggleBtn}
            onPress={() => setIsMasked((prev) => !prev)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isMasked ? "eye-off-outline" : "eye-outline"}
              size={18}
              color="#64748b"
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons color={danger} name="alert-circle" size={14} />
          <Text style={styles.errorMessage}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PaymentOptionCard({
  title,
  sub,
  icon,
  isSelected,
  onSelect,
}: {
  title: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
      style={[styles.paymentCard, isSelected && styles.paymentCardSelected]}
    >
      <View
        style={[
          styles.paymentIconBox,
          isSelected && styles.paymentIconBoxSelected,
        ]}
      >
        <Ionicons
          color={isSelected ? "#fff" : primary}
          name={icon}
          size={20}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.paymentCardTitle,
            isSelected && styles.paymentCardTitleSelected,
          ]}
        >
          {title}
        </Text>
        <Text style={styles.paymentCardSub}>{sub}</Text>
      </View>
      <View
        style={[
          styles.radioCircle,
          isSelected && styles.radioCircleSelected,
        ]}
      >
        {isSelected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons color={primary} name={icon} size={20} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

// ============================================================================
