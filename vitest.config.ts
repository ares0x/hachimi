import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["packages/**/*.test.ts", "packages/**/__tests__/**/*.ts"],
    },
});
