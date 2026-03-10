import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Box, Cable, City, Fiber, Pop, Position, ReservePoint } from '@/types/ftth';
import {
  BOX_ICONS,
  DEFAULT_CABLE_FIBER_COUNT,
  DEFAULT_CABLE_FIBERS_PER_TUBE,
  DEFAULT_CABLE_LOOSE_TUBE_COUNT,
  DEFAULT_CABLE_TYPE,
  getCableModelsByType,
  resolveDefaultCableModel,
} from '@/types/ftth';
import {
  buildCableTopologySummary,
  getDefaultBoxCapacity,
  getRecommendedBoxCapacities,
  getRecommendedCableGeometry,
  inferCableTypeFromEndpoints,
  resolveTopologyEndpointProfile,
  validateCableTypeForTopology,
} from '@/types/ftth/rules';
import { getFiberById, resolveNextFiberThroughPop } from '@/store/networkUtils';
import type {
  ClickMode,
  EditCableRequestDetail,
  FiberAnalyzerSelectCableDetail,
  FiberTraceRequestDetail,
  FiberTraceSegment,
  MapViewMode,
  MapPointRequestDetail,
  NearestCableHit,
  PendingAttachToCable,
  StartMapCableDrawingDetail,
} from '../types';
import { buildAnchoredPath, calculateCableLength, extractEditableWaypoints } from '../utils';
import { toast } from 'sonner';

// Declaracao global para Leaflet
declare global {
  interface Window {
    L: any;
    google?: any;
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const MAP_DEFAULT_VIEW = { lat: -15.7975, lng: -47.8919, zoom: 13 };

const mapSessionState: {
  initialLocateDone: boolean;
  lastView: { lat: number; lng: number; zoom: number } | null;
} = {
  initialLocateDone: false,
  lastView: null,
};

const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-js-api';
let googleMapsLoaderPromise: Promise<void> | null = null;

const loadGoogleMapsApi = (apiKey: string): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window indisponivel para carregar Google Maps.'));
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (!apiKey) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY nao configurada.'));
  }

  if (googleMapsLoaderPromise) {
    return googleMapsLoaderPromise;
  }

  googleMapsLoaderPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Falha ao carregar script do Google Maps.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar script do Google Maps.'));
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsLoaderPromise = null;
    throw error;
  });

  return googleMapsLoaderPromise;
};

export function useNetworkMapController() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const invalidateSizeTimerRef = useRef<number | null>(null);
  const markersLayer = useRef<any>(null);
  const cablesLayer = useRef<any>(null);
  const fiberTraceLayer = useRef<any>(null);
  const tileLayer = useRef<any>(null);
  const tempPolylineRef = useRef<any>(null);
  const clickModeRef = useRef<ClickMode>('normal');
  const initialLocateRequestedRef = useRef(mapSessionState.initialLocateDone);
  const hasUserInteractedWithMapRef = useRef(false);
  const lastMapDragEndedAtRef = useRef(0);
  const lastMapZoomEndedAtRef = useRef(0);
  const lastLayerInteractionAtRef = useRef(0);
  const googleMapsErrorNotifiedRef = useRef(false);
  const findNearestCableForPositionRef = useRef<(position: Position) => NearestCableHit | null>(() => null);
  const findNearestBoxForPositionRef = useRef<(position: Position) => Position | null>(() => null);
  const pendingMapPointRequestIdRef = useRef<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapPointPickActive, setMapPointPickActive] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [fiberTraceSegments, setFiberTraceSegments] = useState<FiberTraceSegment[]>([]);
  const [fiberTracePinned, setFiberTracePinned] = useState(false);
  
  const { 
    currentNetwork, 
    selectBox, 
    selectPop,
    addCity,
    addPop,
    updatePop,
    updateBox,
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
  const [newBoxCapacity, setNewBoxCapacity] = useState(getDefaultBoxCapacity('CTO'));
  const [boxCapacityManuallyEdited, setBoxCapacityManuallyEdited] = useState(false);
  const [cableStartBox, setCableStartBox] = useState<string>('');
  const [cableEndBox, setCableEndBox] = useState<string>('');
  const [cableName, setCableName] = useState('');
  const [cableFiberCount, setCableFiberCount] = useState(DEFAULT_CABLE_FIBER_COUNT);
  const [cableType, setCableType] = useState<Cable['type']>(DEFAULT_CABLE_TYPE);
  const [cableModel, setCableModel] = useState(() => resolveDefaultCableModel(DEFAULT_CABLE_TYPE));
  const [looseTubeCount, setLooseTubeCount] = useState(DEFAULT_CABLE_LOOSE_TUBE_COUNT);
  const [fibersPerTube, setFibersPerTube] = useState(DEFAULT_CABLE_FIBERS_PER_TUBE);
  const [clickMode, setClickMode] = useState<ClickMode>('normal');
  const [mapView, setMapView] = useState<MapViewMode>('street');
  const [cableWaypoints, setCableWaypoints] = useState<Position[]>([]);
  const [editingCableId, setEditingCableId] = useState<string>('');
  const [pendingAttach, setPendingAttach] = useState<PendingAttachToCable | null>(null);
  const [manualCableControl, setManualCableControl] = useState(false);
  const isDrawingMode = clickMode === 'addCable' || clickMode === 'editCable';

  const maxFiberCapacity = Math.max(1, looseTubeCount * fibersPerTube);
  const availableModels = getCableModelsByType(cableType);
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
  const cableStartEndpointProfile = useMemo(
    () =>
      resolveTopologyEndpointProfile(
        cableStartBox,
        currentNetwork?.boxes || [],
        currentNetwork?.pops || []
      ),
    [cableStartBox, currentNetwork?.boxes, currentNetwork?.pops]
  );
  const cableEndEndpointProfile = useMemo(
    () =>
      resolveTopologyEndpointProfile(
        cableEndBox,
        currentNetwork?.boxes || [],
        currentNetwork?.pops || []
      ),
    [cableEndBox, currentNetwork?.boxes, currentNetwork?.pops]
  );
  const suggestedCableType = useMemo(
    () => inferCableTypeFromEndpoints(cableStartEndpointProfile, cableEndEndpointProfile),
    [cableStartEndpointProfile, cableEndEndpointProfile]
  );
  const cableTopologyValidation = useMemo(
    () =>
      validateCableTypeForTopology(cableType, cableStartEndpointProfile, cableEndEndpointProfile),
    [cableType, cableStartEndpointProfile, cableEndEndpointProfile]
  );
  const cableGeometrySuggestion = useMemo(
    () =>
      getRecommendedCableGeometry(cableType, cableStartEndpointProfile, cableEndEndpointProfile),
    [cableType, cableStartEndpointProfile, cableEndEndpointProfile]
  );
  const cableEndpointSummary = useMemo(
    () =>
      buildCableTopologySummary(
        cableStartEndpointProfile,
        cableEndEndpointProfile,
        cableType,
        manualCableControl
      ),
    [cableStartEndpointProfile, cableEndEndpointProfile, cableType, manualCableControl]
  );
  const cableValidationErrors = cableTopologyValidation.blockers;
  const cableValidationWarnings = cableTopologyValidation.warnings;
  const canSubmitCable =
    (cableWaypoints.length >= 2 || Boolean(cableStartBox && cableEndBox)) &&
    cableValidationErrors.length === 0;

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

  const handleNewBoxTypeChange = useCallback((type: Box['type']) => {
    setNewBoxType(type);
    const validCapacities = getRecommendedBoxCapacities(type);
    setNewBoxCapacity((currentCapacity) => {
      if (!boxCapacityManuallyEdited) return getDefaultBoxCapacity(type);
      if (!validCapacities.includes(currentCapacity)) return getDefaultBoxCapacity(type);
      return currentCapacity;
    });
  }, [boxCapacityManuallyEdited]);

  const handleNewBoxCapacityChange = useCallback((value: number) => {
    setBoxCapacityManuallyEdited(true);
    setNewBoxCapacity(Math.max(1, value));
  }, []);

  const handleManualCableControlChange = useCallback((enabled: boolean) => {
    setManualCableControl(enabled);
    if (enabled) return;
    const nextType = inferCableTypeFromEndpoints(cableStartEndpointProfile, cableEndEndpointProfile);
    const nextGeometry = getRecommendedCableGeometry(
      nextType,
      cableStartEndpointProfile,
      cableEndEndpointProfile
    );
    setCableType(nextType);
    setCableModel(resolveDefaultCableModel(nextType));
    setLooseTubeCount(nextGeometry.looseTubeCount);
    setFibersPerTube(nextGeometry.fibersPerTube);
    setCableFiberCount(nextGeometry.fiberCount);
  }, [cableStartEndpointProfile, cableEndEndpointProfile]);

  const handleCableTypeChange = useCallback((value: Cable['type']) => {
    setManualCableControl(true);
    setCableType(value);
    setCableModel(resolveDefaultCableModel(value));
  }, []);

  const handleCableModelChange = useCallback((value: string) => {
    setManualCableControl(true);
    setCableModel(value);
  }, []);

  const handleLooseTubeCountChange = useCallback((value: number) => {
    setManualCableControl(true);
    setLooseTubeCount(Math.max(1, value));
  }, []);

  const handleFibersPerTubeChange = useCallback((value: number) => {
    setManualCableControl(true);
    setFibersPerTube(Math.max(1, value));
  }, []);

  const handleCableFiberCountChange = useCallback((value: number) => {
    setManualCableControl(true);
    setCableFiberCount(Math.max(1, value));
  }, []);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.some((item) => item.id === cableModel)) {
      setCableModel(availableModels[0]!.id);
    }
  }, [availableModels, cableModel]);

  useEffect(() => {
    if (manualCableControl) return;
    if (cableType === suggestedCableType) return;
    setCableType(suggestedCableType);
    setCableModel(resolveDefaultCableModel(suggestedCableType));
  }, [manualCableControl, cableType, suggestedCableType]);

  useEffect(() => {
    if (manualCableControl) return;
    setLooseTubeCount(cableGeometrySuggestion.looseTubeCount);
    setFibersPerTube(cableGeometrySuggestion.fibersPerTube);
    setCableFiberCount(cableGeometrySuggestion.fiberCount);
  }, [
    manualCableControl,
    cableGeometrySuggestion.looseTubeCount,
    cableGeometrySuggestion.fibersPerTube,
    cableGeometrySuggestion.fiberCount,
  ]);

  useEffect(() => {
    if (cableFiberCount > maxFiberCapacity) {
      setCableFiberCount(maxFiberCapacity);
    }
  }, [cableFiberCount, maxFiberCapacity]);

  useEffect(() => {
    // Keep default fiber count aligned with the current loose-tube capacity when possible.
    if (
      cableFiberCount <= DEFAULT_CABLE_FIBER_COUNT &&
      maxFiberCapacity >= DEFAULT_CABLE_FIBER_COUNT
    ) {
      setCableFiberCount(DEFAULT_CABLE_FIBER_COUNT);
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

  const createGoogleBaseLayer = useCallback((view: MapViewMode) => {
    const L = window.L;
    const googleMutantFactory = L?.gridLayer?.googleMutant;
    if (!googleMutantFactory) {
      throw new Error('Leaflet.GoogleMutant nao carregado.');
    }

    return googleMutantFactory({
      type: view === 'satellite' ? 'hybrid' : 'roadmap',
      maxZoom: 21,
    });
  }, []);

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

  const markLayerInteraction = useCallback((event?: any) => {
    lastLayerInteractionAtRef.current = Date.now();
    const nativeEvent = event?.originalEvent ?? event;
    nativeEvent?.stopPropagation?.();
  }, []);

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
        interactive: false,
      }).addTo(fiberTraceLayer.current);

      const core = L.polyline(tracePath, {
        color: segment.color,
        weight: 8,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'map-fiber-trace-line',
        interactive: false,
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

    let disposed = false;
    let disposeMap: (() => void) | null = null;

    const initMap = async () => {
      try {
        await loadGoogleMapsApi(GOOGLE_MAPS_API_KEY);
      } catch (error) {
        console.error('Nao foi possivel carregar a API do Google Maps.', error);
        if (!googleMapsErrorNotifiedRef.current) {
          googleMapsErrorNotifiedRef.current = true;
          toast.error('Configure VITE_GOOGLE_MAPS_API_KEY para carregar o Google Maps.');
        }
        return;
      }

      if (disposed || !mapRef.current || leafletMap.current) return;

      const bootstrapView = mapSessionState.lastView || MAP_DEFAULT_VIEW;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        inertia: false,
        inertiaDeceleration: 3000,
        inertiaMaxSpeed: 1200,
      }).setView([bootstrapView.lat, bootstrapView.lng], bootstrapView.zoom, { animate: false });

      let initialBaseLayer: any;
      try {
        initialBaseLayer = createGoogleBaseLayer('street');
      } catch (error) {
        console.error('Nao foi possivel inicializar camada Google Maps.', error);
        if (!googleMapsErrorNotifiedRef.current) {
          googleMapsErrorNotifiedRef.current = true;
          toast.error('Plugin Google Maps indisponivel. Verifique o carregamento do mapa.');
        }
        map.remove();
        return;
      }

      tileLayer.current = initialBaseLayer.addTo(map);

      markersLayer.current = L.layerGroup().addTo(map);
      cablesLayer.current = L.layerGroup().addTo(map);
      fiberTraceLayer.current = L.layerGroup().addTo(map);

      leafletMap.current = map;
      setIsMapReady(true);
      if (mapSessionState.lastView) {
        hasUserInteractedWithMapRef.current = true;
      }

      const markMapInteraction = () => {
        hasUserInteractedWithMapRef.current = true;
      };
      const persistMapView = () => {
        const center = map.getCenter?.();
        const zoom = Number(map.getZoom?.());
        if (!center || !Number.isFinite(zoom)) return;
        mapSessionState.lastView = { lat: center.lat, lng: center.lng, zoom };
      };
      const scheduleInvalidateSize = () => {
        if (!leafletMap.current) return;
        if (invalidateSizeTimerRef.current) {
          window.clearTimeout(invalidateSizeTimerRef.current);
        }
        invalidateSizeTimerRef.current = window.setTimeout(() => {
          if (!leafletMap.current) return;
          leafletMap.current.invalidateSize({ pan: false, animate: false });
          invalidateSizeTimerRef.current = null;
        }, 90);
      };

      map.on('dragstart', markMapInteraction);
      map.on('mousedown', markMapInteraction);
      map.on('touchstart', markMapInteraction);
      map.on('zoomstart', markMapInteraction);
      map.on('dragend', () => {
        lastMapDragEndedAtRef.current = Date.now();
      });
      map.on('zoomend', () => {
        lastMapZoomEndedAtRef.current = Date.now();
        persistMapView();
      });
      map.on('moveend', persistMapView);
      window.addEventListener('resize', scheduleInvalidateSize);
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          scheduleInvalidateSize();
        });
        observer.observe(mapRef.current);
        resizeObserverRef.current = observer;
      }
      scheduleInvalidateSize();

      map.on('click', (e: any) => {
        const now = Date.now();
        if (now - lastMapDragEndedAtRef.current < 220) return;
        if (now - lastMapZoomEndedAtRef.current < 180) return;
        if (now - lastLayerInteractionAtRef.current < 220) return;

        map.stop?.();
        hasUserInteractedWithMapRef.current = true;
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

      disposeMap = () => {
        window.removeEventListener('resize', scheduleInvalidateSize);
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
        }
        if (invalidateSizeTimerRef.current) {
          window.clearTimeout(invalidateSizeTimerRef.current);
          invalidateSizeTimerRef.current = null;
        }
        map.remove();
        leafletMap.current = null;
        tileLayer.current = null;
        markersLayer.current = null;
        cablesLayer.current = null;
        tempPolylineRef.current = null;
        fiberTraceLayer.current = null;
      };
    };

    void initMap();

    return () => {
      disposed = true;
      if (disposeMap) {
        disposeMap();
      }
    };
  }, [createGoogleBaseLayer]);

  useEffect(() => {
    clickModeRef.current = clickMode;
  }, [clickMode]);

  useEffect(() => {
    if (!leafletMap.current) return;
    const map = leafletMap.current;
    let nextLayer: any;

    try {
      nextLayer = createGoogleBaseLayer(mapView);
    } catch (error) {
      console.error('Nao foi possivel alternar camada do Google Maps.', error);
      if (!googleMapsErrorNotifiedRef.current) {
        googleMapsErrorNotifiedRef.current = true;
        toast.error('Plugin Google Maps indisponivel. Verifique o carregamento do mapa.');
      }
      return;
    }

    if (tileLayer.current) {
      map.removeLayer(tileLayer.current);
    }

    tileLayer.current = nextLayer.addTo(map);
  }, [mapView, createGoogleBaseLayer]);

  useEffect(() => {
    if (!leafletMap.current) return;
    const map = leafletMap.current;

    if (isDrawingMode) {
      map.doubleClickZoom?.disable?.();
      map.scrollWheelZoom?.disable?.();
      map.touchZoom?.disable?.();
      map.boxZoom?.disable?.();
      map.keyboard?.disable?.();
      return;
    }

    map.doubleClickZoom?.enable?.();
    map.scrollWheelZoom?.enable?.();
    map.touchZoom?.enable?.();
    map.boxZoom?.enable?.();
    map.keyboard?.enable?.();
  }, [isDrawingMode]);

  useEffect(() => {
    if (!leafletMap.current) return;
    const map = leafletMap.current;
    const panes = map.getPanes?.();
    if (!panes) return;

    const panesToToggle = [
      panes.overlayPane,
      panes.markerPane,
      panes.popupPane,
      panes.tooltipPane,
      panes.shadowPane,
    ].filter(Boolean) as Array<HTMLElement>;

    panesToToggle.forEach((pane) => {
      pane.style.pointerEvents = isDrawingMode ? 'none' : '';
    });

    return () => {
      panesToToggle.forEach((pane) => {
        pane.style.pointerEvents = '';
      });
    };
  }, [isDrawingMode]);

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
        interactive: false,
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
    setCableModel(cable.model || resolveDefaultCableModel(cable.type));
    setLooseTubeCount(cable.looseTubeCount || DEFAULT_CABLE_LOOSE_TUBE_COUNT);
    setFibersPerTube(cable.fibersPerTube || DEFAULT_CABLE_FIBERS_PER_TUBE);
    setCableFiberCount(cable.fiberCount);
    setManualCableControl(true);
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

      const nextType = detail.type || DEFAULT_CABLE_TYPE;
      const nextLooseTubeCount = Math.max(1, detail.looseTubeCount || DEFAULT_CABLE_LOOSE_TUBE_COUNT);
      const nextFibersPerTube = Math.max(1, detail.fibersPerTube || DEFAULT_CABLE_FIBERS_PER_TUBE);
      const nextFiberCapacity = nextLooseTubeCount * nextFibersPerTube;
      const nextFiberCount = Math.max(
        1,
        Math.min(detail.fiberCount || DEFAULT_CABLE_FIBER_COUNT, nextFiberCapacity)
      );
      const hasCustomGeometry =
        typeof detail.fiberCount === 'number' ||
        typeof detail.looseTubeCount === 'number' ||
        typeof detail.fibersPerTube === 'number' ||
        typeof detail.type === 'string' ||
        typeof detail.model === 'string';

      setEditingCableId('');
      setShowAddCable(false);
      setCableWaypoints([]);
      setCableName(detail.name || '');
      setCableType(nextType);
      setCableModel(detail.model || resolveDefaultCableModel(nextType));
      setLooseTubeCount(nextLooseTubeCount);
      setFibersPerTube(nextFibersPerTube);
      setCableFiberCount(nextFiberCount);
      setCableStartBox(detail.startPoint || '');
      setCableEndBox(detail.endPoint || '');
      setManualCableControl(hasCustomGeometry);
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
    const markerInteractivityEnabled = !isDrawingMode;
    markersLayer.current.clearLayers();

    (currentNetwork?.pops || []).forEach((pop: Pop) => {
      const safePopName = escapeHtml(pop.name || 'POP');
      const popIcon = L.divIcon({
        className: 'custom-pop-marker',
        html: `
          <div class="map-marker-3d map-marker-pop ${pop.status === 'active' ? 'is-active' : ''}" style="
            width: 26px;
            height: 26px;
            background: ${
              pop.status === 'active'
                ? 'linear-gradient(145deg, #fff5d6 0%, #f97316 58%, #c2410c 100%)'
                : 'linear-gradient(145deg, #e5e7eb 0%, #9ca3af 58%, #6b7280 100%)'
            };
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

      const marker = L.marker([pop.position.lat, pop.position.lng], {
        icon: popIcon,
        draggable: isEditing && markerInteractivityEnabled,
        interactive: markerInteractivityEnabled,
      });
      const city = (currentNetwork?.cities || []).find((item: City) => item.id === pop.cityId);
      const safeCityLabel = city ? escapeHtml(`${city.sigla} - ${city.name}`) : 'N/A';
      if (markerInteractivityEnabled) {
        marker.bindPopup(`
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-weight: bold;">${safePopName}</h3>
            <p style="margin: 4px 0;"><strong>Cidade:</strong> ${safeCityLabel}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> ${escapeHtml(pop.status)}</p>
            <p style="margin: 4px 0;"><strong>DIO:</strong> ${(pop.dios || []).length}</p>
            <p style="margin: 4px 0;"><strong>OLT:</strong> ${(pop.olts || []).length}</p>
            <p style="margin: 4px 0;"><strong>VLANs:</strong> ${(pop.vlans || []).length}</p>
          </div>
        `, { className: 'map-3d-popup', autoPan: false });
        marker.on('click', (event: any) => {
          markLayerInteraction(event);
          selectPop(pop);
        });
        if (isEditing) {
          marker.on('dragend', (event: any) => {
            const latLng = event.target.getLatLng();
            updatePop(pop.id, {
              position: {
                lat: latLng.lat,
                lng: latLng.lng,
              },
            });
          });
        }
      }
      marker.addTo(markersLayer.current);
    });

    currentNetwork?.boxes.forEach((box: Box) => {
      const safeBoxName = escapeHtml(box.name || 'Caixa');
      const safeBoxAddress = box.address ? escapeHtml(box.address) : '';
      const marker = L.marker([box.position.lat, box.position.lng], {
        icon: createBoxIcon(box.type, box.status),
        draggable: isEditing && markerInteractivityEnabled,
        interactive: markerInteractivityEnabled,
      });

      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${safeBoxName}</h3>
          <p style="margin: 4px 0;"><strong>Tipo:</strong> ${escapeHtml(box.type)}</p>
          <p style="margin: 4px 0;"><strong>Capacidade:</strong> ${box.capacity} fibras</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${escapeHtml(box.status)}</p>
          <p style="margin: 4px 0;"><strong>Fibras usadas:</strong> ${box.fibers.filter((f) => f.status === 'active').length}</p>
          ${safeBoxAddress ? `<p style="margin: 4px 0;"><strong>Endereco:</strong> ${safeBoxAddress}</p>` : ''}
        </div>
      `;

      if (markerInteractivityEnabled) {
        marker.bindPopup(popupContent, { className: 'map-3d-popup', autoPan: false });
        
        marker.on('click', (event: any) => {
          markLayerInteraction(event);
          selectBox(box);
        });

        if (isEditing) {
          marker.on('dragend', (event: any) => {
            const latLng = event.target.getLatLng();
            updateBox(box.id, {
              position: {
                lat: latLng.lat,
                lng: latLng.lng,
              },
            });
          });
        }

        marker.on('contextmenu', (e: any) => {
          markLayerInteraction(e);
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
      }

      marker.addTo(markersLayer.current);
    });

    (currentNetwork?.reserves || []).forEach((reserve: ReservePoint) => {
      const safeReserveName = escapeHtml(reserve.name || 'Reserva');
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

      const marker = L.marker([reserve.position.lat, reserve.position.lng], {
        icon: reserveIcon,
        interactive: markerInteractivityEnabled,
      });
      if (markerInteractivityEnabled) {
        marker.bindPopup(`
          <div style="min-width: 160px;">
            <h3 style="margin: 0 0 8px 0; font-weight: bold;">${safeReserveName}</h3>
            <p style="margin: 4px 0;"><strong>Tipo:</strong> Reserva</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> ${escapeHtml(reserve.status)}</p>
          </div>
        `, { className: 'map-3d-popup', autoPan: false });
      }
      marker.addTo(markersLayer.current);
    });
  }, [currentNetwork?.boxes, currentNetwork?.reserves, currentNetwork?.pops, currentNetwork?.cities, isMapReady, createBoxIcon, selectBox, selectPop, setEditing, removeBox, updatePop, updateBox, isEditing, isDrawingMode, markLayerInteraction]);

  // Atualizar cabos no mapa
  useEffect(() => {
    if (!isMapReady || !cablesLayer.current) return;
    
    const L = window.L;
    const cableInteractivityEnabled = !isDrawingMode;
    cablesLayer.current.clearLayers();

    currentNetwork?.cables.forEach((cable: Cable) => {
      const startEndpoint = cable.startPoint ? resolveNetworkEndpointById(cable.startPoint) : null;
      const endEndpoint = cable.endPoint ? resolveNetworkEndpointById(cable.endPoint) : null;
      const safeCableName = escapeHtml(cable.name || 'Cabo');
      const safeCableType = escapeHtml(cable.type);
      const safeCableModel = escapeHtml(cable.model || 'N/A');
      const safeStartName = escapeHtml(startEndpoint?.name || 'Nao definida');
      const safeEndName = escapeHtml(endEndpoint?.name || 'Nao definido');
      const safeCableStatus = escapeHtml(cable.status);

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
        interactive: false,
      });

      const polyline = L.polyline(path, {
        color: cable.status === 'active' ? '#00AA00' : '#999999',
        weight: cableBaseWeight,
        opacity: 0.8,
        dashArray: cable.status === 'projected' ? '10, 10' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
        className: `map-3d-cable-core ${cable.status === 'active' ? 'map-3d-cable-active' : ''}`,
        interactive: cableInteractivityEnabled,
        bubblingMouseEvents: false,
      });

      if (cableInteractivityEnabled) {
        polyline.bindPopup(`
          <div style="min-width: 180px;">
            <h3 style="margin: 0 0 8px 0; font-weight: bold;">${safeCableName}</h3>
            <p style="margin: 4px 0;"><strong>Tipo:</strong> ${safeCableType}</p>
            <p style="margin: 4px 0;"><strong>Modelo:</strong> ${safeCableModel}</p>
            <p style="margin: 4px 0;"><strong>Fibras:</strong> ${cable.fiberCount}</p>
            <p style="margin: 4px 0;"><strong>Tubos loose:</strong> ${cable.looseTubeCount || 1}</p>
            <p style="margin: 4px 0;"><strong>Fibras por tubo:</strong> ${cable.fibersPerTube || 12}</p>
            <p style="margin: 4px 0;"><strong>Comprimento:</strong> ${cable.length}m</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> ${safeCableStatus}</p>
            <p style="margin: 4px 0;"><strong>Origem:</strong> ${safeStartName}</p>
            <p style="margin: 4px 0;"><strong>Destino:</strong> ${safeEndName}</p>
            <button data-edit-cable-id="${cable.id}" style="margin-top: 8px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
              Editar tracado
            </button>
          </div>
        `, { className: 'map-3d-popup', autoPan: false });

        polyline.on('popupopen', (event: any) => {
          const popupElement = event.popup?.getElement?.() as HTMLElement | undefined;
          const button = popupElement?.querySelector<HTMLButtonElement>(`button[data-edit-cable-id="${cable.id}"]`);
          if (!button) return;
          button.onclick = () => {
            handleStartEditCablePath(cable.id);
            leafletMap.current?.closePopup();
          };
        });

        const handleSelectCableForAnalyzer = (event?: any) => {
          markLayerInteraction(event);
          window.dispatchEvent(
            new CustomEvent<FiberAnalyzerSelectCableDetail>('ftth:fiber-analyzer-select-cable', {
              detail: { cableId: cable.id },
            })
          );
        };
        polyline.on('click', handleSelectCableForAnalyzer);
      }

      cableGlow.addTo(cablesLayer.current);
      polyline.addTo(cablesLayer.current);
    });
  }, [currentNetwork?.cables, isMapReady, handleStartEditCablePath, resolveNetworkEndpointById, isDrawingMode, markLayerInteraction]);

  // Handlers para adicionar caixa
  const handleAddBox = () => {
    if (!newBoxPosition || !newBoxName.trim()) return;
    
    const created = addBox({
      name: newBoxName.trim(),
      type: newBoxType,
      position: newBoxPosition,
      capacity: newBoxCapacity,
      status: 'active',
    });
    if (!created) return;

    if (pendingAttach) {
      attachEntityToCablePath(pendingAttach.cableId, { kind: 'box', id: created.id, name: created.name }, { position: pendingAttach.position, pathIndex: pendingAttach.pathIndex });
    }
    
    setShowAddBox(false);
    setNewBoxName('');
    setNewBoxPosition(null);
    setPendingAttach(null);
    setBoxCapacityManuallyEdited(false);
    setNewBoxCapacity(getDefaultBoxCapacity(newBoxType));
  };

  const handleAddPop = () => {
    if (!newPopPosition || !newPopName.trim()) return;
    let cityId = newPopCityId;
    if (!cityId && newCityName.trim() && newCitySigla.trim()) {
      const city = addCity({
        name: newCityName.trim(),
        sigla: newCitySigla.trim().toUpperCase(),
      });
      if (!city) return;
      cityId = city.id;
    }
    if (!cityId) return;

    const created = addPop({
      cityId,
      name: newPopName.trim(),
      position: newPopPosition,
      status: 'active',
    });
    if (!created) return;

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
    if (!created) return;

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
    const effectiveType = manualCableControl ? cableType : suggestedCableType;
    const effectiveGeometry = manualCableControl
      ? {
          fiberCount: cableFiberCount,
          looseTubeCount,
          fibersPerTube,
        }
      : getRecommendedCableGeometry(
          effectiveType,
          cableStartEndpointProfile,
          cableEndEndpointProfile
        );
    const validation = validateCableTypeForTopology(
      effectiveType,
      cableStartEndpointProfile,
      cableEndEndpointProfile
    );
    if (validation.blockers.length > 0) return;
    if (cableWaypoints.length < 2 && (!startEndpoint || !endEndpoint)) return;
    const anchoredPath = buildAnchoredPath(cableWaypoints, startEndpoint?.position, endEndpoint?.position);
    const topologyNotes = validation.warnings.map((warning) => `[Topologia] ${warning}`);

    const created = addCable({
      name: cableName.trim() || (startEndpoint && endEndpoint ? `Cabo ${startEndpoint.name} -> ${endEndpoint.name}` : `Cabo Livre ${new Date().toLocaleTimeString('pt-BR')}`),
      type: effectiveType,
      model: manualCableControl ? cableModel : resolveDefaultCableModel(effectiveType),
      fiberCount: effectiveGeometry.fiberCount,
      looseTubeCount: effectiveGeometry.looseTubeCount,
      fibersPerTube: effectiveGeometry.fibersPerTube,
      startPoint: cableStartBox || '',
      endPoint: cableEndBox || '',
      path: anchoredPath,
      length: calculateCableLength(anchoredPath),
      status: 'active',
      color: '#00AA00',
      observations: topologyNotes.length > 0 ? topologyNotes.join('\n') : undefined,
    });
    if (!created) return;
    
    setShowAddCable(false);
    setCableName('');
    setCableStartBox('');
    setCableEndBox('');
    setCableType(DEFAULT_CABLE_TYPE);
    setLooseTubeCount(DEFAULT_CABLE_LOOSE_TUBE_COUNT);
    setFibersPerTube(DEFAULT_CABLE_FIBERS_PER_TUBE);
    setCableFiberCount(DEFAULT_CABLE_FIBER_COUNT);
    setCableModel(resolveDefaultCableModel(DEFAULT_CABLE_TYPE));
    setCableWaypoints([]);
    setManualCableControl(false);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
    setClickMode('normal');
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

  const handleToggleMapView = () => {
    setMapView((previous) => (previous === 'street' ? 'satellite' : 'street'));
  };

  const handleToggleAddPop = () => {
    setClickMode((previous) => (previous === 'addPop' ? 'normal' : 'addPop'));
  };

  const handleToggleAddBox = () => {
    setClickMode((previous) => {
      const nextMode = previous === 'addBox' ? 'normal' : 'addBox';
      if (nextMode === 'addBox') {
        setBoxCapacityManuallyEdited(false);
        setNewBoxCapacity(getDefaultBoxCapacity(newBoxType));
      }
      return nextMode;
    });
  };

  const handleToggleAddReserve = () => {
    setClickMode((previous) => (previous === 'addReserve' ? 'normal' : 'addReserve'));
  };

  const handleToggleAddCable = () => {
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
      return;
    }
    setShowAddCable(false);
    setCableName('');
    setCableStartBox('');
    setCableEndBox('');
    setCableType(DEFAULT_CABLE_TYPE);
    setCableModel(resolveDefaultCableModel(DEFAULT_CABLE_TYPE));
    setLooseTubeCount(DEFAULT_CABLE_LOOSE_TUBE_COUNT);
    setFibersPerTube(DEFAULT_CABLE_FIBERS_PER_TUBE);
    setCableFiberCount(DEFAULT_CABLE_FIBER_COUNT);
    setManualCableControl(false);
    setClickMode('addCable');
  };

  const handleToggleEditing = () => {
    setEditing(!isEditing);
  };

  const handleOpenCableConfig = () => {
    setShowAddCable(true);
  };

  const runLocateUser = useCallback((isAutomatic: boolean) => {
    if (!leafletMap.current) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    if (isAutomatic) {
      if (hasUserInteractedWithMapRef.current) return;
      if (clickModeRef.current !== 'normal') return;
    }

    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!leafletMap.current) {
          setIsLocatingUser(false);
          return;
        }
        if (isAutomatic) {
          if (hasUserInteractedWithMapRef.current || clickModeRef.current !== 'normal') {
            setIsLocatingUser(false);
            return;
          }
        }
        const map = leafletMap.current;
        const currentZoom = Number(map.getZoom?.()) || 13;
        const targetZoom =
          mapView === 'satellite'
            ? Math.min(Math.max(currentZoom, 14), 17)
            : Math.max(currentZoom, 16);
        map.flyTo([position.coords.latitude, position.coords.longitude], targetZoom, {
          animate: true,
          duration: 0.9,
        });
        mapSessionState.lastView = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          zoom: targetZoom,
        };
        setIsLocatingUser(false);
      },
      () => {
        setIsLocatingUser(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }, [mapView]);

  const handleLocateUser = useCallback(() => {
    runLocateUser(false);
  }, [runLocateUser]);

  useEffect(() => {
    if (!isMapReady || initialLocateRequestedRef.current) return;
    initialLocateRequestedRef.current = true;
    mapSessionState.initialLocateDone = true;
    if (mapSessionState.lastView) return;
    runLocateUser(true);
  }, [isMapReady, runLocateUser]);

  const handleCancelAddPop = () => {
    setShowAddPop(false);
  };

  const handleCancelAddBox = () => {
    setShowAddBox(false);
    setNewBoxPosition(null);
    setPendingAttach(null);
    setBoxCapacityManuallyEdited(false);
    setNewBoxCapacity(getDefaultBoxCapacity(newBoxType));
  };

  const handleCancelAddReserve = () => {
    setShowAddReserve(false);
    setNewReserveName('');
    setNewReservePosition(null);
    setPendingAttach(null);
  };

  const handleCancelAddCable = () => {
    setShowAddCable(false);
    setManualCableControl(false);
    setClickMode('addCable');
  };

  return {
    mapRef,
    currentNetwork,
    clickMode,
    mapView,
    isEditing,
    mapPointPickActive,
    isLocatingUser,
    showAddPop,
    showAddBox,
    showAddReserve,
    showAddCable,
    newPopName,
    newPopCityId,
    newCityName,
    newCitySigla,
    newBoxName,
    newBoxType,
    newBoxCapacity,
    newReserveName,
    cableName,
    cableStartBox,
    cableEndBox,
    cableType,
    cableModel,
    looseTubeCount,
    fibersPerTube,
    cableFiberCount,
    maxFiberCapacity,
    cableEndpointSummary,
    cableValidationErrors,
    cableValidationWarnings,
    manualCableControl,
    suggestedCableType,
    cableEndpointOptions,
    cableWaypoints,
    availableModels,
    pendingAttach,
    canSubmitCable,
    setShowAddPop,
    setShowAddBox,
    setShowAddReserve,
    setShowAddCable,
    setNewPopName,
    setNewPopCityId,
    setNewCityName,
    setNewCitySigla,
    setNewBoxName,
    setNewBoxType: handleNewBoxTypeChange,
    setNewBoxCapacity: handleNewBoxCapacityChange,
    setNewReserveName,
    setCableName,
    setCableStartBox,
    setCableEndBox,
    setCableType: handleCableTypeChange,
    setCableModel: handleCableModelChange,
    setLooseTubeCount: handleLooseTubeCountChange,
    setFibersPerTube: handleFibersPerTubeChange,
    setCableFiberCount: handleCableFiberCountChange,
    setManualCableControl: handleManualCableControlChange,
    handleToggleMapView,
    handleToggleAddPop,
    handleToggleAddBox,
    handleToggleAddReserve,
    handleToggleAddCable,
    handleToggleEditing,
    handleLocateUser,
    handleOpenCableConfig,
    handleAddPop,
    handleCancelAddPop,
    handleAddBox,
    handleCancelAddBox,
    handleAddReserve,
    handleCancelAddReserve,
    handleAddCable,
    handleCancelAddCable,
    handleUndoLastWaypoint,
    handleClearWaypoints,
    handleCancelEditCablePath,
    handleSaveEditedCablePath,
  };
}
