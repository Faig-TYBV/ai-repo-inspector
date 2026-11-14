import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the TypeScript sources. `npm run build` also emits compiled copies
    // under dist/test/, which must not run as duplicates.
    include: ["test/**/*.test.ts"],
  },
});
