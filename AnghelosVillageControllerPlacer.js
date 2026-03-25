import { world, system, EquipmentSlot } from "@minecraft/server";

export class AnghelosVillageControllerPlacer {
    constructor() {
        this.lastUseTimes = new Map();
        this.COOLDOWN = 5000;
    }

    initialize() {
        // PRIMARY: afterEvents.itemUseOn fires when player taps/uses item ON a block face
        // This is reliable on BOTH mobile (tap block) and PC (right-click block)
        world.afterEvents.itemUseOn.subscribe((event) => {
            this._handleUseOn(event);
        });

        // FALLBACK: afterEvents.playerInteractWithBlock for any missed cases
        world.afterEvents.playerInteractWithBlock.subscribe((event) => {
            this._handleInteract(event);
        });
    }

    _handleUseOn(event) {
        try {
            const player = event.source;
            const item = event.itemStack;
            if (!item) return;
            if (item.typeId.toLowerCase() !== "anghelos:village_controller_placer") return;

            const block = event.block;
            const spawnPos = {
                x: block.location.x + 0.5,
                y: block.location.y + 1,
                z: block.location.z + 0.5
            };

            this._spawnController(player, spawnPos);
        } catch (e) {
            console.error("[VCP] itemUseOn error:", e);
        }
    }

    _handleInteract(event) {
        try {
            const player = event.player;
            // afterEvents.playerInteractWithBlock uses event.player not event.source
            if (!player) return;

            // Get held item from equipment component - most reliable method
            const equipComp = player.getComponent("minecraft:equippable");
            if (!equipComp) return;
            const heldItem = equipComp.getEquipment(EquipmentSlot.Mainhand);
            if (!heldItem) return;
            if (heldItem.typeId.toLowerCase() !== "anghelos:village_controller_placer") return;

            const block = event.block;
            const spawnPos = {
                x: block.location.x + 0.5,
                y: block.location.y + 1,
                z: block.location.z + 0.5
            };

            this._spawnController(player, spawnPos);
        } catch (e) {
            console.error("[VCP] playerInteractWithBlock error:", e);
        }
    }

    _spawnController(player, spawnPos) {
        // Cooldown check
        const now = Date.now();
        const last = this.lastUseTimes.get(player.id) || 0;
        if (now - last <= this.COOLDOWN) return;
        this.lastUseTimes.set(player.id, now);

        const dimension = player.dimension;
        const playerName = player.name;
        const playerId = player.id;

        system.run(() => {
            try {
                // Use getAllPlayers().find() - guaranteed to work for player lookup
                const currentPlayer = world.getAllPlayers().find(p => p.id === playerId);
                if (!currentPlayer) {
                    console.warn("[VCP] Player not found:", playerId);
                    return;
                }

                // Step 1: Remove the placer item from hand
                try {
                    currentPlayer.runCommand("replaceitem entity @s slot.weapon.mainhand 0 air");
                } catch (e) {
                    console.warn("[VCP] Failed to remove item:", e);
                }

                // Step 2: Spawn the controller entity
                let controller;
                try {
                    controller = dimension.spawnEntity("anghelos:controller", spawnPos);
                } catch (e) {
                    console.error("[VCP] spawnEntity failed:", e);
                    currentPlayer.sendMessage("§cFailed to spawn Village Controller! Make sure you are inside a valid village.");
                    return;
                }

                // Step 3: Set name tag
                controller.nameTag = `${playerName} Village`;

                // Step 4: Attempt tame (non-fatal if fails)
                try {
                    const tameable = controller.getComponent("minecraft:tameable");
                    if (tameable) {
                        tameable.tame(currentPlayer);
                    }
                } catch (e) {
                    console.warn("[VCP] Tame failed (non-fatal):", e);
                }

                // Step 5: Confirm to player
                currentPlayer.sendMessage("§aVillage Controller placed! It will self-destruct if not inside a village boundary.");

            } catch (e) {
                console.error("[VCP] system.run error:", e);
            }
        });
    }
}
