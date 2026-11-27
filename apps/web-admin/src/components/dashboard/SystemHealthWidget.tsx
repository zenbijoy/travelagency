import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SystemHealthMetric } from '@/types';
import { Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface SystemHealthWidgetProps {
  metrics: SystemHealthMetric[];
}

export const SystemHealthWidget: React.FC<SystemHealthWidgetProps> = ({ metrics }) => {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-navy-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-bold text-slate-100">Live Infrastructure Health Telemetry</h4>
        </div>
        <span className="text-[11px] text-slate-400">Ping interval: 30s</span>
      </div>

      <div className="divide-y divide-navy-800">
        {metrics.map((m) => {
          const isOperational = m.status === 'operational';
          return (
            <div key={m.service} className="py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                {isOperational ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : m.status === 'degraded' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
                <span className="font-medium text-slate-200">{m.service}</span>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-slate-400 text-[11px]">
                  {m.latencyMs}ms latency
                </span>
                <Badge
                  variant={isOperational ? 'emerald' : m.status === 'degraded' ? 'amber' : 'rose'}
                  size="sm"
                  dot
                >
                  {m.status}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
