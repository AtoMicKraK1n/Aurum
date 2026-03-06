"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const user_1 = require("../lib/grail/user");
const queries_1 = require("../db/queries");
async function testRegistration() {
    try {
        const testKeypair = web3_js_1.Keypair.generate();
        const testWallet = testKeypair.publicKey.toString();
        console.log("Testing GRAIL user registration\n");
        console.log("Test wallet:", testWallet);
        const user = await queries_1.db.createUser(testWallet);
        console.log("User created in DB:", user.id);
        // Register in GRAIL
        const { userId, userPda, txSignature } = await (0, user_1.registerGrailUser)(testWallet);
        console.log("Registered in GRAIL:", userId);
        console.log("   PDA:", userPda);
        console.log("   Tx:", txSignature);
        // Update DB
        await queries_1.db.updateGrailUser(user.id, userId, userPda);
        console.log("DB updated");
        // Check balance
        const balance = await (0, user_1.getGrailUserBalance)(userId);
        console.log("Gold balance:", balance);
        console.log("\nRegistration test passed!");
        process.exit(0);
    }
    catch (error) {
        console.error("Test failed:", error);
        process.exit(1);
    }
}
testRegistration();
