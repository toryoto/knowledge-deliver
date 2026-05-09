import { initObservability, captureError, flushObservability } from "observability";
import { runCollectXLikesJob } from "./jobs/collect-x-likes";
import { formatPipelineError } from "./lib/error-log";
import { closeRedis } from "./lib/like-cursor-store";

initObservability({ service: "pipeline" });

try {
  await runCollectXLikesJob();
} catch (err) {
  console.error("[pipeline] job failed:", formatPipelineError(err));
  captureError(err, { job: "collect-x-likes" }, { step: "job.run" });
  await flushObservability();
  await closeRedis();
  process.exit(1);
}

await flushObservability();
await closeRedis();
process.exit(0);
