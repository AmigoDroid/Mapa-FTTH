import type { Fiber } from '@/types/ftth';

export interface EndpointOption {
  id: string;
  label: string;
  group: string;
  colorHex: string;
  status: Fiber['status'];
  fusionId?: string;
  entityId: string;
  entityLabel: string;
}

export interface DragState {
  fromId: string;
  x: number;
  y: number;
}

export interface EntityPosition {
  x: number;
  y: number;
}

export interface EntityOption {
  id: string;
  label: string;
  type: 'box' | 'cable' | 'splitter';
}
