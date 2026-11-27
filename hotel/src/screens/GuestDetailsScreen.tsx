import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { hotelService, HotelReservation } from '../services/hotelService';

export function GuestDetailsScreen({ navigation, route }: any) {
  const initialRes: HotelReservation = route?.params?.reservation || {
    id: 'res-default',
    bookingId: '#HTL-CX01',
    name: 'Robert Fox',
    roomType: 'Deluxe Sea View',
    roomNumber: '204',
    dates: '26 May - 29 May, 3 Nights',
    checkInDate: '2026-05-26',
    checkOutDate: '2026-05-29',
    guests: '2 Adults',
    price: '৳25,500',
    priceBdt: 25500,
    status: 'Confirmed',
    isVIP: true,
    isPaid: true,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    phone: '+880 1711 000000',
    specialRequests: 'High floor, ocean sunset view',
    digitalKeyPasscode: '449102',
  };

  const [reservation, setReservation] = useState<HotelReservation>(initialRes);
  const [digitalKey, setDigitalKey] = useState<string | null>(initialRes.digitalKeyPasscode || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [extraChargesInput, setExtraChargesInput] = useState('');

  const handleExpressCheckIn = async () => {
    setIsProcessing(true);
    try {
      const res = await hotelService.expressCheckIn({
        reservationId: reservation.id,
        roomUnitId: 'u_204',
        guestNidOrPassport: 'NID-992817291',
      });
      if (res.success) {
        setDigitalKey(res.digitalKeyPasscode);
        setReservation((prev) => ({
          ...prev,
          status: 'Checked In',
          roomNumber: res.roomNumber,
          digitalKeyPasscode: res.digitalKeyPasscode,
        }));
        Alert.alert(
          'Express Check-In Successful',
          `Guest has been checked in to Room ${res.roomNumber}.\nDigital Key Passcode: ${res.digitalKeyPasscode}`
        );
      }
    } catch {
      Alert.alert('Check-In Error', 'Could not complete check-in. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmCheckout = async () => {
    setIsProcessing(true);
    setCheckoutModalVisible(false);
    try {
      const extras = parseFloat(extraChargesInput) || 0;
      const res = await hotelService.checkOutAndSettle({
        reservationId: reservation.id,
        roomUnitId: 'u_204',
        additionalChargesBdt: extras,
      });
      if (res.success) {
        setReservation((prev) => ({
          ...prev,
          status: 'Checked Out',
        }));
        Alert.alert(
          'Checkout & Folio Settled',
          `Folio successfully settled. Total Net BDT ${res.netSettledBdt.toLocaleString()} (incl. VAT & Service Charge).\nHousekeeping cleaning task has been queued.`
        );
      }
    } catch {
      Alert.alert('Checkout Error', 'Failed to settle folio.');
    } finally {
      setIsProcessing(false);
    }
  };

  const InfoRow = ({ label, value, icon, isPaid }: any) => (
    <View className={`flex-row justify-between items-center py-3.5 ${!isPaid ? 'border-b border-gray-800/80' : ''}`}>
      <Text className="text-gray-400 text-xs">{label}</Text>
      <View className="flex-row items-center space-x-2">
        <View className="items-end">
          {typeof value === 'string' ? (
            <Text className={`font-semibold text-xs ${isPaid ? 'text-emerald-400' : 'text-white'}`}>{value}</Text>
          ) : (
            value
          )}
        </View>
        {icon && <MaterialIcons name={icon} size={15} color="#818cf8" />}
        {isPaid && <MaterialIcons name="check-circle" size={15} color="#4ade80" />}
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0f111a]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="flex-row items-center justify-between px-6 py-4">
        <TouchableOpacity className="p-2 bg-gray-800/40 rounded-full" onPress={() => navigation?.goBack?.()}>
          <MaterialIcons name="arrow-back" size={22} color="white" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-white">Guest Folio & Stays</Text>
        <TouchableOpacity
          className="p-2 bg-gray-800/40 rounded-full"
          onPress={() => Alert.alert('Share Invoice', `Reservation ${reservation.bookingId} receipt shared.`)}
        >
          <MaterialIcons name="share" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* Guest Profile Card */}
        <LinearGradient
          colors={['#1e2540', '#2a3461']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-[28px] p-5 mt-2 border border-white/10"
        >
          <View className="flex-row items-center space-x-4">
            <View className="w-16 h-16 rounded-full overflow-hidden border-2 border-indigo-400">
              <Image source={{ uri: reservation.avatar }} className="w-full h-full" />
            </View>
            <View className="flex-1 ms-3">
              <View className="flex-row items-center space-x-2">
                <Text className="text-xl font-bold text-white">{reservation.name}</Text>
                {reservation.isVIP && (
                  <View className="bg-amber-500/20 px-2 py-0.5 rounded-full flex-row items-center ms-2">
                    <MaterialIcons name="star" size={10} color="#fbbf24" />
                    <Text className="text-amber-400 text-[10px] font-bold ms-1">VIP</Text>
                  </View>
                )}
              </View>
              <View className="mt-1.5 space-y-1">
                <View className="flex-row items-center space-x-2">
                  <MaterialIcons name="phone" size={13} color="#818cf8" />
                  <Text className="text-gray-300 text-xs ms-1">{reservation.phone || '+880 1711 000000'}</Text>
                </View>
                <View className="flex-row items-center space-x-2">
                  <MaterialIcons name="confirmation-number" size={13} color="#818cf8" />
                  <Text className="text-gray-300 text-xs ms-1">{reservation.bookingId}</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Digital Room Key Card */}
        {digitalKey && (
          <View className="mt-4 p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30">
            <View className="flex-row justify-between items-center mb-2">
              <View className="flex-row items-center">
                <MaterialCommunityIcons name="cellphone-key" size={20} color="#818cf8" />
                <Text className="text-white font-bold text-xs ms-2">Digital Key Card & WiFi</Text>
              </View>
              <View className="bg-indigo-500/20 px-2 py-0.5 rounded-full">
                <Text className="text-indigo-300 text-[10px] font-semibold">Active Key</Text>
              </View>
            </View>
            <View className="flex-row justify-between items-center mt-1">
              <Text className="text-slate-400 text-xs">Room Passcode:</Text>
              <Text className="text-emerald-400 font-mono font-bold text-lg tracking-widest">{digitalKey}</Text>
            </View>
            <Text className="text-[10px] text-slate-500 mt-1">NFC tap or keypad entry ready. Valid until checkout 12:00 PM.</Text>
          </View>
        )}

        {/* Reservation Details */}
        <View className="bg-[#161b22] border border-gray-800 rounded-2xl p-4 mt-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Folio Details</Text>
          <InfoRow label="Room Number" value={reservation.roomNumber || 'Assigned at Check-in'} icon="meeting-room" />
          <InfoRow label="Room Type" value={reservation.roomType} icon="apartment" />
          <InfoRow label="Stay Dates" value={reservation.dates} icon="event" />
          <InfoRow label="Guests" value={reservation.guests} icon="people" />
          <InfoRow label="Reservation Status" value={reservation.status} />
          <InfoRow label="Payment Status" value={reservation.isPaid ? 'Paid in Full' : 'Pending Settlement'} isPaid={reservation.isPaid} />

          {reservation.specialRequests ? (
            <View className="mt-3 pt-3 border-t border-gray-800">
              <Text className="text-[10px] font-semibold text-amber-400 uppercase">Special Request Concierge</Text>
              <Text className="text-xs text-gray-300 mt-1">{reservation.specialRequests}</Text>
            </View>
          ) : null}

          <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-gray-800">
            <Text className="text-xs text-gray-300">Total Billable</Text>
            <Text className="text-base font-bold text-emerald-400">{reservation.price}</Text>
          </View>
        </View>

        {/* Interactive Action Buttons */}
        <View className="mt-6 space-y-3 mb-24">
          {reservation.status === 'Confirmed' && (
            <TouchableOpacity
              className="w-full bg-emerald-600 py-3.5 rounded-2xl items-center shadow-lg"
              onPress={handleExpressCheckIn}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text className="text-white font-bold text-sm">Express Check-In & Issue Key</Text>
              )}
            </TouchableOpacity>
          )}

          {reservation.status === 'Checked In' && (
            <TouchableOpacity
              className="w-full bg-indigo-600 py-3.5 rounded-2xl items-center shadow-lg"
              onPress={() => setCheckoutModalVisible(true)}
              disabled={isProcessing}
            >
              <Text className="text-white font-bold text-sm">Settle Folio & Check-Out</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            className="w-full bg-slate-800/80 border border-slate-700 py-3 rounded-2xl items-center"
            onPress={() => navigation?.navigate?.('chat', { guestName: reservation.name, reservationId: reservation.id })}
          >
            <Text className="text-slate-200 font-semibold text-xs">Open Concierge Chat</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Checkout Modal */}
      <Modal visible={checkoutModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/70 justify-center items-center p-6">
          <View className="bg-[#1a1c2e] w-full rounded-3xl p-6 border border-white/10">
            <Text className="text-base font-bold text-white mb-2">Confirm Check-Out & Folio</Text>
            <Text className="text-xs text-slate-400 mb-4">
              Add any incidental minibar, airport pickup, or dining charges (in BDT) to settle the folio:
            </Text>

            <TextInput
              placeholder="e.g. 1500 (Minibar / Room Service)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={extraChargesInput}
              onChangeText={setExtraChargesInput}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-xs mb-4"
            />

            <View className="flex-row space-x-3">
              <TouchableOpacity
                className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                onPress={() => setCheckoutModalVisible(false)}
              >
                <Text className="text-slate-300 font-semibold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 bg-emerald-600 rounded-xl items-center"
                onPress={handleConfirmCheckout}
              >
                <Text className="text-white font-bold text-xs">Complete Checkout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
