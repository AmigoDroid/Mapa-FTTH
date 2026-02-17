import { useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Activity, 
  Route,
  Zap,
  Save,
  Trash2,
  MapPin,
  Calendar,
  Ruler,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Cable, Fiber } from '@/types/ftth';

interface CableDetailProps {
  cable: Cable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CableDetail({ cable, open, onOpenChange }: CableDetailProps) {
  const { 
    currentNetwork, 
    updateCable, 
    removeCable,
    testContinuity,
    getFiberContinuity,
  } = useNetworkStore();

  const [selectedFiber, setSelectedFiber] = useState<Fiber | null>(null);
  const [editingCable, setEditingCable] = useState(false);
  const [cableName, setCableName] = useState(cable.name);
  const [cableStatus, setCableStatus] = useState(cable.status);
  const [testResults, setTestResults] = useState<Map<string, 'pass' | 'fail'>>(new Map());

  const startBox = currentNetwork?.boxes.find((b: any) => b.id === cable.startPoint);
  const endBox = currentNetwork?.boxes.find((b: any) => b.id === cable.endPoint);

  const getFiberStatus = (fiber: Fiber) => {
    if (fiber.status === 'active') return { color: 'bg-green-500', label: 'Ativa' };
    if (fiber.status === 'faulty') return { color: 'bg-red-500', label: 'Defeituosa' };
    if (fiber.status === 'reserved') return { color: 'bg-yellow-500', label: 'Reservada' };
    return { color: 'bg-gray-300', label: 'Disponível' };
  };

  const handleSaveCable = () => {
    updateCable(cable.id, {
      name: cableName,
      status: cableStatus as any,
    });
    setEditingCable(false);
  };

  const handleTestFiber = (fiber: Fiber) => {
    const continuity = getFiberContinuity(fiber.id);
    const result: 'pass' | 'fail' = continuity.connected ? 'pass' : 'fail';
    setTestResults(prev => new Map(prev).set(fiber.id, result));
    
    testContinuity({
      cableId: cable.id,
      fiberNumber: fiber.number,
      startPoint: startBox?.name || '',
      endPoint: continuity.path.length > 0 ? continuity.path[continuity.path.length - 1] : (endBox?.name || ''),
      result,
      attenuation: result === 'pass' ? continuity.attenuation : undefined,
      distance: cable.length,
      technician: 'Tecnico',
    });
  };

  const handleTestAllFibers = () => {
    const newResults = new Map(testResults);
    cable.fibers.forEach((fiber) => {
      const continuity = getFiberContinuity(fiber.id);
      const result: 'pass' | 'fail' = continuity.connected ? 'pass' : 'fail';
      newResults.set(fiber.id, result);
      testContinuity({
        cableId: cable.id,
        fiberNumber: fiber.number,
        startPoint: startBox?.name || '',
        endPoint: continuity.path.length > 0 ? continuity.path[continuity.path.length - 1] : (endBox?.name || ''),
        result,
        attenuation: result === 'pass' ? continuity.attenuation : undefined,
        distance: cable.length,
        technician: 'Tecnico',
      });
    });
    setTestResults(newResults);
  };

  const getFiberPath = (fiber: Fiber) => {
    const path: string[] = [];
    
    // Adicionar caixa inicial
    if (startBox) {
      path.push(`${startBox.name} (Fibra ${fiber.number})`);
    }
    
    // Verificar se há fusões no caminho
    const startBoxFiber = startBox?.fibers.find((f: any) => f.id === fiber.id);
    if (startBoxFiber?.fusionId) {
      const fusion = startBox?.fusions.find((f: any) => f.id === startBoxFiber.fusionId);
      if (fusion) {
        const otherBoxId = fusion.boxAId === startBox?.id ? fusion.boxBId : fusion.boxAId;
        const otherBox = currentNetwork?.boxes.find((b: any) => b.id === otherBoxId);
        if (otherBox) {
          path.push(`→ ${otherBox.name}`);
        }
      }
    }
    
    // Adicionar caixa final
    if (endBox) {
      path.push(`→ ${endBox.name}`);
    }
    
    return path;
  };

  const getActiveFibersCount = () => cable.fibers.filter((f: any) => f.status === 'active').length;
  const getFaultyFibersCount = () => cable.fibers.filter((f: any) => f.status === 'faulty').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-500" />
            {cable.name}
            <Badge variant={cable.status === 'active' ? 'default' : 'secondary'}>
              {cable.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="fibers" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="fibers">Fibras</TabsTrigger>
            <TabsTrigger value="path">Rota</TabsTrigger>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="tests">Testes</TabsTrigger>
          </TabsList>

          {/* Aba de Fibras */}
          <TabsContent value="fibers" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-500 flex gap-4">
                <span>Total: {cable.fibers.length} fibras</span>
                <span className="text-green-600">Ativas: {getActiveFibersCount()}</span>
                <span className="text-red-600">Defeituosas: {getFaultyFibersCount()}</span>
                <span className="text-gray-400">Disponíveis: {cable.fibers.filter((f: any) => f.status === 'inactive').length}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestAllFibers}>
                  <Activity className="w-4 h-4 mr-1" />
                  Testar Todas
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-8 gap-2">
                {cable.fibers.map((fiber: any) => {
                  const status = getFiberStatus(fiber);
                  const testResult = testResults.get(fiber.id);
                  
                  return (
                    <div
                      key={fiber.id}
                      className={`
                        relative p-2 rounded-lg border-2 cursor-pointer transition-all
                        ${selectedFiber?.id === fiber.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
                      `}
                      onClick={() => setSelectedFiber(fiber)}
                    >
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <div 
                          className="w-3 h-3 rounded-full border"
                          style={{ backgroundColor: fiber.color.hex, borderColor: '#ccc' }}
                        />
                      </div>
                      <div className="text-center font-mono text-xs">{fiber.number}</div>
                      <div className={`w-full h-1 rounded mt-1 ${status.color}`} />
                      
                      {testResult && (
                        <div className="absolute -top-1 -right-1">
                          {testResult === 'pass' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 bg-white rounded-full" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 bg-white rounded-full" />
                          )}
                        </div>
                      )}
                      
                      {fiber.connectedTo && (
                        <div className="absolute -bottom-1 -right-1">
                          <Zap className="w-3 h-3 text-blue-500 bg-white rounded-full" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedFiber && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">
                  Fibra {selectedFiber.number} - {selectedFiber.color.name}
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <Badge variant={selectedFiber.status === 'active' ? 'default' : 'secondary'}>
                      {selectedFiber.status}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-gray-500">Tubo:</span> {(selectedFiber as any).tubeNumber || 'N/A'}
                  </div>
                  {selectedFiber.clientName && (
                    <div>
                      <span className="text-gray-500">Cliente:</span> {selectedFiber.clientName}
                    </div>
                  )}
                  {testResults.has(selectedFiber.id) && (
                    <div>
                      <span className="text-gray-500">Teste:</span>{' '}
                      <Badge variant={testResults.get(selectedFiber.id) === 'pass' ? 'default' : 'destructive'}>
                        {testResults.get(selectedFiber.id) === 'pass' ? 'Aprovado' : 'Reprovado'}
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => handleTestFiber(selectedFiber)}>
                    <Activity className="w-4 h-4 mr-1" />
                    Testar Continuidade
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Aba de Rota */}
          <TabsContent value="path" className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Route className="w-5 h-5" />
                Traçado do Cabo
              </h4>
              
              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-2 bg-white p-3 rounded-lg shadow-sm">
                  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                    A
                  </div>
                  <div>
                    <div className="font-medium">{startBox?.name}</div>
                    <div className="text-xs text-gray-500">{startBox?.type}</div>
                  </div>
                </div>
                
                <div className="flex-1 h-1 bg-gradient-to-r from-blue-500 to-green-500 relative">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-white px-2 text-xs text-gray-500">
                    {cable.length}m
                  </div>
                </div>
                
                <div className="flex items-center gap-2 bg-white p-3 rounded-lg shadow-sm">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">
                    B
                  </div>
                  <div>
                    <div className="font-medium">{endBox?.name}</div>
                    <div className="text-xs text-gray-500">{endBox?.type}</div>
                  </div>
                </div>
              </div>

              {cable.path.length > 0 && (
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2">Pontos de Passagem</h5>
                  <div className="space-y-2">
                    {cable.path.map((point: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span>Lat: {point.lat.toFixed(6)}, Lng: {point.lng.toFixed(6)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedFiber && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Caminho da Fibra {selectedFiber.number}</h4>
                <div className="space-y-1">
                  {getFiberPath(selectedFiber).map((step, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      {index > 0 && <div className="w-4 h-4 border-l-2 border-b-2 border-gray-300 ml-2" />}
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Aba de Informações */}
          <TabsContent value="info" className="space-y-4">
            {!editingCable ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-500">Nome</Label>
                    <p className="font-medium">{cable.name}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Tipo</Label>
                    <p className="font-medium">{cable.type}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Fibras</Label>
                    <p className="font-medium">{cable.fiberCount}</p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Comprimento</Label>
                    <p className="font-medium flex items-center gap-2">
                      <Ruler className="w-4 h-4" />
                      {cable.length} metros
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Status</Label>
                    <Badge variant={cable.status === 'active' ? 'default' : 'secondary'}>
                      {cable.status}
                    </Badge>
                  </div>
                  {cable.installationDate && (
                    <div>
                      <Label className="text-gray-500">Data de Instalação</Label>
                      <p className="font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {new Date(cable.installationDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label className="text-gray-500">Origem</Label>
                    <p className="font-medium">{startBox?.name} ({startBox?.type})</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-gray-500">Destino</Label>
                    <p className="font-medium">{endBox?.name} ({endBox?.type})</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditingCable(true)}>
                    <Save className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button variant="destructive" onClick={() => {
                    if (confirm('Tem certeza que deseja excluir este cabo?')) {
                      removeCable(cable.id);
                      onOpenChange(false);
                    }
                  }}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={cableName} onChange={(e) => setCableName(e.target.value)} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={cableStatus} onValueChange={(v: any) => setCableStatus(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="maintenance">Manutenção</SelectItem>
                      <SelectItem value="projected">Projetado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveCable}>
                    <Save className="w-4 h-4 mr-1" />
                    Salvar
                  </Button>
                  <Button variant="outline" onClick={() => setEditingCable(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Aba de Testes */}
          <TabsContent value="tests">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {testResults.size === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    Nenhum teste realizado ainda
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Array.from(testResults.entries()).map(([fiberId, result]) => {
                      const fiber = cable.fibers.find((f: any) => f.id === fiberId);
                      if (!fiber) return null;
                      
                      return (
                        <div 
                          key={fiberId} 
                          className={`p-3 rounded-lg flex items-center justify-between ${
                            result === 'pass' ? 'bg-green-50' : 'bg-red-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: fiber.color.hex }}
                            />
                            <span className="font-medium">Fibra {fiber.number}</span>
                            <span className="text-sm text-gray-500">({fiber.color.name})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {result === 'pass' ? (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                <span className="text-green-700">Aprovado</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-5 h-5 text-red-500" />
                                <span className="text-red-700">Reprovado</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

