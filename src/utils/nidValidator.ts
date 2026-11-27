/**
 * Bangladesh National ID (NID) & Passenger Identity Validation Utility
 *
 * Enforces compliance with Bangladesh Railway and Aviation Security:
 * - "টিকিট যার, ভ্রমণ তার" (Ticket must match traveler identity)
 * - Smart NID: 10 digits
 * - Legacy NID / Birth Certificate: 13 or 17 digits
 */

export interface NidValidationResult {
  isValid: boolean;
  type: "smart_nid" | "legacy_nid" | "birth_certificate" | "invalid";
  errorMessageBn?: string;
  normalizedNumber?: string;
}

export function validateBangladeshNid(nidInput: string): NidValidationResult {
  if (!nidInput) {
    return {
      isValid: false,
      type: "invalid",
      errorMessageBn: "জাতীয় পরিচয়পত্র (NID) বা জন্ম নিবন্ধন নম্বর প্রদান করুন।",
    };
  }

  // Remove spaces and hyphens
  const cleaned = nidInput.trim().replace(/[-\s]/g, "");

  // Must consist solely of numeric digits
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      type: "invalid",
      errorMessageBn: "NID নম্বরটি শুধুমাত্র ইংরেজি সংখ্যায় (0-9) হতে হবে।",
    };
  }

  // 1. Smart NID (10 Digits)
  if (cleaned.length === 10) {
    return {
      isValid: true,
      type: "smart_nid",
      normalizedNumber: cleaned,
    };
  }

  // 2. Legacy NID (17 Digits - Year of Birth + 13 digits)
  if (cleaned.length === 17) {
    const yearPrefix = parseInt(cleaned.slice(0, 4), 10);
    const currentYear = new Date().getFullYear();
    if (yearPrefix < 1920 || yearPrefix > currentYear) {
      return {
        isValid: false,
        type: "invalid",
        errorMessageBn: "১৭ ডিজিটের NID-এর প্রথম ৪ ডিজিট বৈধ জন্মসাল (১৯২০-বর্তমান) হতে হবে।",
      };
    }
    return {
      isValid: true,
      type: "legacy_nid",
      normalizedNumber: cleaned,
    };
  }

  // 3. 13 Digit Old NID (Can be upgraded to 17 digits with birth year)
  if (cleaned.length === 13) {
    return {
      isValid: true,
      type: "legacy_nid",
      normalizedNumber: cleaned,
      errorMessageBn: "১৩ ডিজিটের সনাতন NID। প্রয়োজনবোধে শুরুতে ৪ ডিজিটের জন্মসাল যোগ করুন।",
    };
  }

  return {
    isValid: false,
    type: "invalid",
    errorMessageBn: "NID নম্বর অবশ্যই ১০ ডিজিট (স্মার্ট কার্ড) অথবা ১৭ ডিজিট হতে হবে।",
  };
}

/**
 * Passenger details validation for Bangladesh transit compliance
 */
export function validateTravelerProfile(passenger: {
  firstName: string;
  lastName: string;
  nidOrPassport?: string;
  phone?: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!passenger.firstName?.trim() || passenger.firstName.trim().length < 2) {
    errors.push("যাত্রীর প্রথম নাম (কমপক্ষে ২ অক্ষর) আবশ্যক।");
  }

  if (!passenger.lastName?.trim() || passenger.lastName.trim().length < 2) {
    errors.push("যাত্রীর পদবি/শেষ নাম আবশ্যক।");
  }

  if (passenger.phone) {
    const cleanedPhone = passenger.phone.replace(/[-\s+]/g, "");
    if (!/^(8801|01)[3-9]\d{8}$/.test(cleanedPhone)) {
      errors.push("সঠিক বাংলাদেশি মোবাইল নম্বর (01XXXXXXXXX) প্রদান করুন।");
    }
  }

  if (passenger.nidOrPassport) {
    const nidRes = validateBangladeshNid(passenger.nidOrPassport);
    if (!nidRes.isValid && passenger.nidOrPassport.length < 6) {
      errors.push("বৈধ NID (১০ বা ১৭ ডিজিট) অথবা পাসপোর্ট নম্বর প্রদান করুন।");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
