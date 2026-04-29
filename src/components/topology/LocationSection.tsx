import React, { useState } from 'react';
import { NodeLocation, InstallationType } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronRight, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocationPickerModal } from './LocationPickerModal';

interface LocationSectionProps {
  location?: NodeLocation;
  onUpdate: (location: NodeLocation) => void;
}

const installationTypes: { value: InstallationType; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'underground', label: 'Underground' },
  { value: 'aerial', label: 'Aerial' },
];

export const LocationSection: React.FC<LocationSectionProps> = ({
  location = {},
  onUpdate,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const handleLocationPicked = (lat: number, lng: number) => {
    onUpdate({
      ...location,
      latitude: lat,
      longitude: lng,
    });
  };

  const handleFieldUpdate = (field: keyof NodeLocation, value: string | number | undefined) => {
    const updatedLocation = { ...location, [field]: value };
    // Remove undefined or empty values
    if (value === undefined || value === '') {
      delete updatedLocation[field];
    }
    onUpdate(updatedLocation);
  };

  const hasLocationData = Boolean(
    location.latitude !== undefined ||
    location.longitude !== undefined ||
    location.address ||
    location.building ||
    location.floor ||
    location.room ||
    location.installationType
  );

  return (
    <div className="border-b border-border">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex w-full items-center justify-between p-5 text-left',
          'hover:bg-tertiary/50 transition-colors'
        )}
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-text-tertiary" />
          <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Location
          </span>
          {hasLocationData && (
            <span className="bg-accent/20 rounded-full px-2 py-0.5 text-[10px] font-medium text-accent">
              Set
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary" />
        )}
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="space-y-4 px-5 pb-5">
          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Latitude
              </label>
              <Input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={location.latitude ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleFieldUpdate('latitude', val ? parseFloat(val) : undefined);
                }}
                placeholder="-90 to 90"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Longitude
              </label>
              <Input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={location.longitude ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  handleFieldUpdate('longitude', val ? parseFloat(val) : undefined);
                }}
                placeholder="-180 to 180"
              />
            </div>
          </div>

          {/* Pick on Map button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowPicker(true)}
          >
            <Navigation className="mr-2 h-4 w-4" />
            Pick on Map
          </Button>

          {/* Address */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Address
            </label>
            <Input
              value={location.address ?? ''}
              onChange={(e) => handleFieldUpdate('address', e.target.value || undefined)}
              placeholder="Street address"
            />
          </div>

          {/* Building & Floor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Building
              </label>
              <Input
                value={location.building ?? ''}
                onChange={(e) => handleFieldUpdate('building', e.target.value || undefined)}
                placeholder="Building name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-secondary">
                Floor
              </label>
              <Input
                value={location.floor ?? ''}
                onChange={(e) => handleFieldUpdate('floor', e.target.value || undefined)}
                placeholder="e.g., 1, B1"
              />
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Room / Cabinet
            </label>
            <Input
              value={location.room ?? ''}
              onChange={(e) => handleFieldUpdate('room', e.target.value || undefined)}
              placeholder="Room or cabinet ID"
            />
          </div>

          {/* Installation Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Installation Type
            </label>
            <Select
              value={location.installationType ?? ''}
              onValueChange={(value) =>
                handleFieldUpdate('installationType', value as InstallationType || undefined)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {installationTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      <LocationPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        initialLocation={location}
        onSelect={handleLocationPicked}
      />
    </div>
  );
};
