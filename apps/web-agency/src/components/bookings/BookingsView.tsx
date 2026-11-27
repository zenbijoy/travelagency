import React, { useState, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  ColumnDef,
  flexRender,
  SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Calendar,
  Eye,
  Plane,
  Building,
  Compass,
  Palmtree,
  Sparkles,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import { getTenantBookings } from '../../services/agencyApi';
import { Booking, BookingStatus, ServiceType } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { BookingDetailDrawer } from './BookingDetailDrawer';

export const BookingsView: React.FC = () => {
  const { currentTenant, showToast } = useAgency();
  const [bookings, setBookings] = useState<Booking[]>(() =>
    getTenantBookings(currentTenant.id)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isVirtualizedView, setIsVirtualizedView] = useState(true);

  // Filter logic
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchSearch =
        searchQuery === '' ||
        b.bookingReference.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.pnr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.title.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus =
        selectedStatus === 'all' || b.status === selectedStatus;

      const matchService =
        selectedService === 'all' || b.serviceType === selectedService;

      return matchSearch && matchStatus && matchService;
    });
  }, [bookings, searchQuery, selectedStatus, selectedService]);

  // Column definitions for TanStack Table
  const columns = useMemo<ColumnDef<Booking>[]>(
    () => [
      {
        accessorKey: 'bookingReference',
        header: 'Ref / PNR',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div>
              <span className="font-mono font-bold text-white block">
                {row.bookingReference}
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">
                PNR: {row.pnr}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'customerName',
        header: 'Customer Details',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div>
              <span className="font-semibold text-slate-200 block">
                {row.customerName}
              </span>
              <span className="text-[11px] text-slate-400">
                {row.customerPhone}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'serviceType',
        header: 'Service & Itinerary',
        cell: (info) => {
          const row = info.row.original;
          const serviceIcon = {
            flight: <Plane className="w-3.5 h-3.5 text-blue-400 inline mr-1" />,
            hotel: <Building className="w-3.5 h-3.5 text-purple-400 inline mr-1" />,
            tour: <Compass className="w-3.5 h-3.5 text-amber-400 inline mr-1" />,
            holiday: <Palmtree className="w-3.5 h-3.5 text-emerald-400 inline mr-1" />,
          }[row.serviceType];
          return (
            <div className="max-w-[260px]">
              <div className="flex items-center text-xs font-medium text-slate-300">
                {serviceIcon}
                <span className="capitalize font-semibold text-white mr-1.5">
                  [{row.serviceType}]
                </span>
                <span className="truncate">{row.title}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {row.travelDate} • {row.guestsCount} Pax
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'totalPriceBDT',
        header: 'Gross (BDT)',
        cell: (info) => (
          <span className="font-mono font-bold text-white text-right block">
            ৳{info.getValue<number>().toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'commissionBDT',
        header: 'Commission',
        cell: (info) => (
          <span className="font-mono font-semibold text-emerald-400 text-right block">
            +৳{info.getValue<number>().toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (info) => {
          const val = info.getValue<BookingStatus>();
          return (
            <div className="text-center">
              <Badge
                variant={
                  val === 'confirmed'
                    ? 'emerald'
                    : val === 'pending'
                    ? 'amber'
                    : val === 'cancelled'
                    ? 'rose'
                    : 'blue'
                }
                size="sm"
              >
                {val}
              </Badge>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Action',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="text-center">
              <button
                onClick={() => {
                  setSelectedBooking(row);
                  setIsDrawerOpen(true);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="View Full Booking Details"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredBookings,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 50,
      },
    },
  });

  // TanStack Virtual for virtualizing the large dataset
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 54, // average row height
    overscan: 10,
  });

  const handleStatusChange = (bookingId: string, newStatus: BookingStatus) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Agency Booking Ledger
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dense virtualized TanStack table managing {filteredBookings.length} bookings
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isVirtualizedView ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setIsVirtualizedView(!isVirtualizedView)}
          >
            {isVirtualizedView ? 'Virtualized Mode (Active)' : 'Standard Paged Mode'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
            onClick={() =>
              showToast({
                type: 'success',
                title: 'Data Exported',
                message: `Exported ${filteredBookings.length} booking records in CSV format.`,
              })
            }
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 backdrop-blur-md">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search PNR, customer, ref, or route..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {/* Status buttons */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {['all', 'confirmed', 'pending', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded capitalize font-medium transition-all ${
                  selectedStatus === st
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Service dropdown */}
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="all">All Services</option>
            <option value="flight">Flights</option>
            <option value="hotel">Hotels</option>
            <option value="tour">Tours</option>
            <option value="holiday">Holidays</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-2xl backdrop-blur-md">
        {isVirtualizedView ? (
          /* Virtualized TanStack Virtual Table */
          <div
            ref={tableContainerRef}
            className="overflow-auto relative max-h-[620px]"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-950 text-slate-300 font-semibold border-b border-slate-800 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="py-3 px-4 select-none cursor-pointer"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <ArrowUpDown className="w-3 h-3 text-slate-500" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                  display: 'block',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
                    >
                      {row.getVisibleCells().map((cell, idx) => {
                        const widthClass =
                          idx === 0
                            ? 'w-[18%]'
                            : idx === 1
                            ? 'w-[20%]'
                            : idx === 2
                            ? 'w-[30%]'
                            : idx === 3
                            ? 'w-[12%] text-right'
                            : idx === 4
                            ? 'w-[10%] text-right'
                            : idx === 5
                            ? 'w-[10%] text-center'
                            : 'w-[10%] text-center';
                        return (
                          <td key={cell.id} className={`px-4 py-2 truncate ${widthClass}`}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Standard Paginated Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950 text-slate-300 font-semibold border-b border-slate-800">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="py-3 px-4 select-none cursor-pointer"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/40">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2.5 px-4">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        booking={selectedBooking}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
};
