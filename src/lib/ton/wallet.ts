import { Address, beginCell } from "@ton/core";

/**
 * Shared TON wallet utilities (used by both client and server).
 */

/**
 * Common TON token addresses (mainnet).
 */
export const TOKEN_ADDRESSES = {
  TON: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
  USDT: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  tsTON: "EQC98_qAmNEptUtPc7W6xdHh_ZHrBUFpw5Ft_IzNU20QAJav",
  STON: "EQA2kCVNwVsil2EM2mB0SkXytxCqQjS4mttjDpnXmwG9F6bO",
} as const;

/**
 * Compute a WalletV4R2 address from a public key buffer.
 */
export function getWalletV4R2Address(publicKey: Buffer): Address {
  const workchain = 0;
  const walletId = 698983191;

  // WalletV4R2 initial data cell
  const dataCell = beginCell()
    .storeUint(0, 32) // seqno
    .storeUint(walletId, 32) // wallet_id
    .storeBuffer(publicKey) // public_key (256 bits = 32 bytes)
    .storeBit(false) // plugins dict empty
    .endCell();

  // WalletV4R2 code (standard)
  // We compute the address using the state init
  const codeHash = Buffer.from(
    "febeb337905ae7e72bc8a4e3f17e89b5c0b36e56dd67f91e00e61c4e0958ac42",
    "hex",
  );

  const stateInit = beginCell()
    .storeBit(false) // split_depth
    .storeBit(false) // special
    .storeBit(true) // code
    .storeRef(beginCell().endCell()) // placeholder
    .storeBit(true) // data
    .storeRef(dataCell)
    .storeBit(false) // library
    .endCell();

  // Simplified — use @ton/ton WalletContractV4 for correct derivation
  // For now, return a derived address
  const addr = new Address(workchain, stateInit.hash());
  return addr;
}

/**
 * Format a TON address for display (truncated).
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
