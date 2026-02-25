import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Box as BoxType, Cable as CableType, City, Pop, Position } from '@/types/ftth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Network,
  Box,
  Route,
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  Edit3,
  Save,
  X,
  Activity,
  MapPin,
  Zap,
  Settings,
  Building2,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';

type ExplorerMapEntityType = 'pop' | 'box' | 'reserve';

interface ExplorerFolder {
  id: string;
  name: string;
  parentId: string | null;
}

interface ExplorerElement {
  id: string;
  name: string;
  parentFolderId: string | null;
  type: 'generic' | ExplorerMapEntityType;
  linkedEntityId?: string;
  linkedEntityType?: ExplorerMapEntityType;
}

interface MapPointResponseDetail {
  requestId: string;
  position: Position;
}

const ROOT_FOLDER_ID = '__root__';
const SYSTEM_FOLDER_STATIC_IDS = ['boxes', 'cables', 'reserves', 'popsWithoutCity'] as const;

const isValidCustomFolderName = (value: string) => value.trim().length > 0;

const createExplorerId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const BoxDetail = lazy(() =>
  import('./BoxDetail').then((module) => ({ default: module.BoxDetail }))
);
const CableDetail = lazy(() =>
  import('./CableDetail').then((module) => ({ default: module.CableDetail }))
);

export function NetworkPanel() {
  const {
    currentNetwork,
    createNetwork,
    exportNetwork,
    importNetwork,
    resetNetwork,
    removeBox,
    removePop,
    removeCable,
    removeReserve,
    selectPop,
    selectBox,
    addCity,
    addPop,
    addBox,
    addReserve,
  } = useNetworkStore();

  const [showNewNetwork, setShowNewNetwork] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkDescription, setNewNetworkDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoxForDetail, setSelectedBoxForDetail] = useState<BoxType | null>(null);
  const [selectedCableForDetail, setSelectedCableForDetail] = useState<CableType | null>(null);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));

  const [showAddCity, setShowAddCity] = useState(false);
  const [showAddPop, setShowAddPop] = useState(false);
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [showAddElement, setShowAddElement] = useState(false);
  const [cityName, setCityName] = useState('');
  const [citySigla, setCitySigla] = useState('');
  const [cityState, setCityState] = useState('');
  const [popName, setPopName] = useState('');
  const [popCityId, setPopCityId] = useState('');
  const [popNewCityName, setPopNewCityName] = useState('');
  const [popNewCitySigla, setPopNewCitySigla] = useState('');
  const [popNewCityState, setPopNewCityState] = useState('');
  const [popStatus, setPopStatus] = useState<Pop['status'] | ''>('');
  const [popPosition, setPopPosition] = useState<Position | null>(null);
  const [folders, setFolders] = useState<ExplorerFolder[]>([]);
  const [elements, setElements] = useState<ExplorerElement[]>([]);
  const [folderName, setFolderName] = useState('');
  const [folderParentId, setFolderParentId] = useState<string>(ROOT_FOLDER_ID);
  const [elementName, setElementName] = useState('');
  const [elementFolderId, setElementFolderId] = useState<string>(ROOT_FOLDER_ID);
  const [elementType, setElementType] = useState<ExplorerElement['type'] | ''>('');
  const [elementPosition, setElementPosition] = useState<Position | null>(null);
  const [elementMapPopCityId, setElementMapPopCityId] = useState('');
  const [elementMapPopNewCityName, setElementMapPopNewCityName] = useState('');
  const [elementMapPopNewCitySigla, setElementMapPopNewCitySigla] = useState('');
  const [elementMapPopNewCityState, setElementMapPopNewCityState] = useState('');
  const [elementMapPopStatus, setElementMapPopStatus] = useState<Pop['status'] | ''>('');
  const [elementMapBoxType, setElementMapBoxType] = useState<'CEO' | 'CTO' | 'DIO' | ''>('');
  const [elementMapBoxStatus, setElementMapBoxStatus] = useState<BoxType['status'] | ''>('');
  const [elementMapBoxCapacity, setElementMapBoxCapacity] = useState('');
  const [elementMapReserveStatus, setElementMapReserveStatus] = useState<'active' | 'inactive' | ''>('');
  const [pointPickRequest, setPointPickRequest] = useState<{ id: string; target: 'pop' | 'element' } | null>(null);
  const [returnDialogAfterPick, setReturnDialogAfterPick] = useState<'pop' | 'element' | null>(null);
  const [suppressPopResetOnClose, setSuppressPopResetOnClose] = useState(false);
  const [suppressElementResetOnClose, setSuppressElementResetOnClose] = useState(false);
  const currentNetworkId = currentNetwork?.id || null;
  const systemFolderIds = useMemo(() => {
    const dynamicCityFolders = (currentNetwork?.cities || []).map((city) => `city:${city.id}`);
    return new Set<string>([...SYSTEM_FOLDER_STATIC_IDS, ...dynamicCityFolders]);
  }, [currentNetwork?.cities]);

  const normalizeExplorerParent = useCallback(
    (parentId: string | null | undefined, validCustomIds: Set<string>): string | null => {
      if (!parentId || parentId === ROOT_FOLDER_ID) return null;
      if (systemFolderIds.has(parentId)) return parentId;
      if (validCustomIds.has(parentId)) return parentId;
      return null;
    },
    [systemFolderIds]
  );

  const handleCreateNetwork = () => {
    if (!newNetworkName.trim()) return;
    createNetwork(newNetworkName.trim(), newNetworkDescription.trim());
    setShowNewNetwork(false);
    setNewNetworkName('');
    setNewNetworkDescription('');
  };

  const handleExport = () => {
    const data = exportNetwork();
    if (data) {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentNetwork?.name || 'rede'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      if (importNetwork(data)) {
        toast.success('Rede importada com sucesso!');
      } else {
        toast.error('Erro ao importar rede. Verifique o arquivo.');
      }
    };
    reader.readAsText(file);
  };

  const toggleBoxExpansion = (boxId: string) => {
    const next = new Set(expandedBoxes);
    if (next.has(boxId)) {
      next.delete(boxId);
    } else {
      next.add(boxId);
    }
    setExpandedBoxes(next);
  };

  const toggleFolder = (folderId: string) => {
    const next = new Set(expandedFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedFolders(next);
  };

  const filteredBoxes = useMemo(
    () =>
      currentNetwork?.boxes.filter((box) =>
        [box.name, box.type, box.address || '']
          .join(' ')
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      ) || [],
    [currentNetwork?.boxes, searchTerm]
  );

  const filteredCables = useMemo(
    () =>
      currentNetwork?.cables.filter((cable) =>
        [cable.name, cable.type].join(' ').toLowerCase().includes(searchTerm.toLowerCase())
      ) || [],
    [currentNetwork?.cables, searchTerm]
  );

  const filteredPops = useMemo(() => {
    if (!currentNetwork) return [];
    return (currentNetwork.pops || []).filter((pop) => {
      const city = (currentNetwork.cities || []).find((item) => item.id === pop.cityId);
      const cityLabel = city ? `${city.sigla} ${city.name}` : '';
      return [pop.name, pop.status, cityLabel].join(' ').toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [currentNetwork, searchTerm]);

  const popsByCity = useMemo(() => {
    const map = new Map<string, Pop[]>();
    if (!currentNetwork) return map;
    (currentNetwork.pops || []).forEach((pop) => {
      if (!map.has(pop.cityId)) {
        map.set(pop.cityId, []);
      }
      map.get(pop.cityId)!.push(pop);
    });
    return map;
  }, [currentNetwork]);

  const popsWithoutCity = useMemo(() => {
    if (!currentNetwork) return [];
    return (currentNetwork.pops || []).filter(
      (pop) => !(currentNetwork.cities || []).some((city) => city.id === pop.cityId)
    );
  }, [currentNetwork]);

  useEffect(() => {
    if (!currentNetworkId) {
      setFolders([]);
      setElements([]);
      return;
    }

    const saved = localStorage.getItem(`ftth:explorer:${currentNetworkId}`);
    if (!saved) {
      setFolders([]);
      setElements([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as { folders?: ExplorerFolder[]; elements?: ExplorerElement[] };
      const rawFolders = Array.isArray(parsed.folders) ? parsed.folders : [];
      const validCustomIds = new Set(rawFolders.map((folder) => folder.id));

      const sanitizedFolders = rawFolders
        .filter((folder) => Boolean(folder?.id) && isValidCustomFolderName(folder?.name || ''))
        .map((folder) => ({
          id: folder.id,
          name: folder.name.trim(),
          parentId:
            folder.parentId === folder.id
              ? null
              : normalizeExplorerParent(folder.parentId, validCustomIds),
        }));
      const sanitizedFolderIds = new Set(sanitizedFolders.map((folder) => folder.id));

      const rawElements = Array.isArray(parsed.elements) ? parsed.elements : [];
      const sanitizedElements = rawElements
        .filter((element) => Boolean(element?.id) && isValidCustomFolderName(element?.name || ''))
        .map((element) => ({
          ...element,
          name: element.name.trim(),
          parentFolderId: normalizeExplorerParent(element.parentFolderId, sanitizedFolderIds),
        }));

      setFolders(sanitizedFolders);
      setElements(sanitizedElements);
    } catch {
      setFolders([]);
      setElements([]);
    }
  }, [currentNetworkId, normalizeExplorerParent, systemFolderIds]);

  useEffect(() => {
    if (!currentNetwork) return;
    setElements((prev) =>
      prev.filter((element) => {
        if (!element.linkedEntityId || !element.linkedEntityType) return true;
        if (element.linkedEntityType === 'pop') {
          return (currentNetwork.pops || []).some((pop) => pop.id === element.linkedEntityId);
        }
        if (element.linkedEntityType === 'box') {
          return (currentNetwork.boxes || []).some((box) => box.id === element.linkedEntityId);
        }
        if (element.linkedEntityType === 'reserve') {
          return (currentNetwork.reserves || []).some((reserve) => reserve.id === element.linkedEntityId);
        }
        return true;
      })
    );
  }, [currentNetwork]);

  useEffect(() => {
    if (!currentNetwork) return;
    localStorage.setItem(
      `ftth:explorer:${currentNetwork.id}`,
      JSON.stringify({ folders, elements })
    );
  }, [currentNetwork, folders, elements]);

  const folderChildrenMap = useMemo(() => {
    const map = new Map<string | null, ExplorerFolder[]>();
    folders.forEach((folder) => {
      if (!map.has(folder.parentId)) map.set(folder.parentId, []);
      map.get(folder.parentId)!.push(folder);
    });
    return map;
  }, [folders]);

  const folderElementsMap = useMemo(() => {
    const map = new Map<string | null, ExplorerElement[]>();
    elements.forEach((element) => {
      if (!map.has(element.parentFolderId)) map.set(element.parentFolderId, []);
      map.get(element.parentFolderId)!.push(element);
    });
    return map;
  }, [elements]);

  const allFolderOptions = useMemo(() => {
    const base = [{ id: ROOT_FOLDER_ID, label: 'Raiz (fora de pasta)' }];
    const systemFolders = [
      { id: 'boxes', label: 'Caixas (sistema)' },
      { id: 'cables', label: 'Cabos (sistema)' },
      { id: 'reserves', label: 'Reservas (sistema)' },
      { id: 'popsWithoutCity', label: 'POPs sem cidade (sistema)' },
      ...((currentNetwork?.cities || []).map((city) => ({
        id: `city:${city.id}`,
        label: `${city.sigla} - ${city.name} (sistema)`,
      }))),
    ];
    return [...base, ...systemFolders, ...folders.map((f) => ({ id: f.id, label: f.name }))];
  }, [folders, currentNetwork?.cities]);
  const validFolderOptionIds = useMemo(() => new Set(allFolderOptions.map((option) => option.id)), [allFolderOptions]);

  const getDescendantFolderIds = (folderId: string): string[] => {
    const descendants: string[] = [];
    const stack = [folderId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      descendants.push(current);
      const children = folders.filter((folder) => folder.parentId === current);
      children.forEach((child) => stack.push(child.id));
    }
    return descendants;
  };

  const resetCityForm = () => {
    setCityName('');
    setCitySigla('');
    setCityState('');
  };

  const resetPopForm = () => {
    setPopName('');
    setPopCityId('');
    setPopNewCityName('');
    setPopNewCitySigla('');
    setPopNewCityState('');
    setPopStatus('');
    setPopPosition(null);
  };

  const resetFolderForm = () => {
    setFolderName('');
    setFolderParentId(ROOT_FOLDER_ID);
  };

  const resetElementForm = () => {
    setElementName('');
    setElementFolderId(ROOT_FOLDER_ID);
    setElementType('');
    setElementPosition(null);
    setElementMapPopCityId('');
    setElementMapPopNewCityName('');
    setElementMapPopNewCitySigla('');
    setElementMapPopNewCityState('');
    setElementMapPopStatus('');
    setElementMapBoxType('');
    setElementMapBoxStatus('');
    setElementMapBoxCapacity('');
    setElementMapReserveStatus('');
  };

  const openAddFolderModal = (parentId: string | null = null) => {
    resetFolderForm();
    setFolderParentId(parentId || ROOT_FOLDER_ID);
    setShowAddFolder(true);
  };

  const openAddElementModal = (
    parentFolderId: string | null = null,
    suggestedType: ExplorerElement['type'] | '' = ''
  ) => {
    resetElementForm();
    setElementFolderId(parentFolderId || ROOT_FOLDER_ID);
    setElementType(suggestedType);
    setShowAddElement(true);
  };

  const requestPointFromMap = (target: 'pop' | 'element') => {
    const requestId = createExplorerId();
    setPointPickRequest({ id: requestId, target });
    setReturnDialogAfterPick(target);
    if (target === 'pop') {
      setSuppressPopResetOnClose(true);
      setShowAddPop(false);
    } else {
      setSuppressElementResetOnClose(true);
      setShowAddElement(false);
    }
    window.dispatchEvent(
      new CustomEvent('ftth:request-map-point', {
        detail: { requestId },
      })
    );
  };

  useEffect(() => {
    const handleMapPointSelected = (event: Event) => {
      const custom = event as CustomEvent<MapPointResponseDetail>;
      if (!custom.detail || !pointPickRequest) return;
      if (custom.detail.requestId !== pointPickRequest.id) return;

      if (pointPickRequest.target === 'pop') {
        setPopPosition(custom.detail.position);
        setShowAddPop(true);
      } else {
        setElementPosition(custom.detail.position);
        setShowAddElement(true);
      }

      setPointPickRequest(null);
      setReturnDialogAfterPick(null);
    };

    window.addEventListener('ftth:map-point-selected', handleMapPointSelected as EventListener);
    return () => {
      window.removeEventListener('ftth:map-point-selected', handleMapPointSelected as EventListener);
    };
  }, [pointPickRequest]);

  const handleAddCityFromSidebar = () => {
    if (!cityName.trim() || !citySigla.trim()) return;
    addCity({
      name: cityName.trim(),
      sigla: citySigla.trim().toUpperCase(),
      state: cityState.trim() || undefined,
    });
    setShowAddCity(false);
    resetCityForm();
  };

  const handleAddPopFromSidebar = () => {
    if (!popName.trim() || !popStatus) return;
    if (!popPosition) return;

    let cityId = popCityId;
    if (!cityId && popNewCityName.trim() && popNewCitySigla.trim()) {
      const createdCity = addCity({
        name: popNewCityName.trim(),
        sigla: popNewCitySigla.trim().toUpperCase(),
        state: popNewCityState.trim() || undefined,
      });
      cityId = createdCity.id;
    }
    if (!cityId) return;

    addPop({
      cityId,
      name: popName.trim(),
      position: popPosition,
      status: popStatus as Pop['status'],
    });

    setShowAddPop(false);
    resetPopForm();
  };

  const handleAddFolder = () => {
    if (!folderName.trim()) return;
    if (!validFolderOptionIds.has(folderParentId)) {
      toast.error('Pasta pai invalida.');
      return;
    }
    const parentId = folderParentId === ROOT_FOLDER_ID ? null : folderParentId;
    const normalizedName = folderName.trim();

    const duplicate = folders.some(
      (folder) => folder.parentId === parentId && folder.name.toLowerCase() === normalizedName.toLowerCase()
    );
    if (duplicate) {
      toast.error('Ja existe uma pasta com este nome nesse nivel.');
      return;
    }

    const createdId = createExplorerId();
    setFolders((prev) => [
      ...prev,
      {
        id: createdId,
        name: normalizedName,
        parentId,
      },
    ]);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (parentId) {
        const parentExpandedId = systemFolderIds.has(parentId) || parentId === 'root'
          ? parentId
          : `custom:${parentId}`;
        next.add(parentExpandedId);
      } else {
        next.add('root');
      }
      next.add(`custom:${createdId}`);
      return next;
    });
    setShowAddFolder(false);
    resetFolderForm();
  };

  const handleRemoveFolder = (folderId: string) => {
    const idsToRemove = new Set(getDescendantFolderIds(folderId));
    setFolders((prev) => prev.filter((folder) => !idsToRemove.has(folder.id)));
    setElements((prev) => prev.filter((element) => !idsToRemove.has(element.parentFolderId || '')));
  };

  const handleAddElement = () => {
    if (!elementName.trim() || !elementType) return;
    if (!validFolderOptionIds.has(elementFolderId)) {
      toast.error('Pasta selecionada invalida.');
      return;
    }

    const parentFolderId = elementFolderId === ROOT_FOLDER_ID ? null : elementFolderId;
    let linkedEntityId: string | undefined;
    let linkedEntityType: ExplorerMapEntityType | undefined;

    if (elementType !== 'generic') {
      if (!elementPosition) return;

      if (elementType === 'pop') {
        if (!elementMapPopStatus) return;
        let cityId = elementMapPopCityId;
        if (!cityId && elementMapPopNewCityName.trim() && elementMapPopNewCitySigla.trim()) {
          const createdCity = addCity({
            name: elementMapPopNewCityName.trim(),
            sigla: elementMapPopNewCitySigla.trim().toUpperCase(),
            state: elementMapPopNewCityState.trim() || undefined,
          });
          cityId = createdCity.id;
        }
        if (!cityId) return;
        const created = addPop({
          cityId,
          name: elementName.trim(),
          position: elementPosition,
          status: elementMapPopStatus as Pop['status'],
        });
        linkedEntityId = created.id;
        linkedEntityType = 'pop';
      } else if (elementType === 'box') {
        const parsedCapacity = Number.parseInt(elementMapBoxCapacity, 10);
        if (!elementMapBoxType || Number.isNaN(parsedCapacity) || parsedCapacity < 1) return;
        if (!elementMapBoxStatus) return;
        const created = addBox({
          name: elementName.trim(),
          type: elementMapBoxType as 'CEO' | 'CTO' | 'DIO',
          position: elementPosition,
          capacity: parsedCapacity,
          status: elementMapBoxStatus as BoxType['status'],
        });
        linkedEntityId = created.id;
        linkedEntityType = 'box';
      } else if (elementType === 'reserve') {
        if (!elementMapReserveStatus) return;
        const created = addReserve({
          name: elementName.trim(),
          position: elementPosition,
          status: elementMapReserveStatus,
        });
        linkedEntityId = created.id;
        linkedEntityType = 'reserve';
      }
    }

    setElements((prev) => [
      ...prev,
      {
        id: createExplorerId(),
        name: elementName.trim(),
        parentFolderId,
        type: elementType,
        linkedEntityId,
        linkedEntityType,
      },
    ]);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (parentFolderId) {
        next.add(parentFolderId);
      } else {
        next.add('root');
      }
      return next;
    });
    setShowAddElement(false);
    resetElementForm();
  };

  const handleRemoveElement = (elementId: string) => {
    setElements((prev) => prev.filter((element) => element.id !== elementId));
  };

  const handleOpenLinkedElement = (element: ExplorerElement) => {
    if (!element.linkedEntityId || !element.linkedEntityType || !currentNetwork) return;
    if (element.linkedEntityType === 'pop') {
      const pop = (currentNetwork.pops || []).find((item) => item.id === element.linkedEntityId);
      if (pop) selectPop(pop);
      return;
    }
    if (element.linkedEntityType === 'box') {
      const box = (currentNetwork.boxes || []).find((item) => item.id === element.linkedEntityId);
      if (box) {
        selectBox(box);
        setSelectedBoxForDetail(box);
      }
    }
  };

  const renderElementRow = (element: ExplorerElement) => (
    <div key={element.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100">
      <span className="text-xs text-gray-700 truncate flex-1">{element.name}</span>
      {element.linkedEntityId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={() => handleOpenLinkedElement(element)}
        >
          Mapa
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 text-red-600"
        onClick={() => handleRemoveElement(element.id)}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );

  const renderExplorerFolder = (folder: ExplorerFolder) => {
    const folderId = `custom:${folder.id}`;
    const childFolders = folderChildrenMap.get(folder.id) || [];
    const childElements = folderElementsMap.get(folder.id) || [];

    return (
      <div key={folder.id} className="space-y-1">
        <div className="flex items-center gap-1">
          <button
            className="flex-1 flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-100"
            onClick={() => toggleFolder(folderId)}
          >
            {expandedFolders.has(folderId) ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )}
            {renderFolderIcon(folderId)}
            <span className="truncate">{folder.name}</span>
            <Badge variant="outline" className="text-[10px] ml-auto">
              {childFolders.length + childElements.length}
            </Badge>
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Nova subpasta"
            onClick={() => openAddFolderModal(folder.id)}
          >
            <Folder className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="Novo item na pasta"
            onClick={() => openAddElementModal(folder.id)}
          >
            <Plus className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-600"
            onClick={() => handleRemoveFolder(folder.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {expandedFolders.has(folderId) && (
          <div className="ml-4 space-y-1">
            {childFolders.map((child) => renderExplorerFolder(child))}
            {childElements.map((element) => renderElementRow(element))}
            {childFolders.length === 0 && childElements.length === 0 && (
              <p className="text-xs text-gray-500 px-2 py-1">Pasta vazia</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFolderIcon = (folderId: string) =>
    expandedFolders.has(folderId) ? (
      <FolderOpen className="w-4 h-4 text-amber-600" />
    ) : (
      <Folder className="w-4 h-4 text-amber-600" />
    );

  const popsWithoutCityFolders = folderChildrenMap.get('popsWithoutCity') || [];
  const popsWithoutCityElements = folderElementsMap.get('popsWithoutCity') || [];
  const boxesFolders = folderChildrenMap.get('boxes') || [];
  const boxesElements = folderElementsMap.get('boxes') || [];
  const cablesFolders = folderChildrenMap.get('cables') || [];
  const cablesElements = folderElementsMap.get('cables') || [];
  const reservesFolders = folderChildrenMap.get('reserves') || [];
  const reservesElements = folderElementsMap.get('reserves') || [];
  const showPopsWithoutCitySection =
    popsWithoutCity.length > 0 || popsWithoutCityFolders.length > 0 || popsWithoutCityElements.length > 0;
  const showBoxesSection = filteredBoxes.length > 0 || boxesFolders.length > 0 || boxesElements.length > 0;
  const showCablesSection = filteredCables.length > 0 || cablesFolders.length > 0 || cablesElements.length > 0;
  const showReservesSection =
    (currentNetwork?.reserves || []).length > 0 || reservesFolders.length > 0 || reservesElements.length > 0;

  if (!currentNetwork) {
    return (
      <Card className="w-80 h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5" />
            Rede FTTH
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">Nenhuma rede criada</p>
            <Button onClick={() => setShowNewNetwork(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Criar Rede
            </Button>
          </div>

          {showNewNetwork && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <div>
                <Label>Nome da Rede</Label>
                <Input
                  value={newNetworkName}
                  onChange={(e) => setNewNetworkName(e.target.value)}
                  placeholder="Ex: Rede Centro"
                />
              </div>
              <div>
                <Label>Descricao (opcional)</Label>
                <Input
                  value={newNetworkDescription}
                  onChange={(e) => setNewNetworkDescription(e.target.value)}
                  placeholder="Descricao da rede"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateNetwork} className="flex-1">
                  <Save className="w-4 h-4 mr-1" />
                  Criar
                </Button>
                <Button variant="outline" onClick={() => setShowNewNetwork(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 border-t pt-4">
            <Label className="mb-2 block">Importar Rede</Label>
            <Input type="file" accept=".json" onChange={handleImport} className="text-sm" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-80 h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5" />
            {currentNetwork.name}
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('import-file')?.click()}
            >
              <Upload className="w-4 h-4" />
            </Button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm('Tem certeza que deseja limpar a rede?')) {
                  resetNetwork();
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <Tabs defaultValue="structure" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="structure">Estrutura</TabsTrigger>
              <TabsTrigger value="boxes">
                <Box className="w-4 h-4 mr-1" />
                Caixas
              </TabsTrigger>
              <TabsTrigger value="cables">
                <Route className="w-4 h-4 mr-1" />
                Cabos
              </TabsTrigger>
              <TabsTrigger value="pops">
                <Building2 className="w-4 h-4 mr-1" />
                POPs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="structure" className="flex-1 overflow-hidden">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Button size="sm" variant="outline" onClick={() => setShowAddCity(true)}>
                  <Plus className="w-3 h-3 mr-1" />
                  Cidade
                </Button>
                <Button size="sm" onClick={() => setShowAddPop(true)}>
                  <Plus className="w-3 h-3 mr-1" />
                  POP
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAddFolderModal(null)}>
                  <Plus className="w-3 h-3 mr-1" />
                  Pasta
                </Button>
                <Button size="sm" variant="outline" onClick={() => openAddElementModal(null)}>
                  <Plus className="w-3 h-3 mr-1" />
                  Elemento
                </Button>
              </div>

              {returnDialogAfterPick && (
                <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                  Selecao de ponto ativa: clique no mapa para continuar.
                </div>
              )}

              <ScrollArea className="h-[calc(100vh-340px)]">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <button
                      className="flex-1 flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-100"
                      onClick={() => toggleFolder('root')}
                    >
                      {expandedFolders.has('root') ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                      {renderFolderIcon('root')}
                      <span className="font-medium">{currentNetwork.name}</span>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Nova pasta na raiz"
                      onClick={() => openAddFolderModal(null)}
                    >
                      <Folder className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Novo item na raiz"
                      onClick={() => openAddElementModal(null)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  {expandedFolders.has('root') && (
                    <div className="ml-4 space-y-1">
                      {(folderChildrenMap.get(null) || []).map((folder) => renderExplorerFolder(folder))}
                      {(folderElementsMap.get(null) || []).map((element) => renderElementRow(element))}

                      {(currentNetwork.cities || []).map((city: City) => {
                        const cityFolderId = `city:${city.id}`;
                        const cityPops = popsByCity.get(city.id) || [];
                        const cityCustomFolders = folderChildrenMap.get(cityFolderId) || [];
                        const cityCustomElements = folderElementsMap.get(cityFolderId) || [];
                        return (
                          <div key={city.id} className="space-y-1">
                            <div className="flex items-center gap-1">
                              <button
                                className="flex-1 flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-gray-100"
                                onClick={() => toggleFolder(cityFolderId)}
                              >
                                {expandedFolders.has(cityFolderId) ? (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-500" />
                                )}
                                {renderFolderIcon(cityFolderId)}
                                <span>{city.sigla} - {city.name}</span>
                                <Badge variant="outline" className="text-[10px] ml-auto">
                                  {cityPops.length + cityCustomFolders.length + cityCustomElements.length}
                                </Badge>
                              </button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="Nova subpasta"
                                onClick={() => openAddFolderModal(cityFolderId)}
                              >
                                <Folder className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                title="Novo item na pasta"
                                onClick={() => openAddElementModal(cityFolderId)}
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  title="Novo POP nesta cidade"
                                  onClick={() => {
                                    resetPopForm();
                                    setShowAddPop(true);
                                    setPopCityId(city.id);
                                  }}
                                >
                                <Building2 className="w-3 h-3" />
                              </Button>
                            </div>
                            {expandedFolders.has(cityFolderId) && (
                              <div className="ml-4 space-y-1">
                                {cityCustomFolders.map((folder) => renderExplorerFolder(folder))}
                                {cityCustomElements.map((element) => renderElementRow(element))}
                                {cityPops.length === 0 ? (
                                  <p className="text-xs text-gray-500 px-2 py-1">Sem POPs</p>
                                ) : (
                                  cityPops.map((pop) => (
                                    <div key={pop.id} className="flex items-center gap-1">
                                      <button
                                        className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2"
                                        onClick={() => selectPop(pop)}
                                      >
                                        <Building2 className="w-3.5 h-3.5 text-violet-600" />
                                        <span>{pop.name}</span>
                                        <Badge variant="outline" className="text-[10px] ml-auto">
                                          {pop.status}
                                        </Badge>
                                      </button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 p-0 text-red-600"
                                        onClick={() => removePop(pop.id)}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {showPopsWithoutCitySection && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="flex-1 flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-100"
                              onClick={() => toggleFolder('popsWithoutCity')}
                            >
                              {expandedFolders.has('popsWithoutCity') ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                              )}
                              {renderFolderIcon('popsWithoutCity')}
                              <span>POPs sem cidade</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {popsWithoutCity.length + popsWithoutCityFolders.length + popsWithoutCityElements.length}
                              </Badge>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Nova subpasta"
                              onClick={() => openAddFolderModal('popsWithoutCity')}
                            >
                              <Folder className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Novo POP"
                              onClick={() => {
                                resetPopForm();
                                setShowAddPop(true);
                              }}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {expandedFolders.has('popsWithoutCity') && (
                            <div className="ml-4 space-y-1">
                              {popsWithoutCityFolders.map((folder) => renderExplorerFolder(folder))}
                              {popsWithoutCityElements.map((element) => renderElementRow(element))}
                              {popsWithoutCity.map((pop) => (
                                <div key={pop.id} className="flex items-center gap-1">
                                  <button
                                    className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2"
                                    onClick={() => selectPop(pop)}
                                  >
                                    <Building2 className="w-3.5 h-3.5 text-violet-600" />
                                    <span>{pop.name}</span>
                                  </button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => removePop(pop.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showBoxesSection && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="flex-1 flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-100"
                              onClick={() => toggleFolder('boxes')}
                            >
                              {expandedFolders.has('boxes') ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                              )}
                              {renderFolderIcon('boxes')}
                              <span>Caixas</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {filteredBoxes.length + boxesFolders.length + boxesElements.length}
                              </Badge>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Nova subpasta"
                              onClick={() => openAddFolderModal('boxes')}
                            >
                              <Folder className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Novo item na pasta"
                              onClick={() => openAddElementModal('boxes')}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {expandedFolders.has('boxes') && (
                            <div className="ml-4 space-y-1">
                              {boxesFolders.map((folder) => renderExplorerFolder(folder))}
                              {boxesElements.map((element) => renderElementRow(element))}
                              {filteredBoxes.map((box) => (
                                <div key={box.id} className="flex items-center gap-1">
                                  <button
                                    className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2"
                                    onClick={() => setSelectedBoxForDetail(box)}
                                  >
                                    <Box className="w-3.5 h-3.5 text-blue-600" />
                                    <span>{box.name}</span>
                                  </button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => removeBox(box.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showCablesSection && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="flex-1 flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-100"
                              onClick={() => toggleFolder('cables')}
                            >
                              {expandedFolders.has('cables') ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                              )}
                              {renderFolderIcon('cables')}
                              <span>Cabos</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {filteredCables.length + cablesFolders.length + cablesElements.length}
                              </Badge>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Nova subpasta"
                              onClick={() => openAddFolderModal('cables')}
                            >
                              <Folder className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Novo item na pasta"
                              onClick={() => openAddElementModal('cables')}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {expandedFolders.has('cables') && (
                            <div className="ml-4 space-y-1">
                              {cablesFolders.map((folder) => renderExplorerFolder(folder))}
                              {cablesElements.map((element) => renderElementRow(element))}
                              {filteredCables.map((cable) => (
                                <div key={cable.id} className="flex items-center gap-1">
                                  <button
                                    className="flex-1 text-left text-sm px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2"
                                    onClick={() => setSelectedCableForDetail(cable)}
                                  >
                                    <Route className="w-3.5 h-3.5 text-green-600" />
                                    <span>{cable.name}</span>
                                  </button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => removeCable(cable.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {showReservesSection && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="flex-1 flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-gray-100"
                              onClick={() => toggleFolder('reserves')}
                            >
                              {expandedFolders.has('reserves') ? (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                              )}
                              {renderFolderIcon('reserves')}
                              <span>Reservas</span>
                              <Badge variant="outline" className="text-[10px] ml-auto">
                                {(currentNetwork.reserves || []).length + reservesFolders.length + reservesElements.length}
                              </Badge>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Nova subpasta"
                              onClick={() => openAddFolderModal('reserves')}
                            >
                              <Folder className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="Novo item na pasta"
                              onClick={() => openAddElementModal('reserves')}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          {expandedFolders.has('reserves') && (
                            <div className="ml-4 space-y-1">
                              {reservesFolders.map((folder) => renderExplorerFolder(folder))}
                              {reservesElements.map((element) => renderElementRow(element))}
                              {(currentNetwork.reserves || []).map((reserve) => (
                                <div key={reserve.id} className="flex items-center gap-1">
                                  <div className="flex-1 text-sm px-2 py-1 rounded flex items-center gap-2 text-gray-700">
                                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                                    <span>{reserve.name}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-red-600"
                                    onClick={() => removeReserve(reserve.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {folders.length === 0 &&
                        elements.length === 0 &&
                        (currentNetwork.cities || []).length === 0 &&
                        !showBoxesSection &&
                        !showCablesSection &&
                        !showReservesSection &&
                        !showPopsWithoutCitySection && (
                          <p className="text-xs text-gray-500 px-2 py-1">Nenhum item para exibir.</p>
                        )}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="boxes" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredBoxes.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">Nenhuma caixa encontrada</div>
                  ) : (
                    filteredBoxes.map((box) => {
                      const activeFibers = box.fibers.filter((f) => f.status === 'active').length;
                      const isExpanded = expandedBoxes.has(box.id);

                      return (
                        <div key={box.id} className="border rounded-lg overflow-hidden">
                          <div
                            className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                            onClick={() => toggleBoxExpansion(box.id)}
                          >
                            <div className="flex items-center gap-2">
                              {box.type === 'CEO' && <Activity className="w-4 h-4 text-blue-500" />}
                              {box.type === 'CTO' && <Zap className="w-4 h-4 text-green-500" />}
                              {box.type === 'DIO' && <Settings className="w-4 h-4 text-orange-500" />}
                              <span className="font-medium text-sm">{box.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {activeFibers}/{box.capacity}
                              </Badge>
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 border-t bg-white">
                              <div className="text-xs text-gray-500 space-y-1">
                                <p>Tipo: {box.type}</p>
                                <p>Status: {box.status}</p>
                                {box.address && (
                                  <p className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {box.address}
                                  </p>
                                )}
                                <p>Fibras ativas: {activeFibers}</p>
                                <p>Fusoes: {box.fusions.length}</p>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 text-xs"
                                  onClick={() => setSelectedBoxForDetail(box)}
                                >
                                  <Edit3 className="w-3 h-3 mr-1" />
                                  Detalhes
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm('Tem certeza que deseja excluir esta caixa?')) {
                                      removeBox(box.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="cables" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredCables.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">Nenhum cabo encontrado</div>
                  ) : (
                    filteredCables.map((cable) => {
                      const startBox = currentNetwork.boxes.find((b) => b.id === cable.startPoint);
                      const endBox = currentNetwork.boxes.find((b) => b.id === cable.endPoint);

                      return (
                        <div
                          key={cable.id}
                          className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedCableForDetail(cable)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{cable.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {cable.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <p>
                              {startBox?.name || 'Sem origem'} {'->'} {endBox?.name || 'Sem destino'}
                            </p>
                            <p>
                              {cable.model || 'AS-80'} | {cable.fiberCount} fibras | {cable.length}m
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="pops" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredPops.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">Nenhum POP encontrado</div>
                  ) : (
                    filteredPops.map((pop) => {
                      const city = (currentNetwork.cities || []).find((c) => c.id === pop.cityId);
                      return (
                        <div
                          key={pop.id}
                          className="border rounded-lg p-3 bg-white cursor-pointer hover:bg-gray-50"
                          onClick={() => selectPop(pop)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{pop.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {pop.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <p>{city ? `${city.sigla} - ${city.name}` : 'Sem cidade'}</p>
                            <p>
                              DIO: {(pop.dios || []).length} | OLT: {(pop.olts || []).length} | Cabos:{' '}
                              {(pop.cables || []).length}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {selectedBoxForDetail && (
        <Suspense fallback={null}>
          <BoxDetail
            box={selectedBoxForDetail}
            open={!!selectedBoxForDetail}
            onOpenChange={(open: boolean) => !open && setSelectedBoxForDetail(null)}
          />
        </Suspense>
      )}

      {selectedCableForDetail && (
        <Suspense fallback={null}>
          <CableDetail
            cable={selectedCableForDetail}
            open={!!selectedCableForDetail}
            onOpenChange={(open: boolean) => !open && setSelectedCableForDetail(null)}
          />
        </Suspense>
      )}

      <Dialog
        open={showAddCity}
        onOpenChange={(open) => {
          setShowAddCity(open);
          if (!open) resetCityForm();
        }}
      >
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Nova Cidade</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome da cidade</Label>
              <Input
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Ex: Goiania"
              />
            </div>
            <div>
              <Label>Sigla</Label>
              <Input
                value={citySigla}
                onChange={(e) => setCitySigla(e.target.value.toUpperCase())}
                placeholder="Ex: GYN"
              />
            </div>
            <div>
              <Label>UF (opcional)</Label>
              <Input
                value={cityState}
                onChange={(e) => setCityState(e.target.value.toUpperCase())}
                placeholder="Ex: GO"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAddCityFromSidebar}
                className="flex-1"
                disabled={!cityName.trim() || !citySigla.trim()}
              >
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setShowAddCity(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddPop}
        onOpenChange={(open) => {
          setShowAddPop(open);
          if (!open) {
            if (suppressPopResetOnClose) {
              setSuppressPopResetOnClose(false);
              return;
            }
            resetPopForm();
            if (pointPickRequest?.target === 'pop') {
              setPointPickRequest(null);
              setReturnDialogAfterPick(null);
            }
          }
        }}
      >
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Novo POP</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do POP</Label>
              <Input value={popName} onChange={(e) => setPopName(e.target.value)} placeholder="Ex: POP Centro" />
            </div>
            <div>
              <Label>Cidade</Label>
              <Select value={popCityId || '__none__'} onValueChange={(v) => setPopCityId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Criar nova cidade</SelectItem>
                  {(currentNetwork.cities || []).map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.sigla} - {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!popCityId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nova cidade</Label>
                  <Input value={popNewCityName} onChange={(e) => setPopNewCityName(e.target.value)} placeholder="Ex: Brasilia" />
                </div>
                <div>
                  <Label>Sigla</Label>
                  <Input value={popNewCitySigla} onChange={(e) => setPopNewCitySigla(e.target.value.toUpperCase())} placeholder="Ex: BSB" />
                </div>
                <div className="col-span-2">
                  <Label>UF (opcional)</Label>
                  <Input value={popNewCityState} onChange={(e) => setPopNewCityState(e.target.value.toUpperCase())} placeholder="Ex: DF" />
                </div>
              </div>
            )}
            <div>
              <Label>Status</Label>
              <Select value={popStatus || '__none__'} onValueChange={(value) => setPopStatus(value === '__none__' ? '' : (value as Pop['status']))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione o status</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="maintenance">Manutencao</SelectItem>
                  <SelectItem value="projected">Projetado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>posicao no mapa</Label>
              <Button type="button" variant="outline" className="w-full" onClick={() => requestPointFromMap('pop')}>
                Selecionar no mapa
              </Button>
              {pointPickRequest?.target === 'pop' && (
                <p className="text-xs text-blue-600">Clique no mapa para definir a posicao.</p>
              )}
              <p className="text-xs text-gray-500">
                {popPosition
                  ? `Selecionado: ${popPosition.lat.toFixed(6)}, ${popPosition.lng.toFixed(6)}`
                  : 'Nenhum ponto selecionado'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleAddPopFromSidebar}
                className="flex-1"
                disabled={
                  !popName.trim() ||
                  !popStatus ||
                  !popPosition ||
                  (!popCityId && (!popNewCityName.trim() || !popNewCitySigla.trim()))
                }
              >
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setShowAddPop(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddFolder}
        onOpenChange={(open) => {
          setShowAddFolder(open);
          if (!open) resetFolderForm();
        }}
      >
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Nova Pasta</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome da pasta</Label>
              <Input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Ex: Cliente VIP" />
            </div>
            <div>
              <Label>Pasta pai</Label>
              <Select value={folderParentId} onValueChange={setFolderParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allFolderOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddFolder} className="flex-1" disabled={!folderName.trim()}>
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setShowAddFolder(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddElement}
        onOpenChange={(open) => {
          setShowAddElement(open);
          if (!open) {
            if (suppressElementResetOnClose) {
              setSuppressElementResetOnClose(false);
              return;
            }
            resetElementForm();
            if (pointPickRequest?.target === 'element') {
              setPointPickRequest(null);
              setReturnDialogAfterPick(null);
            }
          }
        }}
      >
        <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Novo Elemento</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do elemento</Label>
              <Input value={elementName} onChange={(e) => setElementName(e.target.value)} placeholder="Ex: POP Rua 12" />
            </div>
            <div>
              <Label>Pasta</Label>
              <Select value={elementFolderId} onValueChange={setElementFolderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allFolderOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={elementType || '__none__'}
                onValueChange={(value) => setElementType(value === '__none__' ? '' : (value as ExplorerElement['type']))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecione o tipo</SelectItem>
                  <SelectItem value="generic">Generico (sem mapa)</SelectItem>
                  <SelectItem value="pop">POP</SelectItem>
                  <SelectItem value="box">Caixa</SelectItem>
                  <SelectItem value="reserve">Reserva</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {elementType && elementType !== 'generic' && (
              <>
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                  Este tipo cria automaticamente o item no mapa.
                </p>
                <div className="space-y-2">
                  <Label>posicao no mapa</Label>
                  <Button type="button" variant="outline" className="w-full" onClick={() => requestPointFromMap('element')}>
                    Selecionar no mapa
                  </Button>
                  {pointPickRequest?.target === 'element' && (
                    <p className="text-xs text-blue-600">Clique no mapa para definir a posicao.</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {elementPosition
                      ? `Selecionado: ${elementPosition.lat.toFixed(6)}, ${elementPosition.lng.toFixed(6)}`
                      : 'Nenhum ponto selecionado'}
                  </p>
                </div>

                {elementType === 'pop' && (
                  <>
                    <div>
                      <Label>Cidade</Label>
                      <Select value={elementMapPopCityId || '__none__'} onValueChange={(v) => setElementMapPopCityId(v === '__none__' ? '' : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Criar nova cidade</SelectItem>
                          {(currentNetwork.cities || []).map((city) => (
                            <SelectItem key={city.id} value={city.id}>
                              {city.sigla} - {city.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!elementMapPopCityId && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Nova cidade</Label>
                          <Input
                            value={elementMapPopNewCityName}
                            onChange={(e) => setElementMapPopNewCityName(e.target.value)}
                            placeholder="Ex: Brasilia"
                          />
                        </div>
                        <div>
                          <Label>Sigla</Label>
                          <Input
                            value={elementMapPopNewCitySigla}
                            onChange={(e) => setElementMapPopNewCitySigla(e.target.value.toUpperCase())}
                            placeholder="Ex: BSB"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label>UF (opcional)</Label>
                          <Input
                            value={elementMapPopNewCityState}
                            onChange={(e) => setElementMapPopNewCityState(e.target.value.toUpperCase())}
                            placeholder="Ex: DF"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={elementMapPopStatus || '__none__'}
                        onValueChange={(value) => setElementMapPopStatus(value === '__none__' ? '' : (value as Pop['status']))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione o status</SelectItem>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="maintenance">Manutencao</SelectItem>
                          <SelectItem value="projected">Projetado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {elementType === 'box' && (
                  <>
                    <div>
                      <Label>Tipo da caixa</Label>
                      <Select
                        value={elementMapBoxType || '__none__'}
                        onValueChange={(value) => setElementMapBoxType(value === '__none__' ? '' : (value as 'CEO' | 'CTO' | 'DIO'))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione o tipo</SelectItem>
                          <SelectItem value="CEO">CEO</SelectItem>
                          <SelectItem value="CTO">CTO</SelectItem>
                          <SelectItem value="DIO">DIO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Status da caixa</Label>
                      <Select
                        value={elementMapBoxStatus || '__none__'}
                        onValueChange={(value) => setElementMapBoxStatus(value === '__none__' ? '' : (value as BoxType['status']))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione o status</SelectItem>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="inactive">Inativo</SelectItem>
                          <SelectItem value="maintenance">Manutencao</SelectItem>
                          <SelectItem value="projected">Projetado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Capacidade</Label>
                      <Input
                        type="number"
                        min={1}
                        value={elementMapBoxCapacity}
                        onChange={(e) => setElementMapBoxCapacity(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {elementType === 'reserve' && (
                  <div>
                    <Label>Status da reserva</Label>
                    <Select
                      value={elementMapReserveStatus || '__none__'}
                      onValueChange={(value) => setElementMapReserveStatus(value === '__none__' ? '' : (value as 'active' | 'inactive'))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Selecione o status</SelectItem>
                        <SelectItem value="active">Ativo</SelectItem>
                        <SelectItem value="inactive">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleAddElement}
                className="flex-1"
                disabled={
                  !elementName.trim() ||
                  !elementType ||
                  (elementType !== 'generic' && !elementPosition) ||
                  (elementType === 'pop' &&
                    (!elementMapPopStatus ||
                      (!elementMapPopCityId &&
                        (!elementMapPopNewCityName.trim() || !elementMapPopNewCitySigla.trim())))) ||
                  (elementType === 'box' &&
                    (!elementMapBoxType ||
                      !elementMapBoxStatus ||
                      !elementMapBoxCapacity.trim() ||
                      Number.isNaN(Number.parseInt(elementMapBoxCapacity, 10)) ||
                      Number.parseInt(elementMapBoxCapacity, 10) < 1)) ||
                  (elementType === 'reserve' && !elementMapReserveStatus)
                }
              >
                Adicionar
              </Button>
              <Button variant="outline" onClick={() => setShowAddElement(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

