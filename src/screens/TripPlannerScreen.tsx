import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { showLocalizedAlert } from "../utils/localizedAlert";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StickyHeader } from "../components/common";
import { addDays, format } from "date-fns";

import {
  tripPlannerEngine,
  calculateBudgetDistribution,
  defensiveParseTripPlan,
  extractJsonString,
  getCuratedFallbackItinerary,
  llmProviderRegistry,
  conciergeService,
} from "../services/ai";
import {
  weatherAdaptivePlanner,
  calculateSolarPosition,
} from "../services/ai/weatherAdaptivePlanner";
import type {
  WeatherAlertInfo,
  WeatherOptimizationResult,
  SolarPosition,
} from "../services/ai/weatherAdaptivePlanner";
import { buildTripPlannerEnginePrompt } from "../services/ai/prompts";
import type {
  BudgetLevel,
  Currency,
  TravelStyle,
  TripDay,
  TripPlan,
  TripActivity,
  TripPlannerEngineRequest,
} from "../services/ai";
import { useBookingStore } from "../store/bookingStore";
import { Badge, Button, Skeleton } from "../components/ui";
import { WeatherWidget } from "../components/weather/WeatherWidget";
import {
  TripTemplatesBanner,
  TripTopBudgetBar,
  TripSplitBillModal,
  TripShareExportModal,
  RainyAlternativesCard,
} from "../components/trip";
import { TripTemplateItem } from "../services/trip/tripTemplates";
import { useSplitBillStore } from "../store/splitBillStore";
import { RTLIcon } from "../components/ui";

export {
  USD_TO_BDT_RATE,
  GENERATION_TIMEOUT_MS,
  TRIVIA_INTERVAL_MS,
  formatCurrency,
  DestinationItem,
  DESTINATION_CATALOG,
  ORIGIN_SUGGESTIONS,
  DURATION_PRESETS,
  TravelStyleConfig,
  TRAVEL_STYLES,
  BudgetTierConfig,
  BUDGET_TIERS,
  INTEREST_OPTIONS,
  TRAVEL_TRIVIA,
  tripPlanner,
  EditingActivityContext,
} from "../data/tripPlannerData";
import {
  USD_TO_BDT_RATE,
  GENERATION_TIMEOUT_MS,
  TRIVIA_INTERVAL_MS,
  formatCurrency,
  DestinationItem,
  DESTINATION_CATALOG,
  ORIGIN_SUGGESTIONS,
  DURATION_PRESETS,
  TravelStyleConfig,
  TRAVEL_STYLES,
  BudgetTierConfig,
  BUDGET_TIERS,
  INTEREST_OPTIONS,
  TRAVEL_TRIVIA,
  tripPlanner,
  EditingActivityContext,
} from "../data/tripPlannerData";
import { styles } from "../styles/tripPlannerStyles";
export function TripPlannerScreen() {
  const [lastDeletedActivity, setLastDeletedActivity] = useState<any>(null);
  const handleMoveActivity = (..._args: any[]) => {};
  const handleUndoDeleteActivity = () => {};
  const insets = useSafeAreaInsets();

  // â”€â”€â”€ Questionnaire Wizard State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalWizardSteps = 5;

  // Step 1: Destination & Departure
  const [origin, setOrigin] = useState<string>("Dhaka");
  const [destination, setDestination] = useState<string>("Cox's Bazar");
  const [showDestModal, setShowDestModal] = useState<boolean>(false);
  const [customDestInput, setCustomDestInput] = useState<string>("");

  // Step 2: Trip Duration & Dates
  const [durationDays, setDurationDays] = useState<number>(3);
  const [startDate, setStartDate] = useState<Date>(() => new Date());

  // Step 3: Traveler Composition & Travel Style
  const [travelers, setTravelers] = useState<number>(2);
  const [travelStyle, setTravelStyle] = useState<TravelStyle>("couple");

  // Step 4: Budget Range & Optimization
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>("moderate");
  const [totalBudget, setTotalBudget] = useState<number>(() => {
    const tier = BUDGET_TIERS.find((b) => b.id === "moderate")!;
    return tier.dailyRateBdt * 3 * 2;
  });

  // Step 5: Activity Preferences & Special Requests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Beach & Coast",
    "Authentic Food",
  ]);
  const [customNotes, setCustomNotes] = useState<string>("");

  // â”€â”€â”€ Generation & Results State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [triviaIndex, setTriviaIndex] = useState<number>(0);
  const [generatedPlan, setGeneratedPlan] = useState<TripPlan | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(1);

  // â”€â”€â”€ Activity Editing State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [editingActivity, setEditingActivity] = useState<EditingActivityContext | null>(null);

  // â”€â”€â”€ Saved Plans & Persistence State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const SAVED_PLANS_KEY = "@shopno_saved_plans";
  const [savedPlans, setSavedPlans] = useState<TripPlan[]>([]);
  const [showSavedModal, setShowSavedModal] = useState<boolean>(false);
  const [isCurrentPlanSaved, setIsCurrentPlanSaved] = useState<boolean>(false);

  // Accidental Swipe / Deletion Undo State
  const [undoActivityData, setUndoActivityData] = useState<{
    dayIndex: number;
    actIndex: number;
    activity: any;
    activityTitle: string;
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // â”€â”€â”€ Weather Adaptive Planner & Golden Hour State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [weatherAlert, setWeatherAlert] = useState<WeatherAlertInfo | null>(null);
  const [activeOptimization, setActiveOptimization] = useState<WeatherOptimizationResult | null>(null);
  const [isWeatherOptimized, setIsWeatherOptimized] = useState<boolean>(false);
  const [isCheckingWeather, setIsCheckingWeather] = useState<boolean>(false);
  const [showWeatherDetailsModal, setShowWeatherDetailsModal] = useState<boolean>(false);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);

  // â”€â”€â”€ Interactive Packing Checklist State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [packedItems, setPackedItems] = useState<string[]>([]);
  const [customPackingInput, setCustomPackingInput] = useState<string>("");

  // â”€â”€â”€ Interactive AI Concierge Q&A State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [conciergeQuestion, setConciergeQuestion] = useState<string>("");
  const [conciergeAnswer, setConciergeAnswer] = useState<string | null>(null);
  const [conciergeSuggestions, setConciergeSuggestions] = useState<string[]>([]);
  const [isAskingConcierge, setIsAskingConcierge] = useState<boolean>(false);

  // â”€â”€â”€ Split Bill & Share Modals State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [showSplitBillModal, setShowSplitBillModal] = useState<boolean>(false);
  const [showShareExportModal, setShowShareExportModal] = useState<boolean>(false);

  // Connect Zustand Split-Bill Store
  const {
    members: splitMembers,
    expenses: splitExpenses,
    getSettlementDebts,
    getTotalSpending,
  } = useSplitBillStore();

  const totalSpent = useMemo(() => getTotalSpending(), [splitExpenses]);
  const settlementDebts = useMemo(() => getSettlementDebts(), [splitExpenses, splitMembers]);

  // â”€â”€â”€ Quick-Start Template Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleApplyTemplate = (template: TripTemplateItem) => {
    setOrigin("Dhaka");
    setDestination(template.destination);
    setDurationDays(template.durationDays);
    setTravelers(template.travelers);
    setTotalBudget(template.estimatedBudget);
    setTravelStyle(template.travelStyle as any);
    setBudgetLevel(template.budgetLevel);

    const plan = template.planGenerator(startDate);
    setGeneratedPlan(plan);
    setExpandedDay(1);

    // Sync trip name in splitBillStore
    useSplitBillStore.getState().setTripName(plan.title);

    showLocalizedAlert(
      "à¦Ÿà§‡à¦®à¦ªà§à¦²à§‡à¦Ÿ à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ à¦²à§‹à¦¡ à¦¹à§Ÿà§‡à¦›à§‡",
      `"${template.title}" à¦Ÿà§à¦°à¦¿à¦ª à¦ªà§à¦²à§à¦¯à¦¾à¦¨à¦Ÿà¦¿ à¦à¦• à¦Ÿà§à¦¯à¦¾à¦ªà§‡ à¦•à¦ªà¦¿ à¦“ à¦²à§‹à¦¡ à¦•à¦°à¦¾ à¦¹à§Ÿà§‡à¦›à§‡! à¦¨à¦¿à¦šà§‡ à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦¶à¦¿à¦¡à¦¿à¦‰à¦² à¦¦à§‡à¦–à§à¦¨à¥¤`
    );
  };

  const handleCopyToForm = (template: TripTemplateItem) => {
    setOrigin("Dhaka");
    setDestination(template.destination);
    setDurationDays(template.durationDays);
    setTravelers(template.travelers);
    setTotalBudget(template.estimatedBudget);
    setTravelStyle(template.travelStyle as any);
    setBudgetLevel(template.budgetLevel);
    setCurrentStep(1);

    showLocalizedAlert(
      "à¦¤à¦¥à§à¦¯ à¦•à¦ªà¦¿ à¦•à¦°à¦¾ à¦¹à§Ÿà§‡à¦›à§‡",
      `"${template.title}" à¦à¦° à¦—à¦¨à§à¦¤à¦¬à§à¦¯, à¦¬à¦¾à¦œà§‡à¦Ÿ à¦“ à¦¦à¦¿à¦¨ à¦¸à¦‚à¦–à§à¦¯à¦¾ à¦«à¦°à§à¦®à§‡ à¦ªà§‚à¦°à¦£ à¦•à¦°à¦¾ à¦¹à§Ÿà§‡à¦›à§‡à¥¤ à¦†à¦ªà¦¨à¦¾à¦° à¦ªà¦›à¦¨à§à¦¦ à¦…à¦¨à§à¦¯à¦¾à§Ÿà§€ à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦•à¦°à§à¦¨à¥¤`
    );
  };

  // â”€â”€â”€ Animation References â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const progressAnim = useRef(new Animated.Value(0)).current;
  const triviaFadeAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;
  const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Load saved plans from AsyncStorage on mount
  useEffect(() => {
    const loadStoredPlans = async () => {
      try {
        const stored = await AsyncStorage.getItem(SAVED_PLANS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSavedPlans(parsed);
          }
        }
      } catch (err) {
        console.warn("[TripPlannerScreen] Failed to load saved plans:", err);
      }
    };
    loadStoredPlans();
  }, []);

  // Check if current plan is saved whenever generatedPlan or savedPlans change
  useEffect(() => {
    if (!generatedPlan) {
      setIsCurrentPlanSaved(false);
      return;
    }
    const found = savedPlans.some(
      (p) =>
        (p.id && generatedPlan.id && p.id === generatedPlan.id) ||
        (p.title === generatedPlan.title && p.destination === generatedPlan.destination)
    );
    setIsCurrentPlanSaved(found);
  }, [generatedPlan, savedPlans]);

  // â”€â”€â”€ Weather Adaptive Planner Hooks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Evaluates real-time weather and solar golden hours whenever a plan is loaded or generated
  useEffect(() => {
    if (!generatedPlan || !generatedPlan.days || generatedPlan.days.length === 0) {
      setWeatherAlert(null);
      setActiveOptimization(null);
      setIsWeatherOptimized(false);
      return;
    }

    try {
      setIsCheckingWeather(true);
      const result = weatherAdaptivePlanner.analyzeAndOptimizeItinerary(
        generatedPlan,
        startDate
      );
      setActiveOptimization(result);

      if (result.alert && !dismissedAlertIds.includes(result.alert.id)) {
        setWeatherAlert(result.alert);
      } else {
        setWeatherAlert(null);
      }

      // Check if plan already incorporates the weather swaps or golden hour timings
      const hasSwaps = result.modifications.some((m) => m.type === "weather_swap");
      if (
        !hasSwaps &&
        generatedPlan.days.some((d) =>
          d.activities.some((a) => (a.notes || "").includes("Weather Adaptive"))
        )
      ) {
        setIsWeatherOptimized(true);
      }
    } catch (err) {
      console.warn("[TripPlannerScreen] Weather adaptive analysis failed:", err);
    } finally {
      setIsCheckingWeather(false);
    }
  }, [generatedPlan, startDate, dismissedAlertIds]);

  // â”€â”€â”€ Weather Optimization Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Requirement 3: "Accept" Button
  const handleAcceptWeatherOptimization = () => {
    if (!activeOptimization) return;

    const optimized = activeOptimization.optimizedPlan;
    setGeneratedPlan(optimized);
    setIsWeatherOptimized(true);

    if (weatherAlert) {
      setDismissedAlertIds((prev) => [...prev, weatherAlert.id]);
      setWeatherAlert(null);
    }

    // Requirement 4: State Synchronization: Update modified itinerary in useBookingStore without losing booking references
    weatherAdaptivePlanner.syncPlanToBookingStore(optimized, { preserveBookingRef: true });

    const bookingStore = useBookingStore.getState();
    if (typeof (bookingStore as any).syncItineraryPlan === "function") {
      (bookingStore as any).syncItineraryPlan(optimized);
    }

    showLocalizedAlert(
      "Schedule Weather-Optimized! â˜€ï¸",
      "Your itinerary has been automatically restructured to protect against rain and capture peak golden hour lighting.\n\n" +
        `â€¢ ${activeOptimization.alert?.outdoorActivityAffected || "Outdoor activity"} swapped for ${
          activeOptimization.alert?.replacementActivity || "indoor experience"
        }\n` +
        "â€¢ Photography spot visits aligned with solar position tables\n" +
        "â€¢ Synchronized with checkout booking draft.",
      [{ text: "Great!" }]
    );
  };

  // Requirement 3: "Keep Original" Button
  const handleRejectWeatherOptimization = () => {
    if (weatherAlert) {
      setDismissedAlertIds((prev) => [...prev, weatherAlert.id]);
      setWeatherAlert(null);
    }
    showLocalizedAlert(
      "Original Schedule Kept",
      "You have chosen to retain your original itinerary. Please pack rain gear and an umbrella for Day 2!"
    );
  };


  // Computed Date Range
  const endDate = useMemo(() => addDays(startDate, durationDays), [startDate, durationDays]);
  const formattedDateRange = useMemo(
    () => `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`,
    [startDate, endDate]
  );

  // Dynamic budget calculation based on duration & guests
  const calculateTierBudget = (tierId: BudgetLevel, curr: Currency, days: number, guests: number): number => {
    const tier = BUDGET_TIERS.find((b) => b.id === tierId) || BUDGET_TIERS[1];
    const daily = curr === "BDT" ? tier.dailyRateBdt : tier.dailyRateUsd;
    return Math.round(daily * Math.max(1, days) * Math.max(1, guests));
  };

  // Sync budget when currency, tier, duration, or travelers change (unless custom is set)
  const handleCurrencyChange = (newCurr: Currency) => {
    setCurrency(newCurr);
    if (budgetLevel !== "custom") {
      setTotalBudget(calculateTierBudget(budgetLevel, newCurr, durationDays, travelers));
    } else {
      // Convert existing custom budget
      setTotalBudget((prev) =>
        newCurr === "BDT" ? Math.round(prev * USD_TO_BDT_RATE) : Math.round(prev / USD_TO_BDT_RATE)
      );
    }
  };

  const handleBudgetTierSelect = (tierId: BudgetLevel) => {
    setBudgetLevel(tierId);
    if (tierId !== "custom") {
      setTotalBudget(calculateTierBudget(tierId, currency, durationDays, travelers));
    }
  };

  const handleDurationChange = (newDays: number) => {
    const boundedDays = Math.max(1, Math.min(21, newDays));
    setDurationDays(boundedDays);
    if (budgetLevel !== "custom") {
      setTotalBudget(calculateTierBudget(budgetLevel, currency, boundedDays, travelers));
    }
  };

  const handleTravelersChange = (newCount: number) => {
    const boundedGuests = Math.max(1, Math.min(12, newCount));
    setTravelers(boundedGuests);
    if (budgetLevel !== "custom") {
      setTotalBudget(calculateTierBudget(budgetLevel, currency, durationDays, boundedGuests));
    }
  };

  const handleStyleSelect = (style: TravelStyleConfig) => {
    setTravelStyle(style.id);
    if (travelers === 1 && style.suggestedGuests > 1) {
      handleTravelersChange(style.suggestedGuests);
    }
  };

  // Rotating trivia & shimmer loop during generation
  useEffect(() => {
    let triviaInterval: ReturnType<typeof setInterval> | null = null;

    if (isGenerating) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 0.95,
            duration: 750,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0.3,
            duration: 750,
            useNativeDriver: true,
          }),
        ])
      );
      shimmerLoopRef.current = loop;
      loop.start();

      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: GENERATION_TIMEOUT_MS - 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      triviaInterval = setInterval(() => {
        Animated.sequence([
          Animated.timing(triviaFadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(triviaFadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();

        setTriviaIndex((prev) => (prev + 1) % TRAVEL_TRIVIA.length);
      }, TRIVIA_INTERVAL_MS);
    } else {
      shimmerLoopRef.current?.stop();
      shimmerLoopRef.current = null;
      if (triviaInterval) clearInterval(triviaInterval);
      shimmerAnim.setValue(1);
      triviaFadeAnim.setValue(1);
    }

    return () => {
      shimmerLoopRef.current?.stop();
      shimmerLoopRef.current = null;
      if (triviaInterval) clearInterval(triviaInterval);
    };
  }, [isGenerating]);

  // Live budget allocation preview
  const liveBudgetBreakdown = useMemo(() => {
    return calculateBudgetDistribution(
      totalBudget,
      currency,
      durationDays,
      travelers,
      travelStyle
    );
  }, [totalBudget, currency, durationDays, travelers, travelStyle]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  // â”€â”€â”€ Requirement 2: Defensive Generation Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleGenerateItinerary = async () => {
    if (!destination.trim()) {
      showLocalizedAlert("Destination Required", "Please choose or enter a destination to plan your trip.");
      return;
    }

    setIsGenerating(true);
    setTriviaIndex(0);

    const request: TripPlannerEngineRequest = {
      origin: origin || "Dhaka",
      destination: destination.trim(),
      durationDays,
      travelStyle,
      budgetLevel,
      totalBudget,
      currency,
      travelers,
      interests: selectedInterests,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(endDate, "yyyy-MM-dd"),
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, GENERATION_TIMEOUT_MS);

    try {
      // 1. Call tripPlanner.generateItinerary with abort signal
      const rawOutput = await tripPlanner.generateItinerary(request, {
        signal: abortController.signal,
      });

      // 2. Defensive JSON Extraction & Parsing
      const cleanJson = extractJsonString(rawOutput);
      const parseResult = defensiveParseTripPlan(cleanJson || rawOutput);

      if (parseResult.success && parseResult.data) {
        setGeneratedPlan(parseResult.data);
        setExpandedDay(1);
        setPackedItems([]);
        setConciergeAnswer(null);
        setConciergeSuggestions([]);
      } else {
        console.warn("[TripPlannerScreen] Defensive parsing yielded no schema match. Using curated fallback.");
        const fallback = getCuratedFallbackItinerary(request);
        setGeneratedPlan(fallback);
        setExpandedDay(1);
        setPackedItems([]);
        setConciergeAnswer(null);
        setConciergeSuggestions([]);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        console.warn("[TripPlannerScreen] Generation timed out after 15s. Gracefully deploying curated itinerary.");
      } else {
        console.error("[TripPlannerScreen] Generation error:", err);
      }
      const fallback = getCuratedFallbackItinerary(request);
      setGeneratedPlan(fallback);
      setExpandedDay(1);
      setPackedItems([]);
      setConciergeAnswer(null);
      setConciergeSuggestions([]);
    } finally {
      clearTimeout(timeoutId);
      setIsGenerating(false);
    }
  };

  // â”€â”€â”€ Requirement 3: Interactive Results & Activity Editing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleOpenEditActivity = (dayIndex: number, actIndex: number) => {
    if (!generatedPlan) return;
    const act = generatedPlan.days[dayIndex]?.activities[actIndex];
    if (!act) return;

    setEditingActivity({
      dayIndex,
      activityIndex: actIndex,
      time: act.time || "Morning",
      activity: act.activity || "",
      location: act.location || "",
      estimatedCost: act.estimatedCost !== undefined ? String(act.estimatedCost) : "0",
      duration: act.duration || "1.5 hours",
      notes: act.notes || "",
    });
  };

  const handleSaveEditedActivity = () => {
    if (!editingActivity || !generatedPlan) return;
    const { dayIndex, activityIndex, time, activity, location, estimatedCost, duration, notes } =
      editingActivity;

    const newDays = [...generatedPlan.days];
    const targetDay = { ...newDays[dayIndex] };
    const newActivities = [...targetDay.activities];

    const parsedCost = Number(estimatedCost.replace(/[^0-9.]/g, "")) || 0;

    newActivities[activityIndex] = {
      ...newActivities[activityIndex],
      time: time.trim() || "Daytime",
      activity: activity.trim() || "Sightseeing Activity",
      location: location.trim() || generatedPlan.destination,
      estimatedCost: parsedCost,
      duration: duration.trim() || "1 hour",
      notes: notes.trim(),
    };

    targetDay.activities = newActivities;
    newDays[dayIndex] = targetDay;

    setGeneratedPlan({
      ...generatedPlan,
      days: newDays,
    });
    setEditingActivity(null);
  };

  const handleAddActivity = (dayIndex: number) => {
    if (!generatedPlan) return;
    const newDays = [...generatedPlan.days];
    const targetDay = { ...newDays[dayIndex] };

    const newAct: TripActivity = {
      time: "Afternoon",
      activity: "Explore Local Landmark",
      location: generatedPlan.destination,
      duration: "1 hour",
      estimatedCost: currency === "BDT" ? 500 : 15,
      notes: "Custom added activity",
    };

    targetDay.activities = [...targetDay.activities, newAct];
    newDays[dayIndex] = targetDay;

    setGeneratedPlan({
      ...generatedPlan,
      days: newDays,
    });

    setEditingActivity({
      dayIndex,
      activityIndex: targetDay.activities.length - 1,
      time: newAct.time,
      activity: newAct.activity,
      location: newAct.location,
      estimatedCost: String(newAct.estimatedCost),
      duration: newAct.duration || "1 hour",
      notes: newAct.notes || "",
    });
  };

  const handleDeleteActivity = (dayIndex: number, actIndex: number) => {
    if (!generatedPlan) return;
    const targetDay = generatedPlan.days[dayIndex];
    if (!targetDay) return;
    const targetActivity = targetDay.activities[actIndex];
    if (!targetActivity) return;

    // Immediately update plan state with haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newDays = [...generatedPlan.days];
    const updatedDay = { ...targetDay };
    updatedDay.activities = updatedDay.activities.filter((_, i) => i !== actIndex);
    newDays[dayIndex] = updatedDay;

    setGeneratedPlan({
      ...generatedPlan,
      days: newDays,
    });

    // Provide 6-second Undo snackbar so user never accidentally loses itinerary work
    setUndoActivityData({
      dayIndex,
      actIndex,
      activity: targetActivity,
      activityTitle: (targetActivity as any).title || targetActivity.activity || "Activity",
    });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      setUndoActivityData(null);
    }, 6000);
  };

  const handleUndoActivityDelete = () => {
    if (!undoActivityData || !generatedPlan) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { dayIndex, actIndex, activity } = undoActivityData;
    const newDays = [...generatedPlan.days];
    const targetDay = { ...newDays[dayIndex] };
    const updatedActivities = [...targetDay.activities];
    updatedActivities.splice(actIndex, 0, activity);
    targetDay.activities = updatedActivities;
    newDays[dayIndex] = targetDay;

    setGeneratedPlan({
      ...generatedPlan,
      days: newDays,
    });

    setUndoActivityData(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
  };

  // â”€â”€â”€ Requirement 4: One-Tap "Book Entire Itinerary" Action â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleBookEntireItinerary = () => {
    if (!generatedPlan) return;

    const bookingStore = useBookingStore.getState();
    const baseCost = generatedPlan.totalEstimatedCost || totalBudget;
    const currencyCode = generatedPlan.currency || currency;
    const startIso = format(startDate, "yyyy-MM-dd");
    const endIso = format(endDate, "yyyy-MM-dd");

    // 1. Initialize booking draft in store (preserving existing productId / reference if active)
    const existingProductId = bookingStore.productId;
    const productId = existingProductId || `PKG-${generatedPlan.destination.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now()}`;

    bookingStore.initDraft({
      productType: "package",
      productId,
      destinationCity: generatedPlan.destination,
      destinationCountry: origin ? `${origin} to ${generatedPlan.destination}` : generatedPlan.destination,
      startDate: startIso,
      endDate: endIso,
      basePrice: baseCost,
      currency: currencyCode,
      numberOfGuests: travelers,
    });

    // 2. Package hotel stays
    const hotelRooms = generatedPlan.days
      .filter((d) => Boolean(d.accommodation))
      .map((d) => ({
        roomId: `hotel-day-${d.day}`,
        roomType: d.accommodation || "Curated Hotel Stay",
        count: Math.max(1, Math.ceil(travelers / 2)),
        pricePerNight: Math.round(
          (generatedPlan.budget?.hotel?.estimated || baseCost * 0.4) /
            Math.max(1, generatedPlan.durationDays)
        ),
      }));

    if (hotelRooms.length > 0) {
      bookingStore.setSelectedRooms(hotelRooms);
    }

    // 3. Package all tours, activities, and dining into booking notes
    const activityLines = generatedPlan.days
      .flatMap((d) =>
        d.activities.map(
          (a) =>
            `â€¢ [Day ${d.day} ${a.time}] ${a.activity} (${a.location})${
              a.estimatedCost ? ` - ${formatCurrency(a.estimatedCost, currencyCode)}` : ""
            }`
        )
      )
      .join("\n");

    const diningLines = generatedPlan.days
      .flatMap((d) =>
        (d.meals || []).map(
          (m) =>
            `â€¢ [Day ${d.day} ${m.type.toUpperCase()}] ${m.suggestion}${
              m.restaurant ? ` at ${m.restaurant}` : ""
            }`
        )
      )
      .join("\n");

    const packageSummary =
      `âœˆï¸ COMPLETE AI ITINERARY PACKAGE: ${generatedPlan.title}\n` +
      `ðŸ“ Destination: ${generatedPlan.destination} (Departure: ${origin})\n` +
      `ðŸ“… Duration: ${generatedPlan.durationDays} Days (${formattedDateRange}) | Guests: ${travelers}\n` +
      `ðŸ’° Budget: ${formatCurrency(baseCost, currencyCode)}\n\n` +
      `ðŸ¨ ACCOMMODATIONS:\n${
        hotelRooms.map((r) => `â€¢ ${r.roomType}`).join("\n") || "Centrally located quality hotel"
      }\n\n` +
      `ðŸŽŸï¸ CURATED TOURS & ACTIVITIES:\n${activityLines}\n\n` +
      `ðŸ² RECOMMENDED DINING:\n${diningLines}`;

    bookingStore.setNotes(packageSummary);
    if (typeof (bookingStore as any).syncItineraryPlan === "function") {
      (bookingStore as any).syncItineraryPlan(generatedPlan);
    }
    bookingStore.setStep(1);

    // 4. Confirmation dialog and checkout navigation
    showLocalizedAlert(
      "Entire Itinerary Packaged! ðŸŽ’",
      `All ${generatedPlan.durationDays} days of accommodations, ${generatedPlan.days.reduce(
        (acc, d) => acc + d.activities.length,
        0
      )} activities, and meal spots are ready in your checkout draft.`,
      [
        {
          text: "Review Plan",
          style: "cancel",
        },
        {
          text: "Proceed to Checkout",
          onPress: () => {
            try {
              router.push({
                pathname: "/screens/[slug]",
                params: {
                  slug: "booking-system",
                  destination_city: generatedPlan.destination,
                  number_of_guests: travelers,
                  final_price: baseCost,
                  currency: currencyCode,
                  status: "pending",
                  product_type: "package",
                },
              });
            } catch {
              router.push("/screens/booking-system" as any);
            }
          },
        },
      ]
    );
  };

  // Share or Export Itinerary
  const handleShareItinerary = async () => {
    if (!generatedPlan) return;
    try {
      const summaryText =
        `âœˆï¸ ${generatedPlan.title}\n\n` +
        `ðŸ“ Destination: ${generatedPlan.destination} (Starting: ${origin})\n` +
        `ðŸ“… Dates: ${formattedDateRange} (${generatedPlan.durationDays} Days)\n` +
        `ðŸ‘¥ Travelers: ${travelers} (${travelStyle.toUpperCase()})\n` +
        `ðŸ’° Total Cost: ${formatCurrency(generatedPlan.totalEstimatedCost, generatedPlan.currency)}\n\n` +
        `ðŸ¨ Hotel: ${generatedPlan.budget?.hotel?.percentage}% | ðŸš† Transport: ${generatedPlan.budget?.transport?.percentage}% | ðŸ² Food: ${generatedPlan.budget?.food?.percentage}% | ðŸŽŸï¸ Activities: ${generatedPlan.budget?.activities?.percentage}%\n\n` +
        `Created with AI Trip Planner.`;

      await Share.share({
        message: summaryText,
        title: generatedPlan.title,
      });
    } catch {
      // User cancelled share
    }
  };

  // Open map location defensively
  const handleOpenMapLocation = (lat?: number, lng?: number, locationLabel?: string) => {
    const queryTerm = locationLabel || destination;
    let url = "";

    if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
      const latLng = `${lat},${lng}`;
      url = Platform.select({
        ios: `maps:0,0?q=${encodeURIComponent(queryTerm)}@${latLng}`,
        android: `geo:0,0?q=${latLng}(${encodeURIComponent(queryTerm)})`,
        default: `https://www.google.com/maps/search/?api=1&query=${latLng}`,
      }) || `https://www.google.com/maps/search/?api=1&query=${latLng}`;
    } else {
      const encoded = encodeURIComponent(queryTerm);
      url = Platform.select({
        ios: `maps:0,0?q=${encoded}`,
        android: `geo:0,0?q=${encoded}`,
        default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
      }) || `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    }

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`);
      })
      .catch(() => {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTerm)}`);
      });
  };

  // â”€â”€â”€ Persistence & Saved Plans Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleToggleSavePlan = async () => {
    if (!generatedPlan) return;
    try {
      const planId =
        generatedPlan.id ||
        `plan-${generatedPlan.destination.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
      const planToPersist: TripPlan = {
        ...generatedPlan,
        id: planId,
        generatedAt: generatedPlan.generatedAt || new Date().toISOString(),
      };

      let nextList: TripPlan[];
      if (isCurrentPlanSaved) {
        nextList = savedPlans.filter((p) => p.id !== planId && p.title !== generatedPlan.title);
        setIsCurrentPlanSaved(false);
        showLocalizedAlert("Removed", "Itinerary removed from your saved trips.");
      } else {
        nextList = [planToPersist, ...savedPlans.filter((p) => p.id !== planId && p.title !== generatedPlan.title)];
        setIsCurrentPlanSaved(true);
        showLocalizedAlert("Saved! ðŸ”–", "Itinerary saved to your device. You can access it anytime from the top bar.");
      }
      setSavedPlans(nextList);
      await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(nextList));
    } catch (err) {
      showLocalizedAlert("Save Error", "Could not save itinerary to device.");
    }
  };

  const handleDeleteSavedPlan = async (planId: string) => {
    try {
      const nextList = savedPlans.filter((p) => p.id !== planId);
      setSavedPlans(nextList);
      await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(nextList));
      if (generatedPlan?.id === planId) {
        setIsCurrentPlanSaved(false);
      }
    } catch (err) {
      console.warn("Failed to delete saved plan:", err);
    }
  };

  const handleOpenSavedPlan = (plan: TripPlan) => {
    setGeneratedPlan(plan);
    setExpandedDay(1);
    setIsCurrentPlanSaved(true);
    setShowSavedModal(false);
    setPackedItems([]);
    setConciergeAnswer(null);
  };

  // â”€â”€â”€ Interactive Packing Checklist Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const effectivePackingList = useMemo(() => {
    if (generatedPlan?.packingChecklist && generatedPlan.packingChecklist.length > 0) {
      return generatedPlan.packingChecklist;
    }
    return [
      "Government NID / Passport & Tickets",
      "Universal Power Bank & Multi-pin Adapter",
      "Comfortable Walking / Trekking Shoes",
      "Lightweight Rain Jacket or Umbrella",
      "Prescription Medications & First Aid",
      "Sunscreen SPF 50+ & Polarized Sunglasses",
      "Local Cash & Debit Cards for Street Vendors",
      "Reusable Thermal Water Bottle",
    ];
  }, [generatedPlan]);

  const togglePackedItem = (item: string) => {
    setPackedItems((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const handleAddCustomPackingItem = () => {
    if (!customPackingInput.trim() || !generatedPlan) return;
    const newItem = customPackingInput.trim();
    const currentList = generatedPlan.packingChecklist || effectivePackingList;
    if (!currentList.includes(newItem)) {
      setGeneratedPlan({
        ...generatedPlan,
        packingChecklist: [...currentList, newItem],
      });
    }
    setCustomPackingInput("");
  };

  // â”€â”€â”€ Interactive AI Concierge Q&A Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAskConcierge = async (presetQuestion?: string) => {
    const query = (presetQuestion || conciergeQuestion).trim();
    if (!query || isAskingConcierge || !generatedPlan) return;

    setIsAskingConcierge(true);
    try {
      const response = await conciergeService.ask({
        question: query,
        context: {
          destination: generatedPlan.destination,
          duration: `${generatedPlan.durationDays} days`,
          travelStyle: generatedPlan.travelStyle,
          budget: `${generatedPlan.budget?.totalBudget || generatedPlan.totalEstimatedCost || totalBudget} ${generatedPlan.currency}`,
          travelers: `${travelers} people`,
          origin: origin,
        },
      });

      if (response.data?.answer) {
        setConciergeAnswer(response.data.answer);
        setConciergeSuggestions(response.data.suggestions || []);
      } else if (response.raw) {
        setConciergeAnswer(response.raw);
        setConciergeSuggestions([]);
      } else {
        setConciergeAnswer(
          `For ${generatedPlan.destination}, we recommend starting outdoor activities before 9:00 AM to beat midday heat and crowds, and always confirming local transportation rates before departure.`
        );
      }
      setConciergeQuestion("");
    } catch (err) {
      console.warn("[TripPlannerScreen] Concierge query error:", err);
      setConciergeAnswer(
        `Local tip for ${generatedPlan.destination}: Always keep small cash denominations for rickshaws, tuk-tuks, and entry tickets. Check operating hours 24 hours in advance for heritage sites.`
      );
      setConciergeSuggestions([
        "Where is the best spot for sunset photography?",
        "What are the top 3 authentic local dishes?",
        "Are there common tourist scams in this area?",
      ]);
    } finally {
      setIsAskingConcierge(false);
    }
  };

  // Step validation
  const canGoNext = () => {
    if (currentStep === 1) return destination.trim().length > 0;
    if (currentStep === 2) return durationDays > 0;
    if (currentStep === 3) return travelers > 0;
    if (currentStep === 4) return totalBudget > 0;
    return true;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <LinearGradient
        colors={["#EBF4FF", "#F0F7FF", "#F8FAFC"]}
        style={styles.headerBackgroundGradient}
      />

      {/* â”€â”€â”€ Top Header Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.iconCircleButton}
          onPress={() => {
            if (generatedPlan) {
              setGeneratedPlan(null);
            } else if (currentStep > 1) {
              setCurrentStep(currentStep - 1);
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name={generatedPlan || currentStep > 1 ? "arrow-back" : "chevron-back"}
            size={22}
            color="#0F172A"
          />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Trip.Planner</Text>
          <Badge
            status="info"
            variant="subtle"
            size="sm"
            label="AI CONCIERGE"
            icon={<Ionicons name="sparkles" size={11} color="#2563EB" />}
          />
        </View>

        <View style={styles.headerRightActions}>
          {generatedPlan ? (
            <>
              <TouchableOpacity
                style={[
                  styles.iconCircleButton,
                  isCurrentPlanSaved && styles.iconCircleButtonActive,
                ]}
                onPress={handleToggleSavePlan}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isCurrentPlanSaved ? "bookmark" : "bookmark-outline"}
                  size={20}
                  color={isCurrentPlanSaved ? "#2563EB" : "#334155"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconCircleButton}
                onPress={() => setShowSplitBillModal(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="people-outline" size={20} color="#2563EB" />
                {splitExpenses.length > 0 && (
                  <View style={styles.headerBadgeDot}>
                    <Text style={styles.headerBadgeDotText}>{splitExpenses.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconCircleButton}
                onPress={() => setShowShareExportModal(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="share-social-outline" size={20} color="#334155" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={styles.iconCircleButton}
                onPress={() => setShowSavedModal(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="folder-open-outline" size={20} color="#334155" />
                {savedPlans.length > 0 && (
                  <View style={styles.headerBadgeDot}>
                    <Text style={styles.headerBadgeDotText}>{savedPlans.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconCircleButton}
                onPress={() => {
                  showLocalizedAlert(
                    "AI Trip Concierge",
                    "Powered by Google Gemini with 15s defensive failover, automatic JSON repair, 40/30/20/10 budget logic, and one-tap booking packaging."
                  );
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="information-circle-outline" size={20} color="#334155" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* â”€â”€â”€ MAIN CONTENT SCROLLVIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 110 }]}
      >
        {/* VIEW A: GENERATION / SKELETON WITH ROTATING TRAVEL TRIVIA */}
        {isGenerating ? (
          <View style={styles.loadingContainer}>
            {/* Progress Bar across 15s */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["5%", "100%"],
                    }),
                  },
                ]}
              />
            </View>

            {/* Rotating Travel Trivia Card */}
            <View style={styles.triviaCard}>
              <View style={styles.triviaHeaderRow}>
                <View style={styles.triviaBadge}>
                  <Ionicons name="sparkles" size={13} color="#2563EB" />
                  <Text style={styles.triviaBadgeText}>
                    {TRAVEL_TRIVIA[triviaIndex].category}
                  </Text>
                </View>
                <Text style={styles.triviaCounterText}>
                  TRIVIA {triviaIndex + 1} OF {TRAVEL_TRIVIA.length}
                </Text>
              </View>

              <Animated.View style={{ opacity: triviaFadeAnim }}>
                <View style={styles.triviaBodyRow}>
                  <View style={styles.triviaIconBox}>
                    <Ionicons
                      name={TRAVEL_TRIVIA[triviaIndex].icon as any}
                      size={24}
                      color="#2563EB"
                    />
                  </View>
                  <Text style={styles.triviaFactText}>
                    {TRAVEL_TRIVIA[triviaIndex].fact}
                  </Text>
                </View>
              </Animated.View>

              <View style={styles.generationStatusRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.generationStatusText}>
                  Synthesizing {durationDays}-Day itinerary for {destination} â€¢ {formatCurrency(totalBudget, currency)}
                </Text>
              </View>
            </View>

            {/* Shimmer Skeleton Cards */}
            <Animated.View style={{ opacity: shimmerAnim }}>
              <Skeleton variant="card" height={150} borderRadius={20} style={{ marginBottom: 12 }} />
              <Skeleton variant="card" height={90} borderRadius={16} style={{ marginBottom: 12 }} />
              <Skeleton variant="card" height={120} borderRadius={16} style={{ marginBottom: 12 }} />
              <Skeleton variant="card" height={110} borderRadius={16} />
            </Animated.View>
          </View>
        ) : generatedPlan ? (
          /* VIEW B: INTERACTIVE ITINERARY RESULT VIEW */
          <View style={styles.resultContainer}>
            {/* â”€â”€â”€ Top Budget Tracker Bar ("à¦¬à¦¾à¦œà§‡à¦Ÿ à§³à§©à§¦,à§¦à§¦à§¦ Â· à¦–à¦°à¦š à§³à§§à§®,à§¨à§¦à§¦") â”€â”€â”€ */}
            <TripTopBudgetBar
              plannedBudget={generatedPlan.totalEstimatedCost}
              totalSpent={totalSpent}
              currency={generatedPlan.currency}
              onAddExpensePress={() => setShowSplitBillModal(true)}
              onSplitBillPress={() => setShowSplitBillModal(true)}
            />
            {/* â”€â”€â”€ Requirement 3: Proactive Traveler Alert Suggestion Banner â”€â”€â”€ */}
            {weatherAlert && (
              <View style={styles.weatherAlertBannerWrap}>
                <LinearGradient
                  colors={["#FFFBEB", "#FEF3C7", "#FDE68A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.weatherAlertBannerGradient}
                >
                  <View style={styles.weatherAlertHeaderRow}>
                    <View style={styles.weatherAlertIconBox}>
                      <Ionicons name="rainy" size={24} color="#D97706" />
                    </View>
                    <View style={styles.weatherAlertHeaderTextWrap}>
                      <View style={styles.weatherAlertBadgesLine}>
                        <Badge
                          status="warning"
                          variant="solid"
                          size="sm"
                          label="WEATHER WARNING"
                          icon={<Ionicons name="warning" size={11} color="#FFFFFF" />}
                        />
                        <View style={styles.solarPill}>
                          <Ionicons name="sunny" size={11} color="#92400E" />
                          <Text style={styles.solarPillText}>Solar Position Tables</Text>
                        </View>
                      </View>
                      <Text style={styles.weatherAlertHeaderTitle}>
                        {weatherAlert.title || "Proactive Schedule Optimization"}
                      </Text>
                    </View>
                  </View>

                  {/* Requirement 3 Exact Message */}
                  <Text style={styles.weatherAlertMessageText}>
                    {weatherAlert.message}
                  </Text>

                  {/* Contextual Weather & Golden Hour Highlights */}
                  <View style={styles.weatherAlertDetailsBox}>
                    <View style={styles.weatherDetailRow}>
                      <Ionicons name="water-outline" size={15} color="#B45309" />
                      <Text style={styles.weatherDetailText}>
                        Precipitation: <Text style={styles.boldText}>{weatherAlert.precipitationProbability}%</Text> (Threshold &gt; 70%) at {weatherAlert.forecastTime}
                      </Text>
                    </View>
                    <View style={styles.weatherDetailRow}>
                      <Ionicons name="swap-horizontal-outline" size={15} color="#B45309" />
                      <Text style={styles.weatherDetailText}>
                        Adaptive Swap: <Text style={styles.boldText}>{weatherAlert.outdoorActivityAffected}</Text> &rarr; <Text style={styles.boldText}>{weatherAlert.replacementActivity}</Text>
                      </Text>
                    </View>
                    {weatherAlert.goldenHourOptimizationsCount > 0 && (
                      <View style={styles.weatherDetailRow}>
                        <Ionicons name="camera-outline" size={15} color="#B45309" />
                        <Text style={styles.weatherDetailText}>
                          Golden Hour: {weatherAlert.goldenHourOptimizationsCount} photography spots aligned with astronomical sunrise/sunset
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Requirement 3 Buttons: "Accept" and "Keep Original" */}
                  <View style={styles.weatherAlertActionRow}>
                    <TouchableOpacity
                      style={styles.weatherAlertAcceptBtn}
                      onPress={handleAcceptWeatherOptimization}
                      activeOpacity={0.8}
                      accessibilityLabel="Accept weather schedule optimization"
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.weatherAlertAcceptBtnText}>Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.weatherAlertKeepBtn}
                      onPress={handleRejectWeatherOptimization}
                      activeOpacity={0.8}
                      accessibilityLabel="Keep original schedule"
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#78350F" />
                      <Text style={styles.weatherAlertKeepBtnText}>Keep Original</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.weatherAlertInfoBtn}
                      onPress={() => setShowWeatherDetailsModal(true)}
                      activeOpacity={0.7}
                      accessibilityLabel="View weather and solar calculation details"
                    >
                      <Ionicons name="information-circle-outline" size={20} color="#92400E" />
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </View>
            )}

            {/* Active Weather-Optimized Badge Bar (Shown after Accepting) */}
            {!weatherAlert && isWeatherOptimized && (
              <View style={styles.weatherOptimizedPillBar}>
                <View style={styles.weatherOptimizedPillLeft}>
                  <Ionicons name="checkmark-done-circle" size={18} color="#059669" />
                  <Text style={styles.weatherOptimizedPillText}>
                    Schedule Weather-Optimized &amp; Golden Hour Synced
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowWeatherDetailsModal(true)}
                  style={styles.weatherViewDataLink}
                >
                  <Text style={styles.weatherViewDataLinkText}>Solar &amp; Rain Data</Text>
                  <RTLIcon name="chevron-forward" size={14} color="#059669" />
                </TouchableOpacity>
              </View>
            )}

            {/* Top Hero Banner */}
            <LinearGradient
              colors={["#1E3A8A", "#2563EB", "#4F46E5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroBanner}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroPill}>
                  <Ionicons name="location-sharp" size={12} color="#FFFFFF" />
                  <Text style={styles.heroPillText}>{generatedPlan.destination}</Text>
                </View>
                <View style={[styles.heroPill, styles.heroPillLight]}>
                  <Ionicons name="calendar-outline" size={12} color="#FFFFFF" />
                  <Text style={styles.heroPillText}>{generatedPlan.durationDays} Days</Text>
                </View>
                <View style={[styles.heroPill, styles.heroPillLight]}>
                  <Ionicons name="people-outline" size={12} color="#FFFFFF" />
                  <Text style={styles.heroPillText}>{travelers} Guests â€¢ {generatedPlan.travelStyle.toUpperCase()}</Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>{generatedPlan.title}</Text>
              <Text style={styles.heroSummary}>{generatedPlan.summary}</Text>

              {/* Total Cost & Status Badge */}
              <View style={styles.heroCostRow}>
                <View>
                  <Text style={styles.heroCostLabel}>Total Estimated Budget</Text>
                  <Text style={styles.heroCostValue}>
                    {formatCurrency(generatedPlan.totalEstimatedCost, generatedPlan.currency)}
                  </Text>
                </View>

                {generatedPlan.isFallback ? (
                  <Badge
                    status="warning"
                    variant="subtle"
                    size="sm"
                    label="Curated Expert Guide"
                    icon={<Ionicons name="shield-checkmark" size={13} color="#D97706" />}
                  />
                ) : (
                  <Badge
                    status="success"
                    variant="subtle"
                    size="sm"
                    label="AI Optimized"
                    icon={<Ionicons name="sparkles" size={13} color="#10B981" />}
                  />
                )}
              </View>
            </LinearGradient>

            {/* â”€â”€â”€ Real-Time Meteorological & Weather Risk Widget â”€â”€â”€ */}
            {/* â”€â”€â”€ Friends & Split-Bill Hub Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <View style={styles.friendsSplitHubCard}>
              <View style={styles.friendsSplitHeader}>
                <View style={styles.friendsSplitLeft}>
                  <View style={styles.friendsSplitIconBox}>
                    <Ionicons name="people" size={20} color="#2563EB" />
                  </View>
                  <View>
                    <Text style={styles.friendsSplitTitle}>à¦¬à¦¨à§à¦§à§à¦¦à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦ªà¦°à¦¿à¦•à¦²à§à¦ªà¦¨à¦¾ à¦“ à¦¬à¦¿à¦² à¦­à¦¾à¦—</Text>
                    <Text style={styles.friendsSplitSub}>
                      {splitMembers.length} à¦œà¦¨ à¦¬à¦¨à§à¦§à§ à¦¯à§à¦•à§à¦¤ Â· à¦®à§‹à¦Ÿ à¦–à¦°à¦š: {formatCurrency(totalSpent, generatedPlan.currency)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.openSplitModalBtn}
                  onPress={() => setShowSplitBillModal(true)}
                >
                  <Text style={styles.openSplitModalBtnText}>à¦¹à¦¿à¦¸à¦¾à¦¬ à¦¦à§‡à¦–à§à¦¨</Text>
                  <RTLIcon name="chevron-forward" size={14} color="#2563EB" />
                </TouchableOpacity>
              </View>

              {/* Members Avatar Strip */}
              <View style={styles.membersAvatarRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {splitMembers.map((m) => (
                    <View key={m.id} style={styles.memberChip}>
                      <View style={styles.miniAvatar}>
                        <Text style={styles.miniAvatarText}>{m.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.memberChipName} numberOfLines={1}>
                        {m.name} {m.isCurrentUser ? "(à¦†à¦ªà¦¨à¦¿)" : ""}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addFriendQuickBtn}
                    onPress={() => setShowSplitBillModal(true)}
                  >
                    <Ionicons name="person-add-outline" size={14} color="#2563EB" />
                    <Text style={styles.addFriendQuickText}>+ à¦¬à¦¨à§à¦§à§ à¦¯à§‹à¦—</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Settlement Debts Preview */}
              {settlementDebts.length > 0 && (
                <View style={styles.quickDebtsPreview}>
                  <Ionicons name="swap-horizontal" size={13} color="#15803D" />
                  <Text style={styles.quickDebtsText} numberOfLines={1}>
                    {settlementDebts[0].fromMemberName} âž” {settlementDebts[0].toMemberName} à¦•à§‡ {formatCurrency(settlementDebts[0].amount, generatedPlan.currency)} à¦¦à§‡à¦¬à§‡
                    {settlementDebts.length > 1 ? ` (+à¦†à¦°à¦“ ${settlementDebts.length - 1} à¦Ÿà¦¿)` : ""}
                  </Text>
                </View>
              )}
            </View>

            <WeatherWidget
              location={generatedPlan.destination}
              variant="card"
              customTitle={`${generatedPlan.destination} Live Weather & Advisory`}
              style={{ marginHorizontal: 16 }}
            />

            {/* â”€â”€â”€ Budget Distribution (40/30/20/10) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <View style={styles.budgetCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons name="pie-chart" size={18} color="#2563EB" />
                  <Text style={styles.sectionTitle}>Budget Distribution</Text>
                </View>
                <Text style={styles.budgetSublabel}>
                  ~{formatCurrency(generatedPlan.totalEstimatedCost / generatedPlan.durationDays, generatedPlan.currency)} / day
                </Text>
              </View>

              <View style={styles.multiProgressBar}>
                <View style={[styles.progSegment, { flex: 40, backgroundColor: "#3B82F6" }]} />
                <View style={[styles.progSegment, { flex: 30, backgroundColor: "#10B981" }]} />
                <View style={[styles.progSegment, { flex: 20, backgroundColor: "#F59E0B" }]} />
                <View style={[styles.progSegment, { flex: 10, backgroundColor: "#8B5CF6" }]} />
              </View>

              <View style={styles.budgetGrid}>
                {/* 1. Hotel (40%) */}
                <View style={styles.budgetGridItem}>
                  <View style={styles.budgetItemTop}>
                    <View style={[styles.dotIndicator, { backgroundColor: "#3B82F6" }]} />
                    <Text style={styles.budgetCategoryTitle}>Hotel (40%)</Text>
                  </View>
                  <Text style={styles.budgetCategoryAmount}>
                    {formatCurrency(
                      generatedPlan.budget?.hotel?.estimated ?? generatedPlan.totalEstimatedCost * 0.4,
                      generatedPlan.currency
                    )}
                  </Text>
                  <Text style={styles.budgetCategoryTips}>
                    {generatedPlan.budget?.hotel?.tips || "Stays & resort fees"}
                  </Text>
                </View>

                {/* 2. Transport (30%) */}
                <View style={styles.budgetGridItem}>
                  <View style={styles.budgetItemTop}>
                    <View style={[styles.dotIndicator, { backgroundColor: "#10B981" }]} />
                    <Text style={styles.budgetCategoryTitle}>Transport (30%)</Text>
                  </View>
                  <Text style={styles.budgetCategoryAmount}>
                    {formatCurrency(
                      generatedPlan.budget?.transport?.estimated ?? generatedPlan.totalEstimatedCost * 0.3,
                      generatedPlan.currency
                    )}
                  </Text>
                  <Text style={styles.budgetCategoryTips}>
                    {generatedPlan.budget?.transport?.tips || "Rides, rails & transit"}
                  </Text>
                </View>

                {/* 3. Food (20%) */}
                <View style={styles.budgetGridItem}>
                  <View style={styles.budgetItemTop}>
                    <View style={[styles.dotIndicator, { backgroundColor: "#F59E0B" }]} />
                    <Text style={styles.budgetCategoryTitle}>Food (20%)</Text>
                  </View>
                  <Text style={styles.budgetCategoryAmount}>
                    {formatCurrency(
                      generatedPlan.budget?.food?.estimated ?? generatedPlan.totalEstimatedCost * 0.2,
                      generatedPlan.currency
                    )}
                  </Text>
                  <Text style={styles.budgetCategoryTips}>
                    {generatedPlan.budget?.food?.tips || "Local culinary dining"}
                  </Text>
                </View>

                {/* 4. Activities (10%) */}
                <View style={styles.budgetGridItem}>
                  <View style={styles.budgetItemTop}>
                    <View style={[styles.dotIndicator, { backgroundColor: "#8B5CF6" }]} />
                    <Text style={styles.budgetCategoryTitle}>Activities (10%)</Text>
                  </View>
                  <Text style={styles.budgetCategoryAmount}>
                    {formatCurrency(
                      generatedPlan.budget?.activities?.estimated ?? generatedPlan.totalEstimatedCost * 0.1,
                      generatedPlan.currency
                    )}
                  </Text>
                  <Text style={styles.budgetCategoryTips}>
                    {generatedPlan.budget?.activities?.tips || "Passes & excursions"}
                  </Text>
                </View>
              </View>
            </View>

            {/* â”€â”€â”€ Expandable Day-by-Day Cards with Editable Activities â”€â”€â”€â”€â”€â”€â”€ */}
            <StickyHeader backgroundColor="#F8FAFC" elevation={2} style={{ paddingVertical: 10, paddingHorizontal: 4, marginHorizontal: -4 }}>
<View style={styles.itineraryHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Interactive Daily Schedule</Text>
                <Text style={styles.sectionSubtitle}>Tap pencil to edit activities, or add custom stops</Text>
              </View>
              <Badge
                status="info"
                variant="outline"
                size="sm"
                label={`${generatedPlan.days.length} Days`}
              />
            </View>

            
</StickyHeader>
            {generatedPlan.days.map((dayItem: TripDay, dayIdx: number) => {
              const isExpanded = expandedDay === dayItem.day;
              return (
                <View key={dayItem.day} style={styles.dayCard}>
                  {/* Day Accordion Header */}
                  <TouchableOpacity
                    style={styles.dayCardHeader}
                    activeOpacity={0.7}
                    onPress={() => setExpandedDay(isExpanded ? null : dayItem.day)}
                  >
                    <View style={styles.dayHeaderLeft}>
                      <Badge
                        status="info"
                        variant="subtle"
                        size="md"
                        label={`Day ${dayItem.day}`}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={[styles.dayThemeText, { flex: 1 }]} numberOfLines={1}>
                            {dayItem.theme}
                          </Text>
                          {/* Day Weather Icon & Rain Chance */}
                          <View style={styles.dayWeatherBadge}>
                            <Ionicons
                              name={
                                (activeOptimization?.weatherForecasts?.[dayIdx]?.condition || "").toLowerCase().includes("rain") ||
                                (activeOptimization?.weatherForecasts?.[dayIdx]?.maxPrecipitationProbability || 0) > 40
                                  ? "rainy"
                                  : (activeOptimization?.weatherForecasts?.[dayIdx]?.condition || "").toLowerCase().includes("cloud")
                                  ? "partly-sunny"
                                  : "sunny"
                              }
                              size={13}
                              color={
                                (activeOptimization?.weatherForecasts?.[dayIdx]?.maxPrecipitationProbability || 0) > 40
                                  ? "#2563EB"
                                  : "#F59E0B"
                              }
                            />
                            <Text style={styles.dayWeatherText}>
                              {activeOptimization?.weatherForecasts?.[dayIdx]?.maxPrecipitationProbability !== undefined
                                ? `${activeOptimization.weatherForecasts[dayIdx].maxPrecipitationProbability}% à¦¬à§ƒà¦·à§à¦Ÿà¦¿`
                                : "à¦°à§Œà¦¦à§à¦°à§‹à¦œà§à¦œà§à¦¬à¦²"}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.daySubCountText}>
                          {dayItem.activities?.length || 0} activities â€¢ {dayItem.meals?.length || 0} meal spots
                        </Text>
                      </View>
                    </View>

                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <View style={styles.dayExpandedBody}>
                      {/* Rainy Day Alternative Suggestions */}
                      <RainyAlternativesCard
                        destination={generatedPlan.destination}
                        dayNumber={dayItem.day}
                        rainProbability={
                          activeOptimization?.weatherForecasts?.[dayIdx]?.maxPrecipitationProbability ?? 75
                        }
                        weatherCondition={
                          activeOptimization?.weatherForecasts?.[dayIdx]?.condition ?? "Rain"
                        }
                        onAddAlternative={(activity) => {
                          const updatedDays = [...generatedPlan.days];
                          const targetDay = { ...updatedDays[dayIdx] };
                          targetDay.activities = [...(targetDay.activities || []), activity];
                          updatedDays[dayIdx] = targetDay;
                          setGeneratedPlan({ ...generatedPlan, days: updatedDays });
                          showLocalizedAlert(
                            "à¦¬à¦¿à¦•à¦²à§à¦ª à¦¯à§à¦•à§à¦¤ à¦¹à§Ÿà§‡à¦›à§‡",
                            `"${activity.activity}" à¦¸à¦«à¦²à¦­à¦¾à¦¬à§‡ Day ${dayItem.day}-à¦à¦° à¦¶à¦¿à¦¡à¦¿à¦‰à¦²à§‡ à¦¯à§‹à¦— à¦•à¦°à¦¾ à¦¹à§Ÿà§‡à¦›à§‡à¥¤`
                          );
                        }}
                      />

                      <View style={styles.subSectionHeaderRow}>
                        <Text style={styles.subSectionTitle}>ðŸ“ Planned Schedule & Timelines</Text>
                        <TouchableOpacity
                          style={styles.addActivityHeaderBtn}
                          onPress={() => handleAddActivity(dayIdx)}
                        >
                          <Ionicons name="add-circle" size={16} color="#2563EB" />
                          <Text style={styles.addActivityHeaderText}>Add Stop</Text>
                        </TouchableOpacity>
                      </View>

                      {dayItem.activities?.map((act, actIdx) => (
                        <View key={actIdx}>
                          {/* Travel Time Transit Connector */}
                          {actIdx > 0 && (
                            <View style={styles.transitConnectorRow}>
                              <View style={styles.transitLine} />
                              <View style={styles.transitBadge}>
                                <Ionicons name="car-outline" size={12} color="#64748B" />
                                <Text style={styles.transitText}>
                                  Estimated transit: ~{15 + (actIdx * 10) % 25} mins
                                </Text>
                              </View>
                            </View>
                          )}

                          <View style={styles.activityRow}>
                            <View style={styles.timelineCol}>
                              <View style={styles.timelineDot} />
                              {actIdx < dayItem.activities.length - 1 && (
                                <View style={styles.timelineLine} />
                              )}
                            </View>

                            <View style={styles.activityContent}>
                              <View style={styles.activityTimeRow}>
                                <View style={styles.timeAndDurationWrap}>
                                  <Text style={styles.activityTime}>{act.time}</Text>
                                  {act.duration && (
                                    <View style={styles.durationPill}>
                                      <Ionicons name="time-outline" size={10} color="#64748B" />
                                      <Text style={styles.durationPillText}>{act.duration}</Text>
                                    </View>
                                  )}
                                </View>

                                {/* Reorder, Edit, and Delete Action Icons */}
                                <View style={styles.activityActionsRow}>
                                  {actIdx > 0 && (
                                    <TouchableOpacity
                                      style={styles.actActionBtn}
                                      onPress={() => handleMoveActivity(dayIdx, actIdx, "up")}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      accessibilityLabel="Move activity up"
                                    >
                                      <Ionicons name="chevron-up" size={14} color="#64748B" />
                                    </TouchableOpacity>
                                  )}
                                  {actIdx < dayItem.activities.length - 1 && (
                                    <TouchableOpacity
                                      style={styles.actActionBtn}
                                      onPress={() => handleMoveActivity(dayIdx, actIdx, "down")}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      accessibilityLabel="Move activity down"
                                    >
                                      <Ionicons name="chevron-down" size={14} color="#64748B" />
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity
                                    style={styles.actActionBtn}
                                    onPress={() => handleOpenEditActivity(dayIdx, actIdx)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    accessibilityLabel="Edit activity"
                                  >
                                    <Ionicons name="pencil" size={14} color="#2563EB" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.actActionBtn}
                                    onPress={() => handleDeleteActivity(dayIdx, actIdx)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    accessibilityLabel="Delete activity"
                                  >
                                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                                  </TouchableOpacity>
                                </View>
                              </View>

                              <Text style={styles.activityTitle}>{act.activity}</Text>

                              <View style={styles.actLocationRow}>
                                <TouchableOpacity
                                  style={styles.actLocationWrap}
                                  onPress={() =>
                                    handleOpenMapLocation(
                                      act.coordinates?.latitude,
                                      act.coordinates?.longitude,
                                      act.location
                                    )
                                  }
                                >
                                  <Ionicons name="location-outline" size={13} color="#2563EB" />
                                  <Text style={styles.activityLocation}>{act.location}</Text>
                                </TouchableOpacity>

                                {act.estimatedCost !== undefined && act.estimatedCost > 0 && (
                                  <View style={styles.costBadge}>
                                    <Text style={styles.costBadgeText}>
                                      {formatCurrency(act.estimatedCost, generatedPlan.currency)}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {act.notes ? (
                                <Text style={styles.activityNotes}>{act.notes}</Text>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      ))}

                      {/* Map Route Navigation Box */}
                      <View style={styles.mapPlaceholderBox}>
                        <View style={styles.mapHeaderRow}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Ionicons name="navigate" size={16} color="#2563EB" />
                            <Text style={styles.mapHeaderText}>Geospatial Route Map</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.openMapBtn}
                            onPress={() => {
                              const firstWithCoords = dayItem.activities.find((a) => a.coordinates);
                              handleOpenMapLocation(
                                firstWithCoords?.coordinates?.latitude,
                                firstWithCoords?.coordinates?.longitude,
                                `${generatedPlan.destination} Day ${dayItem.day}`
                              );
                            }}
                          >
                            <Text style={styles.openMapBtnText}>Open in Maps</Text>
                            <Ionicons name="open-outline" size={13} color="#2563EB" />
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.mapDescription}>
                          Connected route linking {dayItem.activities.length} pinpointed destinations in {generatedPlan.destination}.
                        </Text>
                      </View>

                      {/* Recommended Dining */}
                      {dayItem.meals && dayItem.meals.length > 0 && (
                        <View style={styles.mealsSection}>
                          <Text style={styles.subSectionTitle}>ðŸ² Recommended Restaurants & Dining</Text>
                          <View style={styles.mealsList}>
                            {dayItem.meals.map((meal, mealIdx) => (
                              <View key={mealIdx} style={styles.mealItem}>
                                <View style={styles.mealTypeBadge}>
                                  <Text style={styles.mealTypeText}>
                                    {meal.type.toUpperCase()}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.mealSuggestion}>{meal.suggestion}</Text>
                                  {meal.restaurant && (
                                    <Text style={styles.mealRestaurant}>
                                      ðŸ´ {meal.restaurant}
                                    </Text>
                                  )}
                                </View>
                                {meal.estimatedCost ? (
                                  <Text style={styles.mealCostText}>
                                    ~{formatCurrency(meal.estimatedCost, generatedPlan.currency)}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Overnight Accommodation */}
                      {dayItem.accommodation ? (
                        <View style={styles.hotelRecommendation}>
                          <Ionicons name="bed-outline" size={16} color="#2563EB" />
                          <Text style={styles.hotelRecText}>
                            Overnight Stay: <Text style={{ fontWeight: "700" }}>{dayItem.accommodation}</Text>
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Concierge Travel Tips */}
            {generatedPlan.tips && generatedPlan.tips.length > 0 && (
              <View style={styles.tipsCard}>
                <View style={styles.tipsHeaderRow}>
                  <Ionicons name="bulb-outline" size={18} color="#D97706" />
                  <Text style={styles.tipsHeaderTitle}>Concierge Travel Tips & Etiquette</Text>
                </View>
                {generatedPlan.tips.map((tip, idx) => (
                  <View key={`tip-${tip.slice(0, 15)}-${idx}`} style={styles.tipRow}>
                    <Text style={styles.tipBullet}>â€¢</Text>
                    <Text style={styles.tipBodyText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Interactive Packing Checklist Card */}
            <View style={styles.packingCard}>
              <View style={styles.packingHeaderRow}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="bag-check-outline" size={20} color="#059669" />
                  <Text style={styles.packingHeaderTitle}>Smart Packing Checklist</Text>
                </View>
                <Badge
                  status={
                    packedItems.length === effectivePackingList.length &&
                    effectivePackingList.length > 0
                      ? "success"
                      : "neutral"
                  }
                  size="sm"
                  label={`${packedItems.length}/${effectivePackingList.length} Packed`}
                />
              </View>
              <Text style={styles.packingSubtitle}>
                Recommended essentials for your {generatedPlan.travelStyle} journey in{" "}
                {generatedPlan.destination}.
              </Text>

              {/* Progress Bar */}
              <View style={styles.packingProgressTrack}>
                <View
                  style={[
                    styles.packingProgressBar,
                    {
                      width: `${
                        effectivePackingList.length > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (packedItems.length / effectivePackingList.length) * 100
                              )
                            )
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>

              {/* Items List */}
              <View style={styles.packingItemsList}>
                {effectivePackingList.map((item, idx) => {
                  const isPacked = packedItems.includes(item);
                  return (
                    <TouchableOpacity
                      key={`${item}-${idx}`}
                      style={[
                        styles.packingItemRow,
                        isPacked && styles.packingItemRowChecked,
                      ]}
                      onPress={() => togglePackedItem(item)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isPacked ? "checkbox" : "square-outline"}
                        size={20}
                        color={isPacked ? "#059669" : "#94A3B8"}
                      />
                      <Text
                        style={[
                          styles.packingItemText,
                          isPacked && styles.packingItemTextChecked,
                        ]}
                      >
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Add Custom Packing Item */}
              <View style={styles.addPackingItemRow}>
                <TextInput
                  style={styles.addPackingInput}
                  placeholder="Add item (e.g. Camera lenses, passport)..."
                  placeholderTextColor="#94A3B8"
                  value={customPackingInput}
                  onChangeText={setCustomPackingInput}
                  onSubmitEditing={handleAddCustomPackingItem}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.addPackingBtn}
                  onPress={handleAddCustomPackingItem}
                >
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Interactive AI Travel Concierge Assistant Card */}
            <View style={styles.conciergeCard}>
              <View style={styles.conciergeHeaderRow}>
                <View style={styles.conciergeIconWrap}>
                  <Ionicons name="chatbubbles-outline" size={20} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.conciergeHeaderTitle}>Ask AI Concierge</Text>
                  <Text style={styles.conciergeHeaderSubtitle}>
                    Instant travel advice, local etiquette & tips for {generatedPlan.destination}
                  </Text>
                </View>
              </View>

              {/* Quick Query Suggestion Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.conciergePillsScroll}
              >
                {[
                  `ðŸŒ… Best sunset spot?`,
                  `ðŸ½ï¸ Must-try street food?`,
                  `âš ï¸ Local safety & scam tips?`,
                  `ðŸš• Best way to get around?`,
                  `ðŸ§³ Dress code & etiquette?`,
                ].map((pill, pIdx) => (
                  <TouchableOpacity
                    key={pIdx}
                    style={styles.conciergePill}
                    onPress={() => handleAskConcierge(pill)}
                    disabled={isAskingConcierge}
                  >
                    <Text style={styles.conciergePillText}>{pill}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* AI Concierge Answer Display */}
              {isAskingConcierge ? (
                <View style={styles.conciergeLoadingWrap}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.conciergeLoadingText}>Consulting local AI guide...</Text>
                </View>
              ) : conciergeAnswer ? (
                <View style={styles.conciergeAnswerBubble}>
                  <View style={styles.conciergeAnswerHeader}>
                    <Ionicons name="sparkles" size={15} color="#2563EB" />
                    <Text style={styles.conciergeAnswerBadge}>Concierge Advice</Text>
                  </View>
                  <Text style={styles.conciergeAnswerText}>{conciergeAnswer}</Text>

                  {conciergeSuggestions.length > 0 && (
                    <View style={styles.conciergeFollowupWrap}>
                      <Text style={styles.conciergeFollowupTitle}>Related Recommendations:</Text>
                      {conciergeSuggestions.map((sug, sIdx) => (
                        <TouchableOpacity
                          key={sIdx}
                          style={styles.conciergeSugRow}
                          onPress={() => handleAskConcierge(sug)}
                        >
                          <RTLIcon name="chevron-forward" size={13} color="#2563EB" />
                          <Text style={styles.conciergeSugText}>{sug}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Ask Question Input Bar */}
              <View style={styles.conciergeInputRow}>
                <TextInput
                  style={styles.conciergeTextInput}
                  placeholder={`Ask anything about ${generatedPlan.destination}...`}
                  placeholderTextColor="#94A3B8"
                  value={conciergeQuestion}
                  onChangeText={setConciergeQuestion}
                  onSubmitEditing={() => handleAskConcierge()}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[
                    styles.conciergeSendBtn,
                    (!conciergeQuestion.trim() || isAskingConcierge) && styles.conciergeSendBtnDisabled,
                  ]}
                  onPress={() => handleAskConcierge()}
                  disabled={!conciergeQuestion.trim() || isAskingConcierge}
                >
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Re-Plan Trigger */}
            <TouchableOpacity
              style={styles.replanBtn}
              onPress={() => setGeneratedPlan(null)}
            >
              <Ionicons name="options-outline" size={16} color="#64748B" />
              <Text style={styles.replanBtnText}>Modify Questionnaire & Re-plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* VIEW C: MULTI-STEP QUESTIONNAIRE WIZARD */
          <View style={styles.wizardContainer}>
            {/* â”€â”€â”€ Ready-made Curated Templates Banner â”€â”€â”€ */}
            <TripTemplatesBanner
              onApplyTemplate={handleApplyTemplate}
              onCopyToForm={handleCopyToForm}
            />
            {/* Wizard Stepper Header */}
            <View style={styles.stepperNavBar}>
              <View style={styles.stepperHeaderTop}>
                <Text style={styles.stepperStepLabel}>
                  STEP {currentStep} OF {totalWizardSteps}
                </Text>
                <Text style={styles.stepperStepName}>
                  {currentStep === 1 && "Destination & Departure"}
                  {currentStep === 2 && "Duration & Date Range"}
                  {currentStep === 3 && "Traveler Composition"}
                  {currentStep === 4 && "Budget Range & Optimization"}
                  {currentStep === 5 && "Activity Preferences & Vibes"}
                </Text>
              </View>

              <View style={styles.stepperProgressRow}>
                {[1, 2, 3, 4, 5].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.stepperSegment,
                      st <= currentStep && styles.stepperSegmentActive,
                    ]}
                    onPress={() => setCurrentStep(st)}
                  />
                ))}
              </View>
            </View>

            {/* STEP 1: DESTINATION & DEPARTURE */}
            {currentStep === 1 && (
              <View style={styles.wizardCard}>
                <View style={styles.stepTitleRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <View>
                    <Text style={styles.stepTitle}>Where are you traveling?</Text>
                    <Text style={styles.stepSubtitle}>Choose destination and departure city</Text>
                  </View>
                </View>

                {/* Destination Selector */}
                <TouchableOpacity
                  style={styles.fieldBox}
                  activeOpacity={0.8}
                  onPress={() => setShowDestModal(true)}
                >
                  <View style={styles.fieldLeft}>
                    <Ionicons name="location-sharp" size={20} color="#2563EB" />
                    <View>
                      <Text style={styles.fieldSublabel}>Destination City / Island</Text>
                      <Text style={styles.fieldValText}>{destination}</Text>
                    </View>
                  </View>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* Popular Destination Quick Chips */}
                <Text style={styles.chipsLabel}>Trending Destinations:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {DESTINATION_CATALOG.slice(0, 10).map((dest) => {
                    const isSelected = destination.toLowerCase() === dest.name.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={dest.name}
                        style={[styles.destChip, isSelected && styles.destChipSelected]}
                        onPress={() => setDestination(dest.name)}
                      >
                        <Ionicons
                          name={dest.icon}
                          size={14}
                          color={isSelected ? "#FFFFFF" : "#2563EB"}
                        />
                        <Text style={[styles.destChipText, isSelected && styles.destChipTextSelected]}>
                          {dest.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Starting From Origin */}
                <View style={[styles.fieldBox, { marginTop: 14 }]}>
                  <View style={styles.fieldLeft}>
                    <Ionicons name="navigate-outline" size={20} color="#64748B" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldSublabel}>Starting Departure City</Text>
                      <TextInput
                        style={styles.inlineTextInput}
                        value={origin}
                        onChangeText={setOrigin}
                        placeholder="e.g. Dhaka, Chittagong, Sylhet..."
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>
                </View>

                {/* Quick Origin Suggestions */}
                <View style={styles.originChipsRow}>
                  {ORIGIN_SUGGESTIONS.slice(0, 4).map((org) => (
                    <TouchableOpacity
                      key={org}
                      style={[styles.originMiniChip, origin === org && styles.originMiniChipActive]}
                      onPress={() => setOrigin(org)}
                    >
                      <Text
                        style={[
                          styles.originMiniChipText,
                          origin === org && styles.originMiniChipTextActive,
                        ]}
                      >
                        {org}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* STEP 2: DURATION & DATES */}
            {currentStep === 2 && (
              <View style={styles.wizardCard}>
                <View style={styles.stepTitleRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View>
                    <Text style={styles.stepTitle}>How long is your trip?</Text>
                    <Text style={styles.stepSubtitle}>Schedule and duration pacing</Text>
                  </View>
                </View>

                {/* Estimated Dates Box */}
                <View style={styles.dateRangeBox}>
                  <Ionicons name="calendar" size={18} color="#2563EB" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dateRangeLabel}>Estimated Trip Dates</Text>
                    <Text style={styles.dateRangeValue}>{formattedDateRange}</Text>
                  </View>
                  <Badge status="info" size="sm" label={`${durationDays} Days`} />
                </View>

                {/* Duration Presets */}
                <View style={styles.durationPresetsGrid}>
                  {DURATION_PRESETS.map((dp) => {
                    const isSelected = durationDays === dp.days;
                    return (
                      <TouchableOpacity
                        key={dp.days}
                        style={[styles.durationCard, isSelected && styles.durationCardSelected]}
                        onPress={() => handleDurationChange(dp.days)}
                      >
                        <Text style={[styles.durationDaysText, isSelected && styles.textWhite]}>
                          {dp.label}
                        </Text>
                        <Text style={[styles.durationSubText, isSelected && styles.textWhite70]}>
                          {dp.subtitle}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Stepper Controls */}
                <View style={styles.stepperRow}>
                  <View>
                    <Text style={styles.stepperLabel}>Custom Days Count</Text>
                    <Text style={styles.stepperSublabel}>Between 1 to 21 days</Text>
                  </View>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => handleDurationChange(durationDays - 1)}
                    >
                      <Ionicons name="remove" size={18} color="#1E293B" />
                    </TouchableOpacity>
                    <Text style={styles.stepperValText}>{durationDays} Days</Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => handleDurationChange(durationDays + 1)}
                    >
                      <Ionicons name="add" size={18} color="#1E293B" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* STEP 3: TRAVELER COMPOSITION & STYLE */}
            {currentStep === 3 && (
              <View style={styles.wizardCard}>
                <View style={styles.stepTitleRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <View>
                    <Text style={styles.stepTitle}>Who is traveling & what style?</Text>
                    <Text style={styles.stepSubtitle}>Tailor pacing, hotels, and group dynamics</Text>
                  </View>
                </View>

                {/* Number of Travelers Counter */}
                <View style={[styles.stepperRow, { marginTop: 0, marginBottom: 14, borderTopWidth: 0 }]}>
                  <View>
                    <Text style={styles.stepperLabel}>Number of Guests</Text>
                    <Text style={styles.stepperSublabel}>Adults and companions</Text>
                  </View>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => handleTravelersChange(travelers - 1)}
                    >
                      <Ionicons name="remove" size={18} color="#1E293B" />
                    </TouchableOpacity>
                    <Text style={styles.stepperValText}>{travelers} People</Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => handleTravelersChange(travelers + 1)}
                    >
                      <Ionicons name="add" size={18} color="#1E293B" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Travel Style Options */}
                <View style={styles.stylesList}>
                  {TRAVEL_STYLES.map((style) => {
                    const isSelected = travelStyle === style.id;
                    return (
                      <TouchableOpacity
                        key={style.id}
                        style={[styles.styleOptionCard, isSelected && styles.styleOptionSelected]}
                        onPress={() => handleStyleSelect(style)}
                      >
                        <View style={[styles.styleIconBox, isSelected && styles.styleIconBoxSelected]}>
                          <Ionicons
                            name={style.icon}
                            size={20}
                            color={isSelected ? "#FFFFFF" : "#2563EB"}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.styleTitle, isSelected && styles.styleTitleSelected]}>
                            {style.label}
                          </Text>
                          <Text style={styles.styleDesc}>{style.desc}</Text>
                        </View>
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={22} color="#2563EB" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* STEP 4: BUDGET RANGE & LIVE OPTIMIZATION */}
            {currentStep === 4 && (
              <View style={styles.wizardCard}>
                <View style={styles.stepTitleRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>4</Text>
                  </View>
                  <View>
                    <Text style={styles.stepTitle}>Budget Range & Optimization</Text>
                    <Text style={styles.stepSubtitle}>Live 40/30/20/10 distribution preview</Text>
                  </View>
                </View>

                {/* Currency Toggle */}
                <View style={styles.currencyToggleRow}>
                  <Text style={styles.fieldSublabel}>Preferred Currency:</Text>
                  <View style={styles.currencyToggleBox}>
                    <TouchableOpacity
                      style={[styles.currencyPill, currency === "BDT" && styles.currencyPillActive]}
                      onPress={() => handleCurrencyChange("BDT")}
                    >
                      <Text
                        style={[
                          styles.currencyPillText,
                          currency === "BDT" && styles.currencyPillTextActive,
                        ]}
                      >
                        BDT (à§³)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.currencyPill, currency === "USD" && styles.currencyPillActive]}
                      onPress={() => handleCurrencyChange("USD")}
                    >
                      <Text
                        style={[
                          styles.currencyPillText,
                          currency === "USD" && styles.currencyPillTextActive,
                        ]}
                      >
                        USD ($)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Budget Tiers */}
                <View style={styles.budgetTiersGrid}>
                  {BUDGET_TIERS.map((tier) => {
                    const isSelected = budgetLevel === tier.id;
                    const calculatedAmount = calculateTierBudget(tier.id, currency, durationDays, travelers);
                    return (
                      <TouchableOpacity
                        key={tier.id}
                        style={[styles.budgetTierCard, isSelected && styles.budgetTierSelected]}
                        onPress={() => handleBudgetTierSelect(tier.id)}
                      >
                        <Text style={[styles.budgetTierName, isSelected && styles.textBlue]}>
                          {tier.label}
                        </Text>
                        <Text style={styles.budgetTierSub}>
                          {formatCurrency(calculatedAmount, currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Budget Input */}
                <View style={styles.totalBudgetInputBox}>
                  <Text style={styles.currencySymbolText}>{currency === "BDT" ? "à§³" : "$"}</Text>
                  <TextInput
                    style={styles.totalBudgetInput}
                    keyboardType="numeric"
                    value={String(totalBudget)}
                    onChangeText={(val) => {
                      const num = parseInt(val.replace(/[^0-9]/g, ""), 10) || 0;
                      setTotalBudget(num);
                      setBudgetLevel("custom");
                    }}
                    placeholder="Total trip budget"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                {/* Live 40/30/20/10 Breakdown Preview */}
                <View style={styles.liveAllocContainer}>
                  <View style={styles.liveAllocHeader}>
                    <Ionicons name="calculator-outline" size={15} color="#2563EB" />
                    <Text style={styles.liveAllocHeaderText}>
                      Smart 40/30/20/10 Allocation Preview
                    </Text>
                  </View>

                  <View style={styles.multiProgressBar}>
                    <View style={[styles.progSegment, { flex: 40, backgroundColor: "#3B82F6" }]} />
                    <View style={[styles.progSegment, { flex: 30, backgroundColor: "#10B981" }]} />
                    <View style={[styles.progSegment, { flex: 20, backgroundColor: "#F59E0B" }]} />
                    <View style={[styles.progSegment, { flex: 10, backgroundColor: "#8B5CF6" }]} />
                  </View>

                  <View style={styles.liveAllocRow}>
                    <Text style={styles.liveAllocLabel}>ðŸ¨ Hotel (40%):</Text>
                    <Text style={styles.liveAllocValue}>
                      {formatCurrency(liveBudgetBreakdown.hotel.estimated, currency)}
                    </Text>
                  </View>
                  <View style={styles.liveAllocRow}>
                    <Text style={styles.liveAllocLabel}>ðŸš† Transport (30%):</Text>
                    <Text style={styles.liveAllocValue}>
                      {formatCurrency(liveBudgetBreakdown.transport.estimated, currency)}
                    </Text>
                  </View>
                  <View style={styles.liveAllocRow}>
                    <Text style={styles.liveAllocLabel}>ðŸ² Food (20%):</Text>
                    <Text style={styles.liveAllocValue}>
                      {formatCurrency(liveBudgetBreakdown.food.estimated, currency)}
                    </Text>
                  </View>
                  <View style={styles.liveAllocRow}>
                    <Text style={styles.liveAllocLabel}>ðŸŽŸï¸ Activities (10%):</Text>
                    <Text style={styles.liveAllocValue}>
                      {formatCurrency(liveBudgetBreakdown.activities.estimated, currency)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* STEP 5: ACTIVITY PREFERENCES & RECAP */}
            {currentStep === 5 && (
              <View style={styles.wizardCard}>
                <View style={styles.stepTitleRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>5</Text>
                  </View>
                  <View>
                    <Text style={styles.stepTitle}>Activity Preferences & Vibes</Text>
                    <Text style={styles.stepSubtitle}>Select what you love doing most</Text>
                  </View>
                </View>

                {/* Interest Chips */}
                <View style={styles.interestsGrid}>
                  {INTEREST_OPTIONS.map((item) => {
                    const isSelected = selectedInterests.includes(item.label);
                    return (
                      <TouchableOpacity
                        key={item.label}
                        style={[styles.interestChip, isSelected && styles.interestChipSelected]}
                        onPress={() => toggleInterest(item.label)}
                      >
                        <Ionicons
                          name={item.icon as any}
                          size={16}
                          color={isSelected ? "#FFFFFF" : "#1E293B"}
                        />
                        <Text
                          style={[
                            styles.interestChipText,
                            isSelected && styles.interestChipTextSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom Notes */}
                <Text style={[styles.chipsLabel, { marginTop: 16 }]}>Special Requests / Notes (Optional):</Text>
                <TextInput
                  style={styles.customNotesInput}
                  multiline
                  numberOfLines={3}
                  value={customNotes}
                  onChangeText={setCustomNotes}
                  placeholder="e.g. Vegetarian food preferences, morning photography focus, avoid steep climbs..."
                  placeholderTextColor="#94A3B8"
                />

                {/* Blueprint Summary Box */}
                <View style={styles.wizardReviewBox}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#2563EB" />
                    <Text style={styles.reviewBoxTitle}>Itinerary Blueprint</Text>
                  </View>
                  <Text style={styles.reviewBoxText}>
                    ðŸ“ {origin} âž” {destination} â€¢ ðŸ“… {durationDays} Days ({formattedDateRange}) â€¢ ðŸ‘¥ {travelers} Guests â€¢ ðŸ’° {formatCurrency(totalBudget, currency)}
                  </Text>
                </View>
              </View>
            )}

            {/* Wizard Navigation Footer */}
            <View style={styles.wizardNavButtonsRow}>
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  size="lg"
                  label="Back"
                  leftIcon={<RTLIcon name="arrow-back" size={18} color="#2563EB" />}
                  onPress={() => setCurrentStep(currentStep - 1)}
                  style={{ flex: 1 }}
                />
              )}

              {currentStep < totalWizardSteps ? (
                <TouchableOpacity
                  style={[styles.nextStepBtn, { flex: 2 }]}
                  disabled={!canGoNext()}
                  onPress={() => setCurrentStep(currentStep + 1)}
                >
                  <LinearGradient
                    colors={["#2563EB", "#3B82F6"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.nextStepBtnGradient}
                  >
                    <Text style={styles.nextStepBtnText}>Continue</Text>
                    <RTLIcon name="arrow-forward" size={18} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryActionButton, { flex: 2 }]}
                  activeOpacity={0.85}
                  onPress={handleGenerateItinerary}
                >
                  <LinearGradient
                    colors={["#2563EB", "#4F46E5", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButtonGradient}
                  >
                    <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Generate Itinerary</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* â”€â”€â”€ STICKY BOTTOM BAR: ONE-TAP "BOOK ENTIRE ITINERARY" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {generatedPlan && !isGenerating && (
        <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            variant="outline"
            size="md"
            label="Share & PDF"
            leftIcon={<Ionicons name="share-outline" size={18} color="#2563EB" />}
            onPress={() => setShowShareExportModal(true)}
          />

          <TouchableOpacity
            style={styles.primaryBookItineraryBtn}
            activeOpacity={0.85}
            onPress={handleBookEntireItinerary}
          >
            <LinearGradient
              colors={["#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryBookItineraryGradient}
            >
              <Ionicons name="bag-check" size={20} color="#FFFFFF" />
              <View>
                <Text style={styles.primaryBookItineraryText}>Book Entire Itinerary</Text>
                <Text style={styles.primaryBookItinerarySub}>
                  {formatCurrency(generatedPlan.totalEstimatedCost, generatedPlan.currency)} â€¢ Instant Checkout
                </Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* â”€â”€â”€ MODAL: EDIT ACTIVITY CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={Boolean(editingActivity)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingActivity(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.editModalSheet}>
              <View style={styles.sheetHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="create-outline" size={22} color="#2563EB" />
                  <Text style={styles.sheetTitle}>Edit Activity Details</Text>
                </View>
                <TouchableOpacity onPress={() => setEditingActivity(null)}>
                  <Ionicons name="close-circle" size={26} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {editingActivity && (
                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  <Text style={styles.inputLabel}>Activity Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editingActivity.activity}
                    onChangeText={(val) =>
                      setEditingActivity({ ...editingActivity, activity: val })
                    }
                    placeholder="Activity Title"
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Time / Schedule</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={editingActivity.time}
                        onChangeText={(val) =>
                          setEditingActivity({ ...editingActivity, time: val })
                        }
                        placeholder="e.g. 09:30 AM"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Duration / Transit</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={editingActivity.duration}
                        onChangeText={(val) =>
                          setEditingActivity({ ...editingActivity, duration: val })
                        }
                        placeholder="e.g. 2 hours"
                      />
                    </View>
                  </View>

                  <Text style={styles.inputLabel}>Location Landmark</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={editingActivity.location}
                    onChangeText={(val) =>
                      setEditingActivity({ ...editingActivity, location: val })
                    }
                    placeholder="Location or Address"
                  />

                  <Text style={styles.inputLabel}>
                    Estimated Cost ({currency === "BDT" ? "à§³ BDT" : "$ USD"})
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    keyboardType="numeric"
                    value={editingActivity.estimatedCost}
                    onChangeText={(val) =>
                      setEditingActivity({ ...editingActivity, estimatedCost: val })
                    }
                    placeholder="Cost amount"
                  />

                  <Text style={styles.inputLabel}>Notes & Tips</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 60 }]}
                    multiline
                    value={editingActivity.notes}
                    onChangeText={(val) =>
                      setEditingActivity({ ...editingActivity, notes: val })
                    }
                    placeholder="Special instructions or tips..."
                  />
                </ScrollView>
              )}

              <View style={styles.modalActionButtonsRow}>
                <Button
                  variant="outline"
                  size="md"
                  label="Cancel"
                  onPress={() => setEditingActivity(null)}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="primary"
                  size="md"
                  label="Save Changes"
                  leftIcon={<Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  onPress={handleSaveEditedActivity}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* â”€â”€â”€ MODAL: DESTINATION SELECTOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={showDestModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Destination</Text>
              <TouchableOpacity onPress={() => setShowDestModal(false)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetSearchBox}>
              <Ionicons name="search" size={20} color="#64748B" />
              <TextInput
                style={styles.sheetSearchInput}
                placeholder="Type any city, island, or region..."
                placeholderTextColor="#94A3B8"
                value={customDestInput}
                onChangeText={setCustomDestInput}
                autoFocus
              />
              {customDestInput.trim().length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setDestination(customDestInput.trim());
                    setShowDestModal(false);
                    setCustomDestInput("");
                  }}
                >
                  <Text style={styles.selectTextBtn}>Select</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Custom Destination Fast Pick */}
            {customDestInput.trim().length > 0 &&
              !DESTINATION_CATALOG.some(
                (d) => d.name.toLowerCase() === customDestInput.trim().toLowerCase()
              ) && (
                <TouchableOpacity
                  style={styles.customPickRow}
                  onPress={() => {
                    setDestination(customDestInput.trim());
                    setShowDestModal(false);
                    setCustomDestInput("");
                  }}
                >
                  <Ionicons name="add-circle" size={20} color="#2563EB" />
                  <Text style={styles.customPickText}>
                    Use custom destination: "{customDestInput.trim()}"
                  </Text>
                </TouchableOpacity>
              )}

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {DESTINATION_CATALOG.filter(
                (d) =>
                  d.name.toLowerCase().includes(customDestInput.toLowerCase()) ||
                  d.country.toLowerCase().includes(customDestInput.toLowerCase()) ||
                  d.tag.toLowerCase().includes(customDestInput.toLowerCase())
              ).map((d) => (
                <TouchableOpacity
                  key={d.name}
                  style={styles.destListRow}
                  onPress={() => {
                    setDestination(d.name);
                    setShowDestModal(false);
                    setCustomDestInput("");
                  }}
                >
                  <View style={styles.destListIcon}>
                    <Ionicons name={d.icon} size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.destListName}>{d.name}</Text>
                    <Text style={styles.destListCountry}>{d.country} â€¢ {d.tag}</Text>
                  </View>
                  {destination.toLowerCase() === d.name.toLowerCase() && (
                    <Ionicons name="checkmark-circle" size={22} color="#2563EB" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* â”€â”€â”€ MODAL: SAVED ITINERARIES SHEET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={showSavedModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSavedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="bookmark" size={22} color="#2563EB" />
                <Text style={styles.sheetTitle}>Saved Itineraries ({savedPlans.length})</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSavedModal(false)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {savedPlans.length === 0 ? (
              <View style={styles.emptySavedWrap}>
                <Ionicons name="folder-open-outline" size={48} color="#CBD5E1" />
                <Text style={styles.emptySavedTitle}>No Saved Itineraries Yet</Text>
                <Text style={styles.emptySavedSubtitle}>
                  Generate any customized trip plan and tap the bookmark icon at the top to save it for offline review and one-tap checkout.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {savedPlans.map((plan, pIdx) => (
                  <View key={plan.id || pIdx} style={styles.savedPlanCard}>
                    <View style={styles.savedPlanCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.savedPlanTitle}>
                          {plan.title || `${plan.destination} Tour`}
                        </Text>
                        <Text style={styles.savedPlanMeta}>
                          {plan.durationDays} Days â€¢ {plan.travelStyle?.toUpperCase()} â€¢{" "}
                          {formatCurrency(plan.totalEstimatedCost, plan.currency)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.savedPlanDeleteBtn}
                        onPress={() => plan.id && handleDeleteSavedPlan(plan.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.savedPlanSummary} numberOfLines={2}>
                      {plan.summary}
                    </Text>

                    <TouchableOpacity
                      style={styles.savedPlanOpenBtn}
                      onPress={() => handleOpenSavedPlan(plan)}
                    >
                      <Text style={styles.savedPlanOpenBtnText}>Open Itinerary</Text>
                      <RTLIcon name="arrow-forward" size={15} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* â”€â”€â”€ MODAL: WEATHER & SOLAR POSITION DETAILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={showWeatherDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWeatherDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: "88%" }]}>
            <View style={styles.sheetHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="partly-sunny" size={22} color="#D97706" />
                <Text style={styles.sheetTitle}>Weather &amp; Solar Optimization</Text>
              </View>
              <TouchableOpacity onPress={() => setShowWeatherDetailsModal(false)}>
                <Ionicons name="close-circle" size={26} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Solar Position Table Card */}
              <View style={styles.modalSectionCard}>
                <View style={styles.modalSectionHeaderRow}>
                  <Ionicons name="sunny" size={18} color="#D97706" />
                  <Text style={styles.modalSectionTitle}>Solar Position Tables</Text>
                </View>
                <Text style={styles.modalSectionSub}>
                  Astronomical solar declination &amp; hour angles calculated for {generatedPlan?.destination || "Destination"}
                </Text>

                {activeOptimization?.solarPositions &&
                  Object.entries(activeOptimization.solarPositions).map(([dayKey, pos]) => (
                    <View key={dayKey} style={styles.solarDayCard}>
                      <View style={styles.solarDayTop}>
                        <Text style={styles.solarDayTitle}>Day {dayKey} ({pos.date})</Text>
                        <Badge
                          status="info"
                          size="sm"
                          label={`Lat: ${pos.latitude.toFixed(2)}Â°, Lon: ${pos.longitude.toFixed(2)}Â°`}
                        />
                      </View>
                      <View style={styles.solarTimesGrid}>
                        <View style={styles.solarTimeBox}>
                          <Text style={styles.solarTimeLabel}>Sunrise</Text>
                          <Text style={styles.solarTimeVal}>{pos.sunriseTime}</Text>
                        </View>
                        <View style={styles.solarTimeBox}>
                          <Text style={styles.solarTimeLabel}>Sunset</Text>
                          <Text style={styles.solarTimeVal}>{pos.sunsetTime}</Text>
                        </View>
                        <View style={styles.solarTimeBox}>
                          <Text style={styles.solarTimeLabel}>Morning Golden Hour</Text>
                          <Text style={styles.solarTimeVal}>{pos.morningGoldenHour.start} - {pos.morningGoldenHour.end}</Text>
                        </View>
                        <View style={styles.solarTimeBox}>
                          <Text style={styles.solarTimeLabel}>Evening Golden Hour</Text>
                          <Text style={styles.solarTimeVal}>{pos.eveningGoldenHour.start} - {pos.eveningGoldenHour.end}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
              </View>

              {/* Hourly Precipitation Forecast Card */}
              <View style={styles.modalSectionCard}>
                <View style={styles.modalSectionHeaderRow}>
                  <Ionicons name="rainy" size={18} color="#2563EB" />
                  <Text style={styles.modalSectionTitle}>Precipitation Forecast &amp; Rain Warnings</Text>
                </View>
                <Text style={styles.modalSectionSub}>
                  Outdoor attractions with precipitation probability &gt; 70% automatically swapped for indoor activities.
                </Text>

                {activeOptimization?.weatherForecasts.map((wf) => (
                  <View key={wf.day} style={styles.weatherDayCard}>
                    <View style={styles.weatherDayHeader}>
                      <Text style={styles.weatherDayName}>Day {wf.day} ({wf.date})</Text>
                      {wf.isInclement ? (
                        <Badge
                          status="error"
                          size="sm"
                          label="Inclement Weather"
                          icon={<Ionicons name="warning" size={10} color="#EF4444" />}
                        />
                      ) : (
                        <Badge status="success" size="sm" label="Fair &amp; Clear" />
                      )}
                    </View>
                    <Text style={styles.weatherConditionText}>{wf.condition}</Text>

                    <View style={styles.hourlyList}>
                      {wf.hourly.map((h, hIdx) => (
                        <View
                          key={hIdx}
                          style={[
                            styles.hourlyRow,
                            h.precipitationProbability > 70 && styles.hourlyRowAlert,
                          ]}
                        >
                          <Text style={styles.hourlyTime}>{h.time}</Text>
                          <Text style={styles.hourlyCondition}>{h.condition}</Text>
                          <View style={styles.hourlyPopWrap}>
                            <Text
                              style={[
                                styles.hourlyPop,
                                h.precipitationProbability > 70 && styles.hourlyPopHigh,
                              ]}
                            >
                              {h.precipitationProbability}%
                            </Text>
                            {h.precipitationProbability > 70 && (
                              <Ionicons name="alert-circle" size={13} color="#DC2626" />
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>

              {/* Applied Modifications List */}
              {activeOptimization?.modifications && activeOptimization.modifications.length > 0 && (
                <View style={styles.modalSectionCard}>
                  <View style={styles.modalSectionHeaderRow}>
                    <Ionicons name="git-compare" size={18} color="#059669" />
                    <Text style={styles.modalSectionTitle}>Itinerary Restructuring Log</Text>
                  </View>
                  {activeOptimization.modifications.map((m, mIdx) => (
                    <View key={mIdx} style={styles.modCard}>
                      <View style={styles.modTopRow}>
                        <Badge
                          status={m.type === "weather_swap" ? "error" : "warning"}
                          size="sm"
                          label={m.type === "weather_swap" ? "RAIN PROTECTION SWAP" : "GOLDEN HOUR OPTIMIZATION"}
                        />
                        <Text style={styles.modDay}>Day {m.day}</Text>
                      </View>
                      <Text style={styles.modOriginal}>Original: {m.originalActivity.activity} ({m.originalActivity.time})</Text>
                      <Text style={styles.modNew}>Restructured: {m.newActivity.activity} ({m.newActivity.time})</Text>
                      <Text style={styles.modReason}>{m.reason}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* State Synchronization Note */}
              <View style={styles.syncNoticeCard}>
                <Ionicons name="shield-checkmark" size={16} color="#059669" />
                <Text style={styles.syncNoticeText}>
                  State Synchronization: Updates sync with useBookingStore while preserving active booking references and draft IDs.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowWeatherDetailsModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* â”€â”€â”€ Accidental Delete Protection: Undo Toast Snackbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {undoActivityData && (
        <View style={styles.undoSnackbarContainer} pointerEvents="box-none">
          <View style={styles.undoSnackbar}>
            <View style={styles.undoSnackbarLeft}>
              <Ionicons name="trash-outline" size={18} color="#F87171" />
              <Text style={styles.undoSnackbarText} numberOfLines={1}>
                "{undoActivityData.activityTitle}" à¦®à§à¦›à§‡ à¦«à§‡à¦²à¦¾ à¦¹à¦¯à¦¼à§‡à¦›à§‡
              </Text>
            </View>
            <TouchableOpacity
              style={styles.undoActionButton}
              onPress={handleUndoActivityDelete}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-undo" size={14} color="#38BDF8" />
              <Text style={styles.undoActionText}>à¦ªà§‚à¦°à§à¦¬à¦¾à¦¬à¦¸à§à¦¥à¦¾à¦¯à¦¼ à¦«à§‡à¦°à¦¾à¦¨ (Undo)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {/* â”€â”€â”€ Undo Activity Deletion Toast Bar â”€â”€â”€ */}
      {lastDeletedActivity && (
        <View style={styles.undoToastCard}>
          <View style={styles.undoToastLeft}>
            <Ionicons name="trash-bin-outline" size={18} color="#F87171" />
            <Text style={styles.undoToastText} numberOfLines={1}>
              "{lastDeletedActivity.activity.activity}" à¦®à§à¦›à§‡ à¦«à§‡à¦²à¦¾ à¦¹à§Ÿà§‡à¦›à§‡
            </Text>
          </View>
          <TouchableOpacity
            style={styles.undoActionBtn}
            onPress={handleUndoDeleteActivity}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-undo" size={15} color="#2563EB" />
            <Text style={styles.undoActionText}>à¦ªà§‚à¦°à§à¦¬à¦¾à¦¬à¦¸à§à¦¥à¦¾à¦¯à¦¼ à¦«à§‡à¦°à¦¾à¦¨ (Undo)</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* â”€â”€â”€ Friends & Split Bill Hub Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <TripSplitBillModal
        visible={showSplitBillModal}
        onClose={() => setShowSplitBillModal(false)}
        tripTitle={generatedPlan?.title || `${destination} ${durationDays} à¦¦à¦¿à¦¨à§‡à¦° à¦Ÿà§à¦°à¦¿à¦ª`}
        destination={generatedPlan?.destination || destination}
        currency={generatedPlan?.currency || currency}
      />

      {/* â”€â”€â”€ Share, PDF & Offline Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {generatedPlan && (
        <TripShareExportModal
          visible={showShareExportModal}
          onClose={() => setShowShareExportModal(false)}
          plan={generatedPlan}
        />
      )}
    </SafeAreaView>
  );
}

