import { describe, expect, it } from 'vitest';
import { normalizeBaseUrl, resolveExtensionConfig } from '../config.js';

describe('extension config', () => {
  it('uses localhost defaults in development builds', () => {
    expect(resolveExtensionConfig({ PROD: false })).toEqual({
      API_BASE_URL: 'http://localhost:3001',
      APP_BASE_URL: 'http://localhost:5173',
    });
  });

  it('uses the production app defaults in production builds', () => {
    expect(resolveExtensionConfig({ PROD: true })).toEqual({
      API_BASE_URL: 'https://resume-agent-production-fc86.up.railway.app',
      APP_BASE_URL: 'https://resume-agent-production-fc86.up.railway.app',
    });
  });

  it('supports explicit API and app base URLs', () => {
    expect(resolveExtensionConfig({
      PROD: true,
      VITE_CAREERIQ_API_BASE_URL: 'https://api.example.com/',
      VITE_CAREERIQ_APP_BASE_URL: 'https://app.example.com/',
    })).toEqual({
      API_BASE_URL: 'https://api.example.com',
      APP_BASE_URL: 'https://app.example.com',
    });
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeBaseUrl(' https://example.com/// ')).toBe('https://example.com');
  });
});
