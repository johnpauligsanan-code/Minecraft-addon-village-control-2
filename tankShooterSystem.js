import * as MinecraftServer from "@minecraft/server";

export class AnghelosTankShooter {
    constructor() {
        this.config = {
            projectileType: "minecraft:fireball", 
            tankEntityType: "anghelos:tank",
            maxProjectileSpeed: 5.0,     // Velocità massima del proiettile
            minProjectileSpeed: 1.0,     // Velocità minima del proiettile
            maxChargeTime: 20,           // Tempo di carica massimo in tick (2 secondi = 40 tick)
            spyglassMaxDuration: 72000,  // Durata massima teorica dello spyglass in tick
            // Configurazione per l'offset del proiettile su tutte e tre le coordinate
            projectileOffset: {
                forward: 4.5,  // Distanza in avanti nella direzione del giocatore
                up: 0.5,       // Offset verticale (positivo = più in alto)
                side: 0.0      // Offset laterale (positivo = a destra del giocatore)
            }
        };
    }

    initialize() {
        try {
            MinecraftServer.world.afterEvents.itemReleaseUse.subscribe((event) => {
                try {
                    this._handleItemReleaseEvent(event);
                } catch (error) {
                    console.warn(`TankShooter Item Release Error: ${error.message}`);
                    console.warn(`Stack trace: ${error.stack}`);
                }
            });
        } catch (error) {
            console.warn(`TankShooter Initialization Error: ${error.message}`);
        }
    }

    _handleItemReleaseEvent(event) {
        const player = event.source;        
        // Verifica se l'item usato è un cannocchiale
        if (!event.itemStack || event.itemStack.typeId !== "minecraft:spyglass") {
            return;
        }        
        // Verifica se il player è su un anghelos:tank
        try {
            const ridingComponent = player.getComponent("minecraft:riding");
            if (!ridingComponent) {
                return;
            }            
            const tank = ridingComponent.entityRidingOn;
            if (!tank) {
                return;
            }            
            if (tank.typeId !== this.config.tankEntityType) {
                return;
            }
			
			// Verifica se il tank è domato dal giocatore
			if (tank.hasComponent("minecraft:tameable")) {
				const tameableComponent = tank.getComponent("minecraft:tameable");
				
				// Controlla se il tank è domato e se è domato dal giocatore corrente
				if (!tameableComponent.isTamed || tameableComponent.tamedToPlayerId !== player.id) {
					player.onScreenDisplay.setActionBar("§cYOU DO NOT OWN THIS CANNON");
					return;
				}
			}
			else {
				player.onScreenDisplay.setActionBar("§cYOU DO NOT OWN THIS CANNON");
				return;	
			}
			
            // Verifica la property "anghelos:special_charge_mode" (Ammo) del tank
            let specialCharge;
            try {
                specialCharge = tank.getProperty("anghelos:special_charge_mode");                
                // Se è undefined o null, impostiamo un valore predefinito
                if (specialCharge === undefined || specialCharge === null) {
                    specialCharge = 0.0;
                }
            } catch (propError) {
                console.warn(`Errore nel leggere la proprietà: ${propError.message}`);
                // Fallback: assumiamo che il tank non abbia carica
                specialCharge = 0.0;
            }
            
            if (typeof specialCharge === 'number' && specialCharge <= 0) {
                player.onScreenDisplay.setActionBar("§cRELOAD!");
                return;
            }

            // Calcola il tempo effettivo di carica
            // useDuration = tempo rimanente, quindi sottraiamo dal massimo per ottenere il tempo trascorso
            const actualUseDuration = this.config.spyglassMaxDuration - event.useDuration;
            
            // Calcola la velocità del proiettile in base al tempo di carica
            // Limitiamo il tempo di carica massimo considerato
            const chargeTime = Math.min(actualUseDuration, this.config.maxChargeTime);
            const chargePercentage = chargeTime / this.config.maxChargeTime;
            
            // Interpolazione lineare tra velocità minima e massima
            const projectileSpeed = this.config.minProjectileSpeed + 
                (this.config.maxProjectileSpeed - this.config.minProjectileSpeed) * chargePercentage;
            
            // Otteniamo la posizione della testa del giocatore
            const headPosition = player.getHeadLocation();
            
            // Otteniamo la direzione di vista del giocatore
            const viewDirection = player.getViewDirection();
            
            // Calcoliamo la posizione di spawn del proiettile con l'offset 3D
            const spawnPosition = this._calculateOffsetPosition(headPosition, viewDirection);
            
            // Lanciamo il proiettile dalla posizione calcolata con la velocità calcolata
            const success = this._fireProjectile(player, spawnPosition, viewDirection, projectileSpeed);
            
            // Se il proiettile è stato lanciato con successo, diminuiamo la carica speciale
            if (success) {
                try {
                    tank.triggerEvent("anghelos:decrease_s_charge");
                } catch (eventError) {
                    console.warn(`Errore nel triggare l'evento: ${eventError.message}`);
                }
            }
        } catch (error) {
            console.warn(`Errore nel verificare il veicolo: ${error.message}`);
            console.warn(`Stack trace: ${error.stack}`);
        }
    }
    
    _calculateOffsetPosition(headPosition, viewDirection) {
        // Assicuriamoci che viewDirection sia normalizzato
        const length = Math.sqrt(
            viewDirection.x * viewDirection.x + 
            viewDirection.y * viewDirection.y + 
            viewDirection.z * viewDirection.z
        );
        
        // Direzione normalizzata in avanti
        const forwardDir = {
            x: viewDirection.x / length,
            y: viewDirection.y / length,
            z: viewDirection.z / length
        };
        
        // Direzione verso l'alto globale
        const upDir = { x: 0, y: 1, z: 0 };
        
        // Direzione laterale (destra) usando il prodotto vettoriale up × forward
        // Per ottenere la direzione destra, usiamo up × forward invece di forward × up
        // per garantire che la direzione punti a destra (regola della mano destra)
        const rightDir = {
            x: upDir.y * forwardDir.z - upDir.z * forwardDir.y,
            y: upDir.z * forwardDir.x - upDir.x * forwardDir.z,
            z: upDir.x * forwardDir.y - upDir.y * forwardDir.x
        };
        
        // Normalizziamo il vettore destra
        const rightLength = Math.sqrt(
            rightDir.x * rightDir.x + 
            rightDir.y * rightDir.y + 
            rightDir.z * rightDir.z
        );
        
        rightDir.x /= rightLength || 1;
        rightDir.y /= rightLength || 1;
        rightDir.z /= rightLength || 1;
        
        // Calcoliamo la direzione verso l'alto locale
        // usando il prodotto vettoriale forward × right
        const localUpDir = {
            x: forwardDir.y * rightDir.z - forwardDir.z * rightDir.y,
            y: forwardDir.z * rightDir.x - forwardDir.x * rightDir.z,
            z: forwardDir.x * rightDir.y - forwardDir.y * rightDir.x
        };
        
        // Normalizziamo il vettore up locale
        const upLength = Math.sqrt(
            localUpDir.x * localUpDir.x + 
            localUpDir.y * localUpDir.y + 
            localUpDir.z * localUpDir.z
        );
        
        localUpDir.x /= upLength || 1;
        localUpDir.y /= upLength || 1;
        localUpDir.z /= upLength || 1;
        
        // Calcoliamo la posizione finale del proiettile
        const offsetPosition = {
            x: headPosition.x + 
               (forwardDir.x * this.config.projectileOffset.forward) +
               (localUpDir.x * this.config.projectileOffset.up) +
               (rightDir.x * this.config.projectileOffset.side),
            y: headPosition.y + 
               (forwardDir.y * this.config.projectileOffset.forward) +
               (localUpDir.y * this.config.projectileOffset.up) +
               (rightDir.y * this.config.projectileOffset.side),
            z: headPosition.z + 
               (forwardDir.z * this.config.projectileOffset.forward) +
               (localUpDir.z * this.config.projectileOffset.up) +
               (rightDir.z * this.config.projectileOffset.side)
        };        
        return offsetPosition;
    }

    _fireProjectile(player, spawnPosition, viewDirection, projectileSpeed) {
           
        // Normalizziamo il vettore direzione
        const length = Math.sqrt(viewDirection.x * viewDirection.x + viewDirection.y * viewDirection.y + viewDirection.z * viewDirection.z);
        
        const normalizedDirection = {
            x: viewDirection.x / length,
            y: viewDirection.y / length,
            z: viewDirection.z / length
        };
                
        // Calcoliamo l'impulso finale moltiplicando la direzione normalizzata per la velocità
        const impulse = {
            x: normalizedDirection.x * projectileSpeed,
            y: normalizedDirection.y * projectileSpeed,
            z: normalizedDirection.z * projectileSpeed
        };
        
        
        try {
			// Riproduzione del suono di sparo
            player.playSound("anghelos.tankshot", {
				location: spawnPosition,
				volume: 1.0,
				pitch: 1.0
			});
            // Creiamo il proiettile alla posizione calcolata con offset
            const projectile = player.dimension.spawnEntity(this.config.projectileType, spawnPosition);
			const smokeparticle = player.dimension.spawnParticle("minecraft:large_explosion", spawnPosition);
			const fireparticle = player.dimension.spawnParticle("minecraft:lava_particle", spawnPosition);
            
            if (!projectile) {
                return false;
            }
             // Impostiamo il proiettile come owned by the player
			if (projectile.hasComponent("minecraft:tameable")) {
				try {
					const tameableComponent = projectile.getComponent("minecraft:tameable");
					const tamed = tameableComponent.tame(player);
				} catch (tameError) {
					console.warn(`Errore nel domare il proiettile: ${tameError.message}`);
				}
			}
			
            // Applichiamo l'impulso al proiettile
            projectile.applyImpulse(impulse);
			
            // Notifica al giocatore con indicazione della potenza
            const powerPercentage = Math.round((projectileSpeed - this.config.minProjectileSpeed) / 
                (this.config.maxProjectileSpeed - this.config.minProjectileSpeed) * 100);
            player.onScreenDisplay.setActionBar(`§aRange used: ${powerPercentage}%`);
            return true;
        } catch (error) {
            console.warn(`ERRORE durante la creazione/lancio del proiettile: ${error.message}`);
            console.warn(`Stack trace: ${error.stack}`);
            return false;
        }
    }
}