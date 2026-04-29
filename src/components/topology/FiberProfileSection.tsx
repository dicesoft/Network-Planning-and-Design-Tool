import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FiberProfileType,
  FiberParameters,
  FIBER_PROFILE_CONFIGS,
} from '@/types/network';
import {
  getEffectiveFiberParams,
  calculateSpanTotals,
  validateFiberParameters,
  getFiberProfileTypes,
} from '@/core/validation/fiberValidation';

interface FiberProfileSectionProps {
  fiberProfile?: FiberParameters;
  distance?: number;
  onChange: (profile: FiberParameters | undefined) => void;
  className?: string;
}

export const FiberProfileSection: React.FC<FiberProfileSectionProps> = ({
  fiberProfile,
  distance = 0,
  onChange,
  className,
}) => {
  const profileTypes = getFiberProfileTypes();

  // Get effective parameters and calculations
  const { effectiveParams, spanTotals, validation } = useMemo(() => {
    if (!fiberProfile) {
      return { effectiveParams: null, spanTotals: null, validation: null };
    }

    const effective = getEffectiveFiberParams(fiberProfile);
    const totals = distance > 0 ? calculateSpanTotals(effective, distance) : null;
    const valid = validateFiberParameters(fiberProfile);

    return { effectiveParams: effective, spanTotals: totals, validation: valid };
  }, [fiberProfile, distance]);

  // Get the current profile config for display
  const currentProfile = fiberProfile
    ? FIBER_PROFILE_CONFIGS[fiberProfile.profileType]
    : null;

  const handleProfileChange = (profileType: FiberProfileType) => {
    onChange({
      profileType,
      // Clear overrides when changing profile
      attenuationOverride: undefined,
      chromaticDispersionOverride: undefined,
      pmdOverride: undefined,
      effectiveAreaOverride: undefined,
      nonLinearIndexOverride: undefined,
    });
  };

  const handleClearProfile = () => {
    onChange(undefined);
  };

  const handleOverrideToggle = (
    field: keyof FiberParameters,
    defaultValue: number
  ) => {
    if (!fiberProfile) return;

    const currentValue = fiberProfile[field];
    onChange({
      ...fiberProfile,
      [field]: currentValue !== undefined ? undefined : defaultValue,
    });
  };

  const handleOverrideChange = (
    field: keyof FiberParameters,
    value: number
  ) => {
    if (!fiberProfile) return;
    onChange({
      ...fiberProfile,
      [field]: value,
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Profile Selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text-secondary">
          Fiber Profile
        </label>
        <Select
          value={fiberProfile?.profileType ?? ''}
          onValueChange={(value) => {
            if (value === '__clear__') {
              handleClearProfile();
            } else {
              handleProfileChange(value as FiberProfileType);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select fiber profile" />
          </SelectTrigger>
          <SelectContent>
            {profileTypes.map((type) => {
              const config = FIBER_PROFILE_CONFIGS[type];
              return (
                <SelectItem key={type} value={type}>
                  <div className="flex flex-col">
                    <span>{config.label}</span>
                    <span className="text-xs text-text-muted">
                      {config.description}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
            {fiberProfile && (
              <SelectItem value="__clear__" className="text-text-muted">
                Clear selection
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Profile Info and Parameters */}
      {currentProfile && effectiveParams && (
        <>
          {/* Profile Description */}
          <div className="rounded-lg bg-tertiary p-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div className="text-xs text-text-secondary">
                {currentProfile.description}
              </div>
            </div>
          </div>

          {/* Parameters with Overrides */}
          <div className="space-y-3">
            {/* Attenuation */}
            <ParameterRow
              label="Attenuation"
              unit="dB/km"
              defaultValue={currentProfile.attenuation}
              overrideValue={fiberProfile?.attenuationOverride}
              onToggle={() =>
                handleOverrideToggle(
                  'attenuationOverride',
                  currentProfile.attenuation
                )
              }
              onChange={(v) => handleOverrideChange('attenuationOverride', v)}
              step={0.01}
            />

            {/* Chromatic Dispersion */}
            <ParameterRow
              label="Chromatic Dispersion"
              unit="ps/(nm·km)"
              defaultValue={currentProfile.chromaticDispersion}
              overrideValue={fiberProfile?.chromaticDispersionOverride}
              onToggle={() =>
                handleOverrideToggle(
                  'chromaticDispersionOverride',
                  currentProfile.chromaticDispersion
                )
              }
              onChange={(v) =>
                handleOverrideChange('chromaticDispersionOverride', v)
              }
              step={0.1}
            />

            {/* PMD */}
            <ParameterRow
              label="PMD Coefficient"
              unit="ps/√km"
              defaultValue={currentProfile.pmd}
              overrideValue={fiberProfile?.pmdOverride}
              onToggle={() =>
                handleOverrideToggle('pmdOverride', currentProfile.pmd)
              }
              onChange={(v) => handleOverrideChange('pmdOverride', v)}
              step={0.01}
            />
          </div>

          {/* Validation Warnings */}
          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="space-y-2">
              {validation.errors.map((error, i) => (
                <div
                  key={`err-${i}`}
                  className="bg-danger/10 flex items-start gap-2 rounded-md p-2 text-xs text-danger"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
              {validation.warnings.map((warning, i) => (
                <div
                  key={`warn-${i}`}
                  className="bg-warning/10 flex items-start gap-2 rounded-md p-2 text-xs text-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Span Totals */}
          {spanTotals && distance > 0 && (
            <div className="bg-secondary rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Span Totals ({distance} km)
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-lg font-semibold text-text-primary">
                    {spanTotals.totalAttenuation.toFixed(2)}
                  </div>
                  <div className="text-xs text-text-muted">dB</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-text-primary">
                    {spanTotals.totalChromaticDispersion.toFixed(1)}
                  </div>
                  <div className="text-xs text-text-muted">ps/nm</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-text-primary">
                    {spanTotals.totalPMD.toFixed(3)}
                  </div>
                  <div className="text-xs text-text-muted">ps</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * Individual parameter row with override toggle
 */
interface ParameterRowProps {
  label: string;
  unit: string;
  defaultValue: number;
  overrideValue?: number;
  onToggle: () => void;
  onChange: (value: number) => void;
  step?: number;
}

const ParameterRow: React.FC<ParameterRowProps> = ({
  label,
  unit,
  defaultValue,
  overrideValue,
  onToggle,
  onChange,
  step = 0.1,
}) => {
  const isOverridden = overrideValue !== undefined;

  return (
    <div className="flex items-center gap-3">
      <div className="flex min-w-[140px] items-center gap-2">
        <Checkbox
          checked={isOverridden}
          onCheckedChange={onToggle}
          id={`override-${label}`}
        />
        <label
          htmlFor={`override-${label}`}
          className="cursor-pointer text-xs text-text-secondary"
        >
          {label}
        </label>
      </div>
      <div className="flex-1">
        {isOverridden ? (
          <Input
            type="number"
            value={overrideValue}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            step={step}
            className="h-8 text-sm"
          />
        ) : (
          <div className="flex h-8 items-center rounded-md bg-tertiary px-3 text-sm text-text-muted">
            {defaultValue}
          </div>
        )}
      </div>
      <div className="w-20 text-xs text-text-muted">{unit}</div>
    </div>
  );
};
