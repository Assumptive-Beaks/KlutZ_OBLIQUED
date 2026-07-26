//////////////////////////////////////////////////////////////////////////////
// laser.js — レーザー光線トレースエンジン
// レーザーの反射・中継・キャンセルなどを計算する光線トレース処理。
// 依存: state.js, utils.js
//////////////////////////////////////////////////////////////////////////////

let segmentBudget = 0;
const MAX_SEGMENTS = 400;
const MAX_DEPTH = 60;
const EPS = 0.001;

function findClosestHit(ox, oy, dx, dy, excludeCells) {
    let closestT = Infinity;
    let candidates = [];
    const { rx0, rx1, ry0, ry1 } = mapBounds();

    for (let worldY = ry0; worldY < ry1; worldY++) {
        for (let x = rx0; x < rx1; x++) {
            if (excludeCells.some(c => c.x === x && c.y === worldY)) continue;

            const entity = grid[worldY][x];
            if (!entity) continue;
            if (entity.type !== 'wall' && entity.type !== 'mirror') continue;

            const x_min = x * cellSize;
            const x_max = (x + 1) * cellSize;
            const y_min = worldY * cellSize;
            const y_max = (worldY + 1) * cellSize;

            let txmin = -Infinity, txmax = Infinity;
            if (dx > 0) {
                txmin = (x_min - ox) / dx;
                txmax = (x_max - ox) / dx;
            } else if (dx < 0) {
                txmin = (x_max - ox) / dx;
                txmax = (x_min - ox) / dx;
            } else {
                if (ox <= x_min || ox >= x_max) continue;
            }

            let tymin = -Infinity, tymax = Infinity;
            if (dy > 0) {
                tymin = (y_min - oy) / dy;
                tymax = (y_max - oy) / dy;
            } else if (dy < 0) {
                tymin = (y_max - oy) / dy;
                tymax = (y_min - oy) / dy;
            } else {
                if (oy <= y_min || oy >= y_max) continue;
            }

            let tmin = Math.max(txmin, tymin);
            let tmax = Math.min(txmax, tymax);

            if (tmin <= tmax + EPS && tmax >= 0) {
                if (tmin > -EPS) {
                    if (tmin < closestT - EPS) {
                        closestT = tmin;
                        candidates = [{ x, y: worldY, type: entity.type, txmin, tymin, txmax, tymax }];
                    } else if (Math.abs(tmin - closestT) <= EPS) {
                        candidates.push({ x, y: worldY, type: entity.type, txmin, tymin, txmax, tymax });
                    }
                }
            }
        }
    }
    return { closestT, candidates };
}

function entersCellInterior(hitX, hitY, ndx, ndy, cellX, cellY) {
    const x_min = cellX * cellSize;
    const x_max = (cellX + 1) * cellSize;
    const y_min = cellY * cellSize;
    const y_max = (cellY + 1) * cellSize;

    let inX = false;
    if (hitX > x_min + EPS && hitX < x_max - EPS) {
        inX = true;
    } else if (Math.abs(hitX - x_min) <= EPS && ndx > EPS) {
        inX = true;
    } else if (Math.abs(hitX - x_max) <= EPS && ndx < -EPS) {
        inX = true;
    }

    let inY = false;
    if (hitY > y_min + EPS && hitY < y_max - EPS) {
        inY = true;
    } else if (Math.abs(hitY - y_min) <= EPS && ndy > EPS) {
        inY = true;
    } else if (Math.abs(hitY - y_max) <= EPS && ndy < -EPS) {
        inY = true;
    }

    return inX && inY;
}

function reflectAtCell(cell, hitX, hitY, dx, dy) {
    const x_min = cell.x * cellSize, x_max = (cell.x + 1) * cellSize;
    const y_min = cell.y * cellSize, y_max = (cell.y + 1) * cellSize;

    const isLeft = Math.abs(hitX - x_min) < 0.1;
    const isRight = Math.abs(hitX - x_max) < 0.1;
    const isTop = Math.abs(hitY - y_min) < 0.1;
    const isBottom = Math.abs(hitY - y_max) < 0.1;

    let hitSide = 'horizontal';
    if (Math.abs(cell.txmin - cell.tymin) < EPS) {
        hitSide = 'both';
    } else if (cell.txmin > cell.tymin) {
        hitSide = 'vertical';
    }

    let ndx = dx, ndy = dy;

    if (hitSide === 'both' || ((isLeft || isRight) && (isTop || isBottom))) {
        const distLT = Math.hypot(hitX - x_min, hitY - y_min);
        const distRT = Math.hypot(hitX - x_max, hitY - y_min);
        const distLB = Math.hypot(hitX - x_min, hitY - y_max);
        const distRB = Math.hypot(hitX - x_max, hitY - y_max);
        const minDistCorner = Math.min(distLT, distRT, distLB, distRB);

        if (minDistCorner === distRT || minDistCorner === distLB) {
            ndx = dy; ndy = dx;
        } else {
            ndx = -dy; ndy = -dx;
        }
    } else {
        if (hitSide === 'vertical') {
            ndx = -dx;
        } else {
            ndy = -dy;
        }
    }

    return { ndx, ndy };
}

function traceRay(ox, oy, dx, dy, excludeCells, depth) {
    if (depth > MAX_DEPTH || segmentBudget > MAX_SEGMENTS) return;

    const { closestT, candidates } = findClosestHit(ox, oy, dx, dy, excludeCells);

    if (candidates.length === 0) {
        laserSegments.push({ x1: ox, y1: oy, x2: ox + dx * 3000, y2: oy + dy * 3000 });
        segmentBudget++;
        return;
    }

    const hitX = ox + closestT * dx;
    const hitY = oy + closestT * dy;

    laserSegments.push({ x1: ox, y1: oy, x2: hitX, y2: hitY });
    segmentBudget++;

    for (const c of candidates) {
        laserHitCells.add(cellKey(c.x, c.y));
    }

    const nextExclude = candidates.map(c => ({ x: c.x, y: c.y }));

    let reflections = [];
    let hitMirror = false;

    for (const cell of candidates) {
        if (cell.type === 'mirror') {
            hitMirror = true;
            const { ndx, ndy } = reflectAtCell(cell, hitX, hitY, dx, dy);
            if (!reflections.some(r => Math.abs(r.ndx - ndx) < 0.01 && Math.abs(r.ndy - ndy) < 0.01)) {
                reflections.push({ ndx, ndy });
            }
        }
    }

    if (!hitMirror) {
        reflections.push({ ndx: dx, ndy: dy });
    }

    const { rx0, rx1, ry0, ry1 } = mapBounds();
    for (const ref of reflections) {
        let blocked = false;
        const centerCX = Math.floor(hitX / cellSize);
        const centerCY = Math.floor(hitY / cellSize);

        for (let y = centerCY - 1; y <= centerCY + 1; y++) {
            for (let x = centerCX - 1; x <= centerCX + 1; x++) {
                if (y >= ry0 && y < ry1 && x >= rx0 && x < rx1) {
                    const cell = grid[y][x];
                    if (cell && cell.type === 'wall') {
                        if (entersCellInterior(hitX, hitY, ref.ndx, ref.ndy, x, y)) {
                            blocked = true;
                            break;
                        }
                    }
                }
            }
            if (blocked) break;
        }

        if (!blocked) {
            traceRay(hitX, hitY, ref.ndx, ref.ndy, nextExclude, depth + 1);
        }
    }
}

function calculateLaser() {
    laserSegments = [];
    laserCancelSegments = [];
    laserHitCells = new Set();
    segmentBudget = 0;

    for (const floorKey in ROOMS) {
        for (const room of ROOMS[floorKey]) {
            fireRoomLaser(room);
        }
    }

    const separated = cancelOverlappingSegments(laserSegments);
    laserSegments = separated.active;
    laserCancelSegments = separated.canceled;
}

function fireRoomLaser(room) {
    if (!room.laserPos || room.relays.length === 0) return;

    const ox = room.laserPos.x * cellSize;
    const oy = room.laserPos.y * cellSize;

    let closestRelay = null;
    let minDist = Infinity;

    if (room === currentRoom) {
        const pCx = playerPos.x * cellSize + cellSize / 2;
        const pCy = playerPos.y * cellSize + cellSize / 2;
        for (const r of room.relays) {
            const d = Math.hypot(r.x * cellSize - pCx, r.y * cellSize - pCy);
            if (d < minDist) { minDist = d; closestRelay = r; }
        }
    } else {
        for (const r of room.relays) {
            const d = Math.hypot(r.x * cellSize - ox, r.y * cellSize - oy);
            if (d < minDist) { minDist = d; closestRelay = r; }
        }
    }

    if (!closestRelay) return;

    let dx = closestRelay.x * cellSize - ox;
    let dy = closestRelay.y * cellSize - oy;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    dx /= len; dy /= len;

    traceRay(ox, oy, dx, dy, [], 0);
}

function cancelOverlappingSegments(segments) {
    if (segments.length === 0) return { active: [], canceled: [] };

    const LINE_PREC = 1000;
    const lineInfo = new Map();
    const lineIntervals = new Map();

    for (const seg of segments) {
        const x1 = seg.x1, y1 = seg.y1, x2 = seg.x2, y2 = seg.y2;
        let dx = x2 - x1, dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length < EPS) continue;
        let ux = dx / length, uy = dy / length;
        if (ux < -EPS || (Math.abs(ux) <= EPS && uy < 0)) {
            ux = -ux; uy = -uy;
        }
        const offset = x1 * uy - y1 * ux;
        const lineKey = Math.round(ux * LINE_PREC) + '_' + Math.round(uy * LINE_PREC) + '_' + Math.round(offset * LINE_PREC);

        if (!lineInfo.has(lineKey)) {
            lineInfo.set(lineKey, { ox: x1, oy: y1, ux, uy });
        }
        const info = lineInfo.get(lineKey);

        const t1 = (x1 - info.ox) * info.ux + (y1 - info.oy) * info.uy;
        const t2 = (x2 - info.ox) * info.ux + (y2 - info.oy) * info.uy;
        const tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);

        if (!lineIntervals.has(lineKey)) lineIntervals.set(lineKey, []);
        lineIntervals.get(lineKey).push([tmin, tmax]);
    }

    const active = [];
    const canceled = [];
    for (const [lineKey, intervals] of lineIntervals) {
        const info = lineInfo.get(lineKey);
        const pts = new Map();
        for (const [tmin, tmax] of intervals) {
            pts.set(tmin, (pts.get(tmin) || 0) + 1);
            pts.set(tmax, (pts.get(tmax) || 0) - 1);
        }
        const sortedTs = Array.from(pts.keys()).sort((a, b) => a - b);

        let coverage = 0;
        for (let i = 0; i < sortedTs.length - 1; i++) {
            const t = sortedTs[i];
            coverage += pts.get(t);
            const tNext = sortedTs[i + 1];
            if (tNext - t > EPS) {
                const piece = {
                    x1: info.ox + info.ux * t, y1: info.oy + info.uy * t,
                    x2: info.ox + info.ux * tNext, y2: info.oy + info.uy * tNext,
                };
                if (coverage === 1) {
                    active.push(piece);
                } else if (coverage >= 2) {
                    canceled.push(piece);
                }
            }
        }
    }
    return { active, canceled };
}

function pointToSegmentDistance(x, y, x1, y1, x2, y2) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(x - x1, y - y1);
    let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function isRelayHit(r) {
    const rX = r.x * cellSize;
    const rY = r.y * cellSize;
    for (const seg of laserSegments) {
        if (pointToSegmentDistance(rX, rY, seg.x1, seg.y1, seg.x2, seg.y2) < 0.05) return true;
    }
    return false;
}
