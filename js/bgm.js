// ============================================================================
// bgm.js — Web Audio APIで手続き的に生成するループBGM。
//
// 音声ファイルは使わず、矩形波/三角波/ノイズと隠れマルコフモデルによる
// 状態遷移(無/疎/有/密/雑)だけで「体内を彷徨う」雰囲気の有機的なBGMを鳴らし続ける。
// window.BGM として公開し、他のスクリプトからは BGM.start() / BGM.stop() /
// BGM.setVolume(v) / BGM.fadeOut(durationSec) だけを呼べばよい。
//
// 読み込み順: 他のどのファイルにも依存しない。title.js より前に読み込むこと。
// ============================================================================
(() => {
  'use strict';

  const DEFAULT_VOLUME = 0.3;

  // ==================================================================
  // タイミング
  // ==================================================================
  const BPM = 128;
  const STEPS_PER_BAR = 16;
  const STEP_DUR = 60 / BPM / 4;

  const NOTE = { 'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11 };
  function freq(name, octave) {
    const n = NOTE[name] + (octave - 4) * 12;
    return 440 * Math.pow(2, (n - 9) / 12);
  }
  function humanizeCents() { return (Math.random() - 0.5) * 14; }

  // ==================================================================
  // 音楽データ
  // ==================================================================
  const bassMain = [ // Dドリアン、淡々と巡回するベース
    ['D',2],null,['D',2],null, ['F',2],null,['D',2],null,
    ['C',2],null,['C',2],null, ['A',1],null,['A',1],null,
  ];
  const leadPhraseA = [
    {n:'D',o:5},null,null,{n:'F',o:5}, null,null,{n:'E',o:5},null,
    {n:'D',o:5},null,null,null,        {n:'C',o:5},null,null,null,
  ];
  const leadPhraseB = [
    {n:'A',o:4},null,null,{n:'C',o:5}, null,null,{n:'D',o:5},null,
    null,{n:'C',o:5},null,null,        {n:'A',o:4},null,null,null,
  ];
  const leadScalePool = [
    {n:'D',o:5}, {n:'E',o:5}, {n:'F',o:5}, {n:'G',o:5},
    {n:'A',o:5}, {n:'C',o:5}, {n:'A',o:4},
  ];
  function randomLeadNote() {
    return leadScalePool[Math.floor(Math.random() * leadScalePool.length)];
  }

  // ==================================================================
  // 隠れマルコフモデルによる状態遷移
  //   無: 有機要素のみ(ベース/メロディ/ハイハットは全て無音)
  //   疎: メロディが単音ずつ、ランダムに大きく間を空けて鳴る(ベース/ハイハットは無音)
  //   有: 通常営業(固定のベース+メロディのパターン)
  //   密: メロディの音がランダムな間隔で詰まって鳴る(1音1音は短く/小さくする)
  //   雑: メロディの「間」は通常営業と同じだが、音高だけランダムになる
  // ==================================================================
  const TRANSITIONS = {
    '無': [ ['疎', 0.20] ],
    '疎': [ ['無', 0.50], ['有', 0.20] ],
    '有': [ ['疎', 0.10], ['密', 0.10], ['雑', 0.10] ],
    '密': [ ['有', 0.10], ['雑', 0.10] ],
    '雑': [ ['有', 0.20] ],
  };
  let currentState = '無';
  function maybeTransition() {
    const roll = Math.random();
    let cumulative = 0;
    for (const [target, prob] of TRANSITIONS[currentState]) {
      cumulative += prob;
      if (roll < cumulative) { currentState = target; return; }
    }
    // 残りの確率: 現在の状態に留まる
  }

  function stateGetBassNote(bar, s) {
    if (currentState === '無' || currentState === '疎') return null;
    return bassMain[s];
  }

  function stateGetLeadCell(bar, s) {
    switch (currentState) {
      case '無': return null;
      case '疎':
        return Math.random() < 0.035 ? randomLeadNote() : null;
      case '有':
        return (bar % 2 === 0 ? leadPhraseA : leadPhraseB)[s];
      case '密':
        return Math.random() < 0.55 ? randomLeadNote() : null;
      case '雑': {
        const timingMask = (bar % 2 === 0 ? leadPhraseA : leadPhraseB)[s];
        return timingMask ? randomLeadNote() : null;
      }
    }
  }

  function stateGetHatActive(bar, s) {
    if (s % 2 !== 1) return false;
    switch (currentState) {
      case '無': case '疎': return false;
      case '密': return Math.random() < 0.85;
      default: return Math.random() < 0.8; // 有・雑
    }
  }

  // ==================================================================
  // オーディオグラフ
  //   [各音源] -> master(音量) -> bodyFilter(呼吸するLPF) -> breathGain(呼吸するトレモロ)
  //             -> compressor -> destination
  // ==================================================================
  let ctx = null, master = null, bodyFilter = null, breathGain = null, comp = null;
  let noiseBuffer = null;
  let ambienceNodes = [];
  let playing = false, nextStepTime = 0, stepIndex = 0, timerId = null;
  let fadeOutTimerId = null;
  const LOOKAHEAD = 25, SCHEDULE_AHEAD = 0.1;

  function buildNoiseBuffer() {
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensureContext() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = DEFAULT_VOLUME;

    bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 1500;
    bodyFilter.Q.value = 1.1;

    breathGain = ctx.createGain();
    breathGain.gain.value = 1;

    comp = ctx.createDynamicsCompressor();

    master.connect(bodyFilter).connect(breathGain).connect(comp).connect(ctx.destination);
    noiseBuffer = buildNoiseBuffer();
  }

  function startAmbience() {
    ambienceNodes = [];

    const filterLFO = ctx.createOscillator();
    filterLFO.type = 'sine'; filterLFO.frequency.value = 0.09;
    const filterLFODepth = ctx.createGain();
    filterLFODepth.gain.value = 850;
    filterLFO.connect(filterLFODepth).connect(bodyFilter.frequency);
    filterLFO.start();
    ambienceNodes.push(filterLFO);

    const ampLFO = ctx.createOscillator();
    ampLFO.type = 'sine'; ampLFO.frequency.value = 0.126;
    const ampLFODepth = ctx.createGain();
    ampLFODepth.gain.value = 0.22;
    ampLFO.connect(ampLFODepth).connect(breathGain.gain);
    ampLFO.start();
    ambienceNodes.push(ampLFO);

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass'; droneFilter.frequency.value = 380; droneFilter.Q.value = 0.8;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.1;
    droneFilter.connect(droneGain).connect(master);

    [-6, 6].forEach(cents => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq('D', 1);
      o.detune.value = cents;
      o.connect(droneFilter);
      o.start();
      ambienceNodes.push(o);
    });

    const droneLFO = ctx.createOscillator();
    droneLFO.type = 'sine'; droneLFO.frequency.value = 0.18;
    const droneLFODepth = ctx.createGain();
    droneLFODepth.gain.value = 0.05;
    droneLFO.connect(droneLFODepth).connect(droneGain.gain);
    droneLFO.start();
    ambienceNodes.push(droneLFO);
  }

  function stopAmbience() {
    ambienceNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    ambienceNodes = [];
  }

  // ------------------------------------------------------------------
  // 各音源
  // ------------------------------------------------------------------
  function playBass(time, note) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq(note[0], note[1]), time);
    osc.detune.setValueAtTime(humanizeCents(), time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.35, time + 0.02);
    gain.gain.setTargetAtTime(0.0001, time + 0.05, 0.1);
    osc.connect(gain).connect(master);
    osc.start(time); osc.stop(time + 0.5);
  }

  function playLead(time, cell, opts) {
    opts = opts || {};
    const gainScale = opts.gainScale != null ? opts.gainScale : 1;
    const short = !!opts.short;
    const baseFreq = freq(cell.n, cell.o);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 2000; filt.Q.value = 2.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.045 * gainScale, time + (short ? 0.008 : 0.02));
    gain.gain.setTargetAtTime(0.0001, time + (short ? 0.02 : 0.04), short ? 0.045 : 0.09);
    filt.connect(gain).connect(master);

    const dur = short ? 0.14 : 0.26;
    [-5, 5].forEach(cents => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(baseFreq, time);
      osc.detune.setValueAtTime(cents + humanizeCents(), time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.98, time + dur - 0.02);
      osc.connect(filt);
      osc.start(time); osc.stop(time + dur);
    });
  }

  function playHat(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 2600; filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(filter).connect(gain).connect(master);
    src.start(time); src.stop(time + 0.06);
  }

  function playThump(time, f0, f1, vol, dur) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f1, time + dur * 0.8);
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(gain).connect(master);
    osc.start(time); osc.stop(time + dur + 0.02);
  }
  function playHeartbeat(time) {
    playThump(time, 95, 52, 0.5, 0.16);         // lub
    playThump(time + 0.18, 78, 42, 0.34, 0.16); // dub
  }

  // ------------------------------------------------------------------
  // スケジューラ
  // ------------------------------------------------------------------
  function scheduler() {
    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      const bar = Math.floor(stepIndex / STEPS_PER_BAR);
      const s = stepIndex % STEPS_PER_BAR;
      if (s === 0) maybeTransition();

      const bassNote = stateGetBassNote(bar, s);
      if (bassNote) playBass(nextStepTime, bassNote);

      const leadCell = stateGetLeadCell(bar, s);
      if (leadCell) {
        playLead(nextStepTime, leadCell, currentState === '密' ? { gainScale: 0.55, short: true } : {});
      }

      if (stateGetHatActive(bar, s)) playHat(nextStepTime + (Math.random() - 0.5) * 0.015);

      if (s === 0) playHeartbeat(nextStepTime);

      nextStepTime += STEP_DUR;
      stepIndex++;
    }
    timerId = setTimeout(scheduler, LOOKAHEAD);
  }

  // ==================================================================
  // 公開API
  // ==================================================================
  function start() {
    if (playing) return;
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();

    // 前回フェードアウトで0まで下げた音量を、通常再生用に戻す。
    // フェードアウト予約が残っていれば取り消す。
    if (fadeOutTimerId) { clearTimeout(fadeOutTimerId); fadeOutTimerId = null; }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(DEFAULT_VOLUME, ctx.currentTime);

    startAmbience();
    currentState = '無';
    stepIndex = 0;
    nextStepTime = ctx.currentTime + 0.05;
    playing = true;
    scheduler();
  }

  function stop() {
    if (!playing) return;
    playing = false;
    clearTimeout(timerId);
    stopAmbience();
  }

  function setVolume(v) {
    if (master) master.gain.value = v;
  }

  // durationSec かけて音量を0まで滑らかに下げ、完了後に停止する。
  // エンディング演出など、BGMを消しながら次の場面に移る用途を想定。
  function fadeOut(durationSec) {
    if (!playing || !ctx || !master) return;
    const duration = durationSec != null ? durationSec : 1.5;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.0001, now + duration);
    if (fadeOutTimerId) clearTimeout(fadeOutTimerId);
    fadeOutTimerId = setTimeout(() => {
      fadeOutTimerId = null;
      stop();
    }, duration * 1000);
  }

  window.BGM = { start, stop, setVolume, fadeOut };
})();
