//////////////////////////////////////////////////////////////////////////////
// stage-data.js — ステージデータ
// 9F/45部屋ぶんのダンジョン文字列(RAW_TEMPLATE)と、10Fの文字パネル単語(WORDS_10F)。
// 依存: なし（純粋なデータ）
//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
//全45部屋。現在35ステージと5ストーリー。残り5ステージ。

const WORDS_10F = ['HeaR', 'KlutZ.', 'JaMmed,', 'TurNed,', 'SomehoW', 'ArriVed.', 'FiXed,', 'ChanGed,', 'ProbablY', 'OBLIQUED.'];
const ORGAN_PHRASES = {
    kidney: ['Kidney DEHYDRATED', 'Kidney OBSTRUCTED', 'Kidney DILATED', 'Kidney CALCIFIED', 'Kidney SCLEROSED'],
    liver: ['Liver INTOXICATED', 'Liver STEATOSED', 'Liver INFLAMED', 'Liver FIBROSED', 'Liver DECOMPENSATED'],
    heart: ['Heart STRAINED', 'Heart THICKENED', 'Heart FIBRILLATED', 'Heart INFARCTED', 'Heart ARRESTED'],
    lung: ['Lung FOULED', 'Lung CONSTRICTED', 'Lung DEFLATED', 'Lung FLOODED', 'Lung COLLAPSED'],
    brain: ['Brain ERASED', 'Brain REMAPPED', 'Brain SEIZED', 'Brain OBTUNDED', 'Brain SILENCED'],
};

const RAW_TEMPLATE = `WWWWWWWWWWWWWWWWWWWWWWWWWWWMWWMWWWWWMMWMWWWMWMWMMMWMWMWMMMMWMWMMMMMMMMMMMMMMMMMMM
W..M....W...M...W..M.H..W.M.....W.....M.H.....M.W.......W.......WHHHHHHHM.......M
W.HH............W.H.H.H.........W...M...WM......W.......W..H.M.HWHHHHHHHM.....H.M
MLH.....W.......W.H.H.H.W.......W.......W....M.MW...W...W...H.H.WHHHHHHHM.HM..HHS
W.HM.M..W.HHHHH...HMH.HMWHHHHHM.........HHHHHHHHH.......W....H..HHHHHHHHM..HH...M
W.H.....WHHHHHHHWHHHHHHHWHHHHHH.W....H..WM......WHHHWHHHW.H.....WHHHHHHHH.HM..H..
W.HHHHHHWHHM...HW.H.M.H.W.....HHW..MHHH.HHHM....W.......HHW.....WHH.M.HHH..H.H..M
W.R.....W.......W.......W..M....WHHHHMHHW..H....W.......W.......W.......MHM.....M
WWWWWWSWW.S.WWWWW_S_WWSWW.S.WWWWW.S...SWW.S.WWWWMHS.WWSWW.S.WWWMW.S.WWSWM.S.MMMMM
....WW......WW_E_W__W.......W.......W....HHHWH...HH.W...HHHHW..HMHH.W...H...M
....WLHHHHHHWWWWMWMWWMMMMMMMML.....WWL..H...WH.H.H..WL.HH...MLH.HMHHML......W
....W.HHHHHRWWWWWMWWWMMMMMMMW..RWWWWW.H..R..WH.H.HHHW..H..M.WM...HMHM......RM
....W.HHHHHHW___WW__WMMMMMMMWR..WWWWW.HR....W..M....M.H.H.R.WHM..HH.M.......M
....W.......W_______WMMMMMMMW....R.WW..HHHM.WH.H.HH.W.HMH...W.HMHH.HM...W...M
....W.M...W.W_brain_WMMMMMMMWW.....RW.MH....WHMHMH..WH...H..W..HMH.RM.R.....M
....W....H.HW_______W.......WWW.....W.....H.WH.H....W...R...W...HMM.M.......M
....WWWWWWSWWWWWWWWWW.S.WWSWWWWWWWSWWWWWWWWWWWSWWWWWWWWWWWWWWWWWWWSWWWMWWWMWW
........W.......W.......W.......W.......W.....H.WWWWWWWWMMMMM.M.W.HH.R..W
........WL......WL......WL......WL......WL...H..WWWWW_E_MLHHHHM.WL..H...W
........W.......W.......W.......W.......W...HHRRM_______MHHHHHM.W.H..H..W
........W.......W.......W.......W.......M....HH.W_______MHHHHHM.W.....H.W
........W.......W.......W.......W.......WHHH.H..M_lung__MHHHHH..W..HHM..W
........W.......W.......W.......W.......W...M.M.W_______MERHHH..W....HM.W
........W.......W.......W.......W.......W.......W_______MMMHHH..W.H..R..W
........WWWWWWSWW.S.WMWWWWWWWWSWWWWWWWSWW.S.WWWWW_S_WWWWWWSWWWSWW.S.WWWWW//あと4部屋。難しく、手数が長いやつ
............W.......W..MR.HRW.R.....MMMWW...MWWWW___W.......W.H...E.W
............WL......WLHHH.W.WL...H..WMMMWWWWMWEWW___WL.HH...W..MWWWHW
............W.......W...H.R.W...H.H.WMMMWWWWM_______W....HH.WWW.WWWHW
............W.......W.....WWW.HH.H..WMMW....M_______M...R...WWWW....W
............W.......W.....WWW.......WWW...E.M_heart_W.R..M..WWWW....W
............W.......W.......W.HW.HMRW.M...M.M_____HHWHH.HH..WHH.MW..W
............W.......W.....R.W.....R.W.......M__H____W.......W...MW.WW//バランス良いやつ
............WWWWWWWWW.S.WWSWW.S.WWWWWWWWWWSWWMWWWWSWW.S.WWMWW.S.WWWWW//Eはもう増やさない
................W.W..HHHM..M.HM.WWWWWWWWWW.W....W.H.H.W.WH.HH..HW
................WLH.....WL...H..WWWWW_E_WL......WL.W.H.HWH.HH.EHW
................W.HH.H..W....H..W_______WH.....RM.H.H.HWWH.HH..HW
................W...HH..M....HM.W_______M.......MW.H.W.HWHHHH..HW
................W....HH.W....H.RW_liver_M..H..M.M.H.H.R.WH..W..HW
................W.....MRW....H..W_______WM.H....WH.H.H.WWH..HHHHW
................W.......M..M.MM.W_______W.......W.......WH..HHHHW
................WWWWWWSWW.SWWWWWW_S_WWWMWWMWWWSWWWWWWWWWWHSHWWWWW
....................M..H..RHWWWWW___W..R....W.......W.......W
....................WL.HHHHHWWEWW___WLR..M.WWL.HHH..WL..HHH.W
....................WHHHHRHMW_______W.......W.HHHHHHW..H.M..W
....................WHHHHHHHW_______WH.....WM.HHHHHHWHHH....W
....................W.M....HWkidney_M...HHH.W..HHH..W..HHHHHW
....................W.M.....W_____HHW....H..WHM.M.M.W.....M.W
....................W.....M.W__H____W.HR...RW......RW.M....RW
....................WWWWWWSWWWWWWWSWMWSWWWSWWWWWWMSWW.S.WWWWW
........................W..R..HHWH.HH..HW..H....M..HH...W
........................WLH...HHWH..HHWHWL.H.HH.WL.MM...M
........................WHHW...RWHH..HWHW.......W.......W
........................WH.R....WHHH.HEHW..H.HR.M.......W
........................WH...H.HWHHHH..HW.......M.......W
........................WHH....HWH..WHHHMH.HHH.MM..R....W
........................WHH....HWH.HHHHHW.M.....W.......W
........................WWWWWWSWWHSHWWWWW.S.WMSMW.S.MMWWW
............................W..R....WHH.....W....R..W
............................WL......WLH...H.WL...H..W
............................W......WWHHM.HH.WRR.H.H.W
............................W.....RMWHHHHHH.W.....H.W
............................W.......WHH.RHH.W.......W
............................W.M.....W.HR.MH.W.H.H.W.W
............................W.......WHH.....W.......W
............................WWWWWWSWW.S.WWSWW.S.WWWWW
................................W..H....W...HH..W
................................WL..H...WL...HH.W
................................W....H..W.....HHW
................................W..HM.H.W......HW
................................W...MM..WH.H....W
................................W.......W...M...W
................................W.....R.W...R.M.W
................................WWWWWWWWW.S.WWWWW
....................................W.......W
....................................WWW.WWWWW
......................................WW.WWWW
....................................WW.WW.WWW
....................................WWW.WW.WW
....................................WWWW.WW.W
....................................W.....WWW
....................................W.S.W...W`;
