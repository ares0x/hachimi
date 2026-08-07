// packages/core/src/portable/redact.test.ts
import { describe, expect, it } from "vitest";
import { redactDeep, redactText } from "./redact.js";

describe("Portable export redaction (P0-5)", () => {
  it("redacts API keys and tokens from text", () => {
    expect(redactText("key is sk-abcdefghijklmnopqrstuvwxyz123456")).toContain("[REDACTED]");
    expect(redactText("use ghp_abcdefghijklmnopqrstuvwxyz123456 now")).toContain("[REDACTED]");
    expect(
      redactText(
        "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature"
      )
    ).toContain("[REDACTED]");
    expect(redactText("api_key=sk-secret123456789012345678")).toContain("api_key=[REDACTED]");
    expect(redactText("password: hunter2secret")).toContain("password=[REDACTED]");
  });

  it("redacts PEM private key blocks", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----";
    expect(redactText(pem)).toContain("[REDACTED]");
    expect(redactText(pem)).not.toContain("MIIEowIBAAKCAQEA");
  });

  it("leaves normal text untouched", () => {
    const normal = "今天学习了 Hachimi 的架构，包括 Work、RuntimeEvent 与工具策略。";
    expect(redactText(normal)).toBe(normal);
    expect(redactText("npm run build --prod")).toBe("npm run build --prod");
  });

  it("deep-redacts nested bundle structures", () => {
    const bundle = {
      memory: [{ content: "我的 key 是 sk-abcdefghijklmnopqrstuvwxyz123456，请勿外泄" }],
      sessions: [
        {
          title: "会议记录",
          messages: [{ content: "token=sk-1234567890abcdefghijklmnopqrstuvwxyz" }],
        },
      ],
    };
    const out = redactDeep(bundle) as typeof bundle;
    expect(out.memory[0].content).toContain("[REDACTED]");
    expect(out.sessions[0].messages[0].content).toContain("[REDACTED]");
    expect(out.sessions[0].title).toBe("会议记录");
  });
});
