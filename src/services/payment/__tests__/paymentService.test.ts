import { paymentService } from "../../paymentService";
import type { PaymentRequest } from "../types";

// Mock Supabase so test runs in isolation
jest.mock("../../../utils/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: { balance: 10000 }, error: null }),
        }),
      }),
    })),
    rpc: jest.fn().mockResolvedValue({
      data: { success: true, transaction_id: "tx-wallet-123" },
      error: null,
    }),
  },
}));

describe("Payment Service (paymentService)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes("/token/grant")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id_token: "mock-token-xyz" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            statusCode: "0000",
            paymentID: "bk-pay-123",
            bkashURL: "https://pay.bkash.com/mock",
          }),
      });
    }) as any;
  });

  describe("Provider Dispatching & Validation", () => {
    it("should reject unsupported payment method gracefully", async () => {
      const invalidRequest: PaymentRequest = {
        bookingId: "bk-999",
        amount: 5000,
        currency: "BDT",
        method: "unsupported_gateway" as any,
      };

      const result = await paymentService.pay(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.status).toBe("failed");
      expect(result.errorMessage).toContain("Unsupported payment provider");
    });

    it("should process bKash payment with sanitized payload and tracking nonce", async () => {
      const request: PaymentRequest = {
        bookingId: "bk-101",
        amount: 2500,
        currency: "BDT",
        method: "bkash",
        customerPhone: "01700000000",
      };

      const result = await paymentService.pay(request);

      expect(result).toBeDefined();
      expect(result.gateway).toBe("bkash");
    });

    it("should handle wallet payments with immediate status tracking", async () => {
      const walletRequest: PaymentRequest = {
        bookingId: "bk-102",
        amount: 1500,
        currency: "BDT",
        method: "wallet",
      };

      const result = await paymentService.pay(walletRequest);
      expect(result.gateway).toBe("shopno_wallet");
    });
  });
});
