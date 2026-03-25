import { world, system } from '@minecraft/server';

class PlayerEventsSystem {
    constructor() {
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;

        // Listen for player join event
        world.afterEvents.playerJoin.subscribe((event) => {
            const player = world.getAllPlayers().find(p => p.name === event.playerName);
            if (player) {
				if (player.getGameMode() === "adventure") {
					// Trigger the event on player
					player.triggerEvent("minecraft:become_survival");
				}
            }
        });

        // Listen for gamemode change event to preserve creative players from getting recked by the village controller
        world.afterEvents.playerGameModeChange.subscribe((event) => {
            const player = event.player;
            const newGameMode = event.toGameMode;

            if (newGameMode === "creative") {
                player.triggerEvent("minecraft:mark_creative");
            } else if (player.hasTag("AnghelosCreative")) {
                player.triggerEvent("minecraft:unmark_creative");
            }
        });

        // Listen for dimension change event		
		world.afterEvents.playerDimensionChange.subscribe((event) => {
			const player = event.player;
			// Check if player is in adventure mode before triggering survival
			if (player.getGameMode() === "adventure") {
				// Trigger the event on player
				player.triggerEvent("minecraft:become_survival");
			}
		});

        this.isInitialized = true;
    }
}

// Esporta una singola istanza del sistema
export const playerEventsSystem = new PlayerEventsSystem();