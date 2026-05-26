import Phaser from "phaser";
import mapData from "../maps/village.json";
import { Player }              from "../entities/Player";
import { Enemy }               from "../entities/Enemy";
import { DropItem, rollDrop }  from "../entities/DropItem";
import { HUD }                 from "../ui/HUD";
import { GameOverScreen }      from "../ui/GameOverScreen";
import { playerState }         from "../PlayerState";

// Colliders définis directement dans village.json via le layer "Collision"
const COLLISION_LAYER = "Collision";
const MAP_W = 800;
const MAP_H = 600;
const COLS  = 30;
const ROWS  = 20;

export default class MainScene extends Phaser.Scene {
    private player!: Player;
    private enemies: Enemy[]    = [];
    private drops:   DropItem[] = [];
    private hud!:    HUD;

    private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!:     { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private isGameOver    = false;
    private transitioning = false;
    private spawnX = 240;
    private spawnY = 240;

    constructor() { super("MainScene"); }

    init(data: { fromDungeon?: boolean }) {
        this.isGameOver    = false;
        this.transitioning = false;
        this.enemies       = [];
        this.drops         = [];
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
        this.load.image("map",        "src/game/assets/maps/village.png");
        this.load.image("drop-heart", "src/game/assets/items/heart.png");
        this.load.image("drop-coin",  "src/game/assets/items/coin.png");
        this.load.spritesheet("player",     "src/game/assets/players/player.png",  { frameWidth: 16, frameHeight: 32 });
        this.load.spritesheet("player-atk", "src/game/assets/players/player.png",  { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("enemy",      "src/game/assets/enemies/enemy.png",   { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("objects",    "src/game/assets/objects.png",         { frameWidth: 16, frameHeight: 16 });
    }

    create() {
        this.add.image(0, 0, "map").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        const walls = this.buildWalls();

        this.player = new Player(this, this.spawnX, this.spawnY);
        // Restaurer les HP depuis l'état persistant
        this.player.hp = playerState.hp;
        // Prevent the enemy from pushing the player via physics collision
        (this.player.sprite.body as Phaser.Physics.Arcade.Body).pushable = false;

        this.spawnEnemies();
        this.hud = new HUD(this);

        this.setupColliders(walls);
        this.setupDoorTransition();
        this.setupCamera();
        this.setupInput();

        this.hud.update(this.player.hp);
    }

    update() {
        if (this.isGameOver) return;

        this.player.handleInput(this.cursors, this.wasd, this.spaceKey);
        this.enemies.forEach(e => e.update(this.player.sprite.x, this.player.sprite.y));
        // Synchroniser les HP dans l'état persistant
        playerState.hp = this.player.hp;
        this.hud.update(this.player.hp);
    }

    // --- private ---

    /** Lit le layer "Collision" du JSON et crée un body statique par tile non-nul. */
    private buildWalls(): Phaser.Physics.Arcade.StaticGroup {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        if (!this.textures.exists("pixel")) {
            const gfx = this.add.graphics();
            gfx.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
            gfx.generateTexture("pixel", 1, 1);
            gfx.destroy();
        }

        const walls = this.physics.add.staticGroup();
        const collisionLayer = (mapData.layers as { name: string; data: number[] }[])
            .find(l => l.name === COLLISION_LAYER);

        collisionLayer?.data.forEach((tile, idx) => {
            if (tile === 0) return;
            const x = (idx % COLS) * tileW + tileW / 2;
            const y = Math.floor(idx / COLS) * tileH + tileH / 2;
            (walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite)
                .setVisible(false).setDisplaySize(tileW, tileH).refreshBody();
        });
        return walls;
    }

    /** Lit le layer "EnemySpawn" et crée un Enemy par tile non-nul.
     *  Chaque ennemi reçoit un callback onDeath qui lance le loot drop. */
    private spawnEnemies() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        const layer = (mapData.layers as { name: string; data: number[] }[])
            .find(l => l.name === "EnemySpawn");

        const makeEnemy = (x: number, y: number) => {
            const enemy = new Enemy(this, x, y, (dx, dy) => this.spawnDrop(dx, dy));
            this.enemies.push(enemy);
            return enemy;
        };

        if (layer) {
            layer.data.forEach((tile, idx) => {
                if (tile === 0) return;
                const x = (idx % COLS) * tileW + tileW / 2;
                const y = Math.floor(idx / COLS) * tileH + tileH / 2;
                makeEnemy(x, y);
            });
        }

        if (this.enemies.length === 0) makeEnemy(400, 300); // fallback
    }

    /** Crée un drop aléatoire à (x, y) et ajoute l'overlap de ramassage. */
    private spawnDrop(x: number, y: number) {
        const type = rollDrop();
        if (!type) return;

        const drop = new DropItem(this, x, y, type);
        this.drops.push(drop);

        this.physics.add.overlap(this.player.sprite, drop.sprite, () => {
            if (!drop.collect()) return;

            if (drop.type === "heart") {
                this.player.heal(1);
                playerState.hp = this.player.hp;
                this.hud.update(this.player.hp);
            }
            // Coins : à étendre plus tard (score, etc.)
        });
    }

    private setupColliders(walls: Phaser.Physics.Arcade.StaticGroup) {
        this.enemies.forEach(enemy => {
            this.physics.add.collider(enemy.sprite, walls);

            // Enemy touching player → deal damage + knockback
            this.physics.add.collider(this.player.sprite, enemy.sprite, () => {
                (enemy.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                this.player.takeDamage(
                    enemy.sprite.x,
                    enemy.sprite.y,
                    () => this.triggerGameOver(),
                );
            });

            // Player attack zone overlapping enemy → register a hit
            this.physics.add.overlap(this.player.attackZone, enemy.sprite, () => {
                if (!enemy.sprite.active) return;
                enemy.takeHit(
                    this.player.sprite.x,
                    this.player.sprite.y,
                    this.player.attackZone.body as Phaser.Physics.Arcade.Body,
                );
            });
        });

        this.physics.add.collider(this.player.sprite, walls);
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
        GameOverScreen.show(this, () => playerState.reset());
    }
}
