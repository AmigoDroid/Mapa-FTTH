import { Edit, Map, Plus, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ClickMode, MapViewMode } from '../types';

interface MapToolbarProps {
  clickMode: ClickMode;
  mapView: MapViewMode;
  isEditing: boolean;
  onToggleMapView?: () => void;
  onToggleAddPop?: () => void;
  onToggleAddBox?: () => void;
  onToggleAddReserve?: () => void;
  onToggleAddCable?: () => void;
  onToggleEditing?: () => void;
}

export function MapToolbar({
  clickMode,
  mapView,
  isEditing,
  onToggleMapView,
  onToggleAddPop,
  onToggleAddBox,
  onToggleAddReserve,
  onToggleAddCable,
  onToggleEditing,
}: MapToolbarProps) {
  const hasVisibleControl = Boolean(
    onToggleMapView ||
      onToggleAddPop ||
      onToggleAddBox ||
      onToggleAddReserve ||
      onToggleAddCable ||
      onToggleEditing
  );

  if (!hasVisibleControl) return null;

  return (
    <div className="absolute top-4 left-4 z-[1000] flex gap-2">
      {onToggleMapView && (
        <Button variant="secondary" size="sm" onClick={onToggleMapView} className="shadow-lg">
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
      )}

      {onToggleAddPop && (
        <Button
          variant={clickMode === 'addPop' ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleAddPop}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addPop' ? 'Cancelar' : 'Adicionar POP'}
        </Button>
      )}

      {onToggleAddBox && (
        <Button
          variant={clickMode === 'addBox' ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleAddBox}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addBox' ? 'Cancelar' : 'Adicionar Caixa'}
        </Button>
      )}

      {onToggleAddReserve && (
        <Button
          variant={clickMode === 'addReserve' ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleAddReserve}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addReserve' ? 'Cancelar' : 'Adicionar Reserva'}
        </Button>
      )}

      {onToggleAddCable && (
        <Button
          variant={clickMode === 'addCable' ? 'default' : 'secondary'}
          size="sm"
          onClick={onToggleAddCable}
          className="shadow-lg"
        >
          <Plus className="w-4 h-4 mr-1" />
          {clickMode === 'addCable' ? 'Cancelar' : 'Adicionar Cabo'}
        </Button>
      )}

      {onToggleEditing && (
        <Button variant="secondary" size="sm" onClick={onToggleEditing} className="shadow-lg">
          <Edit className="w-4 h-4 mr-1" />
          {isEditing ? 'Concluir' : 'Editar'}
        </Button>
      )}
    </div>
  );
}
