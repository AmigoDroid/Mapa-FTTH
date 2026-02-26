import type { Box, Cable, FiberColor } from './entities';

export interface CableColorOption {
  name: string;
  hex: string;
  type: Cable['type'] | 'generic';
}

export interface CableModelOption {
  id: string;
  label: string;
  category: Cable['type'];
}

export interface BoxIconConfig {
  icon: string;
  color: string;
  size: number;
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
export const CABLE_COLORS: CableColorOption[] = [
  { name: 'Azul', hex: '#0066CC', type: 'backbone' },
  { name: 'Verde', hex: '#00CC00', type: 'distribution' },
  { name: 'Laranja', hex: '#FF6600', type: 'feeder' },
  { name: 'Marrom', hex: '#8B4513', type: 'drop' },
  { name: 'Cinza', hex: '#808080', type: 'generic' },
];

export const CABLE_MODEL_OPTIONS: CableModelOption[] = [
  { id: 'AS-80', label: 'AS-80', category: 'distribution' },
  { id: 'AS-120', label: 'AS-120', category: 'distribution' },
  { id: 'AS-80S', label: 'AS-80S', category: 'feeder' },
  { id: 'AS-120S', label: 'AS-120S', category: 'feeder' },
  { id: 'ADSS-80', label: 'ADSS-80', category: 'backbone' },
  { id: 'ADSS-120', label: 'ADSS-120', category: 'backbone' },
  { id: 'ADSS-200', label: 'ADSS-200', category: 'backbone' },
  { id: 'DROP-FLAT', label: 'DROP-FLAT', category: 'drop' },
  { id: 'DROP-ROUND', label: 'DROP-ROUND', category: 'drop' },
  { id: 'MICRO-CABO', label: 'MICRO-CABO', category: 'distribution' },
];

export const BOX_ICONS: Record<Box['type'], BoxIconConfig> = {
  CEO: { icon: 'building-2', color: '#0066CC', size: 32 },
  CTO: { icon: 'box', color: '#00CC00', size: 28 },
  DIO: { icon: 'layout-grid', color: '#FF6600', size: 24 },
};

export const DEFAULT_CABLE_TYPE: Cable['type'] = 'distribution';
export const DEFAULT_CABLE_FIBER_COUNT = 12;
export const DEFAULT_CABLE_LOOSE_TUBE_COUNT = 1;
export const DEFAULT_CABLE_FIBERS_PER_TUBE = 12;

export const getCableModelsByType = (type: Cable['type']) =>
  CABLE_MODEL_OPTIONS.filter((item) => item.category === type);

export const resolveDefaultCableModel = (type: Cable['type']): string =>
  getCableModelsByType(type)[0]?.id || CABLE_MODEL_OPTIONS[0]?.id || 'AS-80';

export const DEFAULT_CABLE_MODEL = resolveDefaultCableModel(DEFAULT_CABLE_TYPE);
