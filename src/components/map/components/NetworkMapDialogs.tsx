import type { useNetworkMapController } from '../hooks/useNetworkMapController';
import { AddBoxDialog } from './dialogs/AddBoxDialog';
import { AddCableDialog } from './dialogs/AddCableDialog';
import { AddPopDialog } from './dialogs/AddPopDialog';
import { AddReserveDialog } from './dialogs/AddReserveDialog';

export interface NetworkMapDialogControls {
  addPop?: boolean;
  addBox?: boolean;
  addReserve?: boolean;
  addCable?: boolean;
}

interface NetworkMapDialogsProps {
  controller: ReturnType<typeof useNetworkMapController>;
  controls?: NetworkMapDialogControls;
}

const DEFAULT_DIALOG_CONTROLS: Required<NetworkMapDialogControls> = {
  addPop: true,
  addBox: true,
  addReserve: true,
  addCable: true,
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

export function NetworkMapDialogs({ controller, controls }: NetworkMapDialogsProps) {
  const resolvedControls = resolveControlConfig(DEFAULT_DIALOG_CONTROLS, controls);

  return (
    <>
      {resolvedControls.addPop && (
        <AddPopDialog
          open={controller.showAddPop}
          onOpenChange={controller.setShowAddPop}
          cities={controller.currentNetwork?.cities || []}
          popName={controller.newPopName}
          onPopNameChange={controller.setNewPopName}
          popCityId={controller.newPopCityId}
          onPopCityIdChange={controller.setNewPopCityId}
          cityName={controller.newCityName}
          onCityNameChange={controller.setNewCityName}
          citySigla={controller.newCitySigla}
          onCitySiglaChange={controller.setNewCitySigla}
          onSubmit={controller.handleAddPop}
          onCancel={controller.handleCancelAddPop}
        />
      )}

      {resolvedControls.addBox && (
        <AddBoxDialog
          open={controller.showAddBox}
          onOpenChange={controller.setShowAddBox}
          boxName={controller.newBoxName}
          onBoxNameChange={controller.setNewBoxName}
          boxType={controller.newBoxType}
          onBoxTypeChange={controller.setNewBoxType}
          boxCapacity={controller.newBoxCapacity}
          onBoxCapacityChange={controller.setNewBoxCapacity}
          hasPendingAttach={Boolean(controller.pendingAttach)}
          onSubmit={controller.handleAddBox}
          onCancel={controller.handleCancelAddBox}
        />
      )}

      {resolvedControls.addReserve && (
        <AddReserveDialog
          open={controller.showAddReserve}
          onOpenChange={controller.setShowAddReserve}
          reserveName={controller.newReserveName}
          onReserveNameChange={controller.setNewReserveName}
          hasPendingAttach={Boolean(controller.pendingAttach)}
          onSubmit={controller.handleAddReserve}
          onCancel={controller.handleCancelAddReserve}
        />
      )}

      {resolvedControls.addCable && (
        <AddCableDialog
          open={controller.showAddCable}
          onOpenChange={controller.setShowAddCable}
          cableName={controller.cableName}
          onCableNameChange={controller.setCableName}
          cableStartEndpointId={controller.cableStartBox}
          onCableStartEndpointIdChange={controller.setCableStartBox}
          cableEndEndpointId={controller.cableEndBox}
          onCableEndEndpointIdChange={controller.setCableEndBox}
          endpointOptions={controller.cableEndpointOptions}
          onUndoLastWaypoint={controller.handleUndoLastWaypoint}
          onClearWaypoints={controller.handleClearWaypoints}
          cableWaypointCount={controller.cableWaypoints.length}
          cableType={controller.cableType}
          onCableTypeChange={controller.setCableType}
          cableModel={controller.cableModel}
          onCableModelChange={controller.setCableModel}
          availableModels={controller.availableModels}
          looseTubeCount={controller.looseTubeCount}
          onLooseTubeCountChange={controller.setLooseTubeCount}
          fibersPerTube={controller.fibersPerTube}
          onFibersPerTubeChange={controller.setFibersPerTube}
          cableFiberCount={controller.cableFiberCount}
          onCableFiberCountChange={controller.setCableFiberCount}
          maxFiberCapacity={controller.maxFiberCapacity}
          cableEndpointSummary={controller.cableEndpointSummary}
          manualControl={controller.manualCableControl}
          onManualControlChange={controller.setManualCableControl}
          suggestedCableType={controller.suggestedCableType}
          validationErrors={controller.cableValidationErrors}
          validationWarnings={controller.cableValidationWarnings}
          canSubmit={controller.canSubmitCable}
          onSubmit={controller.handleAddCable}
          onCancel={controller.handleCancelAddCable}
        />
      )}
    </>
  );
}
