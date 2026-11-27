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
import { TenantAgency, AgencyVerificationStatus } from '@/types';
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
  Search,
  Building2,
  CheckCircle,
  Ban,
  RotateCcw,
  ShieldAlert,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const AgencyManagementTable: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [data, setData] = useState<TenantAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Action Confirmation Modal
  const [targetAgency, setTargetAgency] = useState<TenantAgency | null>(null);
  const [actionType, setActionType] = useState<AgencyVerificationStatus | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManage = hasPermission('agencies.manage');

  const loadAgencies = async () => {
    setLoading(true);
    try {
      const agencies = await adminService.getAgencies(statusFilter, search);
      setData(agencies);
    } catch {
      addToast({ type: 'error', title: 'Failed to load agencies' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgencies();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadAgencies();
  };

  const handleConfirmStatusChange = async () => {
    if (!targetAgency || !actionType || !user) return;
    setSubmitting(true);
    try {
      await adminService.updateAgencyStatus(
        targetAgency.id,
        actionType,
        { id: user.id, name: user.name, role: user.role },
        reason || 'Administrative status change executed via Web Admin'
      );
      addToast({
        type: 'success',
        title: `Agency ${actionType.toUpperCase()}`,
        message: `${targetAgency.name} is now marked as ${actionType}.`
      });
      setTargetAgency(null);
      setActionType(null);
      setReason('');
      loadAgencies();
    } catch {
      addToast({ type: 'error', title: 'Failed to update agency status' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<TenantAgency>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            Agency Name <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-100">{row.original.name}</p>
            <p className="text-[11px] text-slate-400 font-mono">{row.original.tradeLicenseNumber}</p>
          </div>
        )
      },
      {
        accessorKey: 'city',
        header: 'Location & Contact',
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="text-slate-200 font-medium">{row.original.city}, Bangladesh</p>
            <p className="text-slate-400 text-[11px]">{row.original.phone}</p>
          </div>
        )
      },
      {
        accessorKey: 'tier',
        header: 'Tier',
        cell: ({ row }) => {
          const colors = {
            Platinum: 'purple',
            Gold: 'amber',
            Silver: 'slate',
            Standard: 'navy'
          } as const;
          return <Badge variant={colors[row.original.tier] || 'slate'}>{row.original.tier}</Badge>;
        }
      },
      {
        accessorKey: 'commissionRate',
        header: 'Commission',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-emerald-400">
            {row.original.commissionRate}%
          </span>
        )
      },
      {
        accessorKey: 'totalGmvBDT',
        header: 'Lifetime GMV',
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            <p className="text-slate-200 font-bold">৳{(row.original.totalGmvBDT / 100000).toFixed(1)} Lakh</p>
            <p className="text-[10px] text-slate-400">{row.original.totalBookings} bookings</p>
          </div>
        )
      },
      {
        accessorKey: 'status',
        header: 'KYC Status',
        cell: ({ row }) => {
          const status = row.original.status;
          const variants = {
            verified: 'emerald',
            pending: 'amber',
            suspended: 'rose',
            rejected: 'rose'
          } as const;
          return (
            <Badge variant={variants[status] || 'slate'} dot>
              {status}
            </Badge>
          );
        }
      },
      {
        id: 'actions',
        header: 'Governance Controls',
        cell: ({ row }) => {
          const a = row.original;
          if (!canManage) {
            return <span className="text-xs text-slate-400 italic">Read-only view</span>;
          }

          return (
            <div className="flex items-center gap-1.5">
              {a.status === 'pending' && (
                <Button
                  size="sm"
                  variant="emerald"
                  onClick={() => {
                    setTargetAgency(a);
                    setActionType('verified');
                  }}
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </Button>
              )}

              {a.status === 'verified' && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setTargetAgency(a);
                    setActionType('suspended');
                  }}
                >
                  <Ban className="w-3.5 h-3.5" /> Suspend
                </Button>
              )}

              {a.status === 'suspended' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetAgency(a);
                    setActionType('verified');
                  }}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reactivate
                </Button>
              )}
            </div>
          );
        }
      }
    ],
    [canManage]
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
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" /> B2B Agency Partners Directory
          </h3>
          <p className="text-xs text-slate-400">Direct control of agency tenant status, commission rates, and compliance state</p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name, trade license..."
              className="pl-9 text-xs"
            />
          </form>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="verified">Verified Only</option>
            <option value="pending">Pending KYC</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
      </div>

      {/* Table Content */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : data.length === 0 ? (
          <EmptyState
            title="No Agency Tenants Found"
            description="There are currently no agencies matching your filter criteria."
            actionText="Reset Filters"
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

        {/* Pagination controls */}
        {!loading && data.length > 0 && (
          <div className="p-3 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing {table.getRowModel().rows.length} of {data.length} registered agencies
            </div>
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

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!targetAgency && !!actionType}
        onClose={() => {
          setTargetAgency(null);
          setActionType(null);
        }}
        title={`Confirm Agency ${actionType?.toUpperCase()}`}
        subtitle={`Action target: ${targetAgency?.name}`}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 space-y-1">
            <p><strong>License:</strong> {targetAgency?.tradeLicenseNumber}</p>
            <p><strong>Current Status:</strong> {targetAgency?.status}</p>
            <p><strong>Target Status:</strong> <span className="text-emerald-400 font-bold">{actionType}</span></p>
          </div>

          {actionType === 'suspended' && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Suspending this agency immediately disables all B2B booking access and holds wallet payouts.</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Audit Note / Mandatory Reason:
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the administrative justification for this status modification..."
              rows={3}
              className="w-full bg-navy-950 border border-navy-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTargetAgency(null);
                setActionType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={actionType === 'suspended' ? 'danger' : 'primary'}
              size="sm"
              isLoading={submitting}
              onClick={handleConfirmStatusChange}
            >
              Confirm Status Change
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
