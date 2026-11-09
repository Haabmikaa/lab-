# University Computer Laboratory Table Occupancy Management System

A secure, responsive full-stack web application for monitoring and managing table occupancy in a university computer laboratory.

---

## 1. System Overview

### Physical Environment
- **25 Tables Total**:
  - **T01–T22**: Regular student tables (laptops only, mixed working/dead Ethernet wall sockets).
  - **T23–T25**: Reserved tables permanently allocated for laboratory representatives.
- Students bring their own laptops.
- Students with dead Ethernet sockets connect via peer Wi-Fi hotspots and may request any available regular table.
- **No QR codes** and **no fixed IP-to-table mappings** are used.

### Core Security Principle
The system enforces a strict distinction between:
1. **Authentication**: Identity verification (authorized accounts only).
2. **Network Evidence**: Connection classification (Ethernet vs. unverified/hotspot).
3. **Approval**: Administrative permission to claim a table.
4. **Occupancy**: An active, confirmed session holding a table.

---

## 2. Table Lifecycle & State Machine

```
   AVAILABLE ──(Student requests table)──► PENDING_APPROVAL
       ▲                                          │
       │                                          ▼
       │ (Admin rejects or request expires)  (Admin approves)
       │                                          │
       │                                          ▼
       │                                      APPROVED
       │                                          │
       │ (Student confirms activation)            ▼
       │                                      OCCUPIED
       │                                          │
       └──(Student releases / Admin overrides)────┘

   [MAINTENANCE] ◄──(Admin toggles)──► [AVAILABLE]
```

### Transition Invariants Enforced by Database Transactions:
- `AVAILABLE → PENDING_APPROVAL`: Triggered when an authorized student submits a request. Table is temporarily locked.
- `PENDING_APPROVAL → APPROVED`: Admin approves the specific request. Creates an `ApprovalRecord` with an expiration timestamp.
- `APPROVED → OCCUPIED`: **Only callable by the student who owns the approved request**. Atomically consumes the approval (sets `usedAt`), starts an `OccupancySession`, and updates the table to `OCCUPIED`.
- `OCCUPIED → AVAILABLE`: Triggered either by the student releasing their own table or an administrator performing an authorized override.
- **Reserved tables (T23–T25)** cannot be requested or transitioned by regular students.

---

## 3. Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, React 19, TypeScript strict mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) + custom accessible design tokens (WCAG 2.2 AA)
- **Database & ORM**: PostgreSQL with [Prisma 6](https://www.prisma.io/)
- **Authentication**: [NextAuth.js v5 (Auth.js)](https://authjs.dev/) with bcryptjs password hashing and secure HTTP-only cookies
- **Real-Time Streaming**: Server-Sent Events (SSE) via Next.js route handlers
- **Testing**: [Vitest](https://vitest.dev/) automated test suite

---

## 4. Getting Started

### Prerequisites
- Node.js v20+ (developed and verified on v24.12.0)
- PostgreSQL database instance

### 1. Clone & Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in the required environment variables:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/lab_occupancy"
AUTH_SECRET="generate_a_random_32_character_string"
NEXTAUTH_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
SEED_ADMIN_EMAIL="admin@university.edu"
SEED_ADMIN_PASSWORD="StrongAdminPassword123!"
```

### 3. Database Migration & Seeding
Generate Prisma client and seed the 25 tables and default administrator:
```bash
npm run db:generate
npm run db:push
npm run db:seed
```

### 4. Run the Test Suite
Verify that all 12 security and business invariant tests pass:
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 5. User Roles & Capabilities

| Role | Public Views | Request Regular Tables | Hotspot Approval Flow | Release Own Session | Admin Dashboard & Approvals | User & Table Management | Audit Log Access |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Public Visitor** | ✅ (Sanitized) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Student** | ✅ | ✅ | ✅ (Mandatory) | ✅ | ❌ | ❌ | ❌ |
| **Representative** | ✅ | Optional | N/A | ✅ (Assigned) | ❌ | ❌ | ❌ |
| **Administrator** | ✅ | ✅ | Full Review | ✅ (Any table) | ✅ | ✅ | ✅ |

---

## 6. Security & Threat Mitigation Summary

| Threat | System Defense |
|---|---|
| **Approval Bypass (Direct API Call)** | The session activation endpoint (`POST /api/sessions`) loads the `ApprovalRecord` inside a serializable database transaction. Activation is rejected if no valid, unexpired, unused approval exists. |
| **Approval Replay / Double Use** | When a session is activated, the `ApprovalRecord` is stamped with `usedAt = now()`. Re-submitting the same request ID is immediately rejected. |
| **Race Conditions (Two students claiming table)** | Database transactions run at `Serializable` isolation level. Unique constraints ensure only one `ACTIVE` session per table and per student at any moment. |
| **Forged Network Classification** | Network classification is determined exclusively server-side. Client-supplied headers or request properties are never trusted as network verification evidence. |
| **PII Leakage via Public Endpoint** | `/api/tables` and `/api/sse` expose only table identifiers, statuses, and physical attributes. Student names, emails, and session identifiers are completely omitted. |
| **Brute-Force Authentication** | Rate limiting is enforced on login and request submission endpoints. |
| **Unauthorized Administrative Actions** | Server-side RBAC checks (`requireAdmin()`) guard every administrative route handler and action. |

---

## 7. University IT Integration Requirements

> [!IMPORTANT]
> **Ethernet Verification Boundary Notice**  
> Physical Ethernet presence cannot be reliably deduced from client IP addresses alone (e.g. NAT gateways, peer Wi-Fi tethering).
> 
> Until the university IT department integrates one of the following mechanisms, **all student requests are classified as `UNVERIFIED` and require administrator approval**:
> 1. **RADIUS / 802.1X Port Authentication**: Webhook or API event sent to `/api/network/radius` upon 802.1X handshake on lab switch ports.
> 2. **Managed Switch SNMP / REST API**: Query switch MAC-to-port mapping tables to verify physical port connectivity.
> 3. **Lab VLAN DHCP Option**: Dedicated isolated lab VLAN providing cryptographically signed client credentials.

---

## 8. Verification & Test Evidence

All automated security and occupancy tests pass cleanly:
```
 ✓ src/tests/occupancy.test.ts (12 tests)
   ✓ prevents requesting a reserved table (T23-T25)
   ✓ prevents requesting an already occupied table
   ✓ prevents multiple active sessions for the same student
   ✓ submits a pending request and sets table status to PENDING_APPROVAL
   ✓ REJECTS activation when request is PENDING_APPROVAL (unapproved bypass attempt)
   ✓ REJECTS activation if another student tries to activate someone else request
   ✓ REJECTS activation if approval has expired
   ✓ REJECTS activation if approval was already used (replay attack prevention)
   ✓ SUCCESSFULLY activates when approval is valid, single-use marks it used and updates table to OCCUPIED
   ✓ allows a student to release their own active table session
   ✓ prevents a student from releasing another student table
   ✓ allows an administrator to release any table with admin override status
```
Production build (`next build`) compiles all 18 routes with zero type errors.
