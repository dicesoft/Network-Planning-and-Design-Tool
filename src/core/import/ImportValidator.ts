/**
 * Import Validator — Row-level validation for imported CSV data.
 *
 * Validates:
 * - Required field presence
 * - Coordinate ranges (lat: -90..90, lng: -180..180)
 * - Node type mapping validity
 * - String length limits
 * - Numeric field validity
 */

import type { ColumnMapping, ImportRowValidation } from '@/types/import';
import type { ServiceType } from '@/types/service';
import { VALUE_TRANSFORMERS } from './ImportTransformer';
import { frequencyToChannelNumber, channelNumberToFrequency, ituToUserChannel, userToItuChannel } from '@/core/spectrum/channelConfig';

/** Maximum string length for imported text fields */
const MAX_STRING_LENGTH = 256;

/** Maximum name length */
const MAX_NAME_LENGTH = 128;

/**
 * Validate a single row against a template's column definitions.
 *
 * @param row - Parsed CSV row as key-value record
 * @param columns - Template column definitions
 * @param rowNumber - 1-based row number for error messages
 * @returns Validation result with errors and warnings
 */
export function validateRow(
  row: Record<string, string>,
  columns: ColumnMapping[],
  rowNumber: number,
): ImportRowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const col of columns) {
    const value = row[col.csvColumn.toLowerCase()];
    const hasValue = value !== undefined && value.trim() !== '';

    // Required field check
    if (col.required && !hasValue) {
      if (col.defaultValue !== undefined) {
        // Has default — just warn
        warnings.push(`Row ${rowNumber}: Missing "${col.csvColumn}", using default "${col.defaultValue}"`);
      } else {
        errors.push(`Row ${rowNumber}: Missing required field "${col.csvColumn}"`);
      }
      continue;
    }

    if (!hasValue) continue;

    const trimmed = value.trim();

    // String length validation
    if (trimmed.length > MAX_STRING_LENGTH) {
      errors.push(`Row ${rowNumber}: "${col.csvColumn}" exceeds ${MAX_STRING_LENGTH} characters`);
    }

    // Name-specific length validation
    if (col.targetField === 'name' && trimmed.length > MAX_NAME_LENGTH) {
      errors.push(`Row ${rowNumber}: Name exceeds ${MAX_NAME_LENGTH} characters`);
    }

    // Transform-specific validation
    if (col.transform && hasValue) {
      const transformer = VALUE_TRANSFORMERS[col.transform];
      if (transformer) {
        try {
          const result = transformer(trimmed);
          if (result === undefined || result === null) {
            warnings.push(`Row ${rowNumber}: "${col.csvColumn}" value "${trimmed}" could not be mapped`);
          }
        } catch {
          warnings.push(`Row ${rowNumber}: "${col.csvColumn}" transform failed for "${trimmed}"`);
        }
      }
    }
  }

  // Coordinate validation (special case — check both lat and lng together)
  const lat = row['latitude'];
  const lng = row['longitude'];
  if (lat !== undefined && lat.trim() !== '') {
    const latNum = parseFloat(lat);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      errors.push(`Row ${rowNumber}: Latitude "${lat}" is invalid (must be -90 to 90)`);
    }
  }
  if (lng !== undefined && lng.trim() !== '') {
    const lngNum = parseFloat(lng);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      errors.push(`Row ${rowNumber}: Longitude "${lng}" is invalid (must be -180 to 180)`);
    }
  }

  // Distance validation for edges
  const distance = row['distance_km'];
  if (distance !== undefined && distance.trim() !== '') {
    const distNum = parseFloat(distance);
    if (isNaN(distNum) || distNum < 0) {
      errors.push(`Row ${rowNumber}: Distance "${distance}" must be a positive number`);
    }
  }

  return {
    rowNumber,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/** Valid service types for validation */
const VALID_SERVICE_TYPES: ServiceType[] = ['l1-dwdm', 'l2-ethernet', 'l3-ip'];

/**
 * Validate service-specific fields for a single row.
 * Called after generic validateRow for additional service logic.
 *
 * @param row - Parsed CSV row as key-value record
 * @param nodeNameToId - Map from node name (lowercase) to node UUID
 * @param rowNumber - 1-based row number for error messages
 */
export function validateServiceRow(
  row: Record<string, string>,
  nodeNameToId: Map<string, string>,
  rowNumber: number,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate source node exists
  const sourceName = (row['source_node'] || '').trim();
  if (sourceName && !nodeNameToId.has(sourceName.toLowerCase())) {
    errors.push(`Row ${rowNumber}: Source node "${sourceName}" not found`);
  }

  // Validate destination node exists
  const destName = (row['destination_node'] || '').trim();
  if (destName && !nodeNameToId.has(destName.toLowerCase())) {
    errors.push(`Row ${rowNumber}: Destination node "${destName}" not found`);
  }

  // Validate service type is recognized
  const serviceTypeRaw = (row['service_type'] || '').trim();
  if (serviceTypeRaw) {
    const mapped = VALUE_TRANSFORMERS.toServiceType(serviceTypeRaw) as ServiceType | undefined;
    if (!mapped || !VALID_SERVICE_TYPES.includes(mapped)) {
      errors.push(`Row ${rowNumber}: Invalid service type "${serviceTypeRaw}"`);
    }
  }

  // Validate working_path_nodes references if provided
  const workingPathStr = (row['working_path_nodes'] || '').trim();
  if (workingPathStr) {
    const pathNames = workingPathStr.split(';').map((n) => n.trim()).filter(Boolean);
    for (const name of pathNames) {
      if (!nodeNameToId.has(name.toLowerCase())) {
        warnings.push(`Row ${rowNumber}: Working path node "${name}" not found`);
      }
    }
  }

  // Validate protection_path_nodes references if provided
  const protPathStr = (row['protection_path_nodes'] || '').trim();
  if (protPathStr) {
    const pathNames = protPathStr.split(';').map((n) => n.trim()).filter(Boolean);
    for (const name of pathNames) {
      if (!nodeNameToId.has(name.toLowerCase())) {
        warnings.push(`Row ${rowNumber}: Protection path node "${name}" not found`);
      }
    }
  }

  // Channel / Lambda frequency cross-validation
  const channelStr = (row['channel_number'] || '').trim();
  const freqStr = (row['lambda_frequency'] || '').trim();
  const channelNum = channelStr ? parseInt(channelStr, 10) : undefined;
  const freqNum = freqStr ? parseFloat(freqStr) : undefined;

  if (freqNum !== undefined && !isNaN(freqNum)) {
    // Validate frequency is in C-band range (50GHz grid: 191.35-196.10 THz)
    if (freqNum < 191.35 || freqNum > 196.10) {
      errors.push(`Row ${rowNumber}: Lambda frequency ${freqNum} THz is outside C-band range (191.35-196.10 THz)`);
    } else {
      // Check if frequency is on 50GHz grid
      const ituCh = frequencyToChannelNumber(freqNum, 'fixed-50ghz');
      const snappedFreq = channelNumberToFrequency(ituCh, 'fixed-50ghz');
      const diff = Math.abs(freqNum - snappedFreq);
      if (diff > 0.001) {
        const userCh = ituToUserChannel(ituCh, 'fixed-50ghz');
        warnings.push(`Row ${rowNumber}: Lambda frequency ${freqNum} THz is off 50GHz grid, snapping to CH${userCh} (${snappedFreq.toFixed(2)} THz)`);
      }

      // Cross-validate with channel_number if both provided
      if (channelNum !== undefined && !isNaN(channelNum)) {
        const ituFromUser = userToItuChannel(channelNum, 'fixed-50ghz');
        const expectedFreq = channelNumberToFrequency(ituFromUser, 'fixed-50ghz');
        const freqDiff = Math.abs(freqNum - expectedFreq);
        if (freqDiff > 0.001) {
          warnings.push(`Row ${rowNumber}: Lambda frequency ${freqNum} THz does not match channel ${channelNum} (expected ${expectedFreq.toFixed(2)} THz). Using channel_number.`);
        }
      }
    }
  }

  return { errors, warnings };
}
