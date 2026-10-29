#!/usr/bin/env node
/**
 * Q3 — What exactly is Jekyll's `page.previous` / `page.next` ordering, and how
 * does it map to Hugo's `.Prev` / `.Next`?
 *
 * Answer (measured): the direction is the **same**, but the scope is not.
 *
 *   Jekyll `page.previous` = older post   →  Hugo `.PrevInSection`
 *   Jekyll `page.next`     = newer post   →  Hugo `.NextInSection`
 *
 * Hugo's `.Prev`/`.Next` walk every regular page, so `about` and `archives`
 * land in a post's neighbour chain (measured: the oldest post reports
 * `.Prev = about`). The section-scoped variants keep the chain inside `posts`,
 * which is what Jekyll does implicitly.
 */

import fs from 'node:fs';
import path from 'node:path';
import { OUT, ROOT, hugo, main, run, ruby, table, versions } from './lib.mjs';

const POSTS = [
  ['post-01', '2026-01-01T09:00:00Z'],
  ['post-02', '2026-01-02T09:00:00Z'],
  ['post-03', '2026-01-03T09:00:00Z'],
  ['post-04', '2026-01-04T09:00:00Z'],
];

function jekyllSide() {
  const dir = path.join(OUT, 'q3/jekyll');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '_posts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_layouts'), { recursive: true });

  fs.writeFileSync(
    path.join(dir, '_config.yml'),
    'title: q3\nurl: "http://127.0.0.1:4001"\nbaseurl: ""\npermalink: /posts/:title/\n',
  );

  for (const [slug, date] of POSTS) {
    fs.writeFileSync(
      path.join(dir, `_posts/${date.slice(0, 10)}-${slug}.md`),
      `---\ntitle: "${slug}"\ndate: ${date.slice(0, 10)} 09:00:00 +0000\nlayout: probe\n---\n\nbody\n`,
    );
  }
  // A plain page in the same site: it must never enter a post's neighbour chain.
  fs.writeFileSync(path.join(dir, 'about.md'), '---\ntitle: "about"\nlayout: probe\n---\n\npage\n');
  fs.writeFileSync(
    path.join(dir, '_layouts/probe.html'),
    '{{ page.title }}|{{ page.previous.title | default: "-" }}|{{ page.next.title | default: "-" }}',
  );

  run('bundle', ['exec', 'jekyll', 'build', '--quiet', '--destination', path.join(dir, 'out')], {
    cwd: dir,
  });

  const pages = {};
  for (const [slug] of POSTS) {
    const [title, previous, next] = fs
      .readFileSync(path.join(dir, `out/posts/${slug}/index.html`), 'utf8')
      .trim()
      .split('|');
    pages[title] = { previous, next };
  }
  return pages;
}

function hugoSide() {
  const files = {
    'content/about.md': '---\ntitle: "about"\n---\n\npage\n',
    'content/archives.md': '---\ntitle: "archives"\n---\n\npage\n',
    'layouts/_default/single.html':
      '{{ .Title }}|' +
      '{{ with .Prev }}{{ .Title }}{{ else }}-{{ end }}|' +
      '{{ with .Next }}{{ .Title }}{{ else }}-{{ end }}|' +
      '{{ with .PrevInSection }}{{ .Title }}{{ else }}-{{ end }}|' +
      '{{ with .NextInSection }}{{ .Title }}{{ else }}-{{ end }}',
  };
  for (const [slug, date] of POSTS) {
    files[`content/posts/${slug}.md`] = `---\ntitle: "${slug}"\ndate: ${date}\n---\n\nbody\n`;
  }

  const pages = {};
  for (const [slug] of POSTS) {
    const [title, prev, next, prevInSection, nextInSection] = hugo('q3', files, {
      outFile: `posts/${slug}/index.html`,
    })
      .trim()
      .split('|');
    pages[title] = { prev, next, prevInSection, nextInSection };
  }
  return pages;
}

function measure() {
  const jekyll = jekyllSide();
  const hugoPages = hugoSide();

  const cases = POSTS.map(([slug]) => {
    const j = jekyll[slug];
    const h = hugoPages[slug];
    return {
      post: slug,
      jekyll_previous: j.previous,
      jekyll_next: j.next,
      hugo_prev: h.prev,
      hugo_next: h.next,
      hugo_prev_in_section: h.prevInSection,
      hugo_next_in_section: h.nextInSection,
      previous_is_older_maps_to_prev_in_section: j.previous === h.prevInSection,
      next_is_newer_maps_to_next_in_section: j.next === h.nextInSection,
    };
  });

  table(
    cases.map((c) => [
      c.post,
      `jekyll(prev=${c.jekyll_previous} next=${c.jekyll_next})  ` +
        `hugo(prev=${c.hugo_prev} next=${c.hugo_next} ` +
        `prevInSection=${c.hugo_prev_in_section} nextInSection=${c.hugo_next_in_section})`,
    ]),
  );

  const ok = cases.every(
    (c) => c.previous_is_older_maps_to_prev_in_section && c.next_is_newer_maps_to_next_in_section,
  );
  console.log(`\n  mapping holds for ${ok ? 'all' : 'NOT all'} posts`);

  return {
    question: 'Q3: page.previous/next vs .Prev/.Next',
    versions: versions(),
    conclusion:
      'Jekyll page.previous is the older post and page.next the newer one, and ' +
      'Hugo agrees. Map previous -> .PrevInSection and next -> .NextInSection. ' +
      'The section-scoped variants are mandatory: .Prev/.Next walk every regular ' +
      'page, so an unrelated page (about, archives) becomes a neighbour.',
    mapping_holds: ok,
    cases,
  };
}

main('q3-page-order', measure);
