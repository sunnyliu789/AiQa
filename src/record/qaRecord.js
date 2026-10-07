'use strict';

/**
 * 问答记录读写
 * 说明：使用本地 JSON 文件持久化问答记录，零第三方依赖。
 * 存储文件：默认 data/qa-records.json；可用环境变量 QA_RECORDS_PATH
 *           或 setStorePath() 覆盖（测试注入临时文件时尤其有用）。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 默认数据文件路径（相对于项目根目录）
const DEFAULT_STORE_PATH = path.join(__dirname, '..', '..', 'data', 'qa-records.json');

// 当前生效的数据文件路径：优先取环境变量 QA_RECORDS_PATH，否则用默认路径
let storePath = process.env.QA_RECORDS_PATH
  ? path.resolve(process.env.QA_RECORDS_PATH)
  : DEFAULT_STORE_PATH;

/**
 * 获取当前数据文件路径
 * @returns {string} 数据文件的绝对路径
 */
function getStorePath() {
  return storePath;
}

/**
 * 覆盖数据文件路径，主要供测试注入临时文件，避免污染真实数据
 * @param {string} newPath 新的数据文件路径
 * @returns {string} 生效后的绝对路径
 */
function setStorePath(newPath) {
  if (typeof newPath !== 'string' || !newPath.trim()) {
    throw new TypeError('setStorePath 需要传入非空字符串路径');
  }
  storePath = path.resolve(newPath);
  return storePath;
}

/**
 * 确保存储文件存在，不存在则初始化为空数组
 */
function ensureStore() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, '[]', 'utf8');
}

/**
 * 把内容不可用的记录文件改名备份，避免后续写入把原始数据覆盖丢失
 * @returns {string|null} 备份文件路径；备份失败时返回 null
 */
function backupBrokenStore() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${storePath}.corrupt-${stamp}`;
  try {
    fs.renameSync(storePath, backupPath);
    console.warn(`[qaRecord] 记录文件内容不可用，已备份为 ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.warn('[qaRecord] 记录文件内容不可用，且备份失败：', err.message);
    return null;
  }
}

/**
 * 读取全部问答记录
 * @returns {object[]} 记录数组
 */
function readAll() {
  ensureStore();

  let raw = '';
  try {
    raw = fs.readFileSync(storePath, 'utf8').trim();
  } catch (err) {
    console.warn('[qaRecord] 读取问答记录失败：', err.message);
    return [];
  }
  if (!raw) return [];

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    // 解析失败：先备份走损坏内容，再重建空文件。
    // 这样接口不会崩，后续写入也不会把原始数据覆盖掉。
    backupBrokenStore();
    ensureStore();
    return [];
  }

  if (!Array.isArray(data)) {
    // 顶层不是数组，同样属于内容不可用
    backupBrokenStore();
    ensureStore();
    return [];
  }

  return data;
}

/**
 * 写入全部问答记录
 * 采用「先写临时文件、再原子替换」，避免写入中途中断把文件截断成半截
 * @param {object[]} records 记录数组
 */
function writeAll(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('writeAll 需要传入数组');
  }

  ensureStore();
  const content = JSON.stringify(records, null, 2);
  const tmpPath = `${storePath}.tmp`;

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, storePath);
  } catch (err) {
    // 例如目标文件被其他进程占用时重命名会失败，退化为直接写入以保证可用
    console.warn('[qaRecord] 原子替换失败，退化为直接写入：', err.message);
    try {
      fs.writeFileSync(storePath, content, 'utf8');
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }
}

/**
 * 新增一条问答记录
 * @param {{question: string, answer: string, sources?: string[], mode?: string}} entry 问答内容
 * @returns {object} 落库后的完整记录
 */
function add(entry) {
  const records = readAll();
  const record = {
    // 用 UUID 保证唯一性；记录先后顺序由 createdAt 承担，不再依赖 id
    id: crypto.randomUUID(),
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
 * 取出记录创建时间的时间戳；时间非法时按 0 处理（等于排到最后）
 * @param {object} record 问答记录
 * @returns {number} 毫秒时间戳
 */
function toTimestamp(record) {
  const time = Date.parse(record && record.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * 获取问答记录（按创建时间倒序，最新在前）
 * @param {number} [limit] 返回条数上限，默认 20
 * @returns {object[]} 记录数组
 */
function list(limit = 20) {
  const records = readAll();

  // 按 createdAt 倒序，而不是依赖数组的存储顺序；
  // 时间相同（同一毫秒创建）时用原始下标倒序兜底，保证仍是最新在前。
  return records
    .map((record, index) => ({ record, index, time: toTimestamp(record) }))
    .sort((a, b) => b.time - a.time || b.index - a.index)
    .slice(0, limit)
    .map((item) => item.record);
}

module.exports = {
  add,
  list,
  readAll,
  writeAll,
  getStorePath,
  setStorePath
};
