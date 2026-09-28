import { describe, expect, it } from 'vitest';
import {
  formatAgents,
  formatBlast,
  formatConventions,
  formatFindingsList,
  formatReview,
} from '../src/domain/format.js';
import type { BlastLite, FindingLite, ReviewLite, ConventionLite, AgentLite } from '../src/domain/ports.js';
import { BLAST_UNTRUSTED_NOTE, UNTRUSTED_NOTE, MAX_RESPONSE_CHARS } from '../src/domain/tool-result.js';

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

describe('formatFindingsList', () => {
  const SECOND_REVIEW: ReviewLite = {
    id: 'review-2',
    run_id: 'run-2',
    agent_id: 'agent-2',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks fine.',
    score: 90,
    created_at: '2026-09-19T10:00:00.000Z',
    findings: [finding({ severity: 'WARNING', file: 'c.ts', title: 'nit' })],
  };

  it('one review per agent, sorted most-severe (CRITICAL count) first, not alphabetically', () => {
    // REVIEW's agent ('General Reviewer') has 1 CRITICAL; SECOND_REVIEW's
    // agent ('Security Reviewer') sorts first alphabetically but has none —
    // it must still come second.
    const { payload } = formatFindingsList([REVIEW, SECOND_REVIEW], { repo: 'acme/x', pr: 1 });
    expect(payload.reviews.map((r) => r.agent)).toEqual(['General Reviewer', 'Security Reviewer']);
    expect(payload.total_findings).toBe(4);
    expect(payload.counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
  });

  it('min_severity filters findings in every review; total_findings counts after filtering', () => {
    const { payload } = formatFindingsList([REVIEW, SECOND_REVIEW], {
      repo: 'acme/x',
      pr: 1,
      minSeverity: 'CRITICAL',
    });
    // REVIEW keeps its 1 CRITICAL; SECOND_REVIEW's lone WARNING is filtered out.
    expect(payload.total_findings).toBe(1);
    const secondReview = payload.reviews.find((r) => r.agent === 'Security Reviewer');
    expect(secondReview?.findings_count).toBe(0);
    expect(secondReview?.findings).toEqual([]);
  });

  it('max_findings caps findings across the whole payload, keeping severity ordering, and sets truncated', () => {
    const { payload } = formatFindingsList([REVIEW, SECOND_REVIEW], {
      repo: 'acme/x',
      pr: 1,
      maxFindings: 1,
    });
    const totalRendered = payload.reviews.reduce((sum, r) => sum + r.findings.length, 0);
    expect(totalRendered).toBe(1);
    expect(payload.truncated).toBe(true);
    // The single kept finding comes from the more severe (first-sorted) review.
    expect(payload.reviews[0]?.findings[0]?.severity).toBe('CRITICAL');
    // findings_count still reports each review's true total, unaffected by the cap.
    expect(payload.reviews.find((r) => r.agent === 'General Reviewer')?.findings_count).toBe(3);
  });

  it('enforces the MAX_RESPONSE_CHARS budget by shrinking findings, never dropping a review', () => {
    const manyFindingsReview: ReviewLite = {
      ...REVIEW,
      findings: Array.from({ length: 200 }, (_, i) =>
        finding({ severity: 'WARNING', file: `f${i}.ts`, rationale: 'x'.repeat(2_000) }),
      ),
    };
    // maxFindings deliberately way above the count involved — the truncation
    // under test here is the char-budget one, not the max_findings cap.
    const { payload } = formatFindingsList([manyFindingsReview, SECOND_REVIEW], {
      repo: 'acme/x',
      pr: 1,
      maxFindings: 1_000,
    });
    const rendered = JSON.stringify(payload);
    expect(rendered.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(payload.truncated).toBe(true);
    expect(payload.reviews).toHaveLength(2);
    // findings_count still reports the true (pre-budget-cap) total.
    expect(payload.reviews.find((r) => r.agent === 'General Reviewer')?.findings_count).toBe(200);
  });

  it('summary line names the agent count, total findings, and the untrusted-content note', () => {
    const { summary } = formatFindingsList([REVIEW, SECOND_REVIEW], { repo: 'acme/x', pr: 7 });
    expect(summary).toContain('2 agent(s) reviewed acme/x#7');
    expect(summary).toContain('4 finding(s)');
    expect(summary).toContain('1 CRITICAL');
    expect(summary).toContain(UNTRUSTED_NOTE);
  });

  it('handles an empty review list without crashing', () => {
    const { payload, summary } = formatFindingsList([], { repo: 'acme/x', pr: 1 });
    expect(payload.reviews).toEqual([]);
    expect(payload.total_findings).toBe(0);
    expect(summary).toContain('0 agent(s)');
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

describe('formatBlast', () => {
  const BASE_BLAST: BlastLite = {
    changed_symbols: [{ name: 'rateLimit', file: 'src/lib/rate.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 }],
        endpoints_affected: ['GET /api/public/items'],
        crons_affected: ['job:reset-rate-buckets'],
      },
    ],
    summary: '1 changed symbol(s) reach 1 caller(s); 1 endpoint(s) and 1 cron(s) may be affected.',
    counts: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
    degraded: false,
    reason: null,
    callers_truncated: false,
    files: { changed: 1, indexed: 1 },
    indexed_branch: 'main',
  };

  it('passes the downstream map through unchanged and includes the untrusted-content note', () => {
    const { summary, payload } = formatBlast(BASE_BLAST, { repo: 'acme/api', pr: 482 });
    expect(summary).toBe(BASE_BLAST.summary);
    expect(payload).toMatchObject({
      repo: 'acme/api',
      pr: 482,
      downstream: BASE_BLAST.downstream,
      changed_symbols: ['rateLimit'],
      changed_symbols_total: 1,
      truncated: false,
      note: BLAST_UNTRUSTED_NOTE,
      files: BASE_BLAST.files,
      indexed_branch: BASE_BLAST.indexed_branch,
    });
  });

  it('appends the degraded-reason hint to the summary line when degraded', () => {
    const { summary } = formatBlast(
      { ...BASE_BLAST, degraded: true, reason: 'no_data' },
      { repo: 'acme/api', pr: 482 },
    );
    expect(summary).toContain('Index incomplete (no_data)');
    expect(summary).toContain('resync the repo in DevDigest');
  });

  it('drops changed_symbols then trims downstream from the end when the payload is oversized, and sets truncated: true', () => {
    const huge: BlastLite = {
      ...BASE_BLAST,
      changed_symbols: Array.from({ length: 200 }, (_, i) => ({
        name: `symbol${i}`,
        file: `src/file${i}.ts`,
        kind: 'function',
      })),
      downstream: Array.from({ length: 200 }, (_, i) => ({
        symbol: `symbol${i}`,
        callers: Array.from({ length: 20 }, (_, j) => ({
          name: `caller${j}`,
          file: `src/caller${i}_${j}.ts`,
          line: j + 1,
        })),
        endpoints_affected: [`GET /api/x${i}`],
        crons_affected: [`job:cron${i}`],
      })),
    };
    const { summary, payload } = formatBlast(huge, { repo: 'acme/api', pr: 482 });
    const rendered = JSON.stringify(payload);
    // The `+ 1` is the `\n` `ok()` joins summary + JSON with (tool-result.ts)
    // — the full rendered tool text must stay within MAX_RESPONSE_CHARS, not
    // just the JSON payload on its own.
    expect(summary.length + 1 + rendered.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect((payload as { truncated: boolean }).truncated).toBe(true);
    expect((payload as { changed_symbols: string[] }).changed_symbols).toEqual([]);
    expect((payload as { downstream: unknown[] }).downstream.length).toBeLessThan(huge.downstream.length);
  });
});

