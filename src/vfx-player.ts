import * as THREE from "three";
import dom2canvas from "./dom-to-canvas";
import { shaders, DEFAULT_VERTEX_SHADER } from "./constants";
import GIFData from "./gif";
import { VFXProps, VFXElement, VFXElementType, VFXUniformValue } from "./types";

const gifFor = new Map<HTMLElement, GIFData>();

export default class VFXPlayer {
    renderer: THREE.WebGLRenderer;
    camera: THREE.Camera;
    isPlaying = false;
    pixelRatio = 2;
    elements: VFXElement[] = [];

    textureLoader = new THREE.TextureLoader();

    w = 0;
    h = 0;
    scrollX = 0;
    scrollY = 0;

    mouseX = 0;
    mouseY = 0;

    constructor(private canvas: HTMLCanvasElement, pixelRatio?: number) {
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
        });
        this.renderer.autoClear = false;
        this.renderer.setClearAlpha(0);

        if (typeof window !== "undefined") {
            this.pixelRatio = pixelRatio || window.devicePixelRatio;

            window.addEventListener("resize", this.resize);
            window.addEventListener("scroll", this.scroll, {
                passive: true,
            });
            window.addEventListener("mousemove", this.mousemove);
        }
        this.resize();
        this.scroll();

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        this.camera.position.set(0, 0, 1);
    }

    destroy(): void {
        if (typeof window !== "undefined") {
            window.removeEventListener("resize", this.resize);
            window.removeEventListener("scroll", this.scroll);
            window.removeEventListener("mousemove", this.mousemove);
        }
    }

    private updateCanvasSize(): void {
        if (typeof window !== "undefined") {
            const w = window.innerWidth;
            const h = window.innerHeight;

            if (w !== this.w || h !== this.h) {
                this.canvas.width = w;
                this.canvas.height = h;
                this.renderer.setSize(w, h);
                this.renderer.setPixelRatio(this.pixelRatio);
                this.w = w;
                this.h = h;
            }
        }
    }

    private resize = async (): Promise<void> => {
        if (typeof window !== "undefined") {
            // Update dom2canvas result.
            // Render elements in viewport first, then render elements outside of the viewport.
            for (const e of this.elements) {
                if (e.type === "text" && e.isInViewport) {
                    const rect = e.element.getBoundingClientRect();
                    if (rect.width !== e.width || rect.height !== e.height) {
                        await this.rerender(e);
                        e.width = rect.width;
                        e.height = rect.height;
                    }
                }
            }
            for (const e of this.elements) {
                if (e.type === "text" && !e.isInViewport) {
                    const rect = e.element.getBoundingClientRect();
                    if (rect.width !== e.width || rect.height !== e.height) {
                        await this.rerender(e);
                        e.width = rect.width;
                        e.height = rect.height;
                    }
                }
            }
        }
    };

    private scroll = (): void => {
        if (typeof window !== "undefined") {
            this.scrollX = window.scrollX;
            this.scrollY = window.scrollY;
        }
    };

    private mousemove = (e: MouseEvent): void => {
        if (typeof window !== "undefined") {
            this.mouseX = e.clientX;
            this.mouseY = window.innerHeight - e.clientY;
        }
    };

    private async rerender(e: VFXElement): Promise<void> {
        try {
            e.element.style.setProperty("opacity", "1"); // TODO: Restore original opacity

            const texture: THREE.CanvasTexture = e.uniforms["src"].value;
            const canvas = texture.image;

            await dom2canvas(e.element, canvas);
            if (canvas.width === 0 || canvas.width === 0) {
                throw "omg";
            }

            e.element.style.setProperty("opacity", "0");

            texture.needsUpdate = true;
        } catch (e) {
            console.error(e);
        }
    }

    async addElement(element: HTMLElement, opts: VFXProps = {}): Promise<void> {
        // Init opts
        const shaderName = opts.shader || "uvGradient";
        const shader = (shaders as any)[shaderName] || shaderName;

        const rect = element.getBoundingClientRect();
        const isInViewport = this.isRectInViewport(rect);

        // Create values for element types
        let texture: THREE.Texture;
        let type: VFXElementType;
        let isGif = false;
        if (element instanceof HTMLImageElement) {
            type = "img" as VFXElementType;
            isGif = !!element.src.match(/\.gif/i);

            if (isGif) {
                const gif = await GIFData.create(element.src, this.pixelRatio);
                gifFor.set(element, gif);
                texture = new THREE.Texture(gif.getCanvas());
            } else {
                texture = this.textureLoader.load(element.src);
            }
        } else if (element instanceof HTMLVideoElement) {
            texture = new THREE.VideoTexture(element);
            type = "video" as VFXElementType;
        } else {
            const canvas = await dom2canvas(element);
            texture = new THREE.CanvasTexture(canvas);
            type = "text" as VFXElementType;
        }

        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;
        texture.needsUpdate = true;

        // Hide original element
        const opacity = type === "video" ? "0.0001" : "0"; // don't hide video element completely to prevent jank frames
        element.style.setProperty("opacity", opacity);

        const uniforms: { [name: string]: THREE.IUniform } = {
            src: { value: texture },
            resolution: {
                value: new THREE.Vector2(),
            },
            offset: { value: new THREE.Vector2() },
            time: { value: 0.0 },
            enterTime: { value: -1.0 },
            leaveTime: { value: -1.0 },
            mouse: { value: new THREE.Vector2() },
        };

        const uniformGenerators: {
            [name: string]: () => VFXUniformValue;
        } = {};

        if (opts.uniforms !== undefined) {
            const keys = Object.keys(opts.uniforms);
            for (const key of keys) {
                const value = opts.uniforms[key];
                if (typeof value === "function") {
                    uniforms[key] = {
                        value: value(),
                    };
                    uniformGenerators[key] = value;
                } else {
                    uniforms[key] = { value };
                }
            }
        }

        const scene = new THREE.Scene();
        const geometry = new THREE.PlaneGeometry(2, 2);

        const material = new THREE.ShaderMaterial({
            vertexShader: DEFAULT_VERTEX_SHADER,
            fragmentShader: shader,
            transparent: true,
            uniforms,
        });
        material.extensions = {
            derivatives: true,
            drawBuffers: true,
            fragDepth: true,
            shaderTextureLOD: true,
        };

        scene.add(new THREE.Mesh(geometry, material));

        const now = Date.now() / 1000;
        const elem = {
            type,
            element,
            isInViewport,
            width: rect.width,
            height: rect.height,
            scene,
            uniforms,
            uniformGenerators,
            startTime: now,
            enterTime: isInViewport ? now : -1,
            leaveTime: Infinity,
            release: opts.release ?? 0,
            isGif,
            overflow: opts.overflow ?? false,
        };

        this.elements.push(elem);
    }

    removeElement(element: HTMLElement): void {
        const i = this.elements.findIndex((e) => e.element === element);
        if (i !== -1) {
            this.elements.splice(i, 1);
        }
    }

    updateElement(element: HTMLElement): Promise<void> {
        const i = this.elements.findIndex((e) => e.element === element);
        if (i !== -1) {
            return this.rerender(this.elements[i]);
        }

        // Do nothing if the element is not found
        // This happens when addElement is still processing
        return Promise.resolve();
    }

    play(): void {
        this.isPlaying = true;
        this.playLoop();
    }

    stop(): void {
        this.isPlaying = false;
    }

    private playLoop = (): void => {
        const now = Date.now() / 1000;

        this.renderer.clear();

        // This must done every frame because iOS Safari doesn't fire
        // window resize event while the address bar is transforming.
        this.updateCanvasSize();

        for (const e of this.elements) {
            const rect = e.element.getBoundingClientRect();

            // Check intersection
            const isInViewport = this.isRectInViewport(rect);
            if (isInViewport && !e.isInViewport) {
                e.enterTime = now;
                e.leaveTime = Infinity;
            }
            if (!isInViewport && e.isInViewport) {
                e.leaveTime = now;
            }
            e.isInViewport = isInViewport;

            if (isInViewport && now - e.leaveTime > e.release) {
                return;
            }

            // Update uniforms
            e.uniforms["time"].value = now - e.startTime;
            e.uniforms["enterTime"].value =
                e.enterTime === -1 ? 0 : now - e.enterTime;
            e.uniforms["leaveTime"].value =
                e.leaveTime === -1 ? 0 : now - e.leaveTime;
            e.uniforms["resolution"].value.x = rect.width * this.pixelRatio; // TODO: use correct width, height
            e.uniforms["resolution"].value.y = rect.height * this.pixelRatio;
            e.uniforms["offset"].value.x = rect.left * this.pixelRatio;
            e.uniforms["offset"].value.y =
                (window.innerHeight - rect.top - rect.height) * this.pixelRatio;
            e.uniforms["mouse"].value.x = this.mouseX * this.pixelRatio;
            e.uniforms["mouse"].value.y = this.mouseY * this.pixelRatio;

            for (const [key, gen] of Object.entries(e.uniformGenerators)) {
                e.uniforms[key].value = gen();
            }

            // Update GIF frame
            const gif = gifFor.get(e.element);
            if (gif !== undefined) {
                gif.update();
            }

            if (e.type === "video" || e.isGif) {
                e.uniforms["src"].value.needsUpdate = true;
            }

            // Set viewport
            if (e.overflow) {
                this.renderer.setViewport(
                    0,
                    0,
                    window.innerWidth,
                    window.innerHeight
                );
            } else {
                this.renderer.setViewport(
                    rect.left,
                    window.innerHeight - (rect.top + rect.height),
                    rect.width,
                    rect.height
                );
            }

            // Render to viewport
            this.camera.lookAt(e.scene.position);
            try {
                this.renderer.render(e.scene, this.camera);
            } catch (e) {
                console.error(e);
            }
        }

        if (this.isPlaying) {
            requestAnimationFrame(this.playLoop);
        }
    };

    private isRectInViewport(rect: DOMRect): boolean {
        // TODO: Consider custom root element
        return (
            rect.left <= this.w &&
            rect.right >= 0 &&
            rect.top <= this.h &&
            rect.bottom >= 0
        );
    }
}
