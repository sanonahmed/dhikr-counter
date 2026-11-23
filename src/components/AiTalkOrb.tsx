import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';

type OrbMode = 'idle' | 'listening' | 'thinking' | 'speaking';
interface AiTalkOrbProps { mode: OrbMode; className?: string; }

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 positionView = modelViewMatrix * vec4(position, 1.0);
    vPosition = positionView.xyz;
    gl_Position = projectionMatrix * positionView;
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uMode;
  varying vec3 vNormal;
  varying vec3 vPosition;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  void main() {
    vec3 n = normalize(vNormal);
    float flow = noise(n * 4.2 + vec3(uTime*.12,-uTime*.08,uTime*.06));
    float fine = noise(n * 10.0 - vec3(uTime*.1));
    float bands = sin((n.y*5.0+flow*2.0+uTime*.18)*3.14159)*.5+.5;
    float fresnel = pow(1.0-max(dot(n,normalize(-vPosition)),0.0),2.4);
    vec3 color = mix(vec3(.015,.105,.075),vec3(.035,.36,.235),smoothstep(.2,.85,flow+bands*.24));
    color = mix(color,vec3(.78,.59,.28),smoothstep(.67,.96,flow*.58+fine*.35+bands*.16)*.42);
    float pulse = uMode > .5 ? .65+.35*sin(uTime*(uMode>1.5?2.6:1.5)) : 0.0;
    color += vec3(.04,.24,.15)*pulse*(.22+flow*.3)+vec3(.78,.59,.28)*fresnel*(.35+pulse*.55);
    color *= .62+.5*max(dot(n,normalize(vec3(-.45,.7,1.0))),0.0);
    gl_FragColor = vec4(color,.96);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function AiTalkOrb({ mode, className = '' }: AiTalkOrbProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const cleanupRef = useRef<(() => void) | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const [webglFailed, setWebglFailed] = useState(false);
  modeRef.current = mode;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | undefined;
    let observer: ResizeObserver | undefined;
    let onVisibilityChange: (() => void) | undefined;
    let onMotionChange: (() => void) | undefined;

    void import('three').then((THREE) => {
      if (disposed || !host) return;
      try {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
        camera.position.z = 5.2;
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        renderer.setClearColor(0x000000, 0);
        host.appendChild(renderer.domElement);

        const uniforms = { uTime: { value: 0 }, uMode: { value: 0 } };
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.94, 64, 48),
          new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true }),
        );
        scene.add(orb);

        const orbit = new THREE.Mesh(
          new THREE.TorusGeometry(1.28, 0.008, 8, 180),
          new THREE.MeshBasicMaterial({ color: 0xd7b76d, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        orbit.rotation.set(1.06, 0.18, -0.28);
        scene.add(orbit);

        const innerOrbit = new THREE.Mesh(
          new THREE.TorusGeometry(1.13, 0.004, 6, 160),
          new THREE.MeshBasicMaterial({ color: 0x40bd89, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        innerOrbit.rotation.set(0.42, -0.6, 0.75);
        scene.add(innerOrbit);

        const positions = new Float32Array(72 * 3);
        for (let index = 0; index < 72; index += 1) {
          const theta = Math.random() * Math.PI * 2;
          const y = Math.random() * 2 - 1;
          const radius = 1.48 + Math.random() * 0.28;
          const horizontal = Math.sqrt(1 - y * y);
          positions[index * 3] = radius * horizontal * Math.cos(theta);
          positions[index * 3 + 1] = radius * y;
          positions[index * 3 + 2] = radius * horizontal * Math.sin(theta);
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const particles = new THREE.Points(
          particleGeometry,
          new THREE.PointsMaterial({ color: 0xe5c778, size: 0.018, transparent: true, opacity: 0.8, sizeAttenuation: true, depthWrite: false }),
        );
        scene.add(particles);

        const lattice = new THREE.LineSegments(
          new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.18, 1)),
          new THREE.LineBasicMaterial({ color: 0xd4a853, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        scene.add(lattice);

        const resize = () => {
          if (!renderer || !host) return;
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        };
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(resize);
          observer.observe(host);
        } else {
          window.addEventListener('resize', resize);
        }
        resize();

        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        let motionAllowed = !motionQuery.matches;
        const renderFrame = (time: number) => {
          if (disposed || !renderer) return;
          const seconds = time * 0.001;
          const targetMode = modeRef.current === 'listening' ? 1 : modeRef.current === 'thinking' ? 2 : modeRef.current === 'speaking' ? 1.5 : 0;
          uniforms.uTime.value = seconds;
          uniforms.uMode.value += (targetMode - uniforms.uMode.value) * 0.08;
          orb.rotation.y = motionAllowed ? seconds * 0.11 : 0.22;
          orb.rotation.x = motionAllowed ? Math.sin(seconds * 0.18) * 0.07 : 0.04;
          orbit.rotation.z = motionAllowed ? -0.28 + seconds * 0.035 : -0.28;
          innerOrbit.rotation.y = motionAllowed ? -0.6 + seconds * 0.045 : -0.6;
          lattice.rotation.y = motionAllowed ? -seconds * 0.025 : 0;
          particles.rotation.y = motionAllowed ? seconds * 0.02 : 0;
          renderer.render(scene, camera);
          if (motionAllowed && !document.hidden) frame = window.requestAnimationFrame(renderFrame);
        };
        const draw = () => {
          window.cancelAnimationFrame(frame);
          frame = window.requestAnimationFrame(renderFrame);
        };
        drawRef.current = draw;
        onMotionChange = () => {
          motionAllowed = !motionQuery.matches;
          draw();
        };
        onVisibilityChange = () => {
          window.cancelAnimationFrame(frame);
          if (!document.hidden) draw();
        };
        motionQuery.addEventListener('change', onMotionChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
        cleanupRef.current = () => {
          motionQuery.removeEventListener('change', onMotionChange!);
          document.removeEventListener('visibilitychange', onVisibilityChange!);
          window.removeEventListener('resize', resize);
          observer?.disconnect();
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
              object.geometry.dispose();
              const material = object.material;
              if (Array.isArray(material)) material.forEach((item) => item.dispose());
              else material.dispose();
            }
          });
          renderer?.dispose();
        };
        draw();
      } catch {
        setWebglFailed(true);
      }
    }).catch(() => setWebglFailed(true));

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (renderer) {
        renderer.domElement.remove();
        renderer.forceContextLoss();
      }
    };
  }, []);

  useEffect(() => {
    drawRef.current();
  }, [mode]);

  return (
    <div ref={hostRef} className={`ai-talk-orb relative isolate ${className}`} aria-hidden="true">
      <div className="ai-talk-orb-halo absolute inset-0 rounded-full" />
      {webglFailed && <div className="ai-talk-orb-fallback absolute inset-0 rounded-full" />}
    </div>
  );
}
