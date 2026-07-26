//////////////////////////////////////////////////////////////////////////////
// state.js — ゲーム状態 & セーブデータ
// 部屋データ・マップ・プレイヤー・エフェクト等の可変状態と、
// クリア済みフラグの永続化(localStorage)処理。
// 依存: constants.js（floorRows等は使わないため実質独立）
//////////////////////////////////////////////////////////////////////////////

let ROOMS = {};
let ROOMS_BY_ID = {};
let ALL_ROOMS = [];
let finalGoalCells = [];
let allStageCleared = false;
let isEndingSequence = false;

let staticGrid = [];
let grid = [];
let holeVariant = [];
let mapWidth = 0;
let mapHeight = 0;

let currentRoom = null;
let nextRoom = null;

let laserPos = null;
let relays = [];
let enemy = []; // 敵(E)。プレイヤーの入力と逆方向に動く。

let playerPos = { x: 0, y: 0 };
let playerFacing = 1; // 1: 右向き, -1: 左向き
let playerPose = null;
let playerPoseTimer = 0;
let laserSegments = [];
let laserCancelSegments = [];
let laserHitCells = new Set();
let isPlayerDead = false;
let gameCleared = false;
let history = [];
let isMenuOpen = false;
let menuRoomHitRects = [];
// メニューで部屋をクリックした後、拡大表示中の部屋（nullなら部屋一覧を表示）
let menuZoomedRoom = null;
// 拡大表示中のS(entrance)地点のクリック領域
let menuEntranceHitRects = [];
// 拡大表示パネル自体の範囲（ボード座標系）。パネル外クリックで一覧表示へ戻る判定に使う
let menuZoomPanelRect = null;

let cameraX = 0;
let cameraY = 0;
let targetCameraX = 0;
let targetCameraY = 0;
let isScrolling = false;
let slideOffsetX = 0;
let slideOffsetY = 0;

const SAVE_KEY = 'klutz_save_v2';
let saveData = null;

// S地点(goal/entrance)を一意に識別するキー。ワールド座標なので部屋をまたいでも衝突しない。
function spotKey(x, y) {
    return x + ',' + y;
}

// 部屋が持つ全S地点(goal側・entrance側の両方)を1つの配列にまとめて返す。
// ワープ可否判定・到達記録のどちらもこの単位で扱う。
function allSpotsOfRoom(room) {
    return [...room.goals, ...room.entrances];
}

function createNewSaveData() {
    const reachedSpots = {};
    const organFlags = {};
    for (const room of ALL_ROOMS) {
        for (const spot of allSpotsOfRoom(room)) {
            reachedSpots[spotKey(spot.x, spot.y)] = false;
        }
        if (room.organ) organFlags[room.organ] = false;
    }
    return {
        version: 2,
        reachedSpots,
        organFlags,
    };
}

function writeSaveFile() {
    if (!saveData) return;
    try {
        let mergedReached = saveData.reachedSpots;
        let mergedOrgan = saveData.organFlags;
        try {
            const existingRaw = localStorage.getItem(SAVE_KEY);
            if (existingRaw) {
                const existing = JSON.parse(existingRaw);
                if (existing && existing.reachedSpots) {
                    mergedReached = {};
                    for (const key of Object.keys(saveData.reachedSpots)) {
                        mergedReached[key] = !!existing.reachedSpots[key] || !!saveData.reachedSpots[key];
                    }
                }
                if (existing && existing.organFlags) {
                    mergedOrgan = {};
                    for (const key of Object.keys(saveData.organFlags)) {
                        mergedOrgan[key] = !!existing.organFlags[key] || !!saveData.organFlags[key];
                    }
                }
            }
        } catch (e) {
        }
        saveData.reachedSpots = mergedReached;
        saveData.organFlags = mergedOrgan;
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
    } catch (e) {
        console.error('セーブの書き込みに失敗しました', e);
    }
}

function loadSaveFile() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.reachedSpots) return parsed;
        }
    } catch (e) {
    }
    return null;
}

function applyLoadedSaveData(data) {
    if (data && data.reachedSpots && saveData) {
        for (const key of Object.keys(saveData.reachedSpots)) {
            if (data.reachedSpots[key]) saveData.reachedSpots[key] = true;
        }
    }
    if (data && data.organFlags && saveData) {
        for (const key of Object.keys(saveData.organFlags)) {
            if (data.organFlags[key]) saveData.organFlags[key] = true;
        }
    }
}

function setRoomEntryPoint(room, x, y) {
    room.entryPoint = { x, y };
    // 部屋に入った/ワープした地点は、その時点で「S地点に到達した」とみなして記録する。
    markSpotReached(x, y);
}

// プレイヤーが到達したS地点(goal/entrance)を「到達済み」としてセーブデータに記録する。
// 部屋への出入り時(setRoomEntryPoint)に加え、ゴールS地点に乗った瞬間にも呼ぶこと
// （movement.js側で、以前 checkAndMarkClear を呼んでいた箇所を置き換える）。
function markSpotReached(x, y) {
    if (!saveData || !saveData.reachedSpots) return;
    const key = spotKey(x, y);
    if (!(key in saveData.reachedSpots)) return; // S地点ではない座標は無視
    if (!saveData.reachedSpots[key]) {
        saveData.reachedSpots[key] = true;
        writeSaveFile();
    }
}

// 部屋内のS地点(goal/entrance)のうち、1つでも到達済みならtrue。
// メニューでその部屋へ飛べるかどうかの判定に使う。
function roomHasReachedSpot(room) {
    if (!saveData || !saveData.reachedSpots) return false;
    return allSpotsOfRoom(room).some(spot => saveData.reachedSpots[spotKey(spot.x, spot.y)]);
}

// 臓器演出を見終えたことをセーブデータに記録する（クリアフラグと同じ扱い）
function markOrganConsumed(organKey) {
    if (!saveData || !organKey) return;
    if (!saveData.organFlags[organKey]) {
        saveData.organFlags[organKey] = true;
        writeSaveFile();
    }
}

// セーブデータのorganFlagsを、ALL_ROOMS内の該当部屋のorganConsumedへ反映する。
// parseTemplate()（room.organConsumed = falseで初期化）の後、
// applyLoadedSaveData()の後に呼び出すこと。
function applyOrganFlagsToRooms() {
    if (!saveData || !saveData.organFlags) return;
    for (const room of ALL_ROOMS) {
        if (room.organ && saveData.organFlags[room.organ]) {
            room.organConsumed = true;
        }
    }
}