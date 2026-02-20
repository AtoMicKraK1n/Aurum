import { runBatchConversion } from "../../src/lib/batch/converter";

async function main() {
  try {
    const result = await runBatchConversion();
    console.log("Batch Results:", result);
    process.exit(0);
  } catch (error) {
    console.error("Batch failed:", error);
    process.exit(1);
  }
}

main();
