import { Router } from "express";
import { connectWallet } from "./auth/connect";
import { getUserBalance } from "./user/balance";
import { queueDust } from "./dust/queue";
import { getDustStatus } from "./dust/status";
import { runBatchNow } from "./admin/batch";
import { createDepositIntent } from "./deposits/create-intent";
import { confirmDeposit } from "./deposits/confirm";
import { createSelfPurchaseIntent } from "./self/purchase-intent";
import { submitSelfPurchase } from "./self/purchase-submit";
import { quoteBuy } from "./quotes/buy";
import { quoteSell } from "./quotes/sell";

const router = Router();

router.post("/auth/connect", connectWallet);
router.get("/user/balance", getUserBalance);
router.post("/dust/queue", queueDust);
router.get("/dust/status", getDustStatus);
router.post("/deposits/create-intent", createDepositIntent);
router.post("/deposits/confirm", confirmDeposit);
router.post("/self/purchase-intent", createSelfPurchaseIntent);
router.post("/self/purchase-submit", submitSelfPurchase);
router.get("/quotes/buy", quoteBuy);
router.get("/quotes/sell", quoteSell);
router.post("/admin/batch/run", runBatchNow);

export default router;
