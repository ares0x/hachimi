// packages/config/src/credential-store.test.ts
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CREDENTIAL_KIND_LABELS,
  CredentialStore,
  maskApiKey,
  type SecretCipher,
} from "./credential-store.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "hachimi-cred-"));
}

describe("CredentialStore (typed kinds)", () => {
  it("stores and round-trips secrets by (slug, kind)", () => {
    const dir = tempDir();
    try {
      const store = new CredentialStore(join(dir, "credentials.json"));
      store.setSecret("telegram", "bot_token", "123456:ABCdef");
      store.setSecret("deepseek", "api_key", "sk-ds-1");
      store.setSecret("tavily", "api_key", "tvly-test");

      expect(store.getSecret("telegram", "bot_token")).toBe("123456:ABCdef");
      expect(store.getSecret("deepseek", "api_key")).toBe("sk-ds-1");
      expect(store.getSecret("tavily", "api_key")).toBe("tvly-test");
      expect(store.hasSecret("deepseek", "api_key")).toBe(true);
      expect(store.hasSecret("deepseek", "bot_token")).toBe(false);

      const reloaded = new CredentialStore(join(dir, "credentials.json"));
      expect(reloaded.getSecret("telegram", "bot_token")).toBe("123456:ABCdef");
      expect(reloaded.listEntries()).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps legacy connection-id api_key API working", () => {
    const dir = tempDir();
    try {
      const store = new CredentialStore(join(dir, "credentials.json"));
      store.set("deepseek", "sk-legacy");
      expect(store.get("deepseek")).toBe("sk-legacy");
      expect(store.has("deepseek")).toBe(true);
      expect(store.listIds()).toEqual(["deepseek"]);
      store.delete("deepseek");
      expect(store.has("deepseek")).toBe(false);
      expect(store.listIds()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("migrates v1 files (connection-id → apiKey) to v2 on load", () => {
    const dir = tempDir();
    const path = join(dir, "credentials.json");
    try {
      writeFileSync(
        path,
        JSON.stringify({ version: 1, credentials: { deepseek: "sk-v1", openai: "sk-v1-o" } }),
        "utf-8"
      );
      const store = new CredentialStore(path);
      expect(store.get("deepseek")).toBe("sk-v1");
      expect(store.get("openai")).toBe("sk-v1-o");

      const raw = JSON.parse(readFileSync(path, "utf-8")) as {
        version: number;
        values: Record<string, string>;
      };
      expect(raw.version).toBe(2);
      expect(raw.values["deepseek:api_key"]).toBe("sk-v1");
      expect(raw.values["openai:api_key"]).toBe("sk-v1-o");
      expect(raw.values["deepseek"]).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("backs up unreadable files instead of silently destroying them", () => {
    const dir = tempDir();
    const path = join(dir, "credentials.json");
    try {
      writeFileSync(path, "{ not json", "utf-8");
      const store = new CredentialStore(path);
      expect(store.listEntries()).toEqual([]);
      const files = readdirSync(dir);
      expect(files.some((f) => f.startsWith("credentials.json.corrupt-"))).toBe(true);
      store.set("deepseek", "sk-new");
      expect(new CredentialStore(path).get("deepseek")).toBe("sk-new");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes with 0600 perms and hardens the directory to 0700", () => {
    const dir = tempDir();
    const path = join(dir, "nested", "credentials.json");
    try {
      const store = new CredentialStore(path);
      store.setSecret("mcp-github", "env_secret", "ghp_test");
      if (process.platform !== "win32") {
        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(statSync(join(dir, "nested")).mode & 0o777).toBe(0o700);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports an injected cipher for at-rest encryption", () => {
    const dir = tempDir();
    const path = join(dir, "credentials.json");
    const cipher: SecretCipher = {
      encrypt: (p) => `enc:${Buffer.from(p).toString("base64")}`,
      decrypt: (s) =>
        s.startsWith("enc:") ? Buffer.from(s.slice(4), "base64").toString("utf-8") : s,
    };
    try {
      const store = new CredentialStore(path, cipher);
      store.setSecret("deepseek", "api_key", "sk-encrypted");
      const raw = readFileSync(path, "utf-8");
      expect(raw).not.toContain("sk-encrypted");
      expect(raw).toContain("enc:");

      const reloaded = new CredentialStore(path, cipher);
      expect(reloaded.getSecret("deepseek", "api_key")).toBe("sk-encrypted");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent writers through the cross-process lock", () => {
    const dir = tempDir();
    const path = join(dir, "credentials.json");
    try {
      const a = new CredentialStore(path);
      const b = new CredentialStore(path);
      a.set("conn-a", "key-a");
      b.set("conn-b", "key-b");
      a.set("conn-c", "key-c");

      const final = new CredentialStore(path);
      expect(final.get("conn-a")).toBe("key-a");
      expect(final.get("conn-b")).toBe("key-b");
      expect(final.get("conn-c")).toBe("key-c");
      expect(final.listEntries()).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails loud when the lock is held past the timeout", () => {
    const dir = tempDir();
    const path = join(dir, "credentials.json");
    const lockDir = `${path}.lock`;
    try {
      // Populate first so the store can load without the lock
      const seed = new CredentialStore(path);
      seed.set("deepseek", "sk-locked");
      // Hold the lock forever before the next write
      mkdirSync(lockDir);
      const store = new CredentialStore(path);
      expect(() => store.set("deepseek", "sk-locked-2")).toThrow(/locked by another process/);
      expect(existsSync(lockDir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});

describe("maskApiKey", () => {
  it("masks keys while keeping head/tail", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toBe("sk-a…mnop");
    expect(maskApiKey("short")).toBe("••••••••");
    expect(maskApiKey(undefined)).toBe("");
  });

  it("exposes labels for every kind", () => {
    expect(CREDENTIAL_KIND_LABELS.api_key).toBe("API Key");
    expect(CREDENTIAL_KIND_LABELS.bot_token).toBe("Bot Token");
  });
});
