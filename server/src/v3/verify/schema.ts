// Runtime validation schema for VerifyResult (Stage 5 output).

import { z } from 'zod';

const verifyIssue = z.object({
  severity: z.union([z.literal('error'), z.literal('warning')]),
  section: z.string(),
  message: z.string(),
});

export const VerifyResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(verifyIssue),
});

export type VerifyResultParsed = z.infer<typeof VerifyResultSchema>;
