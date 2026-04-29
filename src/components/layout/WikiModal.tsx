import React, { useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  Layers,
  Network,
  Cable,
  Workflow,
  Keyboard,
  Download,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { KEYBOARD_SHORTCUTS } from '@/types/ui';
import { formatShortcutKey } from '@/lib/shortcutDispatcher';

interface WikiSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const wikiSections: WikiSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <BookOpen className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>
          Welcome to <strong>ATLAS Network Planning Suite</strong>. This tool helps you
          design, visualize, and plan optical network topologies.
        </p>
        <h4 className="font-semibold">Quick Start</h4>
        <ol className="ml-4 list-decimal space-y-2">
          <li>
            <strong>Add Nodes:</strong> Drag nodes from the sidebar palette onto the
            canvas, or double-click the canvas to add a node.
          </li>
          <li>
            <strong>Create Connections:</strong> Drag from a node&apos;s connection handle
            (colored dot) to another node to create an edge.
          </li>
          <li>
            <strong>Configure Properties:</strong> Click on any node or edge to open
            the Inspector panel and modify its properties.
          </li>
          <li>
            <strong>Create Services:</strong> Navigate to the Services tab to define
            optical services over your topology.
          </li>
        </ol>
      </div>
    ),
  },
  {
    id: 'node-types',
    title: 'Node Types',
    icon: <Layers className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>ATLAS supports various network equipment types:</p>
        <div className="space-y-3">
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-to-br from-blue-400 to-blue-600" />
              <strong>Router</strong>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              IP/MPLS routers for Layer 3 connectivity and traffic routing.
            </p>
          </div>
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-to-br from-purple-400 to-purple-600" />
              <strong>OADM</strong>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Optical Add-Drop Multiplexers for wavelength routing in DWDM networks.
            </p>
          </div>
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-to-br from-green-400 to-green-600" />
              <strong>Amplifier</strong>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Optical amplifiers (EDFA) to boost signal strength over long distances.
            </p>
          </div>
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-to-br from-orange-400 to-orange-600" />
              <strong>Terminal</strong>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Transponders and muxponders for client signal conversion.
            </p>
          </div>
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded bg-gradient-to-br from-red-400 to-red-600" />
              <strong>Switch</strong>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Ethernet switches for Layer 2 connectivity.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'connections',
    title: 'Creating Connections',
    icon: <Network className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>
          Edges represent physical fiber connections or logical links between nodes.
        </p>
        <h4 className="font-semibold">To Create an Edge</h4>
        <ol className="ml-4 list-decimal space-y-2">
          <li>Hover over a node to reveal its connection handles (colored dots).</li>
          <li>Click and drag from a handle to another node.</li>
          <li>Select the source and target ports in the dialog.</li>
          <li>Configure edge properties like distance and fiber type.</li>
        </ol>
        <h4 className="font-semibold">Edge Types</h4>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Fiber:</strong> Physical fiber optic cable
          </li>
          <li>
            <strong>Ethernet:</strong> Electrical Ethernet connection
          </li>
          <li>
            <strong>Virtual:</strong> Logical connection (e.g., tunnel)
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'ports',
    title: 'Port Configuration',
    icon: <Cable className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>
          Each node has configurable ports for connecting to other equipment.
        </p>
        <h4 className="font-semibold">Port Types</h4>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong>B/W (1310nm):</strong> Black & white ports for short-reach
            connections up to 10km. Single channel only.
          </li>
          <li>
            <strong>DWDM (1550nm):</strong> Dense Wavelength Division Multiplexing
            ports supporting up to 96 channels over long distances.
          </li>
        </ul>
        <h4 className="font-semibold">Data Rates</h4>
        <p className="text-sm">
          Ports support various data rates: 1G, 10G, 25G, 100G, and 400G.
        </p>
      </div>
    ),
  },
  {
    id: 'services',
    title: 'Service Creation',
    icon: <Workflow className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>Services define end-to-end connectivity over your network topology.</p>
        <h4 className="font-semibold">Service Types</h4>
        <ul className="ml-4 list-disc space-y-2">
          <li>
            <strong>L1 DWDM:</strong> Optical layer services with wavelength
            allocation, modulation selection, and path protection.
          </li>
          <li>
            <strong>L2/L3:</strong> IP-layer services that ride over L1 optical
            services as underlay.
          </li>
        </ul>
        <h4 className="font-semibold">Service Wizard</h4>
        <p className="text-sm">
          The Service Wizard guides you through: endpoint selection, parameter
          configuration, path computation, protection setup, and final review.
        </p>
      </div>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Keyboard Shortcuts',
    icon: <Keyboard className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(() => {
            const seen = new Set<string>();
            return KEYBOARD_SHORTCUTS
              .filter((s) => s.enabled)
              .filter((s) => {
                if (seen.has(s.action)) return false;
                seen.add(s.action);
                return true;
              })
              .map((shortcut) => (
                  <div key={shortcut.action} className="rounded bg-tertiary px-2 py-1">
                    <kbd className="mr-2 rounded bg-elevated px-1.5 py-0.5 font-mono text-xs">
                      {formatShortcutKey(shortcut)}
                    </kbd>
                    {shortcut.description}
                  </div>
              ));
          })()}
        </div>
        <h4 className="font-semibold">Mouse Controls</h4>
        <ul className="ml-4 list-disc space-y-1 text-sm">
          <li>Scroll to zoom in/out</li>
          <li>Middle-click drag to pan</li>
          <li>Shift+drag for box selection</li>
          <li>Ctrl+click to add to selection</li>
          <li>Double-click canvas to add node</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'import-export',
    title: 'Import/Export',
    icon: <Download className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <p>Your network topology can be imported and exported as JSON files.</p>
        <h4 className="font-semibold">Export</h4>
        <p className="text-sm">
          Click the download icon in the header to export your current topology.
          This creates a JSON file containing all nodes, edges, and their properties.
        </p>
        <h4 className="font-semibold">Import</h4>
        <p className="text-sm">
          Click the upload icon to import a previously exported topology file.
          This will replace your current topology.
        </p>
        <h4 className="font-semibold">Auto-Save</h4>
        <p className="text-sm">
          Changes are automatically saved to your browser&apos;s local storage.
          Export regularly to create backup files.
        </p>
      </div>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: <HelpCircle className="h-4 w-4" />,
    content: (
      <div className="space-y-4">
        <h4 className="font-semibold">Common Issues</h4>
        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <p className="font-medium">Cannot connect nodes</p>
            <p className="mt-1 text-sm text-text-secondary">
              Ensure both nodes have available ports of compatible types. B/W ports
              can only connect to B/W ports, and DWDM to DWDM.
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="font-medium">Service creation fails</p>
            <p className="mt-1 text-sm text-text-secondary">
              Check that your topology has a valid path between endpoints and that
              there are available channels on the edges.
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="font-medium">Canvas is slow</p>
            <p className="mt-1 text-sm text-text-secondary">
              Large topologies may impact performance. Try hiding the grid or
              zooming out to improve responsiveness.
            </p>
          </div>
        </div>
      </div>
    ),
  },
];

export const WikiModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const closeModal = useUIStore((state) => state.closeModal);
  const [activeSection, setActiveSection] = useState<string>('getting-started');

  const isOpen = activeModal === 'wiki';

  const currentSection = wikiSections.find((s) => s.id === activeSection);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-h-[80vh] sm:max-w-[800px]" data-testid="wiki-modal">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Help & Documentation
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[500px] gap-4 overflow-hidden">
          {/* Sidebar Navigation */}
          <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r border-border pr-4">
            {wikiSections.map((section) => (
              <Button
                key={section.id}
                variant="ghost"
                size="sm"
                className={cn(
                  'w-full justify-start gap-2',
                  activeSection === section.id && 'bg-tertiary text-text-primary'
                )}
                onClick={() => setActiveSection(section.id)}
              >
                {section.icon}
                <span className="truncate">{section.title}</span>
                {activeSection === section.id && (
                  <ChevronRight className="ml-auto h-3 w-3" />
                )}
              </Button>
            ))}
          </nav>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto pr-2">
            {currentSection && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  {currentSection.icon}
                  {currentSection.title}
                </h2>
                <div className="text-sm text-text-secondary">
                  {currentSection.content}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
