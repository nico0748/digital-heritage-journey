"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  Check,
  Eraser,
  Palette,
  Sparkles,
  Undo2,
} from "lucide-react";
import clsx from "clsx";

type Symmetry = 6 | 8 | 12;
type GlassColor = "blue" | "red";

const glassColors: Record<
  GlassColor,
  { body: string; highlight: string; label: string }
> = {
  blue: { body: "#18406E", highlight: "#CDE7FF", label: "瑠璃" },
  red: { body: "#7A1818", highlight: "#FFD0D0", label: "赤" },
};

interface UV {
  u: number;
  v: number;
}
interface Stroke {
  points: UV[];
}

const TEX_W = 2048;
const TEX_H = 1024;

/** Procedural studio env baked from three's RoomEnvironment — no CDN fetch. */
function RoomEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envMap;
    return () => {
      envMap.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

/**
 * Glass mesh. Auto-rotates unless the user is cutting. Forwards UV-space
 * pointer events to the parent for drawing into an offscreen canvas
 * that is wrapped around the cylinder as an emissive/roughness map.
 */
function Glass({
  color,
  texture,
  onCutStart,
  onCutMove,
  onCutEnd,
}: {
  color: GlassColor;
  texture: THREE.CanvasTexture | null;
  onCutStart: (uv: UV) => void;
  onCutMove: (uv: UV) => void;
  onCutEnd: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const cuttingRef = useRef(false);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    if (!cuttingRef.current) {
      groupRef.current.rotation.y += dt * 0.25;
    }
  });

  const c = glassColors[color];

  const handleDown = (e: ThreeEvent<PointerEvent>) => {
    if (!e.uv) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    cuttingRef.current = true;
    onCutStart({ u: e.uv.x, v: e.uv.y });
  };
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!cuttingRef.current || !e.uv) return;
    onCutMove({ u: e.uv.x, v: e.uv.y });
  };
  const handleUp = () => {
    if (!cuttingRef.current) return;
    cuttingRef.current = false;
    onCutEnd();
  };

  return (
    <group ref={groupRef}>
      {/* Body — open-ended so we can cut on one wall without caps
          interfering with UV space. */}
      <mesh
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
        castShadow
      >
        <cylinderGeometry args={[0.85, 0.68, 1.9, 128, 1, true]} />
        <meshPhysicalMaterial
          color={c.body}
          side={THREE.DoubleSide}
          roughness={0.15}
          metalness={0}
          transmission={0.55}
          thickness={0.9}
          ior={1.5}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive={new THREE.Color(c.highlight)}
          emissiveMap={texture ?? undefined}
          emissiveIntensity={1.8}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* Bottom disk */}
      <mesh position={[0, -0.95, 0]} receiveShadow>
        <cylinderGeometry args={[0.68, 0.66, 0.08, 64]} />
        <meshPhysicalMaterial
          color={c.body}
          roughness={0.2}
          transmission={0.35}
          thickness={0.4}
          ior={1.5}
        />
      </mesh>

    </group>
  );
}

export function KirikoCanvas({
  onComplete,
}: {
  onComplete: (dataUrl: string) => void;
  palette: [string, string, string];
}) {
  const [color, setColor] = useState<GlassColor>("blue");
  const [symmetry, setSymmetry] = useState<Symmetry>(8);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [ready, setReady] = useState(false);

  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  // Initialize offscreen canvas + texture client-side only.
  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    offscreenCanvasRef.current = c;

    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    textureRef.current = t;

    redraw();
    setReady(true);

    return () => {
      t.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render texture when symmetry changes.
  useEffect(() => {
    if (ready) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symmetry, ready]);

  const redraw = useCallback(() => {
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Black = no emissive contribution → base color visible.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const drawStroke = (stroke: Stroke, pass: "under" | "glow") => {
      if (stroke.points.length < 2) return;

      for (let i = 0; i < symmetry; i++) {
        const rotation = i / symmetry;
        for (const mirror of [1, -1] as const) {
          const mapU = (u: number) => {
            const mu = mirror === 1 ? u : 1 - u;
            return (((mu + rotation) % 1 + 1) % 1) * w;
          };

          // Precompute xs to detect wrap-around and split segments.
          const pts = stroke.points;
          const xs = pts.map((p) => mapU(p.u));
          const ys = pts.map((p) => p.v * h);

          const segments: number[][] = [[0]];
          for (let k = 1; k < pts.length; k++) {
            if (Math.abs(xs[k] - xs[k - 1]) > w / 2) {
              segments.push([k]);
            } else {
              segments[segments.length - 1].push(k);
            }
          }

          if (pass === "under") {
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
            ctx.lineWidth = 14;
          } else {
            ctx.strokeStyle = "rgba(255,255,255,1)";
            ctx.lineWidth = 5;
          }
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          for (const seg of segments) {
            if (seg.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(xs[seg[0]], ys[seg[0]]);
            for (let j = 1; j < seg.length; j++) {
              ctx.lineTo(xs[seg[j]], ys[seg[j]]);
            }
            ctx.stroke();
          }
        }
      }
    };

    for (const s of strokesRef.current) drawStroke(s, "under");
    if (currentStrokeRef.current) drawStroke(currentStrokeRef.current, "under");
    for (const s of strokesRef.current) drawStroke(s, "glow");
    if (currentStrokeRef.current) drawStroke(currentStrokeRef.current, "glow");

    if (textureRef.current) textureRef.current.needsUpdate = true;
  }, [symmetry]);

  const onCutStart = useCallback(
    (uv: UV) => {
      currentStrokeRef.current = { points: [uv] };
      redraw();
    },
    [redraw],
  );

  const onCutMove = useCallback(
    (uv: UV) => {
      const stroke = currentStrokeRef.current;
      if (!stroke) return;
      const last = stroke.points[stroke.points.length - 1];
      // Down-sample at ~0.3% of UV space.
      if (Math.hypot(uv.u - last.u, uv.v - last.v) < 0.003) return;
      stroke.points.push(uv);
      redraw();
    },
    [redraw],
  );

  const onCutEnd = useCallback(() => {
    if (
      currentStrokeRef.current &&
      currentStrokeRef.current.points.length > 1
    ) {
      strokesRef.current.push(currentStrokeRef.current);
      setHasStrokes(true);
    }
    currentStrokeRef.current = null;
    redraw();
  }, [redraw]);

  const undo = () => {
    strokesRef.current.pop();
    setHasStrokes(strokesRef.current.length > 0);
    redraw();
  };
  const clear = () => {
    strokesRef.current = [];
    setHasStrokes(false);
    redraw();
  };
  const complete = () => {
    const gl = glRef.current;
    if (!gl) return;
    onComplete(gl.domElement.toDataURL("image/png"));
  };

  const lights = useMemo(
    () => (
      <>
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 4]} intensity={1.3} castShadow />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} color="#9EC8FF" />
        <pointLight position={[0, -2, 3]} intensity={0.4} color="#FFF3DA" />
      </>
    ),
    [],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6 text-washi-50">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <Palette size={12} className="text-washi-50/60" />
          {(Object.keys(glassColors) as GlassColor[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Glass color ${c}`}
              onClick={() => setColor(c)}
              className={clsx(
                "h-7 w-7 rounded-full border transition",
                color === c
                  ? "scale-110 border-washi-50"
                  : "border-washi-50/30 hover:border-washi-50/60",
              )}
              style={{ backgroundColor: glassColors[c].body }}
            />
          ))}
          <span className="ml-1 font-jp text-xs text-washi-50/60">
            {glassColors[color].label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em]">
          <Sparkles size={12} className="text-washi-50/60" />
          {([6, 8, 12] as Symmetry[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSymmetry(n)}
              className={clsx(
                "rounded-full border px-3 py-1 transition",
                symmetry === n
                  ? "border-washi-50 bg-washi-50/10 text-washi-50"
                  : "border-washi-50/20 text-washi-50/60 hover:text-washi-50",
              )}
            >
              {n}-fold
            </button>
          ))}
        </div>
      </div>

      <p className="text-[0.65rem] uppercase tracking-[0.4em] text-washi-50/70">
        Drag across the glass to cut · ドラッグで刻む
      </p>

      <div className="aspect-square w-[min(90vw,34rem)] overflow-hidden rounded-[2rem] border border-washi-50/10 bg-gradient-to-br from-black/40 via-black/20 to-black/40 shadow-2xl shadow-black/50">
        <Canvas
          shadows
          camera={{ position: [0, 0.4, 6.5], fov: 19 }}
          gl={{
            preserveDrawingBuffer: true,
            antialias: true,
          }}
          onCreated={({ gl }) => {
            glRef.current = gl;
            gl.toneMappingExposure = 1.1;
          }}
        >
          {lights}
          <RoomEnv />
          {ready && (
            <Glass
              color={color}
              texture={textureRef.current}
              onCutStart={onCutStart}
              onCutMove={onCutMove}
              onCutEnd={onCutEnd}
            />
          )}
          <ContactShadows
            position={[0, -0.98, 0]}
            opacity={0.6}
            scale={4}
            blur={2.4}
            far={1.6}
          />
        </Canvas>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={undo}
          disabled={!hasStrokes}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-40"
        >
          <Undo2 size={12} /> Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!hasStrokes}
          className="inline-flex items-center gap-2 rounded-full border border-washi-50/30 px-4 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-washi-50/80 transition hover:bg-washi-50/10 disabled:opacity-40"
        >
          <Eraser size={12} /> Clear
        </button>
        <button
          type="button"
          onClick={complete}
          disabled={!hasStrokes}
          className="inline-flex items-center gap-2 rounded-full bg-washi-50 px-5 py-2 text-[0.65rem] uppercase tracking-[0.3em] text-sumi transition hover:bg-washi-100 disabled:opacity-40"
        >
          <Check size={12} /> Complete
        </button>
      </div>
    </div>
  );
}
