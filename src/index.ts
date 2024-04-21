import fs from 'fs';
import {PNG} from 'pngjs';
import {Model} from "./model";


function exportToPNG(png: PNG, outputPath: string): void {
    png.pack().pipe(fs.createWriteStream(outputPath));
}

// Load model JSON
// const modelJson = JSON.parse(fs.readFileSync('model.json', 'utf8'));
const model = new Model('block/stone.json');

model.initializeModel().then(() => {
    model.applyTransformations();
    const image = model.projectTo2D(); // Assuming this returns a filled ImageData object
    exportToPNG(image, 'output.png');
})

