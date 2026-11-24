/*
 * Beyond upstream (opt-in): the post action row (D-30) and print support
 * (D-31). Loaded only on posts, and only when one of the two is enabled.
 *
 * Everything this script adds for print is `hidden` on screen and shown by
 * print.css, so the screen layout never changes.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const article = document.querySelector('article[data-toc]');
  if (!article) return;
  const content = article.querySelector('.content');
  const header = article.querySelector('.print-header');

  const canonical = () => {
    const link = document.querySelector('link[rel="canonical"]');
    return link ? link.href : location.href.split('#')[0];
  };

  /* ---- action row ------------------------------------------------------ */

  // In-app browsers (social apps) expose window.print but ignore it.
  const inApp = /FBAN|FBAV|Instagram|LinkedInApp|Twitter|Line\/|MicroMessenger|; wv\)/i.test(
    navigator.userAgent,
  );
  const canPrint = typeof window.print === 'function' && !inApp;
  const canShare = typeof navigator.share === 'function';

  document.querySelectorAll('[data-print]').forEach((button) => {
    if (!canPrint) {
      button.remove();
      return;
    }
    button.addEventListener('click', () => printPost());
  });

  const flash = (button) => {
    const icon = button.querySelector('i');
    button.classList.add('is-done');
    if (icon) icon.classList.replace('fa-link', 'fa-check');
    setTimeout(() => {
      button.classList.remove('is-done');
      if (icon) icon.classList.replace('fa-check', 'fa-link');
    }, 1600);
  };

  document.querySelectorAll('[data-copy-link]').forEach((button) => {
    button.addEventListener('click', () => {
      const url = button.dataset.copyLink;
      const done = () => flash(button);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(done, () => {});
        return;
      }
      // Clipboard API missing (insecure context, old browser).
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0';
      document.body.append(field);
      field.select();
      try {
        if (document.execCommand('copy')) done();
      } catch {
        /* nothing to copy with */
      }
      field.remove();
    });
  });

  document.querySelectorAll('[data-native-share]').forEach((button) => {
    if (!canShare) {
      // CSS shows this button on touch devices; without the API it hides.
      button.closest('[data-post-actions]')?.classList.add('no-native-share');
      return;
    }
    button.addEventListener('click', () => {
      navigator.share({ title: button.dataset.title, url: button.dataset.url }).catch(() => {});
    });
  });

  if (!header || !content) return;

  /* ---- print: numbered link list --------------------------------------- */

  const labels = {
    links: header.dataset.printLabelLinks,
    interactive: header.dataset.printLabelInteractive,
    video: header.dataset.printLabelVideo,
  };

  const clean = (text) => text.replace(/\s+/g, ' ').trim();
  const bare = (url) => url.replace(/^(https?:\/\/|mailto:)/, '').replace(/\/$/, '');

  // Resolved against the canonical URL, so a preview or a mirror prints the
  // public addresses.
  const absolute = (href) => {
    try {
      return new URL(href, canonical()).href;
    } catch {
      return '';
    }
  };

  const skipLink = (a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#') || href.startsWith('javascript:')) return true;
    const url = absolute(href);
    if (!/^(https?:|mailto:)/.test(url)) return true;
    if (a.matches('.anchor, .img-link, .popup, .footnote, .reversefootnote')) return true;
    if (a.closest('.code-header, .footnotes, .print-note, [data-print-skip]')) return true;
    if (a.querySelector('img, picture, svg, video')) return true;
    // The text already is the address: a number would add nothing.
    const text = clean(a.textContent);
    return text === url || bare(text) === bare(url);
  };

  const buildLinks = () => {
    const numbers = new Map();
    const items = [];
    content.querySelectorAll('a[href]').forEach((a) => {
      if (skipLink(a)) return;
      const url = absolute(a.getAttribute('href'));
      let n = numbers.get(url);
      if (!n) {
        n = numbers.size + 1;
        numbers.set(url, n);
        const text = clean(a.textContent);
        items.push({ url, text: text.length > 90 ? `${text.slice(0, 89)}…` : text });
      }
      const ref = document.createElement('sup');
      ref.className = 'print-ref';
      ref.hidden = true;
      ref.textContent = n;
      a.after(ref);
    });
    if (!items.length) return;

    const section = document.createElement('section');
    section.className = 'print-links';
    section.hidden = true;
    const title = document.createElement('p');
    title.className = 'print-links-title';
    title.textContent = labels.links;
    const list = document.createElement('ol');
    items.forEach(({ url, text }) => {
      const li = document.createElement('li');
      if (text) {
        const t = document.createElement('span');
        t.className = 'print-link-text';
        t.textContent = text;
        li.append(t, ' ');
      }
      const u = document.createElement('span');
      u.className = 'print-link-url';
      u.textContent = url.replace(/^mailto:/, '');
      li.append(u);
      list.append(li);
    });
    section.append(title, list);
    content.after(section);
  };

  /* ---- print: notes for what paper cannot play -------------------------- */

  const isVideo = (el) =>
    el.tagName === 'VIDEO' ||
    (el.tagName === 'IFRAME' && /youtube|youtu\.be|vimeo|bilibili/.test(el.getAttribute('src') || ''));

  const mediaUrl = (el) => {
    const src = el.getAttribute('src') || '';
    const yt = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/);
    if (yt) return `https://youtu.be/${yt[1]}`;
    if (el.dataset.printHref) return absolute(el.dataset.printHref);
    if (el.tagName === 'IFRAME' && /^https?:/.test(src)) return src;
    return canonical();
  };

  // `data-print-fallback="text"`: the element is replaced on paper by a note.
  // `data-print-note="text"`: the element prints and the note follows it.
  // Embedded players (iframe, video, audio) are replaced by default.
  const buildNotes = () => {
    const selector = 'iframe, video, audio, [data-print-fallback], [data-print-note]';
    content.querySelectorAll(selector).forEach((el) => {
      if (el.parentElement.closest('[data-print-fallback], [data-print-note]')) return;
      const note = document.createElement('p');
      note.className = 'print-note';
      note.hidden = true;
      const text = document.createElement('span');
      text.textContent =
        el.dataset.printFallback ||
        el.dataset.printNote ||
        (isVideo(el) ? labels.video : labels.interactive);
      const url = document.createElement('span');
      url.className = 'print-note-url';
      url.textContent = mediaUrl(el);
      note.append(text, ' ', url);
      el.after(note);
    });
  };

  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    buildNotes();
    buildLinks();
  };

  /* ---- print: before and after ------------------------------------------ */

  let savedTheme;
  const before = () => {
    build();
    // Paper is white: print in the light palette whatever the screen uses.
    if (savedTheme === undefined) {
      savedTheme = root.getAttribute('data-bs-theme');
      root.setAttribute('data-bs-theme', 'light');
    }
    const date = header.querySelector('[data-print-date]');
    if (date) {
      const lang = root.lang || undefined;
      const today = new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date());
      date.textContent = `${date.dataset.printDate} ${today}`;
    }
    // Lazy images below the fold have not been fetched yet.
    article.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    });
  };

  const after = () => {
    if (savedTheme === undefined) return;
    if (savedTheme === null) root.removeAttribute('data-bs-theme');
    else root.setAttribute('data-bs-theme', savedTheme);
    savedTheme = undefined;
  };

  const imagesReady = (ms) => {
    const pending = [...article.querySelectorAll('img')].filter((img) => !img.complete);
    const loads = pending.map(
      (img) =>
        new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        }),
    );
    return Promise.race([Promise.all(loads), timeout(ms)]);
  };

  // Other scripts can get ready for paper (mount a lazy figure, say) when the
  // print button is used: they receive `chirpy:print` and pass a promise to
  // `event.detail.waitUntil`. Ctrl+P cannot wait, so whatever they render must
  // already be readable without it.
  const prepare = () => {
    const pending = [];
    document.dispatchEvent(
      new CustomEvent('chirpy:print', { detail: { waitUntil: (p) => pending.push(p) } }),
    );
    return Promise.allSettled(pending);
  };

  const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function printPost() {
    before();
    await Promise.race([prepare(), timeout(2500)]);
    await imagesReady(3000);
    window.print();
  }

  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);

  // Ctrl+P does not wait for anything: build the print-only nodes up front.
  if ('requestIdleCallback' in window) requestIdleCallback(build, { timeout: 2000 });
  else setTimeout(build, 200);
})();
