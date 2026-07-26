//////////////////////////////////////////////////////////////////////////////
// input.js — 入力・イベント設定
// キーボード操作やクリック等、プレイヤー入力のイベントリスナー登録。
// 依存: state.js, movement.js, loop.js
//////////////////////////////////////////////////////////////////////////////

// Qキー（メニュー開閉）・Eキー（undo）の共通処理。
// キーボード入力とスマホ用ボタンの両方から呼び出す。
function toggleMenuState() {
    if (isOrganEventActive) return;
    isMenuOpen = !isMenuOpen;
    if (!isMenuOpen) {
        menuZoomedRoom = null;
        menuZoomPanelRect = null;
    }
    draw();
}

function requestUndo() {
    if (isMenuOpen || isOrganEventActive) return;
    undo();
}

// スワイプでの移動判定に使う設定値。
const SWIPE_THRESHOLD_PX = 30;
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

function setupSwipeControls() {
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchActive = true;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (!touchActive) return;
        // 盤面上でのスワイプ中はページのスクロール／ズームを抑止する。
        e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (!touchActive) return;
        touchActive = false;

        // メニュー表示中はタップ選択（clickイベント）に任せる。
        if (isMenuOpen) return;
        if (gameCleared || allStageCleared || isPlayerDead || isScrolling || isOrganEventActive) return;

        const touch = e.changedTouches[0];
        const diffX = touch.clientX - touchStartX;
        const diffY = touch.clientY - touchStartY;

        if (Math.abs(diffX) < SWIPE_THRESHOLD_PX && Math.abs(diffY) < SWIPE_THRESHOLD_PX) {
            return;
        }

        let dx = 0, dy = 0;
        if (Math.abs(diffX) > Math.abs(diffY)) {
            dx = diffX > 0 ? 1 : -1;
        } else {
            dy = diffY > 0 ? 1 : -1;
        }
        tryMovePlayer(dx, dy);
    });

    canvas.addEventListener('touchcancel', () => {
        touchActive = false;
    });
}

// 縦長ウインドウ（スマホ想定）の場合に、盤面下部へ
// Qキー入力／Eキー入力を行うためのタッチ操作領域を設置する。
function setupMobileButtonControls() {
    if (document.querySelector('.mobile-controls')) return;

    const container = canvas.closest('.game-container') || canvas.parentElement;
    if (!container) return;

    const controls = document.createElement('div');
    controls.className = 'mobile-controls';

    const qBtn = document.createElement('button');
    qBtn.type = 'button';
    qBtn.className = 'mobile-btn mobile-btn-q';
    qBtn.textContent = 'Q';
    qBtn.addEventListener('click', () => {
        if (isTitleActive() || isPlayerDead || gameCleared || allStageCleared || isOrganEventActive) return;
        toggleMenuState();
    });

    const eBtn = document.createElement('button');
    eBtn.type = 'button';
    eBtn.className = 'mobile-btn mobile-btn-e';
    eBtn.textContent = 'E';
    eBtn.addEventListener('click', () => {
        if (isTitleActive()) return;
        requestUndo();
    });

    controls.appendChild(qBtn);
    controls.appendChild(eBtn);
    container.appendChild(controls);
}

function isTitleActive() {
    const titleScreen = document.querySelector('#titleScreen');
    // titleScreenが存在し、かつ hidden クラスが無い（または display が none でない）場合はタイトル画面中とみなす
    return titleScreen && !titleScreen.classList.contains('hidden') && titleScreen.style.display !== 'none'; //[cite: 2]
}

function setupEventListeners() {
    window.addEventListener('keydown', (e) => {
        if (isTitleActive()) return;

        if (e.key === 'q' || e.key === 'Q') {
            if (isPlayerDead || gameCleared || allStageCleared || isOrganEventActive) return;
            e.preventDefault();
            toggleMenuState();
            return;
        }

        if (isMenuOpen) return;

        if (e.key === 'e' || e.key === 'E') { requestUndo(); return; }

        if (gameCleared || allStageCleared || isPlayerDead || isScrolling || isOrganEventActive) {
            return;
        }

        let dx = 0, dy = 0;
        switch (e.key) {
            case 'ArrowUp': case 'w': case 'W': dy = -1; break;
            case 'ArrowDown': case 's': case 'S': dy = 1; break;
            case 'ArrowLeft': case 'a': case 'A': dx = -1; break;
            case 'ArrowRight': case 'd': case 'D': dx = 1; break;
            default: return;
        }
        e.preventDefault();
        tryMovePlayer(dx, dy);
    });

    setupSwipeControls();
    setupMobileButtonControls();

    canvas.addEventListener('click', (e) => {
        if (!isMenuOpen) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;

        // 拡大表示中：S(entrance)地点をクリックしたらその位置にワープする。
        // 拡大パネルの外側をクリックした場合は部屋一覧に戻る
        // （パネル内でSではない場所をクリックしても何も起きない）。
        if (menuZoomedRoom) {
            for (const hit of menuEntranceHitRects) {
                if (cx >= hit.hitX && cx <= hit.hitX + hit.hitW && cy >= hit.hitY && cy <= hit.hitY + hit.hitH) {
                    const targetRoom = hit.room;
                    const targetX = hit.x;
                    const targetY = hit.y;
                    isMenuOpen = false;
                    menuZoomedRoom = null;
                    menuZoomPanelRect = null;
                    warpToRoomPosition(targetRoom, targetX, targetY);
                    return;
                }
            }

            if (menuZoomPanelRect) {
                const panelScreenX = menuZoomPanelRect.x;
                const panelScreenY = menuZoomPanelRect.y + MARGIN_HEIGHT;
                const outsidePanel = cx < panelScreenX || cx > panelScreenX + menuZoomPanelRect.w
                    || cy < panelScreenY || cy > panelScreenY + menuZoomPanelRect.h;
                if (outsidePanel) {
                    menuZoomedRoom = null;
                    menuZoomPanelRect = null;
                    draw();
                }
            }
            return;
        }

        // 部屋一覧：部屋をクリックしたら即移動せず、まずその部屋を拡大表示する。
        for (const hit of menuRoomHitRects) {
            if (cx >= hit.x && cx <= hit.x + hit.w && cy >= hit.y && cy <= hit.y + hit.h) {
                menuZoomedRoom = hit.room;
                draw();
                return;
            }
        }
    });
}