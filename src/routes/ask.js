'use strict';

/**
 * 提问接口路由
 * 提供：
 * - POST /api/ask     提问（检索资料 → 调用大模型 → 保存记录）
 * - GET  /api/history 查询历史问答记录
 * - GET  /api/status  查询当前运行模式（演示模式 / 大模型模式）
 */

const retriever = require('../services/retriever');
const llm = require('../services/llm');
const qaStore = require('../store/qaStore');

/**
 * 读取并解析 JSON 请求体
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {number} [limit] 请求体大小上限（字节）
 * @returns {Promise<object>} 解析后的对象
 */
function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('请求体不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * 发送 JSON 响应
 * @param {import('http').ServerResponse} res 响应对象
 * @param {number} status HTTP 状态码
 * @param {object} data 响应数据
 */
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

/**
 * 处理提问请求：检索课程资料 → 调用大模型 → 保存问答记录
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 */
async function handleAsk(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return sendJson(res, 400, { ok: false, error: '问题内容不能为空' });
  }

  try {
    // 步骤 1：检索课程资料
    const contexts = retriever.retrieve(question);

    // 步骤 2：把资料与问题一起发给大模型（未配置 Key 时自动进入演示模式）
    const { content, mode } = await llm.answer(question, contexts);

    // 步骤 3：保存问答记录
    const record = qaStore.add({
      question,
      answer: content,
      sources: contexts.map((c) => c.title),
      mode
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        id: record.id,
        question: record.question,
        answer: record.answer,
        sources: record.sources,
        mode: record.mode,
        createdAt: record.createdAt
      }
    });
  } catch (err) {
    // 大模型调用超时、网络异常、返回为空等均在此统一处理
    console.error('[ask] 处理提问失败：', err.message);
    return sendJson(res, 502, {
      ok: false,
      error: `答疑失败：${err.message}`
    });
  }
}

/**
 * 处理历史记录查询
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 * @param {URL} url 解析后的 URL 对象
 */
function handleHistory(req, res, url) {
  const limit = Number(url.searchParams.get('limit')) || 20;
  const records = qaStore.list(limit);
  return sendJson(res, 200, { ok: true, data: records });
}

/**
 * 处理运行状态查询
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 */
function handleStatus(req, res) {
  const config = llm.getConfig();
  return sendJson(res, 200, {
    ok: true,
    data: {
      mode: llm.isDemoMode() ? 'demo' : 'llm',
      model: llm.isDemoMode() ? null : config.model
    }
  });
}

/**
 * 路由分发入口
 * @param {import('http').IncomingMessage} req 请求对象
 * @param {import('http').ServerResponse} res 响应对象
 * @param {URL} url 解析后的 URL 对象
 * @returns {boolean} 是否已处理该请求
 */
function handle(req, res, url) {
  const { pathname } = url;

  if (pathname === '/api/ask' && req.method === 'POST') {
    handleAsk(req, res);
    return true;
  }
  if (pathname === '/api/history' && req.method === 'GET') {
    handleHistory(req, res, url);
    return true;
  }
  if (pathname === '/api/status' && req.method === 'GET') {
    handleStatus(req, res);
    return true;
  }
  return false;
}

module.exports = { handle, handleAsk, handleHistory, handleStatus };
