import { useEffect, useRef, useState, useCallback } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Position } from '@/types/ftth';
import { BOX_ICONS, CABLE_MODEL_OPTIONS } from '@/types/ftth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Map, Satellite } from 'lucide-react';

// Declaração global para Leaflet
declare global {
  interface Window {
    L: any;
  }
}

interface NetworkMapProps {
  height?: string;
}

type ClickMode = 'normal' | 'addBox' | 'addReserve' | 'addCable' | 'editCable';

interface PendingAttachToCable {
  cableId: string;
  position: Position;
  pathIndex: number;
}

interface NearestCableHit extends PendingAttachToCable {
  distancePx: number;
}

export function NetworkMap({ height = 'calc(100vh - 80px)' }: NetworkMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersLayer = useRef<any>(null);
  const cablesLayer = useRef<any>(null);
  const tileLayer = useRef<any>(null);
  const tempPolylineRef = useRef<any>(null);
  const clickModeRef = useRef<ClickMode>('normal');
  const [isMapReady, setIsMapReady] = useState(false);
  
  const { 
    currentNetwork, 
    selectBox, 
    addBox, 
    removeBox,
    addReserve,
    addCable,
    updateCable,
    isEditing,
    setEditing,
  } = useNetworkStore();

  const [showAddBox, setShowAddBox] = useState(false);
  const [showAddReserve, setShowAddReserve] = useState(false);
  const [showAddCable, setShowAddCable] = useState(false);
  const [newBoxPosition, setNewBoxPosition] = useState<Position | null>(null);
  const [newReservePosition, setNewReservePosition] = useState<Position | null>(null);
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
  }, [maxFiberCapacity]);

  const getRenderedCablePoints = useCallback((cable: any) => {
    const startBox = cable.startPoint ? currentNetwork?.boxes.find((b: any) => b.id === cable.startPoint) : null;
    const endBox = cable.endPoint ? currentNetwork?.boxes.find((b: any) => b.id === cable.endPoint) : null;
    if (cable.path.length > 0) {
      return cable.path.map((p: any) => ({ lat: p.lat, lng: p.lng }));
    }
    if (startBox && endBox) {
      return [startBox.position, endBox.position];
    }
    return [];
  }, [currentNetwork?.boxes]);

  const findNearestCableForPosition = useCallback((position: Position): NearestCableHit | null => {
    if (!leafletMap.current || !currentNetwork?.cables?.length) return null;
    const L = window.L;
    if (!L) return null;

    const map = leafletMap.current;
    const clickPoint = map.latLngToLayerPoint([position.lat, position.lng]);
    let bestHit: NearestCableHit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cable of currentNetwork.cables as any[]) {
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

  const attachEntityToCablePath = useCallback((cableId: string, entity: { kind: 'box' | 'reserve'; id: string; name: string }, anchor: { position: Position; pathIndex: number }) => {
    const cable = currentNetwork?.cables.find((item: any) => item.id === cableId);
    if (!cable) return;

    const nextPath = [...(cable.path || [])];
    const insertIndex = Math.max(0, Math.min(anchor.pathIndex, nextPath.length));
    nextPath.splice(insertIndex, 0, anchor.position);
    const attachments = [...(cable.attachments || []), {
      id: `${entity.kind}:${entity.id}:${Date.now()}`,
      kind: entity.kind,
      entityId: entity.id,
      name: entity.name,
      position: anchor.position,
      pathIndex: insertIndex,
    }];

    updateCable(cableId, { path: nextPath, attachments });
  }, [currentNetwork?.cables, updateCable]);

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

    leafletMap.current = map;
    setIsMapReady(true);

    // Evento de clique no mapa
    map.on('click', (e: any) => {
      const { lat, lng } = e.latlng;
      
      if (clickModeRef.current === 'addBox') {
        const clickPosition = { lat, lng };
        const nearest = findNearestCableForPosition(clickPosition);
        setPendingAttach(nearest ? { cableId: nearest.cableId, position: nearest.position, pathIndex: nearest.pathIndex } : null);
        setNewBoxPosition(nearest ? nearest.position : clickPosition);
        setShowAddBox(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addReserve') {
        const clickPosition = { lat, lng };
        const nearest = findNearestCableForPosition(clickPosition);
        setPendingAttach(nearest ? { cableId: nearest.cableId, position: nearest.position, pathIndex: nearest.pathIndex } : null);
        setNewReservePosition(nearest ? nearest.position : clickPosition);
        setShowAddReserve(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addCable' || clickModeRef.current === 'editCable') {
        setCableWaypoints((prev: Position[]) => [...prev, { lat, lng }]);
      }
    });

    return () => {
      map.remove();
      leafletMap.current = null;
      tileLayer.current = null;
      tempPolylineRef.current = null;
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

    const startBox = currentNetwork?.boxes.find((b: any) => b.id === startBoxId);
    const endBox = currentNetwork?.boxes.find((b: any) => b.id === endBoxId);
    const pathPoints = [
      ...(startBox ? [[startBox.position.lat, startBox.position.lng]] : []),
      ...cableWaypoints.map((p) => [p.lat, p.lng]),
      ...(endBox ? [[endBox.position.lat, endBox.position.lng]] : []),
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
        weight: 3,
        opacity: 0.85,
        dashArray: '6, 8',
      }).addTo(leafletMap.current);
    }
  }, [clickMode, cableWaypoints, cableStartBox, cableEndBox, editingCableId, currentNetwork?.boxes, currentNetwork?.cables]);

  useEffect(() => {
    if (clickMode === 'addCable' || clickMode === 'editCable') return;
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
  }, [clickMode]);

  // Criar ícone personalizado para caixa
  const createBoxIcon = useCallback((type: 'CEO' | 'CTO' | 'DIO', status: string) => {
    const L = window.L;
    const config = BOX_ICONS[type];
    const color = status === 'active' ? config.color : '#999999';
    
    return L.divIcon({
      className: 'custom-box-marker',
      html: `
        <div style="
          width: ${config.size}px;
          height: ${config.size}px;
          background: ${color};
          border: 3px solid white;
          border-radius: ${type === 'CEO' ? '4px' : type === 'CTO' ? '8px' : '50%'};
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
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

  // Atualizar marcadores no mapa
  useEffect(() => {
    if (!isMapReady || !markersLayer.current) return;
    
    const L = window.L;
    markersLayer.current.clearLayers();

    currentNetwork?.boxes.forEach((box: any) => {
      const marker = L.marker([box.position.lat, box.position.lng], {
        icon: createBoxIcon(box.type, box.status),
      });

      const popupContent = `
        <div style="min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-weight: bold;">${box.name}</h3>
          <p style="margin: 4px 0;"><strong>Tipo:</strong> ${box.type}</p>
          <p style="margin: 4px 0;"><strong>Capacidade:</strong> ${box.capacity} fibras</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${box.status}</p>
          <p style="margin: 4px 0;"><strong>Fibras usadas:</strong> ${box.fibers.filter((f: any) => f.status === 'active').length}</p>
          ${box.address ? `<p style="margin: 4px 0;"><strong>Endereço:</strong> ${box.address}</p>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);
      
      marker.on('click', () => {
        selectBox(box);
      });

      marker.on('contextmenu', (e: any) => {
        L.popup()
          .setLatLng(e.latlng)
          .setContent(`
            <div style="display: flex; gap: 8px;">
              <button onclick="window.editBox('${box.id}')" style="padding: 4px 8px;">Editar</button>
              <button onclick="window.deleteBox('${box.id}')" style="padding: 4px 8px; background: #ff4444; color: white;">Excluir</button>
            </div>
          `)
          .openOn(leafletMap.current);
      });

      marker.addTo(markersLayer.current);
    });

    (currentNetwork?.reserves || []).forEach((reserve: any) => {
      const reserveIcon = L.divIcon({
        className: 'custom-reserve-marker',
        html: `
          <div style="
            width: 22px;
            height: 22px;
            background: #ca8a04;
            border: 2px solid white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
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
      `);
      marker.addTo(markersLayer.current);
    });
  }, [currentNetwork?.boxes, currentNetwork?.reserves, isMapReady, createBoxIcon, selectBox]);

  // Atualizar cabos no mapa
  useEffect(() => {
    if (!isMapReady || !cablesLayer.current) return;
    
    const L = window.L;
    cablesLayer.current.clearLayers();

    currentNetwork?.cables.forEach((cable: any) => {
      const startBox = cable.startPoint ? currentNetwork.boxes.find((b: any) => b.id === cable.startPoint) : null;
      const endBox = cable.endPoint ? currentNetwork.boxes.find((b: any) => b.id === cable.endPoint) : null;

      const path = cable.path.length > 0
        ? cable.path.map((p: any) => [p.lat, p.lng])
        : startBox && endBox
          ? [[startBox.position.lat, startBox.position.lng], [endBox.position.lat, endBox.position.lng]]
          : [];
      if (path.length < 2) return;

      const polyline = L.polyline(path, {
        color: cable.status === 'active' ? '#00AA00' : '#999999',
        weight: cable.type === 'backbone' ? 6 : cable.type === 'feeder' ? 5 : cable.type === 'distribution' ? 4 : 2,
        opacity: 0.8,
        dashArray: cable.status === 'projected' ? '10, 10' : undefined,
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
          <p style="margin: 4px 0;"><strong>Origem:</strong> ${startBox?.name || 'Nao definida'}</p>
          <p style="margin: 4px 0;"><strong>Destino:</strong> ${endBox?.name || 'Nao definido'}</p>
          <button onclick="window.editCablePath('${cable.id}')" style="margin-top: 8px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">
            Editar traçado
          </button>
        </div>
      `);

      polyline.addTo(cablesLayer.current);
    });
  }, [currentNetwork?.cables, currentNetwork?.boxes, isMapReady]);

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
    const startBox = cableStartBox ? currentNetwork?.boxes.find((b: any) => b.id === cableStartBox) : null;
    const endBox = cableEndBox ? currentNetwork?.boxes.find((b: any) => b.id === cableEndBox) : null;
    if (cableWaypoints.length < 2 && (!startBox || !endBox)) return;

    addCable({
      name: cableName.trim() || (startBox && endBox ? `Cabo ${startBox.name} -> ${endBox.name}` : `Cabo Livre ${new Date().toLocaleTimeString('pt-BR')}`),
      type: cableType,
      model: cableModel,
      fiberCount: cableFiberCount,
      looseTubeCount,
      fibersPerTube,
      startPoint: cableStartBox || '',
      endPoint: cableEndBox || '',
      path: cableWaypoints,
      length: calculateCableLength(cableWaypoints, startBox?.position, endBox?.position),
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
    setCableModel(CABLE_MODEL_OPTIONS.find((item) => item.category === cableType)?.id || 'AS-80');
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
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

  const handleStartEditCablePath = (cableId: string) => {
    if (!currentNetwork) return;
    const cable = currentNetwork.cables.find((item: any) => item.id === cableId);
    if (!cable) return;
    setEditingCableId(cable.id);
    setCableStartBox(cable.startPoint);
    setCableEndBox(cable.endPoint);
    setCableType(cable.type);
    setCableModel(cable.model || 'AS-80');
    setLooseTubeCount(cable.looseTubeCount || 1);
    setFibersPerTube(cable.fibersPerTube || 12);
    setCableFiberCount(cable.fiberCount);
    setCableWaypoints(cable.path || []);
    setShowAddCable(false);
    setClickMode('editCable');
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
    const cable = currentNetwork.cables.find((item: any) => item.id === editingCableId);
    if (!cable) return;
    const startBox = cable.startPoint ? currentNetwork.boxes.find((b: any) => b.id === cable.startPoint) : null;
    const endBox = cable.endPoint ? currentNetwork.boxes.find((b: any) => b.id === cable.endPoint) : null;

    updateCable(cable.id, {
      path: cableWaypoints,
      length: calculateCableLength(cableWaypoints, startBox?.position, endBox?.position),
    });

    handleCancelEditCablePath();
  };

  // Expor funções para o popup
  useEffect(() => {
    (window as any).editBox = (boxId: string) => {
      const box = currentNetwork?.boxes.find((b: any) => b.id === boxId);
      if (box) {
        selectBox(box);
        setEditing(true);
      }
    };
    
    (window as any).deleteBox = (boxId: string) => {
      if (confirm('Tem certeza que deseja excluir esta caixa?')) {
        removeBox(boxId);
      }
    };
    
    (window as any).editCablePath = (cableId: string) => {
      handleStartEditCablePath(cableId);
    };
  }, [currentNetwork?.boxes, selectBox, setEditing, removeBox, handleStartEditCablePath]);

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
              Satélite
            </>
          ) : (
            <>
              <Map className="w-4 h-4 mr-1" />
              Mapa
            </>
          )}
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

      {/* Informações da rede */}
      {currentNetwork && (
        <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <h3 className="font-bold text-sm">{currentNetwork.name}</h3>
          <div className="text-xs text-gray-600 mt-1">
            <p>Caixas: {currentNetwork.boxes.length}</p>
            <p>Reservas: {(currentNetwork.reserves || []).length}</p>
            <p>Cabos: {currentNetwork.cables.length}</p>
            <p>Fusões: {currentNetwork.fusions.length}</p>
          </div>
        </div>
      )}

      {(clickMode === 'addCable' || clickMode === 'editCable') && (
        <div className="absolute left-4 bottom-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border w-[320px]">
          <h4 className="text-sm font-semibold">
            {clickMode === 'editCable' ? 'Editando traçado do cabo' : 'Desenhando novo cabo'}
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            Clique no mapa para adicionar pontos intermediários.
          </p>
          <p className="text-xs mt-2">
            Pontos no traçado: <strong>{cableWaypoints.length}</strong>
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
                  Salvar traçado
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancelEditCablePath}>
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Container do mapa */}
      <div 
        ref={mapRef} 
        style={{ height, width: '100%' }}
        className="rounded-lg border overflow-hidden"
      />

      {/* Modal de adicionar caixa */}
      <Dialog open={showAddBox} onOpenChange={setShowAddBox}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Caixa</DialogTitle>
          </DialogHeader>
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
                  <SelectItem value="CTO">CTO - Caixa de Terminação</SelectItem>
                  <SelectItem value="DIO">DIO - Distribuição Interna</SelectItem>
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
                Caixa será inserida no traçado do cabo selecionado (opção de sangria/passagem direta disponível no detalhe da caixa).
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
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReserve} onOpenChange={setShowAddReserve}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Reserva</DialogTitle>
          </DialogHeader>
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
                Reserva será inserida no traçado do cabo selecionado.
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
              <Label>Caixa de Origem</Label>
              <Select value={cableStartBox || '__none__'} onValueChange={(v) => setCableStartBox(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem origem</SelectItem>
                  {currentNetwork?.boxes.map((box: any) => (
                    <SelectItem key={box.id} value={box.id}>
                      {box.name} ({box.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Caixa de Destino</Label>
              <Select value={cableEndBox || '__none__'} onValueChange={(v) => setCableEndBox(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem destino</SelectItem>
                  {currentNetwork?.boxes
                    .filter((b: any) => b.id !== cableStartBox)
                    .map((box: any) => (
                      <SelectItem key={box.id} value={box.id}>
                        {box.name} ({box.type})
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
                  <SelectItem value="drop">Drop (Última milha)</SelectItem>
                  <SelectItem value="distribution">Distribuição</SelectItem>
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




