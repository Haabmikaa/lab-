// src/lib/network.ts — University Lab Network & IP Verification
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ConnectionType } from '@prisma/client'

/**
 * Extract real client IP from incoming NextRequest
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
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
  const p = pattern.trim()
  if (!p) return false
  if (p === '*' || p === clientIp) return true

  // Localhost aliases
  if ((clientIp === '::1' || clientIp === '127.0.0.1') && (p === '127.0.0.1' || p === '::1' || p === 'localhost')) {
    return true
  }

  // Range support: "10.240.72.1-10.240.72.225" or "10.240.72.1 to 10.240.72.225"
  if (p.includes('-') || p.toLowerCase().includes(' to ')) {
    const separator = p.toLowerCase().includes(' to ') ? / to /i : '-'
    const [startStr, endStr] = p.split(separator)
    const start = ipToInt(startStr.trim())
    const end = ipToInt(endStr.trim())
    const client = ipToInt(clientIp)
    if (start !== null && end !== null && client !== null) {
      return client >= Math.min(start, end) && client <= Math.max(start, end)
    }
  }

  // CIDR notation: "10.240.72.0/24"
  if (p.includes('/')) {
    const [baseStr, maskStr] = p.split('/')
    const base = ipToInt(baseStr.trim())
    const mask = parseInt(maskStr.trim(), 10)
    const client = ipToInt(clientIp)
    if (base !== null && client !== null && !isNaN(mask) && mask >= 0 && mask <= 32) {
      const maskBits = mask === 0 ? 0 : ((~0 << (32 - mask)) >>> 0)
      return (client & maskBits) === (base & maskBits)
    }
  }

  // Wildcard prefix: "10.240.72.*"
  if (p.endsWith('*')) {
    const prefix = p.slice(0, -1)
    return clientIp.startsWith(prefix)
  }

  return clientIp === p
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

    const defaultPatterns = '10.10.*, 192.168.*, 127.0.0.1, ::1, localhost'
    const trustedPatterns = (trustedIpsSetting?.value || defaultPatterns)
      .split(',')
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

