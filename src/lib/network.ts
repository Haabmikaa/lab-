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
 * Check if client IP matches a pattern (supports wildcards e.g. 10.10.* or 192.168.1.* or exact match)
 */
export function isIpMatch(clientIp: string, pattern: string): boolean {
  const p = pattern.trim()
  if (!p) return false
  if (p === '*' || p === clientIp) return true

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
