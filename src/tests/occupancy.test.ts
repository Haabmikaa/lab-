// src/tests/occupancy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  submitOccupancyRequest,
  approveRequest,
  rejectRequest,
  activateApprovedRequest,
  releaseTable,
  OccupancyError,
} from '@/lib/occupancy'
import { prisma } from '@/lib/db'
import { TableStatus, RequestStatus, SessionStatus, ConnectionType, TableType, ApprovalDecision } from '@prisma/client'

// Mock prisma and sse
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(prisma)),
    labTable: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    occupancyRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    occupancySession: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    approvalRecord: {
      create: vi.fn(),
      update: vi.fn(),
    },
    systemSetting: {
      findUnique: vi.fn().mockResolvedValue({ value: '30' }),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    },
  },
}))

vi.mock('@/lib/sse', () => ({
  sseEmit: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  AuditAction: {
    REQUEST_SUBMITTED: 'REQUEST_SUBMITTED',
    REQUEST_APPROVED: 'REQUEST_APPROVED',
    REQUEST_REJECTED: 'REQUEST_REJECTED',
    REQUEST_CANCELLED: 'REQUEST_CANCELLED',
    SESSION_STARTED: 'SESSION_STARTED',
    SESSION_ENDED: 'SESSION_ENDED',
    SESSION_ADMIN_RELEASED: 'SESSION_ADMIN_RELEASED',
  },
}))

describe('Occupancy Business Rules & Security Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitOccupancyRequest', () => {
    it('prevents requesting a reserved table (T23-T25)', async () => {
      vi.mocked(prisma.labTable.findUnique).mockResolvedValue({
        id: 'table-23',
        tableCode: 'T23',
        tableType: TableType.RESERVED,
        status: TableStatus.RESERVED,
        isActive: true,
      } as any)

      await expect(
        submitOccupancyRequest({
          userId: 'student-1',
          tableId: 'table-23',
          connectionType: ConnectionType.UNVERIFIED,
        })
      ).rejects.toThrow(new OccupancyError('Cannot request a reserved table', 'TABLE_RESERVED'))
    })

    it('prevents requesting an already occupied table', async () => {
      vi.mocked(prisma.labTable.findUnique).mockResolvedValue({
        id: 'table-1',
        tableCode: 'T01',
        tableType: TableType.REGULAR,
        status: TableStatus.OCCUPIED,
        isActive: true,
      } as any)

      await expect(
        submitOccupancyRequest({
          userId: 'student-1',
          tableId: 'table-1',
          connectionType: ConnectionType.UNVERIFIED,
        })
      ).rejects.toThrow(new OccupancyError('Table is not available', 'TABLE_NOT_AVAILABLE'))
    })

    it('prevents multiple active sessions for the same student', async () => {
      vi.mocked(prisma.labTable.findUnique).mockResolvedValue({
        id: 'table-2',
        tableCode: 'T02',
        tableType: TableType.REGULAR,
        status: TableStatus.AVAILABLE,
        isActive: true,
      } as any)

      vi.mocked(prisma.occupancySession.findFirst).mockResolvedValue({
        id: 'session-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: SessionStatus.ACTIVE,
      } as any)

      await expect(
        submitOccupancyRequest({
          userId: 'student-1',
          tableId: 'table-2',
          connectionType: ConnectionType.UNVERIFIED,
        })
      ).rejects.toThrow(new OccupancyError('You already have an active table session', 'ALREADY_OCCUPIED'))
    })

    it('submits a pending request and sets table status to PENDING_APPROVAL', async () => {
      vi.mocked(prisma.labTable.findUnique).mockResolvedValue({
        id: 'table-3',
        tableCode: 'T03',
        tableType: TableType.REGULAR,
        status: TableStatus.AVAILABLE,
        isActive: true,
      } as any)

      vi.mocked(prisma.occupancySession.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.occupancyRequest.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.occupancyRequest.create).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-3',
        status: RequestStatus.PENDING_APPROVAL,
      } as any)

      const result = await submitOccupancyRequest({
        userId: 'student-1',
        tableId: 'table-3',
        connectionType: ConnectionType.UNVERIFIED,
      })

      expect(result.status).toBe(RequestStatus.PENDING_APPROVAL)
      expect(prisma.labTable.update).toHaveBeenCalledWith({
        where: { id: 'table-3' },
        data: { status: TableStatus.PENDING_APPROVAL },
      })
    })
  })

  describe('activateApprovedRequest — Mandatory Hotspot Approval Workflow Verification', () => {
    it('REJECTS activation when request is PENDING_APPROVAL (unapproved bypass attempt)', async () => {
      vi.mocked(prisma.occupancyRequest.findUnique).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: RequestStatus.PENDING_APPROVAL,
        approval: null,
      } as any)

      await expect(
        activateApprovedRequest({
          requestId: 'req-1',
          userId: 'student-1',
        })
      ).rejects.toThrow(new OccupancyError('Request has not been approved', 'NOT_APPROVED'))
    })

    it('REJECTS activation if another student tries to activate someone else request', async () => {
      vi.mocked(prisma.occupancyRequest.findUnique).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: RequestStatus.APPROVED,
        approval: {
          id: 'appr-1',
          decision: ApprovalDecision.APPROVED,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: null,
        },
      } as any)

      await expect(
        activateApprovedRequest({
          requestId: 'req-1',
          userId: 'student-imposter',
        })
      ).rejects.toThrow(new OccupancyError('Forbidden', 'FORBIDDEN'))
    })

    it('REJECTS activation if approval has expired', async () => {
      vi.mocked(prisma.occupancyRequest.findUnique).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: RequestStatus.APPROVED,
        approval: {
          id: 'appr-1',
          decision: ApprovalDecision.APPROVED,
          expiresAt: new Date(Date.now() - 10000), // Expired!
          usedAt: null,
        },
      } as any)

      await expect(
        activateApprovedRequest({
          requestId: 'req-1',
          userId: 'student-1',
        })
      ).rejects.toThrow(new OccupancyError('Approval has expired', 'APPROVAL_EXPIRED'))
    })

    it('REJECTS activation if approval was already used (replay attack prevention)', async () => {
      vi.mocked(prisma.occupancyRequest.findUnique).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: RequestStatus.APPROVED,
        approval: {
          id: 'appr-1',
          decision: ApprovalDecision.APPROVED,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: new Date(Date.now() - 5000), // Already used!
        },
      } as any)

      await expect(
        activateApprovedRequest({
          requestId: 'req-1',
          userId: 'student-1',
        })
      ).rejects.toThrow(new OccupancyError('Approval has already been used', 'APPROVAL_USED'))
    })

    it('SUCCESSFULLY activates when approval is valid, single-use marks it used and updates table to OCCUPIED', async () => {
      vi.mocked(prisma.occupancyRequest.findUnique).mockResolvedValue({
        id: 'req-1',
        userId: 'student-1',
        tableId: 'table-1',
        connectionType: ConnectionType.HOTSPOT,
        status: RequestStatus.APPROVED,
        approval: {
          id: 'appr-1',
          decision: ApprovalDecision.APPROVED,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: null,
        },
      } as any)

      vi.mocked(prisma.labTable.findUnique).mockResolvedValue({
        id: 'table-1',
        tableCode: 'T01',
        status: TableStatus.APPROVED,
      } as any)

      vi.mocked(prisma.occupancySession.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.occupancySession.create).mockResolvedValue({
        id: 'session-new',
        userId: 'student-1',
        tableId: 'table-1',
        status: SessionStatus.ACTIVE,
      } as any)

      const session = await activateApprovedRequest({
        requestId: 'req-1',
        userId: 'student-1',
      })

      expect(session.id).toBe('session-new')
      // Marked approval as used
      expect(prisma.approvalRecord.update).toHaveBeenCalledWith({
        where: { id: 'appr-1' },
        data: { usedAt: expect.any(Date) },
      })
      // Table marked as OCCUPIED
      expect(prisma.labTable.update).toHaveBeenCalledWith({
        where: { id: 'table-1' },
        data: { status: TableStatus.OCCUPIED },
      })
    })
  })

  describe('releaseTable', () => {
    it('allows a student to release their own active table session', async () => {
      vi.mocked(prisma.occupancySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: SessionStatus.ACTIVE,
        table: { tableCode: 'T01' },
      } as any)

      await releaseTable({
        sessionId: 'session-1',
        actorId: 'student-1',
        actorRole: 'STUDENT',
      })

      expect(prisma.occupancySession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          status: SessionStatus.ENDED,
          endedBy: 'student-1',
        }),
      })

      expect(prisma.labTable.update).toHaveBeenCalledWith({
        where: { id: 'table-1' },
        data: { status: TableStatus.AVAILABLE },
      })
    })

    it('prevents a student from releasing another student table', async () => {
      vi.mocked(prisma.occupancySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: SessionStatus.ACTIVE,
        table: { tableCode: 'T01' },
      } as any)

      await expect(
        releaseTable({
          sessionId: 'session-1',
          actorId: 'student-2',
          actorRole: 'STUDENT',
        })
      ).rejects.toThrow(new OccupancyError('Forbidden', 'FORBIDDEN'))
    })

    it('allows an administrator to release any table with admin override status', async () => {
      vi.mocked(prisma.occupancySession.findUnique).mockResolvedValue({
        id: 'session-1',
        userId: 'student-1',
        tableId: 'table-1',
        status: SessionStatus.ACTIVE,
        table: { tableCode: 'T01' },
      } as any)

      await releaseTable({
        sessionId: 'session-1',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
        isAdminOverride: true,
      })

      expect(prisma.occupancySession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({
          status: SessionStatus.ADMINISTRATIVELY_ENDED,
          endedBy: 'admin-1',
        }),
      })
    })
  })
})

