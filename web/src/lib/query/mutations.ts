import { toast } from 'sonner'
import { ApiError } from '@/lib/errors'

/** Server state lives here and nowhere else. */

export function toastError(error: unknown) {
  toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.')
}

/** Runs a mutation and says whether it worked, instead of throwing. */
export async function ran(mutation: () => Promise<unknown>): Promise<boolean> {
  try {
    await mutation()
    return true
  } catch {
    return false
  }
}
