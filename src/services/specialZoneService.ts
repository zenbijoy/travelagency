/**
 * Special Zone Intelligence, Military Escorts & Environmental Permits Service
 *
 * Dedicated to unique geographical travel conditions in Bangladesh:
 * 1. Sajek Valley Military Convoy Escort (বাঘাইহাট আর্মি ক্যাম্প এসকর্ট ট্র্যাকার)
 * 2. Saint Martin Island Environmental Entry Pass & Vessel Restrictions
 * 3. Tanguar Haor Riverine Safety & Houseboat Regulations
 */

export interface ArmyEscortSchedule {
  zoneName: string;
  zoneNameBn: string;
  checkpointLocation: string;
  checkpointLocationBn: string;
  firstEscortTime: string; // "10:00 AM"
  firstReportingTime: string; // "09:30 AM"
  secondEscortTime: string; // "02:00 PM"
  secondReportingTime: string; // "01:30 PM"
  mandatoryGuidelinesBn: string[];
  helpline: string;
}

export interface EnvironmentalPermitRequirement {
  destination: string;
  destinationBn: string;
  authority: string;
  isPermitMandatory: boolean;
  permitFeeBdt: number;
  entryGateways: string[];
  keyRulesBn: string[];
  officialNoticeUrl?: string;
}

export interface NextEscortStatus {
  escortLabel: string;
  escortTime: string;
  reportingTime: string;
  minutesRemaining: number;
  isMissedForToday: boolean;
  statusColor: string;
  statusTextBn: string;
}

export const SAJEK_MILITARY_ESCORT: ArmyEscortSchedule = {
  zoneName: "Sajek Valley (সাজেক ভ্যালি)",
  zoneNameBn: "সাজেক ভ্যালি স্পেশাল সিকিউরিটি জোন",
  checkpointLocation: "Baghaihat Army Camp, Rangamati",
  checkpointLocationBn: "বাঘাইহাট সেনা ক্যাম্প চেকপোস্ট, রাঙ্গামাটি",
  firstEscortTime: "10:00 AM",
  firstReportingTime: "09:30 AM",
  secondEscortTime: "02:00 PM",
  secondReportingTime: "01:30 PM",
  mandatoryGuidelinesBn: [
    "বাঘাইহাট চেকপোস্টে পৌঁছানোর সর্বশেষ সময়: সকাল ০৯:৩০ এবং দুপুর ০১:৩০।",
    "সেনাবাহিনী এসকর্ট কনভয় ছাড়া কোনো যানবাহন সাজেক প্রবেশ বা প্রস্থান করতে পারবে না।",
    "চাঁদের গাড়ি ও ড্রাইভারের রেজিষ্ট্রেশন ও বৈধ টোকেন চেকপোস্টে প্রদর্শন বাধ্যতামূলক।",
    "কনভয় চলার সময় ওভারটেকিং সম্পূর্ণ নিষিদ্ধ এবং গতিসীমা ৩০ কিমি/ঘণ্টা বজায় রাখতে হবে।",
    "সন্ধ্যার পর সাজেক রোডে অননুমোদিত পদচারণা বা গাড়ি চলাচল নিষিদ্ধ।"
  ],
  helpline: "+8801823000000",
};

export const SAINT_MARTIN_PERMIT: EnvironmentalPermitRequirement = {
  destination: "Saint Martin's Island",
  destinationBn: "সেন্টমার্টিন প্রবাল দ্বীপ",
  authority: "Ministry of Environment & BIWTA",
  isPermitMandatory: true,
  permitFeeBdt: 200,
  entryGateways: ["Nuniar Chhara Ghat, Cox's Bazar", "Teknaf Damdamia Ghat"],
  keyRulesBn: [
    "পরিবেশ অধিদপ্তরের অনুমোদিত ডিজিটাল ট্রাভেলার্স পাস (QR Code) প্রদর্শন বাধ্যতামূলক।",
    "দ্বীপে এককালীন ব্যবহার্য প্লাস্টিক বোতল, পলিথিন ও চিপসের প্যাকেট সম্পূর্ণ নিষিদ্ধ।",
    "প্রবাল পাথর, শামুক বা সামুদ্রিক জীব সংগ্রহ আইনত দণ্ডনীয় অপরাধ।",
    "সরকারি নির্দেশনার বাইরে অনুমতিহীন স্থানে রাতে ক্যাম্পিং বা সাউন্ড সিস্টেম বাজানো নিষিদ্ধ।"
  ],
  officialNoticeUrl: "https://moef.gov.bd",
};

export const TANGUAR_HAOR_SAFETY: EnvironmentalPermitRequirement = {
  destination: "Tanguar Haor, Sunamganj",
  destinationBn: "টাঙ্গুয়ার হাওড় রামসার সাইট",
  authority: "Sunamganj District Administration",
  isPermitMandatory: false,
  permitFeeBdt: 0,
  entryGateways: ["Tahirpur Ghat", "Shaheb Bari Ghat"],
  keyRulesBn: [
    "হাউসবোটে প্রতি যাত্রীর জন্য বিএসটিআই অনুমোদিত লাইফ জ্যাকেট থাকা বাধ্যতামূলক।",
    "হাওড়ের পানিতে ইঞ্জিন অয়েল, খাবার অপচয় বা প্লাস্টিক বর্জ্য ফেলা কঠোরভাবে নিষিদ্ধ।",
    "রাতে নির্দিষ্ট ওয়াচ টাওয়ার পয়েন্ট ছাড়া গভীর হাওড়ে বোট নোঙর করা ঝুঁকিপূর্ণ ও নিষিদ্ধ।"
  ],
};

export const specialZoneService = {
  /**
   * Calculates real-time countdown to the next Baghaihat Army Escort for Sajek Valley
   * in Dhaka local time (BST UTC+6).
   */
  getNextSajekEscort(): NextEscortStatus {
    const now = new Date();
    // Dhaka Time offset
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const dhakaHours = (utcHours + 6) % 24;
    const currentMinutesFromMidnight = dhakaHours * 60 + utcMinutes;

    // Escort times in minutes from midnight (Dhaka time)
    const morningReporting = 9 * 60 + 30; // 09:30 AM (570 min)
    const morningEscort = 10 * 60; // 10:00 AM (600 min)
    const afternoonReporting = 13 * 60 + 30; // 01:30 PM (810 min)
    const afternoonEscort = 14 * 60; // 02:00 PM (840 min)

    if (currentMinutesFromMidnight <= morningEscort) {
      const diff = morningEscort - currentMinutesFromMidnight;
      return {
        escortLabel: "সকালের প্রথম এসকর্ট (10:00 AM)",
        escortTime: "10:00 AM",
        reportingTime: "09:30 AM",
        minutesRemaining: diff,
        isMissedForToday: false,
        statusColor: diff <= 60 ? "#EF4444" : "#10B981",
        statusTextBn: `প্রথম এসকর্ট ছাড়তে বাকি ${Math.floor(diff / 60)} ঘণ্টা ${diff % 60} মিনিট। বাঘাইহাটে রিপোর্টিং করুন ০৯:৩০ মিনিটে।`,
      };
    } else if (currentMinutesFromMidnight <= afternoonEscort) {
      const diff = afternoonEscort - currentMinutesFromMidnight;
      return {
        escortLabel: "দুপুরের দ্বিতীয় এসকর্ট (02:00 PM)",
        escortTime: "02:00 PM",
        reportingTime: "01:30 PM",
        minutesRemaining: diff,
        isMissedForToday: false,
        statusColor: diff <= 60 ? "#F59E0B" : "#10B981",
        statusTextBn: `দ্বিতীয় এসকর্ট ছাড়তে বাকি ${Math.floor(diff / 60)} ঘণ্টা ${diff % 60} মিনিট। বাঘাইহাটে পৌঁছান ০১:৩০ মিনিটে।`,
      };
    } else {
      return {
        escortLabel: "আজকের সকল এসকর্ট সম্পন্ন",
        escortTime: "কাল সকাল 10:00 AM",
        reportingTime: "কাল সকাল 09:30 AM",
        minutesRemaining: 0,
        isMissedForToday: true,
        statusColor: "#6B7280",
        statusTextBn: "আজকের জন্য সেনাবাহিনীর এসকর্ট সমাপ্ত হয়েছে। নিরাপত্তার স্বার্থে খাগড়াছড়িতে রাত্রিযাপন করুন।",
      };
    }
  },

  /**
   * Check if a destination has active military or environmental restrictions
   */
  getZoneAdvisory(destinationCity: string): EnvironmentalPermitRequirement | null {
    const query = destinationCity.toLowerCase();
    if (query.includes("sajek") || query.includes("baghaihat")) {
      return {
        destination: "Sajek Valley",
        destinationBn: "সাজেক ভ্যালি",
        authority: "Bangladesh Army (বাঘাইহাট জোন)",
        isPermitMandatory: true,
        permitFeeBdt: 0,
        entryGateways: ["Baghaihat Army Checkpost"],
        keyRulesBn: SAJEK_MILITARY_ESCORT.mandatoryGuidelinesBn,
      };
    }
    if (query.includes("martin") || query.includes("saint")) {
      return SAINT_MARTIN_PERMIT;
    }
    if (query.includes("tanguar") || query.includes("haor")) {
      return TANGUAR_HAOR_SAFETY;
    }
    return null;
  },
};
