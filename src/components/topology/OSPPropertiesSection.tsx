import React from 'react';
import {
  OSPTerminationType,
  OSPTerminationProperties,
  SplitterRatio,
  OSP_TERMINATION_TYPE_CONFIGS,
  SPLITTER_LOSS_TABLE,
  DEFAULT_OSP_PROPERTIES,
} from '@/types';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OSPPropertiesSectionProps {
  properties?: OSPTerminationProperties;
  onUpdate: (properties: OSPTerminationProperties) => void;
}

const ospTypes: OSPTerminationType[] = [
  'splice-closure',
  'fdf',
  'patch-panel',
  'handhole',
  'manhole',
  'splitter',
  'generic',
];

const splitterRatios: SplitterRatio[] = ['1:2', '1:4', '1:8', '1:16', '1:32', '1:64'];

// Typical insertion loss ranges for validation hints
const INSERTION_LOSS_HINTS: Record<OSPTerminationType, { typical: string; warning: number }> = {
  'splice-closure': { typical: '0.02 - 0.1 dB', warning: 0.15 },
  'fdf': { typical: '0.3 - 1.0 dB', warning: 1.5 },
  'patch-panel': { typical: '0.3 - 0.7 dB', warning: 1.0 },
  'handhole': { typical: '0.1 - 0.5 dB', warning: 0.75 },
  'manhole': { typical: '0.1 - 0.5 dB', warning: 0.75 },
  'splitter': { typical: 'Based on ratio', warning: 25 },
  'generic': { typical: '0.1 - 1.0 dB', warning: 2.0 },
};

export const OSPPropertiesSection: React.FC<OSPPropertiesSectionProps> = ({
  properties,
  onUpdate,
}) => {
  // Initialize with defaults if not set
  const currentProps: OSPTerminationProperties = properties || {
    terminationType: 'generic',
    insertionLoss: 0.3,
  };

  const handleTypeChange = (newType: OSPTerminationType) => {
    const defaults = DEFAULT_OSP_PROPERTIES[newType];
    onUpdate({
      ...currentProps,
      ...defaults,
      terminationType: newType,
    });
  };

  const handleFieldUpdate = <K extends keyof OSPTerminationProperties>(
    field: K,
    value: OSPTerminationProperties[K]
  ) => {
    onUpdate({ ...currentProps, [field]: value });
  };

  const handleSplitterRatioChange = (ratio: SplitterRatio) => {
    const splitterLoss = SPLITTER_LOSS_TABLE[ratio];
    onUpdate({
      ...currentProps,
      insertionLoss: splitterLoss,
      splitterConfig: {
        splitRatio: ratio,
        splitterLoss: splitterLoss,
      },
    });
  };

  const handleSplitterLossOverride = (loss: number) => {
    if (currentProps.splitterConfig) {
      onUpdate({
        ...currentProps,
        insertionLoss: loss,
        splitterConfig: {
          ...currentProps.splitterConfig,
          splitterLoss: loss,
        },
      });
    }
  };

  const typeConfig = OSP_TERMINATION_TYPE_CONFIGS[currentProps.terminationType];
  const lossHint = INSERTION_LOSS_HINTS[currentProps.terminationType];
  const isHighLoss = currentProps.insertionLoss > lossHint.warning;
  const isSplitter = currentProps.terminationType === 'splitter';

  return (
    <div className="border-b border-border p-5">
      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        OSP Properties
      </div>

      <div className="space-y-4">
        {/* Termination Type */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Termination Type
          </label>
          <Select
            value={currentProps.terminationType}
            onValueChange={(value) => handleTypeChange(value as OSPTerminationType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ospTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {OSP_TERMINATION_TYPE_CONFIGS[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-text-muted">{typeConfig.description}</p>
        </div>

        {/* Splitter Configuration (only for splitter type) */}
        {isSplitter && (
          <div className="bg-tertiary/50 space-y-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <Info className="h-4 w-4 text-accent" />
              Splitter Configuration
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Split Ratio
              </label>
              <Select
                value={currentProps.splitterConfig?.splitRatio || '1:2'}
                onValueChange={(value) => handleSplitterRatioChange(value as SplitterRatio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {splitterRatios.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio} (typical: {SPLITTER_LOSS_TABLE[ratio]} dB)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Splitter Loss (dB)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="30"
                value={currentProps.splitterConfig?.splitterLoss ?? SPLITTER_LOSS_TABLE['1:2']}
                onChange={(e) => handleSplitterLossOverride(parseFloat(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-text-muted">
                Typical for {currentProps.splitterConfig?.splitRatio || '1:2'}:{' '}
                {SPLITTER_LOSS_TABLE[currentProps.splitterConfig?.splitRatio || '1:2']} dB
              </p>
            </div>
          </div>
        )}

        {/* Insertion Loss (non-splitter types) */}
        {!isSplitter && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Insertion Loss (dB)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="10"
              value={currentProps.insertionLoss}
              onChange={(e) =>
                handleFieldUpdate('insertionLoss', parseFloat(e.target.value) || 0)
              }
            />
            <div className="mt-1 flex items-center gap-1">
              {isHighLoss ? (
                <>
                  <AlertCircle className="h-3 w-3 text-warning" />
                  <span className="text-xs text-warning">
                    Higher than typical ({lossHint.typical})
                  </span>
                </>
              ) : (
                <span className="text-xs text-text-muted">Typical: {lossHint.typical}</span>
              )}
            </div>
          </div>
        )}

        {/* Reflectance */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Reflectance (dB)
          </label>
          <Input
            type="number"
            step="1"
            min="-70"
            max="-20"
            value={currentProps.reflectance ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              handleFieldUpdate('reflectance', val ? parseFloat(val) : undefined);
            }}
            placeholder="-40 to -60 typical"
          />
          <p className="mt-1 text-xs text-text-muted">
            Negative value (e.g., -50 dB). Lower is better.
          </p>
        </div>

        {/* Fiber Count */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text-secondary">
            Fiber Count
          </label>
          <Input
            type="number"
            step="1"
            min="1"
            max="288"
            value={currentProps.fiberCount ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              handleFieldUpdate('fiberCount', val ? parseInt(val) : undefined);
            }}
            placeholder="Number of fiber pairs"
          />
        </div>

        {/* Weatherproof Checkbox */}
        <div className="flex items-center gap-3">
          <Checkbox
            id="weatherproof"
            checked={currentProps.isWeatherproof ?? false}
            onCheckedChange={(checked) =>
              handleFieldUpdate('isWeatherproof', checked === true)
            }
          />
          <label
            htmlFor="weatherproof"
            className={cn(
              'text-sm font-medium cursor-pointer',
              currentProps.isWeatherproof ? 'text-text-primary' : 'text-text-secondary'
            )}
          >
            Weatherproof / Outdoor Rated
          </label>
        </div>
      </div>
    </div>
  );
};
