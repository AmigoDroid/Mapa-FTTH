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
  tubeNumber?: number;
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

export interface CableAttachment {
  id: string;
  kind: 'box' | 'reserve';
  entityId: string;
  name: string;
  position: Position;
  pathIndex: number;
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
  connector: 'RJ45' | 'SFP' | 'SFP+';
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
  connector: 'RJ45' | 'SFP' | 'SFP+';
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
  type: 'pigtail' | 'bigtail' | 'backbone' | 'patchcord' | 'apc-upc';
  fiberCount: number;
  looseTubeCount?: number;
  fibersPerTube?: number;
  fibers: Fiber[];
  status: 'active' | 'inactive' | 'maintenance';
  dioId?: string;
  linkedNetworkCableId?: string;
  mapEndpointRole?: 'incoming' | 'outgoing';
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

export type PopVlanServiceType =
  | 'internet'
  | 'iptv'
  | 'voip'
  | 'management'
  | 'transport'
  | 'corporate';

export type PopVlanMode = 'access' | 'trunk' | 'qinq';

export interface PopVlan {
  id: string;
  vlanId: number;
  name: string;
  serviceType: PopVlanServiceType;
  mode: PopVlanMode;
  outerVlan?: number;
  gateway?: string;
  pppoeProfile?: string;
  status: 'active' | 'planned' | 'retired';
  notes?: string;
}

export interface Pop {
  id: string;
  cityId: string;
  name: string;
  position: Position;
  status: 'active' | 'inactive' | 'maintenance' | 'projected';
  fusionLayout?: Record<string, { x: number; y: number }>;
  vlans?: PopVlan[];
  dios: PopDio[];
  olts: PopOlt[];
  switches: PopSwitch[];
  routers: PopRouter[];
  cables: PopCable[];
  fusions: PopFusion[];
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
  type:
    | '1x2'
    | '1x4'
    | '1x8'
    | '1x16'
    | '1x32'
    | '1x64'
    | '2x2'
    | '2x4'
    | '2x8'
    | '2x16'
    | '2x32'
    | '2x64';
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
