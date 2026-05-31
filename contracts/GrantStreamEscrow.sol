// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract GrantStreamEscrow {
    using SafeERC20 for IERC20;

    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Paid,
        Rejected
    }

    struct Milestone {
        uint256 amount;
        string evidenceURI;
        MilestoneStatus status;
    }

    struct Grant {
        address funder;
        address grantee;
        address verifier;
        uint256 totalAmount;
        uint256 paidAmount;
        bool funded;
        bool exists;
    }

    IERC20 public immutable usdc;
    uint256 public nextGrantId;

    mapping(uint256 => Grant) public grants;
    mapping(uint256 => Milestone[]) private grantMilestones;

    event GrantCreated(
        uint256 indexed grantId,
        address indexed funder,
        address indexed grantee,
        address verifier,
        uint256 totalAmount
    );

    event GrantFunded(uint256 indexed grantId, uint256 amount);
    event MilestoneSubmitted(uint256 indexed grantId, uint256 indexed milestoneId, string evidenceURI);
    event MilestoneApproved(uint256 indexed grantId, uint256 indexed milestoneId);
    event MilestoneRejected(uint256 indexed grantId, uint256 indexed milestoneId);
    event MilestonePaid(uint256 indexed grantId, uint256 indexed milestoneId, address indexed grantee, uint256 amount);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidMilestones();
    error GrantNotFound();
    error NotFunder();
    error NotGrantee();
    error NotVerifier();
    error GrantAlreadyFunded();
    error GrantNotFunded();
    error InvalidMilestone();
    error InvalidStatus();
    error EmptyEvidenceURI();

    constructor(address _usdc) {
        if (_usdc == address(0)) revert InvalidAddress();
        usdc = IERC20(_usdc);
    }

    function createGrant(
        address grantee,
        address verifier,
        uint256[] calldata milestoneAmounts
    ) external returns (uint256 grantId) {
        if (grantee == address(0) || verifier == address(0)) revert InvalidAddress();
        if (milestoneAmounts.length == 0) revert InvalidMilestones();

        uint256 totalAmount;

        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            if (milestoneAmounts[i] == 0) revert InvalidAmount();
            totalAmount += milestoneAmounts[i];
        }

        grantId = nextGrantId++;

        grants[grantId] = Grant({
            funder: msg.sender,
            grantee: grantee,
            verifier: verifier,
            totalAmount: totalAmount,
            paidAmount: 0,
            funded: false,
            exists: true
        });

        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            grantMilestones[grantId].push(
                Milestone({
                    amount: milestoneAmounts[i],
                    evidenceURI: "",
                    status: MilestoneStatus.Pending
                })
            );
        }

        emit GrantCreated(grantId, msg.sender, grantee, verifier, totalAmount);
    }

    function fundGrant(uint256 grantId) external {
        Grant storage grant = grants[grantId];

        if (!grant.exists) revert GrantNotFound();
        if (msg.sender != grant.funder) revert NotFunder();
        if (grant.funded) revert GrantAlreadyFunded();

        grant.funded = true;
        usdc.safeTransferFrom(msg.sender, address(this), grant.totalAmount);

        emit GrantFunded(grantId, grant.totalAmount);
    }

    function submitMilestone(
        uint256 grantId,
        uint256 milestoneId,
        string calldata evidenceURI
    ) external {
        Grant storage grant = grants[grantId];

        if (!grant.exists) revert GrantNotFound();
        if (!grant.funded) revert GrantNotFunded();
        if (msg.sender != grant.grantee) revert NotGrantee();
        if (bytes(evidenceURI).length == 0) revert EmptyEvidenceURI();
        if (milestoneId >= grantMilestones[grantId].length) revert InvalidMilestone();

        Milestone storage milestone = grantMilestones[grantId][milestoneId];

        if (
            milestone.status != MilestoneStatus.Pending &&
            milestone.status != MilestoneStatus.Rejected
        ) revert InvalidStatus();

        milestone.evidenceURI = evidenceURI;
        milestone.status = MilestoneStatus.Submitted;

        emit MilestoneSubmitted(grantId, milestoneId, evidenceURI);
    }

    function approveMilestone(uint256 grantId, uint256 milestoneId) external {
        Grant storage grant = grants[grantId];

        if (!grant.exists) revert GrantNotFound();
        if (msg.sender != grant.verifier) revert NotVerifier();
        if (milestoneId >= grantMilestones[grantId].length) revert InvalidMilestone();

        Milestone storage milestone = grantMilestones[grantId][milestoneId];

        if (milestone.status != MilestoneStatus.Submitted) revert InvalidStatus();

        milestone.status = MilestoneStatus.Approved;

        emit MilestoneApproved(grantId, milestoneId);

        _releaseMilestone(grantId, milestoneId);
    }

    function rejectMilestone(uint256 grantId, uint256 milestoneId) external {
        Grant storage grant = grants[grantId];

        if (!grant.exists) revert GrantNotFound();
        if (msg.sender != grant.verifier) revert NotVerifier();
        if (milestoneId >= grantMilestones[grantId].length) revert InvalidMilestone();

        Milestone storage milestone = grantMilestones[grantId][milestoneId];

        if (milestone.status != MilestoneStatus.Submitted) revert InvalidStatus();

        milestone.status = MilestoneStatus.Rejected;

        emit MilestoneRejected(grantId, milestoneId);
    }

    function getMilestone(
        uint256 grantId,
        uint256 milestoneId
    ) external view returns (Milestone memory) {
        if (!grants[grantId].exists) revert GrantNotFound();
        if (milestoneId >= grantMilestones[grantId].length) revert InvalidMilestone();

        return grantMilestones[grantId][milestoneId];
    }

    function getMilestoneCount(uint256 grantId) external view returns (uint256) {
        if (!grants[grantId].exists) revert GrantNotFound();
        return grantMilestones[grantId].length;
    }

    function _releaseMilestone(uint256 grantId, uint256 milestoneId) internal {
        Grant storage grant = grants[grantId];
        Milestone storage milestone = grantMilestones[grantId][milestoneId];

        if (milestone.status != MilestoneStatus.Approved) revert InvalidStatus();

        milestone.status = MilestoneStatus.Paid;
        grant.paidAmount += milestone.amount;

        usdc.safeTransfer(grant.grantee, milestone.amount);

        emit MilestonePaid(grantId, milestoneId, grant.grantee, milestone.amount);
    }
}
