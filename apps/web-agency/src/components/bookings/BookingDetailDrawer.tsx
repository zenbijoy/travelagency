import React from 'react';
import {
  Booking,
  BookingStatus,
} from '../../types';
import { Drawer } from '../ui/Drawer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Plane,
  Building,
  Compass,
  Palmtree,
  Printer,
  CheckCircle,
  XCircle,
  Clock,
  User,
  ShieldCheck,
  CreditCard,
  Building2,
  FileText,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';

interface BookingDetailDrawerProps {
  booking: Booking | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (bookingId: string, newStatus: BookingStatus) => void;
}

export const BookingDetailDrawer: React.FC<BookingDetailDrawerProps> = ({
  booking,
  isOpen,
  onClose,
  onStatusChange,
}) => {
  const { showToast } = useAgency();

  if (!booking) return null;

  const serviceIcon = {
    flight: <Plane className="w-5 h-5 text-blue-400" />,
    hotel: <Building className="w-5 h-5 text-purple-400" />,
    tour: <Compass className="w-5 h-5 text-amber-400" />,
    holiday: <Palmtree className="w-5 h-5 text-emerald-400" />,
  }[booking.serviceType];

  const handlePrintVoucher = () => {
    showToast({
      type: 'success',
      title: 'E-Ticket / Voucher Generated',
      message: `Voucher for booking ${booking.bookingReference} (PNR: ${booking.pnr}) ready for printing.`,
    });
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={booking.bookingReference}
      subtitle={`PNR: ${booking.pnr} • Issued via ${booking.supplierName}`}
      width="xl"
    >
      <div className="space-y-6">
        {/* Status & Quick Action Bar */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              {serviceIcon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white capitalize">
                  {booking.serviceType} Order
                </span>
                <Badge
                  variant={
                    booking.status === 'confirmed'
                      ? 'emerald'
                      : booking.status === 'pending'
                      ? 'amber'
                      : booking.status === 'cancelled'
                      ? 'rose'
                      : 'blue'
                  }
                  size="sm"
                >
                  {booking.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Created: {new Date(booking.createdAt).toLocaleDateString()} by {booking.assignedAgent}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer className="w-4 h-4" />}
            onClick={handlePrintVoucher}
          >
            Print Voucher
          </Button>
        </div>

        {/* Travel Details */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Itinerary & Route
          </h4>
          <p className="text-sm font-semibold text-white">{booking.title}</p>
          <div className="grid grid-cols-2 gap-4 text-xs pt-2 border-t border-slate-800/80">
            <div>
              <span className="text-slate-400 block">Departure Date:</span>
              <span className="text-slate-200 font-mono font-medium">{booking.travelDate}</span>
            </div>
            {booking.returnDate && (
              <div>
                <span className="text-slate-400 block">Return / End Date:</span>
                <span className="text-slate-200 font-mono font-medium">{booking.returnDate}</span>
              </div>
            )}
            <div>
              <span className="text-slate-400 block">Guests / Passengers:</span>
              <span className="text-slate-200 font-medium">{booking.guestsCount} Person(s)</span>
            </div>
            <div>
              <span className="text-slate-400 block">Fulfillment Supplier:</span>
              <span className="text-slate-200 font-medium">{booking.supplierName}</span>
            </div>
          </div>
        </div>

        {/* Passenger Information */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-400" />
            Passenger & Traveler Details
          </h4>
          <div className="space-y-2">
            {booking.passengers.map((pax) => (
              <div
                key={pax.id}
                className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white block">{pax.name}</span>
                  <span className="text-slate-400">
                    {pax.type.toUpperCase()} • {pax.nationality}
                  </span>
                </div>
                <div className="text-right">
                  {pax.passportNo && (
                    <span className="font-mono text-slate-300 block">
                      Passport: {pax.passportNo}
                    </span>
                  )}
                  {pax.seatPreference && (
                    <span className="text-emerald-400">Seat: {pax.seatPreference}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Breakdown (Double Entry & Net Earnings) */}
        <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
            Commercial Breakdown (BDT)
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-300">
              <span>Base Supplier Fare:</span>
              <span>৳{(booking.totalPriceBDT - booking.markupBDT).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Agency Markup:</span>
              <span className="text-emerald-400">+৳{booking.markupBDT.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Supplier GDS Commission:</span>
              <span className="text-amber-400">+৳{booking.commissionBDT.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-white">
              <span>Total Client Price:</span>
              <span>৳{booking.totalPriceBDT.toLocaleString()}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex justify-between text-xs font-semibold text-emerald-400">
              <span>Net Agency Revenue Yield:</span>
              <span>৳{(booking.commissionBDT + booking.markupBDT).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Operational Actions */}
        <div className="pt-2 flex items-center gap-3">
          {booking.status === 'pending' && (
            <Button
              className="flex-1"
              variant="primary"
              leftIcon={<CheckCircle className="w-4 h-4" />}
              onClick={() => {
                onStatusChange?.(booking.id, 'confirmed');
                showToast({
                  type: 'success',
                  title: 'Booking Confirmed',
                  message: `Order ${booking.bookingReference} confirmed and ticket issued.`,
                });
                onClose();
              }}
            >
              Confirm & Issue Ticket
            </Button>
          )}

          {booking.status !== 'cancelled' && (
            <Button
              variant="danger"
              size="sm"
              leftIcon={<XCircle className="w-4 h-4" />}
              onClick={() => {
                onStatusChange?.(booking.id, 'cancelled');
                showToast({
                  type: 'error',
                  title: 'Booking Cancelled',
                  message: `Order ${booking.bookingReference} voided and refund initiated.`,
                });
                onClose();
              }}
            >
              Void / Cancel
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  );
};
