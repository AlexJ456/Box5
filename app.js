document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    
    // App state
    const state = {
        isPlaying: false,
        count: 0,
        countdown: 4,
        totalTime: 0,
        soundEnabled: false,
        timeLimit: '',
        sessionComplete: false
    };

    // SVG Icons
    const icons = {
        play: `<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
        pause: `<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
        volume2: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
        volumeX: `<svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
        rotateCcw: `<svg class="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`
    };

    // Helper functions
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

    function playTone() {
        if (state.soundEnabled) {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 440 Hz is A4
            oscillator.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1); // Play for 0.1 seconds
        }
    }

    // Interval reference
    let interval;

    // Event handlers
    function togglePlay() {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
            state.totalTime = 0;
            state.countdown = 4;
            state.count = 0;
            state.sessionComplete = false;
            startInterval();
        } else {
            clearInterval(interval);
        }
        render();
    }

    function resetToStart() {
        state.isPlaying = false;
        state.totalTime = 0;
        state.countdown = 4;
        state.count = 0;
        state.sessionComplete = false;
        state.timeLimit = '';
        clearInterval(interval);
        render();
    }

    function toggleSound() {
        state.soundEnabled = !state.soundEnabled;
        render();
    }

    function handleTimeLimitChange(e) {
        state.timeLimit = e.target.value.replace(/[^0-9]/g, '');
        render();
    }

    function startInterval() {
        clearInterval(interval);
        interval = setInterval(() => {
            if (state.countdown === 1) {
                state.count = (state.count + 1) % 4;
                playTone();
                state.countdown = 4;
            } else {
                state.countdown -= 1;
            }
            
            state.totalTime += 1;
            
            if (state.timeLimit) {
                const timeLimitSeconds = parseInt(state.timeLimit) * 60;
                if (state.totalTime >= timeLimitSeconds) {
                    // Check if we're at the end of an exhale or need to continue to the next one
                    if (state.count === 2 && state.countdown === 1) {
                        state.sessionComplete = true;
                        state.isPlaying = false;
                        clearInterval(interval);
                    } else if (state.totalTime >= timeLimitSeconds + 12) {
                        // Force end after one more full cycle if we've gone too far
                        state.sessionComplete = true;
                        state.isPlaying = false;
                        clearInterval(interval);
                    }
                }
            }
            
            render();
        }, 1000);
    }

    // Render function
    function render() {
        let html = `
