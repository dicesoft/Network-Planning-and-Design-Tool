import React from 'react';
import { Header, StatusBar } from '@/components/layout';
import { ForecastPanel } from '@/components/forecast/ForecastPanel';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { TrendingUp } from 'lucide-react';

export const ForecastPage: React.FC = () => {
  const nodeCount = useNetworkStore((state) => state.topology.nodes.length);
  const edgeCount = useNetworkStore((state) => state.topology.edges.length);
  const serviceCount = useServiceStore((state) => state.services.length);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary" data-testid="forecast-page">
                Forecast
              </h1>
              <p className="text-xs text-text-secondary">
                Project future network capacity needs
              </p>
            </div>
          </div>

          {/* Summary stats */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-text-secondary">
              Nodes: <span className="font-medium text-text-primary">{nodeCount}</span>
            </span>
            <span className="text-text-secondary">
              Edges: <span className="font-medium text-text-primary">{edgeCount}</span>
            </span>
            <span className="text-text-secondary">
              Services: <span className="font-medium text-text-primary">{serviceCount}</span>
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <ForecastPanel />
        </div>
      </div>

      <StatusBar />
    </div>
  );
};

export default ForecastPage;
