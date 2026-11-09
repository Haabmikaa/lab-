// lib/auth.ts — NextAuth v5 / Auth.js configuration
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { AccountStatus, Role } from '@prisma/client'
import { auditLog } from '@/lib/audit'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'university-computer-lab-occupancy-management-system-secret-32-chars',
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        try {
          const user = await prisma.user.findUnique({ where: { email } })
          if (!user || !user.passwordHash) return null

          // Account status checks
          if (user.accountStatus === AccountStatus.PENDING_VERIFICATION) {
            return null
          }
          if (user.accountStatus === AccountStatus.DISABLED) {
            return null
          }

          const passwordValid = await bcrypt.compare(password, user.passwordHash)
          if (!passwordValid) {
            await auditLog({
              actorUserId: user.id,
              action: 'AUTH_FAILED',
              metadata: { reason: 'invalid_password', email },
            })
            return null
          }

          if (!user.emailVerifiedAt) {
            return null
          }

          await auditLog({
            actorUserId: user.id,
            action: 'AUTH_LOGIN',
            metadata: { email },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            accountStatus: user.accountStatus,
          }
        } catch (err) {
          console.error('[auth] Database authentication error:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: Role }).role
        token.accountStatus = (user as { accountStatus: AccountStatus }).accountStatus
      }

      // Only refresh from database in Node.js runtime (avoids crashing Next.js Edge Middleware)
      if (token.id && process.env.NEXT_RUNTIME === 'nodejs') {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, accountStatus: true },
          })
          if (!dbUser || dbUser.accountStatus === AccountStatus.DISABLED) {
            return { ...token, error: 'AccountDisabled' }
          }
          token.role = dbUser.role
          token.accountStatus = dbUser.accountStatus
        } catch {
          // Keep token properties if temporary DB network glitch
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token.error === 'AccountDisabled') {
        return { ...session, error: 'AccountDisabled' }
      }
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
        session.user.accountStatus = token.accountStatus as AccountStatus
      }
      return session
    },
  },
  events: {
    async signOut(message) {
      const token = 'token' in message ? message.token : undefined
      if (token && typeof token === 'object' && 'id' in token && token.id) {
        await auditLog({
          actorUserId: token.id as string,
          action: 'AUTH_LOGOUT',
        })
      }
    },
  },
})
