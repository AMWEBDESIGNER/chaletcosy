/* ============================================================
   L'atmosphère du hero.

   La photographie du bassin ne bouge pas — c'est une image fixe. On la
   repeint donc dans un canevas WebGL où trois choses très lentes se
   superposent : l'eau qui ondule, la lumière qui dérive, et un grain qui
   vit. Rien de spectaculaire, et c'est voulu : à l'amplitude choisie
   (deux à trois pixels) on ne voit pas l'effet, on voit seulement que la
   page a cessé d'être figée.

   Aucune bibliothèque. Deux nuanceurs, un quadrilatère, une texture — le
   strict minimum que réclame l'API. Le tout fait moins de 7 Ko.

   ⚠️ Le canevas se pose PAR-DESSUS l'image, il ne la remplace pas :
   `<img>` reste l'élément que mesure le LCP, et il peint le premier.
   Le canevas n'apparaît qu'une fois sa texture prête. Tout ce qui suit
   est un supplément — sans WebGL, sans JS, ou en mouvement réduit, il
   ne se passe rien du tout et la photographie s'affiche telle quelle.
   ============================================================ */
import { onFrame, lerp, type Cleanup } from './raf';

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/* `cover` est refait ici parce que la texture ignore la mise en page : le
   canevas occupe le cadre, l'image a son propre rapport, il faut recadrer
   comme le ferait `object-fit: cover`.

   L'ondulation est une somme de deux sinus de périodes premières entre
   elles — leur battement ne se referme jamais, si bien qu'aucune boucle
   n'est perceptible. Le déplacement est plus fort en bas qu'en haut :
   c'est là qu'est l'eau. */
const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 res;
uniform vec2 img;
uniform vec2 pointer;
uniform float time;
uniform float amount;

float grain(vec2 c) {
  return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Recadrage « cover ».
  float rs = res.x / res.y, ri = img.x / img.y;
  vec2 s = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
  vec2 t = (uv - 0.5) / s + 0.5;

  // L'ondulation : plus ample vers le bas du cadre, là où est le bassin.
  float depth = smoothstep(0.05, 1.0, 1.0 - t.y);
  float w = sin(t.x * 11.0 + time * 0.28) * 0.5
          + sin(t.y * 17.0 - time * 0.19) * 0.5;
  vec2 wave = vec2(w * 0.0016, sin(t.x * 7.0 + time * 0.23) * 0.0011) * depth;

  // Le curseur creuse très légèrement l'image autour de lui.
  vec2 d = t - pointer;
  float pull = exp(-dot(d, d) * 9.0) * 0.004;

  vec3 col = texture2D(tex, t + (wave - d * pull) * amount).rgb;

  // La lumière respire : ±2 % sur une période de vingt secondes.
  col *= 1.0 + sin(time * 0.31) * 0.02 * amount;

  // Grain animé — la même densité que le grain fixe du calque CSS.
  col += (grain(uv * res + time) - 0.5) * 0.035 * amount;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

export function initAtmosphere(reduce: boolean): Cleanup {
  const host = document.querySelector<HTMLElement>('[data-atmosphere]');
  if (!host || reduce) return () => {};

  const img = host.querySelector<HTMLImageElement>('img');
  const canvas = host.querySelector<HTMLCanvasElement>('canvas');
  if (!img || !canvas) return () => {};

  /* `preserveDrawingBuffer: false` et `antialias: false` : on ne relit
     jamais le tampon et l'image n'a pas d'arête à lisser. */
  const gl = (canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power',
  }) || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return () => {};

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return () => {};

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, 'res'),
    img: gl.getUniformLocation(prog, 'img'),
    pointer: gl.getUniformLocation(prog, 'pointer'),
    time: gl.getUniformLocation(prog, 'time'),
    amount: gl.getUniformLocation(prog, 'amount'),
  };

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let ready = false;
  const upload = () => {
    if (!img.naturalWidth) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    } catch {
      return; // texture souillée (image d'une autre origine) — on renonce
    }
    gl.uniform2f(u.img, img.naturalWidth, img.naturalHeight);
    ready = true;
    host.classList.add('is-live');
  };

  /* Un pixel par point suffit : l'effet est un déplacement de deux à trois
     pixels, personne ne compte les siens dessus, et un plein écran à deux
     fois la densité quadruple le coût pour rien. */
  let w = 0, h = 0;
  const resize = () => {
    const r = host.getBoundingClientRect();
    const nw = Math.round(r.width), nh = Math.round(r.height);
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.res, w, h);
  };

  if (img.complete) upload();
  else img.addEventListener('load', upload, { once: true });

  // Le curseur en coordonnées de texture, rejoint avec retard.
  let px = 0.5, py = 0.5, tx = 0.5, ty = 0.5;
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    tx = (e.clientX - r.left) / r.width;
    ty = 1 - (e.clientY - r.top) / r.height;
  };
  addEventListener('pointermove', move, { passive: true });

  const t0 = performance.now();
  const stop = onFrame((now) => {
    if (!ready) return;
    resize();
    // Hors champ, plus rien à peindre : le hero passé, on rend la machine.
    if (host.getBoundingClientRect().bottom < 0) return;

    px = lerp(px, tx, 0.05);
    py = lerp(py, ty, 0.05);
    gl.uniform2f(u.pointer, px, py);
    gl.uniform1f(u.time, (now - t0) / 1000);
    // La vidéo qui prend le relais recouvre tout : l'effet s'éteint avec elle.
    gl.uniform1f(u.amount, host.classList.contains('is-yielded') ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });

  return () => {
    stop();
    removeEventListener('pointermove', move);
    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    host.classList.remove('is-live');
  };
}
