import { z } from "zod";

export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

export const deliveryTierFormSchema = z.enum([
  "shopno_express",
  "hotel_concierge",
  "inter_district_courier",
  "same_day",
]);

export const paymentMethodFormSchema = z.enum([
  "cod",
  "wallet",
  "bkash",
  "nagad",
  "rocket",
  "card",
]);

export const checkoutDeliveryFormSchema = z
  .object({
    recipientName: z
      .string()
      .trim()
      .min(2, "প্রাপকের পুরো নাম লিখুন (কমপক্ষে ২ অক্ষর)")
      .max(80, "নাম ৮০ অক্ষরের মধ্যে হতে হবে"),
    recipientPhone: z
      .string()
      .trim()
      .regex(
        BD_PHONE_REGEX,
        "সঠিক ১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর দিন (যেমন: 01712345678)"
      ),
    deliveryAddress: z
      .string()
      .trim()
      .min(5, "পূর্ণাঙ্গ ডেলিভারি ঠিকানা লিখুন (কমপক্ষে ৫ অক্ষর)")
      .max(240, "ঠিকানা ২৪০ অক্ষরের মধ্যে হতে হবে"),
    deliveryDistrict: z
      .string()
      .trim()
      .min(2, "জেলা নির্বাচন করুন"),
    deliveryTier: deliveryTierFormSchema,
    paymentMethod: paymentMethodFormSchema,
    hotelName: z.string().trim().optional().default(""),
    hotelRoomNumber: z.string().trim().optional().default(""),
    promoCode: z.string().trim().max(32).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.deliveryTier === "hotel_concierge") {
      if (!data.hotelName || data.hotelName.trim().length < 2) {
        ctx.addIssue({
          code: "custom",
          path: ["hotelName"],
          message: "হোটেলের নাম উল্লেখ করুন (Hotel Drop-off এর জন্য আবশ্যক)",
        });
      }
      if (!data.hotelRoomNumber || data.hotelRoomNumber.trim().length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["hotelRoomNumber"],
          message: "হোটেল রুম নম্বর লিখুন (যেমন: 402)",
        });
      }
    }
  });

export type CheckoutDeliveryFormValues = z.infer<typeof checkoutDeliveryFormSchema>;

export const bargainOfferFormSchema = z.object({
  productId: z.string().min(1),
  offeredUnitPriceBdt: z
    .number()
    .finite()
    .positive("অফার মূল্য ০ এর বেশি হতে হবে"),
  quantity: z
    .number()
    .int()
    .min(1, "সর্বনিম্ন পরিমাণ ১টি")
    .max(50, "সর্বোচ্চ ৫০টি একসাথে অফার করা যাবে"),
  buyerMessage: z.string().trim().max(240, "বার্তা ২৪০ অক্ষরের মধ্যে লিখুন").optional(),
});

export type BargainOfferFormValues = z.infer<typeof bargainOfferFormSchema>;

export const giftHamperFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "গিফট হ্যাম্পারের শিরোনাম লিখুন")
    .max(80),
  recipientName: z
    .string()
    .trim()
    .min(2, "প্রাপকের নাম লিখুন")
    .max(80),
  giftMessage: z
    .string()
    .trim()
    .max(300, "উপহারের বার্তা সর্বোচ্চ ৩০০ অক্ষর")
    .optional()
    .default(""),
  ribbonStyle: z.enum([
    "jamdani_gold",
    "terracotta_jute",
    "sundarbans_emerald",
    "nakshi_crimson",
  ]),
  itemProductIds: z
    .array(z.string().min(1))
    .min(2, "হ্যাম্পার বক্স তৈরি করতে কমপক্ষে ২টি পণ্য নির্বাচন করুন")
    .max(5, "একটি হ্যাম্পারে সর্বোচ্চ ৫টি পণ্য রাখা যাবে"),
});

export type GiftHamperFormValues = z.infer<typeof giftHamperFormSchema>;

export const sellerListingFormSchema = z
  .object({
    name: z.string().trim().min(2, "ইংরেজি বা সংক্ষিপ্ত নাম দিন").max(120),
    bangla_name: z.string().trim().min(2, "পণ্যের বাংলা নাম লিখুন").max(140),
    region: z.string().trim().min(2, "অঞ্চল নির্বাচন করুন"),
    district: z.string().trim().min(2, "জেলা লিখুন").optional(),
    category: z.enum([
      "food",
      "handicraft",
      "clothing",
      "tea_honey",
      "heritage_hamper",
    ]),
    price: z
      .number()
      .finite()
      .min(20, "মূল্য কমপক্ষে ৳২০ হতে হবে")
      .max(250000, "মূল্য ৳২,৫০,০০০ এর বেশি হতে পারবে না"),
    min_bargain_price_bdt: z.number().finite().positive().optional(),
    bargain_enabled: z.boolean().default(true),
    weight_or_unit: z.string().trim().min(1, "ওজন বা একক লিখুন"),
    weight_grams: z.number().int().min(50).max(50000).default(500),
    stock_quantity: z.number().int().min(0).max(10000).default(20),
    seller_name: z.string().trim().min(2, "কারিগর বা সমবায়ের নাম দিন"),
    seller_phone: z
      .string()
      .trim()
      .regex(BD_PHONE_REGEX, "সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন"),
    description: z
      .string()
      .trim()
      .min(10, "পণ্যের বিবরণ কমপক্ষে ১০ অক্ষরের হতে হবে")
      .max(1000),
  })
  .superRefine((data, ctx) => {
    if (
      data.min_bargain_price_bdt !== undefined &&
      data.min_bargain_price_bdt > data.price
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min_bargain_price_bdt"],
        message: "সর্বনিম্ন বার্গেন মূল্য বিক্রয় মূল্যের চেয়ে বেশি হতে পারবে না",
      });
    }
  });

export type SellerListingFormValues = z.infer<typeof sellerListingFormSchema>;

export const giVerificationQuerySchema = z.object({
  certificateCode: z
    .string()
    .trim()
    .min(4, "বৈধ GI কোড লিখুন (যেমন: SJ-GI-01 বা BD-GI-01/NRG)")
    .max(60),
});

export const productReviewFormSchema = z.object({
  rating: z.number().min(1).max(5),
  author: z.string().trim().min(2, "আপনার নাম লিখুন").max(60),
  location: z.string().trim().min(2, "আপনার এলাকা লিখুন").max(60),
  title: z.string().trim().max(80).optional(),
  comment: z
    .string()
    .trim()
    .min(6, "কমপক্ষে ৬ অক্ষরের অভিজ্ঞতা লিখুন")
    .max(500),
});

export const productQuestionFormSchema = z.object({
  author: z.string().trim().min(2, "নাম লিখুন").max(60),
  question: z
    .string()
    .trim()
    .min(5, "প্রশ্ন কমপক্ষে ৫ অক্ষরের হতে হবে")
    .max(300),
});
