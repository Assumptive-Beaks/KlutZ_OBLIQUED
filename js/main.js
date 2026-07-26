//////////////////////////////////////////////////////////////////////////////
// main.js — 起動処理
// 全ファイル読み込み後に、初期化してゲームループを開始するブートストラップ。
// index.htmlで最後に読み込むこと。
// 依存: 他の全ファイル
//////////////////////////////////////////////////////////////////////////////

window.addEventListener('resize', sizeCanvasWrapper);

window.onload = () => {
    preloadTileImages();
    preloadOrganImages();
    parseTemplate();
    buildWorldGrid();
    saveData = createNewSaveData();
    applyLoadedSaveData(loadSaveFile());
    applyOrganFlagsToRooms();
    loadRoomFresh(ROOMS[1][0]);
    setupEventListeners();
    sizeCanvasWrapper();
    animate();
};
