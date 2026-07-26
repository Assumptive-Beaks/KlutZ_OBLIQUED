//////////////////////////////////////////////////////////////////////////////
// world.js — テンプレート解析 & ワールド構築
// RAW_TEMPLATEを解析して部屋・壁・穴・レーザー等の配置を作る処理。
// 依存: stage-data.js, constants.js, state.js
//////////////////////////////////////////////////////////////////////////////

const ORGAN_NAMES = ['brain', 'lung', 'heart', 'liver', 'kidney'];

// 部屋の各行から臓器ラベル（例: "_brain_" や ".lung.."）を検出する。
// 見つかった場合は {organ, row}（rowは部屋内ローカルの行番号）を返し、
// 無ければnullを返す。この行が、臓器の描画・当たり判定の中心になる。
function detectOrganInRoomLines(roomLines) {
    for (let row = 0; row < roomLines.length; row++) {
        const line = roomLines[row];
        const interior = line.slice(1, floorCols - 1);
        const match = interior.match(/^[._]*([a-z]+)[._]*$/);
        if (match && ORGAN_NAMES.includes(match[1])) {
            return { organ: match[1], row };
        }
    }
    return null;
}

function parseTemplate() {
    const lines = RAW_TEMPLATE.split('\n').map(l => l.split('//')[0]);

    const bandMeta = [];
    for (let i = 0; i < BAND_ROOM_COUNTS.length; i++) {
        const topSep = BAND_SEPS[i], bottomSep = BAND_SEPS[i + 1];
        const floor = BAND_ROOM_COUNTS[i];
        const bLine = lines[bottomSep];
        const trimmed = bLine.replace(/^\.*/, '');
        const indent = bLine.length - trimmed.length;
        bandMeta.push({ floor, roomCount: BAND_ROOM_COUNTS[i], indent, topSep, bottomSep });
    }
    const roomCountByFloor = {};
    bandMeta.forEach(m => roomCountByFloor[m.floor] = m.roomCount);

    ROOMS = {};
    for (const meta of bandMeta) {
        ROOMS[meta.floor] = [];
        for (let j = 0; j < meta.roomCount; j++) {
            const x0 = meta.indent + j * 8;
            const y0 = meta.topSep;
            const roomLines = [];
            for (let r = 0; r < floorRows; r++) {
                const line = lines[meta.topSep + r] || '';
                let seg = line.substring(x0, x0 + floorCols);
                while (seg.length < floorCols) seg += 'W';
                roomLines.push(seg);
            }

            const goalsRaw = [];
            const row0 = roomLines[0];
            for (let lx = 0; lx < floorCols; lx++) {
                if (row0[lx] === 'S') goalsRaw.push({ x: x0 + lx, y: y0, localX: lx });
            }
            const entrancesRaw = [];
            const row8 = roomLines[floorRows - 1];
            for (let lx = 0; lx < floorCols; lx++) {
                if (row8[lx] === 'S') entrancesRaw.push({ x: x0 + lx, y: y0 + floorRows - 1, localX: lx });
            }

            goalsRaw.sort((a, b) => a.localX - b.localX);
            goalsRaw.forEach((g, gi) => {
                g.side = (goalsRaw.length === 2) ? (gi === 0 ? 'left' : 'right') : (g.localX < floorCols / 2 ? 'left' : 'right');
            });
            entrancesRaw.sort((a, b) => a.localX - b.localX);
            entrancesRaw.forEach((e, ei) => {
                e.side = (entrancesRaw.length === 2) ? (ei === 0 ? 'small' : 'large') : (e.localX < floorCols / 2 ? 'small' : 'large');
            });

            goalsRaw.forEach(g => {
                if (meta.floor < MAX_FLOOR) {
                    g.target = (g.side === 'left') ? { floor: meta.floor + 1, index: j } : { floor: meta.floor + 1, index: j + 1 };
                } else {
                    g.target = null;
                }
            });
            entrancesRaw.forEach(e => {
                if (meta.floor > 1) {
                    const parentIndex = (e.side === 'small') ? j - 1 : j;
                    const parentRoomCount = roomCountByFloor[meta.floor - 1];
                    e.parent = (parentIndex >= 0 && parentIndex < parentRoomCount) ? { floor: meta.floor - 1, index: parentIndex } : null;
                } else {
                    e.parent = null;
                }
            });

            let laser = null;
            const roomRelays = [];
            const roomEnemy = [];
            for (let ly = 0; ly < floorRows; ly++) {
                for (let lx = 0; lx < floorCols; lx++) {
                    const ch = roomLines[ly][lx];
                    const wx = x0 + lx, wy = y0 + ly;
                    if (ch === 'L') laser = { x: wx, y: wy };
                    else if (ch === 'R') roomRelays.push({ x: wx, y: wy });
                    else if (ch === 'E') roomEnemy.push({ x: wx, y: wy, facing: 1 });
                }
            }

            const organInfo = detectOrganInRoomLines(roomLines);
            ROOMS[meta.floor].push({
                floor: meta.floor, index: j, x0, y0,
                id: `${meta.floor}F-${j + 1}`,
                goalsRaw, entrancesRaw,
                laserPos: laser, relays: roomRelays,
                enemy: roomEnemy,
                organ: organInfo ? organInfo.organ : null,
                organRow: organInfo ? organInfo.row : null,
                organConsumed: false,
            });
        }
    }

    for (const floorKey in ROOMS) {
        for (const room of ROOMS[floorKey]) {
            room.goals = room.goalsRaw.map(g => {
                let to = null;
                if (g.target) {
                    const targetRoom = ROOMS[g.target.floor][g.target.index];
                    const matched = targetRoom.entrancesRaw.find(e => e.parent && e.parent.floor === room.floor && e.parent.index === room.index);
                    if (matched) to = { floor: g.target.floor, index: g.target.index, x: matched.x, y: matched.y };
                }
                return { x: g.x, y: g.y, to };
            });
            room.entrances = room.entrancesRaw.map(e => {
                let from = null;
                if (e.parent) {
                    const parentRoom = ROOMS[e.parent.floor][e.parent.index];
                    const matched = parentRoom.goalsRaw.find(g => g.target && g.target.floor === room.floor && g.target.index === room.index);
                    if (matched) from = { floor: e.parent.floor, index: e.parent.index, x: matched.x, y: matched.y };
                }
                return { x: e.x, y: e.y, from };
            });
        }
    }

    ROOMS_BY_ID = {};
    ALL_ROOMS = [];
    for (let f = 1; f <= MAX_FLOOR; f++) {
        for (const room of ROOMS[f]) {
            ROOMS_BY_ID[room.id] = room;
            ALL_ROOMS.push(room);
        }
    }

    const consumed = new Set();
    for (const room of ALL_ROOMS) {
        for (const g of room.goalsRaw) consumed.add(g.x + ',' + g.y);
        for (const e of room.entrancesRaw) consumed.add(e.x + ',' + e.y);
    }
    finalGoalCells = [];
    for (let y = 0; y < lines.length; y++) {
        const line = lines[y];
        for (let x = 0; x < line.length; x++) {
            if (line[x] === 'S' && !consumed.has(x + ',' + y)) {
                finalGoalCells.push({ x, y });
            }
        }
    }
}

function buildWorldGrid() {
    const lines = RAW_TEMPLATE.split('\n').map(l => l.split('//')[0]);
    mapHeight = lines.length;
    mapWidth = Math.max(...lines.map(l => l.length));

    canvas.width = BOARD_WIDTH;
    canvas.height = BOARD_HEIGHT + MARGIN_HEIGHT * 2;

    staticGrid = Array.from({ length: mapHeight }, () => Array(mapWidth).fill('floor'));
    grid = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(null));
    holeVariant = Array.from({ length: mapHeight }, () => Array(mapWidth).fill(0));

    for (let y = 0; y < mapHeight; y++) {
        const line = lines[y] || '';
        for (let x = 0; x < mapWidth; x++) {
            const ch = (x < line.length) ? line[x] : '.';
            if (ch === 'H') {
                staticGrid[y][x] = 'hole';
                holeVariant[y][x] = Math.floor(Math.random() * TILE_IMAGE_SOURCES.hole.length);
            } else if (ch === 'W') {
                grid[y][x] = { type: 'wall' };
            } else if (ch === 'M') {
                grid[y][x] = { type: 'mirror' };
            } else if (ch === '_' || /[a-z]/.test(ch)) {
                // 臓器部屋の余白('_')とラベル文字（brain等）は何も描画しない
                staticGrid[y][x] = 'blank';
            }
        }
    }
}

function resetWorld() {
    buildWorldGrid();
    history = [];
}

// 指定した部屋(room)の範囲だけを、テンプレートの初期状態(壁・鏡・穴・床)に戻す。
// grid/staticGridはワールド全体で共有・永続化されているため、部屋を移動しても
// 押したブロックや埋めた穴はそのまま残る。メニューからのワープ時に、その部屋の
// 進行状況をリセットしたい場合はこの関数を呼ぶ（loop.jsのwarpToRoomPositionから使用）。
function resetRoomGrid(room) {
    const lines = RAW_TEMPLATE.split('\n').map(l => l.split('//')[0]);
    for (let ly = 0; ly < floorRows; ly++) {
        const worldY = room.y0 + ly;
        const line = lines[worldY] || '';
        for (let lx = 0; lx < floorCols; lx++) {
            const worldX = room.x0 + lx;
            const ch = (worldX < line.length) ? line[worldX] : '.';

            staticGrid[worldY][worldX] = 'floor';
            grid[worldY][worldX] = null;
            holeVariant[worldY][worldX] = 0;

            if (ch === 'H') {
                staticGrid[worldY][worldX] = 'hole';
                holeVariant[worldY][worldX] = Math.floor(Math.random() * TILE_IMAGE_SOURCES.hole.length);
            } else if (ch === 'W') {
                grid[worldY][worldX] = { type: 'wall' };
            } else if (ch === 'M') {
                grid[worldY][worldX] = { type: 'mirror' };
            } else if (ch === '_' || /[a-z]/.test(ch)) {
                // 臓器部屋の余白('_')とラベル文字（brain等）は何も描画しない
                staticGrid[worldY][worldX] = 'blank';
            }
        }
    }
}