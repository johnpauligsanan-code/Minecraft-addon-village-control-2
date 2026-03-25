import { world, system, EquipmentSlot, ItemStack, Player, EntityComponentTypes } from "@minecraft/server";

export class AnghelosHoe {
    constructor() {
        this.isProcessing = new Map();
        this.lastInteractionTimes = new Map();
        this.COOLDOWN = 1500;
        
        // Dizionario per gli stadi di crescita delle colture
        this.cropGrowthStages = {
            "minecraft:wheat": 7,
            "minecraft:carrots": 7,
            "minecraft:potatoes": 7,
            "minecraft:beetroot": 7,
            "minecraft:sweet_berry_bush": 3
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

                // Verifica se l'item è una zappa
                if (player.getGameMode() === "adventure") {
                    event.cancel = true;
                    return;
                }
                
                if (!(propertool === "minecraft:golden_hoe" || 
                      propertool === "minecraft:iron_hoe" || 
                      propertool === "minecraft:diamond_hoe" || 
                      propertool === "minecraft:netherite_hoe")) {
                    return;
                }
                
                // Se il giocatore non è in sneaking la zappa non funziona
                if (!player.isSneaking) {
                    return;
                }
                
                if (!this.isWearingLeatherArmor(player)) {
                    return;
                }
                
                // Verifica se il blocco è valido
                const blockType = block.typeId.toLowerCase();
                if (!(blockType.includes("grindstone") || blockType.includes("fletching_table"))) {
                    return;
                }

                // Imposta la flag di esecuzione e aggiorna il timestamp di cooldown
                this.isProcessing.set(player.id, true);
                this.lastInteractionTimes.set(player.id, currentTime);
                event.cancel = true;

                // Avvia le operazioni con la zappa
                this.processHoeAction(player, item, block);
            } catch (error) {
                console.warn(`Hoe Error: ${error.message}`);
                if (event && event.player) {
                    this.isProcessing.delete(event.player.id);
                }
            }
        });
    }

    // Metodo che avvia l'azione della zappa
    processHoeAction(player, item, block) {
        try {
            // Avvia il generatore come job e memorizza l'ID
            const jobId = system.runJob(this.processHoeActionGenerator(player, item, block));
            player.hoeJobId = jobId;
        } catch (error) {
            console.warn(`Hoe Error in processHoeAction: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }

    // Generator che gestisce il flusso completo dell'azione della zappa
    *processHoeActionGenerator(player, item, block) {
        try {
            if (block.typeId === "minecraft:grindstone") {
                yield* this.processGrindstoneActionGenerator(player, item);
            } 
            else if (block.typeId === "minecraft:fletching_table") {
                yield* this.processFletchingTableActionGenerator(player, item, block);
            }
        } catch (error) {
            console.warn(`Hoe Error in processHoeActionGenerator: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }
    
    // Generator per l'azione con la grindstone
    *processGrindstoneActionGenerator(player, item) {
        try {
            let blockCount = 0;
            const experienceToAdd = 7 + (player.level * 2);
            
            if (item.typeId.toLowerCase() === "minecraft:golden_hoe") {
                // Danno agevolato per zappa in oro
                blockCount = 1;
            } else {
                // Danno normale per zappe preziose
                blockCount = 25;
            }
            
            // Applica danno alla zappa
            const success = yield* this.damageAxeGenerator(player, item, blockCount);
            if (!success) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Aggiungi effetto fame
            player.addEffect("hunger", 12000, { 
                amplifier: 4,
                showParticles: false
            });
            
            // Aggiungi esperienza se il livello è sotto 30
            if (player.level < 30) {
                player.addExperience(experienceToAdd);
            } else {
                // Messaggio al giocatore
                player.sendMessage("Maximum grinding Xp reached");
            }
            
        } catch (error) {
            console.warn(`Hoe Error in processGrindstoneActionGenerator: ${error.message}`);
        } finally {
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }
    
    // Generator per l'azione con la fletching table
    *processFletchingTableActionGenerator(player, item, block) {
        try {
            // Ottieni blocchi da raccogliere
            const blocksToHarvest = yield* this.scanVolumeGenerator(block);
            
            let blockCount = blocksToHarvest.size;
            if (blockCount <= 0) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Applica danno alla zappa
            const success = yield* this.damageAxeGenerator(player, item, blockCount);
            if (!success) {
                this.isProcessing.delete(player.id);
                return;
            }
            
            // Raccogli i blocchi
            yield* this.harvestBlocksGenerator(block.dimension, blocksToHarvest, player);
            
        } catch (error) {
            console.warn(`Hoe Error in processFletchingTableActionGenerator: ${error.message}`);
            if (player) {
                this.isProcessing.delete(player.id);
            }
        }
    }
    
    // Generator per raccogliere i blocchi in modo fluido
    *harvestBlocksGenerator(dimension, blocksToHarvest, player) {
        let blocksHarvested = 0;
        
        try {
            // Converti il set in array per gestirlo più facilmente
            const blockArray = Array.from(blocksToHarvest);
            
            for (const posKey of blockArray) {
                try {
                    const [x, y, z] = posKey.split(",").map(Number);
                    const cropBlock = dimension.getBlock({ x, y, z });
                    const cropType = cropBlock?.typeId;
                    
                    if (cropType) {
                        // Usa runCommand con l'opzione "destroy" per raccogliere il raccolto
                        dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
                        
                        // Ripianta lo stesso tipo di crop
                        dimension.runCommand(`setblock ${x} ${y} ${z} ${cropType} replace`);
                        
                        blocksHarvested++;
                    }
                    
                    // Pausa tra ciascun blocco per evitare lag
                    yield system.waitTicks(5);
                } catch (error) {
                    console.warn(`Hoe Error raccogliendo blocco: ${error.message}`);
                }
            }
            
            // Aggiungi l'effetto fame al giocatore
            if (player) {
                player.addEffect("hunger", 1200, { 
                    amplifier: 4,
                    showParticles: true
                });
            }
        } catch (error) {
            console.warn(`Hoe Error in harvestBlocksGenerator: ${error.message}`);
        } finally {
            // Assicurati che la flag venga sempre rimossa
            if (player) {
                this.isProcessing.delete(player.id);
            }
            return blocksHarvested;
        }
    }

    // Generator per scansionare i blocchi
    *scanVolumeGenerator(startBlock) {
        const blocksToProcess = new Set();
        
        try {
            const dimension = startBlock.dimension;
            const startPos = startBlock.location;
            
            const xRange = 4;
            const zRange = 4;
            const yRange = 1;
            
            let scanCounter = 0;
            const BLOCKS_PER_YIELD = 20; // Numero di blocchi da scansionare prima di yield

            for (let y = startPos.y; y < startPos.y + yRange; y++) {
                for (let x = startPos.x - xRange; x <= startPos.x + xRange; x++) {
                    for (let z = startPos.z - zRange; z <= startPos.z + zRange; z++) {
                        try {
                            const currentBlock = dimension.getBlock({ x, y, z });
                            
                            // Controlla se è un crop
                            if (currentBlock && Object.keys(this.cropGrowthStages).includes(currentBlock.typeId)) {
                                // Controlla lo stato del blocco
                                if (currentBlock.permutation.getState("growth") !== undefined) {
                                    const growthStage = currentBlock.permutation.getState("growth");
                                    
                                    // Confronta con lo stadio massimo specifico per quel tipo di crop
                                    if (growthStage === this.cropGrowthStages[currentBlock.typeId]) {
                                        blocksToProcess.add(`${x},${y},${z}`);
                                    }
                                }
                            }
                            
                            // Cediamo il controllo dopo aver scansionato un certo numero di blocchi
                            scanCounter++;
                            if (scanCounter % BLOCKS_PER_YIELD === 0) {
                                yield system.waitTicks(1);
                            }
                        } catch (error) {
                            console.warn(`Crop Scanning Error: ${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`Hoe Error in scanVolumeGenerator: ${error.message}`);
        }

        return blocksToProcess;
    }

    // Generator per danneggiare la zappa
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
                // La zappa si rompe
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, undefined);
                player.playSound("random.break");
                return true;
            } else {
                // Crea una nuova zappa con il danno aggiornato
                const newHoe = axe.clone();
                newHoe.getComponent("minecraft:durability").damage = newDamage;
                
                // Sostituisci l'item attuale
                equipmentComp.setEquipment(EquipmentSlot.Mainhand, newHoe);
                return true;
            }
        } catch (error) {
            console.warn(`Hoe Error in damageAxeGenerator: ${error.message}`);
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