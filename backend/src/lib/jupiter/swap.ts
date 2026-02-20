import axios from "axios";

const JUPITER_API = "https://quote-api.jup.ag/v6";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export async function swapSolToUsdc(
  solLamports: bigint,
  slippageBps: number = 50,
): Promise<{ usdcAmount: number; transaction: string }> {
  // Get quote
  const quoteResponse = await axios.get(`${JUPITER_API}/quote`, {
    params: {
      inputMint: SOL_MINT,
      outputMint: USDC_MINT,
      amount: solLamports.toString(),
      slippageBps,
    },
  });

  const quote = quoteResponse.data;

  // Get swap transaction
  const swapResponse = await axios.post(`${JUPITER_API}/swap`, {
    quoteResponse: quote,
    userPublicKey: process.env.SPONSOR_PUBLIC_KEY,
    wrapAndUnwrapSol: true,
  });

  return {
    usdcAmount: Number(quote.outAmount) / 1_000_000,
    transaction: swapResponse.data.swapTransaction,
  };
}
