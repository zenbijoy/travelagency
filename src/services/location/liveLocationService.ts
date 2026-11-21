import * as Location from 'expo-location';
import { supabase } from '../../utils/supabase';

export interface LocationCoords {
  lat: number;
  lng: number;
}

export interface LocationUpdate {
  userId: string;
  coords: LocationCoords;
  timestamp: number;
}

export interface LiveLocationService {
  getCurrentLocation(): Promise<LocationCoords>;
  startSharingLocation(userId: string, channelId: string): Promise<void>;
  stopSharingLocation(): void;
  subscribeToLocation(channelId: string, callback: (update: LocationUpdate) => void): () => void;
  generateShareLink(lat: number, lng: number): string;
}

type LocationBroadcastPayload = {
  event: 'location_update';
  data: LocationUpdate;
};

let sharingInterval: ReturnType<typeof setInterval> | null = null;
let sharingChannelId: string | null = null;
let sharingUserId: string | null = null;

const liveLocationServiceImpl: LiveLocationService = {
  async getCurrentLocation(): Promise<LocationCoords> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      throw new Error('Location permission denied');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  },

  async startSharingLocation(userId: string, channelId: string): Promise<void> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== Location.PermissionStatus.GRANTED) {
      throw new Error('Location permission denied');
    }

    sharingUserId = userId;
    sharingChannelId = channelId;

    const broadcastLocation = async () => {
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const update: LocationUpdate = {
          userId,
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          timestamp: Date.now(),
        };

        const payload: LocationBroadcastPayload = { event: 'location_update', data: update };

        await supabase
          .channel(`location:${channelId}`)
          .send({ type: 'broadcast', event: 'location_update', payload });
      } catch {
        // Silently ignore location errors during sharing
      }
    };

    await broadcastLocation();
    sharingInterval = setInterval(() => void broadcastLocation(), 5000);
  },

  stopSharingLocation(): void {
    if (sharingInterval !== null) {
      clearInterval(sharingInterval);
      sharingInterval = null;
    }
    if (sharingChannelId !== null) {
      const channel = supabase.channel(`location:${sharingChannelId}`);
      void supabase.removeChannel(channel);
      sharingChannelId = null;
    }
    sharingUserId = null;
  },

  subscribeToLocation(
    channelId: string,
    callback: (update: LocationUpdate) => void,
  ): () => void {
    const channel = supabase
      .channel(`location:${channelId}`)
      .on(
        'broadcast',
        { event: 'location_update' },
        ({ payload }: { payload: LocationBroadcastPayload }) => {
          callback(payload.data);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  generateShareLink(lat: number, lng: number): string {
    return `https://maps.google.com/?q=${lat},${lng}`;
  },
};

export const liveLocationService: LiveLocationService = liveLocationServiceImpl;
