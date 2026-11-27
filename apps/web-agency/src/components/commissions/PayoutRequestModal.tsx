import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { DEMO_BANK_ACCOUNTS } from '../../services/agencyApi';
import { useAgency } from '../../context/AgencyContext';
import { Landmark, AlertCircle, CheckCircle2 } from 'lucide-react';

interface PayoutRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalanceBDT: number;
  onPayoutSubmitted: (amount: number, bankId: string) => void;
}

export const PayoutRequestModal: React.FC<PayoutRequestModalProps> = ({
  isOpen,
  onClose,
  availableBalanceBDT,
  onPayoutSubmitted,
}) => {
  const { hasPermission } = useAgency();
  const canManageBanking = hasPermission('banking.manage');

  const payoutSchema = z.object({
    amount: z
      .number({ invalid_type_error: 'Amount must be a number' })
      .min(5000, 'Minimum payout request is ৳5,000')
      .max(availableBalanceBDT, `Amount cannot exceed available ৳${availableBalanceBDT.toLocaleString()}`),
    bankAccountId: z.string().min(1, 'Please select a payout settlement account'),
    notes: z.string().optional(),
  });

  type PayoutFormValues = z.infer<typeof payoutSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema as any),
    defaultValues: {
      amount: Math.min(availableBalanceBDT, 50000),
      bankAccountId: DEMO_BANK_ACCOUNTS[0]?.id || '',
    },
  });

  const onSubmit = (data: PayoutFormValues) => {
    onPayoutSubmitted(data.amount, data.bankAccountId);
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Commission Payout"
      description="Withdraw earned commissions to verified agency bank account"
      maxWidth="md"
    >
      {!canManageBanking ? (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold block">RBAC Restricted Action</span>
            Only users with the Agency Owner role persona possess permission to initiate payout distributions.
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
            <span className="text-slate-300">Available For Instant Withdrawal:</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              ৳{availableBalanceBDT.toLocaleString()}
            </span>
          </div>

          <div>
            <Input
              label="Withdrawal Amount (BDT)"
              type="number"
              placeholder="e.g. 50000"
              error={errors.amount?.message}
              {...register('amount', { valueAsNumber: true })}
            />
            <div className="flex gap-2 mt-1.5">
              {[25000, 50000, 100000, availableBalanceBDT].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setValue('amount', amt)}
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  ৳{(amt / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Settlement Bank Account
            </label>
            <select
              {...register('bankAccountId')}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {DEMO_BANK_ACCOUNTS.filter((a) => a.verificationStatus === 'verified').map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.bankName} - {bank.accountNumber} ({bank.branchName})
                </option>
              ))}
            </select>
            {errors.bankAccountId && (
              <p className="mt-1 text-xs text-rose-400">{errors.bankAccountId.message}</p>
            )}
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800 flex gap-2 items-center">
            <Landmark className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>BEFTN / RTGS settlement will be credited within 2-4 banking hours.</span>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
              Submit Payout Request
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
