import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  type AuthError,
} from 'firebase/auth'

import { auth } from '@/lib/firebase/firebase'

/** Changing your own password. */

export class PasswordChangeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PasswordChangeError'
    this.code = code
  }
}

function messageFor(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'That is not your current password.'
    case 'auth/weak-password':
      return 'Choose a longer password — at least 8 characters.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute, then try again.'
    case 'auth/network-request-failed':
      return 'No connection. Check your signal and try again.'
    case 'auth/requires-recent-login':
      return 'Sign out and back in, then change your password.'
    default:
      return 'Could not change your password. Try again.'
  }
}

export async function changeOwnPassword(current: string, next: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) {
    throw new PasswordChangeError('auth/no-user', 'You are not signed in.')
  }

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
    await updatePassword(user, next)
  } catch (error) {
    const code = (error as AuthError).code ?? ''
    throw new PasswordChangeError(code, messageFor(code))
  }
}
