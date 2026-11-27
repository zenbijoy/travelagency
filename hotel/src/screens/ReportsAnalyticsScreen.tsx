import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { hotelService, HotelTelemetry } from '../services/hotelService';

export function ReportsAnalyticsScreen({ navigation }: any) {
  const [telemetry, setTelemetry] = useState<HotelTelemetry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await hotelService.getTelemetry();
        setTelemetry(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !telemetry) {
    return (
      <SafeAreaView className="flex-1 bg-[#0b0e14] justify-center items-center">
        <ActivityIndicator size="large" color="#6366f1" />
      </SafeAreaView>
    );
  }

  const { gm, maintenance } = telemetry;

  const KPICard = ({ label, value, trend, icon, color }: any) => (
    <View className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-1 mx-1">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-[11px] text-gray-400">{label}</Text>
        <MaterialIcons name={icon} size={16} color={color} />
      </View>
      <Text className="text-xl font-bold text-white">{value}</Text>
      <View className="flex-row items-center mt-1">
        <MaterialIcons name="trending-up" size={12} color="#4ade80" />
        <Text className="text-[10px] text-emerald-400 ms-1">{trend}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#0b0e14]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="px-6 py-4 flex-row justify-between items-center border-b border-white/5">
        <View className="flex-row items-center space-x-3">
          <TouchableOpacity className="p-2 bg-white/5 rounded-full" onPress={() => navigation?.goBack?.()}>
            <MaterialIcons name="arrow-back" size={20} color="white" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-white ms-2">Analytics & Performance</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* KPI Grid */}
        <View className="mt-4">
          <View className="flex-row justify-between mb-3">
            <KPICard label="Occupancy" value={`${gm.occupancyRate}%`} trend="+4.2% vs last wk" icon="hotel" color="#60a5fa" />
            <KPICard label="ADR" value={`৳${gm.adr.toLocaleString()}`} trend="+8.5% YoY" icon="attach-money" color="#34d399" />
          </View>
          <View className="flex-row justify-between mb-3">
            <KPICard label="RevPAR" value={`৳${gm.revPar.toLocaleString()}`} trend="+6.1% Yield" icon="insights" color="#a78bfa" />
            <KPICard label="Operational" value={`${maintenance.operationalRatio}%`} trend="Target > 95%" icon="verified" color="#fbbf24" />
          </View>
        </View>

        {/* Channel Breakdown */}
        <View className="bg-white/5 border border-white/10 rounded-2xl p-5 mt-3 mb-24">
          <Text className="text-xs font-bold text-white uppercase tracking-wider mb-4">Direct vs Marketplace Channels</Text>
          <View className="space-y-4">
            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-gray-300">Shopno Jatra Direct Mobile</Text>
                <Text className="text-xs font-bold text-emerald-400">62%</Text>
              </View>
              <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <View className="h-full bg-emerald-500 rounded-full" style={{ width: '62%' }} />
              </View>
            </View>

            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-gray-300">OTA & Partner Aggregators</Text>
                <Text className="text-xs font-bold text-indigo-400">28%</Text>
              </View>
              <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <View className="h-full bg-indigo-500 rounded-full" style={{ width: '28%' }} />
              </View>
            </View>

            <View>
              <View className="flex-row justify-between mb-1">
                <Text className="text-xs text-gray-300">Walk-in & Front Desk Direct</Text>
                <Text className="text-xs font-bold text-amber-400">10%</Text>
              </View>
              <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <View className="h-full bg-amber-500 rounded-full" style={{ width: '10%' }} />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
