/**
 * 接口级集成测试：AI 答疑助手的 HTTP 接口层
 *
 * 被测范围：src/routes/ask.js 暴露的接口，经由 src/server.js 的 createServer()
 * 组装的完整 HTTP 链路（HTTP → 路由 → 检索 → 大模型 → 记录落库 → 响应）。
 *
 * 隔离策略：
 *   1) 端口隔离——createServer() 由测试自行 listen(0)，由系统分配随机端口，
 *      绝不占用开发服务器使用的 3000 端口；
 *   2) 数据隔离——用环境变量 QA_RECORDS_PATH 把记录文件指向系统临时目录下的
 *      独立文件，且必须在**任何模块加载之前**设置（见下方 vi.hoisted 的说明），
 *      绝不写真实的 data/qa-records.json。
 *
 * 关于数据隔离为何不用 setStorePath()：
 *   本模块提供 setStorePath()，但在 Vitest 的模块登记机制下，测试文件 import 到的
 *   模块实例与 ask.js 内部 require 到的实例可能并非同一个对象；只对前者调用
 *   setStorePath()，路由层仍会写真实文件（本套件第一版就因此污染过数据文件）。
 *   改用环境变量后，无论有多少个模块实例，它们在自己的加载时刻都会读到该变量，
 *   隔离才真正生效。
 *
 * 大模型策略（为什么不 mock）：
 *   本套件不真的调用外部大模型，但也没有用 vi.mock 打桩，而是通过环境变量把
 *   llm 模块逼进两条**真实**分支，测的是真实代码路径而不是替身：
 *   - 正常用例：清空 LLM_API_KEY → 走演示模式分支（离线、结果可预测）；
 *   - 异常用例：把 LLM_BASE_URL 指向必然连不上的地址 → 真实触发调用失败 → 502。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { createServer } from '../src/server.js';
import { readAll, writeAll } from '../src/record/qaRecord.js';

/**
 * 必须在任何 import 之前设置环境变量：vi.hoisted 的回调先于所有 import 执行。
 * 这里刻意不使用 path/os 模块，避免在 hoisted 阶段引入模块解析问题。
 */
const storeFile = vi.hoisted(() => {
  const dir = (process.env.TEMP || process.env.TMPDIR || '/tmp').replace(/[\\/]+$/, '');
  const file = `${dir}/ask-api-records-${process.pid}.json`;
  process.env.QA_RECORDS_PATH = file;
  return file;
});

// 归一化后的临时文件路径（供直接读写与清理使用）
const storePathAbs = path.resolve(storeFile);
const storeDir = path.dirname(storePathAbs);
const storeBase = path.basename(storePathAbs);

// 服务实例与 supertest 请求代理
let server = null;
let api = null;

/** 列出测试遗留的临时产物（记录文件、.tmp、.corrupt-* 备份） */
function listLeftovers() {
  if (!fs.existsSync(storeDir)) return [];
  return fs.readdirSync(storeDir).filter((name) => name.startsWith(storeBase));
}

beforeAll(async () => {
  // 清掉上一次运行可能残留的临时文件
  listLeftovers().forEach((name) => fs.unlinkSync(path.join(storeDir, name)));

  // 端口隔离：随机端口启动服务
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  api = request(`http://127.0.0.1:${server.address().port}`);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));

  // 清理临时文件及其备份产物
  listLeftovers().forEach((name) => fs.unlinkSync(path.join(storeDir, name)));

  vi.unstubAllEnvs();
});

beforeEach(() => {
  // 每个用例前清空记录，避免用例之间互相污染
  writeAll([]);

  // 固定为演示模式：不访问外部大模型，结果可预测
  vi.stubEnv('LLM_API_KEY', '');
  vi.stubEnv('LLM_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/ask：提问接口', () => {
  it('正常提问应返回 200，且 data 字段齐全、回答非空（契约 1-成功）', async () => {
    const res = await api.post('/api/ask').send({ question: '什么是 Spec 驱动开发？' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { data } = res.body;
    // 字段契约：id / question / answer / sources / mode / createdAt
    expect(Object.keys(data).sort()).toEqual(
      ['id', 'question', 'answer', 'sources', 'mode', 'createdAt'].sort()
    );
    expect(data.question).toBe('什么是 Spec 驱动开发？');
    expect(typeof data.answer).toBe('string');
    expect(data.answer.trim().length).toBeGreaterThan(0);
    expect(Array.isArray(data.sources)).toBe(true);
    // 本用例固定为演示模式
    expect(data.mode).toBe('demo');
    expect(Number.isNaN(Date.parse(data.createdAt))).toBe(false);
  });

  it('问题为纯空格时应返回 400 与固定错误文案（契约 1-校验）', async () => {
    const res = await api.post('/api/ask').send({ question: '    ' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: '问题内容不能为空' });
  });

  it('请求体缺少 question 字段时应返回 400（契约 1-校验）', async () => {
    const res = await api.post('/api/ask').send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ ok: false, error: '问题内容不能为空' });
  });

  it('大模型调用失败时应返回 502，且不写入记录（契约 1-异常）', async () => {
    // 把接口地址指向必然连不上的端口，真实触发大模型调用失败（离线、即时失败）
    vi.stubEnv('LLM_API_KEY', 'test-key');
    vi.stubEnv('LLM_BASE_URL', 'http://127.0.0.1:1/v1');

    const res = await api.post('/api/ask').send({ question: '触发大模型失败' });

    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('答疑失败');
    // 失败请求不应落库，避免留下空答案记录
    expect(readAll()).toHaveLength(0);
  });
});

describe('GET /api/history：历史记录接口', () => {
  it('提问后能查到刚写入的那一条，验证接口之间的数据传递', async () => {
    const question = '接口间数据传递验证';
    const askRes = await api.post('/api/ask').send({ question });
    expect(askRes.status).toBe(200);

    const res = await api.get('/api/history?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // 用 id 精确比对，确认写入的那条能被读出来
    const hit = res.body.data.find((item) => item.id === askRes.body.data.id);
    expect(hit).toBeDefined();
    expect(hit.question).toBe(question);

    // 直接读隔离文件，确认路由层写入的确实是临时文件而非真实数据文件
    const onDisk = JSON.parse(fs.readFileSync(storePathAbs, 'utf8'));
    expect(onDisk.some((item) => item.id === askRes.body.data.id)).toBe(true);
  });

  it('多条记录时最新的排在最前面（契约 2-顺序）', async () => {
    await api.post('/api/ask').send({ question: '第一条提问' });
    await api.post('/api/ask').send({ question: '第二条提问' });

    const res = await api.get('/api/history?limit=20');

    expect(res.status).toBe(200);
    expect(res.body.data[0].question).toBe('第二条提问');
  });

  it('limit 参数应限制返回条数（契约 2-分页）', async () => {
    await api.post('/api/ask').send({ question: '第一条提问' });
    await api.post('/api/ask').send({ question: '第二条提问' });

    const res = await api.get('/api/history?limit=1');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].question).toBe('第二条提问');
  });
});

describe('非接口请求：静态资源分支', () => {
  it('访问不存在的页面应返回 404，而不是走接口逻辑', async () => {
    const res = await api.get('/no-such-page.html');

    expect(res.status).toBe(404);
  });
});
