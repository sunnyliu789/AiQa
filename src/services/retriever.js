'use strict';

/**
 * 课程资料检索服务
 * 职责：读取 data/course-notes.md，按标题切分为知识片段，并根据问题检索最相关的片段。
 */

const fs = require('fs');
const path = require('path');
const { tokenize, overlapScore } = require('../utils/text');

// 课程资料文件路径（相对于项目根目录）
const NOTES_PATH = path.join(__dirname, '..', '..', 'data', 'course-notes.md');

// 默认返回的知识片段数量
const DEFAULT_TOP_K = 3;

// 资料缓存，避免每次提问都重复读取磁盘
let cache = null;

/**
 * 将 Markdown 资料按标题切分为知识片段
 * @param {string} markdown 原始 Markdown 文本
 * @returns {{title: string, content: string}[]} 知识片段数组
 */
function splitNotes(markdown) {
  const lines = markdown.split(/\r?\n/);
  const chunks = [];
  let current = null;

  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      // 遇到标题：先保存上一段，再开启新的一段
      if (current) chunks.push(current);
      current = { title: line.replace(/^#{1,3}\s+/, '').trim(), content: '' };
    } else {
      if (!current) current = { title: '概述', content: '' };
      current.content += line + '\n';
    }
  }
  if (current) chunks.push(current);

  // 清理内容首尾空白，并过滤空片段
  return chunks
    .map((c) => ({ title: c.title, content: c.content.trim() }))
    .filter((c) => c.content);
}

/**
 * 加载并缓存课程资料
 * @returns {{title: string, content: string}[]} 知识片段数组
 */
function loadNotes() {
  if (cache) return cache;

  try {
    const raw = fs.readFileSync(NOTES_PATH, 'utf8');
    cache = splitNotes(raw);
  } catch (err) {
    // 资料缺失不应导致接口崩溃，降级为空资料
    console.warn('[retriever] 读取课程资料失败：', err.message);
    cache = [];
  }
  return cache;
}

/**
 * 根据问题检索最相关的课程资料片段
 * @param {string} query 用户问题
 * @param {number} [topK] 返回的片段数量
 * @returns {{title: string, content: string, score: number}[]} 命中的知识片段（按得分降序）
 */
function retrieve(query, topK = DEFAULT_TOP_K) {
  const chunks = loadNotes();
  if (!chunks.length) return [];

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const scored = chunks
    .map((chunk) => {
      // 标题权重更高，合并标题与正文一起计算得分
      const docTokens = tokenize(chunk.title + ' ' + chunk.content);
      const score = overlapScore(queryTokens, docTokens);
      return { ...chunk, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

module.exports = {
  retrieve,
  loadNotes,
  splitNotes
};
