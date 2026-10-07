#!/usr/bin/env node
/**
 * 生成 admin 口令哈希和会话密钥。
 *
 *   node deploy/gen-admin-secret.mjs              随机生成口令
 *   node deploy/gen-admin-secret.mjs "我的口令"     用指定口令
 *
 * 输出贴进服务器的 /etc/bip-api.env（权限 600），然后重启 bip-api。
 * 口令本身只在这里显示一次，存进密码管理器，服务器上只留哈希。
 */

import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/auth.mjs';

const given = process.argv[2];
// 不自己造字符表：base64url 的 32 字节足够抗暴力，也好复制
const password = given || randomBytes(18).toString('base64url');
const hash = hashPassword(password);
const secret = randomBytes(32).toString('base64url');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log(`
${bold('口令')}（只显示这一次，存进密码管理器）：

    ${bold(password)}

${bold('服务器配置')} ${dim('→ /etc/bip-api.env（chmod 600）')}

BIP_ADMIN_HASH=${hash}
BIP_SESSION_SECRET=${secret}

${dim('写入后：sudo systemctl restart bip-api')}
${dim('本地调试：把上面两行 export 到当前 shell 再跑 npm run api')}
`);
