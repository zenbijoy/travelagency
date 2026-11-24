import { create } from "zustand";
import {
  ActiveCallState,
  CallParticipant,
  CallStatus,
  CallType,
  IncomingCallInvite,
  QualityMetrics,
  InCallMessage,
} from "../types";

const DEFAULT_METRICS: QualityMetrics = {
  quality: "good",
  rttMs: 24,
  packetLossPercent: 0,
  jitterMs: 4,
  bitrateKbps: 64,
  relayUsed: false,
  iceType: "Direct P2P",
};

interface CallStoreState {
  activeCall: ActiveCallState | null;
  incomingCall: IncomingCallInvite | null;

  // Actions
  setIncomingCall: (invite: IncomingCallInvite | null) => void;
  startCall: (params: {
    callId: string;
    role: "caller" | "callee";
    participant: CallParticipant;
    type: CallType;
  }) => void;
  setCallStatus: (status: CallStatus) => void;
  setDurationSeconds: (seconds: number | ((prev: number) => number)) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
  toggleCameraFacing: () => void;
  setMinimized: (minimized: boolean) => void;
  setMetrics: (metrics: Partial<QualityMetrics>) => void;
  toggleItinerarySheet: (open?: boolean) => void;
  addInCallMessage: (message: Omit<InCallMessage, "id" | "timestamp">) => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  activeCall: null,
  incomingCall: null,

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  startCall: ({ callId, role, participant, type }) =>
    set({
      incomingCall: null,
      activeCall: {
        callId,
        role,
        participant,
        type,
        status: role === "caller" ? "calling" : "connecting",
        startedAt: Date.now(),
        durationSeconds: 0,
        isMuted: false,
        isVideoEnabled: type === "video",
        isSpeakerOn: type === "video",
        isFrontCamera: true,
        isMinimized: false,
        metrics: DEFAULT_METRICS,
        inCallMessages: [],
        showItinerarySheet: false,
      },
    }),

  setCallStatus: (status) =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              status,
              connectedAt: status === "connected" && !state.activeCall.connectedAt ? Date.now() : state.activeCall.connectedAt,
            },
          }
        : {}
    ),

  setDurationSeconds: (durationSeconds) =>
    set((state) => {
      if (!state.activeCall) return {};
      const next =
        typeof durationSeconds === "function"
          ? durationSeconds(state.activeCall.durationSeconds || 0)
          : durationSeconds;
      return { activeCall: { ...state.activeCall, durationSeconds: next } };
    }),

  toggleMute: () =>
    set((state) =>
      state.activeCall
        ? { activeCall: { ...state.activeCall, isMuted: !state.activeCall.isMuted } }
        : {}
    ),

  toggleVideo: () =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              isVideoEnabled: !state.activeCall.isVideoEnabled,
            },
          }
        : {}
    ),

  toggleSpeaker: () =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              isSpeakerOn: !state.activeCall.isSpeakerOn,
            },
          }
        : {}
    ),

  toggleCameraFacing: () =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              isFrontCamera: !state.activeCall.isFrontCamera,
            },
          }
        : {}
    ),

  setMinimized: (isMinimized) =>
    set((state) =>
      state.activeCall ? { activeCall: { ...state.activeCall, isMinimized } } : {}
    ),

  setMetrics: (metrics) =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              metrics: { ...state.activeCall.metrics, ...metrics },
            },
          }
        : {}
    ),

  toggleItinerarySheet: (open) =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              showItinerarySheet:
                typeof open === "boolean" ? open : !state.activeCall.showItinerarySheet,
            },
          }
        : {}
    ),

  addInCallMessage: (msg) =>
    set((state) => {
      if (!state.activeCall) return {};
      const newMsg: InCallMessage = {
        id: "msg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        timestamp: Date.now(),
        ...msg,
      };
      return {
        activeCall: {
          ...state.activeCall,
          inCallMessages: [...state.activeCall.inCallMessages, newMsg],
        },
      };
    }),

  endCall: () =>
    set((state) =>
      state.activeCall
        ? {
            activeCall: {
              ...state.activeCall,
              status: "ended",
            },
          }
        : {}
    ),

  resetCall: () => set({ activeCall: null, incomingCall: null }),
}));
