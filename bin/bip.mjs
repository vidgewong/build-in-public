#!/usr/bin/env node
/**
 * bip — build-in-public CLI
 * 打卡、记违约、记领取、改指标、管豁免。
 *
 * 数据走 HTTPS 调 open.vidge.me 的 /api/admin/*，和网页 admin 同一条写路径
 * （校验逻辑都在 server/actions.mjs，两边不可能漂移）。
 * 口令存 ~/.bip-token，用 bip login 写入。
 *
 * 本地调试指向本机 API：BIP_API=http://127.0.0.1:8787 bip status
 */
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import * as http from './http.mjs';
import { ApiError } from './http.mjs';
import {
  SETTLE_HOUR,
  addDays,
  buildSlots,
  periodKeyFor,
  summarize,
  todayKey,
} from '../shared/domain.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- 颜色 ---------- */
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c('2'), bold = c('1'), red = c('31'), green = c('32'),
      yellow = c('33'), cyan = c('36'), mag = c('35');

/** 按显示宽度补齐（CJK 占 2 列） */
const dispWidth = (s) => [...String(s)].reduce((w, ch) =>
  w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padTo = (s, n) => String(s) + ' '.repeat(Math.max(0, n - dispWidth(s)));

/* ---------- 日期工具 ---------- */
// 周期推导、格子判定都在 shared/domain.mjs，跟站点共用一份。
// 日期简写（yesterday / -3）的解析在服务端 actions.mjs，这里只管原样转发。

/* ---------- 参数解析 ---------- */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      // 用 !== undefined 而不是看真假：--detail "" 要能把字段清空，
      // 写成 argv[i+1] && … 的话空串会被当成「没给值」，存成布尔 true
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

/** flag 取字符串值。布尔 true（只给了开关没给值）不算。 */
const str = (v) => (typeof v === 'string' && v ? v : undefined);

/** 把 --img / --douyin / --link / --media 收成 media 数组，交给服务端定类型 */
function collectMedia(flags) {
  const media = [];
  const push = (val, type) => {
    if (!val || val === true) return;
    for (const u of String(val).split(',').map((s) => s.trim()).filter(Boolean)) {
      media.push(type ? { type, url: u } : { url: u });
    }
  };
  push(flags.img, 'image');
  push(flags.image, 'image');
  push(flags.douyin, 'douyin');
  push(flags.link, 'link');
  push(flags.media, null);
  return media;
}

/* ---------- 命令 ---------- */

async function cmdLogin({ positional }) {
  const given = positional[0];
  const password = given || await prompt('口令：');
  if (!password) return fail('没有输入口令');
  const file = await http.login(password);
  console.log(green('✓ 已登录'), dim(`口令存在 ${file}（权限 600）`));
  console.log(dim(`  服务：${http.BASE}`));
}

function cmdLogout() {
  http.clearToken();
  console.log(green('✓ 已登出'), dim(`${http.tokenPath()} 已删除`));
}

/** 读口令。不回显，免得留在终端和录屏里。 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (ch) => {
      // 回车/换行/Ctrl-C 之外的按键都不回显
      if (['\n', '\r', '', ''].includes(ch.toString('utf8'))) {
        process.stdin.removeListener('data', onData);
      }
    };
    rl.output.write(question);
    rl._writeToOutput = () => {}; // 屏蔽 readline 自己的回显
    process.stdin.on('data', onData);
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

async function cmdCheck({ flags, positional }) {
  const media = collectMedia(flags);
  const r = await http.post('/api/admin/entry', {
    rule: positional[0] ?? str(flags.rule),
    date: positional[1] ?? str(flags.date),
    period: str(flags.period),
    note: str(flags.note),
    media,
  });

  if (r.created) console.log(green('✓ 打卡成功'), bold(r.rule.title), dim(`· ${r.period}`));
  else console.log(green('✓ 已更新记录'), dim(`${r.rule.title} · ${r.period}`));

  if (!r.hasMedia) console.log(yellow('! 没有附证明'), dim('——朋友质疑时你拿不出证据。用 --img / --douyin 补上。'));
}

async function cmdViolate({ flags, positional }) {
  const r = await http.post('/api/admin/claim', {
    rule: positional[0] ?? str(flags.rule),
    date: positional[1] ?? str(flags.date),
    claimant: str(flags.to) ?? str(flags.claimant),
    amount: flags.amount !== undefined ? Number(flags.amount) : undefined,
    note: str(flags.note),
  });
  console.log(red(`✗ ${r.rule.title}`), dim(`· ${r.claim.period}`));
  console.log(`  已发 ${bold(`¥${r.claim.amount}`)} 给 ${bold(r.claim.claimant)}`);
}

const cmdClaim = cmdViolate;

async function cmdExempt({ flags, positional }) {
  const date = positional[0] ?? str(flags.date);
  const reason = positional.slice(1).join(' ') || str(flags.reason);
  const remove = Boolean(flags.remove || flags.rm);

  const r = await http.post('/api/admin/exemption', { date, reason, remove });
  if (remove) {
    return console.log(r.removed
      ? green(`✓ 已移除 ${r.date} 的豁免`) : yellow(`${r.date} 本来就没有手动豁免`));
  }
  console.log(green('✓ 已豁免'), bold(r.date), dim(`· ${r.reason}`));
}

async function cmdMetric({ flags, positional }) {
  const key = positional[0] ?? str(flags.key);

  if (!key) {
    const { metrics } = await http.snapshot();
    if (!metrics.length) return console.log(dim('  还没有任何指标。bip metric <key> <value> 直接创建。'));
    for (const m of metrics) {
      const v = m.visibility === 'masked' ? mag('***') : (m.value ?? dim('—'));
      const tag = m.visibility === 'hidden' ? dim(' (站点隐藏)') : '';
      console.log(`  ${cyan(padTo(m.key, 12))} ${padTo(m.label, 8)} ${v} ${dim(m.unit || '')}${tag}`);
    }
    return;
  }

  const raw = positional[1] ?? flags.value;
  if (raw === undefined) return fail(`请给出数值：bip metric ${key} <value>`);

  const r = await http.post('/api/admin/metric', {
    key,
    value: raw,
    label: str(flags.label),
    unit: typeof flags.unit === 'string' ? flags.unit : undefined,
    visibility: str(flags.visibility),
    target: flags.target !== undefined ? flags.target : undefined,
    hint: typeof flags.hint === 'string' ? flags.hint : undefined,
  });

  const { metric, prev } = r;
  const delta = typeof prev === 'number' && typeof metric.value === 'number'
    ? ` (${metric.value > prev ? '+' : ''}${(metric.value - prev).toFixed(1)})` : '';
  console.log(green('✓'), bold(metric.label), `${prev ?? '—'} → ${bold(metric.value)}${dim(metric.unit || '')}${dim(delta)}`);
}

async function cmdRule({ flags, positional }) {
  const sub = positional[0];

  if (!sub || sub === 'list') {
    const { rules } = await http.snapshot();
    if (!rules.length) return console.log(dim('  库里还没有规则。bip rule add --id <id> --title "…"'));
    for (const r of rules) {
      const tag = r.active ? green('●') : dim('○');
      console.log(`${tag} ${bold(padTo(r.id, 18))} ${cyan(padTo(r.cadence, 8))} ${padTo("¥" + r.amount, 7)} ${r.title}`);
    }
    return;
  }

  if (sub === 'add') {
    const id = str(flags.id) ?? positional[1];
    if (!id) return fail('需要 --id');
    const body = { create: true, id };
    for (const k of ['title', 'short', 'cadence', 'type', 'proof', 'detail']) {
      if (flags[k] !== undefined) body[k] = flags[k];
    }
    if (flags.amount !== undefined) body.amount = flags.amount;
    if (flags.start !== undefined) body.startDate = flags.start;
    if (flags.holidayExempt !== undefined) body.holidayExempt = flags.holidayExempt !== 'false';
    const saved = await http.post('/api/admin/rule', body);
    return console.log(green('✓ 已新增规则'), bold(saved.id));
  }

  const ref = positional[1];
  if (!ref) return fail(`需要规则名：bip rule ${sub} <rule>`);

  if (sub === 'off' || sub === 'disable') {
    const saved = await http.post('/api/admin/rule/toggle', { id: ref, active: false });
    return console.log(yellow('○ 已停用'), bold(saved.id));
  }
  if (sub === 'on' || sub === 'enable') {
    const saved = await http.post('/api/admin/rule/toggle', { id: ref, active: true });
    return console.log(green('● 已启用'), bold(saved.id));
  }
  if (sub === 'set') {
    const patch = { id: ref };
    for (const [k, v] of Object.entries(flags)) {
      if (k === 'id') continue; // id 是主键，不给改
      patch[k] = v;
    }
    if (Object.keys(patch).length === 1) return fail('没有要改的字段');
    const saved = await http.post('/api/admin/rule', patch);
    return console.log(green('✓ 已更新'), bold(saved.id));
  }
  if (sub === 'rm' || sub === 'delete') {
    if (!flags.yes && !flags.y) {
      return fail(`删规则会连它的打卡和赔付一起删掉。确认就加 --yes：\n  bip rule rm ${ref} --yes`);
    }
    const r = await http.del(`/api/admin/rule/${encodeURIComponent(ref)}`);
    return console.log(red('✗ 已删除规则'), bold(r.rule.id),
      dim(`· 连带 ${r.removedEntries} 条打卡、${r.removedClaims} 笔赔付`));
  }
  fail(`未知子命令：${sub}（list / add / set / on / off / rm）`);
}

/* ---------- status：终端里的缺口总览 ---------- */
async function cmdStatus({ flags }) {
  const snap = await http.snapshot();
  const rules = snap.rules.filter((r) => r.active);
  const { entries, claims, calendar: cal } = snap;
  const today = todayKey();
  const windowDays = Number(flags.days ?? snap.settings?.claimWindowDays ?? 30);

  console.log();
  console.log(bold('  BUILD IN PUBLIC'), dim(`· ${today} · 滚动 ${windowDays} 天窗口`));
  console.log();

  if (!rules.length) {
    console.log(dim('  库里还没有启用的规则。'), yellow('bip rule add --id <id> --title "…"'));
    console.log();
    return;
  }

  let totalOpen = 0, totalOpenAmount = 0;

  for (const rule of rules) {
    if (rule.cadence === 'event') {
      const mine = claims.filter((c) => c.ruleId === rule.id);
      const sum = mine.reduce((a, c) => a + c.amount, 0);
      console.log(`  ${bold(padTo(rule.title, 18))} ${dim('事件')}  被抓 ${mine.length} 次  已付 ${red(`¥${sum}`)}`);
      continue;
    }

    // 用跟站点完全相同的判定：shared/domain.mjs
    const slots = buildSlots(rule, entries, claims, cal, {
      today,
      claimWindowDays: windowDays,
      settleHour: SETTLE_HOUR,
      nowHour: new Date().getHours(),
    });
    const s = summarize(rule, slots, claims);
    const open = slots.filter((x) => x.status === 'open').map((x) => x.period);
    const exempt = slots.filter((x) => x.status === 'exempt').length;
    const claimed = slots.filter((x) => x.status === 'claimed').length;
    const expired = slots.filter((x) => x.status === 'expired').length;

    totalOpen += s.openCount;
    totalOpenAmount += s.openAmount;

    const rate = Math.round(s.keepRate * 100);
    const bar = (() => {
      const n = 20, f = Math.round((rate / 100) * n);
      return green('█'.repeat(f)) + dim('░'.repeat(n - f));
    })();

    console.log(`  ${bold(padTo(rule.title, 18))} ${cyan(padTo(rule.cadence, 8))} ${bar} ${String(rate).padStart(3)}%`);
    console.log(`  ${" ".repeat(18)} 守约 ${green(s.keptCount)}  豁免 ${dim(exempt)}  已赔 ${red(claimed)}  作废 ${dim(expired)}`);
    if (open.length) {
      console.log(`  ${" ".repeat(18)} ${red(`⚠ ${open.length} 个缺口可被领取 ¥${s.openAmount}`)}`);
      console.log(`  ${" ".repeat(18)} ${dim(open.slice(-12).join('  '))}${open.length > 12 ? dim(' …') : ''}`);
    }
    console.log();
  }

  const paid = claims.reduce((a, c) => a + c.amount, 0);
  console.log(dim('  ─'.repeat(28)));
  console.log(`  已赔付 ${bold(red(`¥${paid}`))}   敞口 ${bold(totalOpen ? red(`¥${totalOpenAmount}`) : green('¥0'))} ${dim(`(${totalOpen} 个缺口)`)}`);
  console.log();
  if (totalOpen) console.log(yellow(`  补记录：bip check <rule> <date> --img <url>`));
  console.log();
}

/* ---------- today：今天还差什么 ---------- */
async function cmdToday() {
  const { rules, entries } = await http.snapshot();
  const checkins = rules.filter((r) => r.active && r.type === 'checkin');
  const today = todayKey();
  console.log();
  if (!checkins.length) console.log(dim('  今天没有需要打卡的规则。'));
  for (const rule of checkins) {
    const period = periodKeyFor(rule.cadence, today);
    const done = entries.some((e) => e.ruleId === rule.id && e.period === period);
    console.log(`  ${done ? green('✓') : red('○')} ${bold(padTo(rule.title, 18))} ${dim(period)}${done ? '' : red(`  ← ¥${rule.amount}`)}`);
  }
  console.log();
}

function cmdBuild() {
  console.log(dim('构建中…'));
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  console.log(green('✓ 构建完成'), dim('dist/'));
}

function fail(msg) {
  console.error(red('✗ ') + msg);
  process.exitCode = 1;
}

const HELP = `
${bold('bip')} ${dim('— build-in-public')}  ${dim(`→ ${http.BASE}`)}

  ${cyan('bip login')} ${dim('[口令]')}                        登录（口令存 ~/.bip-token）
  ${cyan('bip logout')}                                删掉本机口令

  ${cyan('bip today')}                                 今天还差哪些打卡
  ${cyan('bip status')} ${dim('[--days 30]')}                   全部规则的守约率与缺口

  ${cyan('bip check')} <rule> [date] ${dim('[--img U] [--douyin U] [--note "…"]')}
      打卡。date 支持 YYYY-MM-DD / MM-DD / today / yesterday / -3
      ${dim('例：bip check 早起 --img https://…/wake.jpg')}
      ${dim('例：bip check wake-0800 10-05 --douyin https://v.douyin.com/xxx')}

  ${cyan('bip violate')} <rule> [date] ${dim('--to <朋友> [--amount N] [--note "…"]')}
      记一笔违约赔付（朋友已领钱）。别名：bip claim
      ${dim('例：bip violate 早起 yesterday --to 老王')}
      ${dim('例：bip violate no-cry --to 小李')}

  ${cyan('bip metric')} ${dim('[key] [value] [--label 名] [--unit kg] [--visibility public|masked|hidden] [--target N] [--hint "…"]')}
      查看/更新身体与人物指标（自动留存历史，不存在则创建）
      ${dim('例：bip metric weight 67.8')}

  ${cyan('bip exempt')} <date> [理由] ${dim('[--rm]')}       手动豁免某天
  ${cyan('bip rule')} list|add|set|on|off|rm ${dim('[…]')}    管理规则
  ${cyan('bip build')}                                 构建静态站到 dist/

${dim('网页后台：')}${cyan(`${http.BASE}/admin`)}${dim('（同一套数据和校验）')}
${dim('指向别处：BIP_API=http://127.0.0.1:8787 bip status')}
`;

const COMMANDS = {
  login: cmdLogin, logout: cmdLogout,
  today: cmdToday, status: cmdStatus, check: cmdCheck, violate: cmdViolate,
  claim: cmdClaim, metric: cmdMetric, exempt: cmdExempt, rule: cmdRule, build: cmdBuild,
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return console.log(HELP);
  const fn = COMMANDS[cmd];
  if (!fn) { fail(`未知命令：${cmd}`); return console.log(HELP); }
  try {
    await fn(parseArgs(rest));
  } catch (err) {
    if (err instanceof ApiError) fail(err.message);
    else fail(err.message);
  }
}

main();
