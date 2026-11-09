// lib/audit.ts — Audit log writer (append-only)
import { prisma } from '@/lib/db'

interface AuditLogParams {
  actorUserId?: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
}

/**
 * Write an immutable audit log entry.
 * Never logs passwords, tokens, or other secrets.
 * This function never throws — audit failures are logged to stderr only.
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? (params.metadata as object) : undefined,
        ipAddress: params.ipAddress ?? null,
      },
    })
  } catch (err) {
    // Never let audit failures crash the application, but do log them
    console.error('[audit] Failed to write audit log:', err, params)
  }
}

// Well-known audit action constants
export const AuditAction = {
  // Auth
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_EMAIL_VERIFIED: 'AUTH_EMAIL_VERIFIED',
  AUTH_PASSWORD_RESET_REQUESTED: 'AUTH_PASSWORD_RESET_REQUESTED',
  AUTH_PASSWORD_RESET_COMPLETED: 'AUTH_PASSWORD_RESET_COMPLETED',

  // User management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DELETED: 'USER_DELETED',

  // Occupancy requests
  REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  REQUEST_EXPIRED: 'REQUEST_EXPIRED',

  // Occupancy sessions
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_ENDED: 'SESSION_ENDED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_ADMIN_RELEASED: 'SESSION_ADMIN_RELEASED',

  // Table management
  TABLE_CREATED: 'TABLE_CREATED',
  TABLE_UPDATED: 'TABLE_UPDATED',
  TABLE_MAINTENANCE_ON: 'TABLE_MAINTENANCE_ON',
  TABLE_MAINTENANCE_OFF: 'TABLE_MAINTENANCE_OFF',
  TABLE_RESERVED: 'TABLE_RESERVED',
  TABLE_UNRESERVED: 'TABLE_UNRESERVED',

  // System
  SETTING_UPDATED: 'SETTING_UPDATED',
  SYSTEM_SEED: 'SYSTEM_SEED',
} as const

export type AuditActionKey = typeof AuditAction[keyof typeof AuditAction]

