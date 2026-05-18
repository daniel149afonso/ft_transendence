import Phaser from "phaser";

const WALK_COLS_PER_ROW = 17;
const WALK_DIRS = [
    { key: "down",  row: 0 },
    { key: "right", row: 1 },
    { key: "up",    row: 2 },
    { key: "left",  row: 3 },
];
const ATTACK_DIRS = [
    { key: "down",  row: 4 },
    { key: "up",    row: 5 },
    { key: "right", row: 6 },
    { key: "left",  row: 7 },
];

// x-offset shifts from 3→11 when texture switches from 16px to 32px wide frame,
// so the body stays at the same world position during attack animations.
const BODY_OFFSET_WALK   = { x: 3,  y: 8 };
const BODY_OFFSET_ATTACK = { x: 11, y: 8 };
const ATTACK_ZONE_OFFSET = 29;

export class Player {
    readonly sprite: Phaser.Physics.Arcade.Sprite;
    readonly attackZone: Phaser.Physics.Arcade.Image;

    facingDir = "down";
    isAttacking = false;
    hp = 6;
    invincible  = false;
    knockedBack = false; // blocks move() while knockback velocity is active

    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        this.scene = scene;

        this.sprite = scene.physics.add.sprite(x, y, "player");
        this.sprite.setScale(1.8).setCollideWorldBounds(true);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(10, 19).setOffset(BODY_OFFSET_WALK.x, BODY_OFFSET_WALK.y);
        body.pushable = false;

        this.createAnimations();
        this.sprite.anims.play("walk-down");
        this.sprite.on("animationcomplete", this.onAnimComplete, this);

        // Separate hitbox for attack — never modifies the player's own body
        this.attackZone = scene.physics.add.image(0, 0, "pixel").setVisible(false).setActive(false);
        const az = this.attackZone.body as Phaser.Physics.Arcade.Body;
        az.setEnable(false);
        az.debugShowBody = false;
    }

    // Called every frame from MainScene.update()
    handleInput(
        cursors: Phaser.Types.Input.Keyboard.CursorKeys,
        wasd:    { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key },
        spaceKey: Phaser.Input.Keyboard.Key,
    ) {
        if (Phaser.Input.Keyboard.JustDown(spaceKey) && !this.isAttacking) {
            this.startAttack();
            return;
        }
        if (this.isAttacking || this.knockedBack) return;
        this.move(cursors, wasd);
    }

    // Reduce HP by 1 half-heart and knock back away from (fromX, fromY).
    // Calls onDead() if HP reaches 0.
    takeDamage(fromX: number, fromY: number, onDead: () => void) {
        if (this.invincible || this.hp <= 0) return;
        this.hp = Math.max(0, this.hp - 1);

        const dir = new Phaser.Math.Vector2(
            this.sprite.x - fromX,
            this.sprite.y - fromY,
        ).normalize();
        (this.sprite.body as Phaser.Physics.Arcade.Body)
            .setVelocity(dir.x * 180, dir.y * 180);

        // Block move() for 200ms so it doesn't override the knockback velocity
        this.knockedBack = true;
        this.scene.time.delayedCall(200, () => { this.knockedBack = false; });

        if (this.hp <= 0) { onDead(); return; }
        this.flashInvincible();
    }

    // --- private ---

    private startAttack() {
        this.isAttacking = true;
        this.sprite.setVelocity(0);
        this.sprite.anims.play(`attack-${this.facingDir}`, true);
        (this.sprite.body as Phaser.Physics.Arcade.Body)
            .setOffset(BODY_OFFSET_ATTACK.x, BODY_OFFSET_ATTACK.y);
        this.enableAttackZone();
    }

    private move(
        cursors: Phaser.Types.Input.Keyboard.CursorKeys,
        wasd:    { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key },
    ) {
        const speed = 150;
        const left  = cursors.left.isDown  || wasd.left.isDown;
        const right = cursors.right.isDown || wasd.right.isDown;
        const up    = cursors.up.isDown    || wasd.up.isDown;
        const down  = cursors.down.isDown  || wasd.down.isDown;

        let vx = 0, vy = 0;
        if (left)  vx -= speed;
        if (right) vx += speed;
        if (up)    vy -= speed;
        if (down)  vy += speed;

        // Normalize diagonal speed
        if (vx !== 0 && vy !== 0) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }

        this.sprite.setVelocity(vx, vy);

        if (left)       { this.facingDir = "left";  this.sprite.anims.play("walk-left",  true); }
        else if (right) { this.facingDir = "right"; this.sprite.anims.play("walk-right", true); }
        else if (up)    { this.facingDir = "up";    this.sprite.anims.play("walk-up",    true); }
        else if (down)  { this.facingDir = "down";  this.sprite.anims.play("walk-down",  true); }
        else            { this.sprite.anims.stop(); }
    }

    private onAnimComplete(anim: Phaser.Animations.Animation) {
        if (!anim.key.startsWith("attack-")) return;
        this.isAttacking = false;
        this.disableAttackZone();
        (this.sprite.body as Phaser.Physics.Arcade.Body)
            .setOffset(BODY_OFFSET_WALK.x, BODY_OFFSET_WALK.y);
        this.sprite.anims.play(`walk-${this.facingDir}`, true);
    }

    private enableAttackZone() {
        const px = this.sprite.x;
        const py = this.sprite.y;
        let zx = px, zy = py;
        switch (this.facingDir) {
            case "down":  zy = py + ATTACK_ZONE_OFFSET; break;
            case "up":    zy = py - ATTACK_ZONE_OFFSET; break;
            case "right": zx = px + ATTACK_ZONE_OFFSET; break;
            case "left":  zx = px - ATTACK_ZONE_OFFSET; break;
        }
        this.attackZone.setPosition(zx, zy).setActive(true);
        const body = this.attackZone.body as Phaser.Physics.Arcade.Body;
        body.reset(zx, zy);
        body.setSize(25, 25);
        body.setEnable(true);
        body.debugShowBody = true;
    }

    private disableAttackZone() {
        this.attackZone.setActive(false);
        const body = this.attackZone.body as Phaser.Physics.Arcade.Body;
        body.setEnable(false);
        body.debugShowBody = false;
    }

    private flashInvincible() {
        this.invincible = true;
        this.scene.tweens.add({
            targets:  this.sprite,
            alpha:    0.3,
            duration: 80,
            repeat:   5,
            yoyo:     true,
            onComplete: () => { this.sprite.setAlpha(1); this.invincible = false; },
        });
    }

    private createAnimations() {
        WALK_DIRS.forEach(({ key, row }) => {
            const start = row * WALK_COLS_PER_ROW;
            this.scene.anims.create({
                key: `walk-${key}`,
                frames: this.scene.anims.generateFrameNumbers("player", {
                    frames: [start, start + 1, start + 2],
                }),
                frameRate: 8,
                repeat: -1,
            });
        });
        ATTACK_DIRS.forEach(({ key, row }) => {
            const start = row * 8;
            this.scene.anims.create({
                key: `attack-${key}`,
                frames: this.scene.anims.generateFrameNumbers("player-atk", {
                    frames: [start, start + 1, start + 2, start + 3],
                }),
                frameRate: 10,
                repeat: 0,
            });
        });
    }
}
