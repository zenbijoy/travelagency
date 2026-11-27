import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Wallet, Building, ArrowUpRight, CheckCircle2 } from 'lucide-react';

interface WithdrawPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalanceBdt: number;
  onConfirmPayout: (amount: number, channel: string, account: string) => void;
}

export const WithdrawPayoutModal: React.FC<WithdrawPayoutModalProps> = ({
  isOpen,
  onClose,
  availableBalanceBdt,
  onConfirmPayout,
}) => {
  const [amount, setAmount] = useState('50000');
  const [channel, setChannel] = useState<'bkash' | 'nagad' | 'bank'>('bank');
  const [accountNumber, setAccountNumber] = useState('110-2918-382910-01 (BRAC Bank)');
  const [error, setError] = useState<string | null>(null);

  const withdrawAmount = parseFloat(amount) || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawAmount < 1000) {
      setError('Minimum withdrawal request is BDT 1,000');
      return;
    }
    if (withdrawAmount > availableBalanceBdt) {
      setError('Requested amount exceeds available balance');
      return;
    }
    if (!accountNumber.trim()) {
      setError('Account number is required');
      return;
    }
    setError(null);
    onConfirmPayout(withdrawAmount, channel, accountNumber.trim());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Hotel Revenue Payout"
      description="Withdraw settled hotel earnings to Bangladesh bank account or MFS"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
          <span className="text-slate-400">Available Balance:</span>
          <span className="text-base font-extrabold text-emerald-400 font-mono">
            ৳{availableBalanceBdt.toLocaleString()}
          </span>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Withdrawal Amount (BDT) *
          </label>
          <input
            type="number"
            min={1000}
            max={availableBalanceBdt}
            step={500}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Channel */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Destination Channel
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['bank', 'bkash', 'nagad'] as const).map((ch) => (
              <button
                type="button"
                key={ch}
                onClick={() => {
                  setChannel(ch);
                  if (ch === 'bkash') setAccountNumber('+880 1711 000000 (Merchant)');
                  else if (ch === 'nagad') setAccountNumber('+880 1819 000000 (Merchant)');
                  else setAccountNumber('110-2918-382910-01 (BRAC Bank)');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition-all ${
                  channel === ch
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                {ch === 'bank' ? 'Bank Wire (BEFTN)' : ch === 'bkash' ? 'bKash Merchant' : 'Nagad Pay'}
              </button>
            ))}
          </div>
        </div>

        {/* Account Details */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Account / Wallet Number *
          </label>
          <input
            type="text"
            required
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Submit Payout Request</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
