import React, { useState } from 'react';
import {
  Users2,
  Search,
  Crown,
  Eye,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Plus,
} from 'lucide-react';
import { Customer } from '../../types';
import { DEMO_CUSTOMERS } from '../../services/agencyApi';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';

export const CustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>(DEMO_CUSTOMERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [vipFilter, setVipFilter] = useState<'all' | 'vip' | 'regular'>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const filteredCustomers = customers.filter((c) => {
    const matchSearch =
      searchQuery === '' ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);

    const matchVIP =
      vipFilter === 'all' ||
      (vipFilter === 'vip' && c.isVIP) ||
      (vipFilter === 'regular' && !c.isVIP);

    return matchSearch && matchVIP;
  });

  const handleToggleVIP = (id: string) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isVIP: !c.isVIP } : c))
    );
    if (selectedCustomer && selectedCustomer.id === id) {
      setSelectedCustomer((prev) => (prev ? { ...prev, isVIP: !prev.isVIP } : null));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customer Relationship Management</h1>
          <p className="text-sm text-slate-400 mt-1">
            Maintain traveler profiles, corporate VIP tiers, and credit balance reconciliation
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 backdrop-blur-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, phone or email..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {(['all', 'vip', 'regular'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setVipFilter(filter)}
                className={`px-3 py-1 rounded capitalize font-medium transition-all ${
                  vipFilter === filter
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {filter === 'vip' ? 'VIP Only' : filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCustomers.map((c) => (
          <div
            key={c.id}
            className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all backdrop-blur-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={c.avatarUrl}
                    alt={c.name}
                    className="w-12 h-12 rounded-xl object-cover ring-1 ring-emerald-500/30"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{c.name}</h3>
                      {c.isVIP && (
                        <Badge variant="amber" size="sm">
                          <Crown className="w-3 h-3 mr-1" />
                          VIP
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 block">{c.email}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Eye className="w-3.5 h-3.5" />}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setIsDrawerOpen(true);
                  }}
                >
                  Profile
                </Button>
              </div>

              {/* Metrics strip */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Bookings</span>
                  <span className="font-bold text-white">{c.totalBookings} orders</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Lifetime Spend</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    ৳{(c.totalSpentBDT / 1000).toFixed(0)}k
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Balance Due</span>
                  <span
                    className={`font-bold font-mono ${
                      c.outstandingBalanceBDT > 0 ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    ৳{c.outstandingBalanceBDT.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span>Last Travel: <strong>{c.lastBookingDate}</strong></span>
              <span className="truncate max-w-[180px]">
                {c.frequentDestinations.join(', ')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Customer Drawer */}
      <CustomerProfileDrawer
        customer={selectedCustomer}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onToggleVIP={handleToggleVIP}
      />
    </div>
  );
};
