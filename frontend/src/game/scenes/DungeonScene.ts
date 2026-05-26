import Phaser from "phaser";
import dungeonData from "../maps/dungeon.json";
import { Player }             from "../entities/Player";
import { Enemy }              from "../entities/Enemy";
import { DropItem, rollDrop } from "../entities/DropItem";
import { HUD }                from "../ui/HUD";
import { GameOverScreen }     from "../ui/GameOverScreen";
import { playerState }        from "../PlayerState";
import {
    MAP_W, MAP_H, COLS, ROWS,
    type TiledLayer,
    getObjects, getTileData, getProp,
    objCenter, objScreenSize, toScreen,
} from "../maps/mapUtils";

// Tile dans InteractiveVisual qui marque la sortie du donjon
const EXIT_TILE = 251;

// ── Types internes ───────────────────────────────────────────────────────────

interface SwitchEntry {
    name:       string;
    zone:       Phaser.GameObjects.Zone;
    img:        Phaser.GameObjects.Image;
    targetDoor: string;
}

interface DoorEntry {
    img:        Phaser.GameObjects.Image;
    bodySprite: Phaser.Physics.Arcade.Sprite;
    group:      Phaser.Physics.Arcade.StaticGroup;
}

// ────────────────────────────────────────────────────────────────────────────

export default class DungeonScene extends Phaser.Scene {
    private player!: Player;
    private enemies: Enemy[]    = [];
    private drops:   DropItem[] = [];
    private boxes:   Phaser.Physics.Arcade.Sprite[] = [];
    private hud!:    HUD;

    // Switch / porte data-driven
    private switchEntries:   SwitchEntry[]           = [];
    private doorEntries:     Map<string, DoorEntry>  = new Map();
    private switchActivated: Map<string, boolean>    = new Map();

    private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!:     { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private isGameOver    = false;
    private transitioning = false;
    private spawnX        = 0;
    private spawnY        = 0;

    // ── grid-based box push ───────────────────────────────────────────────────
    private boxTweening  = false;
    private wallTileSet: Set<number> = new Set();

    constructor() { super("DungeonScene"); }

    init() {
        this.isGameOver      = false;
        this.transitioning   = false;
        this.boxes           = [];
        this.enemies         = [];
        this.drops           = [];
        this.switchEntries   = [];
        this.doorEntries     = new Map();
        this.switchActivated = new Map();
        this.spawnX          = 0;
        this.spawnY          = 0;
        this.boxTweening     = false;
        this.wallTileSet     = new Set();
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

        this.ensurePixelTexture();
        this.deriveSpawn();

        const walls = this.buildWalls();
        this.buildWallCache();

        this.player    = new Player(this, this.spawnX, this.spawnY);
        this.player.hp = playerState.hp;
        (this.player.sprite.body as Phaser.Physics.Arcade.Body).pushable = false;
        this.hud       = new HUD(this);

        this.addBoxes();
        this.addDoors();
        this.addSwitches();
        this.spawnEnemies();

        // ── colliders ────────────────────────────────────────────────────────
        this.physics.add.collider(this.player.sprite, walls);

        this.doorEntries.forEach(door => {
            this.physics.add.collider(this.player.sprite, door.group);
            this.boxes.forEach(b => this.physics.add.collider(b, door.group));
        });

        this.enemies.forEach(enemy => {
            this.physics.add.collider(enemy.sprite, walls);
            this.doorEntries.forEach(door =>
                this.physics.add.collider(enemy.sprite, door.group)
            );

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

        // Boxes are immovable — player is blocked by them (push is grid-based via tryPushBox).
        // Box-box colliders are not needed: the grid system forbids two boxes on the same tile.
        this.boxes.forEach(box => {
            this.physics.add.collider(this.player.sprite, box);
            this.physics.add.collider(box, walls);
        });

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
        playerState.hp = this.player.hp;
        this.hud.update(this.player.hp);
        this.updateSwitches();
        this.tryPushBox();
    }

    // ── spawn position ────────────────────────────────────────────────────────

    /** Lit la tuile EXIT_TILE dans InteractiveVisual et spawn 2 lignes au-dessus. */
    private deriveSpawn() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        const data  = getTileData(dungeonData.layers as TiledLayer[], "InteractiveVisual");
        const idx   = data.findIndex(t => t === EXIT_TILE);

        if (idx >= 0) {
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            this.spawnX = col  * tileW + tileW / 2;
            this.spawnY = (row - 2) * tileH + tileH / 2;
        } else {
            // Fallback (col 17, row 17)
            this.spawnX = 17 * tileW + tileW / 2;
            this.spawnY = 17 * tileH + tileH / 2;
        }
    }

    // ── ennemis ───────────────────────────────────────────────────────────────

    private spawnEnemies() {
        const objs = getObjects(dungeonData.layers as TiledLayer[], "EnemySpawn");
        objs.forEach(obj => {
            const pos = toScreen(obj.x, obj.y);
            this.enemies.push(new Enemy(this, pos.x, pos.y, (dx, dy) => this.spawnDrop(dx, dy)));
        });

        // Fallback si le layer est absent/vide
        if (this.enemies.length === 0) {
            const tileW = MAP_W / COLS;
            const tileH = MAP_H / ROWS;
            this.enemies.push(new Enemy(this,
                4 * tileW + tileW / 2,
                6 * tileH + tileH / 2,
                (dx, dy) => this.spawnDrop(dx, dy),
            ));
        }
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

    // ── éléments du niveau ────────────────────────────────────────────────────

    private addBoxes() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        const objs = getObjects(dungeonData.layers as TiledLayer[], "Interactive")
            .filter(o => o.type === "push_box");

        objs.forEach(obj => {
            const c = objCenter(obj);
            const s = objScreenSize(obj);

            // Snap to tile-center so every push lands exactly on the grid.
            const col    = Math.floor(c.x / tileW);
            const row    = Math.floor(c.y / tileH);
            const snapX  = col * tileW + tileW / 2;
            const snapY  = row * tileH + tileH / 2;

            const box    = this.physics.add.sprite(snapX, snapY, "box-sprite");
            const frameW = box.width;   // unscaled, before setScale
            const frameH = box.height;

            box.setScale(s.w / frameW, s.h / frameH).setDepth(2);

            const body = box.body as Phaser.Physics.Arcade.Body;
            body.setImmovable(true);           // push is handled by tween, not physics
            body.setAllowGravity(false);
            body.setMaxVelocity(60, 60);
            body.setDrag(5000, 5000);
            body.setBounce(0, 0);
            // Slightly smaller hitbox (80 %) to avoid corner-catching on walls
            body.setSize(frameW * 0.8, frameH * 0.8);
            body.setOffset(frameW * 0.1, frameH * 0.1);

            this.boxes.push(box);
        });
    }

    private addDoors() {
        const objs = getObjects(dungeonData.layers as TiledLayer[], "Interactive")
            .filter(o => o.type === "door_switch");

        objs.forEach(obj => {
            const c = objCenter(obj);
            const s = objScreenSize(obj);

            const img = this.add.image(c.x, c.y, "switch-door-closed")
                .setDisplaySize(s.w, s.h)
                .setDepth(2);

            const group      = this.physics.add.staticGroup();
            const bodySprite = group.create(c.x, c.y, "pixel") as Phaser.Physics.Arcade.Sprite;
            bodySprite.setVisible(false).setDisplaySize(s.w, s.h).refreshBody();
            // refreshBody() repositions the static body but doesn't always resize it
            // from displaySize — set the size explicitly to guarantee the right shape.
            (bodySprite.body as Phaser.Physics.Arcade.StaticBody).setSize(s.w, s.h);

            this.doorEntries.set(obj.name, { img, bodySprite, group });
            this.switchActivated.set(obj.name, false);
        });
    }

    private addSwitches() {
        const objs = getObjects(dungeonData.layers as TiledLayer[], "Interactive")
            .filter(o => o.type === "switch");

        objs.forEach(obj => {
            const c          = objCenter(obj);
            const s          = objScreenSize(obj);
            const targetDoor = getProp<string>(obj, "target") ?? "";

            const img = this.add.image(c.x, c.y, "switch-normal")
                .setDisplaySize(s.w, s.h)
                .setDepth(1);

            const zone = this.add.zone(c.x, c.y, s.w, s.h);
            this.physics.world.enable(zone);
            (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

            this.switchEntries.push({ name: obj.name, zone, img, targetDoor });
            this.switchActivated.set(obj.name, false);
        });
    }

    /** Recalculé chaque frame : player ou box sur le switch → porte ouverte. */
    private updateSwitches() {
        this.switchEntries.forEach(sw => {
            const wasOn    = this.switchActivated.get(sw.name) ?? false;
            const playerOn = this.physics.overlap(this.player.sprite, sw.zone);
            const boxOn    = !playerOn && this.boxes.some(b => this.physics.overlap(b, sw.zone));
            const isOn     = playerOn || boxOn;

            if (isOn === wasOn) return;
            this.switchActivated.set(sw.name, isOn);
            sw.img.setTexture(isOn ? "switch-pressed" : "switch-normal");

            const door = this.doorEntries.get(sw.targetDoor);
            if (!door) return;

            if (isOn) {
                door.img.setTexture("switch-door-opened");
                (door.bodySprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
            } else {
                door.img.setTexture("switch-door-closed");
                const sb = door.bodySprite.body as Phaser.Physics.Arcade.StaticBody;
                sb.enable = true;
                door.bodySprite.refreshBody();
                // Re-apply explicit size in case refreshBody reset it to 1×1
                const s2 = door.bodySprite.displayWidth;
                sb.setSize(s2, door.bodySprite.displayHeight);
            }
        });
    }

    // ── zone de sortie ────────────────────────────────────────────────────────

    private setupExitZone() {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        // Position de la tuile EXIT_TILE dans InteractiveVisual
        const data  = getTileData(dungeonData.layers as TiledLayer[], "InteractiveVisual");
        const idx   = data.findIndex(t => t === EXIT_TILE);

        const exitX = idx >= 0 ? (idx % COLS) * tileW + tileW / 2       : 17 * tileW + tileW / 2;
        const exitY = idx >= 0 ? Math.floor(idx / COLS) * tileH + tileH / 2 : 19 * tileH + tileH / 2;

        const zone = this.add.zone(exitX, exitY, tileW, tileH);
        this.physics.world.enable(zone);
        (zone.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

        this.physics.add.overlap(this.player.sprite, zone, () => {
            if (this.transitioning) return;
            this.transitioning = true;
            this.cameras.main.fadeOut(300, 0, 0, 0,
                (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
                    if (progress === 1) this.scene.start("MainScene", { fromDungeon: true });
                });
        });
    }

    // ── grid-based push ───────────────────────────────────────────────────────

    /** Construit un Set des indices de tuiles solides (Collision layer). */
    private buildWallCache() {
        this.wallTileSet.clear();
        getTileData(dungeonData.layers as TiledLayer[], "Collision")
            .forEach((tile, idx) => { if (tile !== 0) this.wallTileSet.add(idx); });
    }

    /**
     * Retourne true si la case (col, row) est libre :
     * pas hors-limites, pas un mur, pas une autre box, pas une porte fermée.
     */
    private isTileFree(col: number, row: number): boolean {
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
        if (this.wallTileSet.has(row * COLS + col))             return false;

        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        const cx    = col * tileW + tileW / 2;
        const cy    = row * tileH + tileH / 2;

        // Une autre box occupe-t-elle cette case ?
        if (this.boxes.some(b =>
            Math.abs(b.x - cx) < tileW * 0.5 &&
            Math.abs(b.y - cy) < tileH * 0.5)) return false;

        // Une porte fermée bloque-t-elle cette case ?
        for (const door of this.doorEntries.values()) {
            const sb = door.bodySprite.body as Phaser.Physics.Arcade.StaticBody;
            if (sb.enable &&
                Math.abs(door.bodySprite.x - cx) < tileW * 0.5 &&
                Math.abs(door.bodySprite.y - cy) < tileH * 0.5) return false;
        }

        return true;
    }

    /**
     * Détecte si le joueur est en train de pousser une box et la fait glisser
     * d'une case vers la destination — zéro traversée de mur garantie.
     */
    private tryPushBox() {
        if (this.boxTweening) return;

        const tileW  = MAP_W / COLS;
        const tileH  = MAP_H / ROWS;
        const pBody  = this.player.sprite.body as Phaser.Physics.Arcade.Body;
        const vx     = pBody.velocity.x;
        const vy     = pBody.velocity.y;

        // Ne rien faire si le joueur est immobile
        if (Math.abs(vx) < 10 && Math.abs(vy) < 10) return;

        // Direction dominante (horizontal prioritaire si égale)
        let dx = 0, dy = 0;
        if (Math.abs(vx) >= Math.abs(vy)) dx = vx > 0 ? 1 : -1;
        else                               dy = vy > 0 ? 1 : -1;

        const px = this.player.sprite.x;
        const py = this.player.sprite.y;

        for (const box of this.boxes) {
            const diffX = box.x - px;
            const diffY = box.y - py;

            // Distance dans l'axe de poussée (doit être ~1 tuile devant)
            const along = dx !== 0 ? diffX * dx : diffY * dy;
            // Distance dans l'axe perpendiculaire (tolérance)
            const perp  = dx !== 0 ? Math.abs(diffY) : Math.abs(diffX);

            if (along < tileW * 0.3 || along > tileW * 1.6) continue;
            if (perp  > tileH * 0.75)                       continue;

            // Case cible : tile actuelle de la box + 1 dans la direction
            const boxCol    = Math.floor(box.x / tileW);
            const boxRow    = Math.floor(box.y / tileH);
            const targetCol = boxCol + dx;
            const targetRow = boxRow + dy;
            const targetX   = targetCol * tileW + tileW / 2;
            const targetY   = targetRow * tileH + tileH / 2;

            if (!this.isTileFree(targetCol, targetRow)) continue;

            // ── Lancer le tween ──────────────────────────────────────────────
            this.boxTweening = true;

            this.tweens.add({
                targets:  box,
                x:        targetX,
                y:        targetY,
                duration: 160,
                ease:     "Linear",
                onComplete: () => {
                    // Snap exact pour éviter la dérive floating-point
                    box.x             = targetX;
                    box.y             = targetY;
                    this.boxTweening  = false;
                },
            });
            break; // une seule box à la fois
        }
    }

    // ── murs ──────────────────────────────────────────────────────────────────

    private buildWalls(): Phaser.Physics.Arcade.StaticGroup {
        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;
        const walls = this.physics.add.staticGroup();
        const data  = getTileData(dungeonData.layers as TiledLayer[], "Collision");

        data.forEach((tile, idx) => {
            if (tile === 0) return;
            const x = (idx % COLS) * tileW + tileW / 2;
            const y = Math.floor(idx / COLS) * tileH + tileH / 2;
            const s    = walls.create(x, y, "pixel") as Phaser.Physics.Arcade.Sprite;
            s.setVisible(false).setDisplaySize(tileW, tileH).refreshBody();
            const wb = s.body as Phaser.Physics.Arcade.StaticBody;
            wb.setSize(tileW, tileH);   // force full-tile body (refreshBody only fixes position)
            s.refreshBody();            // re-sync center after setSize changed halfWidth/halfHeight
        });
        return walls;
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private ensurePixelTexture() {
        if (this.textures.exists("pixel")) return;
        const gfx = this.add.graphics();
        gfx.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
        gfx.generateTexture("pixel", 1, 1);
        gfx.destroy();
    }

    private triggerGameOver() {
        this.isGameOver = true;
        this.physics.pause();
        this.player.sprite.setAlpha(0.4);
        GameOverScreen.show(this, () => playerState.reset());
    }
}
