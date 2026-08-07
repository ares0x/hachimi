import { createCliRenderer, Text } from "@opentui/core";

const renderer = await createCliRenderer();
renderer.root.add(
  Text({
    content: "OpenTUI OK - press Ctrl+C to exit",
    fg: "#00FF00",
  })
);
