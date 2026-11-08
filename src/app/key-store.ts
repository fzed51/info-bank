// Clé AES dérivée, conservée sur l'appareil si l'utilisateur le demande. La clé est non
// extractible : IndexedDB garde l'objet CryptoKey, jamais ses octets ni la phrase.

const dbName = "info-bank";
const storeName = "keys";
const recordId = "main";

export interface StoredKey {
  key: CryptoKey;
  /** Sel de dérivation : si le fichier publié en change, la clé n'est plus valable. */
  salt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(
        db.transaction(storeName, mode).objectStore(storeName),
      );
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Clé mémorisée, ou `undefined` (rien d'enregistré, navigation privée, stockage bloqué). */
export async function loadKey(): Promise<StoredKey | undefined> {
  try {
    return await run<StoredKey | undefined>("readonly", (s) => s.get(recordId));
  } catch {
    return undefined;
  }
}

export async function saveKey(value: StoredKey): Promise<boolean> {
  try {
    await run("readwrite", (s) => s.put(value, recordId));
    return true;
  } catch {
    return false;
  }
}

export async function clearKey(): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(recordId));
  } catch {
    // Rien à effacer si le stockage est indisponible.
  }
}
