import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./api";
import { runBatchConversion } from "./lib/batch/converter";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
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

async function runScheduledBatch(): Promise<void> {
  if (isCronBatchRunning) {
    console.log("Skipping scheduled batch run; previous run still active");
    return;
  }

  isCronBatchRunning = true;
  try {
    const result = await runBatchConversion();
    console.log(
      `Scheduled batch completed: users=${result.usersProcessed}, usdc=${result.totalUsdc}, gold=${result.totalGold}`,
    );
  } catch (error) {
    console.error("Scheduled batch failed:", error);
  } finally {
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
  const enabled = process.env.ENABLE_BATCH_CRON !== "false";
  if (!enabled) {
    console.log("Batch cron disabled (ENABLE_BATCH_CRON=false)");
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

app.listen(PORT, () => {
  console.log(`Aurum API running on http://localhost:${PORT}`);
  startBatchCron();
});

process.on("SIGINT", () => {
  if (cronTimeout) {
    clearTimeout(cronTimeout);
  }
  if (cronInterval) {
    clearInterval(cronInterval);
  }
  process.exit(0);
});
