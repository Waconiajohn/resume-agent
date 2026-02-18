import { z } from 'zod';

/**
 * Validates a request body against a Zod schema.
 * Returns the parsed data on success, or null on failure.
 */
export function validateBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): { success: true; data: z.infer<T> } | { success: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { success: false, issues: result.error.issues };
  }
  return { success: true, data: result.data };
}
