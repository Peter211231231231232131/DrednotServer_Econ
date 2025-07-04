// index.js (Final Merged & Upgraded Script with Clans & Power Grid)

// --- Library Imports ---
const { Client, GatewayIntentBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

// =========================================================================
// --- STABILITY: GLOBAL ERROR HANDLERS ---
// =========================================================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('CRITICAL: Uncaught Exception:', error);
});
// =========================================================================

// --- Bot & Server Setup ---
const app = express();
const port = 3000;
app.use(express.json());
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const YOUR_API_KEY = 'drednot123';

// =========================================================================
// --- MONGODB DATABASE & IN-MEMORY STATE ---
// =========================================================================
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("CRITICAL: MONGO_URI not found!");
const mongoClient = new MongoClient(mongoUri);
let economyCollection, verificationsCollection, marketCollection, lootboxCollection, clansCollection, serverStateCollection; // Added clan collections
let userPaginationData = {};
let currentGlobalEvent = null;

async function connectToDatabase() {
    try {
        await mongoClient.connect();
        console.log("Successfully connected to MongoDB Atlas!");
        const db = mongoClient.db("drednot_economy");
        economyCollection = db.collection("players");
        verificationsCollection = db.collection("verifications");
        marketCollection = db.collection("market_listings");
        lootboxCollection = db.collection("lootbox_listings");
        clansCollection = db.collection("clans");
        serverStateCollection = db.collection("server_state");
        console.log("Database collections are set up.");
    } catch (error) { console.error("DB connection failed", error); process.exit(1); }
}

// =========================================================================
// --- ECONOMY DEFINITIONS ---
// =========================================================================
const CURRENCY_NAME = 'Bits';
const STARTING_BALANCE = 30;
const DISCORD_INVITE_LINK = 'https://discord.gg/gQ7ysW55BV'
// --- REWARD & STREAK CONSTANTS ---
const DAILY_REWARD_BASE = 1500;
const DAILY_STREAK_BONUS = 250;
const HOURLY_REWARD_BASE = 25;
const HOURLY_STREAK_BONUS = 25;

const WORK_REWARD_MIN = 5, WORK_REWARD_MAX = 35, WORK_COOLDOWN_MINUTES = 1;
const HOURLY_COOLDOWN_MINUTES = 60;
const GATHER_COOLDOWN_MINUTES = 3, MAX_GATHER_TYPES_BASE = 2;
const MARKET_TAX_RATE = 0.05;
const MARKET_MIN_PRICE = 1;
const MARKET_MAX_PRICE = 10000;
const FLIP_MIN_BET = 5, FLIP_MAX_BET = 100;
const SLOTS_MIN_BET = 10, SLOTS_MAX_BET = 1500, SLOTS_COOLDOWN_SECONDS = 5;
const SMELT_COOLDOWN_SECONDS_PER_ORE = 30, SMELT_COAL_COST_PER_ORE = 1;
const MINIMUM_ACTION_COOLDOWN_MS = 1000;
const ZEALOT_DECAY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const EVENT_CHANNEL_ID = '1231644783350911006'; // <-- IMPORTANT: SET THIS
const DREDNOT_INVITE_LINK = 'https://drednot.io/invite/wQcS5UHUS5wkGVCKvSDyTMa_';
const EVENT_TICK_INTERVAL_MINUTES = 5;
const EVENT_CHANCE = 0.15;
const EVENTS = {
    BIT_RUSH: { name: "Bit Rush", duration_ms: 5 * 60 * 1000, description: `All Bits earned from **/work** are **DOUBLED**!`, emoji: '💰', effect: { type: 'work', multiplier: 2 } },
    SURGING_RESOURCES: { name: "Surging Resources", duration_ms: 10 * 60 * 1000, description: `The chance to find all common resources from **/gather** is significantly **INCREASED**!`, emoji: '⛏️', effect: { type: 'gather_chance', multiplier: 1.5 } },
    GOLDEN_HOUR: { name: "Golden Hour", duration_ms: 5 * 60 * 1000, description: `The chance to find a **Trait Reforger** from **/gather** is **TRIPLED**!`, emoji: '✨', effect: { type: 'gather_rare_chance', multiplier: 3, item: 'trait_reforger' } },
    MARKET_MADNESS: { name: "Market Madness", duration_ms: 15 * 60 * 1000, description: `The 5% sales tax on the player market has been **REMOVED**! Sell your items tax-free!`, emoji: '💸', effect: { type: 'market_tax', rate: 0 } },
    SUPER_SMELTER: { name: "Super Smelter", duration_ms: 10 * 60 * 1000, description: `All smelting and cooking jobs are **TWICE AS FAST**!`, emoji: '🔥', effect: { type: 'super_smelter' } },
};

const TRAITS = {
    'scavenger': { name: 'Scavenger', rarity: 'Common', weight: 30, maxLevel: 5, description: "Grants a {chance}% chance to find bonus common resources from /work." },
    'prodigy': { name: 'Prodigy', rarity: 'Common', weight: 30, maxLevel: 5, description: "Reduces /work and /gather cooldowns by {reduction}%." },
    'wealth': { name: 'Wealth', rarity: 'Uncommon', weight: 15, maxLevel: 5, description: "Increases Bits earned from /work by {bonus}%." },
    'surveyor': { name: 'Surveyor', rarity: 'Uncommon', weight: 10, maxLevel: 5, description: "Grants a {chance}% chance to double your entire haul from /gather." },
    'collector': { name: 'The Collector', rarity: 'Rare', weight: 7, maxLevel: 5, description: "Increases the bonus reward for first-time crafts by {bonus}%." },
    'the_addict': { name: 'The Addict', rarity: 'Rare', weight: 7, maxLevel: 5, description: "After losing a gamble, gain 'The Rush', buffing your next /work based on the % of wealth lost." },
    'zealot': { name: 'Zealot', rarity: 'Legendary', weight: 1, maxLevel: 5, description: "Gain stacks of 'Zeal' on activity, massively boosting rewards. Stacks reset if inactive for 10 minutes." },
};

// --- GRID SYSTEM ---
const GRID_TICK_INTERVAL_MINUTES = 60; // How often the grid produces resources
const BUILDINGS = {
    'solar_panel': { name: "Solar Panel", emoji: "☀️", type: 'generator', craftable: true, recipe: { 'copper_wire': 9, 'iron_ingot': 4, 'copper_ingot': 5 }, effects: { power_generation: 10 } },
    'auto_miner': { name: "Auto-Miner", emoji: "⛏️", type: 'consumer', craftable: true, recipe: { 'copper_wire': 20, 'iron_stick': 5 }, effects: { power_consumption: 15, bits_generation: 25 } },
    'tower': { name: "Tower", emoji: "🗼", type: 'enhancer', craftable: true, recipe: { 'copper_wire': 30, 'iron_stick': 5, 'raw_crystal': 5 }, effects: { power_consumption: 20 } },
};
// --- END GRID SYSTEM ---

const ITEMS = {
    'trait_reforger': { name: "Trait Reforger", emoji: "✨", description: "A mysterious artifact that allows you to reshape your innate abilities. Use it with /traits reroll or !traitroll." },
    'iron_ore': { name: "Iron Ore", emoji: "🔩" }, 'copper_ore': { name: "Copper Ore", emoji: "🟤" }, 'wood': { name: "Wood", emoji: "🪵" }, 'stone': { name: "Stone", emoji: "🪨" }, 'coal': { name: "Coal", emoji: "⚫" }, 'raw_crystal':{ name: "Raw Crystal", emoji: "💎" }, 'iron_ingot': { name: "Iron Ingot", emoji: "⛓️" }, 'copper_ingot':{ name: "Copper Ingot", emoji: "🟧" }, 
    // --- GRID SYSTEM ---
    'copper_wire': { name: "Copper Wire", emoji: "⚙️", craftable: true, recipe: { 'copper_ingot': 1 } },
    'iron_stick': { name: "Iron Stick", emoji: "➖", craftable: true, recipe: { 'iron_ingot': 2 } },
    // --- END GRID SYSTEM ---
    'basic_pickaxe': { name: "Basic Pickaxe", emoji: "⛏️", type: "tool", effects: { work_bonus_flat: 1 }, craftable: true, recipe: { 'stone': 5, 'wood': 2 } }, 'sturdy_pickaxe': { name: "Sturdy Pickaxe", emoji: "⚒️", type: "tool", effects: { work_bonus_percent: 0.10 }, craftable: true, recipe: { 'iron_ore': 10, 'wood': 3, 'coal': 2 } }, 'iron_pickaxe': { name: "Iron Pickaxe", emoji: "🦾", type: "tool", effects: { work_bonus_flat: 5 }, craftable: true, recipe: { 'iron_ingot': 5, 'wood': 2} }, 'crystal_pickaxe': { name: "Crystal Pickaxe", emoji: "💠", type: "tool", effects: { work_bonus_percent: 0.30 }, craftable: true, recipe: { 'sturdy_pickaxe': 1, 'raw_crystal': 3, 'iron_ore': 5 } }, 'gathering_basket': { name: "Gathering Basket", emoji: "🧺", type: "tool", craftable: true, recipe: { 'wood': 15, 'stone': 5 } }, 'smelter': { name: "Smelter", emoji: "🏭", type: "tool", craftable: true, recipe: { 'stone': 9 } }, 'wild_berries': { name: "Wild Berries", emoji: "🫐", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 10 * 1000 } } }, 'glow_mushroom': { name: "Glow Mushroom", emoji: "🍄", type: "food", buff: { duration_ms: 10 * 60 * 1000, effects: { gather_cooldown_reduction_ms: 5 * 1000 } } }, 'raw_meat': { name: "Raw Meat", emoji: "🍖", type: "food" }, 'smoked_meat': { name: "Smoked Meat", emoji: "🥩", type: "food", buff: { duration_ms: 5 * 60 * 1000, effects: { work_cooldown_reduction_ms: 15 * 1000 } } }, 'spicy_pepper': { name: "Spicy Pepper", emoji: "🌶️", type: "food", buff: { duration_ms: 3 * 60 * 1000, effects: { work_double_or_nothing: true } } },
    // --- GRID SYSTEM ---
    ...Object.entries(BUILDINGS).reduce((acc, [id, data]) => {
        if (data.craftable) {
            acc[id] = { ...data, type: 'building' };
        }
        return acc;
    }, {})
    // --- END GRID SYSTEM ---
};

const GATHER_TABLE = {
    'iron_ore': { baseChance: 0.60, minQty: 1, maxQty: 3 }, 'copper_ore': { baseChance: 0.40, minQty: 1, maxQty: 2 }, 'stone': { baseChance: 0.70, minQty: 2, maxQty: 5 }, 'wood': { baseChance: 0.50, minQty: 1, maxQty: 4 }, 'coal': { baseChance: 0.30, minQty: 1, maxQty: 2 }, 'raw_crystal':{ baseChance: 0.05, minQty: 1, maxQty: 1 }, 'wild_berries': { baseChance: 0.15, minQty: 1, maxQty: 1 }, 'glow_mushroom': { baseChance: 0.10, minQty: 1, maxQty: 1 }, 'raw_meat': { baseChance: 0.20, minQty: 1, maxQty: 1 }, 'spicy_pepper': { baseChance: 0.03, minQty: 1, maxQty: 1 },
    'trait_reforger': { baseChance: 0.015, minQty: 1, maxQty: 1 },
};
const SMELTABLE_ORES = { 'iron_ore': 'iron_ingot', 'copper_ore': 'copper_ingot' };
const COOKABLE_FOODS = { 'raw_meat': 'smoked_meat' };
const SLOT_REELS = [ ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔'], ['🍒', '🍋', '🍊', '🍉', '⭐', '🔔', '💎', '💰', '💔']];
const SLOTS_PAYOUTS = { three_of_a_kind: 15, two_of_a_kind: 3.5, jackpot_symbol: '💎', jackpot_multiplier: 50 };
const VENDOR_TICK_INTERVAL_MINUTES = 1;
const VENDORS = [ { name: "TerraNova Exports", sellerId: "NPC_TERRA", stock: [ { itemId: 'wood', quantity: 20 }, { itemId: 'stone', quantity: 20 } ], chance: 0.5 }, { name: "Nexus Logistics", sellerId: "NPC_NEXUS", stock: [ { itemId: 'basic_pickaxe', quantity: 1, price: 15 }, { itemId: 'sturdy_pickaxe', quantity: 1, price: 75 } ], chance: 0.3 }, { name: "Blackrock Mining Co.", sellerId: "NPC_BLACKROCK", stock: [ { itemId: 'coal', quantity: 15 }, { itemId: 'iron_ore', quantity: 10 }, { itemId: 'copper_ore', quantity: 10 } ], chance: 0.4 }, { name: "Junk Peddler", sellerId: "NPC_JUNK", stock: [ { itemId: 'stone', quantity: 5 }, { itemId: 'wood', quantity: 5 } ], chance: 0.6 } ];
const FALLBACK_PRICES = { 'wood': { min: 1, max: 5 }, 'stone': { min: 1, max: 5 }, 'coal': { min: 2, max: 8 }, 'iron_ore': { min: 3, max: 10 }, 'copper_ore': { min: 4, max: 12 }, 'raw_crystal': { min: 50, max: 150 }, 'raw_meat': { min: 2, max: 6 }, 'default': { min: 1, max: 50 } };
const LOOTBOX_VENDOR_NAME = "The Collector";
const LOOTBOX_VENDOR_ID = "NPC_COLLECTOR";
const LOOTBOX_TICK_INTERVAL_MINUTES = 1;
const MAX_LOOTBOX_LISTINGS = 5;

const LOOTBOXES = {
    'miners_crate': { name: "Miner's Crate", emoji: '📦', price: 250, contents: [ { type: 'item', id: 'iron_ore', min: 10, max: 25, weight: 40 }, { type: 'item', id: 'copper_ore', min: 8, max: 20, weight: 30 }, { type: 'item', id: 'coal', min: 15, max: 30, weight: 20 }, { type: 'item', id: 'basic_pickaxe', min: 1, max: 1, weight: 9 }, { type: 'item', id: 'sturdy_pickaxe', min: 1, max: 1, weight: 1 } ] },
    'builders_crate': { name: "Builder's Crate", emoji: '🧱', price: 300, contents: [ { type: 'item', id: 'wood', min: 20, max: 50, weight: 50 }, { type: 'item', id: 'stone', min: 20, max: 50, weight: 45 }, { type: 'item', id: 'smelter', min: 1, max: 1, weight: 5 } ] },
    'gamblers_crate': { name: "Gambler's Crate", emoji: '💰', price: 400, contents: [ { type: 'bits', id: null, min: 1, max: 200, weight: 60 }, { type: 'bits', id: null, min: 201, max: 600, weight: 35 }, { type: 'bits', id: null, min: 601, max: 1500, weight: 5 } ] },
    'crystal_crate': { name: "Crystal Crate", emoji: '💎', price: 500, contents: [ { type: 'item', id: 'raw_crystal', min: 1, max: 3, weight: 80 }, { type: 'item', id: 'raw_crystal', min: 4, max: 8, weight: 18 }, { type: 'item', id: 'crystal_pickaxe', min: 1, max: 1, weight: 2 } ] },
    'dna_crate': { name: "DNA Crate", emoji: '🧬', price: 100, contents: [ { type: 'item', id: 'trait_reforger', min: 2, max: 15, weight: 100 } ] }
};

// =========================================================================
// --- CLAN DEFINITIONS & CONFIGURATION ---
// =========================================================================
const CLAN_MEMBER_LIMIT = 10;
const CLAN_JOIN_COOLDOWN_HOURS = 1;
const CLAN_WAR_DURATION_DAYS = 7;
const CLAN_LEVELS = [
    { level: 1, cost: 0, perks: "Clan Creation" },
    { level: 2, cost: 500, perks: "+5% Work Bonus" },
    { level: 3, cost: 1000, perks: "+2.5% Momentum Chance (Work/Gather Cooldown Reset)" },
    { level: 4, cost: 3500, perks: "Work Bonus increased to +10%" },
    { level: 5, cost: 7500, perks: "Slots Max Bet Doubled" },
    { level: 6, cost: 15000, perks: "+1 Abundance (Bonus item from Gather)" },
    { level: 7, cost: 27000, perks: "Momentum Chance increased to +5%" },
    { level: 8, cost: 40000, perks: "Work Bonus increased to +15%" },
    { level: 9, cost: 70000, perks: "Abundance increased to +2" },
    { level: 10, cost: 100000, perks: "Abundance increased to +5" }
];
const CLAN_WAR_REWARDS = {
    1: { items: [{ itemId: 'trait_reforger', quantity: 5 }, { itemId: 'crystal_crate', quantity: 3 }] },
    2: { items: [{ itemId: 'trait_reforger', quantity: 3 }, { itemId: 'crystal_crate', quantity: 1 }] },
    3: { items: [{ itemId: 'trait_reforger', quantity: 1 }] }
};


// =========================================================================
// --- HELPER & UTILITY FUNCTIONS ---
// =========================================================================
function rollNewTrait() { const totalWeight = Object.values(TRAITS).reduce((sum, trait) => sum + trait.weight, 0); let random = secureRandomFloat() * totalWeight; for (const traitId in TRAITS) { if (random < TRAITS[traitId].weight) { const level = Math.ceil(secureRandomFloat() * TRAITS[traitId].maxLevel); return { name: traitId, level: level }; } random -= TRAITS[traitId].weight; } }
function secureRandomFloat() {return crypto.randomBytes(4).readUInt32LE(0) / 0xffffffff;}
async function getAccount(identifier) { const idStr = String(identifier).toLowerCase(); return await economyCollection.findOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }); }
async function createNewAccount(identifier, type = 'drednot') {
    const idStr = String(identifier).toLowerCase();
    const newAccount = {
        _id: idStr,
        drednotName: type === 'drednot' ? String(identifier) : null,
        displayName: null,
        discordId: type === 'discord' ? String(identifier) : null,
        balance: STARTING_BALANCE,
        lastWork: null,
        lastGather: null,
        lastDaily: null,
        dailyStreak: 0,
        lastHourly: null,
        hourlyStreak: 0,
        lastSlots: null,
        inventory: {},
        smelting: null,
        activeBuffs: [],
        wasBumped: false,
        clanId: null,
        clanJoinCooldown: null,
        traits: { slots: [rollNewTrait(), rollNewTrait()] },
        zeal: { stacks: 0, lastAction: Date.now() },
        // --- GRID SYSTEM ---
        powerGrid: {
            slots: [null, null, null], // Stores the buildingId, e.g., 'solar_panel'
            lastTick: Date.now()
        }
        // --- END GRID SYSTEM ---
    };
    await economyCollection.insertOne(newAccount);
    console.log(`Created new ${type} account for ${identifier}`);
    return newAccount;
}
async function updateAccount(identifier, updates) { const idStr = String(identifier).toLowerCase(); await economyCollection.updateOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }, { $set: updates }); }
async function modifyInventory(identifier, itemId, amount) { if (!itemId) return; const updateField = `inventory.${itemId}`; const idStr = String(identifier).toLowerCase(); await economyCollection.updateOne({ $or: [{ _id: idStr }, { discordId: String(identifier) }] }, { $inc: { [updateField]: amount } }); }
function getItemIdByName(name) { 
    const lowerName = name.toLowerCase();
    // --- GRID SYSTEM ---
    // Prioritize exact match for buildings to avoid conflicts with other items
    const buildingId = Object.keys(BUILDINGS).find(k => BUILDINGS[k].name.toLowerCase() === lowerName);
    if (buildingId) return buildingId;
    // --- END GRID SYSTEM ---
    return Object.keys(ITEMS).find(k => ITEMS[k].name.toLowerCase() === lowerName);
}
function formatDuration(seconds) { if (seconds <= 0) return '0s'; if (seconds < 60) return `${Math.ceil(seconds)}s`; const minutes = Math.floor(seconds / 60); const remainingSeconds = Math.ceil(seconds % 60); if (remainingSeconds === 0) return `${minutes}m`; return `${minutes}m ${remainingSeconds}s`; }
async function findNextAvailableListingId(collection) { const listings = await collection.find({}, { projection: { listingId: 1 } }).toArray(); const usedIds = listings.map(l => l.listingId).filter(id => id != null).sort((a, b) => a - b); let expectedId = 1; for (const id of usedIds) { if (id !== expectedId) { return expectedId; } expectedId++; } return expectedId; }
function getPaginatedResponse(identifier, type, allLines, title, pageChange = 0) { const linesPerPage = 10; if (pageChange === 0 || !userPaginationData[identifier] || userPaginationData[identifier].type !== type) { userPaginationData[identifier] = { lines: allLines, currentPage: 0, type, title }; } const session = userPaginationData[identifier]; session.currentPage += pageChange; const totalPages = Math.ceil(session.lines.length / linesPerPage); if (session.currentPage >= totalPages && totalPages > 0) session.currentPage = totalPages - 1; if (session.currentPage < 0) session.currentPage = 0; const startIndex = session.currentPage * linesPerPage; const linesForPage = session.lines.slice(startIndex, startIndex + linesPerPage); const footer = `Page ${session.currentPage + 1}/${totalPages}. Use !n or !p to navigate.`; const discordContent = `**--- ${title} (Page ${session.currentPage + 1}/${totalPages}) ---**\n${linesForPage.length > 0 ? linesForPage.join('\n') : "No items on this page."}`; const row = new ActionRowBuilder().addComponents( new ButtonBuilder().setCustomId(`paginate_back_${identifier}`).setLabel('⬅️ Previous').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage === 0), new ButtonBuilder().setCustomId(`paginate_next_${identifier}`).setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(session.currentPage >= totalPages - 1) ); const gameContent = [`--- ${toBoldFont(title)} ---`, ...linesForPage, footer]; return { discord: { content: discordContent, components: [row] }, game: gameContent }; }
async function selfHealAccount(account) {
    let updates = {};
    let needsUpdate = false;
    if (!account.traits) { updates['traits'] = { slots: [rollNewTrait(), rollNewTrait()] }; needsUpdate = true; console.log(`[Self-Heal] Adding traits to old account: ${account._id}`); }
    if (!account.drednotName && !account.discordId) { updates['drednotName'] = account._id; needsUpdate = true; console.log(`[Self-Heal] Fixing drednotName for old account: ${account._id}`); }
    if (account.dailyStreak === undefined) { updates['dailyStreak'] = 0; needsUpdate = true; console.log(`[Self-Heal] Adding dailyStreak to account: ${account._id}`); }
    if (account.lastHourly === undefined) { updates['lastHourly'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding lastHourly to account: ${account._id}`); }
    if (account.hourlyStreak === undefined) { updates['hourlyStreak'] = 0; needsUpdate = true; console.log(`[Self-Heal] Adding hourlyStreak to account: ${account._id}`); }
    if (account.clanId === undefined) { updates['clanId'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding clanId to account: ${account._id}`); }
    if (account.clanJoinCooldown === undefined) { updates['clanJoinCooldown'] = null; needsUpdate = true; console.log(`[Self-Heal] Adding clanJoinCooldown to account: ${account._id}`); }
    if (account.zeal === undefined) { updates['zeal'] = { stacks: 0, lastAction: Date.now() }; needsUpdate = true; console.log(`[Self-Heal] Adding zeal to account: ${account._id}`); }
    // --- GRID SYSTEM ---
    if (account.powerGrid === undefined) {
        updates['powerGrid'] = { slots: [null, null, null], lastTick: Date.now() };
        needsUpdate = true;
        console.log(`[Self-Heal] Adding powerGrid to account: ${account._id}`);
    }
    // --- END GRID SYSTEM ---
    if (needsUpdate) { await updateAccount(account._id, updates); return getAccount(account._id); } return account;
}
const shuffleArray = (array) => { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }
function openLootbox(lootboxId) { const crate = LOOTBOXES[lootboxId]; if (!crate) return null; const totalWeight = crate.contents.reduce((sum, item) => sum + item.weight, 0); let random = secureRandomFloat() * totalWeight; for (const reward of crate.contents) { if (random < reward.weight) { const amount = Math.floor(secureRandomFloat() * (reward.max - reward.min + 1)) + reward.min; return { type: reward.type, id: reward.id, amount: amount }; } random -= reward.weight; } const lastReward = crate.contents[crate.contents.length - 1]; const amount = Math.floor(secureRandomFloat() * (lastReward.max - lastReward.min + 1)) + lastReward.min; return { type: lastReward.type, id: lastReward.id, amount: amount };}
function getActiveTraits(account, traitName) { return (account.traits?.slots || []).filter(t => t.name === traitName); }
function generateClanCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
const BOLD_MAP = { 'a': '𝐚', 'b': '𝐛', 'c': '𝐜', 'd': '𝐝', 'e': '𝐞', 'f': '𝐟', 'g': '𝐠', 'h': '𝐡', 'i': '𝐢', 'j': '𝐣', 'k': '𝐤', 'l': '𝐥', 'm': '𝐦', 'n': '𝐧', 'o': '𝐨', 'p': '𝐩', 'q': '𝐪', 'r': '𝐫', 's': '𝐬', 't': '𝐭', 'u': '𝐮', 'v': '𝐯', 'w': '𝐰', 'x': '𝐱', 'y': '𝐲', 'z': '𝐳', 'A': '𝐀', 'B': '𝐁', 'C': '𝐂', 'D': '𝐃', 'E': '𝐄', 'F': '𝐅', 'G': '𝐆', 'H': '𝐇', 'I': '𝐈', 'J': '𝐉', 'K': '𝐊', 'L': '𝐋', 'M': '𝐌', 'N': '𝐍', 'O': '𝐎', 'P': '𝐏', 'Q': '𝐐', 'R': '𝐑', 'S': '𝐒', 'T': '𝐓', 'U': '𝐔', 'V': '𝐕', 'W': '𝐖', 'X': '𝐗', 'Y': '𝐘', 'Z': '𝐙', '0': '𝟎', '1': '𝟏', '2': '𝟐', '3': '𝟑', '4': '𝟒', '5': '𝟓', '6': '𝟔', '7': '𝟕', '8': '𝟖', '9': '𝟗', ' ': ' ', ':':':' };
function toBoldFont(text) { return String(text).split('').map(char => BOLD_MAP[char.toLowerCase()] || char).join(''); }


// =========================================================================
// --- CLAN HANDLER FUNCTIONS ---
// =========================================================================
async function getClan(identifier) { return await clansCollection.findOne({ code: identifier }); }
async function getClanById(clanId) { return await clansCollection.findOne({ _id: clanId }); }
async function handleClanCreate(account, clanName) { if (account.clanId) { return { success: false, message: "You are already in a clan." }; } if (!clanName || clanName.length < 3 || clanName.length > 24) { return { success: false, message: "Clan name must be between 3 and 24 characters." }; } const existingClan = await clansCollection.findOne({ name: new RegExp(`^${clanName}$`, 'i') }); if (existingClan) { return { success: false, message: "A clan with that name already exists." }; } let uniqueCode; let isCodeUnique = false; while (!isCodeUnique) { uniqueCode = generateClanCode(); const existingCode = await clansCollection.findOne({ code: uniqueCode }); if (!existingCode) { isCodeUnique = true; } } const newClan = { name: clanName, code: uniqueCode, ownerId: account._id, members: [account._id], level: 1, vaultBalance: 0, warPoints: 0, recruitment: 1, applicants: [], pendingInvites: [], createdAt: new Date(), }; const result = await clansCollection.insertOne(newClan); await updateAccount(account._id, { clanId: result.insertedId }); return { success: true, message: `You have successfully founded the clan **${clanName}**! Your unique clan code is \`{${uniqueCode}}\` . The clan is currently **Open** for anyone to join.` }; }
async function handleClanLeave(account) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } const clan = await getClanById(account.clanId); if (!clan) { await updateAccount(account._id, { clanId: null }); return { success: false, message: "The clan you were in seems to have been disbanded. You are no longer part of it." }; } if (clan.ownerId === account._id) { return { success: false, message: "You cannot leave the clan because you are the owner. You must use `/clan disband` instead." }; } await clansCollection.updateOne({ _id: clan._id }, { $pull: { members: account._id } }); const cooldownTime = new Date(Date.now() + CLAN_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000); await updateAccount(account._id, { clanId: null, clanJoinCooldown: cooldownTime }); return { success: true, message: `You have left **${clan.name}**. You cannot join another clan for **${CLAN_JOIN_COOLDOWN_HOURS} hour**.` }; }
async function handleClanKick(account, targetAccount) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a valid clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can kick members." }; } if (!targetAccount || targetAccount.clanId?.toString() !== clan._id.toString()) { return { success: false, message: `That player is not in your clan.` }; } if (targetAccount._id === account._id) { return { success: false, message: "You cannot kick yourself." }; } await clansCollection.updateOne({ _id: clan._id }, { $pull: { members: targetAccount._id } }); const cooldownTime = new Date(Date.now() + CLAN_JOIN_COOLDOWN_HOURS * 60 * 60 * 1000); await updateAccount(targetAccount._id, { clanId: null, clanJoinCooldown: cooldownTime }); return { success: true, message: `You have kicked **${targetAccount.drednotName || targetAccount.displayName}** from the clan. They cannot join another clan for **${CLAN_JOIN_COOLDOWN_HOURS} hour**.` }; }
async function handleClanDisband(account) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a valid clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can disband the clan." }; } await economyCollection.updateMany({ clanId: clan._id }, { $set: { clanId: null } }); await clansCollection.deleteOne({ _id: clan._id }); return { success: true, message: `You have disbanded **${clan.name}**. All members have been removed.` }; }
async function handleClanInfo(clanCode) { const clan = await getClan(clanCode); if (!clan) { return { success: false, message: "No clan found with that code." }; } const ownerAccount = await getAccount(clan.ownerId); const ownerName = ownerAccount?.drednotName || ownerAccount?.displayName || 'Unknown Leader'; const nextLevelInfo = CLAN_LEVELS.find(l => l.level === clan.level + 1); const progressText = nextLevelInfo ? `Vault: ${clan.vaultBalance.toLocaleString()} / ${nextLevelInfo.cost.toLocaleString()} to Level ${nextLevelInfo.level}` : 'Max Level Reached'; const status = clan.recruitment === 1 ? 'Open' : 'Closed'; const memberIdRegexes = clan.members.map(id => new RegExp(`^${id}$`, 'i')); const memberAccounts = await economyCollection.find({ _id: { $in: memberIdRegexes } }).toArray(); const memberMap = new Map(memberAccounts.map(acc => [acc._id.toLowerCase(), acc])); let memberList = "Error fetching member list."; try { memberList = clan.members.map(id => { const memberAccount = memberMap.get(id.toLowerCase()); const name = memberAccount ? (memberAccount.drednotName || memberAccount.displayName || 'Unnamed Member') : 'Missing Member Data'; return memberAccount?._id === clan.ownerId ? `👑 ${name}` : `- ${name}`; }).join('\n'); } catch (error) { console.error("Error generating member list for clan", clan._id, ":", error); } const embed = new EmbedBuilder() .setTitle(`${clan.name} [Lv ${clan.level}]`) .setColor('#3498DB') .setDescription(`**Code:** \`{${clan.code}}\`\n**Leader:** ${ownerName}`) .addFields( { name: 'Recruitment', value: status, inline: true }, { name: 'Members', value: `${clan.members.length}/${CLAN_MEMBER_LIMIT}`, inline: true }, { name: 'Progress', value: progressText, inline: false }, { name: 'Roster', value: memberList.length > 0 ? memberList : "No members found.", inline: false } ); return { success: true, embed: embed }; }
async function handleClanList() { const availableClans = await clansCollection.find({ [`members.${CLAN_MEMBER_LIMIT - 1}`]: { $exists: false } }).toArray(); if (availableClans.length === 0) { return { success: false, lines: ["There are currently no clans with open slots."] }; } const shuffled = availableClans.sort(() => 0.5 - Math.random()); const formattedLines = shuffled.map(clan => `**${clan.name}** [Lv ${clan.level}] \`{${clan.code}}\` `); return { success: true, lines: formattedLines }; }
async function handleClanRecruit(account, status) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a valid clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can change the recruitment status." }; } const newStatus = parseInt(status, 10); if (newStatus !== 1 && newStatus !== 2) { return { success: false, message: "Invalid status. Use 1 for Open or 2 for Closed." }; } await clansCollection.updateOne({ _id: clan._id }, { $set: { recruitment: newStatus } }); const statusText = newStatus === 1 ? 'OPEN' : 'CLOSED'; return { success: true, message: `Your clan's recruitment status has been set to **${statusText}**.` }; }
async function handleClanDonate(account, amount) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } if (isNaN(amount) || amount <= 0) { return { success: false, message: "Please provide a valid, positive amount to donate." }; } if (account.balance < amount) { return { success: false, message: "You do not have enough Bits to donate." }; } const updateResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: amount } }, { $inc: { balance: -amount } }); if (updateResult.modifiedCount === 0) { return { success: false, message: "Failed to donate. You may not have enough Bits." }; } await clansCollection.updateOne({ _id: account.clanId }, { $inc: { vaultBalance: amount } }); return { success: true, message: `You have successfully donated **${amount.toLocaleString()} ${CURRENCY_NAME}** to the clan vault!` }; }
async function handleClanUpgrade(account) { if (!account.clanId) { return { success: false, message: "You are not in a clan." }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a valid clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can upgrade the clan." }; } const nextLevel = clan.level + 1; const upgradeInfo = CLAN_LEVELS.find(l => l.level === nextLevel); if (!upgradeInfo) { return { success: false, message: "Your clan is already at the maximum level." }; } if (clan.vaultBalance < upgradeInfo.cost) { return { success: false, message: `Your clan vault does not have enough Bits. You need **${(upgradeInfo.cost - clan.vaultBalance).toLocaleString()}** more.` }; } await clansCollection.updateOne( { _id: clan._id }, { $inc: { level: 1, vaultBalance: -upgradeInfo.cost } } ); return { success: true, message: `**Congratulations!** Your clan has reached **Level ${nextLevel}**!\n> **New Perk:** ${upgradeInfo.perks}` }; }
async function handleClanJoin(account, clanCode) { if (account.clanId) { return { success: false, message: "You are already in a clan." }; } if (account.clanJoinCooldown && new Date() < account.clanJoinCooldown) { const remaining = formatDuration((account.clanJoinCooldown.getTime() - Date.now()) / 1000); return { success: false, message: `You cannot join a new clan yet. Please wait **${remaining}**.` }; } const clan = await getClan(clanCode); if (!clan) { return { success: false, message: "No clan found with that code." }; } if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "That clan is full." }; } if (clan.recruitment === 1) { await clansCollection.updateOne({ _id: clan._id }, { $push: { members: account._id } }); await updateAccount(account._id, { clanId: clan._id }); return { success: true, message: `You have joined **${clan.name}**!` }; } else { if(clan.applicants.includes(account._id)) { return { success: false, message: "You have already applied to this clan. Please wait for the owner to respond."} } await clansCollection.updateOne({ _id: clan._id }, { $push: { applicants: account._id } }); return { success: true, message: `You have applied to join **${clan.name}**. The owner has been notified.` }; } }
async function handleClanInvite(account, targetAccount) { if (!targetAccount) { if (account.clanId) { return { success: false, message: "You are already in a clan." }; } const invitedClans = await clansCollection.find({ pendingInvites: account._id }).toArray(); if (invitedClans.length === 0) { return { success: false, message: "You have no pending clan invitations." }; } const inviteList = invitedClans.map(c => `- **${c.name}** [Lv ${c.level}] \`{${c.code}}\` `); return { success: true, message: `You have pending invitations from:\n${inviteList.join('\n')}\nUse \`/clan accept <code>\` to join.` }; } if (!account.clanId) { return { success: false, message: "You must be in a clan to invite players." }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a valid clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can manage invitations." }; } if(targetAccount === 'view') { if (clan.applicants.length === 0) { return { success: false, message: "Your clan has no pending applications." }; } const applicantAccounts = await economyCollection.find({ _id: { $in: clan.applicants } }).toArray(); const applicantNames = applicantAccounts.map(a => a.drednotName || a.displayName || 'Unknown User'); return { success: true, message: `**Applicants:** ${applicantNames.join(', ')}\nUse \`/clan accept <username>\` to approve.` }; } if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "Your clan is full." }; } if (targetAccount.clanId) { return { success: false, message: `**${targetAccount.drednotName || targetAccount.displayName}** is already in a clan.` }; } if(clan.pendingInvites.includes(targetAccount._id)) { return { success: false, message: "You have already invited that player." } } await clansCollection.updateOne({ _id: clan._id }, { $push: { pendingInvites: targetAccount._id } }); return { success: true, message: `An invitation has been sent to **${targetAccount.drednotName || targetAccount.displayName}**. They can see it by using \`/clan invite\` .` }; }
async function handleClanAccept(account, identifier) { if (identifier.length === 5) { if (account.clanId) { return { success: false, message: "You are already in a clan." }; } const clan = await getClan(identifier); if (!clan) { return { success: false, message: "Invalid clan code." }; } if (!clan.pendingInvites.includes(account._id)) { return { success: false, message: "You have not been invited to this clan." }; } if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "That clan is now full." }; } await clansCollection.updateMany({}, { $pull: { pendingInvites: account._id, applicants: account._id } }); await clansCollection.updateOne({ _id: clan._id }, { $push: { members: account._id } }); await updateAccount(account._id, { clanId: clan._id }); return { success: true, message: `You have accepted the invitation and joined **${clan.name}**!` }; } const clan = await getClanById(account.clanId); if (!clan) { return { success: false, message: "You are not in a clan." }; } if (clan.ownerId !== account._id) { return { success: false, message: "Only the clan owner can accept applications." }; } const targetAccount = await getAccount(identifier); if (!targetAccount) { return { success: false, message: `Could not find a player named "${identifier}".` }; } if (!clan.applicants.includes(targetAccount._id)) { return { success: false, message: `That player has not applied to your clan.` }; } if (clan.members.length >= CLAN_MEMBER_LIMIT) { return { success: false, message: "Your clan is full." }; } await clansCollection.updateMany({}, { $pull: { pendingInvites: targetAccount._id, applicants: targetAccount._id } }); await clansCollection.updateOne({ _id: clan._id }, { $push: { members: targetAccount._id } }); await updateAccount(targetAccount._id, { clanId: clan._id }); return { success: true, message: `You have accepted **${targetAccount.drednotName || targetAccount.displayName}** into the clan!` }; }
async function handleClanDecline(account, clanCode) { if (account.clanId) { return { success: false, message: "This command is for players who are not in a clan." }; } const clan = await getClan(clanCode); if (!clan) { return { success: false, message: "Invalid clan code." }; } const updateResult = await clansCollection.updateOne( { _id: clan._id }, { $pull: { pendingInvites: account._id, applicants: account._id } } ); if (updateResult.modifiedCount > 0) { return { success: true, message: `You have declined the invitation/application for **${clan.name}**.` }; } else { return { success: false, message: `You do not have a pending invitation or application for **${clan.name}**.` }; } }
async function handleClanWar() { const warState = await serverStateCollection.findOne({ stateKey: "clan_war" }); if (!warState || new Date() > new Date(warState.warEndTime)) { return { success: false, message: "There is no clan war currently active." }; } const topClans = await clansCollection.find({ warPoints: { $gt: 0 } }).sort({ warPoints: -1 }).limit(10).toArray(); if (topClans.length === 0) { return { success: true, message: "The clan war is active, but no clan has scored any points yet!" }; } const timeLeft = formatDuration((new Date(warState.warEndTime).getTime() - Date.now()) / 1000); const header = `**Clan War: The Endless Conflict**\n\`----Time left: ${timeLeft}------\``; const medals = ['🏆', '🥈', '🥉']; const lines = topClans.map((clan, index) => { const medal = index < 3 ? `${medals[index]} ` : ''; return `\`#${index + 1}.\` ${medal}\`[${clan.code}] ${clan.name}\` - **${clan.warPoints.toLocaleString()}** Points`; }); return { success: true, message: `${header}\n${lines.join('\n')}` }; }

// =========================================================================
// --- CORE COMMAND HANDLERS ---
// =========================================================================
function handleItemInfo(itemId) { const itemDef = ITEMS[itemId]; if (!itemDef) return `Could not find an item with that ID.`; const header = `${itemDef.emoji || '📦'} **${itemDef.name}**\n--------------------`; let infoLines = []; if (itemDef.description) { infoLines.push(`> ${itemDef.description}`); } if (itemDef.type) { const typeFormatted = itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1); infoLines.push(`> **Type:** ${typeFormatted}`); } if (itemDef.effects) { for (const effect in itemDef.effects) { const value = itemDef.effects[effect]; let effectText = '> **Effect:** '; if (effect === 'work_bonus_flat') { effectText += `Increases Bits from /work by a flat bonus of +${value}.`; } else if (effect === 'work_bonus_percent') { effectText += `Increases Bits from /work by a bonus of ${value * 100}%.`; } infoLines.push(effectText); } } if (itemDef.craftable) { const recipeParts = Object.entries(itemDef.recipe).map(([resId, qty]) => { const resource = ITEMS[resId]; return `${resource.emoji} ${qty}x ${resource.name}`; }); infoLines.push(`> **Craftable:** Yes`); infoLines.push(`> **Recipe:** ${recipeParts.join(', ')}`); } if (infoLines.length === 0 && !itemDef.description) { infoLines.push('> **Use:** A basic resource used in crafting recipes.'); } return [header, ...infoLines].join('\n'); }
async function handleRecipes() { let recipeList = ['📜 **Available Recipes:**']; for (const itemId in ITEMS) { if (ITEMS[itemId].craftable) { const recipeParts = Object.entries(ITEMS[itemId].recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`); recipeList.push(`> ${ITEMS[itemId].emoji} **${ITEMS[itemId].name}**: Requires ${recipeParts.join(', ')}`); } } return recipeList.length > 1 ? recipeList.join('\n') : 'There are no craftable items yet.'; }
async function handleCraft(account, itemName, quantity) { if (isNaN(quantity) || quantity <= 0) { return { success: false, message: "Invalid quantity. Please provide a positive number." }; } const itemToCraftId = getItemIdByName(itemName); if (!itemToCraftId || !ITEMS[itemToCraftId].craftable) { return { success: false, message: `"${itemName}" is not a valid, craftable item. Check \`/recipes\` or \`!recipes\`.` }; } const recipe = ITEMS[itemToCraftId].recipe; let updates = {}; let missingResources = []; for (const resId in recipe) { const requiredQty = recipe[resId] * quantity; const playerQty = account.inventory[resId] || 0; if (playerQty < requiredQty) { missingResources.push(`${requiredQty - playerQty} more ${ITEMS[resId].name}`); } updates[`inventory.${resId}`] = -requiredQty; } if (missingResources.length > 0) { return { success: false, message: `You don't have enough resources! You need: ${missingResources.join(', ')}.` }; } updates[`inventory.${itemToCraftId}`] = quantity; await economyCollection.updateOne({ _id: account._id }, { $inc: updates }); return { success: true, message: `You successfully crafted **${quantity}x** ${ITEMS[itemToCraftId].name}!` }; }
async function handleSmelt(account, itemName, quantity) { const smelterCount = account.inventory['smelter'] || 0; if (smelterCount < 1) { return { success: false, message: "You need to craft a 🔥 Smelter first!" }; } if (account.smelting && account.smelting.finishTime > Date.now()) { return { success: false, message: `You are already processing something! Wait for it to finish.` }; } const itemIdToProcess = getItemIdByName(itemName); if (!itemIdToProcess) { return { success: false, message: `Invalid item: ${itemName}` }; } let resultItemId; let processType; if (SMELTABLE_ORES[itemIdToProcess]) { resultItemId = SMELTABLE_ORES[itemIdToProcess]; processType = 'smelting'; } else if (COOKABLE_FOODS[itemIdToProcess]) { resultItemId = COOKABLE_FOODS[itemIdToProcess]; processType = 'cooking'; } else { return { success: false, message: `You can't smelt or cook that. Valid inputs: Iron Ore, Copper Ore, Raw Meat.` }; } if (isNaN(quantity) || quantity <= 0) { return { success: false, message: "Invalid quantity." }; } if ((account.inventory[itemIdToProcess] || 0) < quantity) { return { success: false, message: `You don't have enough ${ITEMS[itemIdToProcess].name}.` }; } const coalNeeded = quantity * SMELT_COAL_COST_PER_ORE; if ((account.inventory['coal'] || 0) < coalNeeded) { return { success: false, message: `You don't have enough coal. You need ${coalNeeded} ⚫ Coal.` }; } const updateResult = await economyCollection.findOneAndUpdate( { _id: account._id, [`inventory.${itemIdToProcess}`]: { $gte: quantity }, [`inventory.coal`]: { $gte: coalNeeded } }, { $inc: { [`inventory.${itemIdToProcess}`]: -quantity, [`inventory.coal`]: -coalNeeded } } ); if (!updateResult) { return { success: false, message: "Failed to start smelting, you might not have enough resources. Please check your inventory." }; } let timePerItem = (SMELT_COOLDOWN_SECONDS_PER_ORE / smelterCount) * 1000; if (currentGlobalEvent && currentGlobalEvent.effect.type === 'super_smelter') { timePerItem /= 2; } const totalTime = timePerItem * quantity; const finishTime = Date.now() + totalTime; await updateAccount(account._id, { smelting: { resultItemId: resultItemId, quantity, finishTime } }); let eventText = currentGlobalEvent && currentGlobalEvent.effect.type === 'super_smelter' ? ` (Thanks to ${currentGlobalEvent.name}!)` : ''; return { success: true, message: `You begin ${processType} **${quantity}x** ${ITEMS[itemIdToProcess].name}. It will take **${formatDuration(totalTime / 1000)}**${eventText}.` }; }
async function handleTimers(account) { const now = Date.now(); const timers = []; let workCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000; let gatherCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000; let hourlyCooldown = HOURLY_COOLDOWN_MINUTES * 60 * 1000; if (account.traits) { getActiveTraits(account, 'prodigy').forEach(t => { const reduction = 5 * t.level; workCooldown *= (1 - reduction / 100); gatherCooldown *= (1 - reduction / 100); }); } const activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now); for (const buff of activeBuffs) { const itemDef = ITEMS[buff.itemId]; if (itemDef?.buff?.effects) { if(itemDef.buff.effects.work_cooldown_reduction_ms) workCooldown -= itemDef.buff.effects.work_cooldown_reduction_ms; if(itemDef.buff.effects.gather_cooldown_reduction_ms) gatherCooldown -= itemDef.buff.effects.gather_cooldown_reduction_ms; } } workCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, workCooldown); gatherCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, gatherCooldown); timers.push(`> 💪 **Work**: ${(account.lastWork && (now - account.lastWork) < workCooldown) ? formatDuration(((account.lastWork + workCooldown) - now) / 1000) : 'Ready!'}`); timers.push(`> ⛏️ **Gather**: ${(account.lastGather && (now - account.lastGather) < gatherCooldown) ? formatDuration(((account.lastGather + gatherCooldown) - now) / 1000) : 'Ready!'}`); const hourlyTimeLeft = (account.lastHourly || 0) + hourlyCooldown - now; timers.push(`>  hourly: ${hourlyTimeLeft > 0 ? formatDuration(hourlyTimeLeft / 1000) : 'Ready!'}`); const dailyCooldown = 22 * 60 * 60 * 1000; const dailyTimeLeft = (account.lastDaily || 0) + dailyCooldown - now; timers.push(`> 📅 **Daily**: ${dailyTimeLeft > 0 ? formatDuration(dailyTimeLeft / 1000) : 'Ready!'}`); const slotsTimeLeft = (account.lastSlots || 0) + SLOTS_COOLDOWN_SECONDS * 1000 - now; if (slotsTimeLeft > 0) timers.push(`> 🎰 **Slots**: ${formatDuration(slotsTimeLeft / 1000)}`); if (account.smelting && account.smelting.finishTime > now) { timers.push(`> 🔥 **Smelting**: ${formatDuration((account.smelting.finishTime - now) / 1000)}`); } if(account.clanJoinCooldown && now < new Date(account.clanJoinCooldown).getTime()) { timers.push(`> 🛡️ **Clan Join**: ${formatDuration((new Date(account.clanJoinCooldown).getTime() - now) / 1000)}`); } if (activeBuffs.length > 0) { timers.push(`\n**Active Buffs:**`); activeBuffs.forEach(buff => { const itemDef = ITEMS[buff.itemId]; const timeLeft = formatDuration((buff.expiresAt - now) / 1000); timers.push(`> ${itemDef?.emoji || '❔'} ${itemDef?.name || 'Unknown Buff'}: **${timeLeft}** remaining`); }); } return timers; }

async function handleWork(account) {
    let now = Date.now();
    let baseCooldown = WORK_COOLDOWN_MINUTES * 60 * 1000;
    let workBonusPercent = 0; let scavengerChance = 0; let cooldownReductionPercent = 0; let momentumChance = 0;
    let zealBonusAmount = 0;
    let isDoubleOrNothingActive = false; // Flag for the spicy pepper effect

    let clan = null;
    if (account.clanId) {
        clan = await getClanById(account.clanId);
        if (clan) {
            if (clan.level >= 8) workBonusPercent += 15; else if (clan.level >= 4) workBonusPercent += 10; else if (clan.level >= 2) workBonusPercent += 5;
            if (clan.level >= 7) momentumChance = 5; else if (clan.level >= 3) momentumChance = 2.5;
        }
    }

    if (account.traits) {
        getActiveTraits(account, 'wealth').forEach(t => workBonusPercent += 5 * t.level);
        getActiveTraits(account, 'scavenger').forEach(t => scavengerChance += 5 * t.level);
        getActiveTraits(account, 'prodigy').forEach(t => cooldownReductionPercent += 5 * t.level);
        
        getActiveTraits(account, 'zealot').forEach(t => {
            const currentStacks = account.zeal?.stacks || 0;
            const zealBonusPercent = currentStacks * (2.5 * t.level);
            workBonusPercent += zealBonusPercent;
            zealBonusAmount = zealBonusPercent; 
        });
    }

    let currentCooldown = baseCooldown * (1 - cooldownReductionPercent / 100);
    let activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now);
    
    let toolBonusFlat = 0;
    let toolBonusPercent = 0;
    for (const itemId in account.inventory) {
        if (account.inventory[itemId] > 0) {
            const itemDef = ITEMS[itemId];
            if (itemDef?.type === 'tool' && itemDef.effects) {
                const qty = account.inventory[itemId];
                if (itemDef.effects.work_bonus_flat) toolBonusFlat += itemDef.effects.work_bonus_flat * qty;
                if (itemDef.effects.work_bonus_percent) toolBonusPercent += itemDef.effects.work_bonus_percent * qty;
            }
        }
    }

    for (const buff of activeBuffs) {
        if (buff.effects?.work_double_or_nothing) {
            isDoubleOrNothingActive = true;
        }
        if (buff.itemId === 'the_addict_rush') workBonusPercent += buff.effects.work_bonus_percent;
        if (ITEMS[buff.itemId]?.buff?.effects) {
            if (ITEMS[buff.itemId].buff.effects.work_bonus_percent) workBonusPercent += ITEMS[buff.itemId].buff.effects.work_bonus_percent;
            if (ITEMS[buff.itemId].buff.effects.work_cooldown_reduction_ms) currentCooldown -= ITEMS[buff.itemId].buff.effects.work_cooldown_reduction_ms;
        }
    }
    
    currentCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, currentCooldown);
    
    const cooldownReset = Math.random() * 100 < momentumChance;
    if (!cooldownReset && account.lastWork && (now - account.lastWork) < currentCooldown) { return { success: false, message: `You are on cooldown. Wait **${formatDuration((currentCooldown - (now - account.lastWork)) / 1000)}**.` }; }
    
    let baseEarnings = Math.floor(secureRandomFloat() * (WORK_REWARD_MAX - WORK_REWARD_MIN + 1)) + WORK_REWARD_MIN;
    
    const totalPercentBonus = workBonusPercent + (toolBonusPercent * 100);
    const bonusFromPercent = Math.floor(baseEarnings * (totalPercentBonus / 100));
    let totalEarnings = baseEarnings + bonusFromPercent + toolBonusFlat;
    
    let bonusText = (bonusFromPercent + toolBonusFlat) > 0 ? ` (+${(bonusFromPercent + toolBonusFlat)} bonus)` : '';
    if (zealBonusAmount > 0) {
        bonusText += ` 🔥${zealBonusAmount.toFixed(1)}%`;
    }

    let doubleOrNothingMessage = '';
    if (isDoubleOrNothingActive) {
        if (secureRandomFloat() < 0.5) { // Win
            totalEarnings *= 2;
            doubleOrNothingMessage = `\n> 🌶️ **DOUBLE!** Your Spicy Pepper paid off!`;
        } else { // Loss
            totalEarnings = 0;
            doubleOrNothingMessage = `\n> 🌶️ **NOTHING!** Your Spicy Pepper was a dud!`;
        }
    }

    let eventMessage = '';
    if (currentGlobalEvent && currentGlobalEvent.effect.type === 'work') {
        totalEarnings *= currentGlobalEvent.effect.multiplier;
        eventMessage = ` **(x${currentGlobalEvent.effect.multiplier} ${currentGlobalEvent.name}!)**`;
    }

    // --- GRID SYSTEM ---
    let towerMessage = '';
    let powerGeneration = 0;
    let powerConsumption = 0;
    (account.powerGrid?.slots || []).forEach(buildingId => {
        if (buildingId && BUILDINGS[buildingId]) {
            const building = BUILDINGS[buildingId];
            powerGeneration += building.effects.power_generation || 0;
            powerConsumption += building.effects.power_consumption || 0;
        }
    });

    if (powerGeneration >= powerConsumption && (account.powerGrid?.slots || []).includes('tower')) {
        if (secureRandomFloat() < 0.10) { // 10% chance
            const bonusFromTower = totalEarnings;
            totalEarnings *= 2;
            towerMessage = `\n> 🗼 **SURGE!** Your Tower duplicated your earnings, granting an extra **${Math.round(bonusFromTower)}** ${CURRENCY_NAME}!`;
        }
    }
    // --- END GRID SYSTEM ---
    
    if (!isFinite(totalEarnings) || isNaN(totalEarnings)) { return { success: false, message: "An error occurred calculating earnings." }; }
    
    let finalMessage = `You earned **${Math.round(totalEarnings)}** ${CURRENCY_NAME}${bonusText}!${eventMessage}`;
    finalMessage += doubleOrNothingMessage;
    finalMessage += towerMessage;

    let updates = { $inc: { balance: totalEarnings }, $pull: { activeBuffs: { itemId: 'the_addict_rush' } } };

    if (!cooldownReset) {
        updates.$set = { lastWork: now };
    } else {
        finalMessage += `\n> ✨ Your clan's **Momentum** perk reset your cooldown!`;
    }
    
    let scavengerLoot = '';
    if (scavengerChance > 0 && secureRandomFloat() * 100 < scavengerChance) {
        const loot = ['wood', 'stone'][Math.floor(Math.random() * 2)];
        const qty = Math.floor(Math.random() * 3) + 1;
        scavengerLoot = `\n> Your Scavenger trait found you **${qty}x** ${ITEMS[loot].name}!`;
        if(!updates.$inc) updates.$inc = {};
        updates.$inc[`inventory.${loot}`] = qty;
    }

    const zealotTraitsWork = getActiveTraits(account, 'zealot');
    if (zealotTraitsWork.length > 0) {
        const newTotalStacks = (account.zeal?.stacks || 0) + 1;
        if (!updates.$set) updates.$set = {};
        if (!updates.$inc) updates.$inc = {};
        updates.$inc['zeal.stacks'] = 1; 
        updates.$set['zeal.lastAction'] = now;
        finalMessage += `\n> 🔥 Your Zealot trait is now at **${newTotalStacks}** stack(s)!`;
    }

    await economyCollection.updateOne({_id: account._id}, updates);

    if (clan) {
        const warState = await serverStateCollection.findOne({ stateKey: "clan_war" });
        if (warState && new Date() < new Date(warState.warEndTime)) {
            await clansCollection.updateOne({ _id: clan._id }, { $inc: { warPoints: 1 } });
        }
    }

    return { success: true, message: finalMessage + scavengerLoot };
}

async function handleGather(account) {
    let now = Date.now();
    let baseCooldown = GATHER_COOLDOWN_MINUTES * 60 * 1000; 
    let cooldownReductionPercent = 0; let surveyorChance = 0; let momentumChance = 0;
    
    let totalAbundanceBonus = 0;
    let clanAbundanceBonus = 0;
    let zealAbundanceBonus = 0;

    let clan = null;
    if (account.clanId) {
        clan = await getClanById(account.clanId);
        if (clan) {
            if (clan.level >= 10) clanAbundanceBonus = 5; else if (clan.level >= 9) clanAbundanceBonus = 2; else if (clan.level >= 6) clanAbundanceBonus = 1;
            if (clan.level >= 7) momentumChance = 5; else if (clan.level >= 3) momentumChance = 2.5;
        }
    }
    
    if (account.traits) { 
        getActiveTraits(account, 'prodigy').forEach(t => cooldownReductionPercent += 5 * t.level); 
        getActiveTraits(account, 'surveyor').forEach(t => surveyorChance += 2 * t.level); 
        
        getActiveTraits(account, 'zealot').forEach(t => {
            const currentStacks = account.zeal?.stacks || 0;
            zealAbundanceBonus += Math.floor((currentStacks * (2.5 * t.level)) / 10);
        });
    }

    totalAbundanceBonus = clanAbundanceBonus + zealAbundanceBonus;

    let currentCooldown = baseCooldown * (1 - cooldownReductionPercent / 100);
    let activeBuffs = (account.activeBuffs || []).filter(buff => buff.expiresAt > now);
    if (activeBuffs.length < (account.activeBuffs || []).length) { await updateAccount(account._id, { activeBuffs }); }
    for (const buff of activeBuffs) { const itemDef = ITEMS[buff.itemId]; if (itemDef?.buff?.effects?.gather_cooldown_reduction_ms) currentCooldown -= itemDef.buff.effects.gather_cooldown_reduction_ms; }

    currentCooldown = Math.max(MINIMUM_ACTION_COOLDOWN_MS, currentCooldown);
    
    const cooldownReset = Math.random() * 100 < momentumChance;
    if (!cooldownReset && account.lastGather && (now - account.lastGather) < currentCooldown) { return { success: false, message: `You are tired. Wait **${formatDuration((currentCooldown - (now - account.lastGather)) / 1000)}**.` }; }

    const basketCount = account.inventory['gathering_basket'] || 0;
    const maxTypes = MAX_GATHER_TYPES_BASE + basketCount;
    let gatheredItems = [];
    let incUpdates = {}; 
    const shuffledItems = Object.keys(GATHER_TABLE).sort(() => 0.5 - secureRandomFloat());
    for (const itemId of shuffledItems) {
        if (gatheredItems.length >= maxTypes) break;
        let chance = GATHER_TABLE[itemId].baseChance;
        if (currentGlobalEvent?.effect.type === 'gather_chance') { chance *= currentGlobalEvent.effect.multiplier; }
        if (currentGlobalEvent?.effect.type === 'gather_rare_chance' && currentGlobalEvent.effect.item === itemId) { chance *= currentGlobalEvent.effect.multiplier; }
        
        if (secureRandomFloat() < chance) {
            let baseQty = Math.floor(secureRandomFloat() * (GATHER_TABLE[itemId].maxQty - GATHER_TABLE[itemId].minQty + 1)) + GATHER_TABLE[itemId].minQty;
            let basketBonus = 0;
            for (let i = 0; i < basketCount; i++) if (secureRandomFloat() < 0.5) basketBonus++;
            
            const finalQty = baseQty + basketBonus + totalAbundanceBonus;
            incUpdates[`inventory.${itemId}`] = (incUpdates[`inventory.${itemId}`] || 0) + finalQty;
            
            let bonusTextParts = [];
            if (basketBonus > 0) bonusTextParts.push(`+${basketBonus} basket`);
            if (clanAbundanceBonus > 0) bonusTextParts.push(`+${clanAbundanceBonus} clan`);
            if (zealAbundanceBonus > 0) bonusTextParts.push(`+${zealAbundanceBonus} zeal`);
            
            const bonusText = bonusTextParts.length > 0 ? ` (${bonusTextParts.join(' ')})` : '';
            gatheredItems.push({id: itemId, qty: finalQty, text: `> ${ITEMS[itemId].emoji} **${finalQty}x** ${ITEMS[itemId].name}${bonusText}`});
        }
    }
    
    let message = '';
    let setUpdates = {};
    
    if (!cooldownReset) {
        setUpdates.lastGather = now;
    }

    if (gatheredItems.length > 0) {
        let surveyorDoubled = false;
        if (surveyorChance > 0 && secureRandomFloat() * 100 < surveyorChance) {
            surveyorDoubled = true;
            for (const item of gatheredItems) {
                incUpdates[`inventory.${item.id}`] = (incUpdates[`inventory.${item.id}`] || 0) + item.qty;
            }
        }
        
        let towerMessage = '';
        // --- GRID SYSTEM ---
        let powerGeneration = 0;
        let powerConsumption = 0;
        (account.powerGrid?.slots || []).forEach(buildingId => {
            if (buildingId && BUILDINGS[buildingId]) {
                const building = BUILDINGS[buildingId];
                powerGeneration += building.effects.power_generation || 0;
                powerConsumption += building.effects.power_consumption || 0;
            }
        });

        if (powerGeneration >= powerConsumption && (account.powerGrid?.slots || []).includes('tower')) {
            if (secureRandomFloat() < 0.10) { // 10% chance
                for (const key in incUpdates) {
                    if(key.startsWith('inventory.')) incUpdates[key] *= 2;
                }
                towerMessage = `\n> 🗼 **SURGE!** Your Tower duplicated your entire haul!`;
            }
        }
        // --- END GRID SYSTEM ---

        message = `You gathered:\n${gatheredItems.map(i => i.text).join('\n')}`;
        if (surveyorDoubled) message += `\n\n**A stroke of luck! Your Surveyor trait doubled the entire haul!**`;
        message += towerMessage; // --- GRID SYSTEM ---
    } else {
        message = 'You searched but found nothing of value.';
    }

    const zealotTraitsGather = getActiveTraits(account, 'zealot');
    if (zealotTraitsGather.length > 0) {
        const newTotalStacks = (account.zeal?.stacks || 0) + 1;
        
        if (!incUpdates) incUpdates = {};
        if (!setUpdates) setUpdates = {};
        
        incUpdates['zeal.stacks'] = 1;
        setUpdates['zeal.lastAction'] = now;
        message += `\n> 🔥 Your Zealot trait is now at **${newTotalStacks}** stack(s)!`;
    }

    if (cooldownReset) message += `\n> ✨ Your clan's **Momentum** perk reset your cooldown!`;
    if (currentGlobalEvent && (currentGlobalEvent.effect.type === 'gather_chance' || currentGlobalEvent.effect.type === 'gather_rare_chance')) {
        message += `\n*(${currentGlobalEvent.name} is active!)*`;
    }

    let finalUpdatePayload = {};
    if (Object.keys(incUpdates).length > 0) {
        finalUpdatePayload.$inc = incUpdates;
    }
    if (Object.keys(setUpdates).length > 0) {
        finalUpdatePayload.$set = setUpdates;
    }
    if (Object.keys(finalUpdatePayload).length > 0) {
        await economyCollection.updateOne({ _id: account._id }, finalUpdatePayload);
    }

    if (clan) {
        const warState = await serverStateCollection.findOne({ stateKey: "clan_war" });
        if (warState && new Date() < new Date(warState.warEndTime)) {
            await clansCollection.updateOne({ _id: clan._id }, { $inc: { warPoints: 1 } });
        }
    }

    return { success: true, message: message.trim() };
}

async function handleHourly(account) {
    const now = Date.now();
    const hourlyCooldown = HOURLY_COOLDOWN_MINUTES * 60 * 1000;
    const streakBreakTime = 2 * hourlyCooldown;

    if (account.lastHourly && (now - account.lastHourly) < hourlyCooldown) {
        const remainingTime = formatDuration((hourlyCooldown - (now - account.lastHourly)) / 1000);
        return { success: false, message: `You can claim your hourly reward in **${remainingTime}**.` };
    }

    let currentStreak = account.hourlyStreak || 0;
    let streakMessage = '';

    if (account.lastHourly && (now - account.lastHourly) < streakBreakTime) {
        currentStreak++;
    } else {
        if (currentStreak > 1) {
             streakMessage = `Your previous hourly streak of ${currentStreak} has been broken.`;
        }
        currentStreak = 1;
    }

    const streakBonus = (currentStreak - 1) * HOURLY_STREAK_BONUS;
    const totalReward = HOURLY_REWARD_BASE + streakBonus;

    await economyCollection.updateOne(
        { _id: account._id },
        {
            $inc: { balance: totalReward },
            $set: { lastHourly: now, hourlyStreak: currentStreak }
        }
    );

    let finalMessage = `You claimed your hourly reward of **${HOURLY_REWARD_BASE} ${CURRENCY_NAME}**!`;
    if (streakBonus > 0) {
        finalMessage += `\n> ✨ Streak Bonus: +**${streakBonus}** ${CURRENCY_NAME} (Hour ${currentStreak})`;
    }
     if (streakMessage) {
        finalMessage += `\n> ${streakMessage}`;
    }

    return { success: true, message: finalMessage };
}

async function handleDaily(account) {
    const now = Date.now();
    const dailyCooldown = 22 * 60 * 60 * 1000;
    const streakBreakTime = 2 * 24 * 60 * 60 * 1000;

    if (account.lastDaily && (now - account.lastDaily) < dailyCooldown) {
        const remainingTime = formatDuration((dailyCooldown - (now - account.lastDaily)) / 1000);
        return { success: false, message: `You can claim your daily reward in **${remainingTime}**.` };
    }

    let currentStreak = account.dailyStreak || 0;
    let streakMessage = '';

    if (account.lastDaily && (now - account.lastDaily) < streakBreakTime) {
        currentStreak++;
    } else {
        if (currentStreak > 1) {
            streakMessage = `Your previous daily streak of ${currentStreak} has been broken.`;
        }
        currentStreak = 1;
    }

    const streakBonus = (currentStreak - 1) * DAILY_STREAK_BONUS;
    const totalReward = DAILY_REWARD_BASE + streakBonus;

    await economyCollection.updateOne(
        { _id: account._id },
        {
            $inc: { balance: totalReward },
            $set: { lastDaily: now, dailyStreak: currentStreak }
        }
    );

    let finalMessage = `You claimed your daily reward of **${DAILY_REWARD_BASE} ${CURRENCY_NAME}**!`;
    if (streakBonus > 0) {
        finalMessage += `\n> 🔥 Streak Bonus: +**${streakBonus}** ${CURRENCY_NAME} (Day ${currentStreak})`;
    }
     if (streakMessage) {
        finalMessage += `\n> ${streakMessage}`;
    }

    return { success: true, message: finalMessage };
}

async function handleFlip(account, amount, choice) { 
    if (isNaN(amount) || amount < FLIP_MIN_BET || amount > FLIP_MAX_BET) { return { success: false, message: `Bet must be between **${FLIP_MIN_BET}** and **${FLIP_MAX_BET}**.` }; } 
    const preLossBalance = account.balance;
    if (preLossBalance < amount) { return { success: false, message: "You don't have enough bits." }; }
    const result = secureRandomFloat() < 0.5 ? 'heads' : 'tails';
    const lowerChoice = choice.toLowerCase();
    let updates = {}; let newBalance;

    if (result.startsWith(lowerChoice)) {
        newBalance = preLossBalance + amount;
        updates = { $inc: { balance: amount } };
        await economyCollection.updateOne({ _id: account._id }, updates);
        return { success: true, message: `It was **${result}**! You win **${amount}** ${CURRENCY_NAME}!\nYour new balance is **${newBalance}**.` };
    } else {
        newBalance = preLossBalance - amount;
        updates = { $inc: { balance: -amount } };
        const addictTraits = getActiveTraits(account, 'the_addict');
        if (addictTraits.length > 0) {
            if (preLossBalance > 0) {
                const lossPercent = Math.min(1, amount / preLossBalance); 
                let totalBuff = 0;
                addictTraits.forEach(t => totalBuff += 50 * t.level);
                let workBonus = 0;
                if(isFinite(lossPercent) && totalBuff > 0) {
                    workBonus = lossPercent * totalBuff;
                }
                if(workBonus > 0 && isFinite(workBonus)) {
                    const buff = { itemId: 'the_addict_rush', expiresAt: Date.now() + 5 * 60 * 1000, effects: { work_bonus_percent: workBonus } };
                    updates.$push = { activeBuffs: buff };
                }
            }
        }
        await economyCollection.updateOne({ _id: account._id }, updates);
        return { success: false, message: `It was **${result}**. You lost **${amount}** ${CURRENCY_NAME}.\nYour new balance is **${newBalance}**.` };
    }
}
async function handleSlots(account, amount) { 
    let maxBet = SLOTS_MAX_BET;
    if (account.clanId) {
        const clan = await getClanById(account.clanId);
        if (clan && clan.level >= 5) {
            maxBet = SLOTS_MAX_BET * 2;
        }
    }

    const now = Date.now();
    const cooldown = SLOTS_COOLDOWN_SECONDS * 1000;
    if (account.lastSlots && (now - account.lastSlots) < cooldown) return { success: false, message: `Slow down! Wait **${formatDuration((cooldown - (now - account.lastSlots))/1000)}**.` };
    
    if (isNaN(amount) || amount < SLOTS_MIN_BET || amount > maxBet) {
        return { success: false, message: `Your bet must be between **${SLOTS_MIN_BET}** and **${maxBet}** ${CURRENCY_NAME}.` };
    }
    const preLossBalance = account.balance;
    if (preLossBalance < amount) { return { success: false, message: "You don't have enough bits." }; }
    await updateAccount(account._id, { lastSlots: now });
    const s1 = SLOT_REELS[0][Math.floor(secureRandomFloat()*SLOT_REELS[0].length)], s2 = SLOT_REELS[1][Math.floor(secureRandomFloat()*SLOT_REELS[1].length)], s3 = SLOT_REELS[2][Math.floor(secureRandomFloat()*SLOT_REELS[2].length)];
    const resultString = `[ ${s1} | ${s2} | ${s3} ]`;
    let winMultiplier = 0; let winMessage = '';
    if (s1 === s2 && s2 === s3) { winMultiplier = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? SLOTS_PAYOUTS.jackpot_multiplier : SLOTS_PAYOUTS.three_of_a_kind; winMessage = (s1 === SLOTS_PAYOUTS.jackpot_symbol) ? "JACKPOT! 💎" : "Three of a kind!"; } else if (s1 === s2 || s2 === s3 || s1 === s3) { winMultiplier = SLOTS_PAYOUTS.two_of_a_kind; winMessage = "Two of a kind!"; }
    
    let finalMessage, newBalance, updates = {}, successStatus = false;
    if (winMultiplier > 0) {
        successStatus = true;
        const winnings = Math.floor(amount * winMultiplier);
        newBalance = preLossBalance + winnings;
        finalMessage = `${resultString}\n**${winMessage}** You win **${winnings}** ${CURRENCY_NAME}!\nNew balance: **${newBalance}**.`;
        updates = { $inc: { balance: winnings } };
    } else {
        successStatus = false;
        newBalance = preLossBalance - amount;
        finalMessage = `${resultString}\nYou lost **${amount}** ${CURRENCY_NAME}.\nNew balance: **${newBalance}**.`;
        updates = { $inc: { balance: -amount } };
        const addictTraits = getActiveTraits(account, 'the_addict');
        if (addictTraits.length > 0) {
            if (preLossBalance > 0) {
                const lossPercent = Math.min(1, amount / preLossBalance);
                let totalBuff = 0;
                addictTraits.forEach(t => totalBuff += 50 * t.level);
                let workBonus = 0;
                if(isFinite(lossPercent) && totalBuff > 0) {
                    workBonus = lossPercent * totalBuff;
                }
                if(workBonus > 0 && isFinite(workBonus)) {
                    const buff = { itemId: 'the_addict_rush', expiresAt: Date.now() + 5 * 60 * 1000, effects: { work_bonus_percent: workBonus } };
                    updates.$push = { activeBuffs: buff };
                }
            }
        }
    }
    await economyCollection.updateOne({ _id: account._id }, updates);
    return { success: successStatus, message: finalMessage };
}
async function handlePay(senderAccount, recipientAccount, amount) { 
    const parsedAmount = Math.floor(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { return { success: false, message: "Please provide a valid, positive amount to pay." }; }
    if (senderAccount._id === recipientAccount._id) { return { success: false, message: "You can't pay yourself!" }; }
    
    const updateResult = await economyCollection.updateOne( { _id: senderAccount._id, balance: { $gte: parsedAmount } }, { $inc: { balance: -parsedAmount } } );
    if (updateResult.modifiedCount === 0) { return { success: false, message: `You don't have enough Bits. You only have **${senderAccount.balance}**.` }; }
    
    await economyCollection.updateOne( { _id: recipientAccount._id }, { $inc: { balance: parsedAmount } } );
    
    const recipientName = recipientAccount.drednotName || recipientAccount.displayName || `User ${recipientAccount._id}`;
    return { success: true, message: `You paid **${parsedAmount}** ${CURRENCY_NAME} to **${recipientName}**.` };
}
async function handleAccountMerge(discordId, drednotName) { 
    const drednotNameLower = drednotName.toLowerCase(); 
    const session = mongoClient.startSession(); 
    try { 
        await session.startTransaction(); 
        const discordAccount = await economyCollection.findOne({ _id: discordId }, { session }); 
        let drednotAccount = await economyCollection.findOne({ _id: drednotNameLower }, { session }); 
        if (!drednotAccount) { await session.abortTransaction(); await createNewAccount(drednotName, 'drednot'); drednotAccount = await getAccount(drednotName); await updateAccount(drednotAccount._id, { discordId: discordId }); return { success: true, message: `✅ Verification successful! Your accounts are now linked.` }; } 
        if (!discordAccount) { await session.abortTransaction(); await updateAccount(drednotName, { discordId: discordId }); await session.endSession(); return { success: true, message: `✅ Verification successful! Your accounts are now linked.` }; }
        if (!isFinite(discordAccount.balance) || !isFinite(drednotAccount.balance)) { throw new Error("Merge Conflict: One or both accounts have a corrupted balance. Cannot merge."); }
        if (discordAccount.smelting && drednotAccount.smelting) { throw new Error("Merge Conflict: Both accounts have active smelting jobs."); } 
        const mergedData = { balance: discordAccount.balance + drednotAccount.balance, inventory: { ...drednotAccount.inventory }, lastWork: Math.max(discordAccount.lastWork || 0, drednotAccount.lastWork || 0), lastGather: Math.max(discordAccount.lastGather || 0, drednotAccount.lastGather || 0), lastDaily: Math.max(discordAccount.lastDaily || 0, drednotAccount.lastDaily || 0), dailyStreak: Math.max(discordAccount.dailyStreak || 0, drednotAccount.dailyStreak || 0), lastHourly: Math.max(discordAccount.lastHourly || 0, drednotAccount.lastHourly || 0), hourlyStreak: Math.max(discordAccount.hourlyStreak || 0, drednotAccount.hourlyStreak || 0), lastSlots: Math.max(discordAccount.lastSlots || 0, drednotAccount.lastSlots || 0), smelting: drednotAccount.smelting || discordAccount.smelting, activeBuffs: (drednotAccount.activeBuffs || []).concat(discordAccount.activeBuffs || []), discordId: discordId, drednotName: drednotName, displayName: null, wasBumped: false, traits: drednotAccount.traits, zeal: drednotAccount.zeal }; 
        for (const itemId in discordAccount.inventory) { mergedData.inventory[itemId] = (mergedData.inventory[itemId] || 0) + discordAccount.inventory[itemId]; } 
        await economyCollection.updateOne({ _id: drednotNameLower }, { $set: mergedData }, { session }); 
        await economyCollection.deleteOne({ _id: discordId }, { session }); 
        await session.commitTransaction(); 
        console.log(`Successfully merged (via transaction) Discord account ${discordId} into Drednot account ${drednotName}`); 
        return { success: true, message: `✅ Merge successful! Your Discord and Drednot progress have been combined.` }; 
    } catch (error) { 
        console.error("Account merge transaction failed. Aborting.", error.message); 
        if (session.inTransaction()) { await session.abortTransaction(); }
        if (error.message.startsWith("Merge Conflict:")) { const reason = error.message.split(": ")[1]; return { success: false, message: `❌ Merge Failed: ${reason}. Please wait for jobs to finish or contact an admin.` }; }
        return { success: false, message: "❌ An unexpected error occurred during the account merge. Please try again." }; 
    } finally { 
        await session.endSession(); 
    } 
}
async function getAveragePlayerPrice(itemId) {
    const playerListings = await marketCollection.find( { itemId: itemId, sellerId: { $not: /^NPC_/ } }, { projection: { price: 1 } } ).sort({ price: 1 }).toArray();
    if (playerListings.length < 3) { if (playerListings.length === 0) return null; const simpleTotal = playerListings.reduce((sum, listing) => sum + listing.price, 0); return simpleTotal / playerListings.length; }
    const sliceAmount = Math.floor(playerListings.length * 0.1);
    const sanitizedListings = playerListings.slice(sliceAmount, -sliceAmount);
    const listToAverage = sanitizedListings.length > 0 ? sanitizedListings : playerListings;
    const totalValue = listToAverage.reduce((sum, listing) => sum + listing.price, 0);
    return totalValue / listToAverage.length;
}
async function handleEat(account, foodName) { const foodId = getItemIdByName(foodName); if (!foodId) return { success: false, message: `Could not find a food named "${foodName}".`}; const itemDef = ITEMS[foodId]; if (itemDef.type !== 'food') return { success: false, message: `You can't eat a ${itemDef.name}!` }; if (!account.inventory[foodId] || account.inventory[foodId] < 1) return { success: false, message: `You don't have any ${itemDef.name} in your inventory.` }; await modifyInventory(account._id, foodId, -1); const now = Date.now(); let activeBuffs = (account.activeBuffs || []).filter(b => b.expiresAt > now); const existingBuffIndex = activeBuffs.findIndex(b => b.itemId === foodId); if (existingBuffIndex !== -1) { const remainingDuration = activeBuffs[existingBuffIndex].expiresAt - now; activeBuffs[existingBuffIndex].expiresAt = now + remainingDuration + itemDef.buff.duration_ms; await updateAccount(account._id, { activeBuffs: activeBuffs }); } else { const newBuff = { itemId: foodId, expiresAt: now + itemDef.buff.duration_ms, effects: itemDef.buff.effects }; await economyCollection.updateOne({ _id: account._id }, { $push: { activeBuffs: newBuff } }); } let effectDescriptions = []; if (itemDef.buff?.effects) { if (itemDef.buff.effects.gather_cooldown_reduction_ms) effectDescriptions.push(`gather cooldown reduced by ${itemDef.buff.effects.gather_cooldown_reduction_ms / 1000}s`); if (itemDef.buff.effects.work_cooldown_reduction_ms) effectDescriptions.push(`work cooldown reduced by ${itemDef.buff.effects.work_cooldown_reduction_ms / 1000}s`); if (itemDef.buff.effects.work_bonus_percent) { const verb = itemDef.buff.effects.work_bonus_percent > 0 ? 'increased' : 'decreased'; effectDescriptions.push(`work earnings ${verb} by ${Math.abs(itemDef.buff.effects.work_bonus_percent * 100)}%`); } if (itemDef.buff.effects.work_double_or_nothing) effectDescriptions.push(`your work earnings are now double or nothing`); } const durationText = formatDuration(itemDef.buff.duration_ms / 1000); return { success: true, message: `You ate a ${itemDef.name}! ${effectDescriptions.length > 0 ? `Effects: ${effectDescriptions.join(', ')}.` : ''} Buff lasts for **${durationText}**.` }; }
async function handleCrateShop() { const listings = await lootboxCollection.find().sort({ lootboxId: 1 }).toArray(); if (listings.length === 0) { return { success: false, lines: [`The Collector has no crates for sale right now.`] }; } const formattedLines = listings.filter(l => LOOTBOXES[l.lootboxId]).map(l => { const crate = LOOTBOXES[l.lootboxId]; return `${crate.emoji} **${l.quantity}x** ${crate.name} @ **${crate.price}** ${CURRENCY_NAME} ea.`; }); if (formattedLines.length === 0) { return { success: false, lines: [`The Collector's stock is being updated. Please check back in a moment.`] }; } return { success: true, lines: formattedLines }; }
function handleInventory(account, filter = null) { if (!account.inventory || Object.keys(account.inventory).length === 0) return 'Your inventory is empty.'; let invList = []; const filterLower = filter ? filter.toLowerCase() : null; for (const itemId in account.inventory) { if (account.inventory[itemId] > 0) { const item = ITEMS[itemId]; if (!item) continue; if (!filterLower || item.name.toLowerCase().includes(filterLower)) invList.push(`> ${item.emoji || '❓'} **${account.inventory[itemId]}x** ${item.name}`); } } if (invList.length === 0) return `You have no items matching "${filter}".`; return invList.join('\n'); }
async function handleLeaderboard() { const allPlayers = await economyCollection.find({}).sort({ balance: -1 }).toArray(); const updatePromises = []; for (const player of allPlayers) { if (!player.drednotName && !player.discordId) { console.log(`[Self-Heal] Found old account format for player: ${player._id}. Fixing...`); player.drednotName = player._id; updatePromises.push(economyCollection.updateOne({ _id: player._id }, { $set: { drednotName: player._id } })); } } if (updatePromises.length > 0) { await Promise.all(updatePromises); console.log(`[Self-Heal] Finished fixing ${updatePromises.length} old accounts.`); } const linkedDiscordIds = new Set(allPlayers.filter(p => p.discordId && p.drednotName).map(p => p.discordId)); const topPlayers = allPlayers.filter(player => { if (!player.drednotName && player.discordId) { return !linkedDiscordIds.has(player.discordId); } return true; }).slice(0, 50); if (topPlayers.length === 0) { return { success: false, lines: ["The leaderboard is empty!"] }; } const lines = topPlayers.map((player, index) => { const name = player.drednotName || player.displayName || `User ${player._id}`; return `${index + 1}. **${name}** - ${Math.floor(player.balance)} ${CURRENCY_NAME}`; }); return { success: true, lines: lines };}
async function handleMarket(filter = null) { let query = {}; const filterLower = filter ? filter.toLowerCase().trim() : null; if (filterLower) { const itemIds = Object.keys(ITEMS).filter(k => ITEMS[k].name.toLowerCase().includes(filterLower)); if (itemIds.length === 0) { return { success: false, lines: [`No market listings found matching "${filter}".`] }; } query.itemId = { $in: itemIds }; } const allListings = await marketCollection.find(query).toArray(); if (allListings.length === 0) { const message = filter ? `No market listings found matching "${filter}".` : "The market is empty."; return { success: false, lines: [message] }; } const sellerIds = [...new Set(allListings.map(l => l.sellerId).filter(id => !id.startsWith('NPC_')))]; const sellerAccounts = await economyCollection.find({ _id: { $in: sellerIds } }).toArray(); const sellerNameMap = new Map(); for (const acc of sellerAccounts) { sellerNameMap.set(acc._id, acc.drednotName || acc.displayName || `User ${acc._id}`); } const npcListings = allListings.filter(l => l.sellerId.startsWith('NPC_')).sort((a, b) => a.price - b.price); const playerListings = allListings.filter(l => !l.sellerId.startsWith('NPC_')); const shuffledPlayerListings = shuffleArray(playerListings);
const finalList = [...shuffledPlayerListings, ...npcListings];
const brokenListings = finalList.filter(l => l.listingId == null);
if (brokenListings.length > 0) {
    console.log(`[Self-Heal] Found ${brokenListings.length} broken market listings. Repairing now...`);
    for (const listing of brokenListings) {
        const newId = await findNextAvailableListingId(marketCollection);
        await marketCollection.updateOne({ _id: listing._id }, { $set: { listingId: newId } });
        listing.listingId = newId;
    }
}
const formattedLines = finalList.map(l => {
    const sellerName = l.sellerId.startsWith('NPC_') ? l.sellerName : (sellerNameMap.get(l.sellerId) || l.sellerName);
    return `(ID: ${l.listingId}) ${ITEMS[l.itemId]?.emoji || '📦'} **${l.quantity}x** ${ITEMS[l.itemId].name} @ **${l.price}** ${CURRENCY_NAME} from *${sellerName}*`;
});
return { success: true, lines: formattedLines };
}
async function handleMarketSell(account, itemName, quantity, price) {
    if (price < MARKET_MIN_PRICE || price > MARKET_MAX_PRICE) {
        return { success: false, message: `Invalid price. The price per item must be between ${MARKET_MIN_PRICE.toLocaleString()} and ${MARKET_MAX_PRICE.toLocaleString()} ${CURRENCY_NAME}.` };
    }
    const itemIdToSell = getItemIdByName(itemName);
    if (!itemIdToSell || quantity <= 0 || price <= 0) return { success: false, message: 'Invalid input.' };
    
    const sellUpdateResult = await economyCollection.findOneAndUpdate( { _id: account._id, [`inventory.${itemIdToSell}`]: { $gte: quantity } }, { $inc: { [`inventory.${itemIdToSell}`]: -quantity } } );
    if (!sellUpdateResult) { return { success: false, message: "You do not have enough of that item to sell." }; }

    try {
        const newListingId = await findNextAvailableListingId(marketCollection);
        const sellerName = account.drednotName || account.displayName || `User ${account._id}`;
        await marketCollection.insertOne({ listingId: newListingId, sellerId: account._id, sellerName: sellerName, itemId: itemIdToSell, quantity, price });
        return { success: true, message: `You listed **${quantity}x** ${ITEMS[itemIdToSell].name} for sale. Listing ID: **${newListingId}**` };
    } catch (error) {
        await modifyInventory(account._id, itemIdToSell, quantity); // Refund
        console.error("Failed to list item, refunding inventory:", error);
        return { success: false, message: 'An unexpected error occurred while listing your item. Your items have been returned.' };
    }
}
async function handleMarketBuy(account, listingId) {
    const listingToBuy = await marketCollection.findOneAndDelete({ listingId: listingId });
    if (!listingToBuy) return { success: false, message: 'That listing does not exist or was just purchased by someone else.' };
    if (listingToBuy.sellerId === account._id) { await marketCollection.insertOne(listingToBuy); return { success: false, message: "You can't buy your own listing." }; }

    if (!isFinite(account.balance)) { await marketCollection.insertOne(listingToBuy); return { success: false, message: 'Your account balance is corrupted. Please contact an admin.' }; }
    const totalCost = Math.round(listingToBuy.quantity * listingToBuy.price);
    
    const purchaseUpdateResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCost } }, { $inc: { balance: -totalCost } });
    if (purchaseUpdateResult.modifiedCount === 0) {
        await marketCollection.insertOne(listingToBuy); // Refund listing
        return { success: false, message: `You can't afford this. It costs **${totalCost} ${CURRENCY_NAME}**.` };
    }
    
    await modifyInventory(account._id, listingToBuy.itemId, listingToBuy.quantity);
    const sellerAccount = await getAccount(listingToBuy.sellerId);
    if (sellerAccount) {
        let taxRate = MARKET_TAX_RATE;
        if (currentGlobalEvent && currentGlobalEvent.effect.type === 'market_tax') { taxRate = currentGlobalEvent.effect.rate; }
        const earnings = Math.round(totalCost * (1 - taxRate));
        await economyCollection.updateOne({ _id: sellerAccount._id }, { $inc: { balance: earnings } });
    }
    const sellerName = sellerAccount ? (sellerAccount.drednotName || sellerAccount.displayName || `User ${sellerAccount._id}`) : listingToBuy.sellerName;
    return { success: true, message: `You bought **${listingToBuy.quantity}x** ${ITEMS[listingToBuy.itemId].name} for **${totalCost} ${CURRENCY_NAME}** from *${sellerName}*!` };
}
async function handleMarketCancel(account, listingId) {
    const listingToCancel = await marketCollection.findOneAndDelete({ listingId: listingId, sellerId: account._id });
    if (!listingToCancel) { return { success: false, message: 'This is not your listing, it does not exist, or it has already been cancelled.' }; }
    await modifyInventory(account._id, listingToCancel.itemId, listingToCancel.quantity);
    return { success: true, message: `You cancelled your listing for **${listingToCancel.quantity}x** ${ITEMS[listingToCancel.itemId].name}. The items have been returned.` };
}
async function handleCrateShopBuy(account, crateName, amount) {
    if (amount <= 0) return { success: false, message: "Please enter a valid amount to open." };
    const crateId = Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateName.toLowerCase());
    if (!crateId) return { success: false, message: `The Collector doesn't sell a crate named "${crateName}". Check the /crateshop.` };
    
    const listingUpdateResult = await lootboxCollection.findOneAndUpdate( { lootboxId: crateId, quantity: { $gte: amount } }, { $inc: { quantity: -amount } } );
    if (!listingUpdateResult) return { success: false, message: `The Collector doesn't have enough of that crate, or it was just purchased.` };
    
    const listing = listingUpdateResult;
    const totalCost = listing.price * amount;

    const purchaseResult = await economyCollection.updateOne({ _id: account._id, balance: { $gte: totalCost } }, { $inc: { balance: -totalCost } });
    if(purchaseResult.modifiedCount === 0) {
        await lootboxCollection.updateOne({ _id: listing._id }, { $inc: { quantity: amount } }); // Refund crate stock
        return { success: false, message: `You can't afford that. It costs **${totalCost} ${CURRENCY_NAME}**.` };
    }
    
    let updates = { $inc: {} };
    let totalRewards = {};
    for (let i = 0; i < amount; i++) { const reward = openLootbox(listing.lootboxId); if (reward.type === 'bits') { totalRewards.bits = (totalRewards.bits || 0) + reward.amount; } else { totalRewards[reward.id] = (totalRewards[reward.id] || 0) + reward.amount; } }
    
    let rewardMessages = [];
    for (const rewardId in totalRewards) {
        if (rewardId === 'bits') {
            updates.$inc.balance = (updates.$inc.balance || 0) + totalRewards[rewardId];
            rewardMessages.push(`**${totalRewards[rewardId]}** ${CURRENCY_NAME}`);
        } else {
            updates.$inc[`inventory.${rewardId}`] = (updates.$inc[`inventory.${rewardId}`] || 0) + totalRewards[rewardId];
            rewardMessages.push(`${ITEMS[rewardId].emoji} **${totalRewards[rewardId]}x** ${ITEMS[rewardId].name}`);
        }
    }
    
    await economyCollection.updateOne({ _id: account._id }, updates);
    await lootboxCollection.deleteMany({ quantity: { $lte: 0 } });
    return { success: true, message: `You opened **${amount}x** ${LOOTBOXES[listing.lootboxId].name} and received: ${rewardMessages.join(', ')}!` };
}

// =========================================================================
// --- BACKGROUND PROCESSES (TICKS) ---
// =========================================================================
async function processVendorTicks() { console.log("Processing regular vendor tick..."); const vendor = VENDORS[Math.floor(Math.random() * VENDORS.length)]; const currentListingsCount = await marketCollection.countDocuments({ sellerId: vendor.sellerId }); if (currentListingsCount >= 3) { return; } if (Math.random() < vendor.chance) { const itemToSell = vendor.stock[Math.floor(Math.random() * vendor.stock.length)]; let finalPrice; if (itemToSell.price) { finalPrice = itemToSell.price; } else { const avgPrice = await getAveragePlayerPrice(itemToSell.itemId); if (avgPrice) { finalPrice = Math.ceil(avgPrice * 1.15); } else { const priceRange = FALLBACK_PRICES[itemToSell.itemId] || FALLBACK_PRICES.default; finalPrice = Math.floor(Math.random() * (priceRange.max - priceRange.min + 1)) + priceRange.min; } } try { const newListingId = await findNextAvailableListingId(marketCollection); await marketCollection.insertOne({ listingId: newListingId, sellerId: vendor.sellerId, sellerName: vendor.name, itemId: itemToSell.itemId, quantity: itemToSell.quantity, price: finalPrice }); console.log(`${vendor.name} listed ${itemToSell.quantity}x ${ITEMS[itemToSell.itemId].name} for ${finalPrice} Bits each!`); } catch (error) { if (error.code === 11000) { console.warn(`[Vendor Tick] Race condition for ${vendor.name}. Retrying next tick.`); } else { console.error(`[Vendor Tick] Error for ${vendor.name}:`, error); } } } }
async function processLootboxVendorTick() { console.log("Processing lootbox vendor tick..."); const currentListings = await lootboxCollection.find({}).toArray(); const currentListingsCount = currentListings.length; if (currentListingsCount > 0 && Math.random() < 0.25) { const listingToRemove = currentListings[Math.floor(Math.random() * currentListings.length)]; await lootboxCollection.deleteOne({ _id: listingToRemove._id }); const crateName = LOOTBOXES[listingToRemove.lootboxId]?.name || 'an unknown crate'; console.log(`The Collector removed all ${crateName}s from the shop.`); return; } if (currentListingsCount < MAX_LOOTBOX_LISTINGS) { const existingCrateIds = currentListings.map(c => c.lootboxId); const availableCrates = Object.keys(LOOTBOXES).filter(id => !existingCrateIds.includes(id)); if (availableCrates.length > 0) { const crateToSellId = availableCrates[Math.floor(Math.random() * availableCrates.length)]; const crateToSell = LOOTBOXES[crateToSellId]; const quantity = Math.floor(Math.random() * 5) + 1; await lootboxCollection.insertOne({ sellerId: LOOTBOX_VENDOR_ID, lootboxId: crateToSellId, quantity: quantity, price: crateToSell.price }); console.log(`The Collector listed ${quantity}x ${crateToSell.name}!`); } } }
async function processFinishedSmelting() { const now = Date.now(); const finishedSmelts = await economyCollection.find({ "smelting.finishTime": { $ne: null, $lte: now } }).toArray(); for (const account of finishedSmelts) { const { resultItemId, quantity } = account.smelting; await modifyInventory(account._id, resultItemId, quantity); await updateAccount(account._id, { smelting: null }); try { if(account.discordId) { const user = await client.users.fetch(account.discordId); user.send(`✅ Your processing is complete! You received ${quantity}x ${ITEMS[resultItemId].name}.`); } } catch (e) { console.log(`Could not DM ${account.drednotName || account._id} about finished processing.`); } } }
async function processGlobalEventTick() { const now = Date.now(); const eventChannel = client.channels.cache.get(EVENT_CHANNEL_ID); if (currentGlobalEvent && now > currentGlobalEvent.expiresAt) { console.log(`Global event '${currentGlobalEvent.name}' has ended.`); if (eventChannel) { const endEmbed = new EmbedBuilder().setColor('#DDDDDD').setTitle(`${currentGlobalEvent.emoji} Event Ended!`).setDescription(`The **${currentGlobalEvent.name}** event is now over. Things are back to normal!`); await eventChannel.send({ embeds: [endEmbed] }).catch(console.error); } currentGlobalEvent = null; } if (!currentGlobalEvent && Math.random() < EVENT_CHANCE) { const eventKeys = Object.keys(EVENTS); const randomEventKey = eventKeys[Math.floor(Math.random() * eventKeys.length)]; const eventData = EVENTS[randomEventKey]; currentGlobalEvent = { ...eventData, type: randomEventKey, startedAt: now, expiresAt: now + eventData.duration_ms, }; console.log(`Starting new global event: '${currentGlobalEvent.name}'`); if (eventChannel) { const startEmbed = new EmbedBuilder().setColor('#FFD700').setTitle(`${currentGlobalEvent.emoji} GLOBAL EVENT STARTED!`).setDescription(`**${currentGlobalEvent.name}**\n\n${currentGlobalEvent.description}`).setFooter({ text: `This event will last for ${formatDuration(currentGlobalEvent.duration_ms / 1000)}.` }); await eventChannel.send({ content: '@here A new global event has begun!', embeds: [startEmbed] }).catch(console.error); } } }
async function processClanWarTick() { try { let state = await serverStateCollection.findOne({ stateKey: "clan_war" }); const now = new Date(); if (!state || now > new Date(state.warEndTime)) { if (state) { console.log("[CLAN WAR] War has ended. Processing rewards..."); const winningClans = await clansCollection.find({ warPoints: { $gt: 0 } }).sort({ warPoints: -1 }).limit(3).toArray(); if (winningClans.length > 0) { const eventChannel = client.channels.cache.get(EVENT_CHANNEL_ID); if (eventChannel) { const winnerDescriptions = winningClans.map((c, i) => { const medals = ['🏆', '🥈', '🥉']; return `${medals[i]} **${c.name}** - ${c.warPoints.toLocaleString()} Points`; }); const embed = new EmbedBuilder().setColor('#FFD700').setTitle('⚔️ Clan War Concluded! ⚔️').setDescription(`The battle has ended! Here are the final standings:\n\n${winnerDescriptions.join('\n')}`).setFooter({ text: "Rewards have been distributed to the members of the winning clans." }); await eventChannel.send({ embeds: [embed] }).catch(console.error); } for (let i = 0; i < winningClans.length; i++) { const clan = winningClans[i]; const rank = i + 1; const reward = CLAN_WAR_REWARDS[rank]; if (reward && reward.items) { const members = await economyCollection.find({ clanId: clan._id }).toArray(); for (const member of members) { for (const item of reward.items) { await modifyInventory(member._id, item.itemId, item.quantity); } } } } } await clansCollection.updateMany({}, { $set: { warPoints: 0 } }); } const newEndTime = new Date(now.getTime() + CLAN_WAR_DURATION_DAYS * 24 * 60 * 60 * 1000); await serverStateCollection.updateOne({ stateKey: "clan_war" }, { $set: { warEndTime: newEndTime } }, { upsert: true }); console.log(`[CLAN WAR] War clock (re)started successfully. Ends at: ${newEndTime.toISOString()}`); } } catch (error) { console.error("[CRITICAL ERROR IN CLAN WAR TICKER]:", error); } }
async function processZealotDecayTick() {
    try {
        const now = Date.now();
        const expirationTime = now - ZEALOT_DECAY_WINDOW_MS;

        const query = {
            "zeal.stacks": { $gt: 0 },
            "zeal.lastAction": { $lt: expirationTime }
        };

        const result = await economyCollection.updateMany(query, {
            $set: { "zeal.stacks": 0 }
        });

        if (result.modifiedCount > 0) {
            console.log(`[Zealot Tick] Reset ${result.modifiedCount} player(s) Zealot stacks due to inactivity.`);
        }
    } catch (error) {
        console.error("[CRITICAL ERROR IN ZEALOT DECAY TICKER]:", error);
    }
}
async function processMarketPriceCorrection() {
    console.log('[Market Correction] Checking for invalid market listings...');
    const invalidListings = await marketCollection.find({
        $or: [
            { price: { $lt: MARKET_MIN_PRICE } },
            { price: { $gt: MARKET_MAX_PRICE } }
        ]
    }).toArray();

    if (invalidListings.length === 0) {
        console.log('[Market Correction] No invalid listings found. Market is clean.');
        return;
    }

    console.log(`[Market Correction] Found ${invalidListings.length} invalid listings. Refunding items and notifying sellers...`);

    for (const listing of invalidListings) {
        // Delete the invalid listing
        await marketCollection.deleteOne({ _id: listing._id });
        // Refund the items to the seller
        await modifyInventory(listing.sellerId, listing.itemId, listing.quantity);
        
        // Try to notify the user via DM if they have a linked Discord account
        const sellerAccount = await getAccount(listing.sellerId);
        if (sellerAccount && sellerAccount.discordId) {
            try {
                const user = await client.users.fetch(sellerAccount.discordId);
                await user.send(
                    `Hello! Your market listing for **${listing.quantity}x ${ITEMS[listing.itemId].name}** was automatically cancelled. ` +
                    `A new market rule has been implemented: items must be priced between **${MARKET_MIN_PRICE.toLocaleString()}** and **${MARKET_MAX_PRICE.toLocaleString()}** ${CURRENCY_NAME} each. ` +
                    `Your items have been returned to your inventory. Please feel free to relist them at a valid price!`
                );
            } catch (e) {
                console.log(`[Market Correction] Could not DM user ${sellerAccount.discordId} about their cancelled listing.`);
            }
        }
    }
    console.log(`[Market Correction] Finished processing ${invalidListings.length} invalid listings.`);
}


// =========================================================================
// --- DISCORD EVENT HANDLERS ---
// =========================================================================
client.on('ready', () => console.log(`Discord bot logged in as ${client.user.tag}!`));
client.on('interactionCreate', async (interaction) => { try { if (interaction.isChatInputCommand()) { await handleSlashCommand(interaction); } else if (interaction.isButton()) { await handleButtonInteraction(interaction); } else if (interaction.isAutocomplete()) { const focusedOption = interaction.options.getFocused(true); let choices = []; if (interaction.commandName === 'craft') { choices = Object.values(ITEMS).filter(i => i.craftable).map(i => i.name); } else if (interaction.commandName === 'eat') { choices = Object.values(ITEMS).filter(i => i.type === 'food').map(i => i.name); } else if (interaction.commandName === 'info') { const itemNames = Object.values(ITEMS).map(i => i.name); const traitNames = Object.values(TRAITS).map(t => t.name); choices = [...itemNames, ...traitNames]; } else if (interaction.commandName === 'marketsell' || interaction.commandName === 'smelt') { choices = Object.values(ITEMS).map(i => i.name); } else if (interaction.commandName === 'crateshopbuy' && focusedOption.name === 'crate_name') { const currentListings = await lootboxCollection.find({}).toArray(); const availableCrateIds = new Set(currentListings.map(l => l.lootboxId)); choices = Object.keys(LOOTBOXES).filter(id => availableCrateIds.has(id)).map(id => LOOTBOXES[id].name); } const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25); await interaction.respond(filtered.map(choice => ({ name: choice, value: choice }))); } } catch (error) { console.error("Error handling interaction:", error); try { const errorReply = { content: 'An unexpected error occurred!', ephemeral: true, components: [] }; if (interaction.replied || interaction.deferred) { await interaction.followUp(errorReply); } else { await interaction.reply(errorReply); } } catch (e) { console.error("CRITICAL: Could not send error reply to interaction.", e); } } });
async function handleButtonInteraction(interaction) { if (interaction.customId.startsWith('paginate_')) { const [action, type, userId] = interaction.customId.split('_'); if (interaction.user.id !== userId) { return interaction.reply({ content: "You cannot use these buttons.", ephemeral: true }); } const session = userPaginationData[userId]; if (!session) { return interaction.update({ content: 'This interactive message has expired or is invalid.', components: [] }); } const pageChange = (type === 'next') ? 1 : -1; const { discord } = getPaginatedResponse(userId, session.type, session.lines, session.title, pageChange); await interaction.update(discord); return; } if (interaction.customId === 'guide_link_account') { const guideMessage = "To link your account, please type `/link` in the chat, select the command, and then enter your exact in-game Drednot name in the `drednot_name` option."; await interaction.reply({ content: guideMessage, ephemeral: true }); return; } }
async function handleSlashCommand(interaction) { const { commandName, user, options } = interaction; const privateCommands = [ 'link', 'name', 'timers', 'inventory', 'balance', 'traits', 'marketcancel', 'clan' ]; const isPublicClanCommand = commandName === 'clan' && ['war', 'list', 'info'].includes(options.getSubcommand()); if (privateCommands.includes(commandName) && !isPublicClanCommand) { await interaction.deferReply({ ephemeral: true }); } else { await interaction.deferReply(); } let account = await getAccount(user.id); let isNewUser = false; if (!account) { account = await createNewAccount(user.id, 'discord'); isNewUser = true; } else { account = await selfHealAccount(account); } if (account.wasBumped) { await updateAccount(user.id, { wasBumped: false }); const bumpedEmbed = new EmbedBuilder() .setColor('#FEE75C') .setTitle('Display Name Reset!') .setDescription("A player from Drednot has registered with the name you were using. Since Drednot names have priority, your display name has been reset.\nPlease use the `/name` command to choose a new, unique display name, or use `/link` to connect your own Drednot account."); return interaction.editReply({ embeds: [bumpedEmbed] }); } let result, amount, choice, itemName, quantity, price, listingId; switch (commandName) { case 'clan': { const sub = options.getSubcommand(); let clanResult; switch (sub) { case 'create': const clanName = options.getString('name'); clanResult = await handleClanCreate(account, clanName); break; case 'leave': clanResult = await handleClanLeave(account); break; case 'disband': clanResult = await handleClanDisband(account); break; case 'kick': const targetUserKick = options.getUser('user'); const targetAccountKick = await getAccount(targetUserKick.id); if (!targetAccountKick) clanResult = { success: false, message: "That user does not have an economy account." }; else clanResult = await handleClanKick(account, targetAccountKick); break; case 'recruit': const status = options.getInteger('status'); clanResult = await handleClanRecruit(account, status); break; case 'upgrade': clanResult = await handleClanUpgrade(account); break; case 'donate': amount = options.getInteger('amount'); clanResult = await handleClanDonate(account, amount); break; case 'info': const codeInfo = options.getString('code'); clanResult = await handleClanInfo(codeInfo); break; case 'list': clanResult = await handleClanList(); if (clanResult.success) { const { discord } = getPaginatedResponse(user.id, 'clan_list', clanResult.lines, 'Clan Browser', 0); return interaction.editReply(discord); } break; case 'war': clanResult = await handleClanWar(); return interaction.editReply({ content: clanResult.message }); case 'join': const codeJoin = options.getString('code'); clanResult = await handleClanJoin(account, codeJoin); break; case 'invite': const targetUserInvite = options.getUser('user'); if (targetUserInvite) { const targetAccountInvite = await getAccount(targetUserInvite.id); if (!targetAccountInvite) clanResult = { success: false, message: "That user does not have an economy account." }; else clanResult = await handleClanInvite(account, targetAccountInvite); } else { clanResult = await handleClanInvite(account, account.clanId ? 'view' : null); } break; case 'accept': const identifier = options.getString('user_or_code'); clanResult = await handleClanAccept(account, identifier); break; case 'decline': const codeDecline = options.getString('code'); clanResult = await handleClanDecline(account, codeDecline); break; } if (clanResult.embed) { return interaction.editReply({ embeds: [clanResult.embed] }); } const clanEmbed = new EmbedBuilder() .setColor(clanResult.success ? '#57F287' : '#ED4245') .setDescription(clanResult.message || (clanResult.lines ? clanResult.lines.join('\n') : "An unknown error occurred.")); return interaction.editReply({ embeds: [clanEmbed] }); } case 'info': { const name = options.getString('name'); const itemId = getItemIdByName(name); const traitId = Object.keys(TRAITS).find(k => TRAITS[k].name.toLowerCase() === name.toLowerCase()); const infoEmbed = new EmbedBuilder().setColor('#3498DB'); if (itemId) { const itemDef = ITEMS[itemId]; infoEmbed.setTitle(`${itemDef.emoji || '📦'} ${itemDef.name}`); if (itemDef.description) infoEmbed.setDescription(itemDef.description); if (itemDef.type) infoEmbed.addFields({ name: 'Type', value: itemDef.type.charAt(0).toUpperCase() + itemDef.type.slice(1), inline: true }); if (itemDef.craftable) { const recipeParts = Object.entries(itemDef.recipe).map(([resId, qty]) => `${ITEMS[resId].emoji} ${qty}x ${ITEMS[resId].name}`); infoEmbed.addFields({ name: 'Recipe', value: recipeParts.join('\n'), inline: false }); } } else if (traitId) { const trait = TRAITS[traitId]; let effectText = ''; switch (traitId) { case 'scavenger': effectText = `Grants a **5%** chance per level to find bonus resources from /work.`; break; case 'prodigy': effectText = `Reduces /work and /gather cooldowns by **5%** per level.`; break; case 'wealth': effectText = `Increases Bits earned from /work by **5%** per level.`; break; case 'surveyor': effectText = `Grants a **2%** chance per level to double your entire haul from /gather.`; break; case 'collector': effectText = `Increases the bonus reward for first-time crafts by **20%** per level.`; break; case 'the_addict': effectText = `After losing a gamble, boosts your next /work by a % based on wealth lost, multiplied by **50%** per level.`; break; case 'zealot': effectText = `Each 'Zeal' stack boosts rewards by **2.5%** per level. Stacks reset if inactive for 10 minutes.`; break; default: effectText = trait.description.replace(/{.*?}/g, '...'); } infoEmbed.setTitle(`🧬 ${trait.name} (${trait.rarity})`) .setDescription(effectText) .addFields({ name: 'Max Level', value: String(trait.maxLevel), inline: true }); } else { infoEmbed.setColor('#ED4245').setTitle('Not Found').setDescription(`Could not find an item or trait named "${name}".`); } return interaction.editReply({ embeds: [infoEmbed] }); } case 'traits': { const sub = options.getSubcommand(); if (sub === 'view') { const traitEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('🧬 Your Traits').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }); if (account.traits && account.traits.slots) { const traitFields = account.traits.slots.map(trait => { const t = TRAITS[trait.name]; return { name: `${t.name} (Level ${trait.level})`, value: `*${t.rarity}*`}; }); traitEmbed.addFields(traitFields); } else { traitEmbed.setDescription("You have no traits yet."); } return interaction.editReply({ embeds: [traitEmbed] }); } if (sub === 'reroll') { if ((account.inventory['trait_reforger'] || 0) < 1) { const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Missing Item').setDescription('You need a ✨ Trait Reforger to do this. Get them from `/gather`!'); return interaction.editReply({ embeds: [errorEmbed] }); } await modifyInventory(user.id, 'trait_reforger', -1); const newTraits = [rollNewTrait(), rollNewTrait()]; await economyCollection.updateOne({ _id: account._id }, { $set: { 'traits.slots': newTraits } }); const successEmbed = new EmbedBuilder().setColor('#57F287').setTitle('✨ Traits Reforged!'); const traitFields = newTraits.map(trait => { const t = TRAITS[trait.name]; return { name: `${t.name} (Level ${trait.level})`, value: `*${t.rarity}*`}; }); successEmbed.setDescription('You consumed a Trait Reforger and received:').addFields(traitFields); return interaction.editReply({ embeds: [successEmbed] }); } break; } case 'market': case 'recipes': case 'crateshop': { let handlerResult, title, type; if (commandName === 'market') { const filter = options.getString('filter'); handlerResult = await handleMarket(filter); title = filter ? `Market (Filter: ${filter})` : "Market"; type = 'market'; } if (commandName === 'recipes') { const recipeLines = (await handleRecipes()).split('\n'); title = recipeLines.shift(); handlerResult = { success: true, lines: recipeLines }; type = 'recipes'; } if (commandName === 'crateshop') { handlerResult = await handleCrateShop(); title = "The Collector's Crates"; type = 'crateshop'; } if (!handlerResult.success) return interaction.editReply({ content: handlerResult.lines[0], components: [] }); const { discord } = getPaginatedResponse(user.id, type, handlerResult.lines, title, 0); await interaction.editReply(discord); return; } case 'leaderboard': { const result = await handleLeaderboard(); if (!result.success) return interaction.editReply({ content: result.lines[0], components: [] }); const { discord } = getPaginatedResponse(user.id, 'leaderboard', result.lines, 'Leaderboard', 0); await interaction.editReply(discord); return; } case 'link': { const drednotNameToLink = options.getString('drednot_name'); if (account.drednotName) { return interaction.editReply({ content: `Your Discord account is already linked to the Drednot account **${account.drednotName}**.` }); } const targetDrednotAccount = await getAccount(drednotNameToLink); if (targetDrednotAccount && targetDrednotAccount.discordId) { return interaction.editReply({ content: `The Drednot account **${drednotNameToLink}** is already linked to another Discord user.` }); } const verificationCode = `${Math.floor(1000 + Math.random() * 9000)}`; await verificationsCollection.insertOne({ _id: verificationCode, discordId: user.id, drednotName: drednotNameToLink, timestamp: Date.now() }); let replyMessage = `**Account Verification Started!**\n\n` + `1. **[Click here to join the verification ship!](${DREDNOT_INVITE_LINK})**\n\n` + `2. Once in-game, copy and paste the following command into the chat:\n` + `\`\`\`\n` + `!verify ${verificationCode}\n` + `\`\`\`\n` + `This code expires in 5 minutes.`; if (!isNewUser) { replyMessage += `\n\n**Note:** You have progress on this Discord account. Verifying will merge it with your **${drednotNameToLink}** account.` } await interaction.editReply({ content: replyMessage }); return; } case 'name': { if (account.drednotName) { return interaction.editReply({ content: `You cannot set a display name because your account is already linked to **${account.drednotName}**. That name is used on the leaderboard.` }); } const newName = options.getString('new_name'); if (newName.length < 3 || newName.length > 16) { return interaction.editReply({ content: 'Your name must be between 3 and 16 characters long.' }); } const existingNameAccount = await economyCollection.findOne({ $or: [ { drednotName: new RegExp(`^${newName}$`, 'i') }, { displayName: new RegExp(`^${newName}$`, 'i') } ] }); if (existingNameAccount) { return interaction.editReply({ content: `That name is already in use by another player. Please choose a different name.` }); } await updateAccount(user.id, { displayName: newName }); return interaction.editReply({ content: `Success! Your display name has been set to **${newName}**.` }); } 
case 'balance': {
    const targetDiscordUser = options.getUser('user');
    let targetAccount = account;
    let userForDisplay = user;

    if (targetDiscordUser) {
        const foundAccount = await getAccount(targetDiscordUser.id);
        if (foundAccount) {
            targetAccount = await selfHealAccount(foundAccount);
            userForDisplay = targetDiscordUser;
        } else {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setDescription(`The user ${targetDiscordUser.username} does not have an economy account yet.`);
            return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
    }

    const title = (targetAccount._id === account._id) ? '💰 Your Wallet' : `💰 ${userForDisplay.username}'s Wallet`;

    const balanceEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(title)
        .setAuthor({ name: userForDisplay.username, iconURL: userForDisplay.displayAvatarURL() })
        .addFields({ name: 'Current Balance', value: `**${Math.floor(targetAccount.balance)}** ${CURRENCY_NAME}` });
    await interaction.editReply({ embeds: [balanceEmbed] });
    break;
}

case 'grid': {
    const sub = options.getSubcommand();
    const powerGrid = account.powerGrid || { slots: [null, null, null] };

    if (sub === 'view') {
        let generation = 0, consumption = 0, bitsGeneration = 0;
        const slotDisplays = powerGrid.slots.map((buildingId, index) => {
            if (!buildingId) return `\`Slot ${index + 1}\` ⚫ Empty`;
            const building = BUILDINGS[buildingId];
            generation += building.effects.power_generation || 0;
            consumption += building.effects.power_consumption || 0;
            bitsGeneration += building.effects.bits_generation || 0;
            return `\`Slot ${index + 1}\` ${building.emoji} ${building.name}`;
        });

        const netPower = generation - consumption;
        const status = netPower >= 0 ? '✅ Online' : '❌ Offline';
        const finalBitsGeneration = netPower >= 0 ? bitsGeneration : 0;

        const gridEmbed = new EmbedBuilder()
            .setColor(netPower >= 0 ? '#57F287' : '#ED4245')
            .setTitle(`⚡ ${user.username}'s Power Grid`)
            .setDescription(slotDisplays.join('\n'))
            .addFields(
                { name: 'Power Status', value: `Gen: **${generation}**/hr\nUse: **${consumption}**/hr\nNet: **${netPower > 0 ? '+' : ''}${netPower}**/hr`, inline: true },
                { name: 'System Status', value: `**${status}**`, inline: true },
                { name: 'Passive Rewards', value: `💰 **+${finalBitsGeneration}** Bits/hr`, inline: true }
            );

        return interaction.editReply({ embeds: [gridEmbed] });
    }

    if (sub === 'place') {
        const slot = options.getInteger('slot');
        const buildingName = options.getString('building');
        const buildingId = getItemIdByName(buildingName);

        if (!buildingId || !BUILDINGS[buildingId]) {
            return interaction.editReply({ content: `"${buildingName}" is not a valid, placeable building.` });
        }
        if ((account.inventory[buildingId] || 0) < 1) {
            return interaction.editReply({ content: `You don't have a ${BUILDINGS[buildingId].name} in your inventory. Craft one first!` });
        }
        
        const slotIndex = slot - 1;
        const currentGrid = account.powerGrid || { slots: [null, null, null], lastTick: Date.now() };

        if (currentGrid.slots[slotIndex]) {
            await modifyInventory(account._id, currentGrid.slots[slotIndex], 1);
        }

        await modifyInventory(account._id, buildingId, -1);
        currentGrid.slots[slotIndex] = buildingId;
        await updateAccount(account._id, { powerGrid: currentGrid });

        return interaction.editReply({ content: `Successfully placed ${BUILDINGS[buildingId].emoji} **${BUILDINGS[buildingId].name}** in Slot ${slot}.` });
    }

    if (sub === 'remove') {
        const slot = options.getInteger('slot');
        const slotIndex = slot - 1;
        const currentGrid = account.powerGrid || { slots: [null, null, null], lastTick: Date.now() };

        const buildingInSlot = currentGrid.slots[slotIndex];
        if (!buildingInSlot) {
            return interaction.editReply({ content: `Slot ${slot} is already empty.` });
        }

        await modifyInventory(account._id, buildingInSlot, 1);
        currentGrid.slots[slotIndex] = null;
        await updateAccount(account._id, { powerGrid: currentGrid });
        
        return interaction.editReply({ content: `Successfully removed ${ITEMS[buildingInSlot].emoji} **${ITEMS[buildingInSlot].name}** from Slot ${slot}. It has been returned to your inventory.` });
    }
    break;
}
case 'inventory': {
    const itemNameFilter = options.getString('item_name');
    const targetDiscordUser = options.getUser('user');
    let targetAccount = account;
    let userForDisplay = user;

    if (targetDiscordUser) {
        const foundAccount = await getAccount(targetDiscordUser.id);
        if (foundAccount) {
            targetAccount = await selfHealAccount(foundAccount);
            userForDisplay = targetDiscordUser;
        } else {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ED4245')
                .setDescription(`The user ${targetDiscordUser.username} does not have an economy account yet.`);
            return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
    
    let inventoryContent = handleInventory(targetAccount, itemNameFilter);

    if (targetAccount._id !== account._id) {
        inventoryContent = inventoryContent
            .replace('Your inventory is empty.', 'This user\'s inventory is empty.')
            .replace(/You have no items matching ".*"/, `This user has no items matching "${itemNameFilter}".`);
    }

    let title;
    if (targetAccount._id === account._id) {
        title = itemNameFilter ? `🎒 Your Inventory (Filtered by: ${itemNameFilter})` : '🎒 Your Inventory';
    } else {
        title = itemNameFilter ? `🎒 ${userForDisplay.username}'s Inventory (Filtered by: ${itemNameFilter})` : `🎒 ${userForDisplay.username}'s Inventory`;
    }

    const inventoryEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(title)
        .setAuthor({ name: userForDisplay.username, iconURL: userForDisplay.displayAvatarURL() })
        .setDescription(inventoryContent);
    await interaction.editReply({ embeds: [inventoryEmbed] });
    break;
}

case 'timers': { const timerLines = await handleTimers(account); const timerEmbed = new EmbedBuilder().setColor('#3498DB').setTitle('⏳ Your Cooldowns').setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }).setDescription(timerLines.join('\n')); await interaction.editReply({ embeds: [timerEmbed] }); break; } case 'work': case 'daily': case 'hourly': case 'gather': case 'smelt': case 'eat': case 'flip': case 'slots': case 'craft': case 'pay': { if (commandName === 'work') result = await handleWork(account); if (commandName === 'daily') result = await handleDaily(account); if (commandName === 'hourly') result = await handleHourly(account); if (commandName === 'gather') result = await handleGather(account); if (commandName === 'smelt') { itemName = options.getString('ore_name'); quantity = options.getInteger('quantity'); result = await handleSmelt(account, itemName, quantity); } if (commandName === 'eat') { itemName = options.getString('food_name'); result = await handleEat(account, itemName); } if (commandName === 'flip') { amount = options.getInteger('amount'); choice = options.getString('choice'); result = await handleFlip(account, amount, choice); } if (commandName === 'slots') { amount = options.getInteger('amount'); result = await handleSlots(account, amount); } if (commandName === 'craft') { itemName = options.getString('item_name'); quantity = options.getInteger('quantity') || 1; result = await handleCraft(account, itemName, quantity); } if (commandName === 'pay') { const recipientUser = options.getUser('user'); amount = options.getInteger('amount'); if (recipientUser.bot) { result = { success: false, message: "You can't pay bots." }; } else if (!isFinite(account.balance)) { result = { success: false, message: 'Your account balance is corrupted. Please contact an admin.' }; } else if (!isFinite(amount) || amount <= 0) { result = { success: false, message: 'Please enter a valid, positive amount.' }; } else { const recipientAccount = await getAccount(recipientUser.id); if (!recipientAccount) { result = { success: false, message: `That user doesn't have an economy account yet.` }; } else { result = await handlePay(account, recipientAccount, amount); } } } const responseEmbed = new EmbedBuilder() .setColor(result.success ? '#57F287' : '#ED4245') .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() }) .setDescription(result.message); await interaction.editReply({ embeds: [responseEmbed] }); break; } case 'marketsell': { itemName = options.getString('item_name'); quantity = options.getInteger('quantity'); price = options.getNumber('price'); result = await handleMarketSell(account, itemName, quantity, price); const embed = new EmbedBuilder().setColor(result.success ? '#57F287' : '#ED4245').setDescription(result.message); await interaction.editReply({ embeds: [embed] }); break; } case 'marketbuy': { listingId = options.getInteger('listing_id'); result = await handleMarketBuy(account, listingId); const embed = new EmbedBuilder().setColor(result.success ? '#57F287' : '#ED4245').setDescription(result.message); await interaction.editReply({ embeds: [embed] }); break; } case 'marketcancel': { const listingIdToCancel = options.getInteger('listing_id'); result = await handleMarketCancel(account, listingIdToCancel); const embed = new EmbedBuilder().setColor(result.success ? '#57F287' : '#ED4245').setDescription(result.message); await interaction.editReply({ embeds: [embed] }); break; } case 'crateshopbuy': { const crateNameToOpenSlash = options.getString('crate_name'); const amountToOpenSlash = options.getInteger('amount'); result = await handleCrateShopBuy(account, crateNameToOpenSlash, amountToOpenSlash); const embed = new EmbedBuilder().setColor(result.success ? '#57F287' : '#ED4245').setTitle(result.success ? `Opened ${amountToOpenSlash}x ${LOOTBOXES[Object.keys(LOOTBOXES).find(k => LOOTBOXES[k].name.toLowerCase() === crateNameToOpenSlash.toLowerCase())].name}` : 'Error').setDescription(result.message); await interaction.editReply({ embeds: [embed] }); break; } } if (isNewUser) { const welcomeEmbed = new EmbedBuilder() .setColor('#57F287') .setTitle('👋 Welcome!') .setDescription(`I've created a temporary economy account for you with a starting balance of **${STARTING_BALANCE} ${CURRENCY_NAME}** and two random traits.\n\nUse \`/traits view\` to see what you got! You can use \`/name\` to set a custom name for the leaderboard if you don't plan on linking a Drednot account.\n\nAlternatively, click the button below to start the process of linking your Drednot.io account.`); const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('guide_link_account').setLabel('Link Drednot Account').setStyle(ButtonStyle.Success).setEmoji('🔗')); await interaction.followUp({ embeds: [welcomeEmbed], components: [row], ephemeral: true }); } }

// =========================================================================
// --- IN-GAME (API) COMMAND HANDLER ---
// =========================================================================
app.get("/", (req, res) => res.send("Bot is alive!"));
app.post('/command', async (req, res) => { try { const apiKey = req.headers['x-api-key']; if (apiKey !== YOUR_API_KEY) return res.status(401).send('Error: Invalid API key'); const { command, username, args } = req.body; if(!command || !username) { return res.status(400).json({reply: "Invalid request body."}); } const identifier = username.toLowerCase(); let responseMessage = ''; if (command === 'verify') { const code = args[0]; const verificationData = await verificationsCollection.findOneAndDelete({ _id: code }); if (!verificationData) { responseMessage = 'That verification code is invalid, expired, or has already been used.'; } else if (Date.now() - verificationData.timestamp > 5 * 60 * 1000) { responseMessage = 'That verification code has expired.'; } else if (verificationData.drednotName.toLowerCase() !== username.toLowerCase()) { responseMessage = 'This verification code is for a different Drednot user and has now been invalidated.'; } else { const mergeResult = await handleAccountMerge(verificationData.discordId, verificationData.drednotName); responseMessage = mergeResult.message; if (mergeResult.success) { try { const discordUser = await client.users.fetch(verificationData.discordId); discordUser.send(mergeResult.message); } catch (e) { console.log("Couldn't send DM confirmation for merge."); } } } return res.json({ reply: responseMessage }); } if (['n', 'next', 'p', 'previous'].includes(command)) { const session = userPaginationData[identifier]; if (!session) return res.json({ reply: 'You have no active list to navigate.' }); const pageChange = (command.startsWith('n')) ? 1 : -1; const { game } = getPaginatedResponse(identifier, session.type, session.lines, session.title, pageChange); return res.json({ reply: game.map(line => cleanText(line)) }); } let account = await getAccount(username); if (!account) { const conflictingDiscordUser = await economyCollection.findOne({ displayName: new RegExp(`^${username}$`, 'i') }); if (conflictingDiscordUser) { console.log(`[Name Bump] Drednot user "${username}" is claiming a name from Discord user ${conflictingDiscordUser._id}.`); await economyCollection.updateOne({ _id: conflictingDiscordUser._id }, { $set: { displayName: null, wasBumped: true } }); } account = await createNewAccount(username, 'drednot'); const welcomeMessage = [`Welcome! Your new economy account "${username}" has been created with ${STARTING_BALANCE} Bits and two random traits.`, `Join the Discord for the full experience:`, `${DISCORD_INVITE_LINK}`]; return res.json({ reply: welcomeMessage }); } else { account = await selfHealAccount(account); } let result; const cleanText = (text) => { let processedText = Array.isArray(text) ? text.map(t => String(t)).join('\n') : String(text); processedText = processedText.replace(/\*\*([^*]+)\*\*/g, (match, p1) => toBoldFont(p1)); return processedText.replace(/`|>/g, '').replace(/<a?:.+?:\d+>/g, '').replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, ''); }; switch (command) {
// --- GRID SYSTEM ---
case 'grid': {
    const powerGrid = account.powerGrid || { slots: [null, null, null] };
    let generation = 0, consumption = 0, bitsGeneration = 0;
    const slotDisplays = powerGrid.slots.map((buildingId, index) => {
        if (!buildingId) return `[Slot ${index + 1}: ⚫ Empty]`;
        const building = BUILDINGS[buildingId];
        generation += building.effects.power_generation || 0;
        consumption += building.effects.power_consumption || 0;
        bitsGeneration += building.effects.bits_generation || 0;
        return `[Slot ${index + 1}: ${building.emoji} ${building.name}]`;
    });

    const netPower = generation - consumption;
    const status = netPower >= 0 ? '✅ Online' : '❌ Offline';
    const finalBitsGeneration = netPower >= 0 ? bitsGeneration : 0;

    const gridStatus = [
        `--- ${toBoldFont("Your Power Grid")} ---`,
        slotDisplays.join(' | '),
        `-------------------------`,
        `⚡ Power: ${generation}/hr (gen) - ${consumption}/hr (use) = ${netPower >= 0 ? '+' : ''}${netPower}/hr (net)`,
        `💰 Bits: +${finalBitsGeneration}/hr`,
        `System Status: ${status}`
    ];
    responseMessage = gridStatus;
    break;
}
case 'gridp': {
    if (args.length < 2) {
        responseMessage = "Usage: !gridp <slot 1-3> <building name>";
        break;
    }
    const slot = parseInt(args[0], 10);
    if (isNaN(slot) || slot < 1 || slot > 3) {
        responseMessage = "Invalid slot. Please choose a slot from 1 to 3.";
        break;
    }
    const buildingName = args.slice(1).join(' ');
    const buildingId = getItemIdByName(buildingName);

    if (!buildingId || !BUILDINGS[buildingId]) {
        responseMessage = `"${buildingName}" is not a valid, placeable building.`;
        break;
    }

    if ((account.inventory[buildingId] || 0) < 1) {
        responseMessage = `You don't have a ${BUILDINGS[buildingId].name} in your inventory. Craft one first!`;
        break;
    }

    const currentGrid = account.powerGrid || { slots: [null, null, null], lastTick: Date.now() };
    const slotIndex = slot - 1;

    // Return the currently placed item to inventory if the slot is occupied
    if (currentGrid.slots[slotIndex]) {
        await modifyInventory(account._id, currentGrid.slots[slotIndex], 1);
    }

    // Place the new item
    await modifyInventory(account._id, buildingId, -1);
    currentGrid.slots[slotIndex] = buildingId;
    await updateAccount(account._id, { powerGrid: currentGrid });

    responseMessage = `Successfully placed ${BUILDINGS[buildingId].emoji} ${BUILDINGS[buildingId].name} in Slot ${slot}.`;
    break;
}
// --- END GRID SYSTEM ---
case 'clan': { const subCommand = args[0]?.toLowerCase() || 'help'; const clanArgs = args.slice(1); let clanResult; switch (subCommand) { case 'create': if (clanArgs.length < 1) { clanResult = { message: "Usage: !clan create <name>" }; break; } const clanNameOnly = clanArgs.join(' '); clanResult = await handleClanCreate(account, clanNameOnly); break; case 'leave': clanResult = await handleClanLeave(account); break; case 'disband': clanResult = await handleClanDisband(account); break; case 'kick': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan kick <username>" }; break; } const targetAccKick = await getAccount(clanArgs.join(' ')); if (!targetAccKick) clanResult = { message: "Player not found." }; else clanResult = await handleClanKick(account, targetAccKick); break; case 'recruit': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan recruit <1|2>" }; break; } clanResult = await handleClanRecruit(account, clanArgs[0]); break; case 'upgrade': clanResult = await handleClanUpgrade(account); break; case 'donate': const amount = parseInt(clanArgs[0], 10); clanResult = await handleClanDonate(account, amount); break; case 'info': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan info <code>" }; break; } clanResult = await handleClanInfo(clanArgs[0]); if (clanResult.embed) { const embed = clanResult.embed.data; let textResponse = [`--- ${embed.title} ---`, embed.description]; embed.fields.forEach(field => { textResponse.push(`\n${field.name}:`); textResponse.push(`${field.value}`); }); clanResult = { message: textResponse.join('\n') }; } break; case 'list': clanResult = await handleClanList(); if (clanResult.success) { const paginated = getPaginatedResponse(identifier, 'clan_list', clanResult.lines, 'Clan Browser', 0); return res.json({ reply: paginated.game.map(line => cleanText(line)) }); } break; case 'war': clanResult = await handleClanWar(); break; case 'join': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan join <code>" }; break; } clanResult = await handleClanJoin(account, clanArgs[0]); break; case 'invite': const targetName = clanArgs.join(' '); if (targetName) { const targetAccInv = await getAccount(targetName); if (!targetAccInv) clanResult = { message: "Player not found." }; else clanResult = await handleClanInvite(account, targetAccInv); } else { clanResult = await handleClanInvite(account, account.clanId ? 'view' : null); } break; case 'accept': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan accept <user_or_code>" }; break; } clanResult = await handleClanAccept(account, clanArgs[0]); break; case 'decline': if (!clanArgs[0]) { clanResult = { message: "Usage: !clan decline <code>" }; break; } clanResult = await handleClanDecline(account, clanArgs[0]); break; default: clanResult = { message: `Unknown clan command. Use !clan list, !info, etc.` }; } responseMessage = clanResult.message || (clanResult.lines ? clanResult.lines.join('\n') : 'An error occurred.'); break; } case 'info': if (args.length === 0) { responseMessage = "Usage: !info <item/trait name>"; break; } const name = args.join(' '); const itemId = getItemIdByName(name); const traitId = Object.keys(TRAITS).find(k => TRAITS[k].name.toLowerCase() === name.toLowerCase()); if (itemId) { responseMessage = cleanText(handleItemInfo(itemId)); } else if (traitId) { const trait = TRAITS[traitId]; let effectText = ''; switch (traitId) { case 'scavenger': effectText = `Grants a 5% chance per level to find bonus resources from /work.`; break; case 'prodigy': effectText = `Reduces /work and /gather cooldowns by 5% per level.`; break; case 'wealth': effectText = `Increases Bits earned from /work by 5% per level.`; break; case 'surveyor': effectText = `Grants a 2% chance per level to double your entire haul from /gather.`; break; case 'collector': effectText = `Increases the bonus reward for first-time crafts by 20% per level.`; break; case 'the_addict': effectText = `After losing a gamble, boosts your next /work by a % based on wealth lost, multiplied by 50% per level.`; break; case 'zealot': effectText = `Each 'Zeal' stack boosts rewards by 2.5% per level. Stacks do not decay.`; break; default: effectText = trait.description.replace(/{.*?}/g, '...'); } responseMessage = [`Trait: ${trait.name} (${trait.rarity})`, effectText, `Max Level: ${trait.maxLevel}`].join('\n'); } else { responseMessage = `Could not find an item or trait named "${name}".`; } break; case 'traits': let traitMessage = `Your Traits:\n`; if(account.traits && account.traits.slots) { for (const trait of account.traits.slots) { const t = TRAITS[trait.name]; traitMessage += `> ${t.name} (Level ${trait.level}) - ${t.rarity}\n`; } } else { traitMessage = "You have no traits yet."; } responseMessage = cleanText(traitMessage); break; case 'traitroll': if ((account.inventory['trait_reforger'] || 0) < 1) { responseMessage = `You need a Trait Reforger to do this.`; } else { await modifyInventory(username, 'trait_reforger', -1); const newTraits = [rollNewTrait(), rollNewTrait()]; await economyCollection.updateOne({ _id: account._id }, { $set: { 'traits.slots': newTraits } }); let rollMessage = `You consumed a Trait Reforger and received:\n`; for (const trait of newTraits) { const t = TRAITS[trait.name]; rollMessage += `> ${t.name} (Level ${trait.level}) - ${t.rarity}\n`; } responseMessage = cleanText(rollMessage); } break; case 'eat': if (args.length === 0) { responseMessage = "Usage: !eat <food name>"; break; } const foodName = args.join(' '); result = await handleEat(account, foodName); responseMessage = cleanText(result.message); break; case 'm': case 'market': const marketFilter = args.length > 0 ? args.join(' ') : null; result = await handleMarket(marketFilter); if (!result.success) { responseMessage = result.lines[0]; break; } const marketPage = getPaginatedResponse(identifier, 'market', result.lines, marketFilter ? `Market (Filter: ${marketFilter})` : "Market", 0); responseMessage = marketPage.game.map(line => cleanText(line)); break; case 'lb': case 'leaderboard': result = await handleLeaderboard(); if (!result.success) { responseMessage = result.lines[0]; break; } const lbPage = getPaginatedResponse(identifier, 'leaderboard', result.lines, "Leaderboard", 0); responseMessage = lbPage.game.map(line => cleanText(line)); break; case 'recipes': const recipeLines = (await handleRecipes()).split('\n'); const recipeTitle = recipeLines.shift(); result = getPaginatedResponse(identifier, 'recipes', recipeLines, recipeTitle, 0); responseMessage = result.game.map(line => cleanText(line)); break; 
case 'bal':
case 'balance': {
    let targetAccount = account;
    let targetNameForDisplay = username;

    if (args.length > 0) {
        const potentialTargetName = args.join(' ');
        const foundAccount = await getAccount(potentialTargetName);
        if (foundAccount) {
            targetAccount = await selfHealAccount(foundAccount);
            targetNameForDisplay = foundAccount.drednotName || foundAccount.displayName || potentialTargetName;
        } else {
            responseMessage = `Player "${potentialTargetName}" not found.`;
            break;
        }
    }
    const nameToDisplay = (targetAccount._id === account._id) ? 'Your' : `${targetNameForDisplay}'s`;
    responseMessage = `${nameToDisplay} balance is: **${Math.floor(targetAccount.balance)}** ${CURRENCY_NAME}.`;
    break;
}
case 'work':
    result = await handleWork(account);
    responseMessage = result.message;
    break;
case 'gather':
    result = await handleGather(account);
    responseMessage = result.message;
    break;
case 'inv':
case 'inventory': {
    let targetAccount = account;
    let filter = null;
    let targetNameForDisplay = username;

    if (args.length > 0) {
        const potentialName = args.join(' ');
        const foundAccount = await getAccount(potentialName);
        if (foundAccount) {
            targetAccount = await selfHealAccount(foundAccount);
            targetNameForDisplay = foundAccount.drednotName || foundAccount.displayName || potentialName;
        } else {
            filter = potentialName;
        }
    }
    
    let inventoryContent = handleInventory(targetAccount, filter);
    let headerText;

    if (targetAccount._id === account._id) {
        headerText = `Your Inventory` + (filter ? ` (Filter: ${filter})` : '');
    } else {
        headerText = `Inventory for ${targetNameForDisplay}` + (filter ? ` (Filter: ${filter})` : '');
        inventoryContent = inventoryContent
            .replace('Your inventory is empty.', 'This inventory is empty.')
            .replace(/You have no items matching ".*"/, `No items in this inventory match the filter.`);
    }

    responseMessage = [`--- ${toBoldFont(headerText)} ---`, inventoryContent].join('\n');
    break;
}
case 'craft': { if (args.length === 0) { responseMessage = "Usage: !craft <item name> [quantity]"; break; } let quantity = 1; let itemName; const lastArg = args[args.length - 1]; if (!isNaN(parseInt(lastArg)) && parseInt(lastArg) > 0) { quantity = parseInt(lastArg); itemName = args.slice(0, -1).join(' '); } else { itemName = args.join(' '); } let craftResult = await handleCraft(account, itemName, quantity); responseMessage = craftResult.message.replace('`/recipes`', '`!recipes`'); break; } case 'daily': result = await handleDaily(account); responseMessage = result.message; break; case 'hourly': result = await handleHourly(account); responseMessage = result.message; break; case 'flip': if (args.length < 2) { responseMessage = "Usage: !flip <amount> <h/t>"; break; } const flipAmount = parseInt(args[0]); if (isNaN(flipAmount) || flipAmount <= 0) { responseMessage = "Please enter a valid, positive amount."; break; } result = await handleFlip(account, flipAmount, args[1].toLowerCase()); responseMessage = result.message; break; case 'slots': if (args.length < 1) { responseMessage = "Usage: !slots <amount>"; break; } const slotsAmount = parseInt(args[0]); if (isNaN(slotsAmount) || slotsAmount <= 0) { responseMessage = "Please enter a valid, positive amount."; break; } result = await handleSlots(account, slotsAmount); responseMessage = result.message; break; case 'timers': result = await handleTimers(account); responseMessage = [`--- ${toBoldFont('Your Cooldowns')} ---`, ...result]; break; case 'smelt': if (args.length < 1) { responseMessage = "Usage: !smelt <item name> [quantity]"; break; } const quantitySmelt = args.length > 1 && !isNaN(parseInt(args[args.length - 1])) ? parseInt(args.pop()) : 1; const itemNameSmelt = args.join(' '); result = await handleSmelt(account, itemNameSmelt, quantitySmelt); responseMessage = result.message; break; case 'pay': if (args.length < 2) { responseMessage = "Usage: !pay <username> <amount>"; break; } const amountToPay = parseInt(args[args.length - 1]); if (!isFinite(account.balance)) { responseMessage = 'Your account balance is corrupted.'; break; } if (isNaN(amountToPay) || amountToPay <= 0) { responseMessage = "Please enter a valid, positive amount."; break; } const recipientName = args.slice(0, -1).join(' '); const recipientAccount = await getAccount(recipientName); if (!recipientAccount) { responseMessage = `Could not find a player named "${recipientName}".`; } else { result = await handlePay(account, recipientAccount, amountToPay); responseMessage = result.message; } break; case 'ms': case 'marketsell': if (args.length < 3) { responseMessage = "Usage: !marketsell [item] [qty] [price]"; break; } const itemNameMs = args.slice(0, -2).join(' '); const qtyMs = parseInt(args[args.length - 2]); const priceMs = parseFloat(args[args.length - 1]); result = await handleMarketSell(account, itemNameMs, qtyMs, priceMs); responseMessage = result.message; break; case 'mb': case 'marketbuy': if (args.length < 1) { responseMessage = "Usage: !marketbuy [listing_id]"; break; } const listingIdMb = parseInt(args[0]); if (isNaN(listingIdMb)) { responseMessage = "Listing ID must be a number."; break; } result = await handleMarketBuy(account, listingIdMb); responseMessage = result.message; break; case 'mc': case 'marketcancel': if (args.length < 1) { responseMessage = "Usage: !marketcancel [listing_id]"; break; } const listingIdMc = parseInt(args[0]); if(isNaN(listingIdMc)) { responseMessage = "Listing ID must be a number."; break; } result = await handleMarketCancel(account, listingIdMc); responseMessage = result.message; break; case 'cs': result = await handleCrateShop(); if (!result.success) { responseMessage = result.lines[0]; break; } const csPage = getPaginatedResponse(identifier, 'crateshop', result.lines, "The Collector's Crates", 0); responseMessage = csPage.game.map(line => cleanText(line)); break; case 'csb': case 'crateshopbuy': if (args.length < 2) { responseMessage = "Usage: !csb [crate name] [amount]"; break; } const amountToOpen = parseInt(args[args.length - 1]); const crateNameToOpen = args.slice(0, -1).join(' '); result = await handleCrateShopBuy(account, crateNameToOpen, amountToOpen); responseMessage = result.message; break; default: responseMessage = `Unknown command: !${command}`; } res.json({ reply: cleanText(responseMessage) }); } catch (error) { console.error(`[API-ERROR] An error occurred while processing command "${req.body.command}" for user "${req.body.username}":`, error); res.status(500).json({ reply: "An internal server error occurred." }); } });

// =========================================================================
// --- SERVER INITIALIZATION ---
// =========================================================================
async function processGridTick() {
    const now = Date.now();
    const playersWithGrids = await economyCollection.find({ "powerGrid.slots": { $ne: null } }).toArray();
    if (playersWithGrids.length === 0) return;
    
    console.log(`[Grid Tick] Processing grids for ${playersWithGrids.length} players...`);

    const bulkOperations = [];

 for (const account of playersWithGrids) {
        let generation = 0;
        let consumption = 0;
        let bitsGeneration = 0;

        (account.powerGrid.slots || []).forEach(buildingId => {
            if (buildingId && BUILDINGS[buildingId]) {
                const building = BUILDINGS[buildingId];
                generation += building.effects.power_generation || 0;
                consumption += building.effects.power_consumption || 0;
                bitsGeneration += building.effects.bits_generation || 0;
            }
        });

        const netPower = generation - consumption;
        if (netPower >= 0 && bitsGeneration > 0) {
            bulkOperations.push({
                updateOne: {
                    filter: { _id: account._id },
                    update: { 
                        $inc: { balance: bitsGeneration },
                        $set: { "powerGrid.lastTick": now }
                    }
                }
            });
        } else {
             bulkOperations.push({
                updateOne: {
                    filter: { _id: account._id },
                    update: { $set: { "powerGrid.lastTick": now } }
                }
            });
        }
    }

    if (bulkOperations.length > 0) {
        try {
            const result = await economyCollection.bulkWrite(bulkOperations);
            console.log(`[Grid Tick] Successfully updated ${result.modifiedCount} player grids.`);
        } catch (error) {
            console.error("[Grid Tick] Error during bulk write:", error);
        }
    }
}
async function startServer() {
    try {
        console.log("Step 1: Connecting to the database...");
        await connectToDatabase();
        
        console.log("Step 2: Running initial market price correction...");
        await processMarketPriceCorrection(); // Run market check on startup

        console.log("Step 3: Starting the API web server...");
        app.listen(port, () => console.log(`   - API server is now listening on port ${port}!`));

        console.log("Step 4: Attempting to log in to Discord...");
        await client.login(process.env.DISCORD_TOKEN);
        // If the line above fails, the code will jump to the 'catch' block.
        // If it succeeds, it will continue to the next line.
        
        console.log("✅✅✅ Discord login successful! ✅✅✅");

        console.log("Step 5: Scheduling all background tasks (ticks)...");
        setInterval(processZealotDecayTick, 60 * 1000);
        setInterval(processVendorTicks, VENDOR_TICK_INTERVAL_MINUTES * 60 * 1000);
        setInterval(processLootboxVendorTick, LOOTBOX_TICK_INTERVAL_MINUTES * 60 * 1000);
        setInterval(processFinishedSmelting, 5000);
        setInterval(processGlobalEventTick, EVENT_TICK_INTERVAL_MINUTES * 60 * 1000);
        setInterval(() => processClanWarTick(client), 60 * 1000); 
        setInterval(processGridTick, GRID_TICK_INTERVAL_MINUTES * 60 * 1000);
        console.log("   - All background tasks are now running.");
        console.log("🚀 Server is fully operational.");

    } catch (error) {
        console.error("❌❌❌ CRITICAL STARTUP FAILED ❌❌❌");
        console.error("An error occurred during the server startup sequence:");
        console.error(error); // This will print the full error object, including the message and stack trace.
        process.exit(1); // Exit the application with an error code.
    }
}

// Start the entire application
startServer();
