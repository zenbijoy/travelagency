import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { z } from "zod";

import { TourGuide, GuideBookingRequest } from "../types/tourGuide";
import { tourGuideService } from "../services/tourGuideService";
import { RTLIcon } from "../components/ui";
import { SonarRadarView, RadarNode } from "../components/common/SonarRadarView";


const PRIMARY_BLUE = "#0055F2";
const DARK_NAVY = "#0F172A";
const ACCENT_GOLD = "#F59E0B";
const SUCCESS_GREEN = "#10B981";
const DANGER_RED = "#EF4444";
const BORDER_COLOR = "#E2E8F0";

// Supported Regions
export const REGIONS = [
  { id: "All", label: "All Regions", bn: "à¦¸à¦•à¦² à¦…à¦žà§à¦šà¦²" },
  { id: "Sylhet", label: "Sylhet", bn: "à¦¸à¦¿à¦²à§‡à¦Ÿ" },
  { id: "Cox's Bazar", label: "Cox's Bazar", bn: "à¦•à¦•à§à¦¸à¦¬à¦¾à¦œà¦¾à¦°" },
  { id: "Sundarbans", label: "Sundarbans", bn: "à¦¸à§à¦¨à§à¦¦à¦°à¦¬à¦¨" },
  { id: "Dhaka Heritage", label: "Dhaka Heritage", bn: "à¦¢à¦¾à¦•à¦¾ à¦¹à§‡à¦°à¦¿à¦Ÿà§‡à¦œ" },
] as const;

// Supported Tour Types / Specializations
export const TOUR_TYPES = [
  { id: "All", label: "All Types", icon: "compass-outline" },
  { id: "Historical", label: "Historical", icon: "library-outline" },
  { id: "Wildlife", label: "Wildlife", icon: "leaf-outline" },
  { id: "Culinary", label: "Culinary", icon: "restaurant-outline" },
  { id: "Photography", label: "Photography", icon: "camera-outline" },
] as const;

// Spoken Languages Filter
export const LANGUAGE_OPTIONS = [
  { id: "All", label: "All Languages", flag: "ðŸŒ" },
  { id: "Bengali", label: "Bengali (à¦¬à¦¾à¦‚à¦²à¦¾)", flag: "ðŸ‡§ðŸ‡©" },
  { id: "English", label: "English", flag: "ðŸ‡¬ðŸ‡§" },
  { id: "Chinese", label: "Chinese (ä¸­æ–‡)", flag: "ðŸ‡¨ðŸ‡³" },
  { id: "Arabic", label: "Arabic (Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©)", flag: "ðŸ‡¸ðŸ‡¦" },
  { id: "French", label: "French (FranÃ§ais)", flag: "ðŸ‡«ðŸ‡·" },
] as const;

// Spoken Language Proficiency
export interface LanguageProficiency {
  language: string;
  level: "Native" | "Fluent" | "Professional" | "Conversational" | "Basic";
  flag: string;
}

// Sample Reviews
export interface GuideReviewItem {
  id: string;
  reviewerName: string;
  rating: number;
  date: string;
  comment: string;
  tourType: string;
}

// Certified Guide Profile
export interface CertifiedGuideProfile extends TourGuide {
  licenseNumber: string;
  licenseIssuer: string;
  certifiedSince: number;
  spokenLanguagesProficiency: LanguageProficiency[];
  primarySpecializations: ("Historical" | "Wildlife" | "Culinary" | "Photography")[];
  hourlyRateCalculated: number;
  availableTimeSlots: string[];
  recommendedMeetingPoints: string[];
  sampleReviews: GuideReviewItem[];
}

// Pre-defined Curated Meeting Points by Region
export const REGIONAL_MEETING_POINTS: Record<string, string[]> = {
  "Cox's Bazar": [
    "Kolatoli Beach Point (Main Circle)",
    "Hotel Sea Gull / Ocean Paradise Lobby",
    "Laboni Beach Main Entrance Gate",
    "Inani Coral Beach Parking Point",
    "Marine Drive Starting Point",
  ],
  Sylhet: [
    "Sylhet Railway Station Main Gate",
    "Zindabazar Point (City Center)",
    "Rose View Hotel / Grand Sylhet Lobby",
    "Sreemangal Tea Garden Central Gate",
    "Ratargul Swamp Boat Ghat Landing Point",
  ],
  Sundarbans: [
    "Mongla Port Jetty No. 1",
    "Khulna BIWTA Launch Ghat",
    "Karamjal Eco Park Entrance Gate",
    "Bagerhat Central Bus Terminal",
    "Hiron Point Forest Station",
  ],
  "Dhaka Heritage": [
    "Lalbagh Fort Ticket Counter",
    "Ahsan Manzil (Pink Palace) Front Gate",
    "Shankhari Bazar Heritage Crossing",
    "Beauty Boarding Historical Gate",
    "Sadarghat River Launch Terminal",
  ],
  Default: [
    "Central Railway Station Main Gate",
    "City Center Landmark Point",
    "Tourist Information Center",
    "Hotel Lobby Entrance",
  ],
};

// Zod Validation Schema for Instant Hire Booking
export const bookingValidationSchema = z.object({
  touristName: z
    .string()
    .trim()
    .min(2, "à¦¦à§Ÿà¦¾ à¦•à¦°à§‡ à¦ªà§‚à¦°à§à¦£ à¦¨à¦¾à¦® à¦²à¦¿à¦–à§à¦¨ (à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§¨ à¦…à¦•à§à¦·à¦°)")
    .max(60, "à¦¨à¦¾à¦® à§¬à§¦ à¦…à¦•à§à¦·à¦°à§‡à¦° à¦¬à§‡à¦¶à¦¿ à¦—à§à¦°à¦¹à¦£à¦¯à§‹à¦—à§à¦¯ à¦¨à§Ÿ"),
  touristPhone: z
    .string()
    .trim()
    .min(10, "à¦®à§‹à¦¬à¦¾à¦‡à¦² à¦¨à¦®à§à¦¬à¦° à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§§à§¦ à¦¡à¦¿à¦œà¦¿à¦Ÿ à¦¹à¦¤à§‡ à¦¹à¦¬à§‡")
    .regex(
      /^(?:\+?88)?01[3-9]\d{8}$/,
      "à¦¸à¦ à¦¿à¦• à¦¬à¦¾à¦‚à¦²à¦¾à¦¦à§‡à¦¶à§€ à¦®à§‹à¦¬à¦¾à¦‡à¦² à¦¨à¦®à§à¦¬à¦° à¦¦à¦¿à¦¨ (à¦¯à§‡à¦®à¦¨: 01712345678)"
    ),
  touristEmail: z
    .string()
    .trim()
    .email("à¦¸à¦ à¦¿à¦• à¦‡à¦®à§‡à¦‡à¦² à¦à¦¡à§à¦°à§‡à¦¸ à¦²à¦¿à¦–à§à¦¨")
    .optional()
    .or(z.literal("")),
  rateType: z.enum(["hourly", "daily"]),
  tourDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "à¦¤à¦¾à¦°à¦¿à¦– à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨ (YYYY-MM-DD)")
    .refine((val) => {
      const selected = new Date(val);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !isNaN(selected.getTime()) && selected >= today;
    }, "à¦…à¦¤à§€à¦¤à§‡à¦° à¦•à§‹à¦¨à§‹ à¦¤à¦¾à¦°à¦¿à¦– à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à¦¬à§‡ à¦¨à¦¾"),
  timeSlot: z.string().optional(),
  duration: z
    .number({ message: "à¦¸à¦®à§Ÿà¦•à¦¾à¦² à¦¬à¦¾ à¦¦à¦¿à¦¨ à¦¸à¦‚à¦–à§à¦¯à¦¾ à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦£ à¦•à¦°à§à¦¨" })
    .int()
    .min(1, "à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§§ à¦¦à¦¿à¦¨ à¦¬à¦¾ à§§ à¦˜à¦¨à§à¦Ÿà¦¾ à¦¹à¦¤à§‡ à¦¹à¦¬à§‡")
    .max(30, "à¦¸à¦°à§à¦¬à§‹à¦šà§à¦š à§©à§¦ à¦ªà¦°à§à¦¯à¦¨à§à¦¤ à¦¹à¦¤à§‡ à¦ªà¦¾à¦°à§‡"),
  guestsCount: z
    .number({ message: "à¦­à§à¦°à¦®à¦£à¦•à¦¾à¦°à§€ à¦¸à¦‚à¦–à§à¦¯à¦¾ à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦£ à¦•à¦°à§à¦¨" })
    .int()
    .min(1, "à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§§ à¦œà¦¨ à¦­à§à¦°à¦®à¦£à¦•à¦¾à¦°à§€ à¦¹à¦¤à§‡ à¦¹à¦¬à§‡")
    .max(30, "à¦¸à¦°à§à¦¬à§‹à¦šà§à¦š à§©à§¦ à¦œà¦¨ à¦­à§à¦°à¦®à¦£à¦•à¦¾à¦°à§€ à¦—à§à¦°à¦¹à¦£à¦¯à§‹à¦—à§à¦¯"),
  meetingPoint: z
    .string()
    .trim()
    .min(3, "à¦®à¦¿à¦Ÿà¦¿à¦‚ à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ à¦¬à¦¾ à¦ªà¦¿à¦•à¦†à¦ª à¦²à§‹à¦•à§‡à¦¶à¦¨ à¦²à¦¿à¦–à§à¦¨ (à¦•à¦®à¦ªà¦•à§à¦·à§‡ à§© à¦…à¦•à§à¦·à¦°)"),
  specialRequests: z.string().trim().optional(),
});

export type BookingFormData = z.infer<typeof bookingValidationSchema>;

// Enrich base guide profiles with certified badges, 5 required languages, and specializations
const getRelativeMonthYear = (monthsAgo: number = 0): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

function enrichGuideProfile(guide: TourGuide): CertifiedGuideProfile {
  const guideId = guide.id;
  const hourly =
    guide.hourly_rate && guide.hourly_rate > 0
      ? guide.hourly_rate
      : Math.round(guide.daily_rate / 6);

  const areaLower = guide.primary_area.toLowerCase();
  let matchedRegion = "Sylhet";
  if (areaLower.includes("cox") || areaLower.includes("inani")) {
    matchedRegion = "Cox's Bazar";
  } else if (areaLower.includes("sundarban") || areaLower.includes("mongla")) {
    matchedRegion = "Sundarbans";
  } else if (
    areaLower.includes("dhaka") ||
    areaLower.includes("lalbagh") ||
    areaLower.includes("ahsan")
  ) {
    matchedRegion = "Dhaka Heritage";
  } else if (areaLower.includes("sylhet") || areaLower.includes("sreemangal")) {
    matchedRegion = "Sylhet";
  } else {
    matchedRegion = guide.primary_area;
  }

  let licenseNumber = `BPC-TG-2024-0${guideId.slice(-2) || "42"}`;
  let licenseIssuer = "Bangladesh Parjatan Corporation (BPC)";
  let certifiedSince = new Date().getFullYear() - guide.experience_years;

  let spokenLanguagesProficiency: LanguageProficiency[] = [
    { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
    { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
  ];

  let primarySpecializations: ("Historical" | "Wildlife" | "Culinary" | "Photography")[] = [];

  let sampleReviews: GuideReviewItem[] = [
    {
      id: "rev-1",
      reviewerName: "Farhan Kabir",
      rating: 5,
      date: getRelativeMonthYear(0),
      comment: "à¦…à¦¸à¦¾à¦§à¦¾à¦°à¦£ à¦—à¦¾à¦‡à¦¡! à¦¸à§à¦¨à§à¦¦à¦° à¦à¦¬à¦‚ à¦¨à¦¿à¦°à¦¾à¦ªà¦¦à¦­à¦¾à¦¬à§‡ à¦ªà§à¦°à§‹ à¦à¦²à¦¾à¦•à¦¾ à¦˜à§à¦°à§‡ à¦¦à§‡à¦–à¦¿à§Ÿà§‡à¦›à§‡à¦¨à¥¤",
      tourType: "Scenic Explorer",
    },
    {
      id: "rev-2",
      reviewerName: "Sarah Jenkins",
      rating: 5,
      date: getRelativeMonthYear(1),
      comment: "Super professional! Fluent English and deep local knowledge.",
      tourType: "Historical & Cultural",
    },
  ];

  // Specific enrichment for initial guides ensuring all 5 languages (Bengali, English, Chinese, Arabic, French) are active
  if (guideId === "guide-1" || areaLower.includes("cox")) {
    licenseIssuer = "Govt. Tourism Board & Coast Guard Safety";
    licenseNumber = "BPC-TG-COX-8821";
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "Arabic", level: "Conversational", flag: "ðŸ‡¸ðŸ‡¦" },
    ];
    primarySpecializations = ["Photography", "Culinary", "Historical"];
    sampleReviews = [
      {
        id: "rev-c1",
        reviewerName: "Dr. Asif Mahmud",
        rating: 5,
        date: getRelativeMonthYear(0),
        comment: "à¦‡à¦¨à¦¾à¦¨à§€ à¦“ à¦¸à§‡à¦¨à§à¦Ÿà¦®à¦¾à¦°à§à¦Ÿà¦¿à¦¨à§‡à¦° à¦¸à§‡à¦°à¦¾ à¦¸à§à¦ªà¦Ÿà¦—à§à¦²à§‹ à¦“ à¦¸à§à¦¸à§à¦¬à¦¾à¦¦à§ à¦¸à¦¾à¦®à§à¦¦à§à¦°à¦¿à¦• à¦®à¦¾à¦›à§‡à¦° à¦œà¦¾à§Ÿà¦—à¦¾à¦—à§à¦²à§‹ à¦¦à§‡à¦–à¦¿à§Ÿà§‡à¦›à§‡à¦¨à¥¤",
        tourType: "Culinary & Beach",
      },
      {
        id: "rev-c2",
        reviewerName: "Tariq Al-Mansoor",
        rating: 5,
        date: getRelativeMonthYear(1),
        comment: "Excellent guide, speaks good Arabic and made our family tour so pleasant!",
        tourType: "Photography",
      },
    ];
  } else if (guideId === "guide-3" || areaLower.includes("sylhet")) {
    licenseIssuer = "Forest Dept. & Eco-Naturalist Guild";
    licenseNumber = "BPC-TG-SYL-5514";
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "French", level: "Conversational", flag: "ðŸ‡«ðŸ‡·" },
    ];
    primarySpecializations = ["Wildlife", "Photography", "Historical"];
    sampleReviews = [
      {
        id: "rev-s1",
        reviewerName: "Julien Moreau",
        rating: 5,
        date: getRelativeMonthYear(0),
        comment: "Superbe expÃ©rience dans la forÃªt marÃ©cageuse de Ratargul. TrÃ¨s attentif!",
        tourType: "Wildlife",
      },
      {
        id: "rev-s2",
        reviewerName: "Nusrat Jahan",
        rating: 5,
        date: getRelativeMonthYear(1),
        comment: "à¦°à¦¾à¦¤à¦¾à¦°à¦—à§à¦² à¦“ à¦œà¦¾à¦«à¦²à¦‚-à¦ à¦«à¦Ÿà§‹à¦—à§à¦°à¦¾à¦«à¦¿à¦° à¦¸à§‡à¦°à¦¾ à¦à¦™à§à¦—à§‡à¦²à¦—à§à¦²à§‹ à¦–à§à¦¬ à¦¸à§à¦¨à§à¦¦à¦° à¦¦à§‡à¦–à¦¿à§Ÿà§‡à¦›à§‡à¦¨à¥¤",
        tourType: "Photography",
      },
    ];
  } else if (guideId === "guide-4" || areaLower.includes("sundarban")) {
    licenseIssuer = "Bangladesh Forest Dept. Wildlife Authority";
    licenseNumber = "BFD-WL-SUN-3310";
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Professional", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "Chinese", level: "Conversational", flag: "ðŸ‡¨ðŸ‡³" },
    ];
    primarySpecializations = ["Wildlife", "Photography"];
    sampleReviews = [
      {
        id: "rev-w1",
        reviewerName: "Zhang Wei",
        rating: 5,
        date: getRelativeMonthYear(0),
        comment: "éžå¸¸æ£’çš„å‘å¯¼ï¼æˆ‘ä»¬åœ¨çº¢æ ‘æž—çœ‹åˆ°äº†å­ŸåŠ æ‹‰è™Žè¶³è¿¹å’Œçç¨€æ°´é¸Ÿï¼Œå®‰å…¨ä¿éšœéžå¸¸åˆ°ä½ã€‚",
        tourType: "Wildlife Safari",
      },
      {
        id: "rev-w2",
        reviewerName: "Kamrul Hasan",
        rating: 5,
        date: getRelativeMonthYear(1),
        comment: "à¦¸à§à¦¨à§à¦¦à¦°à¦¬à¦¨à§‡à¦° à¦¬à¦¾à¦“à¦¯à¦¼à¦¾à¦²à¦¿ à¦à¦¤à¦¿à¦¹à§à¦¯ à¦à¦¬à¦‚ à¦–à¦¾à¦²à§‡à¦° à¦­à§‡à¦¤à¦° à¦¨à§Œà¦•à¦¾à¦° à¦¯à¦¾à¦¤à§à¦°à¦¾ à¦šà¦¿à¦°à¦¸à§à¦®à¦°à¦£à§€à§Ÿ à¦¹à§Ÿà§‡ à¦¥à¦¾à¦•à¦¬à§‡à¥¤",
        tourType: "Wildlife",
      },
    ];
  } else if (guideId === "guide-5" || areaLower.includes("dhaka")) {
    licenseIssuer = "Ministry of Cultural Heritage & Archaeology";
    licenseNumber = "ARCH-TG-DHK-9941";
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "Arabic", level: "Fluent", flag: "ðŸ‡¸ðŸ‡¦" },
      { language: "French", level: "Conversational", flag: "ðŸ‡«ðŸ‡·" },
    ];
    primarySpecializations = ["Historical", "Culinary", "Photography"];
    sampleReviews = [
      {
        id: "rev-d1",
        reviewerName: "Ahmed Al-Ghamdi",
        rating: 5,
        date: getRelativeMonthYear(0),
        comment: "Ø¬ÙˆÙ„Ø© ØªØ§Ø±ÙŠØ®ÙŠØ© Ù…Ù…ØªØ¹Ø© Ù„Ù„ØºØ§ÙŠØ© ÙÙŠ Ù‚Ù„Ø¹Ø© Ù„Ø§Ù„Ø¨Ø§Øº ÙˆØ®Ø§Ù† Ù…Ø±Ø¬Ø§Ù†. Ù…Ø±Ø´Ø¯Ø© Ù…Ù…ØªØ§Ø²Ø© ÙˆÙ…Ø«Ù‚ÙØ© Ø¬Ø¯Ø§Ù‹.",
        tourType: "Historical",
      },
      {
        id: "rev-d2",
        reviewerName: "Rifat Chowdhury",
        rating: 5,
        date: getRelativeMonthYear(1),
        comment: "à¦ªà§à¦°à¦¾à¦¨ à¦¢à¦¾à¦•à¦¾à¦° à¦¬à¦¾à¦•à¦°à¦–à¦¾à¦¨à¦¿, à¦¬à¦¿à¦°à¦¿à§Ÿà¦¾à¦¨à¦¿ à¦†à¦° à¦à¦¤à¦¿à¦¹à¦¾à¦¸à¦¿à¦• à¦…à¦²à¦¿à¦—à¦²à¦¿à¦° à¦šà¦®à§Žà¦•à¦¾à¦° à¦—à¦²à§à¦ª à¦¶à§à¦¨à§‡ à¦®à§à¦—à§à¦§ à¦¹à§Ÿà§‡à¦›à¦¿à¥¤",
        tourType: "Culinary & Heritage",
      },
    ];
  } else if (guideId === "guide-2") {
    licenseIssuer = "Chittagong Hill Tracts Eco-Guide Council";
    licenseNumber = "CHT-TG-SAJ-7712";
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "Chinese", level: "Professional", flag: "ðŸ‡¨ðŸ‡³" },
    ];
    primarySpecializations = ["Photography", "Historical", "Wildlife"];
  } else {
    spokenLanguagesProficiency = [
      { language: "Bengali", level: "Native", flag: "ðŸ‡§ðŸ‡©" },
      { language: "English", level: "Fluent", flag: "ðŸ‡¬ðŸ‡§" },
      { language: "Chinese", level: "Conversational", flag: "ðŸ‡¨ðŸ‡³" },
    ];
    primarySpecializations = ["Historical", "Photography"];
  }

  const meetingPoints =
    REGIONAL_MEETING_POINTS[matchedRegion] || REGIONAL_MEETING_POINTS.Default;

  return {
    ...guide,
    licenseNumber,
    licenseIssuer,
    certifiedSince,
    spokenLanguagesProficiency,
    primarySpecializations,
    hourlyRateCalculated: hourly,
    availableTimeSlots: ["08:30 AM", "11:00 AM", "02:00 PM", "04:30 PM", "06:00 PM"],
    recommendedMeetingPoints: meetingPoints,
    sampleReviews,
  };
}

export default function TourGuidesScreen() {
  const [guides, setGuides] = useState<CertifiedGuideProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Main View Toggle: "directory" | "my-bookings"
  const [mainTab, setMainTab] = useState<"directory" | "my-bookings">("directory");
  const [myBookings, setMyBookings] = useState<GuideBookingRequest[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Filters
  const [selectedRegion, setSelectedRegion] = useState<string>("All");
  const [selectedTourType, setSelectedTourType] = useState<string>("All");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("All");
  const [sortBy, setSortBy] = useState<"rating" | "experience" | "price_low" | "price_high">("rating");

  // Profile Detail Modal
  const [selectedGuide, setSelectedGuide] = useState<CertifiedGuideProfile | null>(null);

  // Instant Hire Booking Modal State
  const [bookingGuide, setBookingGuide] = useState<CertifiedGuideProfile | null>(null);
  const [rateType, setRateType] = useState<"hourly" | "daily">("daily");
  const [tourDate, setTourDate] = useState<string>(() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split("T")[0];
  });
  const [timeSlot, setTimeSlot] = useState<string>("08:30 AM");
  const [duration, setDuration] = useState<number>(1);
  const [guestsCount, setGuestsCount] = useState<number>(2);
  const [touristName, setTouristName] = useState("");
  const [touristPhone, setTouristPhone] = useState("");
  const [touristEmail, setTouristEmail] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Calendar View State
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "radar">("list");
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);

  // Guide Application / Registration Modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyFullName, setApplyFullName] = useState("");
  const [applyPhone, setApplyPhone] = useState("");
  const [applyEmail, setApplyEmail] = useState("");
  const [applyNid, setApplyNid] = useState("");
  const [applyArea, setApplyArea] = useState("Cox's Bazar");
  const [applyExperience, setApplyExperience] = useState("4");
  const [applyDailyRate, setApplyDailyRate] = useState("1800");
  const [applyHourlyRate, setApplyHourlyRate] = useState("300");
  const [applyLanguages, setApplyLanguages] = useState("Bengali, English, Arabic");
  const [applySpecialty, setApplySpecialty] = useState("Historical, Culinary");
  const [applyBio, setApplyBio] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);

  // Load Guides from tourGuideService
  const loadGuides = useCallback(async () => {
    try {
      setLoading(true);
      const rawData = await tourGuideService.getTourGuides();
      const enriched = rawData.map(enrichGuideProfile);
      setGuides(enriched);
    } catch (e) {
      console.warn("Failed to load guides:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load My Bookings
  const loadMyBookings = useCallback(async () => {
    try {
      setLoadingBookings(true);
      const bookings = await tourGuideService.getMyGuideBookings();
      setMyBookings(bookings || []);
    } catch (err) {
      console.warn("Error loading bookings:", err);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  useEffect(() => {
    loadGuides();
  }, [loadGuides]);

  useEffect(() => {
    if (mainTab === "my-bookings") {
      loadMyBookings();
    }
  }, [mainTab, loadMyBookings]);

  // Client-side filtering & sorting
  const filteredAndSortedGuides = useMemo(() => {
    let result = guides.filter((guide) => {
      // 1. Search Query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = guide.full_name.toLowerCase().includes(q);
        const areaMatch =
          guide.primary_area.toLowerCase().includes(q) ||
          guide.covered_areas.some((a) => a.toLowerCase().includes(q));
        const bioMatch = guide.bio.toLowerCase().includes(q);
        const specMatch =
          guide.specialties.some((s) => s.toLowerCase().includes(q)) ||
          guide.primarySpecializations.some((s) => s.toLowerCase().includes(q));
        const langMatch = guide.spokenLanguagesProficiency.some((l) =>
          l.language.toLowerCase().includes(q)
        );
        const licenseMatch = guide.licenseNumber.toLowerCase().includes(q);

        if (!nameMatch && !areaMatch && !bioMatch && !specMatch && !langMatch && !licenseMatch) {
          return false;
        }
      }

      // 2. Region Filter
      if (selectedRegion !== "All") {
        const areaLower = guide.primary_area.toLowerCase();
        const coveredLower = guide.covered_areas.map((a) => a.toLowerCase());
        const reg = selectedRegion.toLowerCase();

        if (selectedRegion === "Dhaka Heritage") {
          const match =
            areaLower.includes("dhaka") ||
            areaLower.includes("lalbagh") ||
            areaLower.includes("ahsan") ||
            coveredLower.some(
              (c) => c.includes("dhaka") || c.includes("lalbagh") || c.includes("ahsan")
            );
          if (!match) return false;
        } else if (selectedRegion === "Cox's Bazar") {
          const match =
            areaLower.includes("cox") ||
            areaLower.includes("inani") ||
            coveredLower.some((c) => c.includes("cox") || c.includes("inani"));
          if (!match) return false;
        } else if (selectedRegion === "Sylhet") {
          const match =
            areaLower.includes("sylhet") ||
            areaLower.includes("sreemangal") ||
            areaLower.includes("ratargul") ||
            coveredLower.some((c) => c.includes("sylhet") || c.includes("sreemangal") || c.includes("ratargul"));
          if (!match) return false;
        } else if (selectedRegion === "Sundarbans") {
          const match =
            areaLower.includes("sundarban") ||
            areaLower.includes("mongla") ||
            coveredLower.some((c) => c.includes("sundarban") || c.includes("mongla"));
          if (!match) return false;
        } else {
          const match = areaLower.includes(reg) || coveredLower.some((c) => c.includes(reg));
          if (!match) return false;
        }
      }

      // 3. Tour Type / Specialization Filter
      if (selectedTourType !== "All") {
        const specMatch = guide.primarySpecializations.includes(selectedTourType as any);
        const textMatch =
          guide.specialties.some((s) => s.toLowerCase().includes(selectedTourType.toLowerCase())) ||
          guide.bio.toLowerCase().includes(selectedTourType.toLowerCase());

        if (!specMatch && !textMatch) {
          return false;
        }
      }

      // 4. Spoken Language Filter
      if (selectedLanguage !== "All") {
        const langMatch = guide.spokenLanguagesProficiency.some(
          (l) => l.language.toLowerCase() === selectedLanguage.toLowerCase()
        );
        if (!langMatch) return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "rating") {
        return b.rating - a.rating;
      }
      if (sortBy === "experience") {
        return b.experience_years - a.experience_years;
      }
      if (sortBy === "price_low") {
        return a.daily_rate - b.daily_rate;
      }
      if (sortBy === "price_high") {
        return b.daily_rate - a.daily_rate;
      }
      return 0;
    });

    return result;
  }, [guides, searchQuery, selectedRegion, selectedTourType, selectedLanguage, sortBy]);

  // Computed Radar Nodes for Sonar Radar View (Image 1 UX Pattern)
  const radarNodes: RadarNode[] = useMemo(() => {
    return filteredAndSortedGuides.slice(0, 10).map((guide, idx) => {
      const angle = (idx * (360 / Math.min(filteredAndSortedGuides.length || 1, 10))) % 360;
      const radiusFraction = 0.38 + (idx % 3) * 0.24;
      return {
        id: guide.id,
        name: guide.full_name,
        avatar: guide.avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120",
        rating: guide.rating,
        distanceKm: Number(((idx + 1) * 1.8).toFixed(1)),
        specialty: guide.primary_area || "Certified Local Guide",
        angle,
        radiusFraction,
      };
    });
  }, [filteredAndSortedGuides]);

  // Communication Handlers: Pre-booking Chat (AgencyChatScreen)
  const handleOpenChat = (guide: CertifiedGuideProfile | { id: string; full_name: string; avatar_url?: string; phone?: string; primary_area?: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/screens/[slug]" as any,
      params: {
        slug: "agency-chat",
        agencyId: guide.id,
        agencyName: guide.full_name,
        guideAvatar: guide.avatar_url || "",
        guidePhone: guide.phone || "",
        guideArea: guide.primary_area || "",
      },
    });
  };

  // Communication Handlers: Emergency Audio Call (CallScreen)
  const handleStartAudioCall = (guide: CertifiedGuideProfile | { id: string; full_name: string; avatar_url?: string }) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "à¦œà¦°à§à¦°à¦¿ à¦…à¦¡à¦¿à¦“ à¦•à¦¨à¦¸à¦¾à¦²à¦Ÿà§‡à¦¶à¦¨ (Emergency Audio Call)",
      `à¦†à¦ªà¦¨à¦¿ à¦•à¦¿ à¦—à¦¾à¦‡à¦¡ ${guide.full_name}-à¦à¦° à¦¸à¦¾à¦¥à§‡ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦œà¦°à§à¦°à¦¿ à¦…à¦¡à¦¿à¦“ à¦ªà¦°à¦¾à¦®à¦°à§à¦¶ à¦¶à§à¦°à§ à¦•à¦°à¦¤à§‡ à¦šà¦¾à¦¨?`,
      [
        { text: "à¦¬à¦¾à¦¤à¦¿à¦²", style: "cancel" },
        {
          text: "à¦•à¦² à¦¶à§à¦°à§ à¦•à¦°à§à¦¨",
          onPress: () => {
            router.push({
              pathname: "/screens/call" as any,
              params: {
                callType: "audio",
                targetUserId: guide.id,
                targetName: guide.full_name,
                targetAvatar: guide.avatar_url || "",
                callerId: "tourist-client",
                emergencyConsultation: "true",
              },
            });
          },
        },
      ]
    );
  };

  // Open Booking Modal for a specific guide
  const handleOpenBookingModal = (guide: CertifiedGuideProfile) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBookingGuide(guide);
    setRateType("daily");
    setDuration(1);
    setGuestsCount(2);
    setFormErrors({});
    if (guide.recommendedMeetingPoints.length > 0) {
      setMeetingPoint(guide.recommendedMeetingPoints[0]);
    } else {
      setMeetingPoint(`${guide.primary_area} Central Station`);
    }
  };

  // Calculate Active Total Price
  const calculatedTotal = useMemo(() => {
    if (!bookingGuide) return 0;
    if (rateType === "hourly") {
      return bookingGuide.hourlyRateCalculated * duration;
    }
    return bookingGuide.daily_rate * duration;
  }, [bookingGuide, rateType, duration]);

  // Execute Zod Schema Validation & Booking Checkout Handoff
  const handleCheckoutHandoff = async () => {
    if (!bookingGuide) return;
    setFormErrors({});

    // Sanitize phone number removing dashes and spaces
    const cleanPhone = touristPhone.replace(/[\s\-()]/g, "");

    const formDataToValidate = {
      touristName: touristName.trim(),
      touristPhone: cleanPhone,
      touristEmail: touristEmail.trim() || undefined,
      rateType,
      tourDate,
      timeSlot: rateType === "hourly" ? timeSlot : undefined,
      duration,
      guestsCount,
      meetingPoint: meetingPoint.trim(),
      specialRequests: specialRequests.trim() || undefined,
    };

    const validationResult = bookingValidationSchema.safeParse(formDataToValidate);

    if (!validationResult.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errors: Record<string, string> = {};
      validationResult.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      });
      setFormErrors(errors);

      const firstError = validationResult.error.issues[0]?.message || "à¦¤à¦¥à§à¦¯ à¦¯à¦¾à¦šà¦¾à¦‡ à¦•à¦°à§à¦¨";
      Alert.alert("à¦¤à¦¥à§à¦¯ à¦…à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦¬à¦¾ à¦¤à§à¦°à§à¦Ÿà¦¿à¦ªà§‚à¦°à§à¦£", firstError);
      return;
    }

    try {
      setBookingSubmitting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const bookingRecord = await tourGuideService.createGuideBooking({
        guide_id: bookingGuide.id,
        guide_name: bookingGuide.full_name,
        guide_avatar: bookingGuide.avatar_url,
        tourist_name: validationResult.data.touristName,
        tourist_phone: validationResult.data.touristPhone,
        tourist_email: validationResult.data.touristEmail,
        destination: bookingGuide.primary_area,
        tour_date: validationResult.data.tourDate,
        duration_days: validationResult.data.rateType === "daily" ? duration : 1,
        guests_count: validationResult.data.guestsCount,
        daily_rate:
          validationResult.data.rateType === "hourly"
            ? bookingGuide.hourlyRateCalculated
            : bookingGuide.daily_rate,
        meeting_point: validationResult.data.meetingPoint,
        special_requests: validationResult.data.specialRequests,
      });

      const checkoutTitle = `${bookingGuide.full_name} (${
        rateType === "hourly" ? `${duration} Hours Guide Tour` : `${duration} Days Guide Tour`
      })`;

      const timeSlotDisplay =
        rateType === "hourly"
          ? `${tourDate} at ${timeSlot}`
          : `${tourDate} (${duration} Days)`;

      Alert.alert(
        "ðŸŽ‰ à¦¬à§à¦•à¦¿à¦‚ à¦¸à¦«à¦² à¦“ à¦¯à¦¾à¦šà¦¾à¦‡à¦•à§ƒà¦¤!",
        `à¦—à¦¾à¦‡à¦¡: ${bookingGuide.full_name}\nà¦ªà§à¦¯à¦¾à¦•à§‡à¦œ: ${
          rateType === "hourly" ? `${duration} à¦˜à¦¨à§à¦Ÿà¦¾` : `${duration} à¦¦à¦¿à¦¨`
        }\nà¦¤à¦¾à¦°à¦¿à¦–: ${tourDate}\nà¦®à¦¿à¦Ÿà¦¿à¦‚ à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ: ${meetingPoint}\nà¦¸à¦°à§à¦¬à¦®à§‹à¦Ÿ à¦«à¦¿: à§³${calculatedTotal.toLocaleString(
          "en-BD"
        )}\n\nà¦¨à¦¿à¦°à¦¾à¦ªà¦¦ à¦ªà§‡à¦®à§‡à¦¨à§à¦Ÿ à¦•à¦°à¦¤à§‡ à¦…à¦¨à¦²à¦¾à¦‡à¦¨ à¦šà§‡à¦•à¦†à¦‰à¦Ÿ à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨ à¦…à¦¥à¦¬à¦¾ à¦¸à¦¾à¦•à§à¦·à¦¾à¦¤à§‡ à¦ªà§‡à¦®à§‡à¦¨à§à¦Ÿ à¦•à¦°à§à¦¨à¥¤`,
        [
          {
            text: "à¦ªà§‡ à¦…à§à¦¯à¦¾à¦Ÿ à¦®à¦¿à¦Ÿà¦¿à¦‚ (Pay at Meeting)",
            style: "default",
            onPress: () => {
              setBookingGuide(null);
              setTouristName("");
              setTouristPhone("");
              setTouristEmail("");
              setSpecialRequests("");
              loadMyBookings();
              setMainTab("my-bookings");
              Alert.alert(
                "à¦¬à§à¦•à¦¿à¦‚ à¦¸à¦‚à¦°à¦•à§à¦·à¦¿à¦¤ à¦¹à§Ÿà§‡à¦›à§‡!",
                `à¦†à¦ªà¦¨à¦¾à¦° à¦¬à§à¦•à¦¿à¦‚ à¦†à¦‡à¦¡à¦¿: ${bookingRecord.id}à¥¤ à¦—à¦¾à¦‡à¦¡ à¦¸à¦°à¦¾à¦¸à¦°à¦¿ à¦†à¦ªà¦¨à¦¾à¦° à¦¸à¦¾à¦¥à§‡ à¦«à§‹à¦¨à§‡ à¦¯à§‹à¦—à¦¾à¦¯à§‹à¦— à¦•à¦°à¦¬à§‡à¦¨à¥¤`
              );
            },
          },
          {
            text: "à¦…à¦¨à¦²à¦¾à¦‡à¦¨ à¦šà§‡à¦•à¦†à¦‰à¦Ÿ (Instant Pay)",
            style: "default",
            onPress: () => {
              const currentBookingId = bookingRecord.id;
              setBookingGuide(null);
              setTouristName("");
              setTouristPhone("");
              setTouristEmail("");
              setSpecialRequests("");

              // Seamless handoff to payments
              router.push({
                pathname: "/screens/payments" as any,
                params: {
                  amount: String(calculatedTotal),
                  reference: currentBookingId,
                  guideName: bookingGuide.full_name,
                  tourTitle: checkoutTitle,
                  destination: bookingGuide.primary_area,
                  timeSlot: timeSlotDisplay,
                  groupSize: String(guestsCount),
                },
              });
            },
          },
        ]
      );
    } catch {
      Alert.alert("à¦¤à§à¦°à§à¦Ÿà¦¿", "à¦¬à§à¦•à¦¿à¦‚ à¦ªà§à¦°à¦•à§à¦°à¦¿à¦¯à¦¼à¦¾ à¦¸à¦®à§à¦ªà¦¨à§à¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿à¥¤ à¦†à¦¬à¦¾à¦° à¦šà§‡à¦·à§à¦Ÿà¦¾ à¦•à¦°à§à¦¨à¥¤");
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Submit Guide Registration
  const handleApplyGuideSubmit = async () => {
    if (
      !applyFullName.trim() ||
      !applyPhone.trim() ||
      !applyNid.trim() ||
      !applyBio.trim()
    ) {
      Alert.alert(
        "à¦…à¦¸à¦®à§à¦ªà§‚à¦°à§à¦£ à¦¤à¦¥à§à¦¯",
        "à¦¦à§Ÿà¦¾ à¦•à¦°à§‡ à¦¨à¦¾à¦®, à¦®à§‹à¦¬à¦¾à¦‡à¦², à¦à¦¨à¦†à¦‡à¦¡à¦¿ à¦à¦¬à¦‚ à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾ à¦¸à¦®à§à¦ªà¦°à§à¦•à§‡ à¦¬à¦¿à¦¸à§à¦¤à¦¾à¦°à¦¿à¦¤ à¦²à¦¿à¦–à§à¦¨à¥¤"
      );
      return;
    }

    try {
      setApplySubmitting(true);
      const newGuide = await tourGuideService.registerAsTourGuide({
        full_name: applyFullName.trim(),
        phone: applyPhone.trim(),
        email: applyEmail.trim() || `${applyPhone.trim()}@guide.travel`,
        nid_number: applyNid.trim(),
        primary_area: applyArea,
        covered_areas: [applyArea, `${applyArea} Sightseeing Spots`],
        languages: applyLanguages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
        experience_years: parseInt(applyExperience, 10) || 3,
        daily_rate: parseInt(applyDailyRate, 10) || 1800,
        bio: applyBio.trim(),
        specialties: applySpecialty
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });

      Alert.alert(
        "à¦…à¦­à¦¿à¦¨à¦¨à§à¦¦à¦¨ à¦¨à¦¤à§à¦¨ à¦—à¦¾à¦‡à¦¡!",
        `à¦—à¦¾à¦‡à¦¡ ${newGuide.full_name}-à¦à¦° à¦ªà§à¦°à§‹à¦«à¦¾à¦‡à¦² à¦²à¦¾à¦‡à¦­ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿà¦°à¦¿à¦¤à§‡ à¦¤à¦¾à¦²à¦¿à¦•à¦¾à¦­à§à¦•à§à¦¤ à¦¹à§Ÿà§‡à¦›à§‡à¥¤`,
        [
          {
            text: "à¦ à¦¿à¦• à¦†à¦›à§‡",
            onPress: () => {
              setShowApplyModal(false);
              loadGuides();
              setApplyFullName("");
              setApplyPhone("");
              setApplyNid("");
              setApplyBio("");
            },
          },
        ]
      );
    } catch {
      Alert.alert("à¦¤à§à¦°à§à¦Ÿà¦¿", "à¦¨à¦¿à¦¬à¦¨à§à¦§à¦¨ à¦¸à¦®à§à¦ªà¦¨à§à¦¨ à¦•à¦°à¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿à¥¤");
    } finally {
      setApplySubmitting(false);
    }
  };

  // Interactive Calendar Generator
  const calendarDates = useMemo(() => {
    const baseDate = new Date();
    baseDate.setMonth(baseDate.getMonth() + calendarMonthOffset);
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { dateStr: string; dayNum: number; isPast: boolean; isCurrentMonth: boolean }[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dateStr: "", dayNum: 0, isPast: true, isCurrentMonth: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: day,
        isPast: d < today,
        isCurrentMonth: true,
      });
    }

    const monthName = baseDate.toLocaleString("en-US", { month: "long", year: "numeric" });
    return { monthName, days };
  }, [calendarMonthOffset]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor="#003BA8" />

      {/* Main Header */}
      <LinearGradient colors={["#003BA8", PRIMARY_BLUE]} style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityLabel="Back"
          >
            <RTLIcon name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginStart: 12 }}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Tour Guide Directory</Text>
              <View style={styles.headerCertBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#FFFFFF" />
                <Text style={styles.headerCertBadgeText}>Verified</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              à¦²à¦¾à¦‡à¦¸à§‡à¦¨à§à¦¸à¦§à¦¾à¦°à§€ à¦“ à¦¸à¦¾à¦°à§à¦Ÿà¦¿à¦«à¦¾à¦‡à¦¡ à¦²à§‹à¦•à¦¾à¦² à¦Ÿà§à¦¯à§à¦° à¦—à¦¾à¦‡à¦¡ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿà¦°à¦¿
            </Text>
          </View>
          <TouchableOpacity
            style={styles.joinGuideBtn}
            onPress={() => setShowApplyModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={14} color={PRIMARY_BLUE} />
            <Text style={styles.joinGuideBtnText}>à¦—à¦¾à¦‡à¦¡ à¦œà§Ÿà§‡à¦¨</Text>
          </TouchableOpacity>
        </View>

        {/* Search Input Box */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="à¦—à¦¾à¦‡à¦¡, à¦¸à§à¦ªà¦Ÿ à¦¬à¦¾ à¦­à¦¾à¦·à¦¾ à¦¦à¦¿à§Ÿà§‡ à¦–à§à¦à¦œà§à¦¨ (à¦¯à§‡à¦®à¦¨: à¦šà§€à¦¨à¦¾ à¦­à¦¾à¦·à¦¾, à¦¸à¦¾à¦œà§‡à¦•)..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Directory vs My Bookings Segment Control */}
        <View style={styles.topSegmentRow}>
          <TouchableOpacity
            style={[
              styles.topSegmentBtn,
              mainTab === "directory" && styles.topSegmentBtnActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setMainTab("directory");
            }}
          >
            <Ionicons
              name="compass-outline"
              size={15}
              color={mainTab === "directory" ? PRIMARY_BLUE : "#FFFFFF"}
            />
            <Text
              style={[
                styles.topSegmentText,
                mainTab === "directory" && styles.topSegmentTextActive,
              ]}
            >
              à¦—à¦¾à¦‡à¦¡ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿà¦°à¦¿ ({filteredAndSortedGuides.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.topSegmentBtn,
              mainTab === "my-bookings" && styles.topSegmentBtnActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setMainTab("my-bookings");
            }}
          >
            <Ionicons
              name="calendar-outline"
              size={15}
              color={mainTab === "my-bookings" ? PRIMARY_BLUE : "#FFFFFF"}
            />
            <Text
              style={[
                styles.topSegmentText,
                mainTab === "my-bookings" && styles.topSegmentTextActive,
              ]}
            >
              à¦†à¦®à¦¾à¦° à¦¬à§à¦•à¦¿à¦‚à¦¸à¦®à§‚à¦¹ {myBookings.length > 0 ? `(${myBookings.length})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {mainTab === "directory" ? (
        <>
          {/* Filter 1: Region Filters */}
          <View style={styles.filterSection}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterLabel}>à¦…à¦žà§à¦šà¦² à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ (Region):</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipContainer}
            >
              {REGIONS.map((reg) => {
                const active = selectedRegion === reg.id;
                return (
                  <TouchableOpacity
                    key={reg.id}
                    style={[styles.regionChip, active && styles.regionChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedRegion(reg.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={active ? "#FFFFFF" : "#475569"}
                    />
                    <Text
                      style={[
                        styles.regionChipText,
                        active && styles.regionChipTextActive,
                      ]}
                    >
                      {reg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Filter 2: Tour Type Specialization Filters */}
          <View style={styles.specializationSection}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterLabel}>à¦Ÿà§à¦¯à§à¦° à¦¸à§à¦ªà§‡à¦¶à¦¾à¦²à¦¾à¦‡à¦œà§‡à¦¶à¦¨ (Tour Type):</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipContainer}
            >
              {TOUR_TYPES.map((type) => {
                const active = selectedTourType === type.id;
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.specChip, active && styles.specChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedTourType(type.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={type.icon as any}
                      size={13}
                      color={active ? "#FFFFFF" : "#0284C7"}
                    />
                    <Text
                      style={[
                        styles.specChipText,
                        active && styles.specChipTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Filter 3: Spoken Language Filter Row */}
          <View style={styles.languageFilterSection}>
            <View style={styles.filterHeaderRow}>
              <Text style={styles.filterLabel}>à¦­à¦¾à¦·à¦¾à¦° à¦«à¦¿à¦²à§à¦Ÿà¦¾à¦° (Languages):</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipContainer}
            >
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = selectedLanguage === lang.id;
                return (
                  <TouchableOpacity
                    key={lang.id}
                    style={[styles.langChip, active && styles.langChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedLanguage(lang.id);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.langChipFlag}>{lang.flag}</Text>
                    <Text
                      style={[
                        styles.langChipText,
                        active && styles.langChipTextActive,
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Sort Bar */}
          <View style={styles.sortBar}>
            <Text style={styles.sortBarLabel}>à¦¸à¦¾à¦œà¦¾à¦¨ (Sort):</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sortChipsRow}
            >
              {[
                { id: "rating", label: "à¦¸à§‡à¦°à¦¾ à¦°à§‡à¦Ÿà¦¿à¦‚ (Top Rated)" },
                { id: "experience", label: "à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾ (Experience)" },
                { id: "price_low", label: "à¦•à¦® à¦«à¦¿ (Lowest Rate)" },
                { id: "price_high", label: "à¦¬à§‡à¦¶à¦¿ à¦«à¦¿ (Highest Rate)" },
              ].map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.sortPill,
                    sortBy === s.id && styles.sortPillActive,
                  ]}
                  onPress={() => setSortBy(s.id as any)}
                >
                  <Text
                    style={[
                      styles.sortPillText,
                      sortBy === s.id && styles.sortPillTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* View Mode Toggle: List vs Sonar Radar (Image 1 UX Pattern) */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 16, marginTop: 8, marginBottom: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: DARK_NAVY }}>
              {viewMode === "list" ? `à¦‰à¦ªà¦²à¦¬à§à¦§ à¦—à¦¾à¦‡à¦¡à¦—à¦£ (${filteredAndSortedGuides.length})` : "à¦†à¦¶à§‡à¦ªà¦¾à¦¶à§‡à¦° à¦—à¦¾à¦‡à¦¡ à¦¸à§‹à¦¨à¦¾à¦° à¦¸à§à¦•à§à¦¯à¦¾à¦¨ (Sonar Radar)"}
            </Text>
            <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", borderRadius: 10, padding: 2 }}>
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: viewMode === "list" ? "#FFFFFF" : "transparent",
                }}
                onPress={() => setViewMode("list")}
              >
                <Ionicons name="list" size={13} color={viewMode === "list" ? PRIMARY_BLUE : "#64748B"} />
                <Text style={{ fontSize: 11, fontWeight: "700", marginLeft: 4, color: viewMode === "list" ? PRIMARY_BLUE : "#64748B" }}>
                  à¦¤à¦¾à¦²à¦¿à¦•à¦¾
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                  backgroundColor: viewMode === "radar" ? "#FFFFFF" : "transparent",
                }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setViewMode("radar");
                }}
              >
                <Ionicons name="radio" size={13} color={viewMode === "radar" ? PRIMARY_BLUE : "#64748B"} />
                <Text style={{ fontSize: 11, fontWeight: "700", marginLeft: 4, color: viewMode === "radar" ? PRIMARY_BLUE : "#64748B" }}>
                  à¦°à¦¾à¦¡à¦¾à¦°
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {viewMode === "radar" ? (
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={{ alignItems: "center", paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >
              <SonarRadarView
                nodes={radarNodes}
                selectedNodeId={selectedGuide?.id}
                onSelectNode={(node) => {
                  const g = filteredAndSortedGuides.find((x) => x.id === node.id);
                  if (g) setSelectedGuide(g);
                }}
                onConnectPress={(node) => {
                  const g = filteredAndSortedGuides.find((x) => x.id === node.id);
                  if (g) setSelectedGuide(g);
                }}
                centerLabel="à¦†à¦ªà¦¨à¦¿ (You)"
                scanningText="à¦†à¦¶à§‡à¦ªà¦¾à¦¶à§‡à¦° à¦¸à¦¾à¦°à§à¦Ÿà¦¿à¦«à¦¾à¦¯à¦¼à§‡à¦¡ à¦¸à§à¦¥à¦¾à¦¨à§€à¦¯à¦¼ à¦—à¦¾à¦‡à¦¡à¦¦à§‡à¦° à¦¸à¦¨à§à¦§à¦¾à¦¨ à¦šà¦²à¦›à§‡..."
              />
            </ScrollView>
          ) : (
            /* Guide Directory List */
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
            >
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={PRIMARY_BLUE} />
                <Text style={styles.loadingText}>à¦Ÿà§à¦¯à§à¦° à¦—à¦¾à¦‡à¦¡ à¦²à§‹à¦¡ à¦¹à¦šà§à¦›à§‡...</Text>
              </View>
            ) : filteredAndSortedGuides.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="person-remove-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>à¦•à§‹à¦¨à§‹ à¦—à¦¾à¦‡à¦¡ à¦ªà¦¾à¦“à§Ÿà¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿</Text>
                <Text style={styles.emptySubtitle}>
                  à¦…à¦¨à§à¦¯ à¦•à§‹à¦¨à§‹ à¦…à¦žà§à¦šà¦², à¦¸à§à¦ªà§‡à¦¶à¦¾à¦²à¦¾à¦‡à¦œà§‡à¦¶à¦¨ à¦¬à¦¾ à¦­à¦¾à¦·à¦¾ à¦«à¦¿à¦²à§à¦Ÿà¦¾à¦° à¦ªà¦°à¦¿à¦¬à¦°à§à¦¤à¦¨ à¦•à¦°à§‡ à¦¦à§‡à¦–à§à¦¨à¥¤
                </Text>
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={() => {
                    setSelectedRegion("All");
                    setSelectedTourType("All");
                    setSelectedLanguage("All");
                    setSearchQuery("");
                  }}
                >
                  <Text style={styles.resetFilterBtnText}>à¦¸à¦¬ à¦«à¦¿à¦²à§à¦Ÿà¦¾à¦° à¦°à¦¿à¦¸à§‡à¦Ÿ à¦•à¦°à§à¦¨</Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredAndSortedGuides.map((guide) => (
                <View key={guide.id} style={styles.guideCard}>
                  {/* Card Header & Avatar */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.avatarWrap}>
                      <Image
                        source={{ uri: guide.avatar_url }}
                        style={styles.guideAvatar}
                      />
                      <View style={styles.onlineDot} />
                    </View>

                    <View style={styles.guideHeaderMeta}>
                      <View style={styles.nameRow}>
                        <Text style={styles.guideName} numberOfLines={1}>
                          {guide.full_name}
                        </Text>
                        {guide.verified && (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color="#0284C7"
                          />
                        )}
                      </View>

                      {/* Certified License Badge */}
                      <View style={styles.licensePill}>
                        <Ionicons
                          name="shield-checkmark"
                          size={12}
                          color="#0F766E"
                        />
                        <Text style={styles.licensePillText} numberOfLines={1}>
                          {guide.licenseNumber} â€¢ {guide.licenseIssuer}
                        </Text>
                      </View>

                      {/* Rating & Experience Row */}
                      <View style={styles.metaRow}>
                        <View style={styles.ratingBadge}>
                          <Ionicons name="star" size={13} color={ACCENT_GOLD} />
                          <Text style={styles.ratingScore}>
                            {guide.rating.toFixed(1)}
                          </Text>
                          <Text style={styles.reviewsCount}>
                            ({guide.reviews_count} à¦°à¦¿à¦­à¦¿à¦‰)
                          </Text>
                        </View>
                        <Text style={styles.metaSeparator}>â€¢</Text>
                        <View style={styles.expBadge}>
                          <Ionicons
                            name="ribbon-outline"
                            size={12}
                            color="#475569"
                          />
                          <Text style={styles.expBadgeText}>
                            {guide.experience_years}+ à¦¬à¦›à¦° à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾
                          </Text>
                        </View>
                      </View>

                      <View style={styles.locationMetaRow}>
                        <Ionicons name="location-sharp" size={13} color="#EF4444" />
                        <Text style={styles.locationMetaText}>
                          {guide.primary_area}
                        </Text>
                        <Text style={styles.metaSeparator}>â€¢</Text>
                        <Text style={styles.toursCountText}>
                          {guide.total_tours}à¦Ÿà¦¿ à¦¸à¦«à¦² à¦Ÿà§à¦¯à§à¦°
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Guide Bio */}
                  <Text style={styles.guideBioText} numberOfLines={2}>
                    {guide.bio}
                  </Text>

                  {/* Requirement 1: Spoken Languages with Proficiency Tags */}
                  <View style={styles.languagesContainer}>
                    <Text style={styles.sectionSmallLabel}>
                      à¦­à¦¾à¦·à¦¾à¦° à¦¦à¦•à§à¦·à¦¤à¦¾ (Spoken Languages):
                    </Text>
                    <View style={styles.langPillsRow}>
                      {guide.spokenLanguagesProficiency.map((lang, lIdx) => (
                        <View key={`lang-${lIdx}`} style={styles.languagePill}>
                          <Text style={styles.languageFlag}>{lang.flag}</Text>
                          <Text style={styles.languageName}>{lang.language}</Text>
                          <View style={styles.langLevelBadge}>
                            <Text style={styles.langLevelText}>{lang.level}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Requirement 2: Tour Type Specialization Badges */}
                  <View style={styles.specialtiesContainer}>
                    <View style={styles.specPillsRow}>
                      {guide.primarySpecializations.map((spec, sIdx) => (
                        <View key={`spec-${sIdx}`} style={styles.tourTypeBadge}>
                          <Ionicons
                            name={
                              spec === "Historical"
                                ? "library-outline"
                                : spec === "Wildlife"
                                ? "leaf-outline"
                                : spec === "Culinary"
                                ? "restaurant-outline"
                                : "camera-outline"
                            }
                            size={12}
                            color="#B45309"
                          />
                          <Text style={styles.tourTypeBadgeText}>{spec}</Text>
                        </View>
                      ))}
                      {guide.specialties.slice(0, 2).map((s, idx) => (
                        <View key={`subspec-${idx}`} style={styles.generalSpecBadge}>
                          <Text style={styles.generalSpecText}>âœ“ {s}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Requirement 3: Dual Pricing options (Hourly & Full-Day) */}
                  <View style={styles.pricingRow}>
                    <View style={styles.priceColumn}>
                      <Text style={styles.priceHeaderLabel}>à¦˜à¦¨à§à¦Ÿà¦¾à¦¯à¦¼ (Hourly)</Text>
                      <Text style={styles.priceAmount}>
                        à§³{guide.hourlyRateCalculated}
                        <Text style={styles.priceUnit}> / à¦˜à¦£à§à¦Ÿà¦¾</Text>
                      </Text>
                    </View>
                    <View style={styles.priceDivider} />
                    <View style={styles.priceColumn}>
                      <Text style={styles.priceHeaderLabel}>à¦¸à¦¾à¦°à¦¾à¦¦à¦¿à¦¨ (Full-Day)</Text>
                      <Text style={styles.priceAmount}>
                        à§³{guide.daily_rate.toLocaleString("en-BD")}
                        <Text style={styles.priceUnit}> / à¦¦à¦¿à¦¨</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Requirement 4: Direct Communication & Instant Booking Actions */}
                  <View style={styles.cardActionsContainer}>
                    {/* Pre-booking Inquiry Button (AgencyChatScreen) */}
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={() => handleOpenChat(guide)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={16}
                        color={PRIMARY_BLUE}
                      />
                      <Text style={styles.chatActionBtnText}>à¦‡à¦¨à¦•à§‹à¦¯à¦¼à¦¾à¦°à¦¿ à¦šà§à¦¯à¦¾à¦Ÿ</Text>
                    </TouchableOpacity>

                    {/* Emergency Audio Consultation (CallScreen) */}
                    <TouchableOpacity
                      style={styles.callActionBtn}
                      onPress={() => handleStartAudioCall(guide)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call-outline" size={16} color="#DC2626" />
                      <Text style={styles.callActionBtnText}>à¦œà¦°à§à¦°à¦¿ à¦•à¦²</Text>
                    </TouchableOpacity>

                    {/* Instant Hire Booking Button */}
                    <TouchableOpacity
                      style={styles.hireActionBtn}
                      onPress={() => handleOpenBookingModal(guide)}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={[PRIMARY_BLUE, "#003FA0"]}
                        style={styles.hireActionGradient}
                      >
                        <Ionicons name="flash" size={15} color="#FBBF24" />
                        <Text style={styles.hireActionBtnText}>à¦¹à¦¾à§Ÿà¦¾à¦° à¦•à¦°à§à¦¨</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  {/* View Full Profile link */}
                  <TouchableOpacity
                    style={styles.viewProfileTouch}
                    onPress={() => setSelectedGuide(guide)}
                  >
                    <Text style={styles.viewProfileText}>
                      à¦ªà§‚à¦°à§à¦£ à¦ªà§à¦°à§‹à¦«à¦¾à¦‡à¦² à¦“ à¦Ÿà§à¦¯à§à¦°à¦¿à¦¸à§à¦Ÿ à¦°à¦¿à¦­à¦¿à¦‰ à¦¦à§‡à¦–à§à¦¨ â†’
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
          )}
        </>
      ) : (
        /* MY BOOKINGS TAB VIEW */
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>
              à¦†à¦ªà¦¨à¦¾à¦° à¦…à¦¨à§à¦®à§‹à¦¦à¦¿à¦¤ à¦—à¦¾à¦‡à¦¡ à¦¬à§à¦•à¦¿à¦‚à¦¸à¦®à§‚à¦¹ ({myBookings.length})
            </Text>
            <TouchableOpacity
              style={styles.refreshBookingsBtn}
              onPress={loadMyBookings}
            >
              <Ionicons name="refresh" size={14} color={PRIMARY_BLUE} />
              <Text style={styles.refreshBookingsText}>à¦°à¦¿à¦«à§à¦°à§‡à¦¶</Text>
            </TouchableOpacity>
          </View>

          {loadingBookings ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={PRIMARY_BLUE} />
              <Text style={styles.loadingText}>à¦¬à§à¦•à¦¿à¦‚ à¦¤à¦¥à§à¦¯ à¦²à§‹à¦¡ à¦¹à¦šà§à¦›à§‡...</Text>
            </View>
          ) : myBookings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-outline" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>à¦•à§‹à¦¨à§‹ à¦¬à§à¦•à¦¿à¦‚ à¦ªà¦¾à¦“à§Ÿà¦¾ à¦¯à¦¾à§Ÿà¦¨à¦¿</Text>
              <Text style={styles.emptySubtitle}>
                à¦†à¦ªà¦¨à¦¿ à¦à¦–à¦¨à¦“ à¦•à§‹à¦¨à§‹ à¦Ÿà§à¦¯à§à¦° à¦—à¦¾à¦‡à¦¡ à¦¹à¦¾à§Ÿà¦¾à¦° à¦•à¦°à§‡à¦¨à¦¨à¦¿à¥¤ à¦—à¦¾à¦‡à¦¡ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿà¦°à¦¿ à¦¥à§‡à¦•à§‡ à¦¸à¦¹à¦œà§‡ à¦¹à¦¾à§Ÿà¦¾à¦° à¦•à¦°à§à¦¨à¥¤
              </Text>
              <TouchableOpacity
                style={styles.resetFilterBtn}
                onPress={() => setMainTab("directory")}
              >
                <Text style={styles.resetFilterBtnText}>à¦—à¦¾à¦‡à¦¡ à¦¡à¦¿à¦°à§‡à¦•à§à¦Ÿà¦°à¦¿ à¦¦à§‡à¦–à§à¦¨</Text>
              </TouchableOpacity>
            </View>
          ) : (
            myBookings.map((b) => (
              <View key={b.id} style={styles.bookingCard}>
                <View style={styles.bookingCardTop}>
                  {b.guide_avatar ? (
                    <Image
                      source={{ uri: b.guide_avatar }}
                      style={styles.bookingGuideAvatar}
                    />
                  ) : (
                    <View style={styles.bookingGuideAvatarFallback}>
                      <Ionicons name="person" size={24} color="#64748B" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginStart: 12 }}>
                    <View style={styles.bookingNameRow}>
                      <Text style={styles.bookingCardGuideName}>
                        {b.guide_name}
                      </Text>
                      <View style={styles.bookingStatusPill}>
                        <Text style={styles.bookingStatusText}>
                          {b.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.bookingCardArea}>
                      ðŸ“ {b.destination}
                    </Text>
                    <Text style={styles.bookingRefText}>ID: {b.id}</Text>
                  </View>
                </View>

                <View style={styles.bookingDetailsGrid}>
                  <View style={styles.bookingGridItem}>
                    <Text style={styles.bookingGridLabel}>à¦¤à¦¾à¦°à¦¿à¦–</Text>
                    <Text style={styles.bookingGridVal}>{b.tour_date}</Text>
                  </View>
                  <View style={styles.bookingGridItem}>
                    <Text style={styles.bookingGridLabel}>à¦¸à¦®à§Ÿà¦•à¦¾à¦² / à¦¦à¦¿à¦¨</Text>
                    <Text style={styles.bookingGridVal}>{b.duration_days} à¦¦à¦¿à¦¨</Text>
                  </View>
                  <View style={styles.bookingGridItem}>
                    <Text style={styles.bookingGridLabel}>à¦ªà¦°à§à¦¯à¦Ÿà¦•</Text>
                    <Text style={styles.bookingGridVal}>{b.guests_count} à¦œà¦¨</Text>
                  </View>
                  <View style={styles.bookingGridItem}>
                    <Text style={styles.bookingGridLabel}>à¦¸à¦°à§à¦¬à¦®à§‹à¦Ÿ à¦«à¦¿</Text>
                    <Text style={[styles.bookingGridVal, { color: SUCCESS_GREEN }]}>
                      à§³{b.total_amount?.toLocaleString("en-BD") || b.daily_rate}
                    </Text>
                  </View>
                </View>

                <View style={styles.bookingMeetingBox}>
                  <Ionicons name="pin" size={14} color="#EF4444" />
                  <Text style={styles.bookingMeetingText} numberOfLines={1}>
                    à¦®à¦¿à¦Ÿà¦¿à¦‚ à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ: {b.meeting_point}
                  </Text>
                </View>

                {/* Direct Actions on Booked Guide */}
                <View style={styles.bookingActionsRow}>
                  <TouchableOpacity
                    style={styles.bookingChatBtn}
                    onPress={() =>
                      handleOpenChat({
                        id: b.guide_id,
                        full_name: b.guide_name,
                        avatar_url: b.guide_avatar,
                        primary_area: b.destination,
                      })
                    }
                  >
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={15}
                      color={PRIMARY_BLUE}
                    />
                    <Text style={styles.bookingChatBtnText}>à¦šà§à¦¯à¦¾à¦Ÿ à¦•à¦°à§à¦¨</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.bookingCallBtn}
                    onPress={() =>
                      handleStartAudioCall({
                        id: b.guide_id,
                        full_name: b.guide_name,
                        avatar_url: b.guide_avatar,
                      })
                    }
                  >
                    <Ionicons name="call" size={15} color="#DC2626" />
                    <Text style={styles.bookingCallBtnText}>à¦œà¦°à§à¦°à¦¿ à¦•à¦²</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* MODAL 1: Requirement 3 & 5 - Instant Hire Booking with Hourly/Daily Rates, Date Picker, Meeting Point, and Zod Validation */}
      <Modal
        visible={!!bookingGuide}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBookingGuide(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.bookingModalSheet}>
            {bookingGuide && (
              <>
                <View style={styles.modalSheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalSheetTitle}>
                      à¦—à¦¾à¦‡à¦¡ à¦¹à¦¾à§Ÿà¦¾à¦° à¦“ à¦¬à§à¦•à¦¿à¦‚ à¦¨à¦¿à¦¶à§à¦šà¦¿à¦¤à¦•à¦°à¦£
                    </Text>
                    <Text style={styles.modalSheetSubtitle}>
                      {bookingGuide.full_name} â€¢ {bookingGuide.licenseNumber}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseCircle}
                    onPress={() => setBookingGuide(null)}
                  >
                    <Ionicons name="close" size={20} color="#334155" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.bookingScrollContent}
                >
                  {/* Guide Mini Card */}
                  <View style={styles.miniGuideBox}>
                    <Image
                      source={{ uri: bookingGuide.avatar_url }}
                      style={styles.miniAvatar}
                    />
                    <View style={{ flex: 1, marginStart: 12 }}>
                      <Text style={styles.miniGuideName}>
                        {bookingGuide.full_name}
                      </Text>
                      <Text style={styles.miniGuideArea}>
                        ðŸ“ à¦ªà§à¦°à¦§à¦¾à¦¨ à¦à¦²à¦¾à¦•à¦¾: {bookingGuide.primary_area}
                      </Text>
                      <View style={styles.miniMetaRow}>
                        <Ionicons name="star" size={12} color={ACCENT_GOLD} />
                        <Text style={styles.miniRatingText}>
                          {bookingGuide.rating.toFixed(1)} ({bookingGuide.reviews_count} à¦°à¦¿à¦­à¦¿à¦‰)
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Requirement 3: Support Hourly Rate and Full-Day Rate hiring */}
                  <Text style={styles.sectionInputHeading}>
                    à¦¹à¦¾à§Ÿà¦¾à¦°à¦¿à¦‚ à¦ªà§à¦¯à¦¾à¦•à§‡à¦œ à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨ (Rate Option) *
                  </Text>
                  <View style={styles.rateToggleWrap}>
                    <TouchableOpacity
                      style={[
                        styles.rateToggleBtn,
                        rateType === "hourly" && styles.rateToggleBtnActive,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setRateType("hourly");
                        setDuration(4);
                      }}
                    >
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={rateType === "hourly" ? "#FFFFFF" : PRIMARY_BLUE}
                      />
                      <Text
                        style={[
                          styles.rateToggleText,
                          rateType === "hourly" && styles.rateToggleTextActive,
                        ]}
                      >
                        â±ï¸ à¦˜à¦¨à§à¦Ÿà¦¾ à¦­à¦¿à¦¤à§à¦¤à¦¿à¦• (Hourly)
                      </Text>
                      <Text
                        style={[
                          styles.rateTogglePrice,
                          rateType === "hourly" && styles.rateTogglePriceActive,
                        ]}
                      >
                        à§³{bookingGuide.hourlyRateCalculated}/à¦˜à¦¨à§à¦Ÿà¦¾
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.rateToggleBtn,
                        rateType === "daily" && styles.rateToggleBtnActive,
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setRateType("daily");
                        setDuration(1);
                      }}
                    >
                      <Ionicons
                        name="sunny-outline"
                        size={18}
                        color={rateType === "daily" ? "#FFFFFF" : PRIMARY_BLUE}
                      />
                      <Text
                        style={[
                          styles.rateToggleText,
                          rateType === "daily" && styles.rateToggleTextActive,
                        ]}
                      >
                        â˜€ï¸ à¦ªà§‚à¦°à§à¦£ à¦¦à¦¿à¦¨ (Full-Day)
                      </Text>
                      <Text
                        style={[
                          styles.rateTogglePrice,
                          rateType === "daily" && styles.rateTogglePriceActive,
                        ]}
                      >
                        à§³{bookingGuide.daily_rate}/à¦¦à¦¿à¦¨
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Duration Selector (Hours or Days) */}
                  <View style={styles.durationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.durationCardTitle}>
                        {rateType === "hourly" ? "à¦•à¦¤ à¦˜à¦¨à§à¦Ÿà¦¾ à¦ªà§à¦°à¦¯à¦¼à§‹à¦œà¦¨?" : "à¦•à¦¤ à¦¦à¦¿à¦¨ à¦¥à¦¾à¦•à¦¬à§‡à¦¨?"}
                      </Text>
                      <Text style={styles.durationCardSub}>
                        {rateType === "hourly"
                          ? "à§§ à¦¥à§‡à¦•à§‡ à§§à§¨ à¦˜à¦¨à§à¦Ÿà¦¾ à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨"
                          : "à§§ à¦¥à§‡à¦•à§‡ à§©à§¦ à¦¦à¦¿à¦¨ à¦ªà¦°à§à¦¯à¦¨à§à¦¤ à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨"}
                      </Text>
                    </View>
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setDuration(Math.max(1, duration - 1));
                        }}
                      >
                        <Ionicons name="remove" size={18} color="#0F172A" />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>
                        {duration} {rateType === "hourly" ? "à¦˜à¦¨à§à¦Ÿà¦¾" : "à¦¦à¦¿à¦¨"}
                      </Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          const maxLimit = rateType === "hourly" ? 12 : 30;
                          setDuration(Math.min(maxLimit, duration + 1));
                        }}
                      >
                        <Ionicons name="add" size={18} color="#0F172A" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Requirement 3: Date Picker & Calendar */}
                  <Text style={styles.sectionInputHeading}>
                    à¦­à§à¦°à¦®à¦£à§‡à¦° à¦¤à¦¾à¦°à¦¿à¦– à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦£ (Date Picker) *
                  </Text>
                  <View style={styles.datePickerCard}>
                    <View style={styles.dateDisplayRow}>
                      <Ionicons name="calendar" size={19} color={PRIMARY_BLUE} />
                      <Text style={styles.dateDisplayText}>
                        à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¿à¦¤ à¦¤à¦¾à¦°à¦¿à¦–: {tourDate}
                      </Text>
                      <TouchableOpacity
                        style={styles.calendarToggleBtn}
                        onPress={() => setShowCalendarView(!showCalendarView)}
                      >
                        <Text style={styles.calendarToggleBtnText}>
                          {showCalendarView ? "à¦²à§à¦•à¦¾à¦¨" : "à¦•à§à¦¯à¦¾à¦²à§‡à¦¨à§à¦¡à¦¾à¦°"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quick Date Chips */}
                    <View style={styles.quickDateChipsRow}>
                      {[
                        { label: "à¦†à¦œà¦•à§‡", days: 0 },
                        { label: "à¦†à¦—à¦¾à¦®à§€à¦•à¦¾à¦²", days: 1 },
                        { label: "à¦ªà¦°à¦¶à§", days: 2 },
                        { label: "à¦à¦‡ à¦¸à¦ªà§à¦¤à¦¾à¦¹à¦¾à¦¨à§à¦¤à§‡", days: 3 },
                      ].map((item, idx) => {
                        const target = new Date();
                        target.setDate(target.getDate() + item.days);
                        const targetStr = target.toISOString().split("T")[0];
                        const isSelected = tourDate === targetStr;
                        return (
                          <TouchableOpacity
                            key={`qdate-${item.label}`}
                            style={[
                              styles.quickDateChip,
                              isSelected && styles.quickDateChipSelected,
                            ]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setTourDate(targetStr);
                            }}
                          >
                            <Text
                              style={[
                                styles.quickDateChipText,
                                isSelected && styles.quickDateChipTextSelected,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Inline Calendar Grid */}
                    {showCalendarView && (
                      <View style={styles.calendarGridBox}>
                        <View style={styles.calendarMonthHeader}>
                          <TouchableOpacity
                            style={styles.calNavBtn}
                            onPress={() =>
                              setCalendarMonthOffset(Math.max(0, calendarMonthOffset - 1))
                            }
                            disabled={calendarMonthOffset <= 0}
                          >
                            <RTLIcon
                              name="chevron-back"
                              size={18}
                              color={calendarMonthOffset <= 0 ? "#CBD5E1" : "#0F172A"}
                            />
                          </TouchableOpacity>
                          <Text style={styles.calMonthText}>
                            {calendarDates.monthName}
                          </Text>
                          <TouchableOpacity
                            style={styles.calNavBtn}
                            onPress={() => setCalendarMonthOffset(calendarMonthOffset + 1)}
                          >
                            <RTLIcon name="chevron-forward" size={18} color="#0F172A" />
                          </TouchableOpacity>
                        </View>

                        <View style={styles.calWeekdaysRow}>
                          {["à¦°à¦¬à¦¿", "à¦¸à§‹à¦®", "à¦®à¦™à§à¦—à¦²", "à¦¬à§à¦§", "à¦¬à§ƒà¦¹à¦ƒ", "à¦¶à§à¦•à§à¦°", "à¦¶à¦¨à¦¿"].map(
                            (day, dIdx) => (
                              <Text key={dIdx} style={styles.calWeekdayText}>
                                {day}
                              </Text>
                            )
                          )}
                        </View>

                        <View style={styles.calDaysGrid}>
                          {calendarDates.days.map((d, dayIndex) => {
                            if (!d.isCurrentMonth) {
                              return <View key={dayIndex} style={styles.calDayEmpty} />;
                            }
                            const isSelected = tourDate === d.dateStr;
                            return (
                              <TouchableOpacity
                                key={dayIndex}
                                style={[
                                  styles.calDayCell,
                                  isSelected && styles.calDayCellSelected,
                                  d.isPast && styles.calDayCellDisabled,
                                ]}
                                disabled={d.isPast}
                                onPress={() => {
                                  Haptics.selectionAsync();
                                  setTourDate(d.dateStr);
                                }}
                              >
                                <Text
                                  style={[
                                    styles.calDayNum,
                                    isSelected && styles.calDayNumSelected,
                                    d.isPast && styles.calDayNumDisabled,
                                  ]}
                                >
                                  {d.dayNum}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                  {formErrors.tourDate && (
                    <Text style={styles.errorText}>{formErrors.tourDate}</Text>
                  )}

                  {/* Hourly Time Slot Selection */}
                  {rateType === "hourly" && (
                    <View style={styles.timeSlotSection}>
                      <Text style={styles.sectionInputHeading}>
                        à¦Ÿà§à¦¯à§à¦° à¦¶à§à¦°à§à¦° à¦¸à¦®à§Ÿ à¦¨à¦¿à¦°à§à¦§à¦¾à¦°à¦£ (Start Time)
                      </Text>
                      <View style={styles.timeSlotChipsRow}>
                        {bookingGuide.availableTimeSlots.map((slot, tIdx) => (
                          <TouchableOpacity
                            key={tIdx}
                            style={[
                              styles.timeSlotChip,
                              timeSlot === slot && styles.timeSlotChipSelected,
                            ]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setTimeSlot(slot);
                            }}
                          >
                            <Ionicons
                              name="time-outline"
                              size={12}
                              color={timeSlot === slot ? "#FFFFFF" : "#0284C7"}
                            />
                            <Text
                              style={[
                                styles.timeSlotChipText,
                                timeSlot === slot && styles.timeSlotChipTextSelected,
                              ]}
                            >
                              {slot}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Requirement 3: Meeting Point Selection */}
                  <Text style={styles.sectionInputHeading}>
                    à¦®à¦¿à¦Ÿà¦¿à¦‚ à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ à¦¬à¦¾ à¦ªà¦¿à¦•à¦†à¦ª à¦²à§à¦¯à¦¾à¦¨à§à¦¡à¦®à¦¾à¦°à§à¦• (Meeting Point) *
                  </Text>
                  <Text style={styles.inputHelperText}>
                    à¦ªà§à¦°à¦¸à§à¦¤à¦¾à¦¬à¦¿à¦¤ à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ à¦¥à§‡à¦•à§‡ à¦¨à¦¿à¦°à§à¦¬à¦¾à¦šà¦¨ à¦•à¦°à§à¦¨ à¦¬à¦¾ à¦¨à¦¿à¦°à§à¦¦à¦¿à¦·à§à¦Ÿ à¦¹à§‹à¦Ÿà§‡à¦²à§‡à¦° à¦ à¦¿à¦•à¦¾à¦¨à¦¾ à¦²à¦¿à¦–à§à¦¨:
                  </Text>
                  <View style={styles.meetingPointChipsRow}>
                    {bookingGuide.recommendedMeetingPoints.map((point, pIdx) => {
                      const isSelected = meetingPoint === point;
                      return (
                        <TouchableOpacity
                          key={pIdx}
                          style={[
                            styles.meetingChip,
                            isSelected && styles.meetingChipSelected,
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setMeetingPoint(point);
                          }}
                        >
                          <Ionicons
                            name="pin"
                            size={12}
                            color={isSelected ? "#FFFFFF" : "#0284C7"}
                          />
                          <Text
                            style={[
                              styles.meetingChipText,
                              isSelected && styles.meetingChipTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {point}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={[
                      styles.inputField,
                      formErrors.meetingPoint && styles.inputFieldError,
                    ]}
                    placeholder="à¦¹à§‹à¦Ÿà§‡à¦² à¦²à¦¬à¦¿ à¦¬à¦¾ à¦¨à¦¿à¦°à§à¦¦à¦¿à¦·à§à¦Ÿ à¦ªà¦¿à¦•à¦†à¦ª à¦ªà§Ÿà§‡à¦¨à§à¦Ÿ à¦²à¦¿à¦–à§à¦¨..."
                    placeholderTextColor="#94A3B8"
                    value={meetingPoint}
                    onChangeText={setMeetingPoint}
                  />
                  {formErrors.meetingPoint && (
                    <Text style={styles.errorText}>
                      {formErrors.meetingPoint}
                    </Text>
                  )}

                  {/* Tourist Information Fields */}
                  <Text style={styles.sectionInputHeading}>à¦­à§à¦°à¦®à¦£à¦•à¦¾à¦°à§€à¦° à¦¤à¦¥à§à¦¯ *</Text>
                  <View style={styles.inputRow}>
                    <Text style={styles.fieldLabel}>à¦†à¦ªà¦¨à¦¾à¦° à¦ªà§à¦°à§‹ à¦¨à¦¾à¦® *</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        formErrors.touristName && styles.inputFieldError,
                      ]}
                      placeholder="à¦¯à§‡à¦®à¦¨: à¦¤à¦¾à¦¨à¦­à§€à¦° à¦†à¦¹à¦®à§‡à¦¦"
                      placeholderTextColor="#94A3B8"
                      value={touristName}
                      onChangeText={setTouristName}
                    />
                    {formErrors.touristName && (
                      <Text style={styles.errorText}>
                        {formErrors.touristName}
                      </Text>
                    )}
                  </View>

                  <View style={styles.inputRow}>
                    <Text style={styles.fieldLabel}>à¦®à§‹à¦¬à¦¾à¦‡à¦² à¦¨à¦®à§à¦¬à¦° *</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        formErrors.touristPhone && styles.inputFieldError,
                      ]}
                      placeholder="à¦¯à§‡à¦®à¦¨: 01712345678"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={touristPhone}
                      onChangeText={setTouristPhone}
                    />
                    {formErrors.touristPhone && (
                      <Text style={styles.errorText}>
                        {formErrors.touristPhone}
                      </Text>
                    )}
                  </View>

                  <View style={styles.inputRow}>
                    <Text style={styles.fieldLabel}>à¦‡à¦®à§‡à¦‡à¦² à¦à¦¡à§à¦°à§‡à¦¸ (à¦à¦šà§à¦›à¦¿à¦•)</Text>
                    <TextInput
                      style={[
                        styles.inputField,
                        formErrors.touristEmail && styles.inputFieldError,
                      ]}
                      placeholder="à¦¯à§‡à¦®à¦¨: tourist@example.com"
                      placeholderTextColor="#94A3B8"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      value={touristEmail}
                      onChangeText={setTouristEmail}
                    />
                    {formErrors.touristEmail && (
                      <Text style={styles.errorText}>
                        {formErrors.touristEmail}
                      </Text>
                    )}
                  </View>

                  {/* Guests Stepper */}
                  <View style={styles.guestCounterRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>à¦­à§à¦°à¦®à¦£à¦•à¦¾à¦°à§€ à¦¸à¦‚à¦–à§à¦¯à¦¾</Text>
                      <Text style={styles.guestHelperText}>
                        à¦†à¦ªà¦¨à¦¾à¦° à¦¸à¦¾à¦¥à§‡ à¦®à§‹à¦Ÿ à¦•à¦¤ à¦œà¦¨ à¦ªà¦°à§à¦¯à¦Ÿà¦• à¦¥à¦¾à¦•à¦¬à§‡à¦¨?
                      </Text>
                    </View>
                    <View style={styles.stepperContainer}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setGuestsCount(Math.max(1, guestsCount - 1));
                        }}
                      >
                        <Ionicons name="remove" size={18} color="#0F172A" />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{guestsCount} à¦œà¦¨</Text>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setGuestsCount(Math.min(30, guestsCount + 1));
                        }}
                      >
                        <Ionicons name="add" size={18} color="#0F172A" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Special Requests */}
                  <View style={styles.inputRow}>
                    <Text style={styles.fieldLabel}>à¦¬à¦¿à¦¶à§‡à¦· à¦…à¦¨à§à¦°à§‹à¦§ à¦¬à¦¾ à¦¨à§‹à¦Ÿ (à¦à¦šà§à¦›à¦¿à¦•)</Text>
                    <TextInput
                      style={[styles.inputField, { height: 60 }]}
                      placeholder="à¦¯à§‡à¦®à¦¨: à¦«à§à¦¯à¦¾à¦®à¦¿à¦²à¦¿ à¦«à¦Ÿà§‹à¦—à§à¦°à¦¾à¦«à¦¿ à¦¬à¦¾ à¦¶à¦¿à¦¶à§ à¦¸à¦¹à¦¾à¦¯à¦¼à¦• à¦Ÿà§à¦°à¦¾à¦­à§‡à¦²..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      value={specialRequests}
                      onChangeText={setSpecialRequests}
                    />
                  </View>

                  {/* Dynamic Pricing Calculation Card */}
                  <View style={styles.priceBreakdownCard}>
                    <Text style={styles.priceBreakdownTitle}>
                      à¦­à¦¾à¦¡à¦¼à¦¾ à¦“ à¦«à¦¿ à¦¹à¦¿à¦¸à¦¾à¦¬ (Price Breakdown)
                    </Text>
                    <View style={styles.calcLine}>
                      <Text style={styles.calcLineLabel}>
                        {rateType === "hourly"
                          ? `à¦˜à¦¨à§à¦Ÿà¦¾à¦­à¦¿à¦¤à§à¦¤à¦¿à¦• à¦«à¦¿ (à§³${bookingGuide.hourlyRateCalculated} Ã— ${duration} à¦˜à¦¨à§à¦Ÿà¦¾)`
                          : `à¦¦à§ˆà¦¨à¦¿à¦• à¦«à¦¿ (à§³${bookingGuide.daily_rate} Ã— ${duration} à¦¦à¦¿à¦¨)`}
                      </Text>
                      <Text style={styles.calcLineVal}>
                        à§³{calculatedTotal.toLocaleString("en-BD")}
                      </Text>
                    </View>
                    <View style={styles.calcLine}>
                      <Text style={styles.calcLineLabel}>
                        à¦Ÿà§à¦¯à§à¦°à¦¿à¦¸à§à¦Ÿ à¦¨à¦¿à¦°à¦¾à¦ªà¦¤à§à¦¤à¦¾ à¦—à§à¦¯à¦¾à¦°à¦¾à¦¨à§à¦Ÿà¦¿ à¦“ à¦Ÿà§à¦°à¦¾à¦­à§‡à¦²à¦¾à¦° à¦‡à¦¨à§à¦¸à§à¦°à§‡à¦¨à§à¦¸
                      </Text>
                      <Text style={[styles.calcLineVal, { color: SUCCESS_GREEN }]}>
                        à¦«à§à¦°à¦¿ (à§¦%)
                      </Text>
                    </View>
                    <View style={styles.calcLine}>
                      <Text style={styles.calcLineLabel}>à¦ªà§à¦²à§à¦¯à¦¾à¦Ÿà¦«à¦°à§à¦® à¦¸à¦¾à¦°à§à¦­à¦¿à¦¸ à¦«à¦¿</Text>
                      <Text style={[styles.calcLineVal, { color: SUCCESS_GREEN }]}>
                        à§³à§¦
                      </Text>
                    </View>
                    <View style={styles.calcDivider} />
                    <View style={styles.calcTotalLine}>
                      <View>
                        <Text style={styles.calcTotalLabel}>à¦¸à¦°à§à¦¬à¦®à§‹à¦Ÿ à¦ªà§à¦°à¦¦à§‡à¦¯à¦¼</Text>
                        <Text style={styles.calcTaxNote}>à¦¸à¦•à¦² à¦Ÿà§à¦¯à¦¾à¦•à§à¦¸ à¦…à¦¨à§à¦¤à¦°à§à¦­à§à¦•à§à¦¤</Text>
                      </View>
                      <Text style={styles.calcTotalVal}>
                        à§³{calculatedTotal.toLocaleString("en-BD")}
                      </Text>
                    </View>
                  </View>

                  {/* Checkout Action Button */}
                  <TouchableOpacity
                    style={styles.checkoutSubmitBtn}
                    onPress={handleCheckoutHandoff}
                    disabled={bookingSubmitting}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={[PRIMARY_BLUE, "#003BA8"]}
                      style={styles.checkoutGradient}
                    >
                      {bookingSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <View style={styles.checkoutBtnContent}>
                          <Ionicons name="card-outline" size={20} color="#FFFFFF" />
                          <Text style={styles.checkoutBtnText}>
                            à¦¬à§à¦•à¦¿à¦‚ à¦¨à¦¿à¦¶à§à¦šà¦¿à¦¤ à¦“ à¦šà§‡à¦•à¦†à¦‰à¦Ÿ à¦•à¦°à§à¦¨ (Proceed to Checkout)
                          </Text>
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={{ height: 30 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Full Guide Profile Details View with Reviews */}
      <Modal
        visible={!!selectedGuide}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedGuide(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.profileModalSheet}>
            {selectedGuide && (
              <>
                <View style={styles.modalSheetHeader}>
                  <Text style={styles.modalSheetTitle}>
                    à¦¸à¦¾à¦°à§à¦Ÿà¦¿à¦«à¦¾à¦‡à¦¡ à¦—à¦¾à¦‡à¦¡ à¦ªà¦°à¦¿à¦šà¦¿à¦¤à¦¿
                  </Text>
                  <TouchableOpacity
                    style={styles.modalCloseCircle}
                    onPress={() => setSelectedGuide(null)}
                  >
                    <Ionicons name="close" size={20} color="#334155" />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.profileSheetContent}
                >
                  {/* Top Profile Card */}
                  <View style={styles.profileMainBox}>
                    <Image
                      source={{ uri: selectedGuide.avatar_url }}
                      style={styles.profileBigAvatar}
                    />
                    <View style={{ flex: 1, marginStart: 14 }}>
                      <Text style={styles.profileBigName}>
                        {selectedGuide.full_name}
                      </Text>
                      <View style={styles.licensePill}>
                        <Ionicons
                          name="shield-checkmark"
                          size={12}
                          color="#0F766E"
                        />
                        <Text style={styles.licensePillText}>
                          {selectedGuide.licenseNumber}
                        </Text>
                      </View>
                      <Text style={styles.profileAreaText}>
                        ðŸ“ {selectedGuide.primary_area}
                      </Text>
                      <View style={styles.profileStarRow}>
                        <Ionicons name="star" size={14} color={ACCENT_GOLD} />
                        <Text style={styles.profileStarText}>
                          {selectedGuide.rating.toFixed(1)} ({selectedGuide.reviews_count} à¦°à¦¿à¦­à¦¿à¦‰)
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Certified Badges Row */}
                  <View style={styles.certBadgesContainer}>
                    <View style={styles.certBadgeItem}>
                      <Ionicons name="shield-checkmark" size={18} color="#0284C7" />
                      <Text style={styles.certBadgeTitle}>à¦¸à¦°à¦•à¦¾à¦°à¦¿ à¦²à¦¾à¦‡à¦¸à§‡à¦¨à§à¦¸</Text>
                      <Text style={styles.certBadgeSub}>Verified Guide</Text>
                    </View>
                    <View style={styles.certBadgeItem}>
                      <Ionicons name="card-outline" size={18} color="#059669" />
                      <Text style={styles.certBadgeTitle}>à¦à¦¨à¦†à¦‡à¦¡à¦¿ à¦­à§‡à¦°à¦¿à¦«à¦¾à¦‡à¦¡</Text>
                      <Text style={styles.certBadgeSub}>Govt NID Checked</Text>
                    </View>
                    <View style={styles.certBadgeItem}>
                      <Ionicons name="medkit-outline" size={18} color="#D97706" />
                      <Text style={styles.certBadgeTitle}>à¦ªà§à¦°à¦¾à¦¥à¦®à¦¿à¦• à¦šà¦¿à¦•à¦¿à§Žà¦¸à¦¾</Text>
                      <Text style={styles.certBadgeSub}>First-Aid Trained</Text>
                    </View>
                  </View>

                  {/* About & Bio */}
                  <Text style={styles.sheetSectionTitle}>à¦—à¦¾à¦‡à¦¡ à¦¸à¦®à§à¦ªà¦°à§à¦•à§‡ (About)</Text>
                  <Text style={styles.sheetBioText}>{selectedGuide.bio}</Text>

                  {/* Languages Proficiency */}
                  <Text style={styles.sheetSectionTitle}>
                    à¦­à¦¾à¦·à¦¾à¦° à¦¦à¦•à§à¦·à¦¤à¦¾ à¦“ à¦¦à¦–à¦² (Spoken Languages)
                  </Text>
                  <View style={styles.langPillsRow}>
                    {selectedGuide.spokenLanguagesProficiency.map((l, idx) => (
                      <View key={`lang-${selectedGuide.id}-${l.language}`} style={styles.languagePillLarge}>
                        <Text style={styles.languageFlag}>{l.flag}</Text>
                        <View style={{ marginStart: 6 }}>
                          <Text style={styles.languageNameLarge}>{l.language}</Text>
                          <Text style={styles.languageLevelLarge}>
                            à¦¦à¦•à§à¦·à¦¤à¦¾: {l.level}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Covered Tourist Spots */}
                  <Text style={styles.sheetSectionTitle}>
                    à¦•à¦­à¦¾à¦° à¦•à¦°à¦¾ à¦¦à¦°à§à¦¶à¦¨à§€à§Ÿ à¦¸à§à¦ªà¦Ÿà¦¸à¦®à§‚à¦¹ (Covered Spots)
                  </Text>
                  <View style={styles.coveredSpotsRow}>
                    {selectedGuide.covered_areas.map((area, aIdx) => (
                      <View key={aIdx} style={styles.spotPill}>
                        <Ionicons name="navigate" size={12} color={PRIMARY_BLUE} />
                        <Text style={styles.spotPillText}>{area}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Tourist Reviews Section */}
                  <Text style={styles.sheetSectionTitle}>
                    à¦ªà¦°à§à¦¯à¦Ÿà¦•à¦¦à§‡à¦° à¦°à¦¿à¦­à¦¿à¦‰ à¦“ à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾ (Reviews)
                  </Text>
                  {selectedGuide.sampleReviews.map((rev) => (
                    <View key={rev.id} style={styles.reviewCardItem}>
                      <View style={styles.reviewCardHeader}>
                        <Text style={styles.reviewAuthor}>{rev.reviewerName}</Text>
                        <View style={styles.reviewRatingPill}>
                          <Ionicons name="star" size={11} color={ACCENT_GOLD} />
                          <Text style={styles.reviewRatingVal}>{rev.rating}</Text>
                        </View>
                      </View>
                      <Text style={styles.reviewComment}>{rev.comment}</Text>
                      <Text style={styles.reviewDateText}>
                        {rev.tourType} â€¢ {rev.date}
                      </Text>
                    </View>
                  ))}

                  {/* Bottom Action Bar */}
                  <View style={styles.profileSheetActionsRow}>
                    <TouchableOpacity
                      style={styles.profileChatBtn}
                      onPress={() => {
                        const g = selectedGuide;
                        setSelectedGuide(null);
                        handleOpenChat(g);
                      }}
                    >
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={17}
                        color={PRIMARY_BLUE}
                      />
                      <Text style={styles.profileChatBtnText}>à¦šà§à¦¯à¦¾à¦Ÿ</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.profileCallBtn}
                      onPress={() => {
                        const g = selectedGuide;
                        setSelectedGuide(null);
                        handleStartAudioCall(g);
                      }}
                    >
                      <Ionicons name="call" size={17} color="#DC2626" />
                      <Text style={styles.profileCallBtnText}>à¦œà¦°à§à¦°à¦¿ à¦•à¦²</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.profileHireBtn}
                      onPress={() => {
                        const g = selectedGuide;
                        setSelectedGuide(null);
                        handleOpenBookingModal(g);
                      }}
                    >
                      <Text style={styles.profileHireBtnText}>
                        à¦—à¦¾à¦‡à¦¡ à¦¹à¦¾à§Ÿà¦¾à¦° à¦•à¦°à§à¦¨
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ height: 30 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Become a Tour Guide Registration Modal */}
      <Modal
        visible={showApplyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowApplyModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.bookingModalSheet}>
            <View style={styles.modalSheetHeader}>
              <View>
                <Text style={styles.modalSheetTitle}>
                  à¦Ÿà§à¦¯à§à¦° à¦—à¦¾à¦‡à¦¡ à¦¹à¦¿à¦¸à§‡à¦¬à§‡ à¦¯à§à¦•à§à¦¤ à¦¹à¦¨
                </Text>
                <Text style={styles.modalSheetSubtitle}>
                  à¦²à¦¾à¦‡à¦¸à§‡à¦¨à§à¦¸à¦¯à§à¦•à§à¦¤ à¦—à¦¾à¦‡à¦¡ à¦ªà§à¦²à§à¦¯à¦¾à¦Ÿà¦«à¦°à§à¦®à§‡ à¦¤à¦¾à¦²à¦¿à¦•à¦¾à¦­à§à¦•à§à¦¤ à¦¹à§Ÿà§‡ à¦†à§Ÿ à¦•à¦°à§à¦¨
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseCircle}
                onPress={() => setShowApplyModal(false)}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.bookingScrollContent}
            >
              <Text style={styles.fieldLabel}>à¦†à¦ªà¦¨à¦¾à¦° à¦ªà§à¦°à§‹ à¦¨à¦¾à¦® *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="à¦à¦¨à¦†à¦‡à¦¡à¦¿ à¦…à¦¨à§à¦¯à¦¾à§Ÿà§€ à¦¨à¦¾à¦®"
                placeholderTextColor="#94A3B8"
                value={applyFullName}
                onChangeText={setApplyFullName}
              />

              <Text style={styles.fieldLabel}>à¦®à§‹à¦¬à¦¾à¦‡à¦² à¦¨à¦®à§à¦¬à¦° *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="01XXXXXXXXX"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={applyPhone}
                onChangeText={setApplyPhone}
              />

              <Text style={styles.fieldLabel}>à¦œà¦¾à¦¤à§€à¦¯à¦¼ à¦ªà¦°à¦¿à¦šà¦¯à¦¼à¦ªà¦¤à§à¦° / à¦²à¦¾à¦‡à¦¸à§‡à¦¨à§à¦¸ à¦¨à¦®à§à¦¬à¦° *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="à¦à¦¨à¦†à¦‡à¦¡à¦¿ à¦¬à¦¾ à¦Ÿà§à¦¯à§à¦°à¦¿à¦œà¦® à¦²à¦¾à¦‡à¦¸à§‡à¦¨à§à¦¸ à¦¨à¦®à§à¦¬à¦°"
                placeholderTextColor="#94A3B8"
                value={applyNid}
                onChangeText={setApplyNid}
              />

              <Text style={styles.fieldLabel}>à¦ªà§à¦°à¦§à¦¾à¦¨ à¦ªà¦°à§à¦¯à¦Ÿà¦¨ à¦à¦²à¦¾à¦•à¦¾ *</Text>
              <TextInput
                style={styles.inputField}
                placeholder="à¦¯à§‡à¦®à¦¨: Cox's Bazar / Sylhet / Sundarbans / Dhaka"
                placeholderTextColor="#94A3B8"
                value={applyArea}
                onChangeText={setApplyArea}
              />

              <View style={styles.dualFieldRow}>
                <View style={{ flex: 1, marginEnd: 8 }}>
                  <Text style={styles.fieldLabel}>à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾ (à¦¬à¦›à¦°)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="à¦¯à§‡à¦®à¦¨: 4"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={applyExperience}
                    onChangeText={setApplyExperience}
                  />
                </View>
                <View style={{ flex: 1, marginStart: 8 }}>
                  <Text style={styles.fieldLabel}>à¦¦à§ˆà¦¨à¦¿à¦• à¦«à¦¿ (à§³)</Text>
                  <TextInput
                    style={styles.inputField}
                    placeholder="à¦¯à§‡à¦®à¦¨: 1800"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={applyDailyRate}
                    onChangeText={setApplyDailyRate}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>
                à¦­à¦¾à¦·à¦¾à¦° à¦¦à¦–à¦² (à¦¯à§‡à¦®à¦¨: Bengali, English, Chinese, Arabic, French)
              </Text>
              <TextInput
                style={styles.inputField}
                placeholder="à¦¯à§‡à¦¸à¦¬ à¦­à¦¾à¦·à¦¾ à¦ªà¦°à§à¦¯à¦Ÿà¦•à¦¦à§‡à¦° à¦¸à¦¾à¦¥à§‡ à¦¬à¦²à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨"
                placeholderTextColor="#94A3B8"
                value={applyLanguages}
                onChangeText={setApplyLanguages}
              />

              <Text style={styles.fieldLabel}>
                à¦¸à§à¦ªà§‡à¦¶à¦¾à¦²à¦¾à¦‡à¦œà§‡à¦¶à¦¨ (Historical, Wildlife, Culinary, Photography)
              </Text>
              <TextInput
                style={styles.inputField}
                placeholder="à¦•à¦®à¦¾ à¦¦à¦¿à§Ÿà§‡ à¦²à¦¿à¦–à§à¦¨"
                placeholderTextColor="#94A3B8"
                value={applySpecialty}
                onChangeText={setApplySpecialty}
              />

              <Text style={styles.fieldLabel}>à¦†à¦ªà¦¨à¦¾à¦° à¦…à¦­à¦¿à¦œà§à¦žà¦¤à¦¾ à¦“ à¦ªà¦°à¦¿à¦šà¦¿à¦¤à¦¿ *</Text>
              <TextInput
                style={[styles.inputField, { height: 80, textAlignVertical: "top" }]}
                placeholder="à¦ªà¦°à§à¦¯à¦Ÿà¦•à¦¦à§‡à¦° à¦•à§‡à¦¨ à¦†à¦ªà¦¨à¦¾à¦° à¦—à¦¾à¦‡à¦¡à§‡à¦¨à§à¦¸ à¦¬à§‡à¦›à§‡ à¦¨à§‡à¦“à¦¯à¦¼à¦¾ à¦‰à¦šà¦¿à¦¤ à¦²à¦¿à¦–à§à¦¨..."
                placeholderTextColor="#94A3B8"
                multiline
                value={applyBio}
                onChangeText={setApplyBio}
              />

              <TouchableOpacity
                style={styles.checkoutSubmitBtn}
                onPress={handleApplyGuideSubmit}
                disabled={applySubmitting}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#16A34A", "#15803D"]}
                  style={styles.checkoutGradient}
                >
                  {applySubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.checkoutBtnText}>
                      à¦†à¦¬à§‡à¦¦à¦¨ à¦œà¦®à¦¾ à¦¦à¦¿à¦¨ (Instant Approval)
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <View style={{ height: 25 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  headerCertBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(16, 185, 129, 0.4)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  headerCertBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 11,
    color: "#E0E7FF",
    marginTop: 2,
  },
  joinGuideBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    ...(Platform.OS === "web" ? { boxShadow: "0px 1px 2px rgba(15, 23, 42, 0.1)" } : {}),
  },
  joinGuideBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: PRIMARY_BLUE,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    ...(Platform.OS === "web" ? { boxShadow: "0px 2px 4px rgba(15, 23, 42, 0.08)" } : {}),
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: DARK_NAVY,
  },
  topSegmentRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: 12,
    padding: 3,
    marginTop: 10,
    gap: 4,
  },
  topSegmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 9,
  },
  topSegmentBtnActive: {
    backgroundColor: "#FFFFFF",
  },
  topSegmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  topSegmentTextActive: {
    color: PRIMARY_BLUE,
    fontWeight: "800",
  },
  filterSection: {
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  specializationSection: {
    backgroundColor: "#FFFFFF",
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  languageFilterSection: {
    backgroundColor: "#FFFFFF",
    paddingTop: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  filterHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 5,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  filterChipContainer: {
    paddingHorizontal: 16,
    gap: 6,
  },
  regionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  regionChipActive: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  regionChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  regionChipTextActive: {
    color: "#FFFFFF",
  },
  specChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  specChipActive: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  specChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#0369A1",
  },
  specChipTextActive: {
    color: "#FFFFFF",
  },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  langChipActive: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  langChipFlag: {
    fontSize: 11,
  },
  langChipText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#991B1B",
  },
  langChipTextActive: {
    color: "#FFFFFF",
  },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  sortBarLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    marginEnd: 6,
  },
  sortChipsRow: {
    gap: 6,
  },
  sortPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
  },
  sortPillActive: {
    backgroundColor: PRIMARY_BLUE,
  },
  sortPillText: {
    fontSize: 10.5,
    color: "#475569",
    fontWeight: "600",
  },
  sortPillTextActive: {
    color: "#FFFFFF",
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 14,
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  listTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: "center",
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 8,
  },
  emptyBox: {
    paddingVertical: 50,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 12,
    backgroundColor: PRIMARY_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetFilterBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  guideCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    ...(Platform.OS === "web" ? { boxShadow: "0px 2px 6px rgba(15, 23, 42, 0.05)" } : {}),
  },
  cardHeaderRow: {
    flexDirection: "row",
  },
  avatarWrap: {
    position: "relative",
  },
  guideAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E2E8F0",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: SUCCESS_GREEN,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  guideHeaderMeta: {
    flex: 1,
    marginStart: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  guideName: {
    fontSize: 15.5,
    fontWeight: "700",
    color: DARK_NAVY,
    flex: 1,
  },
  licensePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#CCFBF1",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 3,
  },
  licensePillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F766E",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingScore: {
    fontSize: 12,
    fontWeight: "800",
    color: DARK_NAVY,
  },
  reviewsCount: {
    fontSize: 10.5,
    color: "#64748B",
  },
  metaSeparator: {
    color: "#CBD5E1",
    fontSize: 11,
  },
  expBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  expBadgeText: {
    fontSize: 10.5,
    color: "#475569",
    fontWeight: "600",
  },
  locationMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  locationMetaText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#334155",
  },
  toursCountText: {
    fontSize: 10.5,
    color: "#64748B",
  },
  guideBioText: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
    marginTop: 8,
  },
  languagesContainer: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    padding: 7,
    borderRadius: 8,
  },
  sectionSmallLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  langPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  languagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  languageFlag: {
    fontSize: 11,
  },
  languageName: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#1E293B",
  },
  langLevelBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  langLevelText: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "600",
  },
  specialtiesContainer: {
    marginTop: 6,
  },
  specPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  tourTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tourTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#B45309",
  },
  generalSpecBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  generalSpecText: {
    fontSize: 10.5,
    color: "#475569",
  },
  pricingRow: {
    flexDirection: "row",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#DCFCE7",
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
    alignItems: "center",
  },
  priceColumn: {
    flex: 1,
    alignItems: "center",
  },
  priceHeaderLabel: {
    fontSize: 10.5,
    color: "#166534",
    fontWeight: "600",
  },
  priceAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803D",
    marginTop: 1,
  },
  priceUnit: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "#475569",
  },
  priceDivider: {
    width: 1,
    height: 22,
    backgroundColor: "#BBF7D0",
  },
  cardActionsContainer: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  chatActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  chatActionBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: PRIMARY_BLUE,
  },
  callActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  callActionBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#DC2626",
  },
  hireActionBtn: {
    flex: 1.2,
    borderRadius: 9,
    overflow: "hidden",
  },
  hireActionGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
  },
  hireActionBtnText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  viewProfileTouch: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 2,
  },
  viewProfileText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  // My Bookings Tab Styles
  refreshBookingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  refreshBookingsText: {
    fontSize: 12,
    color: PRIMARY_BLUE,
    fontWeight: "600",
  },
  bookingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  bookingCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  bookingGuideAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  bookingGuideAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingNameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bookingCardGuideName: {
    fontSize: 14.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  bookingStatusPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bookingStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#166534",
  },
  bookingCardArea: {
    fontSize: 11.5,
    color: "#475569",
    marginTop: 2,
  },
  bookingRefText: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 1,
  },
  bookingDetailsGrid: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 8,
    marginTop: 10,
  },
  bookingGridItem: {
    flex: 1,
    alignItems: "center",
  },
  bookingGridLabel: {
    fontSize: 10,
    color: "#64748B",
  },
  bookingGridVal: {
    fontSize: 11.5,
    fontWeight: "700",
    color: DARK_NAVY,
    marginTop: 2,
  },
  bookingMeetingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF2F2",
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  bookingMeetingText: {
    fontSize: 11,
    color: "#991B1B",
    flex: 1,
  },
  bookingActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  bookingChatBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  bookingChatBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: PRIMARY_BLUE,
  },
  bookingCallBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  bookingCallBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#DC2626",
  },
  // Modals Shared
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "flex-end",
  },
  bookingModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "92%",
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  modalSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  modalSheetTitle: {
    fontSize: 16.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  modalSheetSubtitle: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 2,
  },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingScrollContent: {
    paddingVertical: 12,
  },
  miniGuideBox: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  miniAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  miniGuideName: {
    fontSize: 14,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  miniGuideArea: {
    fontSize: 11,
    color: "#475569",
    marginTop: 1,
  },
  miniMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  miniRatingText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  sectionInputHeading: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 10,
    marginBottom: 6,
  },
  rateToggleWrap: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  rateToggleBtn: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  rateToggleBtnActive: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  rateToggleText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    marginTop: 3,
  },
  rateToggleTextActive: {
    color: "#FFFFFF",
  },
  rateTogglePrice: {
    fontSize: 13,
    fontWeight: "800",
    color: PRIMARY_BLUE,
    marginTop: 2,
  },
  rateTogglePriceActive: {
    color: "#E0E7FF",
  },
  durationCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
  durationCardTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  durationCardSub: {
    fontSize: 10.5,
    color: "#64748B",
    marginTop: 1,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 2,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: "700",
    color: DARK_NAVY,
    paddingHorizontal: 10,
  },
  datePickerCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  dateDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateDisplayText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: DARK_NAVY,
    flex: 1,
    marginStart: 8,
  },
  calendarToggleBtn: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  calendarToggleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: PRIMARY_BLUE,
  },
  quickDateChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  quickDateChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickDateChipSelected: {
    backgroundColor: PRIMARY_BLUE,
    borderColor: PRIMARY_BLUE,
  },
  quickDateChipText: {
    fontSize: 10.5,
    color: "#475569",
    fontWeight: "600",
  },
  quickDateChipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  calendarGridBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  calendarMonthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  calNavBtn: {
    padding: 4,
  },
  calMonthText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  calWeekdaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  calWeekdayText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#64748B",
    width: "13%",
    textAlign: "center",
  },
  calDaysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calDayEmpty: {
    width: "13%",
    height: 30,
  },
  calDayCell: {
    width: "13%",
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    marginVertical: 1,
  },
  calDayCellSelected: {
    backgroundColor: PRIMARY_BLUE,
  },
  calDayCellDisabled: {
    opacity: 0.3,
  },
  calDayNum: {
    fontSize: 11.5,
    fontWeight: "600",
    color: DARK_NAVY,
  },
  calDayNumSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  calDayNumDisabled: {
    color: "#94A3B8",
  },
  timeSlotSection: {
    marginBottom: 8,
  },
  timeSlotChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  timeSlotChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  timeSlotChipSelected: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  timeSlotChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
  },
  timeSlotChipTextSelected: {
    color: "#FFFFFF",
  },
  inputHelperText: {
    fontSize: 10.5,
    color: "#64748B",
    marginBottom: 6,
  },
  meetingPointChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  meetingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: "100%",
  },
  meetingChipSelected: {
    backgroundColor: "#0284C7",
    borderColor: "#0284C7",
  },
  meetingChipText: {
    fontSize: 10.5,
    color: "#0369A1",
    fontWeight: "600",
  },
  meetingChipTextSelected: {
    color: "#FFFFFF",
  },
  inputRow: {
    marginTop: 6,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 3,
  },
  inputField: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: DARK_NAVY,
  },
  inputFieldError: {
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: "600",
  },
  guestCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 8,
  },
  guestHelperText: {
    fontSize: 10.5,
    color: "#64748B",
  },
  priceBreakdownCard: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  priceBreakdownTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
    marginBottom: 6,
  },
  calcLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  calcLineLabel: {
    fontSize: 11.5,
    color: "#334155",
    flex: 1,
  },
  calcLineVal: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  calcDivider: {
    height: 1,
    backgroundColor: "#86EFAC",
    marginVertical: 6,
  },
  calcTotalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calcTotalLabel: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#166534",
  },
  calcTaxNote: {
    fontSize: 9.5,
    color: "#15803D",
  },
  calcTotalVal: {
    fontSize: 17,
    fontWeight: "800",
    color: "#166534",
  },
  checkoutSubmitBtn: {
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 14,
  },
  checkoutGradient: {
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutBtnContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkoutBtnText: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  // Profile Sheet Styles
  profileModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: "90%",
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  profileSheetContent: {
    paddingVertical: 12,
  },
  profileMainBox: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  profileBigAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  profileBigName: {
    fontSize: 16.5,
    fontWeight: "800",
    color: DARK_NAVY,
  },
  profileAreaText: {
    fontSize: 11.5,
    color: "#475569",
    marginTop: 2,
  },
  profileStarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  profileStarText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  certBadgesContainer: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  certBadgeItem: {
    flex: 1,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
  },
  certBadgeTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0369A1",
    marginTop: 3,
    textAlign: "center",
  },
  certBadgeSub: {
    fontSize: 8.5,
    color: "#64748B",
    marginTop: 1,
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: DARK_NAVY,
    marginTop: 12,
    marginBottom: 5,
  },
  sheetBioText: {
    fontSize: 12.5,
    color: "#475569",
    lineHeight: 18,
  },
  languagePillLarge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    marginEnd: 6,
    marginBottom: 6,
  },
  languageNameLarge: {
    fontSize: 11.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  languageLevelLarge: {
    fontSize: 9.5,
    color: "#64748B",
  },
  coveredSpotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  spotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  spotPillText: {
    fontSize: 11,
    color: PRIMARY_BLUE,
    fontWeight: "600",
  },
  reviewCardItem: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  reviewCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reviewAuthor: {
    fontSize: 11.5,
    fontWeight: "700",
    color: DARK_NAVY,
  },
  reviewRatingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  reviewRatingVal: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  reviewComment: {
    fontSize: 11.5,
    color: "#475569",
    marginTop: 3,
    lineHeight: 16,
  },
  reviewDateText: {
    fontSize: 9.5,
    color: "#94A3B8",
    marginTop: 3,
  },
  profileSheetActionsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
  },
  profileChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  profileChatBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: PRIMARY_BLUE,
  },
  profileCallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  profileCallBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#DC2626",
  },
  profileHireBtn: {
    flex: 1,
    backgroundColor: PRIMARY_BLUE,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHireBtnText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "700",
  },
  dualFieldRow: {
    flexDirection: "row",
  },
});

