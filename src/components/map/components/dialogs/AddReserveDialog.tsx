import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AddReserveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reserveName: string;
  onReserveNameChange: (value: string) => void;
  hasPendingAttach: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddReserveDialog({
  open,
  onOpenChange,
  reserveName,
  onReserveNameChange,
  hasPendingAttach,
  onSubmit,
  onCancel,
}: AddReserveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar Reserva</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={reserveName}
                onChange={(event) => onReserveNameChange(event.target.value)}
                placeholder="Ex: Reserva Rua 2"
              />
            </div>
            {hasPendingAttach && (
              <div className="text-xs rounded border bg-amber-50 text-amber-800 px-3 py-2">
                Reserva sera inserida no tracado do cabo selecionado.
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={onSubmit} className="flex-1" disabled={!reserveName.trim()}>
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
