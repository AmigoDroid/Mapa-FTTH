const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const defaultDevApiBaseUrl = 'http://localhost:4000/api';
const API_BASE_URL = (configuredApiBaseUrl || (import.meta.env.DEV ? defaultDevApiBaseUrl : '')).replace(/\/+$/, '');

if (!API_BASE_URL && !import.meta.env.DEV) {
  console.error('VITE_API_BASE_URL nao configurada para producao. Defina a URL da API externa.');
}

let accessToken: string | null = null;

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export const setApiAccessToken = (token: string | null) => {
  accessToken = token;
};

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

export const apiRequest = async <T>(path: string, options: ApiRequestOptions = {}): Promise<T> => {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL nao configurada. Defina a URL da API no frontend em producao.');
  }

  const { body, auth = true, headers, ...rest } = options;
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set('Content-Type', 'application/json');
  if (auth && accessToken) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...rest,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const defaultMessage = `Erro de API (${response.status})`;
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message?: string }).message || defaultMessage)
        : defaultMessage;
    throw new ApiError(message, response.status, payload);
  }

  return (payload as T) ?? ({} as T);
};
