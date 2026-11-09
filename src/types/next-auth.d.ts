// types/next-auth.d.ts — Extend NextAuth session types
import { Role, AccountStatus } from '@prisma/client'
import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: Role
      accountStatus: AccountStatus
    }
    error?: string
  }

  interface User {
    id: string
    email: string
    name: string
    role: Role
    accountStatus: AccountStatus
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: Role
    accountStatus: AccountStatus
    error?: string
  }
}

