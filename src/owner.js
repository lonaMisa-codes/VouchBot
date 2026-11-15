const { MessageFlags } = require('discord.js');
const config = require('./config');

const deny = async (interaction, text) => {
  await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
  return false;
};

// Owner = VOUCH_TARGET_ID. Optionally also anyone with COMMAND_ROLE_ID.
// Returns true if allowed, otherwise replies and returns false.
async function ownerOnly(interaction) {
  const ok = interaction.user.id === config.targetId
    || (config.commandRoleId && interaction.member?.roles?.cache?.has(config.commandRoleId));
  return ok || deny(interaction, 'Only the owner can use this command.');
}

module.exports = { ownerOnly };
