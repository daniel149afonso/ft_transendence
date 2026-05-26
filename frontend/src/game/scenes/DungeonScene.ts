import Phaser from "phaser";
import dungeonData from "../maps/dungeon.json";
import { Player }              from "../entities/Player";
import { Enemy }               from "../entities/Enemy";
import { DropItem, rollDrop }  from "../entities/DropItem";
import { HUD }                 from "../ui/HUD";
import { GameOverScreen }      from "../ui/GameOverScreen";
import { playerState }         from "../PlayerState";

const OBSTACLE_LAYERS = ["Water", "Rock"];
const MAP_W = 800;
const MAP_H = 600;
const COLS  = 30;
const ROWS  = 20;

// Spawn just above the dungeon door (Door layer: col 17, row 19)
const SPAWN_X = 17 * (MAP_W / COLS) + (MAP_W / COLS) / 2;
const SPAWN_Y = 17 * (MAP_H / ROWS) + (MAP_H / ROWS) / 2;

// Box: top-left tile ID 6888 marks a 2×2 box block
const BOX_TOPLEFT = 6888;

// Switch Door: 2×2 block at rows 1-2, cols 25-26
const DOOR_ROWS = [1, 2];
const DOOR_COLS = [25, 26];

// Switch: single tile at row 7, col 13
const SWITCH_ROW = 7;
const SWITCH_COL = 13;

export default class DungeonScene extends Phaser.Scene {
    private player!: Player;
    private enemies: Enemy[]    = [];
    private drops:   DropItem[] = [];
    private boxes:   Phaser.Physics.Arcade.Sprite[] = [];
    private hud!:    HUD;

    // Switch door — image + physics body séparés pour pouvoir toggler
    private switchDoorGroup!:      Phaser.Physics.Arcade.StaticGroup;
    private switchDoorImg!:        Phaser.GameObjects.Image;
    private switchDoorBodySprite!: Phaser.Physics.Arcade.Sprite;

    // Switch
    private switchImg!:  Phaser.GameObjects.Image;
    private switchZone!: Phaser.GameObjects.Zone;
    private switchActivated = false;

    private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!:     { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private isGameOver    = false;
    private transitioning = false;

    constructor() { super("DungeonScene"); }

    init() {
        this.isGameOver      = false;
        this.transitioning   = false;
        this.switchActivated = false;
        this.boxes   = [];
        this.enemies = [];
        this.drops   = [];
    }

    preload() {
        this.load.image("dungeon",            "src/game/assets/maps/dungeon.png");
        this.load.image("drop-heart",         "src/game/assets/items/heart.png");
        this.load.image("drop-coin",          "src/game/assets/items/coin.png");
        this.load.spritesheet("player",       "src/game/assets/players/player.png",  { frameWidth: 16, frameHeight: 32 });
        this.load.spritesheet("player-atk",   "src/game/assets/players/player.png",  { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("enemy",        "src/game/assets/enemies/enemy.png",   { frameWidth: 32, frameHeight: 32 });
        this.load.image("box-sprite",         "src/game/assets/objects/box.png");
        this.load.image("switch-normal",      "src/game/assets/objects/switch_normal.png");
        this.load.image("switch-pressed",     "src/game/assets/objects/switch_pressed.png");
        this.load.image("switch-door-closed", "src/game/assets/objects/switch_door_closed.png");
        this.load.image("switch-door-opened", "src/game/assets/objects/switch_door_opened.png");
    }

    create() {
        this.add.image(0, 0, "dungeon").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        this.ensurePixelTexture();

        const walls = this.buildWalls(tileW, tileH);

        this.player = new Player(this, SPAWN_X, SPAWN_Y);
        // Restaurer les HP depuis l'état persistant
        this.player.hp = playerState.hp;
        this.hud = new HUD(this);

        this.addBoxes(tileW, tileH);
        this.switchDoorGroup = this.addSwitchDoor(tileW, tileH);
        this.addSwitch(tileW, tileH);
        this.spawnEnemies(tileW, tileH);

        // ── Colliders ────────────────────────────────────────────────────────
        this.physics.add.collider(this.player.sprite, walls);
        this.physics.add.collider(this.player.sprite, this.switchDoorGroup);

        this.enemies.forEach(enemy => {
            this.physics.add.collider(enemy.sprite, walls);
            this.physics.add.collider(enemy.sprite, this.switchDoorGroup);

            // Ennemi touche le player → dégâts + knockback
            this.physics.add.collider(this.player.sprite, enemy.sprite, () => {
                (enemy.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
                this.player.takeDamage(
                    enemy.sprite.x,
                    enemy.sprite.y,
                    () => this.triggerGameOver(),
                );
            });

            // Attaque du player → hit sur l'ennemi
            this.physics.add.overlap(this.player.attackZone, enemy.sprite, () => {
                if (!enemy.sprite.active) return;
                enemy.takeHit(
                    this.player.sprite.x,
                    this.player.sprite.y,
                    this.player.attackZone.body as Phaser.Physics.Arcade.Body,
                );
            });
        });

        this.boxes.forEach(box => {
            this.physics.add.collider(this.player.sprite, box);
            this.physics.add.collider(box, walls);
            this.physics.add.collider(box, this.switchDoorGroup);
        });
        for (let i = 0; i < this.boxes.length; i++)
            for (let j = i + 1; j < this.boxes.length; j++)
                this.physics.add.collider(this.boxes[i], this.boxes[j]);

        this.setupExitZone();

        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setLerp(0.1, 0.1);
        this.cameras.main.startFollow(this.player.sprite, true);

        this.cursors  = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.wasd = {
            up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        };

        this.hud.update(this.player.hp);
    }

    update() {
        if (this.isGameOver) return;
        this.player.handleInput(this.cursors, this.wasd, this.spaceKey);
        this.enemies.forEach(e => e.update(this.player.sprite.x, this.player.sprite.y));
        // Synchroniser les HP dans l'état persistant
        playerState.hp = this.player.hp;
        this.hud.update(this.player.hp);
        // Switch : état recalculé chaque frame
        this.updateSwitch();
    }

    // ── private helpers ──────────────────────────────────────────────────────

    /** Lit le layer "EnemySpawn" et crée un Enemy par tile non-nul.
     *  Chaque ennemi reçoit un callback onDeath qui lance le loot drop. */
    private spawnEnemies(tileW: number, tileH: number) {
        const layer = (dungeonData.layers as { name: string; data: number[] }[])
            .find(l => l.name === "EnemySpawn");

        const makeEnemy = (x: number, y: number) => {
            const enemy = new Enemy(this, x, y, (dx, dy) => this.spawnDrop(dx, dy));
            this.enemies.push(enemy);
        };

        if (layer) {
            layer.data.forEach((tile, idx) => {
                if (tile === 0) return;
                const x = (idx % COLS) * tileW + tileW / 2;
                const y = Math.floor(idx / COLS) * tileH + tileH / 2;
                makeEnemy(x, y);
            });
        }

        if (this.enemies.length === 0) makeEnemy(173, 135); // fallback
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

    private triggerGameOver() {
        this.isGameOver = true;
        this.physics.pause();
        this.player.sprite.setAlpha(0.4);
        GameOverScreen.show(this, () => playerState.reset());
    }

    private ensurePixelTexture() {
        if (this.textures.exists("pixel")) return;
        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
        gfx.generateTexture("pixel", 1, 1);
        gfx.destroy();
    }

    // ── level elements ────────────────────────────────────────────────────────

    private addBoxes(tileW: number, tileH: number) {
        const boxLayer = (dungeonData.layers as { name: string; data: number[] }[])
            .find(l => l.name === "Box");
        if (!boxLayer) return;

        boxLayer.data.forEach((tile, idx) => {
            if (tile !== BOX_TOPLEFT) return;
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            // Centre du bloc 2×2
            const x = (col + 1) * tileW;
            const y = (row + 1) * tileH;

            const box = this.physics.add.sprite(x, y, "box-sprite");
            box.setScale((tileW * 2) / box.width, (tileH * 2) / box.height)
               .setDepth(2)
               .setCollideWorldBounds(true);
            (box.body as Phaser.Physics.Arcade.Body).setDrag(10000, 10000);

            this.boxes.push(box);
        });
    }

    private addSwitchDoor(tileW: number, tileH: number): Phaser.Physics.Arcade.StaticGroup {
        const cx = DOOR_COLS[0] * tileW + tileW;   // centre X du bloc 2×2
        const cy = DOOR_ROWS[0] * tileH + tileH;   // centre Y du bloc 2×2

        this.switchDoorImg = this.add.image(cx, cy, "switch-door-closed")
            .setDisplaySize(tileW * 2, tileH * 2)
            .setDepth(2);

        const group = this.physics.add.staticGroup();
        this.switchDoorBodySprite = group.create(cx, cy, "pixel") as Phaser.Physics.Arcade.Sprite;
        this.switchDoorBodySprite
            .setVisible(false)
            .setDisplaySize(tileW * 2, tileH * 2)
            .refreshBody();

        return group;
    }

    private addSwitch(tileW: number, tileH: number) {
        const swX = SWITCH_COL * tileW + tileW / 2;
        const swY = SWITCH_ROW * tileH + tileH / 2;

        this.switchImg = this.add.image(swX, swY, "switch-normal")
            .setDisplaySize(tileW, tileH)
            .setDepth(1);

        this.switchZone = this.add.zone(swX, swY, tileW, tileH);
        this.physics.world.enable(this.switchZone);
        (this.switchZone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }

    /** Vérifié chaque frame : si player ou box sur le switch → porte ouverte,
     *  sinon → porte fermée et switch relâché. */
    private updateSwitch() {
        const playerOn = this.physics.overlap(this.player.sprite, this.switchZone);
        const boxOn    = !playerOn && this.boxes.some(
            box => this.physics.overlap(box, this.switchZone),
        );
        const isOn = playerOn || boxOn;

        if (isOn === this.switchActivated) return;

        this.switchActivated = isOn;

        if (isOn) {
            this.switchImg.setTexture("switch-pressed");
            this.switchDoorImg.setTexture("switch-door-opened");
            (this.switchDoorBodySprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        } else {
            this.switchImg.setTexture("switch-normal");
            this.switchDoorImg.setTexture("switch-door-closed");
            (this.switchDoorBodySprite.body as Phaser.Physics.Arcade.StaticBody).enable = true;
            this.switchDoorBodySprite.refreshBody();
        }
    }

    // ── exit zone ─────────────────────────────────────────────────────────────

    private setupExitZone() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        const exitX = 17 * tileW + tileW / 2;
        const exitY = 19 * tileH + tileH / 2;
        const zone = this.add.zone(exitX, exitY, tileW, tileH);
        this.physics.world.enable(zone);
        (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.physics.add.overlap(this.player.sprite, zone, () => {
            if (this.transitioning) return;
            this.transitioning = true;
            this.cameras.main.fadeOut(300, 0, 0, 0, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
                if (progress === 1) this.scene.start("MainScene", { fromDungeon: true });
            });
        });
    }

    // ── walls ─────────────────────────────────────────────────────────────────

    private buildWalls(tileW: number, tileH: number): Phaser.Physics.Arcade.StaticGroup {
        const walls = this.physics.add.staticGroup();
        (dungeonData.layers as { name: string; data: number[] }[])
            .filter(l => OBSTACLE_LAYERS.includes(l.name))
            .forEach(layer =>
                layer.data.forEach((tile, idx) => {
                    if (tile === 0) return;
                    const x = (idx % COLS) * tileW + tileW / 2;
                    const y = Math.floor(idx / COLS) * tileH + tileH / 2;
                    (walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite)
                        .setVisible(false).setDisplaySize(tileW, tileH).refreshBody();
                })
            );
        return walls;
    }
}
