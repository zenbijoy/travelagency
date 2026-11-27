import React, { useState } from 'react';
import {
  DollarSign,
  Download,
  ArrowUpRight,
  Landmark,
  FileCheck2,
  Receipt,
  FileText,
  Clock,
  Sparkles,
  Building,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import {
  DEMO_COMMISSIONS,
  DEMO_PAYOUTS,
} from '../../services/agencyApi';
import { CommissionRecord, PayoutRequest } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { PayoutRequestModal } from './PayoutRequestModal';

export const CommissionsView: React.FC = () => {
  const { currentTenant, showToast } = useAgency();
  const [commissions, setCommissions] = useState<CommissionRecord[]>(DEMO_COMMISSIONS);
  const [payouts, setPayouts] = useState<PayoutRequest[]>(DEMO_PAYOUTS);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);

  const availableBalance = currentTenant.balanceBDT;
  const pendingPayout = currentTenant.pendingPayoutBDT;
  const totalEarnedCommissions = commissions.reduce((sum, c) => sum + c.commissionEarnedBDT, 0);

  const handleDownloadInvoice = (invoiceNo: string) => {
    // Generate clean printable simulated PDF
    showToast({
      type: 'success',
      title: 'Tax Invoice Downloaded',
      message: `Tax Invoice ${invoiceNo} generated with 15% VAT breakdown and NBR compliancy.`,
    });
  };

  const handlePayoutSubmitted = (amount: number, bankId: string) => {
    const newPayout: PayoutRequest = {
      id: `po-${Date.now()}`,
      amountBDT: amount,
      bankAccountId: bankId,
      bankName: 'Islami Bank Bangladesh PLC',
      accountNumberMasked: '•••• •••• •••• 8821',
      status: 'pending_approval',
      requestedAt: 'Just now',
      referenceNumber: `PO-BDT-${Date.now().toString().slice(-6)}`,
      requestedBy: 'Tanvir Hossain (Owner)',
    };
    setPayouts((prev) => [newPayout, ...prev]);
    showToast({
      type: 'success',
      title: 'Payout Request Dispatched',
      message: `Request for ৳${amount.toLocaleString()} submitted for finance processing.`,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Commissions & Settlement Ledger</h1>
          <p className="text-sm text-slate-400 mt-1">
            Reconcile double-entry commission disbursements and initiate automated bank payouts
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Landmark className="w-4 h-4" />}
          onClick={() => setIsPayoutModalOpen(true)}
        >
          Request Payout
        </Button>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-slate-900/70 border border-emerald-500/30 backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Available for Payout
          </span>
          <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
            ৳{availableBalance.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Cleared & ready for immediate BEFTN transfer
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/70 border border-amber-500/30 backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            In-Flight Payout Requests
          </span>
          <div className="text-2xl font-bold text-amber-400 mt-2 font-mono">
            ৳{pendingPayout.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Currently undergoing bank clearing gateway
          </span>
        </div>

        <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 backdrop-blur-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            All-Time Commission Volume
          </span>
          <div className="text-2xl font-bold text-white mt-2 font-mono">
            ৳{(totalEarnedCommissions + 840000).toLocaleString()}
          </div>
          <span className="text-[11px] text-emerald-400 mt-1 block">
            Cumulative net revenue since inception
          </span>
        </div>
      </div>

      {/* Commission Ledger Table */}
      <Card
        title="Commission Earnings Ledger"
        subtitle="Individual GDS ticket and accommodation commission yield breakdown"
      >
        <div className="overflow-x-auto -mx-5 -my-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold">Booking Ref</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold text-right">Gross GMV</th>
                <th className="py-3 px-4 font-semibold text-right">Rate</th>
                <th className="py-3 px-4 font-semibold text-right">Agency Yield</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-5 font-semibold text-right">Tax Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {commissions.map((comm) => (
                <tr key={comm.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-5">
                    <span className="font-mono font-bold text-white block">{comm.bookingReference}</span>
                    <span className="text-[10px] text-slate-400 capitalize">{comm.serviceType} Booking</span>
                  </td>
                  <td className="py-3 px-4 text-slate-300 font-medium">{comm.customerName}</td>
                  <td className="py-3 px-4 text-right font-mono text-white">
                    ৳{comm.grossVolumeBDT.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-400">
                    {comm.commissionRatePercent}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    +৳{comm.commissionEarnedBDT.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Badge
                      variant={
                        comm.status === 'available'
                          ? 'emerald'
                          : comm.status === 'settled'
                          ? 'blue'
                          : 'amber'
                      }
                      size="sm"
                    >
                      {comm.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <button
                      onClick={() => handleDownloadInvoice(comm.invoiceNumber)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Download PDF Tax Invoice"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-mono text-[11px]">{comm.invoiceNumber}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payout Distribution History */}
      <Card
        title="Bank Disbursement History"
        subtitle="Record of automated funds transferred to agency bank accounts"
      >
        <div className="space-y-3 pt-1">
          {payouts.map((po) => (
            <div
              key={po.id}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{po.bankName}</span>
                    <Badge
                      variant={
                        po.status === 'completed'
                          ? 'emerald'
                          : po.status === 'processing'
                          ? 'amber'
                          : 'purple'
                      }
                      size="sm"
                    >
                      {po.status}
                    </Badge>
                  </div>
                  <span className="text-slate-400 font-mono mt-0.5 block">
                    {po.accountNumberMasked} • Ref: {po.referenceNumber}
                  </span>
                </div>
              </div>

              <div className="text-right sm:text-right">
                <span className="text-base font-bold text-emerald-400 font-mono block">
                  ৳{po.amountBDT.toLocaleString()}
                </span>
                <span className="text-[11px] text-slate-400">
                  Requested {po.requestedAt}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Payout Modal */}
      <PayoutRequestModal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        availableBalanceBDT={availableBalance}
        onPayoutSubmitted={handlePayoutSubmitted}
      />
    </div>
  );
};
