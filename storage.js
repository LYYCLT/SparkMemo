// ============================================================
// storage.js — SparkMemo 本地持久化层
// ============================================================

const DB_NAME = 'SparkMemo';
const DB_VERSION = 1;
const STORE_FILES = 'files';
const LS_MEDIA = 'sparkmemo_media';
const LS_TIMELINE = 'sparkmemo_timeline';
const LS_SETTINGS = 'sparkmemo_settings';
const LS_SEEDED = 'sparkmemo_seeded_v4';  // ← 改版本号！强制重置

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_FILES)) {
        d.createObjectStore(STORE_FILES, { keyPath: 'fileId' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveBlob(fileId, blob, name, mimeType) {
  await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put({ fileId, blob, name, mimeType });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(fileId) {
  await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(fileId);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteBlob(fileId) {
  await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).delete(fileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function getMedia() { return loadJSON(LS_MEDIA, []); }
function setMedia(arr) { saveJSON(LS_MEDIA, arr); }

function addMedia(item) {
  const list = getMedia();
  list.push(item);
  setMedia(list);
  return item;
}
async function removeMedia(id) {
  const list = getMedia();
  const item = list.find(m => m.id === id);
  if (item && item.fileId) { try { await deleteBlob(item.fileId); } catch (e) {} }
  setMedia(list.filter(m => m.id !== id));
}

function getTimeline() {
  const existing = loadJSON(LS_TIMELINE, null);
  if (existing && existing.length > 0 && existing.some(n => n.images)) return existing;
  return getSeededTimeline();
}
function setTimeline(arr) { saveJSON(LS_TIMELINE, arr); }

function addTimelineNode(node) {
  const list = getTimeline();
  list.push({ ...node, id: crypto.randomUUID(), createdAt: Date.now() });
  list.sort((a, b) => (a.dateStr || '').localeCompare(b.dateStr || ''));
  setTimeline(list);
  return list;
}
function updateTimelineNode(id, patch) {
  const list = getTimeline();
  const idx = list.findIndex(n => n.id === id);
  if (idx >= 0) { list[idx] = { ...list[idx], ...patch }; setTimeline(list); }
  return list;
}
function removeTimelineNode(id) {
  setTimeline(getTimeline().filter(n => n.id !== id));
}

function getSettings() { return loadJSON(LS_SETTINGS, { aiMode: 'local', apiKey: '' }); }
function setSettings(s) { saveJSON(LS_SETTINGS, s); }

async function clearAll() {
  localStorage.removeItem(LS_MEDIA);
  localStorage.removeItem(LS_TIMELINE);
  localStorage.removeItem(LS_SEEDED);
  try { await openDB(); const tx = db.transaction(STORE_FILES, 'readwrite'); tx.objectStore(STORE_FILES).clear(); } catch (e) {}
}

async function exportData() {
  const media = getMedia();
  const withBlobs = [];
  for (const m of media) {
    if (m.fileId) {
      const blob = await getBlob(m.fileId);
      if (blob) {
        m._blobB64 = await blobToBase64(blob);
        m._mimeType = blob.type;
      }
    }
    withBlobs.push(m);
  }
  return { version: 1, exportedAt: new Date().toISOString(), media: withBlobs, timeline: getTimeline() };
}
async function importData(pkg) {
  if (!pkg || pkg.version !== 1) throw new Error('不支持的备份版本');
  await clearAll();
  for (const m of pkg.media || []) {
    if (m._blobB64) {
      const blob = base64ToBlob(m._blobB64, m._mimeType || 'application/octet-stream');
      await saveBlob(m.fileId, blob, m.name, m._mimeType);
      delete m._blobB64; delete m._mimeType;
    }
  }
  setMedia(pkg.media || []);
  setTimeline(pkg.timeline || []);
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ============================================================
// 预置数据 — 豆包 & 奶龙 28 张照片全部用上
// ============================================================

const S = 'assets/story/';
const NV = 'assets/nvidia/';

// 28张照片的文件名（完整）
const ALL_PHOTOS = [
  'Screenshot_2026-11-02-09-40-12-763_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-40-28-553_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-40-37-935_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-40-47-950_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-41-03-326_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-41-24-832_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-41-41-261_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-41-47-494_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-41-56-188_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-42-38-727_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-42-47-245_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-43-14-281_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-43-20-837_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-43-41-309_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-43-58-880_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-44-32-911_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-44-43-135_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-45-36-413_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-45-43-360_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-46-13-621_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-46-26-123_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-46-36-438_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-46-46-524_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-46-55-774_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-47-06-754_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-47-14-754_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-47-23-949_com.ss.android.jpg',
  'Screenshot_2026-11-02-09-47-49-399_com.ss.android.jpg',
];

function p(filename) { return S + filename; }

function getSeededTimeline() {
  return [
    {
      id: 's-01', dateStr: '2023-02-14', date: '2023.02 · Valentine',
      title: '🍬 便利店的关东煮 · 第一个情人节', highlight: false, color: 'dot-peach',
      summary: '没有昂贵的礼物，只有一盒关东煮和聊不完的话题。她说这是她过的最开心的情人节。',
      image: p(ALL_PHOTOS[0]),
      images: [p(ALL_PHOTOS[0]), p(ALL_PHOTOS[1]), p(ALL_PHOTOS[2])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '场景识别：便利店暖色调 · 情感基调：温暖、踏实 · 关键词：陪伴、幸福 · 3 张图片人脸匹配度 100%' }
    },
    {
      id: 's-02', dateStr: '2023-03-15', date: '2023.03 · 初遇',
      title: '🏮 青衫初遇 · 长安城外桃花盛开', highlight: true, color: 'dot-pink',
      summary: '那年长安城外桃花正盛，他背着行囊正要远行，她在桥边卖花。四目相对的那一刻，桥边的桃花仿佛都开得更艳了。',
      image: p(ALL_PHOTOS[3]),
      images: [p(ALL_PHOTOS[3]), p(ALL_PHOTOS[4])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '古装汉服场景识别成功 · 情绪向量分析：心动度 92% · 多模态融合：桃花元素+古装背景 → 宿命感' }
    },
    {
      id: 's-03', dateStr: '2023-05-20', date: '2023.05 · 花朝节',
      title: '🌸 花朝节 · 他为她编了一个花环', highlight: true, color: 'dot-pink',
      summary: '雪花纷飞的林间，他笨拙地用野花编了一个花环戴在她头上。她说这是她收到过最好的礼物。',
      image: p(ALL_PHOTOS[22]),
      images: [p(ALL_PHOTOS[22]), p(ALL_PHOTOS[23]), p(ALL_PHOTOS[24])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '多模态分析：雪景+花环+微笑 · 情感基调：纯真、温暖 · 关键词：雪中浪漫、花环、最甜的礼物' }
    },
    {
      id: 's-04', dateStr: '2023-07-07', date: '2023.07 · 七夕穿越',
      title: '🌊 海边 · 她穿越而来，而他等了很久', highlight: true, color: 'dot-sky',
      summary: '不知是命运还是巧合，她从古代穿越到了现代。海边的风把她的长发吹起，而他——已经等了很久很久。',
      image: p(ALL_PHOTOS[13]),
      images: [p(ALL_PHOTOS[13]), p(ALL_PHOTOS[14]), p(ALL_PHOTOS[15])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '海边夕阳场景识别 · 人脸匹配：两人亲密拥抱 · 情感关键词：穿越、重逢、宿命感 · 建议配曲：温柔钢琴曲' }
    },
    {
      id: 's-05', dateStr: '2023-09-10', date: '2023.09 · 困境',
      title: '💔 三人之间 · 命运开了个玩笑', color: 'dot-peach',
      summary: '当另一个他也出现在她面前时，她第一次红了眼眶。穿越时空的感情，难道真的注定没有结果？',
      image: p(ALL_PHOTOS[23]),
      images: [p(ALL_PHOTOS[23]), p(ALL_PHOTOS[11])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '情感识别：悲伤度 78% · 三人构图分析：居中者为情绪焦点 · 建议标签：选择、困境、三角恋' }
    },
    {
      id: 's-06', dateStr: '2023-11-11', date: '2023.11 · 烟火',
      title: '🎆 烟火下的承诺 · 不管哪个朝代', color: 'dot-sky',
      summary: '跨年的烟火照亮了整个城市。他说：不管哪个朝代，不管什么模样，我都能在人群中第一眼找到你。',
      image: p(ALL_PHOTOS[1]),
      images: [p(ALL_PHOTOS[1]), p(ALL_PHOTOS[6]), p(ALL_PHOTOS[7])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '城市夜景+烟火光效识别 · 情感高潮确认：浪漫度 88% · 关键词：承诺、永恒、烟火下' }
    },
    {
      id: 's-07', dateStr: '2024-01-01', date: '2024.01 · 除夕夜',
      title: '🏮 除夕夜 · 一起吃的第一顿年夜饭', color: 'dot-pink',
      summary: '第一次带她回"家"。虽然这个"家"是穿越时空才找到的，但年夜饭的热气里，一切都像真的一样。',
      image: p(ALL_PHOTOS[4]),
      images: [p(ALL_PHOTOS[4]), p(ALL_PHOTOS[5]), p(ALL_PHOTOS[8])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '暖色调团圆场景 · 情感基调：归属感、温馨 · 多模态融合完成 · 建议标签：家、年夜饭、圆满' }
    },
    {
      id: 's-08', dateStr: '2024-02-14', date: '2024.02 · Valentine',
      title: '💌 情人节 · 他用现代语言写了三行情诗', highlight: true, color: 'dot-peach',
      summary: '她说她最喜欢诗人。于是他用她听不懂的现代语言，写了三行情诗。她没看懂，但她哭了。',
      image: p(ALL_PHOTOS[11]),
      images: [p(ALL_PHOTOS[11]), p(ALL_PHOTOS[16]), p(ALL_PHOTOS[17])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '感动度识别 85% · 关键词匹配：哭了、情书、三行情诗 · AI 建议背景音乐：轻音乐' }
    },
    {
      id: 's-09', dateStr: '2024-04-05', date: '2024.04 · 重逢',
      title: '🌌 终于 · 她选择了留下', highlight: true, color: 'dot-pink',
      summary: '不管是古代还是现代，不管是穿越还是宿命。这一次，她不再回头。',
      image: p(ALL_PHOTOS[17]),
      images: [p(ALL_PHOTOS[17]), p(ALL_PHOTOS[18]), p(ALL_PHOTOS[19])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '终章场景分析：拥抱+侧脸特写 · 情感高潮确认 · AI 推荐故事结尾语："终于，你选择了留下。"' }
    },
    {
      id: 's-10', dateStr: '2024-06-06', date: '2024.06 · 日常',
      title: '☕ 平淡的一天 · 却成了最甜的回忆', color: 'dot-lavender',
      summary: '没有烟花，没有穿越，只是一起窝在沙发上看电影，她的头靠在他肩上。这就是最好的时光。',
      image: p(ALL_PHOTOS[16]),
      images: [p(ALL_PHOTOS[16]), p(ALL_PHOTOS[9]), p(ALL_PHOTOS[10])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '日常场景温馨度 90% · 关键词：平淡、幸福、陪伴 · 所有 28 张素材多模态分析完成' }
    },
    {
      id: 's-11', dateStr: '2024-08-15', date: '2024.08 · 中秋',
      title: '🌕 中秋节 · 同一轮明月，不同的时空', color: 'dot-sky',
      summary: '她说古代的月亮比现代的圆。他笑了，把手机里的月亮照片翻出来给她看——一样的。',
      image: p(ALL_PHOTOS[12]),
      images: [p(ALL_PHOTOS[12]), p(ALL_PHOTOS[19])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '文化符号识别：明月、中秋 · 情感基调：思念、共鸣 · 图片匹配：两人仰望角度一致' }
    },
    {
      id: 's-12', dateStr: '2024-10-01', date: '2024.10 · 国庆',
      title: '🚗 自驾旅行 · 她说想去看最远的山', color: 'dot-green',
      summary: '国庆长假，租了一辆车往山里开。她说她在古代也看过山，但这一次是和"这个时空"的他。',
      image: p(ALL_PHOTOS[25]),
      images: [p(ALL_PHOTOS[25]), p(ALL_PHOTOS[26]), p(ALL_PHOTOS[27])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '旅行场景识别 · 开心度峰值 · 最后 3 张素材：公路、背包、吉他 → 自由精神' }
    },
    {
      id: 's-13', dateStr: '2024-12-25', date: '2024.12 · 圣诞',
      title: '🎄 圣诞夜 · 她说愿意', highlight: true, color: 'dot-pink',
      summary: '圣诞夜的雪花飘落，他单膝跪下。她没有哭，她笑着说："你终于学会用这个世界的方式求婚了。"',
      image: p(ALL_PHOTOS[6]),
      images: [p(ALL_PHOTOS[6]), p(ALL_PHOTOS[20]), p(ALL_PHOTOS[21])],
      aiNote: { label: 'RTX Spark · AI 情感洞察', text: '🎉 重大事件识别：求婚成功 · 激动度峰值 97% · 情感故事完整闭环 · 恭喜你们！' }
    },
  ];
}

// NVIDIA 素材
function getNvidiaAssets() {
  return [
    { id: 'nv-1', name: 'RTX Spark 笔记本渲染图', path: NV + 'sprak.jpeg', type: 'photo', tag: '产品图' },
    { id: 'nv-2', name: 'RTX Spark 开发部署流程', path: NV + 'rtx-develop-deploy-ai-ari.jpeg', type: 'photo', tag: '技术架构' },
    { id: 'nv-3', name: 'AI Agent 运行演示', path: NV + 'nvidia-rtx-spark-ai-agent-looping-vid.mp4', type: 'video', tag: '视频' },
  ];
}

// 强制每次加载都重置到最新版本（调试用）
(function init() {
  try {
    // 清除所有旧版本数据
    const keys = Object.keys(localStorage);
    keys.forEach(k => { if (k.startsWith('sparkmemo')) localStorage.removeItem(k); });
    // 写入新版本预置数据
    localStorage.setItem('sparkmemo_seeded_v4', '1');
    localStorage.setItem(LS_TIMELINE, JSON.stringify(getSeededTimeline()));
    localStorage.setItem(LS_MEDIA, JSON.stringify([]));
    console.log('[SparkMemo] ✅ 豆包&奶龙爱情故事 13 个节点已加载');
  } catch(e) {
    console.error('[SparkMemo] init error:', e);
  }
})();
