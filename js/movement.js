//////////////////////////////////////////////////////////////////////////////
// movement.js — プレイヤー移動・当たり判定
// 移動処理、穴/レーザーの当たり判定、各種クリア条件の判定。
// 依存: state.js, utils.js, world.js, laser.js
//////////////////////////////////////////////////////////////////////////////

function holeIsBridged(cellX, cellY) {
    const x_min = cellX * cellSize;
    const x_max = (cellX + 1) * cellSize;
    const y_min = cellY * cellSize;
    const y_max = (cellY + 1) * cellSize;
    const EPS = 0.001;

    for (const seg of laserSegments) {
        const x1 = seg.x1, y1 = seg.y1, x2 = seg.x2, y2 = seg.y2;
        const dx = x2 - x1, dy = y2 - y1;
        const seg_len = Math.hypot(dx, dy);

        if (seg_len < EPS) {
            if (x1 > x_min + EPS && x1 < x_max - EPS && y1 > y_min + EPS && y1 < y_max - EPS) return true;
            continue;
        }

        const ux = dx / seg_len;
        const uy = dy / seg_len;

        let txmin = -Infinity, txmax = Infinity;
        if (ux > EPS) {
            txmin = (x_min - x1) / ux; txmax = (x_max - x1) / ux;
        } else if (ux < -EPS) {
            txmin = (x_max - x1) / ux; txmax = (x_min - x1) / ux;
        } else {
            if (x1 <= x_min || x1 >= x_max) continue;
        }

        let tymin = -Infinity, tymax = Infinity;
        if (uy > EPS) {
            tymin = (y_min - y1) / uy; tymax = (y_max - y1) / uy;
        } else if (uy < -EPS) {
            tymin = (y_max - y1) / uy; tymax = (y_min - y1) / uy;
        } else {
            if (y1 <= y_min || y1 >= y_max) continue;
        }

        const tmin = Math.max(txmin, tymin, 0.0);
        const tmax = Math.min(txmax, tymax, seg_len);

        if (tmax - tmin > EPS) return true;
    }
    return false;
}

function cellTouchedByLaser(cellX, cellY) {
    return holeIsBridged(cellX, cellY);
}

// 死亡/クリア演出は「少し間を置いてからオーバーレイをフェードイン」という
// 同じ形が複数箇所から呼ばれるため、ここに集約する。
function showDeathOverlay() {
    setTimeout(() => { deathOverlay.classList.add('active'); }, 200);
}

function showClearOverlay() {
    setTimeout(() => { endingOverlay.classList.add('active'); }, 300);
}

function canBridge(entity) {
    if (!entity) return false;
    if (entity.type === 'wall' && !entity.merged) return false;
    return true;
}

// プレイヤーがブロック(壁/鏡)と同じマスに埋まっているか判定する。
// 埋まっている場合、そのブロックが穴の上に浮いていてもプレイヤーは
// 落下扱いにならない（レーザー判定には影響しない）。
function isPlayerEmbeddedInBlock() {
    const ent = grid[playerPos.y] && grid[playerPos.y][playerPos.x];
    return !!ent && (ent.type === 'wall' || ent.type === 'mirror');
}

// 敵(E)を1体、(dx, dy)方向へ動かそうと試みる。
// プレイヤーと同じ押し判定を使うが、押せない場合はその敵だけが
// その場に留まり（ターン全体は取り消さない）、S判定・死亡判定は一切行わない。
function tryMoveEnemy(entity, dx, dy) {
    const nx = entity.x + dx;
    const ny = entity.y + dy;
    const { rx0, rx1, ry0, ry1 } = currentRoomBounds();

    if (nx < rx0 || nx >= rx1 || ny < ry0 || ny >= ry1) return;

    let pushedBlock = false;
    const targetEntity = grid[ny][nx];
    let pendingHolePush = null;

    if (targetEntity !== null) {
        const nnx = nx + dx;
        const nny = ny + dy;

        if (nnx < rx0 || nnx >= rx1 || nny < ry0 || nny >= ry1) {
            return; // 押せないので動かない
        }

        let placedEntity = targetEntity;
        const existingEntity = grid[nny][nnx];
        if (existingEntity !== null) {
            if (targetEntity.type === 'mirror' && existingEntity.type === 'mirror') {
                placedEntity = { type: 'wall', merged: true };
            } else {
                return; // 押せないので動かない
            }
        }

        grid[ny][nx] = null;
        grid[nny][nnx] = placedEntity;
        pushedBlock = true;

        if (staticGrid[nny][nnx] === 'hole') {
            pendingHolePush = { x: nnx, y: nny };
        }
    }

    if (!pushedBlock) {
        entity.x = nx;
        entity.y = ny;
    }

    if (pendingHolePush) {
        calculateLaser();
        const pushedEntity = grid[pendingHolePush.y][pendingHolePush.x];
        let bridged = false, touched = false;
        if (canBridge(pushedEntity)) {
            touched = laserHitCells.has(cellKey(pendingHolePush.x, pendingHolePush.y));
            bridged = holeIsBridged(pendingHolePush.x, pendingHolePush.y);
        }
        if (!(bridged || touched)) {
            sinkBlockIntoHole(pendingHolePush.x, pendingHolePush.y);
        }
    }
}

// 入力方向(dx, dy)の真逆へ、部屋にいる全ての敵を動かす。
// プレイヤーと同様、左右に動いたときだけ向き(facing)を更新する（上下の向きは無い）。
function moveEnemies(dx, dy) {
    const rdx = -dx, rdy = -dy;
    for (const entity of enemy) {
        if (rdx !== 0) entity.facing = rdx > 0 ? 1 : -1;
        tryMoveEnemy(entity, rdx, rdy);
    }
}

function playerHitByLaser(cellX, cellY) {
    const pCx = cellX * cellSize + cellSize / 2;
    const pCy = cellY * cellSize + cellSize / 2;

    for (const seg of laserSegments) {
        if (pointToSegmentDistance(pCx, pCy, seg.x1, seg.y1, seg.x2, seg.y2) < 16) {
            return true;
        }
    }
    return false;
}

// プレイヤーが立っているマスが穴かどうかを判定して死亡フラグを立てる。
// ブロック(壁/鏡)に埋まっている間はそのブロックが浮き代わりになるため対象外。
// 部屋への到着時(checkArrivalHazards)と通常移動時(tryMovePlayer)の
// 両方から呼ばれる、意図的に共有された判定。
function applyHoleDeathCheck() {
    if (isPlayerEmbeddedInBlock()) return;
    if (staticGrid[playerPos.y][playerPos.x] !== 'hole') return;
    if (!holeIsBridged(playerPos.x, playerPos.y)) {
        isPlayerDead = true;
    }
}

function checkArrivalHazards() {
    if (isPlayerDead || gameCleared || allStageCleared) return;

    applyHoleDeathCheck();

    if (!isPlayerDead && playerHitByLaser(playerPos.x, playerPos.y)) {
        isPlayerDead = true;
    }

    if (!isPlayerDead && enemy.some(e => e.x === playerPos.x && e.y === playerPos.y)) {
        isPlayerDead = true;
    }

    if (isPlayerDead) {
        showDeathOverlay();
    }
}

function tryMovePlayer(dx, dy) {
    if (isPlayerDead || gameCleared || allStageCleared || isOrganEventActive) return;

    if (dx !== 0) playerFacing = dx > 0 ? 1 : -1;

    if (dy < 0) {
        playerPose = 'up';
        playerPoseTimer = performance.now() + 120;
    } else if (dy > 0) {
        playerPose = 'down';
        playerPoseTimer = performance.now() + 120;
    }

    const nx = playerPos.x + dx;
    const ny = playerPos.y + dy;
    const { rx0, rx1, ry0, ry1 } = currentRoomBounds();
    const inBounds = !(nx < rx0 || nx >= rx1 || ny < ry0 || ny >= ry1);

    saveState();

    const backupGrid = cloneGrid(grid);
    const backupStaticGrid = cloneStaticGrid(staticGrid);
    const backupPlayerPos = { ...playerPos };

    let success = inBounds;
    let pushedBlock = false;
    let pendingHolePush = null;

    if (success) {
        const currentEntity = grid[playerPos.y][playerPos.x];
        const targetEntity = grid[ny][nx];

        // 救済ルール：何らかの理由でKlutZがM(鏡)やW(壁)のマスに埋まってしまった場合、
        // 隣接マスが同じ種類(M→M, W→W)であれば、ブロックを押すことなくそのまま移動できる。
        const isEmbeddedEscape = isPlayerEmbeddedInBlock()
            && !!targetEntity && targetEntity.type === currentEntity.type;

        if (isEmbeddedEscape) {
            pushedBlock = false;
        } else if (targetEntity !== null) {
            const nnx = nx + dx;
            const nny = ny + dy;

            let placedEntity = targetEntity;
            if (nnx < rx0 || nnx >= rx1 || nny < ry0 || nny >= ry1) {
                success = false;
            } else {
                const existingEntity = grid[nny][nnx];
                if (existingEntity !== null) {
                    if (targetEntity.type === 'mirror' && existingEntity.type === 'mirror') {
                        placedEntity = { type: 'wall', merged: true };
                    } else {
                        success = false;
                    }
                }
            }

            if (success) {
                grid[ny][nx] = null;
                grid[nny][nnx] = placedEntity;
                pushedBlock = true;

                if (staticGrid[nny][nnx] === 'hole') {
                    pendingHolePush = { x: nnx, y: nny };
                }
            }
        }
    }

    if (!success) {
        // プレイヤー自身は壁や境界に阻まれて動けなかった場合でも、
        // 敵(E)はこの入力に対して移動を試みる（このあと共通の処理に続く）。
        grid = backupGrid;
        staticGrid = backupStaticGrid;
        playerPos = backupPlayerPos;
    } else if (!pushedBlock) {
        playerPos = { x: nx, y: ny };
    }

    // ブロックを押しただけ、あるいは壁に阻まれて動けなかった等でプレイヤー自身の
    // 座標が変わっていない場合、その場に留まったまま"S"の画面遷移（ゴール/入口）が
    // 起きないようにする。
    const playerPositionChanged = playerPos.x !== backupPlayerPos.x || playerPos.y !== backupPlayerPos.y;

    if (pendingHolePush) {
        calculateLaser();
        const pushedEntity = grid[pendingHolePush.y][pendingHolePush.x];
        let bridged = false, touched = false;
        if (canBridge(pushedEntity)) {
            touched = laserHitCells.has(cellKey(pendingHolePush.x, pendingHolePush.y));
            bridged = holeIsBridged(pendingHolePush.x, pendingHolePush.y);
        }
        if (!(bridged || touched)) {
            sinkBlockIntoHole(pendingHolePush.x, pendingHolePush.y);
        }
    }

    // 敵(E)：プレイヤーの入力と真逆の方向へ、同じ押し処理で動く。
    // Sを踏んでも画面遷移せず、穴やレーザーで死ぬこともない。
    const enemyPositionsBeforeMove = enemy.map(e => ({ x: e.x, y: e.y }));
    moveEnemies(dx, dy);

    // 敵とプレイヤーが「接触」した場合、プレイヤーが死ぬ。
    // 接触は (1) 同じマスに来た場合 と (2) 互いの位置を入れ替えるように
    // すれ違った場合 の両方を含む。
    for (let i = 0; i < enemy.length; i++) {
        const before = enemyPositionsBeforeMove[i];
        const after = enemy[i];
        const sameCell = after.x === playerPos.x && after.y === playerPos.y;
        const swapped = before.x === playerPos.x && before.y === playerPos.y
            && after.x === backupPlayerPos.x && after.y === backupPlayerPos.y;
        if (sameCell || swapped) {
            isPlayerDead = true;
            break;
        }
    }

    calculateLaser();
    applyHoleDeathCheck();

    {
        for (let wy = ry0; wy < ry1; wy++) {
            for (let wx = rx0; wx < rx1; wx++) {
                const ent = grid[wy][wx];
                if (!ent || (ent.type !== 'wall' && ent.type !== 'mirror')) continue;
                if (staticGrid[wy][wx] !== 'hole') continue;
                if (!canBridge(ent)) {
                    sinkBlockIntoHole(wx, wy);
                    calculateLaser();
                    continue;
                }
                if (laserHitCells.has(cellKey(wx, wy))) continue;
                if (!holeIsBridged(wx, wy)) {
                    sinkBlockIntoHole(wx, wy);
                    calculateLaser();
                }
            }
        }
    }

    if (!isPlayerDead && playerHitByLaser(playerPos.x, playerPos.y)) {
        isPlayerDead = true;
    }

    if (!isPlayerDead) {
        if (playerPositionChanged) {
            checkFinalClearCondition();
            checkClearCondition();
            checkBackToPreviousFloor();
        }
        checkOrganTrigger();
    }

    draw();

    if (isPlayerDead) {
        showDeathOverlay();
    }
}

function checkFinalClearCondition() {
    if (isPlayerDead || gameCleared || allStageCleared) return;
    for (const fg of finalGoalCells) {
        if (playerPos.x === fg.x && playerPos.y === fg.y) {
            markSpotReached(fg.x, fg.y);
            allStageCleared = true;
            playEndingSequence();
            return;
        }
    }
}

function checkClearCondition() {
    if (isPlayerDead) return;
    for (const goal of currentRoom.goals) {
        if (playerPos.x === goal.x && playerPos.y === goal.y) {
            markSpotReached(goal.x, goal.y);
            if (goal.to) {
                startTransition(ROOMS[goal.to.floor][goal.to.index], goal.x, goal.y, goal.to.x, goal.to.y);
            } else {
                gameCleared = true;
                showClearOverlay();
            }
            return;
        }
    }
}

function checkBackToPreviousFloor() {
    if (isPlayerDead) return;
    for (const entrance of currentRoom.entrances) {
        if (playerPos.x === entrance.x && playerPos.y === entrance.y && entrance.from) {
            markSpotReached(entrance.x, entrance.y);
            startTransition(ROOMS[entrance.from.floor][entrance.from.index], entrance.x, entrance.y, entrance.from.x, entrance.from.y);
            return;
        }
    }
}