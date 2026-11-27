import React, { useState } from 'react';
import { Reservation } from '../../types/pms';
import { Modal } from '../common/Modal';
import { ReceiptText, CreditCard, Sparkles, CheckCircle2 } from 'lucide-react';

interface CheckOutFolioModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmCheckOut: (reservationId: string, additionalChargesBdt: number, notes?: string) => void;
}

export const CheckOutFolioModal: React.FC<CheckOutFolioModalProps> = ({
  reservation,
  isOpen,
  onClose,
  onConfirmCheckOut,
}) => {
  const [incidentalAmount, setIncidentalAmount] = useState<string>('0');
  const [incidentalNotes, setIncidentalNotes] = useState<string>('Minibar and Late Checkout fee');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'bkash'>('card');

  if (!reservation) return null;

  const extraCharges = parseFloat(incidentalAmount) || 0;
  const extraVat = Math.round(extraCharges * 0.05);
  const extraService = Math.round(extraCharges * 0.10);
  const extraGross = extraCharges + extraVat + extraService;

  const currentBalance = reservation.folio.balanceDueBdt;
  const totalSettlementAmount = currentBalance + extraGross;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmCheckOut(reservation.id, extraCharges, incidentalNotes);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Check-Out & Folio Final Settlement"
      description={`Guest: ${reservation.guestName} • Room ${reservation.roomNumber}`}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Incidentals Input */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Add Final Incidentals / Minibar Charges
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Incidentals Amount (BDT)</label>
              <input
                type="number"
                min={0}
                step={50}
                value={incidentalAmount}
                onChange={(e) => setIncidentalAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Charge Description</label>
              <input
                type="text"
                value={incidentalNotes}
                onChange={(e) => setIncidentalNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Settlement Summary */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex justify-between text-slate-400">
            <span>Outstanding Room Folio Balance</span>
            <span className="text-white font-mono">৳{currentBalance.toLocaleString()}</span>
          </div>
          {extraCharges > 0 && (
            <>
              <div className="flex justify-between text-slate-400">
                <span>Added Incidentals</span>
                <span className="text-white font-mono">৳{extraCharges.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Incidentals VAT & Service Charge (15%)</span>
                <span className="text-white font-mono">৳{(extraVat + extraService).toLocaleString()}</span>
              </div>
            </>
          )}

          <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-extrabold">
            <span className="text-amber-400">Final Settlement Due</span>
            <span className="text-white text-lg font-mono">৳{totalSettlementAmount.toLocaleString()}</span>
          </div>
        </div>

        {/* Payment Method */}
        {totalSettlementAmount > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              Select Settlement Payment Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['card', 'bkash', 'cash'] as const).map((method) => (
                <button
                  type="button"
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold uppercase border transition-all ${
                    paymentMethod === method
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {method === 'card' ? 'Credit Card / POS' : method === 'bkash' ? 'bKash Merchant' : 'Cash at Desk'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Turnaround Notice */}
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4 flex-shrink-0" />
          <span>
            Upon checkout, Room <strong>{reservation.roomNumber}</strong> will automatically be flagged as <strong>Dirty</strong> and queued for housekeeping turnaround.
          </span>
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
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl shadow-lg shadow-amber-600/30 transition-all flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Settle Folio & Check Out</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
