import type { Cable, Position } from '@/types/ftth';

export type ClickMode = 'normal' | 'addPop' | 'addBox' | 'addReserve' | 'addCable' | 'editCable';

export type MapViewMode = 'street' | 'satellite';

export interface PendingAttachToCable {
  cableId: string;
  position: Position;
  pathIndex: number;
}

export interface NearestCableHit extends PendingAttachToCable {
  distancePx: number;
}

export interface MapPointRequestDetail {
  requestId: string;
}

export interface FiberTraceRequestDetail {
  fiberId: string;
  persist?: boolean;
}

export interface FiberAnalyzerSelectCableDetail {
  cableId: string;
}

export interface EditCableRequestDetail {
  cableId: string;
}

export interface StartMapCableDrawingDetail {
  name?: string;
  type?: Cable['type'];
  model?: string;
  fiberCount?: number;
  looseTubeCount?: number;
  fibersPerTube?: number;
  startPoint?: string;
  endPoint?: string;
}

export interface FiberTraceSegment {
  id: string;
  points: Position[];
  color: string;
  delayMs: number;
}

export interface NetworkEndpointOption {
  id: string;
  label: string;
}

export interface ResolvedNetworkEndpoint {
  id: string;
  name: string;
  position: Position;
  kind: 'box' | 'pop';
}
