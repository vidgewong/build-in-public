import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../lib/hooks';

/**
 * 2.5D 人像检视。
 *
 * 一张抠好的人像 + 一张深度图，用视差遮蔽映射（POM）在片元着色器里
 * 按视线方向逐层步进采样，近处（鼻梁、肩线）位移大、远处位移小，
 * 于是正面小幅摆动时能读出体积感——不做 360° 旋转，超过 ±15° 深度图就会穿帮。
 *
 * 深度图还顺便当法线用：有限差分出梯度，做一道跟着指针走的轮廓光。
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
uniform vec2 uFit;       // contain 适配：把裁剪空间映射回贴图空间
void main() {
  vec2 p = aPos * uFit;
  // y 翻转：vUv.y = 0 对应贴图第一行（图像顶部）
  vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

varying vec2 vUv;

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2  uPointer;   // -1..1，已做缓动
uniform float uBob;       // 呼吸起伏
uniform float uTime;
uniform float uReveal;    // 入场扫描进度 0 -> 1.2
uniform float uScale;     // 视差强度
uniform vec3  uRim;       // 轮廓光颜色
uniform float uMotion;    // 0 = 降级为静帧

float depthAt(vec2 uv) {
  return texture2D(uDepth, clamp(uv, 0.0, 1.0)).r;
}

void main() {
  // contain 适配后画布可能比贴图大，超出部分直接丢弃
  if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;

  vec2 uv = vUv + vec2(0.0, uBob);

  // —— 视差遮蔽映射：沿视线方向步进，找到第一个与高度场相交的层
  const int STEPS = 20;
  float layer = 1.0 / float(STEPS);
  vec2 dir = uPointer * uScale;
  vec2 dUV = dir * layer;

  vec2 cur = uv;
  float curLayer = 0.0;
  float d = 1.0 - depthAt(cur);

  for (int i = 0; i < STEPS; i++) {
    if (curLayer >= d) break;
    cur -= dUV;
    d = 1.0 - depthAt(cur);
    curLayer += layer;
  }

  vec4 c = texture2D(uColor, clamp(cur, 0.0, 1.0));
  if (c.a < 0.004) discard;

  vec3 col = c.rgb;

  // —— 从深度图差分出法线，做塑形光 + 轮廓光
  float e = 0.0035;
  float dx = depthAt(cur + vec2(e, 0.0)) - depthAt(cur - vec2(e, 0.0));
  float dy = depthAt(cur + vec2(0.0, e)) - depthAt(cur - vec2(0.0, e));
  vec3 n = normalize(vec3(-dx * 2.2, -dy * 2.2, 1.0));

  vec3 L = normalize(vec3(uPointer.x * 0.9 + 0.35, -uPointer.y * 0.9 + 0.45, 0.95));
  float diff = max(dot(n, L), 0.0);
  float rim  = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);

  col += col * diff * 0.30;                 // 顺光处提亮，强化起伏
  col *= 1.0 - (1.0 - diff) * 0.16;         // 背光处压暗
  col += uRim * rim * 0.55;                 // 边缘镀金

  // —— 入场：一道金线自上而下扫过，扫过处显形
  float reveal = smoothstep(uReveal, uReveal - 0.16, uv.y);
  float front  = smoothstep(0.022, 0.0, abs(uv.y - uReveal)) * step(uReveal, 1.0);
  col += uRim * front * 0.9;

  // —— 常驻扫描线
  float sy = fract(uTime * 0.085);
  float band = smoothstep(0.010, 0.0, abs(vUv.y - sy));
  col += uRim * band * 0.30 * uMotion;

  // —— 脚下渐隐，避免半身像被硬切出一条边
  float fade = smoothstep(1.0, 0.82, vUv.y);

  gl_FragColor = vec4(col, c.a * fade * reveal);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[ParallaxFigure] shader:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`load failed: ${src}`));
    im.src = src;
  });
}

/** 读 --gold，转成 0..1 的 rgb */
function readRim(el: Element): [number, number, number] {
  const raw = getComputedStyle(el).getPropertyValue('--gold').trim();
  const hex = raw.replace('#', '');
  if (hex.length !== 6) return [0.83, 0.66, 0.31];
  const v = parseInt(hex, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export default function ParallaxFigure({
  src,
  depthSrc,
  alt,
  className = '',
  scale = 0.038,
}: {
  src: string;
  depthSrc: string;
  alt: string;
  className?: string;
  /** 视差强度。0.038 约等于正负 10 度的视线偏移 */
  scale?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);

  // 动效偏好放进 ref：它变化时只需下一帧读到新值，不必重建 WebGL 上下文
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let disposed = false;
    let raf = 0;
    let cleanupFns: Array<() => void> = [];

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) {
      console.error('[ParallaxFigure] WebGL 上下文创建失败');
      setFailed(true);
      return;
    }

    (async () => {
      let color: HTMLImageElement, depth: HTMLImageElement;
      try {
        [color, depth] = await Promise.all([loadImage(src), loadImage(depthSrc)]);
      } catch (err) {
        console.error('[ParallaxFigure] 贴图加载失败', err);
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed) return;

      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      const prog = gl.createProgram();
      if (!vs || !fs || !prog) {
        console.error('[ParallaxFigure] shader 编译失败');
        setFailed(true);
        return;
      }
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[ParallaxFigure] link:', gl.getProgramInfoLog(prog));
        setFailed(true);
        return;
      }
      gl.useProgram(prog);

      // 全屏三角形带
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const mkTex = (img: HTMLImageElement, unit: number) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        return t;
      };
      mkTex(color, 0);
      mkTex(depth, 1);
      gl.uniform1i(gl.getUniformLocation(prog, 'uColor'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'uDepth'), 1);

      const uPointer = gl.getUniformLocation(prog, 'uPointer');
      const uBob = gl.getUniformLocation(prog, 'uBob');
      const uTime = gl.getUniformLocation(prog, 'uTime');
      const uReveal = gl.getUniformLocation(prog, 'uReveal');
      const uScale = gl.getUniformLocation(prog, 'uScale');
      const uRim = gl.getUniformLocation(prog, 'uRim');
      const uMotion = gl.getUniformLocation(prog, 'uMotion');
      const uFit = gl.getUniformLocation(prog, 'uFit');

      const imgAspect = color.naturalWidth / color.naturalHeight;

      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      gl.uniform1f(uScale, scale);
      gl.uniform3fv(uRim, readRim(document.documentElement));

      // 主题切换时换轮廓光颜色
      const mo = new MutationObserver(() => {
        gl.useProgram(prog);
        gl.uniform3fv(uRim, readRim(document.documentElement));
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      cleanupFns.push(() => mo.disconnect());

      // 画布按 CSS 尺寸 × DPR 同步
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(wrap.clientWidth * dpr));
        const h = Math.max(1, Math.round(wrap.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
        // contain：画布比贴图宽就横向留白，反之纵向留白
        const canvasAspect = w / h;
        gl.useProgram(prog);
        if (canvasAspect > imgAspect) {
          gl.uniform2f(uFit, canvasAspect / imgAspect, 1);
        } else {
          gl.uniform2f(uFit, 1, imgAspect / canvasAspect);
        }
      };
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      cleanupFns.push(() => ro.disconnect());
      resize();

      // 指针：相对画面中心归一化，离得远就回正
      let tx = 0, ty = 0, cx = 0, cy = 0;
      const onMove = (e: PointerEvent) => {
        const r = wrap.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        const far = Math.max(Math.abs(nx), Math.abs(ny)) > 1.8;
        tx = far ? 0 : Math.max(-1, Math.min(1, nx));
        ty = far ? 0 : Math.max(-1, Math.min(1, ny));
      };
      const onLeaveWindow = () => { tx = 0; ty = 0; };
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeaveWindow);
      cleanupFns.push(() => {
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerleave', onLeaveWindow);
      });

      // 只在进入视口时跑 RAF
      let visible = true;
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, {
        threshold: 0.01,
      });
      io.observe(wrap);
      cleanupFns.push(() => io.disconnect());

      const t0 = performance.now();
      const draw = (now: number) => {
        raf = requestAnimationFrame(draw);
        if (!visible) return;

        const t = (now - t0) / 1000;
        const quiet = reducedRef.current;
        if (quiet) {
          cx = 0; cy = 0;
        } else {
          cx += (tx - cx) * 0.055;
          cy += (ty - cy) * 0.055;
        }
        const bob = quiet ? 0 : Math.sin(t / 1.9) * 0.0045;

        gl.useProgram(prog);
        gl.uniform2f(uPointer, cx, cy);
        gl.uniform1f(uBob, bob);
        gl.uniform1f(uTime, t);
        gl.uniform1f(uMotion, quiet ? 0 : 1);
        gl.uniform1f(uReveal, quiet ? 2 : Math.min(2, t / 1.1));
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      raf = requestAnimationFrame(draw);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanupFns.forEach((fn) => fn());
      cleanupFns = [];
      // 这里刻意不调 loseContext()：StrictMode 下 effect 会挂载→卸载→再挂载，
      // 上下文一旦销毁，第二次挂载时同一个 canvas 上 getContext 拿回的就是
      // 那个已失效的上下文，绘制全部静默失败，画面只剩静态兜底图。
    };
  }, [src, depthSrc, scale]);

  return (
    <div className={`pfig ${className}`} ref={wrapRef}>
      {failed ? (
        <img className="pfig-fallback" src={src} alt={alt} />
      ) : (
        <canvas className="pfig-canvas" ref={canvasRef} role="img" aria-label={alt} />
      )}
    </div>
  );
}
