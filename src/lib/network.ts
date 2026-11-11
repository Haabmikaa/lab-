// src/lib/network.ts — University Lab Network & IP Verification
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ConnectionType } from '@prisma/client'

/**
 * Extract real client IP from incoming NextRequest
 */
export function getClientIp(req: NextRequest): string {
  let ip = ''
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    ip = forwarded.split(',')[0].trim()
  } else if (req.headers.get('x-real-ip')) {
    ip = req.headers.get('x-real-ip')!.trim()
  } else if (req.headers.get('cf-connecting-ip')) {
    ip = req.headers.get('cf-connecting-ip')!.trim()
  } else if (req.headers.get('x-client-ip')) {
    ip = req.headers.get('x-client-ip')!.trim()
  } else {
    // Next.js request IP fallback if available
    ip = (req as any).ip ?? '127.0.0.1'
  }

  // Normalize IPv6-mapped IPv4 (e.g., ::ffff:10.240.72.5 -> 10.240.72.5)
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7)
  }

  // Handle localhost IPv6 loopback
  if (ip === '::1') {
    return '127.0.0.1'
  }

  return ip
}

/**
 * Convert an IPv4 string into a 32-bit unsigned integer for range checking
 */
function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return null
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

/**
 * Check if client IP matches a pattern:
 * - Range: "10.240.72.1-10.240.72.225" or "10.240.72.1 to 10.240.72.225"
 * - CIDR: "10.240.72.0/24"
 * - Wildcard: "10.240.72.*"
 * - Exact: "10.240.72.1"
 * - Localhost / loopback: "127.0.0.1", "::1", "localhost"
 */
export function isIpMatch(clientIp: string, pattern: string): boolean {
  let cleanIp = clientIp.trim()
  if (cleanIp.startsWith('::ffff:')) cleanIp = cleanIp.slice(7)
  let p = pattern.trim()
  if (p.startsWith('::ffff:')) p = p.slice(7)

  if (!p) return false
  if (p === '*' || p === cleanIp) return true

  // Localhost aliases
  if ((cleanIp === '::1' || cleanIp === '127.0.0.1') && (p === '127.0.0.1' || p === '::1' || p === 'localhost')) {
    return true
  }

  // Range support: "10.240.72.1-10.240.72.225" or "10.240.72.1 to 10.240.72.225"
  if (p.includes('-') || p.toLowerCase().includes(' to ')) {
    const separator = p.toLowerCase().includes(' to ') ? / to /i : '-'
    const [startStr, endStr] = p.split(separator)
    const start = ipToInt(startStr.trim())
    const end = ipToInt(endStr.trim())
    const client = ipToInt(cleanIp)
    if (start !== null && end !== null && client !== null) {
      return client >= Math.min(start, end) && client <= Math.max(start, end)
    }
  }

  // CIDR notation: "10.240.72.0/24"
  if (p.includes('/')) {
    const [baseStr, maskStr] = p.split('/')
    const base = ipToInt(baseStr.trim())
    const mask = parseInt(maskStr.trim(), 10)
    const client = ipToInt(cleanIp)
    if (base !== null && client !== null && !isNaN(mask) && mask >= 0 && mask <= 32) {
      const maskBits = mask === 0 ? 0 : ((~0 << (32 - mask)) >>> 0)
      return (client & maskBits) === (base & maskBits)
    }
  }

  // Wildcard prefix: "10.240.72.*"
  if (p.endsWith('*')) {
    const prefix = p.slice(0, -1)
    return cleanIp.startsWith(prefix)
  }

  return cleanIp === p
}

/**
 * Check whether a client request is connected through recognized university Ethernet
 */
export async function verifyClientNetwork(
  req: NextRequest,
  tableHasEthernet: boolean
): Promise<{ connectionType: ConnectionType; clientIp: string; isVerifiedEthernet: boolean }> {
  const clientIp = getClientIp(req)

  // If the physical table socket is dead / hotspot-only, it can never be verified Ethernet
  if (!tableHasEthernet) {
    return { connectionType: ConnectionType.UNVERIFIED, clientIp, isVerifiedEthernet: false }
  }

  try {
    const [enabledSetting, trustedIpsSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'ethernet_verification_enabled' } }),
      prisma.systemSetting.findUnique({ where: { key: 'trusted_ethernet_ips' } }),
    ])

    const isEnabled = enabledSetting?.value === 'true'
    if (!isEnabled) {
      // Verification disabled: all requests require hotspot approval
      return { connectionType: ConnectionType.UNVERIFIED, clientIp, isVerifiedEthernet: false }
    }

    const defaultPatterns = '102.213.68.*, 10.240.72.1-10.240.72.225, 10.10.*, 172.24.*, 192.168.*, 127.0.0.1, ::1, localhost'
    const rawSetting = trustedIpsSetting?.value?.trim() || defaultPatterns
    const trustedPatterns = rawSetting
      .split(/[\r\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const isMatch = trustedPatterns.some((pattern) => isIpMatch(clientIp, pattern))

    if (isMatch) {
      return { connectionType: ConnectionType.ETHERNET, clientIp, isVerifiedEthernet: true }
    }

    return { connectionType: ConnectionType.UNVERIFIED, clientIp, isVerifiedEthernet: false }
  } catch (err) {
    console.warn('[network] Verification check failed, defaulting to unverified:', err)
    return { connectionType: ConnectionType.UNVERIFIED, clientIp, isVerifiedEthernet: false }
  }
}

