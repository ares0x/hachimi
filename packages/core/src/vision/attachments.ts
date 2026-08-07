// packages/core/src/vision/attachments.ts
import { readFileSync } from "node:fs";
import type { ContentPart, RuntimeAttachment } from "../types/index.js";

/**
 * Convert a RuntimeAttachment into an `image_url` ContentPart.
 * Prefers inline base64; reads local files at runtime; remote URLs pass through.
 * Returns null for unsupported/invalid attachments (caller decides fallback).
 */
export function attachmentToImagePart(att: RuntimeAttachment): ContentPart | null {
  if (!att) return null;

  if (att.dataBase64) {
    return {
      type: "image_url",
      image_url: { url: `data:${att.mimeType || "image/png"};base64,${att.dataBase64}` },
    };
  }

  if (att.url) {
    return { type: "image_url", image_url: { url: att.url } };
  }

  if (att.filePath) {
    try {
      const buf = readFileSync(att.filePath);
      const mime = att.mimeType || guessMimeType(att.filePath);
      return {
        type: "image_url",
        image_url: { url: `data:${mime};base64,${buf.toString("base64")}` },
      };
    } catch {
      return null;
    }
  }

  return null;
}

function guessMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}
