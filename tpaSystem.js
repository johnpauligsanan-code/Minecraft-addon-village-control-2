import { world, system } from '@minecraft/server';

class TPASystem {
    constructor() {
        this.pendingRequests = new Map(); // Map<targetName, {senderName: string, timeout: number}>
        this.activeSenders = new Set(); // Set of players who have sent a request
        this.teleportingPlayers = new Map(); // Map<senderName, targetName> to track both players during teleport
    }

    initialize() {
        // Listen for hurt event to cancel teleports
        world.afterEvents.entityHurt.subscribe((event) => {
            const hurtEntity = event.hurtEntity;
            if (hurtEntity?.typeId === 'minecraft:player') {
                const playerName = hurtEntity.name;
                if (this.teleportingPlayers.has(playerName)) {
                    const targetName = this.teleportingPlayers.get(playerName);
                    this.notifyTeleportCancelled(playerName, targetName);
                    this.teleportingPlayers.delete(playerName);
                }
            }
        });

        // Gestione dei comandi tramite chat
        world.beforeEvents.chatSend.subscribe((event) => {
            const message = event.message.toLowerCase().trim();
            const sender = event.sender;

            // Gestione comando -tpa
            if (message.startsWith("-tpa @")) {
                event.cancel = true;
                // Rimuove -tpa e @ e prende solo il nome
                const targetName = message.substring(6).trim();
                system.run(() => this.handleTpaRequest(sender, targetName));
                return;
            }

            // Gestione risposta -y
            if (message === "-y") {
                event.cancel = true;
                system.run(() => this.handleTpaResponse(sender.name, true));
                return;
            }

            // Gestione risposta -n
            if (message === "-n") {
                event.cancel = true;
                system.run(() => this.handleTpaResponse(sender.name, false));
                return;
            }
        });
    }

    // Utility per inviare messaggi privati
    sendPrivateMessage(message, player) {
        if (player) {
            player.sendMessage(message);
        }
    }

    notifyTeleportCancelled(playerName, targetName) {
        const player = world.getAllPlayers().find(p => p.name === playerName);
        const target = world.getAllPlayers().find(p => p.name === targetName);
        
        if (player) {
            this.sendPrivateMessage("§cTeleport cancelled - You took damage!", player);
        }
        if (target) {
            this.sendPrivateMessage(`§c${playerName}'s teleport was cancelled due to damage!`, target);
        }
    }

    handleTpaRequest(sender, targetName) {
        // Verifica se il mittente ha già una richiesta attiva
        if (this.activeSenders.has(sender.name)) {
            this.sendPrivateMessage("§cYou already have a pending tpa request!", sender);
            return;
        }

        // Cerca il giocatore target
        const targetPlayer = world.getAllPlayers().find(p => p.name.toLowerCase() === targetName.toLowerCase());
        if (!targetPlayer) {
            this.sendPrivateMessage(`§cPlayer ${targetName} is not online!`, sender);
            return;
        }

        // Verifica se il target ha già una richiesta pendente
        if (this.pendingRequests.has(targetPlayer.name)) {
            this.sendPrivateMessage(`§c${targetPlayer.name} already has another pending tpa request!`, sender);
            return;
        }

        // Crea la richiesta
        const request = {
            senderName: sender.name,
            timeout: system.runTimeout(() => {
                this.expireRequest(targetPlayer.name);
            }, 30 * 20) // 30 secondi * 20 tick
        };

        // Registra la richiesta
        this.pendingRequests.set(targetPlayer.name, request);
        this.activeSenders.add(sender.name);

        // Invia messaggi privati ai giocatori coinvolti
        this.sendPrivateMessage(`§e${sender.name} wants to teleport to you. -y to accept, -n to deny`, targetPlayer);
        this.sendPrivateMessage(`§aTpa request sent to ${targetPlayer.name}!`, sender);
    }

    handleTpaResponse(responderName, accepted) {
        const request = this.pendingRequests.get(responderName);
        if (!request) {
            const responder = world.getAllPlayers().find(p => p.name === responderName);
            this.sendPrivateMessage(`§cYou do not have any pending tpa requests`, responder);
            return;
        }

        // Trova i giocatori coinvolti
        const sender = world.getAllPlayers().find(p => p.name === request.senderName);
        const target = world.getAllPlayers().find(p => p.name === responderName);

        if (!sender || !target) {
            this.cleanupRequest(responderName);
            if (sender) this.sendPrivateMessage(`§cTarget player disconnected, tpa request aborted`, sender);
            if (target) this.sendPrivateMessage(`§cRequesting player disconnected, tpa request aborted`, target);
            return;
        }

        if (accepted) {
            // Cleanup della richiesta prima del teletrasporto
            this.cleanupRequest(responderName);

            // Verifica se il giocatore è già in teletrasporto
            if (this.teleportingPlayers.has(sender.name)) {
                this.sendPrivateMessage(`§c${sender.name} is already in teleport process!`, target);
                this.sendPrivateMessage(`§cYou are already in teleport process!`, sender);
                return;
            }

            // Inizia la sequenza di teletrasporto
            this.teleportingPlayers.set(sender.name, target.name);
            this.sendPrivateMessage(`§eTeleporting in 10 seconds. Don't take damage!`, sender);
            this.sendPrivateMessage(`§e${sender.name} will teleport to you in 10 seconds...`, target);

            // Applica l'effetto nausea per 15 secondi
            sender.addEffect("nausea", 300, {
                amplifier: 0,
                showParticles: true
            });

            let countdown = 10;
            const intervalId = system.runInterval(() => {
                system.run(() => {
                    // Verifica se il giocatore è ancora online e in teletrasporto
                    const currentSender = world.getAllPlayers().find(p => p.name === sender.name);
                    const currentTarget = world.getAllPlayers().find(p => p.name === target.name);
                    
                    if (!currentSender || !currentTarget || !this.teleportingPlayers.has(sender.name)) {
                        system.clearRun(intervalId);
                        this.teleportingPlayers.delete(sender.name);
                        return;
                    }

                    if (countdown > 0) {
                        if (countdown <= 3) {
                            this.sendPrivateMessage(`§eTeleporting in ${countdown}...`, currentSender);
                        }
                        countdown--;
                    } else {
                        // Esegui il teletrasporto
                        system.clearRun(intervalId);
                        if (this.teleportingPlayers.has(currentSender.name)) {
                            try {
                                // Usa il metodo teleport invece di runCommand
                                currentSender.teleport(
                                    { 
                                        x: currentTarget.location.x, 
                                        y: currentTarget.location.y, 
                                        z: currentTarget.location.z 
                                    },
                                    { 
                                        dimension: currentTarget.dimension,
                                        rotation: currentSender.rotation
                                    }
                                );
                                this.sendPrivateMessage(`§aTeleported to ${currentTarget.name}!`, currentSender);
                                this.sendPrivateMessage(`§a${currentSender.name} teleported to you!`, currentTarget);
                                
                                // Mantiene triggerEvent come richiesto
                                if (currentSender.getGameMode() === "adventure") {
                                    currentSender.triggerEvent("minecraft:become_survival");
                                }
                            } catch (error) {
                                console.warn("Error in teleport:", error);
                                this.sendPrivateMessage(`§cTeleport failed!`, currentSender);
                                this.sendPrivateMessage(`§cFailed to teleport ${currentSender.name}!`, currentTarget);
                            }
                            this.teleportingPlayers.delete(currentSender.name);
                        }
                    }
                });
            }, 20); // Run every second (20 ticks)
        } else {
            this.sendPrivateMessage(`§c${target.name} denied the TPA request`, sender);
            this.sendPrivateMessage(`§cYou denied teleport request from ${sender.name}.`, target);
            this.cleanupRequest(responderName);
        }
    }

    expireRequest(targetName) {
        const request = this.pendingRequests.get(targetName);
        if (request) {
            const sender = world.getAllPlayers().find(p => p.name === request.senderName);
            const target = world.getAllPlayers().find(p => p.name === targetName);
            
            if (sender) this.sendPrivateMessage(`§cTeleport request to ${targetName} has expired.`, sender);
            if (target) this.sendPrivateMessage(`§cTeleport request from ${request.senderName} has expired.`, target);
            
            this.cleanupRequest(targetName);
        }
    }

    cleanupRequest(targetName) {
        const request = this.pendingRequests.get(targetName);
        if (request) {
            system.clearRun(request.timeout);
            this.activeSenders.delete(request.senderName);
            this.pendingRequests.delete(targetName);
        }
    }
}

// Esporta una singola istanza del sistema
export const tpaSystem = new TPASystem();