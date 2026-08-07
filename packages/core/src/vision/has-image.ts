// packages/core/src/vision/has-image.ts
import type { Message } from "../types/index.js";

/** Whether the outgoing message array contains any `image_url` content part. */
export function hasImageContent(messages: Message[]): boolean {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    if (message.content.some((part) => part.type === "image_url")) return true;
  }
  return false;
}
