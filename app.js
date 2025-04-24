document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app-content');
    const canvas = document.getElementById('box-canvas');
    const container = document.querySelector('.container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // --- Sound Fix: Create AudioContext early ---
    let audioContext;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Start suspended, resume on user interaction
        if (audioContext.state === 'running') {
            audioContext.suspend();
        }
    } catch (e) {
        console.error('Web Audio API is not supported in this browser');
        audioContext = null; // Ensure audioContext is null if creation failed
    }
    // ------------------------------------------

    const state = {
        isPlaying: false,
        count: 0,
        countdown: 4,
        totalTime: 0,
        soundEnabled: false, // Default sound OFF
        timeLimit: '',
        sessionComplete: false,
        timeLimitReached: false,
        phaseTime: 4,
        pulseStartTime: null
    };

    let wakeLock = null;

    const icons = {
        play: `<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
        pause: `<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
        volume2: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
        volumeX: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
        rotateCcw: `<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
        clock: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
    };

    function getInstruction(count) {
        switch (count) {
            case 0: return 'Inhale';
            case 1: return 'Hold';
            case 2: return 'Exhale';
            case 3: return 'Wait';
            default: return '';
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // --- Sound Fix: Function to resume context ---
    function resumeAudioContext() {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            }).catch(e => console.error('Error resuming AudioContext:', e));
        }
    }
    // ------------------------------------------

    // --- Sound Fix: Modified playTone ---
    function playTone() {
        // Check sound enabled, context exists, and context is running
        if (state.soundEnabled && audioContext && audioContext.state === 'running') {
            try {
                const oscillator = audioContext.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
                oscillator.connect(audioContext.destination);
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.1); // Play for 0.1 seconds
            } catch (e) {
                console.error('Error playing tone:', e);
            }
        } else if (state.soundEnabled && audioContext && audioContext.state !== 'running') {
             console.log('AudioContext not running, cannot play tone yet.');
             // Attempt to resume, might be needed if context suspended unexpectedly
             resumeAudioContext();
        }
    }
    // ------------------------------------

    // --- Haptic Feedback Function Removed ---

    let interval;
    let animationFrameId;
    let lastStateUpdate;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake lock is active');
            } catch (err) {
                console.error('Failed to acquire wake lock:', err);
            }
        } else {
            console.log('Wake Lock API not supported');
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release()
                .then(() => {
                    wakeLock = null;
                    console.log('Wake lock released');
                })
                .catch(err => {
                    console.error('Failed to release wake lock:', err);
                });
        }
    }

    function togglePlay() {
        // --- Sound Fix: Resume context on interaction ---
        resumeAudioContext();
        // ---------------------------------------------

        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            // --- Haptic Feedback Call Removed ---
            state.totalTime = 0;
            state.countdown = state.phaseTime;
            state.count = 0;
            state.sessionComplete = false;
            state.timeLimitReached = false;
            playTone(); // Attempt first tone
            startInterval();
            animate();
            requestWakeLock();
        } else {
            clearInterval(interval);
            cancelAnimationFrame(animationFrameId);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            releaseWakeLock();
        }
        render();
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0;
        state.countdown = state.phaseTime;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimit = '';
        state.timeLimitReached = false;
        clearInterval(interval);
        cancelAnimationFrame(animationFrameId);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        releaseWakeLock();
        render();
    }

    function toggleSound() {
        // --- Sound Fix: Resume context if turning sound ON ---
        if (!state.soundEnabled) { // If sound is currently OFF and will be turned ON
             resumeAudioContext();
        }
        // ---------------------------------------------------
        state.soundEnabled = !state.soundEnabled;
        render();
    }

    function handleTimeLimitChange(e) {
        state.timeLimit = e.target.value.replace(/[^0-9]/g, '');
    }

    function startWithPreset(minutes) {
         // --- Sound Fix: Resume context on interaction ---
        resumeAudioContext();
        // ---------------------------------------------

        state.timeLimit = minutes.toString();
        state.isPlaying = true;
        // --- Haptic Feedback Call Removed ---
        state.totalTime = 0;
        state.countdown = state.phaseTime;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimitReached = false;
        playTone(); // Attempt first tone
        startInterval();
        animate();
        requestWakeLock();
        render();
    }

    function startInterval() {
        clearInterval(interval);
        lastStateUpdate = performance.now();
        interval = setInterval(() => {
            state.totalTime += 1;
            if (state.timeLimit && !state.timeLimitReached) {
                const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                if (state.totalTime >= timeLimitSeconds) {
                    state.timeLimitReached = true;
                }
            }
            if (state.countdown === 1) {
                state.count = (state.count + 1) % 4;
                state.pulseStartTime = performance.now(); // Trigger pulse
                state.countdown = state.phaseTime;
                playTone();
                if (state.count === 3 && state.timeLimitReached) { // Check if end of cycle AND time limit reached
                    state.sessionComplete = true;
                    state.isPlaying = false;
                     // --- Haptic Feedback Call Removed ---
                    clearInterval(interval);
                    cancelAnimationFrame(animationFrameId);
                    releaseWakeLock();
                }
            } else {
                state.countdown -= 1;
            }
            lastStateUpdate = performance.now();
            render(); // Render needs to be called after state changes
        }, 1000);
    }

    function animate() {
        if (!state.isPlaying) return;
        const ctx = canvas.getContext('2d');
        const elapsed = (performance.now() - lastStateUpdate) / 1000;
        const effectiveCountdown = state.countdown - elapsed;
        let progress = (state.phaseTime - effectiveCountdown) / state.phaseTime;
        progress = Math.max(0, Math.min(1, progress));
        const phase = state.count;
        const size = Math.min(canvas.width, canvas.height) * 0.6;
        const left = (canvas.width - size) / 2;
        const top = (canvas.height - size) / 2 + 120; // Adjusted top position
        const points = [
            {x: left, y: top + size},       // Bottom-left
            {x: left, y: top},             // Top-left
            {x: left + size, y: top},      // Top-right
            {x: left + size, y: top + size} // Bottom-right
        ];
        const startPoint = points[phase];
        const endPoint = points[(phase + 1) % 4];
        const currentX = startPoint.x + progress * (endPoint.x - startPoint.x);
        const currentY = startPoint.y + progress * (endPoint.y - startPoint.y);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#d97706'; // Amber color for the box
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, size, size);

        // Pulse effect
        let radius = 5;
        if (state.pulseStartTime !== null) {
            const pulseElapsed = (performance.now() - state.pulseStartTime) / 1000;
            if (pulseElapsed < 0.5) { // 0.5-second pulse duration
                const pulseFactor = Math.sin(Math.PI * pulseElapsed / 0.5); // Use sine wave for smooth pulse
                radius = 5 + 5 * pulseFactor; // Radius from 5 to 10 and back
            }
        }

        ctx.beginPath();
        ctx.arc(currentX, currentY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000'; // Red color for the dot
        ctx.fill();

        animationFrameId = requestAnimationFrame(animate);
    }

    function render() {
        let html = `
            <h1>Box Breathing</h1>
        `;
        if (state.isPlaying) {
            html += `
                <div class="timer">Total Time: ${formatTime(state.totalTime)}</div>
                <div class="instruction">${getInstruction(state.count)}</div>
                <div class="countdown">${state.countdown}</div>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
            html += `
                <div class="settings">
                    <div class="form-group">
                        <label class="switch">
                            <input type="checkbox" id="sound-toggle" ${state.soundEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                        <label for="sound-toggle">
                            ${state.soundEnabled ? icons.volume2 : icons.volumeX}
                            Sound ${state.soundEnabled ? 'On' : 'Off'}
                        </label>
                    </div>
                    <div class="form-group">
                        <input
                            type="number"
                            inputmode="numeric"
                            placeholder="Time limit (minutes)"
                            value="${state.timeLimit}"
                            id="time-limit"
                            step="1"
                            min="0"
                            >
                        <label for="time-limit">Minutes (optional)</label>
                    </div>
                </div>
                <div class="prompt">Press start to begin</div>
            `;
        }
        if (state.sessionComplete) {
            html += `<div class="complete">Complete!</div>`;
        }
        if (!state.sessionComplete) {
            html += `
                <button id="toggle-play">
                    ${state.isPlaying ? icons.pause : icons.play}
                    ${state.isPlaying ? 'Pause' : 'Start'}
                </button>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
             html += `
                <div class="slider-container">
                    <label for="phase-time-slider">Phase Time (seconds): <span id="phase-time-value">${state.phaseTime}</span></label>
                    <input type="range" min="3" max="6" step="1" value="${state.phaseTime}" id="phase-time-slider">
                    <div class="slider-labels">
                        <span style="left: 0%;">3</span>
                        <span style="left: 33.33%;">4</span>
                        <span style="left: 66.66%;">5</span>
                        <span style="left: 100%;">6</span>
                    </div>
                </div>
            `;
        }
        if (state.sessionComplete) {
            html += `
                <button id="reset">
                    ${icons.rotateCcw}
                    Back to Start
                </button>
            `;
        }
        if (!state.isPlaying && !state.sessionComplete) {
            html += `
                <div class="shortcut-buttons">
                    <button id="preset-2min" class="preset-button">
                        ${icons.clock} 2 min
                    </button>
                    <button id="preset-5min" class="preset-button">
                        ${icons.clock} 5 min
                    </button>
                    <button id="preset-10min" class="preset-button">
                        ${icons.clock} 10 min
                    </button>
                </div>
            `;
        }
        app.innerHTML = html;

        // Re-attach event listeners after rendering
        if (!state.sessionComplete) {
            document.getElementById('toggle-play').addEventListener('click', togglePlay);
        }
        if (state.sessionComplete) {
            document.getElementById('reset').addEventListener('click', resetToStart);
        }
        if (!state.isPlaying && !state.sessionComplete) {
            document.getElementById('sound-toggle').addEventListener('change', toggleSound);
            const timeLimitInput = document.getElementById('time-limit');
            if (timeLimitInput) timeLimitInput.addEventListener('input', handleTimeLimitChange);

            const phaseTimeSlider = document.getElementById('phase-time-slider');
             if (phaseTimeSlider) {
                phaseTimeSlider.addEventListener('input', function() {
                    state.phaseTime = parseInt(this.value);
                    // Update countdown immediately if slider changed while paused at start
                    if (!state.isPlaying && state.totalTime === 0) {
                         state.countdown = state.phaseTime;
                    }
                    // Update the displayed value
                    const phaseTimeValueSpan = document.getElementById('phase-time-value');
                    if(phaseTimeValueSpan) phaseTimeValueSpan.textContent = state.phaseTime;

                });
            }

            const preset2 = document.getElementById('preset-2min');
            const preset5 = document.getElementById('preset-5min');
            const preset10 = document.getElementById('preset-10min');
            if (preset2) preset2.addEventListener('click', () => startWithPreset(2));
            if (preset5) preset5.addEventListener('click', () => startWithPreset(5));
            if (preset10) preset10.addEventListener('click', () => startWithPreset(10));
        }
    }

    render(); // Initial render
});
