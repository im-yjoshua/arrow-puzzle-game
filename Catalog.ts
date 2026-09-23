export type ItemType = 'skin' | 'blockTheme' | 'background';
export type ItemRarity = 'common' | 'rare' | 'epic' | 'mythic';

export interface CatalogItem {
  id: string;
  name: string;
  type: ItemType;
  rarity: ItemRarity;
  price: number;
  image: any;
}

export const CATALOG: CatalogItem[] = [
  // Common Tier (100 - 150 Coins)
  { id: 'item_1', name: 'Sleepy Ginger Cat', type: 'skin', rarity: 'common', price: 100, image: require('./assets/images/item_1.png') },
  { id: 'item_2', name: 'Cozy Hot Cocoa', type: 'skin', rarity: 'common', price: 100, image: require('./assets/images/item_2.png') },
  { id: 'item_3', name: 'String of Pearls', type: 'skin', rarity: 'common', price: 100, image: require('./assets/images/item_3.png') },
  { id: 'item_4', name: 'Picnic Basket', type: 'skin', rarity: 'common', price: 120, image: require('./assets/images/item_4.png') },
  { id: 'item_5', name: 'Pastel Camera', type: 'skin', rarity: 'common', price: 120, image: require('./assets/images/item_5.png') },
  { id: 'item_6', name: 'Study Books', type: 'skin', rarity: 'common', price: 150, image: require('./assets/images/item_6.png') },
  { id: 'item_7', name: 'Curled Corgi', type: 'skin', rarity: 'common', price: 150, image: require('./assets/images/item_7.png') },
  { id: 'item_8', name: 'Frosted Donut', type: 'skin', rarity: 'common', price: 150, image: require('./assets/images/item_8.png') },

  // Rare Tier (250 - 350 Coins)
  { id: 'item_9', name: 'Desk Zen Garden', type: 'skin', rarity: 'rare', price: 250, image: require('./assets/images/item_9.png') },
  { id: 'item_10', name: 'Moss Terrarium', type: 'skin', rarity: 'rare', price: 250, image: require('./assets/images/item_10.png') },
  { id: 'item_11', name: 'Pastel Yarn Ball', type: 'skin', rarity: 'rare', price: 280, image: require('./assets/images/item_11.png') },
  { id: 'item_12', name: 'Matcha Boba Cup', type: 'skin', rarity: 'rare', price: 300, image: require('./assets/images/item_12.png') },
  { id: 'item_13', name: 'Log Cabin Birdhouse', type: 'skin', rarity: 'rare', price: 320, image: require('./assets/images/item_13.png') },
  { id: 'item_14', name: 'Lo-Fi Turntable', type: 'skin', rarity: 'rare', price: 350, image: require('./assets/images/item_14.png') },
  { id: 'item_15', name: 'Napping Red Panda', type: 'skin', rarity: 'rare', price: 350, image: require('./assets/images/item_15.png') },

  // Epic Tier (Chest Drops / 500 Coins)
  { id: 'item_16', name: 'Yellow Raincoat', type: 'skin', rarity: 'epic', price: 500, image: require('./assets/images/item_16.png') },
  { id: 'item_17', name: 'Fresh Strawberries', type: 'skin', rarity: 'epic', price: 500, image: require('./assets/images/item_17.png') },
];