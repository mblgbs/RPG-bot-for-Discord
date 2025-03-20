// BASE
const { aggregation } = require('../../Base/Util');
const BaseGame = require('../../Base/Game');
const BaseHelper = require('../../Base/Helper');

// DATA
const titles = require('./titles');
const globalSpells = require('../../../game/data/globalSpells');
const enumHelper = require('../../../utils/enumHelper');
const holidays = require('../data/holidays');
const { guildID } = require('../../../../settings');

// UTILS
const { errorLog } = require('../../../utils/logger');

class Commands extends aggregation(BaseGame, BaseHelper) {

  constructor(params) {
    super();
    const { Database, Events, MapManager, ItemManager, MonsterManager } = params;
    this.Database = Database;
    this.Events = Events;
    this.MapManager = MapManager;
    this.ItemManager = ItemManager;
    this.MonsterManager = MonsterManager;
  }

  async playerStats(params) {
    const { author, playerToCheck } = params;
    const loadedPlayer = await this.Database.loadPlayer(playerToCheck ? playerToCheck.id : author.id, enumHelper.statsSelectFields);
    if (!loadedPlayer) {
      return playerToCheck && playerToCheck.id !== author.id
        ? author.send('This character was not found! This player probably was not born yet. Please be patient until destiny has chosen him/her.')
        : author.send('Your character was not found! You probably were not born yet. Please be patient until destiny has chosen you.');
    }
    const result = this.generateStatsString(loadedPlayer);

    return !playerToCheck || playerToCheck.id === author.id
      ? author.send(result)
      : author.send(result.replace('Here are your stats!', `Here are ${loadedPlayer.name}'s stats!`));
  }

  async playerEquipment(params) {
    const { author, playerToCheck } = params;
    const loadedPlayer = await this.Database.loadPlayer(playerToCheck ? playerToCheck.id : author.id, enumHelper.equipSelectFields);
    if (!loadedPlayer) {
      return playerToCheck && playerToCheck.id !== author.id
        ? author.send('This players equipment was not found! This player probably was not born yet. Please be patient until destiny has chosen him/her.')
        : author.send('Your equipment was not found! You probably were not born yet. Please be patient until destiny has chosen you.');
    }
    const result = this.generateEquipmentsString(loadedPlayer);

    return !playerToCheck || playerToCheck.id === author.id
      ? author.send(result)
      : author.send(result.replace('Here is your equipment!', `Here is ${loadedPlayer.name}'s equipment!`));
  }

  async playerSpellBook(params) {
    const { author, playerToCheck } = params;
    const loadedPlayer = await this.Database.loadPlayer(playerToCheck ? playerToCheck.id : author.id, enumHelper.statsSelectFields);
    if (!loadedPlayer) {
      return playerToCheck && playerToCheck.id !== author.id
        ? author.send('This players spellbook was not found! This player probably was not born yet. Please be patient until destiny has chosen him/her.')
        : author.send('Your spellbook was not found! You probably were not born yet. Please be patient until destiny has chosen you.');
    }
    const result = this.generateSpellBookString(loadedPlayer);

    return !playerToCheck || playerToCheck.id === author.id
      ? author.send(result)
      : author.send(result.replace('Here\'s your spellbook!', `Here\'s ${loadedPlayer.name}'s spellbook!`));
  }

  playerInventory(params) {
    const { author } = params;
    return this.Database.loadPlayer(author.id, enumHelper.inventorySelectFields);
  }

  async resetLottery({ guildId, guild }) {
    if (!process.env.NODE_ENV.includes('production')) {
      return;
    }

    const lotteryPlayers = await this.Database.loadLotteryPlayers(guildId);
    if (!lotteryPlayers.length) {
      return;
    }

    const newPrizePool = 1500;
    const lotteryChannel = await guild.channels.cache.get(enumHelper.channels.lottery);
    if (lotteryChannel) {
      let lotteryMessages = await lotteryChannel.messages.fetch({ limit: 10 });
      lotteryMessages = await lotteryMessages.sort((message1, message2) => message1.createdTimestamp - message2.createdTimestamp);
      if (lotteryMessages.size <= 0) {
        await lotteryChannel.send('Idle-RPG Lottery - You must pay 100 gold to enter! PM me `!lottery` to join');
        await lotteryChannel.send(`Current lottery prize pool: ${newPrizePool}`);
        await lotteryChannel.send('Contestants:');
      } else {
        await lotteryMessages.array()[0].edit('Idle-RPG Lottery - You must pay 100 gold to enter! PM me `!lottery` to join');
        await lotteryMessages.array()[1].edit(`Current lottery prize pool: ${newPrizePool}`);
        await lotteryMessages.array()[2].edit('Contestants:');
      }
    }

    const updatedConfig = await this.Database.loadGame(guildId);
    updatedConfig.dailyLottery.prizePool = newPrizePool;
    this.config = updatedConfig;

    await this.Database.updateGame(guildId, updatedConfig);
    await this.Database.removeLotteryPlayers(guildId);
  }

  async resetQuest(params) {
    const { author } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id);
    try {
      if (!loadedPlayer || !loadedPlayer.quest) {
        return 'I\'m sorry but you have no quest.';
      }
      if (((new Date() - loadedPlayer.quest.updated_at) / (1000 * 60 * 60 * 24)) <= 2) {
        return 'I\'m sorry but you must have a quest at least 2 days old';
      }
      const oldQuestMob = loadedPlayer.quest.questMob.name;
      let { updatedPlayer } = await this.Events.retrieveNewQuest(loadedPlayer, true);
      if (updatedPlayer.quest.questMob.name === oldQuestMob) {
        const newQuestResult = await this.Events.retrieveNewQuest(loadedPlayer, true);
        updatedPlayer = newQuestResult.updatedPlayer;
      }
      await this.Database.savePlayer(updatedPlayer);
      return `Quest ${oldQuestMob} has been changed to ${updatedPlayer.quest.questMob.name}\nCount: ${updatedPlayer.quest.questMob.count}`;
    } catch (err) {
      errorLog.error(err);
    }
  }

  async joinLottery(params) {
    const { Bot, author, canJoinLottery } = params;
    if (!canJoinLottery) {
      return author.send('Joining lottery is currently disabled, please try again in a few.');
    }

    const player = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (player.lottery.joined) {
      return author.send('You\'ve already joined todays daily lottery!');
    }
    if (player.gold.current < 100) {
      return author.send('You do not have enough gold to join the lottery!');
    }

    player.lottery.joined = true;
    player.lottery.amount += 100;
    player.gold.current -= 100;

    const guildConfig = await this.Database.loadGame(player.guildId);
    guildConfig.dailyLottery.prizePool += 100;
    await this.Database.updateGame(player.guildId, guildConfig);
    await this.Database.savePlayer(player);
    const lotteryChannel = await Bot.guilds.cache.get(player.guildId).channels.cache.get(enumHelper.channels.lottery);
    if (lotteryChannel) {
      let lotteryMessages = await lotteryChannel.messages.fetch({ limit: 10 });
      lotteryMessages = await lotteryMessages.sort((message1, message2) => message1.createdTimestamp - message2.createdTimestamp);
      if (lotteryMessages.size <= 0) {
        await lotteryChannel.send('Idle-RPG Lottery - You must pay 100 gold to enter! PM me `!lottery` to join!');
        await lotteryChannel.send(`Current lottery prize pool: ${guildConfig.dailyLottery.prizePool}`);
        await lotteryChannel.send('Contestants:');
        await lotteryChannel.send(`${player.name}`);
      } else {
        await lotteryMessages.array()[1].edit(`Current lottery prize pool: ${guildConfig.dailyLottery.prizePool}`);
        await lotteryMessages.array()[2].edit(lotteryMessages.array()[2].content.concat(`\n${player.name}`));
      }
    }

    return author.send('You have joined todays daily lottery! Good luck!');
  }

  async prizePool(params) {
    const { author } = params;
    const player = await this.Database.loadPlayer(author.id, { guildId: -1 });
    const lotteryPlayers = await this.Database.loadLotteryPlayers(player.guildId);
    const guildConfig = await this.Database.loadGame(player.guildId);

    return author.send(`There are ${lotteryPlayers.length} contestants for a prize pool of ${guildConfig.dailyLottery.prizePool} gold!`);
  }

  async checkMultiplier(params) {
    const { author } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id, { guildId: -1 });
    const config = await this.Database.loadGame(loadedPlayer.guildId);

    return author.send(`Current Multiplier: ${config.multiplier}x\nActive Bless: ${config.spells.activeBless}x`);
  }

  async listTitles(params) {
    const { author } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id, { titles: -1 });
    if (loadedPlayer.titles.unlocked.length <= 0) {
      return author.send('I\'m sorry, you currently do not have any titles unlocked.');
    }

    return author.send(`You currently have ${loadedPlayer.titles.unlocked.join(', ')} unlocked!\nUse \`!st\` or \`!settitle <title>\` to change titles.`);
  }

  async setTitle(params) {
    const { author, value } = params;
    if (!this.objectContainsName(titles, value)) {
      return author.send(`${value} is not a title.`);
    }

    const loadedPlayer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (loadedPlayer.titles.unlocked.length <= 0) {
      return author.send('I\'m sorry, but you have no titles unlocked as of yet.');
    }

    if (!loadedPlayer.titles.unlocked.includes(value)) {
      return author.send('You do not have this title unlocked!');
    }

    loadedPlayer.titles.current = value;
    await this.Database.savePlayer(loadedPlayer);
    return author.send(`Title has been set to ${value}, you're now known as ${loadedPlayer.name} the ${value}.`);
  }

  async top10(params) {
    const { author, type, guildId, Bot } = params;
    const loadedTop10 = await this.Database.loadTop10(type, guildId, Bot.user.id);
    const rankString = await `${loadedTop10.filter(player => Object.keys(type)[0].includes('.') ? player[Object.keys(type)[0].split('.')[0]][Object.keys(type)[0].split('.')[1]] : player[Object.keys(type)[0]] > 0)
      .sort((player1, player2) => {
        if (Object.keys(type)[0] === 'level') {
          return player2.experience.current - player1.experience.current && player2.level - player1.level;
        }

        if (Object.keys(type)[0].includes('.')) {
          const keys = Object.keys(type)[0].split('.');
          return player2[keys[0]][keys[1]] - player1[keys[0]][keys[1]];
        }

        return player2[Object.keys(type)[0]] - player1[Object.keys(type)[0]];
      })
      .map((player, rank) => `Rank ${rank + 1}: ${player.name} - ${Object.keys(type)[0].includes('.') ? `${Object.keys(type)[0].split('.')[0]}: ${player[Object.keys(type)[0].split('.')[0]][Object.keys(type)[0].split('.')[1]]}` : `${Object.keys(type)[0].replace('currentBounty', 'Bounty')}: ${player[Object.keys(type)[0]]}`}`)
      .join('\n')}`;

    return author.send(`\`\`\`Top 10 ${Object.keys(type)[0].includes('.') ? `${Object.keys(type)[0].split('.')[0]}` : `${Object.keys(type)[0].replace('currentBounty', 'Bounty')}`}:
${rankString}\`\`\``);
  }

  getRank(params) {
    const { author, type } = params;
    return this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 })
      .then(player => this.Database.loadCurrentRank(player, type))
      .then(currentRank => currentRank.filter(player => Object.keys(type)[0].includes('.') ? player[Object.keys(type)[0].split('.')[0]][Object.keys(type)[0].split('.')[1]] : player[Object.keys(type)[0]] > 0)
        .sort((player1, player2) => {
          if (Object.keys(type)[0] === 'level') {
            return player2.experience.current - player1.experience.current && player2.level - player1.level;
          }

          if (Object.keys(type)[0].includes('.')) {
            const keys = Object.keys(type)[0].split('.');
            return player2[keys[0]][keys[1]] - player1[keys[0]][keys[1]];
          }

          return player2[Object.keys(type)[0]] - player1[Object.keys(type)[0]];
        }).findIndex(player => player.discordId === author.id))
      .then((rank) => {
        author.send(`You're currently ranked ${rank + 1} in ${Object.keys(type)[0].includes('.') ? Object.keys(type)[0].split('.')[0] : Object.keys(type)[0]}!`);
      });
  }

  async castSpell(params) {
    const { author, Bot, spell, amount } = params;
    const player = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    const actionsChannel = Bot.guilds.cache.get(player.guildId).channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text');
    const guildConfig = await this.Database.loadGame(player.guildId);
    switch (spell) {
      case 'bless':
        let calcAmount = amount;
        if (amount === 'all') {
          calcAmount = Math.floor(player.gold.current / globalSpells.bless.spellCost);
        } else {
          calcAmount = Number(Math.abs(amount));

          if (calcAmount <= 0 || isNaN(calcAmount)) {
            return author.send('You must cast a valid amount');
          }
        }
        if (player.gold.current >= (globalSpells.bless.spellCost * calcAmount) && calcAmount >= 1) {
          player.spellCast += calcAmount;
          player.gold.current -= (globalSpells.bless.spellCost * calcAmount);
          await this.Database.savePlayer(player)
            .then(() => {
              author.send('Spell has been cast!');
            });
          guildConfig.multiplier += calcAmount;
          guildConfig.spells.activeBless += calcAmount;
          await this.Database.updateGame(player.guildId, guildConfig);
          actionsChannel.send(this.setImportantMessage(`${player.name}${player.titles.current !== 'None' ? ` the ${player.titles.current}` : ''} just cast${calcAmount > 1 ? ` ${calcAmount}x ` : ' '}${spell}!!\nCurrent Active Bless: ${guildConfig.spells.activeBless}\nCurrent Multiplier is: ${guildConfig.multiplier}x`));
          setTimeout(async () => {
            const newLoadedConfig = await this.Database.loadGame(player.guildId);
            newLoadedConfig.multiplier = Math.max(1, newLoadedConfig.multiplier - calcAmount);
            newLoadedConfig.spells.activeBless = Math.max(0, newLoadedConfig.spells.activeBless - calcAmount);
            newLoadedConfig.multiplier = newLoadedConfig.multiplier <= 0 ? 1 : newLoadedConfig.multiplier;
            await this.Database.updateGame(player.guildId, newLoadedConfig);
            actionsChannel.send(this.setImportantMessage(`${player.name}${player.titles.current !== 'None' ? ` the ${player.titles.current}` : ''}s${calcAmount > 1 ? ` ${calcAmount}x ` : ' '}${spell} just wore off.\nCurrent Active Bless: ${newLoadedConfig.spells.activeBless}\nCurrent Multiplier is: ${newLoadedConfig.multiplier}x`));
          }, 1800000 * 2); // 60 minutes
        } else {
          author.send(`You do not have enough gold! This spell costs ${globalSpells.bless.spellCost} gold. You're lacking ${globalSpells.bless.spellCost - player.gold.current} gold.`);
        }
        break;

      case 'home':
        if (player.gold.current >= globalSpells.home.spellCost) {
          player.gold.current -= globalSpells.home.spellCost;
          const randomHome = this.MapManager.getRandomTown();
          player.map = randomHome;
          actionsChannel.send(`${player.name}${player.titles.current !== 'None' ? ` the ${player.titles.current}` : ''} just cast ${spell} and teleported back to ${randomHome.name}.`);
          author.send(`Teleported back to ${randomHome.name}.`);
          await this.Database.savePlayer(player)
            .then(() => {
              author.send('Spell has been cast!');
            });
        } else {
          author.send(`You do not have enough gold! This spell costs ${globalSpells.home.spellCost} gold.You are lacking ${globalSpells.home.spellCost - player.gold.current} gold.`);
        }
        break;
    }
  }

  async placeBounty(params) {
    const { author, Bot, recipient, amount } = params;
    const bountyPlacer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (bountyPlacer.gold.current < amount) {
      return author.send('You need more gold to place this bounty');
    }
    const bountyRecipient = await this.Database.loadPlayer(recipient, { pastEvents: 0, pastPvpEvents: 0 });
    if (!bountyRecipient) {
      return author.send('This player does not exist.');
    }

    bountyPlacer.gold.current -= Number(amount);
    bountyRecipient.currentBounty += Number(amount);
    const actionsChannel = await Bot.guilds.cache.get(bountyPlacer.guildId).channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text');
    await this.Database.savePlayer(bountyPlacer);
    await this.Database.savePlayer(bountyRecipient);
    await actionsChannel.send(this.setImportantMessage(`${bountyPlacer.name} just put a bounty of ${amount} gold on ${bountyRecipient.name}'s head!`));

    return author.send(`Bounty of ${amount} placed on ${bountyRecipient.name}'s head!`);
  }

  async playerEventLog(params) {
    const { author, amount } = params;
    const playerLog = await this.Database.loadActionLog(author);
    if (playerLog.log) {
      return this.generateLog(playerLog.log, amount);
    }
  }

  async playerPvpLog(params) {
    const { author, amount } = params;
    const playerLog = await this.Database.loadPvpLog(author);
    if (playerLog.log) {
      return this.generateLog(playerLog.log, amount);
    }
  }

  async modifyPM(params) {
    const { author, value } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (!loadedPlayer) {
      return author.send('Please set this after you have been born');
    }

    if (loadedPlayer.isPrivateMessage === value) {
      return author.send('Your PM preference is already set to this value.');
    }
    loadedPlayer.isPrivateMessage = value;

    await this.Database.savePlayer(loadedPlayer);

    return author.send(`Preference for being PMed has been set to ${value}.`);
  }

  async modifyMention(params) {
    const { author, value } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (!loadedPlayer) {
      return author.send('Please set this after you have been born');
    }

    if (loadedPlayer.isMentionInDiscord === value) {
      return author.send('Your @mention preference is already set to this value.');
    }
    loadedPlayer.isMentionInDiscord = value;
    await this.Database.savePlayer(loadedPlayer);

    return author.send('Preference for being @mention has been updated.');
  }

  // TODO: Block if current or changing server has bless active
  async setServer(params) {
    const { Bot, author, value, confirmation } = params;
    if (!confirmation && value === guildID) {
      return author.send('Your character will be reset if joining the official server. Type `!setServer <Official Server ID> true` to confirm being reset.');
    }
    const loadedPlayer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (value === loadedPlayer.guildId) {
      return author.send('Your primary server is already set to this.');
    }
    if (!confirmation && value !== guildID && loadedPlayer.equipment.relic.name !== 'Nothing') {
      return author.send('Your character has a relic that may only exist in this server. If you would like to continue changing servers, type `!setServer <Server ID> true` to confirm. *This will destroy your relic!*');
    }
    let count = 0;
    await Bot.guilds.cache.forEach(guild => guild.members.cache.get(author.id) ? count++ : count);
    if (count <= 1) {
      return author.send('You must be in more than one server with this bot in order to change primary servers.');
    }
    const guildToSet = await Bot.guilds.cache.get(value);
    if (!guildToSet) {
      return author.send('No server found with that ID.');
    }
    const memberInGuild = await guildToSet.members.cache.get(author.id);
    if (!memberInGuild) {
      return author.send('You\'re not in this server.');
    }
    if (confirmation && value === guildID) {
      await this.Database.deletePlayer(author.id);
      await this.Database.createNewPlayer(author.id, value, loadedPlayer.name);
    } else {
      loadedPlayer.guildId = value;
      await this.Database.savePlayer(loadedPlayer);
    }

    return author.send(`Primary server set to ${guildToSet.name}`);
  }

  async modifyServerPrefix(params) {
    const { Bot, author, value, guildId } = params;
    try {
      const loadedConfig = await this.Database.loadGame(guildId);
      loadedConfig.commandPrefix = value;
      await this.Database.updateGame(guildId, loadedConfig);
      author.send(`Changed server ${guildId} command prefix to ${value}.`);
      const server = await Bot.guilds.cache.get(guildId);
      const faqChannel = await server.channels.cache.find(channel => channel.name === 'faq' && channel.type === 'text' && channel.parent.name === 'Idle-RPG');
      const faqMessage = await faqChannel.messages.fetch();
      // TODO move FAQ message somewhere else so I dont have to look everywhere to update these messages
      await faqMessage.array()[0].edit(`
• **I'm not born yet, what should I do?**
Once an event is fired for your character you will be born.

• **How do I play?**
As long as you are in the online list you will be playing the game. Does not matter what status you set as long as you are not "Invisible".

• **Will my character be reset?**
The game is in super early development right now so resets are expected. Once the game is complete resets will most likely be a yearly thing with leaderboards.

• **How can I help with the development?**
Suggestions are always welcome, if you have experience with NodeJS you're welcome to become a contributor and develop along side with us!
You can also support with development by becoming a patron! Keep in mind that you will not gain any advantage over the others and its simply a method of showing your support to the developer!
Command: ${value}patreon

• **My event counter goes up but I did not see anything in the event channels**
There are some events such as luck events which fail. When they do it does not print anything but your event counter goes up.

• **Is there a way to turn off all the spam from events?**
Yes, you can right click the channel to mute and select the mute checkbox.

• **Is this open source?**
Yes, <https://github.com/sizzlorox/Idle-RPG-Bot>

• **Do you guys have a trello board?**
Yes, <https://trello.com/b/OnpWqvlp/idle-rpg>

• **Can I control my character?**
No.

• **What's the command prefix for this bot?**
The prefix is ${value} (eg: ${value}help).

• **Can I host this in my server?**
There's a command to get the invite link ${value}invite`);

      return true;
    } catch (err) {
      errorLog.error(err);

      return false;
    }
  }

  async modifyGender(params) {
    const { author, value } = params;
    const loadedPlayer = await this.Database.loadPlayer(author.id, { pastEvents: 0, pastPvpEvents: 0 });
    if (!loadedPlayer) {
      return author.send('Please set this after you have been born');
    }

    if (loadedPlayer.gender === value) {
      return author.send('Your gender is already set to this value.');
    }
    loadedPlayer.gender = value;
    await this.Database.savePlayer(loadedPlayer);

    return author.send('Gender has been updated.');
  }

  async resetLotteryPlayers(params) {
    const { author, recipient } = params;
    await this.Database.removeLotteryPlayers(recipient);
    return author.send('Done');
  }

  setPlayerBounty(params) {
    const { recipient, amount } = params;
    return this.Database.loadPlayer(recipient, { pastEvents: 0, pastPvpEvents: 0 })
      .then((player) => {
        player.currentBounty = amount;
        return this.Database.savePlayer(player);
      });
  }

  setPlayergold(params) {
    const { recipient, amount } = params;
    return this.Database.loadPlayer(recipient, { pastEvents: 0, pastPvpEvents: 0 })
      .then((player) => {
        player.gold.current = Number(amount);
        player.gold.total += Number(amount);
        return this.Database.savePlayer(player);
      });
  }

  deletePlayer(params) {
    const { recipient } = params;
    return this.Database.deletePlayer(recipient);
  }

  giveGold(params) {
    const { recipient, amount } = params;
    return this.Database.loadPlayer(recipient, { pastEvents: 0, pastPvpEvents: 0 })
      .then((updatingPlayer) => {
        updatingPlayer.gold.current += Number(amount);
        updatingPlayer.gold.total += Number(amount);
        this.Database.savePlayer(updatingPlayer);
      });
  }

  getStolenEquip(params) {
    const { recipient } = params;
    return this.Database.getStolenEquip(recipient);
  }

  async sendPreEventMessage(params) {
    const { Bot, author, whichHoliday, whichMessage } = params;
    switch (whichMessage) {
      case 'preevent':
      case 'secondpreevent':
        const message = holidays[whichHoliday].messages[whichMessage];
        if (message) {
          await Bot.guilds.cache.forEach(guild => guild.channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text').send(message));
          return author.send(`Holiday ${whichHoliday} ${whichMessage} message sent`);
        }

        return author.send(`Holiday ${whichHoliday} ${whichMessage} message failed to send`);
      default:
        return author.send(`Holiday ${whichHoliday} ${whichMessage} message failed to send`);
    }
  }

  // TODO change to utilize setTimeout
  async updateHoliday(params) {
    const { Bot, author, whichHoliday, isStarting } = params;
    if (isStarting) {
      await this.MonsterManager.monsters.forEach((mob) => {
        if (mob.holiday === whichHoliday) {
          mob.isSpawnable = true;
        }
      });
      await this.ItemManager.items.forEach((type) => {
        type.forEach((item) => {
          if (item.holiday === whichHoliday) {
            item.isDroppable = true;
          }
        });
      });

      const message = holidays[whichHoliday].messages.holidaystart;
      if (message) {
        await Bot.guilds.cache.forEach(guild => guild.channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text').send(message));
        return author.send(`Holiday ${whichHoliday} start message sent`);
      }

      return author.send(`Holiday ${whichHoliday} start message failed to send`);
    }

    await this.MonsterManager.monsters.forEach((mob) => {
      if (mob.holiday === whichHoliday) {
        mob.isSpawnable = false;
      }
    });
    await this.ItemManager.items.forEach((type) => {
      type.forEach((item) => {
        if (item.holiday === whichHoliday) {
          item.isDroppable = false;
        }
      });
    });
    const message = holidays[whichHoliday].messages.holidayend;
    if (message) {
      await Bot.guilds.cache.forEach(guild => guild.channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text').send(message));
      return author.send(`Holiday ${whichHoliday} end message sent`);
    }

    return author.send(`Holiday ${whichHoliday} end message failed to send`);
  }

  async resetPlayers(params) {
    const { Bot, author, guildId } = params;
    const guild = await Bot.guilds.cache.get(guildId);
    if (!guild) {
      return author.send('No guild with that id');
    }
    const leaderboardChannel = await guild.channels.cache.find(channel => channel.name === 'leaderboards' && channel.type === 'text');
    const announcementChannel = await guild.channels.cache.find(channel => channel.name === 'announcements' && (channel.type === 'text' || channel.type === 'news'));
    const actionChannel = await guild.channels.cache.find(channel => channel.name === 'actions' && channel.type === 'text');
    const movementChannel = await guild.channels.cache.find(channel => channel.name === 'movement' && channel.type === 'text');
    let resetMsg = '';
    let messagePromises = [];
    if (leaderboardChannel) {
      const leaderboardMessages = await leaderboardChannel.messages.fetch({ limit: 10 });
      if (leaderboardMessages.size > 0) {
        const messages = leaderboardMessages.array();
        messages.forEach(msg => {
          resetMsg = resetMsg.concat(`${msg.content}\n`);
          messagePromises.push(msg.delete());
        });
      }
      resetMsg = resetMsg.concat('Server has been reset! Good luck to all Idlers!');
    }

    const defaultConfig = {
      multiplier: 1,
      spells: {
        activeBless: 0
      },
      dailyLottery: {
        prizePool: 1500
      }
    };

    const lotteryChannel = await guild.channels.cache.get(enumHelper.channels.lottery);
    if (lotteryChannel) {
      let lotteryMessages = await lotteryChannel.messages.fetch({ limit: 10 });
      lotteryMessages = await lotteryMessages.sort((message1, message2) => message1.createdTimestamp - message2.createdTimestamp);
      if (lotteryMessages.size <= 0) {
        await lotteryChannel.send('Idle-RPG Lottery - You must pay 100 gold to enter! PM me `!lottery` to join');
        await lotteryChannel.send(`Current lottery prize pool: ${defaultConfig.dailyLottery.prizePool}`);
        await lotteryChannel.send('Contestants:');
      } else {
        await lotteryMessages.array()[0].edit('Idle-RPG Lottery - You must pay 100 gold to enter! PM me `!lottery` to join');
        await lotteryMessages.array()[1].edit(`Current lottery prize pool: ${defaultConfig.dailyLottery.prizePool}`);
        await lotteryMessages.array()[2].edit('Contestants:');
      }
    }

    await this.Database.resetAllPlayersInGuild(guildId);
    await this.Database.resetAllLogs(guildId);
    await this.Database.updateGame(guildId, defaultConfig);
    await this.Database.removeLotteryPlayers(guildId);
    if (announcementChannel) {
      if (messagePromises.length) {
        await Promise.all(messagePromises)
          .then(announcementChannel.send(resetMsg));
      } else {
        await announcementChannel.send(resetMsg);
      }
    }
    if (actionChannel) {
      await actionChannel.send('```RESET -----------------------------------```');
    }
    if (movementChannel) {
      await movementChannel.send('```RESET -----------------------------------```');
    }
    return author.send('Reset complete...');
  }

}
module.exports = Commands;
