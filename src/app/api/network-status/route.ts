// app/api/network-status/route.ts — Returns client's current IP and lab network verification status
import { NextRequest, NextResponse } from 'next/server'
import { verifyClientNetwork, getClientIp } from '@/lib/network'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req)

  try {
    const [enabledSetting, trustedIpsSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'ethernet_verification_enabled' } }),
      prisma.systemSetting.findUnique({ where: { key: 'trusted_ethernet_ips' } }),
    ])

    const verification = await verifyClientNetwork(req, true)

    return NextResponse.json({
      clientIp,
      isVerifiedEthernet: verification.isVerifiedEthernet,
      verificationEnabled: enabledSetting?.value === 'true',
      trustedPatterns: trustedIpsSetting?.value || '10.240.72.1-10.240.72.225, 10.240.72.*, 196.189.233.*, 196.189.*.*, 102.213.68.*, 102.213.*.*, 10.10.*, 172.24.*, 192.168.*, 127.0.0.1, ::1, localhost',
    })
  } catch (err) {
    return NextResponse.json({
      clientIp,
      isVerifiedEthernet: false,
      verificationEnabled: false,
      trustedPatterns: '',
    })
  }
}

