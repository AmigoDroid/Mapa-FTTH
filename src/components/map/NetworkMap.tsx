import { useEffect, useRef, useState, useCallback } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Position } from '@/types/ftth';
import { BOX_ICONS } from '@/types/ftth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export function NetworkMap({ height = 'calc(100vh - 80px)' }: NetworkMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersLayer = useRef<any>(null);
  const cablesLayer = useRef<any>(null);
  const tileLayer = useRef<any>(null);
  const tempPolylineRef = useRef<any>(null);
  const clickModeRef = useRef<'normal' | 'addBox' | 'addCable'>('normal');
  const [isMapReady, setIsMapReady] = useState(false);
  
  const { 
    currentNetwork, 
    selectBox, 
    addBox, 
    removeBox,
    addCable,
    isEditing,
    setEditing,
  } = useNetworkStore();

  const [showAddBox, setShowAddBox] = useState(false);
  const [showAddCable, setShowAddCable] = useState(false);
  const [newBoxPosition, setNewBoxPosition] = useState<Position | null>(null);
  const [newBoxType, setNewBoxType] = useState<'CEO' | 'CTO' | 'DIO'>('CTO');
  const [newBoxName, setNewBoxName] = useState('');
  const [newBoxCapacity, setNewBoxCapacity] = useState(12);
  const [cableStartBox, setCableStartBox] = useState<string>('');
  const [cableEndBox, setCableEndBox] = useState<string>('');
  const [cableFiberCount, setCableFiberCount] = useState(12);
  const [cableType, setCableType] = useState<'drop' | 'distribution' | 'feeder' | 'backbone'>('distribution');
  const [clickMode, setClickMode] = useState<'normal' | 'addBox' | 'addCable'>('normal');
  const [mapView, setMapView] = useState<'street' | 'satellite'>('street');
  const [cableWaypoints, setCableWaypoints] = useState<Position[]>([]);

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
        setNewBoxPosition({ lat, lng });
        setShowAddBox(true);
        setClickMode('normal');
      } else if (clickModeRef.current === 'addCable') {
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

    if (clickMode !== 'addCable' || cableWaypoints.length === 0) {
      if (tempPolylineRef.current) {
        tempPolylineRef.current.remove();
        tempPolylineRef.current = null;
      }
      return;
    }

    const points = cableWaypoints.map((p) => [p.lat, p.lng]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.setLatLngs(points);
    } else {
      tempPolylineRef.current = L.polyline(points, {
        color: '#2563eb',
        weight: 3,
        opacity: 0.8,
        dashArray: '6, 8',
      }).addTo(leafletMap.current);
    }
  }, [clickMode, cableWaypoints]);

  useEffect(() => {
    if (showAddCable) return;
    setClickMode('normal');
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
  }, [showAddCable]);

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
  }, [currentNetwork?.boxes, isMapReady, createBoxIcon, selectBox]);

  // Atualizar cabos no mapa
  useEffect(() => {
    if (!isMapReady || !cablesLayer.current) return;
    
    const L = window.L;
    cablesLayer.current.clearLayers();

    currentNetwork?.cables.forEach((cable: any) => {
      const startBox = currentNetwork.boxes.find((b: any) => b.id === cable.startPoint);
      const endBox = currentNetwork.boxes.find((b: any) => b.id === cable.endPoint);
      
      if (!startBox || !endBox) return;

      const path = cable.path.length > 0 
        ? cable.path.map((p: any) => [p.lat, p.lng])
        : [[startBox.position.lat, startBox.position.lng], [endBox.position.lat, endBox.position.lng]];

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
          <p style="margin: 4px 0;"><strong>Fibras:</strong> ${cable.fiberCount}</p>
          <p style="margin: 4px 0;"><strong>Comprimento:</strong> ${cable.length}m</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${cable.status}</p>
        </div>
      `);

      polyline.addTo(cablesLayer.current);
    });
  }, [currentNetwork?.cables, currentNetwork?.boxes, isMapReady]);

  // Handlers para adicionar caixa
  const handleAddBox = () => {
    if (!newBoxPosition || !newBoxName) return;
    
    addBox({
      name: newBoxName,
      type: newBoxType,
      position: newBoxPosition,
      capacity: newBoxCapacity,
      status: 'active',
    });
    
    setShowAddBox(false);
    setNewBoxName('');
    setNewBoxPosition(null);
  };

  // Handlers para adicionar cabo
  const handleAddCable = () => {
    if (!cableStartBox || !cableEndBox) return;
    
    const startBox = currentNetwork?.boxes.find((b: any) => b.id === cableStartBox);
    const endBox = currentNetwork?.boxes.find((b: any) => b.id === cableEndBox);
    
    if (!startBox || !endBox) return;

    addCable({
      name: `Cabo ${startBox.name} → ${endBox.name}`,
      type: cableType,
      fiberCount: cableFiberCount,
      startPoint: cableStartBox,
      endPoint: cableEndBox,
      path: cableWaypoints,
      length: calculateCableLength(cableWaypoints, startBox.position, endBox.position),
      status: 'active',
      color: '#00AA00',
    });
    
    setShowAddCable(false);
    setCableStartBox('');
    setCableEndBox('');
    setCableWaypoints([]);
    if (tempPolylineRef.current) {
      tempPolylineRef.current.remove();
      tempPolylineRef.current = null;
    }
  };

  const calculateCableLength = (waypoints: Position[], start: Position, end: Position): number => {
    const points = [start, ...waypoints, end];
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
  }, [currentNetwork?.boxes, selectBox, setEditing, removeBox]);

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
          variant={clickMode === 'addCable' ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            if (clickMode === 'addCable') {
              setClickMode('normal');
              setCableWaypoints([]);
              if (tempPolylineRef.current) {
                tempPolylineRef.current.remove();
                tempPolylineRef.current = null;
              }
            } else {
              setShowAddCable(true);
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
            <p>Cabos: {currentNetwork.cables.length}</p>
            <p>Fusões: {currentNetwork.fusions.length}</p>
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

      {/* Modal de adicionar cabo */}
      <Dialog open={showAddCable} onOpenChange={setShowAddCable}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Novo Cabo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Caixa de Origem</Label>
              <Select value={cableStartBox} onValueChange={setCableStartBox}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
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
              <Select value={cableEndBox} onValueChange={setCableEndBox}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
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
              <Label>Quantidade de Fibras</Label>
              <Select 
                value={cableFiberCount.toString()} 
                onValueChange={(v) => setCableFiberCount(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 fibra</SelectItem>
                  <SelectItem value="2">2 fibras</SelectItem>
                  <SelectItem value="4">4 fibras</SelectItem>
                  <SelectItem value="6">6 fibras</SelectItem>
                  <SelectItem value="8">8 fibras</SelectItem>
                  <SelectItem value="12">12 fibras</SelectItem>
                  <SelectItem value="24">24 fibras</SelectItem>
                  <SelectItem value="36">36 fibras</SelectItem>
                  <SelectItem value="48">48 fibras</SelectItem>
                  <SelectItem value="72">72 fibras</SelectItem>
                  <SelectItem value="96">96 fibras</SelectItem>
                  <SelectItem value="144">144 fibras</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-blue-50 p-3 rounded text-sm">
              <p className="text-blue-800">
                <strong>Dica:</strong> Clique no mapa para adicionar pontos de passagem do cabo.
                {cableWaypoints.length > 0 && (
                  <span className="block mt-1">
                    Pontos adicionados: {cableWaypoints.length}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddCable} className="flex-1">Adicionar</Button>
              <Button variant="outline" onClick={() => {
                setShowAddCable(false);
                setCableWaypoints([]);
                setClickMode('normal');
              }}>Cancelar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
