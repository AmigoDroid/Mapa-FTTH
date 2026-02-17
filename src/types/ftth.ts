// Tipos para o sistema de documentação FTTH

export type ComponentType = 'CEO' | 'CTO' | 'DIO' | 'CABLE' | 'SPLITTER' | 'CONNECTOR';

export interface Position {
  lat: number;
  lng: number;
}

export interface City {
  id: string;
  name: string;
  sigla: string;
  state?: string;
  popIds: string[];
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
  model: string;
  fiberCount: number;
  looseTubeCount: number;
  fibersPerTube: number;
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
  attachments?: CableAttachment[];
}

export interface PopDio {
  id: string;
  name: string;
  portCount: number;
}

export type OltType = 'compact' | 'chassi';

export interface OltGbic {
  id: string;
  model: string;
  connector: 'APC' | 'UPC' | 'APC-UPC';
  txPowerDbm: number;
}

export interface OltPon {
  id: string;
  index: number;
  active: boolean;
  gbic: OltGbic;
}

export interface OltUplink {
  id: string;
  index: number;
  active: boolean;
  connector: 'RJ45' | 'SFP' | 'SFP+';
  speed: '1G' | '10G';
}

export interface OltAuxPort {
  id: string;
  index: number;
  active: boolean;
  role: 'BOOT' | 'CONSOLE';
}

export interface OltSlot {
  id: string;
  index: number;
  pons: OltPon[];
}

export interface PopOlt {
  id: string;
  name: string;
  type: OltType;
  slots: OltSlot[];
  uplinks: OltUplink[];
  bootPorts?: OltAuxPort[];
  consolePorts?: OltAuxPort[];
}

export interface PopSwitchPort {
  id: string;
  index: number;
  active: boolean;
}

export interface PopSwitch {
  id: string;
  name: string;
  portCount: number;
  uplinkPortCount: number;
  ports: PopSwitchPort[];
  uplinks: PopSwitchPort[];
}

export interface PopRouterInterface {
  id: string;
  index: number;
  active: boolean;
  role: 'WAN' | 'LAN';
}

export interface PopRouter {
  id: string;
  name: string;
  wanCount: number;
  lanCount: number;
  interfaces: PopRouterInterface[];
}

export interface PopCable {
  id: string;
  name: string;
  type: 'bigtail' | 'backbone' | 'patchcord' | 'apc-upc';
  fiberCount: number;
  fibers: Fiber[];
  status: 'active' | 'inactive' | 'maintenance';
}

export interface PopFusion {
  id: string;
  endpointAId: string;
  endpointBId: string;
  fusionType: 'mechanical' | 'fusion' | 'connector';
  attenuation: number;
  vlan?: number;
  dateCreated: string;
}

export interface Pop {
  id: string;
  cityId: string;
  name: string;
  position: Position;
  status: 'active' | 'inactive' | 'maintenance' | 'projected';
  fusionLayout?: Record<string, { x: number; y: number }>;
  dios: PopDio[];
  olts: PopOlt[];
  switches: PopSwitch[];
  routers: PopRouter[];
  cables: PopCable[];
  fusions: PopFusion[];
}

export interface CableAttachment {
  id: string;
  kind: 'box' | 'reserve';
  entityId: string;
  name: string;
  position: Position;
  pathIndex: number;
}

export interface ReservePoint {
  id: string;
  name: string;
  position: Position;
  status: 'active' | 'inactive';
  notes?: string;
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
  fusionLayout?: Record<string, { x: number; y: number }>;
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
  cities: City[];
  pops: Pop[];
  boxes: Box[];
  reserves: ReservePoint[];
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

export interface CableModelOption {
  id: string;
  label: string;
  category: Cable['type'];
}

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

// Ícones para caixas
export const BOX_ICONS: Record<string, { icon: string; color: string; size: number }> = {
  CEO: { icon: 'building-2', color: '#0066CC', size: 32 },
  CTO: { icon: 'box', color: '#00CC00', size: 28 },
  DIO: { icon: 'layout-grid', color: '#FF6600', size: 24 },
};
