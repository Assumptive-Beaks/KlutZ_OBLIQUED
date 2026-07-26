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

function makeTileImage(src) {
    const img = new Image();
    img.__ready = false;
    if (src) {
        img.onload = () => { img.__ready = true; draw(); };
        img.onerror = () => { img.__ready = false; };
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
