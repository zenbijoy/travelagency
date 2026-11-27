import React from 'react';
import { Customer } from '../../types';
import { Drawer } from '../ui/Drawer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  CreditCard,
  Crown,
  History,
  FileText,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';

interface CustomerProfileDrawerProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onToggleVIP?: (customerId: string) => void;
}

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  customer,
  isOpen,
  onClose,
  onToggleVIP,
}) => {
  const { showToast } = useAgency();

  if (!customer) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={customer.name}
      subtitle={`Customer ID: ${customer.id} • ${customer.nationality}`}
      width="xl"
    >
      <div className="space-y-6">
        {/* Profile Card Header */}
        <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start gap-4">
          <img
            src={customer.avatarUrl}
            alt={customer.name}
            className="w-16 h-16 rounded-xl object-cover ring-2 ring-emerald-500/30"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white truncate">{customer.name}</h3>
              {customer.isVIP ? (
                <Badge variant="amber" size="sm">
                  <Crown className="w-3 h-3 mr-1" />
                  VIP Corporate
                </Badge>
              ) : (
                <Badge variant="slate" size="sm">Standard</Badge>
              )}
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">{customer.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{customer.phone}</span>
              </div>
            </div>
          </div>
          <Button
            variant={customer.isVIP ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              onToggleVIP?.(customer.id);
              showToast({
                type: 'info',
                title: 'VIP Status Changed',
                message: `${customer.name} VIP status toggled.`,
              });
            }}
          >
            {customer.isVIP ? 'Revoke VIP' : 'Upgrade to VIP'}
          </Button>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Lifetime Spend</span>
            <div className="text-lg font-bold text-emerald-400 mt-1 font-mono">
              ৳{customer.totalSpentBDT.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {customer.totalBookings} Completed Reservations
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Outstanding Balance</span>
            <div className="text-lg font-bold text-rose-400 mt-1 font-mono">
              ৳{customer.outstandingBalanceBDT.toLocaleString()}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {customer.outstandingBalanceBDT > 0 ? 'Payment Reminder Due' : 'All Settled'}
            </span>
          </div>
        </div>

        {/* Frequent Destinations */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            Favorite Destinations
          </span>
          <div className="flex flex-wrap gap-2 pt-1">
            {customer.frequentDestinations.map((dest, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
              >
                {dest}
              </span>
            ))}
          </div>
        </div>

        {/* Notes & Special Handling */}
        {customer.notes && (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Agent Travel Notes
            </span>
            <p className="text-xs text-slate-300 leading-relaxed italic">{customer.notes}</p>
          </div>
        )}

        {/* Travel History */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-emerald-400" />
            Booking History Record
          </h4>
          <div className="space-y-2">
            {customer.travelHistory.map((item) => (
              <div
                key={item.bookingId}
                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white block">{item.serviceTitle}</span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {item.reference} • {item.date}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-white block">
                    ৳{item.amountBDT.toLocaleString()}
                  </span>
                  <Badge variant={item.status === 'confirmed' ? 'emerald' : 'blue'} size="sm">
                    {item.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
};
