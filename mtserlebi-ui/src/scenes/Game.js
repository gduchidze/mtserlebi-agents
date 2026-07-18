import { Scene } from 'phaser';
import Character from '../classes/Character';
import DialogueBox from '../classes/DialogueBox';
import DialogueManager from '../classes/DialogueManager';

// sakartvelo_town.png dimensions — the whole world is one painted image
const WORLD_WIDTH = 2048;
const WORLD_HEIGHT = 2048;
const PLAYER_SPAWN = { x: 1272, y: 840 };

// The painted town uses big buildings (~450px tall), so sprites are scaled up
// to keep believable character:door proportions.
const CHARACTER_SCALE = 2.2;
const PLAYER_SPEED = 320;
const INTERACT_DISTANCE = 140;

// Collision rectangles come from assets/collision.json, generated from the
// town image by scripts/build_collision.py (red overlay preview lives in
// scripts/preview/collision_overlay.png).

export class Game extends Scene
{
    constructor ()
    {
        super('Game');
        this.controls = null;
        this.player = null;
        this.cursors = null;
        this.dialogueBox = null;
        this.spaceKey = null;
        this.activePhilosopher = null;
        this.dialogueManager = null;
        this.philosophers = [];
        this.labelsVisible = true;
    }

    create ()
    {
        this.add.image(0, 0, 'town').setOrigin(0, 0);
        this.createObjectLayer();
        const obstacles = this.createObstacles();
        let screenPadding = 20;
        let maxDialogueHeight = 200;

        this.createPhilosophers(obstacles);

        this.setupPlayer(obstacles);
        const camera = this.setupCamera();

        this.setupControls(camera);

        this.setupDialogueSystem();

        this.spaceKey = this.input.keyboard.addKey('SPACE');

        // Initialize the dialogue manager
        this.dialogueManager = new DialogueManager(this);
        this.dialogueManager.initialize(this.dialogueBox);

        // "press SPACE to talk" hint shown while standing next to a writer
        this.talkHint = this.add.text(this.game.config.width / 2, this.game.config.height - 40, '', {
            font: "20px Georgia",
            fill: "#F5E6C8",
            backgroundColor: "#3A1418",
            padding: { x: 12, y: 6 }
        })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(3900) // above the y-sorted world
            .setVisible(false);
    }

    createObjectLayer() {
        // each region is a crop of the objects texture, depth-anchored at its
        // base so characters render behind trees/houses when standing above them
        const regions = this.cache.json.get('objects-data');
        regions.forEach(({ x, y, w, h, base }) => {
            this.add.image(0, 0, 'objects')
                .setOrigin(0, 0)
                .setCrop(x, y, w, h)
                .setDepth(base);
        });
    }

    createObstacles() {
        const obstacles = this.physics.add.staticGroup();
        const { rects } = this.cache.json.get('collision');
        rects.forEach(([x, y, w, h]) => {
            obstacles.add(this.add.zone(x + w / 2, y + h / 2, w, h));
        });
        return obstacles;
    }

    createPhilosophers(obstacles) {
        // defaultMessage keeps writers in offline dialogue mode until the
        // mtserlebi-api personas exist; remove it per writer to go live.
        const philosopherConfigs = [
            {
                id: "rustaveli", name: "შოთა რუსთაველი", spawn: { x: 1560, y: 1160 }, defaultDirection: "front", roamRadius: 350,
                defaultMessage: "მე ვარ შოთა რუსთაველი, „ვეფხისტყაოსნის“ ავტორი. რასაც მოიმოქმედებ, შენვე წინ დაგხვდება!"
            },
            {
                id: "ilia", name: "ილია ჭავჭავაძე", spawn: { x: 952, y: 1256 }, defaultDirection: "front", roamRadius: 120,
                defaultMessage: "მე ილია ვარ. სამი რამ გვმართებს: მამული, ენა, სარწმუნოება. მოდი, ვისაუბროთ საქართველოს მომავალზე."
            },
            {
                id: "akaki", name: "აკაკი წერეთელი", spawn: { x: 888, y: 1224 }, defaultDirection: "front", roamRadius: 120,
                defaultMessage: "მე აკაკი ვარ, „სულიკოს“ ავტორი. ლექსი გულიდან მოდის — შენც გაქვს გულში სიმღერა?"
            },
            {
                id: "vazha", name: "ვაჟა-ფშაველა", spawn: { x: 728, y: 200 }, defaultDirection: "front", roamRadius: 300,
                defaultMessage: "ვაჟა ვარ, ფშავიდან. ბუნება ჩემი სახლია — მთებმა და მდინარეებმა ბევრი ამბავი იციან."
            },
            {
                id: "mikheil", name: "მიხეილ ჯავახიშვილი", spawn: { x: 1752, y: 856 }, defaultDirection: "front", roamRadius: 300,
                defaultMessage: "მიხეილ ჯავახიშვილი ვარ. „კვაჭი კვაჭანტირაძე“ წაგიკითხავს? ფრთხილად, გაიძვერაა!"
            },
            {
                id: "konstantine", name: "კონსტანტინე გამსახურდია", spawn: { x: 1448, y: 1848 }, defaultDirection: "front", roamRadius: 300,
                defaultMessage: "კონსტანტინე გამსახურდია ვარ, „დიდოსტატის მარჯვენას“ ავტორი. ხელოვნება მსხვერპლს მოითხოვს."
            },
            {
                id: "iakob", name: "იაკობ გოგებაშვილი", spawn: { x: 696, y: 1752 }, defaultDirection: "front", roamRadius: 180,
                defaultMessage: "იაკობ გოგებაშვილი ვარ, „დედა ენის“ შემდგენელი. ანბანი იცი? აი, ა — ია, ბ — ბაბა..."
            }
        ];

        this.philosophers = [];
        
        philosopherConfigs.forEach(config => {
            this[config.id] = new Character(this, {
                id: config.id,
                name: config.name,
                spawnPoint: config.spawn,
                atlas: config.id,
                defaultDirection: config.defaultDirection,
                worldLayer: obstacles,
                defaultMessage: config.defaultMessage,
                roamRadius: config.roamRadius,
                scale: CHARACTER_SCALE,
                interactDistance: INTERACT_DISTANCE,
                moveSpeed: config.moveSpeed || 80,
                pauseChance: config.pauseChance || 0.2,
                directionChangeChance: config.directionChangeChance || 0.3,
                handleCollisions: true
            });
            
            this.philosophers.push(this[config.id]);
        });

        // Make all philosopher labels visible initially
        this.togglePhilosopherLabels(true);

        // Add collisions between philosophers
        for (let i = 0; i < this.philosophers.length; i++) {
            for (let j = i + 1; j < this.philosophers.length; j++) {
                this.physics.add.collider(
                    this.philosophers[i].sprite, 
                    this.philosophers[j].sprite
                );
            }
        }
    }

    checkPhilosopherInteraction() {
        let nearbyPhilosopher = null;

        for (const philosopher of this.philosophers) {
            if (philosopher.isPlayerNearby(this.player, INTERACT_DISTANCE)) {
                nearbyPhilosopher = philosopher;
                break;
            }
        }
        
        if (this.talkHint) {
            const showHint = nearbyPhilosopher && !this.dialogueBox.isVisible();
            this.talkHint.setVisible(!!showHint);
            if (showHint) {
                this.talkHint.setText(`SPACE — ესაუბრე: ${nearbyPhilosopher.name}`);
            }
        }

        if (nearbyPhilosopher) {
            if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
                if (!this.dialogueBox.isVisible()) {
                    this.dialogueManager.startDialogue(nearbyPhilosopher);
                } else if (!this.dialogueManager.isTyping) {
                    this.dialogueManager.continueDialogue();
                }
            }
            
            if (this.dialogueBox.isVisible()) {
                nearbyPhilosopher.facePlayer(this.player);
            }
        } else if (this.dialogueBox.isVisible()) {
            this.dialogueManager.closeDialogue();
        }
    }

    setupPlayer(obstacles) {
        this.player = this.physics.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, "duchidze", "duchidze-front")
            .setSize(12, 10)
            .setOffset(8, 36)
            .setScale(CHARACTER_SCALE)
            .setCollideWorldBounds(true);

        this.physics.add.collider(this.player, obstacles);
        
        this.philosophers.forEach(philosopher => {
            this.physics.add.collider(this.player, philosopher.sprite);
        });

        this.createPlayerAnimations();

        // Set world bounds for physics
        this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        this.physics.world.setBoundsCollision(true, true, true, true);
    }

    createPlayerAnimations() {
        const anims = this.anims;
        const animConfig = [
            { key: "duchidze-left-walk", prefix: "duchidze-left-walk-" },
            { key: "duchidze-right-walk", prefix: "duchidze-right-walk-" },
            { key: "duchidze-front-walk", prefix: "duchidze-front-walk-" },
            { key: "duchidze-back-walk", prefix: "duchidze-back-walk-" }
        ];
        
        animConfig.forEach(config => {
            anims.create({
                key: config.key,
                frames: anims.generateFrameNames("duchidze", { prefix: config.prefix, start: 0, end: 8, zeroPad: 4 }),
                frameRate: 10,
                repeat: -1,
            });
        });
    }

    setupCamera() {
        const camera = this.cameras.main;
        // smooth follow, zoomed out for a wide view of the town
        camera.startFollow(this.player, true, 0.12, 0.12);
        camera.setZoom(0.8);
        camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        return camera;
    }

    setupControls(camera) {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys('W,A,S,D');

        this.labelsVisible = true;
        
        // Add ESC key for pause menu
        this.input.keyboard.on('keydown-ESC', () => {
            if (!this.dialogueBox.isVisible()) {
                if (this.talkHint) {
                    this.talkHint.setVisible(false);
                }
                this.scene.pause();
                this.scene.launch('PauseMenu');
            }
        });
    }

    setupDialogueSystem() {
        const screenPadding = 20;
        const maxDialogueHeight = 200;
        
        this.dialogueBox = new DialogueBox(this);
        this.dialogueText = this.add
            .text(60, this.game.config.height - maxDialogueHeight - screenPadding + screenPadding, '', {
                font: "18px monospace",
                fill: "#ffffff",
                padding: { x: 20, y: 10 },
                wordWrap: { width: 680 },
                lineSpacing: 6,
                maxLines: 5
            })
            .setScrollFactor(0)
            .setDepth(30)
            .setVisible(false);

        this.spaceKey = this.input.keyboard.addKey('SPACE');
        
        this.dialogueManager = new DialogueManager(this);
        this.dialogueManager.initialize(this.dialogueBox);
    }

    update(time, delta) {
        const isInDialogue = this.dialogueBox.isVisible();

        if (!isInDialogue) {
            this.updatePlayerMovement();
        }

        // y-sorted depth: player sorts against the object layer by feet position
        this.player.setDepth(this.player.y + this.player.displayHeight / 2);
        
        this.checkPhilosopherInteraction();
        
        this.philosophers.forEach(philosopher => {
            philosopher.update(this.player, isInDialogue);
        });
    }

    updatePlayerMovement() {
        const speed = PLAYER_SPEED;
        const prevVelocity = this.player.body.velocity.clone();
        this.player.body.setVelocity(0);

        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;
        const up = this.cursors.up.isDown || this.wasd.W.isDown;
        const down = this.cursors.down.isDown || this.wasd.S.isDown;

        if (left) {
            this.player.body.setVelocityX(-speed);
        } else if (right) {
            this.player.body.setVelocityX(speed);
        }

        if (up) {
            this.player.body.setVelocityY(-speed);
        } else if (down) {
            this.player.body.setVelocityY(speed);
        }

        this.player.body.velocity.normalize().scale(speed);

        const currentVelocity = this.player.body.velocity.clone();
        const isMoving = Math.abs(currentVelocity.x) > 0 || Math.abs(currentVelocity.y) > 0;

        if (left && isMoving) {
            this.player.anims.play("duchidze-left-walk", true);
        } else if (right && isMoving) {
            this.player.anims.play("duchidze-right-walk", true);
        } else if (up && isMoving) {
            this.player.anims.play("duchidze-back-walk", true);
        } else if (down && isMoving) {
            this.player.anims.play("duchidze-front-walk", true);
        } else {
            this.player.anims.stop();
            if (prevVelocity.x < 0) this.player.setTexture("duchidze", "duchidze-left");
            else if (prevVelocity.x > 0) this.player.setTexture("duchidze", "duchidze-right");
            else if (prevVelocity.y < 0) this.player.setTexture("duchidze", "duchidze-back");
            else if (prevVelocity.y > 0) this.player.setTexture("duchidze", "duchidze-front");
            else {
                // If prevVelocity is zero, maintain current direction
                // Get current texture frame name
                const currentFrame = this.player.frame.name;
                
                // Extract direction from current animation or texture
                let direction = "front"; // Default
                
                // Check if the current frame name contains direction indicators
                if (currentFrame.includes("left")) direction = "left";
                else if (currentFrame.includes("right")) direction = "right";
                else if (currentFrame.includes("back")) direction = "back";
                else if (currentFrame.includes("front")) direction = "front";
                
                // Set the static texture for that direction
                this.player.setTexture("duchidze", `duchidze-${direction}`);
            }
        }
    }

    togglePhilosopherLabels(visible) {
        this.philosophers.forEach(philosopher => {
            if (philosopher.nameLabel) {
                philosopher.nameLabel.setVisible(visible);
            }
        });
    }
}
