
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Link2, Unlink, Zap, Save, Trash2, User, MapPin, Calendar, Settings, CheckCircle2, XCircle, Edit3, Plus, Maximize2, Minimize2 } from 'lucide-react';
import type { Fiber, Box, Splitter } from '@/types/ftth';
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

export function BoxDetail({ box, open, onOpenChange }: BoxDetailProps) {
  const {
    currentNetwork,
    updateBox,
    removeBox,
    addCable,
    removeCable,
    connectFibers,
    connectBoxEndpoints,
    disconnectFibers,
    addSplitterToBox,
    removeSplitterFromBox,
    testContinuity,
  } = useNetworkStore();

  const currentBox = currentNetwork?.boxes.find((b) => b.id === box.id) || box;
  const connectedBoxes = currentNetwork?.boxes.filter((b) => b.id !== currentBox.id) || [];
  const relatedCables = (currentNetwork?.cables || []).filter(
    (cable) => cable.startPoint === currentBox.id || cable.endPoint === currentBox.id
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
  const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [layoutTick, setLayoutTick] = useState(0);

  const [editingBox, setEditingBox] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [boxName, setBoxName] = useState(currentBox.name);
  const [boxAddress, setBoxAddress] = useState(currentBox.address || '');
  const [boxStatus, setBoxStatus] = useState(currentBox.status);
  const [continuityTestResult, setContinuityTestResult] = useState<{ fiberId: string; result: 'pass' | 'fail' } | null>(null);
  const [showAddCableDialog, setShowAddCableDialog] = useState(false);
  const [newCableTargetBox, setNewCableTargetBox] = useState('');
  const [newCableFiberCount, setNewCableFiberCount] = useState(12);
  const [newCableType, setNewCableType] = useState<'drop' | 'distribution' | 'feeder' | 'backbone'>('distribution');

  const endpointOptions = useMemo(() => {
    const options: EndpointOption[] = [];

    currentBox.fibers.forEach((fiber) => {
      options.push({
        id: fiber.id,
        label: `Fibra ${fiber.number} (${fiber.color.name})`,
        group: `${currentBox.name} - Caixa`,
        colorHex: fiber.color.hex,
        status: fiber.status,
        fusionId: fiber.fusionId,
        entityId: `box:${currentBox.id}`,
        entityLabel: `${currentBox.name} (Caixa)`,
      });
    });

    relatedCables.forEach((cable) => {
      const direction = cable.startPoint === currentBox.id ? 'Saida' : 'Entrada';
      cable.fibers.forEach((fiber) => {
        options.push({
          id: fiber.id,
          label: `Fibra ${fiber.number} (${fiber.color.name})`,
          group: `${cable.name} (${direction})`,
          colorHex: fiber.color.hex,
          status: fiber.status,
          fusionId: fiber.fusionId,
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
          fusionId: fiber.fusionId,
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
          fusionId: fiber.fusionId,
          entityId: `splitter:${splitter.id}`,
          entityLabel: `${splitter.name} (${splitter.type})`,
        });
      });
    });

    return options;
  }, [currentBox, relatedCables]);

  const endpointById = useMemo(
    () => endpointOptions.reduce<Record<string, EndpointOption>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {}),
    [endpointOptions]
  );

  const entityOptions = useMemo(() => {
    const entities: Array<{ id: string; label: string; type: 'box' | 'cable' | 'splitter' }> = [];

    entities.push({
      id: `box:${currentBox.id}`,
      label: `${currentBox.name} (Caixa)`,
      type: 'box',
    });

    relatedCables.forEach((cable) => {
      const direction = cable.startPoint === currentBox.id ? 'Saida' : 'Entrada';
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

  const localConnections = useMemo(
    () => (currentBox.fusions || []).filter((fusion) => fusion.boxAId === currentBox.id && fusion.boxBId === currentBox.id),
    [currentBox]
  );

  const boardConnections = localConnections;

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
    if (entityOptions.length === 0) return;
    setEntityPositions((prev) => {
      const next = { ...prev };
      const cols = 3;
      const colWidth = 290;
      const rowHeight = 220;

      entityOptions.forEach((entity, index) => {
        if (next[entity.id]) return;
        const col = index % cols;
        const row = Math.floor(index / cols);
        next[entity.id] = {
          x: 20 + col * colWidth,
          y: 20 + row * rowHeight,
        };
      });

      return next;
    });
  }, [entityOptions]);

  useEffect(() => {
    setLayoutTick((value) => value + 1);
  }, [boardConnections.length, entityPositions]);

  useEffect(() => {
    if (!dragState && !nodeDragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const board = fusionBoardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      if (dragState) {
        setDragState((prev) => (prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : null));
      }
      if (nodeDragState) {
        const maxX = Math.max(0, rect.width - 260);
        const maxY = Math.max(0, rect.height - 190);
        const nextX = Math.min(maxX, Math.max(0, event.clientX - rect.left - nodeDragState.offsetX));
        const nextY = Math.min(maxY, Math.max(0, event.clientY - rect.top - nodeDragState.offsetY));
        setEntityPositions((prev) => ({
          ...prev,
          [nodeDragState.entityId]: { x: nextX, y: nextY },
        }));
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
      setNodeDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, nodeDragState]);

  const getEndpointPosition = (endpointId: string) => {
    const board = fusionBoardRef.current;
    const endpoint = endpointRefs.current[endpointId];
    if (!board || !endpoint) return null;
    const boardRect = board.getBoundingClientRect();
    const endpointRect = endpoint.getBoundingClientRect();
    return {
      x: endpointRect.left + endpointRect.width / 2 - boardRect.left,
      y: endpointRect.top + endpointRect.height / 2 - boardRect.top,
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
    if (sourceEndpoint.entityId === targetEndpoint.entityId) {
      setDragState(null);
      return;
    }

    connectBoxEndpoints(currentBox.id, dragState.fromId, targetId, 'fusion');
    setDragState(null);
  };

  const startNodeDrag = (entityId: string, event: { clientX: number; clientY: number }) => {
    const board = fusionBoardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const position = entityPositions[entityId] || { x: 0, y: 0 };
    setNodeDragState({
      entityId,
      offsetX: event.clientX - rect.left - position.x,
      offsetY: event.clientY - rect.top - position.y,
    });
  };

  const getEntityType = (entityId: string) => {
    return entityOptions.find((entity) => entity.id === entityId)?.type || 'box';
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
      name: `Cabo ${currentBox.name} -> ${targetBox.name}`,
      type: newCableType,
      fiberCount: newCableFiberCount,
      startPoint: currentBox.id,
      endPoint: targetBox.id,
      path: [],
      length: calculateDistanceMeters(currentBox.position, targetBox.position),
      status: 'active',
      color: '#00AA00',
    });

    setShowAddCableDialog(false);
    setNewCableTargetBox('');
    setNewCableFiberCount(12);
    setNewCableType('distribution');
  };

  const handleUndoLastFusion = () => {
    if (localConnections.length === 0) return;
    const lastFusion = localConnections[localConnections.length - 1];
    if (!lastFusion) return;
    disconnectFibers(lastFusion.id);
  };

  const handleSaveBox = () => {
    updateBox(currentBox.id, { name: boxName, address: boxAddress, status: boxStatus });
    setEditingBox(false);
  };

  const handleTestContinuity = (fiber: Fiber) => {
    const result = Math.random() > 0.1 ? 'pass' : 'fail';
    setContinuityTestResult({ fiberId: fiber.id, result });

    testContinuity({
      cableId: currentBox.inputCables[0] || currentBox.outputCables[0] || '',
      fiberNumber: fiber.number,
      startPoint: currentBox.name,
      endPoint: fiber.connectedTo ? 'Conectado' : 'Nao conectado',
      result,
      attenuation: result === 'pass' ? Math.random() * 0.5 : undefined,
      technician: 'Tecnico',
    });
  };

  const getConnectedFiberInfo = (fiber: Fiber) => {
    if (!fiber.fusionId) return null;
    const fusion = currentBox.fusions.find((f) => f.id === fiber.fusionId);
    if (!fusion) return null;
    const otherBoxId = fusion.boxAId === currentBox.id ? fusion.boxBId : fusion.boxAId;
    const otherBox = currentNetwork?.boxes.find((b) => b.id === otherBoxId);
    const otherFiberId = fusion.fiberAId === fiber.id ? fusion.fiberBId : fusion.fiberAId;
    const otherFiber = otherBox?.fibers.find((f) => f.id === otherFiberId);
    return { box: otherBox, fiber: otherFiber };
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
                Total: {currentBox.fibers.length} fibras | Ativas: {currentBox.fibers.filter((f) => f.status === 'active').length} |
                Disponiveis: {currentBox.fibers.filter((f) => f.status === 'inactive').length}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedFiber(null);
                  setShowFusionDialog(true);
                }}
              >
                <Link2 className="w-4 h-4 mr-1" />
                Nova Fusao Externa
              </Button>
            </div>

            <ScrollArea className="h-[360px]">
              <div className="grid grid-cols-6 gap-2">
                {currentBox.fibers.map((fiber) => {
                  const status = getFiberStatus(fiber);
                  const connectedInfo = getConnectedFiberInfo(fiber);

                  return (
                    <div
                      key={fiber.id}
                      className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedFiber?.id === fiber.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFiber(fiber)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: fiber.color.hex, borderColor: '#ccc' }} />
                        <span className="font-mono text-sm">{fiber.number}</span>
                      </div>
                      <div className={`w-full h-1 rounded ${status.color}`} />
                      <div className="text-xs text-gray-500 mt-1">{status.label}</div>
                      {connectedInfo && <div className="text-xs text-blue-600 mt-1 truncate">-&gt; {connectedInfo.box?.name || 'conexao interna'}</div>}
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
                  {!selectedFiber.fusionId ? (
                    <Button size="sm" onClick={() => setShowFusionDialog(true)}>
                      <Link2 className="w-4 h-4 mr-1" />
                      Fusao Externa
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={() => selectedFiber.fusionId && disconnectFibers(selectedFiber.fusionId)}>
                      <Unlink className="w-4 h-4 mr-1" />
                      Desconectar
                    </Button>
                  )}
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
                      {endpointOptions.map((endpoint) => (
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
                      {endpointOptions.filter((endpoint) => endpoint.id !== connectionEndpointA).map((endpoint) => (
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
                <Button variant="outline" onClick={handleUndoLastFusion} disabled={localConnections.length === 0} className="w-full">
                  Desfazer Ultima Fusao
                </Button>
              </div>
              <div className="col-span-1 text-xs text-gray-500 border rounded-md px-3 py-2 bg-gray-50">
                Arraste os blocos e desenhe de uma fibra para outra.
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
              fusionBoardRef={fusionBoardRef}
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

          <TabsContent value="tests">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {continuityTestResult && (
                  <div className={`p-4 rounded-lg ${continuityTestResult.result === 'pass' ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="flex items-center gap-2">
                      {continuityTestResult.result === 'pass' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                      <span className="font-medium">Teste de continuidade {continuityTestResult.result === 'pass' ? 'aprovado' : 'reprovado'}</span>
                    </div>
                  </div>
                )}
                <div className="text-center text-gray-500 py-8">Selecione uma fibra e clique em "Testar" para verificar a continuidade</div>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adicionar Cabo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                <Label>Quantidade de Fibras</Label>
                <Select value={newCableFiberCount.toString()} onValueChange={(v) => setNewCableFiberCount(Number.parseInt(v, 10))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="6">6</SelectItem>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="24">24</SelectItem>
                    <SelectItem value="36">36</SelectItem>
                    <SelectItem value="48">48</SelectItem>
                    <SelectItem value="72">72</SelectItem>
                    <SelectItem value="96">96</SelectItem>
                    <SelectItem value="144">144</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
