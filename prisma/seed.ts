// Prisma seed — creates 25 tables + initial admin account
// Run: npx prisma db seed

import { PrismaClient, TableType, TableStatus, Role, AccountStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // ── 1. Tables ────────────────────────────────────────────────────────────────
  const tables = [
    // Regular student tables T01–T22
    ...Array.from({ length: 22 }, (_, i) => {
      const num = String(i + 1).padStart(2, '0')
      return {
        tableCode: `T${num}`,
        tableType: TableType.REGULAR,
        name: `Table ${num}`,
        description: i < 11 ? 'Working Ethernet socket' : 'Ethernet socket — check availability',
        status: TableStatus.AVAILABLE,
        hasEthernet: i < 11, // First 11 have confirmed working Ethernet (configurable)
        sortOrder: i + 1,
        isActive: true,
      }
    }),
    // Reserved representative tables T23–T25
    {
      tableCode: 'T23',
      tableType: TableType.RESERVED,
      name: 'Representative Table A',
      description: 'Reserved for laboratory representatives',
      status: TableStatus.RESERVED,
      hasEthernet: true,
      sortOrder: 23,
      isActive: true,
    },
    {
      tableCode: 'T24',
      tableType: TableType.RESERVED,
      name: 'Representative Table B',
      description: 'Reserved for laboratory representatives',
      status: TableStatus.RESERVED,
      hasEthernet: true,
      sortOrder: 24,
      isActive: true,
    },
    {
      tableCode: 'T25',
      tableType: TableType.RESERVED,
      name: 'Representative Table C',
      description: 'Reserved for laboratory representatives',
      status: TableStatus.RESERVED,
      hasEthernet: true,
      sortOrder: 25,
      isActive: true,
    },
  ]

  for (const table of tables) {
    await prisma.labTable.upsert({
      where: { tableCode: table.tableCode },
      update: {},
      create: table,
    })
  }
  console.log(`✅ ${tables.length} tables seeded`)

  // ── 2. Default system settings ────────────────────────────────────────────────
  const settings = [
    {
      key: 'session_max_duration_hours',
      value: '8',
      description: 'Maximum occupancy session duration in hours',
    },
    {
      key: 'session_inactivity_timeout_minutes',
      value: '120',
      description: 'Auto-release table after this many minutes of inactivity',
    },
    {
      key: 'session_grace_period_minutes',
      value: '15',
      description: 'Grace period after network disconnect before auto-release',
    },
    {
      key: 'approval_expiry_minutes',
      value: '30',
      description: 'Minutes before an approved-but-not-activated request expires',
    },
    {
      key: 'pending_request_expiry_hours',
      value: '2',
      description: 'Hours before a pending request auto-expires without admin action',
    },
    {
      key: 'max_login_attempts',
      value: '5',
      description: 'Maximum failed login attempts before temporary lockout',
    },
    {
      key: 'login_lockout_minutes',
      value: '15',
      description: 'Lockout duration in minutes after max failed login attempts',
    },
    {
      key: 'lab_name',
      value: 'University Computer Laboratory',
      description: 'Display name of the laboratory',
    },
    {
      key: 'lab_location',
      value: 'Building A, Room 101',
      description: 'Physical location of the laboratory',
    },
    {
      key: 'ethernet_verification_enabled',
      value: 'true',
      description: 'Whether university IT Ethernet verification is integrated',
    },
    {
      key: 'trusted_ethernet_ips',
      value: '10.240.72.1-10.240.72.225, 127.0.0.1, ::1, localhost',
      description: 'Lab Ethernet verified IP range (10.240.72.1 to 10.240.72.225)',
    },
  ]

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }
  console.log(`✅ ${settings.length} system settings seeded`)

  // ── 3. Initial admin account ──────────────────────────────────────────────────
  // IMPORTANT: Change this password immediately after first login!
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@university.edu'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'
  const adminName = process.env.SEED_ADMIN_NAME ?? 'System Administrator'

  const passwordHash = await bcrypt.hash(adminPassword, 12)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: Role.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  })
  console.log(`✅ Admin account seeded: ${admin.email}`)
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn('⚠️  Using default admin password. Set SEED_ADMIN_PASSWORD env var and re-seed, or change via the UI immediately.')
  }

  console.log('🎉 Seed complete.')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

