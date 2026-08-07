// packages/core/src/vision/image-registry.ts
/**
 * Tool image registry — lets tools hand full images to the harness without
 * bloating their text result.
 *
 * Tools (e.g. computer_screenshot) register a data URL here and append a
 * marker like `[[HACHIMI_IMAGE:<id>]]` to their returned text. The agent loop
 * strips the marker and attaches the image as an `image_url` content part in a
 * follow-up user message, so the normal vision pipeline (pass-through or
 * vision companion) handles it on the next round.
 *
 * Images live in memory only; they are never written to events or session
 * history (descriptions are what persist).
 */
const registry = new Map<string, string>();

export const TOOL_IMAGE_MARKER = (id: string): string => `[[HACHIMI_IMAGE:${id}]]`;

const MARKER_RE = /\[\[HACHIMI_IMAGE:([a-zA-Z0-9_-]+)\]\]/g;

/** Register a data URL and return its marker to embed in a tool result. */
export function registerToolImage(dataUrl: string): string {
  const id = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  registry.set(id, dataUrl);
  return TOOL_IMAGE_MARKER(id);
}

/**
 * Remove markers from a tool result and return the stripped text plus the
 * registered image data URLs (in marker order). Unregistered ids are dropped.
 */
export function consumeToolImageMarkers(text: string): { text: string; dataUrls: string[] } {
  const dataUrls: string[] = [];
  const stripped = text.replace(MARKER_RE, (match, id: string) => {
    const dataUrl = registry.get(id);
    if (dataUrl) {
      registry.delete(id);
      dataUrls.push(dataUrl);
      return "";
    }
    return match;
  });
  return { text: stripped, dataUrls };
}
