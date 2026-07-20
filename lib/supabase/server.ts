// Supabase 서버 전용 REST/Storage 클라이언트 — service role key는 브라우저로 절대 내보내지 않는다.

export class SupabaseServerConfigError extends Error {
  code = 'SUPABASE_NOT_CONFIGURED';
}

interface SupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

interface RestOptions {
  prefer?: string;
}

interface UploadObjectInput {
  bucket: string;
  path: string;
  body: BodyInit;
  contentType: string;
  upsert?: boolean;
}

interface EnsureBucketInput {
  bucket: string;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
}

const ensuredBuckets = new Map<string, Promise<void>>();

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!rawUrl || !serviceRoleKey) {
    throw new SupabaseServerConfigError(
      'Supabase 저장 환경변수가 없습니다. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 Vercel 환경변수에 등록해 주세요.',
    );
  }

  return {
    url: rawUrl.replace(/\/+$/, ''),
    serviceRoleKey,
  };
}

function createHeaders(config: SupabaseServerConfig, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set('apikey', config.serviceRoleKey);
  headers.set('authorization', `Bearer ${config.serviceRoleKey}`);
  return headers;
}

async function parseSupabaseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function supabaseRest<T>(
  path: string,
  init: RequestInit,
  options: RestOptions = {},
): Promise<T> {
  const config = getSupabaseServerConfig();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const headers = createHeaders(config, init.headers);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (options.prefer) {
    headers.set('prefer', options.prefer);
  }

  const response = await fetch(`${config.url}/rest/v1${normalizedPath}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const body = await parseSupabaseResponse(response);

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `Supabase REST 요청 실패 (${response.status})`;
    throw new Error(message);
  }

  return body as T;
}

function encodeObjectPath(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export async function uploadSupabaseObject(input: UploadObjectInput) {
  const config = getSupabaseServerConfig();
  const headers = createHeaders(config, {
    'content-type': input.contentType,
    'x-upsert': input.upsert === false ? 'false' : 'true',
  });
  const objectPath = `${encodeURIComponent(input.bucket)}/${encodeObjectPath(input.path)}`;

  const response = await fetch(`${config.url}/storage/v1/object/${objectPath}`, {
    method: 'POST',
    headers,
    body: input.body,
    cache: 'no-store',
  });
  const body = await parseSupabaseResponse(response);

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `Supabase Storage 업로드 실패 (${response.status})`;
    throw new Error(message);
  }

  return body;
}

export async function createSignedUrl(input: { bucket: string; path: string; expiresIn?: number }) {
  const config = getSupabaseServerConfig();
  const headers = createHeaders(config, { 'content-type': 'application/json' });
  const objectPath = `${encodeURIComponent(input.bucket)}/${encodeObjectPath(input.path)}`;

  const response = await fetch(`${config.url}/storage/v1/object/sign/${objectPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: input.expiresIn ?? 3600 }),
    cache: 'no-store',
  });
  const body = await parseSupabaseResponse(response);

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `Supabase signed URL 발급 실패 (${response.status})`;
    throw new Error(message);
  }

  const signed = body && typeof body === 'object' && 'signedURL' in body
    ? String((body as { signedURL: unknown }).signedURL)
    : '';
  if (!signed) throw new Error('signed URL을 받지 못했습니다.');
  return `${config.url}/storage/v1${signed}`;
}

export async function deleteSupabaseObjects(input: { bucket: string; paths: string[] }) {
  if (input.paths.length === 0) return;

  const config = getSupabaseServerConfig();
  const headers = createHeaders(config, { 'content-type': 'application/json' });
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(input.bucket)}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: input.paths }),
    cache: 'no-store',
  });
  const body = await parseSupabaseResponse(response);

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body && typeof body === 'object' && 'message' in body
        ? String(body.message)
        : `Supabase Storage 객체 삭제 실패 (${response.status})`;
    throw new Error(message);
  }
}

export async function ensureSupabaseBucket(input: EnsureBucketInput) {
  const cacheKey = `${input.bucket}:${input.fileSizeLimit}:${input.allowedMimeTypes.join(',')}`;
  const existing = ensuredBuckets.get(cacheKey);
  if (existing) return existing;

  const operation = (async () => {
    const config = getSupabaseServerConfig();
    const headers = createHeaders(config, { 'content-type': 'application/json' });
    const response = await fetch(`${config.url}/storage/v1/bucket/${encodeURIComponent(input.bucket)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        public: false,
        file_size_limit: input.fileSizeLimit,
        allowed_mime_types: input.allowedMimeTypes,
      }),
      cache: 'no-store',
    });
    const body = await parseSupabaseResponse(response);

    if (!response.ok) {
      ensuredBuckets.delete(cacheKey);
      const message = typeof body === 'string'
        ? body
        : body && typeof body === 'object' && 'message' in body
          ? String(body.message)
          : `Supabase Storage 버킷 설정 실패 (${response.status})`;
      throw new Error(message);
    }
  })();

  ensuredBuckets.set(cacheKey, operation);
  return operation;
}
