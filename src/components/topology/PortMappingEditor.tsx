import React, { useState, useMemo } from 'react';
import { Port, PortMapping } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortMappingEditorProps {
  ports: Port[];
  mappings: PortMapping[];
  isSplitter?: boolean;
  onUpdate: (mappings: PortMapping[]) => void;
}

export const PortMappingEditor: React.FC<PortMappingEditorProps> = ({
  ports,
  mappings,
  isSplitter = false,
  onUpdate,
}) => {
  const [selectedInput, setSelectedInput] = useState<string | null>(null);

  // Get input ports (typically "In" ports) and output ports
  const inputPorts = useMemo(
    () => ports.filter((p) => p.name.toLowerCase().includes('in')),
    [ports]
  );
  const outputPorts = useMemo(
    () => ports.filter((p) => p.name.toLowerCase().includes('out')),
    [ports]
  );

  // Find existing mapping for an input port
  const getMappingForInput = (inputPortId: string): PortMapping | undefined => {
    return mappings.find((m) => m.inputPortId === inputPortId);
  };

  // Check if an output port is already mapped
  const isOutputMapped = (outputPortId: string): boolean => {
    return mappings.some((m) => m.outputPortIds.includes(outputPortId));
  };

  // Get the input port ID that maps to a given output
  const getInputForOutput = (outputPortId: string): string | undefined => {
    const mapping = mappings.find((m) => m.outputPortIds.includes(outputPortId));
    return mapping?.inputPortId;
  };

  // Handle clicking on an input port
  const handleInputClick = (portId: string) => {
    if (selectedInput === portId) {
      setSelectedInput(null);
    } else {
      setSelectedInput(portId);
    }
  };

  // Handle clicking on an output port
  const handleOutputClick = (outputPortId: string) => {
    if (!selectedInput) return;

    const inputPort = ports.find((p) => p.id === selectedInput);
    const outputPort = ports.find((p) => p.id === outputPortId);

    // Validate port types match
    if (!inputPort || !outputPort || inputPort.type !== outputPort.type) {
      return;
    }

    const existingMapping = getMappingForInput(selectedInput);

    if (isSplitter) {
      // For splitters: allow one input to map to multiple outputs
      if (existingMapping) {
        if (existingMapping.outputPortIds.includes(outputPortId)) {
          // Remove this output from the mapping
          const newOutputs = existingMapping.outputPortIds.filter((id) => id !== outputPortId);
          if (newOutputs.length === 0) {
            // Remove entire mapping if no outputs left
            onUpdate(mappings.filter((m) => m.inputPortId !== selectedInput));
          } else {
            onUpdate(
              mappings.map((m) =>
                m.inputPortId === selectedInput ? { ...m, outputPortIds: newOutputs } : m
              )
            );
          }
        } else {
          // Add this output to existing mapping
          onUpdate(
            mappings.map((m) =>
              m.inputPortId === selectedInput
                ? { ...m, outputPortIds: [...m.outputPortIds, outputPortId] }
                : m
            )
          );
        }
      } else {
        // Create new mapping
        onUpdate([...mappings, { inputPortId: selectedInput, outputPortIds: [outputPortId] }]);
      }
    } else {
      // For pass-through: one-to-one mapping only
      if (existingMapping) {
        if (existingMapping.outputPortIds.includes(outputPortId)) {
          // Remove mapping
          onUpdate(mappings.filter((m) => m.inputPortId !== selectedInput));
        } else {
          // Replace mapping
          onUpdate(
            mappings.map((m) =>
              m.inputPortId === selectedInput ? { ...m, outputPortIds: [outputPortId] } : m
            )
          );
        }
      } else {
        // Check if this output is already mapped
        if (isOutputMapped(outputPortId)) {
          // Remove existing mapping to this output
          const newMappings = mappings.filter((m) => !m.outputPortIds.includes(outputPortId));
          onUpdate([...newMappings, { inputPortId: selectedInput, outputPortIds: [outputPortId] }]);
        } else {
          // Create new mapping
          onUpdate([...mappings, { inputPortId: selectedInput, outputPortIds: [outputPortId] }]);
        }
      }
    }

    // Clear selection after action
    if (!isSplitter) {
      setSelectedInput(null);
    }
  };

  // Clear all mappings
  const handleClearAll = () => {
    onUpdate([]);
    setSelectedInput(null);
  };

  // Auto-map by name pattern (In-1 -> Out-1, etc.)
  const handleAutoMap = () => {
    const newMappings: PortMapping[] = [];

    inputPorts.forEach((inputPort) => {
      // Try to find matching output port by name pattern
      const inputSuffix = inputPort.name.replace(/.*-?(in|In|IN)/i, '');
      const matchingOutput = outputPorts.find((outPort) => {
        const outputSuffix = outPort.name.replace(/.*-?(out|Out|OUT)/i, '');
        return inputSuffix === outputSuffix && inputPort.type === outPort.type;
      });

      // Or match by port type only if no name match
      const typeMatchOutput =
        matchingOutput ||
        outputPorts.find(
          (outPort) =>
            outPort.type === inputPort.type &&
            !newMappings.some((m) => m.outputPortIds.includes(outPort.id))
        );

      if (typeMatchOutput) {
        newMappings.push({
          inputPortId: inputPort.id,
          outputPortIds: [typeMatchOutput.id],
        });
      }
    });

    onUpdate(newMappings);
  };

  const renderPortButton = (
    port: Port,
    isInput: boolean,
    isSelected: boolean,
    isMapped: boolean
  ) => {
    const connectedInputId = !isInput ? getInputForOutput(port.id) : undefined;
    const connectedInput = connectedInputId
      ? ports.find((p) => p.id === connectedInputId)
      : undefined;

    return (
      <button
        key={port.id}
        onClick={() => (isInput ? handleInputClick(port.id) : handleOutputClick(port.id))}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all',
          'border',
          isSelected && 'ring-2 ring-accent border-accent bg-accent/10',
          isMapped && !isSelected && 'border-success/50 bg-success/10',
          !isSelected && !isMapped && 'border-border bg-tertiary hover:border-accent/50',
          port.type === 'dwdm' ? 'text-purple-400' : 'text-blue-400',
          !isInput && selectedInput && 'cursor-pointer hover:border-accent'
        )}
        disabled={!isInput && !selectedInput}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            port.type === 'dwdm' ? 'bg-purple-400' : 'bg-blue-400'
          )}
        />
        <span className="font-medium">{port.name}</span>
        {!isInput && connectedInput && (
          <span className="ml-auto text-xs text-text-muted">
            ← {connectedInput.name}
          </span>
        )}
      </button>
    );
  };

  if (ports.length === 0) {
    return (
      <div className="py-4 text-center text-sm italic text-text-muted">
        No ports configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="border-info/30 bg-info/10 flex items-start gap-2 rounded-lg border p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="text-xs text-text-secondary">
          {isSplitter ? (
            <>
              <strong>Splitter mode:</strong> Click an input port, then click multiple output
              ports to create a 1:N mapping.
            </>
          ) : (
            <>
              <strong>Pass-through mode:</strong> Click an input port, then click an output port
              to create a 1:1 mapping.
            </>
          )}
        </div>
      </div>

      {/* Port Mapping Visualization */}
      <div className="flex items-start justify-between gap-4">
        {/* Input Ports */}
        <div className="flex-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Input Ports
          </div>
          <div className="space-y-2">
            {inputPorts.length > 0 ? (
              inputPorts.map((port) =>
                renderPortButton(
                  port,
                  true,
                  selectedInput === port.id,
                  Boolean(getMappingForInput(port.id))
                )
              )
            ) : (
              <div className="text-xs italic text-text-muted">No input ports</div>
            )}
          </div>
        </div>

        {/* Arrow Indicator */}
        <div className="flex flex-col items-center justify-center pt-8">
          <ArrowRight className="h-6 w-6 text-text-muted" />
        </div>

        {/* Output Ports */}
        <div className="flex-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Output Ports
          </div>
          <div className="space-y-2">
            {outputPorts.length > 0 ? (
              outputPorts.map((port) =>
                renderPortButton(
                  port,
                  false,
                  false,
                  isOutputMapped(port.id)
                )
              )
            ) : (
              <div className="text-xs italic text-text-muted">No output ports</div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleAutoMap} className="flex-1">
          <Plus className="mr-1 h-3 w-3" />
          Auto Map
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearAll}
          className="flex-1"
          disabled={mappings.length === 0}
        >
          <X className="mr-1 h-3 w-3" />
          Clear All
        </Button>
      </div>

      {/* Mapping Summary */}
      {mappings.length > 0 && (
        <div className="bg-tertiary/50 rounded-lg border border-border p-3">
          <div className="mb-2 text-xs font-semibold text-text-tertiary">
            Active Mappings ({mappings.length})
          </div>
          <div className="space-y-1">
            {mappings.map((mapping) => {
              const inputPort = ports.find((p) => p.id === mapping.inputPortId);
              const outputPorts = mapping.outputPortIds
                .map((id) => ports.find((p) => p.id === id))
                .filter(Boolean);

              return (
                <div key={mapping.inputPortId} className="flex items-center text-xs">
                  <span className="font-medium text-text-primary">
                    {inputPort?.name || 'Unknown'}
                  </span>
                  <ArrowRight className="mx-2 h-3 w-3 text-text-muted" />
                  <span className="text-text-secondary">
                    {outputPorts.map((p) => p?.name).join(', ') || 'None'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
