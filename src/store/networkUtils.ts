import type { Fiber, Fusion, Network, Pop, PopFusion, Position, Splitter } from '@/types/ftth';
import { DEFAULT_CABLE_FIBERS_PER_TUBE, FIBER_COLORS } from '@/types/ftth';

export const generateId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const generateFibers = (
  count: number,
  startNumber: number = 1,
  fibersPerTube: number = DEFAULT_CABLE_FIBERS_PER_TUBE
): Fiber[] => {
  const safeFibersPerTube = Math.max(1, fibersPerTube);
  return Array.from({ length: count }, (_, i) => {
    const fiberNum = startNumber + i;
    const colorIndex = (fiberNum - 1) % FIBER_COLORS.length;
    const localIndex = i;
    const tubeNumber = Math.floor(localIndex / safeFibersPerTube) + 1;

    return {
      id: generateId(),
      number: fiberNum,
      color: FIBER_COLORS[colorIndex],
      status: 'inactive',
      tubeNumber,
    } as Fiber;
  });
};

export const calculateDistanceMeters = (a: Position, b: Position) => {
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadius * (2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
};

export const calculateGponLoss = (
  comprimentoMetros: number,
  { emendas = 0, conectores = 0, splitterDb = 0 }: { emendas?: number; conectores?: number; splitterDb?: number } = {}
) => {
  const km = comprimentoMetros / 1000;
  const perdaFibra = km * 0.25;
  const perdaEmendas = emendas * 0.1;
  const perdaConectores = conectores * 0.2;
  return perdaFibra + perdaEmendas + perdaConectores + splitterDb;
};

export const getFiberById = (network: Network, fiberId: string): Fiber | undefined => {
  for (const box of network.boxes) {
    const boxFiber = box.fibers.find((fiber) => fiber.id === fiberId);
    if (boxFiber) return boxFiber;

    for (const splitter of box.splitters || []) {
      const inputFiber = splitter.inputFibers.find((fiber) => fiber.id === fiberId);
      if (inputFiber) return inputFiber;

      const outputFiber = splitter.outputFibers.find((fiber) => fiber.id === fiberId);
      if (outputFiber) return outputFiber;
    }
  }

  for (const cable of network.cables) {
    const cableFiber = cable.fibers.find((fiber) => fiber.id === fiberId);
    if (cableFiber) return cableFiber;
  }

  for (const pop of network.pops || []) {
    for (const cable of pop.cables || []) {
      const cableFiber = cable.fibers.find((fiber) => fiber.id === fiberId);
      if (cableFiber) return cableFiber;
    }
  }

  return undefined;
};

export const getFiberOwnerLabel = (network: Network, fiberId: string): string | null => {
  for (const box of network.boxes) {
    const boxFiber = box.fibers.find((fiber) => fiber.id === fiberId);
    if (boxFiber) return `${box.name} (Caixa)`;

    for (const splitter of box.splitters || []) {
      const inputFiber = splitter.inputFibers.find((fiber) => fiber.id === fiberId);
      if (inputFiber) return `${box.name} - ${splitter.name} (IN)`;

      const outputFiber = splitter.outputFibers.find((fiber) => fiber.id === fiberId);
      if (outputFiber) return `${box.name} - ${splitter.name} (OUT)`;
    }
  }

  for (const cable of network.cables) {
    const cableFiber = cable.fibers.find((fiber) => fiber.id === fiberId);
    if (cableFiber) return `${cable.name} (Cabo)`;
  }

  for (const pop of network.pops || []) {
    for (const cable of pop.cables || []) {
      const cableFiber = cable.fibers.find((fiber) => fiber.id === fiberId);
      if (cableFiber) return `${pop.name} - ${cable.name} (Cabo POP)`;
    }
  }

  return null;
};

export const getFusionAttenuation = (fusion: Fusion): number => {
  if (typeof fusion.attenuation === 'number') return fusion.attenuation;
  if (fusion.fusionType === 'connector') return 0.2;
  if (fusion.fusionType === 'mechanical') return 0.2;
  return 0.1;
};

export const getPopEndpointOwner = (
  pop: Pop,
  endpointId: string
): { kind: 'dio' | 'cable' | 'olt' | 'switch' | 'router'; id: string } | null => {
  if (endpointId.startsWith('dio:')) {
    const parts = endpointId.split(':');
    const dioId = parts[1];
    if (!dioId) return null;
    return pop.dios.some((dio) => dio.id === dioId) ? { kind: 'dio', id: dioId } : null;
  }

  if (endpointId.startsWith('cable:')) {
    const parts = endpointId.split(':');
    const cableId = parts[1];
    if (!cableId) return null;
    return pop.cables.some((cable) => cable.id === cableId) ? { kind: 'cable', id: cableId } : null;
  }

  if (endpointId.startsWith('olt:')) {
    const parts = endpointId.split(':');
    const oltId = parts[1];
    if (!oltId) return null;
    return pop.olts.some((olt) => olt.id === oltId) ? { kind: 'olt', id: oltId } : null;
  }

  if (endpointId.startsWith('switch:')) {
    const parts = endpointId.split(':');
    const switchId = parts[1];
    if (!switchId) return null;
    return pop.switches?.some((sw) => sw.id === switchId) ? { kind: 'switch', id: switchId } : null;
  }

  if (endpointId.startsWith('router:')) {
    const parts = endpointId.split(':');
    const routerId = parts[1];
    if (!routerId) return null;
    return pop.routers?.some((router) => router.id === routerId) ? { kind: 'router', id: routerId } : null;
  }

  return null;
};

export const updateFiberInNetwork = (
  network: Network,
  fiberId: string,
  updater: (fiber: Fiber) => Fiber
): Network => {
  let changed = false;

  const boxes = network.boxes.map((box) => {
    let boxChanged = false;
    const fibers = box.fibers.map((fiber) => {
      if (fiber.id !== fiberId) return fiber;
      boxChanged = true;
      changed = true;
      return updater(fiber);
    });

    const splitters = (box.splitters || []).map((splitter) => {
      let splitterChanged = false;
      const inputFibers = splitter.inputFibers.map((fiber) => {
        if (fiber.id !== fiberId) return fiber;
        splitterChanged = true;
        changed = true;
        return updater(fiber);
      });
      const outputFibers = splitter.outputFibers.map((fiber) => {
        if (fiber.id !== fiberId) return fiber;
        splitterChanged = true;
        changed = true;
        return updater(fiber);
      });

      if (!splitterChanged) return splitter;
      boxChanged = true;
      return { ...splitter, inputFibers, outputFibers };
    });

    if (!boxChanged) return box;
    return { ...box, fibers, splitters };
  });

  const cables = network.cables.map((cable) => {
    let cableChanged = false;
    const fibers = cable.fibers.map((fiber) => {
      if (fiber.id !== fiberId) return fiber;
      cableChanged = true;
      changed = true;
      return updater(fiber);
    });
    if (!cableChanged) return cable;
    return { ...cable, fibers };
  });

  if (!changed) return network;
  return { ...network, boxes, cables };
};

export const attachFusionToNetwork = (network: Network, fusion: Fusion): Network => {
  let next = updateFiberInNetwork(network, fusion.fiberAId, (fiber) => ({
    ...fiber,
    connectedTo: fusion.fiberBId,
    fusionId: fusion.id,
    status: fiber.status === 'faulty' ? fiber.status : 'active',
  }));

  next = updateFiberInNetwork(next, fusion.fiberBId, (fiber) => ({
    ...fiber,
    connectedTo: fusion.fiberAId,
    fusionId: fusion.id,
    status: fiber.status === 'faulty' ? fiber.status : 'active',
  }));

  const fusionBoxes = new Set([fusion.boxAId, fusion.boxBId]);
  const boxes = next.boxes.map((box) =>
    fusionBoxes.has(box.id) ? { ...box, fusions: [...box.fusions, fusion] } : box
  );

  return {
    ...next,
    boxes,
    fusions: [...next.fusions, fusion],
    updatedAt: new Date().toISOString(),
  };
};

export const detachFusionFromNetwork = (network: Network, fusionId: string): Network => {
  const fusion = network.fusions.find((item) => item.id === fusionId);
  if (!fusion) return network;

  let next = updateFiberInNetwork(network, fusion.fiberAId, (fiber) => ({
    ...fiber,
    connectedTo: undefined,
    fusionId: undefined,
    status: fiber.status === 'faulty' ? fiber.status : 'inactive',
  }));

  next = updateFiberInNetwork(next, fusion.fiberBId, (fiber) => ({
    ...fiber,
    connectedTo: undefined,
    fusionId: undefined,
    status: fiber.status === 'faulty' ? fiber.status : 'inactive',
  }));

  const fusionBoxes = new Set([fusion.boxAId, fusion.boxBId]);
  const boxes = next.boxes.map((box) =>
    fusionBoxes.has(box.id)
      ? { ...box, fusions: box.fusions.filter((item) => item.id !== fusionId) }
      : box
  );

  return {
    ...next,
    boxes,
    fusions: next.fusions.filter((item) => item.id !== fusionId),
    updatedAt: new Date().toISOString(),
  };
};

export const getBoxEndpointFiberIds = (network: Network, boxId: string): Set<string> => {
  const endpoints = new Set<string>();
  const box = network.boxes.find((item) => item.id === boxId);
  if (!box) return endpoints;

  (box.splitters || []).forEach((splitter) => {
    splitter.inputFibers.forEach((fiber) => endpoints.add(fiber.id));
    splitter.outputFibers.forEach((fiber) => endpoints.add(fiber.id));
  });

  network.cables
    .filter(
      (cable) =>
        cable.startPoint === boxId ||
        cable.endPoint === boxId ||
        (cable.attachments || []).some(
          (attachment) => attachment.kind === 'box' && attachment.entityId === boxId
        )
    )
    .forEach((cable) => {
      cable.fibers.forEach((fiber) => endpoints.add(fiber.id));
    });

  return endpoints;
};

export const getLocalFusionForEndpoint = (
  network: Network,
  boxId: string,
  endpointId: string
): Fusion | undefined => {
  return network.fusions.find(
    (fusion) =>
      fusion.boxAId === boxId &&
      fusion.boxBId === boxId &&
      (fusion.fiberAId === endpointId || fusion.fiberBId === endpointId)
  );
};

export const getSplitterPortCount = (type: Splitter['type']) => {
  const [inputRaw, outputRaw] = type.split('x');
  const input = Number.parseInt(inputRaw, 10);
  const output = Number.parseInt(outputRaw, 10);

  return {
    input: Number.isNaN(input) ? 1 : input,
    output: Number.isNaN(output) ? 2 : output,
  };
};

type PopPathEdge = {
  endpointId: string;
  attenuation: number;
  fusion: PopFusion;
};

const getPopCableFiberByEndpoint = (pop: Pop, endpointId: string): Fiber | null => {
  if (!endpointId.startsWith('cable:')) return null;
  const parts = endpointId.split(':');
  const cableId = parts[1];
  const marker = parts[2];
  const fiberNumberRaw = parts[3];
  if (!cableId || marker !== 'f') return null;
  const fiberNumber = Number.parseInt(fiberNumberRaw || '', 10);
  if (Number.isNaN(fiberNumber)) return null;
  const cable = (pop.cables || []).find((item) => item.id === cableId);
  if (!cable) return null;
  return cable.fibers.find((fiber) => fiber.number === fiberNumber) || null;
};

const getPopCableEndpointByFiberId = (pop: Pop, fiberId: string): string | null => {
  for (const cable of pop.cables || []) {
    const fiber = cable.fibers.find((item) => item.id === fiberId);
    if (fiber) return `cable:${cable.id}:f:${fiber.number}`;
  }
  return null;
};

const getPopNeighbors = (pop: Pop, endpointId: string): PopPathEdge[] => {
  const neighbors: PopPathEdge[] = [];
  for (const fusion of pop.fusions || []) {
    if (fusion.endpointAId === endpointId) {
      neighbors.push({
        endpointId: fusion.endpointBId,
        attenuation: typeof fusion.attenuation === 'number' ? fusion.attenuation : 0,
        fusion,
      });
      continue;
    }
    if (fusion.endpointBId === endpointId) {
      neighbors.push({
        endpointId: fusion.endpointAId,
        attenuation: typeof fusion.attenuation === 'number' ? fusion.attenuation : 0,
        fusion,
      });
    }
  }
  return neighbors;
};

const resolvePonTxPower = (pop: Pop, endpointId: string): number | null => {
  if (!endpointId.startsWith('olt:')) return null;
  const parts = endpointId.split(':');
  const oltId = parts[1];
  const olt = (pop.olts || []).find((item) => item.id === oltId);
  if (!olt) return null;
  if (!endpointId.includes(':s:')) return null;
  const slotIndex = Number.parseInt(parts[3] || '', 10);
  const ponIndex = Number.parseInt(parts[5] || '', 10);
  if (Number.isNaN(slotIndex) || Number.isNaN(ponIndex)) return null;
  const slot = (olt.slots || []).find((item) => item.index === slotIndex);
  const pon = (slot?.pons || []).find((item) => item.index === ponIndex);
  if (!pon?.active) return null;
  return typeof pon.gbic?.txPowerDbm === 'number' ? pon.gbic.txPowerDbm : null;
};

export interface PopFiberHopResult {
  nextFiberId: string;
  attenuation: number;
  fusionCount: number;
  popId: string;
  popName: string;
}

export const resolveNextFiberThroughPop = (network: Network, fiberId: string): PopFiberHopResult | null => {
  for (const pop of network.pops || []) {
    const startEndpoint = getPopCableEndpointByFiberId(pop, fiberId);
    if (!startEndpoint) continue;

    const queue: Array<{ endpointId: string; attenuation: number; fusionCount: number }> = [
      { endpointId: startEndpoint, attenuation: 0, fusionCount: 0 },
    ];
    const visited = new Set<string>([startEndpoint]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = getPopNeighbors(pop, current.endpointId);
      for (const edge of neighbors) {
        if (visited.has(edge.endpointId)) continue;
        visited.add(edge.endpointId);
        const nextAttenuation = current.attenuation + edge.attenuation;
        const nextFusionCount = current.fusionCount + 1;
        const targetFiber = getPopCableFiberByEndpoint(pop, edge.endpointId);
        if (targetFiber && targetFiber.id !== fiberId) {
          return {
            nextFiberId: targetFiber.id,
            attenuation: Number(nextAttenuation.toFixed(3)),
            fusionCount: nextFusionCount,
            popId: pop.id,
            popName: pop.name,
          };
        }
        queue.push({
          endpointId: edge.endpointId,
          attenuation: nextAttenuation,
          fusionCount: nextFusionCount,
        });
      }
    }
  }
  return null;
};

export interface FiberSignalAtPopResult {
  popId: string;
  popName: string;
  oltEndpointId: string;
  txPowerDbm: number;
  popLossDb: number;
  estimatedRxDbm: number;
}

export const estimateSignalAtPopForFiber = (network: Network, fiberId: string): FiberSignalAtPopResult | null => {
  for (const pop of network.pops || []) {
    const startEndpoint = getPopCableEndpointByFiberId(pop, fiberId);
    if (!startEndpoint) continue;

    const queue: Array<{ endpointId: string; attenuation: number }> = [
      { endpointId: startEndpoint, attenuation: 0 },
    ];
    const visited = new Set<string>([startEndpoint]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const txPowerDbm = resolvePonTxPower(pop, current.endpointId);
      if (typeof txPowerDbm === 'number') {
        return {
          popId: pop.id,
          popName: pop.name,
          oltEndpointId: current.endpointId,
          txPowerDbm,
          popLossDb: Number(current.attenuation.toFixed(3)),
          estimatedRxDbm: Number((txPowerDbm - current.attenuation).toFixed(3)),
        };
      }

      const neighbors = getPopNeighbors(pop, current.endpointId);
      for (const edge of neighbors) {
        if (visited.has(edge.endpointId)) continue;
        visited.add(edge.endpointId);
        queue.push({
          endpointId: edge.endpointId,
          attenuation: current.attenuation + edge.attenuation,
        });
      }
    }
  }
  return null;
};
