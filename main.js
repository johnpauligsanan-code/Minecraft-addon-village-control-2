// main.js
import { world, system } from "@minecraft/server";
import { AnghelosBlockInteraction } from "./blockInteraction.js";
import { SeatingSystem } from "./seatingSystem.js";
import { AnghelosTreeCapitator } from "./AnghelosTreeCapitator.js";
import { AnghelosMiner } from "./AnghelosMiner.js";
import { AnghelosDigger } from "./AnghelosDigger.js";
import { AnghelosHoe } from "./AnghelosHoe.js";
import { homeSystem } from "./homeSystem.js";
import { tpaSystem } from "./tpaSystem.js";
import { playerEventsSystem } from './PlayerEventsSystem.js';
import { AnghelosTankShooter } from "./tankShooterSystem.js";
import { AnghelosVillageControllerPlacer } from "./AnghelosVillageControllerPlacer.js";
import { capitalSystem } from './CapitalSystem.js';
import { AnghelosStarterItems } from './AnghelosStarterItems.js';

// Initialize directly on first tick instead of waiting for worldLoad.
// In newer Minecraft versions, worldLoad may have already fired by the time
// the script module loads, causing the callback to never execute.
system.run(() => {
    try {
        // Block interaction system
        const blockInteraction = new AnghelosBlockInteraction();
        blockInteraction.initialize();

        // Seating system
        const seatingSystem = new SeatingSystem();

        // Tree Capitator
        const treeCapitator = new AnghelosTreeCapitator();
        treeCapitator.initialize();

        // Miner
        const miner = new AnghelosMiner();
        miner.initialize();

        // Digger
        const digger = new AnghelosDigger();
        digger.initialize();

        // Hoe
        const hoe = new AnghelosHoe();
        hoe.initialize();

        // Home system
        homeSystem.initialize();

        // TPA system
        tpaSystem.initialize();

        // Player events system
        playerEventsSystem.initialize();

        // Tank shooter system
        const tankShooter = new AnghelosTankShooter();
        tankShooter.initialize();

        // Village controller placer
        const villageControllerPlacer = new AnghelosVillageControllerPlacer();
        villageControllerPlacer.initialize();

        // Capital system
        capitalSystem.initialize();

        // Starter items
        const starterItems = new AnghelosStarterItems();
        starterItems.initialize();

    } catch (error) {
        console.error("Error initializing Anghelos systems:", error);
    }
});
