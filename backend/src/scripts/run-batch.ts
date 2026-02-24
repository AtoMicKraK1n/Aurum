import { runBatchConversion } from "../lib/batch/converter";

async function main() {
  try {
    const result = await runBatchConversion();
    console.log("Batch run complete:", result);
    process.exit(0);
  } catch (error) {
    console.error("Batch run failed:", error);
    process.exit(1);
  }
}

main();
