import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { 
  Network, 
  Box, 
  Cable, 
  Fiber, 
  Fusion, 
  Splitter,
  Position, 
  ContinuityTest,
  Client,
} from '@/types/ftth';
import { FIBER_COLORS } from '@/types/ftth';

interface NetworkState {
  currentNetwork: Network | null;
  selectedBox: Box | null;
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
  updateBox: (boxId: string, updates: Partial<Box>) => void;
  removeBox: (boxId: string) => void;
  addCable: (cable: Omit<Cable, 'id' | 'fibers'>) => Cable;
  updateCable: (cableId: string, updates: Partial<Cable>) => void;
  removeCable: (cableId: string) => void;
  addFusion: (fusion: Omit<Fusion, 'id' | 'dateCreated'>) => Fusion;
  removeFusion: (fusionId: string) => void;
  connectFibers: (boxAId: string, fiberAId: string, boxBId: string, fiberBId: string, position: Position) => Fusion | null;
  connectBoxEndpoints: (boxId: string, endpointAId: string, endpointBId: string, fusionType?: Fusion['fusionType']) => Fusion | null;
  disconnectFibers: (fusionId: string) => void;
  addSplitterToBox: (boxId: string, splitterData: Omit<Splitter, 'id' | 'inputFibers' | 'outputFibers' | 'attenuation' | 'status'>) => Splitter | null;
  removeSplitterFromBox: (boxId: string, splitterId: string) => void;
  testContinuity: (test: Omit<ContinuityTest, 'id' | 'testedAt'>) => ContinuityTest;
  selectBox: (box: Box | null) => void;
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

const generateFibers = (count: number, startNumber: number = 1): Fiber[] => {
  return Array.from({ length: count }, (_, i) => {
    const fiberNum = startNumber + i;
    const colorIndex = (fiberNum - 1) % 12;
    const tubeNumber = Math.floor((fiberNum - 1) / 12) + 1;
    
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
      boxes: [],
      cables: [],
      fusions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, currentNetwork: network }));
    return network;
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
          ),
          fusions: prev.currentNetwork.fusions.filter(
            fusion => fusion.boxAId !== boxId && fusion.boxBId !== boxId
          ),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const addCable = useCallback((cableData: Omit<Cable, 'id' | 'fibers'>) => {
    const cable: Cable = {
      ...cableData,
      id: generateId(),
      fibers: generateFibers(cableData.fiberCount),
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
      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cables: prev.currentNetwork.cables.map(cable =>
            cable.id === cableId ? { ...cable, ...updates } : cable
          ),
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
      fusionType: Fusion['fusionType'] = 'connector'
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
        attenuation: fusionType === 'connector' ? 0.2 : 0.1,
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
    setState(prev => ({ ...prev, selectedBox: box }));
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
      const network = JSON.parse(networkData) as Network;
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
    addBox,
    updateBox,
    removeBox,
    addCable,
    updateCable,
    removeCable,
    addFusion,
    removeFusion,
    connectFibers,
    connectBoxEndpoints,
    disconnectFibers,
    addSplitterToBox,
    removeSplitterFromBox,
    testContinuity,
    selectBox,
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
