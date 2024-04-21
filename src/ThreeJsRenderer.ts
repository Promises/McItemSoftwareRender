import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Model } from './model';
import {Geometry, Face3} from "three/examples/jsm/deprecated/Geometry";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls for camera manipulation
const controls = new OrbitControls(camera, renderer.domElement);

const model = new Model('block/stone.json', 'perspective'); // Use perspective projection
model.initializeModel().then(() => {

// Create materials for each face based on loaded textures
    const materials = model.faces.map(face => {
        const texture = new THREE.Texture(
            new ImageData(
                new Uint8ClampedArray(face.texture.data),
                face.texture.width,
                face.texture.height
            )
        );
        texture.needsUpdate = true; // Important for updating the texture
        return new THREE.MeshBasicMaterial({ map: texture });
    });

    model.faces.forEach((face, index) => {
        const geometry = new THREE.BufferGeometry();
        const vertices = face.vertices.map(vertex => new THREE.Vector3(vertex.x, vertex.y, vertex.z));
        geometry.setFromPoints(vertices);

        // Assuming faces are quads (4 vertices)
        const indices = [0, 1, 2, 0, 2, 3];
        geometry.setIndex(indices);

        geometry.computeVertexNormals(); // Compute normals for lighting

        const mesh = new THREE.Mesh(geometry, materials[index]);
        scene.add(mesh);
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update(); // Update orbit controls
        renderer.render(scene, camera);
    }
    animate();

});
