/**
 * 被测模块：src/record/qaRecord.js
 *
 * 模块功能：把问答记录以 JSON 形式持久化到本地文件，并提供
 * add()（新增）/ list()（按最新在前读取）/ readAll() / writeAll() 等接口。
 *
 * 测试范围：
 *   1) 存储路径注入接口 setStorePath() / getStorePath()；
 *   2) add() 新增记录：总数递增、字段完整、缺省值正确、id 唯一；
 *   3) list() 顺序：最新在前；list(1) 只返回最新的一条；
 *   4) writeAll() 与 readAll() 的持久化往返；writeAll() 的参数校验；
 *   5) readAll() 对内容不可用文件的降级与备份行为。
 *
 * 隔离说明：
 *   模块默认写入真实的 data/qa-records.json。本套件在 beforeAll 通过
 *   setStorePath() 把存储路径指向系统临时目录下的独立文件，
 *   整个测试过程不触碰真实数据；afterAll 清理临时文件及其备份产物。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  add,
  list,
  readAll,
  writeAll,
  getStorePath,
  setStorePath
} from '../src/record/qaRecord.js';

// 本次测试专用的临时数据文件
let storeFile = '';
let baseName = '';

/** 列出测试遗留的临时产物（数据文件、.tmp、.corrupt-* 备份） */
function listLeftovers() {
  const dir = path.dirname(storeFile);
  return fs.readdirSync(dir).filter((name) => name.startsWith(baseName));
}

beforeAll(() => {
  storeFile = path.join(os.tmpdir(), `qa-records-test-${process.pid}.json`);
  baseName = path.basename(storeFile);
  setStorePath(storeFile);
  if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
});

afterAll(() => {
  // 清理临时数据文件、临时写入文件与损坏备份，保证不留痕迹
  listLeftovers().forEach((name) => fs.unlinkSync(path.join(path.dirname(storeFile), name)));
});

// 每个用例开始前清空记录，避免用例之间相互影响
beforeEach(() => {
  writeAll([]);
});

describe('qaRecord：问答记录读写', () => {
  it('setStorePath() 应能改写存储路径，使读写落在临时文件上', () => {
    // 测试意图：验证路径注入接口生效，这是本套件与真实数据隔离的基础
    expect(getStorePath()).toBe(storeFile);
    expect(fs.existsSync(storeFile)).toBe(true);
  });

  it('add() 新增一条记录后，总记录数应 +1', () => {
    // 测试意图：验证新增操作确实把记录追加进了存储，而不是只返回对象
    const before = readAll().length;
    add({ question: '问题一', answer: '答案一' });
    expect(readAll()).toHaveLength(before + 1);
  });

  it('add() 返回的记录应字段完整，且缺省值符合预期', () => {
    // 测试意图：确认记录结构与字段约定一致。
    // 注意：本模块的字段是 id / question / answer / sources / mode / createdAt，
    // 并不存在 content、timestamp 这两个字段。
    const record = add({ question: '问题一', answer: '答案一' });

    expect(Object.keys(record).sort()).toEqual(
      ['id', 'question', 'answer', 'sources', 'mode', 'createdAt'].sort()
    );
    expect(record.question).toBe('问题一');
    expect(record.answer).toBe('答案一');
    // 未显式传入 sources / mode 时，应落到缺省值
    expect(record.sources).toEqual([]);
    expect(record.mode).toBe('unknown');
    // id 为 UUID；createdAt 为可解析的时间字符串
    expect(record.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(Number.isNaN(Date.parse(record.createdAt))).toBe(false);
  });

  it('连续 add() 多条时，各条 id 应互不相同', () => {
    // 测试意图：验证 id 的唯一性。
    // 注意：不断言"递增"——记录先后顺序由 createdAt 承担，id 本身不承载顺序语义。
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(add({ question: `Q${i}`, answer: `A${i}` }).id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('list() 应按“最新创建在前”的顺序返回', () => {
    // 测试意图：验证读取顺序符合"最新在前"的约定
    add({ question: '最早', answer: 'A' });
    add({ question: '中间', answer: 'B' });
    add({ question: '最新', answer: 'C' });

    expect(list().map((item) => item.question)).toEqual(['最新', '中间', '最早']);
  });

  it('list() 应按 createdAt 排序，而不依赖文件里的存储顺序', () => {
    // 测试意图：即使数据文件中的物理顺序被打乱，返回结果仍应按时间倒序。
    // 这条用例专门覆盖"手工编辑 JSON 打乱顺序"的场景。
    writeAll([
      { id: 'b', question: '中间', answer: 'B', sources: [], mode: 'llm', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'c', question: '最新', answer: 'C', sources: [], mode: 'llm', createdAt: '2026-01-03T00:00:00.000Z' },
      { id: 'a', question: '最早', answer: 'A', sources: [], mode: 'llm', createdAt: '2026-01-01T00:00:00.000Z' }
    ]);

    expect(list().map((item) => item.question)).toEqual(['最新', '中间', '最早']);
  });

  it('list(1) 只返回 1 条，且正是最新那条', () => {
    // 测试意图：验证 limit 参数能限制返回条数，且截取的是最新的一批
    add({ question: '最早', answer: 'A' });
    add({ question: '最新', answer: 'C' });

    const latest = list(1);
    expect(latest).toHaveLength(1);
    expect(latest[0].question).toBe('最新');
  });

  it('writeAll() 写入的数据应能被 readAll() 原样读回', () => {
    // 测试意图：验证持久化往返的数据完整性（写入后再读，内容与顺序都不变）
    const sample = [
      {
        id: 'x1',
        question: 'Q1',
        answer: 'A1',
        sources: ['资料A'],
        mode: 'demo',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        id: 'x2',
        question: 'Q2',
        answer: 'A2',
        sources: [],
        mode: 'llm',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    ];

    writeAll(sample);
    expect(readAll()).toEqual(sample);
  });

  it('writeAll() 传入非数组时应抛出 TypeError', () => {
    // 测试意图：验证参数校验，避免把非数组写进文件造成数据格式错乱
    expect(() => writeAll({ question: '不是数组' })).toThrow(TypeError);
    expect(() => writeAll(undefined)).toThrow(TypeError);
  });

  it('readAll() 遇到内容不可用的文件时，应备份原文件并降级为空数组', () => {
    // 测试意图：验证降级不丢数据——解析失败时返回 [] 保证接口可用，
    // 同时把损坏内容备份保留下来，而不是让后续写入直接覆盖掉。
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const brokenContent = '{ 这不是合法的 JSON';
    fs.writeFileSync(storeFile, brokenContent, 'utf8');

    expect(readAll()).toEqual([]);

    // 原内容应被完整备份（而不是被丢弃或被覆盖）
    const backups = listLeftovers().filter((name) => name.includes('.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(path.dirname(storeFile), backups[0]), 'utf8')).toBe(brokenContent);

    warnSpy.mockRestore();
  });
});
