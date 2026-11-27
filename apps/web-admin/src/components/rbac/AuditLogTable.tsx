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
import { AuditLogEntry, AdminRole } from '@/types';
import { adminService } from '@/services/adminService';
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
  ScrollText,
  Search,
  ShieldCheck,
  Eye,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Terminal
} from 'lucide-react';

export const AuditLogTable: React.FC = () => {
  const { addToast } = useToast();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Selected Log Details Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAuditLogs(moduleFilter, search);
      setLogs(data);
    } catch {
      addToast({ type: 'error', title: 'Failed to load audit logs' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [moduleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  const roleColors: Record<AdminRole, 'purple' | 'blue' | 'emerald' | 'amber' | 'slate'> = {
    super_admin: 'purple',
    ops_admin: 'blue',
    finance_admin: 'emerald',
    support_admin: 'amber',
    readonly: 'slate'
  };

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        accessorKey: 'timestamp',
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            Timestamp (UTC) <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-xs text-slate-300">
            {new Date(row.original.timestamp).toLocaleString()}
          </div>
        )
      },
      {
        accessorKey: 'actorName',
        header: 'Actor & Role',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-100">{row.original.actorName}</p>
            <Badge variant={roleColors[row.original.actorRole] || 'slate'} size="sm">
              {row.original.actorRole}
            </Badge>
          </div>
        )
      },
      {
        accessorKey: 'action',
        header: 'Action Executed',
        cell: ({ row }) => (
          <div>
            <span className="font-mono text-xs font-bold text-emerald-400">
              {row.original.action}
            </span>
            <p className="text-[10px] text-slate-400 font-mono">
              Entity: {row.original.entityType} ({row.original.entityId})
            </p>
          </div>
        )
      },
      {
        accessorKey: 'module',
        header: 'Module',
        cell: ({ row }) => (
          <Badge variant="navy" size="sm">{row.original.module}</Badge>
        )
      },
      {
        accessorKey: 'tamperHash',
        header: 'Integrity Digest',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
            <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate max-w-[130px]">{row.original.tamperHash}</span>
          </div>
        )
      },
      {
        id: 'actions',
        header: 'Details',
        cell: ({ row }) => (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedLog(row.original)}
            className="text-xs text-slate-300 hover:text-white"
          >
            <Eye className="w-3.5 h-3.5 mr-1" /> Inspect
          </Button>
        )
      }
    ],
    []
  );

  const table = useReactTable({
    data: logs,
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
            <ScrollText className="w-5 h-5 text-emerald-400" /> Tamper-Evident Regulatory Audit Logs
          </h3>
          <p className="text-xs text-slate-400">Platform-wide immutable event trail cryptographically hashed for ISO/PCI-DSS regulatory compliance</p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actor, action, hash..."
              className="pl-9 text-xs"
            />
          </form>

          <Select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="w-36 text-xs"
          >
            <option value="ALL">All Modules</option>
            <option value="AGENCY">Agency</option>
            <option value="KYC">KYC Queue</option>
            <option value="HOTEL">Hotels</option>
            <option value="PAYMENT">Payments</option>
            <option value="REFUND">Refunds</option>
            <option value="RBAC">RBAC</option>
            <option value="SUPPLIER">Suppliers</option>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="No Audit Logs Found"
            description="No audit events matched your filter criteria."
            actionText="Reset Filter"
            onAction={() => {
              setSearch('');
              setModuleFilter('ALL');
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

        {!loading && logs.length > 0 && (
          <div className="p-3 border-t border-navy-800 flex items-center justify-between text-xs text-slate-400">
            <div>Showing {table.getRowModel().rows.length} of {logs.length} audit records</div>
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

      {/* Inspect Log Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Inspect Audit Log Record"
        subtitle={`Log ID: ${selectedLog?.id}`}
        maxWidth="2xl"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-navy-950 p-3.5 rounded-lg border border-navy-800 font-mono">
              <div>
                <span className="text-slate-400">Actor:</span>
                <p className="text-slate-200 font-semibold">{selectedLog.actorName} ({selectedLog.actorRole})</p>
              </div>
              <div>
                <span className="text-slate-400">Timestamp:</span>
                <p className="text-slate-200">{new Date(selectedLog.timestamp).toISOString()}</p>
              </div>
              <div>
                <span className="text-slate-400">IP Gateway:</span>
                <p className="text-slate-200">{selectedLog.ipAddress}</p>
              </div>
              <div>
                <span className="text-slate-400">User Agent:</span>
                <p className="text-slate-200 truncate">{selectedLog.userAgent}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-emerald-400" /> Action Payload JSON:
                </span>
                <Badge variant="emerald" size="sm">Immutable Record</Badge>
              </div>
              <pre className="p-3 bg-navy-950 border border-navy-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto max-h-56">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400">Cryptographic Integrity Hash:</span>
              <p className="text-xs font-mono text-emerald-400 break-all select-all">{selectedLog.tamperHash}</p>
            </div>

            <div className="flex justify-end pt-2 border-t border-navy-800">
              <Button variant="outline" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
