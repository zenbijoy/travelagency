import { evaluateBargainOffer } from "@shopnojatra/shared";
import { BargainOfferRecord, BargainTurnMessage, EnrichedProduct } from "../types";

export interface BargainPresetOption {
  id: string;
  label: string;
  labelBn: string;
  discountPct: number;
  unitPriceBdt: number;
  minQty: number;
}

export function getBargainPresetOptions(
  product: EnrichedProduct,
  quantity: number
): BargainPresetOption[] {
  const base = product.price;
  const friendlyPrice = Math.max(product.minBargainPriceBdt, Math.round(base * 0.92));
  const bulkPrice = Math.max(product.minBargainPriceBdt, Math.round(base * 0.86));
  const boldPrice = Math.max(Math.round(base * 0.65), Math.round(product.minBargainPriceBdt * 0.95));

  return [
    {
      id: "friendly",
      label: "Friendly Offer (-8%)",
      labelBn: "সৌহার্দ্যমূলক অফার (-৮%)",
      discountPct: 8,
      unitPriceBdt: friendlyPrice,
      minQty: 1,
    },
    {
      id: "bulk",
      label: quantity >= 3 ? "Bulk Saver (-14%)" : "Smart Offer (-14%)",
      labelBn: quantity >= 3 ? "বাল্ক ছাড় (-১৪%)" : "স্মার্ট অফার (-১৪%)",
      discountPct: 14,
      unitPriceBdt: bulkPrice,
      minQty: 1,
    },
    {
      id: "bold",
      label: "Negotiate Floor",
      labelBn: "কারিগর ফ্লোর দরদাম",
      discountPct: Math.round(((base - boldPrice) / base) * 100),
      unitPriceBdt: boldPrice,
      minQty: 1,
    },
  ];
}

export function evaluateLocalBargainProposal(params: {
  product: EnrichedProduct;
  offeredUnitPriceBdt: number;
  quantity: number;
  buyerMessage?: string;
  existingOffer?: BargainOfferRecord;
}): BargainOfferRecord {
  const { product, offeredUnitPriceBdt, quantity, buyerMessage, existingOffer } = params;

  const evalResult = evaluateBargainOffer({
    listedUnitPricePaisa: Math.round(product.price * 100),
    minBargainPricePaisa: Math.round(product.minBargainPriceBdt * 100),
    offeredUnitPricePaisa: Math.round(offeredUnitPriceBdt * 100),
    quantity,
  });

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const roundNumber = existingOffer ? Math.min(5, existingOffer.roundNumber + 1) : 1;

  const counterBdt =
    evalResult.counterUnitPricePaisa !== null
      ? Math.round(evalResult.counterUnitPricePaisa / 100)
      : null;
  const agreedBdt =
    evalResult.agreedUnitPricePaisa !== null
      ? Math.round(evalResult.agreedUnitPricePaisa / 100)
      : null;

  let banglaReply = "";
  if (evalResult.status === "auto_accepted") {
    banglaReply = `কারিগর সমবায় আপনার ৳${agreedBdt} দর গ্রহণ করেছে! ২৪ ঘণ্টার জন্য বিশেষ মূল্য লক করা হলো।`;
  } else if (evalResult.status === "countered") {
    banglaReply = `${product.artisan.banglaName} পাল্টা অফার দিয়েছেন: প্রতি পিস ৳${counterBdt}। গ্রহণ করলে এই মূল্যে কার্টে যুক্ত হবে।`;
  } else if (evalResult.status === "rejected") {
    banglaReply = `দুঃখিত, ৳${offeredUnitPriceBdt} প্রস্তাবটি কাঁচামাল ও মজুরি খরচের (৫০%+) নিচে হওয়ায় গ্রহণ করা সম্ভব নয়।`;
  } else {
    banglaReply = `আপনার ৳${offeredUnitPriceBdt} অফারটি কারিগরের অনুমোদনের জন্য পাঠানো হয়েছে।`;
  }

  const newTurns: BargainTurnMessage[] = [
    ...(existingOffer?.messages || []),
    {
      id: `msg-b-${Date.now()}`,
      sender: "buyer",
      text: buyerMessage?.trim()
        ? `${buyerMessage.trim()} (অফার: ৳${offeredUnitPriceBdt} × ${quantity})`
        : `প্রস্তাবিত মূল্য: ৳${offeredUnitPriceBdt} × ${quantity}টি`,
      priceBdt: offeredUnitPriceBdt,
      timestamp: nowIso,
    },
    {
      id: `msg-a-${Date.now() + 1}`,
      sender: "artisan",
      text: banglaReply,
      priceBdt: agreedBdt ?? counterBdt ?? undefined,
      timestamp: nowIso,
    },
  ];

  return {
    id: existingOffer?.id || `brg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.id,
    sellerId: product.sellerId,
    productName: product.name,
    banglaName: product.bangla_name,
    quantity,
    listedUnitPriceBdt: product.price,
    offeredUnitPriceBdt,
    counterUnitPriceBdt: counterBdt,
    agreedUnitPriceBdt: agreedBdt,
    status: evalResult.status,
    roundNumber,
    buyerMessage,
    sellerResponse: banglaReply,
    messages: newTurns,
    expiresAt,
    acceptedAt: evalResult.status === "auto_accepted" ? nowIso : undefined,
    createdAt: existingOffer?.createdAt || nowIso,
    syncStatus: "local_only",
  };
}

export function acceptCounterOfferLocally(
  offer: BargainOfferRecord
): BargainOfferRecord {
  const agreedPrice = offer.counterUnitPriceBdt ?? offer.offeredUnitPriceBdt;
  const nowIso = new Date().toISOString();
  return {
    ...offer,
    status: "accepted",
    agreedUnitPriceBdt: agreedPrice,
    acceptedAt: nowIso,
    sellerResponse: `৳${agreedPrice} মূল্যে ডিল লক করা হয়েছে!`,
    messages: [
      ...offer.messages,
      {
        id: `msg-acc-${Date.now()}`,
        sender: "system",
        text: `ক্রেতা পাল্টা অফার ৳${agreedPrice} গ্রহণ করেছেন — মূল্য কার্টে লক হয়েছে।`,
        priceBdt: agreedPrice,
        timestamp: nowIso,
      },
    ],
  };
}
