import { Platform, Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "../../../utils/safeExpoAv";

class CallAudioEngine {
  private audioCtx: any = null;
  private isRingbackPlaying = false;
  private ringbackTimer: NodeJS.Timeout | null = null;
  private osc1: any = null;
  private osc2: any = null;
  private gainNode: any = null;
  private isIncomingRinging = false;
  private incomingVibrationTimer: NodeJS.Timeout | null = null;

  private getAudioContext(): any {
    if (typeof window !== "undefined") {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        if (!this.audioCtx || this.audioCtx.state === "closed") {
          this.audioCtx = new AudioContextClass();
        }
        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume();
        }
        return this.audioCtx;
      }
    }
    return null;
  }

  public async setAudioRoute(speakerOn: boolean): Promise<void> {
    try {
      if (Audio && typeof Audio.setAudioModeAsync === "function") {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: !speakerOn,
        });
      }
    } catch {
      // Audio routing non-fatal
    }
  }

  /**
   * Start ringing simulation for incoming calls (rhythmic vibration & alert pulses)
   */
  public startIncomingRingtone(): void {
    this.stopIncomingRingtone();
    this.isIncomingRinging = true;

    // Trigger immediate haptics
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    if (Platform.OS !== "web") {
      // Loop vibration: 0ms wait, 1000ms buzz, 1000ms pause
      Vibration.vibrate([0, 1000, 1000], true);
    } else {
      // Synthesize soft incoming call melody via Web Audio
      const playMelody = () => {
        if (!this.isIncomingRinging) return;
        const ctx = this.getAudioContext();
        if (!ctx) return;
        try {
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.6);
        } catch {}
        this.incomingVibrationTimer = setTimeout(playMelody, 2000);
      };
      playMelody();
    }
  }

  public stopIncomingRingtone(): void {
    this.isIncomingRinging = false;
    if (Platform.OS !== "web") {
      Vibration.cancel();
    }
    if (this.incomingVibrationTimer) {
      clearTimeout(this.incomingVibrationTimer);
      this.incomingVibrationTimer = null;
    }
  }

  /**
   * Outgoing ringback tone: 440Hz + 480Hz dual tone pulse
   */
  public startRingback(): void {
    this.stopRingback();
    this.isRingbackPlaying = true;

    const playTonePulse = () => {
      if (!this.isRingbackPlaying) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      try {
        const now = ctx.currentTime;
        this.osc1 = ctx.createOscillator();
        this.osc2 = ctx.createOscillator();
        this.gainNode = ctx.createGain();

        this.osc1.frequency.setValueAtTime(440, now);
        this.osc2.frequency.setValueAtTime(480, now);

        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(0.06, now + 0.05);
        this.gainNode.gain.setValueAtTime(0.06, now + 1.75);
        this.gainNode.gain.linearRampToValueAtTime(0.0001, now + 1.8);

        this.osc1.connect(this.gainNode);
        this.osc2.connect(this.gainNode);
        this.gainNode.connect(ctx.destination);

        this.osc1.start(now);
        this.osc2.start(now);
        this.osc1.stop(now + 1.82);
        this.osc2.stop(now + 1.82);

        this.ringbackTimer = setTimeout(() => {
          if (this.isRingbackPlaying) {
            playTonePulse();
          }
        }, 4000);
      } catch (e) {
        console.warn("Ringback audio error:", e);
      }
    };

    playTonePulse();
  }

  public stopRingback(): void {
    this.isRingbackPlaying = false;
    if (this.ringbackTimer) {
      clearTimeout(this.ringbackTimer);
      this.ringbackTimer = null;
    }
    try {
      if (this.osc1) {
        this.osc1.stop();
        this.osc1.disconnect();
        this.osc1 = null;
      }
      if (this.osc2) {
        this.osc2.stop();
        this.osc2.disconnect();
        this.osc2 = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    } catch {}
  }

  /**
   * Play positive connection established chime
   */
  public playConnectedChime(): void {
    this.stopRingback();
    this.stopIncomingRingtone();
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch {}
  }

  /**
   * Play three rapid 480Hz busy/disconnect beeps
   */
  public playDisconnectTone(): void {
    this.stopRingback();
    this.stopIncomingRingtone();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const startTime = now + i * 0.22;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(480, startTime);
        gain.gain.setValueAtTime(0.08, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.12);
      }
    } catch {}
  }
}

export const callAudioEngine = new CallAudioEngine();
