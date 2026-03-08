import type { Fiber, Pop, PopCable, PopFusion } from '@/types/ftth';
import { generateId, getPopEndpointOwner } from '@/store/networkUtils';

type PopEndpointRole =
  | 'dio'
  | 'cable'
  | 'olt-pon'
  | 'olt-uplink'
  | 'olt-aux'
  | 'switch-port'
  | 'router-wan'
  | 'router-lan'
  | 'unknown';

type PopEndpointMedium = 'optical' | 'electrical' | 'unknown';

interface ParsedPopCableEndpoint {
  cableId: string;
  fiberNumber: number;
}

const resolvePopEndpointRole = (pop: Pop, endpointId: string): PopEndpointRole => {
  const owner = getPopEndpointOwner(pop, endpointId);
  if (!owner) return 'unknown';

  if (owner.kind === 'dio') return 'dio';
  if (owner.kind === 'cable') return 'cable';

  if (owner.kind === 'olt') {
    if (endpointId.includes(':u:')) return 'olt-uplink';
    if (endpointId.includes(':b:') || endpointId.includes(':c:')) return 'olt-aux';
    if (endpointId.includes(':s:') && endpointId.includes(':p:')) return 'olt-pon';
    return 'unknown';
  }

  if (owner.kind === 'switch') return 'switch-port';

  if (owner.kind === 'router') {
    if (endpointId.includes(':wan:')) return 'router-wan';
    if (endpointId.includes(':lan:')) return 'router-lan';
    return 'unknown';
  }

  return 'unknown';
};

const getFusionsForEndpoint = (pop: Pop, endpointId: string) =>
  (pop.fusions || []).filter(
    (fusion) => fusion.endpointAId === endpointId || fusion.endpointBId === endpointId
  );

export const parsePopCableEndpoint = (endpointId: string): ParsedPopCableEndpoint | null => {
  if (!endpointId.startsWith('cable:')) return null;
  const parts = endpointId.split(':');
  const cableId = parts[1];
  const marker = parts[2];
  const fiberNumber = Number.parseInt(parts[3] || '', 10);
  if (!cableId || marker !== 'f' || Number.isNaN(fiberNumber)) return null;
  return { cableId, fiberNumber };
};

const isInactiveOltEndpoint = (pop: Pop, endpointId: string): boolean => {
  if (!endpointId.startsWith('olt:')) return false;
  const parts = endpointId.split(':');
  const oltId = parts[1];
  const olt = (pop.olts || []).find((item) => item.id === oltId);
  if (!olt) return true;

  if (endpointId.includes(':u:')) {
    const uplinkIndex = Number.parseInt(parts[3] || '', 10);
    if (Number.isNaN(uplinkIndex)) return true;
    const uplink = (olt.uplinks || []).find((item) => item.index === uplinkIndex);
    return !uplink || !uplink.active;
  }

  if (endpointId.includes(':b:')) {
    const portIndex = Number.parseInt(parts[3] || '', 10);
    if (Number.isNaN(portIndex)) return true;
    const port = (olt.bootPorts || []).find((item) => item.index === portIndex);
    return !port || !port.active;
  }

  if (endpointId.includes(':c:')) {
    const portIndex = Number.parseInt(parts[3] || '', 10);
    if (Number.isNaN(portIndex)) return true;
    const port = (olt.consolePorts || []).find((item) => item.index === portIndex);
    return !port || !port.active;
  }

  const slotIndex = Number.parseInt(parts[3] || '', 10);
  const ponIndex = Number.parseInt(parts[5] || '', 10);
  if (Number.isNaN(slotIndex) || Number.isNaN(ponIndex)) return true;
  const slot = (olt.slots || []).find((item) => item.index === slotIndex);
  const pon = (slot?.pons || []).find((item) => item.index === ponIndex);
  return !pon || !pon.active;
};

const isInactiveSwitchOrRouterEndpoint = (pop: Pop, endpointId: string): boolean => {
  if (endpointId.startsWith('switch:')) {
    const parts = endpointId.split(':');
    const switchId = parts[1];
    const kind = parts[2];
    const index = Number.parseInt(parts[3] || '', 10);
    const sw = (pop.switches || []).find((item) => item.id === switchId);
    if (!sw || Number.isNaN(index)) return true;
    if (kind === 'u') return !(sw.uplinks || []).find((item) => item.index === index)?.active;
    return !(sw.ports || []).find((item) => item.index === index)?.active;
  }

  if (endpointId.startsWith('router:')) {
    const parts = endpointId.split(':');
    const routerId = parts[1];
    const role = parts[2];
    const index = Number.parseInt(parts[3] || '', 10);
    const router = (pop.routers || []).find((item) => item.id === routerId);
    if (!router || Number.isNaN(index)) return true;
    return !router.interfaces.find(
      (item) => item.role.toLowerCase() === role && item.index === index
    )?.active;
  }

  return false;
};

export const isInactivePopEndpoint = (pop: Pop, endpointId: string): boolean =>
  isInactiveOltEndpoint(pop, endpointId) || isInactiveSwitchOrRouterEndpoint(pop, endpointId);

const isSwitchOrRouterRole = (role: PopEndpointRole) =>
  role === 'switch-port' || role === 'router-wan' || role === 'router-lan';

const isDioOpticalServiceRole = (role: PopEndpointRole) =>
  role === 'olt-pon' || role === 'switch-port' || role === 'router-wan' || role === 'router-lan';

const resolveSwitchConnector = (pop: Pop, endpointId: string): 'RJ45' | 'SFP' | 'SFP+' | null => {
  if (!endpointId.startsWith('switch:')) return null;
  const parts = endpointId.split(':');
  const switchId = parts[1];
  const kind = parts[2];
  const index = Number.parseInt(parts[3] || '', 10);
  if (!switchId || Number.isNaN(index)) return null;
  const sw = (pop.switches || []).find((item) => item.id === switchId);
  if (!sw) return null;

  if (kind === 'u') {
    return (sw.uplinks || []).find((item) => item.index === index)?.connector || 'SFP+';
  }

  return (sw.ports || []).find((item) => item.index === index)?.connector || 'RJ45';
};

const resolveRouterConnector = (pop: Pop, endpointId: string): 'RJ45' | 'SFP' | 'SFP+' | null => {
  if (!endpointId.startsWith('router:')) return null;
  const parts = endpointId.split(':');
  const routerId = parts[1];
  const role = parts[2];
  const index = Number.parseInt(parts[3] || '', 10);
  if (!routerId || Number.isNaN(index) || (role !== 'wan' && role !== 'lan')) return null;
  const router = (pop.routers || []).find((item) => item.id === routerId);
  if (!router) return null;

  const iface = router.interfaces.find(
    (item) => item.role.toLowerCase() === role && item.index === index
  );
  if (iface?.connector) return iface.connector;

  return role === 'wan' ? 'SFP+' : 'RJ45';
};

const resolveOltUplinkConnector = (pop: Pop, endpointId: string): 'RJ45' | 'SFP' | 'SFP+' | null => {
  if (!endpointId.startsWith('olt:') || !endpointId.includes(':u:')) return null;
  const parts = endpointId.split(':');
  const oltId = parts[1];
  const uplinkIndex = Number.parseInt(parts[3] || '', 10);
  if (!oltId || Number.isNaN(uplinkIndex)) return null;
  const olt = (pop.olts || []).find((item) => item.id === oltId);
  if (!olt) return null;
  return (olt.uplinks || []).find((item) => item.index === uplinkIndex)?.connector || 'SFP+';
};

const resolveEndpointMedium = (
  pop: Pop,
  endpointId: string,
  endpointRole: PopEndpointRole
): PopEndpointMedium => {
  if (endpointRole === 'dio' || endpointRole === 'cable' || endpointRole === 'olt-pon') {
    return 'optical';
  }

  if (endpointRole === 'olt-aux') return 'electrical';

  if (endpointRole === 'olt-uplink') {
    const connector = resolveOltUplinkConnector(pop, endpointId);
    if (!connector) return 'unknown';
    return connector === 'RJ45' ? 'electrical' : 'optical';
  }

  if (endpointRole === 'switch-port') {
    const connector = resolveSwitchConnector(pop, endpointId);
    if (!connector) return 'unknown';
    return connector === 'RJ45' ? 'electrical' : 'optical';
  }

  if (endpointRole === 'router-wan' || endpointRole === 'router-lan') {
    const connector = resolveRouterConnector(pop, endpointId);
    if (!connector) return 'unknown';
    return connector === 'RJ45' ? 'electrical' : 'optical';
  }

  return 'unknown';
};

const isSignalMediumCompatible = (
  pop: Pop,
  endpointAId: string,
  endpointARole: PopEndpointRole,
  endpointBId: string,
  endpointBRole: PopEndpointRole
): boolean => {
  const mediumA = resolveEndpointMedium(pop, endpointAId, endpointARole);
  const mediumB = resolveEndpointMedium(pop, endpointBId, endpointBRole);
  if (mediumA === 'unknown' || mediumB === 'unknown') return false;
  return mediumA === mediumB;
};

const canUseEndpoint = (pop: Pop, endpointId: string, otherEndpointId: string): boolean => {
  const endpointRole = resolvePopEndpointRole(pop, endpointId);
  const otherRole = resolvePopEndpointRole(pop, otherEndpointId);
  if (endpointRole === 'unknown' || otherRole === 'unknown') return false;

  const linked = getFusionsForEndpoint(pop, endpointId);
  if (endpointRole !== 'dio') {
    return linked.length === 0;
  }

  if (linked.length >= 2) return false;
  if (linked.length === 0) return true;

  let hasCableSide = false;
  let hasOpticalServiceSide = false;

  linked
    .map((fusion) => {
      const peerId = fusion.endpointAId === endpointId ? fusion.endpointBId : fusion.endpointAId;
      return resolvePopEndpointRole(pop, peerId);
    })
    .forEach((peerRole) => {
      if (peerRole === 'cable') hasCableSide = true;
      if (isDioOpticalServiceRole(peerRole)) hasOpticalServiceSide = true;
    });

  if (otherRole === 'cable') return !hasCableSide;
  if (isDioOpticalServiceRole(otherRole)) return !hasOpticalServiceSide;
  return false;
};

const isAllowedEndpointPair = (roleA: PopEndpointRole, roleB: PopEndpointRole): boolean => {
  if (roleA === 'unknown' || roleB === 'unknown') return false;
  if (roleA === roleB && roleA === 'dio') return false;

  if (roleA === 'cable' || roleB === 'cable') {
    return roleA === 'dio' || roleB === 'dio';
  }

  if (roleA === 'dio' || roleB === 'dio') {
    return isDioOpticalServiceRole(roleA === 'dio' ? roleB : roleA);
  }

  if (roleA === 'olt-pon' || roleB === 'olt-pon') return false;

  if (roleA === 'olt-uplink' || roleB === 'olt-uplink') {
    return isSwitchOrRouterRole(roleA === 'olt-uplink' ? roleB : roleA);
  }

  if (roleA === 'olt-aux' || roleB === 'olt-aux') {
    const peerRole = roleA === 'olt-aux' ? roleB : roleA;
    return peerRole === 'switch-port' || peerRole === 'router-lan';
  }

  return isSwitchOrRouterRole(roleA) && isSwitchOrRouterRole(roleB);
};

export const canConnectPopEndpoints = (
  pop: Pop,
  endpointAId: string,
  endpointBId: string
): boolean => {
  if (endpointAId === endpointBId) return false;

  const ownerA = getPopEndpointOwner(pop, endpointAId);
  const ownerB = getPopEndpointOwner(pop, endpointBId);
  if (!ownerA || !ownerB) return false;

  if (isInactivePopEndpoint(pop, endpointAId) || isInactivePopEndpoint(pop, endpointBId)) {
    return false;
  }

  const roleA = resolvePopEndpointRole(pop, endpointAId);
  const roleB = resolvePopEndpointRole(pop, endpointBId);
  if (!isAllowedEndpointPair(roleA, roleB)) return false;
  if (!isSignalMediumCompatible(pop, endpointAId, roleA, endpointBId, roleB)) return false;

  const duplicate = (pop.fusions || []).some(
    (fusion) =>
      (fusion.endpointAId === endpointAId && fusion.endpointBId === endpointBId) ||
      (fusion.endpointAId === endpointBId && fusion.endpointBId === endpointAId)
  );
  if (duplicate) return false;

  return (
    canUseEndpoint(pop, endpointAId, endpointBId) &&
    canUseEndpoint(pop, endpointBId, endpointAId)
  );
};

export const buildPopFusion = (
  endpointAId: string,
  endpointBId: string,
  fusionType: PopFusion['fusionType'] = 'fusion',
  noLoss: boolean = false,
  vlan?: number
): PopFusion => ({
  id: generateId(),
  endpointAId,
  endpointBId,
  fusionType,
  attenuation: noLoss ? 0 : fusionType === 'connector' ? 0.2 : fusionType === 'mechanical' ? 0.2 : 0.1,
  vlan: typeof vlan === 'number' ? vlan : undefined,
  dateCreated: new Date().toISOString(),
});

const getPopCableFiberId = (cablesById: Map<string, PopCable>, endpoint: ParsedPopCableEndpoint | null) => {
  if (!endpoint) return undefined;
  const targetCable = cablesById.get(endpoint.cableId);
  const targetFiber = targetCable?.fibers.find((item) => item.number === endpoint.fiberNumber);
  return targetFiber?.id;
};

const activateFiber = (fiber: Fiber, fusionId: string, connectedTo?: string): Fiber => ({
  ...fiber,
  connectedTo,
  fusionId,
  status: fiber.status === 'faulty' ? 'faulty' : 'active',
});

export const applyPopFusionToCables = (pop: Pop, fusion: PopFusion): PopCable[] => {
  const endpointA = parsePopCableEndpoint(fusion.endpointAId);
  const endpointB = parsePopCableEndpoint(fusion.endpointBId);
  const cablesById = new Map((pop.cables || []).map((cable) => [cable.id, cable]));
  const endpointAFiberId = getPopCableFiberId(cablesById, endpointA);
  const endpointBFiberId = getPopCableFiberId(cablesById, endpointB);

  return (pop.cables || []).map((cable) => {
    const endpointMatchesA = endpointA?.cableId === cable.id;
    const endpointMatchesB = endpointB?.cableId === cable.id;
    if (!endpointMatchesA && !endpointMatchesB) return cable;

    return {
      ...cable,
      fibers: cable.fibers.map((fiber) => {
        const matchesA = endpointMatchesA && fiber.number === endpointA!.fiberNumber;
        const matchesB = endpointMatchesB && fiber.number === endpointB!.fiberNumber;
        if (!matchesA && !matchesB) return fiber;
        if (matchesA) return activateFiber(fiber, fusion.id, endpointBFiberId);
        if (matchesB) return activateFiber(fiber, fusion.id, endpointAFiberId);
        return fiber;
      }),
    };
  });
};

export const clearPopFusionFromCables = (cables: PopCable[], fusionId: string): PopCable[] =>
  (cables || []).map((cable) => ({
    ...cable,
    fibers: cable.fibers.map((fiber) =>
      fiber.fusionId === fusionId
        ? {
            ...fiber,
            fusionId: undefined,
            connectedTo: undefined,
            status: fiber.status === 'faulty' ? 'faulty' : 'inactive',
          }
        : fiber
    ),
  }));
