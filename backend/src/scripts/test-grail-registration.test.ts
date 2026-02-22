import { Keypair } from "@solana/web3.js";
import { registerGrailUser, getGrailUserBalance } from "../lib/grail/user";
import { db } from "../db/queries";

async function testRegistration() {
  try {
    const testKeypair = Keypair.generate();
    const testWallet = testKeypair.publicKey.toString();

    console.log("Testing GRAIL user registration\n");
    console.log("Test wallet:", testWallet);

    const user = await db.createUser(testWallet);
    console.log("User created in DB:", user.id);

    // Register in GRAIL
    const { userId, userPda, txSignature } =
      await registerGrailUser(testWallet);
    console.log("Registered in GRAIL:", userId);
    console.log("   PDA:", userPda);
    console.log("   Tx:", txSignature);

    // Update DB
    await db.updateGrailUser(user.id, userId, userPda);
    console.log("DB updated");

    // Check balance
    const balance = await getGrailUserBalance(userId);
    console.log("Gold balance:", balance);

    console.log("\nRegistration test passed!");
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testRegistration();
