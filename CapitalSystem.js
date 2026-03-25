import { world, system, ItemStack, Player, EntityComponentTypes, EquipmentSlot } from "@minecraft/server";

export class CapitalSystem {
    constructor() {
        this.CAPITAL_PROPERTY_KEY = "player_capital_entity_id";
        // Aggiungiamo map per il cooldown e per segnare i giocatori in processazione
        this.isProcessing = new Map();
        this.lastInteractionTimes = new Map();
        // Cooldown in millisecondi (5 secondi)
        this.COOLDOWN = 15000;
    }

    initialize() {
        this._subscribeToCapitalEvents();
    }

    _subscribeToCapitalEvents() {
        // Subscribe to the capital assigned event
        system.afterEvents.scriptEventReceive.subscribe((eventData) => {
            // Check if this is our specific event
            if (eventData.id === "anghelos:capital_assigned_event") {
                // Non avviamo direttamente il processo, ma controlliamo prima il cooldown
                this._checkAndProcessCapitalEvent(eventData);
            }
        });
    }

    _checkAndProcessCapitalEvent(eventData) {
        try {
            // Get player name from the message and find player instance
            const playerName = eventData.message;
            const player = world.getAllPlayers().find(p => p.name === playerName);
            
            if (!player) {
                console.warn(`Player ${playerName} not found`);
                return;
            }
            
            // Verifica del cooldown
            const currentTime = Date.now();
            const lastTime = this.lastInteractionTimes.get(player.id) || 0;
            if (currentTime - lastTime <= this.COOLDOWN) {
                player.sendMessage("§cDo not spam the process!");
                return;
            }
            
            // Se c'è già un'esecuzione in corso per questo player, informa il giocatore
            if (this.isProcessing.get(player.id)) {
                player.sendMessage("§cCapital assignment proceding...WAIT!");
                return;
            }
            
            // Aggiorna il timestamp e imposta la flag di processazione
            this.lastInteractionTimes.set(player.id, currentTime);
            this.isProcessing.set(player.id, true);
            
            // Esegui il lavoro in modo asincrono con il generatore
            const jobId = system.runJob(this._handleCapitalAssignedEventGenerator(eventData, player));
            
        } catch (error) {
            console.error("Error checking capital event:", error);
            // Assicurati di resettare la flag in caso di errore
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }

    *_handleCapitalAssignedEventGenerator(eventData, player) {
        try {
            // Get the source entity (Capital)
            const capitalEntity = eventData.sourceEntity;
            if (!capitalEntity) {
                console.warn("Capital entity is null or undefined");
                this.isProcessing.delete(player.id);
                return;
            }

            // Check if player already has a capital assigned
            const currentCapitalId = player.getDynamicProperty(this.CAPITAL_PROPERTY_KEY);
            
            if (currentCapitalId) {
                // Cediamo il controllo alla CPU prima di iniziare la ricerca
                yield;
                
                // Try to find the existing capital entity (usando un altro generatore)
                const existingCapital = yield* this._findEntityByIdGenerator(currentCapitalId);
                
                if (existingCapital) {
                    // Capital still exists, reimburse the diamond block and inform player
                    this._givePlayerDiamondBlock(player);
                    player.sendMessage("§cYou already have a Capital!");
                    this.isProcessing.delete(player.id);
                    return;
                }
                // If we're here, the capital no longer exists, so proceed to assign a new one
            }

            // Save the capital entity ID to the player's properties
            this._saveCapitalToPlayer(player, capitalEntity);
            
            // Trigger an event on the capital entity
            capitalEntity.triggerEvent("anghelos:capital_linked");
            
            // Inform the player
            player.sendMessage("§aCapital linked successfully!");
            
        } catch (error) {
            console.error("Error in handling capital assigned event:", error);
            player.sendMessage("§cAn error has occurred linking the capital!");
        } finally {
            // Assicurati di resettare sempre la flag di processazione
            this.isProcessing.delete(player.id);
        }
    }

    _givePlayerDiamondBlock(player) {
        try {
            // Crea un diamond block come rimborso
            const diamondBlock = new ItemStack("minecraft:diamond_block", 1);
            // Aggiungi l'item all'inventario del giocatore
            const inventory = player.getComponent("minecraft:inventory");
            if (inventory) {
                inventory.container.addItem(diamondBlock);
            } else {
                // Metodo alternativo se il componente inventory non è disponibile
                player.dimension.spawnItem(diamondBlock, player.location);
            }
        } catch (error) {
            console.error(`Error giving diamond block to ${player.name}:`, error);
            // In caso di errore, spawna il blocco ai piedi del giocatore
            try {
                const diamondBlock = new ItemStack("minecraft:diamond_block", 1);
                player.dimension.spawnItem(diamondBlock, player.location);
            } catch (e) {
                console.error("Failed to spawn diamond block:", e);
            }
        }
    }

    _saveCapitalToPlayer(player, capitalEntity) {
        try {
            // Store the entity's unique ID as a property on the player
            player.setDynamicProperty(this.CAPITAL_PROPERTY_KEY, capitalEntity.id);
            console.warn(`Capital ID ${capitalEntity.id} saved to player ${player.name}`);
			const capital_tag = `${player.name}_capital`;
			capitalEntity.addTag(capital_tag);
        } catch (error) {
            console.error(`Error saving capital for ${player.name}:`, error);
        }
    }

    // Generatore asincrono per trovare un'entità tramite ID
    *_findEntityByIdGenerator(entityId) {
        // Try to find entity in all dimensions
        const dimensions = [
            world.getDimension("minecraft:overworld"),
            world.getDimension("minecraft:nether"),
            world.getDimension("minecraft:the_end")
        ];

        for (const dimension of dimensions) {
            // Cediamo il controllo tra una dimensione e l'altra
            yield;
            
            // Get all entities in the dimension
            const entities = dimension.getEntities();
            
            // Processa le entità in gruppi più piccoli per non sovraccaricare il server
            const batchSize = 50;
            for (let i = 0; i < entities.length; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                
                for (const entity of batch) {
                    if (entity.id === entityId) {
                        return entity;
                    }
                }
                
                // Cedi il controllo dopo ogni batch
                yield;
            }
        }
        return null; // Entity not found in any dimension
    }

    // Metodo classico (non asincrono) per trovare un'entità tramite ID
    // Utile per chiamate sincrone dove non è possibile usare generatori
    _findEntityById(entityId) {
        // Try to find entity in all dimensions
        const dimensions = [
            world.getDimension("minecraft:overworld"),
            world.getDimension("minecraft:nether"),
            world.getDimension("minecraft:the_end")
        ];

        for (const dimension of dimensions) {
            // Get all entities in the dimension
            const entities = dimension.getEntities();
            for (const entity of entities) {
                if (entity.id === entityId) {
                    return entity;
                }
            }
        }
        return null; // Entity not found in any dimension
    }

    // Public method to check if a player is currently being processed
    isPlayerBeingProcessed(player) {
        return this.isProcessing.has(player.id) && this.isProcessing.get(player.id);
    }

    // Public method to get a player's capital entity (metodo sincrono)
    getPlayerCapital(player) {
        const capitalId = player.getDynamicProperty(this.CAPITAL_PROPERTY_KEY);
        if (!capitalId) return null;
        
        return this._findEntityById(capitalId);
    }

    // Public method to check if a player's capital is still alive (sincrono)
    isPlayerCapitalAlive(player) {
        return this.getPlayerCapital(player) !== null;
    }

    // Public method to get a player's capital entity (asincrono con un callback)
    getPlayerCapitalAsync(player, callback) {
        const capitalId = player.getDynamicProperty(this.CAPITAL_PROPERTY_KEY);
        if (!capitalId) {
            callback(null);
            return;
        }
        
        // Avvia un job per trovare l'entità in modo asincrono
        const jobId = system.runJob(function* () {
            const capital = yield* this._findEntityByIdGenerator(capitalId);
            callback(capital);
        }.bind(this));
    }

    // Public method to clear a player's capital
    clearPlayerCapital(player) {
        player.setDynamicProperty(this.CAPITAL_PROPERTY_KEY, undefined);
    }
}

// Export a singleton instance
export const capitalSystem = new CapitalSystem();