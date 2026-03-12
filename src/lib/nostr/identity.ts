import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { schnorr } from '@noble/curves/secp256k1.js'

const SIGN_MESSAGE = 'Sign to generate your Verity chat identity'
const HKDF_SALT = 'verity-nostr-identity'

/**
 * Derive a Nostr keypair from an EVM wallet signature.
 * NIP-111 pattern: sign a deterministic message, hash it, derive via HKDF.
 */
export async function deriveNostrKeypair(
  signMessage: (message: string) => Promise<string>
): Promise<{ privkey: Uint8Array; pubkey: string }> {
  // 1. Sign the deterministic message with EVM wallet
  const signature = await signMessage(SIGN_MESSAGE)

  // 2. Hash the signature to get seed material
  const sigBytes = hexToBytes(signature.startsWith('0x') ? signature.slice(2) : signature)
  const seed = sha256(sigBytes)

  // 3. Derive 32 bytes via HKDF
  const salt = new TextEncoder().encode(HKDF_SALT)
  const info = new TextEncoder().encode('nostr-privkey')
  const privkeyBytes = hkdf(sha256, seed, salt, info, 32)

  // 4. Get the public key (x-only for Nostr/Schnorr)
  const pubkey = bytesToHex(schnorr.getPublicKey(privkeyBytes))

  return { privkey: privkeyBytes, pubkey }
}

/**
 * Sign a Nostr event using the derived private key.
 */
export function signNostrEvent(
  event: {
    pubkey: string
    created_at: number
    kind: number
    tags: string[][]
    content: string
  },
  privkey: Uint8Array
): { id: string; sig: string } {
  // Serialize event for hashing (NIP-01)
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])

  const hash = sha256(new TextEncoder().encode(serialized))
  const id = bytesToHex(hash)
  const sig = bytesToHex(schnorr.sign(hash, privkey))

  return { id, sig }
}
