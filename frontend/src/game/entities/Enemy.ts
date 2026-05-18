import Phaser from "phaser";

type EnemyState = "sleeping" | "chasing";

const WAKE_DISTANCE  = 120;
const ENEMY_SPEED    = 60;
const KNOCKBACK      = 220;
const STUN_DURATION  = 250; // ms — prevent update() from overriding knockback velocity

export class Enemy {
    readonly sprite: Phaser.Physics.Arcade.Sprite;

    hp      = 3;
    state: EnemyState = "sleeping";

    private scene:   Phaser.Scene;
    private stunned = false;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;

        scene.anims.create({
            key:       "enemy-sleep",
            frames:    scene.anims.generateFrameNumbers("enemy", { frames: [4] }),
            frameRate: 1,
            repeat:    -1,
        });
        scene.anims.create({
            key:       "enemy-walk",
            frames:    scene.anims.generateFrameNumbers("enemy", { frames: [0, 1, 2, 3] }),
            frameRate: 6,
            repeat:    -1,
        });

        this.sprite = scene.physics.add.sprite(x, y, "enemy");
        this.sprite.setScale(1.8).setCollideWorldBounds(true);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(16, 20).setOffset(8, 9);
        body.pushable = false;
        this.sprite.anims.play("enemy-sleep");
    }

    // Called every frame from MainScene.update()
    update(playerX: number, playerY: number) {
        if (!this.sprite.active || this.stunned) return;

        const dist = Phaser.Math.Distance.Between(
            this.sprite.x, this.sprite.y, playerX, playerY
        );
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;

        if (this.state === "sleeping") {
            body.setImmovable(true);
            if (dist < WAKE_DISTANCE) {
                this.state = "chasing";
                body.setImmovable(false);
                this.sprite.anims.play("enemy-walk", true);
            }
        } else {
            this.scene.physics.moveToObject(this.sprite, { x: playerX, y: playerY }, ENEMY_SPEED);
            this.sprite.setFlipX(playerX < this.sprite.x);
        }
    }

    // Called by the attack overlap in MainScene
    takeHit(
        playerX: number,
        playerY: number,
        attackZoneBody: Phaser.Physics.Arcade.Body,
    ) {
        // One hit per swing — disable the attack zone immediately
        attackZoneBody.setEnable(false);
        attackZoneBody.debugShowBody = false;

        this.hp -= 1;

        const dir = new Phaser.Math.Vector2(
            this.sprite.x - playerX,
            this.sprite.y - playerY,
        ).normalize();
        (this.sprite.body as Phaser.Physics.Arcade.Body)
            .setVelocity(dir.x * KNOCKBACK, dir.y * KNOCKBACK);

        // Freeze AI briefly so update() doesn't override the knockback velocity
        this.stunned = true;
        this.scene.time.delayedCall(STUN_DURATION, () => { this.stunned = false; });

        if (this.hp <= 0) {
            this.die();
        } else {
            this.scene.tweens.add({
                targets:  this.sprite,
                alpha:    0.3,
                duration: 60,
                yoyo:     true,
                onComplete: () => this.sprite.setAlpha(1),
            });
        }
    }

    private die() {
        this.scene.tweens.add({
            targets:  this.sprite,
            alpha:    0,
            duration: 60,
            repeat:   3,
            yoyo:     true,
            onComplete: () => {
                this.sprite.setActive(false).setVisible(false);
                const body = this.sprite.body as Phaser.Physics.Arcade.Body;
                body.setEnable(false);
                body.debugShowBody    = false;
                body.debugShowVelocity = false;
            },
        });
    }
}
