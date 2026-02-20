import { Router } from "express";
import { connectWallet } from "./auth/connect";
import { getUserBalance } from "./user/balance";
import { queueDust } from "./dust/queue";
import { getDustStatus } from "./dust/status";

const router = Router();

router.post("/auth/connect", connectWallet);
router.get("/user/balance", getUserBalance);
router.post("/dust/queue", queueDust);
router.get("/dust/status", getDustStatus);

export default router;
