// lib/occupancy.ts — Core occupancy business rules (server-only)
// All DB operations use transactions to prevent race conditions.

import { prisma } from '@/lib/db'
import {
  TableStatus,
  RequestStatus,
  SessionStatus,
  ConnectionType,
  TableType,
  ApprovalDecision,
  Prisma,
} from '@prisma/client'
import { auditLog, AuditAction } from '@/lib/audit'
import { sseEmit } from '@/lib/sse'

// ─── Settings helpers ────────────────────────────────────────────────────────

async function getSetting(key: string, defaultValue: string): Promise<string> {
  const s = await prisma.systemSetting.findUnique({ where: { key } })
  return s?.value ?? defaultValue
}

async function getApprovalExpiryMs(): Promise<number> {
  const minutes = parseInt(await getSetting('approval_expiry_minutes', '30'), 10)
  return minutes * 60 * 1000
}

async function getPendingExpiryMs(): Promise<number> {
  const hours = parseInt(await getSetting('pending_request_expiry_hours', '2'), 10)
  return hours * 60 * 60 * 1000
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class OccupancyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'OccupancyError'
  }
}

// ─── Submit an occupancy request ──────────────────────────────────────────────

export async function submitOccupancyRequest({
  userId,
  tableId,
  connectionType,
  clientIpAddress,
  userAgent,
}: {
  userId: string
  tableId: string
  connectionType: ConnectionType
  clientIpAddress?: string
  userAgent?: string
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Verify table exists, is REGULAR, and is AVAILABLE
    const table = await tx.labTable.findUnique({ where: { id: tableId } })
    if (!table) throw new OccupancyError('Table not found', 'TABLE_NOT_FOUND')
    if (!table.isActive) throw new OccupancyError('Table is not active', 'TABLE_INACTIVE')
    if (table.tableType !== TableType.REGULAR)
      throw new OccupancyError('Cannot request a reserved table', 'TABLE_RESERVED')
    if (table.status !== TableStatus.AVAILABLE)
      throw new OccupancyError('Table is not available', 'TABLE_NOT_AVAILABLE')

    // 2. Verify student has no active session
    const activeSession = await tx.occupancySession.findFirst({
      where: { userId, status: SessionStatus.ACTIVE },
    })
    if (activeSession)
      throw new OccupancyError('You already have an active table session', 'ALREADY_OCCUPIED')

    // 3. Verify student has no pending/approved request
    const pendingRequest = await tx.occupancyRequest.findFirst({
      where: {
        userId,
        status: { in: [RequestStatus.PENDING_APPROVAL, RequestStatus.APPROVED] },
      },
    })
    if (pendingRequest)
      throw new OccupancyError('You already have an active request', 'DUPLICATE_REQUEST')

    // 4. Lock the table status
    await tx.labTable.update({
      where: { id: tableId },
      data: { status: TableStatus.PENDING_APPROVAL },
    })

    // 5. Create request
    const expiresAt = new Date(Date.now() + (await getPendingExpiryMs()))
    const request = await tx.occupancyRequest.create({
      data: {
        userId,
        tableId,
        connectionType,
        status: RequestStatus.PENDING_APPROVAL,
        expiresAt,
        clientIpAddress: clientIpAddress ?? null,
        userAgent: userAgent ?? null,
      },
    })

    await auditLog({
      actorUserId: userId,
      action: AuditAction.REQUEST_SUBMITTED,
      entityType: 'OccupancyRequest',
      entityId: request.id,
      metadata: { tableId, tableCode: table.tableCode, connectionType },
      ipAddress: clientIpAddress,
    })

    // Notify admins via SSE
    sseEmit('request:new', { requestId: request.id, tableCode: table.tableCode })

    return request
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

// ─── Admin: approve a request (auto-creates session immediately) ──────────────

export async function approveRequest({
  requestId,
  adminId,
  reason,
}: {
  requestId: string
  adminId: string
  reason?: string
}) {
  return await prisma.$transaction(async (tx) => {
    const request = await tx.occupancyRequest.findUnique({
      where: { id: requestId },
      include: { table: true },
    })
    if (!request) throw new OccupancyError('Request not found', 'REQUEST_NOT_FOUND')
    if (request.status !== RequestStatus.PENDING_APPROVAL)
      throw new OccupancyError('Request is not pending approval', 'INVALID_STATUS')

    // Check request hasn't expired
    if (request.expiresAt && request.expiresAt < new Date())
      throw new OccupancyError('Request has expired', 'REQUEST_EXPIRED')

    // Verify table still available/pending
    if (
      request.table.status !== TableStatus.PENDING_APPROVAL &&
      request.table.status !== TableStatus.AVAILABLE
    )
      throw new OccupancyError('Table is no longer available', 'TABLE_NOT_AVAILABLE')

    // Check student doesn't already have an active session
    const existingSession = await tx.occupancySession.findFirst({
      where: { userId: request.userId, status: SessionStatus.ACTIVE },
    })
    if (existingSession)
      throw new OccupancyError('Student already has an active session', 'ALREADY_OCCUPIED')

    // Mark request as APPROVED
    await tx.occupancyRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.APPROVED, reviewedBy: adminId, reviewedAt: new Date() },
    })

    // Create approval record (already used — no waiting for student action)
    const approval = await tx.approvalRecord.create({
      data: {
        requestId,
        adminId,
        decision: ApprovalDecision.APPROVED,
        reason: reason ?? null,
        expiresAt: new Date(Date.now() + (await getApprovalExpiryMs())),
        usedAt: new Date(), // Consumed immediately
      },
    })

    // Auto-create an active occupancy session — no student action required
    const session = await tx.occupancySession.create({
      data: {
        userId: request.userId,
        tableId: request.tableId,
        requestId: request.id,
        connectionType: request.connectionType,
        status: SessionStatus.ACTIVE,
      },
    })

    // Set table to OCCUPIED immediately
    await tx.labTable.update({
      where: { id: request.tableId },
      data: { status: TableStatus.OCCUPIED },
    })

    await auditLog({
      actorUserId: adminId,
      action: AuditAction.REQUEST_APPROVED,
      entityType: 'OccupancyRequest',
      entityId: requestId,
      metadata: {
        tableId: request.tableId,
        tableCode: request.table.tableCode,
        studentId: request.userId,
        approvalId: approval.id,
        sessionId: session.id,
        autoActivated: true,
      },
    })

    await auditLog({
      actorUserId: request.userId,
      action: AuditAction.SESSION_STARTED,
      entityType: 'OccupancySession',
      entityId: session.id,
      metadata: {
        tableId: request.tableId,
        tableCode: request.table.tableCode,
        requestId: request.id,
        approvalId: approval.id,
        connectionType: request.connectionType,
        autoActivatedByAdmin: true,
      },
    })

    sseEmit('table:occupied', { tableId: request.tableId, tableCode: request.table.tableCode })
    sseEmit('request:approved', { requestId, userId: request.userId, tableCode: request.table.tableCode })

    return { request, approval, session }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

// ─── Admin: reject a request ─────────────────────────────────────────────────

export async function rejectRequest({
  requestId,
  adminId,
  reason,
}: {
  requestId: string
  adminId: string
  reason?: string
}) {
  return await prisma.$transaction(async (tx) => {
    const request = await tx.occupancyRequest.findUnique({
      where: { id: requestId },
      include: { table: true },
    })
    if (!request) throw new OccupancyError('Request not found', 'REQUEST_NOT_FOUND')
    if (request.status !== RequestStatus.PENDING_APPROVAL)
      throw new OccupancyError('Request is not pending approval', 'INVALID_STATUS')

    await tx.occupancyRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    })

    await tx.approvalRecord.create({
      data: {
        requestId,
        adminId,
        decision: ApprovalDecision.REJECTED,
        reason: reason ?? null,
        expiresAt: new Date(), // Immediately expired
      },
    })

    // Return table to AVAILABLE
    await tx.labTable.update({
      where: { id: request.tableId },
      data: { status: TableStatus.AVAILABLE },
    })

    await auditLog({
      actorUserId: adminId,
      action: AuditAction.REQUEST_REJECTED,
      entityType: 'OccupancyRequest',
      entityId: requestId,
      metadata: { tableId: request.tableId, tableCode: request.table.tableCode, studentId: request.userId, reason },
    })

    sseEmit('request:rejected', { requestId, userId: request.userId, tableCode: request.table.tableCode })

    return request
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

// ─── Activate an approved request (student activates table) ──────────────────
// CRITICAL: Backend enforces that approval exists, is valid, and hasn't been used.

export async function activateApprovedRequest({
  requestId,
  userId,
}: {
  requestId: string
  userId: string
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Load request with approval
    const request = await tx.occupancyRequest.findUnique({
      where: { id: requestId },
      include: { table: true, approval: true },
    })
    if (!request) throw new OccupancyError('Request not found', 'REQUEST_NOT_FOUND')

    // 2. Ownership check — user must own the request
    if (request.userId !== userId)
      throw new OccupancyError('Forbidden', 'FORBIDDEN')

    // 3. Status must be APPROVED
    if (request.status !== RequestStatus.APPROVED)
      throw new OccupancyError('Request has not been approved', 'NOT_APPROVED')

    // 4. Approval record must exist and be APPROVED
    const approval = request.approval
    if (!approval || approval.decision !== ApprovalDecision.APPROVED)
      throw new OccupancyError('No valid approval record found', 'NO_APPROVAL')

    // 5. Approval must not be expired
    if (approval.expiresAt < new Date())
      throw new OccupancyError('Approval has expired', 'APPROVAL_EXPIRED')

    // 6. Approval must not have been used already
    if (approval.usedAt)
      throw new OccupancyError('Approval has already been used', 'APPROVAL_USED')

    // 7. Table must still be in APPROVED status (not grabbed by another concurrent activation)
    const table = await tx.labTable.findUnique({ where: { id: request.tableId } })
    if (!table || table.status !== TableStatus.APPROVED)
      throw new OccupancyError('Table is no longer available', 'TABLE_NOT_AVAILABLE')

    // 8. User must not already have an active session
    const existing = await tx.occupancySession.findFirst({
      where: { userId, status: SessionStatus.ACTIVE },
    })
    if (existing)
      throw new OccupancyError('You already have an active session', 'ALREADY_OCCUPIED')

    // 9. Mark approval as used (prevent replay)
    await tx.approvalRecord.update({
      where: { id: approval.id },
      data: { usedAt: new Date() },
    })

    // 10. Create occupancy session
    const session = await tx.occupancySession.create({
      data: {
        userId,
        tableId: request.tableId,
        requestId: request.id,
        connectionType: request.connectionType,
        status: SessionStatus.ACTIVE,
      },
    })

    // 11. Update table to OCCUPIED
    await tx.labTable.update({
      where: { id: request.tableId },
      data: { status: TableStatus.OCCUPIED },
    })

    await auditLog({
      actorUserId: userId,
      action: AuditAction.SESSION_STARTED,
      entityType: 'OccupancySession',
      entityId: session.id,
      metadata: {
        tableId: request.tableId,
        tableCode: table.tableCode,
        requestId: request.id,
        approvalId: approval.id,
        connectionType: request.connectionType,
      },
    })

    sseEmit('table:occupied', { tableId: request.tableId, tableCode: table.tableCode })

    return session
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

// ─── Admin: force-revoke any table (occupied, pending, or approved) ──────────

export async function forceRevokeTable({
  tableId,
  adminId,
}: {
  tableId: string
  adminId: string
}) {
  return await prisma.$transaction(async (tx) => {
    const table = await tx.labTable.findUnique({ where: { id: tableId } })
    if (!table) throw new OccupancyError('Table not found', 'TABLE_NOT_FOUND')

    // 1. End any active session on this table
    const activeSession = await tx.occupancySession.findFirst({
      where: { tableId, status: SessionStatus.ACTIVE },
    })
    if (activeSession) {
      await tx.occupancySession.update({
        where: { id: activeSession.id },
        data: { status: SessionStatus.ADMINISTRATIVELY_ENDED, endedAt: new Date(), endedBy: adminId },
      })
    }

    // 2. Cancel any pending or approved requests for this table
    await tx.occupancyRequest.updateMany({
      where: {
        tableId,
        status: { in: [RequestStatus.PENDING_APPROVAL, RequestStatus.APPROVED] },
      },
      data: { status: RequestStatus.CANCELLED },
    })

    // 3. Reset table to AVAILABLE
    await tx.labTable.update({
      where: { id: tableId },
      data: { status: TableStatus.AVAILABLE },
    })

    await auditLog({
      actorUserId: adminId,
      action: AuditAction.SESSION_ADMIN_RELEASED,
      entityType: 'LabTable',
      entityId: tableId,
      metadata: {
        tableCode: table.tableCode,
        hadActiveSession: !!activeSession,
        sessionId: activeSession?.id,
        forceRevoke: true,
      },
    })

    sseEmit('table:available', { tableId, tableCode: table.tableCode })

    return { table, sessionEnded: !!activeSession }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}


export async function releaseTable({
  sessionId,
  actorId,
  actorRole,
  isAdminOverride = false,
}: {
  sessionId: string
  actorId: string
  actorRole: string
  isAdminOverride?: boolean
}) {
  return await prisma.$transaction(async (tx) => {
    const session = await tx.occupancySession.findUnique({
      where: { id: sessionId },
      include: { table: true },
    })
    if (!session) throw new OccupancyError('Session not found', 'SESSION_NOT_FOUND')
    if (session.status !== SessionStatus.ACTIVE)
      throw new OccupancyError('Session is not active', 'SESSION_NOT_ACTIVE')

    // Authorization: student can only release their own session
    if (actorRole !== 'ADMIN' && session.userId !== actorId)
      throw new OccupancyError('Forbidden', 'FORBIDDEN')

    const endStatus = isAdminOverride ? SessionStatus.ADMINISTRATIVELY_ENDED : SessionStatus.ENDED

    await tx.occupancySession.update({
      where: { id: sessionId },
      data: {
        status: endStatus,
        endedAt: new Date(),
        endedBy: actorId,
      },
    })

    await tx.labTable.update({
      where: { id: session.tableId },
      data: { status: TableStatus.AVAILABLE },
    })

    const action = isAdminOverride ? AuditAction.SESSION_ADMIN_RELEASED : AuditAction.SESSION_ENDED
    await auditLog({
      actorUserId: actorId,
      action,
      entityType: 'OccupancySession',
      entityId: sessionId,
      metadata: { tableId: session.tableId, tableCode: session.table.tableCode, studentId: session.userId },
    })

    sseEmit('table:available', { tableId: session.tableId, tableCode: session.table.tableCode })

    return session
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

// ─── Cancel a pending/approved request ───────────────────────────────────────

export async function cancelRequest({
  requestId,
  actorId,
  actorRole,
}: {
  requestId: string
  actorId: string
  actorRole: string
}) {
  return await prisma.$transaction(async (tx) => {
    const request = await tx.occupancyRequest.findUnique({
      where: { id: requestId },
      include: { table: true },
    })
    if (!request) throw new OccupancyError('Request not found', 'REQUEST_NOT_FOUND')
    if (!([RequestStatus.PENDING_APPROVAL, RequestStatus.APPROVED] as RequestStatus[]).includes(request.status))
      throw new OccupancyError('Request cannot be cancelled', 'INVALID_STATUS')

    // Authorization
    if (actorRole !== 'ADMIN' && request.userId !== actorId)
      throw new OccupancyError('Forbidden', 'FORBIDDEN')

    await tx.occupancyRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.CANCELLED },
    })

    // Return table to available
    await tx.labTable.update({
      where: { id: request.tableId },
      data: { status: TableStatus.AVAILABLE },
    })

    await auditLog({
      actorUserId: actorId,
      action: AuditAction.REQUEST_CANCELLED,
      entityType: 'OccupancyRequest',
      entityId: requestId,
      metadata: { tableId: request.tableId, tableCode: request.table.tableCode, studentId: request.userId },
    })

    sseEmit('table:available', { tableId: request.tableId, tableCode: request.table.tableCode })

    return request
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}

/**
 * Direct table occupancy for verified university Ethernet connections.
 * Bypasses admin approval when connection is verified on university lab network.
 */
export async function directOccupyTable({
  userId,
  tableId,
  clientIpAddress,
  userAgent,
}: {
  userId: string
  tableId: string
  clientIpAddress?: string
  userAgent?: string
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Verify table exists, is REGULAR, and is AVAILABLE
    const table = await tx.labTable.findUnique({ where: { id: tableId } })
    if (!table) throw new OccupancyError('Table not found', 'TABLE_NOT_FOUND')
    if (!table.isActive) throw new OccupancyError('Table is not active', 'TABLE_INACTIVE')
    if (table.tableType !== TableType.REGULAR)
      throw new OccupancyError('Cannot occupy a reserved table', 'TABLE_RESERVED')
    if (table.status !== TableStatus.AVAILABLE)
      throw new OccupancyError('Table is not available', 'TABLE_NOT_AVAILABLE')

    // 2. Verify student has no active session
    const activeSession = await tx.occupancySession.findFirst({
      where: { userId, status: SessionStatus.ACTIVE },
    })
    if (activeSession)
      throw new OccupancyError('You already have an active table session', 'ALREADY_OCCUPIED')

    // 3. Clear old pending requests
    await tx.occupancyRequest.updateMany({
      where: {
        userId,
        status: { in: [RequestStatus.PENDING_APPROVAL, RequestStatus.APPROVED] },
      },
      data: { status: RequestStatus.CANCELLED },
    })

    // 4. Update table to OCCUPIED
    await tx.labTable.update({
      where: { id: tableId },
      data: { status: TableStatus.OCCUPIED },
    })

    // 5. Create instant active session
    const session = await tx.occupancySession.create({
      data: {
        userId,
        tableId,
        connectionType: ConnectionType.ETHERNET,
        status: SessionStatus.ACTIVE,
      },
      include: {
        table: true,
        user: { select: { id: true, name: true, email: true } },
      },
    })

    // 6. Log audit event
    await auditLog({
      actorUserId: userId,
      action: AuditAction.SESSION_STARTED,
      entityType: 'OccupancySession',
      entityId: session.id,
      metadata: { tableId, tableCode: table.tableCode, connectionType: ConnectionType.ETHERNET, verifiedEthernet: true },
      ipAddress: clientIpAddress,
    })

    sseEmit('table:occupied', { tableId, tableCode: table.tableCode })

    return session
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })
}


