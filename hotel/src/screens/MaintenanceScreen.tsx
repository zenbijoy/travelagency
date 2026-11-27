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
import { hotelService, HotelMaintenanceTicketRecord } from '../services/hotelService';

export function MaintenanceScreen({ navigation }: any) {
  const [tickets, setTickets] = useState<HotelMaintenanceTicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // New ticket form
  const [roomNumber, setRoomNumber] = useState('');
  const [category, setCategory] = useState<HotelMaintenanceTicketRecord['category']>('plumbing');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<HotelMaintenanceTicketRecord['priority']>('normal');

  const loadTickets = async () => {
    try {
      const data = await hotelService.getMaintenanceTickets();
      setTickets(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const handleResolveTicket = async (ticket: HotelMaintenanceTicketRecord) => {
    const res = await hotelService.updateMaintenanceStatus(ticket.id, 'resolved', ticket.costBdt, 'Maintenance inspected & verified safe');
    if (res.success) {
      setTickets((prev) =>
        prev.map((t) => (t.id === ticket.id ? { ...t, status: 'resolved', resolutionNotes: 'Maintenance inspected & verified safe' } : t))
      );
      Alert.alert('Ticket Resolved', `Room ${ticket.roomNumber} maintenance cleared. Room restored to operational.`);
    }
  };

  const handleCreateTicket = async () => {
    if (!description.trim() || !roomNumber.trim()) {
      Alert.alert('Required Fields', 'Please enter room number and issue description.');
      return;
    }

    const res = await hotelService.createMaintenanceTicket({
      roomUnitId: `u_${roomNumber.trim()}`,
      category,
      description: description.trim(),
      priority,
      costBdt: 1500,
    });

    if (res.success) {
      setModalVisible(false);
      setDescription('');
      setRoomNumber('');
      loadTickets();
      Alert.alert('Ticket Reported', `Work order logged for Room ${roomNumber}. Room marked with maintenance flag.`);
    }
  };

  const urgentCount = tickets.filter((t) => t.priority === 'urgent' && t.status !== 'resolved').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <SafeAreaView className="flex-1 bg-[#0b1326]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="px-6 py-4 flex-row justify-between items-center border-b border-slate-800/80">
        <View className="flex-row items-center space-x-3">
          <TouchableOpacity className="p-2 bg-slate-800/50 rounded-lg" onPress={() => navigation?.goBack?.()}>
            <MaterialIcons name="arrow-back" size={20} color="#cbd5e1" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-white ms-2">Maintenance & Work Orders</Text>
        </View>
        <TouchableOpacity
          className="bg-indigo-600 px-3 py-1.5 rounded-xl flex-row items-center"
          onPress={() => setModalVisible(true)}
        >
          <MaterialIcons name="add" size={16} color="white" />
          <Text className="text-white text-xs font-bold ms-1">New Order</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {/* KPI Strip */}
        <View className="flex-row justify-between mt-4">
          <View className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-rose-400 font-semibold">Urgent</Text>
            <Text className="text-xl font-bold text-white mt-1">{urgentCount}</Text>
          </View>
          <View className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-amber-400 font-semibold">In Progress</Text>
            <Text className="text-xl font-bold text-white mt-1">{inProgressCount}</Text>
          </View>
          <View className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-3 flex-1 mx-1 items-center">
            <Text className="text-[10px] text-emerald-400 font-semibold">Resolved</Text>
            <Text className="text-xl font-bold text-white mt-1">{resolvedCount}</Text>
          </View>
        </View>

        {/* Tickets List */}
        <View className="mt-6 mb-24">
          <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Open Work Orders ({tickets.length})
          </Text>

          {loading ? (
            <ActivityIndicator size="small" color="#6366f1" className="py-8" />
          ) : (
            tickets.map((t) => {
              const isResolved = t.status === 'resolved' || t.status === 'closed';
              return (
                <View key={t.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-3">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 me-2">
                      <View className="flex-row items-center">
                        <Text className="text-sm font-bold text-white">Room {t.roomNumber}</Text>
                        <Text className="text-xs text-indigo-400 ms-2 font-medium">• {t.category.toUpperCase()}</Text>
                        {t.priority === 'urgent' && (
                          <View className="bg-rose-500/20 px-2 py-0.5 rounded-full ms-2">
                            <Text className="text-rose-400 text-[9px] font-bold">URGENT</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-xs text-slate-300 mt-1">{t.description}</Text>
                      {t.resolutionNotes && (
                        <Text className="text-[10px] text-emerald-400 mt-1">Resolution: {t.resolutionNotes}</Text>
                      )}
                    </View>

                    <View className={`px-2.5 py-1 rounded-full ${isResolved ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                      <Text className={`text-[10px] font-bold ${isResolved ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {t.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-800/80">
                    <Text className="text-[10px] text-slate-500">
                      Est. Cost: ৳{t.costBdt.toLocaleString()}
                    </Text>
                    {!isResolved && (
                      <TouchableOpacity
                        className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center"
                        onPress={() => handleResolveTicket(t)}
                      >
                        <MaterialIcons name="check" size={14} color="white" />
                        <Text className="text-white text-xs font-bold ms-1">Mark Resolved</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* New Work Order Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/75 justify-center items-center p-6">
          <View className="bg-[#1a1c2e] w-full rounded-3xl p-6 border border-white/10">
            <Text className="text-base font-bold text-white mb-3">Create Maintenance Order</Text>

            <TextInput
              placeholder="Room Number (e.g. 203)"
              placeholderTextColor="#64748b"
              value={roomNumber}
              onChangeText={setRoomNumber}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs mb-3"
            />

            <TextInput
              placeholder="Issue Description"
              placeholderTextColor="#64748b"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-xs mb-4 h-20"
            />

            <View className="flex-row space-x-3">
              <TouchableOpacity
                className="flex-1 py-3 bg-slate-800 rounded-xl items-center"
                onPress={() => setModalVisible(false)}
              >
                <Text className="text-slate-300 font-semibold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-3 bg-indigo-600 rounded-xl items-center"
                onPress={handleCreateTicket}
              >
                <Text className="text-white font-bold text-xs">Create Ticket</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
