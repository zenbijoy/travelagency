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
import { PaymentTransaction, PaymentGatewayId, PaymentStatus } from '@/types';
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
  Receipt,
  Search,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';

export const TransactionLedgerTable: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [data, setData] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gatewayFilter, setGatewayFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Selected Transaction for Reconciliation
  const [reconcilingTxn, setReconcilingTxn] = useState<PaymentTransaction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canReconcile = hasPermission('payments.reconcile');

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const txns = await adminService.getTransactions(statusFilter, gatewayFilter, search);
      setData(txns);
    } catch {
      addToast({ type: 'error', title: 'Failed to load transaction ledger' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [statusFilter, gatewayFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadTransactions();
  };

  const handleReconcile = async () => {
    if (!reconcilingTxn || !user) return;
    setSubmitting(true);
    try {
      await adminService.reconcileTransaction(reconcilingTxn.id, {
        id: user.id,
        name: user.name,
        role: user.role
      });
      addToast({
        type: 'success',
        title: 'Transaction Reconciled',
        message: `Order ${reconcilingTxn.orderId} successfully reconciled against gateway statement.`
      });
      setReconcilingTxn(null);
      loadTransactions();
    } catch {
      addToast({ type: 'error', title: 'Reconciliation failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<PaymentTransaction>[]>(
    () => [
      {
        accessorKey: 'orderId',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            Order & Booking Ref <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-mono font-bold text-slate-100">{row.original.orderId}</p>
            <p className="text-[11px] text-slate-400 font-mono">{row.original.bookingRef}</p>
          </div>
        )
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-200">{row.original.customerName}</p>
            <p className="text-[11px] text-slate-400">{row.original.customerEmail}</p>
          </div>
        )
      },
      {
        accessorKey: 'serviceType',
        header: 'Service',
        cell: ({ row }) => (
          <span className="capitalize text-xs font-medium text-slate-300">
            {row.original.serviceType.replace('_', ' ')}
          </span>
        )
      },
      {
        accessorKey: 'amountBDT',
        header: 'Amount',
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            <p className="font-bold text-emerald-400">৳{row.original.amountBDT.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">${row.original.amountUSD.toFixed(2)} USD</p>
          </div>
        )
      },
      {
        accessorKey: 'gateway',
        header: 'Gateway',
        cell: ({ row }) => {
          const colors: Record<PaymentGatewayId, 'emerald' | 'amber' | 'blue' | 'purple' | 'slate' | 'rose'> = {
            bkash: 'rose',
            nagad: 'amber',
            rocket: 'purple',
            sslcommerz: 'blue',
            stripe: 'slate'
          };
          return (
            <div>
              <Badge variant={colors[row.original.gateway] || 'slate'}>{row.original.gateway}</Badge>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[120px]">
                {row.original.gatewayTransactionId}
              </p>
            </div>
          );
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          const variants: Record<PaymentStatus, 'emerald' | 'amber' | 'rose' | 'purple'> = {
            success: 'emerald',
            pending: 'amber',
            failed: 'rose',
            refunded: 'purple'
          };
          return <Badge variant={variants[status] || 'slate'} dot>{status}</Badge>;
        }
      },
      {
        accessorKey: 'reconciled',
        header: 'Reconciliation',
        cell: ({ row }) => {
          const r = row.original.reconciled;
          if (r) {
            return (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
              <Clock className="w-3.5 h-3.5" /> Pending
            </span>
          );
        }
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const txn = row.original;
          if (!canReconcile) return <span className="text-xs text-slate-400">N/A</span>;
          if (txn.reconciled) {
            return <span className="text-[11px] text-slate-400 font-mono">Matched</span>;
          }

          return (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReconcilingTxn(txn)}
            >
              Reconcile
            </Button>
          );
        }
      }
    ],
    [canReconcile]
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
            <Receipt className="w-5 h-5 text-emerald-400" /> Platform Transaction Ledger & Settlements
          </h3>
          <p className="text-xs text-slate-400">Immutable ledger of incoming bookings, gateway reference IDs, and treasury matching</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order, PNR, txn ID..."
              className="pl-9 text-xs"
            />
          </form>

          <Select
            value={gatewayFilter}
            onChange={(e) => setGatewayFilter(e.target.value)}
            className="w-32 text-xs"
          >
            <option value="all">All Gateways</option>
            <option value="bkash">bKash</option>
            <option value="nagad">Nagad</option>
            <option value="sslcommerz">SSLCommerz</option>
            <option value="rocket">Rocket</option>
            <option value="stripe">Stripe</option>
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-32 text-xs"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={7} />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            title="No Transactions Found"
            description="No transaction ledger records matched your query filters."
            actionText="Clear Filters"
            onAction={() => {
              setSearch('');
              setStatusFilter('all');
              setGatewayFilter('all');
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
            <div>Showing {table.getRowModel().rows.length} of {data.length} transactions</div>
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

      {/* Reconciliation Modal */}
      <Modal
        isOpen={!!reconcilingTxn}
        onClose={() => setReconcilingTxn(null)}
        title="Execute Payment Reconciliation"
        subtitle={`Order: ${reconcilingTxn?.orderId}`}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 space-y-1.5 font-mono">
            <p><strong>Gateway:</strong> {reconcilingTxn?.gateway.toUpperCase()}</p>
            <p><strong>Gateway Txn ID:</strong> {reconcilingTxn?.gatewayTransactionId}</p>
            <p><strong>Amount:</strong> ৳{reconcilingTxn?.amountBDT.toLocaleString()} (${reconcilingTxn?.amountUSD.toFixed(2)} USD)</p>
            <p><strong>Customer:</strong> {reconcilingTxn?.customerName} ({reconcilingTxn?.customerEmail})</p>
          </div>

          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Bank host-to-host settlement record verified. Confirming will balance platform ledger.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button variant="outline" size="sm" onClick={() => setReconcilingTxn(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={submitting}
              onClick={handleReconcile}
            >
              Confirm Match & Reconcile
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
