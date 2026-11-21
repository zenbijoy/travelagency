import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const NAVY = '#0F172A';
const GOLD = '#E5A93C';

interface InCallModalProps {
  visible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onMute: () => void;
  onSpeaker: () => void;
  onEnd: () => void;
  isMuted: boolean;
  isSpeakerOn: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function InCallModal({
  visible,
  callerName,
  callerAvatar,
  callType,
  onMute,
  onSpeaker,
  onEnd,
  isMuted,
  isSpeakerOn,
}: InCallModalProps): React.ReactElement {
  const [duration, setDuration] = useState(0);

  // Waveform animated values
  const bar1 = useRef(new Animated.Value(0.4)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(0.5)).current;

  // Duration timer
  useEffect(() => {
    if (!visible) {
      setDuration(0);
      return;
    }
    const timer = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  // Waveform animation
  useEffect(() => {
    if (!visible) return;

    function animateBar(
      value: Animated.Value,
      toValue: number,
      duration: number,
    ): Animated.CompositeAnimation {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.3,
            duration,
            useNativeDriver: true,
          }),
        ]),
      );
    }

    const anim1 = animateBar(bar1, 1.0, 400);
    const anim2 = animateBar(bar2, 0.5, 600);
    const anim3 = animateBar(bar3, 0.9, 500);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [visible, bar1, bar2, bar3]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Avatar */}
        <View style={styles.avatarWrapper}>
          {callerAvatar ? (
            <Image source={{ uri: callerAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {callerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Caller info */}
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callTypeLabel}>
          {callType === 'video' ? '📹 Video Call' : '🎙️ Audio Call'}
        </Text>
        <Text style={styles.duration}>{formatDuration(duration)}</Text>

        {/* Waveform */}
        <View style={styles.waveform}>
          {([bar1, bar2, bar3] as Animated.Value[]).map((bar, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                { transform: [{ scaleY: bar }] },
              ]}
            />
          ))}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
            onPress={onMute}
            accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
          >
            <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
            <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.endBtn]}
            onPress={onEnd}
            accessibilityLabel="End call"
          >
            <Text style={styles.endIcon}>📵</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, isSpeakerOn && styles.controlBtnActive]}
            onPress={onSpeaker}
            accessibilityLabel={isSpeakerOn ? 'Speaker off' : 'Speaker on'}
          >
            <Text style={styles.controlIcon}>{isSpeakerOn ? '🔊' : '🔈'}</Text>
            <Text style={styles.controlLabel}>
              {isSpeakerOn ? 'Speaker' : 'Earpiece'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  avatarWrapper: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: GOLD,
  },
  avatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '700',
    color: NAVY,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  callTypeLabel: {
    fontSize: 14,
    color: GOLD,
    marginBottom: 8,
  },
  duration: {
    fontSize: 20,
    color: '#94A3B8',
    fontVariant: ['tabular-nums'],
    marginBottom: 32,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 60,
    marginBottom: 48,
  },
  bar: {
    width: 10,
    height: 50,
    borderRadius: 5,
    backgroundColor: GOLD,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  controlBtn: {
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 40,
    padding: 16,
    minWidth: 72,
  },
  controlBtnActive: {
    backgroundColor: GOLD,
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 4,
  },
  endBtn: {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 40,
    padding: 20,
    minWidth: 80,
  },
  endIcon: {
    fontSize: 28,
  },
});

export default InCallModal;
