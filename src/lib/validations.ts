// lib/validations.ts — Zod schemas for all API inputs
import { z } from 'zod'
import { ConnectionType, Role, TableType, TableStatus } from '@prisma/client'

// ── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(128),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
})

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
})

// ── User management ───────────────────────────────────────────────────────────

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.nativeEnum(Role).default(Role.STUDENT),
  password: z.string().min(8).max(128).optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(Role).optional(),
})

// ── Occupancy requests ────────────────────────────────────────────────────────

export const submitRequestSchema = z.object({
  tableId: z.string().cuid('Invalid table ID'),
  connectionType: z.nativeEnum(ConnectionType).default(ConnectionType.UNVERIFIED),
})

export const approveRequestSchema = z.object({
  reason: z.string().max(500).optional(),
})

export const rejectRequestSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
})

export const activateRequestSchema = z.object({
  requestId: z.string().cuid('Invalid request ID'),
})

// ── Sessions ──────────────────────────────────────────────────────────────────

export const releaseSessionSchema = z.object({
  sessionId: z.string().cuid('Invalid session ID'),
})

// ── Table management ──────────────────────────────────────────────────────────

export const updateTableSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  hasEthernet: z.boolean().optional(),
  tableType: z.nativeEnum(TableType).optional(),
  status: z.nativeEnum(TableStatus).optional(),
})

export const tableMaintenanceSchema = z.object({
  enable: z.boolean(),
  reason: z.string().max(500).optional(),
})

// ── System settings ───────────────────────────────────────────────────────────

export const updateSettingSchema = z.object({
  value: z.string().max(5000),
})

// ── Pagination ────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const auditLogQuerySchema = paginationSchema.extend({
  action: z.string().optional(),
  actorUserId: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

