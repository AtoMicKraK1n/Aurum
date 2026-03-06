"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const converter_1 = require("../lib/batch/converter");
async function main() {
    try {
        const result = await (0, converter_1.runBatchConversion)();
        console.log("Batch run complete:", result);
        process.exit(0);
    }
    catch (error) {
        console.error("Batch run failed:", error);
        process.exit(1);
    }
}
main();
