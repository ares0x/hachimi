/**
 * Safe JSON parser for LLM tool call argument streaming (Maka / Pi Agent pattern).
 * Prevents uncaught SyntaxError exceptions when LLM stream is truncated or malformed.
 */

export function safeParseToolArgs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw || typeof raw !== "string") return {};

  const trimmed = raw.trim();
  if (!trimmed) return {};

  // 1. Standard parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    /* Fall through to partial repair */
  }

  // 2. Attempt lightweight partial JSON repair for trailing stream truncation
  try {
    let repaired = trimmed;

    // Fix unclosed quotes
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // Balance braces and brackets
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) {
      repaired += "}";
    }

    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      repaired += "]";
    }

    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* Ignore repair failures */
  }

  // 3. Fallback: return empty object to prevent crashing the agent loop
  return {};
}
