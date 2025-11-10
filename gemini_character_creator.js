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

    // Find the currently equipped upgrade to provide context to the AI
    const equippedUpgradeId = gameState.bunny.equippedCustomUpgradeId;
    const equippedUpgrade = gameState.customUpgrades.find(u => u.itemId === equippedUpgradeId);
    const baseCost = equippedUpgrade ? equippedUpgrade.cost : 0;

    let costPrompt = `The user wants to add the following to their character: "${promptText}". Calculate the cost for this new item and give it a name.`;
    let systemPrompt = `You are an AI for a game that determines the cost of cosmetic items. The cost is based on the complexity of the user's request. Simple items (hat, scarf) cost 50-150. More complex items (armor, wings) cost 150-400. Very complex items (full outfit, background change) cost 400-1000. Your response must be in JSON format like this: {"cost": number, "itemName": "short item name for the new addition"}`;
    
    if (equippedUpgrade) {
        costPrompt = `The character is already equipped with an item that cost ${equippedUpgrade.cost} and was described as: "${equippedUpgrade.prompt}". The user wants to add the following: "${promptText}". Calculate the NEW TOTAL cost for the character with this addition, and give a name for the new addition. The new total cost must be greater than the previous cost of ${equippedUpgrade.cost}.`;
        systemPrompt = `You are an AI for a game that determines the cost of cosmetic items. The cost is based on the complexity of the user's request. The user is adding to an existing item that costs ${equippedUpgrade.cost}. You must calculate a NEW TOTAL cost that is higher than the previous cost. The increase should be based on complexity: simple additions (scarf) add 50-150, complex additions (wings) add 150-400. Your response must be in JSON format like this: {"cost": new_total_cost, "itemName": "short item name for the new addition"}`;
    }

    // 1. Get Cost from AI
    let totalCost = 0;
    let itemName = "Custom Upgrade";
    try {
        const costCompletion = await websim.chat.completions.create({
            messages: [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: costPrompt
            }],
            json: true,
        });
        const result = JSON.parse(costCompletion.content);
        totalCost = result.cost || (baseCost + 200);
        itemName = result.itemName || "Custom Upgrade";
    } catch (e) {
        console.error("Error getting cost:", e);
        totalCost = baseCost + 200; // fallback cost
    }
    
    const additionalCost = totalCost - baseCost;

    updateModalContent(
        `<h3>Confirm Upgrade</h3>
        <p><strong>New Item:</strong> ${itemName}</p>
        <p><strong>Description:</strong> "${promptText}"</p>
        <p>This will cost an additional <strong>${additionalCost} Carrot Shards</strong> to unlock.</p>
        ${baseCost > 0 ? `<p>(New total value: ${totalCost} CS)</p>` : ''}
        <p>Proceed with generation?</p>
        <div class="modal-buttons">
            <button id="confirm-generation-btn">Yes, Create It!</button>
            <button id="cancel-generation-btn">Cancel</button>
        </div>
    `);

    document.getElementById('cancel-generation-btn').onclick = hideModal;
    document.getElementById('confirm-generation-btn').onclick = async () => {
        await proceedWithGeneration(promptText, itemName, totalCost);
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
        const baseBunnyDataUrl = await urlToDataUrl(gameState.bunny.currentPortraitUrl);
        const assetDataUrl = await urlToDataUrl(assetUrl);

        const mergeResult = await websim.imageGen({
            prompt: `Combine these two images. The rabbit is the character. The other image is an item or accessory that should be equipped by or added to the rabbit. Maintain the original cartoon art style and transparent background of the rabbit. The final image should just be the rabbit with its new equipment.`,
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

export async function toggleEquipUpgrade(upgrade) {
    if (!upgrade.purchased) return;

    // If it's already equipped, unequip it
    if (gameState.bunny.equippedCustomUpgradeId === upgrade.itemId) {
        gameState.bunny.equippedCustomUpgradeId = null;
        gameState.bunny.currentPortraitUrl = gameState.bunny.defaultPortraitUrl;
    } else { // Otherwise, equip it
        gameState.bunny.equippedCustomUpgradeId = upgrade.itemId;
        gameState.bunny.currentPortraitUrl = upgrade.mergedImageUrl;
    }
    document.querySelector('.bunny-portrait').src = gameState.bunny.currentPortraitUrl;
    saveGame();
    
    // Trigger a re-render to update the button states (equipped, etc.)
    const { render } = await import('./ui.js');
    render(gameState);
}

export async function purchaseAndEquip(upgrade) {
    const equippedUpgradeId = gameState.bunny.equippedCustomUpgradeId;
    const equippedUpgrade = gameState.customUpgrades.find(u => u.itemId === equippedUpgradeId);
    const baseCost = equippedUpgrade ? equippedUpgrade.cost : 0;
    const purchaseCost = upgrade.cost - baseCost;

    if (gameState.resources.carrotShards >= purchaseCost) {
        gameState.resources.carrotShards -= purchaseCost;
        playSound('upgrade');

        // Update the item's state locally for immediate UI feedback
        const localUpgrade = gameState.customUpgrades.find(u => u.itemId === upgrade.itemId);
        if (localUpgrade) {
            localUpgrade.purchased = true;
        }

        // Equip it right away
        toggleEquipUpgrade(upgrade);

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

        // saveGame is called inside toggleEquipUpgrade
    } else {
        alert("Not enough Carrot Shards!");
    }
}