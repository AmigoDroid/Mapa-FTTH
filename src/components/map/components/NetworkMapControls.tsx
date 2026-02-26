import type { Network } from '@/types/ftth';
import type { ClickMode, MapViewMode } from '../types';
import { MapDrawingPanel } from './MapDrawingPanel';
import { MapNetworkSummary } from './MapNetworkSummary';
import { MapPointPickHint } from './MapPointPickHint';
import { MapToolbar } from './MapToolbar';

export interface NetworkMapToolbarControls {
  mapView?: boolean;
  addPop?: boolean;
  addBox?: boolean;
  addReserve?: boolean;
  addCable?: boolean;
  edit?: boolean;
}

export interface NetworkMapDrawingControls {
  undoLastPoint?: boolean;
  clearPoints?: boolean;
  openCableConfig?: boolean;
  saveEditedCable?: boolean;
  cancelEditCable?: boolean;
}

export interface NetworkMapOverlays {
  networkSummary?: boolean;
  drawingPanel?: boolean;
  mapPointHint?: boolean;
}

interface NetworkMapControlsProps {
  clickMode: ClickMode;
  mapView: MapViewMode;
  isEditing: boolean;
  currentNetwork: Network | null;
  cableWaypointCount: number;
  canSubmitCable: boolean;
  mapPointPickActive: boolean;
  onToggleMapView: () => void;
  onToggleAddPop: () => void;
  onToggleAddBox: () => void;
  onToggleAddReserve: () => void;
  onToggleAddCable: () => void;
  onToggleEditing: () => void;
  onUndoLastWaypoint: () => void;
  onClearWaypoints: () => void;
  onOpenCableDialog: () => void;
  onSaveEditedCablePath: () => void;
  onCancelEditCablePath: () => void;
  toolbarControls?: NetworkMapToolbarControls;
  drawingControls?: NetworkMapDrawingControls;
  overlays?: NetworkMapOverlays;
}

const DEFAULT_TOOLBAR_CONTROLS: Required<NetworkMapToolbarControls> = {
  mapView: true,
  addPop: false,
  addBox: false,
  addReserve: false,
  addCable: true,
  edit: true,
};

const DEFAULT_DRAWING_CONTROLS: Required<NetworkMapDrawingControls> = {
  undoLastPoint: true,
  clearPoints: true,
  openCableConfig: true,
  saveEditedCable: true,
  cancelEditCable: true,
};

const DEFAULT_OVERLAYS: Required<NetworkMapOverlays> = {
  networkSummary: true,
  drawingPanel: true,
  mapPointHint: true,
};

const resolveControlConfig = <T extends Record<string, boolean>>(
  defaults: T,
  overrides?: Partial<T>
): T => {
  if (!overrides) return defaults;
  const next = { ...defaults };
  (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
    next[key] = Boolean(overrides[key]) as T[keyof T];
  });
  return next;
};

export function NetworkMapControls({
  clickMode,
  mapView,
  isEditing,
  currentNetwork,
  cableWaypointCount,
  canSubmitCable,
  mapPointPickActive,
  onToggleMapView,
  onToggleAddPop,
  onToggleAddBox,
  onToggleAddReserve,
  onToggleAddCable,
  onToggleEditing,
  onUndoLastWaypoint,
  onClearWaypoints,
  onOpenCableDialog,
  onSaveEditedCablePath,
  onCancelEditCablePath,
  toolbarControls,
  drawingControls,
  overlays,
}: NetworkMapControlsProps) {
  const resolvedToolbarControls = resolveControlConfig(DEFAULT_TOOLBAR_CONTROLS, toolbarControls);
  const resolvedDrawingControls = resolveControlConfig(DEFAULT_DRAWING_CONTROLS, drawingControls);
  const resolvedOverlays = resolveControlConfig(DEFAULT_OVERLAYS, overlays);

  return (
    <>
      <MapToolbar
        clickMode={clickMode}
        mapView={mapView}
        isEditing={isEditing}
        onToggleMapView={resolvedToolbarControls.mapView ? onToggleMapView : undefined}
        onToggleAddPop={resolvedToolbarControls.addPop ? onToggleAddPop : undefined}
        onToggleAddBox={resolvedToolbarControls.addBox ? onToggleAddBox : undefined}
        onToggleAddReserve={resolvedToolbarControls.addReserve ? onToggleAddReserve : undefined}
        onToggleAddCable={resolvedToolbarControls.addCable ? onToggleAddCable : undefined}
        onToggleEditing={resolvedToolbarControls.edit ? onToggleEditing : undefined}
      />

      {resolvedOverlays.networkSummary && <MapNetworkSummary network={currentNetwork} />}

      {resolvedOverlays.drawingPanel && (
        <MapDrawingPanel
          clickMode={clickMode}
          cableWaypointCount={cableWaypointCount}
          canSaveNewCable={canSubmitCable}
          onUndoLastWaypoint={resolvedDrawingControls.undoLastPoint ? onUndoLastWaypoint : undefined}
          onClearWaypoints={resolvedDrawingControls.clearPoints ? onClearWaypoints : undefined}
          onOpenCableDialog={resolvedDrawingControls.openCableConfig ? onOpenCableDialog : undefined}
          onSaveEditedCablePath={resolvedDrawingControls.saveEditedCable ? onSaveEditedCablePath : undefined}
          onCancelEditCablePath={resolvedDrawingControls.cancelEditCable ? onCancelEditCablePath : undefined}
        />
      )}

      {resolvedOverlays.mapPointHint && <MapPointPickHint active={mapPointPickActive} />}
    </>
  );
}
