import {
  validateNotificationDeepLink,
  resolveSafeNotificationRoute,
  resolveNotificationTapRoute,
} from "../notificationDeepLinkRegistry";
import { ROUTES } from "../../../constants/routes";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("../../../utils/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe("notificationDeepLinkRegistry", () => {
  it("allows internal Expo Router paths from the typed registry", () => {
    const res = validateNotificationDeepLink("/screens/flights?from=DAC&to=CXB");
    expect(res.valid).toBe(true);
    expect(res.normalizedRoute).toBe("/screens/flights?from=DAC&to=CXB");

    const portal = validateNotificationDeepLink("/hotel/bookings");
    expect(portal.valid).toBe(true);
    expect(portal.normalizedRoute).toBe("/hotel/bookings");
  });

  it("remaps legacy aliases cleanly to canonical Expo Router paths", () => {
    const res = validateNotificationDeepLink("/screens/community");
    expect(res.valid).toBe(true);
    expect(res.normalizedRoute).toBe(ROUTES.TABS.COMMUNITY);
  });

  it("rejects open redirects, dangerous schemes, and path traversal", () => {
    const evilHttps = validateNotificationDeepLink("https://evil.example.com/phish");
    expect(evilHttps.valid).toBe(false);
    expect(evilHttps.isExternalRejected).toBe(true);
    expect(evilHttps.normalizedRoute).toBe(ROUTES.SCREENS.NOTIFICATIONS);

    const protocolRel = validateNotificationDeepLink("//attacker.com/login");
    expect(protocolRel.valid).toBe(false);
    expect(protocolRel.normalizedRoute).toBe(ROUTES.SCREENS.NOTIFICATIONS);

    const jsScheme = validateNotificationDeepLink("javascript:alert(1)");
    expect(jsScheme.valid).toBe(false);

    const traversal = validateNotificationDeepLink("/screens/../admin");
    expect(traversal.valid).toBe(false);

    expect(resolveSafeNotificationRoute("https://evil.com")).toBe(ROUTES.SCREENS.NOTIFICATIONS);
  });

  it("resolves push notification tap payloads safely through registry", () => {
    expect(
      resolveNotificationTapRoute({ deep_link: "/screens/price-alerts" })
    ).toBe("/screens/price-alerts");

    expect(
      resolveNotificationTapRoute({ deep_link: "https://evil.com/steal" })
    ).toBe(ROUTES.SCREENS.NOTIFICATIONS);

    expect(
      resolveNotificationTapRoute({ type: "community" })
    ).toBe(ROUTES.TABS.COMMUNITY);

    expect(
      resolveNotificationTapRoute({
        type: "price_alert",
        service_type: "train",
        origin: "Dhaka",
        destination: "Sylhet",
      })
    ).toBe("/screens/trains?from=Dhaka&to=Sylhet&date=");
  });
});
