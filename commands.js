const IN_GAME_COMMANDS = [
    // General & Economy
    { command: '!bal [user]', description: 'Check your or another user\'s balance.' },
    { command: '!verify <code>', description: 'Used to link your Discord account.' },
    { command: '!inv [user|filter]', description: 'View your/another inventory, or filter your own.' },
    { command: '!timers', description: 'Check your action cooldowns.' },
    { command: '!work', description: 'Work to earn Bits.' },
    { command: '!gather', description: 'Gather for resources.' },
    { command: '!daily', description: 'Claim your daily reward.' },
    { command: '!hourly', description: 'Claim your hourly reward.' },
    { command: '!pay <user> <amount>', description: 'Pay another player.' },
    { command: '!eat <food>', description: 'Eat food to gain a buff.' },

    // Crafting & Items
    { command: '!craft <item> [qty]', description: 'Craft an item.' },
    { command: '!recipes', description: 'View all available crafting recipes.' },
    { command: '!smelt <item> [qty]', description: 'Smelt ore or cook food.' },
    { command: '!info <item|trait>', description: 'Get info on an item or trait.' },

    // Market
    { command: '!m [filter]', description: 'View the player market. (alias: !market)' },
    { command: '!ms <item> <qty> <price>', description: 'List an item for sale. (alias: !marketsell)' },
    { command: '!mb <id>', description: 'Buy a listing from the market. (alias: !marketbuy)' },
    { command: '!mc <id>', description: 'Cancel your market listing. (alias: !marketcancel)' },

    // Gambling
    { command: '!flip <amt> <h/t>', description: 'Flip a coin for a bet.' },
    { command: '!slots <amount>', description: 'Play the slot machine.' },

    // Crates
    { command: '!cs', description: 'View the crate shop.' },
    { command: '!csb <crate> <amt>', description: 'Buy and open crates from the shop.' },

    // Traits
    { command: '!traits', description: 'View your current traits.' },
    { command: '!traitroll', description: 'Reroll your traits using a Trait Reforger.' },

    // Power Grid
    { command: '!grid', description: 'View your power grid.' },
    { command: '!gridup', description: 'Upgrade your power grid size.' },
    { command: '!gridp <slot> <bldg>', description: 'Place a building in your grid.' },

    // Clan Commands
    { command: '!clan list', description: 'List all open clans.' },
    { command: '!clan info <code>', description: 'View info about a specific clan.' },
    { command: '!clan join <code>', description: 'Join an open clan.' },
    { command: '!clan create <name>', description: 'Create a new clan.' },
    { command: '!clan leave', description: 'Leave your current clan.' },
    { command: '!clan donate <amt>', description: 'Donate Bits to the clan vault.' },
    { command: '!clan war', description: 'Check the current clan war status.' },
    { command: '!clan invite [user]', description: '(Owner) Invite a player or view applications.' },
    { command: '!clan accept <user|code>', description: '(Owner) Accept an invite or an applicant.' },
    { command: '!clan decline <code>', description: 'Decline a clan invitation.' },
    { command: '!clan kick <user>', description: '(Owner) Kick a member.' },
    { command: '!clan recruit <1|2>', description: '(Owner) Set clan to Open (1) or Closed (2).' },
    { command: '!clan upgrade', description: '(Owner) Upgrade the clan level.' },
    { command: '!clan disband', description: '(Owner) Disband your clan.' },
    
    // Utility
    { command: '!n / !p', description: 'Navigate multi-page lists (next/previous).' },
];

// This line makes the IN_GAME_COMMANDS array available to other files
module.exports = { IN_GAME_COMMANDS };
