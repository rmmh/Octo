"use strict";

////////////////////////////////////
//
//   Emulator Execution
//
////////////////////////////////////

var scaleFactor = 5;
var renderTarget = "target";

function unpackOptions(emulator, options) {
	if (options["tickrate"       ]) { emulator.ticksPerFrame   = options["tickrate"       ]; }
	if (options["fillColor"      ]) { emulator.fillColor       = options["fillColor"      ]; }
	if (options["fillColor2"     ]) { emulator.fillColor2      = options["fillColor2"     ]; }
	if (options["blendColor"     ]) { emulator.blendColor      = options["blendColor"     ]; }
	if (options["backgroundColor"]) { emulator.backColor       = options["backgroundColor"]; }
	if (options["buzzColor"      ]) { emulator.buzzColor       = options["buzzColor"      ]; }
	if (options["quietColor"     ]) { emulator.quietColor      = options["quietColor"     ]; }
	if (options["shiftQuirks"    ]) { emulator.shiftQuirks     = options["shiftQuirks"    ]; }
	if (options["loadStoreQuirks"]) { emulator.loadStoreQuirks = options["loadStoreQuirks"]; }
	if (options["vfOrderQuirks"  ]) { emulator.vfOrderQuirks   = options["vfOrderQuirks"  ]; }
	if (options["enableXO"       ]) { emulator.enableXO        = options["enableXO"       ]; }
}

function setRenderTarget(scale, canvas) {
	scaleFactor = scale;
	renderTarget = canvas;
	var c = document.getElementById(canvas);
	c.width  = scaleFactor * 128;
	c.height = scaleFactor *  64;
	c.style.marginLeft = (scaleFactor * -64) + "px";
	c.style.marginTop  = (scaleFactor * -32) + "px";
}

function getColor(id) {
	switch(id) {
		case 0: return emulator.backColor;
		case 1: return emulator.fillColor;
		case 2: return emulator.fillColor2;
		case 3: return emulator.blendColor;
	}
	throw "invalid color: " + id;
}

function renderDisplay(emulator) {
	var c = document.getElementById(renderTarget);
	var g = c.getContext("2d");
	g.setTransform(1, 0, 0, 1, 0, 0);
	g.fillStyle = emulator.backColor;
	g.fillRect(0, 0, c.width, c.height);
	var max    = emulator.hires ? 128*64      : 64*32;
	var stride = emulator.hires ? 128         : 64;
	var size   = emulator.hires ? scaleFactor : scaleFactor*2;

	for(var z = 0; z < max; z++) {
		g.fillStyle = getColor(emulator.p[0][z] + (emulator.p[1][z] * 2));
		g.fillRect(
			Math.floor(z%stride)*size,
			Math.floor(z/stride)*size,
			size, size
		);
	}
}

////////////////////////////////////
//
//   Audio Playback
//
////////////////////////////////////

var audio;
function audioSetup() {
	if (audio) { return; }
	if (typeof webkitAudioContext !== 'undefined') {
		audio = new webkitAudioContext();
		return true;
	}
	else if (typeof AudioContext !== 'undefined') {
		audio = new AudioContext();
		return true;
	}
	return false;
}

var SAMPLES = 16;
var SAMPLERATE = 4000;
var VOLUME = 0.25;
var soundSource = null;

function playPattern(buffer) {
	if (!audio) { return; }

	// if another sound is in progress, stop it
	if (soundSource != null) { soundSource.stop(0); }

	var baseFreq = buffer[0] * 16; // Hz
	var attack = buffer[1] * 4; // * 4 to measure out ms
	var decay = buffer[2] * 4;
	var hold = buffer[3] * 4;    // length
	var sustain = buffer[4] / 255.0; // volume
	var release = buffer[5] * 4;
	var waveForm = buffer[6];

	var multiply = function(a, b) {
		return function (t) {
			return a(t) * b(t);
		}
	}

	/* wrap a func that maps [0, 1] -> [0, 1] */
	function periodize(func) {
		var samplesPerPeriod = SAMPLERATE / baseFreq;
		return function(t) {
			return func((t % samplesPerPeriod) / samplesPerPeriod) * 2 - 1;
		}
	}

	var envelope = function(t) {
		function lerp(a, b, perc) { return a * (1-perc) + b * perc; }
		if (t < attack) return t / attack;
		t -= attack;
		if (t < decay) return lerp(1, sustain, t / decay);
		t -= decay;
		if (t < hold) return sustain;
		t -= hold;
		if (t < release) return lerp(sustain, 0, t / release);
		return 0.0;
	}

	function sawTooth(x)  { return x; }
	function square(x)    { return x < .5 ? 1 : 0; }
	function triangle(x)  { return x < .5 ? 2 * x : 2 - 2 * x; }
	function sine(x)      { return Math.sin(x * Math.PI * 2); }
	function noise(x)     { return Math.random(); }

	var soundBank = [sawTooth, square, triangle, sine, noise];

	var generator = multiply(envelope, periodize(soundBank[waveForm % soundBank.length]));

	var sampleCount = attack + decay + hold + release;

	var resampleRatio = audio.sampleRate / SAMPLERATE;
	var soundBuffer = audio.createBuffer(1, sampleCount * resampleRatio, audio.sampleRate);
	var sound = soundBuffer.getChannelData(0);

	for (var i = 0; i < sound.length; ) {
		// zero-order hold resampling
		var t = (i / resampleRatio)|0;
		var sample = generator(t);
		do {
			sound[i] = sample;
			i++;
		} while (((i / resampleRatio)|0) == t);
	}
	
	// play the sound
	soundSource = audio.createBufferSource();
	soundSource.buffer = soundBuffer;
	soundSource.connect(audio.destination);
	soundSource.loop = false;
	soundSource.start(0);
}
