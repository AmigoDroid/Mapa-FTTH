import type { Fiber } from '@/types/ftth';
import { DEFAULT_CABLE_FIBERS_PER_TUBE } from '@/types/ftth';

export interface NormalizedCableGeometry {
  fiberCount: number;
  looseTubeCount: number;
  fibersPerTube: number;
  maxCapacity: number;
}

export const normalizeCableGeometry = (
  fiberCount: number,
  looseTubeCount?: number,
  fibersPerTube?: number
): NormalizedCableGeometry => {
  const safeFibersPerTube = Math.max(1, fibersPerTube || DEFAULT_CABLE_FIBERS_PER_TUBE);
  const safeLooseTubeCount = Math.max(
    1,
    looseTubeCount || Math.ceil(Math.max(1, fiberCount) / safeFibersPerTube)
  );
  const maxCapacity = safeLooseTubeCount * safeFibersPerTube;
  const safeFiberCount = Math.min(Math.max(1, fiberCount), maxCapacity);

  return {
    fiberCount: safeFiberCount,
    looseTubeCount: safeLooseTubeCount,
    fibersPerTube: safeFibersPerTube,
    maxCapacity,
  };
};

export const enforceCableGeometry = (
  fiberCount: number,
  looseTubeCount: number | undefined,
  fibersPerTube: number | undefined,
  minFiberCount: number = 1
): NormalizedCableGeometry => {
  const safeFibersPerTube = Math.max(1, fibersPerTube || DEFAULT_CABLE_FIBERS_PER_TUBE);
  const requiredFiberCount = Math.max(1, fiberCount, minFiberCount);
  let safeLooseTubeCount = Math.max(
    1,
    looseTubeCount || Math.ceil(requiredFiberCount / safeFibersPerTube)
  );

  if (safeLooseTubeCount * safeFibersPerTube < requiredFiberCount) {
    safeLooseTubeCount = Math.ceil(requiredFiberCount / safeFibersPerTube);
  }

  const maxCapacity = safeLooseTubeCount * safeFibersPerTube;

  return {
    fiberCount: Math.min(requiredFiberCount, maxCapacity),
    looseTubeCount: safeLooseTubeCount,
    fibersPerTube: safeFibersPerTube,
    maxCapacity,
  };
};

export const normalizeFiberTubeNumbers = (fibers: Fiber[] | undefined, fibersPerTube: number): Fiber[] =>
  (fibers || []).map((fiber, index) => ({
    ...fiber,
    tubeNumber:
      typeof (fiber as Fiber & { tubeNumber?: number }).tubeNumber === 'number'
        ? (fiber as Fiber & { tubeNumber?: number }).tubeNumber
        : Math.floor(index / Math.max(1, fibersPerTube)) + 1,
  }));
