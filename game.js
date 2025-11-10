import { getRandomInt } from './utils.js';
import { playSound } from './sounds.js';

const SAVE_KEY = 'vorpalBunniesSaveData';
let saveInterval = 5; // seconds
let timeSinceSave = 0;

export let gameState = {
    bunny: {
        name: "Binky",
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        baseStats: { attack: 1, defense: 0, maxHp: 10 },
        stats: { attack: 1, defense: 0, maxHp: 10 },
        hp: 10,
        currentPortraitUrl: 'vorpal_bunny_portrait.png',
        defaultPortraitUrl: 'vorpal_bunny_portrait.png',
        equippedCustomUpgradeId: null,
    },
    monster: null,
    zone: {
        name: "The Sunny Meadow",
        level: 1,
        monstersDefeated: 0,
        monstersToBoss: 10,
    },
    resources: {
        carrotShards: 0,
    },
    customUpgrades: [], // To store AI-generated upgrades
    combat: {
        progress: 0,
        speed: 10, // progress per second
    },
    upgrades: {
        sharperFangs: { name: "Sharper Fangs", level: 0, baseCost: 10, cost: 10, bonus: 1, type: "attack" },
        fluffierArmor: { name: "Fluffier Armor", level: 0, baseCost: 15, cost: 15, bonus: 1, type: "defense" },
        carrotVitamins: { name: "Carrot Vitamins", level: 0, baseCost: 20, cost: 20, bonus: 5, type: "maxHp" }
    },
    log: ["Your adventure begins!"],
};

export function saveGame() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.error("Failed to save game state:", e);
    }
}

function deepMerge(target, source) {
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) {
                    Object.assign(target, { [key]: {} });
                }
                deepMerge(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }
    return target;
}

function loadGame() {
    try {
        const savedStateJSON = localStorage.getItem(SAVE_KEY);
        if (!savedStateJSON) return;

        const savedState = JSON.parse(savedStateJSON);

        // Use a deep merge to preserve new properties from default state
        deepMerge(gameState, savedState);

        // Reset transient state
        gameState.combat.progress = 0;
        gameState.monster = null;

        // Ensure stats are correct after loading upgrades and level
        recalculateBunnyStats();

        // Restore correct portrait based on equipped item
        if (gameState.bunny.equippedCustomUpgradeId) {
            // Find the upgrade from the saved customUpgrades list
            const equippedUpgrade = (gameState.customUpgrades || []).find(u => u.itemId === gameState.bunny.equippedCustomUpgradeId && u.purchased);
            if (equippedUpgrade) {
                gameState.bunny.currentPortraitUrl = equippedUpgrade.mergedImageUrl;
            } else {
                // Equipped item not found or not purchased, reset to default
                gameState.bunny.equippedCustomUpgradeId = null;
                gameState.bunny.currentPortraitUrl = gameState.bunny.defaultPortraitUrl || 'vorpal_bunny_portrait.png';
            }
        } else {
            gameState.bunny.currentPortraitUrl = gameState.bunny.defaultPortraitUrl || 'vorpal_bunny_portrait.png';
        }

        // Make sure bunny has HP, especially if loaded from an old save
        if (!gameState.bunny.hp) {
             gameState.bunny.hp = gameState.bunny.stats.maxHp;
        }
        if (!gameState.bunny.currentPortraitUrl) {
            gameState.bunny.currentPortraitUrl = 'vorpal_bunny_portrait.png';
        }

        gameState.log.unshift("Game loaded successfully!");

    } catch (e) {
        console.error("Failed to load game state:", e);
        localStorage.removeItem(SAVE_KEY); // Clear corrupted save
    }
}

const MONSTER_ADJECTIVES = ["Grassy", "Slimy", "Fuzzy", "Angry", "Tiny"];
const MONSTER_NOUNS = ["Slime", "Squeaker", "Muncher", "Crawler", "Hopper"];

function generateMonster() {
    const level = gameState.zone.level;
    const name = `${MONSTER_ADJECTIVES[getRandomInt(0, MONSTER_ADJECTIVES.length - 1)]} ${MONSTER_NOUNS[getRandomInt(0, MONSTER_NOUNS.length - 1)]}`;
    const hp = Math.ceil(5 * Math.pow(1.2, level - 1));
    const attack = Math.ceil(1 * Math.pow(1.15, level - 1));
    const xpValue = 10 * level;
    const carrotValue = 5 * level;

    gameState.monster = {
        name,
        level,
        hp,
        maxHp: hp,
        attack,
        xpValue,
        carrotValue
    };
}

function addLog(message) {
    gameState.log.unshift(message);
    if (gameState.log.length > 20) {
        gameState.log.pop();
    }
}

function levelUpBunny() {
    if (gameState.bunny.xp >= gameState.bunny.xpToNextLevel) {
        gameState.bunny.level++;
        gameState.bunny.xp -= gameState.bunny.xpToNextLevel;
        gameState.bunny.xpToNextLevel = Math.floor(gameState.bunny.xpToNextLevel * 1.5);

        // Improve base stats on level up
        gameState.bunny.baseStats.maxHp += 2;
        gameState.bunny.baseStats.attack += 1;

        recalculateBunnyStats();
        gameState.bunny.hp = gameState.bunny.stats.maxHp; // Full heal on level up

        addLog(`Ding! ${gameState.bunny.name} reached level ${gameState.bunny.level}!`);
        playSound('level_up');
    }
}

function recalculateBunnyStats() {
    const { baseStats, stats } = gameState.bunny;
    const { sharperFangs, fluffierArmor, carrotVitamins } = gameState.upgrades;

    stats.attack = baseStats.attack + (sharperFangs.level * sharperFangs.bonus);
    stats.defense = baseStats.defense + (fluffierArmor.level * fluffierArmor.bonus);
    stats.maxHp = baseStats.maxHp + (carrotVitamins.level * carrotVitamins.bonus);
}

export function purchaseUpgrade(upgradeKey) {
    const upgrade = gameState.upgrades[upgradeKey];
    if (gameState.resources.carrotShards >= upgrade.cost) {
        gameState.resources.carrotShards -= upgrade.cost;
        upgrade.level++;
        upgrade.cost = Math.floor(upgrade.baseCost * Math.pow(1.2, upgrade.level));
        recalculateBunnyStats();
        // Heal bunny to new max HP if HP upgrade is bought
        if (upgrade.type === "maxHp") {
            gameState.bunny.hp = gameState.bunny.stats.maxHp;
        }
        addLog(`Upgraded ${upgrade.name} to level ${upgrade.level}!`);
        playSound('upgrade');
        saveGame(); // Save after a purchase
        return true;
    }
    return false;
}

export function update(deltaTime) {
    if (!gameState.monster) {
        generateMonster();
    }

    gameState.combat.progress += gameState.combat.speed * deltaTime;

    if (gameState.combat.progress >= 100) {
        gameState.combat.progress = 0;

        // Combat resolution (simplified)
        const monster = gameState.monster;
        addLog(`${gameState.bunny.name} defeated a ${monster.name}!`);
        playSound('monster_defeat');

        gameState.resources.carrotShards += monster.carrotValue;
        gameState.bunny.xp += monster.xpValue;

        levelUpBunny();

        gameState.zone.monstersDefeated++;

        generateMonster();
    }

    // Periodic save
    timeSinceSave += deltaTime;
    if (timeSinceSave >= saveInterval) {
        saveGame();
        timeSinceSave = 0;
    }
}

// Initialize
loadGame();
recalculateBunnyStats();
generateMonster();