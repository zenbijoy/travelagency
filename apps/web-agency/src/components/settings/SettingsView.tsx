import React, { useState } from 'react';
import {
  Building2,
  Landmark,
  ShieldCheck,
  FileCheck2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Percent,
  Sliders,
  Phone,
  Mail,
  MapPin,
  Lock,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import {
  DEMO_BANK_ACCOUNTS,
  DEMO_KYC_DOCUMENTS,
} from '../../services/agencyApi';
import { BankAccount, KycDocument } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

export const SettingsView: React.FC = () => {
  const { currentTenant, hasPermission, showToast } = useAgency();
  const canManageSettings = hasPermission('settings.manage');
  const canManageBanking = hasPermission('banking.manage');

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(DEMO_BANK_ACCOUNTS);
  const [kycDocs, setKycDocs] = useState<KycDocument[]>(DEMO_KYC_DOCUMENTS);

  // Agency branding & pricing state
  const [agencyName, setAgencyName] = useState(currentTenant.name);
  const [phone, setPhone] = useState(currentTenant.phone);
  const [email, setEmail] = useState(currentTenant.email);
  const [address, setAddress] = useState(currentTenant.address);
  const [flightMarkupPercent, setFlightMarkupPercent] = useState('4.0');
  const [hotelMarkupPercent, setHotelMarkupPercent] = useState('8.5');

  // Add Bank Account Modal State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [newBankName, setNewBankName] = useState('City Bank PLC');
  const [newAccountName, setNewAccountName] = useState(currentTenant.name);
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newRoutingNumber, setNewRoutingNumber] = useState('');
  const [newBranch, setNewBranch] = useState('');

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    showToast({
      type: 'success',
      title: 'Agency Profile Updated',
      message: 'Branding credentials and customer notification details saved.',
    });
  };

  const handleSetPrimaryBank = (bankId: string) => {
    if (!canManageBanking) {
      showToast({
        type: 'error',
        title: 'Permission Denied',
        message: 'Only Agency Owner persona can change primary settlement account.',
      });
      return;
    }
    setBankAccounts((prev) =>
      prev.map((b) => ({
        ...b,
        isPrimary: b.id === bankId,
      }))
    );
    showToast({
      type: 'success',
      title: 'Settlement Account Changed',
      message: 'Primary settlement account updated for next disbursement batch.',
    });
  };

  const handleAddBankAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountNumber || !newRoutingNumber) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Account number and 9-digit routing number are mandatory.',
      });
      return;
    }

    const newAcc: BankAccount = {
      id: `bank-${Date.now()}`,
      bankName: newBankName,
      accountName: newAccountName,
      accountNumber: newAccountNumber,
      routingNumber: newRoutingNumber,
      branchName: newBranch || 'Gulshan Branch',
      isPrimary: false,
      verificationStatus: 'verified',
      accountType: 'Current',
    };

    setBankAccounts((prev) => [...prev, newAcc]);
    setIsBankModalOpen(false);
    showToast({
      type: 'success',
      title: 'Bank Account Linked',
      message: `${newBankName} account successfully attached for settlement.`,
    });
  };

  const handleUploadKyc = (docType: string) => {
    showToast({
      type: 'info',
      title: 'File Upload Completed',
      message: `Document for ${docType} received and placed in AI verification queue.`,
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Agency Administration & Governance</h1>
        <p className="text-sm text-slate-400 mt-1">
          KYC compliance, settlement bank accounts, white-label branding, and GDS markup policies
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: KYC & Banking (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* KYC Status Card */}
          <Card
            title="Institutional KYC & Compliance Status"
            subtitle="Verified regulatory documents authenticated with City Corporation and NBR"
            headerAction={
              <Badge variant="emerald" size="md">
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Fully Verified
              </Badge>
            }
          >
            <div className="space-y-3 pt-2">
              {kycDocs.map((doc) => (
                <div
                  key={doc.type}
                  className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <FileCheck2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white block">{doc.title}</span>
                      <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                        {doc.fileName || 'Not uploaded yet'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={doc.status === 'verified' ? 'emerald' : 'amber'} size="sm">
                      {doc.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Upload className="w-3.5 h-3.5" />}
                      onClick={() => handleUploadKyc(doc.title)}
                    >
                      Update
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Bank Accounts Management */}
          <Card
            title="Settlement Bank Accounts"
            subtitle="Linked commercial accounts for receiving automated commission disbursements"
            headerAction={
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  if (!canManageBanking) {
                    showToast({
                      type: 'error',
                      title: 'Permission Denied',
                      message: 'Only the Agency Owner can connect new bank accounts.',
                    });
                    return;
                  }
                  setIsBankModalOpen(true);
                }}
              >
                Add Account
              </Button>
            }
          >
            <div className="space-y-3 pt-2">
              {bankAccounts.map((account) => (
                <div
                  key={account.id}
                  className={`p-4 rounded-xl border transition-all text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    account.isPrimary
                      ? 'bg-slate-900/90 border-emerald-500/50 shadow-md shadow-emerald-950/30'
                      : 'bg-slate-950/60 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg border ${
                        account.isPrimary
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{account.bankName}</span>
                        {account.isPrimary && (
                          <Badge variant="emerald" size="sm">
                            Primary Settlement
                          </Badge>
                        )}
                        <Badge
                          variant={
                            account.verificationStatus === 'verified'
                              ? 'emerald'
                              : 'rose'
                          }
                          size="sm"
                        >
                          {account.verificationStatus}
                        </Badge>
                      </div>
                      <span className="text-slate-400 font-mono mt-0.5 block">
                        A/C: {account.accountNumber} • Routing: {account.routingNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {account.accountName} ({account.branchName})
                      </span>
                    </div>
                  </div>

                  {!account.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimaryBank(account.id)}
                    >
                      Make Primary
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Branding & Markup Policies */}
        <div className="space-y-6">
          <Card
            title="Agency Identity"
            subtitle="Public customer-facing branding on invoices & vouchers"
          >
            <form onSubmit={handleSaveBranding} className="space-y-4 pt-1">
              <Input
                label="Registered Business Name"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
              />

              <Input
                label="Official Helpline Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />

              <Input
                label="Reservations Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Commercial Office Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />

              <div className="pt-2">
                <Button variant="primary" size="sm" type="submit" className="w-full">
                  Save Agency Profile
                </Button>
              </div>
            </form>
          </Card>

          {/* Pricing & Markup Policies */}
          <Card
            title="Global Markup Policies"
            subtitle="Configurable baseline margin automatically appended onto GDS net fares"
          >
            <div className="space-y-4 pt-1 text-xs">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Flight Net Fare Markup (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={flightMarkupPercent}
                    onChange={(e) => setFlightMarkupPercent(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 pr-8"
                  />
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Applied on Sabre, Amadeus, and Biman NDC inventory
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Hotel Room Markup (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={hotelMarkupPercent}
                    onChange={(e) => setHotelMarkupPercent(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 pr-8"
                  />
                  <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Applied on Bedsonline and Expedia Partner rates
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() =>
                  showToast({
                    type: 'success',
                    title: 'Markup Rules Saved',
                    message: `Fares marked up by +${flightMarkupPercent}% (Flights) and +${hotelMarkupPercent}% (Hotels).`,
                  })
                }
              >
                Update Markup Engine
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Add Bank Account Modal */}
      <Modal
        isOpen={isBankModalOpen}
        onClose={() => setIsBankModalOpen(false)}
        title="Connect Settlement Account"
        description="Verify commercial checking account for electronic BEFTN/NPSB payouts."
        maxWidth="md"
      >
        <form onSubmit={handleAddBankAccount} className="space-y-4">
          <Input
            label="Bank Name"
            value={newBankName}
            onChange={(e) => setNewBankName(e.target.value)}
            placeholder="e.g. City Bank Limited"
          />

          <Input
            label="Account Title"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
          />

          <Input
            label="Account Number (13-16 Digits)"
            value={newAccountNumber}
            onChange={(e) => setNewAccountNumber(e.target.value)}
            placeholder="e.g. 110192849102"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Routing Number"
              value={newRoutingNumber}
              onChange={(e) => setNewRoutingNumber(e.target.value)}
              placeholder="e.g. 225271891"
            />
            <Input
              label="Branch Name"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="e.g. Gulshan Branch"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsBankModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
