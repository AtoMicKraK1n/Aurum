"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthNonce = createAuthNonce;
exports.getAuthMessage = getAuthMessage;
exports.verifyWalletSignature = verifyWalletSignature;
const crypto_1 = require("crypto");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
const web3_js_1 = require("@solana/web3.js");
const AUTH_MESSAGE_PREFIX = "Aurum Wallet Authorization";
function createAuthNonce() {
    return (0, crypto_1.randomBytes)(24).toString("hex");
}
function getAuthMessage(walletAddress, nonce) {
    return `${AUTH_MESSAGE_PREFIX}
Wallet: ${walletAddress}
Nonce: ${nonce}
Purpose: Authorize this wallet for Aurum access`;
}
function verifyWalletSignature(input) {
    const { walletAddress, nonce, signatureBase58 } = input;
    const message = getAuthMessage(walletAddress, nonce);
    const messageBytes = new TextEncoder().encode(message);
    let signatureBytes;
    let publicKeyBytes;
    try {
        signatureBytes = bs58_1.default.decode(signatureBase58);
        publicKeyBytes = new web3_js_1.PublicKey(walletAddress).toBytes();
    }
    catch {
        return false;
    }
    if (signatureBytes.length !== tweetnacl_1.default.sign.signatureLength) {
        return false;
    }
    return tweetnacl_1.default.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}
