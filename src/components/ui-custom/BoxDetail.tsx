
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Link2, Unlink, Zap, Save, Trash2, User, MapPin, Calendar, Settings, CheckCircle2, XCircle, Edit3, Plus, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';
import { CABLE_MODEL_OPTIONS, type Fiber, type Box, type Splitter } from '@/types/ftth';
import { toast } from 'sonner';
import { FusionBoardCanvas } from './box-detail/FusionBoardCanvas';
import type { DragState, EndpointOption, EntityPosition } from './box-detail/types';

interface BoxDetailProps {
  box: Box;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface NodeDragState {
  entityId: string;
  offsetX: number;
  offsetY: number;
}

interface BoxContinuityResult {
  fiberId: string;
  fiberNumber: number;
  result: 'pass' | 'fail';
  attenuation?: number;
  path: string[];
  testedAt: string;
}

interface BoxCableFiberItem {
  cableId: string;
  cableName: string;
  direction: 'Entrada' | 'Saida' | 'Passagem';
  fiber: Fiber;
}

const GPON_FIBER_LOSS_DB_PER_KM = 0.25;
const GPON_FUSION_LOSS_DB = 0.1;
const GPON_MECHANICAL_LOSS_DB = 0.2;
const GPON_CONNECTOR_LOSS_DB = 0.2;
const isFusionEntityId = (entityId: string) => entityId.startsWith('cable:') || entityId.startsWith('splitter:');
const getCableDirectionForBox = (cable: { startPoint: string; endPoint: string }, boxId: string): 'Entrada' | 'Saida' | 'Passagem' => {
  if (cable.startPoint === boxId) return 'Saida';
  if (cable.endPoint === boxId) return 'Entrada';
  return 'Passagem';
};

export function BoxDetail({ box, open, onOpenChange }: BoxDetailProps) {
  const {
    currentNetwork,
    updateBox,
    removeBox,
    addCable,
    updateCable,
    removeCable,
    connectFibers,
    connectBoxEndpoints,
    disconnectFibers,
    addSplitterToBox,
    removeSplitterFromBox,
    testContinuity,
    continuityTests,
    getFiberContinuity,
  } = useNetworkStore();

  const currentBox = currentNetwork?.boxes.find((b) => b.id === box.id) || box;
  const connectedBoxes = currentNetwork?.boxes.filter((b) => b.id !== currentBox.id) || [];
  const relatedCables = (currentNetwork?.cables || []).filter(
    (cable) =>
      cable.startPoint === currentBox.id ||
      cable.endPoint === currentBox.id ||
      (cable.attachments || []).some((attachment) => attachment.kind === 'box' && attachment.entityId === currentBox.id)
  );

  const [selectedFiber, setSelectedFiber] = useState<Fiber | null>(null);
  const [fusionTargetBox, setFusionTargetBox] = useState('');
  const [fusionTargetFiber, setFusionTargetFiber] = useState('');
  const [showFusionDialog, setShowFusionDialog] = useState(false);

  const [connectionEndpointA, setConnectionEndpointA] = useState('');
  const [connectionEndpointB, setConnectionEndpointB] = useState('');
  const [connectionType, setConnectionType] = useState<'connector' | 'fusion' | 'mechanical'>('connector');

  const [newSplitterName, setNewSplitterName] = useState('');
  const [newSplitterType, setNewSplitterType] = useState<Splitter['type']>('1x8');

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [nodeDragState, setNodeDragState] = useState<NodeDragState | null>(null);
  const [entityPositions, setEntityPositions] = useState<Record<string, EntityPosition>>({});
  const fusionBoardRef = useRef<HTMLDivElement | null>(null);
  const fusionSceneRef = useRef<HTMLDivElement | null>(null);
  const entityPositionsRef = useRef<Record<string, EntityPosition>>({});
  const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [layoutTick, setLayoutTick] = useState(0);
  const [fusionBoardZoom, setFusionBoardZoom] = useState(1);

  const [editingBox, setEditingBox] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [boxName, setBoxName] = useState(currentBox.name);
  const [boxAddress, setBoxAddress] = useState(currentBox.address || '');
  const [boxStatus, setBoxStatus] = useState(currentBox.status);
  const [editPositionLat, setEditPositionLat] = useState(() => currentBox.position.lat.toFixed(6));
  const [editPositionLng, setEditPositionLng] = useState(() => currentBox.position.lng.toFixed(6));
  const [continuityTestResult, setContinuityTestResult] = useState<BoxContinuityResult | null>(null);
  const [showAddCableDialog, setShowAddCableDialog] = useState(false);
  const [newCableName, setNewCableName] = useState('');
  const [newCableTargetBox, setNewCableTargetBox] = useState('');
  const [newCableFiberCount, setNewCableFiberCount] = useState(12);
  const [newCableType, setNewCableType] = useState<'drop' | 'distribution' | 'feeder' | 'backbone'>('distribution');
  const [newCableModel, setNewCableModel] = useState('AS-80');
  const [newCableLooseTubeCount, setNewCableLooseTubeCount] = useState(1);
  const [newCableFibersPerTube, setNewCableFibersPerTube] = useState(12);
  const [selectedLooseCableId, setSelectedLooseCableId] = useState('');
  const layoutInitKeyRef = useRef<string>('');

  const maxNewCableFiberCapacity = Math.max(1, newCableLooseTubeCount * newCableFibersPerTube);
  const availableNewCableModels = CABLE_MODEL_OPTIONS.filter((model) => model.category === newCableType);

  const localConnections = useMemo(
    () => (currentBox.fusions || []).filter((fusion) => fusion.boxAId === currentBox.id && fusion.boxBId === currentBox.id),
    [currentBox]
  );

  const localFusionByEndpointId = useMemo(() => {
    return localConnections.reduce<Record<string, string>>((acc, fusion) => {
      acc[fusion.fiberAId] = fusion.id;
      acc[fusion.fiberBId] = fusion.id;
      return acc;
    }, {});
  }, [localConnections]);

  const boxCableFibers = useMemo(() => {
    const items: BoxCableFiberItem[] = [];
    relatedCables.forEach((cable) => {
      const direction = getCableDirectionForBox(cable, currentBox.id);
      cable.fibers.forEach((fiber) => {
        items.push({
          cableId: cable.id,
          cableName: cable.name,
          direction,
          fiber,
        });
      });
    });
    return items;
  }, [relatedCables, currentBox.id]);

  const endpointOptions = useMemo(() => {
    const options: EndpointOption[] = [];

    relatedCables.forEach((cable) => {
      const direction = getCableDirectionForBox(cable, currentBox.id);
      cable.fibers.forEach((fiber) => {
        options.push({
          id: fiber.id,
          label: `Fibra ${fiber.number} (${fiber.color.name})`,
          group: `${cable.name} (${direction})`,
          colorHex: fiber.color.hex,
          status: fiber.status,
          fusionId: localFusionByEndpointId[fiber.id],
          entityId: `cable:${cable.id}`,
          entityLabel: `${cable.name} (${direction})`,
        });
      });
    });

    (currentBox.splitters || []).forEach((splitter) => {
      splitter.inputFibers.forEach((fiber) => {
        options.push({
          id: fiber.id,
          label: `IN ${fiber.number}`,
          group: `${splitter.name} (${splitter.type})`,
          colorHex: fiber.color.hex,
          status: fiber.status,
          fusionId: localFusionByEndpointId[fiber.id],
          entityId: `splitter:${splitter.id}`,
          entityLabel: `${splitter.name} (${splitter.type})`,
        });
      });

      splitter.outputFibers.forEach((fiber) => {
        options.push({
          id: fiber.id,
          label: `OUT ${fiber.number}`,
          group: `${splitter.name} (${splitter.type})`,
          colorHex: fiber.color.hex,
          status: fiber.status,
          fusionId: localFusionByEndpointId[fiber.id],
          entityId: `splitter:${splitter.id}`,
          entityLabel: `${splitter.name} (${splitter.type})`,
        });
      });
    });

    return options;
  }, [currentBox, relatedCables, localFusionByEndpointId]);

  const endpointById = useMemo(
    () => endpointOptions.reduce<Record<string, EndpointOption>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {}),
    [endpointOptions]
  );

  const fusionEndpointOptions = useMemo(
    () => endpointOptions.filter((endpoint) => isFusionEntityId(endpoint.entityId)),
    [endpointOptions]
  );

  const entityOptions = useMemo(() => {
    const entities: Array<{ id: string; label: string; type: 'cable' | 'splitter' }> = [];

    relatedCables.forEach((cable) => {
      const direction = getCableDirectionForBox(cable, currentBox.id);
      entities.push({
        id: `cable:${cable.id}`,
        label: `${cable.name} (${direction})`,
        type: 'cable',
      });
    });

    (currentBox.splitters || []).forEach((splitter) => {
      entities.push({
        id: `splitter:${splitter.id}`,
        label: `${splitter.name} (${splitter.type})`,
        type: 'splitter',
      });
    });

    return entities;
  }, [currentBox, relatedCables]);

  const boardConnections = useMemo(
    () =>
      localConnections.filter((fusion) => {
        const endpointA = endpointById[fusion.fiberAId];
        const endpointB = endpointById[fusion.fiberBId];
        return !!endpointA && !!endpointB && isFusionEntityId(endpointA.entityId) && isFusionEntityId(endpointB.entityId);
      }),
    [localConnections, endpointById]
  );

  const boxContinuityTests = useMemo(() => {
    const marker = `BOX:${currentBox.id};`;
    return continuityTests
      .filter((test) => (test.observations || '').includes(marker))
      .sort((a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime());
  }, [continuityTests, currentBox.id]);

  const looseCables = useMemo(
    () =>
      (currentNetwork?.cables || []).filter(
        (cable) =>
          (cable.startPoint === '' || cable.endPoint === '') &&
          cable.startPoint !== currentBox.id &&
          cable.endPoint !== currentBox.id
      ),
    [currentNetwork?.cables, currentBox.id]
  );

  const selectedLooseCable = useMemo(
    () => looseCables.find((cable) => cable.id === selectedLooseCableId) || null,
    [looseCables, selectedLooseCableId]
  );

  const fusionBoardSceneSize = useMemo(() => {
    const positions = Object.values(entityPositions);
    const maxX = positions.length > 0 ? Math.max(...positions.map((position) => position.x)) : 0;
    const maxY = positions.length > 0 ? Math.max(...positions.map((position) => position.y)) : 0;
    return {
      width: Math.max(1400, maxX + 460),
      height: Math.max(800, maxY + 420),
    };
  }, [entityPositions]);

  const entityLayoutKey = useMemo(() => {
    return entityOptions.map((entity) => entity.id).sort().join('|');
  }, [entityOptions]);

  useEffect(() => {
    if (open) return;
    layoutInitKeyRef.current = '';
  }, [open]);

  useEffect(() => {
    setEditPositionLat(currentBox.position.lat.toFixed(6));
    setEditPositionLng(currentBox.position.lng.toFixed(6));
  }, [currentBox.id, currentBox.position.lat, currentBox.position.lng]);

  const fiberUsageStats = useMemo(() => {
    const total = boxCableFibers.length;
    const active = boxCableFibers.filter((item) => item.fiber.status === 'active').length;
    const inactive = boxCableFibers.filter((item) => item.fiber.status === 'inactive').length;
    const reserved = boxCableFibers.filter((item) => item.fiber.status === 'reserved').length;
    const faulty = boxCableFibers.filter((item) => item.fiber.status === 'faulty').length;
    const utilization = total > 0 ? (active / total) * 100 : 0;
    return { total, active, inactive, reserved, faulty, utilization };
  }, [boxCableFibers]);

  const cableStats = useMemo(() => {
    const incoming = relatedCables.filter((cable) => cable.endPoint === currentBox.id);
    const outgoing = relatedCables.filter((cable) => cable.startPoint === currentBox.id);
    const totalLengthMeters = relatedCables.reduce((sum, cable) => sum + (cable.length || 0), 0);
    const avgLengthMeters = relatedCables.length > 0 ? totalLengthMeters / relatedCables.length : 0;
    const totalCableFibers = relatedCables.reduce((sum, cable) => sum + cable.fiberCount, 0);
    return { incoming, outgoing, totalLengthMeters, avgLengthMeters, totalCableFibers };
  }, [relatedCables, currentBox.id]);

  const splitterStats = useMemo(() => {
    const splitters = currentBox.splitters || [];
    const inputPorts = splitters.reduce((sum, splitter) => sum + splitter.inputFibers.length, 0);
    const outputPorts = splitters.reduce((sum, splitter) => sum + splitter.outputFibers.length, 0);
    const attenuationDb = splitters.reduce((sum, splitter) => sum + (splitter.attenuation || 0), 0);
    return { count: splitters.length, inputPorts, outputPorts, attenuationDb };
  }, [currentBox.splitters]);

  const fusionLossRows = useMemo(() => {
    const splitterById = (currentBox.splitters || []).reduce<Record<string, Splitter>>((acc, splitter) => {
      acc[splitter.id] = splitter;
      return acc;
    }, {});

    const fiberToEntity = endpointOptions.reduce<Record<string, string>>((acc, endpoint) => {
      acc[endpoint.id] = endpoint.entityId;
      return acc;
    }, {});

    return localConnections.map((fusion) => {
      const endpointA = endpointById[fusion.fiberAId];
      const endpointB = endpointById[fusion.fiberBId];

      const cableA = relatedCables.find((cable) => cable.fibers.some((fiber) => fiber.id === fusion.fiberAId));
      const cableB = relatedCables.find((cable) => cable.fibers.some((fiber) => fiber.id === fusion.fiberBId));
      const routeMeters = (cableA?.length || 0) + (cableB?.length || 0);

      const fiberDb = (routeMeters / 1000) * GPON_FIBER_LOSS_DB_PER_KM;
      const fusionDb = typeof fusion.attenuation === 'number'
        ? fusion.attenuation
        : fusion.fusionType === 'fusion'
          ? GPON_FUSION_LOSS_DB
          : fusion.fusionType === 'mechanical'
            ? GPON_MECHANICAL_LOSS_DB
            : fusion.fusionType === 'connector'
              ? GPON_CONNECTOR_LOSS_DB
              : 0;
      const mechanicalDb = 0;
      const connectorDb = 0;

      const entityA = fiberToEntity[fusion.fiberAId];
      const entityB = fiberToEntity[fusion.fiberBId];

      const splitterIdA = entityA?.startsWith('splitter:') ? entityA.replace('splitter:', '') : null;
      const splitterIdB = entityB?.startsWith('splitter:') ? entityB.replace('splitter:', '') : null;
      const splitterDb = (splitterIdA ? splitterById[splitterIdA]?.attenuation || 0 : 0) + (splitterIdB ? splitterById[splitterIdB]?.attenuation || 0 : 0);

      const estimatedLossDb = fiberDb + fusionDb + mechanicalDb + connectorDb + splitterDb;

      return {
        id: fusion.id,
        fiberA: endpointA?.label || fusion.fiberAId,
        fiberB: endpointB?.label || fusion.fiberBId,
        fusionType: fusion.fusionType,
        isNoLoss: fusionDb === 0,
        routeMeters,
        fiberDb,
        fusionDb,
        mechanicalDb,
        connectorDb,
        splitterDb,
        estimatedLossDb,
      };
    });
  }, [localConnections, currentBox.splitters, endpointById, endpointOptions, relatedCables]);

  const gponSummary = useMemo(() => {
    const totalLossDb = fusionLossRows.reduce((sum, row) => sum + row.estimatedLossDb, 0);
    const avgLossDb = fusionLossRows.length > 0 ? totalLossDb / fusionLossRows.length : 0;
    const maxLossDb = fusionLossRows.reduce((max, row) => Math.max(max, row.estimatedLossDb), 0);
    return { totalLossDb, avgLossDb, maxLossDb };
  }, [fusionLossRows]);

  const endpointsByEntity = useMemo(() => {
    return endpointOptions.reduce<Record<string, EndpointOption[]>>((acc, endpoint) => {
      if (!acc[endpoint.entityId]) {
        acc[endpoint.entityId] = [];
      }
      acc[endpoint.entityId].push(endpoint);
      return acc;
    }, {});
  }, [endpointOptions]);

  useEffect(() => {
    const handleResize = () => setLayoutTick((value) => value + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!open || entityOptions.length === 0) return;
    const initKey = `${currentBox.id}:${entityLayoutKey}`;
    if (layoutInitKeyRef.current === initKey) return;
    layoutInitKeyRef.current = initKey;

    const next: Record<string, EntityPosition> = {};
    const cols = 3;
    const colWidth = 290;
    const rowHeight = 220;

    entityOptions.forEach((entity, index) => {
      const saved = currentBox.fusionLayout?.[entity.id];
      if (saved) {
        next[entity.id] = { x: saved.x, y: saved.y };
        return;
      }
      const col = index % cols;
      const row = Math.floor(index / cols);
      next[entity.id] = {
        x: 20 + col * colWidth,
        y: 20 + row * rowHeight,
      };
    });

    setEntityPositions(next);
  }, [open, currentBox.id, entityLayoutKey, entityOptions, currentBox.fusionLayout]);

  useEffect(() => {
    if (availableNewCableModels.length === 0) return;
    if (!availableNewCableModels.some((model) => model.id === newCableModel)) {
      setNewCableModel(availableNewCableModels[0]!.id);
    }
  }, [availableNewCableModels, newCableModel]);

  useEffect(() => {
    if (newCableFiberCount > maxNewCableFiberCapacity) {
      setNewCableFiberCount(maxNewCableFiberCapacity);
    }
  }, [newCableFiberCount, maxNewCableFiberCapacity]);

  useEffect(() => {
    entityPositionsRef.current = entityPositions;
  }, [entityPositions]);

  const persistFusionLayout = useCallback((positions: Record<string, EntityPosition>) => {
    if (entityOptions.length === 0) return;

    const snapshot = entityOptions.reduce<Record<string, { x: number; y: number }>>((acc, entity) => {
      const position = positions[entity.id];
      if (!position) return acc;
      acc[entity.id] = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      };
      return acc;
    }, {});

    if (Object.keys(snapshot).length < entityOptions.length) return;

    const currentLayout = currentBox.fusionLayout || {};
    const currentKeys = Object.keys(currentLayout).sort();
    const nextKeys = Object.keys(snapshot).sort();
    if (currentKeys.length === nextKeys.length) {
      const unchanged = nextKeys.every((key) => {
        const currentPosition = currentLayout[key];
        const nextPosition = snapshot[key];
        return !!currentPosition && currentPosition.x === nextPosition?.x && currentPosition.y === nextPosition?.y;
      });
      if (unchanged) return;
    }

    updateBox(currentBox.id, { fusionLayout: snapshot });
  }, [entityOptions, currentBox.fusionLayout, currentBox.id, updateBox]);

  useEffect(() => {
    setLayoutTick((value) => value + 1);
  }, [boardConnections.length, entityPositions]);

  const getScenePoint = useCallback((clientX: number, clientY: number) => {
    const scene = fusionSceneRef.current;
    if (!scene) return null;
    const sceneRect = scene.getBoundingClientRect();
    return {
      x: (clientX - sceneRect.left) / fusionBoardZoom,
      y: (clientY - sceneRect.top) / fusionBoardZoom,
    };
  }, [fusionBoardZoom]);

  useEffect(() => {
    if (!dragState && !nodeDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const point = getScenePoint(event.clientX, event.clientY);
      if (!point) return;
      if (dragState) {
        setDragState((prev) => (prev ? { ...prev, x: point.x, y: point.y } : null));
      }
      if (nodeDragState) {
        const maxX = Math.max(0, fusionBoardSceneSize.width - 380);
        const maxY = Math.max(0, fusionBoardSceneSize.height - 220);
        const nextX = Math.min(maxX, Math.max(0, point.x - nodeDragState.offsetX));
        const nextY = Math.min(maxY, Math.max(0, point.y - nodeDragState.offsetY));
        setEntityPositions((prev) => ({
          ...prev,
          [nodeDragState.entityId]: { x: nextX, y: nextY },
        }));
      }
    };

    const handleMouseUp = () => {
      if (nodeDragState) {
        persistFusionLayout(entityPositionsRef.current);
      }
      setDragState(null);
      setNodeDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, nodeDragState, fusionBoardSceneSize, getScenePoint, persistFusionLayout]);

  const getEndpointPosition = (endpointId: string) => {
    const scene = fusionSceneRef.current;
    const endpoint = endpointRefs.current[endpointId];
    if (!scene || !endpoint) return null;
    const sceneRect = scene.getBoundingClientRect();
    const endpointRect = endpoint.getBoundingClientRect();
    return {
      x: (endpointRect.left + endpointRect.width / 2 - sceneRect.left) / fusionBoardZoom,
      y: (endpointRect.top + endpointRect.height / 2 - sceneRect.top) / fusionBoardZoom,
    };
  };

  const startDragFromEndpoint = (endpointId: string) => {
    const endpoint = endpointById[endpointId];
    if (!endpoint || endpoint.fusionId) return;
    const position = getEndpointPosition(endpointId);
    if (!position) return;
    setDragState({ fromId: endpointId, x: position.x, y: position.y });
  };

  const finishDragOnEndpoint = (targetId: string) => {
    if (!dragState) return;
    if (dragState.fromId === targetId) {
      setDragState(null);
      return;
    }

    const sourceEndpoint = endpointById[dragState.fromId];
    const targetEndpoint = endpointById[targetId];
    if (!sourceEndpoint || !targetEndpoint) {
      setDragState(null);
      return;
    }
    if (!isFusionEntityId(sourceEndpoint.entityId) || !isFusionEntityId(targetEndpoint.entityId)) {
      setDragState(null);
      return;
    }
    if (sourceEndpoint.entityId === targetEndpoint.entityId) {
      setDragState(null);
      return;
    }

    connectBoxEndpoints(currentBox.id, dragState.fromId, targetId, 'fusion');
    setDragState(null);
  };

  const startNodeDrag = (entityId: string, event: { clientX: number; clientY: number }) => {
    const point = getScenePoint(event.clientX, event.clientY);
    if (!point) return;
    const position = entityPositions[entityId] || { x: 0, y: 0 };
    setNodeDragState({
      entityId,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
    });
  };

  const getEntityType = (entityId: string) => {
    return entityOptions.find((entity) => entity.id === entityId)?.type || 'cable';
  };

  const getEntityCardClass = (entityId: string) => {
    const type = getEntityType(entityId);
    if (type === 'splitter') return 'bg-amber-100 border-amber-300';
    if (type === 'cable') return 'bg-sky-50 border-sky-300';
    return 'bg-emerald-50 border-emerald-300';
  };

  const endpointBadge = (endpoint: EndpointOption) => {
    if (endpoint.status === 'faulty') return 'bg-red-100 text-red-700';
    if (endpoint.fusionId) return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getFiberStatus = (fiber: Fiber) => {
    if (fiber.status === 'active') return { color: 'bg-green-500', label: 'Ativa' };
    if (fiber.status === 'faulty') return { color: 'bg-red-500', label: 'Defeituosa' };
    if (fiber.status === 'reserved') return { color: 'bg-yellow-500', label: 'Reservada' };
    return { color: 'bg-gray-300', label: 'Disponivel' };
  };

  const handleFusion = () => {
    if (!selectedFiber || !fusionTargetBox || !fusionTargetFiber) return;
    connectFibers(currentBox.id, selectedFiber.id, fusionTargetBox, fusionTargetFiber, currentBox.position);
    setShowFusionDialog(false);
    setSelectedFiber(null);
    setFusionTargetBox('');
    setFusionTargetFiber('');
  };

  const handleCreateBoxConnection = () => {
    if (!connectionEndpointA || !connectionEndpointB) return;
    const sourceEndpoint = endpointById[connectionEndpointA];
    const targetEndpoint = endpointById[connectionEndpointB];
    if (!sourceEndpoint || !targetEndpoint) return;
    if (!isFusionEntityId(sourceEndpoint.entityId) || !isFusionEntityId(targetEndpoint.entityId)) return;
    const created = connectBoxEndpoints(currentBox.id, connectionEndpointA, connectionEndpointB, connectionType);
    if (!created) return;
    setConnectionEndpointA('');
    setConnectionEndpointB('');
  };

  const handleAddSplitter = () => {
    const name = newSplitterName.trim();
    if (!name) return;
    const created = addSplitterToBox(currentBox.id, { name, type: newSplitterType });
    if (!created) return;
    setNewSplitterName('');
    setNewSplitterType('1x8');
  };

  const handleLayoutSync = () => {
    setLayoutTick((value) => value + 1);
  };

  useLayoutEffect(() => {
    if (!open) return;
    // Zoom uses CSS transform; force a post-layout resync so connectors stay aligned.
    const rafA = requestAnimationFrame(() => {
      setLayoutTick((value) => value + 1);
    });
    const rafB = requestAnimationFrame(() => {
      setLayoutTick((value) => value + 1);
    });
    return () => {
      cancelAnimationFrame(rafA);
      cancelAnimationFrame(rafB);
    };
  }, [fusionBoardZoom, open]);

  const handleZoomInFusionBoard = () => {
    setFusionBoardZoom((value) => Math.min(2, Number((value + 0.1).toFixed(2))));
  };

  const handleZoomOutFusionBoard = () => {
    setFusionBoardZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))));
  };

  const handleZoomResetFusionBoard = () => {
    setFusionBoardZoom(1);
  };

  const handleRemoveEntity = (entityId: string) => {
    if (entityId.startsWith('splitter:')) {
      const splitterId = entityId.replace('splitter:', '');
      removeSplitterFromBox(currentBox.id, splitterId);
      return;
    }
    if (entityId.startsWith('cable:')) {
      const cableId = entityId.replace('cable:', '');
      removeCable(cableId);
    }
  };

  const handleAttachLooseCableToCurrentBox = () => {
    if (!selectedLooseCable) return;

    if (!selectedLooseCable.startPoint) {
      updateCable(selectedLooseCable.id, { startPoint: currentBox.id });
      setSelectedLooseCableId('');
      return;
    }

    if (!selectedLooseCable.endPoint) {
      updateCable(selectedLooseCable.id, { endPoint: currentBox.id });
      setSelectedLooseCableId('');
    }
  };

  const extractFiberNumber = (endpoint: EndpointOption) => {
    const match = endpoint.label.match(/(\d+)/);
    return match ? Number.parseInt(match[1]!, 10) : Number.POSITIVE_INFINITY;
  };

  const getEndpointDirection = (endpoint: EndpointOption): 'Entrada' | 'Saida' | 'Passagem' | 'Outro' => {
    const match = endpoint.group.match(/\((Entrada|Saida|Passagem)\)$/);
    return (match?.[1] as 'Entrada' | 'Saida' | 'Passagem' | undefined) || 'Outro';
  };

  const handleCreateNoLossBulkFusions = () => {
    const freeCableEndpoints = fusionEndpointOptions.filter((endpoint) => {
      if (!endpoint.entityId.startsWith('cable:')) return false;
      if (endpoint.fusionId) return false;
      if (endpoint.status === 'faulty') return false;
      return true;
    });

    const inputs = freeCableEndpoints
      .filter((endpoint) => getEndpointDirection(endpoint) === 'Entrada')
      .sort((a, b) => extractFiberNumber(a) - extractFiberNumber(b));
    const outputs = freeCableEndpoints
      .filter((endpoint) => getEndpointDirection(endpoint) === 'Saida')
      .sort((a, b) => extractFiberNumber(a) - extractFiberNumber(b));

    if (inputs.length === 0 || outputs.length === 0) return;

    const outputByNumber = outputs.reduce<Record<number, EndpointOption[]>>((acc, endpoint) => {
      const fiberNumber = extractFiberNumber(endpoint);
      if (!Number.isFinite(fiberNumber)) return acc;
      if (!acc[fiberNumber]) acc[fiberNumber] = [];
      acc[fiberNumber]!.push(endpoint);
      return acc;
    }, {});

    let created = 0;
    inputs.forEach((inputEndpoint) => {
      const fiberNumber = extractFiberNumber(inputEndpoint);
      if (!Number.isFinite(fiberNumber)) return;
      const candidates = outputByNumber[fiberNumber];
      if (!candidates || candidates.length === 0) return;
      const candidateIndex = candidates.findIndex((candidate) => candidate.entityId !== inputEndpoint.entityId);
      if (candidateIndex < 0) return;
      const selected = candidates.splice(candidateIndex, 1)[0];
      if (!selected) return;
      const result = connectBoxEndpoints(currentBox.id, inputEndpoint.id, selected.id, 'fusion', true);
      if (result) created += 1;
    });

    if (created > 0) {
      setLayoutTick((value) => value + 1);
    }
  };

  const calculateDistanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const q =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return Math.round(R * (2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q))));
  };

  const handleAddCableFromFusionBoard = () => {
    if (!newCableTargetBox || !currentNetwork) return;
    const targetBox = currentNetwork.boxes.find((b) => b.id === newCableTargetBox);
    if (!targetBox) return;

    addCable({
      name: newCableName.trim() || `Cabo ${currentBox.name} -> ${targetBox.name}`,
      type: newCableType,
      model: newCableModel,
      fiberCount: newCableFiberCount,
      looseTubeCount: newCableLooseTubeCount,
      fibersPerTube: newCableFibersPerTube,
      startPoint: currentBox.id,
      endPoint: targetBox.id,
      path: [],
      length: calculateDistanceMeters(currentBox.position, targetBox.position),
      status: 'active',
      color: '#00AA00',
    });

    setShowAddCableDialog(false);
    setNewCableName('');
    setNewCableTargetBox('');
    setNewCableFiberCount(12);
    setNewCableType('distribution');
    setNewCableModel('AS-80');
    setNewCableLooseTubeCount(1);
    setNewCableFibersPerTube(12);
  };

  const handleUndoLastFusion = () => {
    if (boardConnections.length === 0) return;
    const lastFusion = boardConnections[boardConnections.length - 1];
    if (!lastFusion) return;
    disconnectFibers(lastFusion.id);
  };

  const handleSaveBox = () => {
    updateBox(currentBox.id, { name: boxName, address: boxAddress, status: boxStatus });
    setEditingBox(false);
  };

  const handleSaveBoxPosition = () => {
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

    updateBox(currentBox.id, {
      position: {
        lat: parsedLat,
        lng: parsedLng,
      },
    });
    toast.success('Posicao da caixa atualizada.');
  };

  const handleTestContinuity = (fiber: Fiber) => {
    window.dispatchEvent(new CustomEvent('ftth:trace-fiber', { detail: { fiberId: fiber.id } }));

    const continuity = getFiberContinuity(fiber.id);
    const result: 'pass' | 'fail' = continuity.connected ? 'pass' : 'fail';
    const endPoint = continuity.path.length > 0 ? continuity.path[continuity.path.length - 1] : 'Sem continuidade';

    const savedTest = testContinuity({
      cableId: relatedCables[0]?.id || '',
      fiberNumber: fiber.number,
      startPoint: currentBox.name,
      endPoint,
      result,
      attenuation: result === 'pass' ? continuity.attenuation : undefined,
      technician: 'Sistema',
      observations: `BOX:${currentBox.id};FIBER:${fiber.id};PATH:${continuity.path.join(' > ') || 'N/A'}`,
    });

    setContinuityTestResult({
      fiberId: fiber.id,
      fiberNumber: fiber.number,
      result,
      attenuation: savedTest.attenuation,
      path: continuity.path,
      testedAt: savedTest.testedAt,
    });
  };

  const getConnectedFiberInfo = (fiberId: string) => {
    const fusionId = localFusionByEndpointId[fiberId];
    if (!fusionId) return null;
    const fusion = localConnections.find((item) => item.id === fusionId);
    if (!fusion) return null;
    const otherFiberId = fusion.fiberAId === fiberId ? fusion.fiberBId : fusion.fiberAId;
    const otherEndpoint = endpointById[otherFiberId];
    if (!otherEndpoint) return 'conexao interna';
    return `${otherEndpoint.group}: ${otherEndpoint.label}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`flex flex-col overflow-y-auto ${
          isFullscreen
            ? '!w-[100vw] !max-w-[100vw] !h-[100vh] !max-h-[100vh] rounded-none'
            : '!w-[1400px] !max-w-[95vw] !max-h-[95vh] sm:!max-w-[95vw]'
        }`}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-10">
            <DialogTitle className="flex items-center gap-2">
              {currentBox.type === 'CEO' && <Activity className="w-5 h-5 text-blue-500" />}
              {currentBox.type === 'CTO' && <Zap className="w-5 h-5 text-green-500" />}
              {currentBox.type === 'DIO' && <Settings className="w-5 h-5 text-orange-500" />}
              {currentBox.name}
              <Badge variant={currentBox.status === 'active' ? 'default' : 'secondary'}>{currentBox.status}</Badge>
            </DialogTitle>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen((prev) => !prev)}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="fibers" className="w-full flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-5 shrink-0">
            <TabsTrigger value="fibers">Fibras</TabsTrigger>
            <TabsTrigger value="connections">Conexoes</TabsTrigger>
            <TabsTrigger value="fusions">Fusoes</TabsTrigger>
            <TabsTrigger value="info">Informacoes</TabsTrigger>
            <TabsTrigger value="tests">Testes</TabsTrigger>
          </TabsList>

          <TabsContent value="fibers" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500">
                Total: {boxCableFibers.length} fibras | Ativas: {boxCableFibers.filter((item) => item.fiber.status === 'active').length} |
                Disponiveis: {boxCableFibers.filter((item) => item.fiber.status === 'inactive').length}
              </div>
            </div>

            <ScrollArea className="h-[360px]">
              <div className="grid grid-cols-6 gap-2">
                {boxCableFibers.map(({ fiber, cableName, direction, cableId }) => {
                  const status = getFiberStatus(fiber);
                  const connectedInfo = getConnectedFiberInfo(fiber.id);

                  return (
                    <div
                      key={`${cableId}-${fiber.id}`}
                      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedFiber?.id === fiber.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFiber(fiber)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: fiber.color.hex, borderColor: '#ccc' }} />
                        <span className="font-mono text-sm">{fiber.number}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 truncate">{cableName} ({direction})</div>
                      <div className={`w-full h-1 rounded ${status.color}`} />
                      <div className="text-xs text-gray-500 mt-1">{status.label}</div>
                      {connectedInfo && <div className="text-xs text-blue-600 mt-1 truncate">-&gt; {connectedInfo}</div>}
                      {fiber.clientName && (
                        <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {fiber.clientName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedFiber && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">
                  Fibra {selectedFiber.number} - {selectedFiber.color.name}
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <Badge variant={selectedFiber.status === 'active' ? 'default' : 'secondary'}>{selectedFiber.status}</Badge>
                  </div>
                  <div>
                    <span className="text-gray-500">Tubo:</span> {(selectedFiber as Fiber & { tubeNumber?: number }).tubeNumber || 'N/A'}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {localFusionByEndpointId[selectedFiber.id] ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const fusionId = localFusionByEndpointId[selectedFiber.id];
                        if (fusionId) disconnectFibers(fusionId);
                      }}
                    >
                      <Unlink className="w-4 h-4 mr-1" />
                      Desconectar
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => handleTestContinuity(selectedFiber)}>
                    <Activity className="w-4 h-4 mr-1" />
                    Testar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="connections" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3 p-3 rounded-lg border bg-gray-50">
                <h4 className="font-medium">Novo Splitter</h4>
                <div>
                  <Label>Nome</Label>
                  <Input value={newSplitterName} onChange={(e) => setNewSplitterName(e.target.value)} placeholder="Ex: SPL-01" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newSplitterType} onValueChange={(v: Splitter['type']) => setNewSplitterType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1x2">1x2</SelectItem>
                      <SelectItem value="1x4">1x4</SelectItem>
                      <SelectItem value="1x8">1x8</SelectItem>
                      <SelectItem value="1x16">1x16</SelectItem>
                      <SelectItem value="1x32">1x32</SelectItem>
                      <SelectItem value="1x64">1x64</SelectItem>
                      <SelectItem value="2x2">2x2</SelectItem>
                      <SelectItem value="2x4">2x4</SelectItem>
                      <SelectItem value="2x8">2x8</SelectItem>
                      <SelectItem value="2x16">2x16</SelectItem>
                      <SelectItem value="2x32">2x32</SelectItem>
                      <SelectItem value="2x64">2x64</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddSplitter}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Splitter
                </Button>
              </div>

              <div className="space-y-3 p-3 rounded-lg border bg-blue-50">
                <h4 className="font-medium">Nova Conexao Interna</h4>
                <div>
                  <Label>Ponta A</Label>
                  <Select value={connectionEndpointA} onValueChange={setConnectionEndpointA}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fusionEndpointOptions.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.group}: {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ponta B</Label>
                  <Select value={connectionEndpointB} onValueChange={setConnectionEndpointB}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fusionEndpointOptions.filter((endpoint) => endpoint.id !== connectionEndpointA).map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.group}: {endpoint.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={connectionType} onValueChange={(v: 'connector' | 'fusion' | 'mechanical') => setConnectionType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connector">Conector</SelectItem>
                      <SelectItem value="fusion">Fusao</SelectItem>
                      <SelectItem value="mechanical">Emenda Mecanica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateBoxConnection} disabled={!connectionEndpointA || !connectionEndpointB}>
                  <Link2 className="w-4 h-4 mr-1" />
                  Conectar Pontas
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fusions" className="space-y-4 mt-4 overflow-y-auto pr-1 pb-4">
            <div className="grid grid-cols-5 gap-3 items-end">
              <div className="col-span-1">
                <Label>Nome do Splitter</Label>
                <Input value={newSplitterName} onChange={(e) => setNewSplitterName(e.target.value)} placeholder="Ex: SPL-Quadro-1" />
              </div>
              <div className="col-span-1">
                <Label>Tipo</Label>
                <Select value={newSplitterType} onValueChange={(v: Splitter['type']) => setNewSplitterType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1x2">1x2</SelectItem>
                    <SelectItem value="1x4">1x4</SelectItem>
                    <SelectItem value="1x8">1x8</SelectItem>
                    <SelectItem value="1x16">1x16</SelectItem>
                    <SelectItem value="1x32">1x32</SelectItem>
                    <SelectItem value="1x64">1x64</SelectItem>
                    <SelectItem value="2x2">2x2</SelectItem>
                    <SelectItem value="2x4">2x4</SelectItem>
                    <SelectItem value="2x8">2x8</SelectItem>
                    <SelectItem value="2x16">2x16</SelectItem>
                    <SelectItem value="2x32">2x32</SelectItem>
                    <SelectItem value="2x64">2x64</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <Button onClick={handleAddSplitter} className="w-full">
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Splitter no Quadro
                </Button>
              </div>
              <div className="col-span-1">
                <Button variant="outline" onClick={() => setShowAddCableDialog(true)} className="w-full">
                  Adicionar Cabo
                </Button>
              </div>
              <div className="col-span-1">
                <Button variant="outline" onClick={handleUndoLastFusion} disabled={boardConnections.length === 0} className="w-full">
                  Desfazer Ultima Fusao
                </Button>
              </div>
              <div className="col-span-1">
                <div className="flex items-center gap-2 border rounded-md px-2 py-1.5 bg-white">
                  <Button type="button" size="sm" variant="outline" onClick={handleZoomOutFusionBoard} className="h-7 px-2">
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs font-medium w-14 text-center">{Math.round(fusionBoardZoom * 100)}%</span>
                  <Button type="button" size="sm" variant="outline" onClick={handleZoomInFusionBoard} className="h-7 px-2">
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={handleZoomResetFusionBoard} className="h-7 px-2 text-xs">
                    100%
                  </Button>
                </div>
              </div>
              <div className="col-span-1 text-xs text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                Arraste os blocos e desenhe de uma fibra para outra.
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="col-span-2">
                <Label>Vincular Cabo Livre a Esta Caixa</Label>
                <Select value={selectedLooseCableId} onValueChange={setSelectedLooseCableId}>
                  <SelectTrigger>
                    <SelectValue placeholder={looseCables.length === 0 ? 'Nenhum cabo livre disponivel' : 'Selecione um cabo livre'} />
                  </SelectTrigger>
                  <SelectContent>
                    {looseCables.map((cable) => (
                      <SelectItem key={cable.id} value={cable.id}>
                        {cable.name} {cable.startPoint ? '(falta destino)' : cable.endPoint ? '(falta origem)' : '(sem origem e destino)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <Button className="w-full" variant="outline" onClick={handleAttachLooseCableToCurrentBox} disabled={!selectedLooseCableId}>
                  Vincular
                </Button>
              </div>
              {selectedLooseCable && (
                <div className="col-span-3 text-xs text-gray-500">
                  Este vinculo vai preencher {selectedLooseCable.startPoint ? 'o destino' : 'a origem'} do cabo selecionado com a caixa atual.
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 items-end">
              <div className="col-span-2 text-xs text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                Cria fusoes em massa (Entrada x Saida, mesma numeracao de fibra) com 0 dB. Para usar uma fibra depois, clique no x para desfazer e refaca a fusao normal.
              </div>
              <div className="col-span-1">
                <Button className="w-full" variant="outline" onClick={handleCreateNoLossBulkFusions}>
                  Todas sem perda
                </Button>
              </div>
            </div>

            <FusionBoardCanvas
              isFullscreen={isFullscreen}
              entityOptions={entityOptions}
              entityPositions={entityPositions}
              endpointsByEntity={endpointsByEntity}
              endpointById={endpointById}
              boardConnections={boardConnections}
              dragState={dragState}
              layoutTick={layoutTick}
              zoom={fusionBoardZoom}
              sceneSize={fusionBoardSceneSize}
              fusionBoardRef={fusionBoardRef}
              fusionSceneRef={fusionSceneRef}
              endpointRefs={endpointRefs}
              getEndpointPosition={getEndpointPosition}
              getEntityCardClass={getEntityCardClass}
              endpointBadge={endpointBadge}
              onStartNodeDrag={startNodeDrag}
              onStartEndpointDrag={startDragFromEndpoint}
              onFinishEndpointDrag={finishDragOnEndpoint}
              onDisconnectFusion={disconnectFibers}
              onLayoutSync={handleLayoutSync}
              onRemoveEntity={handleRemoveEntity}
            />
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            {!editingBox ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs text-gray-500">Fibras ativas</p>
                    <p className="text-2xl font-semibold">{fiberUsageStats.active}</p>
                    <p className="text-xs text-gray-500">de {fiberUsageStats.total}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs text-gray-500">Utilizacao</p>
                    <p className="text-2xl font-semibold">{fiberUsageStats.utilization.toFixed(1)}%</p>
                    <p className="text-xs text-gray-500">ocupacao da caixa</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs text-gray-500">Cabos conectados</p>
                    <p className="text-2xl font-semibold">{relatedCables.length}</p>
                    <p className="text-xs text-gray-500">{cableStats.totalCableFibers} fibras de cabo</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-gray-50">
                    <p className="text-xs text-gray-500">Perda media GPON</p>
                    <p className="text-2xl font-semibold">{gponSummary.avgLossDb.toFixed(2)} dB</p>
                    <p className="text-xs text-gray-500">por fusao local</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-gray-500">Nome</Label><p className="font-medium">{currentBox.name}</p></div>
                  <div><Label className="text-gray-500">Tipo</Label><p className="font-medium">{currentBox.type}</p></div>
                  <div><Label className="text-gray-500">Capacidade</Label><p className="font-medium">{currentBox.capacity} fibras</p></div>
                  <div><Label className="text-gray-500">Status</Label><Badge variant={currentBox.status === 'active' ? 'default' : 'secondary'}>{currentBox.status}</Badge></div>
                  {currentBox.address && (
                    <div className="col-span-2">
                      <Label className="text-gray-500">Endereco</Label>
                      <p className="font-medium flex items-center gap-2"><MapPin className="w-4 h-4" />{currentBox.address}</p>
                    </div>
                  )}
                  {currentBox.installationDate && (
                    <div>
                      <Label className="text-gray-500">Data de Instalacao</Label>
                      <p className="font-medium flex items-center gap-2"><Calendar className="w-4 h-4" />{new Date(currentBox.installationDate).toLocaleDateString('pt-BR')}</p>
                    </div>
                  )}
                  {currentBox.manufacturer && <div><Label className="text-gray-500">Fabricante</Label><p className="font-medium">{currentBox.manufacturer}</p></div>}
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">Posicao geografica da caixa</p>
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
                    <Button onClick={handleSaveBoxPosition}>Salvar posicao</Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h4 className="font-semibold">Documentacao tecnica FTTH</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <Label className="text-gray-500">Cabos entrada</Label>
                      <p className="font-medium">{cableStats.incoming.length}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Cabos saida</Label>
                      <p className="font-medium">{cableStats.outgoing.length}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Comprimento total</Label>
                      <p className="font-medium">{(cableStats.totalLengthMeters / 1000).toFixed(2)} km</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Comprimento medio</Label>
                      <p className="font-medium">{Math.round(cableStats.avgLengthMeters)} m</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Fibras inativas</Label>
                      <p className="font-medium">{fiberUsageStats.inactive}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Fibras reservadas</Label>
                      <p className="font-medium">{fiberUsageStats.reserved}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Fibras com falha</Label>
                      <p className="font-medium">{fiberUsageStats.faulty}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Splitters instalados</Label>
                      <p className="font-medium">{splitterStats.count} ({splitterStats.inputPorts} IN / {splitterStats.outputPorts} OUT)</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Atenuacao splitters</Label>
                      <p className="font-medium">{splitterStats.attenuationDb.toFixed(2)} dB</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Fusoes internas</Label>
                      <p className="font-medium">{localConnections.length}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Perda total estimada</Label>
                      <p className="font-medium">{gponSummary.totalLossDb.toFixed(2)} dB</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Pior caso por fusao</Label>
                      <p className="font-medium">{gponSummary.maxLossDb.toFixed(2)} dB</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Atenuacao GPON por fibra/fusao</h4>
                    <p className="text-xs text-gray-500">
                      Modelo: fibra {GPON_FIBER_LOSS_DB_PER_KM} dB/km, fusao {GPON_FUSION_LOSS_DB} dB, conector {GPON_CONNECTOR_LOSS_DB} dB
                    </p>
                  </div>
                  {fusionLossRows.length === 0 ? (
                    <div className="text-sm text-gray-500">Nenhuma fusao interna para estimativa de perda.</div>
                  ) : (
                    <div className="max-h-[220px] overflow-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left p-2">Fibra A</th>
                            <th className="text-left p-2">Fibra B</th>
                            <th className="text-left p-2">Tipo</th>
                            <th className="text-right p-2">Rota</th>
                            <th className="text-right p-2">Perda fibra</th>
                            <th className="text-right p-2">Perda total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fusionLossRows.map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="p-2">{row.fiberA}</td>
                              <td className="p-2">{row.fiberB}</td>
                              <td className="p-2 uppercase">{row.fusionType}{row.isNoLoss ? ' (DIRETO)' : ''}</td>
                              <td className="p-2 text-right">{Math.round(row.routeMeters)} m</td>
                              <td className="p-2 text-right">{row.fiberDb.toFixed(2)} dB</td>
                              <td className="p-2 text-right font-semibold">{row.estimatedLossDb.toFixed(2)} dB</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={() => setEditingBox(true)}><Edit3 className="w-4 h-4 mr-1" />Editar</Button>
                  <Button variant="destructive" onClick={() => { if (confirm('Tem certeza que deseja excluir esta caixa?')) { removeBox(currentBox.id); onOpenChange(false); } }}><Trash2 className="w-4 h-4 mr-1" />Excluir</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div><Label>Nome</Label><Input value={boxName} onChange={(e) => setBoxName(e.target.value)} /></div>
                <div><Label>Endereco</Label><Input value={boxAddress} onChange={(e) => setBoxAddress(e.target.value)} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={boxStatus} onValueChange={(v: Box['status']) => setBoxStatus(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="maintenance">Manutencao</SelectItem>
                      <SelectItem value="projected">Projetado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveBox}><Save className="w-4 h-4 mr-1" />Salvar</Button>
                  <Button variant="outline" onClick={() => setEditingBox(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tests" className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-gray-500">
                {selectedFiber
                  ? `Fibra selecionada: ${selectedFiber.number} (${selectedFiber.color.name})`
                  : 'Selecione uma fibra na aba "Fibras" para testar continuidade'}
              </div>
              <Button size="sm" variant="outline" onClick={() => selectedFiber && handleTestContinuity(selectedFiber)} disabled={!selectedFiber}>
                <Activity className="w-4 h-4 mr-1" />
                Testar Agora
              </Button>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {continuityTestResult && (
                  <div className={`p-4 rounded-lg ${continuityTestResult.result === 'pass' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-2">
                      {continuityTestResult.result === 'pass' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                      <span className="font-medium">
                        Fibra {continuityTestResult.fiberNumber}: teste {continuityTestResult.result === 'pass' ? 'aprovado' : 'reprovado'}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      <div>Horario: {new Date(continuityTestResult.testedAt).toLocaleString('pt-BR')}</div>
                      <div>Caminho: {continuityTestResult.path.length > 0 ? continuityTestResult.path.join(' -> ') : 'Sem rota detectada'}</div>
                      <div>Atenuacao: {typeof continuityTestResult.attenuation === 'number' ? `${continuityTestResult.attenuation.toFixed(3)} dB` : 'N/A'}</div>
                    </div>
                  </div>
                )}
                {boxContinuityTests.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">Nenhum teste registrado para esta caixa.</div>
                ) : (
                  <div className="space-y-2">
                    {boxContinuityTests.map((test) => (
                      <div
                        key={test.id}
                        className={`p-3 rounded-lg border ${test.result === 'pass' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">Fibra {test.fiberNumber}</div>
                          <div className="text-xs text-gray-500">{new Date(test.testedAt).toLocaleString('pt-BR')}</div>
                        </div>
                        <div className="text-xs mt-1 text-gray-700">
                          Resultado: {test.result === 'pass' ? 'Aprovado' : 'Reprovado'} | Atenuacao:{' '}
                          {typeof test.attenuation === 'number' ? `${test.attenuation.toFixed(3)} dB` : 'N/A'}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">Destino: {test.endPoint || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <Dialog open={showFusionDialog} onOpenChange={setShowFusionDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Nova Fusao Externa</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {selectedFiber && (
                <div className="bg-blue-50 p-3 rounded"><p className="text-sm text-blue-800">Fibra selecionada: <strong>{selectedFiber.number}</strong> ({selectedFiber.color.name})</p></div>
              )}

              <div>
                <Label>Nome do Cabo</Label>
                <Input value={newCableName} onChange={(e) => setNewCableName(e.target.value)} placeholder={`Ex: ${newCableModel} ${currentBox.name} -> destino`} />
              </div>
              <div>
                <Label>Caixa de Destino</Label>
                <Select value={fusionTargetBox} onValueChange={setFusionTargetBox}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {connectedBoxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.type})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {fusionTargetBox && (
                <div>
                  <Label>Fibra de Destino</Label>
                  <Select value={fusionTargetFiber} onValueChange={setFusionTargetFiber}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {connectedBoxes.find((b) => b.id === fusionTargetBox)?.fibers.filter((f) => f.status === 'inactive').map((f) => (
                        <SelectItem key={f.id} value={f.id}>Fibra {f.number} - {f.color.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={handleFusion} disabled={!selectedFiber || !fusionTargetBox || !fusionTargetFiber} className="flex-1"><Link2 className="w-4 h-4 mr-1" />Criar Fusao</Button>
                <Button variant="outline" onClick={() => { setShowFusionDialog(false); setFusionTargetBox(''); setFusionTargetFiber(''); }}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddCableDialog} onOpenChange={setShowAddCableDialog}>
          <DialogContent className="w-[min(96vw,720px)] max-w-[720px] max-h-[90vh] overflow-hidden p-0">
            <DialogHeader>
              <DialogTitle className="px-6 pt-6">Adicionar Cabo</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[calc(90vh-150px)] px-6 pb-4">
              <div className="space-y-4">
                <div>
                  <Label>Nome do Cabo</Label>
                  <Input value={newCableName} onChange={(e) => setNewCableName(e.target.value)} placeholder={`Ex: ${newCableModel} ${currentBox.name} -> destino`} />
                </div>
                <div>
                  <Label>Caixa de Destino</Label>
                  <Select value={newCableTargetBox} onValueChange={setNewCableTargetBox}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {connectedBoxes.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Cabo</Label>
                  <Select value={newCableType} onValueChange={(v: 'drop' | 'distribution' | 'feeder' | 'backbone') => setNewCableType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drop">Drop</SelectItem>
                      <SelectItem value="distribution">Distribuicao</SelectItem>
                      <SelectItem value="feeder">Feeder</SelectItem>
                      <SelectItem value="backbone">Backbone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modelo do Cabo</Label>
                  <Select value={newCableModel} onValueChange={setNewCableModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableNewCableModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tubos loose</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCableLooseTubeCount}
                      onChange={(e) => setNewCableLooseTubeCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                    />
                  </div>
                  <div>
                    <Label>Fibras por tubo</Label>
                    <Input
                      type="number"
                      min={1}
                      value={newCableFibersPerTube}
                      onChange={(e) => setNewCableFibersPerTube(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Quantidade de Fibras</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxNewCableFiberCapacity}
                    value={newCableFiberCount}
                    onChange={(e) => {
                      const next = Math.max(1, Number.parseInt(e.target.value || '1', 10));
                      setNewCableFiberCount(Math.min(maxNewCableFiberCapacity, next));
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1">Capacidade atual: {maxNewCableFiberCapacity} fibras ({newCableLooseTubeCount} x {newCableFibersPerTube}).</p>
                </div>
              </div>
            </ScrollArea>
            <div className="border-t px-6 py-4 bg-white">
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleAddCableFromFusionBoard} disabled={!newCableTargetBox}>
                  Confirmar
                </Button>
                <Button variant="outline" onClick={() => setShowAddCableDialog(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
