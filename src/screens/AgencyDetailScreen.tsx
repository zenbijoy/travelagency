import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../hooks/useAuth";
import {
  agencyService,
  type Agency,
  type AgencyPackage,
  type AgencyReview,
} from "../services/agencyService";
import { formatSourcePrice } from "../utils/currency";
import { AgencyVerifiedBadge } from "../components/AgencyVerifiedBadge";
import { BRAND } from "../constants/brand";

interface AgencyDetailScreenProps {
  agencyId?: string;
}

export function AgencyDetailScreen({ agencyId: propId }: AgencyDetailScreenProps) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const resolvedId = propId || params.id || "";

  const [agency, setAgency] = useState<Agency | null>(null);
  const [packages, setPackages] = useState<AgencyPackage[]>([]);
  const [reviews, setReviews] = useState<AgencyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFollowing, setIsFollowing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"packages" | "reviews" | "about">("packages");

  // Enquiry modal state
  const [showEnquiryModal, setShowEnquiryModal] = useState(false);
  const [enqName, setEnqName] = useState(user?.user_metadata?.full_name || "");
  const [enqEmail, setEnqEmail] = useState(user?.email || "");
  const [enqPhone, setEnqPhone] = useState("");
  const [enqMessage, setEnqMessage] = useState("");
  const [selectedPkgId, setSelectedPkgId] = useState<string | undefined>(undefined);
  const [submittingEnq, setSubmittingEnq] = useState(false);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [revRating, setRevRating] = useState(5);
  const [revTitle, setRevTitle] = useState("");
  const [revBody, setRevBody] = useState("");
  const [submittingRev, setSubmittingRev] = useState(false);

  const loadAgencyDetails = useCallback(async () => {
    if (!resolvedId) {
      setError("Agency ID is missing.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ag, pkgs, revs] = await Promise.all([
        agencyService.getAgency(resolvedId),
        agencyService.getAgencyPackages(resolvedId).catch(() => []),
        agencyService.getAgencyReviews(resolvedId).catch(() => []),
      ]);
      if (!ag) {
        setError("Partner agency not found.");
      } else {
        setAgency(ag);
        setPackages(pkgs);
        setReviews(revs);
      }
      if (user?.id && ag) {
        const [f, s] = await Promise.all([
          agencyService.isFollowing(ag.id, user.id).catch(() => false),
          agencyService.isSaved(ag.id, user.id).catch(() => false),
        ]);
        setIsFollowing(f);
        setIsSaved(s);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load agency profile.");
    } finally {
      setLoading(false);
    }
  }, [resolvedId, user?.id]);

  useEffect(() => {
    loadAgencyDetails();
  }, [loadAgencyDetails]);

  const handleToggleFollow = async () => {
    if (!agency) return;
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to follow this agency.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login" as any) },
      ]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isFollowing;
    setIsFollowing(next);
    setAgency((prev) =>
      prev
        ? {
            ...prev,
            followers_count: Math.max(0, prev.followers_count + (next ? 1 : -1)),
          }
        : prev
    );
    try {
      if (next) await agencyService.followAgency(agency.id, user.id);
      else await agencyService.unfollowAgency(agency.id, user.id);
    } catch {
      setIsFollowing(!next);
    }
  };

  const handleToggleSave = async () => {
    if (!agency) return;
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to save this agency.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login" as any) },
      ]);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isSaved;
    setIsSaved(next);
    try {
      if (next) await agencyService.saveAgency(agency.id, user.id);
      else await agencyService.unsaveAgency(agency.id, user.id);
    } catch {
      setIsSaved(!next);
    }
  };

  const handleShare = async () => {
    if (!agency) return;
    try {
      await Share.share({
        message: `Check out ${agency.name} on ${BRAND.name.en}: ${BRAND.contact.website}/agencies/${agency.slug}`,
      });
    } catch {}
  };

  const handleCallAgency = () => {
    if (!agency) return;
    if (agency.phone) {
      Linking.openURL(`tel:${agency.phone.replace(/[^\d+]/g, "")}`).catch(() => {
        router.push({
          pathname: "/screens/call" as any,
          params: {
            callType: "audio",
            targetUserId: agency.id,
            targetName: agency.name,
            targetAvatar: agency.logo_url || "",
          },
        });
      });
    } else {
      router.push({
        pathname: "/screens/call" as any,
        params: {
          callType: "audio",
          targetUserId: agency.id,
          targetName: agency.name,
          targetAvatar: agency.logo_url || "",
        },
      });
    }
  };

  const handleSubmitEnquiry = async () => {
    if (!agency) return;
    if (!enqName.trim() || !enqEmail.trim() || !enqMessage.trim()) {
      Alert.alert("Missing Information", "Please enter your name, email, and message.");
      return;
    }
    setSubmittingEnq(true);
    try {
      await agencyService.sendEnquiry(agency.id, {
        name: enqName.trim(),
        email: enqEmail.trim(),
        phone: enqPhone.trim() || undefined,
        message: enqMessage.trim(),
        packageId: selectedPkgId,
        userId: user?.id,
      });
      setShowEnquiryModal(false);
      setEnqMessage("");
      setSelectedPkgId(undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Enquiry Sent",
        `${agency.name} received your message and usually replies within ${agency.response_time_hours || 2} hours.`
      );
    } catch (e: any) {
      Alert.alert("Could Not Send", e?.message || "Please try again.");
    } finally {
      setSubmittingEnq(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!agency) return;
    if (!user?.id) {
      Alert.alert("Sign In Required", "Please sign in to submit a review.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push("/(auth)/login" as any) },
      ]);
      return;
    }
    if (!revBody.trim()) {
      Alert.alert("Write a Review", "Please share a brief note about your experience.");
      return;
    }
    setSubmittingRev(true);
    try {
      const created = await agencyService.submitReview(agency.id, user.id, {
        rating: revRating,
        title: revTitle.trim() || undefined,
        body: revBody.trim(),
      });
      setReviews((prev) => [created, ...prev]);
      setShowReviewModal(false);
      setRevTitle("");
      setRevBody("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Review Failed", e?.message || "Could not submit review.");
    } finally {
      setSubmittingRev(false);
    }
  };

  const handleBookPackage = (pkg: AgencyPackage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/screens/payments" as any,
      params: {
        amount: String(pkg.price),
        currency: pkg.currency || "USD",
        title: pkg.name,
        subtitle: `${agency?.name || "Partner Agency"} • ${pkg.duration_days} Days`,
        bookingType: "package",
        itemId: pkg.id,
      },
    });
  };

  const accent = colors.primary;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.circleBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
            {params.name || "Partner Agency"}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !agency) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.circleBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.topBarTitle, { color: colors.text }]}>Partner Agency</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="business-outline" size={48} color={colors.textSecondary} />
          <Text style={[styles.errorTitle, { color: colors.text }]}>
            {error || "Agency unavailable"}
          </Text>
          <Pressable
            onPress={loadAgencyDetails}
            style={[styles.retryBtn, { backgroundColor: accent }]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Sticky Header */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: colors.card, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()} style={styles.circleBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
          {agency.name}
        </Text>
        <View style={styles.headerRight}>
          <Pressable onPress={handleShare} style={styles.circleBtn} hitSlop={8}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={handleToggleSave} style={styles.circleBtn} hitSlop={8}>
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={20}
              color={isSaved ? accent : colors.text}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Cover */}
        <View style={styles.coverBox}>
          {agency.cover_url ? (
            <Image source={{ uri: agency.cover_url }} style={styles.coverImg} />
          ) : (
            <View style={[styles.coverImg, { backgroundColor: isDark ? "#1E293B" : "#E2E8F0" }]} />
          )}
        </View>

        {/* Hero Summary Card */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.logoRow}>
            {agency.logo_url ? (
              <Image
                source={{ uri: agency.logo_url }}
                style={[styles.logoImg, { borderColor: colors.card }]}
              />
            ) : (
              <View style={[styles.logoFallback, { borderColor: colors.card, backgroundColor: accent }]}>
                <Text style={styles.logoLetter}>{agency.name[0]}</Text>
              </View>
            )}

            <Pressable
              onPress={handleToggleFollow}
              style={[
                styles.followBtn,
                isFollowing
                  ? { backgroundColor: isDark ? "#1E293B" : "#EFF6FF", borderWidth: 1, borderColor: accent }
                  : { backgroundColor: accent },
              ]}
            >
              <Ionicons
                name={isFollowing ? "checkmark" : "add"}
                size={16}
                color={isFollowing ? accent : "#fff"}
              />
              <Text style={[styles.followBtnText, { color: isFollowing ? accent : "#fff" }]}>
                {isFollowing ? "Following" : "Follow"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.titleRow}>
            <Text style={[styles.agencyTitle, { color: colors.text }]}>{agency.name}</Text>
            {agency.verified && <AgencyVerifiedBadge isVerified size="small" />}
          </View>

          {(agency.city || agency.country) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.locationText, { color: colors.textSecondary }]}>
                {[agency.address, agency.city, agency.country].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}

          {/* Key Stats */}
          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.text }]}>
                ★ {agency.avg_rating.toFixed(1)}
              </Text>
              <Text style={[styles.statLbl, { color: colors.textSecondary }]}>
                {agency.total_reviews} Reviews
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.text }]}>{packages.length}</Text>
              <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Packages</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.text }]}>{agency.followers_count}</Text>
              <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Followers</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: colors.text }]}>
                {agency.response_time_hours ? `${agency.response_time_hours}h` : "< 2h"}
              </Text>
              <Text style={[styles.statLbl, { color: colors.textSecondary }]}>Response</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => router.push("/screens/agency-chat" as any)}
              style={[styles.actionBtn, { backgroundColor: accent }]}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={17} color="#fff" />
              <Text style={styles.actionBtnWhite}>Live Chat</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSelectedPkgId(undefined);
                setShowEnquiryModal(true);
              }}
              style={[styles.actionBtn, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}
            >
              <Ionicons name="mail-outline" size={17} color={colors.text} />
              <Text style={[styles.actionBtnDark, { color: colors.text }]}>Send Enquiry</Text>
            </Pressable>
            <Pressable
              onPress={handleCallAgency}
              style={[styles.callSquareBtn, { backgroundColor: isDark ? "#1E293B" : "#EFF6FF" }]}
            >
              <Ionicons name="call" size={18} color={accent} />
            </Pressable>
          </View>
        </View>

        {/* Segment Tabs */}
        <View style={[styles.segmentRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(
            [
              { id: "packages", label: `Packages (${packages.length})` },
              { id: "reviews", label: `Reviews (${reviews.length})` },
              { id: "about", label: "About" },
            ] as const
          ).map((t) => {
            const active = activeTab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setActiveTab(t.id)}
                style={[
                  styles.segmentBtn,
                  active && { backgroundColor: isDark ? "rgba(56,189,248,0.18)" : "#EFF6FF" },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? accent : colors.textSecondary },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Packages Tab */}
        {activeTab === "packages" && (
          <View style={styles.sectionPad}>
            {packages.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="briefcase-outline" size={34} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Packages Yet</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Send an enquiry to request a custom trip quote from {agency.name}.
                </Text>
              </View>
            ) : (
              packages.map((pkg) => (
                <View
                  key={pkg.id}
                  style={[styles.pkgCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  {pkg.cover_image && (
                    <Image source={{ uri: pkg.cover_image }} style={styles.pkgImg} />
                  )}
                  <View style={styles.pkgBody}>
                    <View style={styles.pkgTopRow}>
                      <Text style={[styles.pkgDest, { color: accent }]}>
                        {pkg.destination} • {pkg.duration_days} Days
                      </Text>
                      <Text style={[styles.pkgSeats, { color: colors.textSecondary }]}>
                        {pkg.availability_seats} seats left
                      </Text>
                    </View>
                    <Text style={[styles.pkgTitle, { color: colors.text }]}>{pkg.name}</Text>
                    {!!pkg.summary && (
                      <Text
                        style={[styles.pkgSummary, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {pkg.summary}
                      </Text>
                    )}
                    <View style={styles.pkgFooter}>
                      <View>
                        <Text style={[styles.pkgPrice, { color: colors.text }]}>
                          {formatSourcePrice(pkg.price, pkg.currency || "USD")}
                        </Text>
                        <Text style={[styles.pkgPer, { color: colors.textSecondary }]}>
                          per traveler
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => {
                            setSelectedPkgId(pkg.id);
                            setEnqMessage(`Hi, I would like details about "${pkg.name}".`);
                            setShowEnquiryModal(true);
                          }}
                          style={[
                            styles.enqSmallBtn,
                            { borderColor: colors.border },
                          ]}
                        >
                          <Text style={[styles.enqSmallText, { color: colors.text }]}>Enquire</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleBookPackage(pkg)}
                          style={[styles.bookPkgBtn, { backgroundColor: accent }]}
                        >
                          <Text style={styles.bookPkgText}>Book Now</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Reviews Tab */}
        {activeTab === "reviews" && (
          <View style={styles.sectionPad}>
            <Pressable
              onPress={() => setShowReviewModal(true)}
              style={[styles.writeRevBtn, { backgroundColor: accent }]}
            >
              <Ionicons name="star-outline" size={16} color="#fff" />
              <Text style={styles.writeRevText}>Write a Review</Text>
            </Pressable>

            {reviews.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="chatbox-outline" size={34} color={colors.textSecondary} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Reviews Yet</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  Be the first traveler to review {agency.name}.
                </Text>
              </View>
            ) : (
              reviews.map((rev) => (
                <View
                  key={rev.id}
                  style={[styles.revCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.revHeader}>
                    <Text style={[styles.revAuthor, { color: colors.text }]}>
                      {rev.author?.display_name || "Verified Traveler"}
                    </Text>
                    <Text style={styles.revStars}>{"★".repeat(Math.round(rev.rating))}</Text>
                  </View>
                  {!!rev.title && (
                    <Text style={[styles.revTitle, { color: colors.text }]}>{rev.title}</Text>
                  )}
                  <Text style={[styles.revBody, { color: colors.textSecondary }]}>{rev.body}</Text>
                  <View style={styles.revFooter}>
                    <Text style={[styles.revDate, { color: colors.textSecondary }]}>
                      {new Date(rev.created_at).toLocaleDateString()}
                    </Text>
                    <Pressable
                      onPress={() => agencyService.markReviewHelpful(rev.id).catch(() => {})}
                      style={styles.helpfulBtn}
                    >
                      <Ionicons name="thumbs-up-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.helpfulText, { color: colors.textSecondary }]}>
                        Helpful ({rev.helpful_count})
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* About Tab */}
        {activeTab === "about" && (
          <View style={styles.sectionPad}>
            <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.aboutTitle, { color: colors.text }]}>About {agency.name}</Text>
              <Text style={[styles.aboutDesc, { color: colors.textSecondary }]}>
                {agency.description || "Verified travel partner offering curated domestic and international packages."}
              </Text>
              {!!agency.trade_license && (
                <Text style={[styles.metaItem, { color: colors.textSecondary }]}>
                  Trade License: {agency.trade_license}
                </Text>
              )}
              {!!agency.established_year && (
                <Text style={[styles.metaItem, { color: colors.textSecondary }]}>
                  Established: {agency.established_year}
                </Text>
              )}
              {!!agency.phone && (
                <Pressable onPress={handleCallAgency}>
                  <Text style={[styles.metaLink, { color: accent }]}>Phone: {agency.phone}</Text>
                </Pressable>
              )}
              {!!agency.email && (
                <Pressable onPress={() => Linking.openURL(`mailto:${agency.email}`).catch(() => {})}>
                  <Text style={[styles.metaLink, { color: accent }]}>Email: {agency.email}</Text>
                </Pressable>
              )}
              {!!agency.website && (
                <Pressable onPress={() => Linking.openURL(agency.website!).catch(() => {})}>
                  <Text style={[styles.metaLink, { color: accent }]}>Website: {agency.website}</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Enquiry Modal */}
      <Modal
        visible={showEnquiryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEnquiryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Enquire {agency.name}
              </Text>
              <Pressable onPress={() => setShowEnquiryModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Your full name"
              placeholderTextColor={colors.textSecondary}
              value={enqName}
              onChangeText={setEnqName}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Email address"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={enqEmail}
              onChangeText={setEnqEmail}
            />
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Phone number (optional)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              value={enqPhone}
              onChangeText={setEnqPhone}
            />
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Tell us your travel dates, travelers, and questions..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={enqMessage}
              onChangeText={setEnqMessage}
            />
            <Pressable
              onPress={handleSubmitEnquiry}
              disabled={submittingEnq}
              style={[styles.modalSubmitBtn, { backgroundColor: accent, opacity: submittingEnq ? 0.6 : 1 }]}
            >
              {submittingEnq ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Send Enquiry</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReviewModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Rate {agency.name}</Text>
              <Pressable onPress={() => setShowReviewModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.starsPicker}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setRevRating(s)}>
                  <Ionicons
                    name={s <= revRating ? "star" : "star-outline"}
                    size={28}
                    color="#F59E0B"
                  />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Review headline (optional)"
              placeholderTextColor={colors.textSecondary}
              value={revTitle}
              onChangeText={setRevTitle}
            />
            <TextInput
              style={[
                styles.input,
                styles.textArea,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Share your experience..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={revBody}
              onChangeText={setRevBody}
            />
            <Pressable
              onPress={handleSubmitReview}
              disabled={submittingRev}
              style={[styles.modalSubmitBtn, { backgroundColor: accent, opacity: submittingRev ? 0.6 : 1 }]}
            >
              {submittingRev ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalSubmitText}>Submit Review</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    marginHorizontal: 8,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  errorTitle: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "700" },
  scrollContent: { paddingBottom: 40 },
  coverBox: { width: "100%", height: 150 },
  coverImg: { width: "100%", height: "100%" },
  heroCard: {
    marginHorizontal: 16,
    marginTop: -28,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  logoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: -44,
    marginBottom: 12,
  },
  logoImg: { width: 68, height: 68, borderRadius: 16, borderWidth: 3 },
  logoFallback: {
    width: 68,
    height: 68,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { color: "#fff", fontSize: 26, fontWeight: "800" },
  followBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  followBtnText: { fontSize: 13, fontWeight: "700" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  agencyTitle: { fontSize: 20, fontWeight: "800" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  locationText: { fontSize: 13, flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
  },
  statBox: { alignItems: "center" },
  statVal: { fontSize: 15, fontWeight: "800" },
  statLbl: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 26 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  actionBtnWhite: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actionBtnDark: { fontSize: 13, fontWeight: "700" },
  callSquareBtn: {
    width: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  segmentText: { fontSize: 12, fontWeight: "700" },
  sectionPad: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  pkgCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  pkgImg: { width: "100%", height: 150 },
  pkgBody: { padding: 14, gap: 6 },
  pkgTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pkgDest: { fontSize: 12, fontWeight: "700" },
  pkgSeats: { fontSize: 11, fontWeight: "600" },
  pkgTitle: { fontSize: 16, fontWeight: "700" },
  pkgSummary: { fontSize: 13, lineHeight: 18 },
  pkgFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  pkgPrice: { fontSize: 17, fontWeight: "800" },
  pkgPer: { fontSize: 11 },
  enqSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
  },
  enqSmallText: { fontSize: 12, fontWeight: "700" },
  bookPkgBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9 },
  bookPkgText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  writeRevBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  writeRevText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  revCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  revHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  revAuthor: { fontSize: 14, fontWeight: "700" },
  revStars: { color: "#F59E0B", fontSize: 13 },
  revTitle: { fontSize: 14, fontWeight: "700" },
  revBody: { fontSize: 13, lineHeight: 19 },
  revFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  revDate: { fontSize: 11 },
  helpfulBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  helpfulText: { fontSize: 11, fontWeight: "600" },
  aboutCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  aboutTitle: { fontSize: 16, fontWeight: "700" },
  aboutDesc: { fontSize: 13, lineHeight: 20 },
  metaItem: { fontSize: 13 },
  metaLink: { fontSize: 13, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  starsPicker: { flexDirection: "row", gap: 10, justifyContent: "center", paddingVertical: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  modalSubmitBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  modalSubmitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
