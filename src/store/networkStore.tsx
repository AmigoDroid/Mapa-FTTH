import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { 
  Network, 
  Box, 
  Cable, 
  Fiber, 
  Fusion, 
  Splitter,
  City,
  Pop,
  PopDio,
  PopOlt,
  PopCable,
  PopFusion,
  PopSwitch,
  PopSwitchPort,
  PopRouter,
  PopRouterInterface,
  OltSlot,
  OltPon,
  OltGbic,
  OltUplink,
  OltAuxPort,
  ReservePoint,
  Position, 
  ContinuityTest,
  Client,
} from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';

interface NetworkState {
  currentNetwork: Network | null;
  selectedBox: Box | null;
  selectedPop: Pop | null;
  selectedCable: Cable | null;
  selectedFiber: Fiber | null;
  continuityTests: ContinuityTest[];
  clients: Client[];
  isEditing: boolean;
  showFusionModal: boolean;
  showContinuityModal: boolean;
  activeFusion: { boxA: Box; boxB: Box; fiberA: Fiber; fiberB: Fiber } | null;
}

interface NetworkActions {
  setCurrentNetwork: (network: Network) => void;
  createNetwork: (name: string, description?: string) => Network;
  addBox: (box: Omit<Box, 'id' | 'fibers' | 'fusions' | 'inputCables' | 'outputCables'>) => Box;
  addCity: (city: Omit<City, 'id' | 'popIds'>) => City;
  addPop: (pop: Omit<Pop, 'id' | 'dios' | 'olts' | 'switches' | 'routers' | 'cables' | 'fusions'>) => Pop;
  updatePop: (popId: string, updates: Partial<Pop>) => void;
  removePop: (popId: string) => void;
  addDioToPop: (popId: string, dioData: Omit<PopDio, 'id'>) => PopDio | null;
  addOltToPop: (popId: string, oltData: { name: string; type: PopOlt['type']; uplinkPortCount: number; bootPortCount: number; consolePortCount: number }) => PopOlt | null;
  addSlotToOlt: (popId: string, oltId: string, ponCount: number) => OltSlot | null;
  activateOltPon: (popId: string, oltId: string, slotId: string, ponId: string, gbicModel: string, txPowerDbm: number) => void;
  addSwitchToPop: (popId: string, switchData: { name: string; portCount: number; uplinkPortCount: number }) => PopSwitch | null;
  addRouterToPop: (popId: string, routerData: { name: string; wanCount: number; lanCount: number }) => PopRouter | null;
  removeDioFromPop: (popId: string, dioId: string) => void;
  removeOltFromPop: (popId: string, oltId: string) => void;
  removeSwitchFromPop: (popId: string, switchId: string) => void;
  removeRouterFromPop: (popId: string, routerId: string) => void;
  toggleOltUplink: (popId: string, oltId: string, uplinkId: string) => void;
  addPonToOlt: (popId: string, oltId: string, slotId?: string) => OltPon | null;
  toggleOltPon: (popId: string, oltId: string, slotId: string, ponId: string) => void;
  toggleSwitchPort: (popId: string, switchId: string, portId: string, isUplink: boolean) => void;
  toggleRouterInterface: (popId: string, routerId: string, interfaceId: string) => void;
  addCableToPop: (popId: string, cableData: Omit<PopCable, 'id' | 'fibers'>) => PopCable | null;
  connectPopEndpoints: (popId: string, endpointAId: string, endpointBId: string, fusionType?: PopFusion['fusionType'], noLoss?: boolean, vlan?: number) => PopFusion | null;
  disconnectPopFusion: (popId: string, fusionId: string) => void;
  updateBox: (boxId: string, updates: Partial<Box>) => void;
  removeBox: (boxId: string) => void;
  addCable: (cable: Omit<Cable, 'id' | 'fibers'>) => Cable;
  updateCable: (cableId: string, updates: Partial<Cable>) => void;
  removeCable: (cableId: string) => void;
  addReserve: (reserve: Omit<ReservePoint, 'id'>) => ReservePoint;
  updateReserve: (reserveId: string, updates: Partial<ReservePoint>) => void;
  removeReserve: (reserveId: string) => void;
  addFusion: (fusion: Omit<Fusion, 'id' | 'dateCreated'>) => Fusion;
  removeFusion: (fusionId: string) => void;
  connectFibers: (boxAId: string, fiberAId: string, boxBId: string, fiberBId: string, position: Position) => Fusion | null;
  connectBoxEndpoints: (
    boxId: string,
    endpointAId: string,
    endpointBId: string,
    fusionType?: Fusion['fusionType'],
    noLoss?: boolean
  ) => Fusion | null;
  disconnectFibers: (fusionId: string) => void;
  addSplitterToBox: (boxId: string, splitterData: Omit<Splitter, 'id' | 'inputFibers' | 'outputFibers' | 'attenuation' | 'status'>) => Splitter | null;
  removeSplitterFromBox: (boxId: string, splitterId: string) => void;
  testContinuity: (test: Omit<ContinuityTest, 'id' | 'testedAt'>) => ContinuityTest;
  selectBox: (box: Box | null) => void;
  selectPop: (pop: Pop | null) => void;
  selectCable: (cable: Cable | null) => void;
  selectFiber: (fiber: Fiber | null) => void;
  setEditing: (editing: boolean) => void;
  setShowFusionModal: (show: boolean) => void;
  setShowContinuityModal: (show: boolean) => void;
  setActiveFusion: (fusion: { boxA: Box; boxB: Box; fiberA: Fiber; fiberB: Fiber } | null) => void;
  getFiberPath: (fiberId: string) => { box: Box; cable?: Cable; fusion?: Fusion }[];
  getFiberContinuity: (fiberId: string) => { connected: boolean; path: string[]; attenuation: number };
  generateFibers: (count: number, startNumber?: number) => Fiber[];
  importNetwork: (networkData: string) => boolean;
  exportNetwork: () => string;
  resetNetwork: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const generateFibers = (count: number, startNumber: number = 1, fibersPerTube: number = 12): Fiber[] => {
  const safeFibersPerTube = Math.max(1, fibersPerTube);
  return Array.from({ length: count }, (_, i) => {
    const fiberNum = startNumber + i;
    const colorIndex = (fiberNum - 1) % 12;
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

const calculateDistanceMeters = (a: Position, b: Position) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const q =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)));
};

const calculateGponLoss = (
  comprimentoMetros: number,
  { emendas = 0, conectores = 0, splitterDb = 0 }: { emendas?: number; conectores?: number; splitterDb?: number } = {}
) => {
  const km = comprimentoMetros / 1000;
  const perdaFibra = km * 0.25;
  const perdaEmendas = emendas * 0.1;
  const perdaConectores = conectores * 0.2;
  return perdaFibra + perdaEmendas + perdaConectores + splitterDb;
};

const getFiberById = (network: Network, fiberId: string): Fiber | undefined => {
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

  return undefined;
};

const getFiberOwnerLabel = (network: Network, fiberId: string): string | null => {
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

  return null;
};

const getFusionAttenuation = (fusion: Fusion): number => {
  if (typeof fusion.attenuation === 'number') return fusion.attenuation;
  if (fusion.fusionType === 'connector') return 0.2;
  if (fusion.fusionType === 'mechanical') return 0.2;
  return 0.1;
};

const getPopEndpointOwner = (pop: Pop, endpointId: string): { kind: 'dio' | 'cable' | 'olt' | 'switch' | 'router'; id: string } | null => {
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

const updateFiberInNetwork = (
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

const attachFusionToNetwork = (network: Network, fusion: Fusion): Network => {
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

const detachFusionFromNetwork = (network: Network, fusionId: string): Network => {
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

const getBoxEndpointFiberIds = (network: Network, boxId: string): Set<string> => {
  const endpoints = new Set<string>();
  const box = network.boxes.find((item) => item.id === boxId);
  if (!box) return endpoints;

  (box.splitters || []).forEach((splitter) => {
    splitter.inputFibers.forEach((fiber) => endpoints.add(fiber.id));
    splitter.outputFibers.forEach((fiber) => endpoints.add(fiber.id));
  });

  network.cables
    .filter((cable) => cable.startPoint === boxId || cable.endPoint === boxId)
    .forEach((cable) => {
      cable.fibers.forEach((fiber) => endpoints.add(fiber.id));
    });

  return endpoints;
};

const getLocalFusionForEndpoint = (network: Network, boxId: string, endpointId: string): Fusion | undefined => {
  return network.fusions.find(
    (fusion) =>
      fusion.boxAId === boxId &&
      fusion.boxBId === boxId &&
      (fusion.fiberAId === endpointId || fusion.fiberBId === endpointId)
  );
};

const getSplitterPortCount = (type: Splitter['type']) => {
  const [inputRaw, outputRaw] = type.split('x');
  const input = Number.parseInt(inputRaw, 10);
  const output = Number.parseInt(outputRaw, 10);

  return {
    input: Number.isNaN(input) ? 1 : input,
    output: Number.isNaN(output) ? 2 : output,
  };
};

const NetworkContext = createContext<(NetworkState & NetworkActions) | null>(null);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState>({
    currentNetwork: null,
    selectedBox: null,
    selectedPop: null,
    selectedCable: null,
    selectedFiber: null,
    continuityTests: [],
    clients: [],
    isEditing: false,
    showFusionModal: false,
    showContinuityModal: false,
    activeFusion: null,
  });

  const setCurrentNetwork = useCallback((network: Network) => {
    setState(prev => ({ ...prev, currentNetwork: network }));
  }, []);

  const createNetwork = useCallback((name: string, description?: string) => {
    const network: Network = {
      id: generateId(),
      name,
      description,
      cities: [],
      pops: [],
      boxes: [],
      reserves: [],
      cables: [],
      fusions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, currentNetwork: network }));
    return network;
  }, []);

  const addCity = useCallback((cityData: Omit<City, 'id' | 'popIds'>) => {
    const city: City = {
      ...cityData,
      id: generateId(),
      popIds: [],
    };

    setState((prev) => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cities: [...(prev.currentNetwork.cities || []), city],
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return city;
  }, []);

  const addPop = useCallback((popData: Omit<Pop, 'id' | 'dios' | 'olts' | 'switches' | 'routers' | 'cables' | 'fusions'>) => {
    const pop: Pop = {
      ...popData,
      id: generateId(),
      fusionLayout: {},
      dios: [],
      olts: [],
      switches: [],
      routers: [],
      cables: [],
      fusions: [],
    };

    setState((prev) => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          pops: [...(prev.currentNetwork.pops || []), pop],
          cities: (prev.currentNetwork.cities || []).map((city) =>
            city.id === pop.cityId && !city.popIds.includes(pop.id)
              ? { ...city, popIds: [...city.popIds, pop.id] }
              : city
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return pop;
  }, []);

  const updatePop = useCallback((popId: string, updates: Partial<Pop>) => {
    setState((prev) => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          pops: (prev.currentNetwork.pops || []).map((pop) =>
            pop.id === popId ? { ...pop, ...updates } : pop
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const removePop = useCallback((popId: string) => {
    setState((prev) => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          pops: (prev.currentNetwork.pops || []).filter((pop) => pop.id !== popId),
          cities: (prev.currentNetwork.cities || []).map((city) => ({
            ...city,
            popIds: city.popIds.filter((id) => id !== popId),
          })),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const addBox = useCallback((boxData: Omit<Box, 'id' | 'fibers' | 'fusions' | 'inputCables' | 'outputCables'>) => {
    const box: Box = {
      ...boxData,
      id: generateId(),
      fibers: generateFibers(boxData.capacity),
      inputCables: [],
      outputCables: [],
      fusionLayout: {},
      fusions: [],
    };

    setState(prev => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          boxes: [...prev.currentNetwork.boxes, box],
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return box;
  }, []);

  const updateBox = useCallback((boxId: string, updates: Partial<Box>) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          boxes: prev.currentNetwork.boxes.map(box =>
            box.id === boxId ? { ...box, ...updates } : box
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const removeBox = useCallback((boxId: string) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          boxes: prev.currentNetwork.boxes.filter(box => box.id !== boxId),
          cables: prev.currentNetwork.cables.filter(
            cable => cable.startPoint !== boxId && cable.endPoint !== boxId
          ).map((cable) => ({
            ...cable,
            attachments: (cable.attachments || []).filter((attachment) => !(attachment.kind === 'box' && attachment.entityId === boxId)),
          })),
          fusions: prev.currentNetwork.fusions.filter(
            fusion => fusion.boxAId !== boxId && fusion.boxBId !== boxId
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const addCable = useCallback((cableData: Omit<Cable, 'id' | 'fibers'>) => {
    const fibersPerTube = Math.max(1, cableData.fibersPerTube || 12);
    const looseTubeCount = Math.max(1, cableData.looseTubeCount || Math.ceil(cableData.fiberCount / fibersPerTube));
    const maxCapacity = looseTubeCount * fibersPerTube;
    const normalizedFiberCount = Math.min(Math.max(1, cableData.fiberCount), maxCapacity);
    const cable: Cable = {
      ...cableData,
      fiberCount: normalizedFiberCount,
      fibersPerTube,
      looseTubeCount,
      model: cableData.model || 'AS-80',
      id: generateId(),
      fibers: generateFibers(normalizedFiberCount, 1, fibersPerTube),
    };

    setState(prev => {
      if (!prev.currentNetwork) return prev;
      
      const updatedCables = [...prev.currentNetwork.cables, cable];
      const updatedBoxes = prev.currentNetwork.boxes.map(box => {
        if (box.id === cable.startPoint) {
          return { ...box, outputCables: [...box.outputCables, cable.id] };
        }
        if (box.id === cable.endPoint) {
          return { ...box, inputCables: [...box.inputCables, cable.id] };
        }
        return box;
      });

      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cables: updatedCables,
          boxes: updatedBoxes,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return cable;
  }, []);

  const updateCable = useCallback((cableId: string, updates: Partial<Cable>) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      const currentCable = prev.currentNetwork.cables.find((cable) => cable.id === cableId);
      if (!currentCable) return prev;
      const nextCable = { ...currentCable, ...updates };
      const endpointChanged =
        currentCable.startPoint !== nextCable.startPoint ||
        currentCable.endPoint !== nextCable.endPoint;

      const updatedBoxes = endpointChanged
        ? prev.currentNetwork.boxes.map((box) => {
            const nextOutput = box.outputCables.filter((id) => id !== cableId);
            const nextInput = box.inputCables.filter((id) => id !== cableId);

            if (box.id === nextCable.startPoint && !nextOutput.includes(cableId)) {
              nextOutput.push(cableId);
            }
            if (box.id === nextCable.endPoint && !nextInput.includes(cableId)) {
              nextInput.push(cableId);
            }

            return { ...box, outputCables: nextOutput, inputCables: nextInput };
          })
        : prev.currentNetwork.boxes;

      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cables: prev.currentNetwork.cables.map(cable =>
            cable.id === cableId ? { ...cable, ...updates } : cable
          ),
          boxes: updatedBoxes,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const removeCable = useCallback((cableId: string) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      const cable = prev.currentNetwork.cables.find((item) => item.id === cableId);
      if (!cable) return prev;

      const cableFiberIds = new Set(cable.fibers.map((fiber) => fiber.id));
      const affectedFusions = prev.currentNetwork.fusions
        .filter(
          (fusion) => cableFiberIds.has(fusion.fiberAId) || cableFiberIds.has(fusion.fiberBId)
        )
        .map((fusion) => fusion.id);

      const withoutCable = {
        ...prev.currentNetwork,
        cables: prev.currentNetwork.cables.filter((item) => item.id !== cableId),
        boxes: prev.currentNetwork.boxes.map((box) => ({
          ...box,
          inputCables: box.inputCables.filter(id => id !== cableId),
          outputCables: box.outputCables.filter(id => id !== cableId),
        })),
      };

      const cleanedNetwork = affectedFusions.reduce(
        (acc, fusionId) => detachFusionFromNetwork(acc, fusionId),
        withoutCable
      );

      return {
        ...prev,
        currentNetwork: {
          ...cleanedNetwork,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const addDioToPop = useCallback((popId: string, dioData: Omit<PopDio, 'id'>) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const dio: PopDio = {
      id: generateId(),
      name: dioData.name,
      portCount: Math.max(1, dioData.portCount),
    };

    updatePop(popId, { dios: [...pop.dios, dio] });
    return dio;
  }, [state.currentNetwork, updatePop]);

  const addOltToPop = useCallback((popId: string, oltData: { name: string; type: PopOlt['type']; uplinkPortCount: number; bootPortCount: number; consolePortCount: number }) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const uplinkPortCount = Math.max(1, oltData.uplinkPortCount || 2);
    const bootPortCount = Math.max(0, oltData.bootPortCount || 0);
    const consolePortCount = Math.max(0, oltData.consolePortCount || 0);
    const uplinks: OltUplink[] = Array.from({ length: uplinkPortCount }, (_, idx) => ({
      id: generateId(),
      index: idx + 1,
      active: true,
      connector: 'SFP+',
      speed: '10G',
    }));
    const bootPorts: OltAuxPort[] = Array.from({ length: bootPortCount }, (_, idx) => ({
      id: generateId(),
      index: idx + 1,
      active: true,
      role: 'BOOT',
    }));
    const consolePorts: OltAuxPort[] = Array.from({ length: consolePortCount }, (_, idx) => ({
      id: generateId(),
      index: idx + 1,
      active: true,
      role: 'CONSOLE',
    }));

    const olt: PopOlt = {
      id: generateId(),
      name: oltData.name,
      type: oltData.type,
      slots: [],
      uplinks,
      bootPorts,
      consolePorts,
    };

    updatePop(popId, { olts: [...pop.olts, olt] });
    return olt;
  }, [state.currentNetwork, updatePop]);

  const addSwitchToPop = useCallback((popId: string, switchData: { name: string; portCount: number; uplinkPortCount: number }) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const portCount = Math.max(1, switchData.portCount);
    const uplinkPortCount = Math.max(1, switchData.uplinkPortCount);
    const sw: PopSwitch = {
      id: generateId(),
      name: switchData.name,
      portCount,
      uplinkPortCount,
      ports: Array.from({ length: portCount }, (_, idx) => ({
        id: generateId(),
        index: idx + 1,
        active: true,
      })),
      uplinks: Array.from({ length: uplinkPortCount }, (_, idx) => ({
        id: generateId(),
        index: idx + 1,
        active: true,
      })),
    };

    updatePop(popId, { switches: [...(pop.switches || []), sw] });
    return sw;
  }, [state.currentNetwork, updatePop]);

  const addRouterToPop = useCallback((popId: string, routerData: { name: string; wanCount: number; lanCount: number }) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const wanCount = Math.max(1, routerData.wanCount);
    const lanCount = Math.max(1, routerData.lanCount);
    const interfaces: PopRouterInterface[] = [
      ...Array.from({ length: wanCount }, (_, idx) => ({
        id: generateId(),
        index: idx + 1,
        active: true,
        role: 'WAN' as const,
      })),
      ...Array.from({ length: lanCount }, (_, idx) => ({
        id: generateId(),
        index: idx + 1,
        active: true,
        role: 'LAN' as const,
      })),
    ];

    const router: PopRouter = {
      id: generateId(),
      name: routerData.name,
      wanCount,
      lanCount,
      interfaces,
    };

    updatePop(popId, { routers: [...(pop.routers || []), router] });
    return router;
  }, [state.currentNetwork, updatePop]);

  const removeDioFromPop = useCallback((popId: string, dioId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const endpointPrefix = `dio:${dioId}:`;
    const entityKey = `dio:${dioId}`;
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    delete nextFusionLayout[entityKey];
    updatePop(popId, {
      dios: pop.dios.filter((item) => item.id !== dioId),
      fusions: pop.fusions.filter((fusion) => !fusion.endpointAId.startsWith(endpointPrefix) && !fusion.endpointBId.startsWith(endpointPrefix)),
      fusionLayout: nextFusionLayout,
    });
  }, [state.currentNetwork, updatePop]);

  const removeOltFromPop = useCallback((popId: string, oltId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const endpointPrefix = `olt:${oltId}:`;
    const entityKey = `olt:${oltId}`;
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    delete nextFusionLayout[entityKey];
    updatePop(popId, {
      olts: pop.olts.filter((item) => item.id !== oltId),
      fusions: pop.fusions.filter((fusion) => !fusion.endpointAId.startsWith(endpointPrefix) && !fusion.endpointBId.startsWith(endpointPrefix)),
      fusionLayout: nextFusionLayout,
    });
  }, [state.currentNetwork, updatePop]);

  const removeSwitchFromPop = useCallback((popId: string, switchId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const endpointPrefix = `switch:${switchId}:`;
    const entityKey = `switch:${switchId}`;
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    delete nextFusionLayout[entityKey];
    updatePop(popId, {
      switches: (pop.switches || []).filter((item) => item.id !== switchId),
      fusions: pop.fusions.filter((fusion) => !fusion.endpointAId.startsWith(endpointPrefix) && !fusion.endpointBId.startsWith(endpointPrefix)),
      fusionLayout: nextFusionLayout,
    });
  }, [state.currentNetwork, updatePop]);

  const removeRouterFromPop = useCallback((popId: string, routerId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const endpointPrefix = `router:${routerId}:`;
    const entityKey = `router:${routerId}`;
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    delete nextFusionLayout[entityKey];
    updatePop(popId, {
      routers: (pop.routers || []).filter((item) => item.id !== routerId),
      fusions: pop.fusions.filter((fusion) => !fusion.endpointAId.startsWith(endpointPrefix) && !fusion.endpointBId.startsWith(endpointPrefix)),
      fusionLayout: nextFusionLayout,
    });
  }, [state.currentNetwork, updatePop]);

  const toggleOltUplink = useCallback((popId: string, oltId: string, uplinkId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;

    updatePop(popId, {
      olts: pop.olts.map((item) => {
        if (item.id !== oltId) return item;
        return {
          ...item,
          uplinks: item.uplinks.map((uplink) =>
            uplink.id === uplinkId ? { ...uplink, active: !uplink.active } : uplink
          ),
        };
      }),
    });
  }, [state.currentNetwork, updatePop]);

  const addPonToOlt = useCallback((popId: string, oltId: string, slotId?: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;
    const olt = pop.olts.find((item) => item.id === oltId);
    if (!olt) return null;

    const firstPon = olt.slots.flatMap((slot) => slot.pons)[0];
    const defaultGbic: OltGbic = {
      id: generateId(),
      model: firstPon?.gbic.model || 'C++',
      connector: firstPon?.gbic.connector || 'APC-UPC',
      txPowerDbm: firstPon?.gbic.txPowerDbm ?? 3,
    };

    let createdPon: OltPon | null = null;
    let targetSlotId = slotId;

    const nextSlots = olt.slots.map((slot) => {
      if (targetSlotId && slot.id !== targetSlotId) return slot;
      if (!targetSlotId) targetSlotId = slot.id;
      if (slot.id !== targetSlotId) return slot;

      createdPon = {
        id: generateId(),
        index: slot.pons.length + 1,
        active: true,
        gbic: {
          ...defaultGbic,
          id: generateId(),
        },
      };
      return {
        ...slot,
        pons: [...slot.pons, createdPon],
      };
    });

    if (!createdPon) return null;
    updatePop(popId, {
      olts: pop.olts.map((item) => (item.id === oltId ? { ...item, slots: nextSlots } : item)),
    });

    return createdPon;
  }, [state.currentNetwork, updatePop]);

  const addSlotToOlt = useCallback((popId: string, oltId: string, ponCount: number) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;
    const olt = pop.olts.find((item) => item.id === oltId);
    if (!olt) return null;

    const safePonCount = Math.max(1, ponCount);
    const slot: OltSlot = {
      id: generateId(),
      index: olt.slots.length + 1,
      pons: Array.from({ length: safePonCount }, (_, idx) => ({
        id: generateId(),
        index: idx + 1,
        active: false,
        gbic: {
          id: generateId(),
          model: '',
          connector: 'UPC',
          txPowerDbm: 0,
        },
      })),
    };

    updatePop(popId, {
      olts: pop.olts.map((item) => (item.id === oltId ? { ...item, slots: [...item.slots, slot] } : item)),
    });

    return slot;
  }, [state.currentNetwork, updatePop]);

  const activateOltPon = useCallback((popId: string, oltId: string, slotId: string, ponId: string, gbicModel: string, txPowerDbm: number) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const olt = pop.olts.find((item) => item.id === oltId);
    if (!olt) return;

    updatePop(popId, {
      olts: pop.olts.map((item) => {
        if (item.id !== oltId) return item;
        return {
          ...item,
          slots: item.slots.map((slot) => {
            if (slot.id !== slotId) return slot;
            return {
              ...slot,
              pons: slot.pons.map((pon) =>
                pon.id === ponId
                  ? {
                      ...pon,
                      active: true,
                      gbic: {
                        ...pon.gbic,
                        model: gbicModel.trim(),
                        connector: 'UPC',
                        txPowerDbm,
                      },
                    }
                  : pon
              ),
            };
          }),
        };
      }),
    });
  }, [state.currentNetwork, updatePop]);

  const toggleOltPon = useCallback((popId: string, oltId: string, slotId: string, ponId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    const olt = pop.olts.find((item) => item.id === oltId);
    if (!olt) return;

    updatePop(popId, {
      olts: pop.olts.map((item) => {
        if (item.id !== oltId) return item;
        return {
          ...item,
          slots: item.slots.map((slot) => {
            if (slot.id !== slotId) return slot;
            return {
              ...slot,
              pons: slot.pons.map((pon) =>
                pon.id === ponId ? { ...pon, active: !pon.active } : pon
              ),
            };
          }),
        };
      }),
    });
  }, [state.currentNetwork, updatePop]);

  const toggleSwitchPort = useCallback((popId: string, switchId: string, portId: string, isUplink: boolean) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;

    updatePop(popId, {
      switches: (pop.switches || []).map((sw) => {
        if (sw.id !== switchId) return sw;
        if (isUplink) {
          return {
            ...sw,
            uplinks: sw.uplinks.map((port) => (port.id === portId ? { ...port, active: !port.active } : port)),
          };
        }
        return {
          ...sw,
          ports: sw.ports.map((port) => (port.id === portId ? { ...port, active: !port.active } : port)),
        };
      }),
    });
  }, [state.currentNetwork, updatePop]);

  const toggleRouterInterface = useCallback((popId: string, routerId: string, interfaceId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;

    updatePop(popId, {
      routers: (pop.routers || []).map((router) =>
        router.id === routerId
          ? {
              ...router,
              interfaces: router.interfaces.map((iface) =>
                iface.id === interfaceId ? { ...iface, active: !iface.active } : iface
              ),
            }
          : router
      ),
    });
  }, [state.currentNetwork, updatePop]);

  const addCableToPop = useCallback((popId: string, cableData: Omit<PopCable, 'id' | 'fibers'>) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const cable: PopCable = {
      ...cableData,
      id: generateId(),
      fiberCount: Math.max(1, cableData.fiberCount),
      fibers: generateFibers(Math.max(1, cableData.fiberCount)),
    };

    updatePop(popId, { cables: [...pop.cables, cable] });
    return cable;
  }, [state.currentNetwork, updatePop]);

  const connectPopEndpoints = useCallback((popId: string, endpointAId: string, endpointBId: string, fusionType: PopFusion['fusionType'] = 'fusion', noLoss: boolean = false, vlan?: number) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    if (endpointAId === endpointBId) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    const ownerA = getPopEndpointOwner(pop, endpointAId);
    const ownerB = getPopEndpointOwner(pop, endpointBId);
    if (!ownerA || !ownerB) return null;
    if (ownerA.kind === ownerB.kind && ownerA.id === ownerB.id) return null;

    const isInactivePonEndpoint = (endpointId: string) => {
      if (!endpointId.startsWith('olt:')) return false;
      const parts = endpointId.split(':');
      const oltId = parts[1];
      const olt = pop.olts.find((item) => item.id === oltId);
      if (!olt) return true;

      if (endpointId.includes(':u:')) {
        const uplinkIndex = Number.parseInt(parts[3] || '', 10);
        if (Number.isNaN(uplinkIndex)) return true;
        const uplink = olt.uplinks.find((item) => item.index === uplinkIndex);
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
      const slot = olt.slots.find((item) => item.index === slotIndex);
      const pon = slot?.pons.find((item) => item.index === ponIndex);
      return !pon || !pon.active;
    };
    const isInactiveSwitchOrRouterEndpoint = (endpointId: string) => {
      if (endpointId.startsWith('switch:')) {
        const parts = endpointId.split(':');
        const switchId = parts[1];
        const kind = parts[2];
        const index = Number.parseInt(parts[3] || '', 10);
        const sw = pop.switches?.find((item) => item.id === switchId);
        if (!sw || Number.isNaN(index)) return true;
        if (kind === 'u') return !sw.uplinks.find((item) => item.index === index)?.active;
        return !sw.ports.find((item) => item.index === index)?.active;
      }
      if (endpointId.startsWith('router:')) {
        const parts = endpointId.split(':');
        const routerId = parts[1];
        const role = parts[2];
        const index = Number.parseInt(parts[3] || '', 10);
        const router = pop.routers?.find((item) => item.id === routerId);
        if (!router || Number.isNaN(index)) return true;
        return !router.interfaces.find((item) => item.role.toLowerCase() === role && item.index === index)?.active;
      }
      return false;
    };
    if (
      isInactivePonEndpoint(endpointAId) ||
      isInactivePonEndpoint(endpointBId) ||
      isInactiveSwitchOrRouterEndpoint(endpointAId) ||
      isInactiveSwitchOrRouterEndpoint(endpointBId)
    ) return null;

    const duplicate = pop.fusions.some(
      (fusion) =>
        (fusion.endpointAId === endpointAId && fusion.endpointBId === endpointBId) ||
        (fusion.endpointAId === endpointBId && fusion.endpointBId === endpointAId)
    );
    if (duplicate) return null;

    const fusion: PopFusion = {
      id: generateId(),
      endpointAId,
      endpointBId,
      fusionType,
      attenuation: noLoss ? 0 : fusionType === 'connector' ? 0.2 : fusionType === 'mechanical' ? 0.2 : 0.1,
      vlan: typeof vlan === 'number' ? vlan : undefined,
      dateCreated: new Date().toISOString(),
    };

    updatePop(popId, { fusions: [...pop.fusions, fusion] });
    return fusion;
  }, [state.currentNetwork, updatePop]);

  const disconnectPopFusion = useCallback((popId: string, fusionId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;
    updatePop(popId, { fusions: pop.fusions.filter((fusion) => fusion.id !== fusionId) });
  }, [state.currentNetwork, updatePop]);

  const addReserve = useCallback((reserveData: Omit<ReservePoint, 'id'>) => {
    const reserve: ReservePoint = {
      ...reserveData,
      id: generateId(),
    };

    setState(prev => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          reserves: [...(prev.currentNetwork.reserves || []), reserve],
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return reserve;
  }, []);

  const updateReserve = useCallback((reserveId: string, updates: Partial<ReservePoint>) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          reserves: (prev.currentNetwork.reserves || []).map((reserve) =>
            reserve.id === reserveId ? { ...reserve, ...updates } : reserve
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const removeReserve = useCallback((reserveId: string) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;

      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          reserves: (prev.currentNetwork.reserves || []).filter((reserve) => reserve.id !== reserveId),
          cables: prev.currentNetwork.cables.map((cable) => ({
            ...cable,
            attachments: (cable.attachments || []).filter((attachment) => !(attachment.kind === 'reserve' && attachment.entityId === reserveId)),
          })),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const addFusion = useCallback((fusionData: Omit<Fusion, 'id' | 'dateCreated'>) => {
    const fusion: Fusion = {
      ...fusionData,
      id: generateId(),
      dateCreated: new Date().toISOString(),
    };

    setState(prev => {
      if (!prev.currentNetwork) return prev;
      const nextNetwork = attachFusionToNetwork(prev.currentNetwork, fusion);

      return {
        ...prev,
        currentNetwork: nextNetwork,
      };
    });

    return fusion;
  }, []);

  const removeFusion = useCallback((fusionId: string) => {
    setState(prev => {
      if (!prev.currentNetwork) return prev;
      const nextNetwork = detachFusionFromNetwork(prev.currentNetwork, fusionId);

      return {
        ...prev,
        currentNetwork: nextNetwork,
      };
    });
  }, []);

  const connectFibers = useCallback((boxAId: string, fiberAId: string, boxBId: string, fiberBId: string, position: Position) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    if (boxAId === boxBId || fiberAId === fiberBId) return null;

    const boxA = currentNetwork.boxes.find(b => b.id === boxAId);
    const boxB = currentNetwork.boxes.find(b => b.id === boxBId);
    const fiberA = boxA?.fibers.find(f => f.id === fiberAId);
    const fiberB = boxB?.fibers.find(f => f.id === fiberBId);

    if (!boxA || !boxB || !fiberA || !fiberB) return null;
    if (fiberA.fusionId || fiberB.fusionId) return null;
    if (fiberA.status === 'faulty' || fiberB.status === 'faulty') return null;

    const duplicatedPair = currentNetwork.fusions.some(
      (fusion) =>
        (fusion.boxAId === boxAId &&
          fusion.fiberAId === fiberAId &&
          fusion.boxBId === boxBId &&
          fusion.fiberBId === fiberBId) ||
        (fusion.boxAId === boxBId &&
          fusion.fiberAId === fiberBId &&
          fusion.boxBId === boxAId &&
          fusion.fiberBId === fiberAId)
    );
    if (duplicatedPair) return null;

    const boxDistance = calculateDistanceMeters(boxA.position, boxB.position);
    const attenuation = Number(calculateGponLoss(boxDistance, { emendas: 1 }).toFixed(3));

    return addFusion({
      fiberAId,
      fiberBId,
      boxAId,
      boxBId,
      position,
      fusionType: 'fusion',
      attenuation,
    });
  }, [state.currentNetwork, addFusion]);

  const connectBoxEndpoints = useCallback(
    (
      boxId: string,
      endpointAId: string,
      endpointBId: string,
      fusionType: Fusion['fusionType'] = 'connector',
      noLoss: boolean = false
    ) => {
      const currentNetwork = state.currentNetwork;
      if (!currentNetwork) return null;
      if (endpointAId === endpointBId) return null;

      const box = currentNetwork.boxes.find((item) => item.id === boxId);
      if (!box) return null;

      const boxEndpoints = getBoxEndpointFiberIds(currentNetwork, boxId);
      if (!boxEndpoints.has(endpointAId) || !boxEndpoints.has(endpointBId)) return null;

      const endpointA = getFiberById(currentNetwork, endpointAId);
      const endpointB = getFiberById(currentNetwork, endpointBId);
      if (!endpointA || !endpointB) return null;
      if (endpointA.status === 'faulty' || endpointB.status === 'faulty') return null;

      const endpointALocalFusion = getLocalFusionForEndpoint(currentNetwork, boxId, endpointAId);
      const endpointBLocalFusion = getLocalFusionForEndpoint(currentNetwork, boxId, endpointBId);
      if (endpointALocalFusion || endpointBLocalFusion) return null;

      const duplicatedPair = currentNetwork.fusions.some(
        (fusion) =>
          (fusion.fiberAId === endpointAId && fusion.fiberBId === endpointBId) ||
          (fusion.fiberAId === endpointBId && fusion.fiberBId === endpointAId)
      );
      if (duplicatedPair) return null;

      return addFusion({
        fiberAId: endpointAId,
        fiberBId: endpointBId,
        boxAId: boxId,
        boxBId: boxId,
        position: box.position,
        fusionType,
        attenuation: noLoss ? 0 : fusionType === 'connector' ? 0.2 : 0.1,
      });
    },
    [state.currentNetwork, addFusion]
  );

  const disconnectFibers = useCallback((fusionId: string) => {
    removeFusion(fusionId);
  }, [removeFusion]);

  const addSplitterToBox = useCallback(
    (
      boxId: string,
      splitterData: Omit<Splitter, 'id' | 'inputFibers' | 'outputFibers' | 'attenuation' | 'status'>
    ) => {
      const currentNetwork = state.currentNetwork;
      if (!currentNetwork) return null;
      const box = currentNetwork.boxes.find((item) => item.id === boxId);
      if (!box) return null;

      const ports = getSplitterPortCount(splitterData.type);
      const splitter: Splitter = {
        id: generateId(),
        name: splitterData.name,
        type: splitterData.type,
        inputFibers: generateFibers(ports.input),
        outputFibers: generateFibers(ports.output),
        attenuation: Math.log2(Math.max(ports.output, 2)) * 3.5,
        status: 'active',
      };

      setState((prev) => {
        if (!prev.currentNetwork) return prev;
        return {
          ...prev,
          currentNetwork: {
            ...prev.currentNetwork,
            boxes: prev.currentNetwork.boxes.map((item) =>
              item.id === boxId
                ? { ...item, splitters: [...(item.splitters || []), splitter] }
                : item
            ),
            updatedAt: new Date().toISOString(),
          },
        };
      });

      return splitter;
    },
    [state.currentNetwork]
  );

  const removeSplitterFromBox = useCallback((boxId: string, splitterId: string) => {
    setState((prev) => {
      if (!prev.currentNetwork) return prev;
      const box = prev.currentNetwork.boxes.find((item) => item.id === boxId);
      const splitter = box?.splitters?.find((item) => item.id === splitterId);
      if (!box || !splitter) return prev;

      const splitterFiberIds = new Set([
        ...splitter.inputFibers.map((fiber) => fiber.id),
        ...splitter.outputFibers.map((fiber) => fiber.id),
      ]);

      const affectedFusions = prev.currentNetwork.fusions
        .filter(
          (fusion) =>
            splitterFiberIds.has(fusion.fiberAId) || splitterFiberIds.has(fusion.fiberBId)
        )
        .map((fusion) => fusion.id);

      const cleanedNetwork = affectedFusions.reduce(
        (acc, fusionId) => detachFusionFromNetwork(acc, fusionId),
        prev.currentNetwork
      );

      return {
        ...prev,
        currentNetwork: {
          ...cleanedNetwork,
          boxes: cleanedNetwork.boxes.map((item) =>
            item.id === boxId
              ? {
                  ...item,
                  splitters: (item.splitters || []).filter((current) => current.id !== splitterId),
                }
              : item
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const testContinuity = useCallback((testData: Omit<ContinuityTest, 'id' | 'testedAt'>) => {
    const test: ContinuityTest = {
      ...testData,
      id: generateId(),
      testedAt: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      continuityTests: [...prev.continuityTests, test],
    }));

    return test;
  }, []);

  const selectBox = useCallback((box: Box | null) => {
    setState((prev) => ({
      ...prev,
      selectedBox: box,
      selectedPop: box ? null : prev.selectedPop,
    }));
  }, []);

  const selectPop = useCallback((pop: Pop | null) => {
    setState((prev) => ({
      ...prev,
      selectedPop: pop,
      selectedBox: pop ? null : prev.selectedBox,
    }));
  }, []);

  const selectCable = useCallback((cable: Cable | null) => {
    setState(prev => ({ ...prev, selectedCable: cable }));
  }, []);

  const selectFiber = useCallback((fiber: Fiber | null) => {
    setState(prev => ({ ...prev, selectedFiber: fiber }));
  }, []);

  const setEditing = useCallback((editing: boolean) => {
    setState(prev => ({ ...prev, isEditing: editing }));
  }, []);

  const setShowFusionModal = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showFusionModal: show }));
  }, []);

  const setShowContinuityModal = useCallback((show: boolean) => {
    setState(prev => ({ ...prev, showContinuityModal: show }));
  }, []);

  const setActiveFusion = useCallback((fusion: { boxA: Box; boxB: Box; fiberA: Fiber; fiberB: Fiber } | null) => {
    setState(prev => ({ ...prev, activeFusion: fusion }));
  }, []);

  const getFiberPath = useCallback((fiberId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return [];

    const path: { box: Box; cable?: Cable; fusion?: Fusion }[] = [];
    const visited = new Set<string>();

    const traverse = (currentFiberId: string, currentBoxId: string) => {
      if (visited.has(currentFiberId)) return;
      visited.add(currentFiberId);

      const box = currentNetwork.boxes.find(b => b.id === currentBoxId);
      if (!box) return;

      const fiber = box.fibers.find(f => f.id === currentFiberId);
      if (!fiber) return;

      path.push({ box });

      if (fiber.fusionId) {
        const fusion = currentNetwork.fusions.find(f => f.id === fiber.fusionId);
        if (fusion) {
          path[path.length - 1].fusion = fusion;
          const nextBoxId = fusion.boxAId === currentBoxId ? fusion.boxBId : fusion.boxAId;
          const nextFiberId = fusion.fiberAId === currentFiberId ? fusion.fiberBId : fusion.fiberAId;
          traverse(nextFiberId, nextBoxId);
        }
      }
    };

    const startBox = currentNetwork.boxes.find(b => 
      b.fibers.some(f => f.id === fiberId)
    );
    
    if (startBox) {
      traverse(fiberId, startBox.id);
    }

    return path;
  }, [state.currentNetwork]);

  const getFiberContinuity = useCallback((fiberId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) {
      return { connected: false, path: [], attenuation: 0 };
    }

    const visited = new Set<string>();
    const path: string[] = [];
    let attenuation = 0;
    let hopCount = 0;
    let currentFiberId: string | undefined = fiberId;

    while (currentFiberId && !visited.has(currentFiberId)) {
      visited.add(currentFiberId);
      const currentFiber = getFiberById(currentNetwork, currentFiberId);
      if (!currentFiber) break;

      const ownerLabel = getFiberOwnerLabel(currentNetwork, currentFiberId);
      if (ownerLabel && path[path.length - 1] !== ownerLabel) {
        path.push(ownerLabel);
      }

      if (!currentFiber.connectedTo || !currentFiber.fusionId) break;

      const fusion = currentNetwork.fusions.find((item) => item.id === currentFiber.fusionId);
      if (fusion) attenuation += getFusionAttenuation(fusion);

      currentFiberId = currentFiber.connectedTo;
      hopCount += 1;
    }

    return {
      connected: hopCount > 0,
      path,
      attenuation: Number(attenuation.toFixed(3)),
    };
  }, [state.currentNetwork]);

  const importNetwork = useCallback((networkData: string) => {
    try {
      const networkRaw = JSON.parse(networkData) as Network;
      const network: Network = {
        ...networkRaw,
        cities: networkRaw.cities || [],
        pops: (networkRaw.pops || []).map((pop) => ({
          ...pop,
          fusionLayout: pop.fusionLayout || {},
          olts: (pop.olts || []).map((olt) => ({
            ...olt,
            bootPorts: (olt.bootPorts || []).map((port, idx) => ({
              ...port,
              index: port.index || idx + 1,
              active: typeof (port as OltAuxPort & { active?: boolean }).active === 'boolean'
                ? (port as OltAuxPort & { active?: boolean }).active!
                : true,
              role: 'BOOT',
            })),
            consolePorts: (olt.consolePorts || []).map((port, idx) => ({
              ...port,
              index: port.index || idx + 1,
              active: typeof (port as OltAuxPort & { active?: boolean }).active === 'boolean'
                ? (port as OltAuxPort & { active?: boolean }).active!
                : true,
              role: 'CONSOLE',
            })),
            uplinks: (olt.uplinks || []).map((uplink, uplinkIdx) => ({
              ...uplink,
              index: uplink.index || uplinkIdx + 1,
              active: typeof (uplink as OltUplink & { active?: boolean }).active === 'boolean'
                ? (uplink as OltUplink & { active?: boolean }).active!
                : true,
              connector: uplink.connector || 'SFP+',
              speed: uplink.speed || '10G',
            })).length > 0
              ? (olt.uplinks || []).map((uplink, uplinkIdx) => ({
                  ...uplink,
                  index: uplink.index || uplinkIdx + 1,
                  active: typeof (uplink as OltUplink & { active?: boolean }).active === 'boolean'
                    ? (uplink as OltUplink & { active?: boolean }).active!
                    : true,
                  connector: uplink.connector || 'SFP+',
                  speed: uplink.speed || '10G',
                }))
              : [
                  { id: generateId(), index: 1, active: true, connector: 'SFP+', speed: '10G' },
                  { id: generateId(), index: 2, active: true, connector: 'SFP+', speed: '10G' },
                ],
            slots: (olt.slots || []).map((slot, slotIndex) => ({
              ...slot,
              index: slot.index || slotIndex + 1,
              pons: (slot.pons || []).map((pon, ponIndex) => ({
                ...pon,
                index: pon.index || ponIndex + 1,
                active: typeof (pon as OltPon & { active?: boolean }).active === 'boolean'
                  ? (pon as OltPon & { active?: boolean }).active!
                  : false,
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
            ports: (sw.ports || []).map((port, portIdx) => ({
              ...port,
              index: port.index || portIdx + 1,
              active: typeof (port as PopSwitchPort & { active?: boolean }).active === 'boolean'
                ? (port as PopSwitchPort & { active?: boolean }).active!
                : true,
            })),
            uplinks: (sw.uplinks || []).map((port, portIdx) => ({
              ...port,
              index: port.index || portIdx + 1,
              active: typeof (port as PopSwitchPort & { active?: boolean }).active === 'boolean'
                ? (port as PopSwitchPort & { active?: boolean }).active!
                : true,
            })),
          })),
          routers: (pop.routers || []).map((router) => ({
            ...router,
            interfaces: (router.interfaces || []).map((iface, ifaceIdx) => ({
              ...iface,
              index: iface.index || ifaceIdx + 1,
              active: typeof (iface as PopRouterInterface & { active?: boolean }).active === 'boolean'
                ? (iface as PopRouterInterface & { active?: boolean }).active!
                : true,
            })),
          })),
        })),
        reserves: networkRaw.reserves || [],
        cables: (networkRaw.cables || []).map((cable) => {
          const fibersPerTube = Math.max(1, (cable as Partial<Cable>).fibersPerTube || 12);
          const looseTubeCount = Math.max(1, (cable as Partial<Cable>).looseTubeCount || Math.ceil(cable.fiberCount / fibersPerTube));
          const model = (cable as Partial<Cable>).model || 'AS-80';
          const normalizedFibers = (cable.fibers || []).map((fiber, index) => ({
            ...fiber,
            tubeNumber: (fiber as Fiber & { tubeNumber?: number }).tubeNumber || Math.floor(index / fibersPerTube) + 1,
          }));
          return {
            ...cable,
            model,
            fibersPerTube,
            looseTubeCount,
            fibers: normalizedFibers,
            attachments: cable.attachments || [],
          };
        }),
      };
      setState(prev => ({ ...prev, currentNetwork: network }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const exportNetwork = useCallback(() => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return '';
    return JSON.stringify(currentNetwork, null, 2);
  }, [state.currentNetwork]);

  const resetNetwork = useCallback(() => {
    setState({
      currentNetwork: null,
      selectedBox: null,
      selectedPop: null,
      selectedCable: null,
      selectedFiber: null,
      continuityTests: [],
      clients: [],
      isEditing: false,
      showFusionModal: false,
      showContinuityModal: false,
      activeFusion: null,
    });
  }, []);

  const value = {
    ...state,
    setCurrentNetwork,
    createNetwork,
    addCity,
    addPop,
    updatePop,
    removePop,
    addDioToPop,
    addOltToPop,
    addSlotToOlt,
    activateOltPon,
    addSwitchToPop,
    addRouterToPop,
    removeDioFromPop,
    removeOltFromPop,
    removeSwitchFromPop,
    removeRouterFromPop,
    toggleOltUplink,
    addPonToOlt,
    toggleOltPon,
    toggleSwitchPort,
    toggleRouterInterface,
    addCableToPop,
    connectPopEndpoints,
    disconnectPopFusion,
    addBox,
    updateBox,
    removeBox,
    addCable,
    updateCable,
    removeCable,
    addReserve,
    updateReserve,
    removeReserve,
    addFusion,
    removeFusion,
    connectFibers,
    connectBoxEndpoints,
    disconnectFibers,
    addSplitterToBox,
    removeSplitterFromBox,
    testContinuity,
    selectBox,
    selectPop,
    selectCable,
    selectFiber,
    setEditing,
    setShowFusionModal,
    setShowContinuityModal,
    setActiveFusion,
    getFiberPath,
    getFiberContinuity,
    generateFibers,
    importNetwork,
    exportNetwork,
    resetNetwork,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetworkStore() {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetworkStore must be used within a NetworkProvider');
  }
  return context;
}
