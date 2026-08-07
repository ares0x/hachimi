import { describe, expect, it } from "vitest";
import { consumeToolImageMarkers, registerToolImage } from "../image-registry.js";

describe("tool image registry", () => {
  it("round-trips a registered image through its marker", () => {
    const marker = registerToolImage("data:image/png;base64,AAAA");
    expect(marker).toMatch(/\[\[HACHIMI_IMAGE:img_/);

    const result = consumeToolImageMarkers(
      `[Computer Screenshot]\n${marker}\n(screenshot attached)`
    );
    expect(result.text).not.toContain("HACHIMI_IMAGE");
    expect(result.text).toContain("[Computer Screenshot]");
    expect(result.dataUrls).toEqual(["data:image/png;base64,AAAA"]);
  });

  it("strips markers and collects images in order", () => {
    const m1 = registerToolImage("data:image/png;base64,ONE");
    const m2 = registerToolImage("data:image/png;base64,TWO");
    const result = consumeToolImageMarkers(`a ${m1} b ${m2} c`);
    expect(result.text).toBe("a  b  c");
    expect(result.dataUrls).toEqual(["data:image/png;base64,ONE", "data:image/png;base64,TWO"]);
  });

  it("leaves unknown markers untouched", () => {
    const result = consumeToolImageMarkers("x [[HACHIMI_IMAGE:missing]] y");
    expect(result.text).toBe("x [[HACHIMI_IMAGE:missing]] y");
    expect(result.dataUrls).toEqual([]);
  });

  it("consumes registered images exactly once", () => {
    const marker = registerToolImage("data:image/png;base64,AAAA");
    expect(consumeToolImageMarkers(marker).dataUrls).toHaveLength(1);
    // Second consume: marker id already removed from registry → untouched
    expect(consumeToolImageMarkers(marker).dataUrls).toHaveLength(0);
  });
});
