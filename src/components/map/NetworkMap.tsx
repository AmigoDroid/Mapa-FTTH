import {
  NetworkMapControls,
  type NetworkMapDrawingControls,
  type NetworkMapOverlays,
  type NetworkMapToolbarControls,
} from './components/NetworkMapControls';
import { NetworkMapDialogs, type NetworkMapDialogControls } from './components/NetworkMapDialogs';
import { useNetworkMapController } from './hooks/useNetworkMapController';
import { Button } from '@/components/ui/button';
import { LocateFixed } from 'lucide-react';

interface NetworkMapProps {
  height?: string;
  toolbarControls?: NetworkMapToolbarControls;
  drawingControls?: NetworkMapDrawingControls;
  overlays?: NetworkMapOverlays;
  dialogs?: NetworkMapDialogControls;
};

export function NetworkMap({
  height = 'calc(100vh - 80px)',
  toolbarControls,
  drawingControls,
  overlays,
  dialogs,
}: NetworkMapProps) {
  const controller = useNetworkMapController();

  return (
    <div className="relative w-full">
      <NetworkMapControls
        clickMode={controller.clickMode}
        mapView={controller.mapView}
        isEditing={controller.isEditing}
        currentNetwork={controller.currentNetwork}
        cableWaypointCount={controller.cableWaypoints.length}
        canSubmitCable={controller.canSubmitCable}
        mapPointPickActive={controller.mapPointPickActive}
        onToggleMapView={controller.handleToggleMapView}
        onToggleAddPop={controller.handleToggleAddPop}
        onToggleAddBox={controller.handleToggleAddBox}
        onToggleAddReserve={controller.handleToggleAddReserve}
        onToggleAddCable={controller.handleToggleAddCable}
        onToggleEditing={controller.handleToggleEditing}
        onUndoLastWaypoint={controller.handleUndoLastWaypoint}
        onClearWaypoints={controller.handleClearWaypoints}
        onOpenCableDialog={controller.handleOpenCableConfig}
        onSaveEditedCablePath={controller.handleSaveEditedCablePath}
        onCancelEditCablePath={controller.handleCancelEditCablePath}
        toolbarControls={toolbarControls}
        drawingControls={drawingControls}
        overlays={overlays}
      />

      <div
        ref={controller.mapRef}
        style={{ height, width: '100%' }}
        className="rounded-lg border overflow-hidden map-3d-surface"
      />

      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={controller.handleLocateUser}
        disabled={controller.isLocatingUser}
        className="absolute bottom-12 right-4 z-[1000] h-10 w-10 rounded-full shadow-lg"
        title="Ir para minha localizacao"
      >
        <LocateFixed className={`h-5 w-5 ${controller.isLocatingUser ? 'animate-pulse' : ''}`} />
      </Button>

      <NetworkMapDialogs controller={controller} controls={dialogs} />
    </div>
  );
}
