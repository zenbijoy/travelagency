import React, { useState, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState
} from '@tanstack/react-table';
import { RefundRequest, RefundStatus } from '@/types';
import { adminService } from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  RotateCcw,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export const RefundQueueTable: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [data, setData] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Decision Modal State
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject' | 'hold' | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canApprove = hasPermission('refunds.approve');

  const loadRefunds = async () => {
    setLoading(true);
    try {
      const refunds = await adminService.getRefunds(statusFilter, search);
      setData(refunds);
    } catch {
      addToast({ type: 'error', title: 'Failed to load refund requests' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefunds();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadRefunds();
  };

  const handleProcessDecision = async () => {
    if (!selectedRefund || !decisionAction || !user) return;
    setSubmitting(true);
    try {
      await adminService.processRefundDecision(
        selectedRefund.id,
        decisionAction,
        decisionNote || `Refund ${decisionAction} by ${user.name}`,
        { id: user.id, name: user.name, role: user.role }
      );
      addToast({
        type: 'success',
        title: `Refund ${decisionAction.toUpperCase()}`,
        message: `Refund request ${selectedRefund.id} has been marked as ${decisionAction}.`
      });
      setSelectedRefund(null);
      setDecisionAction(null);
      setDecisionNote('');
      loadRefunds();
    } catch {
      addToast({ type: 'error', title: 'Failed to process refund decision' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<RefundRequest>[]>(
    () => [
      {
        accessorKey: 'id',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            Refund ID & Booking <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-mono font-bold text-slate-100">{row.original.id}</p>
            <p className="text-[11px] text-slate-400 font-mono">{row.original.bookingId}</p>
          </div>
        )
      },
      {
        accessorKey: 'customerName',
        header: 'Beneficiary',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-200">{row.original.customerName}</p>
            <p className="text-[11px] text-slate-400 font-mono">{row.original.refundMethod}</p>
          </div>
        )
      },
      {
        accessorKey: 'refundAmountBDT',
        header: 'Amount',
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            <p className="font-bold text-emerald-400">৳{row.original.refundAmountBDT.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">Orig: ৳{row.original.originalAmountBDT.toLocaleString()}</p>
          </div>
        )
      },
      {
        accessorKey: 'reasonDetail',
        header: 'Dispute / Cancellation Reason',
        cell: ({ row }) => (
          <div className="max-w-xs text-xs">
            <Badge variant="slate" size="sm" className="mb-1">
              {row.original.reasonCategory.replace('_', ' ')}
            </Badge>
            <p className="text-slate-300 text-[11px] line-clamp-2">{row.original.reasonDetail}</p>
          </div>
        )
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          const variants: Record<RefundStatus, 'amber' | 'emerald' | 'rose' | 'blue' | 'purple'> = {
            requested: 'amber',
            approved: 'emerald',
            processing: 'blue',
            completed: 'emerald',
            rejected: 'rose',
            on_hold: 'purple'
          };
          return <Badge variant={variants[status] || 'slate'} dot>{status}</Badge>;
        }
      },
      {
        id: 'actions',
        header: 'Financial Review',
        cell: ({ row }) => {
          const r = row.original;
          if (!canApprove) return <span className="text-xs text-slate-400 italic">Audit only</span>;
          if (r.status === 'completed' || r.status === 'rejected') {
            return <span className="text-[11px] text-slate-400 font-mono">Resolved</span>;
          }

          return (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="emerald"
                onClick={() => {
                  setSelectedRefund(r);
                  setDecisionAction('approve');
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setSelectedRefund(r);
                  setDecisionAction('reject');
                }}
              >
                Reject
              </Button>
            </div>
          );
        }
      }
    ],
    [canApprove]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 8 }
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-emerald-400" /> Refunds & Dispute Settlement Queue
          </h3>
          <p className="text-xs text-slate-400">Strict SLA review for passenger cancellations, flight changes, and hotel chargebacks</p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search refund ID, booking..."
              className="pl-9 text-xs"
            />
          </form>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="requested">Requested Only</option>
            <option value="approved">Approved</option>
            <option value="processing">Processing</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            title="No Refund Claims in Queue"
            description="There are currently no refund or dispute requests matching the filter criteria."
            actionText="Reset Filter"
            onAction={() => {
              setSearch('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="bg-navy-950/80 border-b border-navy-800 text-slate-400 uppercase tracking-wider text-[11px]">
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="py-3 px-4 font-semibold">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-navy-800/80">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-navy-850/50 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4 text-slate-300">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="p-3 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <div>Showing {table.getRowModel().rows.length} of {data.length} refund requests</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </Button>
              <span className="font-mono text-slate-300">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Decision Modal */}
      <Modal
        isOpen={!!selectedRefund && !!decisionAction}
        onClose={() => {
          setSelectedRefund(null);
          setDecisionAction(null);
        }}
        title={`Execute Refund Decision: ${decisionAction?.toUpperCase()}`}
        subtitle={`Claim ID: ${selectedRefund?.id}`}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 space-y-1 font-mono">
            <p><strong>Booking ID:</strong> {selectedRefund?.bookingId}</p>
            <p><strong>Beneficiary:</strong> {selectedRefund?.customerName} ({selectedRefund?.customerPhone})</p>
            <p><strong>Refund Destination:</strong> {selectedRefund?.refundMethod}</p>
            <p><strong>Amount:</strong> <span className="text-emerald-400 font-bold">৳{selectedRefund?.refundAmountBDT.toLocaleString()}</span></p>
          </div>

          {decisionAction === 'approve' && (
            <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Approving will trigger immediate gateway disbursal reversal. This action cannot be revoked.</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Decision Note / Audit Reason:
            </label>
            <textarea
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="State the justification, airline refund letter ref, or policy clause..."
              rows={3}
              className="w-full bg-navy-950 border border-navy-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedRefund(null);
                setDecisionAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={decisionAction === 'reject' ? 'danger' : 'primary'}
              size="sm"
              isLoading={submitting}
              onClick={handleProcessDecision}
            >
              Confirm {decisionAction?.toUpperCase()}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
