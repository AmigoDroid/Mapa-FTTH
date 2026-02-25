import type {
  Cable,
  Network,
  OltAuxPort,
  OltPon,
  OltUplink,
  Pop,
  PopCable,
  PopRouterInterface,
  PopSwitchPort,
} from '@/types/ftth';
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

  return {
    ...cable,
    fiberCount: geometry.fiberCount,
    looseTubeCount: geometry.looseTubeCount,
    fibersPerTube: geometry.fibersPerTube,
    fibers: normalizeFiberTubeNumbers(cable.fibers, geometry.fibersPerTube),
  };
};

const normalizeNetworkCable = (cable: Cable): Cable => {
  const geometry = normalizeCableGeometry(
    cable.fiberCount,
    cable.looseTubeCount,
    cable.fibersPerTube
  );

  return {
    ...cable,
    model: cable.model || 'AS-80',
    fiberCount: geometry.fiberCount,
    looseTubeCount: geometry.looseTubeCount,
    fibersPerTube: geometry.fibersPerTube,
    fibers: normalizeFiberTubeNumbers(cable.fibers, geometry.fibersPerTube),
    attachments: cable.attachments || [],
  };
};

const normalizePop = (pop: Pop): Pop => ({
  ...pop,
  fusionLayout: pop.fusionLayout || {},
  dios: pop.dios || [],
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
          connector: 'UPC',
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
    })),
    uplinks: (sw.uplinks || []).map((port, idx) => ({
      ...port,
      index: port.index || idx + 1,
      active: resolveActiveFlag(port as PopSwitchPort & { active?: boolean }, true),
    })),
  })),
  routers: (pop.routers || []).map((router) => ({
    ...router,
    interfaces: (router.interfaces || []).map((iface, idx) => ({
      ...iface,
      index: iface.index || idx + 1,
      active: resolveActiveFlag(iface as PopRouterInterface & { active?: boolean }, true),
    })),
  })),
  cables: (pop.cables || []).map((cable) => normalizePopCable(cable)),
  fusions: pop.fusions || [],
});

export const normalizeImportedNetwork = (networkRaw: Network): Network => ({
  ...networkRaw,
  cities: networkRaw.cities || [],
  pops: (networkRaw.pops || []).map((pop) => normalizePop(pop)),
  reserves: networkRaw.reserves || [],
  cables: (networkRaw.cables || []).map((cable) => normalizeNetworkCable(cable)),
});
