#!/usr/bin/env node
// Collects raw dependency facts for every package in the repo and prints one JSON
// document to stdout. No npm dependencies — Node built-ins + git + the package
// managers already on PATH. The skill interprets this JSON; the script never
// judges or prioritises anything itself.
//
// Usage: node collect-deps.mjs [--repo <root>] [--offline] [--out <file>]
//   --offline  skip `outdated` / `audit` (network) calls
//   --out      write JSON to a file instead of stdout

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ROOT = path.resolve(opt('--repo') ?? process.cwd());
const OFFLINE = flag('--offline');
const OUT = opt('--out');
const NET_TIMEOUT_MS = 90_000;

const warnings = [];

function run(cmd, cmdArgs, cwd, { timeout = 30_000, allowFail = true } = {}) {
  try {
    return execFileSync(cmd, cmdArgs, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // `npm outdated` / `audit` exit non-zero when they find something — stdout is still valid.
    if (err.stdout) return err.stdout;
    if (!allowFail) throw err;
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Some tools prefix warnings before the JSON body.
    const start = text.search(/[[{]/);
    if (start < 0) return null;
    try {
      return JSON.parse(text.slice(start));
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Package discovery — tracked + untracked-but-not-ignored package.json files.
//    Using git (not `find`) is what keeps clones/, .next/, node_modules/ out.
// ---------------------------------------------------------------------------

function discoverPackages() {
  const listed = [
    run('git', ['ls-files', '--', '*package.json'], ROOT),
    run('git', ['ls-files', '--others', '--exclude-standard', '--', '*package.json'], ROOT),
  ]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.includes('node_modules/'));
  const dirs = [...new Set(listed.map((f) => path.dirname(f)))].sort();
  return dirs.map((rel) => ({ rel: rel === '.' ? '.' : rel, abs: path.join(ROOT, rel) }));
}

// ---------------------------------------------------------------------------
// 2. Size helpers — own size of a package dir, excluding nested node_modules,
//    cached by realpath so pnpm's shared store is never counted twice.
// ---------------------------------------------------------------------------

const sizeCache = new Map();

function dirOwnSize(dir) {
  if (sizeCache.has(dir)) return sizeCache.get(dir);
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try {
          total += fs.statSync(p).size;
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  }
  sizeCache.set(dir, total);
  return total;
}

function duBytes(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = run('du', ['-sk', dir], ROOT, { timeout: 120_000 });
  const kb = out ? Number.parseInt(out.split(/\s+/)[0], 10) : NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

// Node-style resolution: walk up from `fromDir` looking for node_modules/<name>.
// Works for both npm's flat layout and pnpm's symlinked .pnpm layout.
function resolvePkgDir(name, fromDir, stopAt) {
  let cur = fromDir;
  for (;;) {
    const candidate = path.join(cur, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      try {
        return fs.realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur || cur === path.dirname(stopAt)) return null;
    cur = parent;
  }
}

// Transitive closure of runtime deps (dependencies + optionalDependencies) of one
// installed package. Returns the set of realpaths, including the package itself.
function closure(rootDir, stopAt) {
  const seen = new Set([rootDir]);
  const queue = [rootDir];
  while (queue.length) {
    const dir = queue.shift();
    const pj = readJson(path.join(dir, 'package.json')) ?? {};
    const names = Object.keys({ ...(pj.dependencies ?? {}), ...(pj.optionalDependencies ?? {}) });
    for (const n of names) {
      const resolved = resolvePkgDir(n, dir, stopAt);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// 3. Usage heuristic — is a declared dep imported anywhere in the package?
//    Deliberately cheap (grep over source + config + scripts). Results are
//    "candidates", never facts — the skill must say so in the report.
// ---------------------------------------------------------------------------

// Source + stylesheets (Tailwind v4 is `@import "tailwindcss"`) + tsconfig (its
// `types: ["node"]` is how @types/node is consumed).
const SOURCE_EXT = /(\.(c|m)?(t|j)sx?|\.s?css|^tsconfig.*\.json)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'out', 'coverage', 'clones', '.turbo']);

function collectSourceText(pkgAbs, nestedPkgDirs) {
  const chunks = [];
  const stack = [pkgAbs];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.') || nestedPkgDirs.has(p)) continue;
        stack.push(p);
      } else if (e.isFile() && (SOURCE_EXT.test(e.name) || /^(\.?[\w-]+rc(\.\w+)?|.*\.config\.\w+)$/.test(e.name))) {
        try {
          const st = fs.statSync(p);
          if (st.size < 512 * 1024) chunks.push(fs.readFileSync(p, 'utf8'));
        } catch {
          /* skip */
        }
      }
    }
  }
  // dotfile configs at package root (.eslintrc.cjs etc.) are skipped by the walk above
  for (const f of fs.readdirSync(pkgAbs)) {
    if (f.startsWith('.') && /rc|config/.test(f)) {
      try {
        chunks.push(fs.readFileSync(path.join(pkgAbs, f), 'utf8'));
      } catch {
        /* skip */
      }
    }
  }
  return chunks.join('\n');
}

function isReferenced(name, sourceText, scriptsText, binNames) {
  const target = name.startsWith('@types/')
    ? name.slice('@types/'.length).replace(/^(.+)__(.+)$/, '@$1/$2')
    : name;
  const esc = target.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const importRe = new RegExp(`['"\`]${esc}(/[^'"\`]*)?['"\`]`);
  if (importRe.test(sourceText)) return true;
  if (name === '@types/node' && /['"]node:[\w/]+['"]/.test(sourceText)) return true;
  if (binNames.some((b) => new RegExp(`(^|[\\s;&|(])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'm').test(scriptsText))) return true;
  return false;
}

function binNamesOf(installedDir, name) {
  if (!installedDir) return [name.split('/').pop()];
  const pj = readJson(path.join(installedDir, 'package.json')) ?? {};
  if (typeof pj.bin === 'string') return [name.split('/').pop()];
  if (pj.bin && typeof pj.bin === 'object') return Object.keys(pj.bin);
  return [];
}

// ---------------------------------------------------------------------------
// 4. Internal (cross-package) edges — tsconfig `paths` aliases pointing outside
//    the package, plus relative/workspace specifiers in package.json.
// ---------------------------------------------------------------------------

// JSONC → JSON. String-aware, so globs like "src/**/*.ts" are not mistaken for comments.
function stripJsonComments(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function internalEdges(pkg, allPkgs) {
  const edges = [];
  for (const tsName of fs.readdirSync(pkg.abs).filter((f) => /^tsconfig.*\.json$/.test(f))) {
    let cfg;
    try {
      cfg = JSON.parse(stripJsonComments(fs.readFileSync(path.join(pkg.abs, tsName), 'utf8')));
    } catch {
      warnings.push(`could not parse ${pkg.rel}/${tsName}`);
      continue;
    }
    const baseUrl = path.resolve(pkg.abs, cfg.compilerOptions?.baseUrl ?? '.');
    for (const [alias, targets] of Object.entries(cfg.compilerOptions?.paths ?? {})) {
      for (const t of targets) {
        const abs = path.resolve(baseUrl, t.replace(/\*.*$/, ''));
        const relToRoot = path.relative(ROOT, abs);
        const owner = allPkgs
          .filter((p) => p.rel !== pkg.rel && (relToRoot === p.rel || relToRoot.startsWith(p.rel + path.sep)))
          .sort((a, b) => b.rel.length - a.rel.length)[0];
        const insideSelf = relToRoot === pkg.rel || relToRoot.startsWith(pkg.rel + path.sep) || pkg.rel === '.';
        if (owner && !(insideSelf && owner.rel.startsWith(pkg.rel))) {
          edges.push({ from: pkg.rel, to: owner.rel, via: `tsconfig paths (${tsName})`, alias, target: path.relative(ROOT, abs) });
        } else if (!insideSelf) {
          edges.push({ from: pkg.rel, to: relToRoot, via: `tsconfig paths (${tsName})`, alias, target: relToRoot, note: 'target is not a discovered package' });
        } else if (/vendor/.test(relToRoot)) {
          edges.push({ from: pkg.rel, to: relToRoot, via: `tsconfig paths (${tsName})`, alias, target: relToRoot, note: 'vendored copy inside this package' });
        }
      }
    }
  }
  const pj = readJson(path.join(pkg.abs, 'package.json')) ?? {};
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [n, spec] of Object.entries(pj[field] ?? {})) {
      if (/^(file:|link:|workspace:|\.\.?\/)/.test(spec)) edges.push({ from: pkg.rel, to: spec, via: `package.json ${field}`, alias: n });
    }
  }
  // dedupe identical alias→owner pairs coming from several tsconfig files
  const seen = new Set();
  return edges.filter((e) => {
    const k = `${e.from}|${e.to}|${e.alias}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 5. Network checks — outdated + audit, via whichever manager owns the lockfile.
// ---------------------------------------------------------------------------

function managerFor(pkgAbs) {
  const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb'].filter((f) => fs.existsSync(path.join(pkgAbs, f)));
  const installedWith = fs.existsSync(path.join(pkgAbs, 'node_modules', '.pnpm'))
    ? 'pnpm'
    : fs.existsSync(path.join(pkgAbs, 'node_modules', '.package-lock.json'))
      ? 'npm'
      : fs.existsSync(path.join(pkgAbs, 'node_modules'))
        ? 'unknown'
        : null;
  const lockManager = lockfiles.includes('pnpm-lock.yaml') ? 'pnpm' : lockfiles.includes('package-lock.json') ? 'npm' : lockfiles.length ? lockfiles[0] : null;
  return { lockfiles, lockManager, installedWith };
}

function outdated(pkgAbs, manager) {
  if (manager === 'pnpm') {
    const raw = parseJsonLoose(run('pnpm', ['outdated', '--format', 'json'], pkgAbs, { timeout: NET_TIMEOUT_MS }));
    if (!raw) return null;
    return Object.entries(raw).map(([name, v]) => ({ name, current: v.current, wanted: v.wanted, latest: v.latest, dependencyType: v.dependencyType }));
  }
  if (manager === 'npm') {
    const raw = parseJsonLoose(run('npm', ['outdated', '--json', '--long'], pkgAbs, { timeout: NET_TIMEOUT_MS }));
    if (!raw) return null;
    return Object.entries(raw).map(([name, v]) => ({ name, current: v.current, wanted: v.wanted, latest: v.latest, dependencyType: v.type }));
  }
  return null;
}

function audit(pkgAbs, manager) {
  const cmd = manager === 'pnpm' ? ['pnpm', ['audit', '--json']] : manager === 'npm' ? ['npm', ['audit', '--json']] : null;
  if (!cmd) return null;
  const raw = parseJsonLoose(run(cmd[0], cmd[1], pkgAbs, { timeout: NET_TIMEOUT_MS }));
  if (!raw) return null;
  if (raw.error) return { error: raw.error.summary ?? raw.error.code ?? String(raw.error) };
  const counts = raw.metadata?.vulnerabilities ?? null;
  const items = [];
  if (raw.advisories) {
    // pnpm format
    for (const a of Object.values(raw.advisories)) {
      items.push({
        name: a.module_name,
        severity: a.severity,
        title: a.title,
        vulnerableVersions: a.vulnerable_versions,
        patchedVersions: a.patched_versions,
        paths: (a.findings ?? []).flatMap((f) => f.paths ?? []).slice(0, 5),
        url: a.url,
      });
    }
  } else if (raw.vulnerabilities) {
    // npm v7+ format
    for (const [name, v] of Object.entries(raw.vulnerabilities)) {
      const via = (v.via ?? []).filter((x) => typeof x === 'object');
      items.push({
        name,
        severity: v.severity,
        title: via.map((x) => x.title).filter(Boolean).join('; ') || `via ${(v.via ?? []).join(', ')}`,
        vulnerableVersions: v.range,
        fixAvailable: v.fixAvailable,
        direct: v.isDirect,
        url: via.map((x) => x.url).find(Boolean),
      });
    }
  }
  return { counts, items };
}

// ---------------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------------

const pkgs = discoverPackages();
const nestedDirsOf = (pkg) => new Set(pkgs.filter((p) => p.rel !== pkg.rel && (pkg.rel === '.' || p.rel.startsWith(pkg.rel + '/'))).map((p) => p.abs));

const result = {
  generatedAt: new Date().toISOString(),
  repoRoot: ROOT,
  gitHead: run('git', ['rev-parse', '--short', 'HEAD'], ROOT)?.trim() ?? null,
  gitBranch: run('git', ['branch', '--show-current'], ROOT)?.trim() ?? null,
  offline: OFFLINE,
  packages: [],
  internalEdges: [],
  sharedDeps: [],
  warnings,
};

for (const pkg of pkgs) {
  const pj = readJson(path.join(pkg.abs, 'package.json'));
  if (!pj) {
    warnings.push(`unreadable package.json in ${pkg.rel}`);
    continue;
  }
  const mgr = managerFor(pkg.abs);
  const nmDir = path.join(pkg.abs, 'node_modules');
  const hasNodeModules = fs.existsSync(nmDir);
  const sourceText = collectSourceText(pkg.abs, nestedDirsOf(pkg));
  const scriptsText = Object.values(pj.scripts ?? {}).join('\n');

  const deps = [];
  const closureNames = new Map(); // direct dep → { kind, names in its runtime closure }
  const kinds = [
    ['dependencies', 'prod'],
    ['devDependencies', 'dev'],
    ['peerDependencies', 'peer'],
    ['optionalDependencies', 'optional'],
  ];
  for (const [field, kind] of kinds) {
    for (const [name, spec] of Object.entries(pj[field] ?? {})) {
      const installedDir = hasNodeModules ? resolvePkgDir(name, pkg.abs, pkg.abs) : null;
      const installedPj = installedDir ? readJson(path.join(installedDir, 'package.json')) : null;
      let ownBytes = null;
      let closureBytes = null;
      let closureCount = null;
      if (installedDir) {
        ownBytes = dirOwnSize(installedDir);
        const set = closure(installedDir, pkg.abs);
        closureCount = set.size;
        closureNames.set(name, { kind, names: new Set([...set].map((d) => readJson(path.join(d, 'package.json'))?.name).filter(Boolean)) });
        closureBytes = [...set].reduce((s, d) => s + dirOwnSize(d), 0);
      }
      deps.push({
        name,
        kind,
        spec,
        installedVersion: installedPj?.version ?? null,
        installed: Boolean(installedDir),
        ownBytes,
        closureBytes,
        closurePackages: closureCount,
        deprecated: installedPj?.deprecated ?? null,
        license: typeof installedPj?.license === 'string' ? installedPj.license : installedPj?.license?.type ?? null,
        referencedInSource: isReferenced(name, sourceText, scriptsText, binNamesOf(installedDir, name)),
      });
    }
  }

  let outdatedList = null;
  let auditResult = null;
  const netManager = mgr.lockManager === 'pnpm' || mgr.lockManager === 'npm' ? mgr.lockManager : null;
  if (!OFFLINE && netManager && deps.length) {
    outdatedList = outdated(pkg.abs, netManager);
    if (outdatedList === null) warnings.push(`${pkg.rel}: ${netManager} outdated returned no parseable output`);
    auditResult = audit(pkg.abs, netManager);
    if (auditResult === null) warnings.push(`${pkg.rel}: ${netManager} audit returned no parseable output`);
    // Which direct deps pull each vulnerable package in, and is any of them prod?
    // This is what separates "ships to users" from "only on a dev machine".
    for (const item of auditResult?.items ?? []) {
      item.reachedVia = [...closureNames]
        .filter(([, c]) => c.names.has(item.name))
        .map(([dep, c]) => ({ dep, kind: c.kind }));
      item.inProd = item.reachedVia.some((r) => r.kind === 'prod' || r.kind === 'optional' || r.kind === 'peer');
    }
  }

  result.packages.push({
    path: pkg.rel,
    name: pj.name ?? null,
    version: pj.version ?? null,
    private: Boolean(pj.private),
    type: pj.type ?? 'commonjs',
    engines: pj.engines ?? null,
    packageManagerField: pj.packageManager ?? null,
    ...mgr,
    lockfileDrift: Boolean(mgr.lockManager && mgr.installedWith && mgr.installedWith !== 'unknown' && mgr.lockManager !== mgr.installedWith),
    hasNodeModules,
    nodeModulesBytes: hasNodeModules ? duBytes(nmDir) : null,
    counts: Object.fromEntries(kinds.map(([, k]) => [k, deps.filter((d) => d.kind === k).length])),
    deps,
    outdated: outdatedList,
    audit: auditResult,
  });
  result.internalEdges.push(...internalEdges(pkg, pkgs));
}

// Same dependency declared in more than one package — version drift lives here.
const byName = new Map();
for (const p of result.packages) {
  for (const d of p.deps) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push({ package: p.path, kind: d.kind, spec: d.spec, installedVersion: d.installedVersion });
  }
}
for (const [name, uses] of byName) {
  if (uses.length < 2) continue;
  const versions = [...new Set(uses.map((u) => u.installedVersion ?? u.spec))];
  const majors = [...new Set(uses.map((u) => (u.installedVersion ?? u.spec.replace(/^[^\d]*/, '')).split('.')[0]))];
  result.sharedDeps.push({ name, uses, distinctVersions: versions, majorDrift: majors.length > 1 });
}
result.sharedDeps.sort((a, b) => Number(b.majorDrift) - Number(a.majorDrift) || b.uses.length - a.uses.length);

const json = JSON.stringify(result, null, 2);
if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, json);
  process.stderr.write(`wrote ${OUT} (${result.packages.length} packages, ${warnings.length} warnings)\n`);
} else {
  process.stdout.write(json + '\n');
}
