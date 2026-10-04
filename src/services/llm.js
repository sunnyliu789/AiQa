'use strict';

/**
 * 大模型调用服务
 * 说明：
 * 1. 走兼容 OpenAI 协议的 Chat Completions 接口；
 * 2. 配置从环境变量读取：LLM_API_KEY / LLM_BASE_URL / LLM_MODEL；
 * 3. 未配置 LLM_API_KEY 时自动进入演示模式，返回预设回答，保证流程可跑通；
 * 4. 调用带超时保护与异常处理，返回内容为空时按失败处理。
 */

// 默认接口地址与模型（可通过环境变量覆盖）
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
// 请求超时时间（毫秒），可通过 LLM_TIMEOUT_MS 覆盖
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * 读取当前生效的大模型配置
 * @returns {{apiKey: string, baseUrl: string, model: string, timeoutMs: number}}
 */
function getConfig() {
  return {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: process.env.LLM_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  };
}

/**
 * 是否处于演示模式（未配置 API Key）
 * @returns {boolean}
 */
function isDemoMode() {
  return !getConfig().apiKey;
}

/**
 * 构造发送给大模型的消息列表
 * @param {string} question 用户问题
 * @param {{title: string, content: string}[]} contexts 检索到的课程资料片段
 * @returns {{role: string, content: string}[]} 消息数组
 */
function buildMessages(question, contexts) {
  const systemPrompt =
    '你是一名严谨的课程答疑助手。请依据提供的《课程资料》回答学生问题：\n' +
    '1. 优先使用课程资料中的内容作答，不要编造资料中不存在的信息；\n' +
    '2. 如果资料不足以回答，请明确说明"课程资料中未涵盖该内容"，并给出合理建议；\n' +
    '3. 回答使用中文，条理清晰，必要时分点说明。';

  const reference = contexts.length
    ? contexts
        .map((c, i) => `【资料${i + 1}：${c.title}】\n${c.content}`)
        .join('\n\n')
    : '（未检索到相关课程资料）';

  const userPrompt = `《课程资料》如下：\n${reference}\n\n学生问题：${question}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

/**
 * 演示模式：根据检索到的资料生成预设回答
 * @param {string} question 用户问题
 * @param {{title: string, content: string}[]} contexts 课程资料片段
 * @returns {string} 预设回答
 */
function buildDemoAnswer(question, contexts) {
  const header = '【演示模式】未配置 LLM_API_KEY，以下为本地预设回答：';
  if (!contexts.length) {
    return (
      `${header}\n` +
      `你的问题「${question}」暂未在课程资料中检索到相关内容。\n` +
      `建议：换用课程资料中出现的术语重新提问，或配置 LLM_API_KEY 启用真实大模型作答。`
    );
  }

  const body = contexts
    .map((c, i) => `${i + 1}. 参考《${c.title}》：\n${c.content}`)
    .join('\n\n');

  return (
    `${header}\n` +
    `针对你的问题「${question}」，检索到以下课程资料可供参考：\n\n${body}\n\n` +
    `配置 LLM_API_KEY 后，可获得基于上述资料的自然语言解答。`
  );
}

/**
 * 调用大模型接口（带超时保护与异常处理）
 * @param {{role: string, content: string}[]} messages 消息列表
 * @returns {Promise<string>} 模型返回的文本内容
 * @throws {Error} 网络异常、超时、非 2xx 响应或返回内容为空时抛出
 */
async function chat(messages) {
  const { apiKey, baseUrl, model, timeoutMs } = getConfig();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature: 0.3 }),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`大模型接口返回 ${response.status}：${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data && data.choices && data.choices[0]
      ? data.choices[0].message && data.choices[0].message.content
      : '';

    // 返回内容为空按失败处理
    if (!content || !String(content).trim()) {
      throw new Error('大模型返回内容为空');
    }
    return String(content).trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`大模型请求超时（超过 ${timeoutMs} 毫秒）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 高层入口：结合课程资料回答问题
 * @param {string} question 用户问题
 * @param {{title: string, content: string}[]} contexts 检索到的课程资料片段
 * @returns {Promise<{content: string, mode: 'demo'|'llm'}>} 回答内容与模式
 */
async function answer(question, contexts = []) {
  if (isDemoMode()) {
    return { content: buildDemoAnswer(question, contexts), mode: 'demo' };
  }

  const content = await chat(buildMessages(question, contexts));
  return { content, mode: 'llm' };
}

module.exports = {
  answer,
  chat,
  buildMessages,
  buildDemoAnswer,
  isDemoMode,
  getConfig
};
