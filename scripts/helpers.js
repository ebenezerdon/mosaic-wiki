(function(){
  // Global namespace
  window.App = window.App || {};

  const STORAGE_KEY = 'mosaic-wiki-db-v1';

  // Utilities
  const Utils = {
    debounce: function(fn, wait){
      let t; return function(){
        const ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function(){ fn.apply(ctx, args); }, wait);
      };
    },
    slugify: function(title){
      return String(title || '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/\-+/g, '-')
        .replace(/^\-+|\-+$/g, '') || 'untitled';
    },
    nowISO: function(){ return new Date().toISOString(); },
    escapeHtml: function(str){
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
    parseWikiLinks: function(content){
      const links = [];
      const re = /\[\[([^\]]+)\]\]/g; let m;
      while ((m = re.exec(content || '')) !== null){
        const title = m[1].trim();
        if (title && !links.includes(title)) links.push(title);
      }
      return links;
    },
    markdownToHtml: function(src){
      // Very small, safe-ish parser: escape first, then format
      let s = Utils.escapeHtml(src || '');
      // Headings
      s = s.replace(/^###\s(.+)$/gm, '<h3>$1<\/h3>')
           .replace(/^##\s(.+)$/gm, '<h2>$1<\/h2>')
           .replace(/^#\s(.+)$/gm, '<h1>$1<\/h1>');
      // Bold and italics
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1<\/strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1<\/em>');
      // Lists
      // Convert list items, then wrap groups of li in ul
      s = s.replace(/^\s*\-\s(.+)$/gm, '<li>$1<\/li>');
      s = s.replace(/(?:<li>.*<\/li>\n?)+/g, function(block){
        const items = block.trim();
        return '<ul>' + items + '<\/ul>';
      });
      // Paragraphs: wrap loose lines that are not block elements
      s = s.replace(/^(?!<(h\d|ul|li|\/ul|blockquote|pre|code|hr))(?!\s*$)(.+)$/gm, '<p>$2<\/p>');
      // Wikilinks -> clickable anchors with data attribute
      s = s.replace(/\[\[([^\]]+)\]\]/g, function(_, t){
        const label = t.trim();
        const safe = Utils.escapeHtml(label);
        return '<a href="#" class="wikilink" data-link-title="' + safe + '">' + safe + '<\/a>';
      });
      return s;
    },
    wordCount: function(txt){
      const t = String(txt || '').trim();
      if (!t) return 0;
      return t.replace(/\s+/g, ' ').split(' ').length;
    }
  };

  // Database module using localStorage
  const DB = {
    load: function(){
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch(e){
        console.error('Failed to load DB', e);
        return null;
      }
    },
    save: function(db){
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch(e){ console.error('Failed to save DB', e); }
    },
    get: function(){
      let db = DB.load();
      if (!db){
        db = { pages: {}, lastOpenedId: null, createdAt: Utils.nowISO() };
        DB.seed(db);
        DB.save(db);
      }
      return db;
    },
    seed: function(db){
      const makePage = function(title, content){
        const id = Utils.slugify(title);
        const now = Utils.nowISO();
        db.pages[id] = { id, title, content, createdAt: now, updatedAt: now };
        return id;
      };
      const homeContent = '# Welcome to Mosaic Wiki\n\nStart linking with [[Daily Notes]] and [[About]].\n\n- Create pages from the search bar\n- Use backlinks to discover connections\n- Everything stays in your browser';
      const notesContent = '# Daily Notes\n\nA page for quick thoughts. Try linking to [[Welcome]] or [[About]]!';
      const aboutContent = '# About\n\nThis wiki is lightweight and private. Built with localStorage. See [[Daily Notes]].';
      const home = makePage('Home', homeContent);
      makePage('Daily Notes', notesContent);
      makePage('About', aboutContent);
      db.lastOpenedId = home;
    },
    list: function(){
      const db = DB.get();
      const arr = Object.values(db.pages);
      return arr.sort(function(a, b){ return new Date(b.updatedAt) - new Date(a.updatedAt); });
    },
    getById: function(id){ return DB.get().pages[id] || null; },
    getByTitle: function(title){
      const id = Utils.slugify(title);
      return DB.get().pages[id] || null;
    },
    upsert: function(title, content){
      const db = DB.get();
      const id = Utils.slugify(title);
      const now = Utils.nowISO();
      if (!db.pages[id]){
        db.pages[id] = { id, title, content: content || '', createdAt: now, updatedAt: now };
      } else {
        db.pages[id].title = title; // keep canonical title case
        db.pages[id].content = content;
        db.pages[id].updatedAt = now;
      }
      db.lastOpenedId = id;
      DB.save(db);
      return db.pages[id];
    },
    touch: function(id){
      const db = DB.get();
      if (db.pages[id]){ db.pages[id].updatedAt = Utils.nowISO(); DB.save(db); }
    },
    remove: function(id){
      const db = DB.get();
      delete db.pages[id];
      // choose a fallback page
      const remaining = Object.keys(db.pages);
      db.lastOpenedId = remaining.length ? remaining[0] : null;
      DB.save(db);
    },
    rename: function(oldTitle, newTitle){
      const db = DB.get();
      const oldId = Utils.slugify(oldTitle);
      const newId = Utils.slugify(newTitle);
      if (!db.pages[oldId]) return { ok: false, reason: 'Old page not found' };
      if (db.pages[newId] && newId !== oldId) return { ok: false, reason: 'A page with that title already exists' };
      const page = db.pages[oldId];
      delete db.pages[oldId];
      page.id = newId; page.title = newTitle; page.updatedAt = Utils.nowISO();
      db.pages[newId] = page;
      if (db.lastOpenedId === oldId) db.lastOpenedId = newId;
      // Update wikilinks everywhere: [[Old Title]] -> [[New Title]]
      const re = new RegExp('\\\\[\\\\[' + oldTitle.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\\\]\\\\]', 'g');
      Object.values(db.pages).forEach(function(p){
        p.content = String(p.content || '').replace(re, '[[' + newTitle + ']]');
      });
      DB.save(db);
      return { ok: true, id: newId };
    },
    backlinksOf: function(title){
      const db = DB.get();
      const back = [];
      const target = String(title || '').trim();
      Object.values(db.pages).forEach(function(p){
        if (Utils.parseWikiLinks(p.content).includes(target)) back.push(p);
      });
      return back.sort(function(a, b){ return new Date(b.updatedAt) - new Date(a.updatedAt); });
    },
    outlinksOf: function(content){
      const titles = Utils.parseWikiLinks(content || '');
      // Map to existing or potential pages
      return titles;
    }
  };

  window.App.Utils = Utils;
  window.App.DB = DB;
})();
