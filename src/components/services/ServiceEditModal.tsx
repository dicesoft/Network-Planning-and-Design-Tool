/**
 * ServiceEditModal - Modal for editing service properties after creation
 *
 * Supports editing:
 * - Service name
 * - Data rate
 * - Protection scheme
 * - Modulation type (L1 only)
 * - BFD configuration (L2/L3 only)
 */

import React, { useState, useEffect } from 'react';
import { useServiceStore } from '@/stores/serviceStore';
import { useUIStore } from '@/stores/uiStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  isL1DWDMService,
  isL2L3Service,
  L1DWDMService,
  L2L3Service,
  L1DataRate,
  ModulationType,
  ProtectionScheme,
  IPProtectionScheme,
  L1_DATA_RATE_CONFIGS,
  MODULATION_TYPE_CONFIGS,
  PROTECTION_SCHEME_CONFIGS,
  IP_PROTECTION_SCHEME_CONFIGS,
  SERVICE_TYPE_CONFIGS,
} from '@/types/service';
import { Save, X } from 'lucide-react';

export const ServiceEditModal: React.FC = () => {
  const activeModal = useUIStore((state) => state.activeModal);
  const modalData = useUIStore((state) => state.modalData);
  const closeModal = useUIStore((state) => state.closeModal);
  const addToast = useUIStore((state) => state.addToast);

  const getService = useServiceStore((state) => state.getService);
  const updateService = useServiceStore((state) => state.updateService);

  // Get service ID from modal data
  const serviceId = activeModal === 'edit-service' ? (modalData?.serviceId as string) : null;
  const service = serviceId ? getService(serviceId) : null;

  // Form state
  const [name, setName] = useState('');
  const [dataRate, setDataRate] = useState<L1DataRate>('100G');
  const [modulationType, setModulationType] = useState<ModulationType>('DP-QPSK');
  const [protectionScheme, setProtectionScheme] = useState<ProtectionScheme | IPProtectionScheme>('none');
  const [bfdEnabled, setBfdEnabled] = useState(false);

  // Initialize form when service changes
  useEffect(() => {
    if (service) {
      setName(service.name);
      setDataRate(service.dataRate);

      if (isL1DWDMService(service)) {
        const l1 = service as L1DWDMService;
        setModulationType(l1.modulationType);
        setProtectionScheme(l1.protectionScheme);
      } else if (isL2L3Service(service)) {
        const l2l3 = service as L2L3Service;
        setProtectionScheme(l2l3.protectionScheme);
        setBfdEnabled(l2l3.bfdConfig?.enabled ?? false);
      }
    }
  }, [service]);

  if (activeModal !== 'edit-service' || !service) {
    return null;
  }

  const isL1 = isL1DWDMService(service);
  const isL2L3 = isL2L3Service(service);
  const typeConfig = SERVICE_TYPE_CONFIGS[service.type];

  const handleSave = () => {
    if (!serviceId) return;

    const updates: Partial<L1DWDMService | L2L3Service> = {
      name,
      dataRate,
    };

    if (isL1) {
      (updates as Partial<L1DWDMService>).modulationType = modulationType;
      (updates as Partial<L1DWDMService>).protectionScheme = protectionScheme as ProtectionScheme;
    } else if (isL2L3) {
      (updates as Partial<L2L3Service>).protectionScheme = protectionScheme as IPProtectionScheme;
      (updates as Partial<L2L3Service>).bfdConfig = {
        ...(service as L2L3Service).bfdConfig,
        enabled: bfdEnabled,
      };
    }

    updateService(serviceId, updates);

    addToast({
      type: 'success',
      title: 'Service Updated',
      message: `${name || service.id} has been updated`,
      duration: 3000,
    });

    closeModal();
  };

  const handleClose = () => {
    closeModal();
  };

  return (
    <Dialog open={activeModal === 'edit-service'} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ backgroundColor: typeConfig.color }}
            >
              {typeConfig.shortLabel}
            </div>
            Edit Service
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Service ID (read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">Service ID</label>
            <Input value={service.id} disabled className="bg-secondary/50" />
          </div>

          {/* Service Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-text-primary">Service Name</label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter service name"
            />
          </div>

          {/* Data Rate */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary">Data Rate</label>
            <Select value={dataRate} onValueChange={(v) => setDataRate(v as L1DataRate)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(L1_DATA_RATE_CONFIGS) as L1DataRate[]).map((rate) => (
                  <SelectItem key={rate} value={rate}>
                    {L1_DATA_RATE_CONFIGS[rate].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* L1-specific fields */}
          {isL1 && (
            <>
              {/* Modulation Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Modulation Type</label>
                <Select
                  value={modulationType}
                  onValueChange={(v) => setModulationType(v as ModulationType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODULATION_TYPE_CONFIGS) as ModulationType[]).map((mod) => (
                      <SelectItem key={mod} value={mod}>
                        {MODULATION_TYPE_CONFIGS[mod].label} ({MODULATION_TYPE_CONFIGS[mod].reach})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* L1 Protection Scheme */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Protection Scheme</label>
                <Select
                  value={protectionScheme}
                  onValueChange={(v) => setProtectionScheme(v as ProtectionScheme)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PROTECTION_SCHEME_CONFIGS) as ProtectionScheme[]).map((scheme) => (
                      <SelectItem key={scheme} value={scheme}>
                        {PROTECTION_SCHEME_CONFIGS[scheme].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* L2/L3-specific fields */}
          {isL2L3 && (
            <>
              {/* IP Protection Scheme */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Protection Scheme</label>
                <Select
                  value={protectionScheme}
                  onValueChange={(v) => setProtectionScheme(v as IPProtectionScheme)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(IP_PROTECTION_SCHEME_CONFIGS) as IPProtectionScheme[]).map((scheme) => (
                      <SelectItem key={scheme} value={scheme}>
                        {IP_PROTECTION_SCHEME_CONFIGS[scheme].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* BFD Enable/Disable */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="bfd-enabled"
                  checked={bfdEnabled}
                  onCheckedChange={(checked) => setBfdEnabled(!!checked)}
                />
                <label htmlFor="bfd-enabled" className="cursor-pointer text-sm font-medium text-text-primary">
                  Enable Bidirectional Forwarding Detection (BFD)
                </label>
              </div>
            </>
          )}

          {/* Info about path editing */}
          <div className="rounded border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-400">
            Path editing is not available in this dialog. To change paths, create a new service.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ServiceEditModal;
