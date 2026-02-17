import { useState, useEffect } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { NetworkMap } from '@/components/map/NetworkMap';
import { NetworkPanel } from '@/components/ui-custom/NetworkPanel';
import { FiberColorLegend } from '@/components/ui-custom/FiberColorLegend';
import { ContinuityTester } from '@/components/ui-custom/ContinuityTester';
import { BoxDetail } from '@/components/ui-custom/BoxDetail';
import { PopDetail } from '@/components/ui-custom/PopDetail';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  Menu, 
  X, 
  Network, 
  Route,
  Info,
  TestTube,
  Plus
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [showNewNetwork, setShowNewNetwork] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');
  const [newNetworkDescription, setNewNetworkDescription] = useState('');
  
  const { 
    currentNetwork, 
    createNetwork, 
    selectedBox,
    selectedPop,
    selectBox,
    selectPop,
  } = useNetworkStore();

  // Criar rede de exemplo na primeira execução
  useEffect(() => {
    if (!currentNetwork) {
      //createNetwork('Rede FTTH - Exemplo', 'Rede de exemplo para demonstração');
     // toast.success('Rede de exemplo criada! Use o painel lateral para adicionar caixas e cabos.');
    }
  }, [currentNetwork, createNetwork]);

  const handleCreateNetwork = () => {
    if (!newNetworkName.trim()) {
      toast.error('Digite um nome para a rede');
      return;
    }
    createNetwork(newNetworkName, newNetworkDescription);
    setShowNewNetwork(false);
    setNewNetworkName('');
    setNewNetworkDescription('');
    toast.success('Rede criada com sucesso!');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div 
        className={`
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-80' : 'w-0'}
          overflow-hidden
        `}
      >
        <NetworkPanel />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
            <div className="flex items-center gap-2">
              <Network className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-bold">FABREU FTTH Doc</h1>
            </div>
            {currentNetwork && (
              <span className="text-sm text-gray-500 ml-4">
                {currentNetwork.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowLegend(!showLegend)}
            >
              <Info className="w-4 h-4 mr-1" />
              Cores
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowTester(true)}
            >
              <TestTube className="w-4 h-4 mr-1" />
              Testar
            </Button>
            <Button 
              variant="default" 
              size="sm"
              onClick={() => setShowNewNetwork(true)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Nova Rede
            </Button>
          </div>
        </header>

        {/* Map Area */}
        <main className="flex-1 relative">
          <NetworkMap />
          
          {/* Legend */}
          {showLegend && <FiberColorLegend />}
          
          {/* Quick Stats */}
          {currentNetwork && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded" />
                  <span>CEO: {currentNetwork.boxes.filter((b: {type: string}) => b.type === 'CEO').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded" />
                  <span>CTO: {currentNetwork.boxes.filter((b: {type: string}) => b.type === 'CTO').length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full" />
                  <span>DIO: {currentNetwork.boxes.filter((b: {type: string}) => b.type === 'DIO').length}</span>
                </div>
              <div className="flex items-center gap-2">
                <Route className="w-3 h-3 text-green-600" />
                <span>Cabos: {currentNetwork.cables.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Route className="w-3 h-3 text-violet-600" />
                <span>POPs: {(currentNetwork.pops || []).length}</span>
              </div>
                <div className="flex items-center gap-2">
                  <Route className="w-3 h-3 text-green-600" />
                  <span>Fusões: {currentNetwork.fusions.length}</span>
                </div>
              
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      {selectedBox && (
        <BoxDetail 
          box={selectedBox}
          open={!!selectedBox}
          onOpenChange={(open: boolean) => !open && selectBox(null)}
        />
      )}

      {selectedPop && (
        <PopDetail
          pop={selectedPop}
          open={!!selectedPop}
          onOpenChange={(open: boolean) => !open && selectPop(null)}
        />
      )}

      {showTester && (
        <ContinuityTester 
          open={showTester}
          onOpenChange={setShowTester}
        />
      )}

      {/* New Network Dialog */}
      <Dialog open={showNewNetwork} onOpenChange={setShowNewNetwork}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Rede</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                Criar Rede
              </Button>
              <Button variant="outline" onClick={() => setShowNewNetwork(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster />
    </div>
  );
}

export default App;
