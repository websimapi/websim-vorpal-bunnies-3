import { gameState, update, saveGame } from './game.js';
import { render } from './ui.js';
import { loadAllSounds } from './sounds.js';
import { initAICustomization } from './gemini_character_creator.js';

let lastTime = 0;
const room = new WebsimSocket();

async function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Update game logic
    update(deltaTime);

    // Render the new state
    render(gameState);

    requestAnimationFrame(gameLoop);
}

async function main() {
    await loadAllSounds();

    initAICustomization(room);
    
    const currentUser = await window.websim.getCurrentUser();

    room.collection('ai_upgrade')
        .filter({ username: currentUser.username })
        .subscribe((docs) => {
            if (docs.length > 0) {
                // The newest doc is the first one
                const userCreationsDoc = docs[0];
                gameState.customUpgrades = (userCreationsDoc.creations || []).slice().reverse();
            } else {
                gameState.customUpgrades = [];
            }
        });

    requestAnimationFrame(gameLoop);
}


// Start the game
main();