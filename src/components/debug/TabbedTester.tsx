import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { AlgorithmTesterContent } from './AlgorithmTester';
import { EdgeTesterContent } from './EdgeTester';
import { ServiceTester } from './ServiceTester';
import { DataGenerator } from './DataGenerator';
import { SimulationTester } from './SimulationTester';
import { CapacityTester } from './CapacityTester';
import { ResourceMonitor } from './ResourceMonitor';
import { FuzzyMatchTesterContent } from './FuzzyMatchTester';

interface TabbedTesterProps {
  refreshKey?: number;
}

const tabTriggerClass =
  'flex-1 px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-text-primary';

export const TabbedTester: React.FC<TabbedTesterProps> = ({ refreshKey }) => {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-elevated">
      <Tabs.Root defaultValue="algorithm" className="flex h-full flex-col">
        {/* Tab List */}
        <Tabs.List className="flex shrink-0 border-b border-border">
          <Tabs.Trigger value="algorithm" className={tabTriggerClass}>
            Algorithm
          </Tabs.Trigger>
          <Tabs.Trigger value="edge" className={tabTriggerClass}>
            Edge
          </Tabs.Trigger>
          <Tabs.Trigger value="services" className={tabTriggerClass}>
            Services
          </Tabs.Trigger>
          <Tabs.Trigger value="datagen" className={tabTriggerClass}>
            Data Gen
          </Tabs.Trigger>
          <Tabs.Trigger value="simulation" className={tabTriggerClass}>
            Simulation
          </Tabs.Trigger>
          <Tabs.Trigger value="capacity" className={tabTriggerClass}>
            Capacity
          </Tabs.Trigger>
          <Tabs.Trigger value="resources" className={tabTriggerClass}>
            Resources
          </Tabs.Trigger>
          <Tabs.Trigger value="fuzzy" className={tabTriggerClass}>
            Fuzzy Match
          </Tabs.Trigger>
        </Tabs.List>

        {/* Tab Panels */}
        <Tabs.Content
          value="algorithm"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <AlgorithmTesterContent key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="edge"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <EdgeTesterContent key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="services"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ServiceTester key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="datagen"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <DataGenerator key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="simulation"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <SimulationTester key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="capacity"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <CapacityTester key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="resources"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <ResourceMonitor key={refreshKey} />
        </Tabs.Content>

        <Tabs.Content
          value="fuzzy"
          className="flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <FuzzyMatchTesterContent key={refreshKey} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};
