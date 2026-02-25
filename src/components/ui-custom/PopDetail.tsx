
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pencil, Scissors, Trash2, X } from 'lucide-react';
import { FullscreenModalShell } from './FullscreenModalShell';
import { CABLE_MODEL_OPTIONS, FIBER_COLORS } from '@/types/ftth';
import type { Cable, Pop, PopFusion } from '@/types/ftth';
import { toast } from 'sonner';

interface PopDetailProps {
  pop: Pop;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PopEntity = {
  id: string;
  type: 'dio' | 'cable' | 'olt' | 'switch' | 'router';
  label: string;
};

type EndpointNode = {
  id: string;
  entityId: string;
  label: string;
  shortLabel: string;
  endpointType: 'dio' | 'fiber' | 'pon' | 'uplink' | 'olt-aux' | 'switch-port' | 'router-iface';
  tubeNumber?: number;
  localFiberNumber?: number;
  slotId?: string;
  ponId?: string;
  uplinkId?: string;
  oltAuxPortId?: string;
  oltAuxRole?: 'BOOT' | 'CONSOLE';
  portId?: string;
  isUplink?: boolean;
  routerInterfaceId?: string;
  role?: 'WAN' | 'LAN';
  active?: boolean;
};

type LinkConfigState = {
  open: boolean;
  fromId: string;
  toId: string;
  vlan: string;
  fusionId?: string;
};

type PonConfigState = {
  open: boolean;
  oltId: string;
  slotId: string;
  ponId: string;
  gbicModel: string;
  txPowerDbm: string;
};

type MapCableTargetOption = {
  id: string;
  label: string;
  kind: 'box' | 'pop';
};

export function PopDetail({ pop, open, onOpenChange }: PopDetailProps) {
  const {
    currentNetwork,
    updatePop,
    addDioToPop,
    addOltToPop,
    addSlotToOlt,
    activateOltPon,
    toggleOltUplink,
    addSwitchToPop,
    toggleSwitchPort,
    addRouterToPop,
    toggleRouterInterface,
    removeDioFromPop,
    removeOltFromPop,
    removeSwitchFromPop,
    removeRouterFromPop,
    connectPopEndpoints,
    disconnectPopFusion,
  } = useNetworkStore();

  const currentPop = currentNetwork?.pops.find((item) => item.id === pop.id) || pop;
  const city = currentNetwork?.cities.find((item) => item.id === currentPop.cityId);
  const mapCableTargets = useMemo<MapCableTargetOption[]>(
    () => [
      ...((currentNetwork?.boxes || []).map((box) => ({
        id: box.id,
        label: `${box.name} (Caixa ${box.type})`,
        kind: 'box' as const,
      }))),
      ...((currentNetwork?.pops || [])
        .filter((item) => item.id !== currentPop.id)
        .map((item) => ({
          id: item.id,
          label: `${item.name} (POP)`,
          kind: 'pop' as const,
        }))),
    ],
    [currentNetwork?.boxes, currentNetwork?.pops, currentPop.id]
  );

  const [dioName, setDioName] = useState('');
  const [dioPorts, setDioPorts] = useState(24);
  const [oltName, setOltName] = useState('');
  const [oltType, setOltType] = useState<'compact' | 'chassi'>('chassi');
  const [oltUplinkPorts, setOltUplinkPorts] = useState(2);
  const [oltBootPorts, setOltBootPorts] = useState(1);
  const [oltConsolePorts, setOltConsolePorts] = useState(1);
  const [gbicModel, setGbicModel] = useState('C++');
  const [txPowerDbm, setTxPowerDbm] = useState(3);

  const [switchName, setSwitchName] = useState('');
  const [switchPorts, setSwitchPorts] = useState(24);
  const [switchUplinks, setSwitchUplinks] = useState(4);

  const [routerName, setRouterName] = useState('');
  const [routerWanCount, setRouterWanCount] = useState(2);
  const [routerLanCount, setRouterLanCount] = useState(8);

  const [cableName, setCableName] = useState('');
  const [cableFiberCount, setCableFiberCount] = useState(12);
  const [mapCableDirection, setMapCableDirection] = useState<'outgoing' | 'incoming'>('outgoing');
  const [editPositionLat, setEditPositionLat] = useState(() => pop.position.lat.toFixed(6));
  const [editPositionLng, setEditPositionLng] = useState(() => pop.position.lng.toFixed(6));
  const [mainTab, setMainTab] = useState<'infra' | 'fusions' | 'signal'>('infra');
  const [infraTab, setInfraTab] = useState<'dio' | 'olt' | 'switch' | 'router' | 'cable'>('dio');
  const [rackFusionScope, setRackFusionScope] = useState<'all' | 'dio-bigtail'>('all');
  const [rackFusionDioId, setRackFusionDioId] = useState('');
  const [dioFusionOpen, setDioFusionOpen] = useState(false);
  const [dioFusionTargetId, setDioFusionTargetId] = useState('');
  const [mapCableTargetId, setMapCableTargetId] = useState('');
  const [mapCableType, setMapCableType] = useState<Cable['type']>('distribution');
  const [mapCableModel, setMapCableModel] = useState('AS-80');
  const [mapCableLooseTubeCount, setMapCableLooseTubeCount] = useState(1);
  const [mapCableFibersPerTube, setMapCableFibersPerTube] = useState(12);

  const [fusionType, setFusionType] = useState<PopFusion['fusionType']>('fusion');
  const [noLoss, setNoLoss] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeDragState, setNodeDragState] = useState<{ entityId: string; offsetX: number; offsetY: number } | null>(null);
  const [dragState, setDragState] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [boardZoom, setBoardZoom] = useState(1);
  const [fusionViewportHeight, setFusionViewportHeight] = useState(520);
  const [linkConfig, setLinkConfig] = useState<LinkConfigState>({ open: false, fromId: '', toId: '', vlan: '100' });
  const [ponConfig, setPonConfig] = useState<PonConfigState>({ open: false, oltId: '', slotId: '', ponId: '', gbicModel: 'C++', txPowerDbm: '3' });
  const [sceneRenderTick, setSceneRenderTick] = useState(0);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const fusionViewportRef = useRef<HTMLDivElement | null>(null);
  const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const entityOptions = useMemo<PopEntity[]>(() => {
    return [
      ...currentPop.dios.map((dio) => ({ id: `dio:${dio.id}`, type: 'dio' as const, label: dio.name })),
      ...currentPop.olts.map((olt) => ({ id: `olt:${olt.id}`, type: 'olt' as const, label: olt.name })),
      ...(currentPop.switches || []).map((sw) => ({ id: `switch:${sw.id}`, type: 'switch' as const, label: sw.name })),
      ...(currentPop.routers || []).map((router) => ({ id: `router:${router.id}`, type: 'router' as const, label: router.name })),
      ...currentPop.cables.map((cable) => ({ id: `cable:${cable.id}`, type: 'cable' as const, label: cable.name })),
    ];
  }, [currentPop]);

  const endpoints = useMemo<EndpointNode[]>(() => {
    const items: EndpointNode[] = [];

    currentPop.dios.forEach((dio) => {
      for (let port = 1; port <= dio.portCount; port++) {
        items.push({
          id: `dio:${dio.id}:p:${port}`,
          entityId: `dio:${dio.id}`,
          label: `DIO ${dio.name} - Porta ${port}`,
          shortLabel: `P${port}`,
          endpointType: 'dio',
          active: true,
        });
      }
    });

    currentPop.olts.forEach((olt) => {
      olt.uplinks.forEach((uplink) => {
        items.push({
          id: `olt:${olt.id}:u:${uplink.index}`,
          entityId: `olt:${olt.id}`,
          label: `OLT ${olt.name} - Uplink ${uplink.index}`,
          shortLabel: `UP${uplink.index}`,
          endpointType: 'uplink',
          uplinkId: uplink.id,
          active: uplink.active,
        });
      });

      (olt.bootPorts || []).forEach((port) => {
        items.push({
          id: `olt:${olt.id}:b:${port.index}`,
          entityId: `olt:${olt.id}`,
          label: `OLT ${olt.name} - BOOT ${port.index}`,
          shortLabel: `B${port.index}`,
          endpointType: 'olt-aux',
          oltAuxPortId: port.id,
          oltAuxRole: 'BOOT',
          active: port.active,
        });
      });

      (olt.consolePorts || []).forEach((port) => {
        items.push({
          id: `olt:${olt.id}:c:${port.index}`,
          entityId: `olt:${olt.id}`,
          label: `OLT ${olt.name} - CONSOLE ${port.index}`,
          shortLabel: `C${port.index}`,
          endpointType: 'olt-aux',
          oltAuxPortId: port.id,
          oltAuxRole: 'CONSOLE',
          active: port.active,
        });
      });

      olt.slots.forEach((slot) => {
        slot.pons.forEach((pon) => {
          items.push({
            id: `olt:${olt.id}:s:${slot.index}:p:${pon.index}`,
            entityId: `olt:${olt.id}`,
            label: `OLT ${olt.name} - Slot ${slot.index} PON ${pon.index}`,
            shortLabel: `PON${pon.index}`,
            endpointType: 'pon',
            slotId: slot.id,
            ponId: pon.id,
            active: pon.active,
          });
        });
      });
    });

    (currentPop.switches || []).forEach((sw) => {
      sw.uplinks.forEach((port) => {
        items.push({
          id: `switch:${sw.id}:u:${port.index}`,
          entityId: `switch:${sw.id}`,
          label: `SW ${sw.name} - Uplink ${port.index}`,
          shortLabel: `UP${port.index}`,
          endpointType: 'switch-port',
          portId: port.id,
          isUplink: true,
          active: port.active,
        });
      });
      sw.ports.forEach((port) => {
        items.push({
          id: `switch:${sw.id}:p:${port.index}`,
          entityId: `switch:${sw.id}`,
          label: `SW ${sw.name} - Porta ${port.index}`,
          shortLabel: `GE${port.index}`,
          endpointType: 'switch-port',
          portId: port.id,
          isUplink: false,
          active: port.active,
        });
      });
    });

    (currentPop.routers || []).forEach((router) => {
      router.interfaces.forEach((iface) => {
        items.push({
          id: `router:${router.id}:${iface.role.toLowerCase()}:${iface.index}`,
          entityId: `router:${router.id}`,
          label: `RTR ${router.name} - ${iface.role} ${iface.index}`,
          shortLabel: `${iface.role}${iface.index}`,
          endpointType: 'router-iface',
          routerInterfaceId: iface.id,
          role: iface.role,
          active: iface.active,
        });
      });
    });

    currentPop.cables.forEach((cable) => {
      const fibersPerTube = Math.max(1, cable.fibersPerTube || 12);
      cable.fibers.forEach((fiber) => {
        const tubeNumber = fiber.tubeNumber || Math.floor((fiber.number - 1) / fibersPerTube) + 1;
        const localFiberNumber = ((fiber.number - 1) % fibersPerTube) + 1;
        items.push({
          id: `cable:${cable.id}:f:${fiber.number}`,
          entityId: `cable:${cable.id}`,
          label: `CABO ${cable.name} - Tubo ${tubeNumber} Fibra ${localFiberNumber} (F${fiber.number})`,
          shortLabel: `${tubeNumber}.${localFiberNumber}`,
          endpointType: 'fiber',
          tubeNumber,
          localFiberNumber,
          active: true,
        });
      });
    });

    return items;
  }, [currentPop]);

  const endpointsByEntity = useMemo(() => endpoints.reduce<Record<string, EndpointNode[]>>((acc, endpoint) => {
    if (!acc[endpoint.entityId]) acc[endpoint.entityId] = [];
    acc[endpoint.entityId]!.push(endpoint);
    return acc;
  }, {}), [endpoints]);

  const endpointById = useMemo(() => endpoints.reduce<Record<string, EndpointNode>>((acc, endpoint) => {
    acc[endpoint.id] = endpoint;
    return acc;
  }, {}), [endpoints]);

  const rackEntityOptions = useMemo<PopEntity[]>(() => {
    if (rackFusionScope !== 'dio-bigtail') return entityOptions;
    const allowed = new Set<string>();
    if (rackFusionDioId) {
      allowed.add(`dio:${rackFusionDioId}`);
    } else {
      currentPop.dios.forEach((dio) => allowed.add(`dio:${dio.id}`));
    }
    currentPop.cables
      .filter((cable) => cable.type === 'bigtail')
      .forEach((cable) => allowed.add(`cable:${cable.id}`));
    return entityOptions.filter((entity) => allowed.has(entity.id));
  }, [rackFusionScope, rackFusionDioId, currentPop.dios, currentPop.cables, entityOptions]);

  const rackEndpointsByEntity = useMemo(() => {
    const allowed = new Set(rackEntityOptions.map((entity) => entity.id));
    return Object.entries(endpointsByEntity).reduce<Record<string, EndpointNode[]>>((acc, [entityId, entityEndpoints]) => {
      if (allowed.has(entityId)) acc[entityId] = entityEndpoints;
      return acc;
    }, {});
  }, [rackEntityOptions, endpointsByEntity]);

  const rackEndpointById = useMemo(() => {
    return Object.values(rackEndpointsByEntity).flat().reduce<Record<string, EndpointNode>>((acc, endpoint) => {
      acc[endpoint.id] = endpoint;
      return acc;
    }, {});
  }, [rackEndpointsByEntity]);

  const rackFusions = useMemo(() => {
    if (rackFusionScope !== 'dio-bigtail') return currentPop.fusions;
    const visible = new Set(Object.keys(rackEndpointById));
    return currentPop.fusions.filter((fusion) => visible.has(fusion.endpointAId) && visible.has(fusion.endpointBId));
  }, [rackFusionScope, currentPop.fusions, rackEndpointById]);

  const dioFusionEntityOptions = useMemo<PopEntity[]>(() => {
    if (!dioFusionTargetId) return [];
    const selectedDioEntityId = `dio:${dioFusionTargetId}`;
    const allowed = new Set<string>([selectedDioEntityId]);
    currentPop.cables.forEach((cable) => allowed.add(`cable:${cable.id}`));
    return entityOptions.filter((entity) => allowed.has(entity.id));
  }, [dioFusionTargetId, currentPop.cables, entityOptions]);

  const dioFusionEndpointsByEntity = useMemo(() => {
    const allowed = new Set(dioFusionEntityOptions.map((entity) => entity.id));
    return Object.entries(endpointsByEntity).reduce<Record<string, EndpointNode[]>>((acc, [entityId, entityEndpoints]) => {
      if (allowed.has(entityId)) acc[entityId] = entityEndpoints;
      return acc;
    }, {});
  }, [dioFusionEntityOptions, endpointsByEntity]);

  const dioFusionEndpointById = useMemo(() => {
    return Object.values(dioFusionEndpointsByEntity).flat().reduce<Record<string, EndpointNode>>((acc, endpoint) => {
      acc[endpoint.id] = endpoint;
      return acc;
    }, {});
  }, [dioFusionEndpointsByEntity]);

  const dioFusionFusions = useMemo(() => {
    const visible = new Set(Object.keys(dioFusionEndpointById));
    return currentPop.fusions.filter((fusion) => visible.has(fusion.endpointAId) && visible.has(fusion.endpointBId));
  }, [currentPop.fusions, dioFusionEndpointById]);

  const dioFusionSceneSize = useMemo(() => {
    const positions = dioFusionEntityOptions
      .map((entity) => nodePositions[entity.id])
      .filter((value): value is { x: number; y: number } => Boolean(value));
    const maxX = positions.length > 0 ? Math.max(...positions.map((p) => p.x)) : 0;
    const maxY = positions.length > 0 ? Math.max(...positions.map((p) => p.y)) : 0;
    return { width: Math.max(980, maxX + 280), height: Math.max(620, maxY + 220) };
  }, [dioFusionEntityOptions, nodePositions]);

  const totalFusionLoss = useMemo(() => currentPop.fusions.reduce((sum, fusion) => sum + (fusion.attenuation || 0), 0), [currentPop.fusions]);

  const avgTxDbm = useMemo(() => {
    const txList: number[] = [];
    currentPop.olts.forEach((olt) => {
      olt.slots.forEach((slot) => {
        slot.pons.forEach((pon) => {
          if (pon.active) txList.push(pon.gbic.txPowerDbm);
        });
      });
    });
    if (txList.length === 0) return 0;
    return txList.reduce((sum, tx) => sum + tx, 0) / txList.length;
  }, [currentPop.olts]);

  const estimatedRxDbm = avgTxDbm - totalFusionLoss;
  const mapCableModelOptions = useMemo(
    () => CABLE_MODEL_OPTIONS.filter((item) => item.category === mapCableType),
    [mapCableType]
  );
  const mapCableCapacity = Math.max(1, mapCableLooseTubeCount * mapCableFibersPerTube);
  const selectedMapCableTarget = useMemo(
    () => mapCableTargets.find((target) => target.id === mapCableTargetId) || null,
    [mapCableTargets, mapCableTargetId]
  );

  useEffect(() => {
    if (mapCableModelOptions.length === 0) return;
    if (!mapCableModelOptions.some((option) => option.id === mapCableModel)) {
      setMapCableModel(mapCableModelOptions[0]!.id);
    }
  }, [mapCableModel, mapCableModelOptions]);

  useEffect(() => {
    if (cableFiberCount > mapCableCapacity) {
      setCableFiberCount(mapCableCapacity);
    }
  }, [cableFiberCount, mapCableCapacity]);

  useEffect(() => {
    if (mapCableDirection === 'incoming' && !mapCableTargetId) {
      setMapCableDirection('outgoing');
    }
  }, [mapCableDirection, mapCableTargetId]);

  useEffect(() => {
    setEditPositionLat(currentPop.position.lat.toFixed(6));
    setEditPositionLng(currentPop.position.lng.toFixed(6));
  }, [currentPop.id, currentPop.position.lat, currentPop.position.lng]);

  useEffect(() => {
    if (currentPop.dios.length === 0) {
      setRackFusionDioId('');
      return;
    }
    if (!rackFusionDioId || !currentPop.dios.some((dio) => dio.id === rackFusionDioId)) {
      setRackFusionDioId(currentPop.dios[0]!.id);
    }
  }, [currentPop.dios, rackFusionDioId]);

  useEffect(() => {
    if (!selectedEndpointId) return;
    if (rackFusionScope === 'dio-bigtail' && !rackEndpointById[selectedEndpointId]) {
      setSelectedEndpointId(null);
    }
  }, [rackFusionScope, rackEndpointById, selectedEndpointId]);

  useEffect(() => {
    if (!dioFusionOpen) return;
    if (currentPop.dios.length === 0) {
      setDioFusionTargetId('');
      return;
    }
    if (!dioFusionTargetId || !currentPop.dios.some((dio) => dio.id === dioFusionTargetId)) {
      setDioFusionTargetId(currentPop.dios[0]!.id);
    }
  }, [dioFusionOpen, currentPop.dios, dioFusionTargetId]);

  useEffect(() => {
    if (!dioFusionOpen || dioFusionEntityOptions.length === 0) return;
    setNodePositions((prev) => {
      const next = { ...prev };
      const cols = 2;
      dioFusionEntityOptions.forEach((entity, idx) => {
        if (next[entity.id]) return;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        next[entity.id] = { x: 26 + col * 380, y: 24 + row * 220 };
      });
      return next;
    });
  }, [dioFusionOpen, dioFusionEntityOptions]);

  const sceneSize = useMemo(() => {
    const positions = Object.values(nodePositions);
    const maxX = positions.length > 0 ? Math.max(...positions.map((p) => p.x)) : 0;
    const maxY = positions.length > 0 ? Math.max(...positions.map((p) => p.y)) : 0;
    return { width: Math.max(1100, maxX + 280), height: Math.max(700, maxY + 220) };
  }, [nodePositions]);

  useEffect(() => {
    if (!open || entityOptions.length === 0) return;
    setNodePositions((prev) => {
      const next = { ...prev };
      const savedLayout = currentPop.fusionLayout || {};
      const cols = 3;
      entityOptions.forEach((entity, idx) => {
        if (savedLayout[entity.id]) {
          next[entity.id] = savedLayout[entity.id]!;
          return;
        }
        if (next[entity.id]) return;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        next[entity.id] = { x: 26 + col * 360, y: 24 + row * 220 };
      });
      return next;
    });
  }, [open, entityOptions, currentPop.fusionLayout]);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  useEffect(() => {
    if (!open) setSelectedEndpointId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let changed = false;
    const normalizedCables = currentPop.cables.map((cable) => {
      const fibersPerTube = Math.max(1, cable.fibersPerTube || 12);
      const looseTubeCount = Math.max(
        1,
        cable.looseTubeCount || Math.ceil(Math.max(cable.fiberCount || 0, cable.fibers.length) / fibersPerTube)
      );
      const capacity = looseTubeCount * fibersPerTube;
      const desiredFiberCount = Math.max(cable.fiberCount || 0, cable.fibers.length, capacity);

      const existingByNumber = new Map(cable.fibers.map((fiber) => [fiber.number, fiber]));
      const fibers = Array.from({ length: desiredFiberCount }, (_, idx) => {
        const number = idx + 1;
        const current = existingByNumber.get(number);
        const tubeNumber = Math.floor(idx / fibersPerTube) + 1;
        if (current) {
          return {
            ...current,
            tubeNumber: current.tubeNumber || tubeNumber,
          };
        }
        changed = true;
        return {
          id: `pop-${cable.id}-f-${number}-${Math.random().toString(36).slice(2, 8)}`,
          number,
          tubeNumber,
          color: FIBER_COLORS[(number - 1) % 12],
          status: 'inactive' as const,
        };
      });

      if (
        cable.fiberCount !== desiredFiberCount ||
        cable.looseTubeCount !== looseTubeCount ||
        cable.fibersPerTube !== fibersPerTube ||
        fibers.length !== cable.fibers.length
      ) {
        changed = true;
      }

      return {
        ...cable,
        fiberCount: desiredFiberCount,
        looseTubeCount,
        fibersPerTube,
        fibers,
      };
    });

    if (!changed) return;
    updatePop(currentPop.id, { cables: normalizedCables });
  }, [open, currentPop.id, currentPop.cables, updatePop]);

  useEffect(() => {
    const onResize = () => setSceneRenderTick((prev) => prev + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const maxByWindow = Math.max(380, window.innerHeight - 220);
    setFusionViewportHeight((prev) => Math.min(prev, maxByWindow));
  }, []);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => setSceneRenderTick((prev) => prev + 1));
    return () => window.cancelAnimationFrame(raf);
  }, [open, boardZoom, nodePositions, currentPop.fusions.length, endpoints.length]);

  const getScenePoint = useCallback((clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const rect = scene.getBoundingClientRect();
    return { x: (clientX - rect.left) / boardZoom, y: (clientY - rect.top) / boardZoom };
  }, [boardZoom]);

  const getEndpointPosition = (endpointId: string) => {
    const scene = sceneRef.current;
    const endpoint = endpointRefs.current[endpointId];
    if (!scene || !endpoint) return null;
    const sceneRect = scene.getBoundingClientRect();
    const endpointRect = endpoint.getBoundingClientRect();
    return {
      x: (endpointRect.left + endpointRect.width / 2 - sceneRect.left) / boardZoom,
      y: (endpointRect.top + endpointRect.height / 2 - sceneRect.top) / boardZoom,
    };
  };

  const buildOrganizedPath = (
    sceneWidth: number,
    start: { x: number; y: number },
    end: { x: number; y: number },
    laneOffset: number = 0,
    index: number = 0
  ) => {
    const leftRailX = 92 + (laneOffset * 0.25);
    const rightRailX = sceneWidth - 92 - (laneOffset * 0.25);
    const startRailX = start.x < sceneWidth / 2 ? leftRailX : rightRailX;
    const endRailX = end.x < sceneWidth / 2 ? leftRailX : rightRailX;
    const busY = 72 + (index % 8) * 7;

    const points: Array<{ x: number; y: number }> = [
      { x: start.x, y: start.y + laneOffset },
      { x: startRailX, y: start.y + laneOffset },
    ];

    if (Math.abs(startRailX - endRailX) < 2) {
      points.push({ x: startRailX, y: end.y - laneOffset });
    } else {
      points.push({ x: startRailX, y: busY });
      points.push({ x: endRailX, y: busY });
      points.push({ x: endRailX, y: end.y - laneOffset });
    }

    points.push({ x: end.x, y: end.y - laneOffset });

    return points
      .map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');
  };

  const getCableHue = (fusionId: string) => {
    let hash = 0;
    for (let i = 0; i < fusionId.length; i++) hash = ((hash << 5) - hash) + fusionId.charCodeAt(i);
    return Math.abs(hash) % 360;
  };

  const getCablePalette = (fusion: PopFusion) => {
    if (fusion.attenuation === 0) {
      return { outer: '#047857', inner: '#34d399', glow: 'rgba(16,185,129,0.45)' };
    }
    const hue = getCableHue(fusion.id);
    return {
      outer: `hsl(${hue} 78% 34%)`,
      inner: `hsl(${hue} 90% 62%)`,
      glow: `hsl(${hue} 90% 52% / 0.38)`,
    };
  };

  const endpointLinks = useMemo(() => {
    const links = new Map<string, Array<{ otherId: string; fusionId: string }>>();
    currentPop.fusions.forEach((fusion) => {
      if (!links.has(fusion.endpointAId)) links.set(fusion.endpointAId, []);
      if (!links.has(fusion.endpointBId)) links.set(fusion.endpointBId, []);
      links.get(fusion.endpointAId)!.push({ otherId: fusion.endpointBId, fusionId: fusion.id });
      links.get(fusion.endpointBId)!.push({ otherId: fusion.endpointAId, fusionId: fusion.id });
    });
    return links;
  }, [currentPop.fusions]);

  const endpointVlanMap = useMemo(() => {
    const map = new Map<string, number[]>();
    currentPop.fusions.forEach((fusion) => {
      if (typeof fusion.vlan !== 'number') return;
      const pushVlan = (endpointId: string) => {
        const list = map.get(endpointId) || [];
        if (!list.includes(fusion.vlan!)) list.push(fusion.vlan!);
        map.set(endpointId, list);
      };
      pushVlan(fusion.endpointAId);
      pushVlan(fusion.endpointBId);
    });
    return map;
  }, [currentPop.fusions]);

  const highlightedTrace = useMemo(() => {
    const fusionIds = new Set<string>();
    const endpointIds = new Set<string>();
    if (!selectedEndpointId) return { fusionIds, endpointIds };

    const queue: string[] = [selectedEndpointId];
    endpointIds.add(selectedEndpointId);

    while (queue.length > 0) {
      const endpointId = queue.shift()!;
      const links = endpointLinks.get(endpointId) || [];
      links.forEach((link) => {
        fusionIds.add(link.fusionId);
        if (!endpointIds.has(link.otherId)) {
          endpointIds.add(link.otherId);
          queue.push(link.otherId);
        }
      });
    }

    return { fusionIds, endpointIds };
  }, [endpointLinks, selectedEndpointId]);

  const startNodeDrag = (entityId: string, event: React.MouseEvent) => {
    const point = getScenePoint(event.clientX, event.clientY);
    if (!point) return;
    const pos = nodePositions[entityId] || { x: 0, y: 0 };
    setNodeDragState({ entityId, offsetX: point.x - pos.x, offsetY: point.y - pos.y });
  };

  const getEntityBounds = (entityId: string) => {
    if (entityId.startsWith('olt:')) return { width: 760, height: 390 };
    if (entityId.startsWith('switch:')) return { width: 640, height: 230 };
    if (entityId.startsWith('router:')) return { width: 620, height: 230 };
    if (entityId.startsWith('dio:')) return { width: 420, height: 180 };
    return { width: 360, height: 180 };
  };

  const startEndpointDrag = (endpointId: string, disabled: boolean) => {
    if (disabled) return;
    const pos = getEndpointPosition(endpointId);
    if (!pos) return;
    setDragState({ fromId: endpointId, x: pos.x, y: pos.y });
  };

  const finishEndpointDrag = (targetId: string, disabled: boolean) => {
    if (disabled || !dragState) return;
    if (dragState.fromId === targetId) {
      setDragState(null);
      return;
    }
    const fromEndpoint = endpoints.find((item) => item.id === dragState.fromId);
    const toEndpoint = endpoints.find((item) => item.id === targetId);
    const requiresVlan = (endpoint?: EndpointNode) => endpoint && endpoint.endpointType !== 'dio' && endpoint.endpointType !== 'fiber';
    let vlan: number | undefined;
    if (requiresVlan(fromEndpoint) || requiresVlan(toEndpoint)) {
      setLinkConfig({
        open: true,
        fromId: dragState.fromId,
        toId: targetId,
        vlan: '100',
      });
      setDragState(null);
      return;
    }
    connectPopEndpoints(currentPop.id, dragState.fromId, targetId, fusionType, noLoss, vlan);
    setDragState(null);
  };

  const persistFusionLayout = useCallback(() => {
    const keys = new Set(entityOptions.map((entity) => entity.id));
    const normalized = Object.entries(nodePositionsRef.current).reduce<Record<string, { x: number; y: number }>>((acc, [key, value]) => {
      if (!keys.has(key)) return acc;
      acc[key] = value;
      return acc;
    }, {});
    updatePop(currentPop.id, { fusionLayout: normalized });
  }, [currentPop.id, entityOptions, updatePop]);

  useEffect(() => {
    if (!nodeDragState && !dragState) return;
    const onMove = (event: MouseEvent) => {
      const point = getScenePoint(event.clientX, event.clientY);
      if (!point) return;
      if (dragState) setDragState((prev) => (prev ? { ...prev, x: point.x, y: point.y } : null));
      if (nodeDragState) {
        const bounds = getEntityBounds(nodeDragState.entityId);
        setNodePositions((prev) => ({
          ...prev,
          [nodeDragState.entityId]: {
            x: Math.max(0, Math.min(sceneSize.width - bounds.width, point.x - nodeDragState.offsetX)),
            y: Math.max(0, point.y - nodeDragState.offsetY),
          },
        }));
      }
    };
    const onUp = () => {
      if (nodeDragState) persistFusionLayout();
      setNodeDragState(null);
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [nodeDragState, dragState, sceneSize.width, sceneSize.height, boardZoom, getScenePoint, persistFusionLayout]);

  const handleSceneWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.08 : 0.08;
    setBoardZoom((prev) => Math.max(0.45, Math.min(2.2, Number((prev + direction).toFixed(2)))));
    setSceneRenderTick((prev) => prev + 1);
  };

  const handleActivatePon = (endpoint: EndpointNode) => {
    if (!endpoint.slotId || !endpoint.ponId) return;
    const oltId = endpoint.entityId.replace('olt:', '');
    const olt = currentPop.olts.find((item) => item.id === oltId);
    const slot = olt?.slots.find((item) => item.id === endpoint.slotId);
    const pon = slot?.pons.find((item) => item.id === endpoint.ponId);
    setPonConfig({
      open: true,
      oltId,
      slotId: endpoint.slotId,
      ponId: endpoint.ponId,
      gbicModel: pon?.gbic.model || gbicModel || 'C++',
      txPowerDbm: `${pon?.gbic.txPowerDbm ?? txPowerDbm ?? 3}`,
    });
  };

  const handleSaveLinkConfig = () => {
    const parsed = Number.parseInt(linkConfig.vlan, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4094) return;
    if (linkConfig.fusionId) {
      updatePop(currentPop.id, {
        fusions: currentPop.fusions.map((fusion) => (fusion.id === linkConfig.fusionId ? { ...fusion, vlan: parsed } : fusion)),
      });
    } else {
      connectPopEndpoints(currentPop.id, linkConfig.fromId, linkConfig.toId, fusionType, noLoss, parsed);
    }
    setLinkConfig({ open: false, fromId: '', toId: '', vlan: '100' });
  };

  const handleSavePonConfig = () => {
    const txValue = Number.parseFloat(ponConfig.txPowerDbm);
    if (!ponConfig.gbicModel.trim() || Number.isNaN(txValue)) return;
    activateOltPon(currentPop.id, ponConfig.oltId, ponConfig.slotId, ponConfig.ponId, ponConfig.gbicModel.trim(), txValue);
    setPonConfig({ open: false, oltId: '', slotId: '', ponId: '', gbicModel: gbicModel || 'C++', txPowerDbm: `${txPowerDbm || 3}` });
  };

  const handleOpenFusionEdit = (fusion: PopFusion) => {
    setLinkConfig({
      open: true,
      fromId: fusion.endpointAId,
      toId: fusion.endpointBId,
      vlan: `${fusion.vlan ?? 100}`,
      fusionId: fusion.id,
    });
  };

  const openDioFusionWorkspace = (dioId: string) => {
    setDioFusionTargetId(dioId);
    setDioFusionOpen(true);
  };

  const getPortDisplay = (endpoint: EndpointNode) => {
    if (endpoint.endpointType === 'fiber') {
      if (typeof endpoint.tubeNumber === 'number' && typeof endpoint.localFiberNumber === 'number') {
        return `${endpoint.tubeNumber}.${endpoint.localFiberNumber}`;
      }
      return endpoint.shortLabel;
    }
    return endpoint.shortLabel.match(/\d+/)?.[0] || endpoint.shortLabel;
  };

  const renderPortButton = (endpoint: EndpointNode, className?: string, displayLabel?: string) => {
    const isDisabled = endpoint.active === false;
    const isSelected = selectedEndpointId === endpoint.id;
    const isOnTrace = highlightedTrace.endpointIds.has(endpoint.id);
    const vlans = endpointVlanMap.get(endpoint.id) || [];
    const vlanLabel = vlans.length === 1 ? `VLAN: ${vlans[0]}` : vlans.length > 1 ? `VLAN: ${vlans[0]}+` : null;
    return (
      <div key={endpoint.id} className="relative inline-flex">
        {vlanLabel && (
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 h-3.5 px-1 rounded border border-cyan-300 bg-cyan-50 text-cyan-700 text-[8px] leading-[12px] whitespace-nowrap">
            {vlanLabel}
          </span>
        )}
        <button
          ref={(node) => { endpointRefs.current[endpoint.id] = node; }}
          type="button"
          onMouseDown={(event) => { event.preventDefault(); startEndpointDrag(endpoint.id, isDisabled); }}
          onMouseUp={() => finishEndpointDrag(endpoint.id, isDisabled)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedEndpointId((prev) => {
              const next = prev === endpoint.id ? null : endpoint.id;
              if (!next) {
                window.dispatchEvent(new CustomEvent('ftth:trace-clear'));
                return next;
              }
              if (endpoint.endpointType === 'fiber') {
                const parts = endpoint.id.split(':');
                const cableId = parts[1];
                const marker = parts[2];
                const fiberNumber = Number.parseInt(parts[3] || '', 10);
                if (cableId && marker === 'f' && !Number.isNaN(fiberNumber)) {
                  const cable = (currentPop.cables || []).find((item) => item.id === cableId);
                  const fiber = cable?.fibers.find((item) => item.number === fiberNumber);
                  if (fiber) {
                    window.dispatchEvent(new CustomEvent('ftth:trace-fiber', { detail: { fiberId: fiber.id } }));
                  }
                }
              }
              return next;
            });
          }}
          disabled={isDisabled}
          className={`${className || `h-7 px-2 rounded border text-[11px] ${isDisabled ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed' : 'bg-white hover:bg-slate-50 border-slate-300 cursor-pointer'}`} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${!isSelected && isOnTrace ? 'ring-1 ring-cyan-400/80 ring-offset-1' : ''}`}
          title={endpoint.label}
        >
          {displayLabel || endpoint.shortLabel}
        </button>
      </div>
    );
  };

  const mapEndpointSelectionLabel =
    mapCableDirection === 'incoming'
      ? 'Origem no mapa (caixa ou POP)'
      : 'Destino no mapa (caixa ou POP) - opcional';

  const mapEndpointRequired = mapCableDirection === 'incoming';

  const handleLaunchMapCable = useCallback(() => {
    const trimmedName = cableName.trim();
    if (!trimmedName) return;
    if (mapEndpointRequired && !mapCableTargetId) {
      toast.error('Selecione a origem no mapa para cabo chegando neste POP.');
      return;
    }

    const startPoint = mapCableDirection === 'incoming' ? mapCableTargetId : currentPop.id;
    const endPoint = mapCableDirection === 'incoming' ? currentPop.id : mapCableTargetId;
    const fiberCount = Math.max(1, Math.min(cableFiberCount, mapCableCapacity));

    onOpenChange(false);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('ftth:start-map-cable-drawing', {
          detail: {
            name: trimmedName,
            type: mapCableType,
            model: mapCableModel,
            fiberCount,
            looseTubeCount: mapCableLooseTubeCount,
            fibersPerTube: mapCableFibersPerTube,
            startPoint,
            endPoint,
          },
        })
      );
    }, 120);

    if (selectedMapCableTarget?.kind === 'pop') {
      toast.success('Cabo POP a POP iniciado. As terminacoes serao criadas automaticamente ao salvar no mapa.');
    } else {
      toast.success('Desenho do cabo iniciado. As terminacoes no POP serao criadas automaticamente ao salvar no mapa.');
    }

    setCableName('');
    setCableFiberCount(Math.min(12, mapCableCapacity));
    setMapCableTargetId('');
    setMapCableDirection('outgoing');
  }, [
    cableFiberCount,
    cableName,
    currentPop.id,
    mapCableCapacity,
    mapCableDirection,
    mapCableFibersPerTube,
    mapCableLooseTubeCount,
    mapCableModel,
    mapCableTargetId,
    mapCableType,
    mapEndpointRequired,
    onOpenChange,
    selectedMapCableTarget?.kind,
  ]);

  const handleSavePopPosition = useCallback(() => {
    const parsedLat = Number.parseFloat(editPositionLat.replace(',', '.'));
    const parsedLng = Number.parseFloat(editPositionLng.replace(',', '.'));
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      toast.error('Latitude/Longitude invalidas.');
      return;
    }
    if (parsedLat < -90 || parsedLat > 90) {
      toast.error('Latitude deve estar entre -90 e 90.');
      return;
    }
    if (parsedLng < -180 || parsedLng > 180) {
      toast.error('Longitude deve estar entre -180 e 180.');
      return;
    }

    updatePop(currentPop.id, {
      position: {
        lat: parsedLat,
        lng: parsedLng,
      },
    });
    toast.success('Posicao do POP atualizada.');
  }, [currentPop.id, editPositionLat, editPositionLng, updatePop]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <FullscreenModalShell>
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              POP {currentPop.name}
              <Badge variant="outline">{city ? `${city.sigla} - ${city.name}` : 'Sem cidade'}</Badge>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar tela do POP"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
          <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as 'infra' | 'fusions' | 'signal')} className="space-y-4">
            <TabsList className="w-full max-w-[860px] flex gap-2 overflow-x-auto">
              <TabsTrigger className="shrink-0 whitespace-nowrap" value="infra">Infra POP</TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap" value="fusions">Rack POP</TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap" value="signal">Sinal/Perda</TabsTrigger>
            </TabsList>

            <TabsContent value="infra" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">DIOs</p><p className="text-2xl font-semibold">{currentPop.dios.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">OLTs</p><p className="text-2xl font-semibold">{currentPop.olts.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Switches</p><p className="text-2xl font-semibold">{(currentPop.switches || []).length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Roteadores</p><p className="text-2xl font-semibold">{(currentPop.routers || []).length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Cabos POP</p><p className="text-2xl font-semibold">{currentPop.cables.length}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Fusoes</p><p className="text-2xl font-semibold">{currentPop.fusions.length}</p></div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Posicao geografica do POP</p>
                  <p className="text-xs text-gray-500">Voce tambem pode arrastar o marcador no mapa quando o modo Editar estiver ativo.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Latitude</Label>
                    <Input value={editPositionLat} onChange={(event) => setEditPositionLat(event.target.value)} placeholder="-15.780148" />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input value={editPositionLng} onChange={(event) => setEditPositionLng(event.target.value)} placeholder="-47.929170" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSavePopPosition}>Salvar posicao</Button>
                </div>
              </div>

              <Tabs value={infraTab} onValueChange={(value) => setInfraTab(value as 'dio' | 'olt' | 'switch' | 'router' | 'cable')} className="space-y-4">
                <TabsList className="w-full flex gap-2 overflow-x-auto">
                  <TabsTrigger className="shrink-0 whitespace-nowrap" value="dio">DIO</TabsTrigger>
                  <TabsTrigger className="shrink-0 whitespace-nowrap" value="olt">OLT</TabsTrigger>
                  <TabsTrigger className="shrink-0 whitespace-nowrap" value="switch">Switch</TabsTrigger>
                  <TabsTrigger className="shrink-0 whitespace-nowrap" value="router">Roteador</TabsTrigger>
                  <TabsTrigger className="shrink-0 whitespace-nowrap" value="cable">Cabo</TabsTrigger>
                </TabsList>

                <TabsContent value="dio" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Cadastrar DIO</h4>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={dioName} onChange={(e) => setDioName(e.target.value)} placeholder="DIO Principal" /></div>
                    <div><Label>Portas</Label><Input type="number" min={1} value={dioPorts} onChange={(e) => setDioPorts(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                  </div>
                  <Button onClick={() => {
                    if (!dioName.trim()) return;
                    const created = addDioToPop(currentPop.id, { name: dioName.trim(), portCount: dioPorts });
                    if (!created) return;
                    setDioName('');
                  }}>Adicionar DIO</Button>
                  {currentPop.dios.length > 0 && (
                    <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                      <p className="text-xs font-medium text-slate-700">Fusao DIO x Cabos</p>
                      <p className="text-xs text-slate-500">
                        Abra a tela de fusoes no mesmo esquema visual das caixas, focada no DIO selecionado.
                      </p>
                      <div className="space-y-2">
                        {currentPop.dios.map((dio) => (
                          <div key={dio.id} className="flex items-center justify-between rounded border bg-white px-2 py-1.5">
                            <div>
                              <p className="text-sm font-medium">{dio.name}</p>
                              <p className="text-xs text-gray-500">{dio.portCount} portas</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openDioFusionWorkspace(dio.id)}>
                              Abrir Fusoes
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="olt" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Cadastrar OLT</h4>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={oltName} onChange={(e) => setOltName(e.target.value)} placeholder="OLT POP-01" /></div>
                    <div><Label>Tipo</Label><Select value={oltType} onValueChange={(v: 'compact' | 'chassi') => setOltType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="compact">Compacta</SelectItem><SelectItem value="chassi">Chassi</SelectItem></SelectContent></Select></div>
                    <div><Label>Classe GBIC padrao</Label><Input value={gbicModel} onChange={(e) => setGbicModel(e.target.value)} placeholder="C++" /></div>
                    <div><Label>Tx padrao (dBm)</Label><Input type="number" value={txPowerDbm} onChange={(e) => setTxPowerDbm(Number.parseFloat(e.target.value || '0'))} /></div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <div><Label>Portas Uplink</Label><Input type="number" min={1} value={oltUplinkPorts} onChange={(e) => setOltUplinkPorts(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                    <div><Label>Portas BOOT</Label><Input type="number" min={0} value={oltBootPorts} onChange={(e) => setOltBootPorts(Math.max(0, Number.parseInt(e.target.value || '0', 10)))} /></div>
                    <div><Label>Portas CONSOLE</Label><Input type="number" min={0} value={oltConsolePorts} onChange={(e) => setOltConsolePorts(Math.max(0, Number.parseInt(e.target.value || '0', 10)))} /></div>
                  </div>
                  <p className="text-xs text-zinc-500">Conector do PON fixo em UPC.</p>
                  <Button onClick={() => {
                    if (!oltName.trim()) return;
                    const created = addOltToPop(currentPop.id, {
                      name: oltName.trim(),
                      type: oltType,
                      uplinkPortCount: oltUplinkPorts,
                      bootPortCount: oltBootPorts,
                      consolePortCount: oltConsolePorts,
                    });
                    if (!created) return;
                    setOltName('');
                  }}>Adicionar OLT</Button>
                </TabsContent>

                <TabsContent value="switch" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Cadastrar Switch</h4>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={switchName} onChange={(e) => setSwitchName(e.target.value)} placeholder="SW-POP-01" /></div>
                    <div><Label>Portas de acesso</Label><Input type="number" min={1} value={switchPorts} onChange={(e) => setSwitchPorts(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                    <div><Label>Portas Uplink</Label><Input type="number" min={1} value={switchUplinks} onChange={(e) => setSwitchUplinks(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                  </div>
                  <Button onClick={() => {
                    if (!switchName.trim()) return;
                    const created = addSwitchToPop(currentPop.id, { name: switchName.trim(), portCount: switchPorts, uplinkPortCount: switchUplinks });
                    if (!created) return;
                    setSwitchName('');
                  }}>Adicionar Switch</Button>
                </TabsContent>

                <TabsContent value="router" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Cadastrar Roteador (Concentrador)</h4>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={routerName} onChange={(e) => setRouterName(e.target.value)} placeholder="RTR-POP-01" /></div>
                    <div><Label>Interfaces WAN</Label><Input type="number" min={1} value={routerWanCount} onChange={(e) => setRouterWanCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                    <div><Label>Interfaces LAN</Label><Input type="number" min={1} value={routerLanCount} onChange={(e) => setRouterLanCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                  </div>
                  <Button onClick={() => {
                    if (!routerName.trim()) return;
                    const created = addRouterToPop(currentPop.id, { name: routerName.trim(), wanCount: routerWanCount, lanCount: routerLanCount });
                    if (!created) return;
                    setRouterName('');
                  }}>Adicionar Roteador</Button>
                </TabsContent>

                <TabsContent value="cable" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Lancar Cabo no Mapa (POP)</h4>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <div><Label>Nome</Label><Input value={cableName} onChange={(e) => setCableName(e.target.value)} placeholder="BACKBONE POP A-POP B" /></div>
                    <div>
                      <Label>Direcao</Label>
                      <Select value={mapCableDirection} onValueChange={(v: 'outgoing' | 'incoming') => setMapCableDirection(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="outgoing">Saindo deste POP</SelectItem>
                          <SelectItem value="incoming" disabled={!mapCableTargetId}>Chegando neste POP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Tipo (mapa)</Label><Select value={mapCableType} onValueChange={(v: Cable['type']) => setMapCableType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="distribution">Distribuicao</SelectItem><SelectItem value="feeder">Feeder</SelectItem><SelectItem value="backbone">Backbone</SelectItem><SelectItem value="drop">Drop</SelectItem></SelectContent></Select></div>
                    <div><Label>Tubos loose</Label><Input type="number" min={1} value={mapCableLooseTubeCount} onChange={(e) => setMapCableLooseTubeCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                    <div><Label>Fibras por tubo</Label><Input type="number" min={1} value={mapCableFibersPerTube} onChange={(e) => setMapCableFibersPerTube(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><Label>Modelo (mapa)</Label><Select value={mapCableModel} onValueChange={setMapCableModel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{mapCableModelOptions.map((model) => (<SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>))}</SelectContent></Select></div>
                    <div><Label>Fibras</Label><Input type="number" min={1} max={mapCableCapacity} value={cableFiberCount} onChange={(e) => setCableFiberCount(Math.max(1, Math.min(mapCableCapacity, Number.parseInt(e.target.value || '1', 10))))} /></div>
                  </div>
                  <div>
                    <Label>{mapEndpointSelectionLabel}</Label>
                    <Select value={mapCableTargetId || '__none__'} onValueChange={(v) => setMapCableTargetId(v === '__none__' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{mapEndpointRequired ? 'Selecione a origem' : 'Sem destino'}</SelectItem>
                        {mapCableTargets.map((target) => (
                          <SelectItem key={target.id} value={target.id}>
                            {target.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">
                    Ao salvar no mapa, o sistema cria automaticamente terminacoes no POP de origem e no POP de destino (quando o destino for POP).
                  </div>
                  <Button
                    disabled={!cableName.trim() || (mapEndpointRequired && !mapCableTargetId)}
                    onClick={handleLaunchMapCable}
                  >
                    Abrir Mapa para Desenhar
                  </Button>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="fusions" className="space-y-4">
              <div className="rounded-lg border bg-slate-50 p-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Escopo da tela de fusoes</Label>
                        <Select value={rackFusionScope} onValueChange={(v: 'all' | 'dio-bigtail') => setRackFusionScope(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Rack completo (POP)</SelectItem>
                        <SelectItem value="dio-bigtail">Somente DIO x Bigtail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {rackFusionScope === 'dio-bigtail' && (
                    <div>
                      <Label>DIO alvo</Label>
                      <Select value={rackFusionDioId || '__none__'} onValueChange={(v) => setRackFusionDioId(v === '__none__' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione um DIO" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Todos os DIOs</SelectItem>
                          {currentPop.dios.map((dio) => (
                            <SelectItem key={dio.id} value={dio.id}>
                              {dio.name} ({dio.portCount} portas)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {rackFusionScope === 'dio-bigtail' && currentPop.cables.filter((cable) => cable.type === 'bigtail').length === 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    Nenhum cabo bigtail cadastrado. Cadastre um cabo tipo bigtail para fusionar no DIO.
                  </p>
                )}
              </div>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] items-end border rounded-lg p-3 bg-gray-50">
                <div><Label>Tipo de conexao</Label><Select value={fusionType} onValueChange={(v: PopFusion['fusionType']) => setFusionType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fusion">Fusao</SelectItem><SelectItem value="connector">Conector</SelectItem><SelectItem value="mechanical">Mecanica</SelectItem></SelectContent></Select></div>
                <Button variant={noLoss ? 'default' : 'outline'} onClick={() => setNoLoss((prev) => !prev)} className="w-full lg:w-auto">{noLoss ? 'Sem perda (0 dB)' : 'Perda normal'}</Button>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setBoardZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))))}>-</Button><Button variant="outline" size="sm" onClick={() => setBoardZoom(1)}>100%</Button><Button variant="outline" size="sm" onClick={() => setBoardZoom((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))))}>+</Button></div>
                <div className="text-xs text-gray-500 bg-white border rounded px-2 py-2">Arraste blocos e ligue porta a porta.</div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500">Altura da area:</span>
                <Button variant="outline" size="sm" onClick={() => setFusionViewportHeight((prev) => Math.max(380, prev - 80))}>- altura</Button>
                <Button variant="outline" size="sm" onClick={() => setFusionViewportHeight((prev) => Math.min(Math.max(380, window.innerHeight - 220), prev + 80))}>+ altura</Button>
                <span className="text-zinc-500">{fusionViewportHeight}px</span>
              </div>

              <div className="border rounded-xl overflow-hidden bg-zinc-100">
                <div
                  ref={fusionViewportRef}
                  className="relative min-h-[380px] overflow-auto"
                  style={{ height: `${fusionViewportHeight}px` }}
                  onScroll={() => setSceneRenderTick((prev) => prev + 1)}
                  onWheel={handleSceneWheel}
                  title="Use Ctrl + roda do mouse para zoom"
                >
                  <div className="pointer-events-none absolute inset-y-0 left-[92px] z-30 w-[18px] rounded-full border border-zinc-500/50 bg-gradient-to-b from-zinc-200 to-zinc-300 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-zinc-600">ORG L</div>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-[92px] z-30 w-[18px] rounded-full border border-zinc-500/50 bg-gradient-to-b from-zinc-200 to-zinc-300 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-zinc-600">ORG R</div>
                  </div>
                  <div
                    ref={sceneRef}
                    className="relative origin-top-left"
                    style={{ width: `${sceneSize.width}px`, height: `${sceneSize.height}px`, transform: `scale(${boardZoom})` }}
                    data-render-tick={sceneRenderTick}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setSelectedEndpointId(null);
                      }
                    }}
                  >
                    <div className="relative z-10">
                    {rackEntityOptions.map((entity) => {
                      const pos = nodePositions[entity.id] || { x: 24, y: 24 };
                      const entityEndpoints = rackEndpointsByEntity[entity.id] || [];

                      if (entity.type === 'olt') {
                        const oltId = entity.id.replace('olt:', '');
                        const olt = currentPop.olts.find((item) => item.id === oltId);
                        if (!olt) return null;
                        return (
                          <div key={entity.id} className="absolute w-[760px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_12px_28px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                            <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                            <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                            <div className="px-3 py-2 border-x-4 border-b border-zinc-900 font-semibold text-sm select-none text-zinc-800 bg-gradient-to-b from-white to-zinc-100 flex items-center justify-between gap-2">
                              <span>OLT CHASSI - {entity.label}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2"
                                  onClick={() => {
                                    const input = window.prompt('Quantas PONs no novo slot?', '16');
                                    if (input === null) return;
                                    const ponCount = Number.parseInt(input, 10);
                                    if (Number.isNaN(ponCount) || ponCount < 1) return;
                                    addSlotToOlt(currentPop.id, olt.id, ponCount);
                                  }}
                                >
                                  + SLOT
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 px-2"
                                  onClick={() => {
                                    if (!window.confirm(`Apagar OLT "${entity.label}"?`)) return;
                                    removeOltFromPop(currentPop.id, olt.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="px-3 py-2 border-x-4 border-b border-zinc-900 bg-gradient-to-b from-zinc-50 to-zinc-100 space-y-2">
                              <div className="text-[10px] text-zinc-600 mb-2">UPLINKS</div>
                              <div className="flex flex-wrap gap-2">
                                {entityEndpoints.filter((endpoint) => endpoint.endpointType === 'uplink').map((endpoint) => (
                                  <div key={endpoint.id} className="flex items-center gap-1 rounded border border-zinc-300 bg-white/90 px-1.5 py-1 shadow-sm">
                                    {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                    <button
                                      type="button"
                                      className={`h-2 w-2 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                      onClick={() => endpoint.uplinkId && toggleOltUplink(currentPop.id, olt.id, endpoint.uplinkId)}
                                      title={endpoint.active ? 'Desativar uplink' : 'Ativar uplink'}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="grid gap-2 md:grid-cols-2">
                                <div>
                                  <div className="text-[10px] text-zinc-600 mb-1">BOOT</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {entityEndpoints.filter((endpoint) => endpoint.endpointType === 'olt-aux' && endpoint.oltAuxRole === 'BOOT').map((endpoint) => (
                                      <div key={endpoint.id} className="rounded border border-zinc-300 bg-white/90 px-1 py-1 shadow-sm">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-amber-300 border-amber-600 text-amber-900 hover:bg-amber-400' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-zinc-600 mb-1">CONSOLE</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {entityEndpoints.filter((endpoint) => endpoint.endpointType === 'olt-aux' && endpoint.oltAuxRole === 'CONSOLE').map((endpoint) => (
                                      <div key={endpoint.id} className="rounded border border-zinc-300 bg-white/90 px-1 py-1 shadow-sm">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-amber-300 border-amber-600 text-amber-900 hover:bg-amber-400' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="p-2 space-y-2 border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-zinc-100 to-zinc-200 max-h-[500px] overflow-y-auto">
                              {olt.slots.map((slot) => {
                                const slotEndpoints = entityEndpoints.filter((endpoint) => endpoint.endpointType === 'pon' && endpoint.slotId === slot.id);
                                return (
                                  <div key={slot.id} className="rounded-lg border border-zinc-400 bg-gradient-to-b from-white to-zinc-100 shadow-sm">
                                    <div className="px-2 py-1 border-b border-zinc-300 flex items-center justify-between text-xs font-semibold text-zinc-700">
                                      <span>Slot {slot.index.toString().padStart(2, '0')}</span>
                                      <span className="text-[10px] text-zinc-500">{slot.pons.length} PONs</span>
                                    </div>
                                    <div className="p-2"><div className="flex flex-wrap gap-2">{slotEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex items-center gap-1 rounded border border-zinc-300 bg-white/90 px-1.5 py-1 shadow-sm">
                                        <div className="relative inline-flex">
                                          {(endpointVlanMap.get(endpoint.id) || []).length > 0 && (
                                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 h-3.5 px-1 rounded border border-cyan-300 bg-cyan-50 text-cyan-700 text-[8px] leading-[12px] whitespace-nowrap">
                                              {(endpointVlanMap.get(endpoint.id) || []).length === 1 ? `VLAN: ${(endpointVlanMap.get(endpoint.id) || [])[0]}` : `VLAN: ${(endpointVlanMap.get(endpoint.id) || [])[0]}+`}
                                            </span>
                                          )}
                                          <button
                                            ref={(node) => { endpointRefs.current[endpoint.id] = node; }}
                                            type="button"
                                            onMouseDown={(event) => { event.preventDefault(); startEndpointDrag(endpoint.id, endpoint.active === false); }}
                                            onMouseUp={() => finishEndpointDrag(endpoint.id, endpoint.active === false)}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              if (!endpoint.active) {
                                                handleActivatePon(endpoint);
                                                return;
                                              }
                                              setSelectedEndpointId((prev) => (prev === endpoint.id ? null : endpoint.id));
                                            }}
                                            className={`h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${
                                              endpoint.active
                                                ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500'
                                                : 'bg-zinc-200 border-zinc-500 text-zinc-500'
                                            } ${
                                              selectedEndpointId === endpoint.id
                                                ? 'ring-2 ring-amber-400 ring-offset-1'
                                                : highlightedTrace.endpointIds.has(endpoint.id)
                                                  ? 'ring-1 ring-cyan-400/80 ring-offset-1'
                                                  : ''
                                            }`}
                                            title={endpoint.label}
                                          >
                                            {getPortDisplay(endpoint)}
                                          </button>
                                        </div>
                                        <span
                                          className={`w-2.5 h-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                          title={endpoint.active ? 'Ativa' : 'Inativa'}
                                        />
                                      </div>
                                    ))}</div></div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      if (entity.type === 'switch') {
                        const sw = (currentPop.switches || []).find((item) => `switch:${item.id}` === entity.id);
                        if (!sw) return null;
                        const uplinkEndpoints = entityEndpoints.filter((endpoint) => endpoint.isUplink);
                        const accessEndpoints = entityEndpoints.filter((endpoint) => !endpoint.isUplink);
                        return (
                          <div key={entity.id} className="absolute w-[640px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                            <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                            <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                            <div className="border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-white to-zinc-100 px-3 py-3">
                              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-700">
                                <span>SWITCH - {entity.label}</span>
                                <div className="flex items-center gap-2">
                                  <span>{accessEndpoints.length} PORTAS | {uplinkEndpoints.length} UPLINKS</span>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-6 px-2"
                                    onClick={() => {
                                      if (!window.confirm(`Apagar SWITCH "${entity.label}"?`)) return;
                                      removeSwitchFromPop(currentPop.id, sw.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">PORTAS</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {accessEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2 w-2 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                          onClick={() => endpoint.portId && toggleSwitchPort(currentPop.id, sw.id, endpoint.portId, false)}
                                          title={endpoint.active ? 'Desativar porta' : 'Ativar porta'}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="h-full w-px bg-zinc-300" />
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500 text-right">UPLINKS</p>
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    {uplinkEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2 w-2 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                          onClick={() => endpoint.portId && toggleSwitchPort(currentPop.id, sw.id, endpoint.portId, true)}
                                          title={endpoint.active ? 'Desativar uplink' : 'Ativar uplink'}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (entity.type === 'router') {
                        const router = (currentPop.routers || []).find((item) => `router:${item.id}` === entity.id);
                        if (!router) return null;
                        const wanEndpoints = entityEndpoints.filter((endpoint) => endpoint.role === 'WAN');
                        const lanEndpoints = entityEndpoints.filter((endpoint) => endpoint.role !== 'WAN');
                        return (
                          <div key={entity.id} className="absolute w-[620px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                            <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                            <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                            <div className="border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-white to-zinc-100 px-3 py-3">
                              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-700">
                                <span>ROTEADOR - {entity.label}</span>
                                <div className="flex items-center gap-2">
                                  <span>{wanEndpoints.length} WAN | {lanEndpoints.length} LAN</span>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-6 px-2"
                                    onClick={() => {
                                      if (!window.confirm(`Apagar ROTEADOR "${entity.label}"?`)) return;
                                      removeRouterFromPop(currentPop.id, router.id);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">LAN</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {lanEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2 w-2 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                          onClick={() => endpoint.routerInterfaceId && toggleRouterInterface(currentPop.id, router.id, endpoint.routerInterfaceId)}
                                          title={endpoint.active ? 'Desativar LAN' : 'Ativar LAN'}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="h-full w-px bg-zinc-300" />
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500 text-right">WAN / UPLINK</p>
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    {wanEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2 w-2 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                          onClick={() => endpoint.routerInterfaceId && toggleRouterInterface(currentPop.id, router.id, endpoint.routerInterfaceId)}
                                          title={endpoint.active ? 'Desativar WAN' : 'Ativar WAN'}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (entity.type === 'dio') {
                        return (
                          <div key={entity.id} className="absolute w-[420px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                            <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                            <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                            <div className="border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-white to-zinc-100 p-3">
                              <div className="mb-2 text-[11px] font-semibold text-zinc-700 flex items-center justify-between gap-2">
                                <span>DIO - {entity.label}</span>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 px-2"
                                  onClick={() => {
                                    const dioId = entity.id.replace('dio:', '');
                                    if (!window.confirm(`Apagar DIO "${entity.label}"?`)) return;
                                    removeDioFromPop(currentPop.id, dioId);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-10 gap-1.5">
                                {entityEndpoints.map((endpoint) => renderPortButton(
                                  endpoint,
                                  `h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`,
                                  getPortDisplay(endpoint)
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={entity.id} className="absolute w-[360px] border-2 rounded-lg shadow bg-sky-50 border-sky-300" style={{ left: pos.x, top: pos.y }}>
                          <div className="px-3 py-2 border-b border-black/10 font-semibold text-sm cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }}>CABO - {entity.label}</div>
                          <div className="p-3 bg-white/80 max-h-[300px] overflow-y-auto"><div className="grid grid-cols-8 gap-1.5">{entityEndpoints.map((endpoint) => renderPortButton(endpoint))}</div></div>
                        </div>
                      );
                    })}
                    </div>
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                      {rackFusions.map((fusion, index) => {
                        const start = getEndpointPosition(fusion.endpointAId);
                        const end = getEndpointPosition(fusion.endpointBId);
                        if (!start || !end) return null;
                        const laneOffset = ((index % 7) - 3) * 4;
                        const path = buildOrganizedPath(sceneSize.width, start, end, laneOffset, index);
                        const palette = getCablePalette(fusion);
                        const dash = fusion.attenuation === 0 ? '6 4' : undefined;
                        const isHighlighted = highlightedTrace.fusionIds.has(fusion.id);
                        const dimmed = selectedEndpointId && !isHighlighted;
                        return (
                          <g key={fusion.id}>
                            <path
                              d={path}
                              stroke="rgba(0,0,0,0.28)"
                              strokeWidth={isHighlighted ? 10 : 8}
                              fill="none"
                              strokeLinecap="round"
                              opacity={dimmed ? 0.22 : 1}
                            />
                            <path
                              d={path}
                              stroke={palette.outer}
                              strokeWidth={isHighlighted ? 6.5 : 5}
                              strokeDasharray={dash}
                              fill="none"
                              strokeLinecap="round"
                              opacity={dimmed ? 0.2 : 1}
                            />
                            <path
                              d={path}
                              stroke={palette.inner}
                              strokeWidth={isHighlighted ? 3.6 : 2.4}
                              strokeDasharray={dash}
                              fill="none"
                              strokeLinecap="round"
                              opacity={dimmed ? 0.16 : 1}
                              style={{ filter: `drop-shadow(0 0 ${isHighlighted ? 7 : 4}px ${palette.glow})` }}
                            />
                          </g>
                        );
                      })}
                    </svg>
                    {rackFusions.map((fusion) => {
                      const start = getEndpointPosition(fusion.endpointAId);
                      const end = getEndpointPosition(fusion.endpointBId);
                      if (!start || !end) return null;
                      if (!selectedEndpointId || !highlightedTrace.fusionIds.has(fusion.id)) return null;
                      return (
                        <div key={`cut-${fusion.id}`} className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1" style={{ left: (start.x + end.x) / 2, top: (start.y + end.y) / 2 }}>
                          {typeof fusion.vlan === 'number' && (
                            <span className="h-5 px-1.5 rounded border border-cyan-300 bg-cyan-50 text-cyan-700 text-[10px] leading-5">VLAN: {fusion.vlan}</span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 w-6 p-0 rounded-full"
                            onClick={() => handleOpenFusionEdit(fusion)}
                            title="Editar VLAN"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 w-6 p-0 rounded-full shadow"
                            onClick={() => disconnectPopFusion(currentPop.id, fusion.id)}
                            title="Cortar ligaÃ§Ã£o"
                          >
                            <Scissors className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="signal" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Tx medio GBIC</p><p className="text-2xl font-semibold">{avgTxDbm.toFixed(2)} dBm</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Perda total POP</p><p className="text-2xl font-semibold">{totalFusionLoss.toFixed(2)} dB</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-gray-500">Rx estimado</p><p className="text-2xl font-semibold">{estimatedRxDbm.toFixed(2)} dBm</p></div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </FullscreenModalShell>

      <Dialog open={dioFusionOpen} onOpenChange={setDioFusionOpen}>
        <DialogContent className="max-w-[96vw] w-[1400px] h-[90vh] p-0 flex flex-col">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Fusoes do DIO</span>
              <span className="text-xs font-normal text-gray-500">
                Tela dedicada para fusao de portas do DIO com fibras de qualquer cabo do POP
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4 overflow-y-auto">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>DIO</Label>
                <Select value={dioFusionTargetId || '__none__'} onValueChange={(v) => setDioFusionTargetId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione um DIO" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione</SelectItem>
                    {currentPop.dios.map((dio) => (
                      <SelectItem key={dio.id} value={dio.id}>
                        {dio.name} ({dio.portCount} portas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de conexao</Label>
                <Select value={fusionType} onValueChange={(v: PopFusion['fusionType']) => setFusionType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fusion">Fusao</SelectItem>
                    <SelectItem value="connector">Conector</SelectItem>
                    <SelectItem value="mechanical">Mecanica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant={noLoss ? 'default' : 'outline'} onClick={() => setNoLoss((prev) => !prev)} className="w-full">
                  {noLoss ? 'Sem perda (0 dB)' : 'Perda normal'}
                </Button>
              </div>
            </div>

            {dioFusionEntityOptions.length === 0 ? (
              <div className="rounded border bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                Selecione um DIO e garanta que exista ao menos um cabo POP para iniciar a fusao.
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden bg-zinc-100">
                <div
                  ref={fusionViewportRef}
                  className="relative min-h-[420px] overflow-auto"
                  style={{ height: `${Math.max(460, fusionViewportHeight)}px` }}
                  onScroll={() => setSceneRenderTick((prev) => prev + 1)}
                  onWheel={handleSceneWheel}
                  title="Use Ctrl + roda do mouse para zoom"
                >
                  <div
                    ref={sceneRef}
                    className="relative origin-top-left"
                    style={{ width: `${dioFusionSceneSize.width}px`, height: `${dioFusionSceneSize.height}px`, transform: `scale(${boardZoom})` }}
                    data-render-tick={sceneRenderTick}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) {
                        setSelectedEndpointId(null);
                      }
                    }}
                  >
                    <div className="relative z-10">
                      {dioFusionEntityOptions.map((entity) => {
                        const pos = nodePositions[entity.id] || { x: 24, y: 24 };
                        const entityEndpoints = dioFusionEndpointsByEntity[entity.id] || [];

                        if (entity.type === 'dio') {
                          const dio = currentPop.dios.find((item) => `dio:${item.id}` === entity.id);
                          if (!dio) return null;
                          return (
                            <div key={entity.id} className="absolute w-[420px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                              <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                              <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                              <div className="border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-white to-zinc-100 px-3 py-3">
                                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-700">
                                  <span>DIO - {entity.label}</span>
                                  <span>{entityEndpoints.length} portas</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {entityEndpoints.map((endpoint) => (
                                    <div key={endpoint.id}>
                                      {renderPortButton(endpoint, 'h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] bg-emerald-300 border-emerald-700 text-emerald-900 hover:bg-emerald-400', getPortDisplay(endpoint))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        if (entity.type === 'cable') {
                          const cable = currentPop.cables.find((item) => `cable:${item.id}` === entity.id);
                          if (!cable) return null;
                          return (
                            <div key={entity.id} className="absolute w-[360px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_10px_24px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                              <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                              <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                              <div className="border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-white to-zinc-100 px-3 py-3">
                                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-700">
                                  <span>CABO BIGTAIL - {entity.label}</span>
                                  <span>{cable.fiberCount} fibras</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {entityEndpoints.map((endpoint) => (
                                    <div key={endpoint.id}>
                                      {renderPortButton(endpoint, 'h-5 w-5 rounded-[3px] border p-0 text-[8px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] bg-sky-300 border-sky-700 text-sky-900 hover:bg-sky-400', getPortDisplay(endpoint))}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                      {dioFusionFusions.map((fusion, index) => {
                        const start = getEndpointPosition(fusion.endpointAId);
                        const end = getEndpointPosition(fusion.endpointBId);
                        if (!start || !end) return null;
                        const laneOffset = ((index % 4) - 1.5) * 2.2;
                        const path = buildOrganizedPath(dioFusionSceneSize.width, start, end, laneOffset, index);
                        const palette = getCablePalette(fusion);
                        const dash = fusion.attenuation === 0 ? '6 4' : undefined;
                        return (
                          <g key={fusion.id}>
                            <path d={path} stroke={palette.inner} strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.2} />
                            <path d={path} stroke={palette.outer} strokeWidth={5} strokeDasharray={dash} fill="none" strokeLinecap="round" />
                            <path d={path} stroke={palette.inner} strokeWidth={2.4} strokeDasharray={dash} fill="none" strokeLinecap="round" />
                          </g>
                        );
                      })}
                    </svg>
                    {dioFusionFusions.map((fusion) => {
                      const start = getEndpointPosition(fusion.endpointAId);
                      const end = getEndpointPosition(fusion.endpointBId);
                      if (!start || !end) return null;
                      return (
                        <div key={`cut-dio-${fusion.id}`} className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1" style={{ left: (start.x + end.x) / 2, top: (start.y + end.y) / 2 }}>
                          <Button size="sm" variant="outline" className="h-6 w-6 p-0 rounded-full" onClick={() => handleOpenFusionEdit(fusion)} title="Editar VLAN">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="destructive" className="h-6 w-6 p-0 rounded-full shadow" onClick={() => disconnectPopFusion(currentPop.id, fusion.id)} title="Cortar ligacao">
                            <Scissors className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkConfig.open} onOpenChange={(isOpen) => {
        if (!isOpen) setLinkConfig({ open: false, fromId: '', toId: '', vlan: '100' });
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{linkConfig.fusionId ? 'Editar Ligacao' : 'Nova Ligacao'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1 text-xs text-zinc-600">
              <p><strong>Porta A:</strong> {endpointById[linkConfig.fromId]?.label || linkConfig.fromId}</p>
              <p><strong>Porta B:</strong> {endpointById[linkConfig.toId]?.label || linkConfig.toId}</p>
            </div>
            <div>
              <Label>VLAN</Label>
              <Input
                type="number"
                min={1}
                max={4094}
                value={linkConfig.vlan}
                onChange={(event) => setLinkConfig((prev) => ({ ...prev, vlan: event.target.value }))}
                placeholder="Ex: 100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkConfig({ open: false, fromId: '', toId: '', vlan: '100' })}>Cancelar</Button>
              <Button onClick={handleSaveLinkConfig}>{linkConfig.fusionId ? 'Salvar' : 'Conectar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ponConfig.open} onOpenChange={(isOpen) => {
        if (!isOpen) setPonConfig({ open: false, oltId: '', slotId: '', ponId: '', gbicModel: gbicModel || 'C++', txPowerDbm: `${txPowerDbm || 3}` });
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Porta PON</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Classe/Modelo do GBIC</Label>
              <Input
                value={ponConfig.gbicModel}
                onChange={(event) => setPonConfig((prev) => ({ ...prev, gbicModel: event.target.value }))}
                placeholder="Ex: C++"
              />
            </div>
            <div>
              <Label>Potencia de transmissao (dBm)</Label>
              <Input
                type="number"
                value={ponConfig.txPowerDbm}
                onChange={(event) => setPonConfig((prev) => ({ ...prev, txPowerDbm: event.target.value }))}
              />
            </div>
            <p className="text-xs text-zinc-500">Conector fixo: UPC</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPonConfig({ open: false, oltId: '', slotId: '', ponId: '', gbicModel: gbicModel || 'C++', txPowerDbm: `${txPowerDbm || 3}` })}>Cancelar</Button>
              <Button onClick={handleSavePonConfig}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
