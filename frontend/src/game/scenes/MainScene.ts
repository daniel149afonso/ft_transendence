import Phaser from "phaser";
import mapData from "../maps/village.json";
import { Player }             from "../entities/Player";
import { Enemy }              from "../entities/Enemy";
import { DropItem, rollDrop } from "../entities/DropItem";
import { HUD }                from "../ui/HUD";
import { GameOverScreen }     from "../ui/GameOverScreen";
import { playerState }        from "../PlayerState";
import {
    MAP_W, MAP_H, COLS, ROWS, SCALE_Y,
    type TiledLayer,
    getObjects, getTileData,
    objCenter, objScreenSize, toScreen,
} from "../maps/mapUtils";

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
    private spawnX        = 0;
    private spawnY        = 0;

    constructor() { super("MainScene"); }

    init(data: { fromDungeon?: boolean }) {
        this.isGameOver    = false;
        this.transitioning = false;
        this.enemies       = [];
        this.drops         = [];

        const tileH = MAP_H / ROWS;

        // Porte du donjon dans le layer Interactive (type "door")
        const door = getObjects(mapData.layers as TiledLayer[], "Interactive")
            .find(o => o.type === "door");

        if (data?.fromDungeon && door) {
            // Spawn juste en-dessous de la porte : centre X de la porte, 1 tile sous son bord bas
            this.spawnX = objCenter(door).x;
            this.spawnY = (door.y + door.height) * SCALE_Y + tileH;
        } else {
            // Spawn par défaut : lire PlayerSpawn objectgroup
            const spawn = getObjects(mapData.layers as TiledLayer[], "PlayerSpawn")
                .find(o => o.type === "player");
            if (spawn) {
                const pos  = toScreen(spawn.x, spawn.y);
                this.spawnX = pos.x;
                this.spawnY = pos.y;
            } else {
                // Fallback absolu
                this.spawnX = 240;
                this.spawnY = 240;
            }
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

        this.player    = new Player(this, this.spawnX, this.spawnY);
        this.player.hp = playerState.hp;
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
        playerState.hp = this.player.hp;
        this.hud.update(this.player.hp);
    }

    // ── walls ────────────────────────────────────────────────────────────────

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
        getTileData(mapData.layers as TiledLayer[], "Collision").forEach((tile, idx) => {
            if (tile === 0) return;
            const x = (idx % COLS) * tileW + tileW / 2;
            const y = Math.floor(idx / COLS) * tileH + tileH / 2;
            const s = walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite;
            s.setVisible(false).setDisplaySize(tileW, tileH).refreshBody();
            (s.body as Phaser.Physics.Arcade.StaticBody).setSize(tileW, tileH);
        });
        return walls;
    }

    // ── ennemis ───────────────────────────────────────────────────────────────

    /** Lit EnemySpawn (objectgroup) — un objet = un ennemi. */
    private spawnEnemies() {
        const objs = getObjects(mapData.layers as TiledLayer[], "EnemySpawn");
        objs.forEach(obj => {
            const pos = toScreen(obj.x, obj.y);
            this.enemies.push(new Enemy(this, pos.x, pos.y, (dx, dy) => this.spawnDrop(dx, dy)));
        });
        if (this.enemies.length === 0)
            this.enemies.push(new Enemy(this, 400, 300, (dx, dy) => this.spawnDrop(dx, dy)));
    }

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
        });
    }

    // ── colliders ─────────────────────────────────────────────────────────────

    private setupColliders(walls: Phaser.Physics.Arcade.StaticGroup) {
        this.physics.add.collider(this.player.sprite, walls);

        this.enemies.forEach(enemy => {
            this.physics.add.collider(enemy.sprite, walls);

            this.physics.add.collider(this.player.sprite, enemy.sprite, () => {
                (enemy.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                this.player.takeDamage(enemy.sprite.x, enemy.sprite.y,
                    () => this.triggerGameOver());
            });

            this.physics.add.overlap(this.player.attackZone, enemy.sprite, () => {
                if (!enemy.sprite.active) return;
                enemy.takeHit(this.player.sprite.x, this.player.sprite.y,
                    this.player.attackZone.body as Phaser.Physics.Arcade.Body);
            });
        });
    }

    // ── transition vers le donjon ─────────────────────────────────────────────

    /** Lit la porte (type "door") dans le layer Interactive et crée la zone. */
    private setupDoorTransition() {
        const door = getObjects(mapData.layers as TiledLayer[], "Interactive")
            .find(o => o.type === "door");

        if (!door) return;

        const c    = objCenter(door);
        const s    = objScreenSize(door);
        const zone = this.add.zone(c.x, c.y, s.w, s.h);
        this.physics.world.enable(zone);
        (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.physics.add.overlap(this.player.sprite, zone, () => {
            if (this.transitioning) return;
            this.transitioning = true;
            this.cameras.main.fadeOut(300, 0, 0, 0,
                (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
                    if (progress === 1) this.scene.start("DungeonScene");
                });
        });
    }

    // ── caméra & input ────────────────────────────────────────────────────────

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

    // ── game over ─────────────────────────────────────────────────────────────

    private triggerGameOver() {
        this.isGameOver = true;
        this.physics.pause();
        this.player.sprite.setAlpha(0.4);
        GameOverScreen.show(this, () => playerState.reset());
    }
}
