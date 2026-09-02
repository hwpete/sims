// ============================================================
//  历史人生模拟器 · 前端主逻辑（纯 AI 驱动）
//  版本：V1.2 · 包含节奏切换反馈 + 行动重试机制
//  依赖：后端 FastAPI 运行在 http://127.0.0.1:8000
// ============================================================

// ---- 工具函数 ----
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---- 常量 ----
const STORAGE = 'history-life-final-v12-save';
const API_BASE = 'http://127.0.0.1:8000';
const modeLabels = { strict: '严格历史', restore: '历史还原', legend: '历史传说', free: '自由行动' };
const ATTRIBUTE_LEVELS = {
  health: {
    魁健: '体格强健，极少患病，耐劳耐寒', 健康: '正常体魄，能胜任日常劳动', 尚可: '略有小疾或旧伤，不影响日常但易疲劳',
    虚弱: '长期病弱或重伤初愈', 衰微: '年老体衰或重病缠身', 濒危: '生命垂危，随时可能死亡'
  },
  energy: {
    充沛: '精神饱满，体力旺盛', 充裕: '正常状态，能应对日常工作', 渐疲: '略有倦意，注意力下降',
    疲惫: '明显疲劳，需休息恢复', 衰竭: '几近力竭，无法继续行动'
  },
  mood: {
    静明: '内心澄明，思虑清晰', 平宁: '情绪平稳，无大波澜', 忧思: '心事重重，常怀忧虑',
    愤懑: '怒气积郁，易冲动', 惶惑: '恐惧或迷茫，失去方向', 崩溃: '情绪崩溃，无法理智行动'
  },
  reputation: {
    无名: '乡野小民，无人知晓', 乡闻: '在乡里小有名声', 县知: '一县之内被人知晓',
    郡闻: '一郡之地皆知', 州望: '一州之名士/能人', 天下知: '名动天下'
  },
  knowledge: {
    未学: '不识字，不通文墨', 粗识: '认识一些字，能写简单文书', 通文: '能阅读经典，写作通顺',
    经学: '通晓经书，能讲论经典', 博学: '涉猎广泛，知史晓今', 大家: '一代通儒，学问传世'
  },
  martial: {
    文弱: '不通武艺，提刀手软', 粗习: '练过几手，懂些基本套路', 精熟: '武艺熟练，能应对正规士兵',
    骁勇: '武艺出众，可任百夫长/校尉', 虎将: '万人敌级别，能独当一面', 武圣: '当世无双，名垂战史'
  }
};
const ATTRIBUTE_LABELS = { health: '身体', energy: '精力', mood: '心境', reputation: '声望', knowledge: '知识', martial: '武勇' };
const ATTRIBUTE_ALIASES = {
  health: { 强健: '魁健', 良好: '健康', 正常: '健康', 不佳: '尚可', 病弱: '虚弱', 重伤: '尚可', 危重: '濒危', 濒死: '濒危' },
  energy: { 充足: '充裕', 正常: '充裕', 疲劳: '疲惫', 力竭: '衰竭' },
  mood: { 平静: '平宁', 稳定: '平宁', 焦虑: '忧思', 恐惧: '惶惑' },
  reputation: { 默默无闻: '无名', 小有名气: '乡闻', 有名: '县知' },
  knowledge: { 有限: '粗识', 未入门: '未学', 识字: '粗识' },
  martial: { 未入门: '文弱', 略懂: '粗习', 熟练: '精熟' }
};
const WORLD_BUILD_STEPS = [
  '正在建立世界基础框架……',
  '正在加载中国历史时间轴……',
  '正在构建地理、制度、社会、经济、文化系统……',
  '正在生成初始历史人物……',
  '正在建立信息层级系统……',
  '正在确认核心原则……'
];
const DEFAULT_NEARBY_CONTEXT = {
  current_era: '东汉末年',
  current_year: '初平元年（公元190年）',
  current_location: '荆州·南阳郡·邓县·黄家庄',
  historical_background: [
    '董卓废少帝立献帝后独揽朝政，关东各州郡牧守以袁绍为盟主起兵讨董。',
    '洛阳将遭焚毁，董卓准备挟献帝西迁长安；中原百姓流离，瘟疫与饥荒并行。',
    '南方相对安定但暗流涌动，南阳是袁术、孙坚与刘表势力交汇的前线后方。'
  ],
  political_situation: [
    '汉献帝刘协年幼，名义上为帝，实际权力在董卓手中。',
    '袁绍、曹操、公孙瓒、刘焉、孙坚等势力正在形成，关东联军彼此猜忌。',
    '刘表初入襄阳尚未完全控制南阳；袁术屯兵鲁阳，孙坚准备北上进击董卓。'
  ],
  society_and_economy: [
    '豪强地主庄园制仍在，大量自耕农沦为流民或佃客；赋税徭役因战乱失控。',
    '五铢钱贬值，布帛、粮食和实物交换更可靠；官道失修，关卡与盗匪增多。',
    '儒学仍是正统，谶纬、佛教与道教在民间流传，朝廷严厉镇压黄巾余波。'
  ],
  local_dynamics: [
    '邓县常有溃兵或散勇路过，村民夜间轮流值更。',
    '邻村近期遭游兵劫掠，乡里正在藏粮、修墙、组织联防。',
    '南阳征兵征粮消息不断，粮价、瘟疫和盗匪是最直接的生活压力。'
  ],
  reasonable_knowledge: [
    '你听说董卓控制朝廷、天下大乱。',
    '你听说十几路诸侯在东方起兵讨董，但不知道谁会获胜。',
    '你只能可靠知道家乡附近的战况、粮价、瘟疫和盗匪；远方信息多为传闻。'
  ],
  world_dynamics: {
    local: '邓县溃兵与盗匪活动增加，村民轮流值更并藏粮修墙。',
    regional: '南阳处在刘表、袁术、孙坚势力交汇处，征粮征兵消息不断。',
    national: '董卓控制朝廷并准备西迁，关东诸侯起兵讨董但彼此猜忌。',
    surrounding_powers: '袁绍、曹操、公孙瓒、刘备、孙坚等名字在传闻中出现，但细节未必可靠。',
    current_events: '孙坚军队驻鲁阳，准备与董卓部将交战；战事可能沿交通线影响南阳。',
    possible_impacts: '袁术可能征粮征兵，刘表可能北上安抚，战事扩大将使邓县成为战场或逃难通道。'
  },
  map: {
    dynasty: '东汉',
    regime: '汉室名义上统治，实际中央受董卓控制',
    administration: '荆州·南阳郡·邓县',
    village: '邓县·黄家庄',
    nearby_places: ['沔水渡口', '邓县县城', '襄阳', '隆中', '宛城', '鲁阳'],
    known_roads: ['南阳至襄阳的南北官道'],
    known_cities: ['邓县', '襄阳', '宛城', '鲁阳'],
    known_regions: ['南阳盆地', '沔水沿岸'],
    unknown_regions: ['洛阳', '关中', '江东', '益州']
  },
  available_actions: [
    '去邓县县城打探战况、物价、征兵征粮消息',
    '去襄阳投奔黄承彦或堂兄黄哲',
    '留在家中加固围墙、藏粮、组织族人联防',
    '写信或托人带信给黄承彦',
    '练习骑射或继续日常耕种读书',
    '直接描述任何符合时代和身份的行动'
  ],
  nearby_places: ['邓县县城', '沔水渡口', '襄阳', '隆中', '宛城', '鲁阳'],
  known_roads: ['南阳至襄阳的南北官道'],
  unknown_regions: ['洛阳', '关中', '江东', '益州']
};

function buildNearbyContext(era, origin, year) {
  if (era === '东汉' || era === '东汉末年' || !era) {
    return { ...structuredClone(DEFAULT_NEARBY_CONTEXT), selected_origin: origin, selected_year: year };
  }
  return {
    current_era: era,
    current_year: year || '由系统确定',
    current_location: origin || '未指定',
    instruction: '请依据所选时代、年份和地点生成当地可合理知道的本地、地方、国家、交通、经济与文化信息；不得把后世知识直接灌输给人物。'
  };
}

// ---- 基础状态模板 ----
const baseState = {
  sessionId: null,
  mode: 'restore',
  character: {
    name: '无名',
    age: 14,
    gender: '男',
    origin: '未知',
    location: '未知',
    role: '百姓',
    personality: '',
    health: '健康',
    education: '粗通文字',
    knowledge: '有限',
    martial: '未入门',
    marital: '未婚',
    family: ''
  },
  time: {
    era: '',
    year: '',
    month: '正月',
    day: '初一',
    season: '春',
    solar: '',
    hour: '辰时',
    dayIndex: 0
  },
  currency: 0,
  inventory: [],
  assets: [],
  relationships: [],
  goals: [],
  current_goals: [],
  long_term_goals: [],
  completed_goals: [],
  known: [],
  knownMap: { currentLocation: '', knownPlaces: [] },
  worldDynamics: { local: '', regional: '', national: '', nearby: '' },
  worldContext: {},
  logs: [],
  suggestions: [],
  aiInitialized: false
};

// ---- 状态管理 ----
let state = loadState() || structuredClone(baseState);
let pace = 'immersive';
let entryCounter = 0;
let lastFailedInput = null;
let lastFailedEntryId = null;
let isProcessing = false;
let pendingInitialization = null;

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE)); } catch { return null; }
}

function saveState() {
  state.savedAt = Date.now();
  localStorage.setItem(STORAGE, JSON.stringify(state));
  const el = $('#saveTime');
  if (el) el.textContent = '刚刚';
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function generateEntryId() {
  return `entry_${++entryCounter}_${Date.now()}`;
}

function formatTime() {
  const t = state.time;
  return `${t.year} · ${t.month}${t.day} · ${t.hour}`;
}

function setWorldBuildProgress(message, done = false) {
  const el = $('#initProgress');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('done', done);
}

async function showWorldBuildProgress() {
  for (const step of WORLD_BUILD_STEPS) {
    setWorldBuildProgress(step);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
}

const RELATION_DEGREES = { '至亲': '亲密', '宗族': '亲近', '师友': '寻常', '官场/职场': '疏远', '社会往来': '交恶' };
const RELATION_CATEGORY_DETAILS = {
  '至亲': '父母、子女、配偶、兄弟姐妹',
  '宗族': '叔伯、堂表兄弟、族中长辈',
  '师友': '老师、同学、结拜兄弟、知己',
  '官场/职场': '上司、下属、同僚、幕主',
  '社会往来': '同乡、邻居、商人伙伴、恩人/仇人'
};
let initialRelationships = [];

function updateRelationCategoryHint() {
  const category = $('#relationCategoryInput')?.value || '至亲';
  const hint = $('#relationCategoryHint');
  if (hint) hint.textContent = `${category}：${RELATION_CATEGORY_DETAILS[category] || '其他社会关系'}。默认关系程度：${RELATION_DEGREES[category] || '寻常'}。`;
}

function renderInitialRelationships() {
  const list = $('#relationshipList');
  if (!list) return;
  list.innerHTML = initialRelationships.map((item, index) => `
    <div class="relationship-entry">
      <span><b>${escapeHtml(item.name)}</b> · ${escapeHtml(item.category)} · ${escapeHtml(item.degree)}</span>
      <button type="button" data-relation-index="${index}" title="移除关系">×</button>
    </div>`).join('');
  list.querySelectorAll('button[data-relation-index]').forEach(button => {
    button.onclick = () => {
      initialRelationships.splice(Number(button.dataset.relationIndex), 1);
      renderInitialRelationships();
    };
  });
}

function addInitialRelationship() {
  const nameInput = $('#relationNameInput');
  const categoryInput = $('#relationCategoryInput');
  const name = nameInput?.value.trim();
  const category = categoryInput?.value || '社会往来';
  if (!name) { nameInput?.focus(); return; }
  initialRelationships.push({ name, category, degree: RELATION_DEGREES[category] || '寻常' });
  nameInput.value = '';
  renderInitialRelationships();
  nameInput.focus();
}

function getInitialRelationships() {
  return initialRelationships.map(item => ({
    name: item.name,
    relation: item.category,
    category: item.category,
    affinity: item.degree,
    trust: item.degree,
    score: item.degree === '亲密' ? 90 : item.degree === '亲近' ? 75 : item.degree === '寻常' ? 55 : item.degree === '疏远' ? 30 : 10,
    note: '玩家创建时设定'
  }));
}

function mergeRelationships(aiRelationships, playerRelationships) {
  const byName = new Map();
  (aiRelationships || []).forEach(relation => {
    if (relation?.name) byName.set(String(relation.name).trim(), relation);
  });
  (playerRelationships || []).forEach(relation => {
    const name = relation.name.trim();
    if (!name) return;
    byName.set(name, { ...(byName.get(name) || {}), ...relation });
  });
  return [...byName.values()];
}

function normalizeNewCharacter(person) {
  if (!person || typeof person !== 'object') return null;
  const name = String(person.name || person.full_name || '').trim();
  if (!name) return null;
  return {
    name,
    identity: person.identity || person.occupation || person.role || '身份未明',
    relation: person.relation || person.relationship || '初次相识',
    affinity: person.affinity || '待观察',
    trust: person.trust || '初识',
    note: person.note || person.description || '本次行动中结识'
  };
}

function mergeNewCharacters(characters) {
  const incoming = (Array.isArray(characters) ? characters : [])
    .map(normalizeNewCharacter).filter(Boolean);
  if (!incoming.length) return [];
  const existing = new Map((state.relationships || []).filter(r => r?.name).map(r => [String(r.name).trim(), r]));
  incoming.forEach(person => {
    const previous = existing.get(person.name) || {};
    existing.set(person.name, { ...previous, ...person, isNew: true });
  });
  state.relationships = [...existing.values()];
  return incoming;
}

function newCharacterLog(characters) {
  return characters.map(person =>
    `新人物：${person.name}\n身份：${person.identity}\n关系：${person.relation}\n备注：${person.note}`
  ).join('\n\n');
}

function formatFamily(family) {
  if (!family) return '<div class="info-line"><span>家庭</span><span>未记载</span></div>';
  const entries = Array.isArray(family)
    ? family.map(item => [item?.role || item?.relation || '家人', item?.name ? `${item.name}${(item.identity || item.occupation || item.profession || item.status) ? `，身份：${item.identity || item.occupation || item.profession || item.status}` : ''}` : String(item)])
      : typeof family === 'object'
      ? Object.entries(family).map(([role, value]) => {
        if (value && typeof value === 'object') {
          const name = value.name || value.full_name || '';
          const identity = value.identity || value.occupation || value.profession || value.role || value.status || '';
          return [role, `${name}${identity ? `，身份：${identity}` : ''}`.trim()];
        }
        return [role, String(value)];
      })
      : String(family).split(/[\n；;]+/).map(item => {
        const match = item.trim().match(/^([^：:]+)[：:](.+)$/);
        return match ? [match[1].trim(), match[2].trim()] : ['家庭', item.trim()];
      });
  return entries.filter(([, value]) => value).map(([role, value]) =>
    `<div class="info-line"><span>${escapeHtml(role)}</span><span>${escapeHtml(value)}</span></div>`
  ).join('') || '<div class="info-line"><span>家庭</span><span>未记载</span></div>';
}

function normalizeGoals(value) {
  if (Array.isArray(value)) return value.map(item => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.title || item.name || item.goal || item.description || '';
    return String(item ?? '');
  }).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizeHealth(value) {
  const text = String(value && typeof value === 'object' ? (value.level || value.summary || value.value || '') : (value || '')).trim();
  if (!text) return '健康';
  if (/魁健|健康|尚可|虚弱|衰微|濒危/.test(text)) return text.match(/魁健|健康|尚可|虚弱|衰微|濒危/)[0];
  if (/强健/.test(text)) return '魁健';
  if (/良好|正常/.test(text)) return '健康';
  if (/危重|濒死|生命垂危/.test(text)) return '危重';
  if (/重伤|重创|骨折|昏迷/.test(text)) return '重伤';
  if (/不佳|病弱|患病|发热|受伤|伤势/.test(text)) return '不佳';
  if (/良好|康健|健壮/.test(text)) return '良好';
  return '健康';
}

function normalizeAttribute(key, value, fallback) {
  const raw = value && typeof value === 'object' ? (value.level || value.summary || value.value) : value;
  const text = String(raw || fallback || '').trim();
  const levels = ATTRIBUTE_LEVELS[key] || {};
  const matched = Object.keys(levels).find(level => text === level || text.startsWith(level));
  const level = ATTRIBUTE_ALIASES[key]?.[matched || text] || matched || fallback;
  const detail = value && typeof value === 'object' && value.detail ? String(value.detail) : (levels[level] || text || '');
  return { level, detail };
}

function getAttribute(key, fallback) {
  return normalizeAttribute(key, state.character?.[key], fallback);
}

function normalizeCharacterAttributes(character) {
  const target = character || {};
  const defaults = { health: '健康', energy: '充裕', mood: '平宁', reputation: '无名', knowledge: '粗识', martial: '文弱' };
  Object.keys(defaults).forEach(key => {
    target[key] = normalizeAttribute(key, target[key], defaults[key]);
  });
  return target;
}

function renderStatusDetail() {
  const body = $('#statusDetailBody');
  if (!body) return;
  const rows = Object.keys(ATTRIBUTE_LABELS).map(key => {
    const attr = getAttribute(key, Object.keys(ATTRIBUTE_LEVELS[key])[0]);
    return `<div class="status-detail-row"><header><b>${ATTRIBUTE_LABELS[key]}</b><span>${escapeHtml(attr.level)}</span></header><p>${escapeHtml(attr.detail)}</p></div>`;
  }).join('');
  body.innerHTML = rows;
  const dialog = $('#statusDetailDialog');
  if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
}

// ---- 视图切换 ----
function renderSetup() {
  $('#setupView').classList.remove('hidden');
  $('#gameView').classList.add('hidden');
}

function openInitializationPreview(data) {
  const dialog = $('#initializationDialog');
  if (!dialog) return;
  const yearLabel = state.time.year || pendingInitialization?.yearResolved || '当前年份';
  const world = ensureInitializationTitle(data.world_background || '世界背景暂无内容。', `【世界建立完成 · ${yearLabel}】`);
  const character = ensureInitializationTitle(data.character_intro || '人物资料暂无内容。', `【人物创建完成 · ${yearLabel} · ${state.time.era || '当前时代'}】`);
  const dynamics = pendingInitialization?.dynamicsText || '暂无额外世界动态。';
  const map = pendingInitialization?.knownMap;
  const extra = [
    dynamics,
    map?.currentLocation ? `\n【当前位置】\n${map.currentLocation}` : ''
  ].filter(Boolean).join('\n');
  $('#worldInitializationPreview').innerHTML = formatAiText(world);
  $('#characterInitializationPreview').innerHTML = formatAiText(character);
  $('#dynamicsInitializationPreview').innerHTML = formatAiText(extra || '暂无额外世界动态。');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatAiText(value) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<div class="rich-spacer"></div>';
    if (/^---+$/.test(trimmed)) return '<hr>';
    const heading = trimmed.match(/^(?:#{1,4}\s*|【)(.+?)(?:】)?$/);
    if (heading && (trimmed.startsWith('#') || trimmed.startsWith('【'))) {
      return `<h4>${escapeHtml(heading[1])}</h4>`;
    }
    const list = trimmed.match(/^(?:[-*]\s+|\d+[.、]\s+)(.+)$/);
    const healthLine = trimmed.match(/^\*{0,2}(身体状态|身体|健康状况)\*{0,2}[：:]\s*(.+)$/);
    if (healthLine) {
      return `<div><strong>${escapeHtml(healthLine[1])}：</strong>${normalizeHealth(healthLine[2])}</div>`;
    }
    let text = escapeHtml(list ? list[1] : trimmed)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const speaker = text.match(/^(父亲|母亲|祖父|祖母|兄长|姐姐|弟弟|妹妹|族叔|族兄|其他人|旁人|县令|管事|护院)：/);
    if (speaker) text = `<strong>${speaker[1]}：</strong>${text.slice(speaker[0].length)}`;
    return list ? `<div class="rich-list-item">${text}</div>` : `<div>${text}</div>`;
  }).join('');
}

function sanitizeInitializationText(value) {
  return String(value ?? '').replace(/(?:^|\n)\s*【现在可以做什么】[\s\S]*?(?=\n\s*【[^】]+】|$)/g, '').trim();
}

function ensureInitializationTitle(value, title) {
  const text = sanitizeInitializationText(value);
  return /^【[^】]+】/.test(text) ? text : `${title}\n\n${text}`;
}

function confirmInitialization() {
  const dialog = $('#initializationDialog');
  if (!pendingInitialization) return;
  const pending = pendingInitialization;
  pendingInitialization = null;
  if (dialog?.open) dialog.close();
  saveState();
  setWorldBuildProgress(`世界建立完成 · ${state.time.year || pending.yearResolved}`, true);
  renderGame();
  toast('AI 世界初始化完成，人生开始');
}

function cancelInitialization() {
  const dialog = $('#initializationDialog');
  pendingInitialization = null;
  if (dialog?.open) dialog.close();
  else dialog?.removeAttribute('open');
  // Initialization has not been confirmed, so it must not become a save.
  localStorage.removeItem(STORAGE);
  initialRelationships = [];
  renderInitialRelationships();
  state = structuredClone(baseState);
  renderSetup();
  setWorldBuildProgress('');
  setResolveStatus('已返回人物创建页');
}

function renderGame() {
  $('#setupView').classList.add('hidden');
  $('#gameView').classList.remove('hidden');

  const c = state.character;
  const t = state.time;
  $('#profileName').textContent = c.name;
  $('#portraitChar').textContent = c.name[0] || '人';
  $('#profileRole').textContent = `${c.role} · ${c.age}岁`;
  const healthPill = $('.status-pill');
  if (healthPill) healthPill.textContent = getAttribute('health', '健康').level;
  $('#headerTime').textContent = formatTime();
  $('#worldLabel').textContent = `${t.era} · ${c.location.split(' · ').slice(-1)[0]}`;
  $('#eraName').textContent = t.era;
  $('#eraYear').textContent = t.year;
  $('#dateText').textContent = `${t.month}${t.day}`;
  $('#seasonText').textContent = `${t.season} · ${t.solar}`;
  $('#locationText').textContent = c.location;
  $('#locationSummary').textContent = c.location;
  const locationDescription = $('#locationDescription');
  if (locationDescription) locationDescription.textContent = state.worldDynamics?.local || '';
  const currency = $('#currencyValue');
  if (currency) currency.textContent = state.currency.toLocaleString();

  renderGoals();
  renderInventoryPreview();
  renderStory();
  renderRight('status');
}

// ---- 目标渲染 ----
function renderGoals() {
  const list = $('#goalList');
  list.innerHTML = '';
  const goals = normalizeGoals(state.current_goals);
  const longTermGoals = normalizeGoals(state.long_term_goals).length
    ? normalizeGoals(state.long_term_goals) : normalizeGoals(state.goals);
  if (goals.length) {
    const title = document.createElement('div');
    title.className = 'goal-group-title';
    title.textContent = '近期目标';
    list.appendChild(title);
  }
  goals.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'goal';
    el.textContent = g;
    el.onclick = () => {
      $('#actionInput').value = `我想完成这个小目标：${g}`;
      $('#actionInput').focus();
    };
    list.appendChild(el);
  });
  if (longTermGoals.length) {
    const title = document.createElement('div');
    title.className = 'goal-group-title';
    title.textContent = '远期目标';
    list.appendChild(title);
  }
  longTermGoals.forEach(g => {
    const el = document.createElement('div');
    el.className = 'goal';
    el.textContent = g;
    el.onclick = () => {
      $('#actionInput').value = `我想推进这个远期目标：${g}`;
      $('#actionInput').focus();
    };
    list.appendChild(el);
  });
  const done = state.completed_goals || [];
  done.forEach(g => {
    const el = document.createElement('div');
    el.className = 'goal done';
    el.textContent = `✓ ${g}`;
    list.appendChild(el);
  });
  const count = goals.length + longTermGoals.length;
  const el = $('#goalCount');
  if (el) el.textContent = String(count).padStart(2, '0');
}

function renderInventoryPreview() {
  const el = $('#inventoryPreview');
  const items = state.inventory || [];
  el.innerHTML = items.map(i =>
      `<div class="item-row"><span>${i.name}</span><span>×${i.qty}</span></div>`
  ).join('');
  if (items.length === 0) el.innerHTML = '<div class="item-row" style="color:#b0a08a;">空</div>';
}

// ---- 故事流渲染（含重试按钮） ----
function renderStory() {
  const stream = $('#storyStream');
  stream.innerHTML = '';
  const logs = state.logs || [];

  logs.forEach((l, idx) => {
    const card = document.createElement('article');
    let paceClass = l.pace || '';
    let extraHtml = '';

    if (l.type === 'error') {
      paceClass = 'error-entry';
      extraHtml = `
        <div class="error-actions">
          <button class="retry-btn" data-retry-input="${(l.retryInput || '').replace(/"/g, '&quot;')}">↻ 重试</button>
          <button class="dismiss-btn" data-entry-id="${l.id || ''}">✕ 忽略</button>
          <span class="error-detail">${l.errorMessage || ''}</span>
        </div>
      `;
    }

    if (l.type === 'system' || l.type === 'action') {
      paceClass = l.type === 'system' ? 'system-entry' : 'action';
    }

    card.className = `story-card ${idx === logs.length - 1 ? 'latest ' : ''}${paceClass}`;

    const showMeta = l.type !== 'system' || l.text.startsWith('📌');
    const isLatestTag = idx === logs.length - 1 && l.type !== 'error';

    card.innerHTML = `
      ${showMeta ? `<div class="story-meta"><b>${l.time}</b><span>${l.location} · ${l.duration || '片刻'}</span></div>` : ''}
      ${isLatestTag ? '<span class="tag">本次行动</span>' : ''}
      <div class="rich-text">${formatAiText(l.text)}</div>
      ${extraHtml}
    `;
    stream.appendChild(card);
  });

  stream.scrollTop = stream.scrollHeight;

  // 绑定重试按钮
  $$('.retry-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      const input = btn.dataset.retryInput;
      if (input) {
        btn.disabled = true;
        btn.textContent = '⏳ 重试中...';
        try {
          const errorEntry = logs.find(l => l.retryInput === input && l.type === 'error');
          if (errorEntry && errorEntry.id) {
            state.logs = state.logs.filter(l => l.id !== errorEntry.id);
          }
          lastFailedInput = input;
          lastFailedEntryId = null;
          await retryAction();
        } catch (e) {
          console.error('重试失败:', e);
          toast('重试失败，请手动重新输入');
        } finally {
          btn.disabled = false;
          btn.textContent = '↻ 重试';
        }
      }
    };
  });

  // 绑定忽略按钮
  $$('.dismiss-btn').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.entryId;
      if (id) {
        state.logs = state.logs.filter(l => l.id !== id);
        saveState();
        renderStory();
        toast('已忽略错误');
      }
    };
  });

  // 建议行动
  const bar = $('#suggestionBar');
  const actions = state.suggestions || [];
  bar.innerHTML = actions.map(s =>
      `<button class="suggestion" data-action="${s}">${s}</button>`
  ).join('');
  $$('.suggestion').forEach(b => b.onclick = () => {
    $('#actionInput').value = b.dataset.action;
    $('#actionInput').focus();
  });
}

// ---- 右侧面板 ----
function renderRight(tab) {
  const el = $('#rightContent');
  if (tab === 'status') {
    const c = state.character;
    const health = getAttribute('health', '健康');
    const energy = getAttribute('energy', '充裕');
    const mood = getAttribute('mood', '平宁');
    const reputation = getAttribute('reputation', '无名');
    const knowledge = getAttribute('knowledge', '未学');
    const martial = getAttribute('martial', '文弱');
    el.innerHTML = `
      <h2 class="detail-title">${c.name} · 人物档案</h2>
      <div class="info-group status-group"><h3>人物状态</h3>
      <div class="stat-grid status-summary" id="statusSummary" role="button" tabindex="0" title="点击查看属性详情">
        <div class="stat"><label>身体</label><b>${health.level}</b></div>
        <div class="stat"><label>精力</label><b>${energy.level}</b></div>
        <div class="stat"><label>心境</label><b>${mood.level}</b></div>
        <div class="stat"><label>声望</label><b>${reputation.level}</b></div>
        <div class="stat"><label>知识</label><b>${knowledge.level}</b></div>
        <div class="stat"><label>武勇</label><b>${martial.level}</b></div>
        <span class="status-summary-hint">点击查看详情</span>
      </div>
      </div>
      <div class="info-group"><h3>身份与出身</h3>
        <div class="info-line"><span>年龄</span><span>${c.age}岁</span></div>
        <div class="info-line"><span>籍贯</span><span>${c.origin || '未知'}</span></div>
        <div class="info-line"><span>当前身份</span><span>${c.role || '百姓'}</span></div>
        <div class="info-line"><span>性格</span><span>${c.personality || '未设定'}</span></div>
        <div class="info-line"><span>教育</span><span>${c.education || '未记载'}</span></div>
        <div class="info-line"><span>婚姻</span><span>${c.marital || '未婚'}</span></div>
        <div class="info-line"><span>户籍</span><span>民籍</span></div>
      </div>
      <div class="info-group"><h3>家庭</h3>
        <div class="family-lines">${formatFamily(c.family)}</div>
      </div>
      <div class="info-group"><h3>世界动态</h3>
        <div class="info-line"><span>本地</span><span>${state.worldDynamics?.local || '暂无'}</span></div>
        <div class="info-line"><span>地方</span><span>${state.worldDynamics?.regional || '暂无'}</span></div>
        <div class="info-line"><span>国家</span><span>${state.worldDynamics?.national || '暂无'}</span></div>
      </div>
    `;
  } else if (tab === 'relations') {
    const rels = state.relationships || [];
    el.innerHTML = `
      <h2 class="detail-title">关系网络</h2>
      ${rels.length === 0 ? '<p style="color:#8a7a66;">尚未建立关系</p>' :
        rels.map(r => `
          <div class="relation-card">
            <div><b>${r.name}</b><small>${r.identity || ''}</small><small>${r.relation || ''}</small><small>${r.note || ''}</small></div>
            <div class="relation-score">${r.affinity || ''}<i>${r.trust || ''}</i></div>
          </div>
        `).join('')}
      <div class="info-group"><h3>关系规则</h3>
        <p class="map-note">关系由亲疏、信任、恩义与义务共同构成。一次行动可能只改变其中一项。</p>
      </div>
    `;
  } else {
    const map = state.knownMap || { currentLocation: '未知', knownPlaces: [] };
    el.innerHTML = `
      <h2 class="detail-title">认知地图</h2>
      <div class="map-card">
        <span class="map-node main">${map.currentLocation || '未知'}</span>
      </div>
      <p class="map-note">你只看见自己亲自到过、听过或从可靠人物处得知的地方。地图不会显示世界全貌。</p>
      <div class="info-group"><h3>已知地点</h3>
        ${(map.knownPlaces || []).map(x => `<div class="info-line"><span>⌖</span><span>${x}</span></div>`).join('') || '<div style="color:#8a7a66;">尚无已知地点</div>'}
      </div>
    `;
  }
  const statusSummary = $('#statusSummary');
  if (statusSummary) {
    statusSummary.onclick = renderStatusDetail;
    statusSummary.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        renderStatusDetail();
      }
    };
  }
}

// ---- 背包 ----
function showInventory() {
  const d = $('#inventoryDialog');
  const detail = $('#inventoryDetail');
  const items = state.inventory || [];
  const assets = state.assets || [];
  detail.innerHTML = `
    <div class="dialog-body">
      ${items.length === 0 ? '<div style="color:#8a7a66;">背包为空</div>' :
      items.map(i => `<div class="asset-line"><span>${i.name} ×${i.qty}</span><b>${i.condition || '良好'}</b></div>`).join('')}
      ${assets.length > 0 ? assets.map(i => `<div class="asset-line"><span>${i.name}</span><b>${i.value || ''}</b></div>`).join('') : ''}
    </div>
  `;
  d.showModal();
}

// ---- API 交互 ----
async function apiJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (error) {
    throw new Error('AI配置失败：无法连接后端 AI 服务，请先启动 backend/main.py');
  }
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    throw new Error('AI配置失败：后端返回了无效响应');
  }
  if (!response.ok) throw new Error(data.detail || `AI配置失败：请求失败（${response.status}）`);
  return data;
}

// ---- 健康检查 ----
async function checkAiHealth() {
  const badges = [$('#aiModelBadge'), $('#gameAiModelBadge')].filter(Boolean);
  try {
    const data = await apiJson('/api/health');
    const model = data.model_name || 'gpt-5.6-terra';
    badges.forEach(el => {
      el.textContent = `AI模型：${model} · ${data.ai_configured ? '已连接' : '未配置'}`;
      el.classList.toggle('ok', !!data.ai_configured);
      el.classList.toggle('error', !data.ai_configured);
    });
    if (!data.ai_configured) setupError('AI配置失败：后端未配置 OPENAI_API_KEY，不能开始人生');
  } catch (error) {
    badges.forEach(el => {
      el.textContent = 'AI模型：gpt-5.6-terra · 连接失败';
      el.classList.add('error');
    });
    setupError(error.message);
  }
}

// ---- 年份解析 ----
async function resolveYear(showStatus = true) {
  const eventText = $('#historyEvent').value.trim();
  const era = $('#eraSelect').value;
  const selectedYear = $('#birthYear')?.value || '';
  if (!eventText) {
    if (showStatus) setResolveStatus('请先输入历史事件', 'error');
    throw new Error('AI配置失败：请先输入历史事件');
  }
  if (showStatus) setResolveStatus('AI 正在核对历史时间…');
  const data = await apiJson('/api/time/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ era, selected_year: selectedYear, historical_event: eventText })
  });
  if (!data.year || !data.year_label) throw new Error('AI配置失败：AI未返回有效年份');
  setResolveStatus(`已确定：${data.year_label}（${data.year}）`, 'success');
  return data;
}

// ---- 错误/状态显示 ----
function setupError(message) {
  let box = $('#aiError');
  if (!box) {
    box = document.createElement('div');
    box.id = 'aiError';
    box.className = 'ai-error hidden';
    $('#startBtn').after(box);
  }
  box.textContent = message;
  box.hidden = false;
}

function clearSetupError() {
  const box = $('#aiError');
  if (box) box.hidden = true;
}

function setResolveStatus(message, kind = '') {
  const el = $('#yearResolveStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `resolve-status ${kind}`;
}

// ---- 加载时代列表 ----
async function loadEraList() {
  try {
    const data = await apiJson('/api/eras');
    const eras = data.eras || [];
    const select = $('#eraSelect');
    select.innerHTML = '';
    eras.forEach(era => {
      const opt = document.createElement('option');
      opt.value = era.name;
      opt.textContent = `${era.name}（${era.period}）`;
      select.appendChild(opt);
    });
    if (eras.length) select.value = eras[0].name;
  } catch (e) {
    console.warn('无法加载时代列表，使用备用列表（仅展示）');
    const fallback = ['夏', '商', '西周', '春秋', '战国', '秦', '西汉', '新', '东汉', '三国', '西晋', '东晋十六国', '南北朝', '隋', '唐', '五代十国', '北宋', '南宋', '辽', '西夏', '金', '元', '明', '清', '清末'];
    const select = $('#eraSelect');
    select.innerHTML = '';
    fallback.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }
}

// ---- 应用状态更新 ----
function applyStateUpdates(updates) {
  if (!updates) return;
  const characterUpdates = updates.currentCharacter || updates.current_character;
  if (characterUpdates) {
    Object.assign(state.character, characterUpdates);
    normalizeCharacterAttributes(state.character);
  }
  if (updates.worldDynamics) {
    if (!state.worldDynamics) state.worldDynamics = {};
    Object.assign(state.worldDynamics, updates.worldDynamics);
  }
  if (updates.inventory) {
    if (updates.inventory.items) state.inventory = updates.inventory.items;
    if (updates.inventory.currency) state.currency = updates.inventory.currency.copper || state.currency || 0;
  }
  if (updates.relationships) state.relationships = updates.relationships;
  if (updates.knownMap) {
    if (!state.knownMap) state.knownMap = { currentLocation: '', knownPlaces: [] };
    if (updates.knownMap.currentLocation) {
      state.knownMap.currentLocation = updates.knownMap.currentLocation;
      state.character.location = updates.knownMap.currentLocation;
    }
    if (updates.knownMap.knownPlaces) {
      updates.knownMap.knownPlaces.forEach(p => {
        if (!state.knownMap.knownPlaces.includes(p)) state.knownMap.knownPlaces.push(p);
      });
    }
  }
  if (updates.time) Object.assign(state.time, updates.time);
  if (updates.suggested_goals) state.current_goals = updates.suggested_goals;
  if (updates.current_goals) state.current_goals = updates.current_goals;
  if (updates.long_term_goals) state.long_term_goals = updates.long_term_goals;
  if (updates.completed_goals) {
    if (!state.completed_goals) state.completed_goals = [];
    updates.completed_goals.forEach(g => {
      if (!state.completed_goals.includes(g)) state.completed_goals.push(g);
    });
  }
}

// ---- 插入系统消息 ----
function appendSystemMessage(text) {
  const entry = {
    id: generateEntryId(),
    type: 'system',
    time: formatTime(),
    location: state.character.location || '未知',
    duration: '——',
    text: text,
    pace: 'system'
  };
  if (!state.logs) state.logs = [];
  state.logs.push(entry);
  saveState();
  renderStory();
}

// ---- 执行玩家行动（核心） ----
async function executePlayerAction(input, isRetry = false) {
  if (!state.sessionId) {
    toast('错误：会话未初始化，请重新开始游戏');
    return;
  }
  if (isProcessing) {
    toast('正在处理中，请稍候...');
    return;
  }
  isProcessing = true;
  $('#actionInput').disabled = true;
  $('#sendBtn').disabled = true;
  $('#sendBtn').textContent = '…';

  try {
    const history = (state.logs || [])
        .filter(l => l.type !== 'error' && l.type !== 'system')
        .slice(-15)
        .map(l => ({ role: 'system', content: l.text }));

    const request = {
      session_id: state.sessionId,
      player_input: input,
      current_state: {
        currentCharacter: state.character,
        time: state.time,
        currency: state.currency,
        inventory: state.inventory,
        assets: state.assets,
        relationships: state.relationships,
        goals: state.goals,
        current_goals: state.current_goals,
        long_term_goals: state.long_term_goals,
        completed_goals: state.completed_goals,
        known: state.known,
        knownMap: state.knownMap,
        worldDynamics: state.worldDynamics,
        worldContext: state.worldContext,
        logs: state.logs
      },
      history: history,
      pace: pace
    };

    const data = await apiJson('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (data.state_updates) applyStateUpdates(data.state_updates);
    const newCharacters = mergeNewCharacters(data.new_characters);
    if (data.suggested_actions && data.suggested_actions.length > 0) {
      state.suggestions = data.suggested_actions;
    }
    if (data.suggested_goals && data.suggested_goals.length > 0) {
      state.current_goals = data.suggested_goals;
    }

    if (isRetry) {
      state.logs = state.logs.filter(l => l.text !== '🔄 正在重试上一次行动...');
    }

    const logEntry = {
      id: generateEntryId(),
      type: 'narrative',
      time: formatTime(),
      location: state.character.location || '未知',
      duration: data.time_elapsed || '片刻',
      text: data.narrative || '世界安静地继续运行。',
      pace: pace === 'immersive' ? '' : pace
    };
    if (!state.logs) state.logs = [];
    state.logs.push(logEntry);
    if (newCharacters.length) {
      state.logs.push({
        id: generateEntryId(),
        type: 'system',
        time: formatTime(),
        location: state.character.location || '未知',
        duration: '人物关系',
        text: `【新人物出现】\n\n${newCharacterLog(newCharacters)}`,
        pace: 'system'
      });
    }
    if (data.action_assessment && (data.action_assessment.reason || data.action_assessment.feasibility)) {
      const assessment = data.action_assessment;
      const attributeLabels = { health: '身体', energy: '精力', knowledge: '知识', martial: '武勇', reputation: '声望', mood: '心境' };
      const effects = Object.entries(assessment.attribute_effects || {})
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
        .map(([key, value]) => `${attributeLabels[key] || key}：${value}`).join('；');
      state.logs.push({
        id: generateEntryId(),
        type: 'system',
        time: formatTime(),
        location: state.character.location || '未知',
        duration: '行动评估',
        text: `【行动评估】\n结论：${assessment.feasibility || '已结算'}\n依据：${assessment.reason || '已结合人物档案属性判断。'}${assessment.energy_cost ? `\n精力消耗：${assessment.energy_cost}` : ''}${assessment.risk ? `\n风险：${assessment.risk}` : ''}${effects ? `\n属性变化：${effects}` : ''}`,
        pace: 'system'
      });
    }
    if (state.logs.length > 100) state.logs = state.logs.slice(-100);

    saveState();
    renderGame();
    toast(isRetry ? '✅ 重试成功，行动已结算' : '行动已结算，人生已自动保存');

    lastFailedInput = null;
    lastFailedEntryId = null;
  } catch (error) {
    lastFailedInput = input;
    const errorEntry = {
      id: generateEntryId(),
      type: 'error',
      time: formatTime(),
      location: state.character.location || '未知',
      duration: '——',
      text: `⚠️ AI处理失败：${error.message || '未知错误'}`,
      pace: 'error',
      retryInput: input,
      errorMessage: error.message || '未知错误'
    };
    state.logs.push(errorEntry);
    lastFailedEntryId = errorEntry.id;
    saveState();
    renderStory();
    toast('❌ AI处理失败，点击"重试"按钮重新发送');
  } finally {
    isProcessing = false;
    $('#actionInput').disabled = false;
    $('#sendBtn').disabled = false;
    $('#sendBtn').textContent = '↑';
    $('#actionInput').focus();
  }
}

// ---- 发送玩家行动 ----
async function sendPlayerAction(input) {
  const actionLog = {
    id: generateEntryId(),
    type: 'action',
    time: formatTime(),
    location: state.character.location || '未知',
    duration: '——',
    text: `▶ ${input}`,
    pace: 'action'
  };
  if (!state.logs) state.logs = [];
  state.logs.push(actionLog);
  renderStory();
  saveState();
  await executePlayerAction(input, false);
}

// ---- 重试行动 ----
async function retryAction() {
  if (!lastFailedInput) {
    toast('没有可重试的行动');
    return;
  }
  if (lastFailedEntryId) {
    state.logs = state.logs.filter(l => l.id !== lastFailedEntryId);
  }
  const input = lastFailedInput;
  lastFailedInput = null;
  lastFailedEntryId = null;
  appendSystemMessage('🔄 正在重试上一次行动...');
  await executePlayerAction(input, true);
}

// ---- 事件绑定 ----
// 模式选择
$$('.mode-option').forEach(b => {
  b.onclick = () => {
    $$('.mode-option').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
  };
});

// 节奏切换（即时反馈）
$$('.pace').forEach(b => {
  b.onclick = () => {
    $$('.pace').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    const oldPace = pace;
    const newPace = b.dataset.pace;
    pace = newPace;
    const names = { immersive: '沉浸', quick: '快速', jump: '跳跃' };
    const descs = {
      immersive: '详细描写环境、人物与对话，适合重要时刻',
      quick: '只记关键进展，日常事务快速推进',
      jump: '摘要式跳跃，直接抵达下一个节点'
    };
    if (oldPace !== newPace) {
      appendSystemMessage(`📌 已切换到「${names[newPace] || newPace}」模式 · ${descs[newPace] || ''}`);
    }
    const tips = {
      jump: '🚀 跳跃模式：叙事将大幅精简，快速推进时间',
      quick: '⚡ 快速模式：叙事精简，只保留关键信息',
      immersive: '📖 沉浸模式：叙事详细展开'
    };
    toast(tips[newPace] || '已切换节奏');
  };
});

// 右侧标签
$$('.tab').forEach(b => {
  b.onclick = () => {
    $$('.tab').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    renderRight(b.dataset.tab);
  };
});

// 背包
const inventoryBtn = $('#inventoryBtn');
if (inventoryBtn) inventoryBtn.onclick = showInventory;
$('#inventoryDialog')?.querySelectorAll('.close-dialog').forEach(b => b.onclick = () => $('#inventoryDialog').close());
$('.status-detail-close')?.addEventListener('click', () => $('#statusDetailDialog')?.close());

// 行动提交
$('#actionForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('#actionInput').value.trim();
  if (!input) return;
  $('#actionInput').value = '';
  await sendPlayerAction(input);
};

// 保存
$('#saveBtn').onclick = () => {
  saveState();
  toast('已保存当前人生状态');
};

// 导出
$('#exportBtn').onclick = () => {
  const payload = {
    title: '历史人生模拟器 · 人生档案',
    exportedAt: new Date().toLocaleString('zh-CN'),
    mode: modeLabels[state.mode] || state.mode,
    character: state.character,
    time: state.time,
    currency: state.currency,
    inventory: state.inventory,
    assets: state.assets,
    relationships: state.relationships,
    logs: state.logs,
    current_goals: state.current_goals,
    long_term_goals: state.long_term_goals,
    completed_goals: state.completed_goals,
    worldDynamics: state.worldDynamics,
    knownMap: state.knownMap
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = `${state.character.name}_人生档案.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('只读人生档案已导出');
};

// 新建游戏
$('#newGameBtn').onclick = () => {
  if (confirm('结束当前人生并回到创建页面？')) {
    localStorage.removeItem(STORAGE);
    pendingInitialization = null;
    initialRelationships = [];
    renderInitialRelationships();
    state = structuredClone(baseState);
    renderSetup();
  }
};

// 世界与人物初始化确认
$('#confirmInitializationBtn').onclick = confirmInitialization;
$('#cancelInitializationBtn').onclick = cancelInitialization;
$('#initializationDialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  cancelInitialization();
});

$('#addRelationBtn')?.addEventListener('click', addInitialRelationship);
$('#relationNameInput')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); addInitialRelationship(); }
});
$('#relationCategoryInput')?.addEventListener('change', updateRelationCategoryHint);
updateRelationCategoryHint();

// 年份解析
$('#resolveYearBtn').onclick = async () => {
  const btn = $('#resolveYearBtn');
  btn.disabled = true;
  clearSetupError();
  try {
    await resolveYear();
  } catch (error) {
    setResolveStatus(error.message, 'error');
    setupError(error.message);
  } finally {
    btn.disabled = false;
  }
};

// 开始游戏
$('#startBtn').onclick = async () => {
  const btn = $('#startBtn');
  const label = btn.querySelector('span');
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = 'AI 正在建立世界…';
  clearSetupError();
  setWorldBuildProgress('正在准备 AI 世界初始化…');

  try {
    await showWorldBuildProgress();
    const historyEvent = $('#historyEvent').value.trim();
    const selectedYear = $('#birthYear')?.value || '';
    let yearResolved = '';
    if (historyEvent) {
      const td = await resolveYear(false);
      yearResolved = `${td.year_label}（${td.year}）`;
    } else if (selectedYear) {
      yearResolved = selectedYear;
    } else {
      yearResolved = '由 AI 确定';
    }

    const playerRelationships = getInitialRelationships();
    const character = {
      name: $('#charName').value.trim() || '无名',
      age: Number($('#charAge').value) || 14,
      gender: $('#charGender').value,
      origin: $('#charOrigin').value.trim() || '',
      personality: $('#charPersonality').value.trim() || '',
      family_background: $('#charFamily').value.trim() || '',
      occupation: $('#charOccupation').value.trim() || '',
      life_goal: $('#charGoal').value.trim() || '',
      initial_relationships: playerRelationships,
      history_event: historyEvent
    };

    const mode = $('.mode-option.selected').dataset.mode || 'restore';
    const era = $('#eraSelect').value;
    const charType = $('#characterType').value;
    const worldContext = buildNearbyContext(era, character.origin, yearResolved);

    const data = await apiJson('/api/game/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        era,
        year: yearResolved,
        character_type: charType,
        character,
        world_context: worldContext
      })
    });

    if (!data.initial_state) throw new Error('AI未返回有效初始状态');
    if (!data.session_id) throw new Error('AI未返回会话ID');

    state = structuredClone(baseState);
    state.sessionId = data.session_id;
    state.mode = mode;
    state.aiInitialized = true;

    const aiState = data.initial_state;
    const aiCharacter = aiState.currentCharacter || aiState.current_character || aiState.character || {};
    state.character = {
      ...state.character,
      ...aiCharacter,
      ...character
    };
    if (character.occupation) state.character.role = character.occupation;
    if (character.family_background) state.character.family = character.family_background;
    if (!character.origin) state.character.origin = aiCharacter.origin || state.character.origin;
    if (!character.personality) state.character.personality = aiCharacter.personality || state.character.personality;
    delete state.character.initial_relationships;
    delete state.character.history_event;
    normalizeCharacterAttributes(state.character);
    if (aiState.time) Object.assign(state.time, aiState.time);
    if (aiState.inventory) {
      state.inventory = aiState.inventory.items || [];
      // Currency is intentionally not initialized; it appears only after gameplay changes it.
      state.currency = 0;
    }
    state.relationships = mergeRelationships(aiState.relationships || aiState.relations, playerRelationships);
    if (aiState.knownMap) {
      state.knownMap = aiState.knownMap;
      if (state.knownMap.currentLocation) state.character.location = state.knownMap.currentLocation;
    }
    if (aiState.worldDynamics || aiState.world_dynamics) state.worldDynamics = aiState.worldDynamics || aiState.world_dynamics;
    state.worldContext = aiState.worldContext || worldContext;
    if (aiState.current_goals || aiState.currentGoals) state.current_goals = aiState.current_goals || aiState.currentGoals;
    if (aiState.long_term_goals || aiState.longTermGoals) state.long_term_goals = aiState.long_term_goals || aiState.longTermGoals;
    if (aiState.goals && !state.long_term_goals.length) state.long_term_goals = aiState.goals;
    if (character.life_goal) {
      const existingGoals = normalizeGoals(state.long_term_goals);
      state.long_term_goals = [character.life_goal, ...existingGoals.filter(goal => goal !== character.life_goal)];
    }
    if (data.suggested_actions) state.suggestions = data.suggested_actions;
    if (aiState.available_actions) state.suggestions = aiState.available_actions;
    if (data.suggested_goals?.length) state.current_goals = data.suggested_goals;

    const worldDynamics = state.worldDynamics || {};
    const dynamicsText = [
      worldDynamics.local && `【本地动态】\n${worldDynamics.local}`,
      worldDynamics.regional && `【地方动态】\n${worldDynamics.regional}`,
      worldDynamics.national && `【国家动态】\n${worldDynamics.national}`,
      worldDynamics.nearby && `【周边动态】\n${worldDynamics.nearby}`,
      worldDynamics.current_events && `【正在发生的事情】\n${worldDynamics.current_events}`,
      worldDynamics.possible_impacts && `【近期可能影响你的事情】\n${worldDynamics.possible_impacts}`
    ].filter(Boolean).join('\n\n');
    state.logs = [
      { id: generateEntryId(), type: 'system', time: formatTime(), location: state.character.location || '未知', duration: '初始化', text: `世界建立完成 · ${state.time.year || yearResolved}` },
      { id: generateEntryId(), type: 'narrative', time: formatTime(), location: state.character.location || '未知', duration: '世界背景', text: data.world_background || `当年历史背景：你在${state.time.year || '这个时代'}开始生活。` },
      { id: generateEntryId(), type: 'narrative', time: formatTime(), location: state.character.location || '未知', duration: '人物创建', text: data.character_intro || `人物创建完成 · ${state.time.year || '这个时代'}` },
      ...(dynamicsText ? [{ id: generateEntryId(), type: 'narrative', time: formatTime(), location: state.character.location || '未知', duration: '世界动态', text: `世界动态 · ${state.time.year || ''}\n\n${dynamicsText}` }] : [])
    ];

    // Keep generated data in memory until the player explicitly confirms.
    pendingInitialization = {
      data,
      yearResolved,
      dynamicsText,
      knownMap: state.knownMap,
      suggestions: state.suggestions
    };
    setWorldBuildProgress(`世界建立完成 · ${state.time.year || yearResolved} · 等待确认`, true);
    openInitializationPreview(data);
  } catch (error) {
    const msg = error.message.startsWith('AI配置失败') ? error.message : `AI配置失败：${error.message}`;
    setupError(msg);
    setResolveStatus('无法开始人生', 'error');
    setWorldBuildProgress('世界建立失败 · 请检查 AI 配置', true);
    renderSetup();
  } finally {
    btn.disabled = false;
    label.textContent = original;
  }
};

// ---- 页面初始化 ----
window.addEventListener('DOMContentLoaded', async () => {
  await loadEraList();
  await checkAiHealth();
  if (state.aiInitialized && state.sessionId && state.logs && state.logs.length > 0) {
    renderGame();
    toast('已加载存档，继续人生');
  } else {
    renderSetup();
  }
});

// ---- 调试工具 ----
window.__debug = { state, sendPlayerAction, saveState, renderGame, retryAction };
