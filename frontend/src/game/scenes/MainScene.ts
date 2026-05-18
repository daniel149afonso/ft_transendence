import Phaser from "phaser";
import mapData from "../maps/map.json";
import { Player }         from "../entities/Player";
import { Enemy }          from "../entities/Enemy";
import { HUD }            from "../ui/HUD";
import { GameOverScreen } from "../ui/GameOverScreen";

const OBSTACLE_LAYERS = ["Tree", "House", "Rock", "Water", "Tower", "Fence"];
const MAP_W = 800;
const MAP_H = 600;
const COLS  = 30;
const ROWS  = 20;

export default class MainScene extends Phaser.Scene {
    private player!: Player;
    private enemy!:  Enemy;
    private hud!:    HUD;

    private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!:     { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private isGameOver   = false;
    private transitioning = false;
    private spawnX = 240;
    private spawnY = 240;

    constructor() { super("MainScene"); }

    init(data: { fromDungeon?: boolean }) {
        this.isGameOver   = false;
        this.transitioning = false;
        if (data?.fromDungeon) {
            // Spawn just below the tower door (col 22, row 8)
            this.spawnX = 22 * (MAP_W / COLS) + (MAP_W / COLS) / 2;
            this.spawnY =  8 * (MAP_H / ROWS) + (MAP_H / ROWS) / 2;
        } else {
            this.spawnX = 240;
            this.spawnY = 240;
        }
    }

    preload() {
        this.load.image("map", "src/game/assets/map.png");
        this.load.spritesheet("player",  "src/game/assets/player.png",  { frameWidth: 16, frameHeight: 32 });
        this.load.spritesheet("player-atk", "src/game/assets/player.png", { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("enemy",   "src/game/assets/enemy.png",   { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("objects", "src/game/assets/objects.png", { frameWidth: 16, frameHeight: 16 });
    }

    create() {
        this.add.image(0, 0, "map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        const walls = this.buildWalls();

        this.player = new Player(this, this.spawnX, this.spawnY);
        this.enemy  = new Enemy(this,  400, 300);
        this.hud    = new HUD(this);

        this.setupColliders(walls);
        this.setupDoorTransition();
        this.setupCamera();
        this.setupInput();

        this.hud.update(this.player.hp);
    }

    update() {
        if (this.isGameOver) return;

        this.player.handleInput(this.cursors, this.wasd, this.spaceKey);
        this.enemy.update(this.player.sprite.x, this.player.sprite.y);
        this.hud.update(this.player.hp);
    }

    // --- private ---

    private buildWalls(): Phaser.Physics.Arcade.StaticGroup {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        // Per-layer hitbox overrides (fractions of tile size: w/h = size, ox/oy = offset from top-left)
        const HITBOX: Record<string, { w: number; h: number; ox: number; oy: number }> = {
           //Tower: { w: 1.0, h: 1.0, ox: 0, oy: 0 }
        };
        // 1×1 white texture used as an invisible wall tile
        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
        gfx.generateTexture("pixel", 1, 1);
        gfx.destroy();

        const walls = this.physics.add.staticGroup();
        (mapData.layers as { name: string; data: number[] }[])
            .filter(l => OBSTACLE_LAYERS.includes(l.name))
            .forEach(layer => {
                const hb = HITBOX[layer.name];
                layer.data.forEach((tile, idx) => {
                    if (tile === 0) return;
                    const x = (idx % COLS) * tileW + tileW / 2;
                    const y = Math.floor(idx / COLS) * tileH + tileH / 2;
                    const s = (walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite)
                        .setVisible(false).setDisplaySize(tileW, tileH);
                    s.refreshBody(); // sync position depuis displaySize
                    if (hb) {
                        // modifier le body APRÈS refreshBody — sinon il réinitialise tout
                        (s.body as Phaser.Physics.Arcade.StaticBody)
                            .setSize(tileW * hb.w, tileH * hb.h)
                            .setOffset(tileW * hb.ox, tileH * hb.oy);
                    }
                });
            });
        return walls;
    }

    private setupColliders(walls: Phaser.Physics.Arcade.StaticGroup) {
        this.physics.add.collider(this.enemy.sprite, walls);
        this.physics.add.collider(this.player.sprite, walls);

        // Enemy touching player → deal 1 half-heart of damage + knockback
        this.physics.add.collider(this.player.sprite, this.enemy.sprite, () => {
            (this.enemy.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            this.player.takeDamage(
                this.enemy.sprite.x,
                this.enemy.sprite.y,
                () => this.triggerGameOver(),
            );
        });

        // Player attack zone overlapping enemy → register a hit
        this.physics.add.overlap(this.player.attackZone, this.enemy.sprite, () => {
            if (!this.enemy.sprite.active) return;
            this.enemy.takeHit(
                this.player.sprite.x,
                this.player.sprite.y,
                this.player.attackZone.body as Phaser.Physics.Arcade.Body,
            );
        });
    }

    private setupCamera() {
        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setLerp(0.1, 0.1);
        this.cameras.main.startFollow(this.player.sprite, true);
    }

    private setupInput() {
        this.cursors  = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };
    }

    private setupDoorTransition() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        // Door Tower layer: col 22, rows 5-6
        const doorX = 22 * tileW + tileW / 2;
        const doorY = 5  * tileH + tileH;     // centre entre row 5 et row 6
        const zone = this.add.zone(doorX, doorY, tileW, tileH * 2);
        this.physics.world.enable(zone);
        (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.physics.add.overlap(this.player.sprite, zone, () => {
            if (this.transitioning) return;
            this.transitioning = true;
            this.cameras.main.fadeOut(300, 0, 0, 0, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
                if (progress === 1) this.scene.start("DungeonScene");
            });
        });
    }

    private triggerGameOver() {
        this.isGameOver = true;
        this.physics.pause();
        this.player.sprite.setAlpha(0.4);
        GameOverScreen.show(this);
    }
}
