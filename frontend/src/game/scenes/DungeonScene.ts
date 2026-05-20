import Phaser from "phaser";
import dungeonData from "../maps/dungeon.json";
import { Player }         from "../entities/Player";
import { HUD }            from "../ui/HUD";

const OBSTACLE_LAYERS = ["Water", "Rock"];
const MAP_W = 800;
const MAP_H = 600;
const COLS  = 30;
const ROWS  = 20;

// Spawn just above the dungeon door (Door layer: col 17, row 19)
const SPAWN_X = 17 * (MAP_W / COLS) + (MAP_W / COLS) / 2;
const SPAWN_Y = 17 * (MAP_H / ROWS) + (MAP_H / ROWS) / 2;

export default class DungeonScene extends Phaser.Scene {
    private player!: Player;
    private hud!:    HUD;
    private boxes:   Phaser.Physics.Arcade.Sprite[] = [];

    private cursors!:  Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!:     { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
    private spaceKey!: Phaser.Input.Keyboard.Key;

    private isGameOver    = false;
    private transitioning = false;

    constructor() { super("DungeonScene"); }

    init() {
        this.isGameOver    = false;
        this.transitioning = false;
        this.boxes         = [];
    }

    preload() {
        this.load.image("dungeon",      "src/game/assets/dungeon.png");
        this.load.spritesheet("player",     "src/game/assets/player.png",  { frameWidth: 16, frameHeight: 32 });
        this.load.spritesheet("player-atk", "src/game/assets/player.png",  { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet("objects",    "src/game/assets/objects.png",  { frameWidth: 16, frameHeight: 16 });
    }

    create() {
        this.add.image(0, 0, "dungeon").setOrigin(0, 0).setDisplaySize(MAP_W, MAP_H);

        const tileW = MAP_W / COLS;
        const tileH = MAP_H / ROWS;

        const walls = this.buildWalls(tileW, tileH);
        this.addBoxes(walls, tileW, tileH);

        this.player = new Player(this, SPAWN_X, SPAWN_Y);
        this.hud    = new HUD(this);

        this.physics.add.collider(this.player.sprite, walls);
        this.boxes.forEach(box => this.physics.add.collider(this.player.sprite, box));
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
        this.hud.update(this.player.hp);
        // Boxes stop as soon as the player stops pushing them
        this.boxes.forEach(b => (b.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0));
    }

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

    private addBoxes(walls: Phaser.Physics.Arcade.StaticGroup, tileW: number, tileH: number) {
        // Each crate is a 2×2 tile block; tile 6888 is the top-left corner
        const BOX_TOPLEFT = 6888;

        const boxLayer = (dungeonData.layers as { name: string; data: number[] }[])
            .find(l => l.name === "Box");

        if (!boxLayer) return;

        boxLayer.data.forEach((tile, idx) => {
            if (tile !== BOX_TOPLEFT) return;
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            // Center of the 2×2 area starting at (col, row)
            const x = (col + 1) * tileW;
            const y = (row + 1) * tileH;

            // Invisible sprite — dungeon.png provides the visual
            const box = this.physics.add.sprite(x, y, "pixel");
            box.setDisplaySize(tileW * 2, tileH * 2)
               .setVisible(false)
               .setCollideWorldBounds(true);

            const body = box.body as Phaser.Physics.Arcade.Body;
            body.setSize(tileW * 2, tileH * 2);
            body.debugBodyColor = 0x0000ff;

            this.physics.add.collider(box, walls);
            this.boxes.push(box);
        });

        for (let i = 0; i < this.boxes.length; i++)
            for (let j = i + 1; j < this.boxes.length; j++)
                this.physics.add.collider(this.boxes[i], this.boxes[j]);
    }

    private buildWalls(tileW: number, tileH: number): Phaser.Physics.Arcade.StaticGroup {
        if (!this.textures.exists("pixel")) {
            const gfx = this.add.graphics();
            gfx.fillStyle(0xffffff).fillRect(0, 0, 1, 1);
            gfx.generateTexture("pixel", 1, 1);
            gfx.destroy();
        }

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
