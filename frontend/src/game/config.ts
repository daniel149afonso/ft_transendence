import Phaser from "phaser";
import MainScene    from "./scenes/MainScene";
import DungeonScene from "./scenes/DungeonScene";

export const gameConfig: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,

    width: 800,
    height: 600,

    parent: "game-container",

    physics: {
        default: "arcade",
        arcade: {
            debug: true,
            debugBodyColor: 0xff0000,
            debugStaticBodyColor: 0xff0000,
        }
    },

    scene: [MainScene, DungeonScene]
};