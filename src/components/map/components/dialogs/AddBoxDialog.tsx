import type { Box } from '@/types/ftth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getBoxTypeBehavior, getRecommendedBoxCapacities } from '@/types/ftth/rules';

interface AddBoxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxName: string;
  onBoxNameChange: (value: string) => void;
  boxType: Box['type'];
  onBoxTypeChange: (value: Box['type']) => void;
  boxCapacity: number;
  onBoxCapacityChange: (value: number) => void;
  hasPendingAttach: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddBoxDialog({
  open,
  onOpenChange,
  boxName,
  onBoxNameChange,
  boxType,
  onBoxTypeChange,
  boxCapacity,
  onBoxCapacityChange,
  hasPendingAttach,
  onSubmit,
  onCancel,
}: AddBoxDialogProps) {
  const boxBehavior = getBoxTypeBehavior(boxType);
  const capacityOptions = getRecommendedBoxCapacities(boxType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar Nova Caixa</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={boxName} onChange={(event) => onBoxNameChange(event.target.value)} placeholder="Ex: CTO-001" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={boxType} onValueChange={(value) => onBoxTypeChange(value as Box['type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CEO">CEO - Caixa de Emenda Optica</SelectItem>
                  <SelectItem value="CTO">CTO - Caixa de Terminacao Optica</SelectItem>
                  <SelectItem value="DIO">DIO - Distribuidor Interno Optico</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">{boxBehavior.purpose}</p>
            </div>
            <div>
              <Label>Capacidade (fibras)</Label>
              <Select value={boxCapacity.toString()} onValueChange={(value) => onBoxCapacityChange(Number.parseInt(value, 10))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capacityOptions.map((capacity) => (
                    <SelectItem key={capacity} value={capacity.toString()}>
                      {capacity} fibras
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasPendingAttach && (
              <div className="text-xs rounded border bg-amber-50 text-amber-800 px-3 py-2">
                Caixa sera inserida no tracado do cabo selecionado (opcao de sangria/passagem direta disponivel no detalhe da caixa).
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={onSubmit} className="flex-1">
                Adicionar
              </Button>
              <Button variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
