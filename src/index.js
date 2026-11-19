const fs = require('fs');
const path = require('path');
const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const config = require('./config');
const tickets = require('./tickets');
const store = require('./store');
const summaryboard = require('./summaryboard');
const schematics = require('./schematics');

// Log errors instead of letting the bot crash
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error(`Node ${process.versions.node} is too old. This bot needs Node 18 or newer.`);
  process.exit(1);
}

if (!config.token) {
  console.error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const commands = new Map();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter((f) => f.endsWith('.js'))) {
  for (const cmd of [].concat(require(`./commands/${file}`))) commands.set(cmd.data.name, cmd);
}

// Only the Guilds intent is needed. Message Content is optional: it is used by the /purge text filters
// and by schematic posting (reading your reply and the attachments).
const intents = [GatewayIntentBits.Guilds];
if (config.messageContent) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
const client = new Client({ intents });
client.on(Events.Error, (err) => console.error('Client error:', err));
client.on(Events.MessageCreate, (message) => schematics.handle(message));

client.once(Events.ClientReady, async (c) => {
  console.log(`Online as ${c.user.tag}`);
  try {
    const body = [...commands.values()].map((cmd) => cmd.data.toJSON());
    const guild = config.guildId ? c.guilds.cache.get(config.guildId) : null;
    if (config.guildId && !guild) {
      console.error(`GUILD_ID ${config.guildId} not found. Is the bot in that server, and is the ID correct? Registering globally instead.`);
    }
    if (guild) {
      await guild.commands.set(body);
      await c.application.commands.set([]); // wipe old global commands from earlier versions
    } else {
      await c.application.commands.set(body);
    }
    console.log(`${body.length} commands registered${guild ? ` in ${guild.name}` : ' globally'}.`);
  } catch (err) {
    console.error('Command registration failed:', err);
  }

  // Live summary panel: refresh on every vouch change, on startup, and every 10 minutes
  store.onChange(() => summaryboard.refresh(c));
  summaryboard.refresh(c);
  setInterval(() => summaryboard.refresh(c), 10 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId.startsWith('ticket:')) {
    return tickets.handle(interaction).catch((err) => {
      console.error(err);
      const text = 'Something went wrong with that ticket action.';
      (interaction.deferred || interaction.replied ? interaction.editReply(text) : interaction.reply({ content: text, flags: MessageFlags.Ephemeral })).catch(() => {});
    });
  }
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(err);
    const text = 'Something went wrong running that command.';
    if (interaction.deferred || interaction.replied) await interaction.editReply(text).catch(() => {});
    else await interaction.reply({ content: text, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

client.login(config.token).catch((err) => {
  console.error(`Login failed: ${err.message}`);
  console.error('Check DISCORD_TOKEN in .env. If the token was ever posted publicly Discord resets it: make a new one in the Developer Portal (Bot > Reset Token).');
  process.exit(1);
});
