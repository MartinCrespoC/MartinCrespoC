/**
 * Nebula Cosmica — self-hosted profile metrics generator.
 *
 * Builds three SVG card sets from the GitHub API, replacing flaky
 * third-party stat services with CI-generated assets we fully control.
 * Every card is emitted in dark and light variants so the README can
 * switch with <picture> + prefers-color-scheme:
 *   assets/generated/stats.svg / stats.light.svg — HUD metric chips
 *   assets/generated/langs.svg / langs.light.svg — top languages bar
 *   assets/generated/repos.svg / repos.light.svg — featured repo cards
 *
 * Usage:
 *   GH_TOKEN=<token> GH_USER=MartinCrespoC node scripts/generate-stats.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const USER = process.env.GH_USER || 'MartinCrespoC';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'generated');

const THEMES = {
  dark: {
    bg: '#0B0E2A',
    glass: '#161B40',
    glassOpacity: 0.55,
    cyan: '#00E5FF',
    violet: '#7C4DFF',
    magenta: '#FF2D78',
    text: '#FFFFFF',
    muted: '#A0ABC0',
    dim: '#5A6B8C',
    bracketOpacity: 0.7,
  },
  light: {
    bg: '#F5F7FE',
    glass: '#E9EDFB',
    glassOpacity: 0.9,
    cyan: '#00A8C8',
    violet: '#6D3FE8',
    magenta: '#E0218A',
    text: '#151A3C',
    muted: '#4A5578',
    dim: '#8A93B8',
    bracketOpacity: 0.85,
  },
};

const LANG_COLORS = {
  'C++': '#f34b7d', C: '#A0ABC0', Python: '#3572A5', JavaScript: '#f1e05a',
  TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
  Dockerfile: '#384d54', Go: '#00ADD8', Rust: '#dea584', Java: '#b07219',
  'Jupyter Notebook': '#DA5B0B', Ruby: '#701516', PHP: '#4F5D95',
};
const LANG_COLORS_LIGHT = { ...LANG_COLORS, C: '#6A7390', JavaScript: '#B89A00', Shell: '#5FA038' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtNum = (n) => (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function wrapText(s, width) {
  const lines = [''];
  for (const word of s.split(/\s+/)) {
    const cur = lines[lines.length - 1];
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > width && cur) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  return lines;
}

async function api(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      'User-Agent': 'nebula-profile-generator',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${endpoint}`);
  return res.json();
}

/* ---------- data ---------- */

async function collectData() {
  const [user, repos, commitSearch, prSearch, issueSearch] = await Promise.all([
    api(`/users/${USER}`),
    api(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`),
    api(`/search/commits?q=author:${USER}&per_page=1`),
    api(`/search/issues?q=author:${USER}+type:pr&per_page=1`),
    api(`/search/issues?q=author:${USER}+type:issue&per_page=1`),
  ]);

  const stars = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const forks = repos.reduce((s, r) => s + r.forks_count, 0);

  const langBytes = {};
  await Promise.all(
    repos.map(async (r) => {
      const langs = await api(`/repos/${USER}/${r.name}/languages`);
      for (const [lang, bytes] of Object.entries(langs)) {
        langBytes[lang] = (langBytes[lang] || 0) + bytes;
      }
    })
  );

  /* Featured repos: explicit list from profile.config.json wins; otherwise auto-pick */
  let featured;
  const configPath = path.join(__dirname, '..', 'profile.config.json');
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  if (Array.isArray(config.featuredRepos) && config.featuredRepos.length) {
    featured = (await Promise.all(
      config.featuredRepos.slice(0, 3).map(async (name) => {
        try {
          return await api(`/repos/${USER}/${name}`);
        } catch {
          console.error(`featured repo not found: ${name} (skipped)`);
          return null;
        }
      })
    )).filter(Boolean);
  } else {
    featured = [...repos]
      .sort((a, b) => Number(a.fork) - Number(b.fork) || b.stargazers_count - a.stargazers_count)
      .filter((r) => r.name.toLowerCase() !== USER.toLowerCase())
      .slice(0, 3);
  }

  return {
    user,
    stars,
    forks,
    commits: commitSearch.total_count,
    prs: prSearch.total_count,
    issues: issueSearch.total_count,
    langBytes,
    featured,
  };
}

/* ---------- shared svg bits ---------- */

const DEFS = `
  <defs>
    <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="2.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="num-glow" x="-40%" y="-80%" width="180%" height="260%">
      <feGaussianBlur stdDeviation="3.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

const brackets = (x, y, w, h, C) => `
    <g stroke="${C.cyan}" stroke-width="1.6" opacity="${C.bracketOpacity}" fill="none">
      <path d="M ${x} ${y + 12} V ${y} H ${x + 12}"/>
      <path d="M ${x + w} ${y + h - 12} V ${y + h} H ${x + w - 12}"/>
    </g>`;

const bgRect = (w, h, C) => `  <rect width="${w}" height="${h}" rx="12" fill="${C.bg}"/>`;

const MONO = "Consolas, 'Courier New', monospace";
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/* ---------- stats.svg ---------- */

function renderStats(d, C) {
  const cards = [
    { label: 'TOTAL STARS', value: fmtNum(d.stars), accent: C.cyan, icon: 'star' },
    { label: 'COMMITS', value: fmtNum(d.commits), accent: C.violet, icon: 'commit' },
    { label: 'PULL REQUESTS', value: fmtNum(d.prs), accent: C.magenta, icon: 'pr' },
    { label: 'ISSUES', value: fmtNum(d.issues), accent: C.cyan, icon: 'issue' },
    { label: 'FOLLOWERS', value: fmtNum(d.user.followers), accent: C.violet, icon: 'people' },
    { label: 'PUBLIC REPOS', value: fmtNum(d.user.public_repos), accent: C.magenta, icon: 'repo' },
  ];

  const W = 1200, H = 150, CW = 183, CH = 106, GAP = 12, X0 = 15, Y0 = 22;

  const icon = (name, x, y, color) => {
    const g = `stroke="${color}" stroke-width="1.6" fill="none"`;
    switch (name) {
      case 'star':
        return `<path d="M ${x} ${y - 6} L ${x + 1.8} ${y - 1.8} L ${x + 6} ${y - 1.2} L ${x + 2.7} ${y + 1.9} L ${x + 3.6} ${y + 6} L ${x} ${y + 3.4} L ${x - 3.6} ${y + 6} L ${x - 2.7} ${y + 1.9} L ${x - 6} ${y - 1.2} L ${x - 1.8} ${y - 1.8} Z" fill="${color}" opacity="0.9"/>`;
      case 'commit':
        return `<circle cx="${x - 6}" cy="${y}" r="2.6" ${g}/><circle cx="${x + 6}" cy="${y}" r="2.6" ${g}/><line x1="${x - 3.4}" y1="${y}" x2="${x + 3.4}" y2="${y}" ${g}/>`;
      case 'pr':
        return `<circle cx="${x - 5}" cy="${y - 5}" r="2.4" ${g}/><circle cx="${x - 5}" cy="${y + 5}" r="2.4" ${g}/><circle cx="${x + 5}" cy="${y + 5}" r="2.4" ${g}/><path d="M ${x - 5} ${y - 2.6} V ${y + 2.6} M ${x - 5} ${y - 3} C ${x + 5} ${y - 3} ${x + 5} ${y} ${x + 5} ${y + 2.6}" ${g}/>`;
      case 'issue':
        return `<circle cx="${x}" cy="${y}" r="5.4" ${g}/><circle cx="${x}" cy="${y}" r="1.4" fill="${color}"/>`;
      case 'people':
        return `<circle cx="${x - 3.5}" cy="${y - 2.5}" r="2.6" ${g}/><path d="M ${x - 8.5} ${y + 6} C ${x - 8.5} ${y + 1} ${x + 1.5} ${y + 1} ${x + 1.5} ${y + 6}" ${g}/><circle cx="${x + 4.5}" cy="${y - 1.5}" r="2.1" ${g}/><path d="M ${x + 8.5} ${y + 6} C ${x + 8.5} ${y + 2.5} ${x + 3} ${y + 2.2} ${x + 1.8} ${y + 3.4}" ${g}/>`;
      case 'repo':
        return `<rect x="${x - 5.5}" y="${y - 5.5}" width="11" height="11" rx="2" ${g}/><line x1="${x - 2.5}" y1="${y - 5.5}" x2="${x - 2.5}" y2="${y + 1}" ${g}/>`;
      default:
        return '';
    }
  };

  const parts = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub metrics">`, DEFS, bgRect(W, H, C)];

  cards.forEach((card, i) => {
    const x = X0 + i * (CW + GAP);
    parts.push(`  <g>
    <rect x="${x}" y="${Y0}" width="${CW}" height="${CH}" rx="10" fill="${C.glass}" fill-opacity="${C.glassOpacity}" stroke="${card.accent}" stroke-opacity="0.3"/>
    <rect x="${x}" y="${Y0}" width="${CW}" height="3" rx="1.5" fill="${card.accent}" opacity="0.85">
      <animate attributeName="opacity" values="0.85;0.4;0.85" dur="${(2 + i * 0.4).toFixed(1)}s" repeatCount="indefinite"/>
    </rect>
    ${brackets(x, Y0, CW, CH, C)}
    ${icon(card.icon, x + 22, Y0 + 26, card.accent)}
    <text x="${x + CW - 14}" y="${Y0 + 30}" text-anchor="end" font-family="${MONO}" font-size="9.5" letter-spacing="1.6" fill="${C.dim}">${card.label}</text>
    <text x="${x + 16}" y="${Y0 + 78}" font-family="${SANS}" font-weight="800" font-size="34" fill="${C.text}" filter="url(#num-glow)">${card.value}</text>
    <circle cx="${x + CW - 16}" cy="${Y0 + CH - 16}" r="2.4" fill="${card.accent}">
      <animate attributeName="opacity" values="1;0.2;1" dur="${(1.6 + i * 0.25).toFixed(2)}s" repeatCount="indefinite"/>
    </circle>
  </g>`);
  });

  parts.push('</svg>');
  return parts.join('\n');
}

/* ---------- langs.svg ---------- */

function renderLangs(d, C, langColors) {
  const W = 1200, H = 158;
  const entries = Object.entries(d.langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((s, [, b]) => s + b, 0) || 1;

  const parts = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Top languages">`, DEFS, bgRect(W, H, C)];

  parts.push(`  <text x="24" y="30" font-family="${MONO}" font-size="11" letter-spacing="4" fill="${C.cyan}">LANGUAGE GRID</text>`);
  parts.push(`  <text x="${W - 24}" y="30" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="2" fill="${C.dim}">BYTES ACROSS PUBLIC REPOS</text>`);

  const BX = 24, BW = W - 48, BY = 46, BH = 22;
  let cursor = BX;
  entries.forEach(([lang, bytes], i) => {
    const w = Math.max((bytes / total) * BW, 4);
    const color = langColors[lang] || C.violet;
    const rx = i === 0 || i === entries.length - 1 ? 5 : 0;
    parts.push(`  <rect x="${cursor.toFixed(1)}" y="${BY}" width="${w.toFixed(1)}" height="${BH}" rx="${rx}" fill="${color}" opacity="0.9">
    <animate attributeName="opacity" values="0.9;0.65;0.9" dur="${(2.6 + i * 0.5).toFixed(1)}s" repeatCount="indefinite"/>
  </rect>`);
    cursor += w;
  });

  const cols = 3;
  entries.forEach(([lang, bytes], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 24 + col * 390;
    const y = 96 + row * 30;
    const pct = ((bytes / total) * 100).toFixed(1);
    const color = langColors[lang] || C.violet;
    parts.push(`  <g>
    <circle cx="${x + 5}" cy="${y - 4}" r="4.5" fill="${color}" filter="url(#glow)"/>
    <text x="${x + 18}" y="${y}" font-family="${SANS}" font-weight="600" font-size="13.5" fill="${C.text}">${esc(lang)}</text>
    <text x="${x + 330}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${C.muted}">${pct}%</text>
  </g>`);
  });

  parts.push('</svg>');
  return parts.join('\n');
}

/* ---------- repos.svg ---------- */

function renderRepos(d, C, langColors) {
  const W = 1200, H = 210, CW = 380, CH = 166, GAP = 15, X0 = 15, Y0 = 22;

  const parts = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Featured repositories">`, DEFS, bgRect(W, H, C)];

  d.featured.forEach((r, i) => {
    const x = X0 + i * (CW + GAP);
    const accent = [C.cyan, C.violet, C.magenta][i % 3];
    const langColor = langColors[r.language] || C.dim;
    const descLines = wrapText(r.description || 'No description provided.', 48);
    const descOverflow = descLines.length > 2;
    const desc1 = descLines[0] || '';
    const desc2 = descOverflow ? descLines[1] + ' …' : (descLines[1] || '');
    const name = truncate(r.name, 30);
    parts.push(`  <g>
    <rect x="${x}" y="${Y0}" width="${CW}" height="${CH}" rx="10" fill="${C.glass}" fill-opacity="${C.glassOpacity}" stroke="${accent}" stroke-opacity="0.3"/>
    ${brackets(x, Y0, CW, CH, C)}
    <text x="${x + 16}" y="${Y0 + 34}" font-family="${SANS}" font-weight="700" font-size="16.5" fill="${accent}">${esc(name)}</text>
    ${r.fork ? `<text x="${x + CW - 16}" y="${Y0 + 32}" text-anchor="end" font-family="${MONO}" font-size="9.5" letter-spacing="2" fill="${C.dim}">FORK</text>` : ''}
    <text x="${x + 16}" y="${Y0 + 62}" font-family="${SANS}" font-size="12.5" fill="${C.muted}">${esc(desc1)}</text>
    <text x="${x + 16}" y="${Y0 + 82}" font-family="${SANS}" font-size="12.5" fill="${C.muted}">${esc(desc2)}</text>
    <circle cx="${x + 21}" cy="${Y0 + CH - 24}" r="5" fill="${langColor}" filter="url(#glow)"/>
    <text x="${x + 34}" y="${Y0 + CH - 20}" font-family="${SANS}" font-size="12.5" fill="${C.text}">${esc(r.language || 'N/A')}</text>
    <path d="M ${x + 190} ${Y0 + CH - 30} L ${x + 191.8} ${Y0 + CH - 25.8} L ${x + 196} ${Y0 + CH - 25.2} L ${x + 192.7} ${Y0 + CH - 22.1} L ${x + 193.6} ${Y0 + CH - 18} L ${x + 190} ${Y0 + CH - 20.6} L ${x + 186.4} ${Y0 + CH - 18} L ${x + 187.3} ${Y0 + CH - 22.1} L ${x + 184} ${Y0 + CH - 25.2} L ${x + 188.2} ${Y0 + CH - 25.8} Z" fill="${accent}" opacity="0.9"/>
    <text x="${x + 202}" y="${Y0 + CH - 20}" font-family="${MONO}" font-size="12" fill="${C.muted}">${fmtNum(r.stargazers_count)}</text>
    <circle cx="${x + 250}" cy="${Y0 + CH - 27}" r="2.2" stroke="${accent}" stroke-width="1.4" fill="none"/>
    <circle cx="${x + 250}" cy="${Y0 + CH - 19}" r="2.2" stroke="${accent}" stroke-width="1.4" fill="none"/>
    <line x1="${x + 250}" y1="${Y0 + CH - 24.8}" x2="${x + 250}" y2="${Y0 + CH - 21.2}" stroke="${accent}" stroke-width="1.4"/>
    <text x="${x + 258}" y="${Y0 + CH - 20}" font-family="${MONO}" font-size="12" fill="${C.muted}">${fmtNum(r.forks_count)}</text>
  </g>`);
  });

  parts.push('</svg>');
  return parts.join('\n');
}

/* ---------- main ---------- */

(async () => {
  const data = await collectData();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'stats.svg'), renderStats(data, THEMES.dark));
  fs.writeFileSync(path.join(OUT_DIR, 'stats.light.svg'), renderStats(data, THEMES.light));
  fs.writeFileSync(path.join(OUT_DIR, 'langs.svg'), renderLangs(data, THEMES.dark, LANG_COLORS));
  fs.writeFileSync(path.join(OUT_DIR, 'langs.light.svg'), renderLangs(data, THEMES.light, LANG_COLORS_LIGHT));
  fs.writeFileSync(path.join(OUT_DIR, 'repos.svg'), renderRepos(data, THEMES.dark, LANG_COLORS));
  fs.writeFileSync(path.join(OUT_DIR, 'repos.light.svg'), renderRepos(data, THEMES.light, LANG_COLORS_LIGHT));
  console.log(`generated dark+light cards for ${USER} (stars=${data.stars} commits=${data.commits} langs=${Object.keys(data.langBytes).length})`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
