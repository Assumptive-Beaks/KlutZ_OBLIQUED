//////////////////////////////////////////////////////////////////////////////
// layout.js — キャンバス表示サイズ調整
// #canvas-wrapper の表示サイズを、canvasの実解像度(盤面+上下マージン)の
// 縦横比に合わせて計算する。ウインドウリサイズ時にも呼ばれる。
// 依存: constants.js（BOARD_WIDTH等）
//////////////////////////////////////////////////////////////////////////////

// キャンバスの実解像度（盤面 + 上下マージン）は正方形ではないため、
// #canvas-wrapper をCSSのaspect-ratio:1/1で強制すると縦方向が圧縮され
// 盤面が横に潰れて見える。ここでは実際の縦横比を使い、かつ
// ヘッダー等の高さをハードコードせず実測することで、
// ウインドウサイズが変わっても余計な空白が残らないようにする。
function sizeCanvasWrapper() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper) return;

    const ratio = BOARD_WIDTH / (BOARD_HEIGHT + MARGIN_HEIGHT * 2); // width / height

    const top = wrapper.getBoundingClientRect().top;
    const bodyStyle = getComputedStyle(document.body);
    const bottomPad = parseFloat(bodyStyle.paddingBottom) || 0;

    const availH = window.innerHeight - top - bottomPad;
    const availW = window.innerWidth * 0.92;

    const h = Math.min(availH, availW / ratio, 640 / ratio);
    const w = h * ratio;

    wrapper.style.width = w + 'px';
    wrapper.style.height = h + 'px';
}
