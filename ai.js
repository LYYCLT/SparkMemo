// ============================================================
// ai.js — SparkMemo 故事生成引擎
// ============================================================

const EMOTION_KEYWORDS = {
  正向: ['幸福', '开心', '喜欢', '爱', '甜蜜', '温暖', '踏实', '心动', '特别', '笑', '拥抱', '牵手', '一起', '永远', '珍惜'],
  激动: ['激动', '哭了', '泪', '求婚', '告白', '惊喜', '感动', '心跳'],
  平静: ['平淡', '日常', '满足', '放松', '周末', '散步', '安静'],
  地点: ['三亚', '成都', '杭州', '北京', '上海', '东京', '大理', '厦门', '西安', '重庆', '雪山', '海边', '西湖', '环球影城', '迪士尼'],
  活动: ['旅行', 'vlog', '火锅', '电影', '演唱会', '跨年', '圣诞', '生日', '婚礼', '喝咖啡', '散步', '骑行'],
};

function analyzeMedia(mediaList) {
  const stats = { photo: 0, video: 0, text: 0, voice: 0 };
  const allTags = [];
  const allText = [];
  const dates = [];
  
  (mediaList || []).forEach(m => {
    stats[m.type] = (stats[m.type] || 0) + 1;
    (m.tags || []).forEach(t => allTags.push(t));
    if (m.content) allText.push(m.content);
    if (m.dateStr) dates.push(m.dateStr);
  });

  const textBlob = allText.join(' ') + ' ' + allTags.join(' ');
  const emotionHits = {};
  for (const [cat, words] of Object.entries(EMOTION_KEYWORDS)) {
    emotionHits[cat] = words.filter(w => textBlob.includes(w)).map(w => ({
      word: w, count: (textBlob.match(new RegExp(w, 'g')) || []).length
    })).sort((a,b) => b.count - a.count);
  }

  let span = '';
  if (dates.length >= 2) {
    dates.sort();
    const start = new Date(dates[0]);
    const end = new Date(dates[dates.length - 1]);
    const months = (end - start) / (1000*60*60*24*30);
    span = `${Math.round(months)} 个月的共同回忆`;
  } else if (dates.length === 1) {
    span = `这一天的珍贵瞬间`;
  }

  const places = (emotionHits['地点'] || []).slice(0, 3).map(h => h.word);
  const activities = (emotionHits['活动'] || []).slice(0, 3).map(h => h.word);

  return { stats, allTags, emotionHits, span, places, activities, mediaCount: mediaList?.length || 0 };
}

function generateLocalStory(mediaList, timelineNode) {
  const analysis = analyzeMedia(mediaList);
  const { stats, emotionHits, span, places, activities, mediaCount } = analysis;

  const topEmotion = Object.entries(emotionHits)
    .filter(([k]) => !['地点', '活动'].includes(k))
    .sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0))[0];
  const emotionLabel = topEmotion?.[0] || '正向';
  const topWords = topEmotion?.[1]?.slice(0, 3).map(w => w.word) || [];

  const parts = [];
  parts.push(`共分析 ${mediaCount} 份素材`);
  if (stats.photo) parts.push(`${stats.photo} 张照片`);
  if (stats.video) parts.push(`${stats.video} 段视频`);
  if (stats.text) parts.push(`${stats.text} 条文字记录`);
  if (stats.voice) parts.push(`${stats.voice} 段语音`);
  
  if (places.length) parts.push(`识别地点：${places.join('、')}`);
  if (activities.length) parts.push(`识别活动：${activities.join('、')}`);
  if (topWords.length) parts.push(`情感基调「${emotionLabel}」，高频词：${topWords.join('、')}`);

  const insightText = parts.join(' · ');

  const storySentences = [];
  if (timelineNode?.title) {
    storySentences.push(`关于「${timelineNode.title}」——`);
  } else {
    storySentences.push(`这是${span || '你们'}的一段回忆——`);
  }
  if (places.length) storySentences.push(`在${places[0]}的时光里，`);
  if (topWords.length > 0 && (topWords[0] === '爱' || topWords.includes('心动'))) {
    storySentences.push(`那些藏不住的心动瞬间，被镜头一一捕捉。`);
  } else if (topWords.length > 0 && (topWords.includes('哭了') || topWords.includes('感动'))) {
    storySentences.push(`那个让你们都红了眼眶的时刻，值得被永远记住。`);
  } else {
    storySentences.push(`每一个看似普通的瞬间，因为有彼此而变得特别。`);
  }
  storySentences.push(`这些碎片拼在一起，就是你们独有的浪漫故事。`);

  return {
    insight: { label: 'AI 情感洞察', text: insightText },
    story: storySentences.join(''),
    analysis
  };
}

async function generateStory(mediaList, timelineNode, settings) {
  settings = settings || (typeof getSettings === 'function' ? getSettings() : { aiMode: 'local' });
  
  if (settings.aiMode === 'cloud' && settings.apiKey) {
    try {
      const result = await callCloudAPI(mediaList, timelineNode, settings);
      if (result && result.insight) return { ...result, source: 'cloud' };
    } catch (e) { console.warn('Cloud AI failed, fallback:', e.message); }
  }
  return { ...generateLocalStory(mediaList, timelineNode), source: 'local' };
}

async function callCloudAPI(mediaList, timelineNode, settings) {
  const analysis = analyzeMedia(mediaList);
  const prompt = `你是温暖的情侣故事分析师。根据素材生成一段100字温暖故事(story字段)和一段简洁技术洞察(insight字段)。
节点：${timelineNode?.title || '全部'}
摘要：${timelineNode?.summary || ''}
素材：照片${analysis.stats.photo||0}/视频${analysis.stats.video||0}/文字${analysis.stats.text||0}/语音${analysis.stats.voice||0}
地点：${analysis.places.join('、')}
活动：${analysis.activities.join('、')}
请返回JSON: {"story":"...", "insight":"..."}`;

  const endpoint = settings.llmEndpoint || '/api/generate-story';
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, apiKey: settings.apiKey })
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  return { insight: { label: 'AI 情感洞察', text: data.insight || data.story || '' }, story: data.story || data.text || '' };
}

if (typeof window !== 'undefined') {
  window.SparkMemo = window.SparkMemo || {};
  window.SparkMemo.generateStory = generateStory;
  window.SparkMemo.analyzeMedia = analyzeMedia;
}
