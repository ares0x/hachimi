// apps/server/src/main.ts
import { createHachimiApiServer } from "@hachimi/channel-api";
import { createAppContext } from "@hachimi/core";

async function main() {
  const appContext = createAppContext();
  const apiServer = createHachimiApiServer({ appContext });

  await apiServer.listen();

  process.on("SIGINT", async () => {
    console.log("\n正在关闭 Hachimi Daemon Server...");
    await apiServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("❌ Fatal Daemon Server Error:", err);
  process.exit(1);
});
