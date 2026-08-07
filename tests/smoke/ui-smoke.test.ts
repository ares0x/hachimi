import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase V1.9 UI Build & Artifact Visual Smoke Test Suite", () => {
  it("verifies Web UI dist bundle build artifacts exist", () => {
    const webDistPath = join(process.cwd(), "apps/web/dist");
    expect(existsSync(webDistPath)).toBe(true);

    const indexPath = join(webDistPath, "index.html");
    expect(existsSync(indexPath)).toBe(true);
  });

  it("verifies Desktop app source entry point exists", () => {
    const desktopAppPath = join(process.cwd(), "apps/desktop/src/App.tsx");
    expect(existsSync(desktopAppPath)).toBe(true);
  });
});
