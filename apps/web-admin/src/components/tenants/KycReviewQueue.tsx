import React, { useState, useEffect } from 'react';
import { KycSubmission, KycDocument, DocumentCheckResult } from '@/types';
import { adminService } from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  FileCheck2,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Clock,
  ShieldCheck,
  User,
  History
} from 'lucide-react';

export const KycReviewQueue: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [queue, setQueue] = useState<KycSubmission[]>([]);
  const [selectedSub, setSelectedSub] = useState<KycSubmission | null>(null);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const canReview = hasPermission('agencies.kyc_review');

  const loadQueue = async () => {
    setLoading(true);
    try {
      const data = await adminService.getKycQueue('all');
      setQueue(data);
      if (data.length > 0 && !selectedSub) {
        setSelectedSub(data[0]);
      }
    } catch {
      addToast({ type: 'error', title: 'Failed to load KYC queue' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleDecisionSubmit = async () => {
    if (!selectedSub || !decisionModal || !user) return;
    setSubmittingDecision(true);
    try {
      const updated = await adminService.reviewKycSubmission(
        selectedSub.id,
        decisionModal,
        decisionNote || `KYC decision: ${decisionModal} by ${user.name}`,
        { id: user.id, name: user.name, role: user.role }
      );
      addToast({
        type: 'success',
        title: `KYC Submission ${decisionModal.toUpperCase()}`,
        message: `${selectedSub.agencyName} status has been updated.`
      });
      setSelectedSub(updated);
      setDecisionModal(null);
      setDecisionNote('');
      loadQueue();
    } catch {
      addToast({ type: 'error', title: 'Failed to process decision' });
    } finally {
      setSubmittingDecision(false);
    }
  };

  const getCheckIcon = (result: DocumentCheckResult) => {
    switch (result) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-rose-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <TableSkeleton rows={4} cols={4} />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <Card>
        <EmptyState
          title="KYC Review Queue Empty"
          description="All submitted B2B travel agency verification files have been processed. Great job!"
          icon={FileCheck2}
        />
      </Card>
    );
  }

  const activeDoc: KycDocument | undefined = selectedSub?.documents[activeDocIndex];

  return (
    <div className="space-y-4">
      {/* Title & Queue stats */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-emerald-400" /> Human-in-the-Loop KYC Review Desk
          </h3>
          <p className="text-xs text-slate-400">Oldest submissions prioritized first (Strict FIFO dispatch)</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="amber" dot>{queue.length} In Queue</Badge>
        </div>
      </div>

      {/* Main 2-Column Split: Queue Roster (Left) & Side-by-Side Document Reviewer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Queue List (3.5 cols) */}
        <div className="lg:col-span-4 space-y-2.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">Submissions (FIFO)</p>
          <div className="space-y-2">
            {queue.map((sub, index) => {
              const isSelected = selectedSub?.id === sub.id;
              const dateStr = new Date(sub.submittedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSelectedSub(sub);
                    setActiveDocIndex(0);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-navy-850 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                      : 'bg-navy-900 border-navy-800 hover:border-navy-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] text-slate-400">Queue #{index + 1}</span>
                    <Badge variant={sub.status === 'verified' ? 'emerald' : sub.status === 'in_review' ? 'blue' : 'amber'} size="sm">
                      {sub.status}
                    </Badge>
                  </div>
                  <h4 className="font-semibold text-sm text-slate-200 truncate">{sub.agencyName}</h4>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" /> {dateStr}</span>
                    <span>{sub.documentsCount} Documents</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Document Inspector & Decision Console (8 cols) */}
        {selectedSub && (
          <div className="lg:col-span-8 space-y-4">
            {/* Header info & Decision Action Bar */}
            <Card className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-navy-900">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-slate-100">{selectedSub.agencyName}</h4>
                  <Badge variant="slate" size="sm">{selectedSub.agencyId}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Submitted {new Date(selectedSub.submittedAt).toLocaleString()}
                </p>
              </div>

              {canReview && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDecisionModal('request_changes')}
                  >
                    Request Changes
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDecisionModal('reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setDecisionModal('approve')}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Approve Agency
                  </Button>
                </div>
              )}
            </Card>

            {/* Document Tabs */}
            <div className="flex items-center gap-2 border-b border-navy-800 pb-2 overflow-x-auto">
              {selectedSub.documents.map((doc, idx) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDocIndex(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeDocIndex === idx
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200 bg-navy-950'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{doc.title}</span>
                </button>
              ))}
            </div>

            {/* Side-by-side: Document Image Preview + AI Extracted Metadata & Automated Checks */}
            {activeDoc && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Document Viewer Frame */}
                <Card className="p-3 bg-navy-950 border-navy-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 border-b border-navy-800 mb-2">
                    <span className="text-xs font-semibold text-slate-300 truncate">{activeDoc.title}</span>
                    <a
                      href={activeDoc.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      Full Size <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="relative aspect-[4/3] bg-navy-900 rounded-lg overflow-hidden border border-navy-800 flex items-center justify-center">
                    <img
                      src={activeDoc.fileUrl}
                      alt={activeDoc.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 font-mono truncate">
                    SHA256: {activeDoc.sha256}
                  </div>
                </Card>

                {/* AI Extracted Fields & Automated Check Matrix */}
                <div className="space-y-4">
                  {/* Extracted Fields */}
                  <Card className="space-y-3">
                    <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> AI Vision Extracted OCR Data
                    </h5>
                    <div className="divide-y divide-navy-800/80 text-xs">
                      {Object.entries(activeDoc.extractedFields).map(([key, val]) => (
                        <div key={key} className="py-2 flex justify-between items-center">
                          <span className="text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <span className="font-mono text-slate-100 font-semibold">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  {/* Automated Verification Checks */}
                  <Card className="space-y-3">
                    <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Automated Verification Checks
                    </h5>
                    <div className="space-y-2">
                      {activeDoc.checks.map((chk) => (
                        <div
                          key={chk.id}
                          className="p-2.5 rounded-lg bg-navy-950 border border-navy-800 flex items-start gap-2.5"
                        >
                          {getCheckIcon(chk.result)}
                          <div className="flex-1 text-xs">
                            <p className="font-medium text-slate-200">{chk.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{chk.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* Audit Trail for this submission */}
            <Card className="space-y-2">
              <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-400" /> Submission Audit History
              </h5>
              <div className="divide-y divide-navy-800 text-xs">
                {selectedSub.auditTrail.map((log) => (
                  <div key={log.id} className="py-2 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-300">{log.action}</span>
                      {log.note && <p className="text-slate-400 text-[11px]">{log.note}</p>}
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <p className="text-slate-300 font-medium">{log.actor}</p>
                      <p>{new Date(log.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Decision Modal */}
      <Modal
        isOpen={!!decisionModal}
        onClose={() => setDecisionModal(null)}
        title={`KYC Decision: ${decisionModal?.toUpperCase()}`}
        subtitle={`Agency: ${selectedSub?.agencyName}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            {decisionModal === 'approve' && 'Approving will grant this B2B agency active booking permissions across all travel verticals.'}
            {decisionModal === 'reject' && 'Rejecting will revoke onboarding for this agency. Please specify clear compliance reasons.'}
            {decisionModal === 'request_changes' && 'Request changes will prompt the agency owner to re-upload clear or updated documents.'}
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Audit Note / Decision Justification:
            </label>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="State the findings, verified documents, or reasons for this decision..."
              rows={4}
              className="w-full bg-navy-950 border border-navy-800 rounded-lg p-3 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button variant="outline" size="sm" onClick={() => setDecisionModal(null)}>
              Cancel
            </Button>
            <Button
              variant={decisionModal === 'reject' ? 'danger' : 'primary'}
              size="sm"
              isLoading={submittingDecision}
              onClick={handleDecisionSubmit}
            >
              Confirm {decisionModal?.toUpperCase()}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
