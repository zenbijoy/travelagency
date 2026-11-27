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
import { TenantHotel, HotelStatus } from '@/types';
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
  Hotel,
  Search,
  Star,
  CheckCircle,
  Ban,
  RotateCcw,
  ShieldAlert,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const HotelManagementTable: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [data, setData] = useState<TenantHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Action Confirmation Modal
  const [targetHotel, setTargetHotel] = useState<TenantHotel | null>(null);
  const [actionType, setActionType] = useState<HotelStatus | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManage = hasPermission('hotels.manage');

  const loadHotels = async () => {
    setLoading(true);
    try {
      const hotels = await adminService.getHotels(statusFilter, search);
      setData(hotels);
    } catch {
      addToast({ type: 'error', title: 'Failed to load hotels' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHotels();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadHotels();
  };

  const handleConfirmStatusChange = async () => {
    if (!targetHotel || !actionType || !user) return;
    setSubmitting(true);
    try {
      await adminService.updateHotelStatus(
        targetHotel.id,
        actionType,
        { id: user.id, name: user.name, role: user.role },
        reason || 'Administrative status change executed via Web Admin'
      );
      addToast({
        type: 'success',
        title: `Hotel ${actionType.toUpperCase()}`,
        message: `${targetHotel.name} status updated to ${actionType}.`
      });
      setTargetHotel(null);
      setActionType(null);
      setReason('');
      loadHotels();
    } catch {
      addToast({ type: 'error', title: 'Failed to update hotel status' });
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<TenantHotel>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            Hotel Property <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-100">{row.original.name}</p>
            <p className="text-[11px] text-slate-400">{row.original.address}</p>
          </div>
        )
      },
      {
        accessorKey: 'city',
        header: 'Location',
        cell: ({ row }) => (
          <span className="text-xs text-slate-300 font-medium">{row.original.city}</span>
        )
      },
      {
        accessorKey: 'starRating',
        header: 'Class',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
            <span>{row.original.starRating}</span>
            <Star className="w-3.5 h-3.5 fill-amber-400" />
          </div>
        )
      },
      {
        accessorKey: 'roomsCount',
        header: 'Rooms',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-300">{row.original.roomsCount} units</span>
        )
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
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          const variants = {
            verified: 'emerald',
            pending: 'amber',
            suspended: 'rose'
          } as const;
          return <Badge variant={variants[status] || 'slate'} dot>{status}</Badge>;
        }
      },
      {
        id: 'actions',
        header: 'Oversight Controls',
        cell: ({ row }) => {
          const h = row.original;
          if (!canManage) {
            return <span className="text-xs text-slate-400 italic">Read-only view</span>;
          }

          return (
            <div className="flex items-center gap-1.5">
              {h.status === 'pending' && (
                <Button
                  size="sm"
                  variant="emerald"
                  onClick={() => {
                    setTargetHotel(h);
                    setActionType('verified');
                  }}
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Approve
                </Button>
              )}

              {h.status === 'verified' && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setTargetHotel(h);
                    setActionType('suspended');
                  }}
                >
                  <Ban className="w-3.5 h-3.5" /> Suspend
                </Button>
              )}

              {h.status === 'suspended' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetHotel(h);
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Hotel className="w-5 h-5 text-emerald-400" /> Hotel Inventory & Property Oversight
          </h3>
          <p className="text-xs text-slate-400">Direct control of hotel property approval status, inventory tier, and commission</p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hotel name, city..."
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
            <option value="pending">Pending Approval</option>
            <option value="suspended">Suspended</option>
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
            title="No Hotel Properties Found"
            description="There are currently no hotels matching your search or filter."
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

        {!loading && data.length > 0 && (
          <div className="p-3 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <div>Showing {table.getRowModel().rows.length} of {data.length} hotels</div>
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
        isOpen={!!targetHotel && !!actionType}
        onClose={() => {
          setTargetHotel(null);
          setActionType(null);
        }}
        title={`Confirm Hotel ${actionType?.toUpperCase()}`}
        subtitle={`Target property: ${targetHotel?.name}`}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 space-y-1">
            <p><strong>Property:</strong> {targetHotel?.name} ({targetHotel?.city})</p>
            <p><strong>Current Status:</strong> {targetHotel?.status}</p>
            <p><strong>New Status:</strong> <span className="text-emerald-400 font-bold">{actionType}</span></p>
          </div>

          {actionType === 'suspended' && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>Suspending this property instantly removes room inventory from all search channels.</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Audit Note / Mandatory Reason:
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State the administrative justification..."
              rows={3}
              className="w-full bg-navy-950 border border-navy-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTargetHotel(null);
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
