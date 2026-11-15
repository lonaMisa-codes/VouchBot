# 🍩 Donut Vouch Bot

A Discord bot for a single DonutSMP trader (the **owner**). It handles:

- **Vouches**: posts spawner, build and giveaway vouches with proof, and keeps stats.
- **Prices**: a live Skeleton spawner price panel plus buy/sell calculators.
- **Tickets**: private buy / sell / support tickets with claim and close tools.
- **Summary**: a live stats panel that refreshes itself after every vouch.

Only **Skeleton spawners** are traded. All wording refers to one person ("I sell to you", "bought from me").

---

## Quick start

1. Install Node **18.17+** (discord.js **14.19+** is needed for the vouch cards, `npm install` handles it).
2. `npm install`
3. Copy `.env.example` to `.env` and fill it in (see [Configuration](#configuration)).
4. `npm start`. Slash commands register automatically on startup.

**Invite the bot** with the `bot` and `applications.commands` scopes. Permissions and intents are explained in [Permissions and intents](#permissions-and-intents).

---

## Configuration

All settings live in `.env`.

| Variable | Required | What it does |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `GUILD_ID` | No | Server to register commands in (updates instantly). Empty = global (can take up to an hour) |
| `VOUCH_TARGET_ID` | Yes | Discord user ID of the **owner**. Can post vouches and is pinged in tickets |
| `OWNER_IGN` | No | Owner's in-game name, shown on the summary panel |
| `ALL_VOUCHES_CHANNEL_ID` | Yes | Every vouch is posted here |
| `SPAWNER_VOUCHES_CHANNEL_ID` | No | Spawner vouches are also copied here |
| `BUILD_VOUCHES_CHANNEL_ID` | No | Build vouches are also copied here |
| `GIVEAWAY_VOUCHES_CHANNEL_ID` | No | Giveaway vouches are also copied here |
| `COMMAND_ROLE_ID` | No | One role that is on par with the owner: it can use every owner command and all ticket controls, and is pinged and given access in new tickets |
| `MESSAGE_CONTENT_INTENT` | No | Set to `true` only after enabling the Message Content Intent. Needed just for some `/purge` filters |
| `TICKET_CATEGORY_ID` | No | Category where ticket channels are created |

Optional settings are skipped when left empty.

---

## Commands

### Who can use what

| Level | Who |
|---|---|
| **Anyone** | Every server member. Only `/spawnerbuy` and `/spawnersell` |
| **Owner** | The user in `VOUCH_TARGET_ID`, plus anyone with `COMMAND_ROLE_ID` if you set it. Every other command and every ticket button |

There are no other roles. Manage Server, Manage Channels and the ticket opener get no extra access. The ticket opener can only chat in their ticket; the owner (or the command role) closes it.

### Command list

| Command | Access | Options | What it does |
|---|---|---|---|
| `/spawnerprice` | Owner | `buy`, `sell` (both optional after first use) | Sets the Skeleton spawner prices and updates the price panel. Change one or both. The first time, give both. If no panel exists, one is posted in the current channel |
| `/spawnerbuy` | Anyone | `amount` | Total cost to **buy** spawners from me at the current price |
| `/spawnersell` | Anyone | `amount` | How much you **earn** selling spawners to me at the current price |
| `/spawnervouch` | Owner | `trade`, `value`, `amount`, `vouch` (image), `proof` (image) | Posts a spawner vouch |
| `/buildvouch` | Owner | `trade`, `value`, `vouch`, `proof`, optional `schem` | Posts a build / base vouch. `schem` is the build name |
| `/giveawayvouch` | Owner | `amount`, `vouch`, `proof` | Posts a giveaway vouch. `proof` shows the winner being paid |
| `/summary` | Owner | none | Posts the live summary panel (sections: overview, spawners, builds, giveaways, each with recent transactions). Only one exists at a time, and posting a new one removes the old one |
| `/purge` | Owner | `amount` (1-100), optional `user`, `filter`, `contains`, `scan`, `include_pinned` | Finds matching messages in the current channel, shows a confirmation with the exact count, and deletes them only after you press **Delete** (30 s timeout, **Cancel** to abort). Pinned messages are skipped unless `include_pinned` is on. Discord can't bulk delete messages older than 14 days, so those are skipped. The `contains`, `links`, `attachments` and `embeds` filters need the Message Content Intent |
| `/close` | Owner | optional `reason` | Closes the ticket you are in. With a reason it posts the reason first (same as the Close / Close with Reason buttons) |
| `/ticket claim` | Owner | none | Claims the ticket |
| `/ticket unclaim` | Owner | none | Unclaims the ticket |
| `/ticket add` | Owner | `user` | Adds someone to the ticket |
| `/ticketpanel` | Owner | none | Posts the **General Support** ticket panel in the current channel. Spawner buy / sell tickets open from the price panel |

**Notes**

- `trade` is either *Customer bought from me* or *Customer sold to me*.
- `proof` is mandatory on every vouch command. It is labelled **Proof of base** on builds, **Proof of trade** on spawners and **Proof of payment** on giveaways. The vouch picture is labelled **Proof of vouch**.
- Prices and values accept `16.2m`, `16200000`, `3.44b`, `1t`, `$3,000`. Units: `k`, `m`, `b`, `t`.
- Numbers are displayed like `(16.2m) 16,200,000`. Spawner amounts also show stacks, for example `105 = 1 stack + 41`.
- `giveawayvouch` `amount` can also be free text. If it can't be read as a number it is shown as typed.

### Examples

```
/spawnerprice buy:16.2m sell:15.3m
/spawnerbuy amount:128
/spawnervouch trade:Customer bought from me value:3.44b amount:200 vouch:<image> proof:<image>
/buildvouch trade:Customer sold to me value:250m vouch:<image> proof:<image> schem:Mega Base
/giveawayvouch amount:5m vouch:<image> proof:<image>
/ticketpanel
```

---

## Price panel

- **I SELL TO YOU** is the `buy` price (customers buy from me).
- **YOU SELL TO ME** is the `sell` price.
- The panel has **Buy / Sell Spawners** buttons that open the ticket form.
- `/spawnerbuy` and `/spawnersell` always use the prices on the panel.

---

## Tickets

- **Spawner tickets** (from the price panel): Buy / Sell buttons open a form asking for **IGN** and **amount**. The ticket shows the IGN, buy or sell, amount, current prices and the total at the current rate.
- **Support tickets**: one button, no form.
- **Pings** on a new ticket: the customer, the owner and `COMMAND_ROLE_ID` (if set).
- **Ticket buttons**: Close, Close with Reason, Claim, Unclaim, Add to Ticket.
- **Ticket commands**: the same five actions exist as `/close` (with an optional reason), `/ticket claim`, `/ticket unclaim` and `/ticket add`, so you never have to scroll up to the first message. They only work inside a ticket channel.
- **Limit**: one open ticket per user per type.

---

## Vouch cards

Each vouch is **one card** with the title, a counter line. The all-vouches channel shows `Build - 12  •  Total - 140` (category number and overall number); the spawner / build / giveaway channels show only the category number, like `Build - 12`, the trade details, the vouch picture (**Proof of vouch**) and the proof picture.

## Vouch channels

Every vouch goes to the all-vouches channel first.

| Vouch type | Also copied to |
|---|---|
| Spawner | Spawner channel |
| Build | Build channel |
| Giveaway | Giveaway channel |

---

## Live summary

`/summary` posts a panel with these sections: **overview, spawners, builds, giveaways**, each with recent transactions. It refreshes after every vouch, on startup, and every 10 minutes.

---

## Permissions and intents

**Gateway intents.** Only **Guilds** (no setting needed, it is on by default). The bot does **not** need Server Members or Presence.

**Message Content Intent (optional).** Turn it on only if you want the `/purge` filters `contains`, `links`, `attachments` and `embeds`. Discord hides message text from bots without it. In the Developer Portal go to Bot > Privileged Gateway Intents > Message Content Intent, then set `MESSAGE_CONTENT_INTENT=true` in `.env` and restart. If you set it to `true` without enabling it in the portal, the bot fails to log in.

**Server permissions** (invite with `permissions=257040`):

| Permission | Why |
|---|---|
| View Channel, Send Messages, Embed Links | Panels, calculators, vouches, tickets |
| Attach Files | Re-uploads the vouch and proof pictures |
| Read Message History | `/purge` and reading tickets |
| Manage Messages | `/purge` deleting messages |
| Manage Channels | Creating, locking and deleting ticket channels |
| Mention Everyone | Pinging `COMMAND_ROLE_ID` in new tickets. Skip it if that role is set to "Allow anyone to @mention this role", or if you don't use the role |

Invite link (replace `YOUR_APP_ID` with your Application ID from the Developer Portal):

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&permissions=257040&scope=bot%20applications.commands
```

**Channel setup.** Make sure the bot's role can see and post in the all-vouches, spawner and build channels and the ticket category (with Manage Channels on that category). The bot does not need Administrator or Manage Roles.

---

## Data and hosting

- Data (vouches, prices, panels, ticket claims) is stored in `data/vouches.json`. **Keep the `data/` folder when you update the bot.**
- The bot logs errors instead of crashing, but a host can still stop it. For automatic restarts use pm2:

```
npm i -g pm2
pm2 start src/index.js --name vouch-bot
pm2 save
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `DISCORD_TOKEN is missing` | Create `.env` from `.env.example` and fill in the token |
| `Login failed` | Token is wrong or was reset. Bot tab in the Developer Portal, then Reset Token |
| `GUILD_ID not found` | The bot isn't in that server, or the ID is wrong. Commands register globally instead |
| Commands don't show up | Re-invite with the `applications.commands` scope. Global commands can take up to an hour |
| Price panel won't post | The bot needs View Channel, Send Messages and Embed Links in that channel |
| `Node is too old` | Install Node 18 or newer |

## Project layout

```
src/
  index.js          startup, command registration, interaction routing
  config.js         reads .env
  owner.js          owner (+ optional role) permission check
  post.js           publishes vouches to channels
  store.js          JSON data storage
  tickets.js        ticket panels, forms and buttons
  priceboard.js     price panel
  summaryboard.js   live summary panel
  calc.js           /spawnerbuy and /spawnersell
  utils.js          price parsing and number formatting
  commands/         one file per slash command (includes ticket.js, close.js and purge.js)
```
