import React, { useState, useCallback } from 'react';
import { Header, StatusBar } from '@/components/layout';
import { CapacityDashboard } from '@/components/capacity/CapacityDashboard';
import { WhatIfAnalysis } from '@/components/capacity/WhatIfAnalysis';
import { CapacityReport } from '@/components/capacity/CapacityReport';
import { LambdaAvailabilityStudy } from '@/components/capacity/LambdaAvailabilityStudy';
import { DefragmentationDashboard } from '@/components/capacity/DefragmentationDashboard';
import { CapacitySubNav, type CapacityTab } from '@/components/capacity/CapacitySubNav';
import { useNetworkStore } from '@/stores/networkStore';
import { useServiceStore } from '@/stores/serviceStore';
import { FlaskConical } from 'lucide-react';

export const CapacityPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CapacityTab>('dashboard');
  const [whatIfActive, setWhatIfActive] = useState(false);
  const topology = useNetworkStore((state) => state.topology);
  const services = useServiceStore((state) => state.services);

  const handleSimulationActive = useCallback((active: boolean) => {
    setWhatIfActive(active);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <Header />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-elevated px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold text-text-primary" data-testid="capacity-page">Capacity Planning</h1>

            <CapacitySubNav activeTab={activeTab} onTabChange={setActiveTab} />

            {/* Simulation Mode Badge */}
            {whatIfActive && (
              <span className="border-warning/30 bg-warning/10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-warning">
                <FlaskConical className="h-3 w-3" />
                Simulation Mode
              </span>
            )}

            {/* Summary stats */}
            <div className="flex items-center gap-3 text-sm">
              <span className="text-text-secondary">
                Nodes: <span className="font-medium text-text-primary">{topology.nodes.length}</span>
              </span>
              <span className="text-text-secondary">
                Edges: <span className="font-medium text-text-primary">{topology.edges.length}</span>
              </span>
              <span className="text-text-secondary">
                Services: <span className="font-medium text-text-primary">{services.length}</span>
              </span>
            </div>
          </div>

          <CapacityReport />
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' && <CapacityDashboard />}
          {activeTab === 'what-if' && (
            <WhatIfAnalysis onSimulationActive={handleSimulationActive} />
          )}
          {activeTab === 'lambda' && <LambdaAvailabilityStudy />}
          {activeTab === 'defrag' && <DefragmentationDashboard />}
        </div>
      </div>

      <StatusBar />
    </div>
  );
};

export default CapacityPage;
