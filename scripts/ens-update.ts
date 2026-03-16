/**
 * ENS Contenthash Updater
 *
 * Updates an ENS domain's contenthash to point to an IPFS CID.
 * Skips gracefully when ENS_DOMAIN is not set (no domain yet).
 *
 * Usage:
 *   npx tsx scripts/ens-update.ts <IPFS_CID>
 *
 * Required env vars:
 *   ENS_DOMAIN     - e.g. "verity.eth" (skip if unset)
 *   PRIVATE_KEY    - deployer wallet private key
 *   RPC_URL        - Ethereum mainnet RPC (optional, defaults to public)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  namehash,
  toHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

// ENS PublicResolver ABI (only setContenthash)
const resolverAbi = [
  {
    name: 'setContenthash',
    type: 'function',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'hash', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

/**
 * Encode an IPFS CIDv0 (Qm...) to ENS contenthash bytes.
 * Format: 0xe3 (IPFS namespace) + 0x01 (CIDv1) + 0x70 (dag-pb) + multihash
 *
 * For production with CIDv1/base32, consider the `content-hash` npm package.
 */
function encodeIpfsContenthash(cidV0: string): `0x${string}` {
  // Decode base58btc CIDv0 to raw bytes
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let num = 0n
  for (const char of cidV0) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`)
    num = num * 58n + BigInt(idx)
  }

  // Convert bigint to bytes
  const hex = num.toString(16).padStart(2, '0')
  const rawBytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < rawBytes.length; i++) {
    rawBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  // Preserve leading zero bytes (base58 leading 1s)
  let leadingZeros = 0
  for (const c of cidV0) {
    if (c === '1') leadingZeros++
    else break
  }

  const decoded = new Uint8Array(leadingZeros + rawBytes.length)
  decoded.set(rawBytes, leadingZeros)

  // ENS contenthash: 0xe3 (ipfs ns) + 0x01 (cidv1) + 0x70 (dag-pb) + multihash
  const prefix = new Uint8Array([0xe3, 0x01, 0x01, 0x70])
  const contenthash = new Uint8Array(prefix.length + decoded.length)
  contenthash.set(prefix)
  contenthash.set(decoded, prefix.length)

  return toHex(contenthash)
}

async function main() {
  const cid = process.argv[2]
  const domain = process.env.ENS_DOMAIN
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
  const rpcUrl = process.env.RPC_URL

  // Graceful skip if no domain configured
  if (!domain) {
    console.log('ENS_DOMAIN not set — skipping ENS update.')
    console.log('Set ENS_DOMAIN when a domain is acquired.')
    process.exit(0)
  }

  if (!cid) {
    console.error('Usage: npx tsx scripts/ens-update.ts <IPFS_CID>')
    process.exit(1)
  }

  if (!privateKey) {
    console.error('PRIVATE_KEY env var is required.')
    process.exit(1)
  }

  const transport = http(rpcUrl)
  const account = privateKeyToAccount(privateKey)

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport,
  })

  const publicClient = createPublicClient({
    chain: mainnet,
    transport,
  })

  const node = namehash(domain)
  const contenthash = encodeIpfsContenthash(cid)

  // ENS PublicResolver address (mainnet)
  const RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as const

  console.log(`Updating ENS contenthash for ${domain}`)
  console.log(`  Node:        ${node}`)
  console.log(`  CID:         ${cid}`)
  console.log(`  Contenthash: ${contenthash}`)

  const txHash = await walletClient.writeContract({
    address: RESOLVER,
    abi: resolverAbi,
    functionName: 'setContenthash',
    args: [node, contenthash],
  })

  console.log(`  TX submitted: ${txHash}`)
  console.log(`  Waiting for confirmation...`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`  Confirmed in block ${receipt.blockNumber}`)
  console.log(``)
  console.log(`Done! ${domain} now points to ipfs://${cid}`)
  console.log(`  https://${domain}.limo`)
}

main().catch((err) => {
  console.error('ENS update failed:', err.message || err)
  process.exit(1)
})
