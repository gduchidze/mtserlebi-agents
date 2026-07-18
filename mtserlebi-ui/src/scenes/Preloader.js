import { Scene } from 'phaser';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    preload ()
    {
        this.load.setPath('assets');

        // World & menu background: one hand-painted Georgian town image
        this.load.image('town', 'sakartvelo_town.png');
        // Collision rectangles generated from the image by scripts/build_collision.py
        this.load.json('collision', 'collision.json');

        // Occluding objects layer (trees, houses...) from scripts/build_objects.py
        this.load.image('objects', 'objects.png');
        this.load.json('objects-data', 'objects.json');

        // Dialogue portraits derived from the atlases by scripts/build_portraits.py
        ["rustaveli", "ilia", "akaki", "vazha", "mikheil", "konstantine", "iakob"].forEach(id => {
            this.load.image(`portrait-${id}`, `portraits/${id}.png`);
        });

        // Character assets
        this.load.atlas("duchidze", "characters/duchidze/atlas.png", "characters/duchidze/atlas.json");

        // Georgian writers
        this.load.atlas("rustaveli", "characters/rustaveli/atlas.png", "characters/rustaveli/atlas.json");
        this.load.atlas("ilia", "characters/ilia/atlas.png", "characters/ilia/atlas.json");
        this.load.atlas("akaki", "characters/akaki/atlas.png", "characters/akaki/atlas.json");
        this.load.atlas("vazha", "characters/vazha/atlas.png", "characters/vazha/atlas.json");
        this.load.atlas("mikheil", "characters/mikheil/atlas.png", "characters/mikheil/atlas.json");
        this.load.atlas("konstantine", "characters/konstantine/atlas.png", "characters/konstantine/atlas.json");
        this.load.atlas("iakob", "characters/iakob/atlas.png", "characters/iakob/atlas.json");
    }

    create ()
    {
        this.scene.start('MainMenu');
    }
}
