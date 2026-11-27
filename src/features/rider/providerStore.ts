import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cachedStateStorage } from "@/store/storage";
import { supabase } from "@/utils/supabase";
import { contractService, Contract, ContractType } from "@/services/contract/contractService";
import { photonGeocoder } from "@/services/location/photonGeocoder";
import { haversineDistanceKm } from "@/features/rider/calculators";
import { useRiderStore } from "@/store/riderStore";

export type ServiceCategory =
  | "Tour Guide"
  | "Car Rental"
  | "Restaurant"
  | "Event"
  | "Photographer"
  | "Local Expert";

export type PriceType = "hourly" | "fixed" | "per person";

export interface ProviderServiceItem {
  id: string;
  title: string;
  category: ServiceCategory;
  priceBdt: number;
  priceType: PriceType;
  duration: string;
  maxGroup: number;
  area: string;
  description: string;
  certifications: string;
  instantBooking: boolean;
  status: "Active" | "Inactive";
  photoUrls: string[];
  createdAt: string;
}

export interface ProviderBookingItem {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceTitle: string;
  dateIso: string; // YYYY-MM-DD
  timeSlot: string;
  location: string;
  status: "available" | "booked" | "blocked" | "pending";
  amountPaisa: number;
}

export interface ProviderAvailabilitySlot {
  id: string;
  dayOfWeek?: string;
  startTime: string;
  endTime: string;
  blockedRange?: { fromDate: string; toDate: string };
}

export interface RouteWaypoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  etaMinutes: number;
  distanceKmFromPrev: number;
}

export interface ProviderStaffMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  status: "on_duty" | "standby" | "off";
}

export interface ProviderMaintenanceLog {
  id: string;
  assetName: string;
  issue: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export interface ProviderHubState {
  providerId: string;
  providerName: string;
  verified: boolean;
  rating: number;
  isOnline: boolean;
  services: ProviderServiceItem[];
  bookings: ProviderBookingItem[];
  slots: ProviderAvailabilitySlot[];
  blockedDates: Record<string, boolean>; // YYYY-MM-DD -> true
  waypoints: RouteWaypoint[];
  contracts: Contract[];
  staff: ProviderStaffMember[];
  maintenanceLogs: ProviderMaintenanceLog[];
  portfolioUris: string[];
  isHydrated: boolean;
  isLoading: boolean;

  hydrateProviderHub: () => Promise<void>;
  toggleOnline: () => Promise<void>;
  addService: (input: Omit<ProviderServiceItem, "id" | "createdAt" | "status">) => Promise<void>;
  toggleServiceStatus: (id: string) => void;
  addPortfolioPhoto: (uri: string) => void;
  addAvailabilitySlot: (startTime: string, endTime: string, days?: string[]) => void;
  removeAvailabilitySlot: (id: string) => void;
  blockDateRange: (fromDate: string, toDate: string) => number;
  addWaypointBySearch: (query: string) => Promise<RouteWaypoint | null>;
  removeWaypoint: (id: string) => void;
  loadContracts: () => Promise<void>;
  createProviderContract: (params: {
    type: ContractType;
    title: string;
    partyName: string;
    partyPhone: string;
    partyEmail: string;
    terms: string;
  }) => Promise<Contract>;
  signProviderContract: (id: string, signatureBase64: string) => Promise<Contract>;
  addStaffMember: (member: Omit<ProviderStaffMember, "id">) => void;
  toggleStaffStatus: (id: string) => void;
  addMaintenanceLog: (log: Omit<ProviderMaintenanceLog, "id" | "createdAt" | "status">) => void;
  advanceMaintenanceStatus: (id: string) => void;
}

const DEFAULT_SERVICES: ProviderServiceItem[] = [
  {
    id: "srv-coxs-tour",
    title: "Cox's Bazar & Marine Drive Full Day Tour",
    category: "Tour Guide",
    priceBdt: 2500,
    priceType: "fixed",
    duration: "8h",
    maxGroup: 10,
    area: "Cox's Bazar",
    description: "Guided coastline exploration across Laboni, Himchari, Inani & Marine Drive.",
    certifications: "Bangladesh Tourism Board Certified",
    instantBooking: true,
    status: "Active",
    photoUrls: [],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "srv-dhaka-car",
    title: "Executive Sedan Chauffeur (Dhaka / Airport)",
    category: "Car Rental",
    priceBdt: 3500,
    priceType: "fixed",
    duration: "10h",
    maxGroup: 4,
    area: "Dhaka Metro",
    description: "AC Sedan with BRTA verified professional driver & bilingual support.",
    certifications: "BRTA Commercial Permit",
    instantBooking: true,
    status: "Active",
    photoUrls: [],
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

const getIsoDateOffset = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
};

const INITIAL_BOOKINGS: ProviderBookingItem[] = [
  {
    id: "pbk-1",
    clientName: "Rahima Begum",
    clientPhone: "+8801711223344",
    serviceTitle: "Cox's Bazar & Marine Drive Full Day Tour",
    dateIso: getIsoDateOffset(0),
    timeSlot: "09:00 AM",
    location: "Laboni Beach Point, Cox's Bazar",
    status: "booked",
    amountPaisa: 250000,
  },
  {
    id: "pbk-2",
    clientName: "Karim Hassan",
    clientPhone: "+8801812334455",
    serviceTitle: "Executive Sedan Chauffeur (Dhaka / Airport)",
    dateIso: getIsoDateOffset(1),
    timeSlot: "02:00 PM",
    location: "Hazrat Shahjalal International Airport T1",
    status: "booked",
    amountPaisa: 350000,
  },
  {
    id: "pbk-3",
    clientName: "Nadia Islam",
    clientPhone: "+8801919445566",
    serviceTitle: "Sajek Sunset Photography Excursion",
    dateIso: getIsoDateOffset(3),
    timeSlot: "06:30 AM",
    location: "Khagrachari Helipad Transfer",
    status: "pending",
    amountPaisa: 420000,
  },
];

export const useProviderHubStore = create<ProviderHubState>()(
  persist(
    (set, get) => ({
      providerId: "provider-demo-bd",
      providerName: "Ahmad Rahman",
      verified: true,
      rating: 4.92,
      isOnline: true,
      services: DEFAULT_SERVICES,
      bookings: INITIAL_BOOKINGS,
      slots: [
        { id: "slot-1", dayOfWeek: "Daily", startTime: "08:00", endTime: "18:00" },
      ],
      blockedDates: {},
      waypoints: [
        {
          id: "wp-base",
          label: "Gulshan 2 Hub, Dhaka",
          latitude: 23.7925,
          longitude: 90.4078,
          etaMinutes: 0,
          distanceKmFromPrev: 0,
        },
      ],
      contracts: [],
      staff: [
        {
          id: "stf-1",
          name: "Tariqul Islam",
          role: "Senior Chauffeur (BRTA Verified)",
          phone: "+8801715001122",
          status: "on_duty",
        },
        {
          id: "stf-2",
          name: "Farhana Akter",
          role: "Heritage Tour Guide",
          phone: "+8801817334455",
          status: "standby",
        },
      ],
      maintenanceLogs: [
        {
          id: "mnt-1",
          assetName: "Toyota Premio (DHAKA METRO-GA-31-4421)",
          issue: "AC compressor filter scheduled check",
          priority: "medium",
          status: "open",
          createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        },
      ],
      portfolioUris: [],
      isHydrated: false,
      isLoading: false,

      hydrateProviderHub: async () => {
        set({ isLoading: true });
        try {
          const { data: userData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
          const userId = userData?.user?.id;
          if (userId) {
            const fullName =
              (userData.user?.user_metadata?.full_name as string) || get().providerName;
            set({ providerId: userId, providerName: fullName });
            try {
              const { data: rows } = await supabase
                .from("bookings")
                .select("id, status, total_price, created_at, item_title, check_in_date, metadata")
                .eq("provider_id", userId)
                .order("created_at", { ascending: false })
                .limit(20);
              if (rows && rows.length > 0) {
                const synced: ProviderBookingItem[] = rows.map((r: Record<string, unknown>) => ({
                  id: String(r.id),
                  clientName: String((r.metadata as Record<string, unknown>)?.client_name || "Guest Traveler"),
                  clientPhone: String((r.metadata as Record<string, unknown>)?.client_phone || "+8801700000000"),
                  serviceTitle: String(r.item_title || "Mobility / Tour Booking"),
                  dateIso: String(r.check_in_date || new Date().toISOString()).slice(0, 10),
                  timeSlot: "09:00 AM",
                  location: String((r.metadata as Record<string, unknown>)?.location || "Dhaka, Bangladesh"),
                  status: r.status === "confirmed" ? "booked" : "pending",
                  amountPaisa: Math.round(Number(r.total_price || 2000) * 100),
                }));
                set({ bookings: synced });
              }
            } catch {
              // Offline or table column mismatch falls back gracefully to persisted state
            }
            await get().loadContracts();
          }

          // Hydrate rider store too so earnings ledger & fleet stay in sync
          await useRiderStore.getState().bootstrapRiderPortal({
            id: userId,
            name: get().providerName,
          });
        } finally {
          set({ isHydrated: true, isLoading: false });
        }
      },

      toggleOnline: async () => {
        const next = !get().isOnline;
        set({ isOnline: next });
        const riderStore = useRiderStore.getState();
        if (
          (next && riderStore.dutyStatus === "offline") ||
          (!next && riderStore.dutyStatus === "online")
        ) {
          await riderStore.toggleDutyStatus();
        }
      },

      addService: async (input) => {
        const newService: ProviderServiceItem = {
          ...input,
          id: `srv-${Date.now()}`,
          status: "Active",
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ services: [newService, ...state.services] }));
        try {
          await supabase.from("provider_services").insert({
            id: newService.id,
            provider_id: get().providerId,
            title: newService.title,
            category: newService.category,
            price_bdt: newService.priceBdt,
            price_type: newService.priceType,
            area: newService.area,
            instant_booking: newService.instantBooking,
            status: newService.status,
          });
        } catch {
          // Local AsyncStorage persistence guarantees availability
        }
      },

      toggleServiceStatus: (id) => {
        set((state) => ({
          services: state.services.map((s) =>
            s.id === id
              ? { ...s, status: s.status === "Active" ? "Inactive" : "Active" }
              : s
          ),
        }));
      },

      addPortfolioPhoto: (uri) => {
        set((state) => ({
          portfolioUris: [uri, ...state.portfolioUris.slice(0, 15)],
        }));
      },

      addAvailabilitySlot: (startTime, endTime, days) => {
        if (days && days.length > 0) {
          const batch: ProviderAvailabilitySlot[] = days.map((dayOfWeek) => ({
            id: `slot-${Date.now()}-${dayOfWeek}`,
            dayOfWeek,
            startTime,
            endTime,
          }));
          set((state) => ({ slots: [...batch, ...state.slots] }));
          return;
        }
        set((state) => ({
          slots: [
            { id: `slot-${Date.now()}`, startTime, endTime, dayOfWeek: "Custom" },
            ...state.slots,
          ],
        }));
      },

      removeAvailabilitySlot: (id) => {
        set((state) => ({
          slots: state.slots.filter((s) => s.id !== id),
        }));
      },

      blockDateRange: (fromDate, toDate) => {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
          return 0;
        }
        const blocked = { ...get().blockedDates };
        let count = 0;
        const cur = new Date(start);
        while (cur <= end && count <= 60) {
          blocked[cur.toISOString().slice(0, 10)] = true;
          cur.setDate(cur.getDate() + 1);
          count += 1;
        }
        set({ blockedDates: blocked });
        return count;
      },

      addWaypointBySearch: async (query) => {
        const results = await photonGeocoder.searchPlaces(query, 1);
        const existing = get().waypoints;
        const prev = existing[existing.length - 1] || {
          latitude: 23.7925,
          longitude: 90.4078,
        };
        const target = results[0];
        const lat = target?.latitude ?? 23.8103;
        const lng = target?.longitude ?? 90.4125;
        const distKm = Number(
          haversineDistanceKm(prev.latitude, prev.longitude, lat, lng).toFixed(1)
        );
        const etaMinutes = Math.max(5, Math.round((distKm / 26) * 60));
        const wp: RouteWaypoint = {
          id: `wp-${Date.now()}`,
          label: target?.displayName || query,
          latitude: lat,
          longitude: lng,
          distanceKmFromPrev: distKm,
          etaMinutes,
        };
        set((state) => ({ waypoints: [...state.waypoints, wp] }));
        return wp;
      },

      removeWaypoint: (id) => {
        set((state) => ({
          waypoints: state.waypoints.filter((w) => w.id !== id),
        }));
      },

      loadContracts: async () => {
        try {
          const list = await contractService.listContracts(get().providerId);
          set({ contracts: list });
        } catch {
          // Retain cached contracts
        }
      },

      createProviderContract: async ({
        type,
        title,
        partyName,
        partyPhone,
        partyEmail,
        terms,
      }) => {
        try {
          const created = await contractService.createContract({
            type,
            title,
            party: { name: partyName, phone: partyPhone, email: partyEmail },
            terms,
            ownerId: get().providerId,
          });
          set((state) => ({ contracts: [created, ...state.contracts] }));
          return created;
        } catch {
          const localContract: Contract = {
            id: `ctr-${Date.now()}`,
            type,
            title,
            party: { name: partyName, phone: partyPhone, email: partyEmail },
            terms,
            ownerId: get().providerId,
            status: "draft",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          set((state) => ({ contracts: [localContract, ...state.contracts] }));
          return localContract;
        }
      },

      signProviderContract: async (id, signatureBase64) => {
        try {
          const signed = await contractService.signContract(id, signatureBase64);
          set((state) => ({
            contracts: state.contracts.map((c) => (c.id === id ? signed : c)),
          }));
          return signed;
        } catch {
          let updated: Contract | undefined;
          set((state) => ({
            contracts: state.contracts.map((c) => {
              if (c.id === id) {
                updated = {
                  ...c,
                  status: "signed",
                  signatureBase64,
                  updatedAt: new Date(),
                };
                return updated;
              }
              return c;
            }),
          }));
          if (!updated) {
            throw new Error("Contract not found");
          }
          return updated;
        }
      },

      addStaffMember: (member) => {
        set((state) => ({
          staff: [
            { ...member, id: `stf-${Date.now()}` },
            ...state.staff,
          ],
        }));
      },

      toggleStaffStatus: (id) => {
        const order: Array<ProviderStaffMember["status"]> = [
          "on_duty",
          "standby",
          "off",
        ];
        set((state) => ({
          staff: state.staff.map((m) => {
            if (m.id !== id) return m;
            const nextIdx = (order.indexOf(m.status) + 1) % order.length;
            return { ...m, status: order[nextIdx] };
          }),
        }));
      },

      addMaintenanceLog: (log) => {
        set((state) => ({
          maintenanceLogs: [
            {
              ...log,
              id: `mnt-${Date.now()}`,
              status: "open",
              createdAt: new Date().toISOString(),
            },
            ...state.maintenanceLogs,
          ],
        }));
      },

      advanceMaintenanceStatus: (id) => {
        set((state) => ({
          maintenanceLogs: state.maintenanceLogs.map((l) => {
            if (l.id !== id) return l;
            const nextStatus =
              l.status === "open"
                ? "in_progress"
                : l.status === "in_progress"
                ? "resolved"
                : "open";
            return { ...l, status: nextStatus };
          }),
        }));
      },
    }),
    {
      name: "shopnojatra_provider_hub_v1",
      storage: createJSONStorage(() => cachedStateStorage),
      partialize: (state) => ({
        providerId: state.providerId,
        providerName: state.providerName,
        isOnline: state.isOnline,
        services: state.services,
        bookings: state.bookings,
        slots: state.slots,
        blockedDates: state.blockedDates,
        waypoints: state.waypoints,
        contracts: state.contracts,
        staff: state.staff,
        maintenanceLogs: state.maintenanceLogs,
        portfolioUris: state.portfolioUris,
      }),
    }
  )
);
