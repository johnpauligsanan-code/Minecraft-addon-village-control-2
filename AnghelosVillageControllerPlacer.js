import { world, system, EquipmentSlot } from "@minecraft/server";

export class AnghelosVillageControllerPlacer {
    constructor() {
        this.lastUseTimes = new Map();
        this.COOLDOWN = 5000;
        console.log("[VCP] Class instantiated");
    }

    initialize() {
        console.log("[VCP] ========== INITIALIZING VILLAGE CONTROLLER PLACER ==========");
        world.afterEvents.itemUseOn.subscribe((event) => {
            console.log("[VCP] ===== itemUseOn EVENT FIRED =====");
            console.log("[VCP] Source:", event.source?.name);
            console.log("[VCP] Item:", event.itemStack?.typeId);
            console.log("[VCP] Block:", event.block?.typeId);
            console.log("[VCP] Location:", event.block?.location);
            this._handleUseOn(event);
        });

        world.afterEvents.playerInteractWithBlock.subscribe((event) => {
            console.log("[VCP] ===== playerInteractWithBlock EVENT FIRED =====");
            console.log("[VCP] Player:", event.player?.name);
            console.log("[VCP] Block:", event.block?.typeId);
            this._handleInteract(event);
        });

        console.log("[VCP] ========== INITIALIZATION COMPLETE ==========");
    }

    _handleUseOn(event) {
        try {
            const player = event.source;
            const item = event.itemStack;
            console.log("[VCP] _handleUseOn called");
            console.log("[VCP] Item exists:", !!item);
            if (!item) {
                console.log("[VCP] No item in itemUseOn event");
                return;
            }

            const itemTypeLower = item.typeId.toLowerCase();
            console.log("[VCP] Item typeId:", item.typeId);
            console.log("[VCP] Expected:", "anghelos:village_controller_placer");
            console.log("[VCP] Match:", itemTypeLower === "anghelos:village_controller_placer");
            if (itemTypeLower !== "anghelos:village_controller_placer") {
                console.log("[VCP] Wrong item type");
                return;
            }

            const block = event.block;
            const spawnPos = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
            console.log("[VCP] Correct item detected in itemUseOn! Spawning controller...");
            this._spawnController(player, spawnPos);
        } catch (e) {
            console.error("[VCP] ERROR in itemUseOn:", e);
        }
    }

    _handleInteract(event) {
        try {
            const player = event.player;
            console.log("[VCP] _handleInteract called");
            if (!player) {
                console.log("[VCP] No player in event");
                return;
            }

            const equipComp = player.getComponent("minecraft:equippable");
            if (!equipComp) {
                console.log("[VCP] No equippable component");
                return;
            }

            const heldItem = equipComp.getEquipment(EquipmentSlot.Mainhand);
            if (!heldItem) {
                console.log("[VCP] No item in mainhand");
                return;
            }

            const itemTypeLower = heldItem.typeId.toLowerCase();
            console.log("[VCP] Held item typeId:", heldItem.typeId);
            console.log("[VCP] Expected:", "anghelos:village_controller_placer");
            console.log("[VCP] Match:", itemTypeLower === "anghelos:village_controller_placer");
            if (itemTypeLower !== "anghelos:village_controller_placer") {
                console.log("[VCP] Wrong item in interact");
                return;
            }

            const block = event.block;
            const spawnPos = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
            console.log("[VCP] Correct item detected in interact! Spawning controller...");
            this._spawnController(player, spawnPos);
        } catch (e) {
            console.error("[VCP] ERROR in playerInteractWithBlock:", e);
        }
    }

    _spawnController(player, spawnPos) {
        console.log("[VCP] _spawnController called");
        const now = Date.now();
        const last = this.lastUseTimes.get(player.id) || 0;
        const timeDiff = now - last;
        console.log("[VCP] Time since last use:", timeDiff, "ms");
        console.log("[VCP] Cooldown:", this.COOLDOWN, "ms");
        if (timeDiff <= this.COOLDOWN) {
            console.log("[VCP] Still on cooldown");
            return;
        }

        this.lastUseTimes.set(player.id, now);
        const dimension = player.dimension;
        const playerName = player.name;
        const playerId = player.id;
        console.log("[VCP] Player:", playerName);
        console.log("[VCP] Spawn position:", spawnPos);
        system.run(() => {
            console.log("[VCP] system.run callback executing");
            try {
                const currentPlayer = world.getAllPlayers().find(p => p.id === playerId);
                if (!currentPlayer) {
                    console.error("[VCP] Player not found");
                    return;
                }
                console.log("[VCP] Player found, proceeding");
                try {
                    console.log("[VCP] Removing item from mainhand...");
                    currentPlayer.runCommand("replaceitem entity @s slot.weapon.mainhand 0 air");
                    console.log("[VCP] Item removed");
                } catch (e) {
                    console.warn("[VCP] Failed to remove item:", e);
                }

                let controller;
                try {
                    console.log("[VCP] Spawning entity at", spawnPos);
                    controller = dimension.spawnEntity("anghelos:controller", spawnPos);
                    console.log("[VCP] Entity spawned successfully!");
                } catch (e) {
                    console.error("[VCP] spawnEntity FAILED:", e);
                    currentPlayer.sendMessage("Failed to spawn Village Controller!");
                    return;
                }

                try {
                    controller.nameTag = playerName + " Village";
                    console.log("[VCP] Name tag set");
                } catch (e) {
                    console.warn("[VCP] Failed to set name tag:", e);
                }

                try {
                    const tameable = controller.getComponent("minecraft:tameable");
                    if (tameable) {
                        tameable.tame(currentPlayer);
                        console.log("[VCP] Entity tamed");
                    }
                } catch (e) {
                    console.warn("[VCP] Tame failed:", e);
                }

                currentPlayer.sendMessage("Village Controller placed!");
                console.log("[VCP] SPAWN COMPLETE");
            } catch (e) {
                console.error("[VCP] ERROR in system.run:", e);
            }
        });
    }
}