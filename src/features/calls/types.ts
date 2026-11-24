/**
 * Shopno Jatra - Advanced Calling & RTC Types
 * Adapted & enhanced from SkillBridge Final Project
 */

export type CallStatus =
  | "idle"
  | "calling"
  | "ringing"
  | "gathering_ice"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "declined"
  | "busy"
  | "timeout"
  | "ended"
  | "failed";

export type CallType = "audio" | "video";

export type CallerRole =
  | "tour_guide"
  | "hotel_front_desk"
  | "travel_agent"
  | "emergency_support"
  | "traveler_peer";

export type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "critical";

export type CandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

export interface QualityMetrics {
  quality: NetworkQuality;
  rttMs: number;
  packetLossPercent: number;
  jitterMs: number;
  bitrateKbps: number;
  relayUsed: boolean;
  iceType: string;
}

export interface CallParticipant {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role: CallerRole;
  roleLabelBn?: string;
  roleLabelEn?: string;
  verified?: boolean;
  location?: string;
  rating?: number;
}

export interface InCallMessage {
  id: string;
  sender: "me" | "them";
  text: string;
  timestamp: number;
}

export interface QuickDeclineReply {
  id: string;
  textBn: string;
  textEn: string;
}

export interface ActiveCallState {
  callId: string;
  type: CallType;
  status: CallStatus;
  role: "caller" | "callee";
  participant: CallParticipant;
  startedAt?: number;
  connectedAt?: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  isMinimized: boolean;
  metrics: QualityMetrics;
  inCallMessages: InCallMessage[];
  showItinerarySheet: boolean;
}

export interface IncomingCallInvite {
  callId: string;
  caller: CallParticipant;
  type: CallType;
  timestamp: number;
}
