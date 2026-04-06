/**
 * ENS Contenthash Updater
 *
 * Updates an ENS domain's contenthash to point to an IPFS CID.
 * Supports both CIDv0 (Qm...) and CIDv1 (bafy...).
 * Skips gracefully when ENS_DOMAIN is not set.
 *
 * Usage:
 *   npx tsx scripts/ens-update.ts <IPFS_CID>
 *
 * Required env vars:
 *   ENS_DOMAIN     - e.g. "verity.eth"
 *   PRIVATE_KEY    - deployer wallet private key
 *   RPC_URL        - Ethereum mainnet RPC (optional, defaults to public)
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  namehash,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import contentHash from 'content-hash'

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

async function main() {
  const cid = process.argv[2]
  const domain = process.env.ENS_DOMAIN
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
  const rpcUrl = process.env.RPC_URL

  // Graceful skip if no domain configured
  if (!domain) {
    console.log('ENS_DOMAIN not set — skipping ENS update.')
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

  // Encode CID to ENS contenthash bytes (handles CIDv0 and CIDv1)
  const encoded = '0x' + contentHash.fromIpfs(cid) as `0x${string}`

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

  // ENS PublicResolver address (mainnet)
  const RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as const

  console.log(`Updating ENS contenthash for ${domain}`)
  console.log(`  Node:        ${node}`)
  console.log(`  CID:         ${cid}`)
  console.log(`  Contenthash: ${encoded}`)

  const txHash = await walletClient.writeContract({
    address: RESOLVER,
    abi: resolverAbi,
    functionName: 'setContenthash',
    args: [node, encoded],
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
