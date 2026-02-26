import { useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Zap,
  Route,
  ArrowRight,
  Download,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FIBER_COLORS } from '@/types/ftth';
import type { Box, Cable } from '@/types/ftth';

interface ContinuityTesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TestResult {
  fiberId: string;
  fiberNumber: number;
  color: typeof FIBER_COLORS[0];
  result: 'pass' | 'fail' | 'pending';
  attenuation?: number;
  distance?: number;
  path?: string[];
  fusionCount?: number;
  cableCount?: number;
  boxCount?: number;
  splitterCount?: number;
  popCount?: number;
  signalAtPop?: {
    popName: string;
    oltEndpointId: string;
    txPowerDbm: number;
    popLossDb: number;
    estimatedRxDbm: number;
  };
  timestamp?: string;
}

type ContinuitySource =
  | { box: Box; cable?: undefined }
  | { box?: undefined; cable: Cable };

export function ContinuityTester({ open, onOpenChange }: ContinuityTesterProps) {
  const { currentNetwork, testContinuity, getFiberRouteReport } = useNetworkStore();
  const [selectedSource, setSelectedSource] = useState<ContinuitySource | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [showVisualization, setShowVisualization] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

  const highlightFiberOnMap = (fiberId: string) => {
    window.dispatchEvent(new CustomEvent('ftth:trace-fiber', { detail: { fiberId } }));
  };

  const clearFiberHighlightOnMap = () => {
    window.dispatchEvent(new CustomEvent('ftth:trace-clear'));
  };

  const runTest = async () => {
    if (!selectedSource) return;

    setIsTesting(true);
    setTestResults([]);
    setCurrentTestIndex(0);

    const fibers = selectedSource.cable
      ? selectedSource.cable.fibers
      : selectedSource.box?.fibers || [];

    for (let i = 0; i < fibers.length; i++) {
      setCurrentTestIndex(i);
      const fiber = fibers[i];
      if (!fiber) continue;

      await new Promise((resolve) => setTimeout(resolve, 500));

      const routeReport = getFiberRouteReport(fiber.id);
      const passed = routeReport.connected;
      const result: TestResult = {
        fiberId: fiber.id,
        fiberNumber: fiber.number,
        color: fiber.color,
        result: passed ? 'pass' : 'fail',
        attenuation: passed ? routeReport.attenuation : undefined,
        distance: selectedSource.cable?.length || undefined,
        path: routeReport.path,
        fusionCount: routeReport.fusionCount,
        cableCount: routeReport.cableCount,
        boxCount: routeReport.boxCount,
        splitterCount: routeReport.splitterCount,
        popCount: routeReport.popCount,
        signalAtPop: routeReport.signalAtPop,
        timestamp: new Date().toISOString(),
      };

      setTestResults((prev) => [...prev, result]);

      testContinuity({
        cableId: selectedSource.cable?.id || '',
        fiberNumber: fiber.number,
        startPoint: selectedSource.box?.name || selectedSource.cable?.startPoint || '',
        endPoint: selectedSource.cable?.endPoint || '',
        result: result.result,
        attenuation: result.attenuation,
        distance: result.distance,
        technician: 'Sistema',
      });
    }

    setIsTesting(false);
  };

  const resetTest = () => {
    setTestResults([]);
    setCurrentTestIndex(0);
    setIsTesting(false);
    setSelectedResult(null);
    clearFiberHighlightOnMap();
  };

  const getPassRate = () => {
    if (testResults.length === 0) return 0;
    const passed = testResults.filter((r) => r.result === 'pass').length;
    return Math.round((passed / testResults.length) * 100);
  };

  const exportCableDiagnosticsPdf = () => {
    if (!selectedSource?.cable || !cableDiagnostics) return;

    const generatedAt = new Date().toLocaleString('pt-BR');
    const passCount = testResults.filter((item) => item.result === 'pass').length;
    const failCount = testResults.filter((item) => item.result === 'fail').length;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const safeName = cableDiagnostics.name.replace(/[\\/:*?"<>|]/g, '-');
    const title = `Relatorio Tecnico de Cabo - ${cableDiagnostics.name}`;

    doc.setFontSize(14);
    doc.text(title, 10, 12);
    doc.setFontSize(9);
    doc.text(`Gerado em: ${generatedAt}`, 10, 17);
    doc.text(`ID: ${cableDiagnostics.id}`, 10, 21);
    doc.text(`Status: ${cableDiagnostics.status}`, 10, 25);
    doc.text(`Origem: ${cableDiagnostics.startPointLabel}`, 10, 29);
    doc.text(`Destino: ${cableDiagnostics.endPointLabel}`, 10, 33);

    autoTable(doc, {
      startY: 38,
      head: [['Parametros de Engenharia', 'Valor']],
      body: [
        ['Comprimento', `${cableDiagnostics.lengthMeters.toFixed(0)} m (${cableDiagnostics.lengthKm.toFixed(3)} km)`],
        ['Modelo / Tipo', `${cableDiagnostics.model} / ${cableDiagnostics.type}`],
        ['Perda fibra', `${cableDiagnostics.fiberLossDb.toFixed(3)} dB`],
        ['Perda conectores', `${cableDiagnostics.connectorLossDb.toFixed(3)} dB`],
        ['Perda total estimada', `${cableDiagnostics.estimatedTotalCableLossDb.toFixed(3)} dB`],
        ['Estrutura', `${cableDiagnostics.looseTubeCount} tubos x ${cableDiagnostics.fibersPerTube} fibras/tubo`],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] },
      theme: 'striped',
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable!.finalY! + 4)
        : 90,
      head: [['Inventario de Fibras', 'Valor']],
      body: [
        ['Total', `${cableDiagnostics.fiberCount}`],
        ['Ativas', `${cableDiagnostics.activeFibers}`],
        ['Inativas', `${cableDiagnostics.inactiveFibers}`],
        ['Reservadas', `${cableDiagnostics.reservedFibers}`],
        ['Falha', `${cableDiagnostics.faultyFibers}`],
        ['Uso', `${cableDiagnostics.usedPercent}%`],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] },
      theme: 'striped',
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable!.finalY! + 4)
        : 130,
      head: [['Resumo de Testes', 'Valor']],
      body: [
        ['Taxa de aprovacao', `${getPassRate()}%`],
        ['Fibras OK', `${passCount}`],
        ['Falhas', `${failCount}`],
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] },
      theme: 'striped',
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
        ? ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable!.finalY! + 4)
        : 160,
      head: [['Fibra', 'Cor', 'Resultado', 'Atenuacao (dB)', 'Fusoes', 'Splitters', 'Caixas', 'POPs']],
      body: testResults.map((item) => [
        `${item.fiberNumber}`,
        item.color.name,
        item.result === 'pass' ? 'APROVADO' : 'REPROVADO',
        typeof item.attenuation === 'number' ? item.attenuation.toFixed(3) : '-',
        `${item.fusionCount ?? 0}`,
        `${item.splitterCount ?? 0}`,
        `${item.boxCount ?? 0}`,
        `${item.popCount ?? 0}`,
      ]),
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [17, 94, 89] },
      theme: 'grid',
    });

    doc.save(`relatorio-cabo-${safeName}.pdf`);
  };

  const cableDiagnostics = (() => {
    if (!selectedSource?.cable) return null;
    const cable = selectedSource.cable;

    const resolveEndpointLabel = (endpointId: string) => {
      if (!endpointId) return 'Nao definido';
      const box = currentNetwork?.boxes.find((item) => item.id === endpointId);
      if (box) return `${box.name} (Caixa ${box.type})`;
      const pop = (currentNetwork?.pops || []).find((item) => item.id === endpointId);
      if (pop) return `${pop.name} (POP)`;
      return endpointId;
    };

    const lengthMeters = Math.max(0, cable.length || 0);
    const lengthKm = lengthMeters / 1000;
    const fiberLossDb = Number((lengthKm * 0.25).toFixed(3));
    const connectorLossDb = 0.4;
    const estimatedTotalCableLossDb = Number((fiberLossDb + connectorLossDb).toFixed(3));

    const activeFibers = cable.fibers.filter((fiber) => fiber.status === 'active').length;
    const inactiveFibers = cable.fibers.filter((fiber) => fiber.status === 'inactive').length;
    const reservedFibers = cable.fibers.filter((fiber) => fiber.status === 'reserved').length;
    const faultyFibers = cable.fibers.filter((fiber) => fiber.status === 'faulty').length;
    const usedPercent = cable.fibers.length > 0 ? Number(((activeFibers / cable.fibers.length) * 100).toFixed(1)) : 0;

    return {
      id: cable.id,
      name: cable.name,
      type: cable.type,
      model: cable.model || 'N/A',
      status: cable.status,
      lengthMeters,
      lengthKm,
      fiberLossDb,
      connectorLossDb,
      estimatedTotalCableLossDb,
      fiberCount: cable.fiberCount,
      looseTubeCount: cable.looseTubeCount,
      fibersPerTube: cable.fibersPerTube,
      activeFibers,
      inactiveFibers,
      reservedFibers,
      faultyFibers,
      usedPercent,
      attachments: (cable.attachments || []).length,
      routePoints: (cable.path || []).length,
      startPointLabel: resolveEndpointLabel(cable.startPoint),
      endPointLabel: resolveEndpointLabel(cable.endPoint),
    };
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) clearFiberHighlightOnMap();
      }}
    >
      <DialogContent className="w-[min(96vw,1200px)] max-w-[1200px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Teste de Continuidade
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-88px)] px-6 pb-6">
        <div className="space-y-4">
          {!selectedSource ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Selecionar Caixa</h4>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {currentNetwork?.boxes.map((box) => (
                        <Button
                          key={box.id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setSelectedSource({ box })}
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          {box.name}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Selecionar Cabo</h4>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {currentNetwork?.cables.map((cable) => (
                        <Button
                          key={cable.id}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setSelectedSource({ cable })}
                        >
                          <Route className="w-4 h-4 mr-2" />
                          {cable.name}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  {selectedSource.box ? (
                    <>
                      <Zap className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{selectedSource.box.name}</p>
                        <p className="text-xs text-gray-500">{selectedSource.box.type}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Route className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium">{selectedSource.cable?.name}</p>
                        <p className="text-xs text-gray-500">{selectedSource.cable?.type}</p>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedSource.cable && (
                    <Button variant="outline" size="sm" onClick={exportCableDiagnosticsPdf}>
                      <Download className="w-4 h-4 mr-1" />
                      Exportar PDF
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSelectedSource(null)}>
                    Trocar
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                {!isTesting && testResults.length === 0 && (
                  <Button onClick={runTest} className="flex-1">
                    <Play className="w-4 h-4 mr-1" />
                    Iniciar Teste
                  </Button>
                )}
                {isTesting && (
                  <Button variant="outline" disabled className="flex-1">
                    <Activity className="w-4 h-4 mr-1 animate-pulse" />
                    Testando... ({currentTestIndex + 1}/{selectedSource.box?.fibers.length || selectedSource.cable?.fibers.length})
                  </Button>
                )}
                {testResults.length > 0 && !isTesting && (
                  <Button onClick={resetTest} variant="outline">
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Reiniciar
                  </Button>
                )}
              </div>

              {cableDiagnostics && (
                <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
                  <p className="text-sm font-semibold">Diagnostico Tecnico do Cabo</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Comprimento</p>
                      <p className="font-semibold">{cableDiagnostics.lengthMeters.toFixed(0)} m</p>
                      <p className="text-gray-500">{cableDiagnostics.lengthKm.toFixed(3)} km</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Perda fibra</p>
                      <p className="font-semibold">{cableDiagnostics.fiberLossDb.toFixed(3)} dB</p>
                      <p className="text-gray-500">0.25 dB/km</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Perda conectores</p>
                      <p className="font-semibold">{cableDiagnostics.connectorLossDb.toFixed(3)} dB</p>
                      <p className="text-gray-500">estimada</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Perda total estimada</p>
                      <p className="font-semibold">{cableDiagnostics.estimatedTotalCableLossDb.toFixed(3)} dB</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Modelo / Tipo</p>
                      <p className="font-semibold">{cableDiagnostics.model}</p>
                      <p className="text-gray-500 uppercase">{cableDiagnostics.type}</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Estrutura</p>
                      <p className="font-semibold">{cableDiagnostics.looseTubeCount} tubos</p>
                      <p className="text-gray-500">{cableDiagnostics.fibersPerTube} fibras/tubo</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Fibras</p>
                      <p className="font-semibold">{cableDiagnostics.fiberCount} total</p>
                      <p className="text-gray-500">{cableDiagnostics.usedPercent}% ativas</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Status</p>
                      <p className="font-semibold">{cableDiagnostics.status}</p>
                      <p className="text-gray-500">{cableDiagnostics.routePoints} pontos no tracado</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Fibras ativas</p>
                      <p className="font-semibold">{cableDiagnostics.activeFibers}</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Fibras inativas</p>
                      <p className="font-semibold">{cableDiagnostics.inactiveFibers}</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Fibras reservadas</p>
                      <p className="font-semibold">{cableDiagnostics.reservedFibers}</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Fibras com falha</p>
                      <p className="font-semibold">{cableDiagnostics.faultyFibers}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Origem</p>
                      <p className="font-medium">{cableDiagnostics.startPointLabel}</p>
                    </div>
                    <div className="rounded border bg-white p-2">
                      <p className="text-gray-500">Destino</p>
                      <p className="font-medium">{cableDiagnostics.endPointLabel}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    ID: {cableDiagnostics.id} | anexos no tracado: {cableDiagnostics.attachments}
                  </p>
                </div>
              )}

              {isTesting && (
                <div className="space-y-2">
                  <Progress
                    value={(currentTestIndex / ((selectedSource.box?.fibers.length || selectedSource.cable?.fibers.length) || 1)) * 100}
                  />
                  <p className="text-xs text-center text-gray-500">
                    Testando fibra {currentTestIndex + 1} de {selectedSource.box?.fibers.length || selectedSource.cable?.fibers.length}
                  </p>
                </div>
              )}

              {testResults.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{getPassRate()}%</p>
                        <p className="text-xs text-gray-500">Aprovado</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {testResults.filter((r) => r.result === 'pass').length}
                        </p>
                        <p className="text-xs text-gray-500">Fibras OK</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">
                          {testResults.filter((r) => r.result === 'fail').length}
                        </p>
                        <p className="text-xs text-gray-500">Falhas</p>
                      </CardContent>
                    </Card>
                  </div>

                  <ScrollArea className="h-64">
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {testResults.map((result) => (
                        <div
                          key={result.fiberId}
                          className={`
                            p-2 rounded-lg border-2 cursor-pointer transition-all
                            ${result.result === 'pass' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}
                            ${selectedResult?.fiberId === result.fiberId ? 'ring-2 ring-blue-500' : ''}
                          `}
                          onClick={() => {
                            setSelectedResult(result);
                            setShowVisualization(true);
                            highlightFiberOnMap(result.fiberId);
                          }}
                        >
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <div
                              className="w-3 h-3 rounded-full border"
                              style={{ backgroundColor: result.color.hex }}
                            />
                            <span className="text-xs font-mono">{result.fiberNumber}</span>
                          </div>
                          <div className="flex justify-center">
                            {result.result === 'pass' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>
                          {result.attenuation !== undefined && (
                            <p className="text-[10px] text-center text-gray-500 mt-1">
                              {result.attenuation.toFixed(2)} dB
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </div>
        </ScrollArea>

        {showVisualization && selectedResult && (
          <Dialog open={showVisualization} onOpenChange={setShowVisualization}>
            <DialogContent className="w-[min(94vw,680px)] max-w-[680px] max-h-[88vh] overflow-hidden p-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>Detalhes do Teste - Fibra {selectedResult.fiberNumber}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="max-h-[calc(88vh-86px)] px-6 pb-5">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full border"
                    style={{ backgroundColor: selectedResult.color.hex }}
                  />
                  <div>
                    <p className="font-medium">{selectedResult.color.name}</p>
                    <p className="text-xs text-gray-500">Fibra {selectedResult.fiberNumber}</p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg ${selectedResult.result === 'pass' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    {selectedResult.result === 'pass' ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-500" />
                    )}
                    <div>
                      <p className="font-medium">
                        {selectedResult.result === 'pass' ? 'Teste Aprovado' : 'Teste Reprovado'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(selectedResult.timestamp || '').toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedResult.attenuation !== undefined && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Atenuacao</p>
                      <p className="text-lg font-semibold">{selectedResult.attenuation.toFixed(2)} dB</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Distancia</p>
                      <p className="text-lg font-semibold">{selectedResult.distance?.toFixed(0)} m</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-[11px] text-gray-500">Fusoes</p>
                    <p className="font-semibold">{selectedResult.fusionCount ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-[11px] text-gray-500">Splitters</p>
                    <p className="font-semibold">{selectedResult.splitterCount ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-[11px] text-gray-500">Caixas</p>
                    <p className="font-semibold">{selectedResult.boxCount ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-[11px] text-gray-500">Cabos</p>
                    <p className="font-semibold">{selectedResult.cableCount ?? 0}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <p className="text-[11px] text-gray-500">POPs</p>
                    <p className="font-semibold">{selectedResult.popCount ?? 0}</p>
                  </div>
                </div>

                {selectedResult.signalAtPop && (
                  <div className="rounded-lg border bg-blue-50 p-3">
                    <p className="text-sm font-medium text-blue-900">Sinal via POP/OLT</p>
                    <p className="text-xs text-blue-800">POP: {selectedResult.signalAtPop.popName}</p>
                    <p className="text-xs text-blue-800">Porta OLT: {selectedResult.signalAtPop.oltEndpointId}</p>
                    <p className="text-xs text-blue-800">TX: {selectedResult.signalAtPop.txPowerDbm.toFixed(2)} dBm</p>
                    <p className="text-xs text-blue-800">Perda POP: {selectedResult.signalAtPop.popLossDb.toFixed(3)} dB</p>
                    <p className="text-xs font-semibold text-blue-900">RX estimado: {selectedResult.signalAtPop.estimatedRxDbm.toFixed(3)} dBm</p>
                  </div>
                )}

                {selectedResult.path && selectedResult.path.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Caminho</p>
                    <div className="space-y-2">
                      {selectedResult.path.map((step, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {index > 0 && <ArrowRight className="w-4 h-4 text-gray-400" />}
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
