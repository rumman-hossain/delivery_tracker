import { zodResolver } from '@hookform/resolvers/zod'
import { signInWithEmailAndPassword, type AuthError } from 'firebase/auth'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router'
import * as z from 'zod'

import { useAuth } from '@/features/auth/AuthProvider'
import { homeFor, Splash } from '@/features/auth/RequireRole'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { env } from '@/config/env'
import { Card } from '@/components/ui/list'
import { auth } from '@/lib/firebase/firebase'

const schema = z.object({
  email: z.email('Enter the email address your administrator gave you'),
  password: z.string().min(6, 'Passwords are at least 6 characters'),
})
type Values = z.infer<typeof schema>

function signInMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/user-disabled':
      return 'This account has been deactivated. Ask your administrator to turn it back on.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute, then try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your signal and try again.'
    default:
      return 'Could not sign in. Try again.'
  }
}

export function Login() {
  const { user, role, loading } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (loading) return <Splash />
  if (user && role) return <Navigate to={homeFor(role)} replace />

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password)
    } catch (error) {
      setFormError(signInMessage((error as AuthError).code ?? ''))
    }
  })

  const pending = form.formState.isSubmitting

  return (
    <div className="safe-top safe-bottom flex h-full flex-col bg-paper px-5">
      <div className="m-auto w-full max-w-sm py-10">
        <div className="flex flex-col items-center text-center">
          <img
            src="/logo.svg"
            alt=""
            width={96}
            height={96}
            className="size-24 drop-shadow-sm"
            fetchPriority="high"
          />
          <h1 className="mt-4 text-balance text-large-title font-bold leading-[1.15] tracking-[-0.022em] text-ink">
            {env.VITE_APP_NAME}
          </h1>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-7">
          <Card>
            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="you@example.com"
                {...form.register('email')}
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={form.formState.errors.password?.message}
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register('password')}
              />
            </Field>
          </Card>

          {formError ? (
            <p role="alert" className="mt-3 px-1 text-callout text-failed">
              {formError}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="mt-6" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

      </div>
    </div>
  )
}

