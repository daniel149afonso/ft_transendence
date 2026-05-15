import Phaser from "phaser";
import mapData from "../maps/map.json";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

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
        this.player.setFrame(0);
        this.player.setCollideWorldBounds(true);
        // Hitbox réduite aux pieds : 10×8 en bas du frame 16×32
        (this.player.body as Phaser.Physics.Arcade.Body).setSize(10, 8).setOffset(3, 24);

        // COLLIDER
        this.physics.add.collider(this.player, walls);

        // CAMERA
        this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
        this.cameras.main.startFollow(this.player);

        // INPUT
        this.cursors = this.input.keyboard!.createCursorKeys();
    }

    update() {
        const speed = 150;

        this.player.setVelocity(0);

        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-speed);
        }
        if (this.cursors.right.isDown) {
            this.player.setVelocityX(speed);
        }
        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-speed);
        }
        if (this.cursors.down.isDown) {
            this.player.setVelocityY(speed);
        }
    }
}
