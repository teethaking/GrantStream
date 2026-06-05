const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

// ─── Status enum mirrors ───────────────────────────────────────────────────────
const Status = { Pending: 0, Submitted: 1, Approved: 2, Paid: 3, Rejected: 4 };

// ─── Helpers ──────────────────────────────────────────────────────────────────
const u = (n) => ethers.parseUnits(String(n), 6); // 6-decimal USDC amounts

describe("GrantStreamEscrow", function () {
  // ── Shared fixture ────────────────────────────────────────────────────────
  async function deployFixture() {
    const [owner, funder, grantee, verifier, other, attacker] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const GrantStreamEscrow = await ethers.getContractFactory("GrantStreamEscrow");
    const escrow = await GrantStreamEscrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    return { usdc, escrow, owner, funder, grantee, verifier, other, attacker };
  }

  /** Sets up a fully-funded grant with two milestones (100 + 200 USDC). */
  async function fundedGrantFixture() {
    const base = await deployFixture();
    const { usdc, escrow, funder, grantee, verifier } = base;

    const amounts = [u(100), u(200)];
    const total = u(300);

    await usdc.mint(funder.address, total);
    await escrow.connect(funder).createGrant(grantee.address, verifier.address, amounts);
    await usdc.connect(funder).approve(await escrow.getAddress(), total);
    await escrow.connect(funder).fundGrant(0);

    return { ...base, amounts, total, grantId: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Deployment", function () {
    it("stores the USDC token address", async function () {
      const { usdc, escrow } = await loadFixture(deployFixture);
      expect(await escrow.usdc()).to.equal(await usdc.getAddress());
    });

    it("starts with nextGrantId = 0", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.nextGrantId()).to.equal(0);
    });

    it("reverts when deployed with zero-address USDC", async function () {
      const GrantStreamEscrow = await ethers.getContractFactory("GrantStreamEscrow");
      await expect(
        GrantStreamEscrow.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(
        await GrantStreamEscrow.deploy(ethers.ZeroAddress).catch(() =>
          ethers.getContractFactory("GrantStreamEscrow")
        ),
        "InvalidAddress"
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. GRANT CREATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Grant Creation", function () {
    it("creates a grant and stores all fields correctly", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      const amounts = [u(100), u(200)];

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, amounts);

      const grant = await escrow.grants(0);
      expect(grant.funder).to.equal(funder.address);
      expect(grant.grantee).to.equal(grantee.address);
      expect(grant.verifier).to.equal(verifier.address);
      expect(grant.totalAmount).to.equal(u(300));
      expect(grant.paidAmount).to.equal(0);
      expect(grant.funded).to.equal(false);
      expect(grant.exists).to.equal(true);
    });

    it("increments nextGrantId after each creation", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(50)]);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(50)]);
      expect(await escrow.nextGrantId()).to.equal(2);
    });

    it("creates the correct number of milestones", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      const amounts = [u(10), u(20), u(30), u(40)];

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, amounts);
      expect(await escrow.getMilestoneCount(0)).to.equal(4);
    });

    it("initialises each milestone as Pending with correct amount", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      const amounts = [u(100), u(200)];

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, amounts);

      const m0 = await escrow.getMilestone(0, 0);
      expect(m0.amount).to.equal(u(100));
      expect(m0.status).to.equal(Status.Pending);
      expect(m0.evidenceURI).to.equal("");

      const m1 = await escrow.getMilestone(0, 1);
      expect(m1.amount).to.equal(u(200));
      expect(m1.status).to.equal(Status.Pending);
    });

    it("emits GrantCreated event with correct args", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100)])
      )
        .to.emit(escrow, "GrantCreated")
        .withArgs(0, funder.address, grantee.address, verifier.address, u(100));
    });

    it("supports a single milestone", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(500)]);

      const grant = await escrow.grants(0);
      expect(grant.totalAmount).to.equal(u(500));
      expect(await escrow.getMilestoneCount(0)).to.equal(1);
    });

    it("supports many milestones", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      const amounts = Array.from({ length: 10 }, (_, i) => u(i + 1));

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, amounts);
      expect(await escrow.getMilestoneCount(0)).to.equal(10);
    });

    // ── Input validation ───────────────────────────────────────────────────
    it("reverts when grantee is zero address", async function () {
      const { escrow, funder, verifier } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(funder).createGrant(ethers.ZeroAddress, verifier.address, [u(100)])
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("reverts when verifier is zero address", async function () {
      const { escrow, funder, grantee } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(funder).createGrant(grantee.address, ethers.ZeroAddress, [u(100)])
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("reverts when milestone array is empty", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(funder).createGrant(grantee.address, verifier.address, [])
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestones");
    });

    it("reverts when any milestone amount is zero", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100), 0])
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. GRANT FUNDING
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Grant Funding", function () {
    it("marks the grant as funded after fundGrant()", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(300);

      await usdc.mint(funder.address, total);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100), u(200)]);
      await usdc.connect(funder).approve(await escrow.getAddress(), total);
      await escrow.connect(funder).fundGrant(0);

      const grant = await escrow.grants(0);
      expect(grant.funded).to.equal(true);
    });

    it("transfers USDC from funder to escrow contract", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(300);

      await usdc.mint(funder.address, total);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100), u(200)]);
      await usdc.connect(funder).approve(await escrow.getAddress(), total);

      const escrowAddress = await escrow.getAddress();
      const before = await usdc.balanceOf(funder.address);

      await escrow.connect(funder).fundGrant(0);

      expect(await usdc.balanceOf(escrowAddress)).to.equal(total);
      expect(await usdc.balanceOf(funder.address)).to.equal(before - total);
    });

    it("emits GrantFunded event", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(300);

      await usdc.mint(funder.address, total);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100), u(200)]);
      await usdc.connect(funder).approve(await escrow.getAddress(), total);

      await expect(escrow.connect(funder).fundGrant(0))
        .to.emit(escrow, "GrantFunded")
        .withArgs(0, total);
    });

    // ── Access control ─────────────────────────────────────────────────────
    it("reverts when non-funder tries to fund", async function () {
      const { escrow, usdc, funder, grantee, verifier, other } =
        await loadFixture(deployFixture);
      const total = u(100);

      await usdc.mint(other.address, total);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [total]);
      await usdc.connect(other).approve(await escrow.getAddress(), total);

      await expect(escrow.connect(other).fundGrant(0)).to.be.revertedWithCustomError(
        escrow,
        "NotFunder"
      );
    });

    it("reverts when grant does not exist", async function () {
      const { escrow, funder } = await loadFixture(deployFixture);
      await expect(escrow.connect(funder).fundGrant(99)).to.be.revertedWithCustomError(
        escrow,
        "GrantNotFound"
      );
    });

    it("reverts on double funding", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(100);

      await usdc.mint(funder.address, total * 2n);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [total]);
      await usdc.connect(funder).approve(await escrow.getAddress(), total * 2n);
      await escrow.connect(funder).fundGrant(0);

      await expect(escrow.connect(funder).fundGrant(0)).to.be.revertedWithCustomError(
        escrow,
        "GrantAlreadyFunded"
      );
    });

    it("reverts when funder has insufficient USDC balance", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(1000);

      await usdc.mint(funder.address, u(10));
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [total]);
      await usdc.connect(funder).approve(await escrow.getAddress(), total);

      await expect(escrow.connect(funder).fundGrant(0)).to.be.reverted;
    });

    it("reverts when allowance is not set", async function () {
      const { escrow, usdc, funder, grantee, verifier } = await loadFixture(deployFixture);
      const total = u(100);

      await usdc.mint(funder.address, total);
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [total]);
      // NO approve call

      await expect(escrow.connect(funder).fundGrant(0)).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. MILESTONE SUBMISSION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Milestone Submission", function () {
    it("grantee can submit a milestone with evidence", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence-abc");

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.status).to.equal(Status.Submitted);
      expect(m.evidenceURI).to.equal("ipfs://evidence-abc");
    });

    it("emits MilestoneSubmitted event", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence-abc")
      )
        .to.emit(escrow, "MilestoneSubmitted")
        .withArgs(grantId, 0, "ipfs://evidence-abc");
    });

    it("allows resubmission of a rejected milestone", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://v1");
      await escrow.connect(verifier).rejectMilestone(grantId, 0);
      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://v2");

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.status).to.equal(Status.Submitted);
      expect(m.evidenceURI).to.equal("ipfs://v2");
    });

    it("multiple different milestones can be submitted independently", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://m0");
      await escrow.connect(grantee).submitMilestone(grantId, 1, "ipfs://m1");

      expect((await escrow.getMilestone(grantId, 0)).status).to.equal(Status.Submitted);
      expect((await escrow.getMilestone(grantId, 1)).status).to.equal(Status.Submitted);
    });

    // ── Access / input validation ───────────────────────────────────────────
    it("reverts when non-grantee submits", async function () {
      const { escrow, other, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(other).submitMilestone(grantId, 0, "ipfs://bad")
      ).to.be.revertedWithCustomError(escrow, "NotGrantee");
    });

    it("reverts when verifier tries to submit", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).submitMilestone(grantId, 0, "ipfs://bad")
      ).to.be.revertedWithCustomError(escrow, "NotGrantee");
    });

    it("reverts when funder tries to submit", async function () {
      const { escrow, funder, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(funder).submitMilestone(grantId, 0, "ipfs://bad")
      ).to.be.revertedWithCustomError(escrow, "NotGrantee");
    });

    it("reverts when grant is not funded", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100)]);

      await expect(
        escrow.connect(grantee).submitMilestone(0, 0, "ipfs://evidence")
      ).to.be.revertedWithCustomError(escrow, "GrantNotFunded");
    });

    it("reverts when grant does not exist", async function () {
      const { escrow, grantee } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(grantee).submitMilestone(99, 0, "ipfs://evidence")
      ).to.be.revertedWithCustomError(escrow, "GrantNotFound");
    });

    it("reverts when milestoneId is out of range", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(grantee).submitMilestone(grantId, 99, "ipfs://evidence")
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestone");
    });

    it("reverts when evidenceURI is empty", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(grantee).submitMilestone(grantId, 0, "")
      ).to.be.revertedWithCustomError(escrow, "EmptyEvidenceURI");
    });

    it("reverts when milestone is already submitted (not Pending/Rejected)", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://first");

      await expect(
        escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://second")
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("reverts when milestone is already paid", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      await expect(
        escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://again")
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. VERIFIER APPROVAL
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Verifier Approval", function () {
    it("verifier can approve a submitted milestone", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.status).to.equal(Status.Paid);
    });

    it("emits MilestoneApproved and MilestonePaid events", async function () {
      const { escrow, grantee, verifier, grantId, amounts } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(escrow.connect(verifier).approveMilestone(grantId, 0))
        .to.emit(escrow, "MilestoneApproved")
        .withArgs(grantId, 0)
        .and.to.emit(escrow, "MilestonePaid")
        .withArgs(grantId, 0, grantee.address, amounts[0]);
    });

    it("releases the correct USDC amount to the grantee", async function () {
      const { escrow, grantee, verifier, grantId, amounts } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      expect(await usdc.balanceOf(grantee.address)).to.equal(amounts[0]);
    });

    it("updates grant.paidAmount after approval", async function () {
      const { escrow, grantee, verifier, grantId, amounts } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      const grant = await escrow.grants(grantId);
      expect(grant.paidAmount).to.equal(amounts[0]);
    });

    it("can approve multiple milestones sequentially", async function () {
      const { escrow, grantee, verifier, grantId, amounts, total } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://m0");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      await escrow.connect(grantee).submitMilestone(grantId, 1, "ipfs://m1");
      await escrow.connect(verifier).approveMilestone(grantId, 1);

      const grant = await escrow.grants(grantId);
      expect(grant.paidAmount).to.equal(total);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      expect(await usdc.balanceOf(grantee.address)).to.equal(total);
    });

    it("escrow balance decreases correctly after each approval", async function () {
      const { escrow, grantee, verifier, grantId, amounts, total } =
        await loadFixture(fundedGrantFixture);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      const escrowAddress = await escrow.getAddress();

      expect(await usdc.balanceOf(escrowAddress)).to.equal(total);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://m0");
      await escrow.connect(verifier).approveMilestone(grantId, 0);
      expect(await usdc.balanceOf(escrowAddress)).to.equal(total - amounts[0]);

      await escrow.connect(grantee).submitMilestone(grantId, 1, "ipfs://m1");
      await escrow.connect(verifier).approveMilestone(grantId, 1);
      expect(await usdc.balanceOf(escrowAddress)).to.equal(0n);
    });

    // ── Access control ─────────────────────────────────────────────────────
    it("reverts when non-verifier tries to approve", async function () {
      const { escrow, grantee, other, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(other).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("reverts when funder tries to approve", async function () {
      const { escrow, grantee, funder, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(funder).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("reverts when grantee tries to approve their own milestone", async function () {
      const { escrow, grantee, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(grantee).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("reverts when milestone is still Pending (not Submitted)", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("reverts when milestone is already Paid", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      await expect(
        escrow.connect(verifier).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("reverts when milestoneId is out of range", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).approveMilestone(grantId, 99)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestone");
    });

    it("reverts when grant does not exist", async function () {
      const { escrow, verifier } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(verifier).approveMilestone(99, 0)
      ).to.be.revertedWithCustomError(escrow, "GrantNotFound");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. VERIFIER REJECTION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Verifier Rejection", function () {
    it("verifier can reject a submitted milestone", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).rejectMilestone(grantId, 0);

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.status).to.equal(Status.Rejected);
    });

    it("emits MilestoneRejected event", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(escrow.connect(verifier).rejectMilestone(grantId, 0))
        .to.emit(escrow, "MilestoneRejected")
        .withArgs(grantId, 0);
    });

    it("does NOT release funds when milestone is rejected", async function () {
      const { escrow, grantee, verifier, grantId, total } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).rejectMilestone(grantId, 0);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      expect(await usdc.balanceOf(grantee.address)).to.equal(0n);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(total);
    });

    it("grantee can resubmit after rejection and get approved", async function () {
      const { escrow, grantee, verifier, grantId, amounts } =
        await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://bad");
      await escrow.connect(verifier).rejectMilestone(grantId, 0);
      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://fixed");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.status).to.equal(Status.Paid);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      expect(await usdc.balanceOf(grantee.address)).to.equal(amounts[0]);
    });

    // ── Access control ─────────────────────────────────────────────────────
    it("reverts when non-verifier tries to reject", async function () {
      const { escrow, grantee, other, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(other).rejectMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("reverts when milestone is Pending (not Submitted)", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).rejectMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("reverts when milestone is already Paid", async function () {
      const { escrow, grantee, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      await escrow.connect(verifier).approveMilestone(grantId, 0);

      await expect(
        escrow.connect(verifier).rejectMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
    });

    it("reverts when milestoneId is out of range", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).rejectMilestone(grantId, 99)
      ).to.be.revertedWithCustomError(escrow, "InvalidMilestone");
    });

    it("reverts when grant does not exist", async function () {
      const { escrow, verifier } = await loadFixture(deployFixture);

      await expect(
        escrow.connect(verifier).rejectMilestone(99, 0)
      ).to.be.revertedWithCustomError(escrow, "GrantNotFound");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("View Functions", function () {
    it("getMilestone returns correct data for a valid milestone", async function () {
      const { escrow, grantee, grantId, amounts } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://cid123");

      const m = await escrow.getMilestone(grantId, 0);
      expect(m.amount).to.equal(amounts[0]);
      expect(m.evidenceURI).to.equal("ipfs://cid123");
      expect(m.status).to.equal(Status.Submitted);
    });

    it("getMilestone reverts for non-existent grant", async function () {
      const { escrow } = await loadFixture(deployFixture);

      await expect(escrow.getMilestone(99, 0)).to.be.revertedWithCustomError(
        escrow,
        "GrantNotFound"
      );
    });

    it("getMilestone reverts for out-of-range milestoneId", async function () {
      const { escrow, grantId } = await loadFixture(fundedGrantFixture);

      await expect(escrow.getMilestone(grantId, 99)).to.be.revertedWithCustomError(
        escrow,
        "InvalidMilestone"
      );
    });

    it("getMilestoneCount returns the correct count", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [
        u(10), u(20), u(30),
      ]);

      expect(await escrow.getMilestoneCount(0)).to.equal(3);
    });

    it("getMilestoneCount reverts for non-existent grant", async function () {
      const { escrow } = await loadFixture(deployFixture);

      await expect(escrow.getMilestoneCount(99)).to.be.revertedWithCustomError(
        escrow,
        "GrantNotFound"
      );
    });

    it("grants mapping returns correct public fields", async function () {
      const { escrow, funder, grantee, verifier } = await loadFixture(deployFixture);

      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(50)]);

      const grant = await escrow.grants(0);
      expect(grant.funder).to.equal(funder.address);
      expect(grant.grantee).to.equal(grantee.address);
      expect(grant.verifier).to.equal(verifier.address);
      expect(grant.totalAmount).to.equal(u(50));
      expect(grant.paidAmount).to.equal(0n);
      expect(grant.funded).to.equal(false);
      expect(grant.exists).to.equal(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. MULTI-GRANT ISOLATION
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Multi-Grant Isolation", function () {
    it("two separate grants do not interfere with each other", async function () {
      const { usdc, escrow, funder, grantee, verifier, other } =
        await loadFixture(deployFixture);

      // Grant 0: funder → grantee, 1 milestone of 100
      await usdc.mint(funder.address, u(100));
      await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(100)]);
      await usdc.connect(funder).approve(await escrow.getAddress(), u(100));
      await escrow.connect(funder).fundGrant(0);

      // Grant 1: other → grantee, 1 milestone of 200
      await usdc.mint(other.address, u(200));
      await escrow.connect(other).createGrant(grantee.address, verifier.address, [u(200)]);
      await usdc.connect(other).approve(await escrow.getAddress(), u(200));
      await escrow.connect(other).fundGrant(1);

      // Submit + approve only grant 0
      await escrow.connect(grantee).submitMilestone(0, 0, "ipfs://g0");
      await escrow.connect(verifier).approveMilestone(0, 0);

      // Grant 1 milestone should still be Pending
      const m = await escrow.getMilestone(1, 0);
      expect(m.status).to.equal(Status.Pending);

      // Only grant 0's amount was paid out
      const usdcContract = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      expect(await usdcContract.balanceOf(await escrow.getAddress())).to.equal(u(200));
    });

    it("nextGrantId increments independently per grant", async function () {
      const { usdc, escrow, funder, grantee, verifier } =
        await loadFixture(deployFixture);

      for (let i = 0; i < 3; i++) {
        await escrow.connect(funder).createGrant(grantee.address, verifier.address, [u(10)]);
      }

      expect(await escrow.nextGrantId()).to.equal(3);
      const grant2 = await escrow.grants(2);
      expect(grant2.exists).to.equal(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. SECURITY / ATTACK VECTORS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Security", function () {
    it("attacker cannot drain funds by submitting to a grant they are not part of", async function () {
      const { escrow, attacker, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(attacker).submitMilestone(grantId, 0, "ipfs://attack")
      ).to.be.revertedWithCustomError(escrow, "NotGrantee");
    });

    it("attacker cannot approve milestones", async function () {
      const { escrow, grantee, attacker, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(attacker).approveMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("attacker cannot reject milestones", async function () {
      const { escrow, grantee, attacker, grantId } = await loadFixture(fundedGrantFixture);

      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");

      await expect(
        escrow.connect(attacker).rejectMilestone(grantId, 0)
      ).to.be.revertedWithCustomError(escrow, "NotVerifier");
    });

    it("verifier cannot submit evidence (no self-approval path)", async function () {
      const { escrow, verifier, grantId } = await loadFixture(fundedGrantFixture);

      await expect(
        escrow.connect(verifier).submitMilestone(grantId, 0, "ipfs://self")
      ).to.be.revertedWithCustomError(escrow, "NotGrantee");
    });

    it("escrow holds funds until milestone is approved", async function () {
      const { escrow, grantee, grantId, total } = await loadFixture(fundedGrantFixture);

      const usdc = await ethers.getContractAt("MockUSDC", await escrow.usdc());
      const escrowAddress = await escrow.getAddress();

      // After submission — funds still locked
      await escrow.connect(grantee).submitMilestone(grantId, 0, "ipfs://evidence");
      expect(await usdc.balanceOf(escrowAddress)).to.equal(total);

      // Before any approval — grantee balance still zero
      expect(await usdc.balanceOf(grantee.address)).to.equal(0n);
    });
  });
});
