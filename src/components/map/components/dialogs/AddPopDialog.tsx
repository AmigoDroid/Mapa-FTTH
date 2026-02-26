import type { City } from '@/types/ftth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AddPopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: City[];
  popName: string;
  onPopNameChange: (value: string) => void;
  popCityId: string;
  onPopCityIdChange: (value: string) => void;
  cityName: string;
  onCityNameChange: (value: string) => void;
  citySigla: string;
  onCitySiglaChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddPopDialog({
  open,
  onOpenChange,
  cities,
  popName,
  onPopNameChange,
  popCityId,
  onPopCityIdChange,
  cityName,
  onCityNameChange,
  citySigla,
  onCitySiglaChange,
  onSubmit,
  onCancel,
}: AddPopDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,680px)] max-w-[680px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar POP</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-140px)] px-6 pb-4">
          <div className="space-y-4">
            <div>
              <Label>Nome do POP</Label>
              <Input value={popName} onChange={(event) => onPopNameChange(event.target.value)} placeholder="Ex: POP Centro" />
            </div>
            <div>
              <Label>Cidade existente</Label>
              <Select value={popCityId || '__none__'} onValueChange={(value) => onPopCityIdChange(value === '__none__' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Criar nova cidade</SelectItem>
                  {cities.map((city) => (
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
                  <Input value={cityName} onChange={(event) => onCityNameChange(event.target.value)} placeholder="Brasilia" />
                </div>
                <div>
                  <Label>Sigla</Label>
                  <Input value={citySigla} onChange={(event) => onCitySiglaChange(event.target.value.toUpperCase())} placeholder="BSB" />
                </div>
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
