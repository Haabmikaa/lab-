'use client'
// src/app/admin/users/new/page.tsx — Administrator: create/authorize new user account

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/shared/Navbar'
import { UserPlus, ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function NewUserPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'STUDENT' | 'ADMIN' | 'REPRESENTATIVE'>('STUDENT')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      toast.error('Name and university email are required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: password || undefined,
          role,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Database not connected. Please set up DATABASE_URL.')
        return
      }

      toast.success(`User ${data.user.email} authorized successfully!`)
      router.push('/admin')
    } catch (err) {
      toast.error('Network request failed. Ensure server is running.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white">
      <Navbar />
      <main className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-10 space-y-6">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#6BFFC5]" />
            Return to Administrator Center
          </Link>
          <div className="flex items-center gap-2.5 mt-4">
            <div className="p-2 rounded-xl bg-[#6321FB]/20 border border-[#6321FB]/50 text-[#6BFFC5]">
              <UserPlus className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">Authorize New User</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Accounts must be pre-authorized before students or representatives can access the system.
          </p>
        </div>

        <div className="bg-[#141414] rounded-3xl border border-white/10 shadow-2xl p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                University Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu"
                className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="role" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                Assigned Role
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full rounded-xl bg-black/80 border border-white/15 px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
              >
                <option value="STUDENT">Student (can request regular student tables T01–T22)</option>
                <option value="REPRESENTATIVE">Representative (reserved tables T23–T25)</option>
                <option value="ADMIN">Administrator (full control & approvals)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                Initial Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                className="w-full rounded-xl bg-black/60 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB]"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                If provided, account status is set to ACTIVE immediately.
              </p>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#6BFFC5] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#101010] hover:bg-[#5ae6af] shadow-lg shadow-[#6BFFC5]/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin text-[#101010]" />}
                {submitting ? 'Authorizing Account…' : 'Authorize User Account'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
