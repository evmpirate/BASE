// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @dev Minimal Soulbound Token interface, ERC-5192.
interface IERC5192 {
    /// @notice Emitted when the locking status is changed to locked.
    event Locked(uint256 tokenId);
    /// @notice Emitted when the locking status is changed to unlocked.
    event Unlocked(uint256 tokenId);
    /// @notice Returns the locking status of a token; reverts for nonexistent ids.
    function locked(uint256 tokenId) external view returns (bool);
}

/// @title TrailBadges V2 — soulbound achievement badges claimed by voucher
/// @notice V2 flips the mint model of OnchainTrailBadges: instead of the
///         collection owner paying gas to push badges at wallets, the agent
///         signs an off-chain EIP-712 voucher and the RECIPIENT redeems it
///         on-chain, paying their own gas. Badges are soulbound (ERC-5192):
///         mint and burn are possible, wallet-to-wallet transfers are not —
///         an achievement is not a tradable asset.
contract TrailBadgesV2 is ERC721, Ownable, EIP712, IERC5192 {
    using Strings for uint256;

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("BadgeVoucher(address to,string name,uint256 nonce,uint256 deadline)");

    /// @notice Address whose EIP-712 signature makes a voucher redeemable
    ///         (the TrailKeeper agent's operational key, rotatable by owner).
    address public voucherSigner;

    /// @notice The id that will be assigned to the next claimed badge.
    uint256 public nextTokenId = 1;

    /// @notice Human-readable achievement name for each badge, set at claim.
    mapping(uint256 tokenId => string) public badgeName;

    /// @notice Voucher nonces already redeemed — replay protection.
    mapping(uint256 nonce => bool) public nonceUsed;

    error TransferLocked();
    error VoucherExpired(uint256 deadline);
    error NonceAlreadyUsed(uint256 nonce);
    error InvalidVoucherSigner(address recovered);

    event VoucherSignerChanged(address indexed signer);
    event BadgeClaimed(uint256 indexed tokenId, address indexed to, string name, uint256 nonce);

    constructor(address voucherSigner_)
        ERC721("OnchainTrail Badges V2", "TRAIL2")
        Ownable(msg.sender)
        EIP712("TrailBadgesV2", "2")
    {
        voucherSigner = voucherSigner_;
        emit VoucherSignerChanged(voucherSigner_);
    }

    /// @notice Rotate the voucher-signing key. Outstanding vouchers signed by
    ///         the previous key stop being redeemable immediately.
    function setVoucherSigner(address voucherSigner_) external onlyOwner {
        voucherSigner = voucherSigner_;
        emit VoucherSignerChanged(voucherSigner_);
    }

    /// @notice Redeem a voucher signed by `voucherSigner`. Anyone may submit
    ///         the transaction, but the badge always lands at the voucher's
    ///         `to` — a relayed claim changes who pays gas, not who earns.
    function claim(address to, string calldata name_, uint256 nonce, uint256 deadline, bytes calldata signature)
        external
        returns (uint256 tokenId)
    {
        if (block.timestamp > deadline) revert VoucherExpired(deadline);
        if (nonceUsed[nonce]) revert NonceAlreadyUsed(nonce);

        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, to, keccak256(bytes(name_)), nonce, deadline)));
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != voucherSigner) revert InvalidVoucherSigner(recovered);

        nonceUsed[nonce] = true;
        tokenId = nextTokenId++;
        badgeName[tokenId] = name_;
        _safeMint(to, tokenId);
        emit BadgeClaimed(tokenId, to, name_, nonce);
        emit Locked(tokenId);
    }

    /// @inheritdoc IERC5192
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    /// @dev Soulbound enforcement: allow mint (from == 0) and burn (to == 0),
    ///      revert wallet-to-wallet transfers regardless of approval state.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert TransferLocked();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || super.supportsInterface(interfaceId);
    }

    /// @notice Returns a data: URI with JSON metadata and embedded SVG image,
    ///         same fully-on-chain scheme as V1 plus soulbound/claim traits.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory name_ = badgeName[tokenId];

        string memory json = string.concat(
            '{"name":"OnchainTrail Badge #',
            tokenId.toString(),
            ": ",
            name_,
            '","description":"Soulbound achievement badge, claimed by its earner via an EIP-712 voucher.",',
            '"attributes":[{"trait_type":"Achievement","value":"',
            name_,
            '"},{"trait_type":"Soulbound","value":"true"},{"trait_type":"Version","value":"2"}],',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(tokenId, name_))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Badge art: dark rounded card with an emerald ring (V1 is blue) so
    ///      claimed badges read differently at a glance.
    function _svg(uint256 tokenId, string memory name_) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" rx="24" fill="#0a0a0a"/>',
            '<circle cx="200" cy="160" r="72" fill="none" stroke="#10b981" stroke-width="10"/>',
            '<text x="200" y="172" text-anchor="middle" font-family="monospace" font-size="40" fill="#10b981">#',
            tokenId.toString(),
            "</text>",
            '<text x="200" y="290" text-anchor="middle" font-family="monospace" font-size="22" fill="#e5e5e5">',
            name_,
            "</text>",
            '<text x="200" y="330" text-anchor="middle" font-family="monospace" font-size="14" fill="#525252">OnchainTrail \xc2\xb7 soulbound</text>',
            "</svg>"
        );
    }
}
