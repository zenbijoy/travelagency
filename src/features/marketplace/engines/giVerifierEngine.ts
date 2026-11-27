import {
  CURATED_ENRICHED_PRODUCTS,
  CURATED_GI_CERTIFICATES,
  HERITAGE_DISTRICTS,
} from "../constants/catalog";
import {
  EnrichedProduct,
  GiCertificateVerificationResult,
} from "../types";

/**
 * Resolves a GI tag / QR string / DPDT registration number against the offline registry.
 * Supports formats like "SJ-GI-01", "SJ-GI-VERIFY|SJ-GI-01|...", "BD-GI-01/NRG", "GI-REG-BD-001/NRG".
 */
export function verifyGiCodeLocally(
  rawInput: string,
  catalogProducts: EnrichedProduct[] = CURATED_ENRICHED_PRODUCTS
): GiCertificateVerificationResult {
  let cleaned = (rawInput || "").trim().toUpperCase();
  if (cleaned.startsWith("SJ-GI-VERIFY|")) {
    const parts = cleaned.split("|");
    cleaned = parts[1] || cleaned;
  }

  if (!cleaned || cleaned.length < 4) {
    return {
      valid: false,
      certificateCode: rawInput.trim(),
      qrPayload: `SJ-GI-VERIFY|INVALID`,
      linkedProductsCount: 0,
      reason: "অনুগ্রহ করে বৈধ GI কোড লিখুন (যেমন: SJ-GI-01)",
      source: "offline_registry",
    };
  }

  // Exact certificate_code or registration number match
  const matched = Object.values(CURATED_GI_CERTIFICATES).find(
    (cert) =>
      cert.certificateCode.toUpperCase() === cleaned ||
      (cert.giRegistrationNumber || "").toUpperCase() === cleaned ||
      HERITAGE_DISTRICTS.some(
        (d) =>
          d.region === cert.region &&
          d.giCodes.some((c) => c.toUpperCase() === cleaned)
      )
  );

  if (matched) {
    const linkedCount = catalogProducts.filter(
      (p) =>
        p.giCode.toUpperCase() === matched.certificateCode.toUpperCase() ||
        p.region === matched.region
    ).length;

    return {
      ...matched,
      linkedProductsCount: Math.max(1, linkedCount),
      source: "offline_registry",
    };
  }

  // Fallback check against catalog products directly
  const productMatch = catalogProducts.find(
    (p) =>
      p.giCode.toUpperCase() === cleaned ||
      p.certificates.some((c) => c.code.toUpperCase() === cleaned)
  );

  if (productMatch) {
    return {
      valid: true,
      certificateId: productMatch.giCertificateId,
      certificateCode: productMatch.giCode,
      giRegistrationNumber: productMatch.certificates[0]?.code || productMatch.giCode,
      productTitle: productMatch.name,
      banglaTitle: productMatch.bangla_name,
      originDistrict: productMatch.district,
      region: productMatch.region,
      issuerAuthority:
        productMatch.certificates[0]?.issuer || "DPDT Bangladesh & ShopnoJatra",
      badgeType: productMatch.certificates[0]?.badgeType || "gi",
      artisanGuild: productMatch.artisan.cooperative,
      issuedDate: "2024-01-15",
      expiresDate: null,
      verificationStatus: "active",
      provenanceStory: productMatch.artisan.story,
      craftMethod: productMatch.dimensionsMeta.craftMethod,
      qrSignature: `SHA256:LOCAL-${productMatch.id.slice(-8).toUpperCase()}`,
      qrPayload: `SJ-GI-VERIFY|${productMatch.giCode}|${productMatch.district.toUpperCase()}`,
      linkedProductsCount: 1,
      source: "offline_registry",
    };
  }

  return {
    valid: false,
    certificateCode: cleaned,
    qrPayload: `SJ-GI-VERIFY|${cleaned}|UNVERIFIED`,
    linkedProductsCount: 0,
    reason: `সনদ কোড "${cleaned}" বাংলাদেশ ভৌগোলিক নির্দেশক (GI) রেজিস্ট্রিতে পাওয়া যায়নি।`,
    source: "offline_registry",
  };
}
