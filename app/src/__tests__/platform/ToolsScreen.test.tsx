// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ToolsScreen } from '../../components/platform/ToolsScreen';

afterEach(() => cleanup());

describe('ToolsScreen', () => {
  it('renders the catalog when no slug is provided', () => {
    render(<ToolsScreen onNavigate={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Career Tools');
  });

  it('renders an exposed tool landing page when the slug is allowed', () => {
    render(<ToolsScreen slug="linkedin" onNavigate={vi.fn()} />);

    expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to tools/i })).toBeInTheDocument();
  });

  it('hides non-core tool landing pages', () => {
    render(<ToolsScreen slug="executive-bio" onNavigate={vi.fn()} />);

    expect(screen.getByText('Product not found.')).toBeInTheDocument();
  });

  it('hides cover letter and negotiation as separate tool landing pages', () => {
    render(<ToolsScreen slug="cover-letter" onNavigate={vi.fn()} />);
    expect(screen.getByText('Product not found.')).toBeInTheDocument();

    cleanup();

    render(<ToolsScreen slug="salary-negotiation" onNavigate={vi.fn()} />);
    expect(screen.getByText('Product not found.')).toBeInTheDocument();
  });
});
