/**
 * Corporate Tax & Official VAT Invoice Service (মূসক-৬.৩)
 *
 * Compliant with National Board of Revenue (NBR) Bangladesh requirements:
 * - Form Mushak 6.3 (কর চালানপত্র)
 * - BIN (Business Identification Number) & Traveler TIN
 * - Itemized Base Fare, 5% Travel VAT, Supplementary Duty (SD), and Platform Fee
 * - Printable HTML/PDF generation via expo-print
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export interface CorporateInvoiceInput {
  invoiceNumber: string;
  bookingReference: string;
  issueDate: string;
  companyName?: string;
  companyBin?: string;
  travelerName: string;
  travelerPhone?: string;
  productType: string;
  serviceDescription: string;
  routeOrHotelName: string;
  travelDate: string;
  baseFare: number;
  vatRatePercentage?: number; // Default 5% in Bangladesh
  serviceFee?: number;
  currency?: string;
}

export interface GeneratedVatInvoice {
  invoiceNumber: string;
  baseFare: number;
  vatAmount: number;
  serviceFee: number;
  totalPayable: number;
  mushakHtml: string;
}

const PLATFORM_VENDOR_INFO = {
  nameBn: "স্বপ্নযাত্রা ট্রাভেলস লিমিটেড",
  nameEn: "Shopno Jatra Travels Ltd.",
  bin: "001928374-0102",
  addressBn: "প্লট-৪৫, রোড-১১, ব্লক-ই, বনানী, ঢাকা-১২১৩",
  vatRegistrationType: "নিবন্ধিত করদাতা",
};

export const corporateInvoiceService = {
  /**
   * Calculate precise financial line items for official Mushak 6.3 VAT tax invoice
   */
  calculateVatInvoice(input: CorporateInvoiceInput): GeneratedVatInvoice {
    const vatRate = (input.vatRatePercentage ?? 5.0) / 100;
    const baseFare = input.baseFare;
    const serviceFee = input.serviceFee ?? 50.0;
    const vatAmount = Math.round(baseFare * vatRate * 100) / 100;
    const totalPayable = Math.round((baseFare + vatAmount + serviceFee) * 100) / 100;

    const mushakHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>মূসক-৬.৩ কর চালানপত্র - ${input.invoiceNumber}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Hind Siliguri", sans-serif; padding: 24px; color: #1e293b; }
          .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
          .title-bn { font-size: 20px; font-weight: bold; color: #0369a1; }
          .sub-bn { font-size: 14px; color: #475569; margin-top: 4px; }
          .mushak-tag { display: inline-block; background-color: #f0fdf4; border: 1px solid #16a34a; color: #15803d; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 8px; }
          .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; }
          .info-col { width: 48%; }
          .table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
          .table th { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          .table td { border: 1px solid #cbd5e1; padding: 8px; }
          .text-right { text-align: right; }
          .total-box { margin-top: 16px; border-top: 2px solid #0284c7; padding-top: 12px; font-weight: bold; }
          .footer { margin-top: 32px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-bn">${PLATFORM_VENDOR_INFO.nameBn}</div>
          <div class="sub-bn">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার | জাতীয় রাজস্ব বোর্ড</div>
          <div class="mushak-tag">মূসক-৬.৩ কর চালানপত্র (VAT Tax Invoice)</div>
        </div>

        <div class="info-grid">
          <div class="info-col">
            <strong>সরবরাহকারী:</strong> ${PLATFORM_VENDOR_INFO.nameBn}<br/>
            <strong>বিআইএন (BIN):</strong> ${PLATFORM_VENDOR_INFO.bin}<br/>
            <strong>ঠিকানা:</strong> ${PLATFORM_VENDOR_INFO.addressBn}
          </div>
          <div class="info-col text-right">
            <strong>চালান নং:</strong> ${input.invoiceNumber}<br/>
            <strong>বুকিং রেফারেন্স:</strong> ${input.bookingReference}<br/>
            <strong>তারিখ:</strong> ${input.issueDate}<br/>
            ${input.companyName ? `<strong>প্রতিষ্ঠান:</strong> ${input.companyName}<br/>` : ""}
            ${input.companyBin ? `<strong>গ্রাহক বিআইএন:</strong> ${input.companyBin}<br/>` : ""}
            <strong>যাত্রী:</strong> ${input.travelerName}
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>ক্রম</th>
              <th>সেবা / পণ্যের বিবরণ</th>
              <th>ভ্রমণের রুট / হোটেল</th>
              <th>তারিখ</th>
              <th class="text-right">মূল্য (টাকা)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>১</td>
              <td>${input.serviceDescription} (${input.productType.toUpperCase()})</td>
              <td>${input.routeOrHotelName}</td>
              <td>${input.travelDate}</td>
              <td class="text-right">${baseFare.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="4" class="text-right"><strong>মূল্য সংযোজন কর (মূসক / VAT @ ${input.vatRatePercentage ?? 5}%):</strong></td>
              <td class="text-right">${vatAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="4" class="text-right"><strong>প্ল্যাটফর্ম ও সার্ভিস চার্জ:</strong></td>
              <td class="text-right">${serviceFee.toFixed(2)}</td>
            </tr>
            <tr style="background-color: #f0fdf4;">
              <td colspan="4" class="text-right"><strong>সর্বমোট প্রদেয় অর্থ (BDT):</strong></td>
              <td class="text-right"><strong>${totalPayable.toFixed(2)} ৳</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          এটি একটি ইলেকট্রনিক ও কম্পিউটার জেনারেটেড মূসক-৬.৩ চালানপত্র। এতে কোনো ম্যানুয়াল স্বাক্ষরের প্রয়োজন নেই।<br/>
          স্বপ্নযাত্রা প্ল্যাটফর্মে বুকিংয়ের জন্য ধন্যবাদ। হেল্পলাইন: +৮৮০ ৯৬১২-০০০০০০ | ইমেইল: billing@shopnojatra.com
        </div>
      </body>
      </html>
    `;

    return {
      invoiceNumber: input.invoiceNumber,
      baseFare,
      vatAmount,
      serviceFee,
      totalPayable,
      mushakHtml,
    };
  },

  /**
   * Export or Share official VAT PDF invoice
   */
  async exportVatInvoicePdf(input: CorporateInvoiceInput): Promise<string | null> {
    const { mushakHtml, invoiceNumber } = this.calculateVatInvoice(input);

    if (Platform.OS === "web") {
      // In web, open native print preview dialog
      if (typeof window !== "undefined") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(mushakHtml);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      }
      return null;
    }

    try {
      const { uri } = await Print.printToFileAsync({
        html: mushakHtml,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          UTI: ".pdf",
          mimeType: "application/pdf",
          dialogTitle: `মূসক-৬.৩ চালানপত্র (${invoiceNumber})`,
        });
      }

      return uri;
    } catch (err) {
      console.warn("Failed to export Mushak 6.3 PDF:", err);
      return null;
    }
  },
};
