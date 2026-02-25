import type { Fiber } from '@/types/ftth';

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
  const safeFibersPerTube = Math.max(1, fibersPerTube || 12);
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

export const normalizeFiberTubeNumbers = (fibers: Fiber[] | undefined, fibersPerTube: number): Fiber[] =>
  (fibers || []).map((fiber, index) => ({
    ...fiber,
    tubeNumber:
      typeof (fiber as Fiber & { tubeNumber?: number }).tubeNumber === 'number'
        ? (fiber as Fiber & { tubeNumber?: number }).tubeNumber
        : Math.floor(index / Math.max(1, fibersPerTube)) + 1,
  }));
