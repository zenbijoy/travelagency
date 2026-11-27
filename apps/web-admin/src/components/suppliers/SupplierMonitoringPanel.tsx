import React, { useState, useEffect } from 'react';
import { SupplierHealthMetric, SupplierCategory } from '@/types';
import { adminService } from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ZapOff,
  Zap,
  RefreshCw,
  Plane,
  Server,
  CreditCard,
  ShieldAlert
} from 'lucide-react';

export const SupplierMonitoringPanel: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [suppliers, setSuppliers] = useState<SupplierHealthMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Circuit Breaker Confirmation Modal
  const [targetSupplier, setTargetSupplier] = useState<SupplierHealthMetric | null>(null);
  const [submittingBreaker, setSubmittingBreaker] = useState(false);

  const canTripBreaker = hasPermission('monitoring.circuit_break');

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const data = await adminService.getSuppliers(categoryFilter);
      setSuppliers(data);
    } catch {
      addToast({ type: 'error', title: 'Failed to load supplier metrics' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [categoryFilter]);

  const handleToggleBreaker = async () => {
    if (!targetSupplier || !user) return;
    setSubmittingBreaker(true);
    try {
      const updated = await adminService.toggleCircuitBreaker(targetSupplier.id, {
        id: user.id,
        name: user.name,
        role: user.role
      });
      addToast({
        type: updated.circuitBreakerOpen ? 'warning' : 'success',
        title: updated.circuitBreakerOpen ? 'Circuit Breaker Tripped' : 'Circuit Breaker Reset',
        message: `${updated.name} traffic route has been ${updated.circuitBreakerOpen ? 'diverted to fallback' : 'restored to primary'}.`
      });
      setTargetSupplier(null);
      loadSuppliers();
    } catch {
      addToast({ type: 'error', title: 'Circuit breaker toggle failed' });
    } finally {
      setSubmittingBreaker(false);
    }
  };

  const getCategoryIcon = (category: SupplierCategory) => {
    switch (category) {
      case 'Airlines':
        return <Plane className="w-4 h-4 text-blue-400" />;
      case 'GDS':
        return <Server className="w-4 h-4 text-purple-400" />;
      case 'Payment Gateways':
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-400" /> Supplier & External API Telemetry
          </h3>
          <p className="text-xs text-slate-400">Live latency ping, error rates, and manual circuit breaker controls for GDS and airline APIs</p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-44 text-xs"
          >
            <option value="all">All Suppliers</option>
            <option value="Airlines">Airlines (Direct APIs)</option>
            <option value="GDS">GDS Distribution</option>
            <option value="Payment Gateways">Payment Gateways</option>
          </Select>

          <Button variant="outline" size="sm" onClick={loadSuppliers}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Ping All
          </Button>
        </div>
      </div>

      {/* Grid of Supplier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((s) => {
          const isHealthy = s.status === 'healthy';
          return (
            <Card
              key={s.id}
              className={`space-y-4 flex flex-col justify-between ${
                s.circuitBreakerOpen ? 'border-rose-500/50 bg-rose-950/20' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-navy-950 border border-navy-800 mt-0.5">
                      {getCategoryIcon(s.category)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 leading-snug">{s.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-[200px] mt-0.5">
                        {s.endpoint}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={s.circuitBreakerOpen ? 'rose' : isHealthy ? 'emerald' : 'amber'}
                    size="sm"
                    dot
                  >
                    {s.circuitBreakerOpen ? 'ISOLATED' : s.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-navy-800 text-xs">
                  <div>
                    <span className="text-slate-400 text-[11px]">Average Latency</span>
                    <p className={`font-mono font-bold mt-0.5 ${s.latencyMs > 150 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {s.latencyMs} ms
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">p99 Latency</span>
                    <p className="font-mono font-bold text-slate-200 mt-0.5">{s.p99LatencyMs} ms</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">24h Uptime</span>
                    <p className="font-mono font-bold text-slate-200 mt-0.5">{s.uptime24h}%</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[11px]">Error Rate (24h)</span>
                    <p className={`font-mono font-bold mt-0.5 ${s.errorRate24h > 1 ? 'text-rose-400' : 'text-slate-200'}`}>
                      {s.errorRate24h}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-navy-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Ping: {s.lastCheckedAt}</span>
                {canTripBreaker && (
                  <Button
                    variant={s.circuitBreakerOpen ? 'emerald' : 'danger'}
                    size="sm"
                    onClick={() => setTargetSupplier(s)}
                  >
                    {s.circuitBreakerOpen ? (
                      <>
                        <Zap className="w-3.5 h-3.5 mr-1" /> Reset Circuit
                      </>
                    ) : (
                      <>
                        <ZapOff className="w-3.5 h-3.5 mr-1" /> Trip Breaker
                      </>
                    )}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Circuit Breaker Modal */}
      <Modal
        isOpen={!!targetSupplier}
        onClose={() => setTargetSupplier(null)}
        title={targetSupplier?.circuitBreakerOpen ? 'Reset Circuit Breaker' : 'Trip Circuit Breaker (Isolate Supplier)'}
        subtitle={`Supplier: ${targetSupplier?.name}`}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 font-mono space-y-1">
            <p><strong>Endpoint:</strong> {targetSupplier?.endpoint}</p>
            <p><strong>Latency:</strong> {targetSupplier?.latencyMs} ms</p>
            <p><strong>Current Circuit State:</strong> {targetSupplier?.circuitBreakerOpen ? 'OPEN (Tripped)' : 'CLOSED (Normal Routing)'}</p>
          </div>

          <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            targetSupplier?.circuitBreakerOpen
              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
          }`}>
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>
              {targetSupplier?.circuitBreakerOpen
                ? 'Resetting the breaker will restore live customer booking traffic to this supplier API.'
                : 'Tripping the breaker will immediately route all customer search and booking requests to fallback cache or alternate GDS.'}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button variant="outline" size="sm" onClick={() => setTargetSupplier(null)}>
              Cancel
            </Button>
            <Button
              variant={targetSupplier?.circuitBreakerOpen ? 'primary' : 'danger'}
              size="sm"
              isLoading={submittingBreaker}
              onClick={handleToggleBreaker}
            >
              Confirm {targetSupplier?.circuitBreakerOpen ? 'Reset' : 'Trip Breaker'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
