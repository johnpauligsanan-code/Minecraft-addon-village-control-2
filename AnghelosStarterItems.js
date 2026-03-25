import { world, ItemStack, system } from "@minecraft/server";
export class AnghelosStarterItems {
    constructor() {
        // Configuration: Define the items to give to new players
        this.STARTER_ITEMS = [
			{ itemId: "minecraft:iron_axe", amount: 1 },
            { itemId: "minecraft:stone_pickaxe", amount: 1 },
			{ itemId: "minecraft:stone_shovel", amount: 1 },
			{ itemId: "anghelos:guide", amount: 1 },
			{ itemId: "anghelos:village_controller_placer", amount: 1 },
			{ itemId: "minecraft:leather_helmet", amount: 1 },
            { itemId: "minecraft:leather_chestplate", amount: 1 },
            { itemId: "minecraft:leather_leggings", amount: 1 },
            { itemId: "minecraft:leather_boots", amount: 1 }
        ];
        // Tag used to track if a player has received their starter items
        this.RECEIVED_ITEMS_TAG = "AnghelosStartPack";
        // Cooldown to prevent processing multiple join events at once
        this.isProcessing = false;
        this.processingTimeout = null;
    }
    initialize() {
        // Listen for players joining the world
        world.afterEvents.playerJoin.subscribe(() => {
            // If we're already processing, skip (avoids multiple simultaneous processing)
            if (this.isProcessing) {
                return;
            }
            
            // Set processing flag
            this.isProcessing = true;
            
            // Clear any existing timeout to prevent race conditions
            if (this.processingTimeout) {
                system.clearRun(this.processingTimeout);
            }
            
            // Use a timeout to let the player fully join
            this.processingTimeout = system.runTimeout(() => {
                this.checkNewPlayers();
                this.isProcessing = false;
                this.processingTimeout = null;
            }, 200); // 10 seconds (200 ticks)
        });
    }
    checkNewPlayers() {
        try {
            // Get all players in the world
            const players = world.getAllPlayers();
            
            for (const player of players) {
                // Check if player already has the tag
                if (player.hasTag(this.RECEIVED_ITEMS_TAG)) {
                    continue;
                }
                
                // Give starter items to the player
                this.giveStarterItems(player);
                
                // Mark that the player has received their items
                player.addTag(this.RECEIVED_ITEMS_TAG);
                
                // Send a welcome message
                player.sendMessage("§a§lWelcome to Rule Villages addon! §r§eYou've received a starter pack!");
            }
        } catch (error) {
            console.error("Error checking players for starter items:", error);
        }
    }
    // Function to give starter items to a player
    giveStarterItems(player) {
        try {
            const inventory = player.getComponent("minecraft:inventory");
            if (!inventory || !inventory.container) {
                return;
            }
            
            const container = inventory.container;
            
            for (const item of this.STARTER_ITEMS) {
                // Create the item stack
                const itemStack = new ItemStack(item.itemId, item.amount);
                
                // Aggiungi l'item all'inventario del giocatore
                container.addItem(itemStack);
            }
        } catch (error) {
            console.error("Error in giveStarterItems:", error);
        }
    }
}