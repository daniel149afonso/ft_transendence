import Phaser from "phaser";

export type ItemType = "heart" | "coin";

/** Probabilités de drop (35 % rien, 35 % coin, 30 % cœur) */
export function rollDrop(): ItemType | null {
    const r = Math.random();
    if (r < 0.30) return "heart";
    if (r < 0.65) return "coin";
    return null;
}

/**
 * DropItem — objet lâché par un ennemi à sa mort.
 *
 * Le bob (flottement) est géré en interne par un tween.
 * La scène est responsable de :
 *   1. Appeler scene.physics.add.overlap(player.sprite, drop.sprite, ...)
 *   2. Appeler drop.collect() quand l'overlap se produit.
 */
export class DropItem {
    readonly sprite: Phaser.Physics.Arcade.Sprite;
    readonly type: ItemType;
    collected = false;

    private bobTween: Phaser.Tweens.Tween;

    constructor(scene: Phaser.Scene, x: number, y: number, type: ItemType) {
        this.type = type;
        const key = type === "heart" ? "drop-heart" : "drop-coin";

        this.sprite = scene.physics.add.sprite(x, y, key)
            .setScale(1.8)
            .setDepth(3);

        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.setImmovable(true);
        body.setSize(10, 10); // petite hitbox de ramassage

        // Flottement Zelda-like
        this.bobTween = scene.tweens.add({
            targets:  this.sprite,
            y:        y - 5,
            duration: 700,
            yoyo:     true,
            repeat:   -1,
            ease:     "Sine.easeInOut",
        });
    }

    /**
     * Appelé par la scène lors de l'overlap.
     * Retourne `true` si le ramassage a bien eu lieu (non déjà collecté).
     */
    collect(): boolean {
        if (this.collected) return false;
        this.collected = true;

        this.bobTween.stop();

        // Désactiver la hitbox immédiatement pour éviter les doubles triggers
        (this.sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);

        // Animation de ramassage : monte + disparaît
        this.sprite.scene.tweens.add({
            targets:  this.sprite,
            y:        this.sprite.y - 14,
            alpha:    0,
            duration: 220,
            ease:     "Quad.easeOut",
            onComplete: () => this.sprite.destroy(),
        });

        return true;
    }
}
