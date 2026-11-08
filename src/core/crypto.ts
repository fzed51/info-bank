// Chiffrement des données publiées : PBKDF2-SHA256 → AES-256-GCM, après compression gzip.
// Uniquement WebCrypto et les flux standard : le même code tourne dans Node 24 et le navigateur.

export const pbkdf2Iterations = 600_000;

export interface KdfParams {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  /** Sel en base64. */
  salt: string;
}

export interface EncryptedFile {
  v: 1;
  kdf: KdfParams;
  /** Vecteur d'initialisation AES-GCM (12 octets) en base64. */
  iv: string;
  /** Données chiffrées (gzip puis AES-GCM, étiquette incluse) en base64. */
  ct: string;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number): Uint8Array<ArrayBuffer> =>
  crypto.getRandomValues(new Uint8Array(n));

export function newKdfParams(): KdfParams {
  return {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: pbkdf2Iterations,
    salt: toBase64(randomBytes(16)),
  };
}

/** Clé AES dérivée de la phrase. Non extractible : elle peut être conservée dans IndexedDB sans exposer ses octets. */
export async function deriveKey(
  passphrase: string,
  kdf: KdfParams,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: kdf.hash,
      iterations: kdf.iterations,
      salt: fromBase64(kdf.salt),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encryptJson(
  value: unknown,
  key: CryptoKey,
  kdf: KdfParams,
): Promise<EncryptedFile> {
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const packed = await pipe(plain, new CompressionStream("gzip"));
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packed),
  );
  return { v: 1, kdf, iv: toBase64(iv), ct: toBase64(ct) };
}

export class WrongKeyError extends Error {
  constructor() {
    super("Clé incorrecte.");
    this.name = "WrongKeyError";
  }
}

/** Déchiffre ; une clé incorrecte fait échouer la vérification GCM (`WrongKeyError`). */
export async function decryptJson(
  file: EncryptedFile,
  key: CryptoKey,
): Promise<unknown> {
  let packed: ArrayBuffer;
  try {
    packed = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(file.iv) },
      key,
      fromBase64(file.ct),
    );
  } catch {
    throw new WrongKeyError();
  }
  const plain = await pipe(
    new Uint8Array(packed),
    new DecompressionStream("gzip"),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

export function isEncryptedFile(value: unknown): value is EncryptedFile {
  const f = value as EncryptedFile;
  return (
    typeof f === "object" &&
    f !== null &&
    f.v === 1 &&
    f.kdf?.name === "PBKDF2" &&
    typeof f.kdf.salt === "string" &&
    typeof f.iv === "string" &&
    typeof f.ct === "string"
  );
}
