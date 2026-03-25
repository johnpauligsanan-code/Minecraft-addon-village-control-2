import { world, system, Direction } from "@minecraft/server";

export class AnghelosBlockInteraction {
    constructor() {
        // Map per tenere traccia dell'ultimo tempo di interazione per ciascun giocatore
        this.lastInteractionTimes = new Map();
        
        // Cooldown specifici per tipo di blocco (in millisecondi)
        this.COOLDOWNS = {
            "anghelos:factory": 3000,
            "anghelos:guide": 2000,
            "anghelos:village": 5000,
            "anghelos:center": 3000,
            "anghelos:server": 5000,
			"anghelos:center_two": 3000
        };
    }

    initialize() {
        world.beforeEvents.playerInteractWithBlock.subscribe(this.handleBlockInteraction.bind(this));
    }

    handleBlockInteraction(event) {
        const block = event.block;
        const itemStack = event.itemStack;
        const player = event.player;
        const face = event.blockFace;
        const blockCenter = block.location;
        const blockTypeId = block.typeId.toLowerCase();

        // Verifichiamo se l'interazione è con un blocco Anghelos e con un piccone qualsiasi
        if (
            (blockTypeId === "anghelos:factory" || 
             blockTypeId === "anghelos:guide" || 
             blockTypeId === "anghelos:village" || 
             blockTypeId === "anghelos:center" ||
			 blockTypeId === "anghelos:center_two" ||
             blockTypeId === "anghelos:server") && 
            itemStack?.typeId.toLowerCase().includes("pickaxe")
        ) {
            // Verifichiamo il cooldown
            const currentTime = Date.now();
            const lastTime = this.lastInteractionTimes.get(`${player.id}_${blockTypeId}`) || 0;
            const cooldownTime = this.COOLDOWNS[blockTypeId];

            if (currentTime - lastTime > cooldownTime) {
                this.lastInteractionTimes.set(`${player.id}_${blockTypeId}`, currentTime);
                
                // Gestione in base al tipo di blocco
                switch (blockTypeId) {
                    case "anghelos:factory":
                        this.handleFactoryBlock(player, face, blockCenter, block);
                        break;
                    case "anghelos:guide":
                        this.handleGuideBlock(player, face, blockCenter);
                        break;
                    case "anghelos:village":
                        this.handleVillageBlock(player, blockCenter, block);
                        break;
                    case "anghelos:center":
                        this.handleWarehouseBlock(player, face, blockCenter, block);
                        break;
					case "anghelos:center_two":
                        this.handleWarehouseTwoBlock(player, face, blockCenter, block);
                        break;
                    case "anghelos:server":
                        this.handleServerBlock(player, blockCenter, block);
                        break;
                }
            }
        }
    }

    handleFactoryBlock(player, face, blockCenter, block) {
        let rotation, adjx, adjy, adjz;
        
        switch (face) {
            case Direction.East: 
                rotation = 270; 
                adjx = 7; adjy = 3; adjz = 10; 
                break;
            case Direction.West: 
                rotation = 90; 
                adjx = 7; adjy = 3; adjz = 10; 
                break;
            case Direction.South: 
                rotation = 0; 
                adjx = 10; adjy = 3; adjz = 7; 
                break;
            case Direction.North: 
                rotation = 180; 
                adjx = 10; adjy = 3; adjz = 7; 
                break;
            default: return;
        }
        
        system.run(() => {
            this.executeFactoryCommands(player, rotation, blockCenter, adjx, adjy, adjz, block);
        });
    }

    async executeFactoryCommands(player, rotation, blockCenter, adjx, adjy, adjz, block) {
        const commands = [
            `structure load anghelosFactory ${blockCenter.x-adjx} ${blockCenter.y-adjy} ${blockCenter.z-adjz} ${rotation}_degrees`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
		block.setType("minecraft:air");
    }

    handleGuideBlock(player, face, blockCenter) {
        let rotation;
        
        switch (face) {
            case Direction.East: rotation = 90; break;
            case Direction.West: rotation = 270; break;
            case Direction.South: rotation = 180; break;
            case Direction.North: rotation = 0; break;
            default: return;
        }
        
        system.run(() => {
            this.executeGuideCommands(player, rotation, blockCenter);
        });
    }

    async executeGuideCommands(player, rotation, blockCenter) {
        const commands = [
            `structure load anghelosGuide ${blockCenter.x} ${blockCenter.y} ${blockCenter.z} ${rotation}_degrees`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
    }

    handleVillageBlock(player, blockCenter, block) {
        system.run(() => {
            this.executeVillageCommands(player, blockCenter).then(() => {
                block.setType("minecraft:air");
            });
        });
    }

    async executeVillageCommands(player, blockCenter) {
        const commands = [
            `structure load anghelosVillageTwo ${blockCenter.x -10} ${blockCenter.y -5} ${blockCenter.z -24}`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
    }

    handleWarehouseBlock(player, face, blockCenter, block) {
        let rotation, adjx, adjy, adjz;
        
        switch (face) {
            case Direction.East: 
                rotation = 90; 
                adjx = 13; adjy = 3; adjz = 6; 
                break;
            case Direction.West: 
                rotation = 270; 
                adjx = -1; adjy = 3; adjz = 6; 
                break;
            case Direction.South: 
                rotation = 180; 
                adjx = 6; adjy = 3; adjz = 13; 
                break;
            case Direction.North: 
                rotation = 0; 
                adjx = 6; adjy = 3; adjz = -1;  
                break;
            default: return;
        }
        
        system.run(() => {
            this.executeWarehouseCommands(player, rotation, blockCenter, adjx, adjy, adjz, block);
        });
    }
	
	handleWarehouseTwoBlock(player, face, blockCenter, block) {
        let rotation, adjx, adjy, adjz;
        
        switch (face) {
            case Direction.East: 
                rotation = 90; 
                adjx = 15; adjy = 3; adjz = 8; 
                break;
            case Direction.West: 
                rotation = 270; 
                adjx = -1; adjy = 3; adjz = 8; 
                break;
            case Direction.South: 
                rotation = 180; 
                adjx = 8; adjy = 3; adjz = 15; 
                break;
            case Direction.North: 
                rotation = 0; 
                adjx = 8; adjy = 3; adjz = -1;  
                break;
            default: return;
        }
        
        system.run(() => {
            this.executeWarehouseTwoCommands(player, rotation, blockCenter, adjx, adjy, adjz, block);
        });
    }

    async executeWarehouseCommands(player, rotation, blockCenter, adjx, adjy, adjz, block) {
        const commands = [
            `structure load AnghelosCityCenter ${blockCenter.x-adjx} ${blockCenter.y-adjy} ${blockCenter.z-adjz} ${rotation}_degrees`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
		
		block.setType("minecraft:air");
    }
	
	async executeWarehouseTwoCommands(player, rotation, blockCenter, adjx, adjy, adjz, block) {
        const commands = [
            `structure load AnghelosCityCenterTwo ${blockCenter.x-adjx} ${blockCenter.y-adjy} ${blockCenter.z-adjz} ${rotation}_degrees`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
		
		block.setType("minecraft:air");
    }

    handleServerBlock(player, blockCenter, block) {
        system.run(() => {
            this.executeServerCommands(player, blockCenter).then(() => {
                block.setType("minecraft:air");
            });
        });
    }

    async executeServerCommands(player, blockCenter) {
        const commands = [
            `structure load AnghelosServer ${blockCenter.x-27} ${blockCenter.y -6} ${blockCenter.z -27}`,
            `playsound random.anvil_use @a ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`,
            `setworldspawn ${blockCenter.x} ${blockCenter.y} ${blockCenter.z}`,
            `summon anghelos:controller ${blockCenter.x} ${blockCenter.y -4} ${blockCenter.z} ~~ Server_Operator SERVER`
        ];
        
        for (const cmd of commands) {
            await player.runCommand(cmd);
        }
    }
}