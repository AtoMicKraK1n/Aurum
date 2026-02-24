import { Router } from "express";
import { connectWallet } from "./auth/connect";
import { getUserBalance } from "./user/balance";
import { queueDust } from "./dust/queue";
import { getDustStatus } from "./dust/status";
import { runBatchNow } from "./admin/batch";
import { createDepositIntent } from "./deposits/create-intent";
import { confirmDeposit } from "./deposits/confirm";

const router = Router();

router.post("/auth/connect", connectWallet);
router.get("/user/balance", getUserBalance);
router.post("/dust/queue", queueDust);
router.get("/dust/status", getDustStatus);
router.post("/deposits/create-intent", createDepositIntent);
router.post("/deposits/confirm", confirmDeposit);
router.post("/admin/batch/run", runBatchNow);

export default router;
