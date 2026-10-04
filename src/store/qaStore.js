'use strict';

/**
 * 问答记录读写
 * 说明：使用本地 JSON 文件持久化问答记录，零第三方依赖。
 * 存储文件：data/qa-records.json
 */

const fs = require('fs');
const path = require('path');

// 问答记录文件路径（相对于项目根目录）
const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'qa-records.json');

/**
 * 确保存储文件存在，不存在则初始化为空数组
 */
function ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '[]', 'utf8');
}

/**
 * 读取全部问答记录
 * @returns {object[]} 记录数组
 */
function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8').trim();
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // 文件损坏时不应影响接口，降级为空记录
    console.warn('[qaStore] 读取问答记录失败：', err.message);
    return [];
  }
}

/**
 * 写入全部问答记录
 * @param {object[]} records 记录数组
 */
function writeAll(records) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(records, null, 2), 'utf8');
}

/**
 * 新增一条问答记录
 * @param {{question: string, answer: string, sources?: string[], mode?: string}} entry 问答内容
 * @returns {object} 落库后的完整记录
 */
function add(entry) {
  const records = readAll();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    question: entry.question,
    answer: entry.answer,
    sources: entry.sources || [],
    mode: entry.mode || 'unknown',
    createdAt: new Date().toISOString()
  };
  records.push(record);
  writeAll(records);
  return record;
}

/**
 * 获取问答记录（按时间倒序）
 * @param {number} [limit] 返回条数上限，默认 20
 * @returns {object[]} 记录数组
 */
function list(limit = 20) {
  const records = readAll();
  return records.slice(-limit).reverse();
}

module.exports = {
  add,
  list,
  readAll,
  writeAll,
  STORE_PATH
};
