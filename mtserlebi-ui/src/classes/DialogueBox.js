class DialogueBox {
    constructor(scene, config = {}) {
        this.scene = scene;
        this.awaitingInput = false;
        
        // Set default configuration values
        const {
            x = 100,
            y = 500,
            width = 824,
            height = 200,
            backgroundColor = 0x2B1014,
            backgroundAlpha = 0.88,
            borderColor = 0xF5E6C8,
            borderWidth = 2,
            textConfig = {
                font: '24px Georgia',
                fill: '#F5E6C8',
                wordWrap: { width: 784 }
            },
            depth = 4000 // above the y-sorted world layer
        } = config;
        
        // Create background
        const graphics = scene.add.graphics();
        graphics.fillStyle(backgroundColor, backgroundAlpha);
        graphics.fillRect(x, y, width, height);
        graphics.lineStyle(borderWidth, borderColor);
        graphics.strokeRect(x, y, width, height);

        // Speaker portrait slot (left side) + name header
        this.portraitFrame = scene.add.graphics();
        this.portraitFrame.fillStyle(0x3A1418, 1);
        this.portraitFrame.fillRect(x + 14, y + 14, 172, 172);
        this.portraitFrame.lineStyle(2, borderColor);
        this.portraitFrame.strokeRect(x + 14, y + 14, 172, 172);
        this.portrait = scene.add.image(x + 100, y + 100, '__DEFAULT').setVisible(false);
        this.nameText = scene.add.text(x + 200, y + 14, '', {
            font: 'bold 22px Georgia',
            fill: '#E8B44C'
        });

        // Create text right of the portrait
        this.text = scene.add.text(x + 200, y + 48, '', {
            ...textConfig,
            wordWrap: { width: width - 220 }
        });

        // Group elements
        this.container = scene.add.container(0, 0, [graphics, this.portraitFrame, this.portrait, this.nameText, this.text]);
        this.container.setDepth(depth);
        this.container.setScrollFactor(0);
        this.hide();
    }

    setSpeaker(id, name) {
        const key = `portrait-${id}`;
        const hasPortrait = this.scene.textures.exists(key);
        this.portrait.setVisible(hasPortrait);
        this.portraitFrame.setVisible(true);
        if (hasPortrait) {
            this.portrait.setTexture(key);
        }
        this.nameText.setText(name || '');
    }

    show(message, awaitInput = false) {
        this.text.setText(message);
        this.container.setVisible(true);
        this.awaitingInput = awaitInput;
    }
    
    hide() {
        this.container.setVisible(false);
        this.awaitingInput = false;
    }
    
    isVisible() {
        return this.container.visible;
    }

    isAwaitingInput() {
        return this.awaitingInput;
    }
}

export default DialogueBox; 