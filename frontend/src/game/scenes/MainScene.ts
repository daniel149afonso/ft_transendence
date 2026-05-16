import Phaser from "phaser";
import mapData from "../maps/map.json";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    spaceKey!: Phaser.Input.Keyboard.Key;
    facingDir = "down";
    isAttacking = false;
    debugText!: Phaser.GameObjects.Text;

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.image("map", "src/game/assets/map.png");
        this.load.spritesheet("player", "src/game/assets/player.png", {
            frameWidth: 16,
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

        // COLLISION WALLS — obstacle layers (grass, ground and fences are walkable)
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
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(10, 8).setOffset(3, 24);

        // ANIMATIONS — 17 cols per row, 3 frames per direction
        const COLS_PER_ROW = 17;
        const fps = 8;
        const dirs: { key: string; row: number }[] = [
            { key: "down",  row: 0 },
            { key: "right", row: 1 },
            { key: "up",    row: 2 },
            { key: "left",  row: 3 },
        ];
        dirs.forEach(({ key, row }) => {
            const start = row * COLS_PER_ROW;
            this.anims.create({
                key: `walk-${key}`,
                frames: this.anims.generateFrameNumbers("player", { frames: [start, start + 1, start + 2] }),
                frameRate: fps,
                repeat: -1,
            });
        });

        // Attack animations — bottom half of spritesheet (rows 4-7)
        const attackDirs: { key: string; row: number }[] = [
            { key: "down",  row: 4 },
            { key: "up",    row: 5 },
            { key: "right", row: 6 },
            { key: "left",  row: 7 },
        ];
        attackDirs.forEach(({ key, row }) => {
            const start = row * COLS_PER_ROW;
            this.anims.create({
                key: `attack-${key}`,
                frames: this.anims.generateFrameNumbers("player", { frames: [start, start + 1, start + 2, start + 3] }),
                frameRate: 12,
                repeat: 0,
            });
        });
        this.player.anims.play("walk-down");

        this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
            if (anim.key.startsWith("attack-")) {
                this.isAttacking = false;
                this.player.anims.play(`walk-${this.facingDir}`, true);
            }
        });

        // DEBUG — frame number display (remove once correct frames are identified)
        this.debugText = this.add.text(8, 8, "", { fontSize: "14px", color: "#ffff00" }).setScrollFactor(0).setDepth(10);

        // COLLIDER
        this.physics.add.collider(this.player, walls);

        // CAMERA — Zelda-like: zoom in so the map is larger than the viewport,
        // smooth lerp follow, bounded to world edges
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
        // Attack takes full control until the animation finishes
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.isAttacking) {
            this.isAttacking = true;
            this.player.setVelocity(0);
            this.player.anims.play(`attack-${this.facingDir}`, true);
        }

        this.debugText.setText(`frame: ${this.player.frame.name} | anim: ${this.player.anims.currentAnim?.key ?? "none"}`);

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

        // Track facing direction and play walk animation
        if (left)       { this.facingDir = "left";  this.player.anims.play("walk-left",  true); }
        else if (right) { this.facingDir = "right"; this.player.anims.play("walk-right", true); }
        else if (up)    { this.facingDir = "up";    this.player.anims.play("walk-up",    true); }
        else if (down)  { this.facingDir = "down";  this.player.anims.play("walk-down",  true); }
        else            { this.player.anims.stop(); }
    }
}
