import Phaser from "phaser";

const HUD_X          = 20;
const HUD_Y          = 20;
const HEART_SPACING  = 36;
const HEART_FRAME    = 4;   // frame 1 of objects.png = full red heart (16×16)
const HEART_SCALE    = 2;
const HEARTS_COUNT   = 3;   // 3 hearts = 6 half-hearts max

export class HUD {
    private hearts:   Phaser.GameObjects.Image[] = [];
    private heartsBg: Phaser.GameObjects.Image[] = [];

    constructor(scene: Phaser.Scene) {
        for (let i = 0; i < HEARTS_COUNT; i++) {
            const x = HUD_X + i * HEART_SPACING;

            // Empty heart background (dark tint)
            this.heartsBg.push(
                scene.add.image(x, HUD_Y, "objects", HEART_FRAME)
                    .setScrollFactor(0)
                    .setScale(HEART_SCALE)
                    .setTint(0x333333)
                    .setDepth(100),
            );

            // Filled heart foreground (cropped to show fill level)
            this.hearts.push(
                scene.add.image(x, HUD_Y, "objects", HEART_FRAME)
                    .setScrollFactor(0)
                    .setScale(HEART_SCALE)
                    .setDepth(101),
            );
        }
    }

    // Call with current hp value (0–6) to refresh the display.
    update(hp: number) {
        for (let i = 0; i < HEARTS_COUNT; i++) {
            const remaining = hp - i * 2;
            const heart = this.hearts[i];

            if (remaining >= 2) {
                heart.setVisible(true).setCrop(0, 0, 16, 16);  // full heart
            } else if (remaining === 1) {
                heart.setVisible(true).setCrop(0, 0, 8, 16);   // half heart
            } else {
                heart.setVisible(false);                         // empty
            }
        }
    }
}
