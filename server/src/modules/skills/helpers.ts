import type { Skill, SkillType, SkillVersion } from '@devdigest/shared';
import { strFromU8, unzipSync } from 'fflate';
import { ValidationError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from './repository.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping, the
 * config-version-bump rule, and the (parse-only) import draft extraction.
 * No DB/network I/O; the zip helper only reads bytes already in memory.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    change_summary: row.changeSummary ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface SkillConfigPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  evidenceFiles?: string[];
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to
 * the existing row — a config change bumps the version and snapshots
 * skill_versions. Mirrors the agents module's `isConfigChange` rule.
 */
export function isConfigChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillConfigPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body) ||
    patch.evidenceFiles !== undefined
  );
}

/** The parse-only preview draft returned by `POST /skills/import`. */
export interface SkillImportDraft {
  name: string;
  description: string;
  body: string;
}

/**
 * Parse a minimal, flat `---\nkey: value\n---\nbody` frontmatter block (same
 * convention as this repo's own SKILL.md files under .claude/skills). Hand-rolled on
 * purpose — this repo does not add a YAML dependency for a trivially-simple
 * flat key:value block. Content with no frontmatter block is treated as body
 * only (name/description left blank for the caller to fill in).
 */
export function parseMarkdownFrontmatter(content: string): SkillImportDraft {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { name: '', description: '', body: content };
  }
  const meta: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '---') {
      i++;
      break;
    }
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const body = lines.slice(i).join('\n').replace(/^\n+/, '');
  return { name: meta.name ?? '', description: meta.description ?? '', body };
}

/**
 * Locate exactly one markdown file inside a base64-encoded zip archive
 * (prefer `SKILL.md`, else the only root-level `.md` file) and parse ITS TEXT
 * ONLY. Every other archive entry — scripts, binaries, nested files — is
 * discarded unread: never decoded, never executed, never written to disk.
 */
export function parseZipImport(base64: string): SkillImportDraft {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(Buffer.from(base64, 'base64'));
  } catch {
    throw new ValidationError('Could not read the uploaded archive as a zip file');
  }

  const mdEntries = Object.keys(files).filter(
    (key) => !key.endsWith('/') && key.toLowerCase().endsWith('.md'),
  );
  const skillMd = mdEntries.filter((key) => key.split('/').pop()?.toLowerCase() === 'skill.md');
  const rootMd = mdEntries.filter((key) => !key.includes('/'));
  const chosen = skillMd.length > 0 ? skillMd[0] : rootMd.length === 1 ? rootMd[0] : undefined;
  if (!chosen) {
    throw new ValidationError(
      'Archive must contain exactly one SKILL.md (or a single root-level .md file)',
    );
  }

  const text = strFromU8(files[chosen]!);
  return parseMarkdownFrontmatter(text);
}
