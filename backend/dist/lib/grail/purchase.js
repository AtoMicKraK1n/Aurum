"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateGoldPurchase = estimateGoldPurchase;
exports.purchaseGoldForUser = purchaseGoldForUser;
exports.createSelfCustodyPurchaseIntent = createSelfCustodyPurchaseIntent;
exports.submitSignedSelfCustodyTransaction = submitSignedSelfCustodyTransaction;
exports.purchaseGoldPartner = purchaseGoldPartner;
const axios_1 = __importDefault(require("axios"));
const web3_js_1 = require("@solana/web3.js");
const bs58_1 = __importDefault(require("bs58"));
const GRAIL_API = (process.env.GRAIL_API_URL || "https://oro-tradebook-devnet.up.railway.app").replace(/\/+$/, "");
const GRAIL_API_KEY = process.env.GRAIL_API_KEY;
const connection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL);
const executiveAuthority = web3_js_1.Keypair.fromSecretKey(bs58_1.default.decode(process.env.SPONSOR_PRIVATE_KEY));
function deserializeAnyTransaction(serializedTxBase64) {
    const bytes = Buffer.from(serializedTxBase64, "base64");
    try {
        return web3_js_1.Transaction.from(bytes);
    }
    catch {
        return web3_js_1.VersionedTransaction.deserialize(bytes);
    }
}
function getRequiredSignerPubkeys(tx) {
    if (tx instanceof web3_js_1.Transaction) {
        return tx.signatures.map((entry) => entry.publicKey.toBase58());
    }
    const required = tx.message.header.numRequiredSignatures;
    return tx.message.staticAccountKeys
        .slice(0, required)
        .map((key) => key.toBase58());
}
function getMissingSignerPubkeys(tx) {
    if (tx instanceof web3_js_1.Transaction) {
        return tx.signatures
            .filter((entry) => !entry.signature)
            .map((entry) => entry.publicKey.toBase58());
    }
    const requiredKeys = getRequiredSignerPubkeys(tx);
    return tx.signatures
        .map((sig, index) => ({ sig, key: requiredKeys[index] }))
        .filter(({ sig }) => sig.every((byte) => byte === 0))
        .map(({ key }) => key);
}
function extractTxSignatureFromSignedTx(tx) {
    if (tx instanceof web3_js_1.Transaction) {
        const signature = tx.signature;
        if (signature && !signature.every((byte) => byte === 0)) {
            return bs58_1.default.encode(signature);
        }
        return "";
    }
    const firstSignature = tx.signatures[0];
    if (firstSignature && !firstSignature.every((byte) => byte === 0)) {
        return bs58_1.default.encode(firstSignature);
    }
    return "";
}
async function signAndSendTransaction(tx, extraSigners = []) {
    const allSigners = [executiveAuthority, ...extraSigners];
    if (tx instanceof web3_js_1.Transaction) {
        tx.sign(...allSigners);
    }
    else {
        tx.sign(allSigners);
    }
    const requiredSigners = getRequiredSignerPubkeys(tx);
    const missingSigners = getMissingSignerPubkeys(tx);
    if (missingSigners.length > 0) {
        throw new Error(`Missing required signatures. required=[${requiredSigners.join(", ")}] missing=[${missingSigners.join(", ")}] provided=[${allSigners.map((s) => s.publicKey.toBase58()).join(", ")}]`);
    }
    const txSignature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txSignature);
    return txSignature;
}
async function estimateGoldPurchase(targetUsdcAmount) {
    try {
        const response = await axios_1.default.post(`${GRAIL_API}/api/trading/estimate/buy`, { goldAmount: targetUsdcAmount / 5000 }, { headers: { "x-api-key": GRAIL_API_KEY } });
        const data = response.data?.data || {};
        const goldAmount = Number(data.goldAmount || 0);
        const goldPricePerOunce = Number(data.goldPricePerOunce || 0);
        const estimatedUsdcAmount = Number(data.usdcAmount ??
            data.quoteUsdcAmount ??
            (goldAmount > 0 && goldPricePerOunce > 0
                ? goldAmount * goldPricePerOunce
                : targetUsdcAmount));
        return {
            goldAmount,
            goldPricePerOunce,
            estimatedUsdcAmount: Number.isFinite(estimatedUsdcAmount) && estimatedUsdcAmount > 0
                ? estimatedUsdcAmount
                : targetUsdcAmount,
        };
    }
    catch (error) {
        console.error("Failed to estimate gold purchase:", error);
        throw error;
    }
}
async function purchaseGoldForUser(userId, usdcAmount, slippagePercent = 5, cosign = false, userAsFeePayer = true, userSigner) {
    try {
        console.log(`Purchasing gold for user ${userId} with ${usdcAmount} USDC`);
        const { goldAmount, estimatedUsdcAmount } = await estimateGoldPurchase(usdcAmount);
        console.log(`Estimate: ${goldAmount} oz gold at ~${estimatedUsdcAmount} USDC`);
        const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);
        const response = await axios_1.default.post(`${GRAIL_API}/api/trading/purchases/user`, {
            userId,
            goldAmount,
            maxUsdcAmount,
            co_sign: cosign,
            userAsFeePayer,
        }, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
        });
        const { transaction } = response.data.data;
        console.log("Purchase transaction created");
        const tx = deserializeAnyTransaction(transaction.serializedTx);
        const requiredSigners = getRequiredSignerPubkeys(tx);
        console.log(`Required signers: ${requiredSigners.join(", ")}`);
        const txSignature = await signAndSendTransaction(tx, userSigner ? [userSigner] : []);
        console.log(`Confirming purchase: ${txSignature}`);
        console.log(`Gold purchased: ${goldAmount} oz (tx: ${txSignature})`);
        return {
            goldAmount: response.data.data.goldAmount,
            txSignature,
        };
    }
    catch (error) {
        console.error("Gold purchase failed:", error);
        if (axios_1.default.isAxiosError(error)) {
            console.error("Response:", error.response?.data);
        }
        throw new Error(`Failed to purchase gold: ${error.message}`);
    }
}
async function createSelfCustodyPurchaseIntent(userId, usdcAmount, slippagePercent = 5, cosign = false, userAsFeePayer = true) {
    try {
        const { goldAmount, estimatedUsdcAmount } = await estimateGoldPurchase(usdcAmount);
        const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);
        const requestBody = {
            userId,
            goldAmount,
            maxUsdcAmount,
            co_sign: cosign,
            userAsFeePayer,
        };
        const response = await axios_1.default.post(`${GRAIL_API}/api/trading/purchases/user`, requestBody, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
        });
        return {
            goldAmount: response.data.data.goldAmount,
            maxUsdcAmount,
            serializedTx: response.data.data.transaction.serializedTx,
            signingInstructions: response.data.data.signingInstructions,
            status: response.data.data.status,
        };
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const detail = typeof error.response?.data === "string"
                ? error.response.data
                : JSON.stringify(error.response?.data);
            throw new Error(`Failed to create self-custody purchase intent: ${error.message}${detail ? ` | ${detail}` : ""}`);
        }
        throw error;
    }
}
async function submitSignedSelfCustodyTransaction(signedSerializedTx) {
    try {
        const tx = deserializeAnyTransaction(signedSerializedTx);
        const requiredSigners = getRequiredSignerPubkeys(tx);
        const executivePubkey = executiveAuthority.publicKey.toBase58();
        const requiresExecutiveSignature = requiredSigners.includes(executivePubkey);
        // Add executive signature only when the transaction actually requires it.
        if (requiresExecutiveSignature) {
            if (tx instanceof web3_js_1.Transaction) {
                tx.partialSign(executiveAuthority);
            }
            else {
                tx.sign([executiveAuthority]);
            }
        }
        const missingSigners = getMissingSignerPubkeys(tx);
        if (missingSigners.length > 0) {
            throw new Error(`Missing required signatures before submit. required=[${requiredSigners.join(", ")}] missing=[${missingSigners.join(", ")}]`);
        }
        const signedPayloadBase64 = Buffer.from(tx.serialize()).toString("base64");
        const response = await axios_1.default.post(`${GRAIL_API}/api/transactions/submit`, {
            signedTransaction: signedPayloadBase64,
        }, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
        });
        const topLevel = response.data || {};
        const nestedData = topLevel.data || {};
        const txSignature = String(nestedData.txSignature ??
            nestedData.transactionSignature ??
            nestedData.signature ??
            nestedData.txid ??
            nestedData.transactionHash ??
            nestedData.txHash ??
            topLevel.txSignature ??
            topLevel.transactionSignature ??
            topLevel.signature ??
            topLevel.txid ??
            topLevel.transactionHash ??
            topLevel.txHash ??
            "");
        if (txSignature) {
            return txSignature;
        }
        const localTxSignature = extractTxSignatureFromSignedTx(tx);
        if (localTxSignature) {
            console.warn("Grail submit response had no signature field; using signature from signed transaction payload.");
            return localTxSignature;
        }
        throw new Error("Missing transaction signature from Grail submit response");
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const detail = typeof error.response?.data === "string"
                ? error.response.data
                : JSON.stringify(error.response?.data);
            throw new Error(`Failed to submit signed self-custody transaction: ${error.message}${detail ? ` | ${detail}` : ""}`);
        }
        throw error;
    }
}
async function purchaseGoldPartner(usdcAmount, slippagePercent = 5) {
    try {
        console.log(`💰 Purchasing gold for partner with ${usdcAmount} USDC`);
        const { goldAmount, estimatedUsdcAmount } = await estimateGoldPurchase(usdcAmount);
        console.log(`Estimate: ${goldAmount} oz gold at ~${estimatedUsdcAmount} USDC`);
        const maxUsdcAmount = estimatedUsdcAmount * (1 + slippagePercent / 100);
        const response = await axios_1.default.post(`${GRAIL_API}/api/trading/purchases/partner`, {
            goldAmount,
            maxUsdcAmount,
        }, {
            headers: {
                "Content-Type": "application/json",
                "x-api-key": GRAIL_API_KEY,
            },
        });
        const { transaction } = response.data.data;
        console.log("Partner purchase transaction created");
        const tx = deserializeAnyTransaction(transaction.serializedTx);
        const txSignature = await signAndSendTransaction(tx);
        console.log(`Confirming purchase: ${txSignature}`);
        console.log(`Gold purchased for partner: ${goldAmount} oz (tx: ${txSignature})`);
        return {
            goldAmount: response.data.data.goldAmount,
            txSignature,
        };
    }
    catch (error) {
        console.error("Partner gold purchase failed:", error);
        if (axios_1.default.isAxiosError(error)) {
            console.error("Response:", error.response?.data);
        }
        throw new Error(`Failed to purchase partner gold: ${error.message}`);
    }
}
