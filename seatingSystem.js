import * as mc from "@minecraft/server";

export class SeatingSystem {
    constructor() {
        // Aggiungiamo il map per il cooldown
        this.lastInteractionTimes = new Map();
        // Cooldown in millisecondi (5 secondi)
        this.COOLDOWN = 1000;
        
        this.initialize();
    }
	
    isNoCollisionBlock(block) {
        try {
            // Controllo se il blocco è fluido
            if ((block.typeId === "minecraft:air") || (block.typeId === "minecraft:water") || (block.typeId === "minecraft:lava")) {
                return true;
            }

            // Controllo la collision box per altri tipi di blocchi
            const permutation = block.permutation;
            const collision = permutation.getState('minecraft:collision_box');
            return collision === false || collision === 'none';
        } catch (error) {
            console.warn("Errore nel controllo collisione:", error);
            return false;
        }
    }
	
    getOffsetForBlock(block) {
        try {
            const blockStates = block.permutation.getAllStates();

            // Controllo per carpet (usando typeId)
            if (block.typeId.includes("_carpet")) {
                return {
                    x: 0,
                    y: 0, // Offset molto basso per carpet
                    z: 0
                };
            }

            // Controllo per scale
            if (blockStates.hasOwnProperty('upper_block_bit') || 
                blockStates.hasOwnProperty('upside_down_bit')) {
                const isUpsideDown = blockStates.upside_down_bit ?? false;
                return {
                    x: 0,
                    y: isUpsideDown ? 0.75 : 0.35, // Offset diverso per scale rovesciate
                    z: 0
                };
            }

            // Controllo per lastre
            if (blockStates.hasOwnProperty('top_slot_bit')) {
                const isTop = blockStates.top_slot_bit ?? false;
                return {
                    x: 0,
                    y: isTop ? 0.75 : 0.35, // Offset diverso per lastre in alto o basso
                    z: 0
                };
            }

            // Blocco pieno
            return {
                x: 0,
                y: 0.75,
                z: 0
            };
        } catch (error) {
            console.warn("Errore nel controllo proprietà blocco:", error);
            return {
                x: 0,
                y: 0.75,
                z: 0
            };
        }
    }

    async sitDown(player, block) {
        if (!block) return;

        try {
            const offset = this.getOffsetForBlock(block);
            const seatPos = {
                x: block.location.x + offset.x,
                y: block.location.y + offset.y,
                z: block.location.z + offset.z
            };

            // Spawna l'entità seat
            await player.runCommand(`summon anghelos:seat "${player.name}_seat" ${seatPos.x} ${seatPos.y} ${seatPos.z}`);
            
            // Fai sedere il giocatore
            await player.runCommand(`ride @s start_riding @e[name="${player.name}_seat",type=anghelos:seat,c=6]`);
            
        } catch (error) {
            console.warn(`Errore in sitDown per ${player.name}:`, error);
        }
    }
	
    async layDown(player, block) {
        if (!block) return;

        try {
            const seatPos = {
                x: block.location.x,
                y: block.location.y + 0.35,
                z: block.location.z
            };

            // Spawna l'entità seat
            await player.runCommand(`summon anghelos:seat "${player.name}_seat" ${seatPos.x} ${seatPos.y} ${seatPos.z}`);
            
            // Fai sedere il giocatore
            await player.runCommand(`ride @s start_riding @e[name="${player.name}_seat",type=anghelos:seat,c=6]`);
            
        } catch (error) {
            console.warn(`Errore in sitDown per ${player.name}:`, error);
        }
    }

    // Helper per ottenere la rotazione corretta in base alla direzione del letto
    getBedRotation(direction) {
        const rotations = {
            0: { yaw: 180, pitch: 90 }, // Sud
            1: { yaw: -90, pitch: 90 }, // Ovest 
            2: { yaw: 0, pitch: 90 },   // Nord
            3: { yaw: 90, pitch: 90 }   // Est
        };
        return rotations[direction] || rotations[0];
    }
	
    isLookingDown(player) {
        const rotation = player.getRotation();
        return rotation.x >= 85; // Il giocatore sta guardando quasi completamente in basso
    }

    initialize() {
        mc.world.afterEvents.entityHitBlock.subscribe(async (event) => {
            // Controlla se l'entità che ha colpito è un giocatore
            if (event.damagingEntity.typeId === "minecraft:player") {
                const player = event.damagingEntity;
                const hitBlock = event.hitBlock;
                
                // Verifica del cooldown
                const currentTime = Date.now();
                const lastTime = this.lastInteractionTimes.get(player.id) || 0;
                if (currentTime - lastTime <= this.COOLDOWN) {
                    event.cancel = true;
                    return;
                }
                
                // i blocchi senza collisioni li ignoriamo
                if (this.isNoCollisionBlock(hitBlock)) {
                    return;
                }
                
                if (player.isSneaking && this.isLookingDown(player) && (hitBlock.typeId.includes("bed"))) {
                    // Vediamo come comportarci con il letto
                    event.cancel = true;
                    
                    // Aggiorna il timestamp di cooldown
                    this.lastInteractionTimes.set(player.id, currentTime);
                    
                    // Usa il blocco colpito per la seduta
                    await this.layDown(player, hitBlock);
                    return;
                }
                
                if (player.isSneaking && this.isLookingDown(player) && !(hitBlock.typeId.includes("_trapdoor")) && !(hitBlock.typeId.includes("ladder"))) {
                    // Impedisci che il colpo rompa il blocco
                    event.cancel = true;
                    
                    // Aggiorna il timestamp di cooldown
                    this.lastInteractionTimes.set(player.id, currentTime);
                    
                    // Usa il blocco colpito per la seduta
                    await this.sitDown(player, hitBlock);
                }
            }
        });
    }
}