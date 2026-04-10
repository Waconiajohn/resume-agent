import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  redact: {
    paths: [
      'rawSnippet',
      '*.rawSnippet',
      'resume_text',
      '*.resume_text',
      'job_description',
      '*.job_description',
      'original_resume',
      '*.original_resume',
    ],
    remove: true,
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
});

/**
 * Creates a child logger scoped to a specific session.
 */
export function createSessionLogger(
  sessionId: string,
  extra?: Record<string, unknown>,
) {
  return logger.child({ sessionId, ...extra });
}

export default logger;
