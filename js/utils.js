//////////////////////////////////////////////////////////////////////////////
// utils.js — 汎用ユーティリティ
// 複数モジュールから使われる小さな補助関数（脈動スケール・座標キー・境界計算など）。
// 依存: constants.js, state.js
//////////////////////////////////////////////////////////////////////////////

function getPulseScale() {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    return 1 + 0.25 * pulse;
}

function pulseScaleIf(isPulsing) {
    return isPulsing ? getPulseScale() : 1;
}

function cellKey(x, y) {
    return x + ',' + y;
}

function currentRoomBounds() {
    return {
        rx0: currentRoom.x0, rx1: currentRoom.x0 + floorCols,
        ry0: currentRoom.y0, ry1: currentRoom.y0 + floorRows,
    };
}

function mapBounds() {
    return {
        rx0: 0, rx1: mapWidth,
        ry0: 0, ry1: mapHeight,
    };
}

function sinkBlockIntoHole(x, y) {
    grid[y][x] = null;
    staticGrid[y][x] = 'filled_hole';
}

function isOffscreen(px, py) {
    return px < -cellSize || px > BOARD_WIDTH || py < -cellSize || py > BOARD_HEIGHT;
}

// grid/staticGridのディープコピー。アンドゥ履歴の保存と、
// 移動が失敗した時のロールバック用バックアップの両方から使う。
function cloneGrid(g) {
    return g.map(row => row.map(cell => cell ? { ...cell } : null));
}

function cloneStaticGrid(g) {
    return g.map(row => row.slice());
}
