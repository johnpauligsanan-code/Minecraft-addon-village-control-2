import { world, system, EquipmentSlot, ItemStack, Player, EntityComponentTypes } from "@minecraft/server";

export class AnghelosTreeCapitator {
    constructor() {
        this.isProcessing = new Map();
        this.lastInteractionTimes = new Map();
        this.COOLDOWN = 1500;
        
        // Configurazioni generali per i vari tipi di albero
        this.blockRanges = {
            "minecraft:jungle_log": { x: 5, z: 5, y: 35 },
            "minecraft:mangrove_log": { x: 5, z: 5, y: 35 },
            "minecraft:cherry_log": { x: 5, z: 5, y: 20 },
            "minecraft:acacia_log": { x: 3, z: 3, y: 20 },
            "minecraft:dark_oak_log": { x: 2, z: 2, y: 20 },
            "minecraft:pale_oak_log": { x: 2, z: 2, y: 20 },
            "minecraft:spruce_log": { x: 1, z: 1, y: 35 },
            "minecraft:birch_log": { x: 1, z: 1, y: 20 },
            "minecraft:oak_log": { x: 2, z: 2, y: 35 },
            "minecraft:mangrove_roots": { x: 8, z: 8, y: 15 },
            "minecraft:brown_mushroom_block": { x: 6, z: 6, y: 2 },
            "minecraft:red_mushroom_block": { x: 6, z: 6, y: 5 },
            "minecraft:warped_wart_block": { x: 6, z: 6, y: 10 },
            "minecraft:nether_wart_block": { x: 6, z: 6, y: 10 },
            "default": { x: 5, z: 5, y: 35 }
        };
    }

    initialize() {
        world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
            try {
                const player = event.player;
                if (!player) return;
                
                // Verifica del cooldown
                const currentTime = Date.now();
                const lastTime = this.lastInteractionTimes.get(player.id) || 0;
                if (currentTime - lastTime <= this.COOLDOWN) {
                    event.cancel = true;
                    return;
                }
                
                // Se c'è già un'esecuzione in corso per questo player, ignora silenziosamente
                if (this.isProcessing.get(player.id)) {
                    event.cancel = true;
                    return;
                }

                const item = event.itemStack;
                if (!item) return;
                
                const block = event.block;
                if (!block) return;
                
                const propertool = item?.typeId.toLowerCase();

                // Verifica generale
                if (player.getGameMode() === "adventure") {
                    event.cancel = true;
                    return;
                }
                
                if (!(propertool === "minecraft:golden_axe" || 
                      propertool === "minecraft:iron_axe" || 
                      propertool === "minecraft:diamond_axe" || 
                      propertool === "minecraft:netherite_axe")) {
                    return;
                }
				
                if (!player.isSneaking) {
                    return;
                }
                
                if (!this.isWearingLeatherArmor(player)) {
                    return;
                }
                
                // Verifica se il blocco è valido
                const blockType = block.typeId.toLowerCase();
                if (!blockType.includes("log") && !blockType.includes("stem") && 
                    !blockType.includes("mangrove_roots") && !blockType.includes("mushroom_block") && 
                    !blockType.includes("_wart_block")) {
                    return;
                }

                // Imposta la flag di esecuzione e aggiorna il timestamp di cooldown
                this.isProcessing.set(player.id, true);
                this.lastInteractionTimes.set(player.id, currentTime);
                event.cancel = true;

                // Avvia il generatore di taglio alberi
                const jobId = system.runJob(this.processTreeCuttingGenerator(player, item, block));
                player.treeCuttingJobId = jobId;
            } catch (error) {
                console.warn(`TreeCapitator Error: ${error.message}`);
                if (event && event.player) {
                    this.isProcessing.delete(event.player.id);
                }
            }
        });
    }

    // Generator per il processo di taglio alberi
    *processTreeCuttingGenerator(player, item, block) {
        try {
            // Ottieni blocchi da distruggere
            const blocksToDestroy = yield* this.scanVolumeGenerator(block);
            
            let blockCount = blocksToDestroy.size; 
            
            if (blockCount <= 0) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Applica danno all'ascia
            const success = yield* this.damageAxeGenerator(player, item, blockCount);
            
            if (!success) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Distruggi i blocchi
            yield* this.destroyBlocksGenerator(block.dimension, blocksToDestroy, player);
            
        } catch (error) {
            console.warn(`TreeCapitator Error in processTreeCuttingGenerator: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }
    
    // Generator per distruggere i blocchi
    *destroyBlocksGenerator(dimension, blocksToDestroy, player) {
        let blocksDestroyed = 0;
        
        try {
            // Converti il set in array per gestirlo più facilmente
            const blockArray = Array.from(blocksToDestroy);
            const TICKS_PER_BLOCK = 10;
            
            for (const posKey of blockArray) {
                try {
                    // Pausa prima di processare ogni blocco dopo il primo
                    if (blocksDestroyed > 0) {
                        yield system.waitTicks(TICKS_PER_BLOCK);
                    }
                    
                    const [x, y, z] = posKey.split(",").map(Number);
                    
                    // RUNCOMMAND con l'opzione "destroy" per generare drop e particelle
                    dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
                    
                    blocksDestroyed++;
                } catch (error) {
                    console.warn(`TreeCapitator Error distruggendo blocco: ${error.message}`);
                }
            }
            
            // Aggiungi l'effetto fame al giocatore
            if (player) {
                player.addEffect("hunger", 1200, { 
                    amplifier: 4,
                    showParticles: false
                });
            }
        } catch (error) {
            console.warn(`TreeCapitator Error in destroyBlocksGenerator: ${error.message}`);
        } finally {
            if (player) {
                this.isProcessing.delete(player.id);
            }
            return blocksDestroyed;
        }
    }

    // Generator per scansionare i blocchi
    *scanVolumeGenerator(startBlock) {
        const targetType = startBlock.typeId;
        const dimension = startBlock.dimension;
        const startPos = startBlock.location;
        const blocksToProcess = new Set();

        try {
            const range = this.blockRanges[targetType] || this.blockRanges["default"];
            const xRange = range.x;
            const zRange = range.z;
            const yRange = range.y;
            
            let scanCounter = 0;
            const BLOCKS_PER_YIELD = 20;
            
            for (let y = startPos.y; y < startPos.y + yRange; y++) {
                for (let x = startPos.x - xRange; x <= startPos.x + xRange; x++) {
                    for (let z = startPos.z - zRange; z <= startPos.z + zRange; z++) {
                        try {
                            const currentBlock = dimension.getBlock({ x, y, z });
                            if (currentBlock && currentBlock.typeId === targetType) {
                                blocksToProcess.add(`${x},${y},${z}`);
                            }
                            
                            // Yield periodicamente per non bloccare il thread
                            scanCounter++;
                            if (scanCounter % BLOCKS_PER_YIELD === 0) {
                                yield system.waitTicks(1);
                            }
                        } catch (error) {
                            console.warn(`TreeCapitator Error controllando blocco: ${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`TreeCapitator Error in scanVolumeGenerator: ${error.message}`);
        }

        return blocksToProcess;
    }

    // Generator per danneggiare l'ascia
    *damageAxeGenerator(player, axe, damageAmount) {
        try {
            if (!axe || damageAmount <= 0) return false;

            const durabilityComponent = axe.getComponent("minecraft:durability");
            if (!durabilityComponent) return false;

            const currentDamage = durabilityComponent.damage;
            const newDamage = currentDamage + damageAmount;
            const maxDurability = durabilityComponent.maxDurability;

            yield system.waitTicks(1);

            // Usa il componente equippable per aggiornare l'item
            const equipmentComp = player.getComponent("minecraft:equippable");
            if (!equipmentComp) return false;
            
            if (newDamage >= maxDurability) {
                // L'ascia si rompe
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, undefined);
                player.playSound("random.break");
                return true;
            } else {
                // Crea una nuova ascia con il danno aggiornato
                const newAxe = axe.clone();
                newAxe.getComponent("minecraft:durability").damage = newDamage;
                
                // Sostituisci l'item attuale
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, newAxe);
                return true;
            }
        } catch (error) {
            console.warn(`TreeCapitator Error in damageAxeGenerator: ${error.message}`);
            return false;
        }
    }
    
    // Metodo sincrono per verificare l'armatura
    isWearingLeatherArmor(player) {
        try {
            // Ottieni il componente equippable
            const equipmentComp = player.getComponent("minecraft:equippable");
            if (!equipmentComp) {
                console.warn("Equippable component non trovato");
                return false;
            }

            const helmet = equipmentComp.getEquipment(EquipmentSlot.Head);
            const chestplate = equipmentComp.getEquipment(EquipmentSlot.Chest);
            const leggings = equipmentComp.getEquipment(EquipmentSlot.Legs);
            const boots = equipmentComp.getEquipment(EquipmentSlot.Feet);

            const hasLeatherHelmet = helmet?.typeId === "minecraft:leather_helmet";
            const hasLeatherChestplate = chestplate?.typeId === "minecraft:leather_chestplate";
            const hasLeatherLeggings = leggings?.typeId === "minecraft:leather_leggings";
            const hasLeatherBoots = boots?.typeId === "minecraft:leather_boots";

            return hasLeatherHelmet && 
                   hasLeatherChestplate && 
                   hasLeatherLeggings && 
                   hasLeatherBoots;

        } catch (error) {
            console.warn("Errore nel controllo dell'armatura:", error);
            return false;
        }
    }
}