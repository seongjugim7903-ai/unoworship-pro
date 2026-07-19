import type { ChoirImage } from './choirImageRenderer';

const DATABASE_NAME = 'unoworship-pro-local-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'choir-generated-images';
const LATEST_KEY = 'latest';

interface CachedChoirImageSet {
  id: typeof LATEST_KEY;
  savedAt: string;
  images: Array<Pick<ChoirImage, 'index' | 'label' | 'blob' | 'uploadBlob'>>;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('이미지 캐시를 열지 못했습니다.'));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('이미지 캐시 작업에 실패했습니다.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('이미지 캐시 저장에 실패했습니다.'));
    };
  }));
}

export async function saveChoirImageCache(images: ChoirImage[]) {
  if (typeof window === 'undefined' || !window.indexedDB) return;

  const cached: CachedChoirImageSet = {
    id: LATEST_KEY,
    savedAt: new Date().toISOString(),
    images: images.map(({ index, label, blob, uploadBlob }) => ({
      index,
      label,
      blob,
      uploadBlob,
    })),
  };

  await runTransaction('readwrite', (store) => store.put(cached));
}

export async function loadChoirImageCache(): Promise<ChoirImage[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];

  const cached = await runTransaction<CachedChoirImageSet | undefined>(
    'readonly',
    (store) => store.get(LATEST_KEY),
  );

  if (!cached?.images?.length) return [];

  return cached.images.map((image) => ({
    ...image,
    url: URL.createObjectURL(image.blob),
  }));
}

export async function clearChoirImageCache() {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  await runTransaction('readwrite', (store) => store.delete(LATEST_KEY));
}
