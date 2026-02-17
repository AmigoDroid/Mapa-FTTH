import { useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Network, 
  Box, 
  Route,
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  Edit3,
  Save,
  X,
  Activity,
  MapPin,
  Zap,
  Settings,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { BoxDetail } from './BoxDetail';
import { CableDetail } from './CableDetail';

export function NetworkPanel() {
  const { 
    currentNetwork, 
    createNetwork, 
    exportNetwork,
    importNetwork,
    resetNetwork,
    removeBox,
  } = useNetworkStore();

  const [showNewNetwork, setShowNewNetwork] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkDescription, setNewNetworkDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoxForDetail, setSelectedBoxForDetail] = useState<any>(null);
  const [selectedCableForDetail, setSelectedCableForDetail] = useState<any>(null);
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());

  const handleCreateNetwork = () => {
    if (!newNetworkName) return;
    createNetwork(newNetworkName, newNetworkDescription);
    setShowNewNetwork(false);
    setNewNetworkName('');
    setNewNetworkDescription('');
  };

  const handleExport = () => {
    const data = exportNetwork();
    if (data) {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentNetwork?.name || 'rede'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result as string;
      if (importNetwork(data)) {
        alert('Rede importada com sucesso!');
      } else {
        alert('Erro ao importar rede. Verifique o arquivo.');
      }
    };
    reader.readAsText(file);
  };

  const toggleBoxExpansion = (boxId: string) => {
    const newExpanded = new Set(expandedBoxes);
    if (newExpanded.has(boxId)) {
      newExpanded.delete(boxId);
    } else {
      newExpanded.add(boxId);
    }
    setExpandedBoxes(newExpanded);
  };

  const filteredBoxes = currentNetwork?.boxes.filter((box: any) => 
    box.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    box.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    box.address?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredCables = currentNetwork?.cables.filter((cable: any) => 
    cable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cable.type.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!currentNetwork) {
    return (
      <Card className="w-80 h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5" />
            Rede FTTH
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">Nenhuma rede criada</p>
            <Button onClick={() => setShowNewNetwork(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Criar Rede
            </Button>
          </div>

          {showNewNetwork && (
            <div className="mt-4 space-y-3 border-t pt-4">
              <div>
                <Label>Nome da Rede</Label>
                <Input 
                  value={newNetworkName}
                  onChange={(e) => setNewNetworkName(e.target.value)}
                  placeholder="Ex: Rede Centro"
                />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input 
                  value={newNetworkDescription}
                  onChange={(e) => setNewNetworkDescription(e.target.value)}
                  placeholder="Descrição da rede"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateNetwork} className="flex-1">
                  <Save className="w-4 h-4 mr-1" />
                  Criar
                </Button>
                <Button variant="outline" onClick={() => setShowNewNetwork(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 border-t pt-4">
            <Label className="mb-2 block">Importar Rede</Label>
            <Input 
              type="file" 
              accept=".json"
              onChange={handleImport}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-80 h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="w-5 h-5" />
            {currentNetwork.name}
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => document.getElementById('import-file')?.click()}>
              <Upload className="w-4 h-4" />
            </Button>
            <input 
              id="import-file"
              type="file" 
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => {
              if (confirm('Tem certeza que deseja limpar a rede?')) {
                resetNetwork();
              }
            }}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <Tabs defaultValue="boxes" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="boxes">
                <Box className="w-4 h-4 mr-1" />
                Caixas
              </TabsTrigger>
              <TabsTrigger value="cables">
                <Route className="w-4 h-4 mr-1" />
                Cabos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="boxes" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredBoxes.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">
                      Nenhuma caixa encontrada
                    </div>
                  ) : (
                    filteredBoxes.map((box: any) => {
                      const activeFibers = box.fibers.filter((f: any) => f.status === 'active').length;
                      const isExpanded = expandedBoxes.has(box.id);
                      
                      return (
                        <div 
                          key={box.id} 
                          className="border rounded-lg overflow-hidden"
                        >
                          <div 
                            className="p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 flex items-center justify-between"
                            onClick={() => toggleBoxExpansion(box.id)}
                          >
                            <div className="flex items-center gap-2">
                              {box.type === 'CEO' && <Activity className="w-4 h-4 text-blue-500" />}
                              {box.type === 'CTO' && <Zap className="w-4 h-4 text-green-500" />}
                              {box.type === 'DIO' && <Settings className="w-4 h-4 text-orange-500" />}
                              <span className="font-medium text-sm">{box.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {activeFibers}/{box.capacity}
                              </Badge>
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="p-3 border-t bg-white">
                              <div className="text-xs text-gray-500 space-y-1">
                                <p>Tipo: {box.type}</p>
                                <p>Status: {box.status}</p>
                                {box.address && (
                                  <p className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {box.address}
                                  </p>
                                )}
                                <p>Fibras ativas: {activeFibers}</p>
                                <p>Fusões: {box.fusions.length}</p>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="flex-1 text-xs"
                                  onClick={() => setSelectedBoxForDetail(box)}
                                >
                                  <Edit3 className="w-3 h-3 mr-1" />
                                  Detalhes
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm('Tem certeza que deseja excluir esta caixa?')) {
                                      removeBox(box.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="cables" className="flex-1 overflow-hidden">
              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2">
                  {filteredCables.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">
                      Nenhum cabo encontrado
                    </div>
                  ) : (
                    filteredCables.map((cable: any) => {
                      const startBox = currentNetwork.boxes.find((b: any) => b.id === cable.startPoint);
                      const endBox = currentNetwork.boxes.find((b: any) => b.id === cable.endPoint);
                      
                      return (
                        <div 
                          key={cable.id} 
                          className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                          onClick={() => setSelectedCableForDetail(cable)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{cable.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {cable.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <p>{startBox?.name || 'Sem origem'} {'->'} {endBox?.name || 'Sem destino'}</p>
                            <p>{cable.model || 'AS-80'} | {cable.fiberCount} fibras | {cable.length}m</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Modais de detalhe */}
      {selectedBoxForDetail && (
        <BoxDetail 
          box={selectedBoxForDetail}
          open={!!selectedBoxForDetail}
          onOpenChange={(open: boolean) => !open && setSelectedBoxForDetail(null)}
        />
      )}

      {selectedCableForDetail && (
        <CableDetail 
          cable={selectedCableForDetail}
          open={!!selectedCableForDetail}
          onOpenChange={(open: boolean) => !open && setSelectedCableForDetail(null)}
        />
      )}
    </>
  );
}
