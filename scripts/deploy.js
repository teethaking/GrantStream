const { ethers } = require("hardhat");

async function main() {
  const usdcAddress = process.env.USDC_ADDRESS;

  if (!usdcAddress) {
    throw new Error("Missing USDC_ADDRESS environment variable");
  }

  const GrantStreamEscrow = await ethers.getContractFactory("GrantStreamEscrow");
  const escrow = await GrantStreamEscrow.deploy(usdcAddress);

  await escrow.waitForDeployment();

  console.log("GrantStreamEscrow deployed to:", await escrow.getAddress());
  console.log("USDC address:", usdcAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
