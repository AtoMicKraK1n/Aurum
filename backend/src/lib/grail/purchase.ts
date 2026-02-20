import axios from "axios";

const GRAIL_API =
  process.env.GRAIL_API_URL ||
  "https://oro-tradebook-devnet.up.railway.app/api/trading";
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;

export async function estimateGoldPurchase(
  usdcAmount: number,
): Promise<number> {
  const response = await axios.post(
    `${GRAIL_API}/estimate/buy`,
    { goldAmount: usdcAmount / 5000 }, // Rough estimate
    { headers: { "x-api-key": GRAIL_API_KEY } },
  );

  return response.data.data.goldAmount;
}

export async function purchaseGold(
  usdcAmount: number,
  maxSlippage: number = 0.05,
): Promise<{ goldAmount: number; transaction: string; txSignature: string }> {
  const estimatedGold = await estimateGoldPurchase(usdcAmount);

  const response = await axios.post(
    `${GRAIL_API}/purchases/partner`,
    {
      goldAmount: estimatedGold,
      maxUsdcAmount: usdcAmount * (1 + maxSlippage),
    },
    { headers: { "x-api-key": GRAIL_API_KEY } },
  );

  return {
    goldAmount: response.data.data.goldAmount,
    transaction: response.data.data.transaction.serializedTx,
    txSignature: "",
  };
}
