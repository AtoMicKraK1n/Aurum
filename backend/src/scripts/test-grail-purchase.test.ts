import {
  purchaseGoldForUser,
  purchaseGoldPartner,
} from "../lib/grail/purchase";

async function testPurchase() {
  try {
    console.log("🧪 Testing GRAIL gold purchase\n");

    const usdcAmount = 10;

    // Partner purchase (bulk)
    console.log("--- Testing Partner Purchase ---");
    const partnerResult = await purchaseGoldPartner(usdcAmount);
    console.log("Partner purchase successful");
    console.log("   Gold:", partnerResult.goldAmount, "oz");
    console.log("   Tx:", partnerResult.txSignature);

    // User purchase (individual)
    // console.log('\n--- Testing User Purchase ---');
    // const userId = 'your-grail-user-id';
    // const userResult = await purchaseGoldForUser(userId, usdcAmount);
    // console.log('✅ User purchase successful');
    // console.log('   Gold:', userResult.goldAmount, 'oz');
    // console.log('   Tx:', userResult.txSignature);

    console.log("\nPurchase test passed!");
    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testPurchase();
