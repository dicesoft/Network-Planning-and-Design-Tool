import { isL1DWDMService } from '@/types/service';
import type { Service } from '@/types/service';
import type { DefragMove } from '@/core/services/DefragmentationEngine';

export interface DefragValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  blockedMoves: DefragMove[];
  allowedMoves: DefragMove[];
}

export function validateDefragMoves(
  moves: DefragMove[],
  services: Service[]
): DefragValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockedMoves: DefragMove[] = [];
  const allowedMoves: DefragMove[] = [];

  const targetMap = new Map<string, DefragMove>();
  for (const move of moves) {
    const key = `${move.edgeId}:${move.toChannel}`;
    const existing = targetMap.get(key);
    if (existing) {
      errors.push(
        `Conflicting moves: services ${existing.serviceId} and ${move.serviceId} both target channel ${move.toChannel} on edge ${move.edgeId}`
      );
    }
    targetMap.set(key, move);
  }

  for (const move of moves) {
    const isSyntheticId = move.serviceId.includes(':ch');
    if (isSyntheticId) {
      allowedMoves.push(move);
      continue;
    }

    const service = services.find((s) => s.id === move.serviceId);

    if (!service) {
      errors.push(`Service ${move.serviceId} not found`);
      blockedMoves.push(move);
      continue;
    }

    if (service.status === 'active') {
      const hasProtection = isL1DWDMService(service) && service.protectionScheme !== 'none';
      if (!hasProtection) {
        blockedMoves.push(move);
        errors.push(
          `Service ${service.name} (${service.id}) is active without protection. Active unprotected services cannot be defragmented in V1.`
        );
        continue;
      } else {
        warnings.push(
          `Service ${service.name} is active with protection. Move will proceed but may cause brief disruption.`
        );
      }
    }

    allowedMoves.push(move);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    blockedMoves,
    allowedMoves,
  };
}
