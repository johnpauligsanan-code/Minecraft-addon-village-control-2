import { world, system } from '@minecraft/server';
import { capitalSystem } from './CapitalSystem.js';

class HomeSystem {
    constructor() {
        this.homes = new Map();
        this.isInitialized = false;
        this.HOME_PROPERTY_KEY = "player_home_data";
        this.teleportingPlayers = new Set();
    }

    initialize() {
        if (this.isInitialized) return;

        // Listen for player join event
        world.afterEvents.playerJoin.subscribe((event) => {
            const player = world.getAllPlayers().find(p => p.name === event.playerName);
            if (player) {
                this.tryLoadHome(player);
            }
        });

        // Listen for hurt event
        world.afterEvents.entityHurt.subscribe((event) => {
            const hurtEntity = event.hurtEntity;
            if (hurtEntity?.typeId === 'minecraft:player') {
                const playerName = hurtEntity.name;
                if (this.teleportingPlayers.has(playerName)) {
                    this.teleportingPlayers.delete(playerName);
                    // Usa player.sendMessage invece di world.sendMessage
                    hurtEntity.sendMessage("§cTeleport cancelled - You took damage!");
                }
            }
        });

        // Command handling system
        world.beforeEvents.chatSend.subscribe((event) => {
            const message = event.message.toLowerCase().trim();
            const player = event.sender;

            // Handle -sethome command
            if (message === "-sethome") {
                event.cancel = true;
                system.run(() => this.handleSetHome(player));
                return;
            }

            // Handle -gohome command
            if (message === "-gohome") {
                event.cancel = true;
                system.run(() => this.handleGoHome(player));
                return;
            }
            
            // Handle -gocapital command
            if (message === "-gocapital") {
                event.cancel = true;
                system.run(() => this.handleGoCapital(player));
                return;
            }
        });

        this.isInitialized = true;
    }

    handleSetHome(player) {
        try {
            const position = player.location;
            const dimension = player.dimension;

            const homeData = {
                x: Math.floor(position.x),
                y: Math.floor(position.y),
                z: Math.floor(position.z),
                dimension: dimension.id
            };

            this.homes.set(player.name, homeData);
            this.saveHomeToProperties(player, homeData);
            
            // Usa player.sendMessage invece di world.sendMessage
            player.sendMessage("§aHome set successfully!");
        } catch (error) {
            console.warn("Error in -sethome command:", error);
            player.sendMessage("§cFailed to set home!");
        }
    }

    handleGoHome(player) {
        // Check if player is already teleporting
        if (this.teleportingPlayers.has(player.name)) {
            player.sendMessage("§cTeleport already in progress!");
            return;
        }

        // If home isn't loaded, try to load it
        if (!this.homes.has(player.name)) {
            this.tryLoadHome(player);
        }
        
        const home = this.homes.get(player.name);

        if (!home) {
            player.sendMessage("§cYou haven't set a home yet!");
            return;
        }

        try {
            // Start teleport sequence with generic teleport handler
            this.startTeleportSequence(player, {
                x: home.x,
                y: home.y,
                z: home.z,
                dimension: home.dimension
            }, "home");
        } catch (error) {
            console.warn("Error in -gohome command:", error);
            player.sendMessage("§cFailed to teleport home!");
            this.teleportingPlayers.delete(player.name);
        }
    }
    
    handleGoCapital(player) {
        // Check if player is already teleporting
        if (this.teleportingPlayers.has(player.name)) {
            player.sendMessage("§cTeleport already in progress!");
            return;
        }
        
        // Verifica se il giocatore ha una Capital
        const capital = capitalSystem.getPlayerCapital(player);
        if (!capital) {
            player.sendMessage("§cYou have no linked Capital");
            return;
        }
        
        try {
            // Ottieni la posizione della Capital
            const capitalLocation = capital.location;
            const dimension = capital.dimension;
            
            // Start teleport sequence with generic teleport handler
            // Nota: aggiungiamo +1 all'altezza per evitare di teletrasportarsi all'interno dell'entità
            this.startTeleportSequence(player, {
                x: Math.floor(capitalLocation.x),
                y: Math.floor(capitalLocation.y) + 1,
                z: Math.floor(capitalLocation.z),
                dimension: dimension.id
            }, "capital");
        } catch (error) {
            console.warn("Error in -gocapital command:", error);
            player.sendMessage("§cFailed to teleport to Capital");
            this.teleportingPlayers.delete(player.name);
        }
    }
    
    // Metodo generico per gestire il teletrasporto con countdown
    startTeleportSequence(player, destination, destinationType) {
        // Add player to teleporting set
        this.teleportingPlayers.add(player.name);
        player.sendMessage("§eTeleporting towards " + destinationType + " in 10 seconds. Do not take damage!");
        
        // Add nausea effect for 15 seconds
        player.addEffect("nausea", 300, {
            amplifier: 0,
            showParticles: true
        });
        
        // Start countdown
        let countdown = 10;
        const intervalId = system.runInterval(() => {
            system.run(() => {
                // Get current player reference - potrebbe essere cambiato
                const currentPlayer = world.getAllPlayers().find(p => p.name === player.name);
                if (!currentPlayer || !this.teleportingPlayers.has(currentPlayer.name)) {
                    system.clearRun(intervalId);
                    this.teleportingPlayers.delete(player.name);
                    return;
                }
                
                if (countdown > 0) {
                    if (countdown <= 3) {
                        currentPlayer.sendMessage(`§eTeleporting in ${countdown}...`);
                    }
                    countdown--;
                } else {
                    // Clear interval and teleport
                    system.clearRun(intervalId);
                    if (this.teleportingPlayers.has(currentPlayer.name)) {
                        try {
                            // Verifica se la Capital esiste ancora (solo per il teleport alla Capital)
                            if (destinationType === "capital") {
                                const capital = capitalSystem.getPlayerCapital(currentPlayer);
                                if (!capital) {
                                    currentPlayer.sendMessage("§cYour Capital is no more available!");
                                    this.teleportingPlayers.delete(currentPlayer.name);
                                    return;
                                }
                                
                                // Aggiorna le coordinate in caso la Capital si sia spostata
                                const capitalLocation = capital.location;
                                destination.x = Math.floor(capitalLocation.x);
                                destination.y = Math.floor(capitalLocation.y) + 1;
                                destination.z = Math.floor(capitalLocation.z);
                            }
                            
                            // Esegui il teletrasporto
                            const targetDimension = world.getDimension(destination.dimension);
                            currentPlayer.teleport(
                                { x: destination.x, y: destination.y, z: destination.z },
                                { 
                                    dimension: targetDimension, 
                                    rotation: currentPlayer.rotation 
                                }
                            );
                            
                            currentPlayer.sendMessage(`§aArrived at ${destinationType}!`);
                            
                            this.teleportingPlayers.delete(currentPlayer.name);
                            
                            if (currentPlayer.getGameMode() === "adventure") {
                                currentPlayer.triggerEvent("minecraft:become_survival");
                            }
                        } catch (error) {
                            console.warn(`Error teleporting to ${destinationType}:`, error);
                            currentPlayer.sendMessage(`§cError while teleporting towards ${destinationType}!`);
                            this.teleportingPlayers.delete(currentPlayer.name);
                        }
                    }
                }
            });
        }, 20); // Run every second (20 ticks)
    }

    saveHomeToProperties(player, homeData) {
        try {
            player.setDynamicProperty(this.HOME_PROPERTY_KEY, JSON.stringify(homeData));
        } catch (error) {
            console.warn(`Error saving home for ${player.name}:`, error);
        }
    }

    tryLoadHome(player) {
        try {
            const homeDataString = player.getDynamicProperty(this.HOME_PROPERTY_KEY);
            
            if (homeDataString) {
                const homeData = JSON.parse(homeDataString);
                
                if (homeData && homeData.x !== undefined && 
                    homeData.y !== undefined && 
                    homeData.z !== undefined && 
                    homeData.dimension) {
                    
                    this.homes.set(player.name, homeData);
                    return true;
                }
            }
        } catch (error) {
            console.warn(`Error loading home for ${player.name}:`, error);
            return false;
        }
        return false;
    }
}

export const homeSystem = new HomeSystem();