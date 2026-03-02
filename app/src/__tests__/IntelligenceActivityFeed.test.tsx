// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  IntelligenceActivityFeed,
  type ActivityMessage,
} from '../components/IntelligenceActivityFeed';
import { PipelineActivityBanner } from '../components/CoachScreenBanners';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeMessage(
  overrides?: Partial<ActivityMessage> & { id?: string },
): ActivityMessage {
  const id = overrides?.id ?? `msg-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    message: 'Analyzing job description requirements.',
    timestamp: Date.now(),
    isSummary: false,
    ...overrides,
  };
}

function makeMessages(count: number): ActivityMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage({ id: `msg-${i}`, message: `Activity message ${i + 1}` }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IntelligenceActivityFeed', () => {
  afterEach(() => {
    cleanup();
  });

  // 1. Renders empty state with placeholder when processing
  it('renders "Initializing..." placeholder when processing with no messages', () => {
    render(<IntelligenceActivityFeed messages={[]} isProcessing={true} />);
    expect(screen.getByText('Initializing...')).toBeTruthy();
  });

  // 1b. No messages and not processing shows "No activity yet"
  it('renders "No activity yet." when not processing and no messages', () => {
    render(<IntelligenceActivityFeed messages={[]} isProcessing={false} />);
    expect(screen.getByText('No activity yet.')).toBeTruthy();
  });

  // 2. Renders messages correctly
  it('renders provided messages', () => {
    const messages = [
      makeMessage({ id: 'a', message: 'Step one started.' }),
      makeMessage({ id: 'b', message: 'Researching company.' }),
    ];
    render(<IntelligenceActivityFeed messages={messages} isProcessing={true} />);
    expect(screen.getByText('Step one started.')).toBeTruthy();
    expect(screen.getByText('Researching company.')).toBeTruthy();
  });

  // 3. Most recent message has highlighted styling
  it('applies highlighted text class to the most recent (last) message', () => {
    const messages = [
      makeMessage({ id: 'old', message: 'Older message.' }),
      makeMessage({ id: 'new', message: 'Most recent message.' }),
    ];
    render(<IntelligenceActivityFeed messages={messages} isProcessing={true} />);

    // The most recent message element should have white/85 class
    const listItems = screen.getAllByRole('listitem');
    const lastItem = listItems[listItems.length - 1];
    expect(lastItem.className).toContain('text-white/85');
  });

  // 4. Stage summary messages have emphasis styling (border-l-2)
  it('applies left-border emphasis to isSummary messages', () => {
    const messages = [
      makeMessage({ id: 'sum', message: 'Stage complete.', isSummary: true }),
      makeMessage({ id: 'reg', message: 'Regular activity.' }),
    ];
    render(<IntelligenceActivityFeed messages={messages} isProcessing={false} />);

    const listItems = screen.getAllByRole('listitem');
    // First item is the summary (not most recent), should have border-l-2
    const summaryItem = listItems[0];
    expect(summaryItem.className).toContain('border-l-2');
  });

  // 5. Respects max message count (only shows last 10)
  it('shows only the last 10 messages when more than 10 are provided', () => {
    const messages = makeMessages(15);
    render(<IntelligenceActivityFeed messages={messages} isProcessing={false} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(10);

    // The visible messages should be the last 10 (messages 6-15, i.e. "Activity message 6" through "Activity message 15")
    expect(screen.queryByText('Activity message 1')).toBeNull();
    expect(screen.queryByText('Activity message 5')).toBeNull();
    expect(screen.getByText('Activity message 6')).toBeTruthy();
    expect(screen.getByText('Activity message 15')).toBeTruthy();
  });

  // 6. Older messages have lower opacity than the most recent
  it('applies lower opacity classes to older messages compared to the most recent', () => {
    const messages = makeMessages(5);
    render(<IntelligenceActivityFeed messages={messages} isProcessing={false} />);

    const listItems = screen.getAllByRole('listitem');
    const mostRecentItem = listItems[listItems.length - 1];
    const oldestItem = listItems[0];

    // Most recent should have the brightest class
    expect(mostRecentItem.className).toContain('text-white/85');
    // Oldest (position 4 of 5) should have a dimmer class
    expect(oldestItem.className).not.toContain('text-white/85');
  });
});

// ─── PipelineActivityBanner tests ────────────────────────────────────────────

describe('PipelineActivityBanner', () => {
  afterEach(() => {
    cleanup();
  });

  // 6. Returns null when not viewing live node (banner behavior)
  it('returns null when isViewingLiveNode is false', () => {
    const { container } = render(
      <PipelineActivityBanner
        isViewingLiveNode={false}
        messages={[makeMessage({ message: 'Some activity.' })]}
        isProcessing={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the feed when isViewingLiveNode is true', () => {
    const messages = [makeMessage({ message: 'Pipeline started.' })];
    render(
      <PipelineActivityBanner
        isViewingLiveNode={true}
        messages={messages}
        isProcessing={true}
      />,
    );
    expect(screen.getByText('Pipeline started.')).toBeTruthy();
  });
});
