const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const config = require('../config');
const { ownerOnly } = require('../owner');
const schematics = require('../schematics');

// /schematicchannel = posting channels (pictures + file), /boosterchannel = booster channels (pictures only)
function make(kind, name, label, example) {
  const textChannel = (o) => o.setName('channel').setDescription('The channel').setRequired(true)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(`Owner: manage ${label} channels`)
      .setDMPermission(false)
      .addSubcommand((s) => s.setName('add').setDescription(`Add (or change) a ${label} channel and its build-number letter`)
        .addChannelOption(textChannel)
        .addStringOption((o) => o.setName('prefix').setDescription(`1-3 letters that start the build number, e.g. ${example}`).setRequired(true).setMinLength(1).setMaxLength(3)))
      .addSubcommand((s) => s.setName('remove').setDescription(`Stop using a channel as a ${label} channel`).addChannelOption(textChannel))
      .addSubcommand((s) => s.setName('list').setDescription(`Show the ${label} channels`)),

    async execute(i) {
      if (!(await ownerOnly(i))) return;
      const sub = i.options.getSubcommand();
      const reply = (content) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

      if (sub === 'list') {
        const rows = Object.entries(schematics.listChannels(kind));
        return reply(rows.length ? rows.map(([id, p]) => `<#${id}> → \`${p}\``).join('\n') : `No ${label} channels yet. Add one with \`/${name} add\`.`);
      }

      const channel = i.options.getChannel('channel');
      if (sub === 'remove') {
        const r = schematics.removeChannel(kind, channel.id);
        return reply(r.ok ? `Removed <#${channel.id}>.` : r.reason);
      }

      const prefix = i.options.getString('prefix').trim();
      if (!/^[A-Za-z]{1,3}$/.test(prefix)) return reply('The prefix must be 1 to 3 letters, for example `' + example + '`.');
      const r = schematics.addChannel(kind, channel.id, prefix);
      if (!r.ok) return reply(r.reason);
      const warn = config.messageContent ? '' : '\n⚠️ Posting stays off until `MESSAGE_CONTENT_INTENT=true` is set in `.env` (and the intent is enabled in the Developer Portal), then restart the bot.';
      return reply(`<#${channel.id}> is now a ${label} channel. Build numbers start with \`${prefix.toUpperCase()}\` (${prefix.toUpperCase()}1, ${prefix.toUpperCase()}2...).${warn}`);
    },
  };
}

module.exports = [
  make('posting', 'schematicchannel', 'schematic posting', 'B'),
  make('booster', 'boosterchannel', 'booster schematic', 'BB'),
];
