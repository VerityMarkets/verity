/**
 * Upload dist/ directory to Pinata IPFS using the official SDK.
 *
 * Usage: node scripts/pinata-upload.mjs
 * Env:   PINATA_JWT (required), PIN_NAME (optional)
 *
 * Outputs the CID to stdout (last line).
 */

import { PinataSDK } from 'pinata'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const PINATA_JWT = process.env.PINATA_JWT
const PIN_NAME = process.env.PIN_NAME || 'verity'
const DIST_DIR = join(process.cwd(), 'dist')

if (!PINATA_JWT) {
  console.error('PINATA_JWT env var is required')
  process.exit(1)
}

/** Recursively collect all files in a directory */
async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)))
    } else {
      files.push(full)
    }
  }
  return files
}

async function main() {
  const pinata = new PinataSDK({ pinataJwt: PINATA_JWT })
  const filePaths = await collectFiles(DIST_DIR)
  const files = await Promise.all(
    filePaths.map(async (fp) => {
      const rel = relative(DIST_DIR, fp)
      const content = await readFile(fp)
      return new File([content], rel)
    })
  )
  const result = await pinata.upload.public
    .fileArray(files)
    .name(PIN_NAME)
  console.log(result.cid)
}

main().catch((err) => {
  console.error('Upload failed:', err)
  process.exit(1)
})
