/**
 * Web Crypto helpers for encrypting/decrypting sync provider credentials.
 *
 * Flow:
 *  encryptSyncConfig(config, passphrase)
 *    → derives AES-GCM key via PBKDF2
 *    → encrypts JSON(config)
 *    → caches raw key in sessionStorage (survives page reload, not tab close)
 *    → returns EncryptedSyncConfig blob for IndexedDB
 *
 *  decryptSyncConfig(blob, passphrase)   — re-derives key from passphrase
 *  decryptWithSessionKey(blob)           — uses cached sessionStorage key (no passphrase needed)
 *  reEncryptWithSessionKey(config, blob) — re-encrypt updated config without passphrase
 */

import type { SyncConfig, EncryptedSyncConfig } from './types'

const SESSION_KEY_NAME = 'rss-sync-key'
const PBKDF2_ITERATIONS = 200_000

// ── Base64 helpers ────────────────────────────────────────────────────────────

function b64Encode(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function b64Decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
}

// ── Key derivation ────────────────────────────────────────────────────────────

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can cache raw bytes in sessionStorage
    ['encrypt', 'decrypt'],
  )
}

async function cacheKey(key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey('raw', key)
  sessionStorage.setItem(SESSION_KEY_NAME, b64Encode(raw))
}

async function restoreKey(): Promise<CryptoKey | null> {
  const cached = sessionStorage.getItem(SESSION_KEY_NAME)
  if (!cached) return null
  try {
    const raw = b64Decode(cached)
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ])
  } catch {
    return null
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a SyncConfig with a user passphrase.
 * If passphrase is empty, the config is stored as plain JSON (no encryption).
 * Also caches the derived key in sessionStorage for the current session.
 */
export async function encryptSyncConfig(
  config: SyncConfig,
  passphrase: string,
): Promise<EncryptedSyncConfig> {
  const base: Pick<EncryptedSyncConfig, 'provider' | 'gistId'> = {
    provider: config.type,
    ...(config.type === 'github-gist' && config.gistId ? { gistId: config.gistId } : {}),
  }

  if (passphrase === '') {
    return { ...base, isEncrypted: false, encrypted: JSON.stringify(config), salt: '', iv: '' }
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(config)),
  )
  await cacheKey(key)
  return {
    ...base,
    isEncrypted: true,
    encrypted: b64Encode(ciphertext),
    salt: b64Encode(salt.buffer as ArrayBuffer),
    iv: b64Encode(iv.buffer as ArrayBuffer),
  }
}

/**
 * Decrypt using an explicitly provided passphrase.
 * If the blob is not encrypted, the passphrase is ignored.
 * Also caches the derived key in sessionStorage.
 */
export async function decryptSyncConfig(
  blob: EncryptedSyncConfig,
  passphrase: string,
): Promise<SyncConfig> {
  if (blob.isEncrypted === false || (blob.salt === '' && blob.iv === '')) {
    return _parsePlaintext(blob)
  }
  const salt = b64Decode(blob.salt)
  const iv = b64Decode(blob.iv)
  const key = await deriveKey(passphrase, salt)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    b64Decode(blob.encrypted),
  )
  await cacheKey(key)
  return _mergeGistId(JSON.parse(new TextDecoder().decode(plain)) as SyncConfig, blob)
}

/**
 * Attempt decryption using the session-cached key (no passphrase needed).
 * For unencrypted blobs, always succeeds immediately.
 * Returns null if no key is cached or decryption fails.
 */
export async function decryptWithSessionKey(
  blob: EncryptedSyncConfig,
): Promise<SyncConfig | null> {
  if (blob.isEncrypted === false || (blob.salt === '' && blob.iv === '')) {
    return _parsePlaintext(blob)
  }
  const key = await restoreKey()
  if (!key) return null
  try {
    const iv = b64Decode(blob.iv)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      b64Decode(blob.encrypted),
    )
    return _mergeGistId(JSON.parse(new TextDecoder().decode(plain)) as SyncConfig, blob)
  } catch {
    return null
  }
}

/**
 * Re-encrypt an updated SyncConfig using the session-cached key
 * (e.g. after a gistId is returned from the first upload).
 * For unencrypted blobs, updates the plaintext in-place.
 * Returns null if encrypted and no session key is cached.
 */
export async function reEncryptWithSessionKey(
  config: SyncConfig,
  existing: EncryptedSyncConfig,
): Promise<EncryptedSyncConfig | null> {
  if (existing.isEncrypted === false || (existing.salt === '' && existing.iv === '')) {
    return {
      ...existing,
      encrypted: JSON.stringify(config),
      ...(config.type === 'github-gist' && config.gistId ? { gistId: config.gistId } : {}),
    }
  }
  const key = await restoreKey()
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(config)),
  )
  return {
    ...existing,
    encrypted: b64Encode(ciphertext),
    iv: b64Encode(iv.buffer as ArrayBuffer),
    ...(config.type === 'github-gist' && config.gistId ? { gistId: config.gistId } : {}),
  }
}

export function hasSessionKey(): boolean {
  return sessionStorage.getItem(SESSION_KEY_NAME) !== null
}

export function clearSessionKey(): void {
  sessionStorage.removeItem(SESSION_KEY_NAME)
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _parsePlaintext(blob: EncryptedSyncConfig): SyncConfig {
  return _mergeGistId(JSON.parse(blob.encrypted) as SyncConfig, blob)
}

function _mergeGistId(config: SyncConfig, blob: EncryptedSyncConfig): SyncConfig {
  if (config.type === 'github-gist' && blob.gistId && !config.gistId) {
    return { ...config, gistId: blob.gistId }
  }
  return config
}
