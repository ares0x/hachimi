// packages/config/src/credential-store.ts
// Split credential storage: secrets live in ~/.hachimi/credentials.json (mode 0600,
// atomic writes under a cross-process lock), never in config.json.
//
// Design (informed by maka-agent's storage and Claude Code's secure storage):
// - Typed kinds: an entry is (slug, kind), not a bare string keyed by connection id.
// - File schema v2: { version: 2, values: Record<string,string> } with key `${slug}:${kind}`.
//   v1 files ({ version: 1, credentials: Record<id, key> }) migrate to v2 on first load.
// - Writes are serialized across processes by an atomic-mkdir lockfile that is never
//   stolen (POSIX mkdir is atomic; we wait then fail loud rather than risk a TOCTOU steal).
// - At-rest hardening: 0700 dir, 0600 file written via O_EXCL temp + atomic rename.
// - Fail-closed: unknown schema versions are backed up and reported, never silently dropped.
// - Optional SecretCipher (e.g. Electron safeStorage in the desktop main process) can be
//   injected later to encrypt values at rest; plaintext-0600 remains the headless default.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Typed credential kinds, loosely mirroring maka-agent's CredentialKind. */
export type CredentialKind =
  | "api_key"
  | "bot_token"
  | "app_secret"
  | "proxy_password"
  | "oauth_token"
  | "env_secret";

export const CREDENTIAL_KINDS: CredentialKind[] = [
  "api_key",
  "bot_token",
  "app_secret",
  "proxy_password",
  "oauth_token",
  "env_secret",
] as const;

export const CREDENTIAL_KIND_LABELS: Record<CredentialKind, string> = {
  api_key: "API Key",
  bot_token: "Bot Token",
  app_secret: "App Secret",
  proxy_password: "Proxy Password",
  oauth_token: "OAuth Token",
  env_secret: "Environment Secret",
};

/** Optional at-rest cipher. Injected by the desktop main process (safeStorage). */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

interface CredentialFileV1 {
  version: 1;
  credentials: Record<string, string>;
}

interface CredentialFileV2 {
  version: 2;
  values: Record<string, string>;
}

type CredentialFile = CredentialFileV1 | CredentialFileV2;

const SCHEMA_VERSION = 2;
const LOCK_POLL_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;

/**
 * Serialize a read-modify-write across processes / store instances sharing one
 * credentials.json so two writers can't lose each other's update through a
 * read-read-write-write race. Acquire is an atomic mkdir of `${path}.lock`;
 * release deletes it. The lock is never stolen: a held/leftover lock is waited
 * on, then we fail loud with an explicit recovery message. A hard crash mid-write
 * leaves the lock dir behind and the next writer fails loud until it is removed —
 * an explicit, one-command recovery, never a silent lost update.
 */
function withCredentialFileLock<T>(
  targetPath: string,
  fn: () => T,
  timeoutMs = LOCK_TIMEOUT_MS
): T {
  const lockPath = `${targetPath}.lock`;
  ensureSecretDir(dirname(targetPath));
  const deadline = Date.now() + timeoutMs;
  const sleep = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
      if (Date.now() >= deadline) {
        throw new Error(
          `credentials.json is locked by another process (${lockPath}). ` +
            "If no other process is using it, remove that directory and retry."
        );
      }
      // Blocking sleep: writes are tiny and rare, so holding the loop is acceptable.
      Atomics.wait(sleep, 0, 0, LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    // Remove the lock dir (and anything inside it) so a partial holder never blocks later writes.
    removeLockDir(lockPath);
  }
}

function removeLockDir(lockPath: string): void {
  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    try {
      const entries = readdirSync(lockPath);
      for (const e of entries) {
        removeLockDir(join(lockPath, e));
      }
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      /* give up; next writer will fail loud with recovery instructions */
    }
  }
}

/** Create or harden the directory holding a secret file to 0700. */
function ensureSecretDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* best-effort on platforms without chmod */
  }
}

/** Owner-only atomic write: 0600 temp (O_EXCL), re-enforced chmod, atomic rename. */
function writeSecretFileAtomic(path: string, contents: string): void {
  ensureSecretDir(dirname(path));
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeFileSync(tmpPath, contents, { encoding: "utf-8", mode: 0o600, flag: "wx" });
    try {
      chmodSync(tmpPath, 0o600);
    } catch {
      /* best-effort */
    }
    renameSync(tmpPath, path);
  } catch (err) {
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }
}

function encodeKey(slug: string, kind: CredentialKind): string {
  return `${slug}:${kind}`;
}

export class CredentialStore {
  private readonly path: string;
  private values: Record<string, string> = {};
  private readonly cipher?: SecretCipher;

  constructor(path?: string, cipher?: SecretCipher) {
    this.path = path ?? resolve(homedir(), ".hachimi", "credentials.json");
    this.cipher = cipher;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as CredentialFile;
      if (parsed.version === SCHEMA_VERSION) {
        this.values = { ...parsed.values };
        return;
      }
      if (parsed.version === 1) {
        // Migrate v1 (connection-id → apiKey) to v2 (slug:kind) under the lock.
        withCredentialFileLock(this.path, () => {
          this.values = this.readLocked();
          this.persistLocked();
        });
        return;
      }
      throw new Error(
        `Unsupported credentials schema version: ${(parsed as { version?: number }).version}`
      );
    } catch (err) {
      // Never silently destroy unrecoverable secrets: back the file up, then start empty.
      const backup = `${this.path}.corrupt-${Date.now()}`;
      try {
        renameSync(this.path, backup);
        console.error(
          `[credentials] Unreadable credentials.json backed up to ${backup}: ${(err as Error).message}`
        );
      } catch {
        console.error(`[credentials] Failed to read credentials.json: ${(err as Error).message}`);
      }
      this.values = {};
    }
  }

  private persistLocked(): void {
    // Re-encrypt any plaintext entries when a cipher is now available.
    if (this.cipher) {
      for (const [key, value] of Object.entries(this.values)) {
        const plain = tryDecrypt(this.cipher, value) ?? value;
        if (plain !== value) this.values[key] = this.cipher.encrypt(plain);
      }
    }
    const payload: CredentialFileV2 = { version: SCHEMA_VERSION, values: this.values };
    writeSecretFileAtomic(this.path, `${JSON.stringify(payload, null, 2)}\n`);
  }

  /**
   * Read-modify-write under the cross-process lock. The file is re-read inside
   * the lock so a stale in-memory cache can never clobber another process's
   * concurrent write (each store instance may be shared by daemon/CLI/desktop).
   */
  private mutate(apply: (values: Record<string, string>) => boolean): void {
    withCredentialFileLock(this.path, () => {
      this.values = this.readLocked();
      if (apply(this.values)) {
        this.persistLocked();
      }
    });
  }

  /** Parse the v2 values from disk (empty when missing); v1 migrates on load. */
  private readLocked(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as CredentialFile;
    if (parsed.version === SCHEMA_VERSION) return { ...parsed.values };
    if (parsed.version === 1) {
      const values: Record<string, string> = {};
      for (const [slug, key] of Object.entries(parsed.credentials)) {
        if (key) values[encodeKey(slug, "api_key")] = key;
      }
      return values;
    }
    throw new Error(
      `Unsupported credentials schema version: ${(parsed as { version?: number }).version}`
    );
  }

  /** Read a secret; falls back to plaintext when a cipher cannot decrypt (migration path). */
  getSecret(slug: string, kind: CredentialKind): string | undefined {
    const stored = this.values[encodeKey(slug, kind)];
    if (stored === undefined) return undefined;
    if (!this.cipher) return stored;
    const plain = tryDecrypt(this.cipher, stored);
    if (plain !== null) return plain;
    // Plaintext left by a headless process — adopt it into the cipher on next persist.
    this.values[encodeKey(slug, kind)] = this.cipher.encrypt(stored);
    return stored;
  }

  setSecret(slug: string, kind: CredentialKind, value: string): void {
    const trimmed = value.trim();
    if (!trimmed) return;
    const stored = this.cipher ? this.cipher.encrypt(trimmed) : trimmed;
    this.mutate((values) => {
      if (values[encodeKey(slug, kind)] === stored) return false;
      values[encodeKey(slug, kind)] = stored;
      return true;
    });
  }

  hasSecret(slug: string, kind: CredentialKind): boolean {
    return Boolean(this.values[encodeKey(slug, kind)]);
  }

  deleteSecret(slug: string, kind?: CredentialKind): void {
    this.mutate((values) => {
      const keys =
        kind === undefined
          ? Object.keys(values).filter((k) => k.startsWith(`${slug}:`))
          : [encodeKey(slug, kind)];
      let changed = false;
      for (const key of keys) {
        if (key in values) {
          delete values[key];
          changed = true;
        }
      }
      return changed;
    });
  }

  /** List stored entries as metadata only — secret values are never exposed. */
  listEntries(): { slug: string; kind: CredentialKind; key: string }[] {
    return Object.keys(this.values).map((key) => {
      const sep = key.lastIndexOf(":");
      return {
        slug: sep === -1 ? key : key.slice(0, sep),
        kind: (sep === -1 ? "env_secret" : key.slice(sep + 1)) as CredentialKind,
        key,
      };
    });
  }

  /** Legacy API: connection-id → api_key kind. */
  get(connectionId: string): string | undefined {
    return this.getSecret(connectionId, "api_key");
  }

  has(connectionId: string): boolean {
    return this.hasSecret(connectionId, "api_key");
  }

  set(connectionId: string, apiKey: string): void {
    this.setSecret(connectionId, "api_key", apiKey);
  }

  delete(connectionId: string): void {
    this.deleteSecret(connectionId, "api_key");
  }

  /** Legacy: list connection ids that have an api_key stored (never the keys). */
  listIds(): string[] {
    return this.listEntries()
      .filter((e) => e.kind === "api_key")
      .map((e) => e.slug);
  }
}

function tryDecrypt(cipher: SecretCipher, stored: string): string | null {
  try {
    return cipher.decrypt(stored);
  } catch {
    return null;
  }
}

let defaultStore: CredentialStore | null = null;

/** Shared store for the default ~/.hachimi location (lazy). */
export function getDefaultCredentialStore(): CredentialStore {
  if (!defaultStore) defaultStore = new CredentialStore();
  return defaultStore;
}

/** Test hook: reset the shared store (used by unit tests with temp paths). */
export function resetDefaultCredentialStore(): void {
  defaultStore = null;
}

/**
 * Resolve a credential reference string (`<slug>:<kind>`) against a store.
 * A bare slug resolves as `api_key` (legacy connection key) for convenience.
 */
export function resolveCredentialReference(
  ref: string,
  store?: CredentialStore
): string | undefined {
  const sep = ref.lastIndexOf(":");
  if (sep === -1) return store?.get(ref);
  const slug = ref.slice(0, sep);
  const kind = ref.slice(sep + 1);
  if ((CREDENTIAL_KINDS as readonly string[]).includes(kind)) {
    return store?.getSecret(slug, kind as CredentialKind);
  }
  return store?.get(ref);
}

/** Mask a secret for display: keep head/tail, hide the middle. */
export function maskApiKey(key?: string): string {
  if (!key) return "";
  const k = key.trim();
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
