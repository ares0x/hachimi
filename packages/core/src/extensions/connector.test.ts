import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, ICSConnector } from "./connector.js";

describe("Phase W6 Connectors & Encryption Suite", () => {
  it("encrypts and decrypts secrets correctly with AES-256-GCM", () => {
    const secret = "sk-ant-api-key-secret-12345";
    const masterKey = "hachimi-local-master-key-32chars";

    const encrypted = encryptSecret(secret, masterKey);
    expect(encrypted.ciphertext).not.toBe(secret);
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();

    const decrypted = decryptSecret(encrypted, masterKey);
    expect(decrypted).toBe(secret);
  });

  it("ICSConnector initializes, connects, and provides calendar_list_events tool", async () => {
    const connector = new ICSConnector();
    expect(connector.metadata.status).toBe("disconnected");

    const connected = await connector.connect();
    expect(connected).toBe(true);
    expect(connector.metadata.status).toBe("connected");

    const tools = connector.getTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("calendar_list_events");

    const result = await tools[0].execute({ startDate: "2026-08-01" });
    expect(result).toContain("No calendar events found");
  });
});
