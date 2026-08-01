// packages/config/src/credential-store.ts
// Split credential storage: API keys live in ~/.hachimi/credentials.json (mode 0600,
// atomic writes), never in config.json. Keyed by connection id.

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

interface CredentialFile {
  version: 1;
  credentials: Record<string, string>;
}

export class CredentialStore {
  private readonly path: string;
  private credentials: Record<string, string> = {};

  constructor(path?: string) {
    this.path = path ?? resolve(homedir(), ".hachimi", "credentials.json");
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CredentialFile>;
      if (parsed && typeof parsed.credentials === "object" && parsed.credentials) {
        this.credentials = { ...parsed.credentials };
      }
    } catch {
      // Corrupted credential file: start empty rather than crash the runtime.
      this.credentials = {};
    }
  }

  private persist(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: CredentialFile = { version: 1, credentials: this.credentials };
    const tmpPath = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
    try {
      chmodSync(tmpPath, 0o600);
    } catch {
      /* best-effort on platforms without chmod */
    }
    renameSync(tmpPath, this.path);
  }

  get(connectionId: string): string | undefined {
    return this.credentials[connectionId];
  }

  has(connectionId: string): boolean {
    return Boolean(this.credentials[connectionId]);
  }

  set(connectionId: string, apiKey: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    this.credentials[connectionId] = trimmed;
    this.persist();
  }

  delete(connectionId: string): void {
    if (connectionId in this.credentials) {
      delete this.credentials[connectionId];
      this.persist();
    }
  }

  /** List connection ids that have stored credentials (never the keys). */
  listIds(): string[] {
    return Object.keys(this.credentials);
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

/** Mask an API key for display: keep head/tail, hide the middle. */
export function maskApiKey(key?: string): string {
  if (!key) return "";
  const k = key.trim();
  if (k.length <= 8) return "••••••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
