//////////////////////////////////////////////////////////////////////////////
// stage-data.js — ステージデータ
// 9F/45部屋ぶんのダンジョン文字列(RAW_TEMPLATE)と、10Fの文字パネル単語(WORDS_10F)。
// 依存: なし（純粋なデータ）
//////////////////////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////////////////////
//全45部屋。現在39ステージと5ストーリー。残り1ステージ。

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
W.H.....WHHHHHHHWHHHHHHHWHHHHHH.W....H..WM......WHHHWHHHW.H.....WHHHHHHHH.HM..H.M
W.HHHHHHWHHM...HW.H.M.H.W.....HHW..MHHH.HHHM....W.......HHW.....WHH.M.HHH..H.H..M
W.R.....W.......W.......W..M....WHHHHMHHW..H....W.......W.......W.......MHM.....M
WWWWWWSWW.SWWWWWW_S_WWSWW.S.WWWWW.S...SWW.S.WWWWMHS.WWSWW.S.WWWMW.S.WWSWM.S.MMMMM
....W..H....WW_E_W__W.......W..W..HRW....HHHWH...HH.W...HHHHW..HMHH.W...H...M
....W.WH....WWWWMWMWWMMMMMMMWLHHHH.WWL..H...WH.H.H..WL.HH...MLH.HMHHML......W
....W..HHHHHWWWWWMWWWMMMMMMMWHHHHR..W.H..R..WH.H.HHHW..H..M.WM...HMHM......RM
....W..HW...W___WW__WMMMMMMMW.HHRH..W.HR....W..M....M.H.H.R.WHM..HH.M.......M
....W..H.HHHW_______WMMMMMMMW.HR.H..W..HHHM.WH.H.HH.W.HMH...W.HMHH.HM...W...M
....W..H.HW.W_brain_WMMMMMMMWM.HHH..W.MH....WHMHMH..WH...H..W..HMH.RM.R.....M
....W..H.H..W_______W.......W.......W.....H.WH.H....W...R...W...HMM.M.......M
....WWWWWWSWWWWWWMWWW.S.WWSWWWWWWWSWWWWWWWWWWWSWWWWWWWWWWWWWWWWWWWSWWWMWWWMWW
........W.H.....M.......WWH...W.WRH....RW.....H.WWWWWWWWMMMMM.M.W.HH.R..W
........WL..H..MML..MMMMWLHHHHHHWHH..MHWWL...H..WWWWW_E_MLHHHHM.WL..H...W
........W......MW.....R.W...H.HRW...HHH.W...HHRRM_______MHHHHHM.W.H..H..W
........W.....RMW.......W..HHHHHW...L...M....HH.W_______MHHHHHM.W.....H.W
........W.H.....W.......W...M.W.W..W.MH.WHHH.H..M_lung__MHHHHH..W..HHM..W
........W.M.....W.......W.......W.MH.MHHW...M.M.W_______MERHHH..W....HM.W
........W.......MM......W..WWW.WWR.....RW.......W_______MMMHHH..W.H..R..W
........WWWWWWSWW.S.MMWWWWWWWWSWWWWWWWSWW.S.WWWWW_S_WWWWWWSWWWSWW.S.WWWWW//難しく、手数が長いやつ
............WWHWHWH.W..MR.HRW.R.....MMMWW...MWWWW___W.......W.H...E.W
............WHWHWHH.WLHHH.W.WL...H..WMMMWWWWMWEWW___WL.HH...W..MWWWHW
............WWHWH.HWW...H.R.W...H.H.WMMMWWWWM_______W....HH.WWW.WWWHW
............WHWH.HWHW.....WWW.HH.H..WMMW....M_______M...R...WWWW....W
............WWH.HWHWW.....WWW.......WWW...E.M_heart_W.R..M..WWWW....W
............WH.HWHWHW.......W.HW.HMRW.M...M.M_____HHWHH.HH..WHH.MW..W
............W.HWHWHWW.....R.W.....R.W.......M__H____W.......W...MW.WW//バランス良いやつ
............WWWWWWWWW.S.WWSWW.S.WWWWWWWWWWSWWMWWWWSWW.S.WWMWW.S.WWWWW//Eはもう増やさない
................W.W..HHHM..M.HM.WWWWWWWWWW.W....W.H.H.W.WH.HH...W
................WLH.....WL...H..WWWWW_E_WL......WL.W.H.HWH..HHW.W
................W.HH.H..W....H..W_______WH.....RM.H.H.HWWHH..HW.W
................W...HH..M....HM.W_______M.......MW.H.W.HWHHH.HE.W
................W....HH.W....H.RW_liver_M..H..M.M.H.H.R.WHHHH...W
................W.....MRW....H..W_______WM.H....WH.H.H.WWH..W...M
................W.......M..M.MM.W_______W.......W.......WH.HHHHHW
................WWWWWWSWW.SWWWWWW_S_WWWMWWMWWWSWWWWWWWWWWHSHWWWWW
....................M..H..RHWWWWW___W..R....W.......W....R..W
....................WL.HHHHHWWEWW___WLR..M.WWL.HHH..WL..HHH.W
....................WHHHHRHMW_______W.......W.HHHHHHW..H.M..W
....................WHHHHHHHW_______WH.....WM.HHHHHHWHHH....W
....................W.M....HWkidney_M...HHH.W..HHH..W..HHHHHW
....................W.M.....W_____HHW....H..WHM.M.M.W.....M.W
....................W.....M.W__H____W.HR...RW......RW.M....RW
....................WWWWWWSWWWWWWWSWMWSWWWSWWWWWWWSWW.S.WWWWW
........................W..R..HHWH.HH...W..H....M...WMMMW
........................WLH...HHWH..HHW.WL.H.HH.WL...H..W
........................WHHW...RWHH..HW.W.......W.....H.W
........................WH.R....WHHH.HE.W..H.HR.M.HM...MW
........................WH...H.HWHHHH...W.......M.......W
........................WHH....HWH..W.H.MH.HHH.MM.H...R.M
........................WHH....HWH.HHHHHW.M.....M...MR.MW
........................WWWWWWSWWHSHWWWWW.S.WMWMW.S.WWWWW
............................W..R....WHH.....M...WW.RW
............................WL......WLH...H.WL...WW.W
............................W......WWHHM.HH.W.MH.MW.W
............................W.....RMWHHHHHH.WM....WWW
............................W.......WHH.RHH.WW....WRW
............................W.M.....W.HR.MH.WR.R..M.W
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
