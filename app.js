// SparkMemo 主应用 - 完整版
(function(){
  'use strict';
  // crypto.randomUUID fallback
  if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
    crypto.randomUUID = function() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; const v = c === 'x' ? r : (r&0x3|0x8); return v.toString(16); }); };
  }
  const state = { media: [], timeline: [], filter: 'all', settings: {} };
  const colorCycle = ['dot-pink', 'dot-sky', 'dot-peach', 'dot-lavender', 'dot-green'];

  async function init() {
    console.log('[SparkMemo] Initializing...');
    state.settings = getSettings();
    state.media = getMedia();
    state.timeline = getTimeline();
    try { await openDB(); } catch(e) { console.warn('DB open', e); }
    renderMedia();
    renderTimeline();
    renderNvidiaShowcase();
    animateProcessSteps();
    setupEventListeners();
    setInterval(animateProcessSteps, 9000);
    console.log('[SparkMemo] Ready', state.media.length, state.timeline.length);
  }

  function renderMedia() {
    const list = document.getElementById('mediaList');
    if (!list) return;
    const filtered = state.filter === 'all' ? state.media : state.media.filter(m => m.type === state.filter);
    document.querySelectorAll('.media-tab').forEach(tab => {
      const t = tab.dataset.type;
      const c = t === 'all' ? state.media.length : state.media.filter(m => m.type === t).length;
      tab.textContent = ({all:'全部',photo:'📷',video:'🎬',text:'📝',voice:'🎙️'})[t] + ' · ' + c;
    });
    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:40px 16px;color:#666;font-size:12px;"><div style="font-size:32px;margin-bottom:8px;">📭</div>还没有用户素材<br>拖拽或点击上传自己的回忆<br><br><span style="color:#76b900;">💡 下面有预置的 AI 爱情故事可以先体验</span></div>`;
      return;
    }
    list.innerHTML = filtered.map((m, i) => {
      const ic = {photo:'📷',video:'🎬',text:'📝',voice:'🎙️'}[m.type] || '📄';
      return `<div class="media-item analyzed fade-in" style="animation-delay:${i*0.04}s">
        <div class="media-thumb" style="background:linear-gradient(135deg,#ff6b9d33,#ffb34733);">${ic}</div>
        <div class="media-info">
          <div class="media-name">${escapeHTML(m.name)}</div>
          <div class="media-meta">${m.date||''} · ${m.size||'本地'}</div>
          <div class="media-tags">${(m.tags||[]).map((t,ti)=>`<span class="tag ${['pink','sky','peach'][ti%3]}">${escapeHTML(t)}</span>`).join('')}</div>
          <div class="progress-mini"><div class="progress-mini-bar" style="width:100%"></div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <button data-preview="${m.id}" style="background:none;border:none;color:#76b900;cursor:pointer;font-size:14px;">👁</button>
          <button data-del="${m.id}" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:14px;">✕</button>
        </div></div>`;
    }).join('');
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); handleDelMedia(b.dataset.del); }));
    list.querySelectorAll('[data-preview]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); handlePreview(b.dataset.preview); }));
  }

  function renderNvidiaShowcase() {
    const carousel = document.getElementById('nvidiaCarousel');
    if (!carousel || typeof getNvidiaAssets !== 'function') return;
    const assets = getNvidiaAssets();
    carousel.innerHTML = assets.map((a, i) => {
      const safePath = a.path.replace(/\\/g, '/');
      if (a.type === 'video') {
        return `<div class="nv-item" data-idx="${i}" style="background:rgba(118,185,0,0.1);cursor:pointer;" data-nv-preview="${safePath}" data-nv-type="video">
          <div style="font-size:24px;">🎬</div>
          <div class="nv-tag">${escapeHTML(a.tag)}</div>
        </div>`;
      }
      return `<div class="nv-item" data-idx="${i}" data-nv-preview="${safePath}" data-nv-type="photo" style="cursor:pointer;">
        <img src="${safePath}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'font-size:24px;\\'>💻</div><div class=\\'nv-tag\\'>'+'${escapeHTML(a.tag)}'+'</div>'">
      </div>`;
    }).join('');
    carousel.querySelectorAll('[data-nv-preview]').forEach(el => el.addEventListener('click', () => {
      const path = el.dataset.nvPreview;
      const type = el.dataset.nvType;
      let content = '';
      if (type === 'video') {
        content = `<video src="${path}" controls autoplay style="max-width:100%;max-height:80vh;border-radius:8px;"></video>
          <div style="margin-top:16px;padding:12px;background:rgba(118,185,0,0.08);border-radius:6px;font-size:11px;color:#b0b0b0;line-height:1.6;">
            <b style="color:#76b900;">RTX Spark · AI Agent 运行演示</b><br>
            依托英伟达 RTX Spark 的本地算力，AI Agent 可以在本地独立运行，处理多模态数据、生成情感洞察、自动关联时间线。所有数据不出本机，100% 隐私保护。
          </div>`;
      } else {
        content = `<img src="${path}" style="max-width:100%;max-height:80vh;border-radius:8px;">
          <div style="margin-top:12px;font-size:11px;color:#888;text-align:center;">NVIDIA RTX SPARK 官方素材</div>`;
      }
      showModal('⚡ NVIDIA RTX SPARK', content);
    }));
  }

  function renderTimeline(animate) {
    const area = document.getElementById('timelineArea');
    if (!area) return;
    animate = animate !== false;
    if (state.timeline.length === 0) {
      area.innerHTML = `<div class="timeline-line"></div><div style="text-align:center;padding:60px 20px;color:#666;"><div style="font-size:40px;margin-bottom:12px;">✨</div><div style="font-size:14px;margin-bottom:6px;">还没有故事节点</div><div style="font-size:11px;">点「+ 新节点」开始记录</div></div>`;
      updateStats(); return;
    }
    area.innerHTML = state.timeline.map((node, i) => {
      const color = node.color || colorCycle[i % colorCycle.length];
      let galleryHtml = '';
      if (node.images && node.images.length) {
        galleryHtml = `<div class="node-gallery" data-node-idx="${i}">` + node.images.slice(0,4).map((img, gi) =>
          `<img src="${img}" loading="lazy" class="node-gallery-item" data-gi="${gi}" onerror="this.style.opacity='0.3'">`
        ).join('') + (node.images.length > 4 ? `<div class="gallery-more">+${node.images.length-4}</div>` : '') + `</div>`;
      } else if (node.image) {
        galleryHtml = `<div class="node-gallery" data-node-idx="${i}"><img src="${node.image}" loading="lazy" class="node-gallery-item" style="width:100%;aspect-ratio:16/10;"></div>`;
      }
      return `<div class="timeline-node" data-id="${node.id}">
        <div class="node-dot ${color}"></div>
        <div class="node-content ${node.highlight?'highlight':''}">
          <div class="node-date">${node.date||''}${node.highlight?' <span class="highlight-badge">★ HIGHLIGHT</span>':''} <span class="img-count">📷 ${(node.images||(node.image?[node.image]:[])).length} 张</span></div>
          <div class="node-title">${escapeHTML(node.title)}</div>
          ${galleryHtml}
          ${node.summary?`<div class="node-summary">${escapeHTML(node.summary)}</div>`:''}
          ${node.aiNote?`<div class="node-ai-note"><div class="ai-note-label">⚡ RTX SPARK · ${node.aiNote.label}</div><div>${escapeHTML(node.aiNote.text)}</div></div>`:''}
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            <button data-edit="${node.id}" class="mini-btn">✎ 编辑</button>
            <button data-hi="${node.id}" class="mini-btn">${node.highlight?'取消★':'标★'}</button>
            <button data-gen="${node.id}" class="mini-btn">⚡ AI</button>
            <button data-rm="${node.id}" class="mini-btn danger">删除</button>
          </div>
        </div></div>`;
    }).join('');
    if (animate) area.querySelectorAll('.timeline-node').forEach((n,i) => setTimeout(() => n.classList.add('visible'), 200 + i*280));
    else area.querySelectorAll('.timeline-node').forEach(n => n.classList.add('visible'));
    area.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openEditor(state.timeline.find(n => n.id === b.dataset.edit))));
    area.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { if(confirm('确定删除？')) { removeTimelineNode(b.dataset.rm); state.timeline = getTimeline(); renderTimeline(); showToast('已删除'); } }));
    area.querySelectorAll('[data-hi]').forEach(b => b.addEventListener('click', () => { const n = state.timeline.find(x=>x.id===b.dataset.hi); if(n) { state.timeline = updateTimelineNode(n.id, {highlight:!n.highlight}); renderTimeline(false); } }));
    area.querySelectorAll('[data-gen]').forEach(b => b.addEventListener('click', async () => {
      const n = state.timeline.find(x => x.id === b.dataset.gen);
      if (!n) return; b.disabled = true; b.textContent = '⚡...';
      await genAIForNode(n); renderTimeline(false);
    }));
    area.querySelectorAll('.node-gallery').forEach(el => el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.nodeIdx);
      const node = state.timeline[idx];
      if (!node) return;
      const allImgs = node.images || (node.image ? [node.image] : []);
      let content = `<div style="text-align:center;margin-bottom:12px;font-size:12px;color:#b0b0b0;">📷 ${allImgs.length} 张素材 · 点击查看大图</div>`;
      content += `<div class="gallery-preview">` + allImgs.map((src, i) =>
        `<img src="${src}" class="gallery-preview-item" data-gi="${i}" onerror="this.style.opacity='0.3'">`
      ).join('') + `</div>`;
      if (node.summary) content += `<div style="margin-top:16px;padding:14px;background:rgba(255,107,157,0.08);border-radius:8px;font-size:13px;color:#fff;line-height:1.8;">${escapeHTML(node.summary)}</div>`;
      if (node.aiNote) content += `<div style="margin-top:10px;padding:12px;background:rgba(118,185,0,0.08);border-left:2px solid #76b900;border-radius:6px;font-size:11px;color:#b0b0b0;line-height:1.7;">⚡ ${escapeHTML(node.aiNote.text)}</div>`;
      const modal = showModal('📖 ' + escapeHTML(node.title), content);
      modal.querySelectorAll('.gallery-preview-item').forEach(img => img.addEventListener('click', () => {
        const big = document.createElement('div');
        big.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        big.innerHTML = `<img src="${img.src}" style="max-width:95vw;max-height:90vh;border-radius:8px;">`;
        big.addEventListener('click', () => big.remove());
        document.body.appendChild(big);
      }));
    }));
    updateStats();
  }

  function updateStats() {
    const hl = state.timeline.filter(n => n.highlight).length;
    const el = document.getElementById('highlightCount');
    if (el) el.textContent = hl;
    const years = [...new Set(state.timeline.map(n => (n.dateStr||'').slice(0,4)).filter(Boolean))];
    const yb = document.getElementById('yearBadge');
    if (yb && years.length) yb.textContent = years.length === 1 ? years[0] : years[0] + ' — ' + years[years.length-1];
  }

  function setupEventListeners() {
    document.querySelectorAll('.media-tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active'); state.filter = tab.dataset.type; renderMedia();
    }));
    const uz = document.getElementById('uploadZone');
    if (uz) {
      uz.addEventListener('click', () => {
        const i = document.createElement('input');
        i.type = 'file'; i.multiple = true; i.accept = 'image/*,video/*,audio/*,.txt,.md';
        i.onchange = e => e.target.files.length && handleFiles(e.target.files);
        i.click();
      });
      ['dragenter','dragover'].forEach(ev => uz.addEventListener(ev, e => { e.preventDefault(); uz.style.borderColor='#76b900'; uz.style.background='rgba(118,185,0,0.1)'; }));
      ['dragleave','drop'].forEach(ev => uz.addEventListener(ev, e => { e.preventDefault(); uz.style.borderColor=''; uz.style.background=''; }));
      uz.addEventListener('drop', e => e.dataTransfer.files && e.dataTransfer.files.length && handleFiles(e.dataTransfer.files));
    }
    const addBtn = document.getElementById('addNodeBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor(null));
    document.querySelectorAll('[data-action="open-settings"]').forEach(b => b.addEventListener('click', openSettings));
    const genAll = document.getElementById('genAllBtn');
    if (genAll) genAll.addEventListener('click', async () => {
      if (!confirm('为所有节点重新生成 AI 洞察？')) return;
      genAll.disabled = true; genAll.textContent = '⚡ 生成中...';
      for (const n of state.timeline) { await genAIForNode(n); renderTimeline(false); }
      genAll.disabled = false; genAll.textContent = '⚡ 为所有节点重新生成 AI 洞察';
      showToast('✓ 全部 AI 洞察已更新');
    });
    const genStory = document.getElementById('genStoryBtn');
    if (genStory) genStory.addEventListener('click', () => generateStoryBook());
    const copyStory = document.getElementById('copyStoryBtn');
    if (copyStory) copyStory.addEventListener('click', () => {
      const text = document.getElementById('storyBook')?.innerText;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => showToast('📋 已复制到剪贴板'));
    });
  }

  // ===== 故事书生成 =====
  function generateStoryBook() {
    const nodes = state.timeline;
    if (!nodes || nodes.length === 0) { showToast('还没有故事节点'); return; }

    const highlightNodes = nodes.filter(n => n.highlight);
    const timeSpan = `${nodes[0]?.date?.slice(0,7) || ''} — ${nodes[nodes.length-1]?.date?.slice(0,7) || ''}`;

    let story = `# 💕 我们的爱情故事\n\n`;
    story += `*记录于 ${new Date().toLocaleDateString('zh-CN')} · 由英伟达 RTX Spark AI 本地生成*\n\n`;
    story += `---\n\n**这段感情跨越了 ${timeSpan} 的时光，一共 ${nodes.length} 个故事节点，${highlightNodes.length} 个高光时刻。**\n\n`;
    story += `---\n\n`;

    nodes.forEach((node, i) => {
      const star = node.highlight ? '⭐ ' : '';
      story += `### ${star}${node.title || '未命名的回忆'}\n\n`;
      story += `📍 ${node.date || '未知日期'}\n\n`;
      if (node.summary) story += `${node.summary}\n\n`;
      if (node.aiNote && node.aiNote.text) {
        story += `> ${node.aiNote.text}\n\n`;
      }
    });

    story += `---\n\n*✨ 这份故事书由 SparkMemo AI 智能体自动整理，依托英伟达 RTX Spark 的本地算力，所有数据始终留在你的电脑上，守护最私密的浪漫。*\n\n#ShareYourSpark#`;

    const container = document.getElementById('storyBook');
    if (container) {
      container.innerHTML = story.split('\n').map(line => {
        if (line.startsWith('# ')) return `<h1>${escapeHTML(line.slice(2))}</h1>`;
        if (line.startsWith('### ')) return `<h3 style="color:#ff6b9d;margin:12px 0 6px;">${escapeHTML(line.slice(4))}</h3>`;
        if (line.startsWith('---')) return `<hr style="border:none;border-top:1px solid #333;margin:12px 0;">`;
        if (line.startsWith('> ')) return `<div style="border-left:2px solid #76b900;padding-left:10px;color:#b0b0b0;font-size:11px;font-style:italic;margin:6px 0;">${escapeHTML(line.slice(2))}</div>`;
        if (line.startsWith('*') && line.endsWith('*')) return `<div style="font-size:10px;color:#888;text-align:center;margin:6px 0;">${escapeHTML(line.replace(/\*/g,''))}</div>`;
        if (line.trim()) return `<p style="font-size:12px;line-height:1.7;margin:4px 0;">${escapeHTML(line)}</p>`;
        return '';
      }).join('');
    }

    const copyBtn = document.getElementById('copyStoryBtn');
    if (copyBtn) copyBtn.style.display = 'block';
    showToast('📖 故事书已生成！');
  }

  // ===== 文件上传 =====
  async function handleFiles(fileList) {
    const files = Array.from(fileList);
    for (const f of files) await processFile(f);
    state.media = getMedia(); renderMedia();
    showToast('✓ 导入 ' + files.length + ' 个素材');
  }
  async function processFile(file) {
    const fid = crypto.randomUUID();
    const type = file.type.startsWith('image/')?'photo':file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'voice':'text';
    const ds = new Date().toISOString().slice(0,10);
    const item = { id: crypto.randomUUID(), fileId: fid, name: file.name, size: fmtSize(file.size), type, tags: [], dateStr: ds, date: ds.replace(/-/g,'.'), createdAt: Date.now(), content: null };
    if (type === 'text') item.content = await file.text();
    else { try { await saveBlob(fid, file, file.name, file.type); } catch(e) {} }
    addMedia(item);
  }
  function fmtSize(b) { if(b<1024)return b+'B'; if(b<1048576)return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; }

  async function handleDelMedia(id) { if(!confirm('确定删除？')) return; await removeMedia(id); state.media=getMedia(); renderMedia(); showToast('已删除'); }

  async function handlePreview(id) {
    const m = state.media.find(x => x.id === id); if (!m) return;
    let c = '';
    if (m.type === 'text') { c = '<div style="padding:20px;line-height:1.8;white-space:pre-wrap;">' + esc(m.content || '(无内容)') + '</div>'; }
    else if (m.fileId) {
      try {
        const blob = await getBlob(m.fileId);
        if (blob) {
          const u = URL.createObjectURL(blob);
          if (m.type === 'photo') c = '<img src="' + u + '" style="max-width:100%;max-height:80vh;border-radius:8px;">';
          else if (m.type === 'video') c = '<video src="' + u + '" controls style="max-width:100%;max-height:80vh;border-radius:8px;"></video>';
          else c = '<audio src="' + u + '" controls style="width:100%;"></audio>';
        } else c = '<div style="padding:40px;color:#888;">加载失败</div>';
      } catch(e) { c = '<div style="padding:40px;color:#888;">加载失败</div>'; }
    } else { c = '<div style="padding:40px;color:#888;">（示例数据，无真实文件）</div>'; }
    showModal('📎 ' + esc(m.name), c);
  }

  // ===== 时间线编辑器 =====
  function openEditor(node) {
    const isEdit = !!node;
    const n = node || { title: '', dateStr: new Date().toISOString().slice(0,10), summary: '', highlight: false, color: colorCycle[state.timeline.length % colorCycle.length] };
    const html = '<div style="display:flex;flex-direction:column;gap:12px;padding:16px 4px;">' +
      '<div><label class="ml">日期</label><input type="date" id="ne_date" value="' + (n.dateStr||'') + '" class="mf"></div>' +
      '<div><label class="ml">标题</label><input type="text" id="ne_title" value="' + esc(n.title) + '" placeholder="例如：第一次旅行" class="mf"></div>' +
      '<div><label class="ml">故事摘要</label><textarea id="ne_summary" rows="3" placeholder="写下这段回忆..." class="mf2">' + esc(n.summary) + '</textarea></div>' +
      '<div><label class="ml">图片路径（可选，点击节点时预览大图）</label><input type="text" id="ne_image" value="' + esc(n.image || '') + '" placeholder="assets/xxx.jpg" class="mf"></div>' +
      '<div><label class="ml">颜色标记</label><div style="display:flex;gap:8px;">' +
        colorCycle.map(c => { const col = c==='dot-pink'?'#ff6b9d':c==='dot-sky'?'#74b9ff':c==='dot-peach'?'#ffb347':c==='dot-lavender'?'#a29bfe':'#76b900'; return '<button data-color="'+c+'" style="width:28px;height:28px;border-radius:50%;border:3px solid '+(n.color===c?'#fff':'transparent')+';background:'+col+';cursor:pointer;"></button>'; }).join('') +
      '</div></div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#b0b0b0;"><input type="checkbox" id="ne_hl" '+(n.highlight?'checked':'')+'> 标记为故事亮点</label>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button id="ne_cancel" style="flex:1;padding:10px;background:#333;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;">取消</button>' +
        '<button id="ne_save" style="flex:1;padding:10px;background:#76b900;border:none;border-radius:6px;color:#000;cursor:pointer;font-size:12px;font-weight:600;">' + (isEdit?'保存':'创建') + '</button>' +
      '</div></div>';
    const modal = showModal(isEdit?'✎ 编辑节点':'✨ 新建节点', html, true);
    let sc = n.color || colorCycle[0];
    modal.querySelectorAll('[data-color]').forEach(btn => btn.addEventListener('click', () => { sc = btn.dataset.color; modal.querySelectorAll('[data-color]').forEach(b => b.style.borderColor = b.dataset.color === sc ? '#fff' : 'transparent'); }));
    modal.querySelector('#ne_cancel').addEventListener('click', closeModal);
    modal.querySelector('#ne_save').addEventListener('click', async () => {
      const ds = modal.querySelector('#ne_date').value;
      const title = modal.querySelector('#ne_title').value.trim();
      const summary = modal.querySelector('#ne_summary').value.trim();
      const hl = modal.querySelector('#ne_hl').checked;
      const image = modal.querySelector('#ne_image').value.trim();
      if (!title) { showToast('标题不能为空'); return; }
      const patch = { title, summary, highlight: hl, color: sc, dateStr: ds, date: ds.replace(/-/g,'.'), image };
      if (isEdit) state.timeline = updateTimelineNode(node.id, patch);
      else state.timeline = addTimelineNode(Object.assign({}, patch, { mediaIds: [] }));
      const newNode = state.timeline.find(x => isEdit ? x.id === node.id : x.title === title);
      if (newNode) await genAIForNode(newNode);
      closeModal(); renderTimeline(true); showToast(isEdit?'已更新':'已创建');
    });
  }

  async function genAIForNode(node) {
    if (typeof generateStory !== 'function') return;
    const related = state.media.filter(m => m.dateStr && node.dateStr && Math.abs((new Date(m.dateStr) - new Date(node.dateStr)) / 86400000) < 30);
    const result = await generateStory(related, node, state.settings);
    state.timeline = updateTimelineNode(node.id, { aiNote: result.insight });
    setTimeline(state.timeline);
  }

  // ===== 设置 =====
  function openSettings() {
    const s = state.settings;
    const html = '<div style="display:flex;flex-direction:column;gap:14px;padding:16px 4px;">' +
      '<div><label class="ml">AI 模式</label><select id="s_mode" class="mf">' +
        '<option value="local" '+(s.aiMode!=='cloud'?'selected':'')+'>本地模板引擎（推荐 · 零成本）</option>' +
        '<option value="cloud" '+(s.aiMode==='cloud'?'selected':'')+'>云端 LLM API（需 Key）</option></select></div>' +
      '<div id="cs" style="'+(s.aiMode==='cloud'?'':'display:none;')+'"><label class="ml">API Key</label><input type="password" id="s_key" value="'+(s.apiKey||'')+'" placeholder="sk-..." class="mf"><div style="font-size:10px;color:#666;margin-top:4px;">仅存在你的浏览器本地</div></div>' +
      '<div style="border-top:1px solid #333;padding-top:14px;margin-top:4px;"><div class="ml" style="margin-bottom:8px;">数据管理</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button id="s_export" class="dbtn g">📤 导出 JSON</button>' +
          '<button id="s_import" class="dbtn b">📥 导入备份</button>' +
          '<button id="s_reset" class="dbtn b">🔄 恢复预置故事</button>' +
          '<button id="s_clear" class="dbtn r">🗑 清空全部</button>' +
        '</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<button id="s_cancel" style="flex:1;padding:10px;background:#333;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:12px;">关闭</button>' +
        '<button id="s_save" style="flex:1;padding:10px;background:#76b900;border:none;border-radius:6px;color:#000;cursor:pointer;font-size:12px;font-weight:600;">保存设置</button>' +
      '</div></div>';
    const m = showModal('⚙️ 设置与数据管理', html, true);
    m.querySelector('#s_mode').addEventListener('change', e => { m.querySelector('#cs').style.display = e.target.value==='cloud'?'':'none'; });
    m.querySelector('#s_cancel').addEventListener('click', closeModal);
    m.querySelector('#s_save').addEventListener('click', () => { state.settings = { aiMode: m.querySelector('#s_mode').value, apiKey: m.querySelector('#s_key').value.trim() }; setSettings(state.settings); closeModal(); showToast('已保存'); });
    m.querySelector('#s_export').addEventListener('click', async () => {
      const pkg = await exportData(); const blob = new Blob([JSON.stringify(pkg,null,2)], {type:'application/json'});
      const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = 'sparkmemo-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(u); showToast('已下载');
    });
    m.querySelector('#s_import').addEventListener('click', () => {
      const i = document.createElement('input'); i.type='file'; i.accept='.json';
      i.onchange = async e => { const f = e.target.files[0]; if(!f) return; try { const pkg = JSON.parse(await f.text()); if(!confirm('覆盖当前数据？')) return; await importData(pkg); state.media=getMedia(); state.timeline=getTimeline(); renderMedia(); renderTimeline(true); closeModal(); showToast('导入成功'); } catch(err){ showToast('导入失败'); } };
      i.click();
    });
    m.querySelector('#s_reset').addEventListener('click', async () => {
      if(!confirm('恢复到豆包&奶龙预置爱情故事？当前时间线将被替换。')) return;
      if(!confirm('⚠️ 再次确认：当前时间线将丢失！')) return;
      localStorage.removeItem('sparkmemo_timeline');
      state.timeline = getTimeline();
      renderTimeline(true);
      closeModal();
      showToast('✓ 已恢复预置故事');
    });
    m.querySelector('#s_clear').addEventListener('click', async () => { if(!confirm('⚠️ 确定清空所有数据？')) return; if(!confirm('再次确认：不可恢复！')) return; await clearAll(); state.media=getMedia(); state.timeline=getTimeline(); renderMedia(); renderTimeline(true); closeModal(); showToast('已清空'); });
  }

  // ===== 引擎动画 =====
  function animateProcessSteps() {
    const steps = document.querySelectorAll('.process-step'); if(!steps.length) return;
    steps.forEach(s => { s.querySelector('.step-icon').classList.remove('active','done'); s.querySelector('.step-text').classList.remove('active','done'); s.querySelector('.step-icon').textContent='✦'; });
    setTimeout(() => { steps[0].querySelector('.step-icon').classList.add('done'); steps[0].querySelector('.step-icon').textContent='✓'; steps[0].querySelector('.step-text').classList.add('done'); }, 200);
    setTimeout(() => { steps[1].querySelector('.step-icon').classList.add('done'); steps[1].querySelector('.step-icon').textContent='✓'; steps[1].querySelector('.step-text').classList.add('done'); steps[2].querySelector('.step-icon').classList.add('active'); steps[2].querySelector('.step-text').classList.add('active'); }, 1500);
    setTimeout(() => { steps[2].querySelector('.step-icon').classList.remove('active'); steps[2].querySelector('.step-icon').classList.add('done'); steps[2].querySelector('.step-icon').textContent='✓'; steps[2].querySelector('.step-text').classList.remove('active'); steps[2].querySelector('.step-text').classList.add('done'); steps[3].querySelector('.step-icon').classList.add('active'); steps[3].querySelector('.step-text').classList.add('active'); }, 3500);
    setTimeout(() => { steps[3].querySelector('.step-icon').classList.remove('active'); steps[3].querySelector('.step-icon').classList.add('done'); steps[3].querySelector('.step-icon').textContent='✓'; steps[3].querySelector('.step-text').classList.remove('active'); steps[3].querySelector('.step-text').classList.add('done'); steps[4].querySelector('.step-icon').classList.add('active'); steps[4].querySelector('.step-text').classList.add('active'); }, 5500);
    setTimeout(() => { steps[4].querySelector('.step-icon').classList.remove('active'); steps[4].querySelector('.step-icon').classList.add('done'); steps[4].querySelector('.step-icon').textContent='✓'; steps[4].querySelector('.step-text').classList.remove('active'); steps[4].querySelector('.step-text').classList.add('done'); }, 7500);
  }

  // ===== 模态框 / Toast =====
  function showModal(title, html, persistent) {
    closeModal();
    const overlay = document.createElement('div'); overlay.id='modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML='<div style="background:#1a1a1a;border:1px solid #333;border-radius:12px;width:600px;max-width:92vw;max-height:88vh;overflow-y:auto;"><div style="padding:16px 20px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;"><div style="font-size:14px;font-weight:600;">'+title+'</div><button id="mc" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">✕</button></div><div style="padding:8px 4px;">'+html+'</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#mc').addEventListener('click', closeModal);
    if (!persistent) overlay.addEventListener('click', e => { if(e.target===overlay) closeModal(); });
    return overlay.querySelector('div > div');
  }
  function closeModal() { const el = document.getElementById('modal-overlay'); if(el) el.remove(); }
  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#76b900;color:#000;padding:10px 20px;border-radius:24px;font-size:13px;font-weight:600;z-index:10000;box-shadow:0 4px 20px rgba(118,185,0,0.4);opacity:0;transition:opacity 0.3s;'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity='1'; clearTimeout(t._timer); t._timer=setTimeout(()=>t.style.opacity='0', 2500);
  }
  function esc(s) { if(!s)return''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
  const escapeHTML = esc;  // 兼容旧调用

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
