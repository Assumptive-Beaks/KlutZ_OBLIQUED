//////////////////////////////////////////////////////////////////////////////
// constants.js — 基本定数
// canvas/ctx参照、マス目サイズ、フロア構成(バンド)など、実行中に変わらない値。
// 依存: index.htmlに <canvas id="gameCanvas"> があること
//////////////////////////////////////////////////////////////////////////////

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cellSize = 50;
const floorRows = 9;
const floorCols = 9;
const BOARD_WIDTH = floorCols * cellSize;
const BOARD_HEIGHT = floorRows * cellSize;
const MARGIN_HEIGHT = 40;

const BAND_SEPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80];
const BAND_ROOM_COUNTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MAX_FLOOR = Math.max(...BAND_ROOM_COUNTS);
