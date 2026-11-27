import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRiderStore } from "@/store/riderStore";
import { photonGeocoder, GeocodingResult } from "@/services/location/photonGeocoder";
import { BANGLADESH_MOBILITY_HUBS, MobilityHubPreset } from "@/features/rider/constants";
import { formatPaisaBDT, VEHICLE_TIERS } from "@/features/rider/calculators";
import {
  RidePaymentMethod,
  RideRequest,
  RideType,
  VehicleMode,
} from "@/features/rider/types";
import { MapMarkerItem, MapRouteItem, OpenStreetMap } from "@/components/common/OpenStreetMap";
import { riderService } from "@/services/riderService";

const NAVY = "#0F172A";
const SURFACE = "#1E293B";
const BORDER = "#334155";
const EMERALD = "#10B981";
const GOLD = "#E5A93C";

interface SelectedPlace {
  label: string;
  city: string;
  lat: number;
  lng: number;
}

const RIDE_TYPES: Array<{ key: RideType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "on_demand", label: "Ride Now", icon: "flash-outline" },
  { key: "airport_pickup", label: "Airport Pickup", icon: "airplane-outline" },
  { key: "scheduled", label: "Schedule", icon: "calendar-outline" },
  { key: "hourly_rental", label: "Chauffeur", icon: "time-outline" },
  { key: "intercity", label: "Intercity", icon: "map-outline" },
];

const VEHICLE_TIERS_LIST: VehicleMode[] = ["bike", "cng", "sedan", "suv", "boat"];

const PAYMENT_METHODS: Array<{ key: RidePaymentMethod; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "bkash", label: "bKash" },
  { key: "nagad", label: "Nagad" },
  { key: "rocket", label: "Rocket" },
  { key: "wallet", label: "Wallet" },
  { key: "card", label: "Card" },
];

export default function ConsumerRideHailingScreen() {
  const router = useRouter();

  const consumerQuotes = useRiderStore((s) => s.consumerQuotes);
  const consumerActiveRide = useRiderStore((s) => s.consumerActiveRide);
  const consumerPassengerOtp = useRiderStore((s) => s.consumerPassengerOtp);
  const consumerRideHistory = useRiderStore((s) => s.consumerRideHistory);

  const refreshConsumerQuotes = useRiderStore((s) => s.refreshConsumerQuotes);
  const bookConsumerRide = useRiderStore((s) => s.bookConsumerRide);
  const cancelConsumerRide = useRiderStore((s) => s.cancelConsumerRide);
  const loadConsumerHistory = useRiderStore((s) => s.loadConsumerHistory);
  const triggerSOS = useRiderStore((s) => s.triggerSOS);

  const [pickup, setPickup] = useState<SelectedPlace>({
    label: BANGLADESH_MOBILITY_HUBS[1].name,
    city: BANGLADESH_MOBILITY_HUBS[1].city,
    lat: BANGLADESH_MOBILITY_HUBS[1].lat,
    lng: BANGLADESH_MOBILITY_HUBS[1].lng,
  });
  const [dropoff, setDropoff] = useState<SelectedPlace>({
    label: BANGLADESH_MOBILITY_HUBS[0].name,
    city: BANGLADESH_MOBILITY_HUBS[0].city,
    lat: BANGLADESH_MOBILITY_HUBS[0].lat,
    lng: BANGLADESH_MOBILITY_HUBS[0].lng,
  });

  const [rideType, setRideType] = useState<RideType>("on_demand");
  const [selectedMode, setSelectedMode] = useState<VehicleMode>("sedan");
  const [paymentMethod, setPaymentMethod] = useState<RidePaymentMethod>("bkash");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [weatherGuard, setWeatherGuard] = useState(true);
  const [flightNumber, setFlightNumber] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");

  // Location Picker Modal
  const [pickerMode, setPickerMode] = useState<"pickup" | "dropoff" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [photonResults, setPhotonResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Route & Booking State
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"book" | "history">("book");

  const recomputeQuotes = useCallback(
    async (promoToUse = appliedPromo) => {
      await refreshConsumerQuotes({
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        promoCode: promoToUse || undefined,
        rideType,
        weatherGuard,
      });

      try {
        const nav = await riderService.getRouteNavigation(
          { lat: pickup.lat, lng: pickup.lng, label: pickup.label },
          { lat: dropoff.lat, lng: dropoff.lng, label: dropoff.label },
          selectedMode
        );
        setRoutePoints(nav.polyline);
      } catch {
        setRoutePoints([
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ]);
      }
    },
    [
      pickup,
      dropoff,
      rideType,
      weatherGuard,
      appliedPromo,
      selectedMode,
      refreshConsumerQuotes,
    ]
  );

  useEffect(() => {
    recomputeQuotes().catch(() => {});
  }, [recomputeQuotes]);

  useEffect(() => {
    loadConsumerHistory().catch(() => {});
  }, [loadConsumerHistory]);

  // Debounced Photon geocoding search
  useEffect(() => {
    if (!pickerMode) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setPhotonResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await photonGeocoder.searchPlaces(q, 8);
      setPhotonResults(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, pickerMode]);

  const handleSelectPlace = (place: SelectedPlace) => {
    if (pickerMode === "pickup") {
      setPickup(place);
    } else if (pickerMode === "dropoff") {
      setDropoff(place);
    }
    setPickerMode(null);
    setSearchQuery("");
    setPhotonResults([]);
  };

  const handleApplyPromo = () => {
    const clean = promoCode.trim().toUpperCase();
    setAppliedPromo(clean);
    recomputeQuotes(clean).catch(() => {});
    if (clean) {
      Alert.alert("Promo Applied", `Fare quotes recalculated with code ${clean}.`);
    }
  };

  const handleBookRide = async () => {
    if (rideType === "airport_pickup" && !flightNumber.trim()) {
      Alert.alert(
        "Flight Number Recommended",
        "Enter your flight number (e.g., BG-148) or switch back to Ride Now.",
        [
          { text: "Enter Flight", style: "cancel" },
          {
            text: "Book Without Flight",
            onPress: () => executeBooking(),
          },
        ]
      );
      return;
    }
    await executeBooking();
  };

  const executeBooking = async () => {
    setBookingBusy(true);
    try {
      const res = await bookConsumerRide({
        vehicle_mode: selectedMode,
        ride_type: rideType,
        pickup_address: pickup.label,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.label,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        promo_code: appliedPromo || undefined,
        payment_method: paymentMethod,
        scheduled_for: scheduledFor.trim() || undefined,
        flight_number: flightNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert(
        "Ride Confirmed — Fare Locked",
        `Ref ${res.request.request_reference}\nStart OTP: ${res.passengerOtp}\nShare this OTP with your verified driver at pickup.`
      );
    } catch (err: unknown) {
      Alert.alert(
        "Booking Error",
        err instanceof Error ? err.message : "Could not book ride."
      );
    } finally {
      setBookingBusy(false);
    }
  };

  const selectedQuote = consumerQuotes[selectedMode];

  // Map markers
  const mapMarkers: MapMarkerItem[] = [
    {
      id: "pickup",
      title: "Pickup",
      subtitle: pickup.label,
      latitude: pickup.lat,
      longitude: pickup.lng,
      color: EMERALD,
      icon: "📍",
      category: "transit",
    },
    {
      id: "dropoff",
      title: "Destination",
      subtitle: dropoff.label,
      latitude: dropoff.lat,
      longitude: dropoff.lng,
      color: "#EF4444",
      icon: "🏁",
      category: "attraction",
    },
  ];

  if (consumerActiveRide) {
    // Show nearby/en-route rider beacon midpoint
    const midLat =
      (consumerActiveRide.pickup_lat + consumerActiveRide.dropoff_lat) / 2;
    const midLng =
      (consumerActiveRide.pickup_lng + consumerActiveRide.dropoff_lng) / 2;
    mapMarkers.push({
      id: "active-rider",
      title: "Assigned Rider",
      subtitle: consumerActiveRide.status.toUpperCase(),
      latitude: (consumerActiveRide.pickup_lat + midLat) / 2,
      longitude: (consumerActiveRide.pickup_lng + midLng) / 2,
      color: GOLD,
      icon: "🚕",
      category: "transit",
    });
  }

  const mapRoutes: MapRouteItem[] =
    routePoints.length >= 2
      ? [
          {
            id: "consumer-route",
            points: routePoints,
            color: EMERALD,
            weight: 4,
          },
        ]
      : [];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.topHeader}>
        <Pressable
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        >
          <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>ShopnoJatra Ride & Chauffeur</Text>
          <Text style={styles.headerSub}>
            Photon OSM Geocoding • Upfront Fare Lock
          </Text>
        </View>
        <Pressable
          style={styles.rentalsChip}
          onPress={() => router.push("/screens/car-rentals" as Parameters<typeof router.push>[0])}
        >
          <Ionicons name="car-sport-outline" size={14} color={GOLD} />
          <Text style={styles.rentalsChipText}>Rentals</Text>
        </Pressable>
      </View>

      {/* Book vs History Switch */}
      <View style={styles.subTabsRow}>
        <Pressable
          style={[styles.subTab, activeSubTab === "book" && styles.subTabActive]}
          onPress={() => setActiveSubTab("book")}
        >
          <Text
            style={[
              styles.subTabText,
              activeSubTab === "book" && styles.subTabTextActive,
            ]}
          >
            Book Ride
          </Text>
        </Pressable>
        <Pressable
          style={[styles.subTab, activeSubTab === "history" && styles.subTabActive]}
          onPress={() => setActiveSubTab("history")}
        >
          <Text
            style={[
              styles.subTabText,
              activeSubTab === "history" && styles.subTabTextActive,
            ]}
          >
            History ({consumerRideHistory.length})
          </Text>
        </Pressable>
      </View>

      {activeSubTab === "history" ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {consumerRideHistory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="car-outline" size={38} color="#64748B" />
              <Text style={styles.emptyTitle}>No Rides Yet</Text>
              <Text style={styles.emptySub}>
                Completed, active, or queued offline rides sync cleanly here.
              </Text>
            </View>
          ) : (
            consumerRideHistory.map((item: RideRequest) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyRef}>
                    {item.request_reference} • {VEHICLE_TIERS[item.vehicle_mode].label}
                  </Text>
                  <Text style={styles.historyFare}>
                    {formatPaisaBDT(item.quoted_fare_paisa)}
                  </Text>
                </View>
                <Text style={styles.historyRoute} numberOfLines={1}>
                  From: {item.pickup_address}
                </Text>
                <Text style={styles.historyRoute} numberOfLines={1}>
                  To: {item.dropoff_address}
                </Text>
                <View style={styles.historyFooter}>
                  <Text style={styles.historyStatus}>
                    {item.status.toUpperCase()} • {item.payment_method.toUpperCase()}
                  </Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Active Ride Live Tracking & OTP Card */}
          {consumerActiveRide && (
            <View style={styles.activeRideCard}>
              <View style={styles.activeRideTop}>
                <View>
                  <Text style={styles.activeRideLabel}>
                    ACTIVE RIDE • {consumerActiveRide.status.toUpperCase()}
                  </Text>
                  <Text style={styles.activeRideSub}>
                    {VEHICLE_TIERS[consumerActiveRide.vehicle_mode].label} •{" "}
                    {formatPaisaBDT(consumerActiveRide.quoted_fare_paisa)}
                  </Text>
                </View>
                {consumerPassengerOtp && (
                  <View style={styles.otpBadge}>
                    <Text style={styles.otpCaption}>START OTP</Text>
                    <Text style={styles.otpCode}>{consumerPassengerOtp}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.otpInstructions}>
                Provide OTP above to your driver before starting the journey.
              </Text>

              <View style={styles.activeBtnsRow}>
                <Pressable
                  style={styles.shareTripBtn}
                  onPress={() =>
                    Share.share({
                      message: `Track my ShopnoJatra ride (${consumerActiveRide.request_reference}) from ${consumerActiveRide.pickup_address} to ${consumerActiveRide.dropoff_address}.`,
                    }).catch(() => {})
                  }
                >
                  <Ionicons name="share-social-outline" size={16} color="#93C5FD" />
                  <Text style={styles.shareTripText}>Share Live Trip</Text>
                </Pressable>
                <Pressable
                  style={styles.sosTripBtn}
                  onPress={async () => {
                    const res = await triggerSOS("Consumer triggered safety SOS");
                    Alert.alert("Safety Alert Sent", `Tracking link: ${res.shareLink}`);
                  }}
                >
                  <Ionicons name="shield-half" size={16} color="#FFFFFF" />
                  <Text style={styles.sosTripText}>SOS</Text>
                </Pressable>
                <Pressable
                  style={styles.cancelTripBtn}
                  onPress={() =>
                    cancelConsumerRide(consumerActiveRide.id, "Cancelled by passenger")
                  }
                >
                  <Text style={styles.cancelTripText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Live Map Preview */}
          <View style={styles.mapContainer}>
            <OpenStreetMap
              markers={mapMarkers}
              routes={mapRoutes}
              initialRegion={{
                latitude: (pickup.lat + dropoff.lat) / 2,
                longitude: (pickup.lng + dropoff.lng) / 2,
                zoom: 12,
              }}
              theme="dark"
              tileLayer="dark"
              style={StyleSheet.absoluteFill}
            />
          </View>

          {/* Ride Type Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.rideTypeRow}
          >
            {RIDE_TYPES.map((rt) => {
              const active = rideType === rt.key;
              return (
                <Pressable
                  key={rt.key}
                  style={[styles.rideTypeChip, active && styles.rideTypeChipActive]}
                  onPress={() => setRideType(rt.key)}
                >
                  <Ionicons
                    name={rt.icon}
                    size={15}
                    color={active ? NAVY : "#94A3B8"}
                  />
                  <Text
                    style={[
                      styles.rideTypeText,
                      active && styles.rideTypeTextActive,
                    ]}
                  >
                    {rt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Pickup & Dropoff Cards */}
          <View style={styles.card}>
            <Pressable
              style={styles.locationRow}
              onPress={() => setPickerMode("pickup")}
            >
              <Ionicons name="radio-button-on" size={16} color={EMERALD} />
              <View style={{ flex: 1 }}>
                <Text style={styles.locLabel}>PICKUP LOCATION</Text>
                <Text style={styles.locValue} numberOfLines={1}>
                  {pickup.label}
                </Text>
              </View>
              <Ionicons name="search" size={16} color="#64748B" />
            </Pressable>

            <View style={styles.locDivider} />

            <Pressable
              style={styles.locationRow}
              onPress={() => setPickerMode("dropoff")}
            >
              <Ionicons name="location" size={16} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.locLabel}>DESTINATION</Text>
                <Text style={styles.locValue} numberOfLines={1}>
                  {dropoff.label}
                </Text>
              </View>
              <Ionicons name="search" size={16} color="#64748B" />
            </Pressable>
          </View>

          {/* Conditional Airport / Schedule Inputs */}
          {(rideType === "airport_pickup" || rideType === "scheduled") && (
            <View style={styles.card}>
              {rideType === "airport_pickup" && (
                <>
                  <Text style={styles.fieldLabel}>Flight Number (Terminal Meet & Greet)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., BG-148 or BS-215"
                    placeholderTextColor="#475569"
                    value={flightNumber}
                    onChangeText={setFlightNumber}
                  />
                </>
              )}
              <Text style={styles.fieldLabel}>Scheduled Pickup Date & Time</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2026-11-28 06:30 AM"
                placeholderTextColor="#475569"
                value={scheduledFor}
                onChangeText={setScheduledFor}
              />
            </View>
          )}

          {/* Vehicle Tier Comparison */}
          <Text style={styles.sectionTitle}>Select Vehicle Tier (Fare Locked)</Text>
          {VEHICLE_TIERS_LIST.map((mode) => {
            const spec = VEHICLE_TIERS[mode];
            const q = consumerQuotes[mode];
            const active = selectedMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.tierCard, active && styles.tierCardActive]}
                onPress={() => setSelectedMode(mode)}
              >
                <View style={styles.tierIconBox}>
                  <Ionicons
                    name={spec.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={active ? EMERALD : "#94A3B8"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.tierTitleRow}>
                    <Text style={styles.tierName}>{spec.label}</Text>
                    <Text style={styles.tierSeats}>• {spec.seats} seats</Text>
                  </View>
                  <Text style={styles.tierTagline}>
                    {spec.tagline} • {q ? `${q.eta_minutes} min ETA • ${q.distance_km.toFixed(1)} km` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.tierFare}>
                    {q ? formatPaisaBDT(q.quoted_fare_paisa) : `৳${spec.minFareBdt}+`}
                  </Text>
                  {q && q.discount_paisa > 0 && (
                    <Text style={styles.promoSaved}>
                      Saved {formatPaisaBDT(q.discount_paisa)}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          {/* Promo Code, Weather Guard & Payment Method */}
          <View style={styles.card}>
            <View style={styles.promoRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Promo (SHOPNO10, DHAKA50, AIRPORT15)"
                placeholderTextColor="#475569"
                autoCapitalize="characters"
                value={promoCode}
                onChangeText={setPromoCode}
              />
              <Pressable style={styles.applyPromoBtn} onPress={handleApplyPromo}>
                <Text style={styles.applyPromoText}>Apply</Text>
              </Pressable>
            </View>

            <View style={styles.weatherGuardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wgTitle}>Weather Guard Fair Surge Cap</Text>
                <Text style={styles.wgSub}>
                  Caps surge at 1.10x during Dhaka/coastal rain
                </Text>
              </View>
              <Switch
                value={weatherGuard}
                onValueChange={setWeatherGuard}
                trackColor={{ false: BORDER, true: EMERALD }}
              />
            </View>

            <Text style={styles.fieldLabel}>Payment Method</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_METHODS.map((pm) => (
                <Pressable
                  key={pm.key}
                  style={[
                    styles.paymentChip,
                    paymentMethod === pm.key && styles.paymentChipActive,
                  ]}
                  onPress={() => setPaymentMethod(pm.key)}
                >
                  <Text
                    style={[
                      styles.paymentText,
                      paymentMethod === pm.key && styles.paymentTextActive,
                    ]}
                  >
                    {pm.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Pickup note for driver (e.g., Near Gate 2)"
              placeholderTextColor="#475569"
              value={notes}
              onChangeText={setNotes}
            />

            <Pressable
              style={[styles.bookBtn, { opacity: bookingBusy ? 0.65 : 1 }]}
              onPress={handleBookRide}
              disabled={bookingBusy}
            >
              {bookingBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.bookBtnText}>
                  Confirm {VEHICLE_TIERS[selectedMode].label} •{" "}
                  {selectedQuote
                    ? formatPaisaBDT(selectedQuote.quoted_fare_paisa)
                    : "Fare Locked"}
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      )}

      {/* Photon Geocoding + Mobility Hub Modal */}
      <Modal
        visible={!!pickerMode}
        animationType="slide"
        onRequestClose={() => setPickerMode(null)}
      >
        <SafeAreaView style={styles.modalContainer} edges={["top", "bottom"]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPickerMode(null)}>
              <Ionicons name="close" size={24} color="#F8FAFC" />
            </Pressable>
            <Text style={styles.modalTitle}>
              Search {pickerMode === "pickup" ? "Pickup" : "Destination"} (Photon OSM)
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Type Dhaka Gulshan, Airport, Cox's Bazar..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={EMERALD} />}
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {photonResults.length > 0 && (
              <>
                <Text style={styles.groupHeading}>Live Photon Search Results</Text>
                {photonResults.map((res) => (
                  <Pressable
                    key={res.id}
                    style={styles.resultRow}
                    onPress={() =>
                      handleSelectPlace({
                        label: res.displayName,
                        city: res.city,
                        lat: res.latitude,
                        lng: res.longitude,
                      })
                    }
                  >
                    <Ionicons name="location-outline" size={18} color={EMERALD} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultTitle}>{res.displayName}</Text>
                      <Text style={styles.resultMeta}>
                        {res.city} • {res.osmType}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}

            <Text style={styles.groupHeading}>Bangladesh Mobility & Airport Hubs</Text>
            {BANGLADESH_MOBILITY_HUBS.map((hub: MobilityHubPreset) => (
              <Pressable
                key={hub.id}
                style={styles.resultRow}
                onPress={() =>
                  handleSelectPlace({
                    label: hub.name,
                    city: hub.city,
                    lat: hub.lat,
                    lng: hub.lng,
                  })
                }
              >
                <Ionicons
                  name={hub.isAirport ? "airplane-outline" : "navigate-circle-outline"}
                  size={18}
                  color={GOLD}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>
                    {hub.name} ({hub.code})
                  </Text>
                  <Text style={styles.resultMeta}>
                    {hub.nameBn} • {hub.city}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: NAVY },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "800" },
  headerSub: { color: "#94A3B8", fontSize: 11 },
  rentalsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: GOLD + "55",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  rentalsChipText: { color: GOLD, fontSize: 11, fontWeight: "700" },
  subTabsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  subTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: SURFACE,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  subTabActive: { backgroundColor: EMERALD, borderColor: EMERALD },
  subTabText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  subTabTextActive: { color: "#FFFFFF" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  activeRideCard: {
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderColor: EMERALD,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  activeRideTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeRideLabel: { color: EMERALD, fontSize: 12, fontWeight: "800" },
  activeRideSub: { color: "#F8FAFC", fontSize: 14, fontWeight: "700", marginTop: 2 },
  otpBadge: {
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GOLD,
  },
  otpCaption: { color: GOLD, fontSize: 9, fontWeight: "800" },
  otpCode: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  otpInstructions: { color: "#CBD5E1", fontSize: 11, marginVertical: 8 },
  activeBtnsRow: { flexDirection: "row", gap: 8 },
  shareTripBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: SURFACE,
    paddingVertical: 9,
    borderRadius: 8,
  },
  shareTripText: { color: "#93C5FD", fontSize: 12, fontWeight: "700" },
  sosTripBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  sosTripText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  cancelTripBtn: {
    backgroundColor: SURFACE,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 8,
  },
  cancelTripText: { color: "#FCA5A5", fontSize: 12, fontWeight: "700" },
  mapContainer: {
    height: 190,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  rideTypeRow: { marginBottom: 12 },
  rideTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
  },
  rideTypeChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  rideTypeText: { color: "#94A3B8", fontSize: 12, fontWeight: "700" },
  rideTypeTextActive: { color: NAVY },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  locLabel: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  locValue: { color: "#F8FAFC", fontSize: 13, fontWeight: "600", marginTop: 2 },
  locDivider: { height: 1, backgroundColor: BORDER, marginVertical: 8 },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10,
  },
  tierCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    gap: 12,
  },
  tierCardActive: {
    borderColor: EMERALD,
    backgroundColor: "rgba(16, 185, 129, 0.08)",
  },
  tierIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
  },
  tierTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tierName: { color: "#F8FAFC", fontSize: 14, fontWeight: "800" },
  tierSeats: { color: "#94A3B8", fontSize: 11 },
  tierTagline: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  tierFare: { color: EMERALD, fontSize: 15, fontWeight: "900" },
  promoSaved: { color: GOLD, fontSize: 10, fontWeight: "700", marginTop: 2 },
  fieldLabel: { color: "#94A3B8", fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: NAVY,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    color: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    marginBottom: 10,
  },
  promoRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  applyPromoBtn: {
    backgroundColor: GOLD,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: "center",
  },
  applyPromoText: { color: NAVY, fontSize: 12, fontWeight: "800" },
  weatherGuardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  wgTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "700" },
  wgSub: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
  paymentRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  paymentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: BORDER,
  },
  paymentChipActive: { backgroundColor: EMERALD, borderColor: EMERALD },
  paymentText: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  paymentTextActive: { color: "#FFFFFF" },
  bookBtn: {
    backgroundColor: EMERALD,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  bookBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  emptyCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "700", marginTop: 10 },
  emptySub: { color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 4 },
  historyCard: {
    backgroundColor: SURFACE,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  historyTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  historyRef: { color: GOLD, fontSize: 12, fontWeight: "800" },
  historyFare: { color: EMERALD, fontSize: 14, fontWeight: "800" },
  historyRoute: { color: "#CBD5E1", fontSize: 12, marginBottom: 2 },
  historyFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  historyStatus: { color: "#94A3B8", fontSize: 11, fontWeight: "700" },
  historyDate: { color: "#64748B", fontSize: 11 },
  modalContainer: { flex: 1, backgroundColor: NAVY },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modalTitle: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE,
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  searchInput: { flex: 1, color: "#F8FAFC", paddingVertical: 11, fontSize: 13 },
  groupHeading: {
    color: GOLD,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  resultTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "600" },
  resultMeta: { color: "#94A3B8", fontSize: 11, marginTop: 2 },
});
