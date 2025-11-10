import { gameState, saveGame } from './game.js';
import { showModal, hideModal, updateModalContent } from './ui.js';
import { playSound } from './sounds.js';

let room;

export function initAICustomization(socket) {
    room = socket;
    document.getElementById('generate-ai-upgrade-btn').addEventListener('click', handleGenerateUpgrade);
}

async function urlToDataUrl(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function handleGenerateUpgrade() {
    const promptText = document.getElementById('ai-prompt').value;
    if (!promptText) {
        alert("Please enter a description for your upgrade.");
        return;
    }

    showModal("Analyzing your idea...");

    // 1. Get Cost from AI
    let cost = 0;
    let itemName = "Custom Upgrade";
    try {
        const costCompletion = await websim.chat.completions.create({
            messages: [{
                role: "system",
                content: `You determine the cost of a cosmetic item for a game based on the user's request. Simple items (hat, scarf) should cost between 50-150. More complex items (armor, wings) 150-400. Very complex items (full outfit, background change) 400-1000. Respond with JSON: {"cost": number, "itemName": "short item name"}`
            }, {
                role: "user",
                content: promptText
            }],
            json: true,
        });
        const result = JSON.parse(costCompletion.content);
        cost = result.cost || 200;
        itemName = result.itemName || "Custom Upgrade";
    } catch (e) {
        console.error("Error getting cost:", e);
        cost = 200; // fallback cost
    }

    updateModalContent(
        `<h3>Confirm Upgrade</h3>
        <p><strong>Item:</strong> ${itemName}</p>
        <p><strong>Description:</strong> "${promptText}"</p>
        <p>This will cost <strong>${cost} Carrot Shards</strong> to unlock after it's generated.</p>
        <p>Proceed with generation?</p>
        <div class="modal-buttons">
            <button id="confirm-generation-btn">Yes, Create It!</button>
            <button id="cancel-generation-btn">Cancel</button>
        </div>
    `);

    document.getElementById('cancel-generation-btn').onclick = hideModal;
    document.getElementById('confirm-generation-btn').onclick = async () => {
        await proceedWithGeneration(promptText, itemName, cost);
    };
}

async function proceedWithGeneration(promptText, itemName, cost) {
    // 2. Generate Asset Image
    updateModalContent(
        `<h3>Generating Asset...</h3>
        <p>Our AI bunnies are sketching your '${itemName}'...</p>
        <div class="loader"></div>
        <p>This may take a moment.</p>
    `);
    let assetUrl;
    try {
        const assetResult = await websim.imageGen({
            prompt: `${itemName}, ${promptText}, cartoon style, fantasy game asset, simple, on a transparent background`,
            transparent: true
        });
        assetUrl = assetResult.url;
    } catch (e) {
        console.error("Error generating asset:", e);
        updateModalContent("<h3>Error!</h3><p>Our AI bunnies got distracted. Please try again.</p><button id='close-modal-btn'>Close</button>");
        document.getElementById('close-modal-btn').onclick = hideModal;
        return;
    }

    // 3. Merge Images
    updateModalContent(
        `<h3>Equipping Bunny...</h3>
        <p>Our AI tailor is fitting the '${itemName}' onto your bunny...</p>
        <div class="loader"></div>
        <p>This may also take a moment.</p>
    `);
    let mergedUrl;
    try {
        const baseBunnyDataUrl = await urlToDataUrl('./vorpal_bunny_portrait.png');
        const assetDataUrl = await urlToDataUrl(assetUrl);

        const mergeResult = await websim.imageGen({
            prompt: `Combine these two images. The rabbit is the character. The other image is an item that should be equipped by the rabbit. Maintain the original cartoon art style and transparent background of the rabbit.`,
            image_inputs: [{ url: baseBunnyDataUrl }, { url: assetDataUrl }],
            transparent: true,
        });
        mergedUrl = mergeResult.url;
    } catch (e) {
        console.error("Error merging images:", e);
        updateModalContent("<h3>Error!</h3><p>The new gear doesn't fit! Please try again.</p><button id='close-modal-btn'>Close</button>");
        document.getElementById('close-modal-btn').onclick = hideModal;
        return;
    }

    // 4. Save to database
    updateModalContent(
        `<h3>Saving Your Creation...</h3>
        <div class="loader"></div>
    `);
    const currentUser = await window.websim.getCurrentUser();

    const newItem = {
        itemId: self.crypto.randomUUID(),
        itemName,
        prompt: promptText,
        cost,
        mergedImageUrl: mergedUrl,
        purchased: false,
    };

    const userDocs = await room.collection('ai_upgrade').filter({ username: currentUser.username }).getList();
    const userCreationsDoc = userDocs.length > 0 ? userDocs[0] : null;

    if (userCreationsDoc) {
        // Document exists, update it by appending the new item
        const updatedCreations = [...(userCreationsDoc.creations || []), newItem];
        await room.collection('ai_upgrade').update(userCreationsDoc.id, {
            creations: updatedCreations
        });
    } else {
        // No document, create a new one
        await room.collection('ai_upgrade').create({
            // 'username' is added automatically by websim
            creations: [newItem]
        });
    }


    hideModal();
    document.getElementById('ai-prompt').value = "";
}

export async function purchaseAndEquip(upgrade) {
    if (gameState.resources.carrotShards >= upgrade.cost) {
        gameState.resources.carrotShards -= upgrade.cost;
        gameState.bunny.currentPortraitUrl = upgrade.mergedImageUrl;
        document.querySelector('.bunny-portrait').src = upgrade.mergedImageUrl;
        playSound('upgrade');

        // Update the item's state locally for immediate UI feedback
        const localUpgrade = gameState.customUpgrades.find(u => u.itemId === upgrade.itemId);
        if (localUpgrade) {
            localUpgrade.purchased = true;
        }

        // Find user's record and update the specific item in the array
        const currentUser = await window.websim.getCurrentUser();
        const userDocs = await room.collection('ai_upgrade').filter({ username: currentUser.username }).getList();
        const userCreationsDoc = userDocs.length > 0 ? userDocs[0] : null;

        if (userCreationsDoc) {
            const updatedCreations = userCreationsDoc.creations.map(item => {
                if (item.itemId === upgrade.itemId) {
                    return { ...item, purchased: true };
                }
                return item;
            });

            await room.collection('ai_upgrade').update(userCreationsDoc.id, {
                creations: updatedCreations
            });
        }


        saveGame();
        // The subscription will eventually sync, but local change is faster.
    } else {
        alert("Not enough Carrot Shards!");
    }
}