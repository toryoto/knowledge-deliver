import { runCollectXLikesJob } from "./jobs/collect-x-likes";
import { formatPipelineError } from "./lib/error-log";
import { closeRedis } from "./lib/like-cursor-store";

try {
  await runCollectXLikesJob();
} catch (err) {
  console.error("[pipeline] job failed:", formatPipelineError(err));
  await closeRedis();
  process.exit(1);
}

await closeRedis();
process.exit(0);
