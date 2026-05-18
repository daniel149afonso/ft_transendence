import Phaser from "phaser";

export class GameOverScreen {
    static show(scene: Phaser.Scene) {
        const cx = scene.cameras.main.width  / 2;
        const cy = scene.cameras.main.height / 2;

        // Dark overlay
        scene.add.rectangle(cx, cy, scene.cameras.main.width, scene.cameras.main.height, 0x000000, 0.72)
            .setScrollFactor(0).setDepth(200);

        // Title
        scene.add.text(cx, cy - 50, "GAME OVER", {
            fontSize:        "48px",
            color:           "#ff3333",
            fontStyle:       "bold",
            stroke:          "#000000",
            strokeThickness: 6,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        // Restart button
        const btn = scene.add.rectangle(cx, cy + 40, 160, 48, 0xffffff)
            .setScrollFactor(0).setDepth(201)
            .setInteractive({ useHandCursor: true });

        scene.add.text(cx, cy + 40, "Restart", {
            fontSize:  "22px",
            color:     "#222222",
            fontStyle: "bold",
        }).setOrigin(0.5).setScrollFactor(0).setDepth(202);

        btn.on("pointerover",  () => btn.setFillStyle(0xdddddd));
        btn.on("pointerout",   () => btn.setFillStyle(0xffffff));
        btn.on("pointerdown",  () => scene.scene.restart());
    }
}
