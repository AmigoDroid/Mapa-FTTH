// Tipos para o sistema de documentação FTTH

export type ComponentType = 'CEO' | 'CTO' | 'DIO' | 'CABLE' | 'SPLITTER' | 'CONNECTOR';

export interface Position {
  lat: number;
  lng: number;
}

export interface FiberColor {
  number: number;
  name: string;
  hex: string;
  code: string;
}

export interface Fiber {
  id: string;
  number: number;
  color: FiberColor;
  status: 'active' | 'inactive' | 'faulty' | 'reserved';
  connectedTo?: string;
  fusionId?: string;
  continuityTested?: boolean;
  signalStrength?: number;
  clientId?: string;
  clientName?: string;
  observations?: string;
}

export interface Fusion {
  id: string;
  fiberAId: string;
  fiberBId: string;
  boxAId: string;
  boxBId: string;
  position: Position;
  fusionType: 'mechanical' | 'fusion' | 'connector';
  attenuation?: number;
  dateCreated: string;
  technician?: string;
  observations?: string;
}

export interface Cable {
  id: string;
  name: string;
  type: 'drop' | 'distribution' | 'feeder' | 'backbone';
  fiberCount: number;
  fibers: Fiber[];
  startPoint: string;
  endPoint: string;
  path: Position[];
  length: number;
  status: 'active' | 'inactive' | 'maintenance' | 'projected';
  color: string;
  diameter?: number;
  installationDate?: string;
  observations?: string;
}

export interface Splitter {
  id: string;
  name: string;
  type: '1x2' | '1x4' | '1x8' | '1x16' | '1x32' | '1x64' | '2x2' | '2x4' | '2x8' | '2x16' | '2x32' | '2x64';
  inputFibers: Fiber[];
  outputFibers: Fiber[];
  attenuation: number;
  status: 'active' | 'inactive' | 'faulty';
}

export interface Box {
  id: string;
  name: string;
  type: 'CEO' | 'CTO' | 'DIO';
  position: Position;
  address?: string;
  capacity: number;
  fibers: Fiber[];
  inputCables: string[];
  outputCables: string[];
  splitters?: Splitter[];
  fusions: Fusion[];
  status: 'active' | 'inactive' | 'maintenance' | 'projected';
  installationDate?: string;
  manufacturer?: string;
  model?: string;
  observations?: string;
  images?: string[];
}

export interface Network {
  id: string;
  name: string;
  description?: string;
  boxes: Box[];
  cables: Cable[];
  fusions: Fusion[];
  createdAt: string;
  updatedAt: string;
  technician?: string;
  company?: string;
}

export interface ContinuityTest {
  id: string;
  cableId: string;
  fiberNumber: number;
  startPoint: string;
  endPoint: string;
  result: 'pass' | 'fail' | 'pending';
  attenuation?: number;
  distance?: number;
  testedAt: string;
  technician?: string;
  observations?: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  position: Position;
  fiberId: string;
  boxId: string;
  status: 'active' | 'inactive' | 'suspended';
  plan?: string;
  installationDate?: string;
  contact?: string;
  observations?: string;
}

// Cores padrao ABNT (Brasil) para identificacao de fibras opticas (1 a 12)
export const FIBER_COLORS: FiberColor[] = [
  { number: 1, name: 'Verde', hex: '#00B050', code: 'GR' },
  { number: 2, name: 'Amarelo', hex: '#FFD500', code: 'YL' },
  { number: 3, name: 'Branco', hex: '#FFFFFF', code: 'WH' },
  { number: 4, name: 'Azul', hex: '#0070C0', code: 'BL' },
  { number: 5, name: 'Vermelho', hex: '#C00000', code: 'RD' },
  { number: 6, name: 'Violeta', hex: '#7030A0', code: 'VT' },
  { number: 7, name: 'Marrom', hex: '#7A3E00', code: 'BR' },
  { number: 8, name: 'Rosa', hex: '#FF66CC', code: 'PK' },
  { number: 9, name: 'Preto', hex: '#000000', code: 'BK' },
  { number: 10, name: 'Cinza', hex: '#7F7F7F', code: 'GY' },
  { number: 11, name: 'Laranja', hex: '#ED7D31', code: 'OR' },
  { number: 12, name: 'Azul Claro', hex: '#00B0F0', code: 'AQ' },
];
// Cores para cabos
export const CABLE_COLORS = [
  { name: 'Azul', hex: '#0066CC', type: 'backbone' },
  { name: 'Verde', hex: '#00CC00', type: 'distribution' },
  { name: 'Laranja', hex: '#FF6600', type: 'feeder' },
  { name: 'Marrom', hex: '#8B4513', type: 'drop' },
  { name: 'Cinza', hex: '#808080', type: 'generic' },
];

// Ícones para caixas
export const BOX_ICONS: Record<string, { icon: string; color: string; size: number }> = {
  CEO: { icon: 'building-2', color: '#0066CC', size: 32 },
  CTO: { icon: 'box', color: '#00CC00', size: 28 },
  DIO: { icon: 'layout-grid', color: '#FF6600', size: 24 },
};
