import { useCallback, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import {
  LocationCoords,
  liveLocationService,
} from '../services/location/liveLocationService';

interface UseLiveLocationReturn {
  currentLocation: LocationCoords | null;
  isSharing: boolean;
  error: string | null;
  startSharing(channelId: string): Promise<void>;
  stopSharing(): void;
  subscribeToPartnerLocation(channelId: string): () => void;
  shareLink: string | null;
}

export function useLiveLocation(): UseLiveLocationReturn {
  const [currentLocation, setCurrentLocation] = useState<LocationCoords | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);

  const sharingChannelRef = useRef<string | null>(null);

  const startSharing = useCallback(async (channelId: string): Promise<void> => {
    setError(null);
    try {
      const coords = await liveLocationService.getCurrentLocation();
      setCurrentLocation(coords);
      const link = liveLocationService.generateShareLink(coords.lat, coords.lng);
      setShareLink(link);

      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id ?? 'anonymous';

      await liveLocationService.startSharingLocation(userId, channelId);
      sharingChannelRef.current = channelId;
      setIsSharing(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start sharing location';
      setError(message);
    }
  }, []);

  const stopSharing = useCallback((): void => {
    liveLocationService.stopSharingLocation();
    sharingChannelRef.current = null;
    setIsSharing(false);
    setShareLink(null);
  }, []);

  const subscribeToPartnerLocation = useCallback((channelId: string): () => void => {
    return liveLocationService.subscribeToLocation(channelId, (update) => {
      setCurrentLocation(update.coords);
      const link = liveLocationService.generateShareLink(update.coords.lat, update.coords.lng);
      setShareLink(link);
    });
  }, []);

  return {
    currentLocation,
    isSharing,
    error,
    startSharing,
    stopSharing,
    subscribeToPartnerLocation,
    shareLink,
  };
}
