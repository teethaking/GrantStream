const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GrantStreamEscrow", function () {
  let usdc;
  let escrow;
  let funder;
  let grantee;
  let verifier;
  let other;

  const grantAmount1 = ethers.parseUnits("100", 6);
  const grantAmount2 = ethers.parseUnits("200", 6);
  const totalGrantAmount = grantAmount1 + grantAmount2;

  beforeEach(async function () {
    [funder, grantee, verifier, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const GrantStreamEscrow = await ethers.getContractFactory("GrantStreamEscrow");
    escrow = await GrantStreamEscrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    await usdc.mint(funder.address, totalGrantAmount);
  });

  it("creates a grant with milestones", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1, grantAmount2]);

    const grant = await escrow.grants(0);

    expect(grant.funder).to.equal(funder.address);
    expect(grant.grantee).to.equal(grantee.address);
    expect(grant.verifier).to.equal(verifier.address);
    expect(grant.totalAmount).to.equal(totalGrantAmount);
    expect(await escrow.getMilestoneCount(0)).to.equal(2);
  });

  it("funds a grant with USDC", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1, grantAmount2]);

    await usdc.connect(funder).approve(await escrow.getAddress(), totalGrantAmount);
    await escrow.connect(funder).fundGrant(0);

    const grant = await escrow.grants(0);

    expect(grant.funded).to.equal(true);
    expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(totalGrantAmount);
  });

  it("allows grantee to submit milestone evidence", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1]);

    await usdc.connect(funder).approve(await escrow.getAddress(), grantAmount1);
    await escrow.connect(funder).fundGrant(0);

    await escrow.connect(grantee).submitMilestone(0, 0, "ipfs://evidence-hash");

    const milestone = await escrow.getMilestone(0, 0);

    expect(milestone.evidenceURI).to.equal("ipfs://evidence-hash");
    expect(milestone.status).to.equal(1);
  });

  it("releases USDC when verifier approves milestone", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1]);

    await usdc.connect(funder).approve(await escrow.getAddress(), grantAmount1);
    await escrow.connect(funder).fundGrant(0);
    await escrow.connect(grantee).submitMilestone(0, 0, "ipfs://evidence-hash");

    await escrow.connect(verifier).approveMilestone(0, 0);

    expect(await usdc.balanceOf(grantee.address)).to.equal(grantAmount1);

    const milestone = await escrow.getMilestone(0, 0);
    expect(milestone.status).to.equal(3);
  });

  it("prevents non-grantee from submitting milestone", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1]);

    await usdc.connect(funder).approve(await escrow.getAddress(), grantAmount1);
    await escrow.connect(funder).fundGrant(0);

    await expect(
      escrow.connect(other).submitMilestone(0, 0, "ipfs://bad-evidence")
    ).to.be.revertedWithCustomError(escrow, "NotGrantee");
  });

  it("prevents non-verifier from approving milestone", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1]);

    await usdc.connect(funder).approve(await escrow.getAddress(), grantAmount1);
    await escrow.connect(funder).fundGrant(0);
    await escrow.connect(grantee).submitMilestone(0, 0, "ipfs://evidence-hash");

    await expect(
      escrow.connect(other).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "NotVerifier");
  });

  it("prevents milestone from being paid twice", async function () {
    await escrow
      .connect(funder)
      .createGrant(grantee.address, verifier.address, [grantAmount1]);

    await usdc.connect(funder).approve(await escrow.getAddress(), grantAmount1);
    await escrow.connect(funder).fundGrant(0);
    await escrow.connect(grantee).submitMilestone(0, 0, "ipfs://evidence-hash");
    await escrow.connect(verifier).approveMilestone(0, 0);

    await expect(
      escrow.connect(verifier).approveMilestone(0, 0)
    ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
  });
});
