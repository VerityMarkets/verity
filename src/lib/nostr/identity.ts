import { sha256 } from '@noble/hashes/sha2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { schnorr } from '@noble/curves/secp256k1.js'

const SIGN_MESSAGE = 'Sign to generate your Verity chat identity'
const HKDF_SALT = 'verity-nostr-identity'
const STORAGE_PREFIX = 'verity-chat-sig:'

function deriveFromSignature(signature: string): { privkey: Uint8Array; pubkey: string } {
  const sigBytes = hexToBytes(signature.startsWith('0x') ? signature.slice(2) : signature)
  const seed = sha256(sigBytes)
  const salt = new TextEncoder().encode(HKDF_SALT)
  const info = new TextEncoder().encode('nostr-privkey')
  const privkeyBytes = hkdf(sha256, seed, salt, info, 32)
  const pubkey = bytesToHex(schnorr.getPublicKey(privkeyBytes))
  return { privkey: privkeyBytes, pubkey }
}

/**
 * Try to restore a Nostr keypair from a cached signature in localStorage.
 * Returns null if no cached signature exists for this address.
 */
export function restoreNostrKeypair(address: string): { privkey: Uint8Array; pubkey: string } | null {
  const sig = localStorage.getItem(STORAGE_PREFIX + address.toLowerCase())
  if (!sig) return null
  try {
    return deriveFromSignature(sig)
  } catch {
    localStorage.removeItem(STORAGE_PREFIX + address.toLowerCase())
    return null
  }
}

/**
 * Derive a Nostr keypair from an EVM wallet signature.
 * NIP-111 pattern: sign a deterministic message, hash it, derive via HKDF.
 * Caches the signature in localStorage for future sessions.
 */
export async function deriveNostrKeypair(
  signMessage: (message: string) => Promise<string>,
  address: string
): Promise<{ privkey: Uint8Array; pubkey: string }> {
  const signature = await signMessage(SIGN_MESSAGE)
  localStorage.setItem(STORAGE_PREFIX + address.toLowerCase(), signature)
  return deriveFromSignature(signature)
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
