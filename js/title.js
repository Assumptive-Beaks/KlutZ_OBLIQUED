(() => {
  'use strict';

  // ==================================================================
  // 要素参照 / 基本状態
  // ==================================================================
  const titleScreen = document.querySelector('#titleScreen');
  const gameContainer = document.querySelector('.game-container');
  const view = document.querySelector('#titleView'), ui = document.querySelector('#titleUI');
  const v = view.getContext('2d'), u = ui.getContext('2d');
  const source = document.createElement('canvas'), s = source.getContext('2d', { willReadFrequently: true });

  const BASE_TILE = 8, CELL = 8, GRID = 128, WORLD_TILES = GRID / CELL;
  let zoom = 1; // 画面サイズ固定・等倍で表示する
  let VW = 0, VH = 0; // 実ウィンドウサイズ。resize()のたびに追従して更新する（下記resize参照）
  let dpr = 1, cam = { x: 0, y: 0 }, drag = null;
  let stateVersion = 0, lastSourceSig = null, cachedImageData = null, transitioning = false, running = true;
  let blankMode = false; // trueの間、文字を描かず斜線だけにする(ゲーム突入時用)。
                          // 外枠線はこのフラグに関係なく常に描く(frameOffsetの押し出しで見えなくなる。下記drawBoundaryFrame/prepareSource参照)
  let frameOffset = { x: 0, y: 0 }; // 外枠を画面外へ押し出す演出用のスクリーン座標オフセット(expelFrame参照)

  // 星の瞬きのような演出: グリッド上のセルをランダムに選び、斜線の向きを一瞬だけ逆にして戻す
  const twinkles = new Map(); // key: "col,row" -> { start, duration }
  let gridOx = 0, gridOy = 0, gridT = BASE_TILE, gridCols = 0, gridRows = 0, twinkleLoopRunning = false;

  // ==================================================================
  // グリフ生成（文字1つぶんのビットマップとセルの内訳をキャッシュ）
  // ※ レイアウト計算(widthOf)がインク幅を参照するため、レイアウトより前に定義する
  // ==================================================================
  function fitFontSize(ctx, ch, maxSize, maxWidth, bold) {
    const prefix = bold ? 'bold ' : '';
    let lo = 1, hi = Math.max(1, Math.floor(maxSize)), best = lo;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      ctx.font = `${prefix}${mid}px Arial`;
      if (ctx.measureText(ch).width <= maxWidth) { best = mid; lo = mid + 1 } else { hi = mid - 1 }
    }
    ctx.font = `${prefix}${best}px Arial`;
    return best;
  }

  const glyphCache = new Map();
  function getGlyph(ch) {
    if (glyphCache.has(ch)) return glyphCache.get(ch);
    const gscale = 32, size = WORLD_TILES * gscale, cv = document.createElement('canvas'), g = cv.getContext('2d');
    cv.width = cv.height = size;
    g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fontSize = fitFontSize(g, ch, size * .95, size * .85, false);
    g.strokeStyle = '#fff'; g.lineWidth = size * .03; g.lineJoin = 'round';
    g.strokeText(ch, size / 2, size / 2 + fontSize * .02);
    glyphCache.set(ch, cv); return cv;
  }

  const glyphCellsCache = new Map();
  function getGlyphCells(ch) {
    if (glyphCellsCache.has(ch)) return glyphCellsCache.get(ch);
    const glyph = getGlyph(ch), gctx = glyph.getContext('2d'), cellPx = glyph.width / WORLD_TILES;
    const data = gctx.getImageData(0, 0, glyph.width, glyph.height).data, cells = [];
    for (let r = 0; r < WORLD_TILES; r++) for (let c = 0; c < WORLD_TILES; c++) {
      let hasInk = false;
      for (let yy = 0; yy < cellPx && !hasInk; yy += 2) for (let xx = 0; xx < cellPx && !hasInk; xx += 2) {
        const px = ~~(c * cellPx + xx), py = ~~(r * cellPx + yy);
        if (data[(py * glyph.width + px) * 4] > 40) hasInk = true;
      }
      if (hasInk) cells.push(r + ',' + c);
    }
    glyphCellsCache.set(ch, cells); return cells;
  }

  // ==================================================================
  // タイトル文字のレイアウト（ワールド座標系での配置）
  // ==================================================================
  // 文字の送り幅は固定(等幅)にせず、実際に描画されるグリフのインク幅
  // (getGlyphCellsで判定済みのセル範囲)を基準に決める。等幅のままだと
  // 「I」のような細い文字の左右に余計な空白ができ、字間が間延びして見えるため。
  const CHAR_WIDTH = { ' ': 32, ',': 24, '.': 24 };
  const LETTER_GAP = 30; // インク幅に対して足す最小の文字間の空き（ワールド座標系）
  function inkWidthOf(ch) {
    const cells = getGlyphCells(ch);
    if (cells.length === 0) return WORLD_TILES * CELL;
    let minCol = WORLD_TILES, maxCol = -1;
    cells.forEach(key => {
      const c = Number(key.split(',')[1]);
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
    });
    return (maxCol - minCol + 1) * CELL;
  }
  function widthOf(ch) { return CHAR_WIDTH[ch] || (inkWidthOf(ch) + LETTER_GAP); }

  // 常に「KlutZ」改行「OBLIQUED」の2行を表示する。
  function buildTitleLines() {
    return [
      [...'KlutZ'].map(ch => ({ ch, w: widthOf(ch) })),
      [...'OBLIQUED'].map(ch => ({ ch, w: widthOf(ch) })),
    ];
  }

  // 行間（ワールド座標系）。文字の描画箱はGRID(128)四方なので、それより少し広めに取る
  const LINE_HEIGHT = 150;
  const LINES = buildTitleLines();
  const lineWidths = LINES.map(tokens => tokens.reduce((sum, t) => sum + t.w, 0));
  const CONTENT_WIDTH = Math.max(...lineWidths);
  const CONTENT_HEIGHT = (LINES.length - 1) * LINE_HEIGHT + GRID;

  // 各行を左揃えでworldLettersに展開
  const worldLetters = [];
  LINES.forEach((tokens, lineIdx) => {
    const y = (lineIdx - (LINES.length - 1) / 2) * LINE_HEIGHT;
    let cursorX = 0;
    tokens.forEach(({ ch, w }) => {
      const cx = cursorX + w / 2; cursorX += w;
      worldLetters.push({ ch, x: cx, y, cells: null, revealedCells: new Set() });
    });
  });

  const PADDING_X = 64, PADDING_Y = 64;
  const WORLD_MIN_X = -PADDING_X, WORLD_MAX_X = CONTENT_WIDTH + PADDING_X;
  const WORLD_MIN_Y = -(PADDING_Y + CONTENT_HEIGHT / 2), WORLD_MAX_Y = (PADDING_Y + CONTENT_HEIGHT / 2);
  function clampCamera() {
    cam.x = Math.max(WORLD_MIN_X, Math.min(WORLD_MAX_X, cam.x));
    cam.y = Math.max(WORLD_MIN_Y, Math.min(WORLD_MAX_Y, cam.y));
  }

  worldLetters.forEach(e => e.cells = getGlyphCells(e.ch));

  // ==================================================================
  // 座標変換 / リサイズ
  // ==================================================================
  function worldToScreen(x, y) { return { x: (x - cam.x) * zoom + VW / 2, y: (y - cam.y) * zoom + VH / 2 } }
  function inViewport(x, y) { const g = worldToScreen(x, y), half = GRID * zoom / 2; return g.x + half >= 0 && g.x - half <= VW && g.y + half >= 0 && g.y - half <= VH }
  // 外枠(タイトル全体を囲む矩形)の左上・右下をスクリーン座標で返す。
  // syncBodyStripePattern/drawBoundaryFrame/updateBoundaryFrameRegionで共用する。
  function frameScreenRect() { return { p1: worldToScreen(WORLD_MIN_X, WORLD_MIN_Y), p2: worldToScreen(WORLD_MAX_X, WORLD_MAX_Y) } }

  function resize() {
    if (!running) return;
    VW = innerWidth; VH = innerHeight; // 常に実際のウィンドウサイズに追従する（パズル画面の背景と同様、途切れないようにする）
    dpr = Math.min(devicePixelRatio || 1, 2);
    ui.width = Math.max(1, Math.round(VW * dpr)); ui.height = Math.max(1, Math.round(VH * dpr));
    [view, source].forEach(c => { c.width = Math.max(1, VW); c.height = Math.max(1, VH) });
    // view/uiのCSS表示サイズを内部解像度に固定し、中央寄せする
    // （style指定がないとウィンドウ幅いっぱいに引き伸ばされ、縦横比が崩れてしまう）
    [view, ui].forEach(c => {
      c.style.width = VW + 'px'; c.style.height = VH + 'px';
      c.style.position = 'fixed'; c.style.left = '50%'; c.style.top = '50%';
      c.style.transform = 'translate(-50%, -50%)';
    });
    v.imageSmoothingEnabled = true;
    zoom = 1;
    cam.x = CONTENT_WIDTH / 2; cam.y = 0;
    clampCamera();
    syncBodyStripePattern();
    render();
  }

  // パズル画面(body)の斜線背景を、タイトル画面のタイルパターンと同じ柄・同じ位相で描画する。
  // getTileBitmaps()で生成済みのタイル画像をそのままdata URL化して使うので、
  // CSS側で近似する場合と違ってズレが生じない。外枠線も、繰り返しなしの等身大レイヤーとして
  // 重ねて焼き込むが、その位置はframeOffsetの「呼ばれた時点の値」で決まる。enterGame()では
  // 外枠を画面外へ押し出し終えたあと(frameOffsetが画面外の値)にこの関数を呼ぶため、
  // パズル画面に入ったあとは外枠も画面外にあり、実際には斜線模様だけが残る(enterGame参照)。
  function syncBodyStripePattern() {
    if (VW <= 0 || VH <= 0) return;
    const t = BASE_TILE * zoom;
    const { black } = getTileBitmaps(zoom);
    const phaseX = (((VW / 2 - cam.x * zoom) % t) + t) % t;
    const phaseY = (((VH / 2 - cam.y * zoom) % t) + t) % t;

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = VW; frameCanvas.height = VH;
    const fctx = frameCanvas.getContext('2d');
    const { p1, p2 } = frameScreenRect();
    fctx.strokeStyle = '#fff'; fctx.lineWidth = t;
    fctx.strokeRect(p1.x + frameOffset.x, p1.y + frameOffset.y, p2.x - p1.x, p2.y - p1.y);

    document.body.style.backgroundImage = `url(${frameCanvas.toDataURL()}), url(${black.toDataURL()})`;
    document.body.style.backgroundSize = `${VW}px ${VH}px, ${t}px ${t}px`;
    document.body.style.backgroundRepeat = 'no-repeat, repeat';
    document.body.style.backgroundPosition = `0 0, ${phaseX}px ${phaseY}px`;
  }

  // ==================================================================
  // ソース描画（文字の反転具合を1オフスクリーンキャンバスに焼き込む）
  // ==================================================================
  function drawBoundaryFrame() {
    const { p1, p2 } = frameScreenRect();
    s.strokeStyle = '#fff'; s.lineWidth = BASE_TILE * zoom;
    s.strokeRect(p1.x + frameOffset.x, p1.y + frameOffset.y, p2.x - p1.x, p2.y - p1.y);
  }
  // expelFrame専用の軽量パス。外枠がframeOffsetの移動で描き直されたとき、画面全体を
  // prepareSource+computeBaseTilingで舐め直す代わりに、外枠のストロークが実際に触れた
  // 帯(旧位置・新位置それぞれの上下左右4辺、線幅ぶんの余裕込み)だけをupdateRegionTilingで
  // 再判定する。ストロークを黒(消す)→白(描く)の順で塗り直す都合上、アンチエイリアスの縁に
  // ごくわずかな残像が一瞬乗ることがあるが、遷移完了時には必ずstateVersion++を伴う完全な
  // 再計算が入る(enterGame参照)ため、最終的にbodyへ焼き込まれる状態には影響しない。
  function updateBoundaryFrameRegion(prevOffset) {
    const { p1, p2 } = frameScreenRect();
    const lw = BASE_TILE * zoom, pad = lw;

    const oldLeft = p1.x + prevOffset.x, oldTop = p1.y + prevOffset.y;
    const oldRight = p2.x + prevOffset.x, oldBottom = p2.y + prevOffset.y;
    const newLeft = p1.x + frameOffset.x, newTop = p1.y + frameOffset.y;
    const newRight = p2.x + frameOffset.x, newBottom = p2.y + frameOffset.y;

    s.lineWidth = lw;
    s.strokeStyle = '#000'; s.strokeRect(oldLeft, oldTop, oldRight - oldLeft, oldBottom - oldTop);
    s.strokeStyle = '#fff'; s.strokeRect(newLeft, newTop, newRight - newLeft, newBottom - newTop);

    const band = (minX, minY, maxX, maxY) =>
      updateRegionTiling(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
    const left = Math.min(oldLeft, newLeft), right = Math.max(oldRight, newRight);
    const top = Math.min(oldTop, newTop), bottom = Math.max(oldBottom, newBottom);
    band(left, Math.min(oldTop, newTop), right, Math.max(oldTop, newTop));           // 上辺
    band(left, Math.min(oldBottom, newBottom), right, Math.max(oldBottom, newBottom)); // 下辺
    band(Math.min(oldLeft, newLeft), top, Math.max(oldLeft, newLeft), bottom);       // 左辺
    band(Math.min(oldRight, newRight), top, Math.max(oldRight, newRight), bottom);   // 右辺
  }
  // 1文字ぶんのグリフのうち、1マス(r,c)を貼り付ける際の画面上のジオメトリを返す。
  // フル描画(drawWorldLetterSource)と1マスだけの差分描画(paintCell)の両方から使う。
  function letterCellGeom(e, key) {
    const glyph = getGlyph(e.ch), g = worldToScreen(e.x, e.y), size = WORLD_TILES * CELL * zoom;
    const cellPx = glyph.width / WORLD_TILES, cellSize = size / WORLD_TILES, ox = g.x - size / 2, oy = g.y - size / 2;
    const [r, c] = key.split(',').map(Number);
    return { glyph, sx: c * cellPx, sy: r * cellPx, cellPx, dx: ox + c * cellSize, dy: oy + r * cellSize, cellSize };
  }
  function drawWorldLetterSource(e) {
    e.cells.forEach(key => {
      if (!e.revealedCells.has(key)) return;
      const g = letterCellGeom(e, key);
      s.drawImage(g.glyph, g.sx, g.sy, g.cellPx, g.cellPx, g.dx, g.dy, g.cellSize, g.cellSize);
    });
  }
  // 1マスだけを反映(出現ならインク描画/消失なら黒塗り)し、変更が起きた画面矩形を返す。
  // 出現・消失アニメーションの差分更新(applyPendingChanges)から呼ばれ、戻り値の矩形は
  // 呼び出し側がupdateRegionTilingに渡してタイルの再判定に使う。
  function paintCell(e, key, reveal) {
    const g = letterCellGeom(e, key);
    if (reveal) s.drawImage(g.glyph, g.sx, g.sy, g.cellPx, g.cellPx, g.dx, g.dy, g.cellSize, g.cellSize);
    else { s.fillStyle = '#000'; s.fillRect(g.dx, g.dy, g.cellSize, g.cellSize); }
    return { x: g.dx, y: g.dy, w: g.cellSize, h: g.cellSize };
  }
  function prepareSource() {
    if (VW <= 0 || VH <= 0) return;
    s.resetTransform(); s.fillStyle = '#000'; s.fillRect(0, 0, VW, VH);
    if (!blankMode) worldLetters.forEach(e => { if (inViewport(e.x, e.y)) drawWorldLetterSource(e) });
    drawBoundaryFrame(); // 外枠は常に描く(blankModeでも消さない)
  }

  // ==================================================================
  // 斜線タイル（黒/mixedの2種のビットマップを生成しキャッシュ）
  // ==================================================================
  function addTileShape(path, x, y, size, kind) {
    const q = size / 4, bands = kind === 'black'
      ? [[[0, q], [3 * q, size], [q, size], [0, 3 * q]], [[q, 0], [size, 3 * q], [size, q], [3 * q, 0]]]
      : [[[q, 0], [3 * q, 0], [size, q], [size, 3 * q], [3 * q, size], [q, size], [0, 3 * q], [0, q]]];
    bands.forEach(points => { points.forEach(([px, py], i) => i ? path.lineTo(x + px, y + py) : path.moveTo(x + px, y + py)); path.closePath() });
  }
  const tileBitmapCache = {};
  function getTileBitmaps(z) {
    let e = tileBitmapCache[z]; if (e) return e;
    const t = BASE_TILE * z;
    const mk = kind => { const c = document.createElement('canvas'); c.width = t; c.height = t; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, t, t); const path = new Path2D(); addTileShape(path, 0, 0, t, kind); g.fillStyle = '#fff'; g.fill(path); return c };
    const black = mk('black'), mixed = document.createElement('canvas'); mixed.width = t; mixed.height = t;
    const mg = mixed.getContext('2d'); mg.translate(t / 2, t / 2); mg.rotate(Math.PI / 2); mg.drawImage(black, -t / 2, -t / 2);
    e = { black, mixed }; tileBitmapCache[z] = e; return e;
  }

  // ==================================================================
  // 本描画（ドット風ポストエフェクト + UIクリア + フレーム制御）
  // ==================================================================
  // 1マス(x,y)-(x+t,y+t)の中を数点サンプリングし、黒一色か模様入り(mixed)かを判定する。
  // computeBaseTiling(全面)とupdateRegionTiling(差分)の両方から使う。
  // 配列インデックスを[0, len)にクランプする(classifyTileMixedの境界処理で共用)
  function clampIndex(v, len) { return v < 0 ? 0 : v >= len ? len - 1 : v; }

  function classifyTileMixed(x, y, t, data, sw, sh) {
    const q1 = t * .25, q3 = t * .75;
    const xa = clampIndex(~~(x + q1), sw), xb = clampIndex(~~(x + q3), sw);
    const ya = clampIndex(~~(y + q1), sh), yb = clampIndex(~~(y + q3), sh);

    let min = data[ya * sw + xa], max = min;
    let b = data[ya * sw + xb]; if (b < min) min = b; if (b > max) max = b;
    if (min === 0 && max === 255) return true;

    b = data[yb * sw + xa]; if (b < min) min = b; if (b > max) max = b;
    if (min === 0 && max === 255) return true;

    b = data[yb * sw + xb]; if (b < min) min = b; if (b > max) max = b;
    return max !== 0;
  }

  // 斜線タイルの「土台」をオフスクリーンキャンバスに焼き込む。
  // cam/state が変わらない限り(=cachedImageDataがある限り)毎フレーム再計算する必要はないので、
  // ここは sig が変化した時(カメラ移動やリサイズ)だけ呼ばれる(render参照)。1マスごとの黒/mixed
  // 判定結果は cellTypeGrid に保存しておき、瞬き演出の反転描画や差分更新で使い回す。
  const baseTile = document.createElement('canvas'), baseTileCtx = baseTile.getContext('2d');
  let cellTypeGrid = null; // 0=black, 1=mixed (row-major, gridColsぶんの幅)

  // マス(row,col)を判定してcellTypeGridとbaseTileの両方に反映する。
  // computeBaseTiling(全面)とupdateRegionTiling(差分)の共通処理。
  function paintTile(row, col, x, y, t, data, sw, sh, tiles) {
    const isMixed = classifyTileMixed(x, y, t, data, sw, sh);
    cellTypeGrid[row * gridCols + col] = isMixed ? 1 : 0;
    baseTileCtx.drawImage(isMixed ? tiles.mixed : tiles.black, x, y);
  }

  function computeBaseTiling() {
    const t = BASE_TILE * zoom, phaseX = (((VW / 2 - cam.x * zoom) % t) + t) % t, phaseY = (((VH / 2 - cam.y * zoom) % t) + t) % t;
    const tiles = getTileBitmaps(zoom), ox = phaseX - t, oy = phaseY - t;

    if (!cachedImageData) {
      const raw = s.getImageData(0, 0, source.width, source.height).data, n = source.width * source.height, luma = new Uint8Array(n);
      for (let i = 0, j = 0; j < n; i += 4, j++) luma[j] = raw[i];
      cachedImageData = luma;
    }
    const data = cachedImageData, sw = source.width, sh = source.height;

    // 瞬きの当たり判定用に、このフレームのグリッド原点・マス目数を記録しておく
    gridOx = ox; gridOy = oy; gridT = t;
    gridCols = Math.max(0, Math.ceil((VW - ox) / t));
    gridRows = Math.max(0, Math.ceil((VH - oy) / t));

    baseTile.width = VW; baseTile.height = VH;
    baseTileCtx.fillStyle = '#fff'; baseTileCtx.fillRect(0, 0, VW, VH);
    cellTypeGrid = new Uint8Array(gridCols * gridRows);

    let row = 0;
    for (let y = oy; y < VH; y += t, row++) {
      let col = 0;
      for (let x = ox; x < VW; x += t, col++) paintTile(row, col, x, y, t, data, sw, sh, tiles);
    }
  }

  // 出現/消失アニメーションで1マスだけ変化した際の差分更新。
  // 変化したのは screen 上の (sx,sy,w,h) の範囲だけなので、そこに重なるタイルだけを
  // 再判定してcellTypeGrid/baseTileを部分更新する(画面全体を舐め直さない)。
  // 文字マスとタイルの位相がズレていても安全なように、周囲1マス分の余裕を持たせて判定する。
  function updateRegionTiling(sx, sy, w, h) {
    const sw = source.width, sh = source.height;
    const rx = Math.max(0, Math.floor(sx)), ry = Math.max(0, Math.floor(sy));
    const rw = Math.min(sw, Math.ceil(sx + w)) - rx, rh = Math.min(sh, Math.ceil(sy + h)) - ry;
    if (rw <= 0 || rh <= 0) return;

    // 変化した部分だけ luma バッファ(cachedImageData)を更新する
    const img = s.getImageData(rx, ry, rw, rh).data, data = cachedImageData;
    for (let yy = 0; yy < rh; yy++) {
      const rowOff = (ry + yy) * sw + rx;
      for (let xx = 0; xx < rw; xx++) data[rowOff + xx] = img[(yy * rw + xx) * 4];
    }

    const t = gridT, tiles = getTileBitmaps(zoom);
    const colFrom = Math.max(0, Math.floor((rx - gridOx) / t) - 1);
    const colTo = Math.min(gridCols - 1, Math.ceil((rx + rw - gridOx) / t) + 1);
    const rowFrom = Math.max(0, Math.floor((ry - gridOy) / t) - 1);
    const rowTo = Math.min(gridRows - 1, Math.ceil((ry + rh - gridOy) / t) + 1);

    for (let row = rowFrom; row <= rowTo; row++) {
      const y = gridOy + row * t;
      for (let col = colFrom; col <= colTo; col++) paintTile(row, col, gridOx + col * t, y, t, data, sw, sh, tiles);
    }
  }

  // 出現/消失アニメーションで溜まった1マスずつの変更を、まとめて差分反映する
  let pendingChanges = []; // { e, key, reveal } の配列
  function applyPendingChanges() {
    if (!cellTypeGrid) { computeBaseTiling(); pendingChanges.length = 0; return }
    pendingChanges.forEach(({ e, key, reveal }) => {
      const rect = paintCell(e, key, reveal);
      updateRegionTiling(rect.x, rect.y, rect.w, rect.h);
    });
    pendingChanges.length = 0;
  }

  function postEffect() {
    if (source.width <= 0 || source.height <= 0 || VW <= 0 || VH <= 0) return;
    v.resetTransform();
    v.drawImage(baseTile, 0, 0);

    // 瞬き中のマスだけ、土台の上から反転タイルを上描きする(土台自体は変更しない)
    if (twinkles.size > 0) {
      const tiles = getTileBitmaps(zoom), now = performance.now();
      twinkles.forEach((tw, key) => {
        if (now - tw.start >= tw.duration) return;
        const [col, row] = key.split(',').map(Number);
        if (col < 0 || row < 0 || col >= gridCols || row >= gridRows) return;
        const baseType = cellTypeGrid[row * gridCols + col];
        const bmp = baseType === 0 ? tiles.mixed : tiles.black;
        v.drawImage(bmp, gridOx + col * gridT, gridOy + row * gridT);
      });
    }
  }

  function drawUI() {
    u.setTransform(dpr, 0, 0, dpr, 0, 0); u.clearRect(0, 0, VW, VH);
  }

  // stateVersionはカメラ移動やリサイズなど「全面的に描き直す必要がある変化」だけに使う。
  // 出現/消失アニメーションの1マスずつの変化はpendingChangesに積んで差分更新する。
  function render() {
    if (!running) return;
    const sig = cam.x + '|' + cam.y + '|' + view.width + '|' + view.height + '|' + stateVersion;
    if (sig !== lastSourceSig) {
      prepareSource();
      cachedImageData = null;
      computeBaseTiling();
      lastSourceSig = sig;
      pendingChanges.length = 0;
    } else if (pendingChanges.length) {
      applyPendingChanges();
    }
    postEffect(); drawUI();
  }
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled || !running) return; renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; render() });
  }

  // ==================================================================
  // 出現/消失アニメーション・瞬き演出
  // ==================================================================
  // 配列をFisher-Yatesでシャッフルする(revealLetters/unrevealLettersで共用)
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = ~~(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 文字を1マスずつランダムな順で生成していくアニメーション
  let revealing = false; // 出現アニメーションの最中はtrue(この間はクリック不可にする)
  function revealLetters() {
    const queue = [];
    worldLetters.forEach(e => e.cells.forEach(key => queue.push({ e, key })));
    shuffle(queue);
    if (queue.length === 0) { return }
    revealing = true;
    const durationMs = 4000;
    let startTime = null, idx = 0;
    function step(ts) {
      if (!running) return;
      if (!startTime) startTime = ts;
      const progress = Math.min(1, Math.max(0, (ts - startTime) / durationMs));
      const targetIdx = ~~(progress * queue.length);
      while (idx < targetIdx) { const q = queue[idx]; q.e.revealedCells.add(q.key); pendingChanges.push({ e: q.e, key: q.key, reveal: true }); idx++ }
      render();
      if (idx < queue.length) requestAnimationFrame(step);
      else revealing = false;
    }
    requestAnimationFrame(step);
  }

  // revealLettersの逆再生: 現在表示されているマスを1マスずつランダムな順で消していき、
  // まっさらな斜線だけの状態に戻す。完了したら onDone を呼ぶ。
  function unrevealLetters(onDone) {
    const queue = [];
    worldLetters.forEach(e => e.cells.forEach(key => { if (e.revealedCells.has(key)) queue.push({ e, key }) }));
    shuffle(queue);
    const durationMs = 4000;
    let startTime = null, idx = 0;
    function step(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min(1, Math.max(0, (ts - startTime) / durationMs));
      const targetIdx = ~~(progress * queue.length);
      while (idx < targetIdx) { const q = queue[idx]; q.e.revealedCells.delete(q.key); pendingChanges.push({ e: q.e, key: q.key, reveal: false }); idx++ }
      render();
      if (progress < 1) requestAnimationFrame(step);
      else onDone();
    }
    requestAnimationFrame(step);
  }

  // ランダムなセルを選んで瞬きを発生させる
  function spawnTwinkle() {
    if (!running || transitioning || gridCols <= 0 || gridRows <= 0) return;
    const col = ~~(Math.random() * gridCols), row = ~~(Math.random() * gridRows);
    const key = col + ',' + row;
    if (twinkles.has(key)) return; // 既に光っているセルは重複させない
    twinkles.set(key, { start: performance.now(), duration: 90 + Math.random() * 140 });
  }

  // 瞬きの発生・消滅を監視し、有効な間は再描画し続けるループ
  function twinkleTick() {
    if (!running) { twinkleLoopRunning = false; return }
    const now = performance.now();
    let dirty = false;
    twinkles.forEach((tw, key) => { if (now - tw.start >= tw.duration) { twinkles.delete(key); dirty = true } });
    if (Math.random() < 0.9) { spawnTwinkle(); dirty = true }
    if (dirty || twinkles.size > 0) scheduleRender();
    requestAnimationFrame(twinkleTick);
  }
  function startTwinkleLoop() {
    if (twinkleLoopRunning) return;
    twinkleLoopRunning = true;
    requestAnimationFrame(twinkleTick);
  }

  // ==================================================================
  // 画面遷移（タイトル → ゲーム / ゲーム → タイトル）
  // ==================================================================
  // 盤面(gameContainer)の出現アニメーションと歩調を合わせるための共通パラメータ。
  // CSSのease-inと同じ三次ベジェを自前で評価し、外枠の押し出しにも同じ緩急を使う。
  function cubicBezier(x1, y1, x2, y2) {
    const bx = t => { const mt = 1 - t; return 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t };
    const by = t => { const mt = 1 - t; return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t };
    return x => {
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 20; i++) {
        const cx = bx(t);
        if (Math.abs(cx - x) < 1e-4) break;
        if (cx < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return by(t);
    };
  }
  const FRAME_EXIT_DURATION = 600, frameExitEase = cubicBezier(0.42, 0, 1, 1); // 盤面のスライド(600ms/ease-in)と揃える

  // 外枠を、盤面が出現する時と同じ向き(左上)・同じ速さ(600ms, ease-in)で画面外へ押し出す。
  // ポストエフェクト(斜線タイル)自体はそのまま動かし続け、外枠の位置だけをずらしていく。
  // これにより外枠が消えていく間も斜線模様は途切れず、押し出し完了後はbody側の背景と
  // 完全に一致した「外枠なしの斜線だけ」の状態になる(syncBodyStripePatternが同じ
  // frameOffsetを参照するため)。
  function expelFrame(onDone) {
    const t = BASE_TILE * zoom;
    const dist = Math.max(VW, VH) + t * 4; // どんな画面比率でも確実に画面外まで出る距離
    let startTime = null;
    function step(ts) {
      if (!transitioning) return;
      if (!startTime) startTime = ts;
      const progress = Math.min(1, (ts - startTime) / FRAME_EXIT_DURATION);
      const eased = frameExitEase(progress);
      const prevOffset = { x: frameOffset.x, y: frameOffset.y };
      frameOffset.x = -dist * eased;
      frameOffset.y = -dist * eased;
      // 画面全体を舐め直す代わりに、枠が動いた帯だけ軽量に差分更新する(updateBoundaryFrameRegion参照)。
      // stateVersionは変えないので、直後のrender()は「差分更新のみ反映して描画」という軽いパスを通る。
      updateBoundaryFrameRegion(prevOffset);
      render();
      if (progress < 1) requestAnimationFrame(step);
      else onDone();
    }
    requestAnimationFrame(step);
  }

  function enterGame() {
    if (transitioning) return; transitioning = true;
    twinkles.clear(); // 逆再生中に瞬きが混ざらないよう止めておく(以後spawnTwinkleもtransitioningで止まる)

    // ここが実際のユーザー操作(タップ)由来の呼び出しなので、自動再生制限に
    // 引っかからずAudioContextを起動できる(bgm.jsはこの1回の呼び出しだけで
    // マルコフ連鎖による生成ループを開始し、以後は自走し続ける)。
    if (window.BGM) window.BGM.start();

    // 文字を1マスずつ4秒かけて出現させたのと同じやり方で、逆に1マスずつ4秒かけて
    // 消していき、まっさらな斜線だけの状態に戻す。
    unrevealLetters(() => {
      // 外枠の押し出し(左上へ)と盤面のスライドイン(右下から)を同時に走らせる。
      // どちらも600ms・ease-inで揃えてあるので、1枚の斜線シートがそのまま
      // 手前へ流れ込んでくるように見える。

      // ポストエフェクトを切る前に、外枠を左上方向へ画面外まで押し出す。
      expelFrame(() => {
        // 外枠も含めて完全にまっさらになったところで、瞬時に1フレーム描画する。
        // この状態は body の背景と全く同じ位相・柄になるので、
        // 直後にタイトルのcanvasを消しても見た目には何も変化が起きない(バレない)。
        blankMode = true;
        stateVersion++;
        syncBodyStripePattern();
        render();

        running = false;
        titleScreen.style.display = 'none'; // 瞬時に消す。裏のbody背景と同一なので継ぎ目は出ない
        titleScreen.classList.add('hidden');
      });

      // 盤面(.game-container)を、画面外(右下)から通常位置まで、外枠と同時にスライドさせる。
      if (gameContainer) {
          const t = BASE_TILE * zoom;
          const durationMs = 600;
          const easing = 'ease-in';
          const r = gameContainer.getBoundingClientRect();
          // 盤面自身のサイズではなく、現在位置から画面端までの距離を基準にする。
          // 盤面が画面よりだいぶ小さいと、自身のサイズ基準では画面外まで届かず
          // 右下の端が少し見えてしまうことがあったため。
          const boardDist = Math.max(VW - r.left, VH - r.top) + t * 4;

          gameContainer.style.position = 'relative';
          gameContainer.style.zIndex = '10000'; // タイトルより前面に出す
          gameContainer.style.transition = 'none';
          gameContainer.style.transform = `translate(${boardDist}px, ${boardDist}px)`;

          void gameContainer.offsetWidth; // 強制リフローしてから解除する
          gameContainer.style.transition = `transform ${durationMs}ms ${easing}`;
          gameContainer.style.transform = 'translate(0, 0)';

          setTimeout(() => {
              gameContainer.style.transition = '';
              gameContainer.style.transform = '';
              gameContainer.style.position = '';
              gameContainer.style.zIndex = '';
          }, durationMs);
      }
    });
  }

  // ゲームからタイトルへ戻る際に呼び出す。表示状態・アニメーションを初期化してやり直す。
  // instant=true の場合、フェードやトランジションなしで即座に不透明・元の位置に表示する
  // （例: リスタート時に、裏で作り直しているゲーム画面が一瞬透けて見えるのを防ぐ）。
  function resetTitleScreen(instant = false) {
    transitioning = false;
    running = true;
    titleScreen.style.display = '';
    titleScreen.style.transform = ''; // 直前の平行移動を解除しておく

    if (instant) {
        titleScreen.style.transition = 'none';
        void titleScreen.offsetWidth; // 強制リフロー
        titleScreen.classList.remove('hidden');
        void titleScreen.offsetWidth; // transition:none を確実に反映させてから解除する
        titleScreen.style.transition = '';
    } else {
        // 強制リフローしてから hidden を外し、フェードインさせる
        void titleScreen.offsetWidth;
        titleScreen.classList.remove('hidden');
    }

    // 文字の反転状態や瞬きをリセットし、最初から出現アニメーションをやり直す
    worldLetters.forEach(e => e.revealedCells.clear());
    twinkles.clear();
    blankMode = false;
    frameOffset = { x: 0, y: 0 };
    stateVersion++;
    lastSourceSig = null;
    cachedImageData = null;

    resize();
    revealLetters();
    startTwinkleLoop();
  }
  window.resetTitleScreen = resetTitleScreen;

  // ==================================================================
  // 入力イベント（タップでゲーム開始）
  // ==================================================================
  const pointers = new Map();
  ui.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, e); ui.setPointerCapture(e.pointerId);
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false };
  });
  ui.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    // タップ/スワイプの判定用に移動量だけ見る。
    if (pointers.size === 1 && drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved ||= (Math.abs(dx) + Math.abs(dy) > 4);
    }
  });
  const pointerUp = e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { if (drag && !drag.moved && !revealing) enterGame(); drag = null }
  };
  ['pointerup', 'pointercancel'].forEach(ev => ui.addEventListener(ev, pointerUp));

  // ==================================================================
  // 起動
  // ==================================================================
  let resizeScheduled = false;
  addEventListener('resize', () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => { resizeScheduled = false; resize(); });
  });

  resize();
  revealLetters();
  startTwinkleLoop();
})();