import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldAlert, User } from 'lucide-react';
import { useSystemAuth } from '@/store/systemAuthStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SystemLoginScreen() {
  const { login, isAuthenticating } = useSystemAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await login(username, password);
    if (!result.success) {
      setError(result.message || 'Falha ao autenticar.');
      return;
    }
    setError('');
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Acesso Administrador Global
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
              <div className="space-y-2">
                <Label htmlFor="system-login-username">Usuario</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="system-login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system-login-password">Senha</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="system-login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10"
                    autoComplete="off"
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isAuthenticating}>
                {isAuthenticating ? 'Autenticando...' : 'Entrar como Admin Global'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900">Acesso separado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Esta area e exclusiva para controle de provedores e licencas.
            </p>
            <p>
              Login e senha ficam separados em{' '}
              <span className="font-mono">backend/config/system-admin.js</span>.
            </p>
            <p>
              Voltar ao portal do provedor:{' '}
              <a href="/" className="font-mono underline">
                /
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
