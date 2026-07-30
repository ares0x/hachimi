import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@hachimi/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@hachimi/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@hachimi/config": resolve(__dirname, "packages/config/src/index.ts"),
      "@hachimi/storage": resolve(__dirname, "packages/storage/src/index.ts"),
      "@hachimi/channel-api": resolve(__dirname, "packages/channels/api/src/index.ts"),
      "@hachimi/channel-cli": resolve(__dirname, "packages/channels/cli/src/index.ts"),
      "@hachimi/channel-telegram": resolve(__dirname, "packages/channels/telegram/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "packages/**/__tests__/**/*.ts", "tests/**/*.test.ts"],
    exclude: ["**/dist/**", "**/dist-electron/**", "**/node_modules/**", "**/*.d.ts"],
  },
});
