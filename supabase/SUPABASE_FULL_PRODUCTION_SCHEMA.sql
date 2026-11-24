-- ============================================================================
-- SHOPNO JATRA (স্বপ্ন যাত্রা) - FULL PRODUCTION SUPABASE SCHEMA
-- Unified Database DDL, Schema Architecture, RLS Policies, Indexes & Seeds
-- Target Supabase Project: htkpmrfhoijznigwimwj.supabase.co
-- Compatible with PostgreSQL 15+ & PostgREST v12+
-- ============================================================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USER PROFILES & AUTH BRIDGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    phone TEXT,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'agent', 'admin', 'super_admin')),
    nid_passport_number TEXT,
    date_of_birth DATE,
    nationality TEXT DEFAULT 'Bangladeshi',
    emergency_contact_phone TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.community_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    cover_url TEXT,
    followers_count INTEGER NOT NULL DEFAULT 0,
    following_count INTEGER NOT NULL DEFAULT 0,
    trips_count INTEGER NOT NULL DEFAULT 0,
    is_influencer BOOLEAN NOT NULL DEFAULT FALSE,
    badge_label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 2. DESTINATIONS & TOURISM CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    title TEXT,
    city TEXT NOT NULL,
    state_division TEXT,
    country TEXT NOT NULL DEFAULT 'Bangladesh',
    country_code TEXT NOT NULL DEFAULT 'BD',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    cover_image_url TEXT,
    image_urls TEXT[] DEFAULT '{}',
    popular_attractions TEXT[] DEFAULT '{}',
    recommended_activities TEXT[] DEFAULT '{}',
    best_travel_months TEXT DEFAULT 'Nov - Mar',
    average_daily_budget NUMERIC(10, 2) DEFAULT 120.00,
    safety_rating NUMERIC(3, 2) DEFAULT 4.80,
    overview TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 3. HOTELS, RESORTS & ACCOMMODATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hotels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    star_rating NUMERIC(2, 1) DEFAULT 4.5,
    average_rating NUMERIC(3, 2) DEFAULT 4.80,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    images TEXT[] DEFAULT '{}',
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state_province TEXT,
    country TEXT NOT NULL DEFAULT 'Bangladesh',
    country_code TEXT NOT NULL DEFAULT 'BD',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 100.00,
    currency TEXT NOT NULL DEFAULT 'BDT',
    amenities TEXT[] DEFAULT '{}',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_free_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
    landmarks_summary_bn TEXT,
    landmarks_summary_en TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure latitude & longitude columns exist on hotels
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS landmarks_summary_bn TEXT;
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS landmarks_summary_en TEXT;

CREATE TABLE IF NOT EXISTS public.hotel_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    room_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price_per_night NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BDT',
    capacity_adults INTEGER NOT NULL DEFAULT 2,
    capacity_children INTEGER NOT NULL DEFAULT 1,
    bed_type TEXT DEFAULT 'King Bed',
    room_size_sqft INTEGER DEFAULT 350,
    amenities TEXT[] DEFAULT '{}',
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    total_inventory INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 4. AVIATION SYSTEM (AIRPORTS, AIRLINES, FLIGHTS & SEATS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.airports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iata_code VARCHAR(3) UNIQUE NOT NULL,
    icao_code VARCHAR(4),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Bangladesh',
    country_code VARCHAR(2) NOT NULL DEFAULT 'BD',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.airlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    iata_code VARCHAR(3) UNIQUE NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    country TEXT DEFAULT 'Bangladesh',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.flights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flight_number TEXT NOT NULL,
    airline_id UUID NOT NULL REFERENCES public.airlines(id) ON DELETE CASCADE,
    departure_airport_id UUID NOT NULL REFERENCES public.airports(id) ON DELETE RESTRICT,
    arrival_airport_id UUID NOT NULL REFERENCES public.airports(id) ON DELETE RESTRICT,
    departure_time TIMESTAMPTZ NOT NULL,
    arrival_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL,
    aircraft_type TEXT DEFAULT 'Boeing 737-800',
    base_price NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BDT',
    cabin_class TEXT NOT NULL DEFAULT 'economy',
    stops_count INTEGER NOT NULL DEFAULT 0,
    total_seats INTEGER NOT NULL DEFAULT 160,
    seats_available INTEGER NOT NULL DEFAULT 24,
    baggage_allowance TEXT DEFAULT '20 kg check-in + 7 kg cabin',
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.flight_seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flight_id UUID NOT NULL REFERENCES public.flights(id) ON DELETE CASCADE,
    seat_number TEXT NOT NULL,
    cabin_class TEXT NOT NULL DEFAULT 'economy',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    price NUMERIC(10, 2) NOT NULL,
    locked_until TIMESTAMPTZ,
    locked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(flight_id, seat_number)
);

-- ============================================================================
-- 5. RAILWAYS (STATIONS, TRAINS & COACHES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.train_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    name_bn TEXT,
    city TEXT NOT NULL,
    division TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.trains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    train_number TEXT UNIQUE NOT NULL,
    train_name TEXT NOT NULL,
    train_name_bn TEXT,
    origin_station_id UUID NOT NULL REFERENCES public.train_stations(id),
    destination_station_id UUID NOT NULL REFERENCES public.train_stations(id),
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    off_day TEXT DEFAULT 'None',
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 450.00,
    currency TEXT NOT NULL DEFAULT 'BDT',
    total_seats INTEGER NOT NULL DEFAULT 650,
    available_seats INTEGER NOT NULL DEFAULT 85,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 6. TOURS & PACKAGES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    destination_country TEXT NOT NULL DEFAULT 'Bangladesh',
    duration_days INTEGER NOT NULL DEFAULT 3,
    duration_nights INTEGER DEFAULT 2,
    price_per_person NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BDT',
    difficulty_level TEXT DEFAULT 'Moderate',
    featured_image TEXT,
    rating NUMERIC(3, 2) DEFAULT 4.80,
    reviews_count INTEGER DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT TRUE,
    max_group_size INTEGER DEFAULT 16,
    highlights TEXT[] DEFAULT '{}',
    included_services TEXT[] DEFAULT '{}',
    itinerary JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 7. BOOKINGS & PASSENGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('hotel', 'flight', 'train', 'bus', 'launch', 'package')),
    hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
    hotel_room_id UUID REFERENCES public.hotel_rooms(id) ON DELETE SET NULL,
    flight_id UUID REFERENCES public.flights(id) ON DELETE SET NULL,
    train_id UUID REFERENCES public.trains(id) ON DELETE SET NULL,
    tour_id UUID REFERENCES public.tours(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'refunded')),
    check_in_date DATE,
    check_out_date DATE,
    travel_date DATE,
    departure_time TEXT,
    seat_or_room TEXT,
    passengers_count INTEGER NOT NULL DEFAULT 1,
    passenger_name TEXT NOT NULL,
    passenger_email TEXT,
    passenger_phone TEXT,
    total_price NUMERIC(10, 2) NOT NULL,
    discount_amount NUMERIC(10, 2) DEFAULT 0.00,
    tax_amount NUMERIC(10, 2) DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'BDT',
    payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method TEXT DEFAULT 'bKash',
    qr_data TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 8. PAYMENTS & TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BDT',
    gateway TEXT NOT NULL, -- 'bKash', 'Nagad', 'Rocket', 'Stripe', 'SSLCommerz'
    gateway_transaction_id TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('initiated', 'processing', 'completed', 'failed', 'refunded')),
    payer_mobile TEXT,
    receipt_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 9. COMMUNITY (POSTS, MEDIA, STORIES, GROUPS & COMMENTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT,
    location TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived', 'flagged')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
    likes_count INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    shares_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.post_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    caption TEXT,
    location TEXT,
    views_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    destination TEXT,
    cover_url TEXT,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    members_count INTEGER NOT NULL DEFAULT 1,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.post_likes (
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.saved_posts (
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 10. EMERGENCY & TOURIST SAFETY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT 'Family',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    notify_on_sos BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.emergency_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy_meters DOUBLE PRECISION,
    battery_level INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'false_alarm')),
    nearest_station TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.train_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_dispatches ENABLE ROW LEVEL SECURITY;

-- ── Public Catalog READ Policies (Allow Anonymous & Authenticated Visitors) ──

DROP POLICY IF EXISTS "Public read destinations" ON public.destinations;
CREATE POLICY "Public read destinations" ON public.destinations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read hotels" ON public.hotels;
CREATE POLICY "Public read hotels" ON public.hotels FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read hotel_rooms" ON public.hotel_rooms;
CREATE POLICY "Public read hotel_rooms" ON public.hotel_rooms FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read airports" ON public.airports;
CREATE POLICY "Public read airports" ON public.airports FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read airlines" ON public.airlines;
CREATE POLICY "Public read airlines" ON public.airlines FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read flights" ON public.flights;
CREATE POLICY "Public read flights" ON public.flights FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read flight_seats" ON public.flight_seats;
CREATE POLICY "Public read flight_seats" ON public.flight_seats FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read train_stations" ON public.train_stations;
CREATE POLICY "Public read train_stations" ON public.train_stations FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read trains" ON public.trains;
CREATE POLICY "Public read trains" ON public.trains FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read tours" ON public.tours;
CREATE POLICY "Public read tours" ON public.tours FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read community_profiles" ON public.community_profiles;
CREATE POLICY "Public read community_profiles" ON public.community_profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "Public read post_media" ON public.post_media;
CREATE POLICY "Public read post_media" ON public.post_media FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read stories" ON public.stories;
CREATE POLICY "Public read stories" ON public.stories FOR SELECT TO anon, authenticated USING (expires_at > now());

DROP POLICY IF EXISTS "Public read groups" ON public.groups;
CREATE POLICY "Public read groups" ON public.groups FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public read comments" ON public.comments;
CREATE POLICY "Public read comments" ON public.comments FOR SELECT TO anon, authenticated USING (true);

-- ── Authenticated User Data Isolation Policies ──

DROP POLICY IF EXISTS "User manage own profile" ON public.profiles;
CREATE POLICY "User manage own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "User manage own community_profile" ON public.community_profiles;
CREATE POLICY "User manage own community_profile" ON public.community_profiles FOR ALL TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "User view own bookings" ON public.bookings;
CREATE POLICY "User view own bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anon view demo bookings" ON public.bookings;
CREATE POLICY "Anon view demo bookings" ON public.bookings FOR SELECT TO anon USING (user_id IS NULL OR true);

DROP POLICY IF EXISTS "User insert booking" ON public.bookings;
CREATE POLICY "User insert booking" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "User view own payments" ON public.payments;
CREATE POLICY "User view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User manage own emergency contacts" ON public.emergency_contacts;
CREATE POLICY "User manage own emergency contacts" ON public.emergency_contacts FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Emergency dispatch insert" ON public.emergency_dispatches;
CREATE POLICY "Emergency dispatch insert" ON public.emergency_dispatches FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ============================================================================
-- 12. HIGH-PERFORMANCE INDEXING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hotels_city ON public.hotels(city);
CREATE INDEX IF NOT EXISTS idx_hotels_base_price ON public.hotels(base_price);
CREATE INDEX IF NOT EXISTS idx_hotels_avg_rating ON public.hotels(average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_flights_departure ON public.flights(departure_airport_id, departure_time);
CREATE INDEX IF NOT EXISTS idx_flights_arrival ON public.flights(arrival_airport_id);
CREATE INDEX IF NOT EXISTS idx_destinations_city ON public.destinations(city);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flights_flight_number ON public.flights(flight_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_rooms_hotel_type ON public.hotel_rooms(hotel_id, room_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tours_title ON public.tours(title);

-- ============================================================================
-- 13. SEED DATA WITH ACCURATE OPENSTREETMAP COORDINATES
-- ============================================================================

-- Update existing hotels with exact GPS coordinates and Bengali descriptions
UPDATE public.hotels SET 
    latitude = 21.2858, 
    longitude = 92.0528, 
    landmarks_summary_bn = 'ইনানী বিচ থেকে ০ কিমি • কলাতলী থেকে ১৮ কিমি',
    landmarks_summary_en = 'Directly on Inani Coral Beach · 18km from Kolatoli'
WHERE name ILIKE '%Sea Pearl%';

UPDATE public.hotels SET 
    latitude = 24.8985, 
    longitude = 89.3622, 
    landmarks_summary_bn = 'মহাস্থানগড় প্রত্নতত্ত্ব সাইট থেকে ৮ কিমি',
    landmarks_summary_en = '8km from historic Mahasthangarh'
WHERE name ILIKE '%Momo Inn%';

UPDATE public.hotels SET 
    latitude = 23.7506, 
    longitude = 90.3942, 
    landmarks_summary_bn = 'কারওয়ান বাজার মেট্রো স্টেশন থেকে ২০০ মিটার',
    landmarks_summary_en = '200m from Karwan Bazar Metro Station'
WHERE name ILIKE '%Pan Pacific%';

UPDATE public.hotels SET 
    latitude = 24.2882, 
    longitude = 91.7388, 
    landmarks_summary_bn = 'লাউয়াছড়া জাতীয় উদ্যান থেকে ৭ কিমি',
    landmarks_summary_en = '7km from Lawachara National Rainforest'
WHERE name ILIKE '%Grand Sultan%';

UPDATE public.hotels SET 
    latitude = 35.0037, 
    longitude = 135.7772, 
    landmarks_summary_bn = 'গিওন ঐতিহাসিক এলাকা • কিয়োটো স্টেশন থেকে ২ কিমি',
    landmarks_summary_en = 'Historic Gion District · 2km from Kyoto Station'
WHERE name ILIKE '%Kyoto%';

UPDATE public.hotels SET 
    latitude = 31.2389, 
    longitude = 121.5002, 
    landmarks_summary_bn = 'লুজিয়াজুই স্কাইলাইন • হুয়াংপু নদী তীরে',
    landmarks_summary_en = 'Lujiazui Skyline overlooking the Huangpu River'
WHERE name ILIKE '%Ritz-Carlton%';

-- Seed Additional Top Bangladesh Hotels with verified Coordinates
INSERT INTO public.hotels (id, name, slug, description, star_rating, average_rating, total_reviews, image_url, address, city, country, latitude, longitude, base_price, currency, amenities, is_featured, landmarks_summary_bn, landmarks_summary_en)
VALUES
('0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d', 'Sayeman Beach Resort', 'sayeman-beach-resort', 'Iconic beachfront heritage resort offering sunset views of Kolatoli.', 5.0, 4.88, 1850, 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800', 'Marine Drive Road, Kolatoli', 'Cox''s Bazar', 'Bangladesh', 21.4172, 91.9812, 115.00, 'USD', ARRAY['Free WiFi', 'Infinity Pool', 'Beach Access', 'Gym', 'Restaurant'], true, 'কলাতলী পয়েন্ট থেকে ০ কিমি • সমুদ্র সৈকতের সামনে', 'Right on Kolatoli Beachfront · Marine Drive'),
('1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e', 'Sajek MeghKabya Hill Resort', 'sajek-meghkabya-resort', 'Perched atop Sajek Valley ridge overlooking endless clouds and hills.', 4.5, 4.92, 620, 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800', 'Ruilui Para, Sajek', 'Sajek Valley', 'Bangladesh', 23.3820, 92.2938, 55.00, 'USD', ARRAY['Mountain View', 'Balcony', 'Breakfast Included', 'Campfire'], true, 'রুইলুই পাড়া হ্যালিপ্যাড থেকে ১৫০ মিটার', '150m from Ruilui Helipad Ridge'),
('2c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f', 'The Palace Luxury Resort Bahubal', 'the-palace-luxury-resort', 'Expansive 5-star estate sprawling over lush Habiganj tea gardens.', 5.0, 4.94, 940, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800', 'Bahubal', 'Sylhet', 'Bangladesh', 24.3541, 91.5372, 160.00, 'USD', ARRAY['Helipad', 'Golf', 'Spa', 'Infinity Pool', 'Nature Trails'], true, 'ঢাকা-সিলেট হাইওয়ে থেকে ৩ কিমি', '3km from Dhaka-Sylhet Highway')
ON CONFLICT (slug) DO UPDATE SET 
    latitude = EXCLUDED.latitude, 
    longitude = EXCLUDED.longitude,
    landmarks_summary_bn = EXCLUDED.landmarks_summary_bn,
    landmarks_summary_en = EXCLUDED.landmarks_summary_en;

-- Seed Hotel Rooms
INSERT INTO public.hotel_rooms (hotel_id, room_type, title, description, price_per_night, currency, capacity_adults, capacity_children, bed_type, amenities, is_available)
SELECT id, 'Deluxe Sea View', 'Deluxe Ocean Panorama Room', 'Private balcony with 180-degree ocean view.', base_price, currency, 2, 1, 'King Bed', ARRAY['Ocean View', 'Air Conditioning', 'Free WiFi', 'Breakfast Included', 'Bathtub'], true
FROM public.hotels
ON CONFLICT DO NOTHING;

-- Seed Airports
INSERT INTO public.airports (iata_code, name, city, country, latitude, longitude)
VALUES
('DAC', 'Hazrat Shahjalal International Airport', 'Dhaka', 'Bangladesh', 23.8433, 90.4042),
('CXB', 'Cox''s Bazar International Airport', 'Cox''s Bazar', 'Bangladesh', 21.4522, 91.9639),
('CGP', 'Shah Amanat International Airport', 'Chittagong', 'Bangladesh', 22.2494, 91.8133),
('ZYL', 'Osmani International Airport', 'Sylhet', 'Bangladesh', 24.9633, 91.8667),
('RJH', 'Shah Makhdum Airport', 'Rajshahi', 'Bangladesh', 24.4372, 88.6164),
('SPD', 'Saidpur Airport', 'Saidpur', 'Bangladesh', 25.7592, 88.9089),
('SIN', 'Singapore Changi Airport', 'Singapore', 'Singapore', 1.3644, 103.9915),
('BKK', 'Suvarnabhumi Airport', 'Bangkok', 'Thailand', 13.6900, 100.7501),
('DPS', 'Ngurah Rai International Airport', 'Bali', 'Indonesia', -8.7482, 115.1672)
ON CONFLICT (iata_code) DO NOTHING;

-- Seed Airlines
INSERT INTO public.airlines (iata_code, name, logo_url, country)
VALUES
('BG', 'Biman Bangladesh Airlines', 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/Biman_Bangladesh_Airlines_Logo.svg/300px-Biman_Bangladesh_Airlines_Logo.svg.png', 'Bangladesh'),
('BS', 'US-Bangla Airlines', 'https://upload.wikimedia.org/wikipedia/en/thumb/9/91/US-Bangla_Airlines_logo.svg/300px-US-Bangla_Airlines_logo.svg.png', 'Bangladesh'),
('VQ', 'NOVOAIR', 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4b/Novoair_logo.svg/300px-Novoair_logo.svg.png', 'Bangladesh'),
('SQ', 'Singapore Airlines', 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6b/Singapore_Airlines_Logo_2.svg/300px-Singapore_Airlines_Logo_2.svg.png', 'Singapore')
ON CONFLICT (iata_code) DO NOTHING;

-- Seed Scheduled Flights
INSERT INTO public.flights (flight_number, airline_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, duration_minutes, base_price, currency, seats_available)
SELECT 
    'BG-433', a.id, d.id, r.id, 
    timezone('utc'::text, now() + interval '2 days' + interval '11 hours'),
    timezone('utc'::text, now() + interval '2 days' + interval '12 hours 05 minutes'),
    65, 4800.00, 'BDT', 22
FROM public.airlines a, public.airports d, public.airports r
WHERE a.iata_code = 'BG' AND d.iata_code = 'DAC' AND r.iata_code = 'CXB'
ON CONFLICT DO NOTHING;

INSERT INTO public.flights (flight_number, airline_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, duration_minutes, base_price, currency, seats_available)
SELECT 
    'BS-141', a.id, d.id, r.id, 
    timezone('utc'::text, now() + interval '2 days' + interval '14 hours'),
    timezone('utc'::text, now() + interval '2 days' + interval '15 hours 00 minutes'),
    60, 4500.00, 'BDT', 18
FROM public.airlines a, public.airports d, public.airports r
WHERE a.iata_code = 'BS' AND d.iata_code = 'DAC' AND r.iata_code = 'CXB'
ON CONFLICT DO NOTHING;

INSERT INTO public.flights (flight_number, airline_id, departure_airport_id, arrival_airport_id, departure_time, arrival_time, duration_minutes, base_price, currency, seats_available)
SELECT 
    'BG-601', a.id, d.id, r.id, 
    timezone('utc'::text, now() + interval '3 days' + interval '09 hours 30 minutes'),
    timezone('utc'::text, now() + interval '3 days' + interval '10 hours 25 minutes'),
    55, 3800.00, 'BDT', 30
FROM public.airlines a, public.airports d, public.airports r
WHERE a.iata_code = 'BG' AND d.iata_code = 'DAC' AND r.iata_code = 'ZYL'
ON CONFLICT DO NOTHING;

-- Seed Destinations
INSERT INTO public.destinations (name, slug, title, city, country, latitude, longitude, cover_image_url, popular_attractions, recommended_activities, average_daily_budget, safety_rating, is_featured)
VALUES
('Cox''s Bazar', 'coxs-bazar', 'World''s Longest Natural Sea Beach', 'Cox''s Bazar', 'Bangladesh', 21.4272, 92.0058, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', ARRAY['Inani Coral Beach', 'Himchari National Park', 'Marine Drive Sunset', 'Maheshkhali Island'], ARRAY['Beach Cycling', 'Surfing', 'Seafood Dining', 'Speedboat Ride'], 85.00, 4.90, true),
('Sajek Valley', 'sajek-valley', 'The Valley of Clouds & Hill Serenity', 'Sajek', 'Bangladesh', 23.3820, 92.2938, 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800', ARRAY['Ruilui Para Helipad', 'Konglak Peak', 'Hajachora Waterfall', 'Lusai Heritage Village'], ARRAY['Cloud Watching', 'Hill Trekking', 'Indigenous BBQ', 'Stargazing'], 65.00, 4.85, true),
('Sreemangal', 'sreemangal', 'Tea Capital of Bangladesh', 'Sreemangal', 'Bangladesh', 24.3065, 91.7296, 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800', ARRAY['Lawachara Rainforest', 'Madhobpur Lake', 'Seven Layer Tea Cabin', 'Baikka Beel Bird Sanctuary'], ARRAY['Tea Garden Cycling', 'Wildlife Spotting', 'Tribal Handicraft Shopping'], 55.00, 4.95, true),
('Sundarbans', 'sundarbans', 'World''s Largest Mangrove Forest & Bengal Tigers', 'Khulna', 'Bangladesh', 21.9497, 89.1833, 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800', ARRAY['Kotka Wildlife Sanctuary', 'Hiron Point', 'Karamjal Crocodile Center', 'Dublar Char'], ARRAY['Mangrove Cruise', 'Tiger Tracking', 'Creek Boat Ride'], 110.00, 4.80, true),
('Bali', 'bali', 'Island of Gods & Lush Tropical Escapes', 'Denpasar', 'Indonesia', -8.4095, 115.1889, 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', ARRAY['Uluwatu Temple', 'Tegallalang Rice Terraces', 'Mount Batur Sunrise', 'Nusa Penida'], ARRAY['Surfing', 'Balinese Spa', 'Temple Tours', 'Scuba Diving'], 95.00, 4.92, true)
ON CONFLICT (slug) DO UPDATE SET 
    latitude = EXCLUDED.latitude, 
    longitude = EXCLUDED.longitude;

-- Seed Featured Tours
INSERT INTO public.tours (title, destination_city, destination_country, duration_days, duration_nights, price_per_person, currency, difficulty_level, featured_image, rating, reviews_count, is_featured, highlights)
VALUES
('Sajek Valley & Ruilui Peak Cloud Expedition', 'Sajek Valley', 'Bangladesh', 3, 2, 6500.00, 'BDT', 'Easy', 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800', 4.92, 142, true, ARRAY['4x4 Chander Gari Mountain Ride', 'Konglak Peak Hike', 'Cloud Sunrise from Resort Balcony', 'Tribal Dinner Experience']),
('Cox''s Bazar Marine Drive & St. Martin Cruise', 'Cox''s Bazar', 'Bangladesh', 4, 3, 11500.00, 'BDT', 'Easy', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', 4.95, 230, true, ARRAY['Bay of Bengal Sunset Cruise', 'Coral Beach Exploration', 'Fresh Grilled Seafood Feast', '5-Star Resort Stay']),
('Sreemangal Rainforest & Tea Estate Retreat', 'Sreemangal', 'Bangladesh', 2, 1, 4800.00, 'BDT', 'Easy', 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800', 4.88, 88, true, ARRAY['Lawachara Canopy Walk', 'Famous Nilkantha 7-Layer Tea', 'Rubber & Pineapple Plantation Walk'])
ON CONFLICT (title) DO NOTHING;

-- ============================================================================
-- END OF COMPLETE PRODUCTION SCHEMA
-- ============================================================================
