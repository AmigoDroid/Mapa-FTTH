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
} from 'lucide-react';
import { FIBER_COLORS } from '@/types/ftth';
import type { Fiber } from '@/types/ftth';

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
  timestamp?: string;
}

export function ContinuityTester({ open, onOpenChange }: ContinuityTesterProps) {
  const { currentNetwork, testContinuity, getFiberContinuity } = useNetworkStore();
  const [selectedSource, setSelectedSource] = useState<{box?: any; cable?: any} | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [showVisualization, setShowVisualization] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);

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
      
      // Simular delay de teste
      await new Promise(resolve => setTimeout(resolve, 500));

      const continuity = selectedSource.box
        ? getFiberContinuity(fiber.id)
        : {
            connected: selectedSource.cable?.status === 'active',
            path: generatePath(fiber),
            attenuation:
              selectedSource.cable?.length != null
                ? Number(((selectedSource.cable.length / 1000) * 0.25 + 0.4).toFixed(3))
                : 0,
          };

      const passed = continuity.connected;
      const result: TestResult = {
        fiberId: fiber.id,
        fiberNumber: fiber.number,
        color: fiber.color,
        result: passed ? 'pass' : 'fail',
        attenuation: passed ? continuity.attenuation : undefined,
        distance: selectedSource.cable?.length || undefined,
        path: continuity.path,
        timestamp: new Date().toISOString(),
      };

      setTestResults(prev => [...prev, result]);
      
      // Registrar teste na store
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

  const generatePath = (fiber: Fiber): string[] => {
    const path: string[] = [];
    
    if (selectedSource?.box) {
      path.push(selectedSource.box.name);
      
      // Verificar se há fusão
      const boxFiber = selectedSource.box.fibers.find((f: any) => f.id === fiber.id);
      if (boxFiber?.fusionId) {
        const fusion = selectedSource.box.fusions.find((f: any) => f.id === boxFiber.fusionId);
        if (fusion) {
          const otherBoxId = fusion.boxAId === selectedSource.box.id ? fusion.boxBId : fusion.boxAId;
          const otherBox = currentNetwork?.boxes.find((b: any) => b.id === otherBoxId);
          if (otherBox) {
            path.push(`→ ${otherBox.name}`);
          }
        }
      }
    } else if (selectedSource?.cable) {
      const startBox = currentNetwork?.boxes.find((b: any) => b.id === selectedSource.cable?.startPoint);
      const endBox = currentNetwork?.boxes.find((b: any) => b.id === selectedSource.cable?.endPoint);
      
      if (startBox) path.push(startBox.name);
      path.push(`→ Cabo ${selectedSource.cable.name}`);
      if (endBox) path.push(`→ ${endBox.name}`);
    }
    
    return path;
  };

  const resetTest = () => {
    setTestResults([]);
    setCurrentTestIndex(0);
    setIsTesting(false);
    setSelectedResult(null);
  };

  const getPassRate = () => {
    if (testResults.length === 0) return 0;
    const passed = testResults.filter(r => r.result === 'pass').length;
    return Math.round((passed / testResults.length) * 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Teste de Continuidade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Seleção de fonte */}
          {!selectedSource ? (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Selecionar Caixa</h4>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {currentNetwork?.boxes.map((box: any) => (
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
                      {currentNetwork?.cables.map((cable: any) => (
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
              {/* Header com info da fonte */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-3">
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
                <Button variant="outline" size="sm" onClick={() => setSelectedSource(null)}>
                  Trocar
                </Button>
              </div>

              {/* Controles de teste */}
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

              {/* Progresso */}
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

              {/* Resultados */}
              {testResults.length > 0 && (
                <div className="space-y-4">
                  {/* Resumo */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{getPassRate()}%</p>
                        <p className="text-xs text-gray-500">Aprovado</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {testResults.filter(r => r.result === 'pass').length}
                        </p>
                        <p className="text-xs text-gray-500">Fibras OK</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold text-red-600">
                          {testResults.filter(r => r.result === 'fail').length}
                        </p>
                        <p className="text-xs text-gray-500">Falhas</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Lista de resultados */}
                  <ScrollArea className="h-64">
                    <div className="grid grid-cols-6 gap-2">
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
                          {result.attenuation && (
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

        {/* Visualização do caminho */}
        {showVisualization && selectedResult && (
          <Dialog open={showVisualization} onOpenChange={setShowVisualization}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Detalhes do Teste - Fibra {selectedResult.fiberNumber}</DialogTitle>
              </DialogHeader>
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

                {selectedResult.attenuation && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Atenuação</p>
                      <p className="text-lg font-semibold">{selectedResult.attenuation.toFixed(2)} dB</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <p className="text-xs text-gray-500">Distância</p>
                      <p className="text-lg font-semibold">{selectedResult.distance?.toFixed(0)} m</p>
                    </div>
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
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
