'use strict';

/**
 * 分词工具
 * 说明：项目不引入任何第三方依赖，这里实现一个轻量的中英文分词器。
 * - 英文/数字：按非字母数字字符切分，统一转小写
 * - 中文：按单字切分（汉字逐字成词），保证零依赖即可完成基础检索
 */

// 常见停用词（中文单字 + 英文单词），检索时会被过滤，避免干扰相似度计算
const STOP_WORDS = new Set([
  '的', '了', '和', '是', '在', '有', '我', '你', '他', '她', '它', '们',
  '吗', '呢', '吧', '啊', '呀', '哦', '这', '那', '个', '与', '或', '及',
  '对', '为', '被', '把', '到', '从', '会', '能', '要', '就', '都', '很',
  '什么', '怎么', '如何', '请问', '一下', '可以', '是否',
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'in',
  'on', 'at', 'for', 'and', 'or', 'not', 'it', 'this', 'that', 'with',
  'how', 'what', 'why', 'can', 'could', 'do', 'does', 'i', 'you', 'we'
]);

// 判断是否为汉字字符
function isChineseChar(ch) {
  return /[\u4e00-\u9fa5]/.test(ch);
}

/**
 * 将文本切分为词元数组
 * @param {string} text 待分词文本
 * @returns {string[]} 词元数组（已去除停用词与空白）
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];

  const tokens = [];
  const lower = text.toLowerCase();

  // 按字符遍历：汉字逐字成词，其余字符累积成英文/数字单词
  let buffer = '';
  for (const ch of lower) {
    if (isChineseChar(ch)) {
      // 遇到汉字前，先冲刷缓冲的英文单词
      if (buffer) {
        tokens.push(buffer);
        buffer = '';
      }
      tokens.push(ch);
    } else if (/[a-z0-9]/.test(ch)) {
      buffer += ch;
    } else {
      // 分隔符：冲刷缓冲
      if (buffer) {
        tokens.push(buffer);
        buffer = '';
      }
    }
  }
  if (buffer) tokens.push(buffer);

  // 过滤停用词与单字符空白
  return tokens.filter((t) => t && !STOP_WORDS.has(t));
}

/**
 * 统计词元的出现次数
 * @param {string[]} tokens 词元数组
 * @returns {Map<string, number>} 词 -> 词频
 */
function termFrequency(tokens) {
  const freq = new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return freq;
}

/**
 * 计算查询词元与文档词元的简单重合度得分
 * 采用「命中词元个数 / 查询词元个数」的方式，取值范围 0 ~ 1。
 * @param {string[]} queryTokens 查询词元
 * @param {string[]} docTokens 文档词元
 * @returns {number} 相似度得分
 */
function overlapScore(queryTokens, docTokens) {
  if (!queryTokens.length || !docTokens.length) return 0;

  const docSet = new Set(docTokens);
  let hit = 0;
  for (const t of queryTokens) {
    if (docSet.has(t)) hit += 1;
  }
  return hit / queryTokens.length;
}

module.exports = {
  tokenize,
  termFrequency,
  overlapScore,
  STOP_WORDS
};
