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
  completed_goals: [],
  known: [],
  knownMap: { currentLocation: '', knownPlaces: [] },
  worldDynamics: { local: '', regional: '', national: '', nearby: '' },
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

function parseInitialRelationships(raw) {
  return raw
    .split(/[；;，\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = item.match(/^(.+?)[（(]([^（）()]+)[）)]$/);
      const name = (match ? match[1] : item).trim();
      const relation = (match ? match[2] : '相识').trim();
      return {
        name,
        relation,
        affinity: '亲近',
        trust: '初始',
        score: 60,
        note: '玩家创建时设定'
      };
    })
    .filter(relation => relation.name);
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

// ---- 视图切换 ----
function renderSetup() {
  $('#setupView').classList.remove('hidden');
  $('#gameView').classList.add('hidden');
}

function renderGame() {
  $('#setupView').classList.add('hidden');
  $('#gameView').classList.remove('hidden');

  const c = state.character;
  const t = state.time;
  $('#profileName').textContent = c.name;
  $('#portraitChar').textContent = c.name[0] || '人';
  $('#profileRole').textContent = `${c.role} · ${c.age}岁`;
  $('#headerTime').textContent = formatTime();
  $('#worldLabel').textContent = `${t.era} · ${c.location.split(' · ').slice(-1)[0]}`;
  $('#eraName').textContent = t.era;
  $('#eraYear').textContent = t.year;
  $('#dateText').textContent = `${t.month}${t.day}`;
  $('#seasonText').textContent = `${t.season} · ${t.solar}`;
  $('#locationText').textContent = c.location;
  $('#locationSummary').textContent = c.location;
  $('#locationDescription').textContent = state.worldDynamics?.local || '你所在的地方自有其秩序。';
  $('#currencyValue').textContent = state.currency.toLocaleString();

  renderGoals();
  renderInventoryPreview();
  renderStory();
  renderRight('status');
}

// ---- 目标渲染 ----
function renderGoals() {
  const list = $('#goalList');
  list.innerHTML = '';
  const goals = state.current_goals || [];
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
  const done = state.completed_goals || [];
  done.forEach(g => {
    const el = document.createElement('div');
    el.className = 'goal done';
    el.textContent = `✓ ${g}`;
    list.appendChild(el);
  });
  const count = goals.length;
  const el = $('#goalCount');
  if (el) el.textContent = String(count).padStart(2, '0');
}

function renderInventoryPreview() {
  const el = $('#inventoryPreview');
  const items = state.inventory || [];
  el.innerHTML = items.slice(0, 3).map(i =>
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
      <p>${l.text}</p>
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
    el.innerHTML = `
      <h2 class="detail-title">${c.name} · 人物档案</h2>
      <div class="stat-grid">
        <div class="stat"><label>年龄</label><b>${c.age}岁</b></div>
        <div class="stat"><label>身体</label><b>${c.health || '健康'}</b></div>
        <div class="stat"><label>财富</label><b>${(state.currency || 0).toLocaleString()}钱</b></div>
        <div class="stat"><label>婚姻</label><b>${c.marital || '未婚'}</b></div>
      </div>
      <div class="info-group"><h3>身份与出身</h3>
        <div class="info-line"><span>籍贯</span><span>${c.origin || '未知'}</span></div>
        <div class="info-line"><span>当前身份</span><span>${c.role || '百姓'}</span></div>
        <div class="info-line"><span>性格</span><span>${c.personality || '未设定'}</span></div>
        <div class="info-line"><span>教育</span><span>${c.education || '未记载'}</span></div>
        <div class="info-line"><span>户籍</span><span>民籍</span></div>
      </div>
      <div class="info-group"><h3>家庭</h3>
        <div class="info-line"><span>家庭</span><span>${c.family || '未记载'}</span></div>
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
            <div><b>${r.name}</b><small>${r.relation || ''}</small><small>${r.note || ''}</small></div>
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
      <div class="asset-line"><span>现金</span><b>${(state.currency || 0).toLocaleString()} 铜钱</b></div>
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
  if (updates.currentCharacter) Object.assign(state.character, updates.currentCharacter);
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
        completed_goals: state.completed_goals,
        known: state.known,
        knownMap: state.knownMap,
        worldDynamics: state.worldDynamics,
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
    if (data.suggested_actions && data.suggested_actions.length > 0) {
      state.suggestions = data.suggested_actions;
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
$('#inventoryBtn').onclick = showInventory;
$$('.close-dialog').forEach(b => b.onclick = () => $('#inventoryDialog').close());

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
    state = structuredClone(baseState);
    renderSetup();
  }
};

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

  try {
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

    const playerRelationships = parseInitialRelationships($('#charRelations').value);
    const character = {
      name: $('#charName').value.trim() || '无名',
      age: Number($('#charAge').value) || 14,
      gender: $('#charGender').value,
      origin: $('#charOrigin').value.trim() || '',
      role: $('#charRole').value.trim() || '',
      personality: $('#charPersonality').value.trim() || '',
      initial_relationships: playerRelationships,
      history_event: historyEvent
    };

    const mode = $('.mode-option.selected').dataset.mode || 'restore';
    const era = $('#eraSelect').value;
    const charType = $('#characterType').value;

    const data = await apiJson('/api/game/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        era,
        year: yearResolved,
        character_type: charType,
        character
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
    if (!character.origin) state.character.origin = aiCharacter.origin || state.character.origin;
    if (!character.role) state.character.role = aiCharacter.role || state.character.role;
    if (!character.personality) state.character.personality = aiCharacter.personality || state.character.personality;
    delete state.character.initial_relationships;
    delete state.character.history_event;
    if (aiState.time) Object.assign(state.time, aiState.time);
    if (aiState.inventory) {
      state.inventory = aiState.inventory.items || [];
      if (aiState.inventory.currency) state.currency = aiState.inventory.currency.copper || 0;
    }
    state.relationships = mergeRelationships(aiState.relationships || aiState.relations, playerRelationships);
    if (aiState.knownMap) {
      state.knownMap = aiState.knownMap;
      if (state.knownMap.currentLocation) state.character.location = state.knownMap.currentLocation;
    }
    if (aiState.worldDynamics) state.worldDynamics = aiState.worldDynamics;
    if (aiState.current_goals) state.current_goals = aiState.current_goals;
    if (data.suggested_actions) state.suggestions = data.suggested_actions;

    state.logs = [{
      id: generateEntryId(),
      type: 'narrative',
      time: formatTime(),
      location: state.character.location || '未知',
      duration: '初始',
      text: data.character_intro || `你在${state.time.year || '这个时代'}开始了这一生。`
    }];

    saveState();
    renderGame();
    toast('AI 世界初始化完成，人生开始');
  } catch (error) {
    const msg = error.message.startsWith('AI配置失败') ? error.message : `AI配置失败：${error.message}`;
    setupError(msg);
    setResolveStatus('无法开始人生', 'error');
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
