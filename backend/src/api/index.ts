import { Router } from "express";
import { connectWallet } from "./auth/connect";
import { createAuthNonceChallenge } from "./auth/nonce";
import { getUserBalance } from "./user/balance";
import { getUserProfile } from "./user/profile";
import { registerUserInGrail } from "./user/register-grail";
import { queueDust } from "./dust/queue";
import { getDustStatus } from "./dust/status";
import {
  getDustSweepSettings,
  upsertDustSweepSettings,
} from "./dust/sweep-settings";
import { listDustSweepRuns } from "./dust/sweep-runs";
import { runBatchNow } from "./admin/batch";
import { createDepositIntent } from "./deposits/create-intent";
import { confirmDeposit } from "./deposits/confirm";
import { createSelfPurchaseIntent } from "./self/purchase-intent";
import { submitSelfPurchase } from "./self/purchase-submit";
import { quoteBuy } from "./quotes/buy";
import { quoteSell } from "./quotes/sell";
import { getPurchaseConfig } from "./purchase/config";

const router = Router();

router.post("/auth/nonce", createAuthNonceChallenge);
router.post("/auth/connect", connectWallet);
router.get("/user/profile", getUserProfile);
router.post("/user/register-grail", registerUserInGrail);
router.get("/user/balance", getUserBalance);
router.post("/dust/queue", queueDust);
router.get("/dust/status", getDustStatus);
router.get("/dust/sweep/settings", getDustSweepSettings);
router.post("/dust/sweep/settings", upsertDustSweepSettings);
router.get("/dust/sweep/runs", listDustSweepRuns);
router.post("/deposits/create-intent", createDepositIntent);
router.post("/deposits/confirm", confirmDeposit);
router.post("/self/purchase-intent", createSelfPurchaseIntent);
router.post("/self/purchase-submit", submitSelfPurchase);
router.get("/quotes/buy", quoteBuy);
router.get("/quotes/sell", quoteSell);
router.get("/purchase/config", getPurchaseConfig);
router.post("/admin/batch/run", runBatchNow);

export default router;
