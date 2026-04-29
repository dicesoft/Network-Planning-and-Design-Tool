import React from 'react';
import { Activity, Shield, ShieldOff, ShieldQuestion, Layers, Clock } from 'lucide-react';

interface BandwidthImpactProps {
  totalAffected: number;
  totalSurvived: number;
  /** Service count metrics for the summary row */
  serviceCounts?: {
    total: number;
    affected: number;
    survived: number;
    atRisk?: number;
    lost: number;
    temporaryOutage?: number;
  };
}

/**
 * BandwidthImpact - CSS stacked horizontal bar showing survived (green) vs lost (red)
 * bandwidth with percentage labels. Includes a 4-metric service summary row.
 */
export const BandwidthImpact: React.FC<BandwidthImpactProps> = ({
  totalAffected,
  totalSurvived,
  serviceCounts,
}) => {
  const hasTempOutage = (serviceCounts?.temporaryOutage ?? 0) > 0;
  const totalLost = totalAffected - totalSurvived;
  const survivedPct = totalAffected > 0 ? (totalSurvived / totalAffected) * 100 : 0;
  const lostPct = totalAffected > 0 ? (totalLost / totalAffected) * 100 : 0;
  // Disrupted bandwidth: approximate from service ratio (temp outage services are in survivedServices)
  const tempOutageRatio = serviceCounts && serviceCounts.affected > 0
    ? (serviceCounts.temporaryOutage ?? 0) / serviceCounts.affected
    : 0;
  const disruptedPct = survivedPct * tempOutageRatio;
  const healthyPct = survivedPct - disruptedPct;

  return (
    <div className="rounded-lg border border-border bg-elevated p-4">
      <h3 className="mb-3 text-xs font-semibold text-text-primary">Bandwidth Impact</h3>

      {/* Service summary row */}
      {serviceCounts && serviceCounts.total > 0 && (
        <div className={`mb-3 grid gap-2 ${hasTempOutage ? 'grid-cols-6' : 'grid-cols-5'}`}>
          <MetricCell
            label="Total Services"
            value={serviceCounts.total}
            icon={<Layers className="h-3.5 w-3.5 text-text-muted" />}
          />
          <MetricCell
            label="Affected"
            value={serviceCounts.affected}
            icon={<Activity className="h-3.5 w-3.5 text-warning" />}
            valueClass="text-warning"
          />
          <MetricCell
            label="Survived"
            value={serviceCounts.survived}
            icon={<Shield className="h-3.5 w-3.5 text-success" />}
            valueClass="text-success"
          />
          {hasTempOutage && (
            <MetricCell
              label="Disrupted"
              value={serviceCounts.temporaryOutage!}
              icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
              valueClass="text-amber-500"
            />
          )}
          <MetricCell
            label="At Risk"
            value={serviceCounts.atRisk ?? 0}
            icon={<ShieldQuestion className="h-3.5 w-3.5 text-blue-500" />}
            valueClass="text-blue-500"
          />
          <MetricCell
            label="Lost"
            value={serviceCounts.lost}
            icon={<ShieldOff className="h-3.5 w-3.5 text-danger" />}
            valueClass="text-danger"
          />
        </div>
      )}

      {totalAffected === 0 ? (
        <p className="text-xs text-text-muted">No bandwidth affected.</p>
      ) : (
        <>
          {/* Stacked horizontal bar */}
          <div className="mb-3 flex h-6 overflow-hidden rounded-md">
            {healthyPct > 0 && (
              <div
                className="flex items-center justify-center bg-success text-[10px] font-semibold text-white transition-all"
                style={{ width: `${healthyPct}%` }}
              >
                {healthyPct >= 15 && `${Math.round(healthyPct)}%`}
              </div>
            )}
            {disruptedPct > 0 && (
              <div
                className="flex items-center justify-center bg-amber-500 text-[10px] font-semibold text-white transition-all"
                style={{ width: `${disruptedPct}%` }}
              >
                {disruptedPct >= 15 && `${Math.round(disruptedPct)}%`}
              </div>
            )}
            {lostPct > 0 && (
              <div
                className="flex items-center justify-center bg-danger text-[10px] font-semibold text-white transition-all"
                style={{ width: `${lostPct}%` }}
              >
                {lostPct >= 15 && `${Math.round(lostPct)}%`}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />
                <span className="text-text-secondary">
                  Survived: {totalSurvived}G ({Math.round(survivedPct)}%)
                </span>
              </span>
              {disruptedPct > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  <span className="text-text-secondary">
                    Disrupted: {Math.round(disruptedPct)}%
                  </span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger" />
                <span className="text-text-secondary">
                  Lost: {totalLost}G ({Math.round(lostPct)}%)
                </span>
              </span>
            </div>
            <span className="font-medium text-text-primary">Total: {totalAffected}G</span>
          </div>
        </>
      )}
    </div>
  );
};

const MetricCell: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  valueClass?: string;
}> = ({ label, value, icon, valueClass }) => (
  <div className="bg-tertiary/50 flex items-center gap-2 rounded-md border border-border px-2.5 py-2">
    {icon}
    <div className="flex flex-col">
      <span className={`text-sm font-semibold ${valueClass || 'text-text-primary'}`}>
        {value}
      </span>
      <span className="text-[10px] text-text-muted">{label}</span>
    </div>
  </div>
);
