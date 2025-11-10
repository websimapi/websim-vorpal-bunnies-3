import { purchaseUpgrade } from './game.js';
import { purchaseAndEquip, toggleEquipUpgrade } from './gemini_character_creator.js';
import { playSound } from './sounds.js';

const elements = {
    carrotShards: document.getElementById('carrot-shards'),
    bunnyName: document.getElementById('bunny-name'),
    bunnyLevel: document.getElementById('bunny-level'),
    xpBar: document.getElementById('xp-bar'),
    xpText: document.getElementById('xp-text'),
    bunnyHp: document.getElementById('bunny-hp'),
    bunnyMaxHp: document.getElementById('bunny-max-hp'),
    bunnyAttack: document.getElementById('bunny-attack'),
    bunnyDefense: document.getElementById('bunny-defense'),
    bunnyPortrait: document.querySelector('.bunny-portrait'),
    zoneName: document.getElementById('zone-name'),
    monstersToBoss: document.getElementById('monsters-to-boss'),
    monsterName: document.getElementById('monster-name'),
    monsterHpBar: document.getElementById('monster-hp-bar'),
    monsterHpText: document.getElementById('monster-hp-text'),
    monsterAttack: document.getElementById('monster-attack'),
    combatProgressBar: document.getElementById('combat-progress-bar'),
    logContainer: document.getElementById('log-container'),
    upgradesContainer: document.getElementById('upgrades-container'),
    customUpgradesContainer: document.getElementById('custom-upgrades-container'),
    modal: document.getElementById('ai-modal'),
    modalBody: document.getElementById('modal-body'),
};

let lastLogLength = 0;

function createUpgradeButton(state, key) {
    const upgrade = state.upgrades[key];
    const button = document.createElement('button');
    button.id = `upgrade-${key}`;
    button.className = 'upgrade-button';
    button.onclick = () => {
        playSound('ui_click');
        purchaseUpgrade(key);
    };

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = `${upgrade.name} (Lvl ${upgrade.level})`;

    const costSpan = document.createElement('span');
    costSpan.className = 'cost';
    costSpan.textContent = `${upgrade.cost} CS`;

    button.appendChild(nameSpan);
    button.appendChild(costSpan);
    elements.upgradesContainer.appendChild(button);
}

function updateUpgradeButton(state, key) {
    const upgrade = state.upgrades[key];
    const button = document.getElementById(`upgrade-${key}`);
    button.disabled = state.resources.carrotShards < upgrade.cost;
    button.querySelector('.name').textContent = `${upgrade.name} (Lvl ${upgrade.level})`;
    button.querySelector('.cost').textContent = `${upgrade.cost} CS`;
}

export function showModal(content) {
    elements.modalBody.innerHTML = content;
    elements.modal.style.display = 'flex';
}

export function hideModal() {
    elements.modal.style.display = 'none';
}

export function updateModalContent(content) {
    elements.modalBody.innerHTML = content;
}

function updateCustomUpgradeButtons(state) {
    const upgrades = state.customUpgrades || [];
    const container = elements.customUpgradesContainer;

    // Basic diffing to avoid recreating elements unnecessarily
    const existingButtons = new Map();
    container.querySelectorAll('.upgrade-button').forEach(btn => {
        existingButtons.set(btn.dataset.upgradeId, btn);
    });

    const newIds = new Set();

    upgrades.forEach(upgrade => {
        newIds.add(upgrade.itemId);
        let button = existingButtons.get(upgrade.itemId);

        if (!button) {
            button = document.createElement('button');
            button.className = 'upgrade-button';
            button.dataset.upgradeId = upgrade.itemId;
            button.onclick = () => {
                playSound('ui_click');
                if (!upgrade.purchased) {
                    purchaseAndEquip(upgrade);
                } else {
                    toggleEquipUpgrade(upgrade);
                }
            };
            container.appendChild(button);
        }

        const isEquipped = state.bunny.equippedCustomUpgradeId === upgrade.itemId;
        
        // Determine the cost to display/charge
        const equippedUpgradeId = state.bunny.equippedCustomUpgradeId;
        const equippedUpgrade = state.customUpgrades.find(u => u.itemId === equippedUpgradeId);
        const baseCost = equippedUpgrade ? equippedUpgrade.cost : 0;
        const displayCost = upgrade.cost - (isEquipped ? 0 : baseCost);

        const costText = upgrade.purchased 
            ? (isEquipped ? "Equipped" : "Equip") 
            : `${displayCost} CS`;
        
        button.innerHTML = `
            <span class="name">${upgrade.itemName} (Value: ${upgrade.cost})</span>
            <span class="cost">${costText}</span>
        `;
        
        button.disabled = !upgrade.purchased && state.resources.carrotShards < displayCost;
        
        button.classList.remove('purchased', 'equipped');
        if (upgrade.purchased) {
            button.classList.add('purchased');
        }
        if (isEquipped) {
            button.classList.add('equipped');
        }
    });

    // Remove old buttons
    existingButtons.forEach((button, id) => {
        if (!newIds.has(id)) {
            button.remove();
        }
    });
}

export function render(state) {
    window.gameState = state; // Make state globally accessible for button disabling
    elements.carrotShards.textContent = state.resources.carrotShards;

    // Bunny Info
    elements.bunnyPortrait.src = state.bunny.currentPortraitUrl;
    elements.bunnyName.textContent = state.bunny.name;
    elements.bunnyLevel.textContent = state.bunny.level;
    elements.xpText.textContent = `${state.bunny.xp} / ${state.bunny.xpToNextLevel}`;
    elements.xpBar.style.width = `${(state.bunny.xp / state.bunny.xpToNextLevel) * 100}%`;
    
    // Bunny Stats
    elements.bunnyHp.textContent = state.bunny.hp;
    elements.bunnyMaxHp.textContent = state.bunny.stats.maxHp;
    elements.bunnyAttack.textContent = state.bunny.stats.attack;
    elements.bunnyDefense.textContent = state.bunny.stats.defense;

    // Zone & Monster Info
    elements.zoneName.textContent = state.zone.name;
    elements.monstersToBoss.textContent = state.zone.monstersToBoss - state.zone.monstersDefeated;
    if (state.monster) {
        elements.monsterName.textContent = state.monster.name;
        elements.monsterHpText.textContent = `${state.monster.hp} / ${state.monster.maxHp}`;
        elements.monsterHpBar.style.width = `${(state.monster.hp / state.monster.maxHp) * 100}%`;
        elements.monsterAttack.textContent = state.monster.attack;
    }

    // Combat Progress
    elements.combatProgressBar.style.width = `${state.combat.progress}%`;

    // Log
    if (state.log.length !== lastLogLength) {
        elements.logContainer.innerHTML = state.log.map(msg => `<p>${msg}</p>`).join('');
        lastLogLength = state.log.length;
    }

    // Upgrades
    for (const key in state.upgrades) {
        if (!document.getElementById(`upgrade-${key}`)) {
            createUpgradeButton(state, key);
        }
        updateUpgradeButton(state, key);
    }

    // Custom Upgrades
    updateCustomUpgradeButtons(state);
}