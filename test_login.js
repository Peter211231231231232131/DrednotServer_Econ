// test_login.js
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error("CRITICAL: DISCORD_TOKEN is missing from the environment!");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
    console.log(`Minimal bot logged in as ${client.user.tag}! The token and intents are working.`);
});

console.log("Attempting to log in with minimal bot...");
client.login(token).catch(err => {
    console.error("Minimal bot login failed:", err);
});
