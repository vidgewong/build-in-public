/**
 * 证明图片的地址只在这里拼。
 * 现在图片由 API 同域提供；以后挪到别的机器，只改 MEDIA_BASE（或这个函数），
 * 库里存的一直是 key，不用迁移数据。
 */
const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE ?? `${import.meta.env.VITE_API_BASE ?? ''}/api/media`;

export const mediaUrl = (key: string) => `${MEDIA_BASE}/${encodeURIComponent(key)}`;

/**
 * nginx 默认请求体上限 1MB（线上给上传接口放宽到 15MB，但没放宽之前也不该炸），
 * 所以压到这个线以下，宁可画质略降。
 */
const TARGET_BYTES = 900 * 1024;

/**
 * 上传前压一下。手机截图/照片动辄 3–8MB，转账截图缩到长边 1800px 看得一样清楚，
 * 体积小一个量级，访客在手机上点开也快。
 * GIF 不动（会丢动画）；已经够小的原图也不动；任何一步失败都退回原文件，不阻塞上传。
 */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.size <= TARGET_BYTES) return file;
  try {
    const bmp = await createImageBitmap(file);
    let best: Blob | null = null;
    // 先降画质，再缩尺寸，直到进了目标线
    for (const [edge, q] of [[1800, 0.85], [1800, 0.7], [1400, 0.7], [1100, 0.65], [800, 0.6]] as const) {
      const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      // 透明 PNG 转 JPEG 会变黑底，先铺白
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      best = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (best && best.size <= TARGET_BYTES) break;
    }
    bmp.close();
    return best && best.size < file.size ? best : file;
  } catch {
    return file;
  }
}
