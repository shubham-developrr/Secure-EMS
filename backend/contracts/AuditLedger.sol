// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuditLedger
 * @dev Decentralized, immutable anchor ledger for Secure-EMS exam question papers & audit logs.
 */
contract AuditLedger {
    address public owner;

    struct LogRecord {
        bytes32 payloadHash;
        uint256 timestamp;
        address anchoredBy;
        bool exists;
    }

    // Mapping logId / paperId -> LogRecord
    mapping(string => LogRecord) private _ledger;

    event LogAnchored(string indexed id, bytes32 indexed hash, uint256 timestamp, address indexed anchorer);

    modifier onlyOwner() {
        require(msg.sender == owner, "AuditLedger: caller is not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Anchor a paper or audit log payload SHA-256 hash on-chain.
     */
    function anchorLog(string memory logId, bytes32 payloadHash) external {
        require(!_ledger[logId].exists, "AuditLedger: Record already anchored");
        
        _ledger[logId] = LogRecord({
            payloadHash: payloadHash,
            timestamp: block.timestamp,
            anchoredBy: msg.sender,
            exists: true
        });

        emit LogAnchored(logId, payloadHash, block.timestamp, msg.sender);
    }

    /**
     * @dev Verify if a given payload hash matches the immutable on-chain anchor.
     */
    function verifyLog(string memory logId, bytes32 payloadHash) external view returns (bool isMatch, uint256 timestamp, address anchorer) {
        require(_ledger[logId].exists, "AuditLedger: Record not found");
        LogRecord memory record = _ledger[logId];
        return (record.payloadHash == payloadHash, record.timestamp, record.anchoredBy);
    }

    /**
     * @dev Check if a record exists.
     */
    function hasRecord(string memory logId) external view returns (bool) {
        return _ledger[logId].exists;
    }
}
