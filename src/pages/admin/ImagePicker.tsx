import { useRef, useState } from 'react';
import { adminApi } from '../../lib/admin-api';
import { mediaUrl, prepareImage } from '../../lib/media';

/**
 * 选图并立刻上传，拿到 key 列表。
 * 受控：父组件持有 keys，这里只负责「加」和「删」。
 * 上传是即时的（不等表单提交），所以记账失败时图已经在服务器上了——
 * 这是有意的：手机上重传一张大截图比重试一次提交贵得多，孤儿文件只占几百 KB。
 */
export default function ImagePicker({
  keys,
  onChange,
  onError,
  onRemove,
}: {
  keys: string[];
  onChange: (next: string[]) => void;
  onError: (msg: string) => void;
  /** 给了就由父组件决定「删」要做什么（比如调接口），否则只是从列表里去掉 */
  onRemove?: (key: string) => void;
}) {
  const [busy, setBusy] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: string[] = [];
    setBusy((n) => n + files.length);
    for (const f of Array.from(files)) {
      try {
        if (!f.type.startsWith('image/')) throw new Error(`${f.name} 不是图片`);
        const { key } = await adminApi.upload(await prepareImage(f));
        added.push(key);
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) onChange([...keys, ...added]);
    // 清掉，不然连续选同一张图不会再触发 change
    if (input.current) input.current.value = '';
  };

  return (
    <div className="admin-thumbs">
      {keys.map((k) => (
        <div className="admin-thumb" key={k}>
          <a href={mediaUrl(k)} target="_blank" rel="noreferrer noopener">
            <img src={mediaUrl(k)} alt="证明" />
          </a>
          <button
            type="button"
            className="admin-thumb-x"
            aria-label="移除这张图"
            onClick={() => (onRemove ? onRemove(k) : onChange(keys.filter((x) => x !== k)))}
          >
            ✕
          </button>
        </div>
      ))}
      {busy > 0 && <div className="admin-thumb is-busy" aria-label="上传中" />}
      <label className="admin-upload" title="选择图片">
        +
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void pick(e.target.files)}
        />
      </label>
    </div>
  );
}
