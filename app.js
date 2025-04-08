document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app-content');
    const canvas = document.getElementById('box-canvas');
    const container = document.querySelector('.container');
    // Debounce resize events
    let resizeTimeout;
    function handleResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            // Re-render if needed after resize, especially if drawing depends on dimensions
            if (!state.isPlaying) {
                 render(); // Re-render UI elements like the box outline
            } else {
                 // If playing, ensure the animation adjusts immediately
                 const ctx = canvas.getContext('2d');
                 ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear immediately
                 // Optionally call animate() once to redraw based on new size,
                 // but requestAnimationFrame loop will handle subsequent frames.
            }
        }, 100); // Adjust debounce delay as needed
    }
    window.addEventListener('resize', handleResize);
    // Initial size calculation
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;


    const state = {
        isPlaying: false,
        count: 0,
        countdown: 4, // Will be updated by phaseTime on start
        totalTime: 0,
        soundEnabled: false,
        timeLimit: '',
        sessionComplete: false,
        timeLimitReached: false,
        phaseTime: 4 // Default phase time
    };

    let wakeLock = null; // To store the wake lock sentinel

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

    let audioContext = null; // Reuse audio context

    function playTone() {
        if (state.soundEnabled) {
            try {
                // Initialize AudioContext on first user interaction (or here if needed)
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                 // Check if context is running (might be suspended initially)
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }

                const oscillator = audioContext.createOscillator();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz (A4 note)
                const gainNode = audioContext.createGain();
                gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // Start at half volume
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1); // Fade out quickly

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.1); // Stop after 100ms
            } catch (e) {
                console.error('Error playing tone:', e);
                // Disable sound if there's a persistent error
                // state.soundEnabled = false;
                // render(); // Update UI to reflect sound disabled
            }
        }
    }


    let interval;
    let animationFrameId;
    let lastStateUpdate;

    // Function to request a screen wake lock
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake lock is active');
                 wakeLock.addEventListener('release', () => {
                     // This listener helps if the lock is released by the system
                     console.log('Wake lock was released');
                     wakeLock = null;
                 });
            } catch (err) {
                console.error('Failed to acquire wake lock:', err.name, err.message);
            }
        } else {
            console.log('Wake Lock API not supported');
        }
    }

    // Function to release the wake lock
     async function releaseWakeLock() { // Make async to await release
        if (wakeLock !== null) {
             try {
                 await wakeLock.release();
                 console.log('Wake lock released');
                 wakeLock = null;
             } catch (err) {
                 console.error('Failed to release wake lock:', err.name, err.message);
             }
        }
    }

    // Function to handle visibility changes
    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden' && wakeLock !== null) {
            // Optional: Release wake lock when tab is hidden to conserve battery
            // releaseWakeLock();
        } else if (document.visibilityState === 'visible' && state.isPlaying) {
            // Re-request wake lock if needed when tab becomes visible again
            requestWakeLock();
             // Re-sync animation timer if significant time passed
             lastStateUpdate = performance.now() - 10; // Adjust start slightly to avoid jump
             animate(); // Restart animation loop if paused
        }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);


    function togglePlay() {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
             // Resume AudioContext if it was suspended
             if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
            state.totalTime = 0;
            state.countdown = state.phaseTime; // Use current phaseTime
            state.count = 0;
            state.sessionComplete = false;
            state.timeLimitReached = false;
            playTone(); // Play initial tone
            startInterval();
            lastStateUpdate = performance.now(); // Set initial timestamp for animation
            animate();
            requestWakeLock(); // Request wake lock when starting
        } else {
            clearInterval(interval);
            cancelAnimationFrame(animationFrameId);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas on pause
            releaseWakeLock(); // Release wake lock when pausing
        }
        render();
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0;
        state.countdown = state.phaseTime; // Reset countdown based on current phaseTime
        state.count = 0;
        state.sessionComplete = false;
        // state.timeLimit = ''; // Keep time limit unless explicitly cleared
        state.timeLimitReached = false;
        clearInterval(interval);
        cancelAnimationFrame(animationFrameId);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas on reset
        releaseWakeLock(); // Release wake lock when resetting
        render();
    }

    function toggleSound() {
         state.soundEnabled = !state.soundEnabled;
         // Initialize AudioContext on first user interaction enabling sound
         if (state.soundEnabled && !audioContext) {
             audioContext = new (window.AudioContext || window.webkitAudioContext)();
         }
         // If turning sound off, maybe suspend the context
         // if (!state.soundEnabled && audioContext && audioContext.state === 'running') {
         //     audioContext.suspend();
         // }
         render(); // Update UI immediately
    }

    function handleTimeLimitChange(e) {
        // Allow only digits, clear if non-numeric input occurs
        const value = e.target.value;
        const numericValue = value.replace(/[^0-9]/g, '');
        state.timeLimit = numericValue;
         // Update the input value directly to reflect the sanitized state
         e.target.value = state.timeLimit;
    }

    function startWithPreset(minutes) {
         // Resume AudioContext if it was suspended
         if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        state.timeLimit = minutes.toString();
        state.isPlaying = true;
        state.totalTime = 0;
        state.countdown = state.phaseTime; // Use current phaseTime
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimitReached = false;
        playTone(); // Play initial tone
        startInterval();
        lastStateUpdate = performance.now(); // Set initial timestamp
        animate();
        requestWakeLock(); // Request wake lock when starting with preset
        render();
    }

    function startInterval() {
        clearInterval(interval); // Clear any existing interval
        // Set initial lastStateUpdate for immediate animation start
        lastStateUpdate = performance.now();

        interval = setInterval(() => {
             // Check if the document is visible. If not, pause the interval logic.
            if (document.hidden) {
                return; // Skip updates while hidden
            }
            state.totalTime += 1;
            // Check time limit
            if (state.timeLimit && !state.timeLimitReached) {
                const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                if (state.totalTime >= timeLimitSeconds) {
                    state.timeLimitReached = true;
                    // Check if we should end the session immediately upon reaching the time limit
                    // This depends on desired behavior (e.g., finish the current cycle)
                    // For now, we let it complete the current 'Wait' phase (count === 3)
                }
            }

            if (state.countdown === 1) { // End of a phase
                state.count = (state.count + 1) % 4; // Move to next phase
                state.countdown = state.phaseTime; // Reset countdown for new phase
                playTone(); // Play tone at the start of the new phase

                // Check for session completion (at the end of 'Wait' phase if time limit reached)
                if (state.count === 0 && state.timeLimitReached) { // Check at the *start* of Inhale after time limit reached
                    state.sessionComplete = true;
                    state.isPlaying = false;
                    clearInterval(interval);
                    cancelAnimationFrame(animationFrameId);
                    releaseWakeLock(); // Release wake lock when session completes
                    render(); // Update UI to show completion
                    return; // Exit interval callback
                }
            } else {
                state.countdown -= 1; // Decrement countdown
            }

            // Update lastStateUpdate timestamp for animation synchronization
            // We do this within the interval that drives the state changes
            lastStateUpdate = performance.now();

            // Render state changes (like countdown number)
             // Only call render if state relevant to UI text has changed (optimization)
            render(); // Or optimize to only render text parts if needed


        }, 1000);
    }

     function animate() {
        if (!state.isPlaying || document.hidden) { // Also pause animation if tab is hidden
            cancelAnimationFrame(animationFrameId); // Stop the loop if paused or hidden
            return;
        }
        const ctx = canvas.getContext('2d');
        const elapsed = (performance.now() - lastStateUpdate) / 1000; // Time since last *state update*
        let effectiveCountdown = state.countdown - elapsed;

        // Prevent progress going negative if interval fires slightly late
        if (effectiveCountdown < 0) effectiveCountdown = 0;

        let progress = (state.phaseTime - effectiveCountdown) / state.phaseTime;
        progress = Math.max(0, Math.min(1, progress)); // Clamp progress between 0 and 1

        const phase = state.count;
        const sizeRatio = 0.5; // Relative size of the box to the smaller dimension
        const verticalOffsetRatio = 0.1; // Move box down slightly from true center

        const availableWidth = canvas.width;
        const availableHeight = canvas.height;
        const minDim = Math.min(availableWidth, availableHeight);
        const size = minDim * sizeRatio;


        // Calculate top-left corner for centering
         const left = (availableWidth - size) / 2;
         const top = (availableHeight - size) / 2 + (availableHeight * verticalOffsetRatio); // Centered with offset


        const points = [
            {x: left, y: top + size},       // Bottom-left (Start of Inhale, phase 0)
            {x: left, y: top},             // Top-left    (Start of Hold, phase 1)
            {x: left + size, y: top},      // Top-right   (Start of Exhale, phase 2)
            {x: left + size, y: top + size} // Bottom-right(Start of Wait, phase 3)
        ];

        const startPoint = points[phase];
        const endPoint = points[(phase + 1) % 4];

        const currentX = startPoint.x + progress * (endPoint.x - startPoint.x);
        const currentY = startPoint.y + progress * (endPoint.y - startPoint.y);

        // --- Drawing ---
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas each frame

        // Draw the static orange square outline
        ctx.strokeStyle = '#d97706'; // Orange color
        ctx.lineWidth = 3; // Slightly thicker line
        ctx.strokeRect(left, top, size, size);

        // Draw the bright red moving dot
        ctx.beginPath();
        // Make dot slightly larger
        ctx.arc(currentX, currentY, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0000'; // Bright red
        ctx.fill();
         // Draw phase corners (optional visual aid)
         /*
         ctx.fillStyle = '#ffffff'; // White dots for corners
         points.forEach(p => {
             ctx.beginPath();
             ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
             ctx.fill();
         });
         */
        // --- End Drawing ---

        animationFrameId = requestAnimationFrame(animate); // Continue the loop
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
            // Settings section
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
                            type="tel"
                            placeholder="Limit (min)" /* Shorter placeholder */
                            value="${state.timeLimit}"
                            id="time-limit"
                            style="width: 80px; text-align: center;" /* Adjust style as needed */
                        >
                        <label for="time-limit">Minutes</label>
                    </div>
                     <div class="slider-container form-group" style="flex-direction: column; gap: 0.5rem;">
                        <label for="phase-time-slider">Phase Time: <span id="phase-time-value">${state.phaseTime}</span>s</label>
                        <input type="range" min="3" max="6" step="1" value="${state.phaseTime}" id="phase-time-slider" style="width: 160px;">
                    </div>
                </div>
                <div class="prompt">Press start to begin</div>
            `;
        }

        if (state.sessionComplete) {
            html += `<div class="complete">Complete! Total time: ${formatTime(state.totalTime)}</div>`;
        }

        // Action Buttons
        if (!state.sessionComplete) {
             // Start/Pause Button
            html += `
                <button id="toggle-play" style="margin-bottom: 1rem;">
                    ${state.isPlaying ? icons.pause : icons.play}
                    ${state.isPlaying ? 'Pause' : 'Start'}
                </button>
            `;
        } else {
            // Reset Button
            html += `
                <button id="reset" style="margin-bottom: 1rem;">
                    ${icons.rotateCcw}
                    Back to Start
                </button>
            `;
        }


        // Preset Buttons (only show if not playing and not complete)
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

        app.innerHTML = html; // Update the DOM

         // --- Add Event Listeners ---
         // Always add listener if button exists
         const togglePlayButton = document.getElementById('toggle-play');
         if(togglePlayButton) {
             togglePlayButton.addEventListener('click', togglePlay);
         }
          const resetButton = document.getElementById('reset');
         if(resetButton) {
             resetButton.addEventListener('click', resetToStart);
         }


        if (!state.isPlaying && !state.sessionComplete) {
            // Sound toggle listener
             const soundToggle = document.getElementById('sound-toggle');
             if (soundToggle) {
                 soundToggle.addEventListener('change', toggleSound);
             }

            // Time limit input listener
            const timeLimitInput = document.getElementById('time-limit');
             if(timeLimitInput) {
                 timeLimitInput.addEventListener('input', handleTimeLimitChange);
                 // Removed the focus hack listener
             }


            // Phase time slider listener
            const phaseTimeSlider = document.getElementById('phase-time-slider');
             if (phaseTimeSlider) {
                phaseTimeSlider.addEventListener('input', function() {
                    state.phaseTime = parseInt(this.value);
                    document.getElementById('phase-time-value').textContent = state.phaseTime;
                     // Update countdown immediately if user changes slider before starting
                     if (!state.isPlaying) {
                        state.countdown = state.phaseTime;
                     }
                });
            }

            // Preset buttons listeners
            const preset2 = document.getElementById('preset-2min');
             if(preset2) {
                 preset2.addEventListener('click', () => startWithPreset(2));
             }
             const preset5 = document.getElementById('preset-5min');
             if(preset5) {
                 preset5.addEventListener('click', () => startWithPreset(5));
             }
              const preset10 = document.getElementById('preset-10min');
             if(preset10) {
                 preset10.addEventListener('click', () => startWithPreset(10));
             }
        }
         // If playing, ensure the canvas animation is running
        if (state.isPlaying) {
            animate(); // Call animate ensure it restarts if render caused a pause
        } else {
             // If not playing, ensure canvas is clear or shows initial state if needed
             const ctx = canvas.getContext('2d');
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             // Optionally draw the initial box outline here if desired when paused/reset
             // drawStaticBoxOutline(ctx, canvas); // Example function call
        }

    }


    // Initial render call to display the UI
    render();
});