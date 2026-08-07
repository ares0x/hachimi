// packages/core/src/tools/builtin/web/charset.ts
/**
 * Charset-aware response body decoding.
 *
 * Chinese quote/news endpoints (Sina, Tencent, etc.) serve GBK/GB2312 while
 * Node's `Response.text()` always decodes UTF-8, producing mojibake. Decode
 * from the Content-Type charset when present (gbk/gb2312/gb18030/big5), else
 * fall back to UTF-8.
 */

const UTF8 = "utf-8";

function resolveCharset(contentType: string | null): string {
  const match = contentType?.match(/charset=["']?([\w-]+)["']?/i);
  return match ? match[1].toLowerCase() : UTF8;
}

function decoderFor(charset: string) {
  switch (charset) {
    case "gbk":
    case "gb2312":
    case "gb18030":
      return new TextDecoder("gbk");
    case "big5":
      return new TextDecoder("big5");
    default:
      return new TextDecoder(UTF8);
  }
}

/** Read a Response body as text using the charset declared in Content-Type. */
export async function decodeResponseBody(response: Response): Promise<string> {
  const charset = resolveCharset(response.headers.get("content-type"));
  const buffer = await response.arrayBuffer();
  try {
    return decoderFor(charset).decode(buffer);
  } catch {
    // Unknown charset label → fall back to UTF-8 rather than throwing.
    return new TextDecoder(UTF8).decode(buffer);
  }
}

/** Decode raw bytes with an explicit charset label (used by tests / providers). */
export function decodeWithCharset(data: ArrayBuffer | Uint8Array, charset: string): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    return decoderFor(charset.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder(UTF8).decode(bytes);
  }
}
