#!/usr/bin/env node
// 創作小説プロジェクト: 各作品フォルダの .md から data.js を生成する。
// 使い方: node build.js  (このフォルダで実行)
//
// 作品フォルダの規約:
//   <作品名>/README.md   1行目「# タイトル」、次の「### サブタイトル」、
//                        「## あらすじ」見出し直後の段落群をあらすじとして読む
//   <作品名>/第NN話.md   1行目「# 第N話「タイトル」」、以降が本文
//
// 生成した data.js は index.html(ビューア)が読む。話を追加・修正したら再実行すること。

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function parseReadme(text) {
  const lines = text.split(/\r?\n/);
  let title = '', subtitle = '', synopsis = [];
  let inSynopsis = false;
  for (const line of lines) {
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue; }
    if (!subtitle && line.startsWith('### ')) { subtitle = line.slice(4).trim(); continue; }
    if (line.startsWith('## ')) { inSynopsis = /あらすじ/.test(line); continue; }
    if (inSynopsis && line.trim()) synopsis.push(line.trim());
  }
  return { title, subtitle, synopsis: synopsis.join('\n') };
}

function parseEpisode(text, file) {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex(l => l.startsWith('# '));
  if (head === -1) throw new Error(`${file}: 見出し行(# 第N話…)がない`);
  const m = lines[head].slice(2).match(/^第(\d+)話(?:\s*[(（].*?[)）])?\s*「?(.*?)」?$/);
  if (!m) throw new Error(`${file}: 見出しの形式が「# 第N話「タイトル」」でない: ${lines[head]}`);
  const body = lines.slice(head + 1).join('\n').trim();
  if (!body) throw new Error(`${file}: 本文が空`);
  return { no: Number(m[1]), title: m[2], body };
}

const novels = [];
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = path.join(ROOT, entry.name);
  const epFiles = fs.readdirSync(dir).filter(f => /^第\d+話\.md$/.test(f)).sort();
  if (epFiles.length === 0) continue;

  const readmePath = path.join(dir, 'README.md');
  if (!fs.existsSync(readmePath)) throw new Error(`${entry.name}: README.md がない`);
  const meta = parseReadme(fs.readFileSync(readmePath, 'utf8'));
  if (!meta.title) throw new Error(`${entry.name}: README.md からタイトルを読めない`);

  const episodes = epFiles.map(f => parseEpisode(fs.readFileSync(path.join(dir, f), 'utf8'), `${entry.name}/${f}`));
  episodes.sort((a, b) => a.no - b.no);
  episodes.forEach((ep, i) => {
    if (ep.no !== i + 1) throw new Error(`${entry.name}: 話数が飛んでいる(第${i + 1}話が見当たらない)`);
  });

  // 表紙: 作品フォルダ直下の cover.* を自動検出(相対パスで data.js に載せる)
  const coverFile = ['cover.svg', 'cover.png', 'cover.jpg', 'cover.webp'].find(f => fs.existsSync(path.join(dir, f)));
  const cover = coverFile ? `${entry.name}/${coverFile}` : null;

  novels.push({ id: entry.name, ...meta, cover, episodes });
}

if (novels.length === 0) throw new Error('作品フォルダが見つからない');

const banner = '// このファイルは build.js が各作品フォルダの .md から生成する。手で編集しない。\n' +
  '// 更新手順: 話の .md を書く → node build.js → index.html で確認\n';
const out = banner + 'const NOVELS = ' + JSON.stringify(novels, null, 1) + ';\n' +
  'if (typeof module !== "undefined") module.exports = { NOVELS };\n';
fs.writeFileSync(path.join(ROOT, 'data.js'), out, 'utf8');

for (const n of novels) {
  const chars = n.episodes.reduce((s, e) => s + e.body.replace(/\s/g, '').length, 0);
  console.log(`${n.title} — 全${n.episodes.length}話 / 約${chars.toLocaleString()}字`);
}
console.log('data.js を生成した');
