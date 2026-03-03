const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const pdfParse = require("pdf-parse");
const JSZip = require("jszip");

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3789", 10);
const COMPILE_TOKEN = (process.env.COMPILE_TOKEN || "").trim();
const OUTPUT_TTL_HOURS = Number.parseInt(process.env.OUTPUT_TTL_HOURS || "24", 10);
const MAX_UPLOAD_MB = Number.parseInt(process.env.MAX_UPLOAD_MB || "100", 10);
const WECHAT_APPID = (process.env.WECHAT_APPID || "").trim();
const WECHAT_SECRET = (process.env.WECHAT_SECRET || "").trim();
const WECHAT_THUMB_MEDIA_ID = (process.env.WECHAT_THUMB_MEDIA_ID || "").trim();
const WECHAT_DEFAULT_AUTHOR = (process.env.WECHAT_DEFAULT_AUTHOR || "pdf2skill").trim();
const WECHAT_DEFAULT_SOURCE_URL = (process.env.WECHAT_DEFAULT_SOURCE_URL || "").trim();
const WECHAT_AUTO_PUBLISH_DEFAULT = ["1", "true", "yes", "on"].includes(
  String(process.env.WECHAT_AUTO_PUBLISH || "").trim().toLowerCase()
);

app.disable("x-powered-by");

const uploadDir = path.join(__dirname, "tmp-uploads");
const outDir = path.join(__dirname, "web-output");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 1024 * 1024 * MAX_UPLOAD_MB,
    files: 10,
  },
});

function sanitizeSkillName(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanupUploaded(files) {
  for (const f of files || []) {
    if (f && f.path) {
      try {
        fs.unlinkSync(f.path);
      } catch (_) {
        // Ignore cleanup errors.
      }
    }
  }
}

function runCompile(args) {
  return new Promise((resolve, reject) => {
    execFile("node", args, { cwd: __dirname, maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message || "Compile failed").trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sanitizeOutputMode(input) {
  const mode = String(input || "skills").trim().toLowerCase();
  if (mode === "game") {
    return "game";
  }
  if (mode === "app") {
    return "app";
  }
  if (mode === "wechat") {
    return "wechat";
  }
  return "skills";
}

function sanitizeBoolean(input, fallback) {
  if (input === undefined || input === null || input === "") {
    return Boolean(fallback);
  }
  const val = String(input).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(val)) {
    return false;
  }
  return Boolean(fallback);
}

function sanitizeAppTemplate(input) {
  const val = String(input || "auto").trim().toLowerCase();
  if (val === "detective" || val === "analyzer") {
    return val;
  }
  return "auto";
}

function safeWords(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function pickSegments(text, limit) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 10);
  if (lines.length === 0) {
    return [];
  }
  return lines.slice(0, limit);
}

function textHashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text || "")) {
    h ^= ch.charCodeAt(0);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function seedToCode(seed) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let x = seed;
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[x % chars.length];
    x = Math.floor(x / chars.length) || seed + i * 13;
  }
  return out;
}

function buildGamePack(options) {
  const sourceText = String(options.text || "");
  const seed = textHashSeed(sourceText + options.name);
  const seedCode = seedToCode(seed);
  const snippets = pickSegments(sourceText, 24);
  const words = safeWords(sourceText);

  const suspects = [
    { id: "sus_1", name: "林川", occupation: "顾问" },
    { id: "sus_2", name: "周敏", occupation: "记者" },
    { id: "sus_3", name: "顾然", occupation: "助理" },
    { id: "sus_4", name: "唐岚", occupation: "法务" },
    { id: "sus_5", name: "沈弈", occupation: "运维" },
  ];
  const guiltyIndex = seed % suspects.length;

  const scenes = [
    { id: "scene_1", name: "办公室", type: "primary_crime_scene", description: "主案发空间" },
    { id: "scene_2", name: "后门通道", type: "body_discovery", description: "尸体发现点" },
    { id: "scene_3", name: "会议室", type: "related_location", description: "争执发生地" },
    { id: "scene_4", name: "机房", type: "related_location", description: "关键证据点" },
    { id: "scene_5", name: "停车区", type: "related_location", description: "离开路径" },
  ];

  const baseClues = [
    "监控时间戳存在 12 分钟偏差",
    "门禁记录显示异常二次刷卡",
    "受害者终端在案发前有远程登录",
    "嫌疑人口供与交通轨迹矛盾",
    "聊天记录存在删除痕迹",
    "纸质文件中出现被改写批注",
    "财务转账时间与事件冲突",
    "会议纪要缺失关键一页",
    "外套纤维与现场样本匹配",
    "备份日志在关键时段中断",
    "录音片段中有第三方声音",
    "手机定位与不在场证明冲突",
  ];

  const clues = baseClues.map((desc, idx) => {
    const relevance =
      idx % 4 === 0 ? "murderer" : idx % 4 === 1 ? "motive" : idx % 4 === 2 ? "weapon" : "red_herring";
    const sample = snippets[idx % Math.max(1, snippets.length)] || words.slice(idx * 6, idx * 6 + 12).join(" ") || desc;
    return {
      id: `clue_${idx + 1}`,
      name: `线索 ${idx + 1}`,
      description: desc,
      detail: sample.slice(0, 140),
      sceneId: scenes[idx % scenes.length].id,
      relevance,
      hidden: idx % 5 === 0,
      sourceSpans: [
        {
          docId: options.sourceDocId,
          page: (idx % 12) + 1,
          text: sample.slice(0, 180) || desc,
          confidence: 0.85,
        },
      ],
    };
  });

  const suspectsWithFlags = suspects.map((s, idx) => ({
    id: s.id,
    name: s.name,
    age: 25 + ((seed + idx * 7) % 20),
    gender: idx % 2 === 0 ? "male" : "female",
    occupation: s.occupation,
    relationship: idx === guiltyIndex ? "与受害者存在直接利益冲突" : "与受害者有工作往来",
    isGuilty: idx === guiltyIndex,
    alibiFake: idx === guiltyIndex,
    alibi: {
      description: idx === guiltyIndex ? "称自己在外部会面" : "称自己在办公区处理事务",
      location: idx === guiltyIndex ? "外部商圈" : "办公区",
      isTrue: idx !== guiltyIndex,
    },
    motive: idx === guiltyIndex ? "核心利益受损，试图掩盖关键证据" : "存在边缘利益关系",
    lies:
      idx === guiltyIndex
        ? [
            {
              id: `lie_${idx + 1}_1`,
              topic: "行踪",
              lie: "案发时段未进入办公楼",
              truth: "在案发时段进入过主楼层",
              reason: "hiding_crime",
            },
            {
              id: `lie_${idx + 1}_2`,
              topic: "通信",
              lie: "未与受害者联系",
              truth: "案发前有高频联系",
              reason: "hiding_crime",
            },
            {
              id: `lie_${idx + 1}_3`,
              topic: "证据接触",
              lie: "没有接触关键文档",
              truth: "存在文档修改记录",
              reason: "hiding_crime",
            },
          ]
        : [
            {
              id: `lie_${idx + 1}_1`,
              topic: "细节记忆",
              lie: "未注意到异常时序",
              truth: "注意到但未上报",
              reason: "fear",
            },
          ],
  }));

  return {
    schemaVersion: "1.0.0",
    meta: {
      sourceDocId: options.sourceDocId,
      sourceTitle: options.sourceTitle,
      language: options.lang,
      seedCode,
      generatedAt: new Date().toISOString(),
    },
    briefing: {
      title: `${options.name} 案件包`,
      summary: "根据上传 PDF 自动生成的推理案件，可用于问答式侦探玩法。",
      timeOfDeath: "晚上 21:00 左右",
    },
    victim: {
      id: "victim_1",
      name: "陈某",
      age: 41,
      gender: "male",
      occupation: "项目负责人",
      appearance: "深色外套，戴眼镜",
      lastKnownActivities: "案发前在办公室整理关键材料",
      discoveryTime: "次日 08:15",
    },
    weapon: {
      name: "锐器",
      type: "physical",
    },
    scenes,
    suspects: suspectsWithFlags,
    witnesses: [
      {
        id: "wit_1",
        name: "保安甲",
        occupation: "安保",
        saw: "看到可疑人物在后门徘徊",
        where: "后门通道",
        when: "20:40",
      },
    ],
    clues,
    forensicReport: {
      causeOfDeath: "致命外力造成失血",
      wounds: [{ location: "胸部", description: "单一深刺创", weapon: "锐器" }],
      anomalies: ["尸体僵硬程度与口供时间线不匹配"],
      toxicology: "未检出异常毒物",
    },
    timeline: [
      { time: "20:10", description: "受害者最后一次出现在监控中", isKey: true },
      { time: "20:40", description: "后门通道出现可疑行动", isKey: true },
      { time: "21:00", description: "推定死亡时间", isKey: true },
    ],
    constraints: {
      suspectCount: 5,
      exactlyOneGuilty: true,
      minTotalClues: 12,
      requiredRelevance: ["murderer", "motive", "weapon", "red_herring"],
      mustContainContradictionAnomaly: true,
    },
    gameRuntime: {
      objective: "通过线索问答与矛盾核验，锁定唯一凶手。",
      actions: ["ask", "inspect", "challenge", "submit"],
      winCondition: "提交嫌疑人与关键证据链一致。",
    },
  };
}

function buildAnalyzerPack(options) {
  const sourceText = String(options.text || "");
  const snippets = pickSegments(sourceText, 18);
  const words = safeWords(sourceText);
  const topics = [];
  const topicSeed = words.filter((x) => x.length >= 3).slice(0, 40);
  for (let i = 0; i < topicSeed.length; i += 6) {
    const name = topicSeed.slice(i, i + 3).join(" ").trim();
    if (!name) {
      continue;
    }
    topics.push({
      id: `topic_${topics.length + 1}`,
      name: name.slice(0, 40),
      summary: (snippets[topics.length] || "关键知识单元").slice(0, 180),
      checklist: [
        "确认输入数据完整",
        "按规则执行分析",
        "输出风险与建议",
      ],
    });
    if (topics.length >= 8) {
      break;
    }
  }

  if (topics.length === 0) {
    topics.push({
      id: "topic_1",
      name: "核心主题",
      summary: "未提取到足够结构化段落，建议补充更完整 PDF 内容。",
      checklist: ["检查文档可读性", "重新上传清晰版本", "复核输出"],
    });
  }

  return {
    schemaVersion: "1.0.0",
    meta: {
      sourceDocId: options.sourceDocId,
      sourceTitle: options.sourceTitle,
      language: options.lang,
      generatedAt: new Date().toISOString(),
    },
    appKind: "analyzer",
    title: `${options.name} 分析器`,
    description: "从 PDF 自动抽取主题并生成可交互分析面板。",
    topics,
    quickActions: ["总览", "主题筛选", "导出建议"],
  };
}

function buildAppIndexHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>pdf2app output</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <main class="shell">
      <header class="hero">
        <h1 id="appTitle">pdf2app output</h1>
        <p id="appDesc">Loading...</p>
      </header>
      <section class="toolbar">
        <button data-tab="overview" class="active">概览</button>
        <button data-tab="play">交互</button>
        <button data-tab="data">数据</button>
      </section>
      <section id="content" class="content"></section>
    </main>
    <script src="./app.js"></script>
  </body>
</html>
`;
}

function buildAppStyleCss() {
  return `:root {
  --bg: #0f1224;
  --panel: #171b33;
  --text: #e8ebff;
  --muted: #a5acd3;
  --line: #2b3366;
  --primary: #4f7cff;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: radial-gradient(circle at top, #1d2450 0%, var(--bg) 60%);
  color: var(--text);
}
.shell { max-width: 960px; margin: 32px auto; padding: 0 16px; }
.hero { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px; }
.hero h1 { margin: 0 0 6px; }
.hero p { margin: 0; color: var(--muted); }
.toolbar { margin: 14px 0; display: flex; gap: 8px; }
.toolbar button {
  border: 1px solid var(--line);
  background: #141936;
  color: var(--text);
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
}
.toolbar button.active { background: var(--primary); border-color: var(--primary); }
.content { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; min-height: 280px; }
.card { border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 10px; background: #121734; }
.muted { color: var(--muted); }
.list { margin: 0; padding-left: 20px; }
.badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; margin-right: 6px; font-size: 12px; }
`;
}

function buildAppJs() {
  return `async function loadData() {
  const resp = await fetch('./data/app.json', { cache: 'no-store' });
  if (!resp.ok) throw new Error('failed to load app data');
  return resp.json();
}

function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function renderOverview(data) {
  if (data.appKind === 'detective') {
    return el('<div>'
      + '<div class="card"><strong>目标</strong><p class="muted">' + data.gameRuntime.objective + '</p></div>'
      + '<div class="card"><strong>种子码</strong><p>' + data.meta.seedCode + '</p></div>'
      + '<div class="card"><strong>嫌疑人数</strong><p>' + data.suspects.length + '</p></div>'
      + '<div class="card"><strong>线索数</strong><p>' + data.clues.length + '</p></div>'
      + '</div>');
  }
  return el('<div>'
    + '<div class="card"><strong>主题数量</strong><p>' + data.topics.length + '</p></div>'
    + '<div class="card"><strong>快速动作</strong><p>' + data.quickActions.map((x) => '<span class="badge">' + x + '</span>').join('') + '</p></div>'
    + '</div>');
}

function renderPlay(data) {
  if (data.appKind === 'detective') {
    const suspects = data.suspects.map((s) => '<li>' + s.name + ' - ' + s.occupation + '</li>').join('');
    const clues = data.clues.slice(0, 8).map((c) => '<li>[' + c.relevance + '] ' + c.description + '</li>').join('');
    return el('<div>'
      + '<div class="card"><strong>嫌疑人</strong><ul class="list">' + suspects + '</ul></div>'
      + '<div class="card"><strong>关键线索（前8）</strong><ul class="list">' + clues + '</ul></div>'
      + '</div>');
  }
  const topics = data.topics.map((t) => '<li><strong>' + t.name + '</strong>：' + t.summary + '</li>').join('');
  return el('<div><div class="card"><strong>主题分析</strong><ul class="list">' + topics + '</ul></div></div>');
}

function renderData(data) {
  return el('<pre class="card" style="white-space:pre-wrap;overflow:auto;max-height:460px;">'
    + JSON.stringify(data, null, 2)
    + '</pre>');
}

function setActive(buttons, tab) {
  buttons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

async function main() {
  const data = await loadData();
  document.getElementById('appTitle').textContent = data.title || 'pdf2app';
  document.getElementById('appDesc').textContent = data.description || '';

  const content = document.getElementById('content');
  const buttons = Array.from(document.querySelectorAll('[data-tab]'));

  function render(tab) {
    content.innerHTML = '';
    if (tab === 'overview') content.appendChild(renderOverview(data));
    else if (tab === 'play') content.appendChild(renderPlay(data));
    else content.appendChild(renderData(data));
    setActive(buttons, tab);
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => render(btn.dataset.tab)));
  render('overview');
}

main().catch((err) => {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="card">加载失败：' + (err && err.message ? err.message : err) + '</div>';
});
`;
}

async function writeAppBundle(zipPath, appData) {
  const zip = new JSZip();
  zip.file("index.html", buildAppIndexHtml());
  zip.file("style.css", buildAppStyleCss());
  zip.file("app.js", buildAppJs());
  zip.file("data/app.json", `${JSON.stringify(appData, null, 2)}\n`);
  zip.file(
    "README.md",
    [
      "# pdf2app output",
      "",
      "This package is generated from uploaded PDF files.",
      "",
      "## Run",
      "",
      "Open `index.html` directly in browser, or serve with any static file server.",
      "",
      "## Included",
      "",
      "- index.html",
      "- style.css",
      "- app.js",
      "- data/app.json",
    ].join("\n")
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(zipPath, buffer);
}

async function compilePdfText(files) {
  const segments = [];
  for (const file of files) {
    const buff = fs.readFileSync(file.path);
    const parsed = await pdfParse(buff);
    const text = String(parsed.text || "").trim();
    if (text) {
      segments.push(`## ${file.originalname}\n\n${text}`);
    }
  }

  const merged = segments.join("\n\n");
  if (!merged.trim()) {
    throw new Error("Failed to extract text from uploaded PDFs.");
  }
  return merged;
}

async function compileGameJson(files, options) {
  const merged = await compilePdfText(files);

  return buildGamePack({
    text: merged,
    name: options.name,
    lang: options.lang,
    sourceDocId: `doc_${Date.now()}`,
    sourceTitle: options.name,
  });
}

async function compileAppBundle(files, options) {
  const merged = await compilePdfText(files);

  const appTemplate = sanitizeAppTemplate(options.appTemplate);
  let appData;
  if (appTemplate === "analyzer") {
    appData = buildAnalyzerPack({
      text: merged,
      name: options.name,
      lang: options.lang,
      sourceDocId: `doc_${Date.now()}`,
      sourceTitle: options.name,
    });
  } else {
    const gamePack = buildGamePack({
      text: merged,
      name: options.name,
      lang: options.lang,
      sourceDocId: `doc_${Date.now()}`,
      sourceTitle: options.name,
    });
    appData = {
      ...gamePack,
      appKind: "detective",
      title: `${options.name} 推理互动 APP`,
      description: "从 PDF 自动生成的可交互侦探应用（浏览器可直接运行）。",
    };
  }

  const zipPath = path.join(outDir, `${options.name}-app.zip`);
  await writeAppBundle(zipPath, appData);
  return zipPath;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildWechatArticleFromText(text, options) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const title = options.title || options.name || "pdf2skill 自动生成内容";
  const digestSource = lines.join(" ").replace(/\s+/g, " ");
  const digest = (options.digest || digestSource.slice(0, 110) || "由 PDF 自动生成").slice(0, 120);
  const bodyParts = lines.slice(0, 120).map((ln) => `<p>${htmlEscape(ln)}</p>`);
  const content = [
    `<h1>${htmlEscape(title)}</h1>`,
    `<p><em>本文由 PDF 自动转换生成，可在草稿中继续编辑后发布。</em></p>`,
    ...bodyParts,
  ].join("\n");

  return {
    title,
    author: options.author || WECHAT_DEFAULT_AUTHOR,
    digest,
    content,
    content_source_url: options.sourceUrl || WECHAT_DEFAULT_SOURCE_URL,
    thumb_media_id: WECHAT_THUMB_MEDIA_ID,
    need_open_comment: 1,
    only_fans_can_comment: 0,
  };
}

let wechatTokenCache = {
  token: "",
  expireAt: 0,
};

async function getWechatAccessToken() {
  const now = Date.now();
  if (wechatTokenCache.token && now < wechatTokenCache.expireAt - 60 * 1000) {
    return wechatTokenCache.token;
  }

  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
    WECHAT_APPID
  )}&secret=${encodeURIComponent(WECHAT_SECRET)}`;
  const resp = await fetch(tokenUrl, { method: "GET" });
  const data = await resp.json();
  if (!resp.ok || data.errcode) {
    throw new Error(`WeChat token failed: ${data.errmsg || resp.statusText || "unknown"}`);
  }

  const expiresIn = Number.parseInt(String(data.expires_in || "7200"), 10);
  wechatTokenCache = {
    token: String(data.access_token || ""),
    expireAt: now + Math.max(300, Number.isFinite(expiresIn) ? expiresIn : 7200) * 1000,
  };

  if (!wechatTokenCache.token) {
    throw new Error("WeChat token failed: empty access_token");
  }
  return wechatTokenCache.token;
}

async function callWechatApi(pathname, payload) {
  const token = await getWechatAccessToken();
  const url = `https://api.weixin.qq.com${pathname}${pathname.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok || data.errcode) {
    throw new Error(`WeChat API failed: ${data.errmsg || resp.statusText || "unknown"}`);
  }
  return data;
}

function assertWechatEnv() {
  const missing = [];
  if (!WECHAT_APPID) {
    missing.push("WECHAT_APPID");
  }
  if (!WECHAT_SECRET) {
    missing.push("WECHAT_SECRET");
  }
  if (!WECHAT_THUMB_MEDIA_ID) {
    missing.push("WECHAT_THUMB_MEDIA_ID");
  }
  if (missing.length > 0) {
    throw new Error(`WeChat env is missing: ${missing.join(", ")}`);
  }
}

function maskSecret(value) {
  const s = String(value || "");
  if (!s) {
    return "";
  }
  if (s.length <= 6) {
    return "***";
  }
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

async function compileWechatPayload(files, options) {
  assertWechatEnv();
  const text = await compilePdfText(files);
  const article = buildWechatArticleFromText(text, options);
  const draftData = await callWechatApi("/cgi-bin/draft/add", { articles: [article] });

  const result = {
    ok: true,
    mode: "wechat",
    draftMediaId: String(draftData.media_id || ""),
    autoPublish: Boolean(options.autoPublish),
  };

  if (!result.draftMediaId) {
    throw new Error("WeChat draft/add succeeded but media_id is empty");
  }

  if (options.autoPublish) {
    const publishData = await callWechatApi("/cgi-bin/freepublish/submit", {
      media_id: result.draftMediaId,
    });
    result.publishId = String(publishData.publish_id || "");
    result.publishStatus = "submitted";
  }

  return result;
}

function cleanupOldOutputs(rootDir, ttlHours) {
  const ttlMs = Math.max(1, ttlHours) * 60 * 60 * 1000;
  const now = Date.now();

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    try {
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs <= ttlMs) {
        continue;
      }
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    } catch (_) {
      // Ignore cleanup failures.
    }
  }
}

function isPdfFile(file) {
  const name = String(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "").toLowerCase();
  return name.endsWith(".pdf") && mime.includes("pdf");
}

function authGuard(req, res, next) {
  if (!COMPILE_TOKEN) {
    next();
    return;
  }

  const candidate = String(req.headers["x-compile-token"] || req.query.token || "").trim();
  if (!candidate || candidate !== COMPILE_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/wechat/status", authGuard, (_req, res) => {
  res.json({
    ok: true,
    configured: {
      appid: Boolean(WECHAT_APPID),
      secret: Boolean(WECHAT_SECRET),
      thumbMediaId: Boolean(WECHAT_THUMB_MEDIA_ID),
    },
    masked: {
      appid: maskSecret(WECHAT_APPID),
      thumbMediaId: maskSecret(WECHAT_THUMB_MEDIA_ID),
    },
    defaults: {
      author: WECHAT_DEFAULT_AUTHOR,
      sourceUrl: WECHAT_DEFAULT_SOURCE_URL,
      autoPublish: WECHAT_AUTO_PUBLISH_DEFAULT,
    },
  });
});

app.post("/api/compile", authGuard, upload.array("pdfs", 10), async (req, res) => {
  const files = req.files || [];

  cleanupOldOutputs(outDir, OUTPUT_TTL_HOURS);

  if (files.length === 0) {
    res.status(400).json({ error: "Please upload at least one PDF file." });
    return;
  }

  for (const file of files) {
    if (!isPdfFile(file)) {
      cleanupUploaded(files);
      res.status(400).json({ error: `Invalid file type: ${file.originalname}. Only PDF is allowed.` });
      return;
    }
  }

  const rawName = req.body.name || "pdf-skill-pack";
  const skillName = sanitizeSkillName(rawName);
  const lang = ["auto", "zh", "en"].includes(String(req.body.lang || "auto"))
    ? String(req.body.lang || "auto")
    : "auto";

  const maxChunks = Number.parseInt(req.body.maxChunks || "24", 10);
  const minScore = Number.parseInt(req.body.minScore || "55", 10);
  const outputMode = sanitizeOutputMode(req.body.outputMode || req.query.outputMode || "skills");
  const appTemplate = sanitizeAppTemplate(req.body.appTemplate || req.query.appTemplate || "auto");
  const wechatAuthor = String(req.body.wechatAuthor || "").trim();
  const wechatSourceUrl = String(req.body.wechatSourceUrl || "").trim();
  const wechatTitle = String(req.body.wechatTitle || "").trim();
  const wechatDigest = String(req.body.wechatDigest || "").trim();
  const wechatAutoPublish = sanitizeBoolean(req.body.wechatAutoPublish, WECHAT_AUTO_PUBLISH_DEFAULT);

  if (!skillName) {
    cleanupUploaded(files);
    res.status(400).json({ error: "Skill name is invalid." });
    return;
  }

  try {
    if (outputMode === "game") {
      const gamePack = await compileGameJson(files, {
        name: skillName,
        lang,
      });
      const jsonPath = path.join(outDir, `${skillName}-game.json`);
      fs.writeFileSync(jsonPath, `${JSON.stringify(gamePack, null, 2)}\n`, "utf8");
      res.download(jsonPath, `${skillName}-game.json`, () => {
        cleanupUploaded(files);
      });
      return;
    }

    if (outputMode === "app") {
      const appZipPath = await compileAppBundle(files, {
        name: skillName,
        lang,
        appTemplate,
      });

      res.download(appZipPath, `${skillName}-app.zip`, () => {
        cleanupUploaded(files);
      });
      return;
    }

    if (outputMode === "wechat") {
      const result = await compileWechatPayload(files, {
        name: skillName,
        title: wechatTitle,
        author: wechatAuthor,
        sourceUrl: wechatSourceUrl,
        digest: wechatDigest,
        autoPublish: wechatAutoPublish,
      });
      cleanupUploaded(files);
      res.json(result);
      return;
    }

    const inputArg = files.map((f) => path.resolve(f.path)).join(",");
    const args = [
      "index.js",
      "--input",
      inputArg,
      "--name",
      skillName,
      "--outdir",
      outDir,
      "--lang",
      lang,
      "--max-chunks",
      Number.isFinite(maxChunks) ? String(maxChunks) : "24",
      "--min-score",
      Number.isFinite(minScore) ? String(minScore) : "55",
    ];

    await runCompile(args);
    const zipPath = path.join(outDir, `${skillName}.zip`);

    if (!fs.existsSync(zipPath)) {
      throw new Error("Compilation finished but ZIP file was not generated.");
    }

    res.download(zipPath, `${skillName}.zip`, () => {
      cleanupUploaded(files);
    });
  } catch (err) {
    cleanupUploaded(files);
    res.status(500).json({ error: err.message || "Compile failed" });
  }
});

app.listen(PORT, () => {
  process.stdout.write(`pdf2skill-backend API running: http://localhost:${PORT}\n`);
});
