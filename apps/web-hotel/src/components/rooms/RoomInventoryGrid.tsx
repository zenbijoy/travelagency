import React, { useState } from 'react';
import { RoomUnit, RoomCategoryType, RoomOccupancyStatus, RoomHousekeepingStatus } from '../../types/pms';
import { Badge } from '../common/Badge';
import { 
  BedDouble, 
  Sparkles, 
  Wrench, 
  User, 
  CheckCircle2, 
  Clock, 
  Layers, 
  SlidersHorizontal,
  Search,
  Filter
} from 'lucide-react';

interface RoomInventoryGridProps {
  rooms: RoomUnit[];
  onSelectRoom: (room: RoomUnit) => void;
  onQuickToggleStatus: (room: RoomUnit) => void;
}

export const RoomInventoryGrid: React.FC<RoomInventoryGridProps> = ({
  rooms,
  onSelectRoom,
  onQuickToggleStatus,
}) => {
  const [selectedFloor, setSelectedFloor] = useState<number | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<RoomCategoryType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtering
  const filteredRooms = rooms.filter((room) => {
    if (selectedFloor !== 'all' && room.floor !== selectedFloor) return false;
    if (selectedCategory !== 'all' && room.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = room.roomNumber.toLowerCase().includes(q);
      const matchGuest = room.currentGuestName?.toLowerCase().includes(q);
      const matchType = room.categoryLabel.toLowerCase().includes(q);
      if (!matchNum && !matchGuest && !matchType) return false;
    }
    if (statusFilter === 'available') return room.occupancyStatus === 'vacant' && room.housekeepingStatus === 'ready';
    if (statusFilter === 'occupied') return room.occupancyStatus === 'occupied' || room.occupancyStatus === 'due_out';
    if (statusFilter === 'cleaning') return room.housekeepingStatus === 'dirty' || room.housekeepingStatus === 'cleaning' || room.housekeepingStatus === 'inspection';
    if (statusFilter === 'maintenance') return room.occupancyStatus === 'out_of_order' || room.occupancyStatus === 'blocked' || room.maintenanceStatus !== 'operational';
    return true;
  });

  const getOccupancyBadge = (status: RoomOccupancyStatus) => {
    switch (status) {
      case 'occupied':
        return <Badge variant="emerald" size="sm">Occupied</Badge>;
      case 'due_out':
        return <Badge variant="amber" size="sm">Due Out</Badge>;
      case 'reserved':
        return <Badge variant="indigo" size="sm">Reserved</Badge>;
      case 'blocked':
        return <Badge variant="slate" size="sm">Blocked</Badge>;
      case 'out_of_order':
        return <Badge variant="rose" size="sm">Out of Order</Badge>;
      default:
        return <Badge variant="sky" size="sm">Vacant</Badge>;
    }
  };

  const getHousekeepingBadge = (status: RoomHousekeepingStatus) => {
    switch (status) {
      case 'ready':
        return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Ready</span>;
      case 'inspection':
        return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400"><Clock className="w-3 h-3" /> Inspect</span>;
      case 'cleaning':
        return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400"><Sparkles className="w-3 h-3" /> Cleaning</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-400"><Sparkles className="w-3 h-3" /> Dirty</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Filters Bar */}
      <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search room #, guest name, or room type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Floor Pills */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Floor:</span>
          {(['all', 1, 2, 3, 4] as const).map((floor) => (
            <button
              key={floor}
              onClick={() => setSelectedFloor(floor)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedFloor === floor
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {floor === 'all' ? 'All' : `Fl ${floor}`}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <span className="text-[10px] font-bold text-slate-500 uppercase px-2">Category:</span>
          {(['all', 'standard', 'deluxe', 'suite', 'penthouse'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          {(['all', 'available', 'occupied', 'cleaning', 'maintenance'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                statusFilter === st
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Room Units */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredRooms.map((room) => {
          const isReady = room.occupancyStatus === 'vacant' && room.housekeepingStatus === 'ready';
          const isOccupied = room.occupancyStatus === 'occupied' || room.occupancyStatus === 'due_out';
          const borderStyle = isReady
            ? 'border-emerald-500/30 hover:border-emerald-500/60'
            : isOccupied
            ? 'border-slate-700 hover:border-slate-600'
            : room.occupancyStatus === 'out_of_order' || room.maintenanceStatus !== 'operational'
            ? 'border-rose-500/40 hover:border-rose-500/70'
            : 'border-slate-800 hover:border-slate-700';

          return (
            <div
              key={room.id}
              onClick={() => onSelectRoom(room)}
              className={`bg-[#111726]/90 border rounded-2xl p-4.5 transition-all duration-200 hover:shadow-xl cursor-pointer group flex flex-col justify-between ${borderStyle}`}
            >
              <div>
                {/* Header: Room Number, Floor, Badges */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700/80 flex flex-col items-center justify-center font-mono">
                      <span className="text-[9px] uppercase tracking-wider text-slate-400">Rm</span>
                      <span className="text-sm font-extrabold text-white">{room.roomNumber}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Floor {room.floor}
                      </span>
                      <h4 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate max-w-[150px]">
                        {room.categoryLabel}
                      </h4>
                    </div>
                  </div>

                  {getOccupancyBadge(room.occupancyStatus)}
                </div>

                {/* Guest or Status Info */}
                <div className="my-2.5 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
                  {room.currentGuestName ? (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{room.currentGuestName}</p>
                        <p className="text-[10px] text-slate-400">In-house Guest</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Condition:</span>
                      {getHousekeepingBadge(room.housekeepingStatus)}
                    </div>
                  )}
                </div>

                {/* Amenities / Bed */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3">
                  <span>{room.bedType}</span>
                  <span>Max {room.maxGuests} Guests</span>
                </div>
              </div>

              {/* Footer: Price & Quick Action */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-sm font-extrabold text-white">৳{room.currentRateBdt.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-500 font-medium"> / night</span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickToggleStatus(room);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
                >
                  Quick Toggle
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
