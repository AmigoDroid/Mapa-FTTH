import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Box, Cable, City, Fiber, Pop, Position, ReservePoint } from '@/types/ftth';
import { BOX_ICONS, CABLE_MODEL_OPTIONS } from '@/types/ftth';
import { getFiberById, resolveNextFiberThroughPop } from '@/store/networkUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Map, Satellite } from 'lucide-react';

// Declaracao global para Leaflet
declare global {
  interface Window {
    L: any;
  }
}

interface NetworkMapProps {
  height?: string;
}

type ClickMode = 'normal' | 'addPop' | 'addBox' | 'addReserve' | 'addCable' | 'editCable';

interface PendingAttachToCable {
  cableId: string;
  position: Position;
  pathIndex: number;
}

interface NearestCableHit extends PendingAttachToCable {
  distancePx: number;
}

interface MapPointRequestDetail {
  requestId: string;
}

interface FiberTraceRequestDetail {
  fiberId: string;
  persist?: boolean;
}

interface EditCableRequestDetail {
  cableId: string;
}

interface StartMapCableDrawingDetail {
  name?: string;
  type?: Cable['type'];
  model?: string;
  fiberCount?: number;
  looseTubeCount?: number;
  fibersPerTube?: number;
  startPoint?: string;
  endPoint?: string;
}

interface FiberTraceSegment {
  id: string;
  points: Position[];
  color: string;
  delayMs: number;
}

export function NetworkMap({ height = 'calc(100vh - 80px)' }: NetworkMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersLayer = useRef<any>(null);
  const cablesLayer = useRef<any>(null);
  const fiberTraceLayer = useRef<any>(null);
  const tileLayer = useRef<any>(null);
  const tempPolylineRef = useRef<any>(null);
  const clickModeRef = useRef<ClickMode>('normal');
  const findNearestCableForPositionRef = useRef<(position: Position) => NearestCableHit | null>(() => null);
  const findNearestBoxForPositionRef = useRef<(position: Position) => Position | null>(() => null);
  const pendingMapPointRequestIdRef = useRef<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapPointPickActive, setMapPointPickActive] = useState(false);
  const [fiberTraceSegments, setFiberTraceSegments] = useState<FiberTraceSegment[]>([]);
  const [fiberTracePinned, setFiberTracePinned] = useState(false);
  
  const { 
    currentNetwork, 
    selectBox, 
    selectPop,
    addCity,
    addPop,
    addBox, 
    removeBox,
    addReserve,
    addCable,
    updateCable,
    isEditing,
    setEditing,
  } = useNetworkStore();

  const [showAddBox, setShowAddBox] = useState(false);
  const [showAddPop, setShowAddPop] = useState(false);
  const [showAddReserve, setShowAddReserve] = useState(false);
  const [showAddCable, setShowAddCable] = useState(false);
  const [newBoxPosition, setNewBoxPosition] = useState<Position | null>(null);
  const [newPopPosition, setNewPopPosition] = useState<Position | null>(null);
  const [newReservePosition, setNewReservePosition] = useState<Position | null>(null);
  const [newPopName, setNewPopName] = useState('');
  const [newPopCityId, setNewPopCityId] = useState('');
  const [newCityName, setNewCityName] = useState('');
  const [newCitySigla, setNewCitySigla] = useState('');
  const [newBoxType, setNewBoxType] = useState<'CEO' | 'CTO' | 'DIO'>('CTO');
  const [newBoxName, setNewBoxName] = useState('');
  const [newReserveName, setNewReserveName] = useState('');
  const [newBoxCapacity, setNewBoxCapacity] = useState(12);
  const [cableStartBox, setCableStartBox] = useState<string>('');
  const [cableEndBox, setCableEndBox] = useState<string>('');
  const [cableName, setCableName] = useState('');
  const [cableFiberCount, setCableFiberCount] = useState(12);
  const [cableType, setCableType] = useState<'drop' | 'distribution' | 'feeder' | 'backbone'>('distribution');
  const [cableModel, setCableModel] = useState('AS-80');
  const [looseTubeCount, setLooseTubeCount] = useState(1);
  const [fibersPerTube, setFibersPerTube] = useState(12);
  const [clickMode, setClickMode] = useState<ClickMode>('normal');
  const [mapView, setMapView] = useState<'street' | 'satellite'>('street');
  const [cableWaypoints, setCableWaypoints] = useState<Position[]>([]);
  const [editingCableId, setEditingCableId] = useState<string>('');
  const [pendingAttach, setPendingAttach] = useState<PendingAttachToCable | null>(null);

  const maxFiberCapacity = Math.max(1, looseTubeCount * fibersPerTube);
  const availableModels = CABLE_MODEL_OPTIONS.filter((item) => item.category === cableType);
  const cableEndpointSummary = cableStartBox && cableEndBox ? 'cabo com origem e destino' : 'cabo livre';
  const cableEndpointOptions = useMemo(
    () => [
      ...((currentNetwork?.boxes || []).map((box) => ({
        id: box.id,
        label: `${box.name} (Caixa ${box.type})`,
      }))),
      ...((currentNetwork?.pops || []).map((pop) => ({
        id: pop.id,
        label: `${pop.name} (POP)`,
      }))),
    ],
    [currentNetwork?.boxes, currentNetwork?.pops]
  );

  const resolveNetworkEndpointById = useCallback((endpointId: string) => {
    if (!endpointId) return null;
    const box = currentNetwork?.boxes.find((item) => item.id === endpointId);
    if (box) {
      return { id: box.id, name: box.name, position: box.position, kind: 'box' as const };
    }
    const pop = (currentNetwork?.pops || []).find((item) => item.id === endpointId);
    if (pop) {
      return { id: pop.id, name: pop.name, position: pop.position, kind: 'pop' as const };
    }
    return null;
  }, [currentNetwork?.boxes, currentNetwork?.pops]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.some((item) => item.id === cableModel)) {
      setCableModel(availableModels[0]!.id);
    }
  }, [availableModels, cableModel]);

  useEffect(() => {
    if (cableFiberCount > maxFiberCapacity) {
      setCableFiberCount(maxFiberCapacity);
    }
  }, [cableFiberCount, maxFiberCapacity]);

  useEffect(() => {
    // Keep default fiber count aligned with the current loose-tube capacity when possible.
    if (cableFiberCount <= 12 && maxFiberCapacity >= 12) {
      setCableFiberCount(12);
      return;
    }
    if (cableFiberCount < maxFiberCapacity && cableFiberCount > 0) return;
    setCableFiberCount(maxFiberCapacity);
  }, [maxFiberCapacity, cableFiberCount]);

  const getRenderedCablePoints = useCallback((cable: Cable) => {
    const startEndpoint = cable.startPoint ? resolveNetworkEndpointById(cable.startPoint) : null;
    const endEndpoint = cable.endPoint ? resolveNetworkEndpointById(cable.endPoint) : null;
    if (cable.path.length > 0) {
      return cable.path.map((p) => ({ lat: p.lat, lng: p.lng }));
    }
    if (startEndpoint && endEndpoint) {
      return [startEndpoint.position, endEndpoint.position];
    }
    return [];
  }, [resolveNetworkEndpointById]);

  const isSamePosition = useCallback((a: Position, b: Position, epsilon: number = 0.000001) => {
    return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
  }, []);

  const buildAnchoredPath = useCallback(
    (waypoints: Position[], start?: Position, end?: Position): Position[] => {
      const next = [...waypoints];
      if (start) {
        if (next.length === 0 || !isSamePosition(next[0]!, start)) {
          next.unshift(start);
        } else {
          next[0] = start;
        }
      }
      if (end) {
        if (next.length === 0 || !isSamePosition(next[next.length - 1]!, end)) {
          next.push(end);
        } else {
          next[next.length - 1] = end;
        }
      }
      return next;
    },
    [isSamePosition]
  );

  const extractEditableWaypoints = useCallback(
    (path: Position[], start?: Position, end?: Position): Position[] => {
      let next = [...path];
      if (start && next.length > 0 && isSamePosition(next[0]!, start)) {
        next = next.slice(1);
      }
      if (end && next.length > 0 && isSamePosition(next[next.length - 1]!, end)) {
        next = next.slice(0, -1);
      }
      return next;
    },
    [isSamePosition]
  );

  const findNearestCableForPosition = useCallback((position: Position): NearestCableHit | null => {
    if (!leafletMap.current || !currentNetwork?.cables?.length) return null;
    const L = window.L;
    if (!L) return null;

    const map = leafletMap.current;
    const clickPoint = map.latLngToLayerPoint([position.lat, position.lng]);
    let bestHit: NearestCableHit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cable of currentNetwork.cables) {
      const points = getRenderedCablePoints(cable);
      if (points.length < 2) continue;

      for (let i = 0; i < points.length - 1; i++) {
        const a = map.latLngToLayerPoint([points[i]!.lat, points[i]!.lng]);
        const b = map.latLngToLayerPoint([points[i + 1]!.lat, points[i + 1]!.lng]);
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const ab2 = abx * abx + aby * aby;
        if (ab2 === 0) continue;
        const apx = clickPoint.x - a.x;
        const apy = clickPoint.y - a.y;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const projX = a.x + t * abx;
        const projY = a.y + t * aby;
        const dx = clickPoint.x - projX;
        const dy = clickPoint.y - projY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < bestDistance) {
          const nearestLatLng = map.layerPointToLatLng(L.point(projX, projY));
          const pathIndex = i + 1;
          bestHit = {
            cableId: cable.id,
            position: { lat: nearestLatLng.lat, lng: nearestLatLng.lng },
            pathIndex,
            distancePx: dist,
          };
          bestDistance = dist;
        }
      }
    }

    if (!bestHit || bestHit.distancePx > 18) return null;
    return bestHit;
  }, [currentNetwork?.cables, getRenderedCablePoints]);

  const findNearestBoxForPosition = useCallback((position: Position): Position | null => {
    if (!leafletMap.current || !currentNetwork?.boxes?.length) return null;
    const map = leafletMap.current;
    const clickPoint = map.latLngToLayerPoint([position.lat, position.lng]);

    let nearest: Position | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const box of currentNetwork.boxes) {
      const boxPoint = map.latLngToLayerPoint([box.position.lat, box.position.lng]);
      const dx = clickPoint.x - boxPoint.x;
      const dy = clickPoint.y - boxPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDistance) {
        bestDistance = dist;
        nearest = box.position;
      }
    }

    return bestDistance <= 16 ? nearest : null;
  }, [currentNetwork?.boxes]);

  useEffect(() => {
    findNearestCableForPositionRef.current = findNearestCableForPosition;
  }, [findNearestCableForPosition]);

  useEffect(() => {
    findNearestBoxForPositionRef.current = findNearestBoxForPosition;
  }, [findNearestBoxForPosition]);

  const attachEntityToCablePath = useCallback((cableId: string, entity: { kind: 'box' | 'reserve'; id: string; name: string }, anchor: { position: Position; pathIndex: number }) => {
    const cable = currentNetwork?.cables.find((item) => item.id === cableId);
    if (!cable) return;

    const nextPath = [...(cable.path || [])];
    const insertIndex = Math.max(0, Math.min(anchor.pathIndex, nextPath.length));
    nextPath.splice(insertIndex, 0, anchor.position);

    const shiftedAttachments = (cable.attachments || []).map((attachment) => ({
      ...attachment,
      pathIndex: attachment.pathIndex >= insertIndex ? attachment.pathIndex + 1 : attachment.pathIndex,
    }));

    const attachments = [
      ...shiftedAttachments.filter(
        (attachment) => !(attachment.kind === entity.kind && attachment.entityId === entity.id)
      ),
      {
        id: `${entity.kind}:${entity.id}:${Date.now()}`,
        kind: entity.kind,
        entityId: entity.id,
        name: entity.name,
        position: anchor.position,
        pathIndex: insertIndex,
      },
    ];

    updateCable(cableId, { path: nextPath, attachments });
  }, [currentNetwork?.cables, updateCable]);

  useEffect(() => {
    const handlePointRequest = (event: Event) => {
      const custom = event as CustomEvent<MapPointRequestDetail>;
      if (!custom.detail?.requestId) return;
      pendingMapPointRequestIdRef.current = custom.detail.requestId;
      setMapPointPickActive(true);
      setClickMode('normal');
    };

    window.addEventListener('ftth:request-map-point', handlePointRequest as EventListener);
    return () => {
      window.removeEventListener('ftth:request-map-point', handlePointRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    const buildFiberTraceSegments = (fiberId: string): FiberTraceSegment[] => {
      if (!currentNetwork) return [];
      const visited = new Set<string>();
      const segments: FiberTraceSegment[] = [];
      let currentFiberId: string | undefined = fiberId;
      let step = 0;

      while (currentFiberId && !visited.has(currentFiberId)) {
        visited.add(currentFiberId);

        let ownerCable: Cable | undefined;
        let ownerFiber: Fiber | undefined;
        for (const cable of currentNetwork.cables) {
          const match = cable.fibers.find((fiber) => fiber.id === currentFiberId);
          if (match) {
            ownerCable = cable;
            ownerFiber = match;
            break;
          }
        }

        if (ownerCable && ownerFiber) {
          const points = getRenderedCablePoints(ownerCable);
          if (points.length >= 2) {
            segments.push({
              id: `${ownerCable.id}:${ownerFiber.id}:${step}`,
              points,
              color: ownerFiber.color.hex,
              delayMs: step * 260,
            });
          }
        }

        const nextFiber = getFiberById(currentNetwork, currentFiberId);
        if (nextFiber?.connectedTo && nextFiber?.fusionId) {
          currentFiberId = nextFiber.connectedTo;
          step += 1;
          continue;
        }

        const popHop = resolveNextFiberThroughPop(currentNetwork, currentFiberId);
        if (!popHop) break;

        const pop = (currentNetwork.pops || []).find((item) => item.id === popHop.popId);
        if (pop) {
          const pulseWidth = 0.00008;
          segments.push({
            id: `pop:${pop.id}:${currentFiberId}:${step}`,
            points: [
              { lat: pop.position.lat, lng: pop.position.lng },
              { lat: pop.position.lat + pulseWidth, lng: pop.position.lng + pulseWidth },
            ],
            color: ownerFiber?.color.hex || '#38bdf8',
            delayMs: step * 260,
          });
        }

        currentFiberId = popHop.nextFiberId;
        step += 1;
      }

      return segments;
    };

    const handleTraceFiber = (event: Event) => {
      const custom = event as CustomEvent<FiberTraceRequestDetail>;
      if (!custom.detail?.fiberId) return;
      setFiberTracePinned(Boolean(custom.detail.persist));
      setFiberTraceSegments(buildFiberTraceSegments(custom.detail.fiberId));
    };

    const handleClearTrace = () => {
      setFiberTracePinned(false);
      setFiberTraceSegments([]);
    };

    window.addEventListener('ftth:trace-fiber', handleTraceFiber as EventListener);
    window.addEventListener('ftth:trace-clear', handleClearTrace as EventListener);
    return () => {
      window.removeEventListener('ftth:trace-fiber', handleTraceFiber as EventListener);
      window.removeEventListener('ftth:trace-clear', handleClearTrace as EventListener);
    };
  }, [currentNetwork, getRenderedCablePoints]);

  useEffect(() => {
    if (!isMapReady || !fiberTraceLayer.current) return;
    const L = window.L;
    if (!L) return;

    fiberTraceLayer.current.clearLayers();
    if (fiberTraceSegments.length === 0) return;

    fiberTraceSegments.forEach((segment) => {
      const tracePath = segment.points.map((point) => [point.lat, point.lng]);
      if (tracePath.length < 2) return;

      const glow = L.polyline(tracePath, {
        color: segment.color,
        weight: 14,
        opacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'map-fiber-trace-glow',
      }).addTo(fiberTraceLayer.current);

      const core = L.polyline(tracePath, {
        color: segment.color,
        weight: 8,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'map-fiber-trace-line',
      }).addTo(fiberTraceLayer.current);

      const coreElement = core.getElement?.() as SVGElement | undefined;
      if (coreElement) {
        coreElement.style.animationDelay = `${segment.delayMs}ms`;
      }
      const glowElement = glow.getElement?.() as SVGElement | undefined;
      if (glowElement) {
        glowElement.style.animationDelay = `${segment.delayMs}ms`;
      }
    });

    if (fiberTracePinned) return;

    const maxDelay = Math.max(...fiberTraceSegments.map((segment) => segment.delayMs), 0);
    const timer = window.setTimeout(() => {
      setFiberTraceSegments([]);
    }, maxDelay + 2600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fiberTraceSegments, fiberTracePinned, isMapReady]);

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    
    const L = window.L;
    if (!L) {
      console.error('Leaflet not loaded');
      return;
    }

    // Criar mapa centrado no Brasil
    const map = L.map(mapRef.current).setView([-15.7975, -47.8919], 13);
    
    // Adicionar camada de tiles
    tileLayer.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Camadas para marcadores e cabos
    markersLayer.current = L.layerGroup().addTo(map);
    cablesLayer.current = L.layerGroup().addTo(map);
    fiberTraceLayer.current = L.layerGroup().addTo(map);

    leafletMap.current = map;
    setIsMapReady(true);

    // Evento de clique no mapa
    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      const pendingRequestId = pendingMapPointRequestIdRef.current;

      if (pendingRequestId) {
        window.dispatchEvent(
          new CustomEvent('ftth:map-point-selected', {
            detail: {
              requestId: pendingRequestId,
              position: { lat, lng },
            },
          })
        );
        pendingMapPointRequestIdRef.current = null;
        setMapPointPickActive(false);
        return;
      }
      
      if (clickModeRef.current === 'addBox') {
        const clickPosition = { lat, lng };
        const nearest = findNearestCableForPositionRef.current(clickPosition);
        setPendingAttach(nearest ? { cableId: nearest.cableId, position: nearest.position, pathIndex: nearest.pathIndex } : null);
        setNewBoxPosition(nearest ? nearest.position : clickPosition);
        setShowAddBox(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addPop') {
        setNewPopPosition({ lat, lng });
        setShowAddPop(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addReserve') {
        const clickPosition = { lat, lng };
        const nearest = findNearestCableForPositionRef.current(clickPosition);
        setPendingAttach(nearest ? { cableId: nearest.cableId, position: nearest.position, pathIndex: nearest.pathIndex } : null);
        setNewReservePosition(nearest ? nearest.position : clickPosition);
        setShowAddReserve(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addCable' || clickModeRef.current === 'editCable') {
        const clickPosition = { lat, lng };
        const snapped = findNearestBoxForPositionRef.current(clickPosition);
        setCableWaypoints((prev: Position[]) => [...prev, snapped || clickPosition]);
      }
    });

    return () => {
      map.remove();
      leafletMap.current = null;
      tileLayer.current = null;
      tempPolylineRef.current = null;
      fiberTraceLayer.current = null;
    };
  }, []);

  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);

  useEffect(() => {
    if (!leafletMap.current) return;
    const L = window.L;
    if (!L) return;

    if (tileLayer.current) {
      leafletMap.current.removeLayer(tileLayer.current);
    }

    if (mapView === 'satellite') {
      tileLayer.current = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri',
          maxZoom: 19,
        }
      );
    } else {
      tileLayer.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      });
    }

    tileLayer.current.addTo(leafletMap.current);
  }, [mapView]);

  useEffect(() => {
    if (!leafletMap.current) return;
    const L = window.L;
    if (!L) return;

    const isDrawingMode = clickMode === 'addCable' || clickMode === 'editCable';
    if (!isDrawingMode) {
      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
        tempPolylineRef.current = null;
      }
      return;
    }

    const startBoxId = clickMode === 'editCable'
      ? currentNetwork?.cables.find((c: any) => c.id === editingCableId)?.startPoint
      : cableStartBox;
    const endBoxId = clickMode === 'editCable'
      ? currentNetwork?.cables.find((c: any) => c.id === editingCableId)?.endPoint
      : cableEndBox;

    const startEndpoint = startBoxId ? resolveNetworkEndpointById(startBoxId) : null;
    const endEndpoint = endBoxId ? resolveNetworkEndpointById(endBoxId) : null;
    const pathPoints = [
      ...(startEndpoint ? [[startEndpoint.position.lat, startEndpoint.position.lng]] : []),
      ...cableWaypoints.map((p) => [p.lat, p.lng]),
      ...(endEndpoint ? [[endEndpoint.position.lat, endEndpoint.position.lng]] : []),
    ];

    if (pathPoints.length < 2) {
      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
        tempPolylineRef.current = null;
      }
      return;
    }

    if (tempPolylineRef.current) {
      tempPolylineRef.current.setLatLngs(pathPoints);
    } else {
      tempPolylineRef.current = L.polyline(pathPoints, {
        color: clickMode === 'editCable' ? '#f97316' : '#2563eb',
        weight: 4,
        opacity: 0.85,
        dashArray: '6, 8',
        className: 'map-3d-draft-line',
      }).addTo(leafletMap.current);
    }
  }, [clickMode, cableWaypoints, cableStartBox, cableEndBox, editingCableId, currentNetwork?.cables, resolveNetworkEndpointById]);

  useEffect(() => {
    if (clickMode === 'addCable' || clickMode === 'editCable') return;
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
  }, [clickMode]);

  // Criar icone personalizado para caixa
  const createBoxIcon = useCallback((type: 'CEO' | 'CTO' | 'DIO', status: string) => {
    const L = window.L;
    const config = BOX_ICONS[type];
    const color = status === 'active' ? config.color : '#999999';
    
    return L.divIcon({
      className: 'custom-box-marker',
      html: `
        <div class="map-marker-3d map-marker-box" style="
          width: ${config.size}px;
          height: ${config.size}px;
          background: linear-gradient(145deg, #ffffff 0%, ${color} 45%, ${color} 100%);
          border: 3px solid white;
          border-radius: ${type === 'CEO' ? '4px' : type === 'CTO' ? '8px' : '50%'};
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 18px rgba(0,0,0,0.34), inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -5px 10px rgba(0,0,0,0.22);
          transform: perspective(180px) rotateX(12deg) translateZ(0);
          cursor: pointer;
        ">
          <svg width="${config.size * 0.6}" height="${config.size * 0.6}" viewBox="0 0 24 24" fill="white">
            ${type === 'CEO' ? '<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h6" stroke="currentColor" stroke-width="2"/>' : 
              type === 'CTO' ? '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h8" stroke="currentColor" stroke-width="2"/>' :
              '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="2"/>'}
          </svg>
        </div>
      `,
      iconSize: [config.size, config.size],
      iconAnchor: [config.size / 2, config.size / 2],
    });
  }, []);

  const handleStartEditCablePath = useCallback((cableId: string) => {
    if (!currentNetwork) return;
    const cable = currentNetwork.cables.find((item) => item.id === cableId);
    if (!cable) return;
    const startEndpoint = cable.startPoint ? resolveNetworkEndpointById(cable.startPoint) : null;
    const endEndpoint = cable.endPoint ? resolveNetworkEndpointById(cable.endPoint) : null;
    setEditingCableId(cable.id);
    setCableStartBox(cable.startPoint);
    setCableEndBox(cable.endPoint);
    setCableType(cable.type);
    setCableModel(cable.model || 'AS-80');
    setLooseTubeCount(cable.looseTubeCount || 1);
    setFibersPerTube(cable.fibersPerTube || 12);
    setCableFiberCount(cable.fiberCount);
    setCableWaypoints(extractEditableWaypoints(cable.path || [], startEndpoint?.position, endEndpoint?.position));
    setShowAddCable(false);
    setClickMode('editCable');
  }, [currentNetwork, extractEditableWaypoints, resolveNetworkEndpointById]);

  useEffect(() => {
    const tryOpenCableForEdit = (cableId: string, attemptsLeft: number) => {
      const cableExists = (currentNetwork?.cables || []).some((cable) => cable.id === cableId);
      if (cableExists) {
        handleStartEditCablePath(cableId);
        return;
      }
      if (attemptsLeft <= 0) return;
      window.setTimeout(() => tryOpenCableForEdit(cableId, attemptsLeft - 1), 120);
    };

    const handleEditCableRequest = (event: Event) => {
      const custom = event as CustomEvent<EditCableRequestDetail>;
      if (!custom.detail?.cableId) return;
      tryOpenCableForEdit(custom.detail.cableId, 8);
    };

    window.addEventListener('ftth:edit-cable-path', handleEditCableRequest as EventListener);
    return () => {
      window.removeEventListener('ftth:edit-cable-path', handleEditCableRequest as EventListener);
    };
  }, [currentNetwork?.cables, handleStartEditCablePath]);

  useEffect(() => {
    const handleStartMapCableDrawing = (event: Event) => {
      const custom = event as CustomEvent<StartMapCableDrawingDetail>;
      const detail = custom.detail;
      if (!detail) return;

      const nextType = detail.type || 'distribution';
      const nextLooseTubeCount = Math.max(1, detail.looseTubeCount || 1);
      const nextFibersPerTube = Math.max(1, detail.fibersPerTube || 12);
      const nextFiberCapacity = nextLooseTubeCount * nextFibersPerTube;
      const nextFiberCount = Math.max(1, Math.min(detail.fiberCount || 12, nextFiberCapacity));

      setEditingCableId('');
      setShowAddCable(false);
      setCableWaypoints([]);
      setCableName(detail.name || '');
      setCableType(nextType);
      setCableModel(detail.model || CABLE_MODEL_OPTIONS.find((item) => item.category === nextType)?.id || 'AS-80');
      setLooseTubeCount(nextLooseTubeCount);
      setFibersPerTube(nextFibersPerTube);
      setCableFiberCount(nextFiberCount);
      setCableStartBox(detail.startPoint || '');
      setCableEndBox(detail.endPoint || '');
      setClickMode('addCable');

      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
        tempPolylineRef.current = null;
      }
    };

    window.addEventListener('ftth:start-map-cable-drawing', handleStartMapCableDrawing as EventListener);
    return () => {
      window.removeEventListener('ftth:start-map-cable-drawing', handleStartMapCableDrawing as EventListener);
    };
  }, []);

  // Atualizar marcadores no mapa
  useEffect(() => {
    if (!isMapReady || !markersLayer.current) return;
    
    const L = window.L;
    markersLayer.current.clearLayers();

    (currentNetwork?.pops || []).forEach((pop: Pop) => {
      const popIcon = L.divIcon({
        className: 'custom-pop-marker',
        html: `
          <div class="map-marker-3d map-marker-pop" style="
            width: 26px;
            height: 26px;
            background: linear-gradient(145deg, #efe7ff 0%, #7c3aed 55%, #5b21b6 100%);
            border: 2px solid white;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 9px 16px rgba(0,0,0,0.34), inset 0 2px 3px rgba(255,255,255,0.45), inset 0 -5px 10px rgba(0,0,0,0.2);
            transform: perspective(180px) rotateX(12deg) translateZ(0);
            color: white;
            font-size: 10px;
            font-weight: 700;
          ">POP</div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      const marker = L.marker([pop.position.lat, pop.position.lng], { icon: popIcon });
      const city = (currentNetwork?.cities || []).find((item: City) => item.id === pop.cityId);
      marker.bindPopup(`
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${pop.name}</h3>
          <p style="margin: 4px 0;"><strong>Cidade:</strong> ${city ? `${city.sigla} - ${city.name}` : 'N/A'}</p>
          <p style="margin: 4px 0;"><strong>DIO:</strong> ${(pop.dios || []).length}</p>
          <p style="margin: 4px 0;"><strong>OLT:</strong> ${(pop.olts || []).length}</p>
        </div>
      `, { className: 'map-3d-popup' });
      marker.on('click', () => {
        selectPop(pop);
      });
      marker.addTo(markersLayer.current);
    });

    currentNetwork?.boxes.forEach((box: Box) => {
      const marker = L.marker([box.position.lat, box.position.lng], {
        icon: createBoxIcon(box.type, box.status),
      });

      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${box.name}</h3>
          <p style="margin: 4px 0;"><strong>Tipo:</strong> ${box.type}</p>
          <p style="margin: 4px 0;"><strong>Capacidade:</strong> ${box.capacity} fibras</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${box.status}</p>
          <p style="margin: 4px 0;"><strong>Fibras usadas:</strong> ${box.fibers.filter((f) => f.status === 'active').length}</p>
          ${box.address ? `<p style="margin: 4px 0;"><strong>Endereco:</strong> ${box.address}</p>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent, { className: 'map-3d-popup' });
      
      marker.on('click', () => {
        selectBox(box);
      });

      marker.on('contextmenu', (e: any) => {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.gap = '8px';

        const editButton = document.createElement('button');
        editButton.textContent = 'Editar';
        editButton.style.padding = '4px 8px';
        editButton.onclick = () => {
          selectBox(box);
          setEditing(true);
          leafletMap.current?.closePopup();
        };

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Excluir';
        deleteButton.style.padding = '4px 8px';
        deleteButton.style.background = '#ff4444';
        deleteButton.style.color = 'white';
        deleteButton.onclick = () => {
          if (window.confirm('Tem certeza que deseja excluir esta caixa?')) {
            removeBox(box.id);
          }
          leafletMap.current?.closePopup();
        };

        container.appendChild(editButton);
        container.appendChild(deleteButton);

        L.popup()
          .setLatLng(e.latlng)
          .setContent(container)
          .openOn(leafletMap.current);
      });

      marker.addTo(markersLayer.current);
    });

    (currentNetwork?.reserves || []).forEach((reserve: ReservePoint) => {
      const reserveIcon = L.divIcon({
        className: 'custom-reserve-marker',
        html: `
          <div class="map-marker-3d map-marker-reserve" style="
            width: 22px;
            height: 22px;
            background: linear-gradient(145deg, #fff5cc 0%, #ca8a04 60%, #a16207 100%);
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 14px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.5), inset 0 -4px 8px rgba(0,0,0,0.2);
            transform: perspective(180px) rotateX(12deg) translateZ(0);
            color: white;
            font-size: 12px;
            font-weight: 700;
          ">R</div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const marker = L.marker([reserve.position.lat, reserve.position.lng], { icon: reserveIcon });
      marker.bindPopup(`
        <div style="min-width: 160px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${reserve.name}</h3>
          <p style="margin: 4px 0;"><strong>Tipo:</strong> Reserva</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${reserve.status}</p>
        </div>
      `, { className: 'map-3d-popup' });
      marker.addTo(markersLayer.current);
    });
  }, [currentNetwork?.boxes, currentNetwork?.reserves, currentNetwork?.pops, currentNetwork?.cities, isMapReady, createBoxIcon, selectBox, selectPop, setEditing, removeBox]);

  // Atualizar cabos no mapa
  useEffect(() => {
    if (!isMapReady || !cablesLayer.current) return;
    
    const L = window.L;
    cablesLayer.current.clearLayers();

    currentNetwork?.cables.forEach((cable: Cable) => {
      const startEndpoint = cable.startPoint ? resolveNetworkEndpointById(cable.startPoint) : null;
      const endEndpoint = cable.endPoint ? resolveNetworkEndpointById(cable.endPoint) : null;

      const path = cable.path.length > 0
        ? cable.path.map((p) => [p.lat, p.lng])
        : startEndpoint && endEndpoint
          ? [[startEndpoint.position.lat, startEndpoint.position.lng], [endEndpoint.position.lat, endEndpoint.position.lng]]
          : [];
      if (path.length < 2) return;

      const cableBaseWeight = cable.type === 'backbone' ? 6 : cable.type === 'feeder' ? 5 : cable.type === 'distribution' ? 4 : 2;

      const cableGlow = L.polyline(path, {
        color: cable.status === 'active' ? '#86efac' : '#cbd5e1',
        weight: cableBaseWeight + 6,
        opacity: 0.3,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'map-3d-cable-glow',
      });

      const polyline = L.polyline(path, {
        color: cable.status === 'active' ? '#00AA00' : '#999999',
        weight: cableBaseWeight,
        opacity: 0.8,
        dashArray: cable.status === 'projected' ? '10, 10' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'map-3d-cable-core',
      });

      polyline.bindPopup(`
        <div style="min-width: 180px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${cable.name}</h3>
          <p style="margin: 4px 0;"><strong>Tipo:</strong> ${cable.type}</p>
          <p style="margin: 4px 0;"><strong>Modelo:</strong> ${cable.model || 'N/A'}</p>
          <p style="margin: 4px 0;"><strong>Fibras:</strong> ${cable.fiberCount}</p>
          <p style="margin: 4px 0;"><strong>Tubos loose:</strong> ${cable.looseTubeCount || 1}</p>
          <p style="margin: 4px 0;"><strong>Fibras por tubo:</strong> ${cable.fibersPerTube || 12}</p>
          <p style="margin: 4px 0;"><strong>Comprimento:</strong> ${cable.length}m</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${cable.status}</p>
          <p style="margin: 4px 0;"><strong>Origem:</strong> ${startEndpoint?.name || 'Nao definida'}</p>
          <p style="margin: 4px 0;"><strong>Destino:</strong> ${endEndpoint?.name || 'Nao definido'}</p>
          <button data-edit-cable-id="${cable.id}" style="margin-top: 8px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
            Editar tracado
          </button>
        </div>
      `, { className: 'map-3d-popup' });

      polyline.on('popupopen', (event: any) => {
        const popupElement = event.popup?.getElement?.() as HTMLElement | undefined;
        const button = popupElement?.querySelector<HTMLButtonElement>(`button[data-edit-cable-id="${cable.id}"]`);
        if (!button) return;
        button.onclick = () => {
          handleStartEditCablePath(cable.id);
          leafletMap.current?.closePopup();
        };
      });

      cableGlow.addTo(cablesLayer.current);
      polyline.addTo(cablesLayer.current);
    });
  }, [currentNetwork?.cables, isMapReady, handleStartEditCablePath, resolveNetworkEndpointById]);

  // Handlers para adicionar caixa
  const handleAddBox = () => {
    if (!newBoxPosition || !newBoxName) return;
    
    const created = addBox({
      name: newBoxName,
      type: newBoxType,
      position: newBoxPosition,
      capacity: newBoxCapacity,
      status: 'active',
    });

    if (pendingAttach) {
      attachEntityToCablePath(pendingAttach.cableId, { kind: 'box', id: created.id, name: created.name }, { position: pendingAttach.position, pathIndex: pendingAttach.pathIndex });
    }
    
    setShowAddBox(false);
    setNewBoxName('');
    setNewBoxPosition(null);
    setPendingAttach(null);
  };

  const handleAddPop = () => {
    if (!newPopPosition || !newPopName.trim()) return;
    let cityId = newPopCityId;
    if (!cityId && newCityName.trim() && newCitySigla.trim()) {
      const city = addCity({
        name: newCityName.trim(),
        sigla: newCitySigla.trim().toUpperCase(),
      });
      cityId = city.id;
    }
    if (!cityId) return;

    addPop({
      cityId,
      name: newPopName.trim(),
      position: newPopPosition,
      status: 'active',
    });

    setShowAddPop(false);
    setNewPopName('');
    setNewPopPosition(null);
    setNewPopCityId('');
    setNewCityName('');
    setNewCitySigla('');
  };

  const handleAddReserve = () => {
    if (!newReservePosition || !newReserveName.trim()) return;
    const created = addReserve({
      name: newReserveName.trim(),
      position: newReservePosition,
      status: 'active',
    });

    if (pendingAttach) {
      attachEntityToCablePath(pendingAttach.cableId, { kind: 'reserve', id: created.id, name: created.name }, { position: pendingAttach.position, pathIndex: pendingAttach.pathIndex });
    }

    setShowAddReserve(false);
    setNewReserveName('');
    setNewReservePosition(null);
    setPendingAttach(null);
  };

  // Handlers para adicionar cabo
  const handleAddCable = () => {
    const startEndpoint = cableStartBox ? resolveNetworkEndpointById(cableStartBox) : null;
    const endEndpoint = cableEndBox ? resolveNetworkEndpointById(cableEndBox) : null;
    if (cableWaypoints.length < 2 && (!startEndpoint || !endEndpoint)) return;
    const anchoredPath = buildAnchoredPath(cableWaypoints, startEndpoint?.position, endEndpoint?.position);

    addCable({
      name: cableName.trim() || (startEndpoint && endEndpoint ? `Cabo ${startEndpoint.name} -> ${endEndpoint.name}` : `Cabo Livre ${new Date().toLocaleTimeString('pt-BR')}`),
      type: cableType,
      model: cableModel,
      fiberCount: cableFiberCount,
      looseTubeCount,
      fibersPerTube,
      startPoint: cableStartBox || '',
      endPoint: cableEndBox || '',
      path: anchoredPath,
      length: calculateCableLength(anchoredPath),
      status: 'active',
      color: '#00AA00',
    });
    
    setShowAddCable(false);
    setCableName('');
    setCableStartBox('');
    setCableEndBox('');
    setLooseTubeCount(1);
    setFibersPerTube(12);
    setCableFiberCount(12);
    setCableModel(CABLE_MODEL_OPTIONS.find((item) => item.category === 'distribution')?.id || 'AS-80');
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
    setClickMode('normal');
  };

  const calculateCableLength = (waypoints: Position[], start?: Position, end?: Position): number => {
    const points = [
      ...(start ? [start] : []),
      ...waypoints,
      ...(end ? [end] : []),
    ];
    if (points.length < 2) return 0;
    let length = 0;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const R = 6371000; // Raio da Terra em metros
      const dLat = (curr.lat - prev.lat) * Math.PI / 180;
      const dLon = (curr.lng - prev.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(prev.lat * Math.PI / 180) * Math.cos(curr.lat * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      length += R * c;
    }
    
    return Math.round(length);
  };

  const handleUndoLastWaypoint = () => {
    setCableWaypoints((prev) => prev.slice(0, -1));
  };

  const handleClearWaypoints = () => {
    setCableWaypoints([]);
  };

  const handleCancelEditCablePath = () => {
    setEditingCableId('');
    setCableWaypoints([]);
    setClickMode('normal');
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
  };

  const handleSaveEditedCablePath = () => {
    if (!currentNetwork || !editingCableId) return;
    const cable = currentNetwork.cables.find((item) => item.id === editingCableId);
    if (!cable) return;
    const startEndpoint = cable.startPoint ? resolveNetworkEndpointById(cable.startPoint) : null;
    const endEndpoint = cable.endPoint ? resolveNetworkEndpointById(cable.endPoint) : null;
    const anchoredPath = buildAnchoredPath(cableWaypoints, startEndpoint?.position, endEndpoint?.position);

    updateCable(cable.id, {
      path: anchoredPath,
      length: calculateCableLength(anchoredPath),
    });

    handleCancelEditCablePath();
  };

  // Expor funcoes para o popup
  return (
    <div className="relative w-full">
      {/* Barra de ferramentas */}
      <div className="absolute top-4 left-4 z-[1000] flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMapView(mapView === 'street' ? 'satellite' : 'street')}
          className="shadow-lg"
        >
          {mapView === 'street' ? (
            <>
              <Satellite className="w-4 h-4 mr-1" />
              Satelite
            </>
          ) : (
            <>
              <Map className="w-4 h-4 mr-1" />
              Mapa
            </>
          )}
        </Button>

        <Button
          variant={clickMode === 'addPop' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setClickMode(clickMode === 'addPop' ? 'normal' : 'addPop')}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addPop' ? 'Cancelar' : 'Adicionar POP'}
        </Button>

        <Button
          variant={clickMode === 'addBox' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setClickMode(clickMode === 'addBox' ? 'normal' : 'addBox')}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addBox' ? 'Cancelar' : 'Adicionar Caixa'}
        </Button>

        <Button
          variant={clickMode === 'addReserve' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => setClickMode(clickMode === 'addReserve' ? 'normal' : 'addReserve')}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addReserve' ? 'Cancelar' : 'Adicionar Reserva'}
        </Button>
        
        <Button
          variant={clickMode === 'addCable' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            if (clickMode === 'editCable') {
              handleCancelEditCablePath();
            }
            if (clickMode === 'addCable') {
              setClickMode('normal');
              setCableWaypoints([]);
              setShowAddCable(false);
              if (tempPolylineRef.current) {
                tempPolylineRef.current.remove();
                tempPolylineRef.current = null;
              }
            } else {
              setShowAddCable(false);
              setCableName('');
              setCableStartBox('');
              setCableEndBox('');
              setCableType('distribution');
              setCableModel('AS-80');
              setLooseTubeCount(1);
              setFibersPerTube(12);
              setCableFiberCount(12);
              setClickMode('addCable');
            }
          }}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addCable' ? 'Cancelar' : 'Adicionar Cabo'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing(!isEditing)}
          className="shadow-lg"
        >
          <Edit className="w-4 h-4 mr-1" />
          {isEditing ? 'Concluir' : 'Editar'}
        </Button>
      </div>

      {/* InformacÃµes da rede */}
      {currentNetwork && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <h3 className="font-bold text-sm">{currentNetwork.name}</h3>
          <div className="text-xs text-gray-600 mt-1">
            <p>Caixas: {currentNetwork.boxes.length}</p>
            <p>Reservas: {(currentNetwork.reserves || []).length}</p>
            <p>Cabos: {currentNetwork.cables.length}</p>
            <p>Fusoes: {currentNetwork.fusions.length}</p>
          </div>
        </div>
      )}

      {(clickMode === 'addCable' || clickMode === 'editCable') && (
        <div className="absolute left-4 bottom-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border w-[320px]">
          <h4 className="text-sm font-semibold">
            {clickMode === 'editCable' ? 'Editando tracado do cabo' : 'Desenhando novo cabo'}
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Clique no mapa para adicionar pontos intermediarios.
          </p>
          <p className="text-xs mt-2">
            Pontos no tracado: <strong>{cableWaypoints.length}</strong>
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleUndoLastWaypoint} disabled={cableWaypoints.length === 0}>
              Desfazer ponto
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearWaypoints} disabled={cableWaypoints.length === 0}>
              Limpar
            </Button>
            {clickMode === 'addCable' && (
              <Button
                size="sm"
                onClick={() => setShowAddCable(true)}
                disabled={cableWaypoints.length < 2 && (!cableStartBox || !cableEndBox)}
              >
                Configurar e salvar
              </Button>
            )}
            {clickMode === 'editCable' && (
              <>
                <Button size="sm" onClick={handleSaveEditedCablePath}>
                  Salvar tracado
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEditCablePath}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {mapPointPickActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-blue-600 text-white px-3 py-2 rounded-md shadow">
          Clique no mapa para selecionar a posicao
        </div>
      )}

      {/* Container do mapa */}
      <div 
        ref={mapRef} 
        style={{ height, width: '100%' }}
        className="rounded-lg border overflow-hidden map-3d-surface"
      />

      {/* Modal de adicionar caixa */}
      <Dialog open={showAddPop} onOpenChange={setShowAddPop}>
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Adicionar POP</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do POP</Label>
              <Input value={newPopName} onChange={(e) => setNewPopName(e.target.value)} placeholder="Ex: POP Centro" />
            </div>
            <div>
              <Label>Cidade existente</Label>
              <Select value={newPopCityId || '__none__'} onValueChange={(v) => setNewPopCityId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Criar nova cidade</SelectItem>
                  {(currentNetwork?.cities || []).map((city: any) => (
                    <SelectItem key={city.id} value={city.id}>{city.sigla} - {city.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!newPopCityId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nova cidade</Label>
                  <Input value={newCityName} onChange={(e) => setNewCityName(e.target.value)} placeholder="Brasilia" />
                </div>
                <div>
                  <Label>Sigla</Label>
                  <Input value={newCitySigla} onChange={(e) => setNewCitySigla(e.target.value.toUpperCase())} placeholder="BSB" />
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleAddPop} className="flex-1">Adicionar</Button>
              <Button variant="outline" onClick={() => setShowAddPop(false)}>Cancelar</Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de adicionar caixa */}
      <Dialog open={showAddBox} onOpenChange={setShowAddBox}>
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Adicionar Nova Caixa</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input 
                value={newBoxName} 
                onChange={(e) => setNewBoxName(e.target.value)}
                placeholder="Ex: CTO-001"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newBoxType} onValueChange={(v: any) => setNewBoxType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CEO">CEO - Central Office</SelectItem>
                  <SelectItem value="CTO">CTO - Caixa de Terminacao</SelectItem>
                  <SelectItem value="DIO">DIO - distribuicao Interna</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacidade (fibras)</Label>
              <Select 
                value={newBoxCapacity.toString()} 
                onValueChange={(v) => setNewBoxCapacity(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 fibras</SelectItem>
                  <SelectItem value="12">12 fibras</SelectItem>
                  <SelectItem value="16">16 fibras</SelectItem>
                  <SelectItem value="24">24 fibras</SelectItem>
                  <SelectItem value="36">36 fibras</SelectItem>
                  <SelectItem value="48">48 fibras</SelectItem>
                  <SelectItem value="72">72 fibras</SelectItem>
                  <SelectItem value="96">96 fibras</SelectItem>
                  <SelectItem value="144">144 fibras</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pendingAttach && (
              <div className="text-xs rounded border bg-amber-50 text-amber-800 px-3 py-2">
                Caixa sera inserida no tracado do cabo selecionado (opcao de sangria/passagem direta disponivel no detalhe da caixa).
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleAddBox} className="flex-1">Adicionar</Button>
              <Button variant="outline" onClick={() => {
                setShowAddBox(false);
                setNewBoxPosition(null);
              }}>Cancelar</Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReserve} onOpenChange={setShowAddReserve}>
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Adicionar Reserva</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={newReserveName}
                onChange={(e) => setNewReserveName(e.target.value)}
                placeholder="Ex: Reserva Rua 2"
              />
            </div>
            {pendingAttach && (
              <div className="text-xs rounded border bg-amber-50 text-amber-800 px-3 py-2">
                Reserva sera inserida no tracado do cabo selecionado.
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleAddReserve} className="flex-1" disabled={!newReserveName.trim()}>
                Adicionar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddReserve(false);
                  setNewReserveName('');
                  setNewReservePosition(null);
                  setPendingAttach(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de adicionar cabo */}
      <Dialog open={showAddCable} onOpenChange={setShowAddCable}>
        <DialogContent className="w-[min(96vw,760px)] max-w-[760px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader>
            <DialogTitle className="px-6 pt-6">Adicionar Novo Cabo</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-150px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do Cabo</Label>
              <Input value={cableName} onChange={(e) => setCableName(e.target.value)} placeholder="Ex: AS-80 Rota Norte Trecho 1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Origem (caixa ou POP)</Label>
              <Select value={cableStartBox || '__none__'} onValueChange={(v) => setCableStartBox(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem origem</SelectItem>
                  {cableEndpointOptions.map((endpoint) => (
                    <SelectItem key={endpoint.id} value={endpoint.id}>
                      {endpoint.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Destino (caixa ou POP)</Label>
              <Select value={cableEndBox || '__none__'} onValueChange={(v) => setCableEndBox(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem destino</SelectItem>
                  {cableEndpointOptions
                    .filter((endpoint) => endpoint.id !== cableStartBox)
                    .map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpoint.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleUndoLastWaypoint} disabled={cableWaypoints.length === 0}>
                Desfazer ponto
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearWaypoints} disabled={cableWaypoints.length === 0}>
                Limpar pontos
              </Button>
            </div>
            <div>
              <Label>Tipo de Cabo</Label>
              <Select value={cableType} onValueChange={(v: any) => setCableType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drop">Drop (Ãšltima milha)</SelectItem>
                  <SelectItem value="distribution">distribuicao</SelectItem>
                  <SelectItem value="feeder">Feeder</SelectItem>
                  <SelectItem value="backbone">Backbone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo do Cabo</Label>
              <Select value={cableModel} onValueChange={setCableModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
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
                  value={looseTubeCount}
                  onChange={(e) => setLooseTubeCount(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                />
              </div>
              <div>
                <Label>Fibras por tubo</Label>
                <Input
                  type="number"
                  min={1}
                  value={fibersPerTube}
                  onChange={(e) => setFibersPerTube(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
                />
              </div>
            </div>
            <div>
              <Label>Quantidade de Fibras</Label>
              <Input
                type="number"
                min={1}
                max={maxFiberCapacity}
                value={cableFiberCount}
                onChange={(e) => {
                  const next = Math.max(1, Number.parseInt(e.target.value || '1', 10));
                  setCableFiberCount(Math.min(maxFiberCapacity, next));
                }}
              />
              <p className="text-xs text-gray-500 mt-1">Capacidade atual: {maxFiberCapacity} fibras ({looseTubeCount} x {fibersPerTube}).</p>
              <p className="text-xs text-gray-500">{cableEndpointSummary} | modelo {cableModel}.</p>
            </div>
            <div className="bg-blue-50 p-3 rounded text-sm">
              <p className="text-blue-800">
                <strong>Dica:</strong> Origem/destino sao opcionais. Clique no mapa para adicionar pontos de passagem.
                {cableWaypoints.length > 0 && (
                  <span className="block mt-1">
                    Pontos adicionados: {cableWaypoints.length}
                  </span>
                )}
              </p>
            </div>
          </div>
          </ScrollArea>
          <div className="border-t px-6 py-4 bg-white">
            <div className="flex gap-2">
              <Button onClick={handleAddCable} className="flex-1" disabled={cableWaypoints.length < 2 && (!cableStartBox || !cableEndBox)}>
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => {
                setShowAddCable(false);
                // Keep drawing mode active; user can close this modal and continue adding pontos.
                setClickMode('addCable');
              }}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}





