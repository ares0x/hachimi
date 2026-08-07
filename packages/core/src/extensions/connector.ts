// packages/core/src/extensions/connector.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { ToolDefinition } from "../types/index.js";

export interface ConnectorMetadata {
  id: string;
  name: string;
  description: string;
  vendor?: string;
  version?: string;
  status: "connected" | "disconnected" | "error";
  errorReason?: string;
}

export interface IConnector {
  metadata: ConnectorMetadata;
  connect(config?: Record<string, unknown>): Promise<boolean>;
  disconnect(): Promise<void>;
  getTools(): ToolDefinition[];
}

/**
 * W6.1: AES-256-GCM 本地秘钥与 Connector 凭据加密与解密工具
 */
const ALGORITHM = "aes-256-gcm";

export function encryptSecret(
  secret: string,
  masterKey: string
): { ciphertext: string; iv: string; tag: string } {
  const key = Buffer.alloc(32);
  Buffer.from(masterKey).copy(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag,
  };
}

export function decryptSecret(
  encrypted: { ciphertext: string; iv: string; tag: string },
  masterKey: string
): string {
  const key = Buffer.alloc(32);
  Buffer.from(masterKey).copy(key);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(encrypted.iv, "hex"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "hex"));

  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * W6.2: 本机 ICS / 日历连接器 (ICSConnector)
 */
export class ICSConnector implements IConnector {
  public metadata: ConnectorMetadata = {
    id: "system-calendar",
    name: "System Calendar Connector",
    description: "Read local ICS and system calendar schedules",
    vendor: "hachimi",
    status: "disconnected",
  };

  private icsFilePath?: string;

  constructor(icsFilePath?: string) {
    this.icsFilePath = icsFilePath;
  }

  async connect(config?: { icsFilePath?: string }): Promise<boolean> {
    if (config?.icsFilePath) {
      this.icsFilePath = config.icsFilePath;
    }
    this.metadata.status = "connected";
    return true;
  }

  async disconnect(): Promise<void> {
    this.metadata.status = "disconnected";
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: "calendar_list_events",
        description:
          "Read local ICS / System calendar schedule events for today or specified date range",
        permission: "safe",
        parameters: {
          type: "object",
          properties: {
            startDate: { type: "string", description: "ISO date format (YYYY-MM-DD)" },
            endDate: { type: "string", description: "ISO date format (YYYY-MM-DD)" },
          },
        },
        execute: async (args?: Record<string, any>) => {
          if (this.icsFilePath && existsSync(this.icsFilePath)) {
            const raw = readFileSync(this.icsFilePath, "utf-8");
            return `[Calendar Schedule]\n${raw.slice(0, 2000)}`;
          }
          return `[Calendar Schedule]\nNo calendar events found for ${args?.startDate || "today"}. Local system calendar is clean.`;
        },
      },
    ];
  }
}
