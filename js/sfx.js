// ============================================================================
// sfx.js — Web Audio APIで手続き的に生成するイベント演出用の効果音。
//
// 音声ファイルは使わず、フィルタ変調ノイズ + 低周波サイン波(衝撃/潰れ)+
// ディストーションかけたノイズバースト(湿った質感)を組み合わせて生成する。
// window.SFX として公開し、他のスクリプトからは
// SFX.playImpact() / SFX.init(existingAudioContext) を呼べばよい。
//
// bgm.js と同じ AudioContext を共有したい場合は、先に
// SFX.init(BGM の AudioContext) を呼んでおくとよい(未呼び出し時は自前で
// AudioContext を生成する)。
// ============================================================================
(() => {
  'use strict';

  let ctx = null;
  let noiseBuffer = null;
  let master = null;

  function ensureContext(externalCtx) {
    if (externalCtx) { ctx = externalCtx; }
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
      noiseBuffer = buildNoiseBuffer();
    }
  }

  function buildNoiseBuffer(seconds = 1.2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ソフトクリップ的なディストーションカーブ(湿った潰れ感を強調)
  function makeDistortionCurve(amount) {
    const n = 44100;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // --------------------------------------------------------------------
  // レイヤー1: 低域の「潰れる衝撃」(サイン波、急速なピッチダウン)
  // --------------------------------------------------------------------
  function layerImpact(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(28, time + 0.35);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.9, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    osc.connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  // --------------------------------------------------------------------
  // レイヤー2: 湿った破裂ノイズ(バンドパス変調 + ディストーション)
  // --------------------------------------------------------------------
  function layerWetBurst(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDistortionCurve(38);
    shaper.oversample = '4x';

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(1400, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(1.0, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

    src.connect(shaper).connect(filter).connect(gain).connect(master);
    src.start(time);
    src.stop(time + 0.5);
  }

  // --------------------------------------------------------------------
  // レイヤー3: 高域の「裂ける」ノイズ(ハイパスノイズ、短く鋭い)
  // --------------------------------------------------------------------
  function layerTear(time) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.4, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    src.connect(filter).connect(gain).connect(master);
    src.start(time);
    src.stop(time + 0.15);
  }

  // --------------------------------------------------------------------
  // レイヤー4: 破裂後の不協和な残響(検出された小片が飛び散るイメージ)
  // 複数の短いノイズパチパチ音をランダムなタイミングでばらまく
  // --------------------------------------------------------------------
  function layerDebris(time) {
    const count = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const t = time + 0.05 + Math.random() * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500 + Math.random() * 2000;
      filter.Q.value = 4 + Math.random() * 4;
      const gain = ctx.createGain();
      const vol = 0.08 * (1 - (t - time) / 0.6);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      src.connect(filter).connect(gain).connect(master);
      src.start(t);
      src.stop(t + 0.05);
    }
  }

  // --------------------------------------------------------------------
  // レイヤー5: 低い唸り(ダメージ描写全体を下支えする、少し長めのドローン)
  // --------------------------------------------------------------------
  function layerGroan(time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, time);
    osc.frequency.linearRampToValueAtTime(40, time + 0.6);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.25, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    osc.connect(filter).connect(gain).connect(master);
    osc.start(time);
    osc.stop(time + 0.75);
  }

  // ==================================================================
  // 公開API
  // ==================================================================
  function init(externalCtx) {
    ensureContext(externalCtx);
  }

  function playImpact(opts) {
    opts = opts || {};
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    const time = ctx.currentTime + 0.02;
    const scale = opts.volumeScale != null ? opts.volumeScale : 1;
    master.gain.setValueAtTime(0.5 * scale, time);

    layerImpact(time);
    layerWetBurst(time);
    layerTear(time);
    layerGroan(time);
    layerDebris(time);
  }

  function setVolume(v) {
    if (master) master.gain.value = v;
  }

  window.SFX = window.SFX || {};
  window.SFX.init = init;
  window.SFX.playImpact = playImpact;
  window.SFX.setVolume = setVolume;
})();
