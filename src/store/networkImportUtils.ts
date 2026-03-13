import type {
  Cable,
  Network,
  NetworkExplorerState,
  OltAuxPort,
  OltPon,
  OltUplink,
  Pop,
  PopCable,
  PopRouterInterface,
  PopSwitchPort,
  PopVlan,
} from '@/types/ftth';
import { resolveDefaultCableModel } from '@/types/ftth';
import { normalizeCableGeometry, normalizeFiberTubeNumbers } from '@/store/cableUtils';
import { generateId } from '@/store/networkUtils';

const resolveActiveFlag = (value: { active?: boolean }, fallback: boolean = true) =>
  typeof value.active === 'boolean' ? value.active : fallback;

const normalizeOltAuxPorts = (
  ports: OltAuxPort[] | undefined,
  role: OltAuxPort['role']
): OltAuxPort[] =>
  (ports || []).map((port, idx) => ({
    ...port,
    index: port.index || idx + 1,
    active: resolveActiveFlag(port, true),
    role,
  }));

const normalizeOltUplinks = (uplinks: OltUplink[] | undefined): OltUplink[] => {
  if (!uplinks || uplinks.length === 0) {
    return [
      { id: generateId(), index: 1, active: true, connector: 'SFP+', speed: '10G' },
      { id: generateId(), index: 2, active: true, connector: 'SFP+', speed: '10G' },
    ];
  }

  return uplinks.map((uplink, idx) => ({
    ...uplink,
    index: uplink.index || idx + 1,
    active: resolveActiveFlag(uplink, true),
    connector: uplink.connector || 'SFP+',
    speed: uplink.speed || '10G',
  }));
};

const normalizePopCable = (cable: PopCable): PopCable => {
  const geometry = normalizeCableGeometry(
    cable.fiberCount,
    cable.looseTubeCount,
    cable.fibersPerTube
  );

  const normalizedType =
    cable.type === 'bigtail' || cable.type === 'pigtail'
      ? 'pigtail'
      : cable.type;

  return {
    ...cable,
    type: normalizedType,
    fiberCount: geometry.fiberCount,
    looseTubeCount: geometry.looseTubeCount,
    fibersPerTube: geometry.fibersPerTube,
    dioId:
      typeof cable.dioId === 'string' && cable.dioId.trim().length > 0
        ? cable.dioId
        : undefined,
    fibers: normalizeFiberTubeNumbers(cable.fibers, geometry.fibersPerTube),
  };
};

const normalizeVlanMode = (mode: string | undefined): PopVlan['mode'] => {
  if (mode === 'access' || mode === 'trunk' || mode === 'qinq') return mode;
  return 'access';
};

const normalizeVlanServiceType = (serviceType: string | undefined): PopVlan['serviceType'] => {
  if (
    serviceType === 'internet' ||
    serviceType === 'iptv' ||
    serviceType === 'voip' ||
    serviceType === 'management' ||
    serviceType === 'transport' ||
    serviceType === 'corporate'
  ) {
    return serviceType;
  }
  return 'transport';
};

const normalizeVlanStatus = (status: string | undefined): PopVlan['status'] => {
  if (status === 'active' || status === 'planned' || status === 'retired') return status;
  return 'active';
};

const normalizeExplorerState = (explorer: NetworkExplorerState | undefined): NetworkExplorerState => ({
  folders: Array.isArray(explorer?.folders) ? explorer!.folders : [],
  elements: Array.isArray(explorer?.elements) ? explorer!.elements : [],
});

const normalizePopVlans = (vlans: PopVlan[] | undefined): PopVlan[] => {
  const uniqueVlanIds = new Set<number>();

  return (vlans || [])
    .map((vlan) => {
      const vlanId = Math.max(1, Math.min(4094, Number.parseInt(String(vlan.vlanId), 10)));
      if (!Number.isFinite(vlanId)) return null;
      if (uniqueVlanIds.has(vlanId)) return null;
      uniqueVlanIds.add(vlanId);

      return {
        ...vlan,
        id: vlan.id || generateId(),
        vlanId,
        name: vlan.name || `VLAN ${vlanId}`,
        serviceType: normalizeVlanServiceType(vlan.serviceType),
        mode: normalizeVlanMode(vlan.mode),
        outerVlan:
          typeof vlan.outerVlan === 'number' && vlan.outerVlan >= 1 && vlan.outerVlan <= 4094
            ? vlan.outerVlan
            : undefined,
        gateway: vlan.gateway || undefined,
        pppoeProfile: vlan.pppoeProfile || undefined,
        status: normalizeVlanStatus(vlan.status),
        notes: vlan.notes || undefined,
      } as PopVlan;
    })
    .filter((item): item is PopVlan => Boolean(item))
    .sort((a, b) => a.vlanId - b.vlanId);
};

const normalizeNetworkCable = (cable: Cable): Cable => {
  const geometry = normalizeCableGeometry(
    cable.fiberCount,
    cable.looseTubeCount,
    cable.fibersPerTube
  );

  return {
    ...cable,
    model: cable.model || resolveDefaultCableModel(cable.type),
    fiberCount: geometry.fiberCount,
    looseTubeCount: geometry.looseTubeCount,
    fibersPerTube: geometry.fibersPerTube,
    fibers: normalizeFiberTubeNumbers(cable.fibers, geometry.fibersPerTube),
    attachments: cable.attachments || [],
  };
};

const normalizePop = (pop: Pop): Pop => {
  const normalizedDios = pop.dios || [];
  const validDioIds = new Set(normalizedDios.map((dio) => dio.id));

  return {
    ...pop,
    fusionLayout: pop.fusionLayout || {},
    dios: normalizedDios,
    olts: (pop.olts || []).map((olt) => ({
      ...olt,
      bootPorts: normalizeOltAuxPorts(olt.bootPorts, 'BOOT'),
      consolePorts: normalizeOltAuxPorts(olt.consolePorts, 'CONSOLE'),
      uplinks: normalizeOltUplinks(olt.uplinks),
      slots: (olt.slots || []).map((slot, slotIndex) => ({
        ...slot,
        index: slot.index || slotIndex + 1,
        pons: (slot.pons || []).map((pon, ponIndex) => ({
          ...pon,
          index: pon.index || ponIndex + 1,
          active: resolveActiveFlag(pon as OltPon & { active?: boolean }, false),
          gbic: {
            id: pon.gbic?.id || generateId(),
            model: pon.gbic?.model || '',
            connector: pon.gbic?.connector === 'APC-UPC' ? 'APC-UPC' : pon.gbic?.connector || 'APC',
            txPowerDbm: typeof pon.gbic?.txPowerDbm === 'number' ? pon.gbic.txPowerDbm : 0,
          },
        })),
      })),
    })),
    switches: (pop.switches || []).map((sw) => ({
      ...sw,
      ports: (sw.ports || []).map((port, idx) => ({
        ...port,
        index: port.index || idx + 1,
        active: resolveActiveFlag(port as PopSwitchPort & { active?: boolean }, true),
        connector:
          port.connector === 'SFP' || port.connector === 'SFP+' ? port.connector : 'RJ45',
      })),
      uplinks: (sw.uplinks || []).map((port, idx) => ({
        ...port,
        index: port.index || idx + 1,
        active: resolveActiveFlag(port as PopSwitchPort & { active?: boolean }, true),
        connector:
          port.connector === 'RJ45' || port.connector === 'SFP' || port.connector === 'SFP+'
            ? port.connector
            : 'SFP+',
      })),
    })),
    routers: (pop.routers || []).map((router) => ({
      ...router,
      interfaces: (router.interfaces || []).map((iface, idx) => ({
        ...iface,
        index: iface.index || idx + 1,
        active: resolveActiveFlag(iface as PopRouterInterface & { active?: boolean }, true),
        connector:
          iface.connector === 'RJ45' || iface.connector === 'SFP' || iface.connector === 'SFP+'
            ? iface.connector
            : iface.role === 'WAN'
              ? 'SFP+'
              : 'RJ45',
      })),
    })),
    cables: (pop.cables || []).map((cable) => {
      const normalizedCable = normalizePopCable(cable);
      if (normalizedCable.dioId && !validDioIds.has(normalizedCable.dioId)) {
        return {
          ...normalizedCable,
          dioId: undefined,
        };
      }
      return normalizedCable;
    }),
    vlans: normalizePopVlans(pop.vlans),
    fusions: pop.fusions || [],
  };
};

export const normalizeImportedNetwork = (networkRaw: Network): Network => ({
  ...networkRaw,
  explorer: normalizeExplorerState(networkRaw.explorer),
  cities: networkRaw.cities || [],
  pops: (networkRaw.pops || []).map((pop) => normalizePop(pop)),
  reserves: networkRaw.reserves || [],
  cables: (networkRaw.cables || []).map((cable) => normalizeNetworkCable(cable)),
});
