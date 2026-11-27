import { describe, expect, it } from "vitest";
import { getDestinations, searchFlights, searchHotels, submitBooking } from "./api";
import { serializeJsonLd } from "./seo";

describe("public travel API adapter", () => {
  it("returns editorial destination content", async () => {
    const destinations = await getDestinations();
    expect(destinations.length).toBeGreaterThan(0);
  });

  it("does not fabricate flight inventory", async () => {
    await expect(searchFlights()).resolves.toEqual([]);
  });

  it("does not fabricate hotel inventory without a city", async () => {
    await expect(searchHotels()).resolves.toEqual([]);
  });

  it("rejects checkout until a server-generated quote is supported", async () => {
    await expect(
      submitBooking({
        productType: "hotel",
        productId: "hotel-1",
        productTitle: "Example Hotel",
        destinationCity: "Dhaka",
        startDate: "2026-12-05",
        guestsCount: 1,
        passengers: [],
        paymentMethod: "bkash",
        subtotalBDT: 100,
        discountBDT: 0,
        vatTaxBDT: 0,
        totalBDT: 100,
      }),
    ).rejects.toThrow("server-generated, verifiable price quote");
  });

  it("escapes script tags in structured data", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain(
      "</script>",
    );
  });
});
