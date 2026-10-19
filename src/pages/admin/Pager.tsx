import { useState } from 'react';

/** 客户端分页。删除后页数变少时自动夹回最后一页，不会停在空页上。 */
export function usePaged<T>(items: T[], size = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, pages - 1);
  return {
    rows: items.slice(cur * size, cur * size + size),
    pager: { page: cur, pages, total: items.length, size, onPage: setPage },
  };
}

interface PagerProps {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
}

export default function Pager({ page, pages, total, size, onPage }: PagerProps) {
  if (pages <= 1) return null;
  const from = page * size + 1;
  const to = Math.min(total, (page + 1) * size);

  return (
    <div className="admin-pager">
      <button type="button" className="admin-btn is-small" disabled={page === 0} onClick={() => onPage(page - 1)}>
        上一页
      </button>
      <span className="admin-pager-info mono">
        {from}–{to} / {total}
      </span>
      <button
        type="button"
        className="admin-btn is-small"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
