import type {
  OltAuxPort,
  OltPon,
  OltSlot,
  OltUplink,
  Pop,
  PopCable,
  PopDio,
  PopFusion,
  PopOlt,
  PopRouter,
  PopRouterInterface,
  PopSwitch,
  PopSwitchPort,
  PopVlan,
} from '@/types/ftth';
import { generateId } from '@/store/networkUtils';
import { applyPopFusionToCables, buildPopFusion, canConnectPopEndpoints } from '@/store/popEndpointUtils';

interface PopProvisioningBlueprint {
  dios: PopDio[];
  olts: PopOlt[];
  switches: PopSwitch[];
  routers: PopRouter[];
  vlans: PopVlan[];
}

interface DioPortUsage {
  endpointId: string;
  hasCable: boolean;
  hasPon: boolean;
  linkCount: number;
}

const isOltPonEndpoint = (endpointId: string) =>
  endpointId.startsWith('olt:') && endpointId.includes(':s:') && endpointId.includes(':p:');

const classifyPeerEndpoint = (endpointId: string): 'cable' | 'pon' | 'other' => {
  if (endpointId.startsWith('cable:')) return 'cable';
  if (isOltPonEndpoint(endpointId)) return 'pon';
  return 'other';
};

const buildUplinkPorts = (count: number): OltUplink[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: generateId(),
    index: idx + 1,
    active: true,
    connector: 'SFP+',
    speed: '10G',
  }));

const buildAuxPorts = (count: number, role: OltAuxPort['role']): OltAuxPort[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: generateId(),
    index: idx + 1,
    active: true,
    role,
  }));

const buildPonList = (count: number): OltPon[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: generateId(),
    index: idx + 1,
    active: false,
    gbic: {
      id: generateId(),
      model: 'C+',
      connector: 'APC',
      txPowerDbm: 3,
    },
  }));

const buildSwitchPorts = (
  count: number,
  connector: PopSwitchPort['connector']
): PopSwitchPort[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: generateId(),
    index: idx + 1,
    active: true,
    connector,
  }));

const buildRouterInterfaces = (
  count: number,
  role: PopRouterInterface['role'],
  connector: PopRouterInterface['connector']
): PopRouterInterface[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: generateId(),
    index: idx + 1,
    active: true,
    role,
    connector,
  }));

export const buildStandardPopProvision = (popName: string): PopProvisioningBlueprint => {
  const dio: PopDio = {
    id: generateId(),
    name: `${popName} DIO-01`,
    portCount: 144,
  };

  const ponSlot: OltSlot = {
    id: generateId(),
    index: 1,
    pons: buildPonList(16),
  };

  const olt: PopOlt = {
    id: generateId(),
    name: `${popName} OLT-01`,
    type: 'chassi',
    slots: [ponSlot],
    uplinks: buildUplinkPorts(2),
    bootPorts: buildAuxPorts(1, 'BOOT'),
    consolePorts: buildAuxPorts(1, 'CONSOLE'),
  };

  const sw: PopSwitch = {
    id: generateId(),
    name: `${popName} SW-CORE-01`,
    portCount: 24,
    uplinkPortCount: 4,
    ports: buildSwitchPorts(24, 'RJ45'),
    uplinks: buildSwitchPorts(4, 'SFP+'),
  };

  const router: PopRouter = {
    id: generateId(),
    name: `${popName} RTR-BNG-01`,
    wanCount: 2,
    lanCount: 8,
    interfaces: [
      ...buildRouterInterfaces(2, 'WAN', 'SFP+'),
      ...buildRouterInterfaces(8, 'LAN', 'RJ45'),
    ],
  };

  const vlans: PopVlan[] = [
    {
      id: generateId(),
      vlanId: 10,
      name: 'Gerencia POP',
      serviceType: 'management',
      mode: 'access',
      gateway: '10.0.10.1/24',
      status: 'active',
      notes: 'Gestao de equipamentos ativos do POP.',
    },
    {
      id: generateId(),
      vlanId: 100,
      name: 'Internet PPPoE',
      serviceType: 'internet',
      mode: 'qinq',
      outerVlan: 2000,
      pppoeProfile: 'DEFAULT',
      status: 'active',
      notes: 'Servico de internet residencial sobre PON.',
    },
    {
      id: generateId(),
      vlanId: 200,
      name: 'VoIP',
      serviceType: 'voip',
      mode: 'access',
      status: 'planned',
      notes: 'Reserva para servico de voz IP.',
    },
    {
      id: generateId(),
      vlanId: 300,
      name: 'IPTV',
      serviceType: 'iptv',
      mode: 'trunk',
      status: 'planned',
      notes: 'Reserva para servico de video multicast.',
    },
  ];

  return {
    dios: [dio],
    olts: [olt],
    switches: [sw],
    routers: [router],
    vlans,
  };
};

const collectDioUsage = (pop: Pop, fusions: PopFusion[]): Map<string, DioPortUsage> => {
  const usageByEndpoint = new Map<string, DioPortUsage>();

  pop.dios.forEach((dio) => {
    for (let port = 1; port <= Math.max(1, dio.portCount); port++) {
      const endpointId = `dio:${dio.id}:p:${port}`;
      usageByEndpoint.set(endpointId, {
        endpointId,
        hasCable: false,
        hasPon: false,
        linkCount: 0,
      });
    }
  });

  fusions.forEach((fusion) => {
    const addUsage = (dioEndpointId: string, peerEndpointId: string) => {
      const current = usageByEndpoint.get(dioEndpointId);
      if (!current) return;
      const peerKind = classifyPeerEndpoint(peerEndpointId);
      current.linkCount += 1;
      if (peerKind === 'cable') current.hasCable = true;
      if (peerKind === 'pon') current.hasPon = true;
    };

    if (fusion.endpointAId.startsWith('dio:')) {
      addUsage(fusion.endpointAId, fusion.endpointBId);
    }
    if (fusion.endpointBId.startsWith('dio:')) {
      addUsage(fusion.endpointBId, fusion.endpointAId);
    }
  });

  return usageByEndpoint;
};

const isEndpointInUse = (fusions: PopFusion[], endpointId: string) =>
  fusions.some(
    (fusion) => fusion.endpointAId === endpointId || fusion.endpointBId === endpointId
  );

const pickAvailableDioPortForCable = (usageByEndpoint: Map<string, DioPortUsage>): string | null => {
  const ordered = Array.from(usageByEndpoint.values()).sort((a, b) => {
    if (a.linkCount !== b.linkCount) return a.linkCount - b.linkCount;
    return a.endpointId.localeCompare(b.endpointId);
  });

  const free = ordered.find((entry) => !entry.hasCable && entry.linkCount < 2);
  return free?.endpointId || null;
};

const markCableUsage = (usageByEndpoint: Map<string, DioPortUsage>, endpointId: string) => {
  const usage = usageByEndpoint.get(endpointId);
  if (!usage) return;
  usage.hasCable = true;
  usage.linkCount += 1;
};

const shouldAutoTerminateCable = (cable: PopCable) => Boolean(cable.linkedNetworkCableId);

export const autoTerminateMapCablesAtDio = (pop: Pop): Pop => {
  if (!pop.dios || pop.dios.length === 0) return pop;
  if (!pop.cables || pop.cables.length === 0) return pop;

  let nextFusions = [...(pop.fusions || [])];
  let nextCables = [...(pop.cables || [])];
  let changed = false;

  const usageByEndpoint = collectDioUsage(pop, nextFusions);

  for (const cable of nextCables) {
    if (!shouldAutoTerminateCable(cable)) continue;

    for (const fiber of cable.fibers || []) {
      const cableEndpointId = `cable:${cable.id}:f:${fiber.number}`;
      if (isEndpointInUse(nextFusions, cableEndpointId)) continue;

      const availableDioEndpointId = pickAvailableDioPortForCable(usageByEndpoint);
      if (!availableDioEndpointId) break;

      const draftPop: Pop = {
        ...pop,
        cables: nextCables,
        fusions: nextFusions,
      };
      if (!canConnectPopEndpoints(draftPop, cableEndpointId, availableDioEndpointId)) {
        continue;
      }

      const fusion = buildPopFusion(cableEndpointId, availableDioEndpointId, 'fusion', false);
      nextFusions = [...nextFusions, fusion];
      nextCables = applyPopFusionToCables(
        {
          ...draftPop,
          fusions: nextFusions,
          cables: nextCables,
        },
        fusion
      );
      markCableUsage(usageByEndpoint, availableDioEndpointId);
      changed = true;
    }
  }

  if (!changed) return pop;
  return {
    ...pop,
    cables: nextCables,
    fusions: nextFusions,
  };
};
