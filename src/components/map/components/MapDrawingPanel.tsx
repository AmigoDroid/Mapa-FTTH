import { Button } from '@/components/ui/button';
import type { ClickMode } from '../types';

interface MapDrawingPanelProps {
  clickMode: ClickMode;
  cableWaypointCount: number;
  canSaveNewCable: boolean;
  onUndoLastWaypoint?: () => void;
  onClearWaypoints?: () => void;
  onOpenCableDialog?: () => void;
  onSaveEditedCablePath?: () => void;
  onCancelEditCablePath?: () => void;
}

export function MapDrawingPanel({
  clickMode,
  cableWaypointCount,
  canSaveNewCable,
  onUndoLastWaypoint,
  onClearWaypoints,
  onOpenCableDialog,
  onSaveEditedCablePath,
  onCancelEditCablePath,
}: MapDrawingPanelProps) {
  if (clickMode !== 'addCable' && clickMode !== 'editCable') {
    return null;
  }

  const hasAddModeAction = Boolean(onUndoLastWaypoint || onClearWaypoints || onOpenCableDialog);
  const hasEditModeAction = Boolean(onUndoLastWaypoint || onClearWaypoints || onSaveEditedCablePath || onCancelEditCablePath);
  const hasVisibleActions = clickMode === 'addCable' ? hasAddModeAction : hasEditModeAction;

  return (
    <div className="absolute left-4 bottom-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border w-[320px]">
      <h4 className="text-sm font-semibold">
        {clickMode === 'editCable' ? 'Editando tracado do cabo' : 'Desenhando novo cabo'}
      </h4>
      <p className="text-xs text-gray-600 mt-1">Clique no mapa para adicionar pontos intermediarios.</p>
      <p className="text-xs mt-2">
        Pontos no tracado: <strong>{cableWaypointCount}</strong>
      </p>
      {hasVisibleActions && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {onUndoLastWaypoint && (
            <Button size="sm" variant="outline" onClick={onUndoLastWaypoint} disabled={cableWaypointCount === 0}>
              Desfazer ponto
            </Button>
          )}
          {onClearWaypoints && (
            <Button size="sm" variant="outline" onClick={onClearWaypoints} disabled={cableWaypointCount === 0}>
              Limpar
            </Button>
          )}
          {clickMode === 'addCable' && onOpenCableDialog && (
            <Button size="sm" onClick={onOpenCableDialog} disabled={!canSaveNewCable}>
              Configurar e salvar
            </Button>
          )}
          {clickMode === 'editCable' && onSaveEditedCablePath && (
            <Button size="sm" onClick={onSaveEditedCablePath}>
              Salvar tracado
            </Button>
          )}
          {clickMode === 'editCable' && onCancelEditCablePath && (
            <Button size="sm" variant="outline" onClick={onCancelEditCablePath}>
              Cancelar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
