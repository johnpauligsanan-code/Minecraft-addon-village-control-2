import { world, system, EquipmentSlot, ItemStack, Player, EntityComponentTypes } from "@minecraft/server";

export class AnghelosMiner {
    constructor() {
        this.isProcessing = new Map();
        this.lastInteractionTimes = new Map();
        this.COOLDOWN = 1500;
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
                
                if (!(propertool === "minecraft:golden_pickaxe" || 
                      propertool === "minecraft:iron_pickaxe" || 
                      propertool === "minecraft:diamond_pickaxe" || 
                      propertool === "minecraft:netherite_pickaxe")) {
                    return;
                }
                
                if (!player.isSneaking) {
                    return;
                }
                
                if (!this.isWearingLeatherArmor(player)) {
                    return;
                }
                
                const blockType = block.typeId.toLowerCase();
                if (!(blockType.includes("ore") || blockType.includes("stone") || blockType.includes("diorite") || 
                      blockType.includes("granite") || blockType.includes("andesite") || blockType.includes("deepslate") || 
                      blockType.includes("tuff") || blockType.includes("netherrack") || blockType.includes("calcite") || 
                      blockType.includes("terracotta") || blockType.includes("basalt"))) {
                    return;
                }

                // Imposta la flag di esecuzione e aggiorna il timestamp di cooldown
                this.isProcessing.set(player.id, true);
                this.lastInteractionTimes.set(player.id, currentTime);
                event.cancel = true;

                // Avvia il processo di mining
                this.processMining(player, item, block);
            } catch (error) {
                console.warn(`Miner Error: ${error.message}`);
                if (event && event.player) {
                    this.isProcessing.delete(event.player.id);
                }
            }
        });
    }

    // Metodo che avvia il processo di mining
    processMining(player, item, block) {
        try {
            // Avvia il generatore come job e memorizza l'ID
            const jobId = system.runJob(this.processMiningGenerator(player, item, block));
            player.miningJobId = jobId;
        } catch (error) {
            console.warn(`Miner Error in processMining: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }

    // Generator che gestisce l'intero processo di mining
    *processMiningGenerator(player, item, block) {
        try {
            // Ottieni blocchi da distruggere
            const blocksToDestroy = yield* this.scanVolumeGenerator(block);
            
            let blockCount = blocksToDestroy.size; 
            
            if (blockCount <= 0) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Applica danno al piccone
            const success = yield* this.damageAxeGenerator(player, item, blockCount);
            if (!success) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Distruggi i blocchi
            yield* this.destroyBlocksGenerator(block.dimension, blocksToDestroy, player);
        } catch (error) {
            console.warn(`Miner Error in processMiningGenerator: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }
    
    // Generator per distruggere i blocchi in modo fluido
    *destroyBlocksGenerator(dimension, blocksToDestroy, player) {
        let blocksDestroyed = 0;
        
        try {
            // Converti il set in array per gestirlo più facilmente
            const blockArray = Array.from(blocksToDestroy);
            
            for (const posKey of blockArray) {
                try {
                    const [x, y, z] = posKey.split(",").map(Number);
                    
                    // Usa runCommand con l'opzione "destroy" per generare drop e particelle
                    dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
                    
                    blocksDestroyed++;
                    
                    // Pausa tra ciascun blocco per evitare lag
                    yield system.waitTicks(5);
                } catch (error) {
                    console.warn(`Miner Error distruggendo blocco: ${error.message}`);
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
            console.warn(`Miner Error in destroyBlocksGenerator: ${error.message}`);
        } finally {
            // Assicurati che la flag venga sempre rimossa
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

        const xRange = 1;
        const zRange = 1;
        const yRange = 1;
        
        let scanCounter = 0;
        const BLOCKS_PER_YIELD = 20; // Numero di blocchi da scansionare prima di yield
        
        try {
            for (let y = startPos.y - yRange; y <= startPos.y + yRange; y++) {
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
                            console.warn(`Miner Error controllando blocco: ${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Miner Error in scanVolumeGenerator: ${error.message}`);
        }

        return blocksToProcess;
    }

    // Generator per danneggiare il piccone
    *damageAxeGenerator(player, axe, damageAmount) {
        try {
            if (!axe || damageAmount <= 0) return false;

            const durabilityComponent = axe.getComponent("minecraft:durability");
            if (!durabilityComponent) return false;

            const currentDamage = durabilityComponent.damage;
            const newDamage = currentDamage + damageAmount;
            const maxDurability = durabilityComponent.maxDurability;

            // Usa il componente equippable per aggiornare l'item
            const equipmentComp = player.getComponent("minecraft:equippable");
            if (!equipmentComp) return false;
            
            if (newDamage >= maxDurability) {
                // Il piccone si rompe
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, undefined);
                player.playSound("random.break");
                return true;
            } else {
                // Crea un nuovo piccone con il danno aggiornato
                const newPickaxe = axe.clone();
                newPickaxe.getComponent("minecraft:durability").damage = newDamage;
                
                // Sostituisci l'item attuale
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, newPickaxe);
                return true;
            }
        } catch (error) {
            console.warn(`Miner Error in damageAxeGenerator: ${error.message}`);
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

            // Verifica l'armatura usando l'enum EquipmentSlot corretto
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