import { describe, expect, it } from 'vitest';
import { formatAgents, formatConventions, formatReview } from '../src/domain/format.js';
import type { FindingLite, ReviewLite, ConventionLite, AgentLite } from '../src/domain/ports.js';
import { UNTRUSTED_NOTE, MAX_RESPONSE_CHARS } from '../src/domain/tool-result.js';

function finding(overrides: Partial<FindingLite>): FindingLite {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
    ...overrides,
  };
}

const REVIEW: ReviewLite = {
  id: 'review-1',
  run_id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'General Reviewer',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Two real issues.',
  score: 62,
  created_at: '2026-09-20T10:00:00.000Z',
  findings: [
    finding({ severity: 'CRITICAL', file: 'b.ts', start_line: 40, end_line: 44, title: 'critical one' }),
    finding({ severity: 'WARNING', file: 'a.ts', start_line: 12, end_line: 12, title: 'warning one' }),
    finding({ severity: 'SUGGESTION', file: 'a.ts', start_line: 20, end_line: 20, title: 'suggestion one' }),
  ],
};

describe('formatReview', () => {
  it('sorts findings CRITICAL > WARNING > SUGGESTION, then file, then start_line', () => {
    const { payload } = formatReview(REVIEW, {
      runId: 'run-1',
      repo: 'acme/x',
      pr: 1,
      agent: 'General Reviewer',
    });
    expect(payload.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
  });

  it('computes counts over ALL findings, unaffected by a min_severity filter', () => {
    const { payload } = formatReview(REVIEW, {
      runId: 'run-1',
      repo: 'acme/x',
      pr: 1,
      agent: 'General Reviewer',
      minSeverity: 'CRITICAL',
    });
    expect(payload.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(payload.findings).toHaveLength(1);
    // `omitted` counts items dropped by max_findings/the char cap, not ones
    // the caller's own min_severity filter deliberately excluded.
    expect(payload.omitted).toBe(0);
  });

  it('caps rationale at 300 chars concise / 1200 detailed, and only includes suggestion when detailed', () => {
    const longReview: ReviewLite = {
      ...REVIEW,
      findings: [finding({ rationale: 'x'.repeat(2000), suggestion: 'y'.repeat(2000) })],
    };
    const concise = formatReview(longReview, { runId: 'r', repo: 'acme/x', pr: 1, agent: 'a' });
    expect(concise.payload.findings[0]?.rationale.length).toBeLessThanOrEqual(300);
    expect(concise.payload.findings[0]?.suggestion).toBeUndefined();

    const detailed = formatReview(longReview, {
      runId: 'r',
      repo: 'acme/x',
      pr: 1,
      agent: 'a',
      detailed: true,
    });
    expect(detailed.payload.findings[0]?.rationale.length).toBeLessThanOrEqual(1200);
    expect(detailed.payload.findings[0]?.suggestion?.length).toBeLessThanOrEqual(600);
  });

  it('truncates to maxFindings, reports omitted, and includes the exact hint text with run_id', () => {
    const { payload, summary } = formatReview(REVIEW, {
      runId: 'run-42',
      repo: 'acme/x',
      pr: 7,
      agent: 'General Reviewer',
      maxFindings: 1,
    });
    expect(payload.findings).toHaveLength(1);
    expect(payload.omitted).toBe(2);
    expect(summary).toContain(
      '2 more finding(s) omitted; call get_findings with repo=acme/x, pr=7, run_id=run-42, and either a higher min_severity or a larger max_findings (up to 50).',
    );
  });

  it('never drops a higher severity while keeping a lower one when enforcing the char cap', () => {
    const manyFindings: FindingLite[] = Array.from({ length: 50 }, (_, i) =>
      finding({
        severity: i < 5 ? 'CRITICAL' : i < 25 ? 'WARNING' : 'SUGGESTION',
        file: `file-${i}.ts`,
        rationale: 'x'.repeat(5_000),
        suggestion: 'y'.repeat(5_000),
      }),
    );
    const { payload } = formatReview(
      { ...REVIEW, findings: manyFindings },
      { runId: 'r', repo: 'acme/x', pr: 1, agent: 'a', maxFindings: 50, detailed: true },
    );
    const rendered = JSON.stringify(payload);
    expect(rendered.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    const severities = payload.findings.map((f) => f.severity);
    const lastCritical = severities.lastIndexOf('CRITICAL');
    const firstSuggestion = severities.indexOf('SUGGESTION');
    if (lastCritical !== -1 && firstSuggestion !== -1) {
      expect(lastCritical).toBeLessThan(firstSuggestion);
    }
    // Every CRITICAL finding must have survived the cap before any WARNING/SUGGESTION did.
    expect(payload.findings.filter((f) => f.severity === 'CRITICAL')).toHaveLength(5);
  });

  it('always appends the untrusted-content note', () => {
    const { summary } = formatReview(REVIEW, { runId: 'r', repo: 'acme/x', pr: 1, agent: 'a' });
    expect(summary).toContain(UNTRUSTED_NOTE);
  });
});

describe('formatConventions', () => {
  const ROWS: ConventionLite[] = [
    {
      id: 'c1',
      category: 'naming',
      rule: 'Use camelCase',
      rationale: 'consistency',
      evidence_path: 'src/a.ts',
      evidence_line: 10,
      evidence_snippet: 'const fooBar = 1;',
      confidence: 0.9,
      status: 'accepted',
    },
    {
      id: 'c2',
      category: 'errors',
      rule: 'Extend AppError',
      rationale: 'consistency',
      evidence_path: 'src/b.ts',
      evidence_line: 5,
      evidence_snippet: 'class X extends AppError {}',
      confidence: 0.8,
      status: 'accepted',
    },
    {
      id: 'c3',
      category: 'testing',
      rule: 'Name it *.it.test.ts',
      rationale: null,
      evidence_path: 'AGENTS.md',
      evidence_line: null,
      evidence_snippet: '...',
      confidence: 0.5,
      status: 'pending',
    },
  ];

  it('returns only accepted rows and reports pending separately', () => {
    const { payload } = formatConventions(ROWS, { repo: 'acme/x' });
    expect(payload.total_accepted).toBe(2);
    expect(payload.pending).toBe(1);
    expect(payload.rules).toHaveLength(2);
  });

  it('filters by category', () => {
    const { payload } = formatConventions(ROWS, { repo: 'acme/x', category: 'naming' });
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0]?.rule).toBe('Use camelCase');
  });

  it('caps at maxRules and reports omitted with a hint naming max_rules', () => {
    const { payload, summary } = formatConventions(ROWS, { repo: 'acme/x', maxRules: 1 });
    expect(payload.rules).toHaveLength(1);
    expect(payload.omitted).toBe(1);
    expect(summary).toContain('max_rules');
  });

  it('always appends the untrusted-content note', () => {
    const { summary } = formatConventions(ROWS, { repo: 'acme/x' });
    expect(summary).toContain(UNTRUSTED_NOTE);
  });
});

describe('formatAgents', () => {
  it('truncates descriptions to 160 chars and counts enabled agents', () => {
    const agents: AgentLite[] = [
      { id: '1', name: 'A', description: 'x'.repeat(300), model: 'm', enabled: true },
      { id: '2', name: 'B', description: 'short', model: 'm', enabled: false },
    ];
    const { agents: out, enabledCount, omitted } = formatAgents(agents);
    expect(out[0]?.description.length).toBeLessThanOrEqual(160);
    expect(enabledCount).toBe(1);
    expect(omitted).toBe(0);
  });

  it('caps an oversized name and model, not just description (security review M4)', () => {
    const agents: AgentLite[] = [
      { id: '1', name: 'n'.repeat(5_000), description: 'd', model: 'm'.repeat(5_000), enabled: true },
    ];
    const { agents: out } = formatAgents(agents);
    expect(out[0]?.name.length).toBeLessThanOrEqual(100);
    expect(out[0]?.model.length).toBeLessThanOrEqual(100);
  });

  it('enforces the MAX_RESPONSE_CHARS budget and reports omitted (security review M4)', () => {
    const agents: AgentLite[] = Array.from({ length: 500 }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent ${i}`.repeat(20),
      description: 'x'.repeat(160),
      model: 'some-model-name',
      enabled: true,
    }));
    const { agents: out, omitted } = formatAgents(agents);
    const rendered = JSON.stringify({ agents: out, omitted });
    expect(rendered.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(omitted).toBeGreaterThan(0);
    expect(out.length + omitted).toBe(agents.length);
  });
});

