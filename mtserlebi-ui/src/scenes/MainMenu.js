import { Scene } from 'phaser';

// Georgian palette: wine red on warm cream, over the painted town
const COLOR_WINE = 0x722F37;
const COLOR_WINE_HOVER = 0x8E3B45;
const COLOR_SHADOW = 0x3A1418;
const COLOR_CREAM = 0xF5E6C8;
const TEXT_CREAM = '#F5E6C8';
const TEXT_INK = '#2B1A12';

export class MainMenu extends Scene {
    constructor() {
        super('MainMenu');
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;

        // Town artwork as backdrop, softly darkened for contrast
        this.add.image(width / 2, height / 2, 'town').setScale(0.5);
        const veil = this.add.graphics();
        veil.fillStyle(0x1A0E08, 0.45);
        veil.fillRect(0, 0, width, height);

        this.add.text(width / 2, 190, 'მწერლები', {
            fontSize: '96px',
            fontFamily: 'Georgia, "Noto Serif Georgian", serif',
            color: TEXT_CREAM,
            fontStyle: 'bold',
            stroke: '#3A1418',
            strokeThickness: 10
        }).setOrigin(0.5);

        this.add.text(width / 2, 280, 'ქართველ მწერალთა ქალაქი', {
            fontSize: '28px',
            fontFamily: 'Georgia, "Noto Serif Georgian", serif',
            color: TEXT_CREAM,
            stroke: '#3A1418',
            strokeThickness: 4
        }).setOrigin(0.5);

        const centerX = width / 2;
        const startY = 524;
        const buttonSpacing = 70;

        this.createButton(centerX, startY, 'თამაშის დაწყება', () => {
            this.scene.start('Game');
        });

        this.createButton(centerX, startY + buttonSpacing, 'ინსტრუქცია', () => {
            this.showInstructions();
        });
    }

    createButton(x, y, text, callback) {
        const buttonWidth = 350;
        const buttonHeight = 60;
        const cornerRadius = 20;
        const maxFontSize = 28;
        const padding = 10;

        const shadow = this.add.graphics();
        shadow.fillStyle(COLOR_SHADOW, 1);
        shadow.fillRoundedRect(x - buttonWidth / 2 + 4, y - buttonHeight / 2 + 4, buttonWidth, buttonHeight, cornerRadius);

        const button = this.add.graphics();
        button.fillStyle(COLOR_WINE, 1);
        button.fillRoundedRect(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
        button.setInteractive(
            new Phaser.Geom.Rectangle(x - buttonWidth / 2, y - buttonHeight / 2, buttonWidth, buttonHeight),
            Phaser.Geom.Rectangle.Contains
        );

        let fontSize = maxFontSize;
        let buttonText;
        do {
            if (buttonText) buttonText.destroy();

            buttonText = this.add.text(x, y, text, {
                fontSize: `${fontSize}px`,
                fontFamily: 'Georgia, "Noto Serif Georgian", serif',
                color: TEXT_CREAM,
                fontStyle: 'bold'
            }).setOrigin(0.5);

            fontSize -= 1;
        } while (buttonText.width > buttonWidth - padding && fontSize > 10);

        button.on('pointerover', () => {
            this.updateButtonStyle(button, shadow, x, y, buttonWidth, buttonHeight, cornerRadius, true);
            buttonText.y -= 2;
        });

        button.on('pointerout', () => {
            this.updateButtonStyle(button, shadow, x, y, buttonWidth, buttonHeight, cornerRadius, false);
            buttonText.y += 2;
        });

        button.on('pointerdown', callback);

        return { button, shadow, text: buttonText };
    }

    updateButtonStyle(button, shadow, x, y, width, height, radius, isHover) {
        button.clear();
        shadow.clear();

        if (isHover) {
            button.fillStyle(COLOR_WINE_HOVER, 1);
            shadow.fillStyle(COLOR_SHADOW, 0.8);
            shadow.fillRoundedRect(x - width / 2 + 2, y - height / 2 + 2, width, height, radius);
        } else {
            button.fillStyle(COLOR_WINE, 1);
            shadow.fillStyle(COLOR_SHADOW, 1);
            shadow.fillRoundedRect(x - width / 2 + 4, y - height / 2 + 4, width, height, radius);
        }

        button.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);
    }

    showInstructions() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const centerX = width / 2;
        const centerY = height / 2;

        const elements = this.createInstructionPanel(centerX, centerY);

        const instructionContent = this.addInstructionContent(centerX, centerY, elements.panel);
        elements.title = instructionContent.title;
        elements.textElements = instructionContent.textElements;

        const closeElements = this.addCloseButton(centerX, centerY + 79, () => {
            this.destroyInstructionElements(elements);
        });
        elements.closeButton = closeElements.button;
        elements.closeText = closeElements.text;

        elements.overlay.on('pointerdown', () => {
            this.destroyInstructionElements(elements);
        });
    }

    createInstructionPanel(centerX, centerY) {
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        overlay.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, this.cameras.main.width, this.cameras.main.height),
            Phaser.Geom.Rectangle.Contains
        );

        const panel = this.add.graphics();
        panel.fillStyle(COLOR_CREAM, 1);
        panel.fillRoundedRect(centerX - 220, centerY - 150, 440, 300, 20);
        panel.lineStyle(4, COLOR_WINE, 1);
        panel.strokeRoundedRect(centerX - 220, centerY - 150, 440, 300, 20);

        return { overlay, panel };
    }

    addInstructionContent(centerX, centerY, panel) {
        const title = this.add.text(centerX, centerY - 110, 'ინსტრუქცია', {
            fontSize: '28px',
            fontFamily: 'Georgia, "Noto Serif Georgian", serif',
            color: TEXT_INK,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const instructions = [
            'ისრები ან WASD — მოძრაობა',
            'SPACE — მწერალთან საუბარი',
            'ESC — დიალოგის დახურვა'
        ];

        const textElements = [];
        let yPos = centerY - 59;
        instructions.forEach(instruction => {
            textElements.push(
                this.add.text(centerX, yPos, instruction, {
                    fontSize: '22px',
                    fontFamily: 'Georgia, "Noto Serif Georgian", serif',
                    color: TEXT_INK
                }).setOrigin(0.5)
            );
            yPos += 40;
        });

        return { title, textElements };
    }

    addCloseButton(x, y, callback) {
        const adjustedY = y + 10;

        const buttonWidth = 140;
        const buttonHeight = 40;
        const cornerRadius = 10;

        const closeButton = this.add.graphics();
        closeButton.fillStyle(COLOR_WINE, 1);
        closeButton.fillRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
        closeButton.lineStyle(2, COLOR_SHADOW, 1);
        closeButton.strokeRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);

        const closeText = this.add.text(x, adjustedY, 'დახურვა', {
            fontSize: '20px',
            fontFamily: 'Georgia, "Noto Serif Georgian", serif',
            color: TEXT_CREAM,
            fontStyle: 'bold'
        }).setOrigin(0.5);

        closeButton.setInteractive(
            new Phaser.Geom.Rectangle(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight),
            Phaser.Geom.Rectangle.Contains
        );

        closeButton.on('pointerover', () => {
            closeButton.clear();
            closeButton.fillStyle(COLOR_WINE_HOVER, 1);
            closeButton.fillRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
            closeButton.lineStyle(2, COLOR_SHADOW, 1);
            closeButton.strokeRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
        });

        closeButton.on('pointerout', () => {
            closeButton.clear();
            closeButton.fillStyle(COLOR_WINE, 1);
            closeButton.fillRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
            closeButton.lineStyle(2, COLOR_SHADOW, 1);
            closeButton.strokeRoundedRect(x - buttonWidth / 2, adjustedY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
        });

        closeButton.on('pointerdown', callback);

        return { button: closeButton, text: closeText };
    }

    destroyInstructionElements(elements) {
        elements.overlay.destroy();
        elements.panel.destroy();
        elements.title.destroy();

        elements.textElements.forEach(text => text.destroy());

        elements.closeButton.destroy();
        elements.closeText.destroy();
    }
}
