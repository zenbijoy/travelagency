import {
  PlatformGmvMetrics,
  TenantAgency,
  KycSubmission,
  TenantHotel,
  PaymentTransaction,
  GatewayHealthStatus,
  RefundRequest,
  AdminUser,
  AuditLogEntry,
  SupplierHealthMetric,
  SystemHealthMetric
} from '@/types';

export const INITIAL_PLATFORM_METRICS: PlatformGmvMetrics = {
  gmvBDT: 58450000, // 58.45M BDT
  gmvUSD: 487083,
  activeAgencies: 168,
  activeHotels: 112,
  totalBookings: 14890,
  completedBookings: 13920,
  pendingRefundsCount: 6,
  pendingKycCount: 5,
  grossMarginPercentage: 11.4,
  currency: 'BDT',
  history30Days: Array.from({ length: 30 }).map((_, i) => {
    const day = 30 - i;
    const date = new Date(Date.now() - day * 86400000).toISOString().split('T')[0];
    const baseGmv = 1800000 + Math.sin(i / 3) * 450000 + (i * 25000);
    return {
      date,
      gmvBDT: Math.round(baseGmv),
      gmvUSD: Math.round(baseGmv / 120),
      bookings: Math.round(baseGmv / 12500)
    };
  })
};

export const INITIAL_SYSTEM_HEALTH: SystemHealthMetric[] = [
  { service: 'PostgreSQL Core (Supabase)', category: 'database', latencyMs: 14, status: 'operational', lastChecked: 'Just now' },
  { service: 'Cloudflare R2 Object Store', category: 'storage', latencyMs: 28, status: 'operational', lastChecked: 'Just now' },
  { service: 'bKash Merchant Disbursal API', category: 'gateway', latencyMs: 22, status: 'operational', lastChecked: 'Just now' },
  { service: 'Firebase Cloud Messaging (FCM)', category: 'push', latencyMs: 36, status: 'operational', lastChecked: 'Just now' },
  { service: 'Sabre GDS NDC Integration', category: 'core', latencyMs: 84, status: 'operational', lastChecked: 'Just now' },
];

export const INITIAL_AGENCIES: TenantAgency[] = [
  {
    id: 'ag-001',
    name: 'Bengal Odyssey Travels Ltd',
    tradeLicenseNumber: 'TRAD/DNCC/024819/2024',
    ownerName: 'Rashidul Hasan',
    email: 'contact@bengalodyssey.com',
    phone: '+8801711928374',
    city: 'Dhaka',
    tier: 'Platinum',
    status: 'verified',
    commissionRate: 7.5,
    totalBookings: 3420,
    totalGmvBDT: 15400000,
    walletBalanceBDT: 420000,
    createdAt: '2025-02-14T10:00:00Z',
    updatedAt: '2026-11-20T14:30:00Z'
  },
  {
    id: 'ag-002',
    name: 'Sylhet Aviations & Tours',
    tradeLicenseNumber: 'TRAD/SCC/009182/2023',
    ownerName: 'Farhan Ahmed Chowdhury',
    email: 'support@sylhetaviations.com',
    phone: '+8801819283741',
    city: 'Sylhet',
    tier: 'Gold',
    status: 'verified',
    commissionRate: 6.5,
    totalBookings: 1890,
    totalGmvBDT: 8900000,
    walletBalanceBDT: 185000,
    createdAt: '2025-05-10T08:15:00Z',
    updatedAt: '2026-11-24T11:20:00Z'
  },
  {
    id: 'ag-003',
    name: 'Port City Air Travels',
    tradeLicenseNumber: 'TRAD/CCC/015421/2025',
    ownerName: 'Nasir Uddin Mahmud',
    email: 'info@portcityair.com',
    phone: '+8801914829102',
    city: 'Chittagong',
    tier: 'Gold',
    status: 'verified',
    commissionRate: 6.5,
    totalBookings: 1450,
    totalGmvBDT: 6750000,
    walletBalanceBDT: 95000,
    createdAt: '2025-08-20T12:00:00Z',
    updatedAt: '2026-11-25T16:45:00Z'
  },
  {
    id: 'ag-004',
    name: 'Sundarbans Eco Expeditions',
    tradeLicenseNumber: 'TRAD/KCC/008273/2026',
    ownerName: 'Tanjilur Rahman',
    email: 'booking@sundarbanseco.com',
    phone: '+8801612984712',
    city: 'Khulna',
    tier: 'Silver',
    status: 'pending',
    kycSubmissionId: 'kyc-sub-101',
    commissionRate: 5.0,
    totalBookings: 0,
    totalGmvBDT: 0,
    walletBalanceBDT: 0,
    createdAt: '2026-11-25T09:30:00Z',
    updatedAt: '2026-11-25T09:30:00Z'
  },
  {
    id: 'ag-005',
    name: 'Padma Bridge Flight Center',
    tradeLicenseNumber: 'TRAD/DSCC/031928/2026',
    ownerName: 'Mahbub Alam',
    email: 'mahbub@padmaflights.com',
    phone: '+8801712983719',
    city: 'Dhaka',
    tier: 'Silver',
    status: 'pending',
    kycSubmissionId: 'kyc-sub-102',
    commissionRate: 5.0,
    totalBookings: 0,
    totalGmvBDT: 0,
    walletBalanceBDT: 0,
    createdAt: '2026-11-26T14:10:00Z',
    updatedAt: '2026-11-26T14:10:00Z'
  },
  {
    id: 'ag-006',
    name: 'Apex Global Holidays Ltd',
    tradeLicenseNumber: 'TRAD/DNCC/091283/2022',
    ownerName: 'Kazi Moinul Islam',
    email: 'compliance@apexholidays.com',
    phone: '+8801511234567',
    city: 'Dhaka',
    tier: 'Platinum',
    status: 'suspended',
    commissionRate: 8.0,
    totalBookings: 4120,
    totalGmvBDT: 19800000,
    walletBalanceBDT: 310000,
    createdAt: '2024-11-01T10:00:00Z',
    updatedAt: '2026-11-15T09:00:00Z'
  }
];

export const INITIAL_KYC_QUEUE: KycSubmission[] = [
  {
    id: 'kyc-sub-101',
    agencyId: 'ag-004',
    agencyName: 'Sundarbans Eco Expeditions',
    submittedAt: '2026-11-25T09:30:00Z',
    status: 'submitted',
    documentsCount: 4,
    documents: [
      {
        id: 'doc-001',
        docType: 'trade_license',
        title: 'Trade License (Khulna City Corp)',
        fileUrl: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
        mime: 'application/pdf',
        sizeBytes: 2450800,
        sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        extractedFields: {
          licenseNumber: 'TRAD/KCC/008273/2026',
          businessType: 'Travel & Tour Operator',
          validUntil: '2027-06-30',
          proprietor: 'Tanjilur Rahman'
        },
        checks: [
          { id: 'c1', name: 'City Corp Registration Valid', result: 'pass', detail: 'Verified against KCC portal' },
          { id: 'c2', name: 'Expiration Date Check (>6 mos)', result: 'pass', detail: 'Valid through June 2027' },
          { id: 'c3', name: 'Name Consistency', result: 'pass', detail: 'Matches applicant full name' }
        ]
      },
      {
        id: 'doc-002',
        docType: 'tax_cert',
        title: 'e-TIN Certificate (NBR Bangladesh)',
        fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
        mime: 'application/pdf',
        sizeBytes: 1205000,
        sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
        extractedFields: {
          tinNumber: '8912-3849-1029',
          taxesCircle: 'Circle 14, Khulna',
          status: 'Active Taxpayer'
        },
        checks: [
          { id: 'c4', name: 'NBR TIN Verification', result: 'pass', detail: 'Checksum matches 12-digit format' },
          { id: 'c5', name: 'Taxes Zone Legitimacy', result: 'pass', detail: 'Valid active zone' }
        ]
      },
      {
        id: 'doc-003',
        docType: 'nid_owner',
        title: 'Smart National ID Card (Owner)',
        fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
        mime: 'image/jpeg',
        sizeBytes: 890400,
        sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
        extractedFields: {
          nidNumber: '6819283741',
          dob: '1988-04-12',
          fatherName: 'Late M. A. Rahman'
        },
        checks: [
          { id: 'c6', name: 'Smart NID 10-digit Checksum', result: 'pass', detail: 'Standard smart card algorithm valid' },
          { id: 'c7', name: 'Face Match / Photo Resolution', result: 'warn', detail: 'Slight glare on right corner but readable' }
        ]
      },
      {
        id: 'doc-004',
        docType: 'bank_statement',
        title: 'Bank Solvency Letter (BRAC Bank Ltd)',
        fileUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80',
        mime: 'application/pdf',
        sizeBytes: 3120000,
        sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
        extractedFields: {
          bankName: 'BRAC Bank Ltd',
          accountNo: '1501204819283001',
          branch: 'Khulna Main Branch',
          balanceBDT: 1540000
        },
        checks: [
          { id: 'c8', name: 'Official Seal & Signature', result: 'pass', detail: 'Officer sign & seal detected' },
          { id: 'c9', name: 'Minimum Capital Requirement (>500k)', result: 'pass', detail: 'Balance exceeds 1.5M BDT threshold' }
        ]
      }
    ],
    auditTrail: [
      { id: 'at-1', action: 'KYC_SUBMITTED', actor: 'Tanjilur Rahman', timestamp: '2026-11-25T09:30:00Z', note: 'Initial application submitted with 4 docs' }
    ]
  },
  {
    id: 'kyc-sub-102',
    agencyId: 'ag-005',
    agencyName: 'Padma Bridge Flight Center',
    submittedAt: '2026-11-26T14:10:00Z',
    status: 'in_review',
    documentsCount: 3,
    documents: [
      {
        id: 'doc-005',
        docType: 'trade_license',
        title: 'Trade License (Dhaka South)',
        fileUrl: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=800&q=80',
        mime: 'application/pdf',
        sizeBytes: 1980000,
        sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
        extractedFields: {
          licenseNumber: 'TRAD/DSCC/031928/2026',
          businessType: 'Air Ticket Agency',
          validUntil: '2027-06-30',
          proprietor: 'Mahbub Alam'
        },
        checks: [
          { id: 'c10', name: 'DSCC Online Record Match', result: 'pass', detail: 'Found in DSCC trade registry' },
          { id: 'c11', name: 'Address Consistency', result: 'warn', detail: 'Unit number differs from application form by 1 digit' }
        ]
      },
      {
        id: 'doc-006',
        docType: 'tax_cert',
        title: 'NBR Tax Certificate',
        fileUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
        mime: 'application/pdf',
        sizeBytes: 1450000,
        sha256: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1',
        extractedFields: {
          tinNumber: '5819-2849-0192',
          taxesCircle: 'Circle 8, Dhaka',
          status: 'Active'
        },
        checks: [
          { id: 'c12', name: 'NBR TIN Verification', result: 'pass', detail: 'Valid active record' }
        ]
      },
      {
        id: 'doc-007',
        docType: 'nid_owner',
        title: 'Owner Smart NID Card',
        fileUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80',
        mime: 'image/jpeg',
        sizeBytes: 650000,
        sha256: 'c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdefa1b2',
        extractedFields: {
          nidNumber: '9182736450',
          dob: '1992-08-19'
        },
        checks: [
          { id: 'c13', name: '10-Digit Smart NID Algorithm', result: 'pass', detail: 'Valid algorithm' }
        ]
      }
    ],
    auditTrail: [
      { id: 'at-2', action: 'KYC_SUBMITTED', actor: 'Mahbub Alam', timestamp: '2026-11-26T14:10:00Z', note: 'Submitted via agency portal' },
      { id: 'at-3', action: 'REVIEW_STARTED', actor: 'Tariqul Islam (Ops)', timestamp: '2026-11-27T10:00:00Z', note: 'Claimed review ticket' }
    ]
  }
];

export const INITIAL_HOTELS: TenantHotel[] = [
  {
    id: 'ht-001',
    name: 'Radisson Blu Water Garden Dhaka',
    city: 'Dhaka',
    address: 'Airport Road, Dhaka Cantonment, Dhaka 1206',
    starRating: 5,
    roomsCount: 204,
    status: 'verified',
    contactPerson: 'Brigadier (Retd) Anwar Hossain',
    contactEmail: 'reservations.dhaka@radisson.com',
    contactPhone: '+88029834555',
    commissionRate: 10.0,
    totalBookings: 1840,
    totalGmvBDT: 24500000,
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2026-11-20T11:00:00Z'
  },
  {
    id: 'ht-002',
    name: 'Sayeman Beach Resort Cox\'s Bazar',
    city: 'Cox\'s Bazar',
    address: 'Marine Drive Road, Kolatoli, Cox\'s Bazar',
    starRating: 5,
    roomsCount: 245,
    status: 'verified',
    contactPerson: 'Shafiqul Islam',
    contactEmail: 'gm@sayemanresort.com',
    contactPhone: '+88034151350',
    commissionRate: 12.0,
    totalBookings: 3120,
    totalGmvBDT: 38900000,
    createdAt: '2025-03-01T10:00:00Z',
    updatedAt: '2026-11-26T15:30:00Z'
  },
  {
    id: 'ht-003',
    name: 'Grand Sultan Tea Resort & Golf',
    city: 'Sreemangal',
    address: 'Radhanagar, Sreemangal, Moulvibazar, Sylhet',
    starRating: 5,
    roomsCount: 135,
    status: 'verified',
    contactPerson: 'Tanvir Ahmed',
    contactEmail: 'info@grandsultanresort.com',
    contactPhone: '+8801730793555',
    commissionRate: 11.5,
    totalBookings: 1420,
    totalGmvBDT: 19800000,
    createdAt: '2025-04-10T08:00:00Z',
    updatedAt: '2026-11-24T12:00:00Z'
  },
  {
    id: 'ht-004',
    name: 'Long Beach Hotel Cox\'s Bazar',
    city: 'Cox\'s Bazar',
    address: '14 Kalatoli Road, Hotel-Motel Zone, Cox\'s Bazar',
    starRating: 4,
    roomsCount: 160,
    status: 'verified',
    contactPerson: 'Zakir Hossain',
    contactEmail: 'sales@longbeachhotelbd.com',
    contactPhone: '+8801755660001',
    commissionRate: 10.0,
    totalBookings: 1950,
    totalGmvBDT: 17500000,
    createdAt: '2025-06-12T10:00:00Z',
    updatedAt: '2026-11-25T09:00:00Z'
  },
  {
    id: 'ht-005',
    name: 'Hotel Agrabad Chittagong',
    city: 'Chittagong',
    address: 'Agrabad Commercial Area, Chittagong 4100',
    starRating: 4,
    roomsCount: 102,
    status: 'pending',
    contactPerson: 'Hasan Masud',
    contactEmail: 'manager@agrabadhotel.com',
    contactPhone: '+88031713311',
    commissionRate: 9.0,
    totalBookings: 0,
    totalGmvBDT: 0,
    createdAt: '2026-11-24T14:00:00Z',
    updatedAt: '2026-11-24T14:00:00Z'
  },
  {
    id: 'ht-006',
    name: 'Kuakata Sunset Resort',
    city: 'Patuakhali',
    address: 'Zero Point Beach Front, Kuakata',
    starRating: 3,
    roomsCount: 45,
    status: 'suspended',
    contactPerson: 'Abdul Wadud',
    contactEmail: 'support@kuakatasunset.com',
    contactPhone: '+8801711223344',
    commissionRate: 8.0,
    totalBookings: 480,
    totalGmvBDT: 3200000,
    createdAt: '2025-07-15T10:00:00Z',
    updatedAt: '2026-11-10T16:00:00Z'
  }
];

export const INITIAL_TRANSACTIONS: PaymentTransaction[] = [
  {
    id: 'txn-701',
    orderId: 'SJ-ORD-90214',
    bookingRef: 'SJ-FL-DAC-CXB-819',
    customerName: 'Ashraful Alam',
    customerEmail: 'ashraf.alam@gmail.com',
    serviceType: 'flight',
    amountBDT: 14500,
    amountUSD: 120.83,
    gateway: 'bkash',
    gatewayTransactionId: 'BK9283741098',
    status: 'success',
    reconciled: true,
    reconciledAt: '2026-11-27T08:30:00Z',
    reconciledBy: 'Reconciliation Daemon v2',
    createdAt: '2026-11-27T08:15:20Z'
  },
  {
    id: 'txn-702',
    orderId: 'SJ-ORD-90215',
    bookingRef: 'SJ-HT-SAYEMAN-402',
    customerName: 'Samira Tanjim',
    customerEmail: 'samira.tanjim@yahoo.com',
    serviceType: 'hotel',
    amountBDT: 38400,
    amountUSD: 320.00,
    gateway: 'nagad',
    gatewayTransactionId: 'NG8491029384',
    status: 'success',
    reconciled: true,
    reconciledAt: '2026-11-27T10:15:00Z',
    reconciledBy: 'Reconciliation Daemon v2',
    createdAt: '2026-11-27T09:45:10Z'
  },
  {
    id: 'txn-703',
    orderId: 'SJ-ORD-90216',
    bookingRef: 'SJ-FL-DAC-BKK-104',
    customerName: 'Rezaul Karim',
    customerEmail: 'reza.karim@dhakabank.com.bd',
    serviceType: 'flight',
    amountBDT: 68500,
    amountUSD: 570.83,
    gateway: 'sslcommerz',
    gatewayTransactionId: 'SSL819283741928',
    status: 'success',
    reconciled: false,
    createdAt: '2026-11-27T11:20:45Z'
  },
  {
    id: 'txn-704',
    orderId: 'SJ-ORD-90217',
    bookingRef: 'SJ-PKG-SRMG-301',
    customerName: 'Dr. Shahabuddin Miah',
    customerEmail: 'dr.shahab@bsmmu.edu.bd',
    serviceType: 'holiday_package',
    amountBDT: 45000,
    amountUSD: 375.00,
    gateway: 'bkash',
    gatewayTransactionId: 'BK1029384756',
    status: 'refunded',
    reconciled: true,
    reconciledAt: '2026-11-27T12:00:00Z',
    createdAt: '2026-11-27T07:10:00Z'
  },
  {
    id: 'txn-705',
    orderId: 'SJ-ORD-90218',
    bookingRef: 'SJ-HT-RADISSON-101',
    customerName: 'Nafis Sadik',
    customerEmail: 'nafis.sadik@gmail.com',
    serviceType: 'hotel',
    amountBDT: 28500,
    amountUSD: 237.50,
    gateway: 'rocket',
    gatewayTransactionId: 'RK9481928374',
    status: 'success',
    reconciled: false,
    createdAt: '2026-11-27T12:45:30Z'
  },
  {
    id: 'txn-706',
    orderId: 'SJ-ORD-90219',
    bookingRef: 'SJ-FL-DAC-DXB-992',
    customerName: 'Jannatul Ferdous',
    customerEmail: 'jannat.ferdous@gmail.com',
    serviceType: 'flight',
    amountBDT: 85200,
    amountUSD: 710.00,
    gateway: 'stripe',
    gatewayTransactionId: 'ch_3M49x283189283',
    status: 'pending',
    reconciled: false,
    createdAt: '2026-11-27T13:10:00Z'
  }
];

export const INITIAL_GATEWAYS: GatewayHealthStatus[] = [
  {
    gateway: 'bkash',
    label: 'bKash PGW (Direct API v1.2.0-beta)',
    status: 'operational',
    uptime24h: 99.98,
    latencyMs: 18,
    successRate: 98.7,
    lastPingAt: 'Just now',
    activeDisputes: 2
  },
  {
    gateway: 'nagad',
    label: 'Nagad Gateway (Fast Checkout v2)',
    status: 'operational',
    uptime24h: 99.85,
    latencyMs: 24,
    successRate: 97.4,
    lastPingAt: 'Just now',
    activeDisputes: 1
  },
  {
    gateway: 'sslcommerz',
    label: 'SSLCommerz (Aggregator Host-to-Host)',
    status: 'operational',
    uptime24h: 99.92,
    latencyMs: 32,
    successRate: 98.1,
    lastPingAt: 'Just now',
    activeDisputes: 0
  },
  {
    gateway: 'rocket',
    label: 'Dutch-Bangla Rocket (DBBL Nexus API)',
    status: 'degraded',
    uptime24h: 98.40,
    latencyMs: 88,
    successRate: 93.2,
    lastPingAt: '12s ago',
    activeDisputes: 4
  },
  {
    gateway: 'stripe',
    label: 'Stripe International (Card & Apple Pay)',
    status: 'operational',
    uptime24h: 99.99,
    latencyMs: 45,
    successRate: 99.4,
    lastPingAt: 'Just now',
    activeDisputes: 0
  }
];

export const INITIAL_REFUNDS: RefundRequest[] = [
  {
    id: 'ref-401',
    bookingId: 'SJ-FL-DAC-CXB-712',
    orderId: 'SJ-ORD-89410',
    customerName: 'Tamim Iqbal',
    customerEmail: 'tamim.iqbal@chittagong.org',
    customerPhone: '+8801711009988',
    serviceType: 'flight',
    originalAmountBDT: 14500,
    refundAmountBDT: 14500,
    reasonCategory: 'flight_cancellation',
    reasonDetail: 'Biman Bangladesh BG-433 cancelled due to heavy fog at Cox\'s Bazar airport.',
    requestedAt: '2026-11-27T06:30:00Z',
    status: 'requested',
    slaExpiresAt: '2026-11-28T06:30:00Z',
    refundMethod: 'bKash (Wallet 01711009988)'
  },
  {
    id: 'ref-402',
    bookingId: 'SJ-HT-SULTAN-119',
    orderId: 'SJ-ORD-89502',
    customerName: 'Sabrina Mostafa',
    customerEmail: 'sabrina.m@northsouth.edu',
    customerPhone: '+8801819384729',
    serviceType: 'hotel',
    originalAmountBDT: 24000,
    refundAmountBDT: 21600,
    reasonCategory: 'customer_change_mind',
    reasonDetail: 'Family medical emergency, cancelled 48 hours prior to check-in per 90% refund policy.',
    requestedAt: '2026-11-27T08:10:00Z',
    status: 'requested',
    slaExpiresAt: '2026-11-28T08:10:00Z',
    refundMethod: 'Nagad (Wallet 01819384729)'
  },
  {
    id: 'ref-403',
    bookingId: 'SJ-FL-DAC-JED-004',
    orderId: 'SJ-ORD-89112',
    customerName: 'Haji Shamsur Rahman',
    customerEmail: 'shamsur.haji@gmail.com',
    customerPhone: '+8801912837465',
    serviceType: 'flight',
    originalAmountBDT: 72000,
    refundAmountBDT: 72000,
    reasonCategory: 'double_charge',
    reasonDetail: 'Customer bank debit card charged twice due to network timeout on payment gateway.',
    requestedAt: '2026-11-26T16:00:00Z',
    status: 'processing',
    slaExpiresAt: '2026-11-27T16:00:00Z',
    reviewedBy: 'Fatima Tuz Zohra (Finance)',
    reviewedAt: '2026-11-27T09:00:00Z',
    decisionNote: 'Bank statement verified duplicate transaction charge ID DBBL-9283-A.',
    refundMethod: 'SSLCommerz Chargeback'
  },
  {
    id: 'ref-404',
    bookingId: 'SJ-PKG-BANDARBAN-88',
    orderId: 'SJ-ORD-88901',
    customerName: 'Anisul Hoque',
    customerEmail: 'anis.hoque@prothomalo.com',
    customerPhone: '+8801611223344',
    serviceType: 'holiday_package',
    originalAmountBDT: 32000,
    refundAmountBDT: 32000,
    reasonCategory: 'flight_cancellation',
    reasonDetail: 'Local administration travel restriction imposed on Nilgiri & Thanchi route.',
    requestedAt: '2026-11-26T10:00:00Z',
    status: 'approved',
    slaExpiresAt: '2026-11-27T10:00:00Z',
    reviewedBy: 'Tariqul Islam (Super Admin)',
    reviewedAt: '2026-11-26T14:30:00Z',
    decisionNote: 'Force Majeure verified with Bandarban District Administration notice.',
    refundMethod: 'bKash (Wallet 01611223344)'
  },
  {
    id: 'ref-405',
    bookingId: 'SJ-HT-AGRABAD-021',
    orderId: 'SJ-ORD-88102',
    customerName: 'Kamrul Hassan',
    customerEmail: 'kamrul.hassan@beximco.com',
    customerPhone: '+8801712984712',
    serviceType: 'hotel',
    originalAmountBDT: 12000,
    refundAmountBDT: 0,
    reasonCategory: 'other',
    reasonDetail: 'No show on check-in date without prior intimation; requested 100% refund afterwards.',
    requestedAt: '2026-11-25T11:00:00Z',
    status: 'rejected',
    slaExpiresAt: '2026-11-26T11:00:00Z',
    reviewedBy: 'Fatima Tuz Zohra (Finance)',
    reviewedAt: '2026-11-25T15:00:00Z',
    decisionNote: 'Hotel non-refundable no-show clause explicitly acknowledged by user during checkout.',
    refundMethod: 'N/A'
  }
];

export const INITIAL_ADMIN_USERS: AdminUser[] = [
  {
    id: 'usr-001',
    name: 'Tariqul Islam',
    email: 'tariqul.admin@shopnojatra.com',
    role: 'super_admin',
    department: 'Platform Engineering & Executive Ops',
    lastLogin: '2026-11-27T18:42:00Z',
    isActive: true,
    permissions: []
  },
  {
    id: 'usr-002',
    name: 'Fatima Tuz Zohra',
    email: 'fatima.finance@shopnojatra.com',
    role: 'finance_admin',
    department: 'Financial Settlements & Treasury',
    lastLogin: '2026-11-27T16:15:00Z',
    isActive: true,
    permissions: []
  },
  {
    id: 'usr-003',
    name: 'Tanvir Hossain Chowdhury',
    email: 'tanvir.ops@shopnojatra.com',
    role: 'ops_admin',
    department: 'B2B Partner Operations & Agency KYC',
    lastLogin: '2026-11-27T14:30:00Z',
    isActive: true,
    permissions: []
  },
  {
    id: 'usr-004',
    name: 'Nusrat Jahan Mim',
    email: 'nusrat.support@shopnojatra.com',
    role: 'support_admin',
    department: 'Customer Care & Incident Desk',
    lastLogin: '2026-11-27T17:10:00Z',
    isActive: true,
    permissions: []
  },
  {
    id: 'usr-005',
    name: 'Audit Officer (KPMG Third Party)',
    email: 'auditor.external@shopnojatra.com',
    role: 'readonly',
    department: 'Independent Regulatory Compliance',
    lastLogin: '2026-11-26T11:00:00Z',
    isActive: true,
    permissions: []
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-991',
    actorId: 'usr-001',
    actorName: 'Tariqul Islam',
    actorRole: 'super_admin',
    action: 'REFUND_APPROVED',
    module: 'REFUND',
    entityType: 'RefundRequest',
    entityId: 'ref-404',
    details: {
      amountBDT: 32000,
      beneficiary: 'Anisul Hoque',
      gateway: 'bKash',
      reason: 'Force Majeure verified'
    },
    ipAddress: '103.145.118.24 (Dhaka GP Fiber)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
    tamperHash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    timestamp: '2026-11-26T14:30:00Z'
  },
  {
    id: 'aud-992',
    actorId: 'usr-002',
    actorName: 'Fatima Tuz Zohra',
    actorRole: 'finance_admin',
    action: 'RECONCILIATION_RUN',
    module: 'PAYMENT',
    entityType: 'PaymentBatch',
    entityId: 'batch-20261126',
    details: {
      reconciledTxnCount: 1420,
      totalVolumeBDT: 4850000,
      discrepancyCount: 0
    },
    ipAddress: '103.145.118.25 (Dhaka GP Fiber)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/131.0.0.0',
    tamperHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    timestamp: '2026-11-26T23:59:00Z'
  },
  {
    id: 'aud-993',
    actorId: 'usr-003',
    actorName: 'Tanvir Hossain Chowdhury',
    actorRole: 'ops_admin',
    action: 'KYC_REVIEW_STARTED',
    module: 'KYC',
    entityType: 'KycSubmission',
    entityId: 'kyc-sub-102',
    details: {
      agencyName: 'Padma Bridge Flight Center',
      docsEvaluated: 3
    },
    ipAddress: '103.205.180.12 (Amber IT)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    tamperHash: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    timestamp: '2026-11-27T10:00:00Z'
  },
  {
    id: 'aud-994',
    actorId: 'usr-001',
    actorName: 'Tariqul Islam',
    actorRole: 'super_admin',
    action: 'AGENCY_SUSPENDED',
    module: 'AGENCY',
    entityType: 'TenantAgency',
    entityId: 'ag-006',
    details: {
      agencyName: 'Apex Global Holidays Ltd',
      reason: 'Repeated non-issuance of confirmed airline PNRs'
    },
    ipAddress: '103.145.118.24 (Dhaka GP Fiber)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
    tamperHash: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    timestamp: '2026-11-15T09:00:00Z'
  },
  {
    id: 'aud-995',
    actorId: 'usr-002',
    actorName: 'Fatima Tuz Zohra',
    actorRole: 'finance_admin',
    action: 'PAYMENT_VERIFIED_MANUAL',
    module: 'PAYMENT',
    entityType: 'PaymentTransaction',
    entityId: 'txn-704',
    details: {
      orderId: 'SJ-ORD-90217',
      amountBDT: 45000,
      note: 'Verified against bKash merchant portal statement'
    },
    ipAddress: '103.145.118.25 (Dhaka GP Fiber)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/131.0.0.0',
    tamperHash: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
    timestamp: '2026-11-27T12:05:00Z'
  }
];

export const INITIAL_SUPPLIER_METRICS: SupplierHealthMetric[] = [
  {
    id: 'sup-001',
    name: 'Biman Bangladesh Airlines (SITA / Sabre API)',
    category: 'Airlines',
    endpoint: 'https://api.biman-airlines.com/v2/ndc/offers',
    status: 'healthy',
    latencyMs: 142,
    uptime24h: 99.85,
    errorRate24h: 0.12,
    p99LatencyMs: 380,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-002',
    name: 'US-Bangla Airlines (Direct Res / Crane PAX)',
    category: 'Airlines',
    endpoint: 'https://b2bapi.usbair.com/crane/booking',
    status: 'healthy',
    latencyMs: 118,
    uptime24h: 99.94,
    errorRate24h: 0.08,
    p99LatencyMs: 290,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-003',
    name: 'Novoair Direct Inventory Gateway',
    category: 'Airlines',
    endpoint: 'https://secure.flynovoair.com/b2b/xml_service.asmx',
    status: 'healthy',
    latencyMs: 165,
    uptime24h: 99.60,
    errorRate24h: 0.35,
    p99LatencyMs: 420,
    lastCheckedAt: '15s ago',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-004',
    name: 'Sabre Global Distribution System (GDS REST APIs)',
    category: 'GDS',
    endpoint: 'https://api.platform.sabre.com/v4/shop/flights',
    status: 'healthy',
    latencyMs: 84,
    uptime24h: 99.99,
    errorRate24h: 0.02,
    p99LatencyMs: 210,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-005',
    name: 'Amadeus Altéa / Master Pricer Travel Board',
    category: 'GDS',
    endpoint: 'https://api.amadeus.com/v2/shopping/flight-offers',
    status: 'healthy',
    latencyMs: 96,
    uptime24h: 99.95,
    errorRate24h: 0.04,
    p99LatencyMs: 245,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-006',
    name: 'bKash PGW API Direct Node',
    category: 'Payment Gateways',
    endpoint: 'https://tokenized.pay.bpayment.com/v1.2.0-beta/tokenized/checkout/create',
    status: 'healthy',
    latencyMs: 22,
    uptime24h: 99.98,
    errorRate24h: 0.06,
    p99LatencyMs: 95,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-007',
    name: 'Nagad Checkout Engine (PGW Direct)',
    category: 'Payment Gateways',
    endpoint: 'https://api.mynagad.com/api/dfs/check-out/initialize',
    status: 'healthy',
    latencyMs: 28,
    uptime24h: 99.82,
    errorRate24h: 0.22,
    p99LatencyMs: 110,
    lastCheckedAt: 'Just now',
    circuitBreakerOpen: false
  },
  {
    id: 'sup-008',
    name: 'SSLCommerz Multi-Bank Gateway Node',
    category: 'Payment Gateways',
    endpoint: 'https://securepay.sslcommerz.com/gwprocess/v4/api.php',
    status: 'degraded',
    latencyMs: 185,
    uptime24h: 98.90,
    errorRate24h: 1.85,
    p99LatencyMs: 650,
    lastCheckedAt: '30s ago',
    circuitBreakerOpen: false
  }
];
