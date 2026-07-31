//////////////////////////////////////////////////////////////////////////////
// render.js — 描画(Rendering)
// 毎フレームの描画処理一式（盤面・メニュー・レーザー演出など）。
// 依存: state.js, utils.js, assets.js, laser.js
//////////////////////////////////////////////////////////////////////////////

const RELAY_NODE_COLORS = ['#e11d48', '#3b82f6', '#a855f7'];

function drawRelayFallback(cx, cy, index, scale) {
    const s = scale || 1;
    const color = RELAY_NODE_COLORS[index % RELAY_NODE_COLORS.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - 3 * s, cy - 3 * s, 2 * s, 0, Math.PI * 2);
    ctx.fill();
}

function drawVesselBeamSegment(x1, y1, x2, y2, variant) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;

    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    const steps = Math.max(2, Math.min(40, Math.floor(len / 20)));
    const waveAmp = 2.5;
    const t0 = performance.now() / 480;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bx = x1 + dx * t;
        const by = y1 + dy * t;
        const fade = Math.sin(t * Math.PI);
        const wobble = Math.sin(t * Math.PI * 3 + t0) * waveAmp * fade;
        const wx = bx + nx * wobble;
        const wy = by + ny * wobble;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
    }

    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const isVein = variant === 'vein';

    ctx.strokeStyle = isVein ? 'rgba(30, 58, 138, 0.9)' : 'rgba(127, 29, 29, 0.9)';
    ctx.lineWidth = 6 + pulse * 1.5;
    ctx.stroke();

    ctx.strokeStyle = isVein ? 'rgba(37, 99, 235, 0.9)' : 'rgba(220, 38, 38, 0.9)';
    ctx.lineWidth = 3.5 + pulse;
    ctx.stroke();

    ctx.strokeStyle = isVein ? 'rgba(191, 219, 254, 0.55)' : 'rgba(255, 205, 205, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, MARGIN_HEIGHT);
    ctx.fillRect(0, canvas.height - MARGIN_HEIGHT, canvas.width, MARGIN_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font = '18px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(currentRoom ? currentRoom.id : '', 12, MARGIN_HEIGHT / 2);

    ctx.textAlign = 'right';
    ctx.fillText('Menu: Q  Undo: E', canvas.width - 12, canvas.height - MARGIN_HEIGHT / 2);

    if (isMenuOpen) {
        ctx.textAlign = 'left';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#facc15';
        const menuHintText = menuZoomedRoom
            ? 'Choose spot'
            : 'Choose room';
        ctx.fillText(menuHintText, 12, canvas.height - MARGIN_HEIGHT / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px sans-serif';
    }

    ctx.save();
    ctx.translate(0, MARGIN_HEIGHT);

    if (isScrolling && nextRoom) {
        drawRoomAndEntities(currentRoom, -cameraX, -cameraY);
        drawRoomAndEntities(nextRoom, slideOffsetX - cameraX, slideOffsetY - cameraY);
        drawLaserOverlay(-cameraX, -cameraY);
    } else {
        drawRoomAndEntities(currentRoom, 0, 0);
        drawLaserOverlay(0, 0);
    }

    const activeRoom = isScrolling && nextRoom ? nextRoom : currentRoom;
    const activeOffX = isScrolling ? (slideOffsetX - cameraX) : 0;
    const activeOffY = isScrolling ? (slideOffsetY - cameraY) : 0;

    let pRenderX = (playerPos.x - activeRoom.x0) * cellSize + activeOffX;
    let pRenderY = (playerPos.y - activeRoom.y0) * cellSize + activeOffY;

    const playerScale = pulseScaleIf(!isScrolling && cellTouchedByLaser(playerPos.x, playerPos.y));
    const pSize = cellSize * 1.2 * playerScale;
    const pCx = pRenderX + cellSize / 2, pCy = pRenderY + cellSize / 2;
    let playerImage = 'player';

    if (playerPoseTimer > performance.now()) {
        if (playerPose === 'up') {
            playerImage = 'player_up';
        } else if (playerPose === 'down') {
            playerImage = 'player_down';
        }
    } else {
        playerPose = null;
    }
    if (!isEndingSequence) {
        if (isPlayerDead) {
            if (!drawTileImage('player_dead', pCx, pCy, pSize, true)) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(pCx - pSize / 2 + 12, pCy - pSize / 2 + 12); ctx.lineTo(pCx + pSize / 2 - 12, pCy + pSize / 2 - 12);
            ctx.moveTo(pCx + pSize / 2 - 12, pCy - pSize / 2 + 12); ctx.lineTo(pCx - pSize / 2 + 12, pCy + pSize / 2 - 12);
            ctx.stroke();
            }
        } else {
            ctx.save();
            if (playerFacing === -1) {
                ctx.translate(pCx, pCy);
                ctx.scale(-1, 1);
                ctx.translate(-pCx, -pCy);
            }
            if (!drawTileImage(playerImage, pCx, pCy, pSize, true)) {
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(pCx, pCy, pSize * 0.38, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    if (isMenuOpen) {
        drawMenuOverlay();
    }

    if (isOrganEventActive && organOverlayText) {
        drawOrganTextOverlay(organOverlayText);
    }

    ctx.restore();
}

// 臓器演出中に1文ずつ表示するフレーズ。WORDS_10Fの表示演出を踏襲し、
// 半透明の白背景の上に太字テキストを中央寄せで描画する。
function drawOrganTextOverlay(text) {
    const cx = BOARD_WIDTH / 2;
    const cy = BOARD_HEIGHT / 2;
    const maxWidth = BOARD_WIDTH * 0.85;
    let fontSize = Math.round(cellSize * 1.4);

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (fontSize > 8 && ctx.measureText(text).width > maxWidth) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px sans-serif`;
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
    ctx.restore();
}

function drawMenuOverlay() {
    menuRoomHitRects = [];

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.clip();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    const scale = Math.min(BOARD_WIDTH / mapWidth, BOARD_HEIGHT / mapHeight);
    const mapPxW = mapWidth * scale;
    const mapPxH = mapHeight * scale;
    const originX = (BOARD_WIDTH - mapPxW) / 2;
    const originY = (BOARD_HEIGHT - mapPxH) / 2;
    const cellPx = Math.ceil(scale);

    for (const room of ALL_ROOMS) {
        const roomEnemies = (room === currentRoom) ? enemy : room.enemy;
        for (let ly = 0; ly < floorRows; ly++) {
            const worldY = room.y0 + ly;
            for (let lx = 0; lx < floorCols; lx++) {
                const worldX = room.x0 + lx;
                const cx = originX + worldX * scale;
                const cy = originY + worldY * scale;
                const cell = grid[worldY][worldX];
                const staticType = staticGrid[worldY][worldX];
                const hasEnemy = roomEnemies.some(e => e.x === worldX && e.y === worldY);

                if (hasEnemy) {
                    ctx.fillStyle = '#22d3ee'; // enemy(E) : 水色
                } else if (cell && cell.type === 'wall') {
                    ctx.fillStyle = '#6B1111';
                } else if (cell && cell.type === 'mirror') {
                    ctx.fillStyle = '#E3DAC9';
                } else if (staticType === 'hole' || staticType === 'filled_hole') {
                    ctx.fillStyle = '#1e293b';
                } else {
                    ctx.fillStyle = '#334155';
                }
                ctx.fillRect(cx, cy, cellPx, cellPx);
            }
        }
    }

    for (const room of ALL_ROOMS) {
        const rx = originX + room.x0 * scale;
        const ry = originY + room.y0 * scale;
        const rw = floorCols * scale;
        const rh = floorRows * scale;

        const isCurrent = room === currentRoom;
        // 部屋内のS地点(goal/entrance)を1つでも踏んだことがあれば「到達済み」扱い
        const isReached = roomHasReachedSpot(room);
        // 今いる部屋も含めて、到達済み or 現在地の部屋はクリックで拡大表示できるようにする
        const isSelectable = isReached || isCurrent;

        if (isReached && !isCurrent) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
        } else if (isCurrent) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
        }

        if (isSelectable) {
            menuRoomHitRects.push({
                room,
                x: rx,
                y: ry + MARGIN_HEIGHT,
                w: rw,
                h: rh,
            });
        }
    }

    // プレイヤーマーカーの直径と合わせておく（下のプレイヤー描画のradius算出式と同じ）
    const markerDiameter = Math.max(12, scale * 2.8);

    for (const room of ALL_ROOMS) {
        if (!room.organ) continue;
        const ocx = originX + (room.x0 + floorCols / 2) * scale;
        const ocy = originY + (room.y0 + floorRows / 2) * scale;

        ctx.save();
        if (room.organConsumed) {
            ctx.filter = 'grayscale(1)';
        }
        if (!drawOrganImage(room.organ, ocx, ocy, markerDiameter, true)) {
            ctx.filter = 'none';
            ctx.beginPath();
            ctx.arc(ocx, ocy, markerDiameter / 2, 0, Math.PI * 2);
            ctx.fillStyle = room.organConsumed ? 'rgba(148, 163, 184, 0.85)' : 'rgba(248, 113, 113, 0.85)';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    }

    const pmx = originX + playerPos.x * scale + scale / 2;
    const pmy = originY + playerPos.y * scale + scale / 2;
    ctx.beginPath();
    ctx.arc(pmx, pmy, Math.max(6, scale * 1.4), 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();

    // 拡大表示中は、一覧表示の上に一回り小さいパネルとして重ねて描画する
    // （一覧が透けて見えることで「上に被さっている」ことが分かるようにする）
    if (menuZoomedRoom) {
        drawRoomZoomOverlay(menuZoomedRoom);
    } else {
        menuZoomPanelRect = null;
    }
}

// メニューで部屋をクリックした後に挟む「拡大表示」ステップ。
// 一覧表示より一回り小さいパネルとして中央に重ねて描画することで、
// メニュー一覧の上に被さっていることが分かるようにする。
// 選んだ部屋のS(entrance)地点をワープ可能な地点としてマーカー表示する。
// マーカーのクリック判定はmenuEntranceHitRectsに、パネル自体の範囲は
// menuZoomPanelRectに格納し、実際のクリック処理はinput.js側で行う。
function drawRoomZoomOverlay(room) {
    menuEntranceHitRects = [];

    const panelW = BOARD_WIDTH * 0.72;
    const panelH = BOARD_HEIGHT * 0.72;
    const panelX = (BOARD_WIDTH - panelW) / 2;
    const panelY = (BOARD_HEIGHT - panelH) / 2;

    menuZoomPanelRect = { x: panelX, y: panelY, w: panelW, h: panelH };

    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX, panelY, panelW, panelH);
    ctx.clip();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.97)';
    ctx.fillRect(panelX, panelY, panelW, panelH);

    const scale = Math.min(panelW / floorCols, panelH / floorRows);
    const roomPxW = floorCols * scale;
    const roomPxH = floorRows * scale;
    const originX = panelX + (panelW - roomPxW) / 2;
    const originY = panelY + (panelH - roomPxH) / 2;
    const cellPx = Math.ceil(scale);

    const roomEnemies = (room === currentRoom) ? enemy : room.enemy;

    for (let ly = 0; ly < floorRows; ly++) {
        const worldY = room.y0 + ly;
        for (let lx = 0; lx < floorCols; lx++) {
            const worldX = room.x0 + lx;
            const cx = originX + lx * scale;
            const cy = originY + ly * scale;
            const cell = grid[worldY][worldX];
            const staticType = staticGrid[worldY][worldX];
            const hasEnemy = roomEnemies.some(e => e.x === worldX && e.y === worldY);

            if (hasEnemy) {
                ctx.fillStyle = '#22d3ee'; // enemy(E) : 水色
            } else if (cell && cell.type === 'wall') {
                ctx.fillStyle = '#6B1111';
            } else if (cell && cell.type === 'mirror') {
                ctx.fillStyle = '#E3DAC9';
            } else if (staticType === 'hole' || staticType === 'filled_hole') {
                ctx.fillStyle = '#1e293b';
            } else {
                ctx.fillStyle = '#334155';
            }
            ctx.fillRect(cx, cy, cellPx, cellPx);
        }
    }

    // S地点(部屋の出入口)をワープ可能地点として描画・クリック領域を登録
    // 上段(goals)・下段(entrances)の区別はワープ処理自体には不要なため、
    // 両方まとめて「ただのS」として扱う。ただし、まだ到達していないSへは
    // 飛べないようにする（reachedSpotsに立っているものだけを対象にする）。
    const markerR = Math.max(7, scale * 0.32);
    const allSpots = [...room.goals, ...room.entrances].filter(
        spot => saveData && saveData.reachedSpots && saveData.reachedSpots[spotKey(spot.x, spot.y)]
    );
    for (const entrance of allSpots) {
        const lx = entrance.x - room.x0;
        const ly = entrance.y - room.y0;
        const ex = originX + (lx + 0.5) * scale;
        const ey = originY + (ly + 0.5) * scale;

        ctx.beginPath();
        ctx.arc(ex, ey, markerR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.max(9, Math.round(scale * 0.36))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', ex, ey);

        // ヒット判定はキャンバス座標系（drawMenuOverlay呼び出し元でMARGIN_HEIGHT分
        // 平行移動済みのctxに対して描画しているため、判定用にはMARGIN_HEIGHTを
        // 加算しておく＝input.jsのクリック処理はキャンバス生座標で比較するため）
        menuEntranceHitRects.push({
            room,
            x: entrance.x,
            y: entrance.y,
            hitX: ex - scale / 2,
            hitY: ey - scale / 2 + MARGIN_HEIGHT,
            hitW: scale,
            hitH: scale,
        });
    }

    ctx.restore();

    // パネルの枠線（一覧より手前にあることが分かるよう縁取りを付ける）
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 12;
    ctx.strokeRect(panelX + 1.5, panelY + 1.5, panelW - 3, panelH - 3);
    ctx.restore();
}

// 部屋いっぱいに半透明の白を敷き、単語をスタンプのように描く。
// 元々10F専用（WORDS_10F）だった演出で、"OBLIQUED."のときだけ
// 少し傾ける（10F-10の見た目）。臓器演出を消費済みの部屋もこれと
// 全く同じ見た目にするため共通関数として切り出している。
function drawStampedWord(room, offX, offY, word) {
    const cx = offX + (floorCols * cellSize) / 2;
    const cy = offY + (floorRows * cellSize) / 2 + cellSize;
    const maxWidth = floorCols * cellSize * 0.9;
    let fontSize = Math.round(cellSize * 1.05);
    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (fontSize > 8 && ctx.measureText(word).width > maxWidth) {
        fontSize -= 2;
        ctx.font = `bold ${fontSize}px sans-serif`;
    }
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(offX, offY, offX + floorCols * cellSize, offY + floorCols * cellSize)
    ctx.translate(0, cy);
    if (word === 'OBLIQUED.') {
        ctx.rotate(14.036243467927 * Math.PI / 180);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, cx, 0);
    ctx.restore();
}

function drawRoomAndEntities(room, offX, offY) {
    for (let ly = 0; ly < floorRows; ly++) {
        const worldY = room.y0 + ly;
        for (let lx = 0; lx < floorCols; lx++) {
            const worldX = room.x0 + lx;
            const px = lx * cellSize + offX;
            const py = ly * cellSize + offY;

            if (isOffscreen(px, py)) continue;

            if (staticGrid[worldY][worldX] === 'hole') {
                if (!drawIndexedTileImage(getRoomTileKey(room, 'hole'), holeVariant[worldY][worldX], px, py, cellSize)) {
                    ctx.fillStyle = '#1e1b4b';
                    ctx.fillRect(px, py, cellSize, cellSize);
                    ctx.strokeStyle = '#4338ca';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(px + 8, py + 8, cellSize - 16, cellSize - 16);
                }
            } else if (staticGrid[worldY][worldX] === 'filled_hole') {
                if (!drawTileImage(getRoomTileKey(room, 'filled_hole'), px, py, cellSize)) {
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(px, py, cellSize, cellSize);
                    ctx.strokeStyle = '#161e2e';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, cellSize, cellSize);
                    ctx.fillStyle = '#27314a';
                    ctx.fillRect(px + 6, py + 6, cellSize - 12, cellSize - 12);
                    ctx.strokeStyle = '#3730a3';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(px + 6, py + 6, cellSize - 12, cellSize - 12);
                }
            } else if (staticGrid[worldY][worldX] === 'blank') {
                // 臓器部屋の余白('_')・ラベル文字は何も描画しない
            } else {
                const distToPlayer = Math.hypot(worldX - playerPos.x, worldY - playerPos.y);
                const isNearPlayer = distToPlayer <= 1;
                const floorKey = getRoomTileKey(room, isNearPlayer ? 'floor_close' : 'floor');

                const floorReady = tileImages[floorKey] && tileImages[floorKey].__ready;
                if (!floorReady) {
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(px, py, cellSize, cellSize);
                    ctx.strokeStyle = '#161e2e';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, cellSize, cellSize);
                }

                const eyeCx = px + cellSize / 2;
                const eyeCy = py + cellSize / 2;
                const playerCx = (playerPos.x - room.x0) * cellSize + offX + cellSize / 2;
                const playerCy = (playerPos.y - room.y0) * cellSize + offY + cellSize / 2;
                const pupilAngle = Math.atan2(playerCy - eyeCy, playerCx - eyeCx);
                const pupilOffset = cellSize * 0.15;
                const pupilCx = eyeCx + Math.cos(pupilAngle) * pupilOffset;
                const pupilCy = eyeCy + Math.sin(pupilAngle) * pupilOffset;
                drawTileImage('pupil', pupilCx, pupilCy, cellSize, true);

                if (floorReady) {
                    drawTileImage(floorKey, px, py, cellSize);
                }
            }

            const isGoal = room.goals.some(g => g.x === worldX && g.y === worldY);
            if (isGoal) {
                if (!drawTileImage('goal', px, py, cellSize)) {
                    ctx.strokeStyle = '#facc15';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.3, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.12, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.6)';
                    ctx.fill();
                }
            }

            const isEntrance = room.entrances.some(e => e.x === worldX && e.y === worldY);
            if (isEntrance) {
                if (!drawTileImage('goal', px, py, cellSize)) {
                    ctx.strokeStyle = '#facc15';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.3, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.12, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.6)';
                    ctx.fill();
                }
            }
        }
    }

    if (room.organ && !room.organConsumed) {
        const organCx = offX + (floorCols * cellSize) / 2;
        const organCy = offY + (room.organRow + 0.5) * cellSize; // ラベル行を中心にする
        const organSize = cellSize * 4;
        if (!drawOrganImage(room.organ, organCx, organCy, organSize, true)) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(organCx, organCy, organSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.round(cellSize * 0.5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(room.organ, organCx, organCy);
            ctx.restore();
        }
    } else if (room.organ && room.organConsumed) {
        // 演出を見終えた臓器部屋は、10F-10（OBLIQUED.）と全く同じ見た目にする
        drawStampedWord(room, offX, offY, 'OBLIQUED.');
    }

    if (room.floor === 10) {
        const word = WORDS_10F[room.index];
        if (word) {
            drawStampedWord(room, offX, offY, word);
        }
    }

    for (let ly = 0; ly < floorRows; ly++) {
        const worldY = room.y0 + ly;
        for (let lx = 0; lx < floorCols; lx++) {
            const worldX = room.x0 + lx;
            const entity = grid[worldY][worldX];
            if (!entity) continue;

            const px = lx * cellSize + offX;
            const py = ly * cellSize + offY;

            if (isOffscreen(px, py)) continue;

            switch (entity.type) {
                case 'wall': {
                    const wallScale = pulseScaleIf(!ALT_TILE_ROOM_IDS.has(room.id) && room === currentRoom && laserHitCells.has(cellKey(worldX, worldY)));
                    const wSize = cellSize * wallScale;
                    const wCx = px + cellSize / 2, wCy = py + cellSize / 2;
                    if (!drawTileImage(getRoomTileKey(room, 'wall'), wCx, wCy, wSize, true)) {
                        ctx.fillStyle = '#b45309';
                        ctx.fillRect(wCx - wSize / 2, wCy - wSize / 2, wSize, wSize);
                        ctx.strokeStyle = '#78350f';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(wCx - wSize / 2, wCy - wSize / 2, wSize, wSize);
                    }
                    break;
                }
                case 'mirror': {
                    const mirrorScale = pulseScaleIf(!ALT_TILE_ROOM_IDS.has(room.id) && room === currentRoom && laserHitCells.has(cellKey(worldX, worldY)));
                    const mSize = cellSize * mirrorScale;
                    const mCx = px + cellSize / 2, mCy = py + cellSize / 2;
                    const mHalf = mSize / 2;
                    if (!drawTileImage(getRoomTileKey(room, 'mirror'), mCx, mCy, mSize, true)) {
                        ctx.fillStyle = '#1e293b';
                        ctx.fillRect(mCx - mHalf, mCy - mHalf, mSize, mSize);
                        ctx.fillStyle = '#0f766e';
                        ctx.fillRect(mCx - mHalf, mCy - mHalf, mSize, mSize);
                        ctx.strokeStyle = '#22d3ee';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(mCx - mHalf, mCy - mHalf, mSize, mSize);
                        ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(mCx - mHalf, mCy - mHalf); ctx.lineTo(mCx + mHalf, mCy + mHalf);
                        ctx.moveTo(mCx + mHalf, mCy - mHalf); ctx.lineTo(mCx - mHalf, mCy + mHalf);
                        ctx.stroke();
                    }
                    break;
                }
            }
        }
    }

}

function drawLaserOverlay(offX, offY) {
    const room = currentRoom;
    if (!room) return;
    const roomPxX = room.x0 * cellSize;
    const roomPxY = room.y0 * cellSize;

    if (laserCancelSegments.length > 0) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(37, 99, 235, 0.65)';
        for (let seg of laserCancelSegments) {
            drawVesselBeamSegment(
                (seg.x1 - roomPxX) + offX, (seg.y1 - roomPxY) + offY,
                (seg.x2 - roomPxX) + offX, (seg.y2 - roomPxY) + offY,
                'vein'
            );
        }
        ctx.restore();
    }

    if (laserSegments.length > 0) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(244, 63, 94, 0.65)';
        for (let seg of laserSegments) {
            drawVesselBeamSegment(
                (seg.x1 - roomPxX) + offX, (seg.y1 - roomPxY) + offY,
                (seg.x2 - roomPxX) + offX, (seg.y2 - roomPxY) + offY,
                'artery'
            );
        }
        ctx.restore();
    }

    if (laserPos) {
        let gX = laserPos.x * cellSize - roomPxX + offX;
        let gY = laserPos.y * cellSize - roomPxY + offY;
        const laserScale = getPulseScale();
        const laserImgSize = cellSize * 0.8 * laserScale;
        if (!drawTileImage('laser_source', gX, gY, laserImgSize, true)) {
            ctx.fillStyle = '#475569';
            ctx.fillRect(gX - 10, gY - 10, 20, 20);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2;
            ctx.strokeRect(gX - 10, gY - 10, 20, 20);
        }

        let closestRelay = null;
        let minDist = Infinity;
        let pCx = playerPos.x * cellSize + cellSize / 2;
        let pCy = playerPos.y * cellSize + cellSize / 2;
        for (let r of relays) {
            let d = Math.hypot(r.x * cellSize - pCx, r.y * cellSize - pCy);
            if (d < minDist) { minDist = d; closestRelay = r; }
        }

        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        if (closestRelay) {
            let tX = closestRelay.x * cellSize - roomPxX + offX;
            let tY = closestRelay.y * cellSize - roomPxY + offY;
            let angle = Math.atan2(tY - gY, tX - gX);
            ctx.arc(gX + Math.cos(angle) * 10, gY + Math.sin(angle) * 10, 4, 0, Math.PI * 2);
        } else {
            ctx.arc(gX, gY, 4, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    for (let i = 0; i < relays.length; i++) {
        const r = relays[i];
        let rX = r.x * cellSize - roomPxX + offX;
        let rY = r.y * cellSize - roomPxY + offY;
        const relayImgSize = cellSize * 0.8;
        const hitScale = pulseScaleIf(isRelayHit(r));
        const displaySize = relayImgSize * hitScale;

        if (!drawIndexedTileImage('relay', i, rX, rY, displaySize, true)) {
            drawRelayFallback(rX + cellSize / 2, rY + cellSize / 2, i, hitScale);
        }
    }

    for (const e of enemy) {
        const eX = e.x * cellSize - roomPxX + offX + cellSize / 2;
        const eY = e.y * cellSize - roomPxY + offY + cellSize / 2;
        const eSize = cellSize * 0.8;
        ctx.save();
        if (e.facing === -1) {
            ctx.translate(eX, eY);
            ctx.scale(-1, 1);
            ctx.translate(-eX, -eY);
        }
        if (!drawTileImage('enemy', eX, eY, eSize, true)) {
            ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
            ctx.beginPath();
            ctx.arc(eX, eY, eSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(eX - eSize * 0.2, eY);
            ctx.lineTo(eX + eSize * 0.2, eY);
            ctx.moveTo(eX, eY - eSize * 0.2);
            ctx.lineTo(eX, eY + eSize * 0.2);
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.restore();
    }
}