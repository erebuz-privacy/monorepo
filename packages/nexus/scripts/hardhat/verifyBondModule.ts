import { ethers } from "hardhat";

/**
 * BondModule Verification Script
 * Verifies the deployed account and checks escrow vault balances
 */

const DEPLOYED_ADDRESSES = {
  BondModule: "0xe0146a494c24775ab07e58107f6e96456ad62dca",
  MockToken: "0x24063f25a4b37047e69bdd029efcba5f298700b7",
  EscrowZyFAI: "0x4064db9a9bab77df20f223e13dac784bb43b4386",
  EscrowGiza: "0x558eaafb72be735e5e6f5a4280e948a6109c26bc",
  EscrowCod3x: "0x1ea3939bcc4c1fce86b14ba6dd893a4796c38f59",
};

// Account deployed from the script
const DEPLOYED_ACCOUNT = "0x4ddB4535751D5D39eeead7A5444049b1d8150008";

async function main() {
  console.log("\n=== BONDMODULE DEPLOYMENT VERIFICATION ===\n");

  // Use provider directly for read-only operations
  const provider = ethers.provider;

  // Connect to contracts
  const bondModule = await ethers.getContractAt("BondModule", DEPLOYED_ADDRESSES.BondModule, provider);
  const mockToken = await ethers.getContractAt("MockToken", DEPLOYED_ADDRESSES.MockToken, provider);

  // Check account deployment
  const accountCode = await ethers.provider.getCode(DEPLOYED_ACCOUNT);
  console.log("✓ Account deployed:", accountCode !== "0x");
  console.log("  Address:", DEPLOYED_ACCOUNT);

  // Check BondModule initialization
  const isInitialized = await bondModule.isInitialized(DEPLOYED_ACCOUNT);
  console.log("\n✓ BondModule initialized:", isInitialized);

  const isAgentMode = await bondModule.isAgentModeActivated(DEPLOYED_ACCOUNT);
  console.log("✓ Agent mode activated:", isAgentMode);

  // Check token balances in vaults
  console.log("\n=== Vault Token Balances ===");

  const zyfaiInterface = new ethers.Interface(["function getDeposit(address) view returns (uint256)"]);
  const zyfaiContract = new ethers.Contract(DEPLOYED_ADDRESSES.EscrowZyFAI, zyfaiInterface, provider);
  const zyfaiBalance = await zyfaiContract.getDeposit(DEPLOYED_ACCOUNT);
  console.log("ZyFAI Vault (30%):", zyfaiBalance.toString());

  const gizaContract = new ethers.Contract(DEPLOYED_ADDRESSES.EscrowGiza, zyfaiInterface, provider);
  const gizaBalance = await gizaContract.getDeposit(DEPLOYED_ACCOUNT);
  console.log("Giza Vault (30%):", gizaBalance.toString());

  const cod3xContract = new ethers.Contract(DEPLOYED_ADDRESSES.EscrowCod3x, zyfaiInterface, provider);
  const cod3xBalance = await cod3xContract.getDeposit(DEPLOYED_ACCOUNT);
  console.log("Cod3x Vault (40%):", cod3xBalance.toString());

  const totalDeposited = zyfaiBalance + gizaBalance + cod3xBalance;
  console.log("\n✓ Total deposited:", totalDeposited.toString());
  console.log("✓ Expected:", "10000000000");

  // Check account token balance (should be 0 after distribution)
  const accountBalance = await mockToken.balanceOf(DEPLOYED_ACCOUNT);
  console.log("✓ Account remaining balance:", accountBalance.toString());

  // Verify percentages
  const total = totalDeposited;
  const zyfaiPercent = (Number(zyfaiBalance) * 10000) / Number(total);
  const gizaPercent = (Number(gizaBalance) * 10000) / Number(total);
  const cod3xPercent = (Number(cod3xBalance) * 10000) / Number(total);

  console.log("\n=== Distribution Percentages ===");
  console.log("ZyFAI:", (zyfaiPercent / 100).toFixed(2) + "%", "(Expected: 30%)");
  console.log("Giza:", (gizaPercent / 100).toFixed(2) + "%", "(Expected: 30%)");
  console.log("Cod3x:", (cod3xPercent / 100).toFixed(2) + "%", "(Expected: 40%)");

  console.log("\n=== VERIFICATION COMPLETE ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
