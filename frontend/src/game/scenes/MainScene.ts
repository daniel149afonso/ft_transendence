import Phaser from "phaser";
import mapData from "../maps/map.json";

type EnemyState = "sleeping" | "chasing";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    enemy!: Phaser.Physics.Arcade.Sprite;
    enemyState: EnemyState = "sleeping";
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    spaceKey!: Phaser.Input.Keyboard.Key;
    facingDir = "down";
    isAttacking = false;

    private readonly WAKE_DISTANCE = 120;
    private readonly ENEMY_SPEED   = 60;

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.image("map", "src/game/assets/map.png");
        // Walk — 17 cols × 8 rows (16×32 per frame)
        this.load.spritesheet("player", "src/game/assets/player.png", {
            frameWidth: 16,
            frameHeight: 32,
        });
        // Attack — frames de 32×32 (chaque pose = 2 colonnes de 16px assemblées)
        this.load.spritesheet("player-atk", "src/game/assets/player.png", {
            frameWidth: 32,
            frameHeight: 32,
        });
        // Enemy — 4 cols × 4 rows (32×32 per frame)
        this.load.spritesheet("enemy", "src/game/assets/enemy.png", {
            frameWidth: 32,
            frameHeight: 32,
        });
    }

    create() {
        const MAP_W = 800;
        const MAP_H = 600;
        const COLS = 30;
        const ROWS = 20;
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        // MAP
        this.add.image(0, 0, "map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        // COLLISION WALLS
        const OBSTACLE_LAYERS = ["Trees", "Houses", "Rocks", "Water", "Tower", "Fences"];
        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff);
        gfx.fillRect(0, 0, 1, 1);
        gfx.generateTexture("pixel", 1, 1);
        gfx.destroy();

        const walls = this.physics.add.staticGroup();
        const layers = mapData.layers as { name: string; data: number[] }[];
        layers
            .filter(l => OBSTACLE_LAYERS.includes(l.name))
            .forEach(layer => {
                layer.data.forEach((tile, index) => {
                    if (tile === 0) return;
                    const col = index % COLS;
                    const row = Math.floor(index / COLS);
                    const x = col * tileW + tileW / 2;
                    const y = row * tileH + tileH / 2;
                    (walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite)
                        .setVisible(false)
                        .setDisplaySize(tileW, tileH)
                        .refreshBody();
                });
            });

        // PLAYER
        this.player = this.physics.add.sprite(240, 240, "player");
        this.player.setScale(1.8);
        this.player.setCollideWorldBounds(true);
        const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
        playerBody.setSize(10, 19).setOffset(3, 8);
        playerBody.pushable = false;

        const COLS_PER_ROW = 17;

        // WALK ANIMATIONS — rows 0-3, 3 frames each
        const walkDirs: { key: string; row: number }[] = [
            { key: "down",  row: 0 },
            { key: "right", row: 1 },
            { key: "up",    row: 2 },
            { key: "left",  row: 3 },
        ];
        walkDirs.forEach(({ key, row }) => {
            const start = row * COLS_PER_ROW;
            this.anims.create({
                key: `walk-${key}`,
                frames: this.anims.generateFrameNumbers("player", { frames: [start, start + 1, start + 2] }),
                frameRate: 8,
                repeat: -1,
            });
        });

        // ATTACK ANIMATIONS — "player-atk" texture, frameWidth 32px
        // Math.floor(272/32) = 8 cols per row
        // 8 × 16px frames = 4 × 32px frames per direction (rows 4-7)
        const attackDirs: { key: string; row: number }[] = [
            { key: "down",  row: 4 },
            { key: "up",    row: 5 },
            { key: "right", row: 6 },
            { key: "left",  row: 7 },
        ];
        attackDirs.forEach(({ key, row }) => {
            const start = row * 8; // 8 cols per row at 32px
            this.anims.create({
                key: `attack-${key}`,
                frames: this.anims.generateFrameNumbers("player-atk", {
                    frames: [start, start+1, start+2, start+3],
                }),
                frameRate: 10,
                repeat: 0,
            });
        });

        this.player.anims.play("walk-down");

        this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
            if (anim.key.startsWith("attack-")) {
                this.isAttacking = false;
                this.resetHitbox();
                this.player.anims.play(`walk-${this.facingDir}`, true);
            }
        });

        // ENEMY ANIMATIONS — 6 cols × 4 rows (frameWidth=32)
        // cols 0-3 = walk loop, col 4 = sleep
        this.anims.create({
            key: "enemy-sleep",
            frames: this.anims.generateFrameNumbers("enemy", { frames: [4] }),
            frameRate: 1,
            repeat: -1,
        });
        this.anims.create({
            key: "enemy-walk",
            frames: this.anims.generateFrameNumbers("enemy", { frames: [0, 1, 2, 3] }),
            frameRate: 6,
            repeat: -1,
        });

        // ENEMY SPRITE
        this.enemy = this.physics.add.sprite(400, 300, "enemy");
        this.enemy.setScale(1.8);
        this.enemy.setCollideWorldBounds(true);
        const enemyBody = this.enemy.body as Phaser.Physics.Arcade.Body;
        enemyBody.setSize(16, 20).setOffset(8, 9);
        enemyBody.pushable = false;
        this.enemy.anims.play("enemy-sleep");

        // COLLIDERS — order matters: player-walls must be last so it corrects
        // any position the enemy may have pushed the player into during the same frame
        this.physics.add.collider(this.enemy, walls);
        this.physics.add.collider(this.player, this.enemy, () => {
            (this.enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        });
        this.physics.add.collider(this.player, walls);

        // CAMERA
        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setLerp(0.1, 0.1);
        this.cameras.main.startFollow(this.player, true);

        // INPUT
        this.cursors  = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
    }

    update() {
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isAttacking) {
            this.isAttacking = true;
            this.player.setVelocity(0);
            this.player.anims.play(`attack-${this.facingDir}`, true);
            this.setAttackHitbox();
        }

        if (this.isAttacking) return;

        const speed = 150;
        const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
        const right = this.cursors.right.isDown || this.wasd.right.isDown;
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown;

        let vx = 0;
        let vy = 0;
        if (left)  vx -= speed;
        if (right) vx += speed;
        if (up)    vy -= speed;
        if (down)  vy += speed;

        if (vx !== 0 && vy !== 0) {
            vx *= Math.SQRT1_2;
            vy *= Math.SQRT1_2;
        }

        this.player.setVelocity(vx, vy);

        if (left)       { this.facingDir = "left";  this.player.anims.play("walk-left",  true); }
        else if (right) { this.facingDir = "right"; this.player.anims.play("walk-right", true); }
        else if (up)    { this.facingDir = "up";    this.player.anims.play("walk-up",    true); }
        else if (down)  { this.facingDir = "down";  this.player.anims.play("walk-down",  true); }
        else            { this.player.anims.stop(); }

        this.updateEnemy();
    }

    private resetHitbox() {
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(10, 19).setOffset(3, 8);
    }

    private setAttackHitbox() {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        switch (this.facingDir) {
            case "down":  body.setSize(10, 30).setOffset(3, 8);   break;
            case "up":    body.setSize(10, 30).setOffset(3, -10); break;
            case "right": body.setSize(22, 19).setOffset(3, 8);   break;
            case "left":  body.setSize(22, 19).setOffset(-9, 8);  break;
        }
    }

    private updateEnemy() {
        const dist = Phaser.Math.Distance.Between(
            this.enemy.x, this.enemy.y,
            this.player.x, this.player.y
        );

        if (this.enemyState === "sleeping") {
            (this.enemy.body as Phaser.Physics.Arcade.Body).setImmovable(true);
            if (dist < this.WAKE_DISTANCE) {
                this.enemyState = "chasing";
                (this.enemy.body as Phaser.Physics.Arcade.Body).setImmovable(false);
                this.enemy.anims.play("enemy-walk", true);
            }
        } else if (this.enemyState === "chasing") {
            this.physics.moveToObject(this.enemy, this.player, this.ENEMY_SPEED);
            this.enemy.setFlipX(this.player.x < this.enemy.x);
        }
    }
}
