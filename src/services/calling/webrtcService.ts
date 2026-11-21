import { supabase } from '../../utils/supabase';

export interface CallSession {
  id: string;
  callerId: string;
  calleeId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'rejected';
  startedAt?: Date;
  endedAt?: Date;
}

export interface WebRTCService {
  initiateCall(targetUserId: string, callType: 'audio' | 'video'): Promise<CallSession>;
  acceptCall(callId: string): Promise<void>;
  rejectCall(callId: string): Promise<void>;
  endCall(callId: string): Promise<void>;
  subscribeToIncomingCalls(userId: string, callback: (session: CallSession) => void): () => void;
}

type SignalPayload =
  | { event: 'call_initiated'; session: CallSession }
  | { event: 'call_accepted'; callId: string }
  | { event: 'call_rejected'; callId: string }
  | { event: 'call_ended'; callId: string };

const sessions = new Map<string, CallSession>();

function generateId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const webrtcServiceImpl: WebRTCService = {
  async initiateCall(targetUserId: string, callType: 'audio' | 'video'): Promise<CallSession> {
    const { data: userData } = await supabase.auth.getUser();
    const callerId = userData.user?.id ?? 'unknown';

    const session: CallSession = {
      id: generateId(),
      callerId,
      calleeId: targetUserId,
      callType,
      status: 'ringing',
      startedAt: new Date(),
    };

    sessions.set(session.id, session);

    const payload: SignalPayload = { event: 'call_initiated', session };
    await supabase
      .channel(`calls:${targetUserId}`)
      .send({ type: 'broadcast', event: 'signal', payload });

    return session;
  },

  async acceptCall(callId: string): Promise<void> {
    const session = sessions.get(callId);
    if (!session) return;

    session.status = 'active';
    session.startedAt = new Date();
    sessions.set(callId, session);

    const payload: SignalPayload = { event: 'call_accepted', callId };
    await supabase
      .channel(`calls:${session.callerId}`)
      .send({ type: 'broadcast', event: 'signal', payload });
  },

  async rejectCall(callId: string): Promise<void> {
    const session = sessions.get(callId);
    if (!session) return;

    session.status = 'rejected';
    session.endedAt = new Date();
    sessions.set(callId, session);

    const payload: SignalPayload = { event: 'call_rejected', callId };
    await supabase
      .channel(`calls:${session.callerId}`)
      .send({ type: 'broadcast', event: 'signal', payload });
  },

  async endCall(callId: string): Promise<void> {
    const session = sessions.get(callId);
    if (!session) return;

    const { data: userData } = await supabase.auth.getUser();
    const currentUserId = userData.user?.id;
    const otherUserId =
      currentUserId === session.callerId ? session.calleeId : session.callerId;

    session.status = 'ended';
    session.endedAt = new Date();
    sessions.set(callId, session);

    const payload: SignalPayload = { event: 'call_ended', callId };
    await supabase
      .channel(`calls:${otherUserId}`)
      .send({ type: 'broadcast', event: 'signal', payload });
  },

  subscribeToIncomingCalls(userId: string, callback: (session: CallSession) => void): () => void {
    const channel = supabase
      .channel(`calls:${userId}`)
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalPayload }) => {
        if (payload.event === 'call_initiated') {
          sessions.set(payload.session.id, payload.session);
          callback(payload.session);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};

export const webrtcService: WebRTCService = webrtcServiceImpl;
