import { lazy, Suspense, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';
import { useAuth } from '@/store/authStore';
import { ROLE_LABELS } from '@/auth/permissions';
import { FiberColorLegend } from '@/components/ui-custom/FiberColorLegend';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Info,
  LogOut,
  Menu,
  Network,
  Radar,
  Shield,
  TestTube,
  X,
} from 'lucide-react';

const NetworkMap = lazy(() =>
  import('@/components/map/NetworkMap').then((module) => ({ default: module.NetworkMap }))
);
const NetworkPanel = lazy(() =>
  import('@/components/ui-custom/NetworkPanel').then((module) => ({ default: module.NetworkPanel }))
);
const ContinuityTester = lazy(() =>
  import('@/components/ui-custom/ContinuityTester').then((module) => ({
    default: module.ContinuityTester,
  }))
);
const BoxDetail = lazy(() =>
  import('@/components/ui-custom/BoxDetail').then((module) => ({ default: module.BoxDetail }))
);
const PopDetail = lazy(() =>
  import('@/components/ui-custom/PopDetail').then((module) => ({ default: module.PopDetail }))
);
const FiberAnalyzerPanel = lazy(() =>
  import('@/components/ui-custom/FiberAnalyzerPanel').then((module) => ({
    default: module.FiberAnalyzerPanel,
  }))
);

interface NetworkWorkspaceProps {
  onOpenDashboard: () => void;
  onLogout: () => void;
}

export function NetworkWorkspace({ onOpenDashboard, onLogout }: NetworkWorkspaceProps) {
  const { currentUser, can } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLegend, setShowLegend] = useState(false);
  const [showTester, setShowTester] = useState(false);
  const [showFiberAnalyzer, setShowFiberAnalyzer] = useState(false);

  const { currentNetwork, selectedBox, selectedPop, selectBox, selectPop } = useNetworkStore();

  const canUpdateNetwork = can('network.update');
  const canDeleteNetwork = can('network.delete');
  const canEditMode = can('network.editMode');
  const canRunAnalysis = can('analysis.run');

  if (!currentNetwork) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 p-6">
        <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">FTTH Modelagem</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Nenhum projeto aberto</h1>
          <p className="mt-2 text-sm text-slate-600">
            Volte para o dashboard e abra um projeto para iniciar a modelagem no mapa.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button onClick={onOpenDashboard}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Ir para projetos
            </Button>
            <Button variant="outline" onClick={onLogout}>
              <LogOut className="mr-1 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div
        className={`
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-80' : 'w-0'}
          overflow-hidden
        `}
      >
        <Suspense
          fallback={
            <div className="grid h-full w-80 place-items-center text-xs text-gray-500">
              Carregando painel...
            </div>
          }
        >
          <NetworkPanel />
        </Suspense>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)}>
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenDashboard}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Projetos
            </Button>
            <div className="flex items-center gap-2">
              <Network className="h-6 w-6 text-blue-600" />
              <h1 className="text-lg font-bold">FABREU FTTH Doc</h1>
            </div>
            <span className="ml-2 text-sm text-gray-500">{currentNetwork.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowLegend(!showLegend)}>
              <Info className="mr-1 h-4 w-4" />
              Cores
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTester(true)}
              disabled={!canRunAnalysis}
              title={canRunAnalysis ? 'Executar teste de continuidade' : 'Sem permissao para testar continuidade'}
            >
              <TestTube className="mr-1 h-4 w-4" />
              Testar
            </Button>
            <Button
              variant={showFiberAnalyzer ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFiberAnalyzer((prev) => !prev)}
            >
              <Radar className="mr-1 h-4 w-4" />
              Analisar Fibra
            </Button>
            <div className="ml-2 hidden items-center gap-2 border-l pl-3 sm:flex">
              <Shield className="h-4 w-4 text-slate-500" />
              <div className="text-right leading-tight">
                <p className="text-xs font-medium text-slate-700">{currentUser?.displayName || 'Usuario'}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  {currentUser ? ROLE_LABELS[currentUser.role] : '-'}
                </Badge>
              </div>
            </div>
            {!canUpdateNetwork && !canDeleteNetwork && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                Somente leitura
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={onLogout} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="relative flex-1">
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">
                Carregando mapa...
              </div>
            }
          >
            <NetworkMap
              toolbarControls={{
                mapView: true,
                addCable: canUpdateNetwork,
                edit: canEditMode,
              }}
              drawingControls={{
                undoLastPoint: canUpdateNetwork,
                clearPoints: canUpdateNetwork,
                openCableConfig: canUpdateNetwork,
                saveEditedCable: canUpdateNetwork,
                cancelEditCable: canUpdateNetwork,
              }}
              dialogs={{
                addPop: canUpdateNetwork,
                addBox: canUpdateNetwork,
                addReserve: canUpdateNetwork,
                addCable: canUpdateNetwork,
              }}
            />
          </Suspense>

          {showFiberAnalyzer && (
            <Suspense fallback={null}>
              <FiberAnalyzerPanel open={showFiberAnalyzer} onOpenChange={setShowFiberAnalyzer} />
            </Suspense>
          )}
          {showLegend && <FiberColorLegend />}
        </main>
      </div>

      {selectedBox && (
        <Suspense fallback={null}>
          <BoxDetail box={selectedBox} open={Boolean(selectedBox)} onOpenChange={(open) => !open && selectBox(null)} />
        </Suspense>
      )}

      {selectedPop && (
        <Suspense fallback={null}>
          <PopDetail pop={selectedPop} open={Boolean(selectedPop)} onOpenChange={(open) => !open && selectPop(null)} />
        </Suspense>
      )}

      {showTester && (
        <Suspense fallback={null}>
          <ContinuityTester open={showTester} onOpenChange={setShowTester} />
        </Suspense>
      )}
    </div>
  );
}
