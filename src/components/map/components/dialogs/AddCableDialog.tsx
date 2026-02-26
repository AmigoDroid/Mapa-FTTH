import type { Cable } from '@/types/ftth';
import { DEFAULT_CABLE_MODEL } from '@/types/ftth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { NetworkEndpointOption } from '../../types';

interface CableModelOption {
  id: string;
  label: string;
}

interface AddCableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cableName: string;
  onCableNameChange: (value: string) => void;
  cableStartEndpointId: string;
  onCableStartEndpointIdChange: (value: string) => void;
  cableEndEndpointId: string;
  onCableEndEndpointIdChange: (value: string) => void;
  endpointOptions: NetworkEndpointOption[];
  onUndoLastWaypoint: () => void;
  onClearWaypoints: () => void;
  cableWaypointCount: number;
  cableType: Cable['type'];
  onCableTypeChange: (value: Cable['type']) => void;
  cableModel: string;
  onCableModelChange: (value: string) => void;
  availableModels: CableModelOption[];
  looseTubeCount: number;
  onLooseTubeCountChange: (value: number) => void;
  fibersPerTube: number;
  onFibersPerTubeChange: (value: number) => void;
  cableFiberCount: number;
  onCableFiberCountChange: (value: number) => void;
  maxFiberCapacity: number;
  cableEndpointSummary: string;
  manualControl: boolean;
  onManualControlChange: (value: boolean) => void;
  suggestedCableType: Cable['type'];
  validationErrors: string[];
  validationWarnings: string[];
  canSubmit: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddCableDialog({
  open,
  onOpenChange,
  cableName,
  onCableNameChange,
  cableStartEndpointId,
  onCableStartEndpointIdChange,
  cableEndEndpointId,
  onCableEndEndpointIdChange,
  endpointOptions,
  onUndoLastWaypoint,
  onClearWaypoints,
  cableWaypointCount,
  cableType,
  onCableTypeChange,
  cableModel,
  onCableModelChange,
  availableModels,
  looseTubeCount,
  onLooseTubeCountChange,
  fibersPerTube,
  onFibersPerTubeChange,
  cableFiberCount,
  onCableFiberCountChange,
  maxFiberCapacity,
  cableEndpointSummary,
  manualControl,
  onManualControlChange,
  suggestedCableType,
  validationErrors,
  validationWarnings,
  canSubmit,
  onSubmit,
  onCancel,
}: AddCableDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,760px)] max-w-[760px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle className="px-6 pt-6">Adicionar Novo Cabo</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-150px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do Cabo</Label>
              <Input value={cableName} onChange={(event) => onCableNameChange(event.target.value)} placeholder={`Ex: ${DEFAULT_CABLE_MODEL} Rota Norte Trecho 1`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Origem (caixa ou POP)</Label>
                <Select
                  value={cableStartEndpointId || '__none__'}
                  onValueChange={(value) => onCableStartEndpointIdChange(value === '__none__' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem origem</SelectItem>
                    {endpointOptions.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpoint.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destino (caixa ou POP)</Label>
                <Select
                  value={cableEndEndpointId || '__none__'}
                  onValueChange={(value) => onCableEndEndpointIdChange(value === '__none__' ? '' : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem destino</SelectItem>
                    {endpointOptions
                      .filter((endpoint) => endpoint.id !== cableStartEndpointId)
                      .map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.id}>
                          {endpoint.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded border p-3 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Modo manual total</p>
                  <p className="text-xs text-gray-500">
                    Desligado: o sistema sugere tipo, modelo e geometria automaticamente.
                  </p>
                </div>
                <Switch checked={manualControl} onCheckedChange={onManualControlChange} />
              </div>
              <p className="text-xs text-gray-600">
                Tipo sugerido para essa topologia: <strong>{suggestedCableType}</strong>.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onUndoLastWaypoint} disabled={cableWaypointCount === 0}>
                Desfazer ponto
              </Button>
              <Button variant="outline" size="sm" onClick={onClearWaypoints} disabled={cableWaypointCount === 0}>
                Limpar pontos
              </Button>
            </div>
            <div>
              <Label>Tipo de Cabo</Label>
              <Select
                value={cableType}
                onValueChange={(value) => onCableTypeChange(value as Cable['type'])}
                disabled={!manualControl}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drop">Drop (ultima milha)</SelectItem>
                  <SelectItem value="distribution">distribuicao</SelectItem>
                  <SelectItem value="feeder">Feeder</SelectItem>
                  <SelectItem value="backbone">Backbone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modelo do Cabo</Label>
              <Select value={cableModel} onValueChange={onCableModelChange} disabled={!manualControl}>
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
                  disabled={!manualControl}
                  onChange={(event) => onLooseTubeCountChange(Math.max(1, Number.parseInt(event.target.value || '1', 10)))}
                />
              </div>
              <div>
                <Label>Fibras por tubo</Label>
                <Input
                  type="number"
                  min={1}
                  value={fibersPerTube}
                  disabled={!manualControl}
                  onChange={(event) => onFibersPerTubeChange(Math.max(1, Number.parseInt(event.target.value || '1', 10)))}
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
                disabled={!manualControl}
                onChange={(event) => {
                  const next = Math.max(1, Number.parseInt(event.target.value || '1', 10));
                  onCableFiberCountChange(Math.min(maxFiberCapacity, next));
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Capacidade atual: {maxFiberCapacity} fibras ({looseTubeCount} x {fibersPerTube}).
              </p>
              <p className="text-xs text-gray-500">{cableEndpointSummary} | modelo {cableModel}.</p>
            </div>
            {validationErrors.length > 0 && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1">
                {validationErrors.map((error, idx) => (
                  <p key={`error-${idx}`}>- {error}</p>
                ))}
              </div>
            )}
            {validationWarnings.length > 0 && (
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
                {validationWarnings.map((warning, idx) => (
                  <p key={`warning-${idx}`}>- {warning}</p>
                ))}
              </div>
            )}
            <div className="bg-blue-50 p-3 rounded text-sm">
              <p className="text-blue-800">
                <strong>Dica:</strong> Origem/destino sao opcionais. Clique no mapa para adicionar pontos de passagem.
                {cableWaypointCount > 0 && <span className="block mt-1">Pontos adicionados: {cableWaypointCount}</span>}
              </p>
            </div>
          </div>
        </ScrollArea>
        <div className="border-t px-6 py-4 bg-white">
          <div className="flex gap-2">
            <Button onClick={onSubmit} className="flex-1" disabled={!canSubmit}>
              Adicionar
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
