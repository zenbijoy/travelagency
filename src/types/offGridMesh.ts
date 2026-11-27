/**
/**
 * Off-Grid P2P Mesh Communication & Safety Types - Shopno Jatra
 * Complete contracts for Bluetooth Low Energy (BLE) / Wi-Fi Direct mesh networking,
 * proximity radar, store-and-forward relaying, and offline SOS distress beacons.
 */

import { GeoCoordinates } from "../services/safety/sosService";

export type MeshNodeRole = "leader" | "guide" | "member" | "medic";
export type MeshNodeStatus = "active" | "weak" | "lost" | "sos";
export type MeshPowerMode = "eco" | "balanced" | "emergency";

export interface MeshNode {
  id: string;
  peerName: string;
  role: MeshNodeRole;
  phone?: string;
  avatarUrl?: string;
  lastSeen: number;
  rssi: number; // Received Signal Strength Indicator in dBm (-30 dBm near to -95 dBm far)
  estimatedDistanceMeters: number;
  compassBearingDegrees: number; // 0-360 degrees relative to magnetic North
  batteryLevel: number; // 0-100 percentage
  status: MeshNodeStatus;
  coordinates?: GeoCoordinates;
  isRelayNode: boolean;
}

export type MeshPacketType = 
  | "PING" 
  | "TEXT" 
  | "SOS_BEACON" 
  | "SOS_CANCEL"
  | "CHECKPOINT" 
  | "ACK";

export interface MeshPacket {
  id: string;
  type: MeshPacketType;
  senderId: string;
  senderName: string;
  targetId?: string; // Optional: specific recipient or broadcast if undefined
  payload: any;
  hops: number;
  maxHops: number;
  timestamp: number;
  signature?: string;
}

export interface MeshMessage {
  id: string;
  packetId: string;
  senderId: string;
  senderName: string;
  senderRole?: MeshNodeRole;
  text: string;
  timestamp: number;
  status: "sending" | "sent" | "relayed" | "delivered";
  hops: number;
  isUrgent?: boolean;
}

export type SosEmergencyType = "medical" | "injury" | "lost" | "wildlife" | "weather" | "general";

export interface SosBeaconPayload {
  id: string;
  senderId: string;
  senderName: string;
  emergencyType: SosEmergencyType;
  medicalNotes?: string;
  batteryPercentage: number;
  coordinates?: GeoCoordinates;
  triggeredAt: number;
  relayCount: number;
  relayedByNodeNames: string[];
  cloudSynced: boolean;
  cloudSyncedAt?: number;
}

export type CheckpointType = "campsite" | "water_source" | "shelter" | "danger_zone" | "rendezvous";

export interface TrailCheckpoint {
  id: string;
  title: string;
  type: CheckpointType;
  description?: string;
  coordinates: GeoCoordinates;
  createdBy: string;
  createdAt: number;
  distanceFromCurrentMeters?: number;
  bearingFromCurrentDegrees?: number;
}

export interface MeshNetworkState {
  isActive: boolean;
  networkId: string; // e.g. "SAJEK-EXPEDITION-2026"
  passcode?: string;
  localNodeId: string;
  localNodeName: string;
  powerMode: MeshPowerMode;
  dutyCycleSeconds: {
    scanInterval: number;
    advertisingInterval: number;
  };
  connectedNodes: MeshNode[];
  activeSosBeacon: SosBeaconPayload | null;
  unreadCount: number;
  cloudSyncPendingCount: number;
}
