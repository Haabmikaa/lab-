'use client'
// app/login/page.tsx — Login page with Onyx, Electric Indigo & Tropical Mint theme

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LayoutGrid, Eye, EyeOff, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid university email'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Invalid university email or password.',
  AccountDisabled: 'Your account has been disabled. Contact the lab administrator.',
  default: 'An error occurred during authentication. Please try again.',
}

function LoginFormContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard'
  const errorParam = searchParams.get('error')

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  useEffect(() => {
    if (status === 'authenticated' && session) {
      router.replace(session.user.role === 'ADMIN' ? '/admin' : '/dashboard')
    }
  }, [status, session, router])

  async function onSubmit(data: LoginForm) {
    setIsLoading(true)
    setServerError(null)

    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    setIsLoading(false)

    if (result?.error) {
      setServerError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.default)
      return
    }

    if (result?.ok) {
      router.push(callbackUrl)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#101010] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#6BFFC5]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#101010] text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-[#6321FB]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-[#6BFFC5]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#6BFFC5]" />
          Back to Live Floor Plan
        </Link>

        {/* Card Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6321FB] to-[#4214b8] shadow-xl shadow-[#6321FB]/40 mb-2">
            <LayoutGrid className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">University Lab Access</h1>
          <p className="text-sm text-zinc-400">Sign in to request and manage table occupancy</p>
        </div>

        {/* URL Error notification */}
        {errorParam && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.default}</span>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-[#141414] rounded-3xl border border-white/10 shadow-2xl p-6 sm:p-8 space-y-5">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Server Error */}
            {serverError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                University Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                {...register('email')}
                className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB] transition-all"
                placeholder="student@university.edu"
                aria-describedby={errors.email ? 'email-error' : undefined}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-rose-400">{errors.email.message}</p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-mono uppercase tracking-wider text-zinc-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full rounded-xl bg-black/50 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-[#6321FB] focus:ring-1 focus:ring-[#6321FB] transition-all pr-10"
                  placeholder="••••••••"
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-zinc-400" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-xs text-rose-400">{errors.password.message}</p>
              )}
            </div>

            {/* Submit Button in Tropical Mint */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-[#6BFFC5] px-4 py-3 text-sm font-bold text-[#101010] hover:bg-[#5ae6af] shadow-lg shadow-[#6BFFC5]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider flex items-center justify-center gap-2 mt-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-[#101010]" aria-hidden="true" />}
              {isLoading ? 'Authenticating…' : 'Sign in to Laboratory'}
            </button>
          </form>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-zinc-500">
          Accounts are administrator-authorized.{' '}
          <span className="text-[#c4b5fd]">No public self-registration.</span>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#101010] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#6BFFC5]" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  )
}
