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
import {
  attachFusionToNetwork,
  calculateDistanceMeters,
  calculateGponLoss,
  detachFusionFromNetwork,
  generateFibers,
  generateId,
  getBoxEndpointFiberIds,
  getFiberById,
  getFiberOwnerLabel,
  getFusionAttenuation,
  getLocalFusionForEndpoint,
  estimateSignalAtPopForFiber,
  resolveNextFiberThroughPop,
  getSplitterPortCount,
} from '@/store/networkUtils';
import { normalizeCableGeometry } from '@/store/cableUtils';
import {
  applyPopFusionToCables,
  buildPopFusion,
  canConnectPopEndpoints,
  clearPopFusionFromCables,
} from '@/store/popEndpointUtils';
import { normalizeImportedNetwork } from '@/store/networkImportUtils';

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
  getFiberRouteReport: (fiberId: string) => {
    connected: boolean;
    path: string[];
    attenuation: number;
    fusionCount: number;
    cableCount: number;
    boxCount: number;
    splitterCount: number;
    popCount: number;
    signalAtPop?: {
      popName: string;
      oltEndpointId: string;
      txPowerDbm: number;
      popLossDb: number;
      estimatedRxDbm: number;
    };
  };
  generateFibers: (count: number, startNumber?: number) => Fiber[];
  importNetwork: (networkData: string) => boolean;
  exportNetwork: () => string;
  resetNetwork: () => void;
}

const NetworkContext = createContext<(NetworkState & NetworkActions) | null>(null);

type PopMirrorRole = 'incoming' | 'outgoing';

const mapCableToPopCableType = (type: Cable['type']): PopCable['type'] => {
  if (type === 'drop') return 'patchcord';
  if (type === 'backbone') return 'backbone';
  return 'backbone';
};

const mapCableToPopCableStatus = (status: Cable['status']): PopCable['status'] => {
  if (status === 'inactive') return 'inactive';
  if (status === 'maintenance') return 'maintenance';
  return 'active';
};

const getPopMirrorRoleLabel = (role: PopMirrorRole) =>
  role === 'incoming' ? 'ENTRADA MAPA' : 'SAIDA MAPA';

const resolvePopMirrorRole = (cable: Cable, popId: string): PopMirrorRole | null => {
  if (cable.startPoint === popId) return 'outgoing';
  if (cable.endPoint === popId) return 'incoming';
  return null;
};

const isFusionBoundToPopCableIds = (fusion: PopFusion, cableIds: Set<string>) => {
  for (const cableId of cableIds) {
    const prefix = `cable:${cableId}:`;
    if (fusion.endpointAId.startsWith(prefix) || fusion.endpointBId.startsWith(prefix)) {
      return true;
    }
  }
  return false;
};

const buildPopMirrorCable = (cable: Cable, role: PopMirrorRole): PopCable => {
  const geometry = normalizeCableGeometry(cable.fiberCount, cable.looseTubeCount, cable.fibersPerTube);
  return {
    id: generateId(),
    name: `${cable.name} (${getPopMirrorRoleLabel(role)})`,
    type: mapCableToPopCableType(cable.type),
    fiberCount: geometry.fiberCount,
    looseTubeCount: geometry.looseTubeCount,
    fibersPerTube: geometry.fibersPerTube,
    fibers: generateFibers(geometry.fiberCount, 1, geometry.fibersPerTube),
    status: mapCableToPopCableStatus(cable.status),
    linkedNetworkCableId: cable.id,
    mapEndpointRole: role,
  };
};

const removePopMirrorCablesForNetworkCable = (network: Network, cableId: string): Pop[] =>
  (network.pops || []).map((pop) => {
    const linked = (pop.cables || []).filter((item) => item.linkedNetworkCableId === cableId);
    if (linked.length === 0) return pop;

    const linkedIds = new Set(linked.map((item) => item.id));
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    linkedIds.forEach((linkedId) => {
      delete nextFusionLayout[`cable:${linkedId}`];
    });

    return {
      ...pop,
      cables: (pop.cables || []).filter((item) => item.linkedNetworkCableId !== cableId),
      fusions: (pop.fusions || []).filter((fusion) => !isFusionBoundToPopCableIds(fusion, linkedIds)),
      fusionLayout: nextFusionLayout,
    };
  });

const syncPopMirrorCablesForNetworkCable = (network: Network, cable: Cable): Pop[] =>
  (network.pops || []).map((pop) => {
    const role = resolvePopMirrorRole(cable, pop.id);
    const popCables = pop.cables || [];
    const linked = popCables.filter((item) => item.linkedNetworkCableId === cable.id);

    if (!role) {
      if (linked.length === 0) return pop;
      const linkedIds = new Set(linked.map((item) => item.id));
      const nextFusionLayout = { ...(pop.fusionLayout || {}) };
      linkedIds.forEach((linkedId) => {
        delete nextFusionLayout[`cable:${linkedId}`];
      });
      return {
        ...pop,
        cables: popCables.filter((item) => item.linkedNetworkCableId !== cable.id),
        fusions: (pop.fusions || []).filter((fusion) => !isFusionBoundToPopCableIds(fusion, linkedIds)),
        fusionLayout: nextFusionLayout,
      };
    }

    const geometry = normalizeCableGeometry(cable.fiberCount, cable.looseTubeCount, cable.fibersPerTube);
    const primary = linked[0];
    const duplicateIds = new Set(linked.slice(1).map((item) => item.id));
    const nextFusionLayout = { ...(pop.fusionLayout || {}) };
    duplicateIds.forEach((linkedId) => {
      delete nextFusionLayout[`cable:${linkedId}`];
    });

    if (!primary) {
      return {
        ...pop,
        cables: [...popCables, buildPopMirrorCable(cable, role)],
      };
    }

    const geometryChanged =
      primary.fiberCount !== geometry.fiberCount ||
      (primary.looseTubeCount || 1) !== geometry.looseTubeCount ||
      (primary.fibersPerTube || 12) !== geometry.fibersPerTube;

    const removedIds = new Set<string>(duplicateIds);
    if (geometryChanged) {
      removedIds.add(primary.id);
      delete nextFusionLayout[`cable:${primary.id}`];
    }

    const nextPrimary: PopCable = {
      ...primary,
      name: `${cable.name} (${getPopMirrorRoleLabel(role)})`,
      type: mapCableToPopCableType(cable.type),
      fiberCount: geometry.fiberCount,
      looseTubeCount: geometry.looseTubeCount,
      fibersPerTube: geometry.fibersPerTube,
      fibers: geometryChanged
        ? generateFibers(geometry.fiberCount, 1, geometry.fibersPerTube)
        : primary.fibers,
      status: mapCableToPopCableStatus(cable.status),
      linkedNetworkCableId: cable.id,
      mapEndpointRole: role,
    };

    return {
      ...pop,
      cables: popCables
        .map((item) => {
          if (item.id === primary.id) return nextPrimary;
          if (item.linkedNetworkCableId === cable.id) return null;
          return item;
        })
        .filter((item): item is PopCable => Boolean(item)),
      fusions: (pop.fusions || []).filter((fusion) => !isFusionBoundToPopCableIds(fusion, removedIds)),
      fusionLayout: nextFusionLayout,
    };
  });

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
    const geometry = normalizeCableGeometry(
      cableData.fiberCount,
      cableData.looseTubeCount,
      cableData.fibersPerTube
    );
    const cable: Cable = {
      ...cableData,
      fiberCount: geometry.fiberCount,
      fibersPerTube: geometry.fibersPerTube,
      looseTubeCount: geometry.looseTubeCount,
      model: cableData.model || 'AS-80',
      id: generateId(),
      fibers: generateFibers(geometry.fiberCount, 1, geometry.fibersPerTube),
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
      const updatedPops = syncPopMirrorCablesForNetworkCable(prev.currentNetwork, cable);

      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cables: updatedCables,
          boxes: updatedBoxes,
          pops: updatedPops,
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
      const updatedCables = prev.currentNetwork.cables.map((cable) =>
        cable.id === cableId ? { ...cable, ...updates } : cable
      );
      const updatedPops = syncPopMirrorCablesForNetworkCable(
        { ...prev.currentNetwork, cables: updatedCables, boxes: updatedBoxes },
        nextCable
      );

      return {
        ...prev,
        currentNetwork: {
          ...prev.currentNetwork,
          cables: updatedCables,
          boxes: updatedBoxes,
          pops: updatedPops,
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
        pops: removePopMirrorCablesForNetworkCable(prev.currentNetwork, cableId),
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

    const geometry = normalizeCableGeometry(
      cableData.fiberCount,
      cableData.looseTubeCount,
      cableData.fibersPerTube
    );

    const cable: PopCable = {
      ...cableData,
      id: generateId(),
      fiberCount: geometry.fiberCount,
      looseTubeCount: geometry.looseTubeCount,
      fibersPerTube: geometry.fibersPerTube,
      fibers: generateFibers(geometry.fiberCount, 1, geometry.fibersPerTube),
    };

    updatePop(popId, { cables: [...pop.cables, cable] });
    return cable;
  }, [state.currentNetwork, updatePop]);

  const connectPopEndpoints = useCallback((popId: string, endpointAId: string, endpointBId: string, fusionType: PopFusion['fusionType'] = 'fusion', noLoss: boolean = false, vlan?: number) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return null;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return null;

    if (!canConnectPopEndpoints(pop, endpointAId, endpointBId)) return null;

    const fusion = buildPopFusion(endpointAId, endpointBId, fusionType, noLoss, vlan);
    const updatedCables = applyPopFusionToCables(pop, fusion);

    updatePop(popId, { fusions: [...pop.fusions, fusion], cables: updatedCables });
    return fusion;
  }, [state.currentNetwork, updatePop]);

  const disconnectPopFusion = useCallback((popId: string, fusionId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) return;
    const pop = (currentNetwork.pops || []).find((item) => item.id === popId);
    if (!pop) return;

    const updatedCables = clearPopFusionFromCables(pop.cables || [], fusionId);
    updatePop(popId, {
      fusions: pop.fusions.filter((fusion) => fusion.id !== fusionId),
      cables: updatedCables,
    });
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

      if (currentFiber.connectedTo && currentFiber.fusionId) {
        const fusion = currentNetwork.fusions.find((item) => item.id === currentFiber.fusionId);
        if (fusion) attenuation += getFusionAttenuation(fusion);
        currentFiberId = currentFiber.connectedTo;
        hopCount += 1;
        continue;
      }

      const popHop = resolveNextFiberThroughPop(currentNetwork, currentFiberId);
      if (!popHop) break;
      attenuation += popHop.attenuation;
      currentFiberId = popHop.nextFiberId;
      hopCount += 1;
      if (path[path.length - 1] !== `POP ${popHop.popName}`) {
        path.push(`POP ${popHop.popName}`);
      }
    }

    return {
      connected: hopCount > 0,
      path,
      attenuation: Number(attenuation.toFixed(3)),
    };
  }, [state.currentNetwork]);

  const getFiberRouteReport = useCallback((fiberId: string) => {
    const currentNetwork = state.currentNetwork;
    if (!currentNetwork) {
      return {
        connected: false,
        path: [],
        attenuation: 0,
        fusionCount: 0,
        cableCount: 0,
        boxCount: 0,
        splitterCount: 0,
        popCount: 0,
      };
    }

    const visited = new Set<string>();
    const path: string[] = [];
    let attenuation = 0;
    let fusionCount = 0;
    let currentFiberId: string | undefined = fiberId;
    const cableIds = new Set<string>();
    const boxIds = new Set<string>();
    const splitterKeys = new Set<string>();
    const popIds = new Set<string>();

    const markOwners = (targetFiberId: string) => {
      for (const cable of currentNetwork.cables) {
        if (cable.fibers.some((fiber) => fiber.id === targetFiberId)) {
          cableIds.add(cable.id);
          return;
        }
      }
      for (const box of currentNetwork.boxes) {
        if (box.fibers.some((fiber) => fiber.id === targetFiberId)) {
          boxIds.add(box.id);
          return;
        }
        for (const splitter of box.splitters || []) {
          if (
            splitter.inputFibers.some((fiber) => fiber.id === targetFiberId) ||
            splitter.outputFibers.some((fiber) => fiber.id === targetFiberId)
          ) {
            boxIds.add(box.id);
            splitterKeys.add(`${box.id}:${splitter.id}`);
            return;
          }
        }
      }
      for (const pop of currentNetwork.pops || []) {
        for (const cable of pop.cables || []) {
          if (cable.fibers.some((fiber) => fiber.id === targetFiberId)) {
            popIds.add(pop.id);
            return;
          }
        }
      }
    };

    while (currentFiberId && !visited.has(currentFiberId)) {
      visited.add(currentFiberId);
      markOwners(currentFiberId);
      const currentFiber = getFiberById(currentNetwork, currentFiberId);
      if (!currentFiber) break;

      const ownerLabel = getFiberOwnerLabel(currentNetwork, currentFiberId);
      if (ownerLabel && path[path.length - 1] !== ownerLabel) {
        path.push(ownerLabel);
      }

      if (currentFiber.connectedTo && currentFiber.fusionId) {
        const fusion = currentNetwork.fusions.find((item) => item.id === currentFiber.fusionId);
        if (fusion) attenuation += getFusionAttenuation(fusion);
        fusionCount += 1;
        currentFiberId = currentFiber.connectedTo;
        continue;
      }

      const popHop = resolveNextFiberThroughPop(currentNetwork, currentFiberId);
      if (!popHop) break;
      attenuation += popHop.attenuation;
      fusionCount += popHop.fusionCount;
      popIds.add(popHop.popId);
      currentFiberId = popHop.nextFiberId;
      if (path[path.length - 1] !== `POP ${popHop.popName}`) {
        path.push(`POP ${popHop.popName}`);
      }
    }

    const signalAtPop = estimateSignalAtPopForFiber(currentNetwork, fiberId);

    return {
      connected: visited.size > 1,
      path,
      attenuation: Number(attenuation.toFixed(3)),
      fusionCount,
      cableCount: cableIds.size,
      boxCount: boxIds.size,
      splitterCount: splitterKeys.size,
      popCount: popIds.size,
      signalAtPop: signalAtPop
        ? {
            popName: signalAtPop.popName,
            oltEndpointId: signalAtPop.oltEndpointId,
            txPowerDbm: signalAtPop.txPowerDbm,
            popLossDb: signalAtPop.popLossDb,
            estimatedRxDbm: signalAtPop.estimatedRxDbm,
          }
        : undefined,
    };
  }, [state.currentNetwork]);

  const importNetwork = useCallback((networkData: string) => {
    try {
      const networkRaw = JSON.parse(networkData) as Network;
      const network = normalizeImportedNetwork(networkRaw);
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
    getFiberRouteReport,
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
