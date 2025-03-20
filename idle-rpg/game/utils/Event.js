const enumHelper = require('../../utils/enumHelper');
const Battle = require('../utils/Battle');
const Monster = require('../utils/Monster');
const Item = require('../utils/Item');
const Inventory = require('../utils/Inventory');
const Spell = require('../utils/Spell');
const events = require('../data/events');
const { errorLog } = require('../../utils/logger');
const Map = require('../utils/Map');

class Event {

  constructor(Database, Helper, discordHook) {
    this.Helper = Helper;
    this.Database = Database;
    this.discordHook = discordHook;
    this.Battle = new Battle(Helper);

    // Managers
    this.MonsterManager = new Monster(Helper);
    this.ItemManager = new Item(Helper);
    this.MapManager = new Map(Helper);
    this.SpellManager = new Spell(Helper);
    this.InventoryManager = new Inventory();

    // Events
    this.isBlizzardActive = false;

    // Params
    this.params = {
      hook: this.discordHook,
      db: this.Database,
      helper: this.Helper
    };
  }

  // Move Events
  async moveEvent(updatedPlayer, multiplier) {
    try {
      const mapObj = await this.MapManager.moveToRandomMap(updatedPlayer);
      if (mapObj.map.name === updatedPlayer.map.name || mapObj.map.name === updatedPlayer.previousMap) {
        this.MapManager.getTowns().includes(updatedPlayer.map.name)
          ? this.generateQuestEvent(updatedPlayer)
          : this.attackEventMob(updatedPlayer, multiplier);
      }
      events.movement.movePlayer(this.params, updatedPlayer, mapObj);
    } catch (err) {
      errorLog.error(err);
    }
  }

  async attackEventPlayerVsPlayer(updatedPlayer, onlinePlayers, multiplier) {
    try {
      const mappedPlayers = await this.Database.getSameMapPlayers(updatedPlayer.map.name);
      const prepResults = await events.battle.pvpPreperation(this.params, updatedPlayer, mappedPlayers, onlinePlayers);
      const battleResults = prepResults.randomPlayer
        ? await this.Battle.newSimulateBattle(updatedPlayer, prepResults.randomPlayer)
        : await this.attackEventMob(updatedPlayer, multiplier);
      if (!battleResults.attacker) {
        return updatedPlayer;
      }
      const results = await events.battle.pvpResults(this.params, battleResults);
      if (!results.result) {
        return updatedPlayer;
      }
      switch (results.result) {
        case enumHelper.battle.outcomes.win:
          const winResults = await events.battle.steal(this.params, results.updatedAttacker, results.updatedDefender, this.InventoryManager);
          const updatedVictim = await this.Helper.checkHealth(this.params, this.MapManager, winResults.victimPlayer, winResults.stealingPlayer);
          await this.Database.savePlayer(updatedVictim.updatedPlayer.guildId, updatedVictim.updatedPlayer);
          return this.Helper.checkExperience(this.params, winResults.stealingPlayer);

        case enumHelper.battle.outcomes.fled:
          const fledUpdatedDefender = await this.Helper.checkExperience(this.params, results.updatedDefender);
          await this.Database.savePlayer(fledUpdatedDefender.updatedPlayer.guildId, fledUpdatedDefender.updatedPlayer);
          return this.Helper.checkExperience(this.params, results.updatedAttacker);

        case enumHelper.battle.outcomes.lost:
          const loseResults = await events.battle.steal(this.params, results.updatedDefender, results.updatedAttacker, this.InventoryManager);
          const lostUpdatedDefender = await this.Helper.checkExperience(this.params, loseResults.stealingPlayer);
          await this.Database.savePlayer(lostUpdatedDefender.updatedPlayer.guildId, lostUpdatedDefender.updatedPlayer);
          return this.Helper.checkHealth(this.params, this.MapManager, loseResults.victimPlayer, lostUpdatedDefender.updatedPlayer);
      }
    } catch (err) {
      errorLog.error(err);
    }
  }

  async attackEventMob(updatedPlayer, multiplier) {
    try {
      const mob = await this.MonsterManager.generateMonster(updatedPlayer);
      const simulatedBattle = await this.Battle.newSimulateBattle(updatedPlayer, mob);
      const battleResults = await events.battle.pveResults(this.params, simulatedBattle, multiplier);
      updatedPlayer = battleResults.updatedPlayer;
      switch (battleResults.result) {
        case enumHelper.battle.outcomes.win:
          const dropItemResults = await events.battle.dropItem(this.params, updatedPlayer, battleResults.updatedMob, this.ItemManager, this.InventoryManager);
          const checkedWinResults = await this.Helper.checkExperience(this.params, dropItemResults.updatedPlayer);
          return {
            type: 'actions',
            updatedPlayer: checkedWinResults.updatedPlayer,
            msg: battleResults.msg.concat(dropItemResults.msg ? `\n${dropItemResults.msg}` : '').concat(checkedWinResults.msg ? `\n${checkedWinResults.msg}` : ''),
            pmMsg: battleResults.pmMsg.concat(dropItemResults.pmMsg ? `\n${dropItemResults.pmMsg}` : '').concat(checkedWinResults.pmMsg ? `\n${checkedWinResults.pmMsg}` : '')
          };

        case enumHelper.battle.outcomes.fled:
          const checkedFledResults = await this.Helper.checkExperience(this.params, updatedPlayer);
          return {
            type: 'actions',
            updatedPlayer: checkedFledResults.updatedPlayer,
            msg: battleResults.msg.concat(checkedFledResults.msg ? `${checkedFledResults.msg}` : ''),
            pmMsg: battleResults.pmMsg.concat(checkedFledResults.pmMsg ? `\n${checkedFledResults.pmMsg}` : '')
          };

        case enumHelper.battle.outcomes.lost:
          const checkLostResults = await this.Helper.checkHealth(this.params, this.MapManager, updatedPlayer, battleResults.updatedMob);
          return {
            type: 'actions',
            updatedPlayer: checkLostResults.updatedPlayer,
            msg: battleResults.msg.concat(checkLostResults.msg ? `\n${checkLostResults.msg}` : ''),
            pmMsg: battleResults.pmMsg.concat(checkLostResults.pmMsg ? `\n${checkLostResults.pmMsg}` : '')
          };
      }
    } catch (err) {
      errorLog.error(err);
    }
  }

  // Item Events
  async generateTownItemEvent(updatedPlayer) {
    try {
      const item = await this.ItemManager.generateItem(updatedPlayer);
      events.town.item(this.params, updatedPlayer, item, this.InventoryManager);
    } catch (err) {
      errorLog.error(err);
    }
  }

  async sellInTown(updatedPlayer) {
    try {
      events.town.sell(this.params, updatedPlayer);
    } catch (err) {
      errorLog.error(err);
    }
  }

  async campEvent(updatedPlayer) {
    try {
      events.camp(this.params, updatedPlayer);
    } catch (err) {
      errorLog.error(err);
    }
  }

  async generateQuestEvent(updatedPlayer) {
    try {
      const mob = await this.MonsterManager.generateQuestMonster(updatedPlayer);
      events.town.quest(this.params, updatedPlayer, mob);
    } catch (err) {
      errorLog.error(err);
    }
  }

  // Luck Events
  async generateGodsEvent(updatedPlayer) {
    try {
      const luckEvent = await this.Helper.randomBetween(1, 7);
      switch (luckEvent) {
        case 1:
          events.luck.gods.hades(this.params, updatedPlayer);

        case 2:
          events.luck.gods.zeus(this.params, updatedPlayer);

        case 3:
          events.luck.gods.aseco(this.params, updatedPlayer);

        case 4:
          events.luck.gods.hermes(this.params, updatedPlayer);

        case 5:
          updatedPlayer = await events.luck.gods.athena(this.params, updatedPlayer);
          this.Helper.checkExperience(this.params, updatedPlayer);

        case 6:
          const spell = await this.SpellManager.generateSpell(updatedPlayer);
          events.luck.gods.eris(this.params, updatedPlayer, spell);

        case 7:
          events.luck.gods.dionysus(this.params, updatedPlayer);
      }
    } catch (err) {
      errorLog.error(err);
    }
  }

  async generateGoldEvent(updatedPlayer, multiplier) {
    try {
      events.luck.gold(this.params, updatedPlayer, multiplier);
    } catch (err) {
      errorLog.error(err);
    }
  }

  async generateLuckItemEvent(updatedPlayer) {
    try {
      const luckItemDice = await this.Helper.randomBetween(0, 99);
      if (luckItemDice <= 15 + (updatedPlayer.stats.luk / 4)) {
        const spell = await this.SpellManager.generateSpell(updatedPlayer);
        events.luck.item.spell(this.params, updatedPlayer, spell);
      } else if (luckItemDice <= 30 + (updatedPlayer.stats.luk / 4)) {
        const item = await this.ItemManager.generateItem(updatedPlayer);
        events.luck.item.item(this.params, updatedPlayer, item, this.InventoryManager);
      }

      return updatedPlayer;
    } catch (err) {
      errorLog.error(err);
    }
  }

  async generateGamblingEvent(updatedPlayer) {
    try {
      events.luck.gambling(this.params, updatedPlayer);
    } catch (err) {
      errorLog.error(err);
    }
  }

  /**
   * EVENT FUNCTIONS
   */
  blizzardSwitch(blizzardSwitch) {
    switch (blizzardSwitch) {
      case 'on':
        if (this.isBlizzardActive) {
          return this.isBlizzardActive;
        }

        this.isBlizzardActive = true;
        this.Helper.sendMessage(this.discordHook, undefined, false, '\`\`\`python\n\'Heroes, sit near a fireplace at your home or take a beer with your friends at the inn. It\`s better to stay in cozy place as lots of heroes are in the midst of a violent snowstorm across the lands fighting mighty Yetis!\'\`\`\`');
        return this.isBlizzardActive;
      case 'off':
        if (!this.isBlizzardActive) {
          return this.isBlizzardActive;
        }

        this.isBlizzardActive = false;
        this.Helper.sendMessage(this.discordHook, undefined, false, '\`\`\`python\n\'It seems that blizzard has ended, you can safely travel to other realms. Do not walk away from the road as evil creatures may wait for you in dark forests!\'\`\`\`');
        return this.isBlizzardActive;
    }
  }

  blizzardRandom() {
    if (!this.isBlizzardActive) {
      this.isBlizzardActive = true;
      setTimeout(() => {
        this.isBlizzardActive = false;
      }, this.Helper.randomBetween(7200000, 72000000)); // 2-20hrs
    }
  }

  async chanceToCatchSnowflake(updatedPlayer) {
    try {
      const snowFlake = await this.ItemManager.generateSnowflake(updatedPlayer);
      events.special.snowFlake(this.params, updatedPlayer, snowFlake);
    } catch (err) {
      errorLog.error(err);
    }
  }

  /**
   * GETTER SETTERS
   */
  get MonsterClass() {
    return this.MonsterManager;
  }

  get ItemClass() {
    return this.ItemManager;
  }

  get MapClass() {
    return this.MapManager;
  }

  get SpellClass() {
    return this.SpellManager;
  }

}
module.exports = Event;
