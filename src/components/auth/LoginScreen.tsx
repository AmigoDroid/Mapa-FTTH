import { useState, type FormEvent } from 'react';
import { KeyRound, ServerCog, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginScreen() {
  const { login, isAuthenticating } = useAuth();
  const [providerSlug, setProviderSlug] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('ftth:last-provider-slug') || '';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await login(providerSlug, username, password);
    if (!result.success) {
      setError(result.message || 'Falha ao autenticar.');
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('ftth:last-provider-slug', providerSlug.trim().toLowerCase());
    }
    setError('');
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Acesso ao FABREU FTTH Doc
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="login-provider">Provedor (slug)</Label>
                <Input
                  id="login-provider"
                  value={providerSlug}
                  onChange={(event) => setProviderSlug(event.target.value)}
                  placeholder="ex: provedor-x"
                  autoComplete="organization"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-username">Usuario</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Seu usuario"
                    className="pl-10"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    className="pl-10"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isAuthenticating}>
                {isAuthenticating ? 'Autenticando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ServerCog className="h-5 w-5 text-indigo-600" />
              Acesso por provedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              O login e validado por API com JWT, RBAC e controle de licenca.
            </p>
            <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
              Use o slug do seu provedor e suas credenciais de acesso.
            </p>
            <p className="text-xs text-slate-600">
              Se nao tiver credenciais, solicite ao gestor/administrador da plataforma.
            </p>
            <p className="text-xs text-slate-600">
              Acesso administrador global: <span className="font-mono">/system</span>
            </p>
            <p className="text-xs text-slate-500">
              API padrao: <span className="font-mono">http://localhost:4000/api</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
