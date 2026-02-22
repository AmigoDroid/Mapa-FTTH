import { useEffect, useMemo, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import type { Cable, Fiber } from '@/types/ftth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface FiberAnalyzerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getFiberTubeNumber = (fiber: Fiber, index: number, fibersPerTube: number) => {
  const typedFiber = fiber as Fiber & { tubeNumber?: number };
  return typedFiber.tubeNumber || Math.floor(index / Math.max(1, fibersPerTube)) + 1;
};

export function FiberAnalyzerPanel({ open, onOpenChange }: FiberAnalyzerPanelProps) {
  const { currentNetwork, getFiberRouteReport } = useNetworkStore();
  const [selectedCableId, setSelectedCableId] = useState('');
  const [selectedTube, setSelectedTube] = useState<number>(1);
  const [selectedFiberId, setSelectedFiberId] = useState('');

  const cables = useMemo(() => currentNetwork?.cables || [], [currentNetwork?.cables]);
  const selectedCable = useMemo(
    () => cables.find((cable) => cable.id === selectedCableId) || null,
    [cables, selectedCableId]
  );

  const tubeNumbers = useMemo(() => {
    if (!selectedCable) return [1];
    const set = new Set<number>();
    selectedCable.fibers.forEach((fiber, index) => {
      set.add(getFiberTubeNumber(fiber, index, selectedCable.fibersPerTube || 12));
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedCable]);

  const fibersInTube = useMemo(() => {
    if (!selectedCable) return [];
    return selectedCable.fibers.filter((fiber, index) => {
      const tube = getFiberTubeNumber(fiber, index, selectedCable.fibersPerTube || 12);
      return tube === selectedTube;
    });
  }, [selectedCable, selectedTube]);

  const selectedFiber = useMemo(
    () => fibersInTube.find((fiber) => fiber.id === selectedFiberId) || null,
    [fibersInTube, selectedFiberId]
  );

  const routeReport = useMemo(
    () => (selectedFiber ? getFiberRouteReport(selectedFiber.id) : null),
    [selectedFiber, getFiberRouteReport]
  );

  useEffect(() => {
    if (!open) return;
    if (cables.length > 0 && !selectedCableId) {
      setSelectedCableId(cables[0]!.id);
    }
  }, [open, cables, selectedCableId]);

  useEffect(() => {
    if (!selectedCable) return;
    if (!tubeNumbers.includes(selectedTube)) {
      setSelectedTube(tubeNumbers[0] || 1);
    }
  }, [selectedCable, selectedTube, tubeNumbers]);

  useEffect(() => {
    if (fibersInTube.length === 0) {
      setSelectedFiberId('');
      return;
    }
    if (!fibersInTube.some((fiber) => fiber.id === selectedFiberId)) {
      setSelectedFiberId(fibersInTube[0]!.id);
    }
  }, [fibersInTube, selectedFiberId]);

  useEffect(() => {
    if (!open) return;
    if (!selectedFiber) {
      window.dispatchEvent(new CustomEvent('ftth:trace-clear'));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('ftth:trace-fiber', {
        detail: { fiberId: selectedFiber.id, persist: true },
      })
    );
  }, [open, selectedFiber]);

  useEffect(() => {
    if (open) return;
    window.dispatchEvent(new CustomEvent('ftth:trace-clear'));
  }, [open]);

  const selectTubeStep = (direction: -1 | 1) => {
    const index = tubeNumbers.findIndex((tube) => tube === selectedTube);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tubeNumbers.length) return;
    setSelectedTube(tubeNumbers[nextIndex]!);
  };

  const selectFiberStep = (direction: -1 | 1) => {
    const index = fibersInTube.findIndex((fiber) => fiber.id === selectedFiberId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= fibersInTube.length) return;
    setSelectedFiberId(fibersInTube[nextIndex]!.id);
  };

  if (!open) return null;

  return (
    <aside className="absolute top-4 right-4 z-[1100] w-[420px] max-h-[calc(100vh-120px)] rounded-xl border bg-white/95 backdrop-blur shadow-xl flex flex-col">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Analisador de Fibra</h3>
          <p className="text-xs text-gray-500">Analise 1 a 1 por tubo loose, com trace fixo no mapa</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 space-y-3 overflow-y-auto">
        <div>
          <p className="text-xs text-gray-600 mb-1">Cabo</p>
          <Select value={selectedCableId || '__none__'} onValueChange={(v) => setSelectedCableId(v === '__none__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um cabo" />
            </SelectTrigger>
            <SelectContent>
              {cables.length === 0 && <SelectItem value="__none__">Sem cabos</SelectItem>}
              {cables.map((cable: Cable) => (
                <SelectItem key={cable.id} value={cable.id}>
                  {cable.name} ({cable.model} | {cable.fiberCount}F)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => selectTubeStep(-1)} disabled={tubeNumbers.length <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Select value={String(selectedTube)} onValueChange={(v) => setSelectedTube(Number.parseInt(v, 10) || 1)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tubeNumbers.map((tube) => (
                <SelectItem key={tube} value={String(tube)}>
                  Tubo loose {tube}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => selectTubeStep(1)} disabled={tubeNumbers.length <= 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => selectFiberStep(-1)} disabled={fibersInTube.length <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Select value={selectedFiberId || '__none__'} onValueChange={(v) => setSelectedFiberId(v === '__none__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma fibra" />
            </SelectTrigger>
            <SelectContent>
              {fibersInTube.length === 0 && <SelectItem value="__none__">Sem fibras no tubo</SelectItem>}
              {fibersInTube.map((fiber) => (
                <SelectItem key={fiber.id} value={fiber.id}>
                  Fibra {fiber.number} - {fiber.color.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => selectFiberStep(1)} disabled={fibersInTube.length <= 1}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {selectedFiber && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border" style={{ backgroundColor: selectedFiber.color.hex }} />
              <span className="font-medium">Fibra {selectedFiber.number}</span>
              <span className="text-gray-500">{selectedFiber.color.name}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Status: {selectedFiber.status}</p>
          </div>
        )}

        {routeReport && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border p-2"><p className="text-gray-500">Fusoes</p><p className="font-semibold">{routeReport.fusionCount}</p></div>
              <div className="rounded border p-2"><p className="text-gray-500">Splitters</p><p className="font-semibold">{routeReport.splitterCount}</p></div>
              <div className="rounded border p-2"><p className="text-gray-500">Caixas</p><p className="font-semibold">{routeReport.boxCount}</p></div>
              <div className="rounded border p-2"><p className="text-gray-500">Cabos</p><p className="font-semibold">{routeReport.cableCount}</p></div>
              <div className="rounded border p-2"><p className="text-gray-500">POPs</p><p className="font-semibold">{routeReport.popCount}</p></div>
              <div className="rounded border p-2"><p className="text-gray-500">Perda</p><p className="font-semibold">{routeReport.attenuation.toFixed(3)} dB</p></div>
            </div>

            {routeReport.signalAtPop && (
              <div className="rounded border bg-blue-50 p-2 text-xs">
                <p className="font-medium text-blue-900">Sinal via OLT</p>
                <p className="text-blue-800">POP: {routeReport.signalAtPop.popName}</p>
                <p className="text-blue-800">Porta: {routeReport.signalAtPop.oltEndpointId}</p>
                <p className="text-blue-800">TX: {routeReport.signalAtPop.txPowerDbm.toFixed(2)} dBm</p>
                <p className="text-blue-800">Perda POP: {routeReport.signalAtPop.popLossDb.toFixed(3)} dB</p>
                <p className="font-semibold text-blue-900">RX: {routeReport.signalAtPop.estimatedRxDbm.toFixed(3)} dBm</p>
              </div>
            )}

            <div className="rounded border p-2 text-xs max-h-40 overflow-y-auto">
              <p className="font-medium mb-1">Trajeto da fibra</p>
              {routeReport.path.length === 0 && <p className="text-gray-500">Sem trajeto identificado</p>}
              {routeReport.path.map((step, index) => (
                <p key={`${step}:${index}`} className="text-gray-700">{index + 1}. {step}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
