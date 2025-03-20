// BASE
const { aggregation } = require('../../../Base/Util');
const BaseGame = require('../../../Base/Game');
const BaseHelper = require('../../../Base/Helper');

// UTILS
const { errorLog } = require('../../../../utils/logger');

// DATA
const enumHelper = require('../../../../utils/enumHelper');
const { maximumTimer } = require('../../../../../settings');

class Luck extends aggregation(BaseGame, BaseHelper) {

  constructor(params) {
    super();
    const { Database, SpellManager, ItemManager, InventoryManager } = params;
    this.Database = Database;
    this.SpellManager = SpellManager;
    this.ItemManager = ItemManager;
    this.InventoryManager = InventoryManager;
  }

  async godsEvent(playerObj) {
    const updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const luckEvent = this.randomBetween(1, 7);
      switch (luckEvent) {
        case 1:
          const luckExpAmount = this.randomBetween(5, 15 + (updatedPlayer.level * 2));
          updatedPlayer.experience.current -= luckExpAmount;
          updatedPlayer.experience.lost += luckExpAmount;
          if (updatedPlayer.experience.current < 0) {
            updatedPlayer.experience.current = 0;
          }
          eventMsg.push(`Hades unleashed his wrath upon ${this.generatePlayerName(updatedPlayer, true)} making ${this.generateGenderString(updatedPlayer, 'him')} lose ${luckExpAmount} experience!`);
          eventLog.push(`Hades unleashed his wrath upon you making you lose ${luckExpAmount} experience`);
          break;

        case 2:
          const luckHealthAmount = this.randomBetween(5, 50 + (updatedPlayer.level * 2));
          updatedPlayer.health -= luckHealthAmount;
          eventMsg.push(`${this.generatePlayerName(updatedPlayer, true)} was struck down by a thunderbolt from Zeus and lost ${luckHealthAmount} health because of that!`);
          eventLog.push(`Zeus struck you down with his thunderbolt and you lost ${luckHealthAmount} health`);
          break;

        case 3:
          const healthDeficit = (100 + (updatedPlayer.level * 5)) - updatedPlayer.health;
          if (healthDeficit) {
            const healAmount = Math.round(healthDeficit / 3);
            eventMsg.push(`Fortune smiles upon ${this.generatePlayerName(updatedPlayer, true)} as Aseco cured ${this.generateGenderString(updatedPlayer, 'his')} sickness and restored ${this.generateGenderString(updatedPlayer, 'him')} ${healAmount} health!`);
            eventLog.push(`Aseco healed you for ${healAmount}`);
            updatedPlayer.health += healAmount;
            break;
          }
          eventMsg.push(`Aseco gave ${this.generatePlayerName(updatedPlayer, true)} an elixir of life but it caused no effect on ${this.generateGenderString(updatedPlayer, 'him')}. Actually it tasted like wine!`);
          eventLog.push('Aseco wanted to heal you, but you had full health');
          break;

        case 4:
          const goldTaken = Math.ceil(updatedPlayer.gold.current / 6);
          if (updatedPlayer.gold.current < goldTaken || goldTaken === 0) {
            eventMsg.push(`Hermes demanded some gold from ${this.generatePlayerName(updatedPlayer, true)} but as ${this.generateGenderString(updatedPlayer, 'he')} had no money, Hermes left him alone.`);
            eventLog.push('Hermes demanded gold from you but you had nothing to give');
            break;
          }
          eventMsg.push(`Hermes took ${goldTaken} gold from ${this.generatePlayerName(updatedPlayer, true)} by force. Probably he is just out of humor.`);
          eventLog.push(`Hermes took ${goldTaken} gold from you. It will be spent in favor of Greek pantheon. He promises!`);
          updatedPlayer.gold.current -= goldTaken;
          updatedPlayer.gold.lost += goldTaken;
          if (updatedPlayer.gold.current < 0) {
            updatedPlayer.gold.current = 0;
          }
          break;

        case 5:
          const luckExpAthena = this.randomBetween(5, 15 + (updatedPlayer.level * 2));
          updatedPlayer.experience.current += luckExpAthena;
          updatedPlayer.experience.total += luckExpAthena;
          eventMsg.push(`Athena shared her wisdom with ${this.generatePlayerName(updatedPlayer, true)} making ${this.generateGenderString(updatedPlayer, 'him')} gain ${luckExpAthena} experience!`);
          eventLog.push(`Athena shared her wisdom with you making you gain ${luckExpAthena} experience`);
          const checkedExp = await this.checkExperience(updatedPlayer, eventMsg, eventLog);
          return {
            type: 'actions',
            updatedPlayer: checkedExp.updatedPlayer,
            msg: checkedExp.msg,
            pm: checkedExp.pm
          };

        case 6:
          const spell = await this.SpellManager.generateSpell(updatedPlayer);
          if (updatedPlayer.spells.length > 0) {
            let shouldAddToList = false;
            await updatedPlayer.spells.forEach((ownedSpell, index) => {
              const spellName = ownedSpell.name.split(/ (.+)/)[1];
              if (spell.power > ownedSpell.power) {
                if (spell.name.includes(spellName)) {
                  updatedPlayer.spells.splice(index, 1);
                  shouldAddToList = true;
                } else {
                  shouldAddToList = true;
                }
              }
            });

            if (shouldAddToList) {
              updatedPlayer.spells.push(spell);
              eventMsg.push(`Eris has given ${this.generatePlayerName(updatedPlayer, true)} a scroll containing \`${spell.name}\` to add to ${this.generateGenderString(updatedPlayer, 'his')} spellbook!`);
              eventLog.push(`Eris gave you a scroll of ${spell.name}`);
              break;
            }
          } else {
            updatedPlayer.spells.push(spell);
            eventMsg.push(`Eris has given ${this.generatePlayerName(updatedPlayer, true)} a scroll containing \`${spell.name}\` to add to ${this.generateGenderString(updatedPlayer, 'his')} spellbook!`);
            eventLog.push(`Eris gave you a scroll of ${spell.name}`);
            break;
          }
          return { updatedPlayer };

        case 7:
          // Might overwrite his event if currently saving if he fired and event at the same time.
          const increaseMult = this.randomBetween(1, 3);
          const timeLimit = this.randomBetween(maximumTimer * 60000, (maximumTimer * 15) * 60000);
          eventMsg.push(`Dionysus has partied with ${this.generatePlayerName(updatedPlayer, true)} increasing ${this.generateGenderString(updatedPlayer, 'his')} multiplier by ${increaseMult} for ${Math.floor(timeLimit / 60000)} minutes!`);
          eventLog.push(`Dionysus partied with you increasing your multiplier by ${increaseMult} for ${Math.ceil(timeLimit / 60000)} minutes!`);
          updatedPlayer.personalMultiplier = increaseMult;
          setTimeout(() => {
            this.Database.loadPlayer(updatedPlayer.discordId)
              .then((loadedPlayer) => {
                loadedPlayer.personalMultiplier = 0;
                return loadedPlayer;
              })
              .then(loadedPlayer => this.Database.savePlayer(loadedPlayer));
          }, timeLimit);
          break;
      }

      await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);
      return {
        type: 'actions',
        updatedPlayer,
        msg: eventMsg,
        pm: eventLog
      };
    } catch (err) {
      errorLog.error(err);
    }
  }

  async itemEvent(playerObj) {
    let updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const item = await this.ItemManager.generateItem(updatedPlayer);
      const generatedItemMsg = await this.randomItemEventMessage(updatedPlayer, item);
      eventMsg.push(generatedItemMsg.eventMsg);
      eventLog.push(generatedItemMsg.eventLog);
      if (item.position !== enumHelper.inventory.position) {
        const oldItemRating = await this.calculateItemRating(updatedPlayer, updatedPlayer.equipment[item.position]);
        const newItemRating = await this.calculateItemRating(updatedPlayer, item);
        if (oldItemRating > newItemRating) {
          updatedPlayer = await this.InventoryManager.addEquipmentIntoInventory(updatedPlayer, item);
        } else {
          updatedPlayer = await this.setPlayerEquipment(updatedPlayer, item.position, item);
        }
      } else {
        updatedPlayer = await this.InventoryManager.addItemIntoInventory(updatedPlayer, item);
      }
      await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

      return {
        type: 'actions',
        updatedPlayer,
        msg: eventMsg,
        pm: eventLog
      };
    } catch (err) {
      errorLog.error(err);
    }
  }

  async gamblingEvent(playerObj) {
    const updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const luckGambleChance = this.randomBetween(0, 99);
      const luckGambleGold = Math.floor(2 * ((Math.log(updatedPlayer.gold.current) * updatedPlayer.gold.current) / 100));
      if (updatedPlayer.gold.current < luckGambleGold) {
        return { updatedPlayer };
      }
      updatedPlayer.gambles++;
      if (luckGambleChance <= 50 - (updatedPlayer.stats.luk / 4)) {
        const gambleMsg = await this.randomGambleEventMessage(updatedPlayer, luckGambleGold, false);
        eventMsg.push(gambleMsg.eventMsg);
        eventLog.push(gambleMsg.eventLog);
        updatedPlayer.gold.current -= luckGambleGold;
        updatedPlayer.gold.gambles.lost += luckGambleGold;
        if (updatedPlayer.gold.current <= 0) {
          updatedPlayer.gold.current = 0;
        }
        await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

        return {
          type: 'actions',
          updatedPlayer,
          msg: eventMsg,
          pm: eventLog
        };
      }
      const gambleMsg = await this.randomGambleEventMessage(updatedPlayer, luckGambleGold, true);
      eventMsg.push(gambleMsg.eventMsg);
      eventLog.push(gambleMsg.eventLog);
      updatedPlayer.gold.current += luckGambleGold;
      updatedPlayer.gold.total += luckGambleGold;
      updatedPlayer.gold.gambles.won += luckGambleGold;
      await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

      return {
        type: 'actions',
        updatedPlayer,
        msg: eventMsg,
        pm: eventLog
      };
    } catch (err) {
      errorLog.error(err);
    }
  }

  async questEvent(playerObj, mob, isCommand) {
    const updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    if (!updatedPlayer.quest.questMob.name.includes('None') && !isCommand) {
      return { updatedPlayer };
    }
    updatedPlayer.quest.questMob.name = mob;
    updatedPlayer.quest.questMob.count = this.randomBetween(1, 15);
    updatedPlayer.quest.questMob.killCount = 0;
    updatedPlayer.quest.updated_at = new Date();
    eventMsg.push(`[\`${updatedPlayer.map.name}\`] Quest Master has asked ${this.generatePlayerName(updatedPlayer, true)} to kill ${updatedPlayer.quest.questMob.count === 1 ? 'a' : updatedPlayer.quest.questMob.count} ${mob}!`);
    eventLog.push(`Quest Master in ${updatedPlayer.map.name} asked you to kill ${updatedPlayer.quest.questMob.count === 1 ? 'a' : updatedPlayer.quest.questMob.count} ${mob}.`);
    await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

    return {
      type: 'actions',
      updatedPlayer,
      msg: eventMsg,
      pm: eventLog
    };
  }

  async goldEvent(playerObj, multiplier) {
    const updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const luckGoldChance = this.randomBetween(0, 99);
      if (luckGoldChance >= 75) {
        const luckGoldDice = this.randomBetween(5, 100);
        const goldAmount = await Math.round((luckGoldDice * updatedPlayer.stats.luk) / 2) * multiplier;
        updatedPlayer.gold.current += goldAmount;
        updatedPlayer.gold.total += goldAmount;
        eventMsg.push(`[\`${updatedPlayer.map.name}\`] ${this.generatePlayerName(updatedPlayer, true)} found ${goldAmount} gold!`);
        eventLog.push(`Found ${goldAmount} gold in ${updatedPlayer.map.name}`);
        await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

        return {
          type: 'actions',
          updatedPlayer,
          msg: eventMsg,
          pm: eventLog
        };
      }

      return { updatedPlayer };
    } catch (err) {
      errorLog.error(err);
    }
  }

  async catchSnowFlake(playerObj, snowFlake) {
    let updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const snowFlakeDice = this.randomBetween(0, 99);
      if (snowFlakeDice <= 5) {
        const oldItemRating = await this.calculateItemRating(updatedPlayer, updatedPlayer.equipment.relic);
        const newItemRating = await this.calculateItemRating(updatedPlayer, snowFlake);
        if (oldItemRating < newItemRating) {
          eventMsg.push(`<@!${updatedPlayer.discordId}> **just caught a strange looking snowflake within the blizzard!**`);
          eventLog.push('You caught a strange looking snowflake while travelling inside the blizzard.');
          updatedPlayer = await this.setPlayerEquipment(updatedPlayer, enumHelper.equipment.types.relic.position, snowFlake);
          await this.logEvent(updatedPlayer, this.Database, eventLog, enumHelper.logTypes.action);

          return {
            type: 'actions',
            updatedPlayer,
            msg: eventMsg,
            pm: eventLog
          };
        }
      }

      return { updatedPlayer };
    } catch (err) {
      errorLog.error(err);
    }
  }

}
module.exports = Luck;