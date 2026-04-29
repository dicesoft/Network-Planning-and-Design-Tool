import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Header, StatusBar } from '@/components/layout';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { NetworkSummaryReport } from '@/components/reports/NetworkSummaryReport';
import type { ReportDefinition, ReportCategory } from '@/types/reports';
import {
  BarChart3,
  Network,
  Activity,
  Cable,
  Shield,
  LineChart,
  FileBarChart,
  Clock,
  Search,
  Server,
  Gauge,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Report Registry
// ---------------------------------------------------------------------------

const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: 'network-summary',
    title: 'Network Summary',
    description:
      'Topology statistics, health score, node/edge counts, and service summary.',
    icon: Network,
    category: 'network',
    status: 'available',
  },
  {
    id: 'capacity-utilization',
    title: 'Capacity Utilization',
    description:
      'Edge and node utilization metrics, bottleneck identification, and trend analysis.',
    icon: Gauge,
    category: 'capacity',
    status: 'coming-soon',
  },
  {
    id: 'service-health',
    title: 'Service Health',
    description:
      'Service status overview, protection coverage, and failure statistics.',
    icon: Activity,
    category: 'service',
    status: 'coming-soon',
  },
  {
    id: 'fiber-plant',
    title: 'Fiber Plant',
    description:
      'Physical infrastructure report: fiber distances, profiles, and OSP details.',
    icon: Cable,
    category: 'fiber',
    status: 'coming-soon',
  },
  {
    id: 'srlg-analysis',
    title: 'SRLG Analysis',
    description:
      'Shared Risk Link Group coverage, diversity analysis, and vulnerability mapping.',
    icon: Shield,
    category: 'analysis',
    status: 'coming-soon',
  },
  {
    id: 'traffic-matrix',
    title: 'Traffic Matrix',
    description:
      'Demand matrix visualization showing traffic between node pairs.',
    icon: LineChart,
    category: 'analysis',
    status: 'coming-soon',
  },
  {
    id: 'sla-compliance',
    title: 'SLA Compliance',
    description:
      'Service Level Agreement tracking, availability metrics, and compliance status.',
    icon: FileBarChart,
    category: 'compliance',
    status: 'coming-soon',
  },
  {
    id: 'change-history',
    title: 'Change History',
    description:
      'Timeline of topology modifications, service changes, and configuration updates.',
    icon: Clock,
    category: 'network',
    status: 'coming-soon',
  },
];

// ---------------------------------------------------------------------------
// Category filter pills
// ---------------------------------------------------------------------------

const CATEGORIES: { id: 'all' | ReportCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'network', label: 'Network' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'service', label: 'Service' },
  { id: 'fiber', label: 'Fiber' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'compliance', label: 'Compliance' },
];

// ---------------------------------------------------------------------------
// Report Card
// ---------------------------------------------------------------------------

interface ReportCardProps {
  report: ReportDefinition;
  onClick: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ report, onClick }) => {
  const isDisabled = report.status === 'coming-soon';
  const Icon = report.icon;

  return (
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={cn(
        'group flex flex-col rounded-lg border border-border bg-elevated p-5 text-left transition-all',
        isDisabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:border-accent hover:shadow-md',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            isDisabled
              ? 'bg-canvas text-text-muted'
              : 'bg-accent/10 text-accent group-hover:bg-accent/20',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {isDisabled && (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Coming Soon
          </span>
        )}
      </div>
      <h3
        className={cn(
          'text-sm font-semibold',
          isDisabled ? 'text-text-tertiary' : 'text-text-primary',
        )}
      >
        {report.title}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
        {report.description}
      </p>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Report detail renderer
// ---------------------------------------------------------------------------

const ReportDetail: React.FC<{
  reportId: string;
  onBack: () => void;
}> = ({ reportId, onBack }) => {
  switch (reportId) {
    case 'network-summary':
      return <NetworkSummaryReport onBack={onBack} />;
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// ReportsPage
// ---------------------------------------------------------------------------

export const ReportsPage: React.FC = () => {
  const { reportId } = useParams<{ reportId?: string }>();
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const showRoadmap = useSettingsStore((s) => s.settings.general.showRoadmap);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | ReportCategory>(
    'all',
  );

  // Validate reportId and redirect if invalid
  const validReport = reportId
    ? REPORT_DEFINITIONS.find(
        (r) => r.id === reportId && r.status === 'available',
      )
    : undefined;

  // If reportId is set but invalid, redirect to /reports
  React.useEffect(() => {
    if (reportId && !validReport) {
      addToast({
        type: 'warning',
        title: 'Report not found',
        message: `The report "${reportId}" does not exist or is not yet available.`,
      });
      navigate('/reports', { replace: true });
    }
  }, [reportId, validReport, navigate, addToast]);

  // Filter reports
  const filteredReports = useMemo(() => {
    let reports = REPORT_DEFINITIONS;

    if (!showRoadmap) {
      reports = reports.filter((r) => r.status !== 'coming-soon');
    }

    if (activeCategory !== 'all') {
      reports = reports.filter((r) => r.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      reports = reports.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q),
      );
    }

    return reports;
  }, [activeCategory, searchQuery, showRoadmap]);

  const handleCardClick = useCallback(
    (id: string) => {
      navigate(`/reports/${id}`);
    },
    [navigate],
  );

  const handleBack = useCallback(() => {
    navigate('/reports');
  }, [navigate]);

  // ---------- Report detail view ----------

  if (validReport) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-canvas">
        <Header />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ReportDetail reportId={validReport.id} onBack={handleBack} />
        </div>
        <StatusBar />
      </div>
    );
  }

  // ---------- Card grid view ----------

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-text-secondary" />
            <h1 className="text-xl font-semibold text-text-primary" data-testid="reports-page">
              Network Reports
            </h1>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Category filter pills */}
          <div className="mb-6 flex gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeCategory === cat.id
                    ? 'bg-accent text-white'
                    : 'bg-tertiary text-text-secondary hover:bg-border hover:text-text-primary',
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Report grid */}
          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Server className="mb-3 h-8 w-8 text-text-muted" />
              <p className="text-sm text-text-secondary">
                No reports match your search.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onClick={() => handleCardClick(report.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <StatusBar />
    </div>
  );
};

export default ReportsPage;
