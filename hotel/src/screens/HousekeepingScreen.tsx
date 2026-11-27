import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { hotelService, HotelHousekeepingTaskRecord } from '../services/hotelService';
import { HousekeepingTaskStatus } from '@shopnojatra/shared';

export function HousekeepingScreen({ navigation }: any) {
  const [tasks, setTasks] = useState<HotelHousekeepingTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    try {
      const data = await hotelService.getHousekeepingTasks();
      setTasks(data);
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleAdvanceStatus = async (task: HotelHousekeepingTaskRecord) => {
    let nextStatus: HousekeepingTaskStatus | null = null;
    if (task.status === 'dirty') nextStatus = 'cleaning';
    else if (task.status === 'cleaning') nextStatus = 'inspection';
    else if (task.status === 'inspection') nextStatus = 'ready';

    if (!nextStatus) {
      Alert.alert('Status Info', `Room ${task.roomNumber} is already in Ready condition.`);
      return;
    }

    const res = await hotelService.updateHousekeepingStatus(task.id, nextStatus);
    if (res.success) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus!, updatedAt: new Date().toISOString() } : t))
      );
      Alert.alert('Turnaround Updated', `Room ${task.roomNumber} transitioned to ${nextStatus.toUpperCase()}`);
    } else {
      Alert.alert('Transition Error', 'Invalid transition for current housekeeping state.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return { text: 'Ready', bg: 'bg-emerald-500/10', color: 'text-emerald-400', nextAction: 'Done' };
      case 'inspection':
        return { text: 'In Inspection', bg: 'bg-indigo-500/10', color: 'text-indigo-400', nextAction: 'Approve Ready' };
      case 'cleaning':
        return { text: 'Cleaning', bg: 'bg-amber-500/10', color: 'text-amber-400', nextAction: 'Request Inspect' };
      default:
        return { text: 'Dirty', bg: 'bg-rose-500/10', color: 'text-rose-400', nextAction: 'Start Clean' };
    }
  };

  const dirtyCount = tasks.filter((t) => t.status === 'dirty').length;
  const cleaningCount = tasks.filter((t) => t.status === 'cleaning').length;
  const inspectionCount = tasks.filter((t) => t.status === 'inspection').length;
  const readyCount = tasks.filter((t) => t.status === 'ready').length;

  return (
    <SafeAreaView className="flex-1 bg-[#020617]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="px-6 py-4 flex-row justify-between items-center border-b border-slate-800/80">
        <View className="flex-row items-center space-x-3">
          <TouchableOpacity className="p-2 bg-slate-800/50 rounded-lg" onPress={() => navigation?.goBack?.()}>
            <MaterialIcons name="arrow-back" size={20} color="#cbd5e1" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-white ms-2">Housekeeping Turnaround</Text>
        </View>
        <TouchableOpacity className="p-2 bg-slate-800/50 rounded-lg" onPress={loadTasks}>
          <MaterialIcons name="refresh" size={20} color="#cbd5e1" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* KPI Strip */}
        <View className="flex-row justify-between mt-4">
          <View className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-rose-400 font-semibold">Dirty</Text>
            <Text className="text-xl font-bold text-white mt-1">{dirtyCount}</Text>
          </View>
          <View className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-amber-400 font-semibold">Cleaning</Text>
            <Text className="text-xl font-bold text-white mt-1">{cleaningCount}</Text>
          </View>
          <View className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-indigo-400 font-semibold">Inspect</Text>
            <Text className="text-xl font-bold text-white mt-1">{inspectionCount}</Text>
          </View>
          <View className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-emerald-400 font-semibold">Ready</Text>
            <Text className="text-xl font-bold text-white mt-1">{readyCount}</Text>
          </View>
        </View>

        {/* Task Turnaround List */}
        <View className="mt-6 mb-24">
          <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Room Cleaning Queue ({tasks.length})
          </Text>

          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" className="py-8" />
          ) : (
            tasks.map((task) => {
              const badge = getStatusBadge(task.status);
              return (
                <View
                  key={task.id}
                  className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-3"
                >
                  <View className="flex-row justify-between items-start">
                    <View>
                      <View className="flex-row items-center">
                        <Text className="text-sm font-bold text-white">Room {task.roomNumber}</Text>
                        <Text className="text-xs text-slate-400 ms-2">• {task.roomType}</Text>
                      </View>
                      <Text className="text-[11px] text-slate-500 mt-0.5">
                        Type: {task.taskType.replace('_', ' ')} • Priority: {task.priority.toUpperCase()}
                      </Text>
                      {task.assignedStaffName && (
                        <Text className="text-[11px] text-indigo-400 mt-1">
                          Attendant: {task.assignedStaffName}
                        </Text>
                      )}
                    </View>

                    <View className={`px-2.5 py-1 rounded-full ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.color}`}>{badge.text}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-800/80">
                    <Text className="text-[10px] text-slate-500">Scheduled: {task.scheduledTime || 'Today'}</Text>
                    {task.status !== 'ready' && (
                      <TouchableOpacity
                        className="bg-indigo-600 px-3 py-1.5 rounded-xl flex-row items-center"
                        onPress={() => handleAdvanceStatus(task)}
                      >
                        <Text className="text-white text-xs font-bold me-1">{badge.nextAction}</Text>
                        <MaterialIcons name="chevron-right" size={14} color="white" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
