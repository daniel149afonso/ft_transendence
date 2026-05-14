import Phaser from "phaser";

export default class MainScene extends Phaser.Scene {
    player!: Phaser.Physics.Arcade.Sprite;
    cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.tilemapTiledJSON("map", "src/game/maps/map.json");
        this.load.image("tiles", "src/game/assets/map.png");

        this.load.image("player", "src/game/assets/player.png");
    }

    create() {
        // MAP
        const map = this.make.tilemap({ key: "map" });

        const tileset = map.addTilesetImage(
            "City",
            "tiles"
        );

        const groundLayer = map.createLayer(
            "Ground",
            tileset!,
            0,
            0
        );

        // PLAYER
        this.player = this.physics.add.sprite(100, 100, "player");

        // CAMERA
        this.cameras.main.startFollow(this.player);

        // INPUT
        this.cursors = this.input.keyboard.createCursorKeys();
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