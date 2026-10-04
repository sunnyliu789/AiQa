'use strict';

/**
 * 前端交互逻辑（原生 JavaScript，不依赖任何框架）
 * 功能：提交提问、展示回答与引用资料、查看历史记录、展示运行模式。
 */

const els = {
  form: document.getElementById('askForm'),
  question: document.getElementById('question'),
  askBtn: document.getElementById('askBtn'),
  error: document.getElementById('error'),
  result: document.getElementById('result'),
  answer: document.getElementById('answer'),
  sources: document.getElementById('sources'),
  resultMode: document.getElementById('resultMode'),
  modeBadge: document.getElementById('modeBadge'),
  history: document.getElementById('history'),
  refreshBtn: document.getElementById('refreshBtn')
};

/**
 * 发送请求并解析统一响应格式
 * @param {string} url 请求地址
 * @param {object} [options] fetch 配置
 * @returns {Promise<object>} 接口返回的 data 字段
 */
async function request(url, options) {
  const res = await fetch(url, options);
  let payload;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error('服务返回了无法解析的内容');
  }
  if (!res.ok || !payload.ok) {
    throw new Error(payload && payload.error ? payload.error : `请求失败（${res.status}）`);
  }
  return payload.data;
}

/** 展示错误提示 */
function showError(message) {
  els.error.textContent = message;
  els.error.classList.remove('hidden');
}

/** 隐藏错误提示 */
function hideError() {
  els.error.classList.add('hidden');
}

/** 更新顶部的运行模式标签 */
function setModeBadge(mode) {
  if (mode === 'demo') {
    els.modeBadge.textContent = '演示模式';
    els.modeBadge.className = 'badge badge-demo';
  } else {
    els.modeBadge.textContent = '大模型模式';
    els.modeBadge.className = 'badge badge-llm';
  }
}

/** 查询并展示当前运行模式 */
async function loadStatus() {
  try {
    const data = await request('/api/status');
    setModeBadge(data.mode);
  } catch (err) {
    els.modeBadge.textContent = '状态未知';
    els.modeBadge.className = 'badge badge-loading';
  }
}

/**
 * 渲染一条回答
 * @param {{answer: string, sources: string[], mode: string}} data 回答数据
 */
function renderAnswer(data) {
  els.answer.textContent = data.answer;
  els.sources.innerHTML = '';
  (data.sources || []).forEach((title) => {
    const tag = document.createElement('span');
    tag.className = 'source-tag';
    tag.textContent = `引用：${title}`;
    els.sources.appendChild(tag);
  });
  els.resultMode.textContent = data.mode === 'demo' ? '演示模式' : '大模型模式';
  els.resultMode.className = data.mode === 'demo' ? 'badge badge-demo' : 'badge badge-llm';
  els.result.classList.remove('hidden');
}

/** 提交提问 */
async function handleSubmit(event) {
  event.preventDefault();
  const question = els.question.value.trim();
  if (!question) {
    showError('请先输入问题内容');
    return;
  }

  hideError();
  els.askBtn.disabled = true;
  els.askBtn.textContent = '思考中…';

  try {
    const data = await request('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    renderAnswer(data);
    loadHistory();
  } catch (err) {
    showError(err.message);
  } finally {
    els.askBtn.disabled = false;
    els.askBtn.textContent = '提交提问';
  }
}

/**
 * 渲染历史记录列表
 * @param {object[]} records 问答记录数组
 */
function renderHistory(records) {
  els.history.innerHTML = '';
  if (!records.length) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = '暂无记录';
    els.history.appendChild(li);
    return;
  }

  records.forEach((record) => {
    const li = document.createElement('li');

    const q = document.createElement('div');
    q.className = 'history-q';
    q.textContent = record.question;

    const meta = document.createElement('div');
    meta.className = 'history-meta';
    const time = new Date(record.createdAt).toLocaleString('zh-CN');
    const modeText = record.mode === 'demo' ? '演示模式' : '大模型模式';
    meta.textContent = `${time} · ${modeText}`;

    li.appendChild(q);
    li.appendChild(meta);
    els.history.appendChild(li);
  });
}

/** 加载历史记录 */
async function loadHistory() {
  try {
    const records = await request('/api/history?limit=20');
    renderHistory(records);
  } catch (err) {
    // 历史记录加载失败不阻断主流程，仅提示
    showError(`历史记录加载失败：${err.message}`);
  }
}

// 事件绑定与初始化
els.form.addEventListener('submit', handleSubmit);
els.refreshBtn.addEventListener('click', loadHistory);
loadStatus();
loadHistory();
