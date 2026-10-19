/**
 * 图片存储。目前落在本机磁盘，由 API 自己对外提供（GET /api/media/:key）。
 *
 * 想把图片挪到别的机器（比如带宽更高的 8.133.183.189），只改这个文件：
 * 换掉下面五个函数的实现，库里存的始终是 key 而不是完整 URL，
 * 前端拼地址只在 src/lib/media.ts 一处。
 */

import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = process.env.BIP_UPLOAD_DIR
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');

/** 只接受自己生成的文件名。这条正则同时是防路径穿越的唯一关卡，别放宽。 */
const KEY_RE = /^[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
export const isKey = (k) => typeof k === 'string' && KEY_RE.test(k);

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export const contentTypeOf = (key) => TYPES[key.split('.').pop()];

/** 看文件头判断真实格式，不信客户端报的 Content-Type，也不信文件名 */
export function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const head = buf.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
  return null;
}

export async function saveImage(buf) {
  const ext = sniff(buf);
  if (!ext) return null;
  await mkdir(DIR, { recursive: true });
  const key = `${randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(path.join(DIR, key), buf, { flag: 'wx' });
  return key;
}

export async function hasImage(key) {
  if (!isKey(key)) return false;
  try {
    return (await stat(path.join(DIR, key))).isFile();
  } catch {
    return false;
  }
}

/** 读取用：返回 { size, stream }，不存在返回 null */
export async function openImage(key) {
  if (!isKey(key)) return null;
  const file = path.join(DIR, key);
  try {
    const s = await stat(file);
    if (!s.isFile()) return null;
    return { size: s.size, stream: createReadStream(file) };
  } catch {
    return null;
  }
}

export async function removeImage(key) {
  if (!isKey(key)) return;
  try {
    await unlink(path.join(DIR, key));
  } catch {
    /* 已经不在了 */
  }
}

export const uploadDir = () => DIR;
