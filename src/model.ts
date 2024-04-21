import {PNG} from "pngjs";
import path from "path";
import fs from "fs";

export interface Vector3 {
    x: number;
    y: number;
    z: number;
}

export interface Vector2 {
    x: number;
    y: number;
}

function orthographicProject(vertex: Vector3): Vector2 {
    return {
        x: vertex.x + 1, // Example of adjusting x to include some z-depth effect
        y: vertex.y
    };
}

function perspectiveProject(vertex: Vector3, cameraZ: number): Vector2 {
    if (vertex.z + cameraZ === 0) return {x: vertex.x, y: vertex.y}; // Avoid division by zero
    const fov = 500.0; // Adjust this value based on your scene scale
    return {
        x: (vertex.x * fov) / (vertex.z + cameraZ),
        y: (vertex.y * fov) / (vertex.z + cameraZ)
    };
}


interface Transformations {
    translate: Vector3;
    rotate: Vector3;    // Rotation angles in degrees for each axis
    scale: Vector3;
}

interface Face {
    vertices: Vector3[];
    texture: PNG;  // Changed from string to PNG
    uv: number[];

}

interface ModelJson {
    parent?: string;
    textures: { [key: string]: string };
    elements?: any[];
    translate?: Vector3;
    rotate?: Vector3;
    scale?: Vector3;
}


export class Model {
    faces: Face[] = [];
    transformations: Transformations | undefined = undefined;  // This should be defined according to what's needed
    textures: { [key: string]: PNG } = {}; // Texture cache
    projectionType: 'orthographic' | 'perspective';
    cameraZ: number; // Only used for perspective projection
    jsonModel: string;

    constructor(jsonFilePath: string, projectionType: 'orthographic' | 'perspective' = 'orthographic', cameraZ: number = 500) {
        this.projectionType = projectionType;
        this.cameraZ = cameraZ;
        this.jsonModel = jsonFilePath;
    }

    stripMod(str:string):string {
        return str.replace('minecraft:', '')
    }
    async initializeModel() {
        const json = this.loadJson(this.jsonModel);
        const parentJson = json.parent ? this.loadJson(path.resolve(`${this.stripMod(json.parent)}.json`)) : null;

        if (parentJson) {
            this.mergeParentModel(json, parentJson);
        }

        await this.loadTextures(json);
        this.faces = this.parseModel(json);
        this.transformations = this.parseTransformations(json);
    }

    private loadJson(filePath: string): ModelJson {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }

    private mergeParentModel(child: ModelJson, parent: ModelJson): void {
        let childJson = child;
        let parentJson = parent;
        if(parentJson.parent) {
            const grandParent = this.loadJson(path.resolve(`${this.stripMod(parentJson.parent)}.json`));
            this.mergeParentModel(parentJson, grandParent);
        }
        // Merge transformations
        let childSource = (childJson as any)?.display?.gui || childJson;
        let parentSource = (parentJson as any)?.display?.gui || parentJson;
        childJson.translate = this.arrToVector3d(childSource.translation || parentSource.translation);
        childJson.rotate = this.arrToVector3d(childSource.rotation || parentSource.rotation);
        childJson.scale = this.arrToVector3d(childSource.scale || parentSource.scale);
        // Merge textures, elements, etc., if necessary
        childJson.textures = {...parentJson.textures,...childJson.textures};
        if (parentJson.elements) {
            childJson.elements = [...(parentJson.elements || []), ...(childJson.elements || [])];
        }
    }

    arrToVector3d(arr: [number, number, number] | Vector3 | undefined): Vector3 | undefined {
        if(!arr) {
            return undefined;
        }
        if('x' in arr) {
            return arr;
        }
        const [x, y, z] = arr
        return {x, y, z}
    }

    private async loadTextures(json: ModelJson) {
        const texturePaths = Object.values(json.textures);
        const uniqueTextures = [...new Set(texturePaths)]; // Ensure no duplicate texture loads

        for (const textureName of uniqueTextures) {
            if(textureName.startsWith('#')) {
                continue;
            }
            const filePath = path.resolve(`textures/${this.stripMod(textureName)}.png`); // Adjust path as necessary
            this.textures[textureName] = await this.loadTexture(filePath);
        }
        console.log(this.textures);
    }

    private loadTexture(filePath: string): Promise<PNG> {
        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(new PNG())
                .on('parsed', function () {
                    resolve(this);
                })
                .on('error', error => reject(error));
        });
    }

    parseTransformations(json: any): Transformations {
        console.log(json)
        // Parse transformations from JSON. This might include translations, rotations, and scaling.
        return {
            translate: json.translate || {x: 0, y: 0, z: 0},
            rotate: json.rotate || {x: 0, y: 0, z: 0},  // Assuming degrees
            scale: json.scale || {x: 1, y: 1, z: 1}
        };
    }


    parseModel(json: any): Face[] {
        const faces: Face[] = [];
        if (!json.elements) {
            return faces;
        }

        for (const element of json.elements) {
            const {from, to} = element;
            const vertices = this.calculateVertices(from, to);

            for (const faceKey of Object.keys(element.faces)) {
                const face = element.faces[faceKey];
                // Fetch PNG object from the cache using the resolved texture name
                let textureName = json.textures[face.texture.replace('#', '')];  // Get the texture name
                if(textureName.startsWith('#')) {
                    textureName=json.textures[textureName.replace('#', '')];
                }

                const texture = this.textures[textureName]; // Use cached PNG object instead of string
                const uv = face.uv ? face.uv : this.defaultUV();

                faces.push({
                    vertices: this.getFaceVertices(faceKey, vertices),
                    texture,
                    uv
                });
            }
        }

        return faces;
    }

    private convertUVToPairs(uv: number[]): number[][] {
        const pairs: number[][] = [];
        for (let i = 0; i < uv.length; i += 2) {
            pairs.push([uv[i], uv[i + 1]]);
        }
        return pairs;
    }
    applyTransformations() {
        // Apply transformations to each face
        for (let face of this.faces) {
            for (let vertex of face.vertices) {
                console.log(`Before Transform: ${vertex.x}, ${vertex.y}, ${vertex.z}`);
                this.scale(vertex, this.transformations!.scale);
                this.rotate(vertex, this.transformations!.rotate);
                this.translate(vertex, this.transformations!.translate);
                console.log(`After Transform: ${vertex.x}, ${vertex.y}, ${vertex.z}`);
            }
        }
    }

    translate(vertex: Vector3, translation: Vector3) {
        vertex.x += translation.x;
        vertex.y += translation.y;
        vertex.z += translation.z;
    }

    rotate(vertex: Vector3, rotation: Vector3) {
        const radiansX = rotation.x * Math.PI / 180;
        const radiansY = rotation.y * Math.PI / 180;
        const radiansZ = rotation.z * Math.PI / 180;

        let y = vertex.y * Math.cos(radiansX) - vertex.z * Math.sin(radiansX);
        let z = vertex.y * Math.sin(radiansX) + vertex.z * Math.cos(radiansX);
        vertex.y = y;
        vertex.z = z;

        let x = vertex.x * Math.cos(radiansY) + vertex.z * Math.sin(radiansY);
        z = vertex.z * Math.cos(radiansY) - vertex.x * Math.sin(radiansY);
        vertex.x = x;

        x = vertex.x * Math.cos(radiansZ) - vertex.y * Math.sin(radiansZ);
        y = vertex.x * Math.sin(radiansZ) + vertex.y * Math.cos(radiansZ);
        vertex.x = x;
        vertex.y = y;
    }

    scale(vertex: Vector3, scale: Vector3) {
        vertex.x *= 5;
        vertex.y *= 5;
        vertex.z *= 5;
    }

    projectTo2D(canvasWidth: number = 64, canvasHeight: number = 64): PNG {
        const png = new PNG({width: canvasWidth, height: canvasHeight, fill: true});

        this.faces.forEach(face => {
            const projectedVertices = face.vertices.map(vertex => {
                return this.projectionType === 'perspective' ?
                    perspectiveProject(vertex, this.cameraZ) :
                    orthographicProject(vertex);
            });

            this.rasterizeFace(png, projectedVertices, face, canvasWidth, canvasHeight);
        });

        return png;
    }

    rasterizeFace(png: PNG, vertices: Vector2[], face: Face, canvasWidth: number, canvasHeight: number) {
        let minX = Number.MAX_VALUE;
        let maxX = Number.MIN_VALUE;
        let minY = Number.MAX_VALUE;
        let maxY = Number.MIN_VALUE;

        for (const vertex of vertices) {
            minX = Math.min(minX, vertex.x);
            maxX = Math.max(maxX, vertex.x);
            minY = Math.min(minY, vertex.y);
            maxY = Math.max(maxY, vertex.y);
        }

        console.log(`Bounding Box: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (this.pointInPolygon(x, y, vertices)) {
                    console.log("faceuv", face.uv)
                    const uv = this.interpolateUV(x, y, vertices, face.uv);
                    const textureX = Math.floor(uv.x * (face.texture.width - 1)); // Subtract 1 to avoid going out of bounds
                    const textureY = Math.floor(uv.y * (face.texture.height - 1)); // Subtract 1 to avoid going out of bounds
                    console.log(`grabbin pixelX ${textureX} and pixelY ${textureY} from texture which has maX ${face.texture.width}
                    , target ${x},${y}`)
                    console.log("checking if tex",uv,vertices,
                        face.texture.width,face.texture.height,textureX,textureY, textureX >= 0, textureX < face.texture.width, textureY >= 0, textureY < face.texture.height)
                    if (textureX >= 0 && textureX < face.texture.width && textureY >= 0 && textureY < face.texture.height) {
                        const color = this.getPixel(face.texture, textureX, textureY);
                        this.setPixel(png, x, y, color);
                    }
                }
            }
        }
    }

    interpolateUV(x: number, y: number, vertices: Vector2[], uv: number[]): Vector2 {
        const [A, B, C, D] = vertices;
        // Calculate area of the entire quad
        const quadArea = this.triangleArea(A, B, C) + this.triangleArea(A, C, D);

        // Calculate areas of the two triangles formed by the point and the quad edges
        const wABC = this.triangleArea(A, B, {x, y}) / quadArea;
        const wACD = this.triangleArea(A, C, {x, y}) / quadArea;

        // Interpolate U and V separately based on the areas
        const interpolatedU = wABC * (uv[2] - uv[0]) + wACD * (uv[3] - uv[1]) + uv[0];
        const interpolatedV = wABC * (uv[3] - uv[1]) + wACD * (uv[3] - uv[1]) + uv[1];

        return {x: interpolatedU, y: interpolatedV};
    }



    triangleArea(A: Vector2, B: Vector2, C: Vector2): number {
        return Math.abs((B.x * C.y - C.x * B.y) - (A.x * C.y - C.x * A.y) + (A.x * B.y - B.x * A.y)) / 2;
    }


    pointInPolygon(x: number, y: number, vertices: Vector2[]): boolean {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;

            const intersect = ((yi > y) != (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    getPixel(texture: PNG, x: number, y: number): { r: number, g: number, b: number, a: number } {
        const idx = (texture.width * y + x) << 2;
        return {
            r: texture.data[idx],
            g: texture.data[idx + 1],
            b: texture.data[idx + 2],
            a: texture.data[idx + 3]
        };
    }


    setPixel(png: PNG, x: number, y: number, color: { r: number, g: number, b: number, a: number }) {
        console.log(`Drawing pixel at ${x}, ${y} with color ${color.r}, ${color.g}, ${color.b}, ${color.a}`);

        if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
            const idx = (png.width * y + x) << 2;
            const bgColor = this.getPixel(png, x, y);
            png.data[idx + 0] = color.r * color.a + bgColor.r * (1 - color.a);
            png.data[idx + 1] = color.g * color.a + bgColor.g * (1 - color.a);
            png.data[idx + 2] = color.b * color.a + bgColor.b * (1 - color.a);
            png.data[idx + 3] = 255; // Set alpha to fully opaque
            console.log(`Drawing pixel at ${x}, ${y} with color ${color.r}, ${color.g}, ${color.b}, ${color.a}`);
        }
    }

    calculateVertices(from: number[], to: number[]): { [key: string]: Vector3 } {
        return {
            'northwest': {x: from[0], y: from[1], z: from[2]},
            'northeast': {x: to[0], y: from[1], z: from[2]},
            'southeast': {x: to[0], y: to[1], z: from[2]},
            'southwest': {x: from[0], y: to[1], z: from[2]},
            'bottom_northwest': {x: from[0], y: from[1], z: to[2]},
            'bottom_northeast': {x: to[0], y: from[1], z: to[2]},
            'bottom_southeast': {x: to[0], y: to[1], z: to[2]},
            'bottom_southwest': {x: from[0], y: to[1], z: to[2]}
        };
    }

    getFaceVertices(faceKey: string, vertices: { [key: string]: Vector3 }): Vector3[] {
        const faceMappings: Record<string, any> = {
            'north': [vertices['northwest'], vertices['northeast'], vertices['bottom_northeast'], vertices['bottom_northwest']],
            'south': [vertices['southwest'], vertices['southeast'], vertices['bottom_southeast'], vertices['bottom_southwest']],
            'east': [vertices['northeast'], vertices['southeast'], vertices['bottom_southeast'], vertices['bottom_northeast']],
            'west': [vertices['northwest'], vertices['southwest'], vertices['bottom_southwest'], vertices['bottom_northwest']],
            'up': [vertices['northwest'], vertices['northeast'], vertices['southeast'], vertices['southwest']],
            'down': [vertices['bottom_northwest'], vertices['bottom_northeast'], vertices['bottom_southeast'], vertices['bottom_southwest']]
        };

        return faceMappings[faceKey] || [];
    }

    defaultUV(): number[] {
        return [ 0, 0, 16, 16 ];
    }
}
