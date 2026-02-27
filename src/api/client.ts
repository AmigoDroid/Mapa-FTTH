const defaultApiBaseUrl = import.meta.env.DEV
  ? 'http://localhost:4000/api'
  : `${typeof window !== 'undefined' ? window.location.origin : ''}/api`;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl).replace(/\/+$/, '');

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
