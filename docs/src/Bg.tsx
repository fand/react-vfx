import React, { useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "react-three-fiber";
import { useSpring } from "react-spring";
import { isMobile } from "is-mobile";
import * as THREE from "three";
import Triangle from "./gl/Triangle";
import Fragments from "./gl/Fragments";
import Effects from "./gl/Effects";

const canvasStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    zIndex: -1,
    pointerEvents: "none"
};

function Bg() {
    const { scene, camera } = useThree();
    scene.background = new THREE.Color(0x222222);

    const [{ scroll }, set] = useSpring(() => ({ scroll: 0 }));
    const onScroll = useCallback(e => set({ scroll: window.scrollY }), [set]);

    const top = scroll.interpolate(x => {
        if (typeof window === "undefined" || typeof document === "undefined") {
            return 0;
        }
        return x / (document.body.scrollHeight - window.innerHeight);
    });

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") {
            return;
        }

        window.addEventListener("scroll", onScroll);

        return () => {
            window.removeEventListener("scroll", onScroll);
        };
    }, [onScroll]);

    useFrame(() => {
        const s = top.getValue();
        camera.rotation.set(-Math.PI * 0.1 - s * Math.PI * 0.4, 0, 0);
    });

    return (
        <>
            <Triangle scroll={top} />
            <Fragments count={isMobile() ? 800 : 1500} scroll={top} />
        </>
    );
}

export default () => (
    <Canvas style={canvasStyle as any}>
        <Effects />
        <Bg />
    </Canvas>
);
