import type { Fiber, Pop, PopCable, PopFusion } from '@/types/ftth';
import { generateId, getPopEndpointOwner } from '@/store/networkUtils';

type PopEndpointKind = 'dio' | 'cable' | 'olt' | 'switch' | 'router';

interface ParsedPopCableEndpoint {
  cableId: string;
  fiberNumber: number;
}

const isEquipmentKind = (kind: PopEndpointKind) =>
  kind === 'olt' || kind === 'switch' || kind === 'router';

const getEndpointKind = (pop: Pop, endpointId: string): PopEndpointKind | null =>
  getPopEndpointOwner(pop, endpointId)?.kind || null;

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

const canUseEndpoint = (pop: Pop, endpointId: string, otherEndpointId: string): boolean => {
  const endpointKind = getEndpointKind(pop, endpointId);
  const otherKind = getEndpointKind(pop, otherEndpointId);
  if (!endpointKind || !otherKind) return false;

  const linked = getFusionsForEndpoint(pop, endpointId);
  if (endpointKind !== 'dio') {
    return linked.length === 0;
  }

  if (linked.length >= 2) return false;
  if (linked.length === 0) return true;

  const existingOtherKinds = linked
    .map((fusion) => {
      const peerId = fusion.endpointAId === endpointId ? fusion.endpointBId : fusion.endpointAId;
      return getEndpointKind(pop, peerId);
    })
    .filter((kind): kind is PopEndpointKind => Boolean(kind));

  const hasCableSide = existingOtherKinds.some((kind) => kind === 'cable');
  const hasEquipmentSide = existingOtherKinds.some((kind) => isEquipmentKind(kind));

  if (otherKind === 'cable') return !hasCableSide;
  if (isEquipmentKind(otherKind)) return !hasEquipmentSide;
  return false;
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
  if (ownerA.kind === 'dio' && ownerB.kind === 'dio') return false;

  if (
    (ownerA.kind === 'cable' && ownerB.kind !== 'dio') ||
    (ownerB.kind === 'cable' && ownerA.kind !== 'dio')
  ) {
    return false;
  }

  if (
    (isEquipmentKind(ownerA.kind) && ownerB.kind !== 'dio') ||
    (isEquipmentKind(ownerB.kind) && ownerA.kind !== 'dio')
  ) {
    return false;
  }

  if (isInactivePopEndpoint(pop, endpointAId) || isInactivePopEndpoint(pop, endpointBId)) {
    return false;
  }

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
