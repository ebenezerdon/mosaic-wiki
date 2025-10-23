(function($){
  window.App = window.App || {};

  // App state and rendering
  const state = {
    currentTitle: 'Home',
    mode: 'edit' // or 'preview'
  };

  function setMode(m){
    state.mode = m;
    if (m === 'edit'){
      $('#tabEdit').addClass('pill-tab-active').attr('aria-pressed', 'true');
      $('#tabPreview').removeClass('pill-tab-active').attr('aria-pressed', 'false');
      $('#editorWrap').show();
      $('#preview').hide();
    } else {
      $('#tabEdit').removeClass('pill-tab-active').attr('aria-pressed', 'false');
      $('#tabPreview').addClass('pill-tab-active').attr('aria-pressed', 'true');
      $('#editorWrap').hide();
      $('#preview').show();
    }
  }

  function navigateTo(title){
    state.currentTitle = title;
    window.location.hash = '#/page/' + encodeURIComponent(title);
    renderPage(title);
  }

  function renderSidebar(){
    const pages = window.App.DB.list();
    const $list = $('#pagesList').empty();
    pages.forEach(function(p){
      const $item = $(`
        <li class="page-item" data-title="${p.title}">
          <div class="min-w-0">
            <div class="truncate">${$('<div>').text(p.title).html()}</div>
            <div class="page-subtle">${new Date(p.updatedAt).toLocaleString()}</div>
          </div>
          <span class="badge">${window.App.Utils.parseWikiLinks(p.content).length}</span>
        </li>
      `);
      $item.on('click', function(){ navigateTo($(this).data('title')); });
      $list.append($item);
    });

    // Mirror for drawer
    const $dl = $('#drawerPages').empty();
    pages.forEach(function(p){
      const $li = $(`
        <li class="page-item" data-title="${p.title}">
          <div class="truncate">${$('<div>').text(p.title).html()}</div>
          <span class="page-subtle">${new Date(p.updatedAt).toLocaleDateString()}</span>
        </li>
      `);
      $li.on('click', function(){ navigateTo($(this).data('title')); closeDrawer(); });
      $dl.append($li);
    });
  }

  function renderPage(title){
    const page = window.App.DB.getByTitle(title) || window.App.DB.upsert(title, '');
    $('#pageTitle').val(page.title);
    $('#editor').val(page.content);
    $('#metaUpdated').text('Updated ' + new Date(page.updatedAt).toLocaleString());
    $('#metaWordCount').text(window.App.Utils.wordCount(page.content) + ' words');

    // Preview
    const html = window.App.Utils.markdownToHtml(page.content);
    $('#preview').html(html);

    // Backlinks
    const backlinks = window.App.DB.backlinksOf(page.title);
    const $back = $('#backlinks').empty();
    if (!backlinks.length){ $back.append('<li class="text-sm text-slate-500">No backlinks yet</li>'); }
    backlinks.forEach(function(p){
      const $li = $(`<li><a href="#" class="wikilink" data-link-title="${$('<div>').text(p.title).html()}">${$('<div>').text(p.title).html()}</a></li>`);
      $li.find('a').on('click', function(e){ e.preventDefault(); navigateTo($(this).data('link-title')); });
      $back.append($li);
    });

    // Outlinks
    const outs = window.App.DB.outlinksOf(page.content);
    const $outs = $('#outlinks').empty();
    if (!outs.length){ $outs.append('<li class="text-sm text-slate-500">No outgoing links yet</li>'); }
    outs.forEach(function(t){
      const exists = !!window.App.DB.getByTitle(t);
      const cls = exists ? 'wikilink' : 'text-slate-700 underline decoration-dotted';
      const $li = $(`<li><a href="#" class="${cls}" data-link-title="${$('<div>').text(t).html()}">${$('<div>').text(t).html()}</a></li>`);
      $li.find('a').on('click', function(e){ e.preventDefault(); navigateTo($(this).data('link-title')); });
      $outs.append($li);
    });

    // Graph
    drawGraph(page.title);

    // Update sidebar active state by re-rendering for freshness
    renderSidebar();
  }

  function saveCurrent(){
    const title = $('#pageTitle').val().trim() || 'Untitled';
    const content = $('#editor').val();
    const saved = window.App.DB.upsert(title, content);
    $('#metaUpdated').text('Updated ' + new Date(saved.updatedAt).toLocaleString());
    $('#metaWordCount').text(window.App.Utils.wordCount(content) + ' words');
    if (state.currentTitle !== saved.title){
      state.currentTitle = saved.title;
      window.location.hash = '#/page/' + encodeURIComponent(saved.title);
    }
    // Update preview live in preview mode
    if (state.mode === 'preview'){
      $('#preview').html(window.App.Utils.markdownToHtml(content));
    }
    // Update outlinks/backlinks and graph
    renderPage(saved.title);
  }

  const debouncedSave = window.App.Utils.debounce(saveCurrent, 450);

  function bindEvents(){
    // Tabs
    $('#tabEdit').on('click', function(){ setMode('edit'); });
    $('#tabPreview').on('click', function(){
      $('#preview').html(window.App.Utils.markdownToHtml($('#editor').val()));
      setMode('preview');
    });

    // Editor
    $('#editor').on('input', function(){ debouncedSave(); });

    // Title change, commit on blur or Enter
    $('#pageTitle').on('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); $(this).blur(); } });
    $('#pageTitle').on('blur', function(){ debouncedSave(); });

    // Sidebar search
    function handleSearchCommit(val){
      const term = val.trim();
      if (!term) return;
      const exists = window.App.DB.getByTitle(term);
      if (exists){ navigateTo(exists.title); }
      else { navigateTo(term); }
    }
    $('#searchInput').on('keydown', function(e){ if (e.key === 'Enter'){ handleSearchCommit($(this).val()); } });
    $('#drawerSearch').on('keydown', function(e){ if (e.key === 'Enter'){ handleSearchCommit($(this).val()); closeDrawer(); } });

    // Global quick open: Ctrl/Cmd K
    $(document).on('keydown', function(e){
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      if ((isMac && e.metaKey && e.key.toLowerCase() === 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() === 'k')){
        e.preventDefault();
        if ($('#drawer').is(':hidden')) openDrawer(); else closeDrawer();
        const $inp = $('#drawer').is(':hidden') ? $('#searchInput') : $('#drawerSearch');
        setTimeout(function(){ $inp.trigger('focus'); }, 20);
      }
    });

    // New page
    $('#newPageBtn, #newPageBtnTop').on('click', function(e){ e.preventDefault();
      const base = 'Untitled';
      let title = base, i = 1;
      while (window.App.DB.getByTitle(title)) { title = base + ' ' + (++i); }
      navigateTo(title);
    });

    // Delete page
    $('#deleteBtn').on('click', function(){
      const current = window.App.DB.getByTitle(state.currentTitle);
      if (!current) return;
      if (!confirm('Delete "' + current.title + '"? This cannot be undone.')) return;
      window.App.DB.remove(current.id);
      const fallback = window.App.DB.list()[0];
      if (fallback){ navigateTo(fallback.title); }
      else { navigateTo('Home'); }
    });

    // Rename page
    $('#renameBtn').on('click', function(){
      const current = window.App.DB.getByTitle(state.currentTitle);
      if (!current) return;
      const newTitle = prompt('Rename page:', current.title);
      if (!newTitle) return;
      const res = window.App.DB.rename(current.title, newTitle.trim());
      if (!res.ok){
        alert(res.reason || 'Rename failed');
        return;
      }
      navigateTo(newTitle.trim());
    });

    // Mobile drawer toggles
    $('#toggleSidebar').on('click', function(){ openDrawer(); });
    $('#drawerBackdrop, #closeDrawer').on('click', function(){ closeDrawer(); });

    // Delegate wikilink clicks in preview
    $('#preview').on('click', 'a.wikilink', function(e){ e.preventDefault(); navigateTo($(this).data('link-title')); });
  }

  function openDrawer(){ $('#drawer').addClass('open').removeClass('hidden'); $('#toggleSidebar').attr('aria-expanded', 'true'); }
  function closeDrawer(){ $('#drawer').removeClass('open').addClass('hidden'); $('#toggleSidebar').attr('aria-expanded', 'false'); }

  // Lightweight radial graph
  function drawGraph(centerTitle){
    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 300; const cssH = canvas.clientHeight || 300;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr; ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, cssW, cssH);

    // Data
    const center = window.App.DB.getByTitle(centerTitle);
    const back = window.App.DB.backlinksOf(centerTitle);
    const outs = window.App.DB.outlinksOf(center ? center.content : '');
    const neighborsTitles = Array.from(new Set([].concat(outs, back.map(function(p){ return p.title; })))).slice(0, 14);

    // Layout
    const cx = cssW / 2, cy = cssH / 2;
    const radius = Math.max(60, Math.min(cssW, cssH) * 0.35);

    const nodes = [];
    nodes.push({ title: centerTitle, x: cx, y: cy, r: 14, color: '#0891b2', isCenter: true });
    const angleStep = (Math.PI * 2) / Math.max(1, neighborsTitles.length);
    neighborsTitles.forEach(function(t, i){
      const a = i * angleStep - Math.PI / 2;
      const nx = cx + radius * Math.cos(a);
      const ny = cy + radius * Math.sin(a);
      nodes.push({ title: t, x: nx, y: ny, r: 9, color: '#f59e0b', isCenter: false });
    });

    // Edges: center to neighbors
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(8,145,178,0.45)';
    nodes.forEach(function(n){ if (!n.isCenter){ ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke(); }});

    // Nodes
    nodes.forEach(function(n){
      ctx.beginPath(); ctx.fillStyle = n.color; ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      // outline for accessibility contrast
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    });

    // Labels
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI';
    ctx.fillStyle = '#0f172a'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    nodes.forEach(function(n){
      const text = n.title.length > 18 ? n.title.slice(0, 16) + '…' : n.title;
      const y = n.isCenter ? n.y + n.r + 8 : (n.y < cy ? n.y - 20 : n.y + n.r + 4);
      ctx.fillText(text, n.x, y);
    });

    // Click hit test
    $(canvas).off('click').on('click', function(e){
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left); const y = (e.clientY - rect.top);
      for (let i = 0; i < nodes.length; i++){
        const n = nodes[i];
        const dx = x - n.x; const dy = y - n.y;
        if (Math.sqrt(dx*dx + dy*dy) <= n.r + 2){
          if (!n.isCenter){ navigateTo(n.title); }
          return;
        }
      }
    });

    // Keyboard focusability
    $(canvas).attr('tabindex', '0').attr('role', 'img').attr('aria-label', 'Graph preview. Use mouse to click a node to navigate');
  }

  // Routing
  function handleRoute(){
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/page\/(.+)$/);
    if (m){ state.currentTitle = decodeURIComponent(m[1]); }
    else {
      const db = window.App.DB.get();
      const fallback = db && db.lastOpenedId ? window.App.DB.getById(db.lastOpenedId) : window.App.DB.getByTitle('Home');
      state.currentTitle = fallback ? fallback.title : 'Home';
      window.location.hash = '#/page/' + encodeURIComponent(state.currentTitle);
    }
    renderPage(state.currentTitle);
  }

  // Public API
  window.App.init = function(){
    // Initial renders and events
    renderSidebar();
    bindEvents();
    setMode('edit');
    handleRoute();

    // Redraw graph on resize
    $(window).on('resize', function(){ drawGraph(state.currentTitle); });
  };

  window.App.render = function(){
    // No-op: all rendering is handled in init and route handler, but contract requires this method
    return true;
  };

})(jQuery);
