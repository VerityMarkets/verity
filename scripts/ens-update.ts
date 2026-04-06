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
import { encode } from '@ensdomains/content-hash'

// ENS Registry (immutable address on mainnet)
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' as const

const registryAbi = [
  {
    name: 'resolver',
    type: 'function',
    inputs: [{ name: 'node', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const

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
  const encoded = ('0x' + encode('ipfs', cid)) as `0x${string}`

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

  // Dynamically look up the resolver set for this ENS name
  const resolver = await publicClient.readContract({
    address: ENS_REGISTRY,
    abi: registryAbi,
    functionName: 'resolver',
    args: [node],
  }) as `0x${string}`

  if (!resolver || resolver === '0x0000000000000000000000000000000000000000') {
    console.error(`No resolver set for ${domain}`)
    process.exit(1)
  }

  console.log(`Updating ENS contenthash for ${domain}`)
  console.log(`  Node:        ${node}`)
  console.log(`  Resolver:    ${resolver}`)
  console.log(`  CID:         ${cid}`)
  console.log(`  Contenthash: ${encoded}`)
  console.log(`  Submitting TX...`)

  const txHash = await walletClient.writeContract({
    address: resolver,
    abi: resolverAbi,
    functionName: 'setContenthash',
    args: [node, encoded],
  })

  console.log(`  TX submitted: ${txHash}`)
  console.log(`  https://etherscan.io/tx/${txHash}`)
  console.log(`  Waiting for confirmation (120s timeout)...`)

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  })
  console.log(`  Confirmed in block ${receipt.blockNumber}`)
  console.log(``)
  console.log(`Done! ${domain} now points to ipfs://${cid}`)
  console.log(`  https://${domain}.limo`)
}

main().catch((err) => {
  console.error('ENS update failed:', err.message || err)
  process.exit(1)
})
