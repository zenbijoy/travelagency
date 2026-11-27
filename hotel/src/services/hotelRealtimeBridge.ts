/**
 * Hotel Supabase Realtime Bridge
 *
 * Subscribes to Supabase Realtime updates on "bookings" and "hotel_rooms" tables,
 * enabling real-time cross-app synchronization (Consumer bookings / payments instantly
 * appear in Hotel Reservations & Dashboard).
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type ChangeCallback = (table: string, payload: any) => void;
const listeners = new Set<ChangeCallback>();

let bookingsChannel: RealtimeChannel | null = null;

function isRecordInHotelScope(payload: any, hotelId?: string): boolean {
  if (!hotelId) return true;
  const record = (payload?.new || payload?.old) as Record<string, any> | undefined;
  if (!record) return false;
  const recHotelId = record.hotel_id || record.property_id || record.tenant_id;
  if (!recHotelId) return false;
  return String(recHotelId) === String(hotelId);
}

export function initHotelRealtimeBridge(hotelId?: string): () => void {
  teardownHotelRealtimeBridge();

  const normalizedHotelId = hotelId ? String(hotelId).trim() : undefined;
  const hotelFilter = normalizedHotelId ? `hotel_id=eq.${normalizedHotelId}` : undefined;
  const channelName = normalizedHotelId
    ? `hotel-realtime-bookings-${normalizedHotelId.slice(0, 8)}`
    : 'hotel-realtime-bookings';

  try {
    bookingsChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          ...(hotelFilter ? { filter: hotelFilter } : {}),
        },
        (payload) => {
          if (!isRecordInHotelScope(payload, normalizedHotelId)) return;
          listeners.forEach((cb) => cb('bookings', payload));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hotel_rooms',
          ...(hotelFilter ? { filter: hotelFilter } : {}),
        },
        (payload) => {
          if (!isRecordInHotelScope(payload, normalizedHotelId)) return;
          listeners.forEach((cb) => cb('hotel_rooms', payload));
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('[HotelRealtimeBridge] Subscription notice:', err);
  }

  return () => {
    teardownHotelRealtimeBridge();
  };
}

export function subscribeToHotelRealtime(callback: ChangeCallback): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function teardownHotelRealtimeBridge(): void {
  if (bookingsChannel) {
    supabase.removeChannel(bookingsChannel);
    bookingsChannel = null;
  }
}
