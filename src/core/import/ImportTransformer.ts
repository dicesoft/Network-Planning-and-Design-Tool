/**
 * Import Transformer — CSV value transformers for mapping external data to internal types.
 *
 * Each transformer converts a raw CSV string value to the corresponding
 * internal ATLAS type. Case-insensitive matching with common aliases.
 */

import type { NodeType, VendorType, FiberProfileType } from '@/types/network';
import type { ServiceType, ProtectionScheme } from '@/types/service';

/** Map of Huawei NE types and common aliases to internal NodeType */
const NODE_TYPE_MAP: Record<string, NodeType> = {
  // OADM variants
  'oadm': 'oadm',
  'roadm': 'oadm',
  'dwdm': 'oadm',
  'optix': 'oadm',
  'ola': 'oadm',
  'wss': 'oadm',
  // Router variants
  'router': 'router',
  'ne40e': 'router',
  'ne8000': 'router',
  'atn': 'router',
  'netengine': 'router',
  'pe': 'router',
  'p': 'router',
  'ce': 'router',
  // Switch variants
  'switch': 'switch',
  'ce6800': 'switch',
  'ce12800': 'switch',
  's6700': 'switch',
  // Amplifier variants
  'amplifier': 'amplifier',
  'edfa': 'amplifier',
  'raman': 'amplifier',
  'ila': 'amplifier',
  'amp': 'amplifier',
  // Terminal variants
  'terminal': 'terminal',
  'otn': 'terminal',
  'muxponder': 'terminal',
  'transponder': 'terminal',
  // OSP termination variants
  'osp-termination': 'osp-termination',
  'osp': 'osp-termination',
  'splice': 'osp-termination',
  'fdf': 'osp-termination',
  // Custom
  'custom': 'custom',
  'other': 'custom',
  'unknown': 'custom',
};

/** Map of vendor name aliases to internal VendorType */
const VENDOR_MAP: Record<string, VendorType> = {
  'huawei': 'huawei',
  'hw': 'huawei',
  'nokia': 'nokia',
  'alu': 'nokia',
  'alcatel': 'nokia',
  'alcatel-lucent': 'nokia',
  'cisco': 'cisco',
  'juniper': 'juniper',
  'jnpr': 'juniper',
  'ciena': 'ciena',
  'generic': 'generic',
  'other': 'generic',
  '': 'generic',
};

/** Map of fiber profile aliases to internal FiberProfileType */
const FIBER_PROFILE_MAP: Record<string, FiberProfileType> = {
  'g.652.d': 'G.652.D',
  'g652d': 'G.652.D',
  'g.652': 'G.652.D',
  'smf': 'G.652.D',
  'g.654.e': 'G.654.E',
  'g654e': 'G.654.E',
  'g.654': 'G.654.E',
  'g.655': 'G.655',
  'g655': 'G.655',
  'nzdsf': 'G.655',
  'g.657.a1': 'G.657.A1',
  'g657a1': 'G.657.A1',
  'g.657': 'G.657.A1',
  'custom': 'custom',
};

/** Map of service type aliases to internal ServiceType */
const SERVICE_TYPE_MAP: Record<string, ServiceType> = {
  'l1-dwdm': 'l1-dwdm',
  'l1': 'l1-dwdm',
  'dwdm': 'l1-dwdm',
  'optical': 'l1-dwdm',
  'lambda': 'l1-dwdm',
  'och': 'l1-dwdm',
  'l2-ethernet': 'l2-ethernet',
  'l2': 'l2-ethernet',
  'ethernet': 'l2-ethernet',
  'eth': 'l2-ethernet',
  'epline': 'l2-ethernet',
  'l3-ip': 'l3-ip',
  'l3': 'l3-ip',
  'ip': 'l3-ip',
  'ipvpn': 'l3-ip',
  'l3vpn': 'l3-ip',
};

/** Map of protection scheme aliases to internal ProtectionScheme */
const PROTECTION_SCHEME_MAP: Record<string, ProtectionScheme> = {
  'none': 'none',
  'unprotected': 'none',
  '': 'none',
  'olp': 'olp',
  '1+1': 'olp',
  '1:1': 'olp',
  'sncp': 'sncp',
  'wson-restoration': 'wson-restoration',
  'wson': 'wson-restoration',
  'restoration': 'wson-restoration',
  '1+1+wson': '1+1+wson',
  'olp+wson': '1+1+wson',
};

/** Service role — identifies working or protection leg */
export type ServiceRole = 'working' | 'protection';

/** Map of service role aliases to internal ServiceRole */
const SERVICE_ROLE_MAP: Record<string, ServiceRole> = {
  'working': 'working',
  'work': 'working',
  'primary': 'working',
  'main': 'working',
  'w': 'working',
  'protection': 'protection',
  'protect': 'protection',
  'backup': 'protection',
  'secondary': 'protection',
  'p': 'protection',
};

/**
 * Registry of named value transformers.
 * Each function takes a raw CSV string and returns the transformed value.
 * Returns undefined/null if the value cannot be mapped.
 */
export const VALUE_TRANSFORMERS: Record<string, (value: string) => unknown> = {
  /** Map external NE types to internal NodeType */
  toNodeType: (v: string): NodeType | undefined => {
    const normalized = v.toLowerCase().trim();
    return NODE_TYPE_MAP[normalized];
  },

  /** Normalize vendor names */
  toVendor: (v: string): VendorType => {
    const normalized = v.toLowerCase().trim();
    return VENDOR_MAP[normalized] ?? 'generic';
  },

  /** Map fiber profile strings */
  toFiberProfile: (v: string): FiberProfileType => {
    const normalized = v.toLowerCase().trim().replace(/\s+/g, '');
    return FIBER_PROFILE_MAP[normalized] ?? 'G.652.D';
  },

  /** Parse numeric values */
  toNumber: (v: string): number | undefined => {
    const num = parseFloat(v);
    return isNaN(num) ? undefined : num;
  },

  /** Split SRLG codes by common delimiters */
  toSrlgArray: (v: string): string[] => {
    if (!v || v.trim() === '') return [];
    return v
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  },

  /** Parse fiber count */
  toFiberCount: (v: string): number => {
    const num = parseInt(v, 10);
    return isNaN(num) || num < 1 ? 1 : num;
  },

  /** Map external service type strings to internal ServiceType */
  toServiceType: (v: string): ServiceType | undefined => {
    const normalized = v.toLowerCase().trim();
    return SERVICE_TYPE_MAP[normalized];
  },

  /** Map external protection scheme strings to internal ProtectionScheme */
  toProtectionScheme: (v: string): ProtectionScheme => {
    const normalized = v.toLowerCase().trim();
    return PROTECTION_SCHEME_MAP[normalized] ?? 'none';
  },

  /** Map external service role strings to internal ServiceRole */
  toServiceRole: (v: string): ServiceRole => {
    const normalized = v.toLowerCase().trim();
    return SERVICE_ROLE_MAP[normalized] ?? 'working';
  },

  /** Parse lambda frequency in THz (C-band range 191.0-197.0) */
  toFrequency: (v: string): number | undefined => {
    const num = parseFloat(v);
    if (isNaN(num) || num < 191.0 || num > 197.0) return undefined;
    return num;
  },

  /** Map port type strings to internal PortType ('dwdm' or 'bw') */
  toPortType: (v: string): 'dwdm' | 'bw' => {
    const normalized = v.toLowerCase().trim();
    if (normalized === 'dwdm' || normalized === 'wdm' || normalized === 'lambda' || normalized === 'optical') return 'dwdm';
    return 'bw';
  },

  /**
   * Parse a channel list string like "1,2,5,12-18" into a sorted, deduplicated array of channel numbers.
   * Supports comma-separated integers and dash ranges. Validates range 1-96.
   */
  toChannelList: (v: string): number[] => {
    if (!v || v.trim() === '') return [];

    const result = new Set<number>();
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-').map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const lo = Math.max(1, Math.min(start, end));
          const hi = Math.min(96, Math.max(start, end));
          for (let i = lo; i <= hi; i++) {
            result.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num >= 1 && num <= 96) {
          result.add(num);
        }
      }
    }

    return Array.from(result).sort((a, b) => a - b);
  },
};
