// BASE
const { aggregation } = require('../../../Base/Util');
const BaseGame = require('../../../Base/Game');
const BaseHelper = require('../../../Base/Helper');

// UTILS
const { errorLog } = require('../../../../utils/logger');

// DATA
const enumHelper = require('../../../../utils/enumHelper');

class Town extends aggregation(BaseGame, BaseHelper) {

  constructor(params) {
    super();
    const {
      Database,
      ItemManager,
      InventoryManager
    } = params;
    this.Database = Database;
    this.ItemManager = ItemManager;
    this.InventoryManager = InventoryManager;
  }

  async sell(playerObj) {
    const updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      if (updatedPlayer.inventory.equipment.length > 0) {
        let profit = 0;
        updatedPlayer.inventory.equipment.forEach((equipment) => {
          profit += Number(equipment.gold);
        });
        updatedPlayer.inventory.equipment.length = 0;
        profit = Math.floor(profit);
        updatedPlayer.gold.current += profit;
        updatedPlayer.gold.total += profit;

        eventMsg.push(`[\`${updatedPlayer.map.name}\`] ${this.generatePlayerName(updatedPlayer, true)} just sold what they found adventuring for ${profit} gold!`);
        eventLog.push(`Made ${profit} gold selling what you found adventuring`);
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

  async generateItemEvent(playerObj) {
    let updatedPlayer = Object.assign({}, playerObj);
    const eventMsg = [];
    const eventLog = [];
    try {
      const item = await this.ItemManager.generateItem(updatedPlayer);
      const itemCost = Math.round(item.gold);
      if (updatedPlayer.gold.current <= itemCost || item.name.startsWith('Cracked')) {
        return {
          updatedPlayer
        };
      }

      if (item.position !== enumHelper.inventory.position) {
        // updatedPlayer.equipment[item.position].position = enumHelper.equipment.types[item.position].position;
        const oldItemRating = await this.calculateItemRating(updatedPlayer, updatedPlayer.equipment[item.position]);
        const newItemRating = await this.calculateItemRating(updatedPlayer, item);
        if (oldItemRating >= newItemRating) {
          return {
            updatedPlayer
          };
        }

        updatedPlayer.gold.current -= itemCost;
        updatedPlayer = await this.setPlayerEquipment(updatedPlayer, enumHelper.equipment.types[item.position].position, item);
      } else if (updatedPlayer.inventory.items.length >= enumHelper.inventory.maxItemAmount) {
        return {
          updatedPlayer,
        };
      } else {
        updatedPlayer.gold.current -= itemCost;
        updatedPlayer = await this.InventoryManager.addItemIntoInventory(updatedPlayer, item);
      }

      eventMsg.push(`[\`${updatedPlayer.map.name}\`] ${this.generatePlayerName(updatedPlayer, true)} just purchased \`${item.name}\` for ${itemCost} gold!`);
      eventLog.push(`Purchased ${item.name} from Town for ${itemCost} Gold`);
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
}
module.exports = Town;
