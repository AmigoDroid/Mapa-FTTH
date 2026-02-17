
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { FullscreenModalShell } from './FullscreenModalShell';
import type { Pop, PopFusion } from '@/types/ftth';

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
  endpointType: 'dio' | 'fiber' | 'pon' | 'uplink' | 'switch-port' | 'router-iface';
  slotId?: string;
  ponId?: string;
  uplinkId?: string;
  portId?: string;
  isUplink?: boolean;
  routerInterfaceId?: string;
  role?: 'WAN' | 'LAN';
  active?: boolean;
};

export function PopDetail({ pop, open, onOpenChange }: PopDetailProps) {
  const {
    currentNetwork,
    addDioToPop,
    addOltToPop,
    addPonToOlt,
    toggleOltUplink,
    addSwitchToPop,
    toggleSwitchPort,
    addRouterToPop,
    toggleRouterInterface,
    addCableToPop,
    connectPopEndpoints,
    disconnectPopFusion,
  } = useNetworkStore();

  const currentPop = currentNetwork?.pops.find((item) => item.id === pop.id) || pop;
  const city = currentNetwork?.cities.find((item) => item.id === currentPop.cityId);

  const [dioName, setDioName] = useState('');
  const [dioPorts, setDioPorts] = useState(24);
  const [oltName, setOltName] = useState('');
  const [oltType, setOltType] = useState<'compact' | 'chassi'>('chassi');
  const [gbicModel, setGbicModel] = useState('C++');
  const [gbicConnector, setGbicConnector] = useState<'APC' | 'UPC' | 'APC-UPC'>('APC-UPC');
  const [txPowerDbm, setTxPowerDbm] = useState(3);

  const [switchName, setSwitchName] = useState('');
  const [switchPorts, setSwitchPorts] = useState(24);
  const [switchUplinks, setSwitchUplinks] = useState(4);

  const [routerName, setRouterName] = useState('');
  const [routerWanCount, setRouterWanCount] = useState(2);
  const [routerLanCount, setRouterLanCount] = useState(8);

  const [cableName, setCableName] = useState('');
  const [cableType, setCableType] = useState<'bigtail' | 'backbone' | 'patchcord' | 'apc-upc'>('bigtail');
  const [cableFiberCount, setCableFiberCount] = useState(12);

  const [fusionType, setFusionType] = useState<PopFusion['fusionType']>('fusion');
  const [noLoss, setNoLoss] = useState(false);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodeDragState, setNodeDragState] = useState<{ entityId: string; offsetX: number; offsetY: number } | null>(null);
  const [dragState, setDragState] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [boardZoom, setBoardZoom] = useState(1);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const endpointRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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
      cable.fibers.forEach((fiber) => {
        items.push({
          id: `cable:${cable.id}:f:${fiber.number}`,
          entityId: `cable:${cable.id}`,
          label: `CABO ${cable.name} - Fibra ${fiber.number}`,
          shortLabel: `F${fiber.number}`,
          endpointType: 'fiber',
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

  const sceneSize = useMemo(() => {
    const positions = Object.values(nodePositions);
    const maxX = positions.length > 0 ? Math.max(...positions.map((p) => p.x)) : 0;
    const maxY = positions.length > 0 ? Math.max(...positions.map((p) => p.y)) : 0;
    return { width: Math.max(2200, maxX + 500), height: Math.max(1400, maxY + 420) };
  }, [nodePositions]);

  useEffect(() => {
    if (!open || entityOptions.length === 0) return;
    setNodePositions((prev) => {
      const next = { ...prev };
      const cols = 4;
      entityOptions.forEach((entity, idx) => {
        if (next[entity.id]) return;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        next[entity.id] = { x: 30 + col * 520, y: 32 + row * 320 };
      });
      return next;
    });
  }, [open, entityOptions]);

  useEffect(() => {
    if (!open) setSelectedEndpointId(null);
  }, [open]);

  const getScenePoint = (clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    if (!scene) return null;
    const rect = scene.getBoundingClientRect();
    return { x: (clientX - rect.left) / boardZoom, y: (clientY - rect.top) / boardZoom };
  };

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
    connectPopEndpoints(currentPop.id, dragState.fromId, targetId, fusionType, noLoss);
    setDragState(null);
  };

  useEffect(() => {
    if (!nodeDragState && !dragState) return;
    const onMove = (event: MouseEvent) => {
      const point = getScenePoint(event.clientX, event.clientY);
      if (!point) return;
      if (dragState) setDragState((prev) => (prev ? { ...prev, x: point.x, y: point.y } : null));
      if (nodeDragState) {
        setNodePositions((prev) => ({
          ...prev,
          [nodeDragState.entityId]: {
            x: Math.max(0, Math.min(sceneSize.width - 400, point.x - nodeDragState.offsetX)),
            y: Math.max(0, Math.min(sceneSize.height - 180, point.y - nodeDragState.offsetY)),
          },
        }));
      }
    };
    const onUp = () => {
      setNodeDragState(null);
      setDragState(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [nodeDragState, dragState, sceneSize.width, sceneSize.height, boardZoom]);

  const getPortDisplay = (endpoint: EndpointNode) => endpoint.shortLabel.match(/\d+/)?.[0] || endpoint.shortLabel;

  const renderPortButton = (endpoint: EndpointNode, className?: string, displayLabel?: string) => {
    const isDisabled = endpoint.active === false;
    const isSelected = selectedEndpointId === endpoint.id;
    const isOnTrace = highlightedTrace.endpointIds.has(endpoint.id);
    return (
      <button
        key={endpoint.id}
        ref={(node) => { endpointRefs.current[endpoint.id] = node; }}
        type="button"
        onMouseDown={(event) => { event.preventDefault(); startEndpointDrag(endpoint.id, isDisabled); }}
        onMouseUp={() => finishEndpointDrag(endpoint.id, isDisabled)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setSelectedEndpointId((prev) => (prev === endpoint.id ? null : endpoint.id));
        }}
        disabled={isDisabled}
        className={`${className || `h-7 px-2 rounded border text-[11px] ${isDisabled ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed' : 'bg-white hover:bg-slate-50 border-slate-300 cursor-pointer'}`} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${!isSelected && isOnTrace ? 'ring-1 ring-cyan-400/80 ring-offset-1' : ''}`}
        title={endpoint.label}
      >
        {displayLabel || endpoint.shortLabel}
      </button>
    );
  };

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
          <Tabs defaultValue="infra" className="space-y-4">
            <TabsList className="w-full max-w-[860px] flex gap-2 overflow-x-auto">
              <TabsTrigger className="shrink-0 whitespace-nowrap" value="infra">Infra POP</TabsTrigger>
              <TabsTrigger className="shrink-0 whitespace-nowrap" value="fusions">Fusoes POP</TabsTrigger>
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

              <Tabs defaultValue="dio" className="space-y-4">
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
                </TabsContent>

                <TabsContent value="olt" className="space-y-3 border rounded-lg p-4">
                  <h4 className="font-semibold text-sm">Cadastrar OLT (inicia com 1 slot, 1 PON, 1 GBIC e uplinks)</h4>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={oltName} onChange={(e) => setOltName(e.target.value)} placeholder="OLT POP-01" /></div>
                    <div><Label>Tipo</Label><Select value={oltType} onValueChange={(v: 'compact' | 'chassi') => setOltType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="compact">Compacta</SelectItem><SelectItem value="chassi">Chassi</SelectItem></SelectContent></Select></div>
                    <div><Label>GBIC</Label><Input value={gbicModel} onChange={(e) => setGbicModel(e.target.value)} placeholder="C++" /></div>
                    <div><Label>Sinal GBIC (dBm)</Label><Input type="number" value={txPowerDbm} onChange={(e) => setTxPowerDbm(Number.parseFloat(e.target.value || '0'))} /></div>
                  </div>
                  <div className="md:max-w-[260px]"><Label>Conector</Label><Select value={gbicConnector} onValueChange={(v: 'APC' | 'UPC' | 'APC-UPC') => setGbicConnector(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APC">APC</SelectItem><SelectItem value="UPC">UPC</SelectItem><SelectItem value="APC-UPC">APC-UPC</SelectItem></SelectContent></Select></div>
                  <Button onClick={() => {
                    if (!oltName.trim()) return;
                    const created = addOltToPop(currentPop.id, { name: oltName.trim(), type: oltType, slotCount: 1, ponsPerSlot: 1, gbicModel: gbicModel.trim() || 'C++', connector: gbicConnector, txPowerDbm });
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
                  <h4 className="font-semibold text-sm">Cadastrar Cabo do POP</h4>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <div><Label>Nome</Label><Input value={cableName} onChange={(e) => setCableName(e.target.value)} placeholder="BIGTAIL 24F" /></div>
                    <div><Label>Tipo</Label><Select value={cableType} onValueChange={(v: 'bigtail' | 'backbone' | 'patchcord' | 'apc-upc') => setCableType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bigtail">Bigtail</SelectItem><SelectItem value="backbone">Backbone</SelectItem><SelectItem value="patchcord">Patchcord</SelectItem><SelectItem value="apc-upc">APC-UPC</SelectItem></SelectContent></Select></div>
                    <div><Label>Fibras</Label><Input type="number" min={1} value={cableFiberCount} onChange={(e) => setCableFiberCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))} /></div>
                  </div>
                  <Button onClick={() => {
                    if (!cableName.trim()) return;
                    const created = addCableToPop(currentPop.id, { name: cableName.trim(), type: cableType, fiberCount: cableFiberCount, status: 'active' });
                    if (!created) return;
                    setCableName('');
                  }}>Adicionar Cabo</Button>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="fusions" className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] items-end border rounded-lg p-3 bg-gray-50">
                <div><Label>Tipo de conexao</Label><Select value={fusionType} onValueChange={(v: PopFusion['fusionType']) => setFusionType(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fusion">Fusao</SelectItem><SelectItem value="connector">Conector</SelectItem><SelectItem value="mechanical">Mecanica</SelectItem></SelectContent></Select></div>
                <Button variant={noLoss ? 'default' : 'outline'} onClick={() => setNoLoss((prev) => !prev)} className="w-full lg:w-auto">{noLoss ? 'Sem perda (0 dB)' : 'Perda normal'}</Button>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setBoardZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))))}>-</Button><Button variant="outline" size="sm" onClick={() => setBoardZoom(1)}>100%</Button><Button variant="outline" size="sm" onClick={() => setBoardZoom((prev) => Math.min(1.8, Number((prev + 0.1).toFixed(2))))}>+</Button></div>
                <div className="text-xs text-gray-500 bg-white border rounded px-2 py-2">Arraste blocos e ligue porta a porta.</div>
              </div>

              <div className="border rounded-xl overflow-hidden bg-zinc-100">
                <div className="h-[calc(95vh-280px)] min-h-[560px] overflow-auto">
                  <div
                    ref={sceneRef}
                    className="relative origin-top-left"
                    style={{ width: `${sceneSize.width}px`, height: `${sceneSize.height}px`, transform: `scale(${boardZoom})` }}
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) setSelectedEndpointId(null);
                    }}
                  >
                    <div className="absolute top-0 bottom-0 left-[92px] z-10 w-[18px] rounded-full border border-zinc-500/50 bg-gradient-to-b from-zinc-200 to-zinc-300 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]">
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-zinc-600">ORG L</div>
                    </div>
                    <div className="absolute top-0 bottom-0 z-10 w-[18px] rounded-full border border-zinc-500/50 bg-gradient-to-b from-zinc-200 to-zinc-300 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]" style={{ left: `${sceneSize.width - 101}px` }}>
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-zinc-600">ORG R</div>
                    </div>
                    <div className="relative z-10">
                    {entityOptions.map((entity) => {
                      const pos = nodePositions[entity.id] || { x: 24, y: 24 };
                      const entityEndpoints = endpointsByEntity[entity.id] || [];

                      if (entity.type === 'olt') {
                        const oltId = entity.id.replace('olt:', '');
                        const olt = currentPop.olts.find((item) => item.id === oltId);
                        if (!olt) return null;
                        return (
                          <div key={entity.id} className="absolute w-[760px] rounded-xl border border-zinc-900 bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[0_12px_28px_rgba(0,0,0,0.45)]" style={{ left: pos.x, top: pos.y }}>
                            <div className="h-4 rounded-t-xl bg-gradient-to-b from-zinc-900 to-zinc-700 cursor-move select-none" onMouseDown={(event) => { event.preventDefault(); startNodeDrag(entity.id, event); }} />
                            <div className="h-1.5 bg-zinc-800/85 shadow-inner" />
                            <div className="px-3 py-2 border-x-4 border-b border-zinc-900 font-semibold text-sm select-none text-zinc-800 bg-gradient-to-b from-white to-zinc-100">
                              OLT CHASSI - {entity.label}
                            </div>
                            <div className="px-3 py-2 border-x-4 border-b border-zinc-900 bg-gradient-to-b from-zinc-50 to-zinc-100">
                              <div className="text-[10px] text-zinc-600 mb-2">UPLINKS</div>
                              <div className="flex flex-wrap gap-2">
                                {entityEndpoints.filter((endpoint) => endpoint.endpointType === 'uplink').map((endpoint) => (
                                  <div key={endpoint.id} className="flex items-center gap-1 rounded border border-zinc-300 bg-white/90 px-1.5 py-1 shadow-sm">
                                    {renderPortButton(endpoint, `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                    <button
                                      type="button"
                                      className={`h-2.5 w-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
                                      onClick={() => endpoint.uplinkId && toggleOltUplink(currentPop.id, olt.id, endpoint.uplinkId)}
                                      title={endpoint.active ? 'Desativar uplink' : 'Ativar uplink'}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="p-2 space-y-2 border-x-4 border-b-4 border-zinc-900 rounded-b-lg bg-gradient-to-b from-zinc-100 to-zinc-200 max-h-[500px] overflow-y-auto">
                              {olt.slots.map((slot) => {
                                const slotEndpoints = entityEndpoints.filter((endpoint) => endpoint.endpointType === 'pon' && endpoint.slotId === slot.id);
                                return (
                                  <div key={slot.id} className="rounded-lg border border-zinc-400 bg-gradient-to-b from-white to-zinc-100 shadow-sm">
                                    <div className="px-2 py-1 border-b border-zinc-300 flex items-center justify-between text-xs font-semibold text-zinc-700">
                                      <span>Slot {slot.index.toString().padStart(2, '0')}</span>
                                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => addPonToOlt(currentPop.id, olt.id, slot.id)}>+ PON</Button>
                                    </div>
                                    <div className="p-2"><div className="flex flex-wrap gap-2">{slotEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex items-center gap-1 rounded border border-zinc-300 bg-white/90 px-1.5 py-1 shadow-sm">
                                        <button
                                          ref={(node) => { endpointRefs.current[endpoint.id] = node; }}
                                          type="button"
                                          onMouseDown={(event) => { event.preventDefault(); startEndpointDrag(endpoint.id, endpoint.active === false); }}
                                          onMouseUp={() => finishEndpointDrag(endpoint.id, endpoint.active === false)}
                                          className={`h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${
                                            endpoint.active
                                              ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500'
                                              : 'bg-zinc-200 border-zinc-500 text-zinc-500'
                                          }`}
                                          title={endpoint.label}
                                        >
                                          {getPortDisplay(endpoint)}
                                        </button>
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
                                <span>{accessEndpoints.length} PORTAS | {uplinkEndpoints.length} UPLINKS</span>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">PORTAS</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {accessEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2.5 w-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
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
                                        {renderPortButton(endpoint, `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2.5 w-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
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
                                <span>{wanEndpoints.length} WAN | {lanEndpoints.length} LAN</span>
                              </div>
                              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                                <div>
                                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">LAN</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {lanEndpoints.map((endpoint) => (
                                      <div key={endpoint.id} className="flex flex-col items-center gap-1">
                                        {renderPortButton(endpoint, `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2.5 w-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
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
                                        {renderPortButton(endpoint, `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`, getPortDisplay(endpoint))}
                                        <button
                                          type="button"
                                          className={`h-2.5 w-2.5 rounded-[2px] border ${endpoint.active ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-300 border-zinc-500'}`}
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
                              <div className="mb-2 text-[11px] font-semibold text-zinc-700">DIO - {entity.label}</div>
                              <div className="grid grid-cols-10 gap-1.5">
                                {entityEndpoints.map((endpoint) => renderPortButton(
                                  endpoint,
                                  `h-6 w-6 rounded-[3px] border p-0 text-[9px] font-bold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_3px_rgba(0,0,0,0.2)] ${endpoint.active ? 'bg-emerald-400 border-emerald-700 text-emerald-900 hover:bg-emerald-500' : 'bg-zinc-200 border-zinc-500 text-zinc-500'}`,
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
                      {currentPop.fusions.map((fusion, index) => {
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
                    {currentPop.fusions.map((fusion) => {
                      const start = getEndpointPosition(fusion.endpointAId);
                      const end = getEndpointPosition(fusion.endpointBId);
                      if (!start || !end) return null;
                      return (
                        <div key={`del-${fusion.id}`} className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1" style={{ left: (start.x + end.x) / 2, top: (start.y + end.y) / 2 }}>
                          {fusion.attenuation === 0 && <span className="px-1.5 h-5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 text-[9px] leading-5 shadow-sm">Direto 0 dB</span>}
                          <Button size="sm" variant="outline" className="h-5 px-1.5 text-[10px]" onClick={() => disconnectPopFusion(currentPop.id, fusion.id)}>x</Button>
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
    </Dialog>
  );
}
