import React from 'react';
import { Card } from './Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number; // percentage
    isPositive: boolean;
    period?: string;
  };
  highlightColor?: 'emerald' | 'blue' | 'amber' | 'purple';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  highlightColor = 'emerald'
}) => {
  const iconBgClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  }[highlightColor];

  return (
    <Card className="flex flex-col justify-between hover:border-navy-700 transition-all">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          <h4 className="text-2xl font-bold text-slate-100 mt-2 font-mono">{value}</h4>
        </div>
        <div className={`p-3 rounded-xl ${iconBgClasses}`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-navy-800/80 flex items-center justify-between text-xs">
        {trend ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
            <span className="text-slate-400">{trend.period || 'vs last month'}</span>
          </div>
        ) : (
          <span className="text-slate-400">{subtitle || 'Live telemetry verified'}</span>
        )}
      </div>
    </Card>
  );
};
