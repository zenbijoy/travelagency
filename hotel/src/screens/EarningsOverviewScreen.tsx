import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { hotelService, HotelTelemetry } from '../services/hotelService';

export function EarningsOverviewScreen({ navigation }: any) {
  const [telemetry, setTelemetry] = useState<HotelTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [payoutModalVisible, setPayoutModalVisible] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'bkash' | 'nagad' | 'bank_transfer'>('bkash');
  const [accountNumber, setAccountNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const data = await hotelService.getTelemetry();
      setTelemetry(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRequestPayout = async () => {
    const amount = parseFloat(payoutAmount);
    if (!amount || amount < 1000) {
      Alert.alert('Invalid Amount', 'Minimum withdrawal request is BDT 1,000.');
      return;
    }
    if (!accountNumber.trim()) {
      Alert.alert('Required Account', 'Please enter your destination account number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await hotelService.requestPayout({
        amountBdt: amount,
        channel: payoutMethod,
        accountNumber: accountNumber.trim(),
      });
      if (res.success) {
        setPayoutModalVisible(false);
        setPayoutAmount('');
        setAccountNumber('');
        Alert.alert(
          'Payout Request Submitted',
          `Withdrawal request for ৳${amount.toLocaleString()} via ${payoutMethod.toUpperCase()} has been submitted. Payout Ref: ${res.payoutId}`
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to submit withdrawal request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !telemetry) {
    return (
      <SafeAreaView className="flex-1 bg-[#0f111a] justify-center items-center">
        <ActivityIndicator size="large" color="#6366f1" />
      </SafeAreaView>
    );
  }

  const { gm } = telemetry;
  const netEarnings = Math.round(gm.monthlyRevenue * 0.88); // Net after platform service fee

  return (
    <SafeAreaView className="flex-1 bg-[#0f111a]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="p-4 flex-row items-center justify-between border-b border-white/5">
        <View className="flex-row items-center space-x-4">
          <TouchableOpacity className="p-2 bg-white/5 rounded-full" onPress={() => navigation?.goBack?.()}>
            <MaterialIcons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-white ms-2">Revenue & Earnings</Text>
        </View>
        <TouchableOpacity
          className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center"
          onPress={() => setPayoutModalVisible(true)}
        >
          <MaterialIcons name="account-balance-wallet" size={16} color="white" />
          <Text className="text-white text-xs font-bold ms-1">Withdraw</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Total Net Balance Card */}
        <LinearGradient
          colors={['#1e1b4b', '#312e81']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="p-6 rounded-[28px] mt-4 mb-4 border border-indigo-500/20 shadow-xl"
        >
          <Text className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Available Hotel Balance</Text>
          <Text className="text-3xl font-extrabold text-white mt-1">৳{netEarnings.toLocaleString()}</Text>
          <Text className="text-[11px] text-indigo-200 mt-1">
            Total Gross Revenue: ৳{gm.monthlyRevenue.toLocaleString()} (+{gm.revenueGrowth}% MoM)
          </Text>

          <View className="flex-row justify-between items-center mt-5 pt-4 border-t border-indigo-400/20">
            <View>
              <Text className="text-[10px] text-indigo-300">Avg Daily Rate (ADR)</Text>
              <Text className="text-sm font-bold text-white mt-0.5">৳{gm.adr.toLocaleString()}</Text>
            </View>
            <View>
              <Text className="text-[10px] text-indigo-300">RevPAR</Text>
              <Text className="text-sm font-bold text-white mt-0.5">৳{gm.revPar.toLocaleString()}</Text>
            </View>
            <View>
              <Text className="text-[10px] text-indigo-300">Occupancy</Text>
              <Text className="text-sm font-bold text-emerald-400 mt-0.5">{gm.occupancyRate}%</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Revenue Breakdown */}
        <View className="bg-[#1a1c2e] p-5 rounded-2xl border border-white/5 mb-4">
          <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Live Yield Indicators</Text>
          <View className="space-y-3">
            <View className="flex-row justify-between py-2 border-b border-slate-800">
              <Text className="text-xs text-slate-400">Total Operational Rooms</Text>
              <Text className="text-xs font-semibold text-white">12 Premium Units</Text>
            </View>
            <View className="flex-row justify-between py-2 border-b border-slate-800">
              <Text className="text-xs text-slate-400">Platform Commission</Text>
              <Text className="text-xs font-semibold text-amber-400">12%</Text>
            </View>
            <View className="flex-row justify-between py-2 border-b border-slate-800">
              <Text className="text-xs text-slate-400">VAT & City Tax Included</Text>
              <Text className="text-xs font-semibold text-emerald-400">5% Gov VAT / 10% Service</Text>
            </View>
            <View className="flex-row justify-between py-2">
              <Text className="text-xs text-slate-400">Payout Settlement Frequency</Text>
              <Text className="text-xs font-semibold text-indigo-300">Instant bKash / T+1 Bank</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Payout Withdrawal Modal */}
      <Modal visible={payoutModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/75 justify-center items-center p-6">
          <View className="bg-[#1a1c2e] w-full rounded-3xl p-6 border border-white/10">
            <Text className="text-base font-bold text-white mb-2">Request Payout Withdrawal</Text>
            <Text className="text-xs text-slate-400 mb-4">
              Withdraw earnings to your designated Bangladesh business account:
            </Text>

            <TextInput
              placeholder="Withdrawal Amount (BDT, min 1000)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs mb-3"
            />

            <View className="flex-row space-x-2 mb-3">
              {(['bkash', 'nagad', 'bank_transfer'] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  className={`flex-1 py-2 rounded-xl items-center border ${
                    payoutMethod === method ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-700'
                  }`}
                  onPress={() => setPayoutMethod(method)}
                >
                  <Text className="text-[10px] font-bold text-white uppercase">{method.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              placeholder="bKash / Nagad / Account Number"
              placeholderTextColor="#64748b"
              keyboardType="phone-pad"
              value={accountNumber}
              onChangeText={setAccountNumber}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs mb-4"
            />

            <View className="flex-row space-x-3">
              <TouchableOpacity
                className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                onPress={() => setPayoutModalVisible(false)}
              >
                <Text className="text-slate-300 font-semibold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 bg-emerald-600 rounded-xl items-center"
                onPress={handleRequestPayout}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-xs">Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
