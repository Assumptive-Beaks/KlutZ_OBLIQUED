//////////////////////////////////////////////////////////////////////////////
// assets.js — タイル画像アセット
// 画像の読み込み(preloadTileImages)とキャンバス描画ヘルパー(drawTileImage等)。
// 依存: constants.js（ctx / TILE_IMAGE_SOURCES用の定数は使わないが並び順として後）
//////////////////////////////////////////////////////////////////////////////

const TILE_IMAGE_SOURCES = {
    floor: 'assets/eye_cover.png',
    floor_close: 'assets/eye_close.png',
    pupil: 'assets/pupil.png',
    hole: ['assets/mouth_a.png','assets/mouth_i.png','assets/mouth_u.png','assets/mouth_e.png','assets/mouth_o.png'],
    filled_hole: 'assets/mouth_m.png',
    wall: 'assets/meat.png',
    mirror: 'assets/bone.png',
    goal: '',
    entrance: '',
    player: 'assets/KlutZ.png',
    player_up: 'assets/KlutZ_up.png',
    player_down: 'assets/KlutZ_down.png',
    player_dead: '',
    relay: ['assets/lung.png', 'assets/brain.png', 'assets/liver.png', 'assets/kidney.png'],
    laser_source: 'assets/heart.png',
    enemy: 'assets/bigot.png',
};

const tileImages = {};

function preloadTileImages() {
    for (const key in TILE_IMAGE_SOURCES) {
        const src = TILE_IMAGE_SOURCES[key];
        if (Array.isArray(src)) {
            tileImages[key] = src.map(s => makeTileImage(s));
        } else {
            tileImages[key] = makeTileImage(src);
        }
    }
}

// ============================================================
// 臓器演出用アセット（brain/lung/heart/liver/kidney）
// stage-data.js のテンプレート内に埋め込まれた臓器部屋で、
// プレイヤーが触れるまで表示し続ける等身大(4マス分)の画像。
// relay/laser_sourceで使う画像と役割が異なるため独立して管理する。
// ============================================================
const ORGAN_IMAGE_SOURCES = {
    brain: 'assets/brain.png',
    lung: 'assets/lung.png',
    heart: 'assets/heart.png',
    liver: 'assets/liver.png',
    kidney: 'assets/kidney.png',
};

const organImages = {};

function preloadOrganImages() {
    for (const key in ORGAN_IMAGE_SOURCES) {
        organImages[key] = makeTileImage(ORGAN_IMAGE_SOURCES[key]);
    }
}

function drawOrganImage(key, px, py, size, centered) {
    const img = organImages[key];
    if (!img) return false;

    if (img.__ready) {
        if (centered) {
            ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
        } else {
            ctx.drawImage(img, px, py, size, size);
        }
        return true;
    }
    return false;
}

// ============================================================
// タイトル画面の外枠(輪郭抽出)用アセット
// title.jsが読み込み後の画像を輪郭抽出(mask化→traceContours)に使う。
// 読み込み完了のタイミングでゲーム描画(draw())を呼ぶ必要はなく、
// 呼び出し側(title.js)の処理を実行したいので、preloadTileImages/
// preloadOrganImagesとは別に、makeTileImageのonReadyコールバックを
// 使う専用のpreload関数を用意する。読み込み方式そのものは他のアセットと同じ。
// ============================================================
const FRAME_IMAGE_SOURCES = {
    frame: 'assets/frame-shape.png',
};

const frameImages = {};

function preloadFrameImages(onReady) {
    for (const key in FRAME_IMAGE_SOURCES) {
        frameImages[key] = makeTileImage(FRAME_IMAGE_SOURCES[key], onReady);
    }
}

// onReadyを渡した場合、読み込み完了(成功/失敗どちらも)時にdraw()の代わりにそちらを呼ぶ。
// 省略時は従来どおり成功時にdraw()を呼ぶ(ゲーム内タイル画像・臓器画像はこちらの挙動のまま)。
function makeTileImage(src, onReady) {
    const img = new Image();
    img.__ready = false;
    if (src) {
        img.onload = () => { img.__ready = true; if (onReady) onReady(img); else draw(); };
        img.onerror = () => { img.__ready = false; if (onReady) onReady(img); };
        img.src = src;
    }
    return img;
}

function drawTileImage(key, px, py, size, centered) {
    const entry = tileImages[key];
    if (!entry || Array.isArray(entry)) return false;

    if (entry.__ready) {
        if (centered) {
            ctx.drawImage(entry, px - size / 2, py - size / 2, size, size);
        } else {
            ctx.drawImage(entry, px, py, size, size);
        }
        return true;
    }
    return false;
}

function drawIndexedTileImage(key, index, px, py, size, centered) {
    const entry = tileImages[key];
    if (!entry || !Array.isArray(entry)) return false;
    const img = entry[index];
    if (img && img.__ready) {
        if (centered) {
            ctx.drawImage(img, px - size / 2, py - size / 2, size, size);
        } else {
            ctx.drawImage(img, px, py, size, size);
        }
        return true;
    }
    return false;
}
