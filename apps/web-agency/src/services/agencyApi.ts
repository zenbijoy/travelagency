import {
  Booking,
  Customer,
  CommissionRecord,
  PayoutRequest,
  TeamMember,
  BankAccount,
  KycDocument,
  DashboardMetrics,
  AgencyTenant,
  AgencyRole,
  BookingStatus,
  ServiceType,
} from '../types';
import { ShopnoJatraClient, ApiClientError } from '@shopnojatra/api-client';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:8000';

export const agencyApiClient = new ShopnoJatraClient({
  baseUrl: API_BASE_URL,
  getToken: () => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('shopnojatra_access_token') || localStorage.getItem('sj_agency_token');
  },
});

// Demo Agencies for Tenant-aware switching
export const DEMO_TENANTS: AgencyTenant[] = [
  {
    id: 'agency-green-holidays',
    name: 'Green Holidays Bangladesh',
    slug: 'green-holidays',
    tradeLicenseNumber: 'TRAD/DNCC/092831/2023',
    tin: '782910384719',
    kycStatus: 'verified',
    commissionTier: 'Platinum',
    balanceBDT: 485250,
    pendingPayoutBDT: 120000,
    currency: 'BDT',
    phone: '+880 1711-987654',
    email: 'ops@greenholidaysbd.com',
    address: 'Gulshan-2, Dhaka 1212, Bangladesh',
    logoUrl: 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=128&auto=format&fit=crop&q=80',
  },
  {
    id: 'agency-bengal-voyage',
    name: 'Bengal Voyage International',
    slug: 'bengal-voyage',
    tradeLicenseNumber: 'TRAD/DSCC/014920/2024',
    tin: '992014817201',
    kycStatus: 'pending',
    commissionTier: 'Gold',
    balanceBDT: 182300,
    pendingPayoutBDT: 0,
    currency: 'BDT',
    phone: '+880 1819-234567',
    email: 'contact@bengalvoyage.net',
    address: 'Banani C/A, Dhaka 1213, Bangladesh',
  },
  {
    id: 'agency-chittagong-express',
    name: 'Chittagong Express Travel',
    slug: 'ctg-express',
    tradeLicenseNumber: 'TRAD/CCC/048192/2022',
    tin: '610294821038',
    kycStatus: 'verified',
    commissionTier: 'Silver',
    balanceBDT: 94000,
    pendingPayoutBDT: 45000,
    currency: 'BDT',
    phone: '+880 1912-887766',
    email: 'reservations@ctgexpress.com',
    address: 'Agrabad C/A, Chattogram, Bangladesh',
  },
];

// Generate 600+ realistic bookings for dense table & virtualized rendering
function generateBookings(tenantId: string): Booking[] {
  const routes: Record<ServiceType, string[]> = {
    flight: [
      'DAC -> DXB (Emirates EK583)',
      'DAC -> BKK (Biman BG388)',
      'DAC -> SIN (Singapore SQ447)',
      'DAC -> JED (Saudia SV804)',
      'DAC -> LHR (Biman BG201)',
      'DAC -> CXB (Novoair VQ931)',
      'DAC -> CGP (US-Bangla BS107)',
      'DAC -> KUL (Malaysia MH197)',
      'DAC -> DOH (Qatar QR641)',
    ],
    hotel: [
      'The Westin Dhaka - Executive Suite',
      'Radisson Blu Chattogram Bay View - Deluxe King',
      'Sayeman Beach Resort Coxs Bazar - Ocean View Deluxe',
      'Dusit Thani Bangkok - Premier Orchid Room',
      'Burj Al Arab Jumeirah Dubai - Deluxe Marina Suite',
      'Marina Bay Sands Singapore - Sands Premier Suite',
    ],
    tour: [
      'Sundarbans Wildlife Safari 3D/2N with Houseboat',
      'Sajek Valley Cloud Kingdom Weekend Odyssey',
      'Sreemangal Tea Garden & Rainforest Trail',
      'Coxs Bazar & Saint Martin Coral Expedition',
    ],
    holiday: [
      'Dubai Shopping & Desert Safari Holiday 5D/4N',
      'Bangkok & Pattaya Leisure Extravaganza 6D/5N',
      'Kuala Lumpur & Genting Highlands Family Escape',
      'Maldives Overwater Luxury Getaway 4D/3N',
    ],
  };

  const suppliers = [
    'Biman Bangladesh Airlines',
    'Emirates GDS',
    'Sabre Travel Network',
    'Amadeus Altea',
    'Bedsonline Global',
    'Hotelbeds International',
    'Expedia Partner Solutions',
  ];

  const agents = [
    { id: 'usr-1', name: 'Tanvir Hossain' },
    { id: 'usr-2', name: 'Nusrat Jahan' },
    { id: 'usr-3', name: 'Kazi Farhan' },
    { id: 'usr-4', name: 'Mahmudul Hasan' },
  ];

  const firstNames = ['Rafiqul', 'Farzana', 'Shakib', 'Tahmina', 'Mohammad', 'Sadia', 'Anisur', 'Nusrat', 'Arman', 'Sabrina', 'Zubair', 'Nafisa'];
  const lastNames = ['Islam', 'Ahmed', 'Rahman', 'Chowdhury', 'Hasan', 'Khan', 'Siddique', 'Karim', 'Akter', 'Begum', 'Alam', 'Mahmood'];

  const services: ServiceType[] = ['flight', 'hotel', 'tour', 'holiday'];
  const statuses: BookingStatus[] = ['confirmed', 'confirmed', 'confirmed', 'pending', 'completed', 'cancelled'];
  const paymentStatuses: ('paid' | 'partial' | 'unpaid')[] = ['paid', 'paid', 'partial', 'unpaid'];

  const bookings: Booking[] = [];
  const baseCount = 650;

  for (let i = 1; i <= baseCount; i++) {
    const sType = services[i % services.length];
    const status = statuses[i % statuses.length];
    const routeOptions = routes[sType];
    const route = routeOptions[i % routeOptions.length];
    const fName = firstNames[(i * 3) % firstNames.length];
    const lName = lastNames[(i * 7) % lastNames.length];
    const agent = agents[i % agents.length];
    const supplier = suppliers[i % suppliers.length];

    const basePrice = sType === 'flight' ? 45000 + (i % 20) * 3500 :
                      sType === 'hotel' ? 18000 + (i % 15) * 2200 :
                      sType === 'tour' ? 12000 + (i % 10) * 1500 : 75000 + (i % 12) * 5000;
    const markup = Math.round(basePrice * 0.04);
    const commission = Math.round(basePrice * 0.07);
    const totalPrice = basePrice + markup;

    const pnrCode = `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 3) % 26))}${1000 + (i % 9000)}`;
    const ref = `SJ-B2B-${100000 + i}`;

    const dateOffset = (i % 60) - 20; // past 20 days to next 40 days
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    const travelDate = d.toISOString().split('T')[0];

    const createdD = new Date();
    createdD.setDate(createdD.getDate() - (i % 30));
    const createdAt = createdD.toISOString();

    bookings.push({
      id: `bk-${tenantId}-${i}`,
      bookingReference: ref,
      pnr: pnrCode,
      customerName: `${fName} ${lName}`,
      customerEmail: `${fName.toLowerCase()}.${lName.toLowerCase()}${i % 99}@gmail.com`,
      customerPhone: `+880 17${10000000 + ((i * 12345) % 89999999)}`,
      serviceType: sType,
      title: route,
      routeOrDetails: route,
      travelDate,
      returnDate: sType === 'flight' || sType === 'holiday' ? travelDate : undefined,
      guestsCount: 1 + (i % 4),
      status,
      totalPriceBDT: totalPrice,
      commissionBDT: commission,
      markupBDT: markup,
      paymentStatus: status === 'cancelled' ? 'refunded' : paymentStatuses[i % paymentStatuses.length],
      assignedAgent: agent.name,
      assignedAgentId: agent.id,
      createdAt,
      updatedAt: createdAt,
      supplierName: supplier,
      passengers: [
        {
          id: `pax-${i}-1`,
          name: `${fName} ${lName}`,
          type: 'adult',
          passportNo: `A0${8000000 + (i * 91) % 9999999}`,
          seatPreference: i % 2 === 0 ? 'Window' : 'Aisle',
          nationality: 'Bangladeshi',
        },
      ],
      notes: i % 5 === 0 ? 'VIP Corporate Passenger - Requested early check-in & halal meal' : undefined,
    });
  }

  return bookings;
}

// In-memory cache per tenant for realistic interactive mutations
const bookingsCache: Record<string, Booking[]> = {};

export function getTenantBookings(tenantId: string): Booking[] {
  if (!bookingsCache[tenantId]) {
    bookingsCache[tenantId] = generateBookings(tenantId);
  }
  return bookingsCache[tenantId];
}

// Customers Data
export const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'cust-101',
    name: 'Mustafizur Rahman',
    email: 'mustafiz.corporate@apexholdings.bd',
    phone: '+880 1711-409182',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    isVIP: true,
    totalBookings: 28,
    totalSpentBDT: 1845000,
    outstandingBalanceBDT: 0,
    lastBookingDate: '2026-11-20',
    nationality: 'Bangladeshi',
    passportExpiry: '2031-08-14',
    notes: 'Managing Director at Apex Holdings. Prefers Business Class and Gulf transit flights.',
    frequentDestinations: ['Dubai', 'London', 'Singapore', 'Bangkok'],
    travelHistory: [
      { bookingId: 'bk-1', reference: 'SJ-B2B-100234', serviceTitle: 'Emirates Business DAC-DXB', date: '2026-11-20', amountBDT: 185000, status: 'confirmed' },
      { bookingId: 'bk-2', reference: 'SJ-B2B-098211', serviceTitle: 'Singapore Airlines DAC-SIN', date: '2026-10-14', amountBDT: 92000, status: 'completed' },
      { bookingId: 'bk-3', reference: 'SJ-B2B-094112', serviceTitle: 'The Westin Dhaka Executive Suite', date: '2026-09-02', amountBDT: 48000, status: 'completed' },
    ],
  },
  {
    id: 'cust-102',
    name: 'Shamima Nasreen',
    email: 'nasreen.shamima@dhakabank.com',
    phone: '+880 1819-881234',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    isVIP: true,
    totalBookings: 14,
    totalSpentBDT: 920000,
    outstandingBalanceBDT: 34500,
    lastBookingDate: '2026-11-15',
    nationality: 'Bangladeshi',
    passportExpiry: '2029-04-20',
    notes: 'Senior VP Corporate Banking. Requires consolidated monthly billing invoices.',
    frequentDestinations: ['Kuala Lumpur', 'Bangkok', 'Coxs Bazar'],
    travelHistory: [
      { bookingId: 'bk-4', reference: 'SJ-B2B-100492', serviceTitle: 'Bangkok Leisure Tour 5D/4N', date: '2026-11-15', amountBDT: 145000, status: 'confirmed' },
      { bookingId: 'bk-5', reference: 'SJ-B2B-096781', serviceTitle: 'Sayeman Beach Resort Coxs Bazar', date: '2026-08-22', amountBDT: 38000, status: 'completed' },
    ],
  },
  {
    id: 'cust-103',
    name: 'Dr. Tariqul Islam',
    email: 'tariq.cardio@unitedhospital.com.bd',
    phone: '+880 1912-334455',
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    isVIP: false,
    totalBookings: 8,
    totalSpentBDT: 560000,
    outstandingBalanceBDT: 0,
    lastBookingDate: '2026-11-05',
    nationality: 'Bangladeshi',
    passportExpiry: '2028-11-01',
    notes: 'Frequent conference traveler. Demands aisle seat with extra legroom.',
    frequentDestinations: ['London', 'Istanbul', 'Kolkata'],
    travelHistory: [
      { bookingId: 'bk-6', reference: 'SJ-B2B-099412', serviceTitle: 'Turkish Airlines DAC-IST-LHR', date: '2026-11-05', amountBDT: 178000, status: 'confirmed' },
    ],
  },
  {
    id: 'cust-104',
    name: 'Fariha Yasmin',
    email: 'fariha.yasmin@grameenphone.com',
    phone: '+880 1713-998877',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    isVIP: false,
    totalBookings: 5,
    totalSpentBDT: 240000,
    outstandingBalanceBDT: 12000,
    lastBookingDate: '2026-10-28',
    nationality: 'Bangladeshi',
    passportExpiry: '2030-01-19',
    frequentDestinations: ['Sajek Valley', 'Sylhet', 'Kuala Lumpur'],
    travelHistory: [
      { bookingId: 'bk-7', reference: 'SJ-B2B-098811', serviceTitle: 'Sajek Cloud Weekend Expedition', date: '2026-10-28', amountBDT: 28000, status: 'completed' },
    ],
  },
];

// Commissions & Invoices Data
export const DEMO_COMMISSIONS: CommissionRecord[] = [
  {
    id: 'comm-801',
    bookingReference: 'SJ-B2B-100234',
    serviceType: 'flight',
    customerName: 'Mustafizur Rahman',
    grossVolumeBDT: 185000,
    commissionRatePercent: 7.5,
    commissionEarnedBDT: 13875,
    status: 'available',
    date: '2026-11-20',
    invoiceNumber: 'INV-2026-11-042',
  },
  {
    id: 'comm-802',
    bookingReference: 'SJ-B2B-100492',
    serviceType: 'tour',
    customerName: 'Shamima Nasreen',
    grossVolumeBDT: 145000,
    commissionRatePercent: 10.0,
    commissionEarnedBDT: 14500,
    status: 'available',
    date: '2026-11-15',
    invoiceNumber: 'INV-2026-11-039',
  },
  {
    id: 'comm-803',
    bookingReference: 'SJ-B2B-099412',
    serviceType: 'flight',
    customerName: 'Dr. Tariqul Islam',
    grossVolumeBDT: 178000,
    commissionRatePercent: 7.0,
    commissionEarnedBDT: 12460,
    status: 'available',
    date: '2026-11-05',
    invoiceNumber: 'INV-2026-11-028',
  },
  {
    id: 'comm-804',
    bookingReference: 'SJ-B2B-100612',
    serviceType: 'hotel',
    customerName: 'Anisur Rahman',
    grossVolumeBDT: 48000,
    commissionRatePercent: 12.0,
    commissionEarnedBDT: 5760,
    status: 'pending_clearance',
    date: '2026-11-25',
    invoiceNumber: 'INV-2026-11-051',
  },
  {
    id: 'comm-805',
    bookingReference: 'SJ-B2B-098211',
    serviceType: 'flight',
    customerName: 'Mustafizur Rahman',
    grossVolumeBDT: 92000,
    commissionRatePercent: 7.5,
    commissionEarnedBDT: 6900,
    status: 'settled',
    date: '2026-10-14',
    invoiceNumber: 'INV-2026-10-019',
  },
];

export const DEMO_PAYOUTS: PayoutRequest[] = [
  {
    id: 'pay-501',
    amountBDT: 120000,
    bankAccountId: 'bank-1',
    bankName: 'Islami Bank Bangladesh PLC',
    accountNumberMasked: '•••• •••• •••• 8821',
    status: 'processing',
    requestedAt: '2026-11-26 11:30 AM',
    referenceNumber: 'PO-BDT-202611-998',
    requestedBy: 'Tanvir Hossain (Owner)',
  },
  {
    id: 'pay-502',
    amountBDT: 85000,
    bankAccountId: 'bank-1',
    bankName: 'Islami Bank Bangladesh PLC',
    accountNumberMasked: '•••• •••• •••• 8821',
    status: 'completed',
    requestedAt: '2026-11-10 03:15 PM',
    processedAt: '2026-11-11 10:45 AM',
    referenceNumber: 'PO-BDT-202611-841',
    requestedBy: 'Tanvir Hossain (Owner)',
  },
  {
    id: 'pay-503',
    amountBDT: 60000,
    bankAccountId: 'bank-2',
    bankName: 'BRAC Bank PLC',
    accountNumberMasked: '•••• •••• •••• 1003',
    status: 'completed',
    requestedAt: '2026-10-25 04:00 PM',
    processedAt: '2026-10-26 11:20 AM',
    referenceNumber: 'PO-BDT-202610-612',
    requestedBy: 'Tanvir Hossain (Owner)',
  },
];

// Team Members
export const DEMO_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'usr-1',
    name: 'Tanvir Hossain',
    email: 'tanvir@greenholidaysbd.com',
    role: 'AGENCY_OWNER',
    status: 'active',
    joinedDate: '2023-01-15',
    bookingsHandledCount: 412,
    salesVolumeBDT: 18450000,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-2',
    name: 'Nusrat Jahan',
    email: 'nusrat@greenholidaysbd.com',
    role: 'AGENCY_MANAGER',
    status: 'active',
    joinedDate: '2023-04-10',
    bookingsHandledCount: 348,
    salesVolumeBDT: 14200000,
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-3',
    name: 'Kazi Farhan',
    email: 'farhan@greenholidaysbd.com',
    role: 'AGENCY_AGENT',
    status: 'active',
    joinedDate: '2024-02-01',
    bookingsHandledCount: 189,
    salesVolumeBDT: 7920000,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-4',
    name: 'Mahmudul Hasan',
    email: 'mahmud@greenholidaysbd.com',
    role: 'AGENCY_FINANCE',
    status: 'active',
    joinedDate: '2024-06-15',
    bookingsHandledCount: 0,
    salesVolumeBDT: 0,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-5',
    name: 'Samira Chowdhury',
    email: 'samira.c@greenholidaysbd.com',
    role: 'AGENCY_AGENT',
    status: 'pending_invite',
    joinedDate: '2026-11-20',
    bookingsHandledCount: 0,
    salesVolumeBDT: 0,
  },
];

// Bank Accounts
export const DEMO_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank-1',
    bankName: 'Islami Bank Bangladesh PLC',
    accountName: 'Green Holidays Bangladesh Ltd',
    accountNumber: '2050118020088821',
    routingNumber: '125272183',
    branchName: 'Gulshan Branch, Dhaka',
    isPrimary: true,
    verificationStatus: 'verified',
    accountType: 'Current',
  },
  {
    id: 'bank-2',
    bankName: 'BRAC Bank PLC',
    accountName: 'Green Holidays Bangladesh Ltd',
    accountNumber: '1501204891001003',
    routingNumber: '060261144',
    branchName: 'Banani Branch, Dhaka',
    isPrimary: false,
    verificationStatus: 'verified',
    accountType: 'Current',
  },
  {
    id: 'bank-3',
    bankName: 'City Bank Limited',
    accountName: 'Green Holidays Bangladesh Ltd',
    accountNumber: '31018920494492',
    routingNumber: '225271891',
    branchName: 'Principal Branch, Motijheel',
    isPrimary: false,
    verificationStatus: 'action_required',
    accountType: 'Escrow',
  },
];

// KYC Verification Documents
export const DEMO_KYC_DOCUMENTS: KycDocument[] = [
  {
    type: 'trade_licence',
    title: 'Trade Licence (City Corporation)',
    subtitle: 'Valid municipal certificate showing fiscal validity for travel agency operations',
    required: true,
    status: 'verified',
    fileName: 'Trade_License_DNCC_2026.pdf',
    fileSizeBytes: 2450000,
    uploadedAt: '2024-01-20',
  },
  {
    type: 'tin',
    title: 'Tax Identification Number (e-TIN)',
    subtitle: '12-digit e-TIN certificate issued by National Board of Revenue',
    required: true,
    status: 'verified',
    fileName: 'eTIN_Certificate_NBR.pdf',
    fileSizeBytes: 890000,
    uploadedAt: '2024-01-20',
  },
  {
    type: 'owner_nid',
    title: 'Managing Director Smart NID / Passport',
    subtitle: 'Color scanned copy of Smart National ID card (both sides) or bio page',
    required: true,
    status: 'verified',
    fileName: 'MD_Tanvir_SmartNID_Scanned.pdf',
    fileSizeBytes: 1820000,
    uploadedAt: '2024-01-21',
  },
  {
    type: 'address_proof',
    title: 'Commercial Office Lease / Utility Proof',
    subtitle: 'Registered office space rental agreement or recent commercial electricity bill',
    required: true,
    status: 'verified',
    fileName: 'Office_Lease_Agreement_Gulshan2.pdf',
    fileSizeBytes: 4200000,
    uploadedAt: '2024-01-22',
  },
];

// Dashboard Metrics
export function getDashboardMetrics(tenantId: string): DashboardMetrics {
  const bookings = getTenantBookings(tenantId);
  const totalBookings = bookings.length;
  const grossVolumeBDT = bookings.reduce((sum, b) => sum + b.totalPriceBDT, 0);
  const commissionsEarnedBDT = bookings.reduce((sum, b) => sum + b.commissionBDT, 0);
  const pendingBookingsCount = bookings.filter((b) => b.status === 'pending').length;

  return {
    totalBookings,
    totalBookingsGrowthPercent: 18.4,
    grossVolumeBDT,
    grossVolumeGrowthPercent: 24.6,
    commissionsEarnedBDT,
    commissionsGrowthPercent: 21.2,
    activeAgentsCount: 4,
    pendingBookingsCount,
    monthlyRevenueTrend: [
      { month: 'Jun 2026', volumeBDT: 2840000, commissionBDT: 213000 },
      { month: 'Jul 2026', volumeBDT: 3120000, commissionBDT: 249600 },
      { month: 'Aug 2026', volumeBDT: 3490000, commissionBDT: 279200 },
      { month: 'Sep 2026', volumeBDT: 3950000, commissionBDT: 316000 },
      { month: 'Oct 2026', volumeBDT: 4620000, commissionBDT: 369600 },
      { month: 'Nov 2026', volumeBDT: 5180000, commissionBDT: 414400 },
    ],
    serviceDistribution: [
      { service: 'Flights', percentage: 58, bookingsCount: Math.round(totalBookings * 0.58) },
      { service: 'Hotels', percentage: 22, bookingsCount: Math.round(totalBookings * 0.22) },
      { service: 'Tours', percentage: 12, bookingsCount: Math.round(totalBookings * 0.12) },
      { service: 'Holidays', percentage: 8, bookingsCount: Math.round(totalBookings * 0.08) },
    ],
  };
}

// ==========================================
// REALTIME BACKEND API CLIENT INTEGRATIONS
// ==========================================

export async function fetchLiveAgencyEarningsSummary(): Promise<any | null> {
  try {
    const res = await agencyApiClient.agency.getEarningsSummary();
    return res.data;
  } catch (error) {
    console.warn('Realtime agency earnings query failed, returning cached data:', error);
    return null;
  }
}

export async function fetchLiveAgencyBookings(params?: {
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<Booking[]> {
  try {
    const res = await agencyApiClient.bookings.list(params);
    if (res.items && res.items.length > 0) {
      return res.items.map((b: any) => ({
        id: b.id,
        bookingReference: b.booking_reference,
        pnr: b.booking_reference.replace(/^SJ-/, ''),
        customerName: b.passenger_name || 'Corporate Traveler',
        customerEmail: b.passenger_email || 'guest@shopnojatra.com',
        customerPhone: b.passenger_phone || '+8801700000000',
        serviceType: (b.product_type as ServiceType) || 'flight',
        title: `${b.product_name || b.destination_city || 'Service'} Booking`,
        routeOrDetails: b.destination_city || 'Domestic Transit',
        travelDate: b.created_at ? b.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        guestsCount: b.number_of_guests || 1,
        status: (['confirmed', 'completed', 'cancelled', 'pending'].includes(b.status) ? b.status : 'pending') as BookingStatus,
        totalPriceBDT: b.total_amount || 0,
        commissionBDT: Math.round((b.total_amount || 0) * 0.07),
        markupBDT: Math.round((b.total_amount || 0) * 0.04),
        paymentStatus: b.payment_status || 'unpaid',
        assignedAgent: 'Assigned Agent',
        assignedAgentId: 'usr-1',
        createdAt: b.created_at || new Date().toISOString(),
        updatedAt: b.updated_at || new Date().toISOString(),
        supplierName: 'ShopnoJatra GDS Direct',
        passengers: [],
      }));
    }
  } catch (err) {
    console.warn('Realtime booking fetch failed, falling back to local tenant cache:', err);
  }
  return getTenantBookings('agency-green-holidays');
}

