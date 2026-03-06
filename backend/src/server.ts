import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./api";
import { runBatchConversion } from "./lib/batch/converter";
import { db } from "./db/queries";
import { runDustSweepCycle } from "./lib/dust/sweep-cron";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const defaultCorsOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultCorsOrigins, ...configuredOrigins]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", apiRoutes);

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    console.error(err.stack);
    res.status(500).json({ success: false, error: err.message });
  },
);

let isCronBatchRunning = false;
let cronTimeout: NodeJS.Timeout | undefined;
let cronInterval: NodeJS.Timeout | undefined;
let isDustSweepRunning = false;
let dustSweepInterval: NodeJS.Timeout | undefined;

async function runScheduledBatch(): Promise<void> {
  if (isCronBatchRunning) {
    console.log("Skipping scheduled batch run; previous run still active");
    return;
  }

  isCronBatchRunning = true;
  let lockAcquired = false;
  try {
    lockAcquired = await db.acquireBatchLock();
    if (!lockAcquired) {
      console.log("Skipping scheduled batch run; global batch lock active");
      return;
    }

    const result = await runBatchConversion();
    console.log(
      `Scheduled batch completed: users=${result.usersProcessed}, usdc=${result.totalUsdc}, gold=${result.totalGold}`,
    );
  } catch (error) {
    console.error("Scheduled batch failed:", error);
  } finally {
    if (lockAcquired) {
      await db.releaseBatchLock().catch((releaseError) => {
        console.error("Failed to release batch lock:", releaseError);
      });
    }
    isCronBatchRunning = false;
  }
}

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function startBatchCron(): void {
  const enabled = process.env.ENABLE_BATCH_CRON === "true";
  if (!enabled) {
    console.log("Batch cron disabled (ENABLE_BATCH_CRON is not true)");
    return;
  }

  const delay = msUntilNextUtcMidnight();
  console.log(
    `Batch cron scheduled for next UTC midnight in ${Math.round(delay / 1000)}s`,
  );

  cronTimeout = setTimeout(() => {
    runScheduledBatch().catch((error) =>
      console.error("Initial scheduled batch failed:", error),
    );

    cronInterval = setInterval(() => {
      runScheduledBatch().catch((error) =>
        console.error("Scheduled batch failed:", error),
      );
    }, 24 * 60 * 60 * 1000);
  }, delay);
}

async function runScheduledDustSweep(): Promise<void> {
  if (isDustSweepRunning) {
    console.log("Skipping dust sweep run; previous run still active");
    return;
  }

  isDustSweepRunning = true;
  try {
    const result = await runDustSweepCycle();
    if (result.checkedUsers > 0 || result.intentCreated > 0) {
      console.log(
        `Dust sweep run completed: checked=${result.checkedUsers}, intents=${result.intentCreated}`,
      );
    }
  } catch (error) {
    console.error("Dust sweep run failed:", error);
  } finally {
    isDustSweepRunning = false;
  }
}

function startDustSweepCron(): void {
  const enabled = process.env.ENABLE_DUST_SWEEP_CRON === "true";
  if (!enabled) {
    console.log("Dust sweep cron disabled (ENABLE_DUST_SWEEP_CRON is not true)");
    return;
  }

  const intervalSeconds = Number(process.env.DUST_SWEEP_INTERVAL_SECONDS || 60);
  const intervalMs =
    Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : 60_000;

  console.log(`Dust sweep cron enabled: interval=${Math.round(intervalMs / 1000)}s`);

  void runScheduledDustSweep();
  dustSweepInterval = setInterval(() => {
    void runScheduledDustSweep();
  }, intervalMs);
}

app.listen(PORT, () => {
  console.log(`Aurum API running on http://localhost:${PORT}`);
  startBatchCron();
  startDustSweepCron();
});

process.on("SIGINT", () => {
  if (cronTimeout) {
    clearTimeout(cronTimeout);
  }
  if (cronInterval) {
    clearInterval(cronInterval);
  }
  if (dustSweepInterval) {
    clearInterval(dustSweepInterval);
  }
  process.exit(0);
});
