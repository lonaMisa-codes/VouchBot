require('dotenv').config();

// Only Skeleton spawners are traded.
const SPAWNERS = ['Skeleton'];

module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID || null,
  targetId: process.env.VOUCH_TARGET_ID,
  ownerIgn: process.env.OWNER_IGN || 'Unknown',
  commandRoleId: process.env.COMMAND_ROLE_ID || null,
  messageContent: process.env.MESSAGE_CONTENT_INTENT === 'true',
  ticketCategoryId: process.env.TICKET_CATEGORY_ID || null,
  channels: {
    all: process.env.ALL_VOUCHES_CHANNEL_ID || null,
    spawner: process.env.SPAWNER_VOUCHES_CHANNEL_ID || null,
    build: process.env.BUILD_VOUCHES_CHANNEL_ID || null,
    giveaway: process.env.GIVEAWAY_VOUCHES_CHANNEL_ID || null,
  },
  SPAWNERS,
  COLORS: { vouch: 0x2ecc71, scam: 0xe74c3c, info: 0x5865f2, gold: 0xf1c40f },
};
