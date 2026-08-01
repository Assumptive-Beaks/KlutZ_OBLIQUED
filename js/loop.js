//////////////////////////////////////////////////////////////////////////////
// loop.js — 部屋遷移・ゲームループ・アンドゥ
// 部屋の出入り演出、requestAnimationFrameループ、操作履歴によるアンドゥ。
// 依存: state.js, world.js, laser.js, render.js
//////////////////////////////////////////////////////////////////////////////

function updateBackgroundBrightness() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper || !currentRoom) return;

    const t = (currentRoom.floor - 1) / (MAX_FLOOR - 1);
    const brightness = 1 / (1 + Math.exp(-20 * (t - 0.5)));

    wrapper.style.setProperty('--bg-tint-brightness', brightness.toFixed(3));
}

// 背景の縞模様の拡大倍率(線の太さ)を、1F→MAX_FLOOR階にかけて単調に拡大する。
const STRIPE_ZOOM_MIN = 1;
const STRIPE_ZOOM_MAX = 10;
// 部屋の出入り(ドアをくぐって次の部屋に着地する瞬間)で縞ズームを
// なめらかに変化させるのにかける時間(ms)
const STRIPE_ZOOM_ROOM_TRANSITION_DURATION = 500;

// currentRoom.floorに応じた目標ズーム値を計算する。
// durationを渡すとその階数へ向けてなめらかにアニメーションし、
// 渡さない場合は即座に反映する(ワープ・アンドゥ・初期ロードなど、
// 見た目の連続性を気にしなくてよい場面向け)。
function updateBackgroundStripeZoom(duration) {
    if (!currentRoom || !window.setStripeZoom) return;
    const t = (currentRoom.floor - 1) / (MAX_FLOOR - 1);
    const targetZoom = STRIPE_ZOOM_MIN + t * STRIPE_ZOOM_MAX;
    if (duration) {
        animateStripeZoomTo(targetZoom, duration);
    } else {
        cancelStripeZoomAnim();
        zoom = targetZoom;
        window.setStripeZoom(zoom);
    }
}

// 縞ズームを任意のtargetZoomまでduration(ms)かけて滑らかに変化させる。
// requestAnimationFrameで独自に時間ベースの補間を行うため、
// メインループ(animate)の部屋遷移カメラ処理とは独立しており、
// 部屋の出入りやending.webpの再生時間ときっちり同期させられる。
let stripeZoomAnimId = null;

function cancelStripeZoomAnim() {
    if (stripeZoomAnimId !== null) {
        cancelAnimationFrame(stripeZoomAnimId);
        stripeZoomAnimId = null;
    }
}

function animateStripeZoomTo(targetZoom, duration) {
    if (!window.setStripeZoom) return;
    cancelStripeZoomAnim();

    const startZoom = zoom;
    const startTime = performance.now();

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        zoom = startZoom + (targetZoom - startZoom) * t;
        window.setStripeZoom(zoom);
        stripeZoomAnimId = (t < 1) ? requestAnimationFrame(step) : null;
    }
    stripeZoomAnimId = requestAnimationFrame(step);
}

// エンディング演出(ending.webp再生)専用: 縞ズームをSTRIPE_ZOOM_MINまで戻す
function animateStripeZoomToMin(duration) {
    animateStripeZoomTo(STRIPE_ZOOM_MIN, duration);
}

function finishRoomEntry() {
    nextRoom = null;
    cancelStripeZoomAnim();

    isPlayerDead = false;
    gameCleared = false;
    allStageCleared = false;
    isMenuOpen = false;
    endingOverlay.classList.remove('active');
    deathOverlay.classList.remove('active');

    cameraX = 0; cameraY = 0; targetCameraX = 0; targetCameraY = 0;
    isScrolling = false;

    syncRoomObjects();
    calculateLaser();
    updateBackgroundBrightness();
    updateBackgroundStripeZoom();
    draw();
}

function loadRoomFresh(room) {
    currentRoom = room;
    const spawn = room.entrances[0] || room.goals[0];
    playerPos = spawn ? { x: spawn.x, y: spawn.y } : { x: room.x0 + 4, y: room.y0 + 4 };
    setRoomEntryPoint(room, playerPos.x, playerPos.y);
    finishRoomEntry();
}

// メニューの拡大表示からS(entrance)地点をクリックした際に使う、
// 指定した部屋の指定座標へ直接ワープするための関数。
// loadRoomFreshはスポーン地点(entrances[0]/goals[0])固定のため流用せず、
// クリックされたS地点をそのままentryPointとして扱う。
function warpToRoomPosition(room, x, y) {
    resetRoomGrid(room);
    currentRoom = room;
    playerPos = { x, y };
    setRoomEntryPoint(room, x, y);
    // 部屋の盤面をリセットしたため、過去の履歴(アンドゥ)を保持し続けると
    // 整合性が取れなくなる（別の部屋・別の盤面状態を参照したままになる）ので破棄する。
    history = [];
    finishRoomEntry();
}

function syncRoomObjects() {
    laserPos = currentRoom.laserPos ? { ...currentRoom.laserPos } : null;
    relays = currentRoom.relays.map(r => ({ ...r }));
    enemy = currentRoom.enemy.map(a => ({ ...a }));
}

function startTransition(targetRoom, fromX, fromY, toX, toY) {
    isScrolling = true;
    nextRoom = targetRoom;

    const fromLocalX = fromX - currentRoom.x0;
    const fromLocalY = fromY - currentRoom.y0;
    const toLocalX = toX - targetRoom.x0;
    const toLocalY = toY - targetRoom.y0;

    playerPos = { x: toX, y: toY };

    slideOffsetX = (fromLocalX - toLocalX) * cellSize;
    slideOffsetY = (fromLocalY - toLocalY) * cellSize;

    cameraX = 0;
    cameraY = 0;
    targetCameraX = slideOffsetX;
    targetCameraY = slideOffsetY;
}

function animate() {
    requestAnimationFrame(animate);

    if (isScrolling) {
        const dx = targetCameraX - cameraX;
        const dy = targetCameraY - cameraY;

        if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) {
            cameraX += dx * 0.035;
            cameraY += dy * 0.035;
        } else {
            currentRoom = nextRoom;
            nextRoom = null;
            setRoomEntryPoint(currentRoom, playerPos.x, playerPos.y);

            cameraX = 0;
            cameraY = 0;
            targetCameraX = 0;
            targetCameraY = 0;

            isScrolling = false;

            syncRoomObjects();
            calculateLaser();
            checkArrivalHazards();
            updateBackgroundBrightness();
            updateBackgroundStripeZoom(STRIPE_ZOOM_ROOM_TRANSITION_DURATION);
        }
    }
    draw();
}

function saveState() {
    history.push({
        grid: cloneGrid(grid),
        staticGrid: cloneStaticGrid(staticGrid),
        playerPos: { ...playerPos },
        currentRoom: currentRoom,
        enemy: enemy.map(a => ({ ...a })),
    });
}

function undo() {
    if (history.length === 0 || isOrganEventActive) return;

    const prevState = history.pop();
    grid = prevState.grid;
    staticGrid = prevState.staticGrid;
    playerPos = prevState.playerPos;
    currentRoom = prevState.currentRoom;
    finishRoomEntry();

    // finishRoomEntry内のsyncRoomObjectsは敵をテンプレートの初期位置に戻してしまうため、
    // 履歴時点の実際の敵位置に戻す。部屋をまたぐアンドゥ（部屋遷移を発生させた手を
    // 取り消す場合）でも、prevState.enemyはその時点の部屋(prevState.currentRoom)の
    // 正しい敵位置なので、部屋が変わったかどうかに関わらず常に復元する。
    if (prevState.enemy) {
        enemy = prevState.enemy.map(a => ({ ...a }));
        calculateLaser();
        draw();
    }
}

// ============================================================
// 最終エンディング演出
// 依存: title.js (window.resetTitleScreen), assets.js (TILE_IMAGE_SOURCES)
// ============================================================
const gameContainer = document.querySelector('.game-container');
const endingPlayerSprite = document.getElementById('endingPlayerSprite');
const endingOverlay = document.getElementById('endingOverlay');

const ENDING_SLIDE_DURATION = 600;   // タイトル入場のスライドと揃える
const BEFORE_ANIM_DURATION = 2000;
const ENDING_ANIM_DURATION = 3500;   // ★ending.webpの実際の再生時間(ms)に合わせて調整してください
const ANIM_FADEOUT_DURATION = 800;
const AFTER_ANIM_DURATION = 2400;
const ENDING_TEXT_HOLD = 2500;       // 「KlutZ DETACHED」表示からタイトルへ戻るまでの間
const TEXT_FADEOUT_DURATION = 600;

function getPlayerScreenRect() {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const pRenderX = (playerPos.x - currentRoom.x0) * cellSize;
    const pRenderY = (playerPos.y - currentRoom.y0) * cellSize + MARGIN_HEIGHT;
    const pCx = pRenderX + cellSize / 2;
    const pCy = pRenderY + cellSize / 2;
    const pSize = cellSize * 1.2;

    return {
        left: rect.left + (pCx - pSize / 2) * scaleX,
        top: rect.top + (pCy - pSize / 2) * scaleY,
        width: pSize * scaleX,
        height: pSize * scaleY,
    };
}

function playEndingSequence() {
    // 1) 今のプレイヤーとそっくり同じ画像を独立要素として同じ場所に重ねる
    const rect = getPlayerScreenRect();
    endingPlayerSprite.src = TILE_IMAGE_SOURCES.player; // KlutZ.png
    endingPlayerSprite.style.left = rect.left + 'px';
    endingPlayerSprite.style.top = rect.top + 'px';
    endingPlayerSprite.style.width = rect.width + 'px';
    endingPlayerSprite.style.height = rect.height + 'px';
    endingPlayerSprite.style.opacity = '1';
    endingPlayerSprite.style.display = 'block';

    // 2) canvas側のプレイヤー描画を止める(二重表示防止。盤面自体は描画され続ける)
    isEndingSequence = true;

    // 3) 盤面をタイトル入場と同じ緩急・時間で、左上へスライドアウト
    const gcRect = gameContainer.getBoundingClientRect();
    const dist = Math.max(gcRect.right, gcRect.bottom) + cellSize * 2;

    gameContainer.style.transition = 'none';
    gameContainer.style.transform = 'translate(0, 0)';
    void gameContainer.offsetWidth;
    gameContainer.style.transition = `transform ${ENDING_SLIDE_DURATION}ms ease-in`;
    gameContainer.style.transform = `translate(${-dist}px, ${-dist}px)`;

    setTimeout(() => {
        setTimeout(() => {
            // 4) 画面外に出きったところで ending.webp に差し替えて再生開始
            endingPlayerSprite.src = 'assets/ending.webp';

            // 5) ending.webpの再生時間と同期させて、背景の縞ズームを最小値まで戻す
            animateStripeZoomToMin(ENDING_ANIM_DURATION);

            // ending.webpと同時にBGMをフェードアウトさせ、音量を0にする。
            // 次にタイトルへ戻って画面クリックした際は BGM.start() が音量を
            // DEFAULT_VOLUMEに戻し、状態も「無」からやり直すので普段通りに再開する。
            if (window.BGM) BGM.fadeOut(ENDING_ANIM_DURATION / 1000);

            // 終了直前にフェードアウト開始
            setTimeout(() => {
                endingPlayerSprite.style.transition = `opacity ${ANIM_FADEOUT_DURATION}ms ease`;
                endingPlayerSprite.style.opacity = '0';
            }, ENDING_ANIM_DURATION - ANIM_FADEOUT_DURATION);

            // ending.webp の再生終了後、少し待ってからテキスト表示
            setTimeout(() => {
                endingPlayerSprite.style.display = 'none';
                endingPlayerSprite.style.transition = '';

                // 7) 「KlutZ DETACHED」だけフェードイン
                endingOverlay.classList.add('active');

                setTimeout(() => {
                    endingOverlay.classList.remove('active');
                    setTimeout(() => {
                        // 8) ボタン待ちせず、起動時と同じ演出でタイトルへ自動復帰
                        isEndingSequence = false;
                        allStageCleared = false;
                        gameContainer.style.transition = '';
                        gameContainer.style.transform = '';

                        resetWorld();
                        loadRoomFresh(ROOMS[1][0]);
                        window.resetTitleScreen(true);
                    }, TEXT_FADEOUT_DURATION);
                }, ENDING_TEXT_HOLD - TEXT_FADEOUT_DURATION);
            }, ENDING_ANIM_DURATION + AFTER_ANIM_DURATION);
        }, BEFORE_ANIM_DURATION);
    }, ENDING_SLIDE_DURATION);
}

// ============================================================
// 臓器演出（brain/lung/heart/liver/kidney）
// 部屋の中央に4マス分の大きさで表示される臓器画像にプレイヤーが
// 触れると、全キー入力を止めてフレーズを1文ずつランダム表示する。
// 依存: state.js, stage-data.js (ORGAN_PHRASES), render.js (draw), assets.js
// ============================================================
let isOrganEventActive = false;
let organOverlayText = '';
let organEventTimerId = null;

const ORGAN_PHRASE_DURATION = 900; // 1文あたりの表示時間(ms)

// stage-data.jsのテンプレートで臓器の単語が書かれている行(room.organRow)を
// 中心として、その周囲3x3マスに指定した座標が含まれるか判定する
// （呼び出し側は敵(enemy)の座標を渡す）
function isPositionTouchingOrgan(room, x, y) {
    if (!room || !room.organ) return false;
    const lx = x - room.x0;
    const ly = y - room.y0;
    const centerLx = Math.floor(floorCols / 2);
    const centerLy = room.organRow;
    return lx >= centerLx - 1 && lx <= centerLx + 1 && ly >= centerLy - 1 && ly <= centerLy + 1;
}

// 臓器への接触判定はプレイヤーではなく敵(E)で行う。
function checkOrganTrigger() {
    if (isOrganEventActive) return;
    const room = currentRoom;
    if (!room || !room.organ || room.organConsumed) return;
    const touched = enemy.some(e => isPositionTouchingOrgan(room, e.x, e.y));
    if (!touched) return;
    startOrganEvent(room);
}

function startOrganEvent(room) {
    isOrganEventActive = true;
    const phrases = ORGAN_PHRASES[room.organ] || [];
    let idx = 0;

    function showNext() {
        if (idx >= phrases.length) {
            organOverlayText = '';
            room.organConsumed = true; // このアニメーションは二度と表示しない
            markOrganConsumed(room.organ); // セーブデータにも記録（クリアフラグと同じ扱い）
            isOrganEventActive = false;
            if (window.SFX) SFX.playImpact(); // 演出終了・画像消滅と同時に鳴らす
            draw();
            return;
        }
        organOverlayText = phrases[idx];
        idx++;
        draw();
        organEventTimerId = setTimeout(showNext, ORGAN_PHRASE_DURATION);
    }
    showNext();
}