/**
 * Nebula Cosmica — particle constellation generator.
 *
 * Regenerates the drifting particles / neural clusters / shooting stars
 * inside assets/header.svg from assets/header.template.svg.
 * Seeded by the current date (UTC) so the constellation is rebuilt with a
 * fresh layout every day by the particles.yml GitHub Action.
 *
 * Zero dependencies: node scripts/generate-particles.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 300;
const PLACEHOLDER = '<!-- ::PARTICLES:: -->';

const PALETTE = ['#00E5FF', '#7C4DFF', '#FFFFFF', '#FF2D78'];
const LINE_PALETTE = ['#00E5FF', '#7C4DFF'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeed() {
  if (process.env.PARTICLE_SEED) return Number(process.env.PARTICLE_SEED);
  const now = new Date();
  return now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}

/** Free-floating star particle: drifts back and forth + pulses. */
function freeParticle(rand) {
  const x = fmt(rand() * WIDTH);
  const y = fmt(rand() * HEIGHT);
  const r = fmt(0.9 + rand() * 1.9);
  const color = pick(rand, PALETTE);
  const opacity = fmt(0.35 + rand() * 0.55);
  const dx = fmt((rand() - 0.5) * 90);
  const dy = fmt((rand() - 0.5) * 50);
  const dur = fmt(7 + rand() * 12);
  const pulseDur = fmt(1.8 + rand() * 3.4);
  return [
    `  <g>`,
    `    <animateTransform attributeName="transform" type="translate" values="0 0; ${dx} ${dy}; 0 0" dur="${dur}s" repeatCount="indefinite"/>`,
    `    <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#glow)">`,
    `      <animate attributeName="opacity" values="${opacity};${fmt(opacity * 0.25)};${opacity}" dur="${pulseDur}s" repeatCount="indefinite"/>`,
    `    </circle>`,
    `  </g>`,
  ].join('\n');
}

/**
 * Neural "molecule": 2-3 nodes joined by luminous links.
 * The whole cluster drifts as one unit so connections never break.
 */
function neuralCluster(rand) {
  const ox = 60 + rand() * (WIDTH - 120);
  const oy = 45 + rand() * (HEIGHT - 90);
  const nodeCount = 2 + Math.floor(rand() * 2);
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: fmt(ox + (rand() - 0.5) * 130),
      y: fmt(oy + (rand() - 0.5) * 70),
      r: fmt(1.4 + rand() * 1.8),
      color: pick(rand, PALETTE),
    });
  }
  const lineColor = pick(rand, LINE_PALETTE);
  const dx = fmt((rand() - 0.5) * 110);
  const dy = fmt((rand() - 0.5) * 60);
  const dur = fmt(9 + rand() * 11);
  const flicker = fmt(2.4 + rand() * 3.2);

  const parts = [];
  parts.push('  <g>');
  parts.push(`    <animateTransform attributeName="transform" type="translate" values="0 0; ${dx} ${dy}; 0 0" dur="${dur}s" repeatCount="indefinite"/>`);
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    parts.push(`    <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${lineColor}" stroke-width="0.7" opacity="0.22">`);
    parts.push(`      <animate attributeName="opacity" values="0.28;0.07;0.28" dur="${flicker}s" repeatCount="indefinite"/>`);
    parts.push(`    </line>`);
  }
  for (const n of nodes) {
    parts.push(`    <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${n.color}" opacity="0.85" filter="url(#glow)"/>`);
  }
  parts.push('  </g>');
  return parts.join('\n');
}

/** Shooting star streaking diagonally across the banner. */
function shootingStar(rand) {
  const x1 = fmt(100 + rand() * (WIDTH - 400));
  const y1 = fmt(-30 - rand() * 40);
  const x2 = fmt(Number(x1) + 240 + rand() * 160);
  const y2 = fmt(Number(y1) + 130 + rand() * 70);
  const dur = fmt(1.1 + rand() * 0.8);
  const begin = fmt(rand() * 9);
  const cycle = fmt(8 + rand() * 6);
  const len = fmt(26 + rand() * 26);
  return [
    `  <g opacity="0">`,
    `    <animate attributeName="opacity" values="0;0.9;0" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/>`,
    `    <animateMotion path="M ${x1} ${y1} L ${x2} ${y2}" dur="${cycle}s" begin="${begin}s" repeatCount="indefinite" rotate="auto"/>`,
    `    <rect x="-${len}" y="-0.75" width="${len}" height="1.5" rx="0.75" fill="url(#shoot)"/>`,
    `    <circle r="1.8" fill="#FFFFFF" filter="url(#glow)"/>`,
    `  </g>`,
  ].join('\n');
}

function generate() {
  const seed = dailySeed();
  const rand = mulberry32(seed);

  const chunks = ['  <!-- Particle constellation · seed ' + seed + ' · regenerated daily by CI -->'];
  for (let i = 0; i < 24; i++) chunks.push(freeParticle(rand));
  for (let i = 0; i < 7; i++) chunks.push(neuralCluster(rand));
  for (let i = 0; i < 2; i++) chunks.push(shootingStar(rand));

  const templatePath = path.join(__dirname, '..', 'assets', 'header.template.svg');
  const outputPath = path.join(__dirname, '..', 'assets', 'header.svg');
  const template = fs.readFileSync(templatePath, 'utf8');
  if (!template.includes(PLACEHOLDER)) {
    throw new Error(`Placeholder ${PLACEHOLDER} not found in header.template.svg`);
  }
  const svg = template.replace(PLACEHOLDER, chunks.join('\n'));
  fs.writeFileSync(outputPath, svg);
  console.log(`header.svg regenerated with seed ${seed} (${chunks.length - 1} particle elements)`);
}

generate();
