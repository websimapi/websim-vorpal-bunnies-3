const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundBuffers = {};

// Function to unlock the audio context on the first user gesture
function unlockAudioContext() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    // Remove the event listeners once the context is unlocked
    document.removeEventListener('click', unlockAudioContext);
    document.removeEventListener('keydown', unlockAudioContext);
    document.removeEventListener('touchstart', unlockAudioContext);
}

// Add event listeners to unlock the audio context
document.addEventListener('click', unlockAudioContext);
document.addEventListener('keydown', unlockAudioContext);
document.addEventListener('touchstart', unlockAudioContext);

async function loadSound(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        soundBuffers[name] = audioBuffer;
    } catch (error) {
        console.error(`Failed to load sound: ${name}`, error);
    }
}

export function playSound(name, volume = 0.7) {
    if (!soundBuffers[name] || audioContext.state !== 'running') {
        return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = soundBuffers[name];
    
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start(0);
}

export async function loadAllSounds() {
    await Promise.all([
        loadSound('monster_defeat', 'monster_defeat.mp3'),
        loadSound('level_up', 'level_up.mp3'),
        loadSound('upgrade', 'upgrade.mp3'),
        loadSound('ui_click', 'ui_click.mp3')
    ]);
}