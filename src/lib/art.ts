export interface ArtPiece {
  src: string;
  w: number;
  h: number;
  alt: string;
  cap: string;
}

/** 四张博物馆公有领域（CC0）藏品图，来源见 FOOT_CREDIT */
export const ART = {
  ledger: {
    src: '/art/ledger.jpg',
    w: 1200,
    h: 1600,
    alt: '一本大理石纹封面的旧账簿，合上放着',
    cap: '账簿，John Carlin，1835–56',
  },
  scale: {
    src: '/art/scale.jpg',
    w: 1600,
    h: 1200,
    alt: '一台黄铜天平，两只秤盘悬在横梁两端',
    cap: '天平，Henry N. Hooper and Company，约 1845–55',
  },
  watch: {
    src: '/art/watch.jpg',
    w: 1600,
    h: 1493,
    alt: '一枚打开表盖的旧怀表，露出表盘与指针',
    cap: '怀表，Robert Roskell，1820–21',
  },
  hourglass: {
    src: '/art/hourglass.jpg',
    w: 1016,
    h: 1600,
    alt: '一只木框沙漏，上半部的沙正在漏下',
    cap: '沙漏，18 世纪',
  },
  sundial: {
    src: '/art/sundial.jpg',
    w: 1400,
    h: 1390,
    alt: '一座黄铜日晷，晷盘上刻着时辰',
    cap: '日晷，Goldsmith Chandlee，约 1800',
  },
  purse: {
    src: '/art/purse.jpg',
    w: 1173,
    h: 1600,
    alt: '一只用玻璃珠和丝线缝成的旧钱袋',
    cap: '钱袋，美国，1830–50',
  },
} satisfies Record<string, ArtPiece>;

export const FOOT_CREDIT =
  '图片：The Metropolitan Museum of Art 公开藏品（CC0）——账簿 John Carlin；天平 Henry N. Hooper and Company；怀表 Robert Roskell；沙漏，18 世纪；日晷 Goldsmith Chandlee；钱袋，美国，1830–50。';
