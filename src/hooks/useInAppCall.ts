import { useCallback, useEffect, useRef, useState } from 'react';
import { CallSession, webrtcService } from '../services/calling/webrtcService';
import { supabase } from '../utils/supabase';

interface UseInAppCallReturn {
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  callState: 'idle' | 'calling' | 'connected' | 'ended';
  isMuted: boolean;
  isSpeakerOn: boolean;
  initiateCall(targetUserId: string, callType: 'audio' | 'video'): Promise<void>;
  acceptCall(): Promise<void>;
  rejectCall(): Promise<void>;
  endCall(): Promise<void>;
  toggleMute(): void;
  toggleSpeaker(): void;
}

export function useInAppCall(): UseInAppCallReturn {
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let userId: string | null = null;

    const setup = async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId) return;

      const unsub = webrtcService.subscribeToIncomingCalls(userId, (session) => {
        setIncomingCall(session);
      });
      unsubscribeRef.current = unsub;
    };

    void setup();

    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const initiateCall = useCallback(
    async (targetUserId: string, callType: 'audio' | 'video'): Promise<void> => {
      setCallState('calling');
      try {
        const session = await webrtcService.initiateCall(targetUserId, callType);
        setActiveCall(session);
      } catch {
        setCallState('idle');
      }
    },
    [],
  );

  const acceptCall = useCallback(async (): Promise<void> => {
    if (!incomingCall) return;
    await webrtcService.acceptCall(incomingCall.id);
    setActiveCall({ ...incomingCall, status: 'active' });
    setIncomingCall(null);
    setCallState('connected');
  }, [incomingCall]);

  const rejectCall = useCallback(async (): Promise<void> => {
    if (!incomingCall) return;
    await webrtcService.rejectCall(incomingCall.id);
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall]);

  const endCall = useCallback(async (): Promise<void> => {
    const call = activeCall ?? incomingCall;
    if (!call) return;
    await webrtcService.endCall(call.id);
    setActiveCall(null);
    setIncomingCall(null);
    setCallState('ended');
    setTimeout(() => setCallState('idle'), 1500);
  }, [activeCall, incomingCall]);

  const toggleMute = useCallback((): void => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleSpeaker = useCallback((): void => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  return {
    activeCall,
    incomingCall,
    callState,
    isMuted,
    isSpeakerOn,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
