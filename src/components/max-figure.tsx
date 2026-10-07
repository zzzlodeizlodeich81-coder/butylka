import { useEffect, useRef } from "react";

export function MaxFigure({ className, mode = "shift", play = 0 }: { className?: string; mode?: "shift" | "still"; play?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const playRef = useRef(play);
  modeRef.current = mode;
  playRef.current = play;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let stop = false;
    let cleanup = () => {};

    void (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      if (stop) return;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
      scene.add(new THREE.HemisphereLight(0xfff4e5, 0x2a1a0c, 2.4));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(1, 2, 2);
      scene.add(key);
      const canvas = renderer.domElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "auto";
      el.appendChild(canvas);

      const gltf = await new GLTFLoader().loadAsync("/max.glb");
      if (stop) {
        renderer.dispose();
        canvas.remove();
        return;
      }
      const model = gltf.scene;
      const group = new THREE.Group();
      group.rotation.y = -Math.PI / 2;
      group.add(model);
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const dist = size.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.position.set(center.x, center.y + size.y * 0.02, center.z + dist * 1.05);
      camera.lookAt(center.x, center.y + size.y * 0.02, center.z);
      camera.near = Math.max(dist / 80, 0.01);
      camera.far = dist * 20;
      camera.updateProjectionMatrix();

      const rest = new Map<any, any>();
      const bones: Record<string, any> = {};
      model.traverse((obj: any) => {
        if (obj.name === "mixamorig:Head" || obj.name === "mixamorig:Neck" || obj.name === "mixamorig:Spine2" || obj.name === "mixamorig:Hips") {
          bones[obj.name] = obj;
          rest.set(obj, obj.quaternion.clone());
        }
      });
      const nod = new THREE.Quaternion();
      const euler = new THREE.Euler();
      const clock = new THREE.Clock();
      let frame = 0;
      let seen = 0;
      let gesture = -1;
      let localPlay = 0;
      canvas.addEventListener("pointerdown", (event) => {
        if (modeRef.current !== "still") return;
        event.preventDefault();
        event.stopPropagation();
        localPlay += 1;
      });
      const fit = () => {
        const w = el.clientWidth || 80;
        const h = el.clientHeight || 140;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);
      const swing = (bone: any, x: number, y: number, z: number) => {
        if (!bone) return;
        const base = rest.get(bone);
        if (!base) return;
        euler.set(x, y, z);
        nod.setFromEuler(euler);
        bone.quaternion.copy(base).multiply(nod);
      };
      const tick = () => {
        frame = requestAnimationFrame(tick);
        const t = clock.getElapsedTime();
        group.rotation.y = -Math.PI / 2;
        group.rotation.x = 0;
        const cue = playRef.current + localPlay;
        if (cue !== seen) {
          seen = cue;
          gesture = t;
        }
        const age = t - gesture;
        if (modeRef.current === "shift") {
          const shift = Math.sin(t * 0.9);
          group.rotation.z = shift * 0.07;
          group.position.x = shift * size.x * 0.12;
          swing(bones["mixamorig:Hips"], 0, 0, shift * 0.18);
          swing(bones["mixamorig:Spine2"], 0, 0, -shift * 0.1);
          swing(bones["mixamorig:Head"], 0, 0, -shift * 0.04);
          swing(bones["mixamorig:Neck"], 0, 0, 0);
        } else if (gesture >= 0 && age < 1.6) {
          const turn = Math.sin((age / 1.6) * Math.PI);
          group.rotation.y = -Math.PI / 2 + turn * 0.55;
          group.rotation.z = 0;
          group.position.x = 0;
          swing(bones["mixamorig:Hips"], turn * 0.12, 0, 0);
          swing(bones["mixamorig:Spine2"], turn * 0.08, 0, 0);
          swing(bones["mixamorig:Head"], -turn * 0.25, turn * 0.2, 0);
          swing(bones["mixamorig:Neck"], -turn * 0.08, 0, 0);
        } else {
          group.rotation.z = 0;
          group.position.x = 0;
          swing(bones["mixamorig:Hips"], 0, 0, 0);
          swing(bones["mixamorig:Spine2"], 0, 0, 0);
          swing(bones["mixamorig:Head"], 0, 0, 0);
          swing(bones["mixamorig:Neck"], 0, 0, 0);
        }
        model.traverse((obj: any) => {
          if (obj.isSkinnedMesh) obj.skeleton.update();
        });
        renderer.render(scene, camera);
      };
      tick();
      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        renderer.dispose();
        canvas.remove();
      };
    })().catch(() => undefined);

    return () => {
      stop = true;
      cleanup();
    };
  }, []);

  return <div ref={host} className={className} />;
}
