import { Toaster } from '@/components/ui/sonner';
import { SystemDashboard } from '@/components/system/SystemDashboard';
import { SystemLoginScreen } from '@/components/system/SystemLoginScreen';
import { useSystemAuth } from '@/store/systemAuthStore';

export function SystemApp() {
  const { isAuthenticated, isHydrating } = useSystemAuth();

  if (isHydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Carregando sessao global...
      </div>
    );
  }

  return (
    <>
      {isAuthenticated ? <SystemDashboard /> : <SystemLoginScreen />}
      <Toaster />
    </>
  );
}
