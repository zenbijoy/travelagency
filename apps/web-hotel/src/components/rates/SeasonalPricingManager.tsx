import React, { useState } from 'react';
import { SeasonalRatePlan, RoomAvailabilityBlock, RoomUnit, RoomCategoryType } from '../../types/pms';
import { Badge } from '../common/Badge';
import { 
  SlidersHorizontal, 
  PlusCircle, 
  Percent, 
  Calendar, 
  Lock, 
  Unlock, 
  TrendingUp, 
  Sparkles,
  Calculator
} from 'lucide-react';

interface SeasonalPricingManagerProps {
  ratePlans: SeasonalRatePlan[];
  roomBlocks: RoomAvailabilityBlock[];
  rooms: RoomUnit[];
  onTogglePlan: (planId: string) => void;
  onAddPlan: (plan: Omit<SeasonalRatePlan, 'id'>) => void;
  onOpenBlockModal: () => void;
  onReleaseBlock: (blockId: string) => void;
}

export const SeasonalPricingManager: React.FC<SeasonalPricingManagerProps> = ({
  ratePlans,
  roomBlocks,
  rooms,
  onTogglePlan,
  onAddPlan,
  onOpenBlockModal,
  onReleaseBlock,
}) => {
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [multiplier, setMultiplier] = useState(1.20);
  const [startDate, setStartDate] = useState('2026-06-01');
  const [endDate, setEndDate] = useState('2026-08-31');
  const [category, setCategory] = useState<'all' | RoomCategoryType>('all');
  const [planType, setPlanType] = useState<SeasonalRatePlan['type']>('seasonal');

  // Simulator State
  const [simCategory, setSimCategory] = useState<RoomCategoryType>('deluxe');
  const [simBaseRate, setSimBaseRate] = useState<number>(8500);

  const activeMultiplier = ratePlans
    .filter((p) => p.isActive && (p.category === 'all' || p.category === simCategory))
    .reduce((acc, p) => acc * p.multiplier, 1.0);

  const calculatedSimRate = Math.round(simBaseRate * activeMultiplier);

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) return;
    onAddPlan({
      name: planName.trim(),
      description: planDesc.trim() || 'Dynamic pricing adjustment',
      multiplier,
      startDate,
      endDate,
      category,
      isActive: true,
      type: planType,
    });
    setPlanName('');
    setPlanDesc('');
    setShowNewPlanForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Dynamic Yield Engine & Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Dynamic Rate Calculator Simulator */}
        <div className="lg:col-span-5 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-[#111726] border border-indigo-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Live Rate Yield Engine
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Simulate dynamic rate changes based on active seasonal and surge rules.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Room Category
              </label>
              <select
                value={simCategory}
                onChange={(e) => {
                  const cat = e.target.value as RoomCategoryType;
                  setSimCategory(cat);
                  const sample = rooms.find((r) => r.category === cat);
                  if (sample) setSimBaseRate(sample.basePriceBdt);
                }}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="standard">Standard King & Twin (Base: ৳4,500)</option>
                <option value="deluxe">Deluxe Sea View (Base: ৳8,500)</option>
                <option value="suite">Executive Oceanfront Suite (Base: ৳14,500)</option>
                <option value="penthouse">Presidential Penthouse (Base: ৳32,000)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Base Nightly Price (BDT)
              </label>
              <input
                type="number"
                value={simBaseRate}
                onChange={(e) => setSimBaseRate(Math.max(1000, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="p-4 bg-slate-950/80 border border-indigo-500/20 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400">
                  Total Active Yield Multiplier
                </span>
                <div className="text-lg font-extrabold text-white font-mono mt-0.5">
                  {activeMultiplier.toFixed(2)}x ({activeMultiplier >= 1 ? '+' : ''}
                  {Math.round((activeMultiplier - 1) * 100)}%)
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-emerald-400">
                  Calculated Selling Rate
                </span>
                <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
                  ৳{calculatedSimRate.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Room Availability Blocks strip */}
        <div className="lg:col-span-7 bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Active Room Availability Blocks ({roomBlocks.length})
                </h3>
              </div>
              <button
                onClick={onOpenBlockModal}
                className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-lg shadow-sm transition-all flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create Room Block</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Rooms reserved for diplomatic hold, maintenance, or private functions.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {roomBlocks.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  No active availability blocks. All rooms are open for booking.
                </div>
              ) : (
                roomBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">
                          {block.roomNumber ? `Room ${block.roomNumber}` : 'Category Block'}
                        </span>
                        <Badge variant="amber" size="sm">{block.reason}</Badge>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {block.startDate} → {block.endDate} • {block.notes}
                      </p>
                    </div>

                    <button
                      onClick={() => onReleaseBlock(block.id)}
                      className="px-2.5 py-1 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg border border-emerald-500/20 transition-colors flex items-center gap-1"
                    >
                      <Unlock className="w-3 h-3" />
                      <span>Release</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Seasonal Pricing Rules Section */}
      <div className="bg-[#111726]/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Seasonal Pricing & Yield Rules
            </h3>
            <p className="text-xs text-slate-400">
              Automated seasonal rates applied across all inventory
            </p>
          </div>

          <button
            onClick={() => setShowNewPlanForm(!showNewPlanForm)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{showNewPlanForm ? 'Close Form' : 'Add Rate Rule'}</span>
          </button>
        </div>

        {/* Add Rule Form */}
        {showNewPlanForm && (
          <form
            onSubmit={handleCreatePlan}
            className="mb-5 p-4 rounded-xl bg-slate-900/90 border border-indigo-500/30 space-y-3 animate-in fade-in"
          >
            <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              Define New Dynamic Rate Rule
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Rule Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Eid Holidays Surge"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Rate Multiplier</label>
                <select
                  value={multiplier}
                  onChange={(e) => setMultiplier(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                >
                  <option value={1.30}>+30% Peak Surge (1.30x)</option>
                  <option value={1.25}>+25% High Season (1.25x)</option>
                  <option value={1.20}>+20% High Demand (1.20x)</option>
                  <option value={1.15}>+15% Weekend Surge (1.15x)</option>
                  <option value={1.10}>+10% Mild Surge (1.10x)</option>
                  <option value={0.90}>-10% Early Bird (0.90x)</option>
                  <option value={0.85}>-15% Monsoon Promo (0.85x)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Applied Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white capitalize focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All Room Types</option>
                  <option value="standard">Standard Rooms</option>
                  <option value="deluxe">Deluxe Sea View</option>
                  <option value="suite">Executive Suites</option>
                  <option value="penthouse">Presidential Penthouse</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewPlanForm(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md transition-all"
              >
                Save & Activate Rule
              </button>
            </div>
          </form>
        )}

        {/* Rate Plans List */}
        <div className="divide-y divide-slate-800">
          {ratePlans.map((plan) => {
            const isSurge = plan.multiplier >= 1.0;
            const pct = Math.round((plan.multiplier - 1.0) * 100);

            return (
              <div
                key={plan.id}
                className="py-4 flex items-center justify-between hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs font-mono border ${
                      isSurge
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {isSurge ? `+${pct}%` : `${pct}%`}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white">{plan.name}</h4>
                      <Badge variant={isSurge ? 'emerald' : 'amber'} size="sm">
                        {plan.multiplier}x Multiplier
                      </Badge>
                      <span className="text-[10px] text-slate-400 capitalize">
                        Scope: {plan.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{plan.description}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Valid: {plan.startDate} to {plan.endDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onTogglePlan(plan.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      plan.isActive ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        plan.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-bold ${plan.isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {plan.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
