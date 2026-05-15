const root = document.documentElement;
const canvas = document.querySelector("#particle-field");
const ctx = canvas.getContext("2d");
const preloader = document.querySelector(".preloader");
const globeContainer = document.querySelector("#global-globe-webgl");
const revealItems = document.querySelectorAll(".reveal");
const depthItems = document.querySelectorAll("[data-depth]");
const magneticItems = document.querySelectorAll(".magnetic");

let width = 0;
let height = 0;
let particles = [];
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
let globalGlobe = null;
let loaderExitScheduled = false;
let loaderFinished = false;
const loaderStartedAt = performance.now();

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function resizeCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  resizeGlobalGlobe();

  const particleCount = Math.min(92, Math.floor((width * height) / 18000));
  particles = Array.from({ length: particleCount }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    z: Math.random() * 0.8 + 0.2,
    radius: Math.random() * 1.4 + 0.35,
    speed: Math.random() * 0.18 + 0.04,
    alpha: Math.random() * 0.4 + 0.18,
  }));
}

function drawParticles() {
  ctx.clearRect(0, 0, width, height);

  particles.forEach((particle) => {
    particle.y -= particle.speed * particle.z;
    particle.x += Math.sin((particle.y + performance.now() * 0.02) * 0.004) * 0.08;

    if (particle.y < -10) {
      particle.y = height + 10;
      particle.x = Math.random() * width;
    }

    const dx = (targetX - 0.5) * 18 * particle.z;
    const dy = (targetY - 0.5) * 18 * particle.z;

    ctx.beginPath();
    ctx.arc(particle.x + dx, particle.y + dy, particle.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${particle.alpha})`;
    ctx.fill();
  });
}

function seededValue(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createWcaCoreSprite() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 192;
  const textureContext = textureCanvas.getContext("2d");

  textureContext.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  textureContext.textAlign = "center";
  textureContext.textBaseline = "middle";
  textureContext.letterSpacing = "-6px";
  textureContext.font = "900 118px Manrope, Arial, sans-serif";
  textureContext.shadowColor = "rgba(38, 171, 255, 1)";
  textureContext.shadowBlur = 58;
  textureContext.fillStyle = "rgba(122, 210, 255, 0.5)";
  textureContext.fillText("WCA", textureCanvas.width / 2, textureCanvas.height / 2);
  textureContext.shadowBlur = 30;
  textureContext.fillStyle = "rgba(160, 226, 255, 0.86)";
  textureContext.fillText("WCA", textureCanvas.width / 2, textureCanvas.height / 2);
  textureContext.shadowBlur = 10;
  textureContext.fillStyle = "rgba(255, 255, 255, 1)";
  textureContext.fillText("WCA", textureCanvas.width / 2, textureCanvas.height / 2);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(64, 24, 1);
  sprite.renderOrder = 1000;

  return sprite;
}

function globeSurfacePoint(lat, lng, radius = 100.65) {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  const cosPhi = Math.cos(phi);

  return [
    radius * cosPhi * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * cosPhi * Math.sin(theta),
  ];
}

function isDigitalLand(lat, lng) {
  const landMasses = [
    { lat: 48, lng: -104, latRadius: 29, lngRadius: 64 },
    { lat: 15, lng: -88, latRadius: 24, lngRadius: 31 },
    { lat: -18, lng: -60, latRadius: 38, lngRadius: 28 },
    { lat: 52, lng: 16, latRadius: 24, lngRadius: 46 },
    { lat: 8, lng: 20, latRadius: 42, lngRadius: 32 },
    { lat: 28, lng: 72, latRadius: 34, lngRadius: 58 },
    { lat: 38, lng: 112, latRadius: 25, lngRadius: 42 },
    { lat: -24, lng: 134, latRadius: 17, lngRadius: 22 },
  ];

  return landMasses.some((mass) => {
    const latDistance = (lat - mass.lat) / mass.latRadius;
    const lngDistance = (lng - mass.lng) / mass.lngRadius;
    return latDistance * latDistance + lngDistance * lngDistance < 1;
  });
}

function digitalLandRegion(lat, lng) {
  const landMasses = [
    { lat: 48, lng: -104, latRadius: 29, lngRadius: 64 },
    { lat: 15, lng: -88, latRadius: 24, lngRadius: 31 },
    { lat: -18, lng: -60, latRadius: 38, lngRadius: 28 },
    { lat: 52, lng: 16, latRadius: 24, lngRadius: 46 },
    { lat: 8, lng: 20, latRadius: 42, lngRadius: 32 },
    { lat: 28, lng: 72, latRadius: 34, lngRadius: 58 },
    { lat: 38, lng: 112, latRadius: 25, lngRadius: 42 },
    { lat: -24, lng: 134, latRadius: 17, lngRadius: 22 },
  ];

  return landMasses.findIndex((mass) => {
    const latDistance = (lat - mass.lat) / mass.latRadius;
    const lngDistance = (lng - mass.lng) / mass.lngRadius;
    return latDistance * latDistance + lngDistance * lngDistance < 1;
  });
}

function getFeatureCenter(feature) {
  const geometry = feature.geometry;
  const coordinates =
    geometry?.type === "Polygon"
      ? geometry.coordinates?.[0]
      : geometry?.type === "MultiPolygon"
        ? geometry.coordinates?.[0]?.[0]
        : null;

  if (!coordinates?.length) return { lat: 0, lng: 0 };

  const center = coordinates.reduce(
    (acc, coordinate) => {
      acc.lng += coordinate[0];
      acc.lat += coordinate[1];
      return acc;
    },
    { lat: 0, lng: 0 },
  );

  return {
    lat: center.lat / coordinates.length,
    lng: center.lng / coordinates.length,
  };
}

function prepareGlobeFeature(feature, index) {
  const center = getFeatureCenter(feature);
  const region = Math.max(0, digitalLandRegion(center.lat, center.lng));

  feature.__wca = {
    region,
    phase: seededValue(index * 3.71 + 4) * Math.PI * 2,
    speed: 0.34 + seededValue(index * 5.17 + 2) * 0.82,
    strength: 0.48 + seededValue(index * 8.93 + 6) * 0.98,
    cluster: seededValue(index * 11.47 + 3) > 0.72 ? 1.35 : 0.72 + seededValue(index * 4.29 + 9) * 0.48,
    quiet: seededValue(index * 6.31 + 8) > 0.58 ? 1 : 0.42,
    pulse: 0,
  };

  return feature;
}

function createActivityNodes(hubs) {
  const regions = [
    { name: "americas", index: 0, points: [[45, -100], [38, -122], [33, -84], [25, -80], [19, -99], [4, -74], [-12, -77], [-23, -46], [-34, -58], [-33, -70]] },
    { name: "europe", index: 1, points: [[52, -0.1], [48, 2.3], [52, 13.4], [45, 9.1], [41, 12.5], [40, -3.7], [50, 30.5], [59, 18.1]] },
    { name: "africa", index: 2, points: [[30, 31], [6, 3.4], [9, 38], [-1, 36], [-26, 28], [-34, 18], [14, -17], [33, -7]] },
    { name: "middleEast", index: 3, points: [[25, 55], [24, 46], [32, 35], [35, 51], [41, 29], [31, 73]] },
    { name: "asia", index: 4, points: [[19, 72], [28, 77], [1, 103], [13, 100], [22, 114], [35, 139], [37, 127], [25, 121], [-6, 106]] },
  ];

  const regionalNodes = regions.flatMap((region) =>
    region.points.map(([lat, lng], pointIndex) => {
      const seed = region.index * 31 + pointIndex * 7.7;
      const strongNode = seededValue(seed) > 0.78;

      return {
        name: `${region.name}-${pointIndex}`,
        lat: lat + (seededValue(seed + 1) - 0.5) * 2.2,
        lng: lng + (seededValue(seed + 2) - 0.5) * 2.8,
        region: region.name,
        regionIndex: region.index,
        isHub: false,
        phase: seededValue(seed + 3) * Math.PI * 2,
        speed: 1.05 + seededValue(seed + 4) * 1.9,
        baseRadius: 0,
        peakRadius: strongNode ? 0.16 : 0.09,
        strength: strongNode ? 1 : 0.66 + seededValue(seed + 5) * 0.34,
        pulse: 0,
      };
    }),
  );

  return hubs.concat(regionalNodes);
}

function createTravelingTrajectories(nodes) {
  return Array.from({ length: 14 }, (_, index) => {
    const startIndex = Math.floor(seededValue(index * 9.1 + 2) * nodes.length);
    const endIndex = Math.floor(seededValue(index * 11.7 + 5) * nodes.length);
    const start = nodes[startIndex];
    const end = nodes[endIndex === startIndex ? (endIndex + 13) % nodes.length : endIndex];

    const trajectory = {
      start,
      end,
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      altitude: 0.16 + seededValue(index * 4.4) * 0.36,
      phase: seededValue(index * 3.31) * Math.PI * 2,
      speed: 0.78 + seededValue(index * 5.13) * 0.62,
      strength: 0.56 + seededValue(index * 7.77) * 0.38,
      length: 0.22 + seededValue(index * 2.71) * 0.24,
      gap: 1.35 + seededValue(index * 8.21) * 1.85,
      pulse: 0,
    };

    return [
      {
        ...trajectory,
        trailLayer: "glow",
        length: trajectory.length + 0.08,
        gap: Math.max(1.1, trajectory.gap - 0.12),
        phase: trajectory.phase + 0.04,
      },
      {
        ...trajectory,
        trailLayer: "core",
      },
    ];
  });
}

function createOrbitalEnergyTrails() {
  const trailCount = 8;
  const segmentsPerTrail = 108;
  const satelliteCount = 8;
  const orbitalPlanes = [
    [-1.02, -0.72, 0.18],
    [-0.74, 0.28, 1.7],
    [-0.34, -0.92, 2.65],
    [0.08, 0.62, 0.92],
    [0.46, -0.22, 2.1],
    [0.86, 0.82, 3.02],
    [1.08, -0.48, 1.18],
  ];
  const configs = Array.from({ length: trailCount }, (_, index) => {
    const plane = orbitalPlanes[index % orbitalPlanes.length];

    return {
      radius: 112 + seededValue(index * 2.31 + 1) * 34,
      phase: index / trailCount + (seededValue(index * 4.47 + 8) - 0.5) * 0.055,
      speed: 0.045 + seededValue(index * 5.71 + 3) * 0.042,
      activeWindow: 0.32 + seededValue(index * 7.33 + 4) * 0.12,
      direction: seededValue(index * 8.13 + 9) > 0.5 ? 1 : -1,
      tailLength: 0.18 + seededValue(index * 6.37 + 2) * 0.14,
      strength: 1.7 + seededValue(index * 3.97 + 6) * 0.72,
      acceleration: 0.08 + seededValue(index * 9.43 + 5) * 0.16,
      rotation: new THREE.Euler(
        plane[0] + (seededValue(index * 1.73 + 2) - 0.5) * 0.2,
        plane[1] + (seededValue(index * 2.89 + 7) - 0.5) * 0.24,
        plane[2] + index * 0.37,
      ),
    };
  });

  const buildGeometry = (width) => {
    const positions = [];
    const progress = [];
    const phases = [];
    const speeds = [];
    const tailLengths = [];
    const strengths = [];
    const edgeFades = [];
    const flickers = [];
    const activeWindows = [];
    const indices = [];

    configs.forEach((trail, trailIndex) => {
      const vertexOffset = positions.length / 3;

      for (let segment = 0; segment <= segmentsPerTrail; segment += 1) {
        const t = segment / segmentsPerTrail;
        const angle = t * Math.PI * 2 * trail.direction;
        const center = new THREE.Vector3(Math.cos(angle) * trail.radius, Math.sin(angle) * trail.radius, 0);
        const normal = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(width);
        center.applyEuler(trail.rotation);
        normal.applyEuler(trail.rotation);

        [-1, 1].forEach((side) => {
          positions.push(center.x + normal.x * side, center.y + normal.y * side, center.z + normal.z * side);
          progress.push(t);
          phases.push(trail.phase);
          speeds.push(trail.speed);
          tailLengths.push(trail.tailLength);
          strengths.push(trail.strength);
          edgeFades.push(side);
          flickers.push(0.72 + seededValue(trailIndex * 19.7 + segment * 2.13) * 0.56);
          activeWindows.push(trail.activeWindow);
        });
      }

      for (let segment = 0; segment < segmentsPerTrail; segment += 1) {
        const a = vertexOffset + segment * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aProgress", new THREE.Float32BufferAttribute(progress, 1));
    geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));
    geometry.setAttribute("aTailLength", new THREE.Float32BufferAttribute(tailLengths, 1));
    geometry.setAttribute("aStrength", new THREE.Float32BufferAttribute(strengths, 1));
    geometry.setAttribute("aEdgeFade", new THREE.Float32BufferAttribute(edgeFades, 1));
    geometry.setAttribute("aFlicker", new THREE.Float32BufferAttribute(flickers, 1));
    geometry.setAttribute("aActiveWindow", new THREE.Float32BufferAttribute(activeWindows, 1));
    geometry.setIndex(indices);

    return geometry;
  };

  const createMaterial = ({ alpha, core, bloom }) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: alpha },
      },
      vertexShader: `
        uniform float uTime;
        attribute float aProgress;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aTailLength;
        attribute float aStrength;
        attribute float aEdgeFade;
        attribute float aFlicker;
        attribute float aActiveWindow;
        varying float vAlpha;
        varying float vEdge;

        void main() {
          float eventProgress = fract(aPhase + uTime * aSpeed);
          float active = 1.0 - step(aActiveWindow, eventProgress);
          float localProgress = clamp(eventProgress / aActiveWindow, 0.0, 1.0);
          float head = pow(localProgress, 0.82);
          float distanceFromHead = fract(head - aProgress + 1.0);
          float tail = pow(smoothstep(aTailLength, 0.0, distanceFromHead), 1.02);
          float headLift = smoothstep(0.04, 0.0, distanceFromHead);
          float appear = smoothstep(0.0, 0.1, localProgress) * (1.0 - smoothstep(0.82, 1.0, localProgress));
          float shimmer = 0.96 + sin((aProgress * 26.0) + uTime * (7.0 + aFlicker * 3.0)) * 0.14;
          vAlpha = (tail * 1.02 + headLift * 1.1) * aStrength * appear * shimmer * active;
          vEdge = 1.0 - smoothstep(0.24, 1.0, abs(aEdgeFade));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying float vAlpha;
        varying float vEdge;

        void main() {
          vec3 color = mix(vec3(0.04, 0.36, 1.0), vec3(0.9, 0.99, 1.0), ${core ? "0.86" : bloom ? "0.34" : "0.18"});
          gl_FragColor = vec4(color, vAlpha * uAlpha * (0.38 + vEdge * 0.62));
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

  const group = new THREE.Group();
  const bloom = new THREE.Mesh(buildGeometry(8.8), createMaterial({ alpha: 0.38, core: false, bloom: true }));
  const glow = new THREE.Mesh(buildGeometry(5.2), createMaterial({ alpha: 1.04, core: false }));
  const core = new THREE.Mesh(buildGeometry(1.22), createMaterial({ alpha: 2.35, core: true }));
  bloom.material.depthTest = false;
  glow.material.depthTest = false;
  group.renderOrder = 20;

  const satelliteTailLength = 18;
  const satelliteTrailPositions = new Float32Array(satelliteCount * satelliteTailLength * 3);
  const satelliteTrailAlphas = new Float32Array(satelliteCount * satelliteTailLength);
  const satelliteTrailSizes = new Float32Array(satelliteCount * satelliteTailLength);
  const satellitePositions = new Float32Array(satelliteCount * 3);
  const satelliteAlphas = new Float32Array(satelliteCount);
  const satelliteSizes = new Float32Array(satelliteCount);
  const satelliteConfigs = Array.from({ length: satelliteCount }, (_, index) => ({
    trail: configs[index],
    offset: 0.02 + seededValue(index * 3.17 + 2) * 0.08,
    size: 1.45 + seededValue(index * 7.89 + 4) * 1.4,
    strength: 1.16 + seededValue(index * 8.91 + 7) * 0.9,
  }));
  const satelliteGeometry = new THREE.BufferGeometry();
  satelliteGeometry.setAttribute("position", new THREE.BufferAttribute(satellitePositions, 3));
  satelliteGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(satelliteAlphas, 1));
  satelliteGeometry.setAttribute("aSize", new THREE.BufferAttribute(satelliteSizes, 1));
  const satelliteMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      uniform float uPixelRatio;
      attribute float aAlpha;
      attribute float aSize;
      varying float vAlpha;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (360.0 / -mvPosition.z) * uPixelRatio, 0.0, 10.5);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = aAlpha;
      }
    `,
    fragmentShader: `
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float glow = smoothstep(0.5, 0.0, d);
        float core = smoothstep(0.14, 0.0, d);
        vec3 color = mix(vec3(0.08, 0.52, 1.0), vec3(0.9, 0.98, 1.0), core);
        gl_FragColor = vec4(color, (glow * 1.05 + core * 1.28) * vAlpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const satelliteTrailGeometry = new THREE.BufferGeometry();
  satelliteTrailGeometry.setAttribute("position", new THREE.BufferAttribute(satelliteTrailPositions, 3));
  satelliteTrailGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(satelliteTrailAlphas, 1));
  satelliteTrailGeometry.setAttribute("aSize", new THREE.BufferAttribute(satelliteTrailSizes, 1));
  const satelliteTrailMaterial = satelliteMaterial.clone();
  const satellites = new THREE.Points(satelliteGeometry, satelliteMaterial);
  const satelliteTrails = new THREE.Points(satelliteTrailGeometry, satelliteTrailMaterial);

  group.add(bloom, glow, core, satelliteTrails, satellites);

  return {
    group,
    bloom,
    glow,
    core,
    satelliteTrails,
    satellites,
    satelliteConfigs,
    satelliteTailLength,
    satelliteTrailPositions,
    satelliteTrailAlphas,
    satelliteTrailSizes,
    satellitePositions,
    satelliteAlphas,
    satelliteSizes,
  };
}

function updateOrbitalEnergyTrails(trails, time) {
  trails.bloom.material.uniforms.uTime.value = time;
  trails.glow.material.uniforms.uTime.value = time;
  trails.core.material.uniforms.uTime.value = time;
  trails.group.rotation.y = Math.sin(time * 0.2) * 0.04;
  trails.group.rotation.x = Math.cos(time * 0.16) * 0.028;

  const temp = new THREE.Vector3();
  trails.satelliteConfigs.forEach((satellite, index) => {
    const trail = satellite.trail;
    const eventProgress = (trail.phase + time * trail.speed) % 1;
    const active = eventProgress < trail.activeWindow ? 1 : 0;
    const localProgress = Math.min(1, eventProgress / trail.activeWindow + satellite.offset);
    const easedProgress = Math.pow(localProgress, 0.82);
    const angle = easedProgress * Math.PI * 2 * trail.direction;
    const envelope =
      Math.min(1, localProgress / 0.18) *
      (1 - Math.min(1, Math.max(0, (localProgress - 0.74) / 0.26)));
    const pulse = (Math.sin(time * 3.2 + index * 1.7) + 1) / 2;
    const positionIndex = index * 3;

    temp.set(Math.cos(angle) * trail.radius, Math.sin(angle) * trail.radius, 0);
    temp.applyEuler(trail.rotation);
    trails.satellitePositions[positionIndex] = temp.x;
    trails.satellitePositions[positionIndex + 1] = temp.y;
    trails.satellitePositions[positionIndex + 2] = temp.z;
    trails.satelliteAlphas[index] = active * envelope * satellite.strength * (0.58 + pulse * 0.68);
    trails.satelliteSizes[index] = satellite.size * (0.76 + pulse * 0.42);

    for (let tailIndex = 0; tailIndex < trails.satelliteTailLength; tailIndex += 1) {
      const tailFade = tailIndex / (trails.satelliteTailLength - 1);
      const tailProgress = Math.max(0, localProgress - tailFade * 0.12);
      const tailAngle = Math.pow(tailProgress, 0.82) * Math.PI * 2 * trail.direction;
      const tailArrayIndex = index * trails.satelliteTailLength + tailIndex;
      const tailPositionIndex = tailArrayIndex * 3;
      const tailAlpha = Math.pow(1 - tailFade, 1.25);

      temp.set(Math.cos(tailAngle) * trail.radius, Math.sin(tailAngle) * trail.radius, 0);
      temp.applyEuler(trail.rotation);
      trails.satelliteTrailPositions[tailPositionIndex] = temp.x;
      trails.satelliteTrailPositions[tailPositionIndex + 1] = temp.y;
      trails.satelliteTrailPositions[tailPositionIndex + 2] = temp.z;
      trails.satelliteTrailAlphas[tailArrayIndex] = active * envelope * satellite.strength * tailAlpha * 1.08;
      trails.satelliteTrailSizes[tailArrayIndex] = satellite.size * (0.34 + tailAlpha * 0.88);
    }
  });

  trails.satelliteTrails.geometry.attributes.position.needsUpdate = true;
  trails.satelliteTrails.geometry.attributes.aAlpha.needsUpdate = true;
  trails.satelliteTrails.geometry.attributes.aSize.needsUpdate = true;
  trails.satellites.geometry.attributes.position.needsUpdate = true;
  trails.satellites.geometry.attributes.aAlpha.needsUpdate = true;
  trails.satellites.geometry.attributes.aSize.needsUpdate = true;
}

function initGlobalGlobe() {
  if (!globeContainer || !window.Globe || !window.THREE) return;

  const hubs = [
    { name: "New York", lat: 40.7, lng: -74 },
    { name: "Sao Paulo", lat: -23.5, lng: -46.6 },
    { name: "London", lat: 51.5, lng: -0.1 },
    { name: "Lagos", lat: 6.5, lng: 3.4 },
    { name: "Dubai", lat: 25.2, lng: 55.3 },
    { name: "Singapore", lat: 1.3, lng: 103.8 },
    { name: "Tokyo", lat: 35.7, lng: 139.7 },
    { name: "Paris", lat: 48.8, lng: 2.3 },
    { name: "Cape Town", lat: -33.9, lng: 18.4 },
    { name: "Mumbai", lat: 19.1, lng: 72.9 },
    { name: "Mexico City", lat: 19.4, lng: -99.1 },
  ].map((hub, index) => ({
    ...hub,
    phase: index * 0.83,
    speed: index % 3 === 0 ? 1.18 : index % 3 === 1 ? 0.84 : 0.62,
    isHub: true,
    baseRadius: 0.002,
    peakRadius: index % 4 === 0 ? 0.24 : 0.18,
    strength: index % 4 === 0 ? 1.25 : 0.96,
    regionIndex: index < 2 || index === 10 ? 0 : index < 4 || index === 7 ? 1 : index === 8 ? 2 : index === 4 ? 3 : 4,
    pulse: 0,
  }));
  const activityNodes = createActivityNodes(hubs);
  const trajectories = createTravelingTrajectories(activityNodes).flat();

  const arcs = [
    [hubs[0], hubs[2]],
    [hubs[1], hubs[2]],
    [hubs[2], hubs[4]],
    [hubs[3], hubs[4]],
    [hubs[4], hubs[5]],
    [hubs[5], hubs[6]],
    [hubs[7], hubs[8]],
    [hubs[0], hubs[1]],
    [hubs[7], hubs[4]],
    [hubs[3], hubs[1]],
    [hubs[9], hubs[5]],
    [hubs[10], hubs[0]],
  ].map(([start, end], index) => ({
    start,
    end,
    startLat: start.lat,
    startLng: start.lng,
    endLat: end.lat,
    endLng: end.lng,
    altitude: 0.14 + index * 0.01,
    phase: index * 0.47,
    pulse: 0,
    isBaseArc: true,
  }));
  const allArcs = arcs;

  const globe = Globe({
    rendererConfig: {
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    },
  })(globeContainer)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#4b9dff")
    .atmosphereAltitude(0.058)
    .pointOfView({ lat: 18, lng: -52, altitude: 2.35 }, 0)
    .pointsData([])
    .pointLat("lat")
    .pointLng("lng")
    .pointAltitude((point) => 0.006 + point.pulse * 0.012)
    .pointRadius((point) => point.baseRadius + point.pulse * point.peakRadius)
    .pointColor((point) => `rgba(225, 248, 255, ${Math.min(1, 0.02 + point.pulse * 0.82)})`)
    .arcsData(allArcs)
    .arcStartLat("startLat")
    .arcStartLng("startLng")
    .arcEndLat("endLat")
    .arcEndLng("endLng")
    .arcAltitude("altitude")
    .arcStroke((arc) => {
      if (arc.isBaseArc) return 0.045 + arc.pulse * 0.055;
      return arc.trailLayer === "glow" ? 0.09 + arc.pulse * 0.08 : 0.035 + arc.pulse * 0.05;
    })
    .arcColor((arc) => {
      if (arc.isBaseArc) {
        const peak = 0.08 + arc.pulse * 0.16;
        return ["rgba(66, 154, 255, 0.018)", `rgba(232, 249, 255, ${peak})`, "rgba(66, 154, 255, 0.018)"];
      }

      if (arc.trailLayer === "glow") {
        const peak = 0.1 + arc.pulse * 0.22;
        return ["rgba(34, 126, 255, 0.035)", `rgba(96, 186, 255, ${peak})`, "rgba(34, 126, 255, 0.035)"];
      }

      const peak = 0.18 + arc.pulse * 0.34;
      return ["rgba(94, 196, 255, 0.05)", `rgba(232, 249, 255, ${peak})`, "rgba(94, 196, 255, 0.05)"];
    })
    .arcDashLength((arc) => arc.length || 0.24)
    .arcDashGap((arc) => arc.gap || 3.15)
    .arcDashInitialGap((arc) => arc.phase || Math.random() * 2.65)
    .arcDashAnimateTime((arc) => (arc.isBaseArc ? 10400 : 2200 + (1.7 - arc.speed) * 1700))
    .ringsData([])
    .ringLat("lat")
    .ringLng("lng")
    .ringColor((ring) => (t) => `rgba(158, 224, 255, ${(0.035 + ring.pulse * 0.09) * (1 - t)})`)
    .ringMaxRadius(1.36)
    .ringPropagationSpeed(0.18)
    .ringRepeatPeriod(5200)
    .hexPolygonsData([])
    .hexPolygonResolution(3)
    .hexPolygonMargin(0.24)
    .hexPolygonUseDots(true)
    .hexPolygonColor((feature) => {
      const pulse = feature.__wca?.pulse || 0;
      const energy = Math.pow(pulse, 1.18);
      const alpha = Math.min(1, 0.3 + energy * 0.7);
      const red = Math.round(14 + energy * 74);
      const green = Math.round(92 + energy * 104);
      return `rgba(${red}, ${green}, 255, ${alpha})`;
    });

  const globeMaterial = globe.globeMaterial();
  globeMaterial.color = new THREE.Color(0x020817);
  globeMaterial.emissive = new THREE.Color(0x031329);
  globeMaterial.emissiveIntensity = 0.105;
  globeMaterial.specular = new THREE.Color(0x1f78bb);
  globeMaterial.shininess = 18;

  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.13;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = 0.18;

  const renderer = globe.renderer();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;

  const scene = globe.scene();
  scene.add(new THREE.AmbientLight(0x1a3558, 0.1));
  const rimLight = new THREE.DirectionalLight(0x78c4ff, 0.56);
  rimLight.position.set(3.1, 1.4, -2.8);
  scene.add(rimLight);
  const keyLight = new THREE.DirectionalLight(0xc8e8ff, 0.16);
  keyLight.position.set(-3.2, 2.45, 3.4);
  scene.add(keyLight);

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let index = 0; index < 135; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const radius = 180 + Math.random() * 160;
    starPositions.push(
      Math.cos(theta) * radius,
      (Math.random() - 0.5) * 190,
      Math.sin(theta) * radius,
    );
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0x8fcfff,
      size: 0.48,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(starField);
  const orbitalTrails = createOrbitalEnergyTrails();
  scene.add(orbitalTrails.group);
  const coreSprite = createWcaCoreSprite();
  scene.add(coreSprite);

  globalGlobe = { instance: globe, starField, coreSprite, globeFeatures: [], orbitalTrails, hubs, activityNodes, arcs, trajectories, allArcs };
  resizeGlobalGlobe();

  fetch("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson")
    .then((response) => response.json())
    .then((countries) => {
      globalGlobe.globeFeatures = countries.features.map(prepareGlobeFeature);
      globe.hexPolygonsData(globalGlobe.globeFeatures);
    })
    .catch(() => {
      globe.hexPolygonsData([]);
    });
}

function resizeGlobalGlobe() {
  if (!globalGlobe || !globeContainer) return;

  const rect = globeContainer.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  globalGlobe.instance.width(rect.width).height(rect.height);
  globalGlobe.instance.pointOfView({
    lat: 18,
    lng: -52,
    altitude: rect.width < 520 ? 2.75 : 2.35,
  });
  if (globalGlobe.orbitalTrails) {
    globalGlobe.orbitalTrails.satellites.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    globalGlobe.orbitalTrails.satelliteTrails.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }
}

function renderGlobalGlobe(time = performance.now()) {
  if (!globalGlobe) return;

  const t = time * 0.001;
  let strongestPulse = 0;

  globalGlobe.activityNodes.forEach((node, index) => {
    const cycle = node.isHub ? 2.4 + seededValue(index + 2.7) * 4.6 : 0.8 + seededValue(index + 6.4) * 3.8;
    const duration = node.isHub ? 0.28 + seededValue(index + 4.2) * 0.72 : 0.08 + seededValue(index + 10.4) * 0.36;
    const localTime = (((t + node.phase) % cycle) + cycle) % cycle;
    const rise = localTime < duration * 0.3 ? localTime / (duration * 0.3) : 1;
    const fall = localTime > duration * 0.5 ? 1 - (localTime - duration * 0.5) / (duration * 0.5) : 1;
    const ledBlink = localTime < duration ? Math.pow(Math.max(0, Math.min(rise, fall)), 0.56) : 0;
    node.pulse = Math.min(1, ledBlink * node.strength);
    strongestPulse = Math.max(strongestPulse, node.pulse);
  });

  globalGlobe.arcs.forEach((arc, index) => {
    const travel = (Math.sin(t * 0.78 - index * 0.52) + 1) / 2;
    arc.pulse = Math.min(1, Math.max(arc.start.pulse, arc.end.pulse) * 0.72 + Math.pow(travel, 8) * 0.28);
  });

  globalGlobe.trajectories.forEach((arc, index) => {
    const travel = (Math.sin(t * arc.speed + arc.phase + index * 0.4) + 1) / 2;
    const spark = Math.pow(travel, 5) * arc.strength;
    arc.pulse = Math.min(1, spark);

    if (arc.pulse > 0.18) {
      arc.start.pulse = Math.min(1, arc.start.pulse + arc.pulse * 0.55);
      arc.end.pulse = Math.min(1, arc.end.pulse + arc.pulse * 0.45);
    }
  });

  globalGlobe.globeFeatures.forEach((feature, index) => {
    const meta = feature.__wca;
    if (!meta) return;

    const regionTime = ((t * 0.56 - meta.region * 0.86 + meta.phase * 0.08 + 12) % 9.8 + 9.8) % 9.8;
    const regionPulse = regionTime < 2.45 ? Math.sin((regionTime / 2.45) * Math.PI) : 0;
    const localPulse = (Math.sin(t * meta.speed + meta.phase + index * 0.19) + 1) / 2;
    const spark = Math.pow(localPulse, 9.5) * 0.48;
    const breath = 0.08 + Math.pow((Math.sin(t * 0.34 + meta.phase) + 1) / 2, 2.4) * 0.14;
    meta.pulse = Math.min(1, (breath + Math.pow(regionPulse, 1.42) * 0.96 * meta.quiet + spark) * meta.strength * meta.cluster);
    strongestPulse = Math.max(strongestPulse, meta.pulse);
  });

  globalGlobe.instance
    .pointsData([])
    .arcsData(globalGlobe.allArcs)
    .hexPolygonsData(globalGlobe.globeFeatures)
    .ringsData([]);

  if (globalGlobe.orbitalTrails) {
    updateOrbitalEnergyTrails(globalGlobe.orbitalTrails, t);
  }
  const cameraDirection = globalGlobe.instance.camera().position.clone().normalize();
  globalGlobe.coreSprite.position.copy(cameraDirection.multiplyScalar(105));
  globalGlobe.coreSprite.quaternion.copy(globalGlobe.instance.camera().quaternion);
  globalGlobe.starField.rotation.y = -t * 0.006;
  globalGlobe.starField.rotation.x = Math.sin(t * 0.12) * 0.015;
  globalGlobe.starField.material.opacity = 0.16 + Math.sin(t * 0.42) * 0.026 + strongestPulse * 0.035;
  globeContainer.parentElement?.style.setProperty("--globe-pulse", strongestPulse.toFixed(3));
}

function animate() {
  targetX += (mouseX - targetX) * 0.045;
  targetY += (mouseY - targetY) * 0.045;

  root.style.setProperty("--mouse-x", targetX.toFixed(4));
  root.style.setProperty("--mouse-y", targetY.toFixed(4));

  depthItems.forEach((item) => {
    const depth = Number(item.dataset.depth || 0);
    const cap = Math.min(800, width * 0.9);
    const x = (targetX - 0.5) * depth * cap;
    const y = (targetY - 0.5) * depth * cap;
    item.style.translate = `${x}px ${y}px`;
  });

  drawParticles();
  renderGlobalGlobe();
  requestAnimationFrame(animate);
}

function enterExperience() {
  if (loaderFinished) return;
  loaderFinished = true;

  const finish = () => {
    preloader?.remove();
  };

  document.body.classList.remove("is-loading");

  if (prefersReducedMotion || !window.gsap) {
    finish();
    return;
  }

  const timeline = gsap.timeline({
    defaults: { ease: "power3.out" },
    onComplete: finish,
  });

  timeline
    .to(".preloader__mark", { duration: 0.95, y: 0, scale: 1, opacity: 1, ease: "power4.out" }, 0)
    .fromTo(
      ".preloader__glow",
      { scale: 0.96, opacity: 0 },
      { duration: 0.8, scale: 1, opacity: 0.55, ease: "power3.out" },
      0,
    )
    .fromTo(
      ".preloader__orbit",
      { "--orbit-scale": 0.94, opacity: 0 },
      { duration: 0.8, "--orbit-scale": 1, opacity: 1, ease: "power4.out" },
      0.04,
    )
    .to(".preloader__mark", { duration: 0.72, scale: 1.02, opacity: 0, filter: "blur(8px)", ease: "power3.inOut" }, 1.18)
    .to(".preloader__glow", { duration: 0.72, scale: 1.08, opacity: 0, ease: "power3.inOut" }, 1.16)
    .to(".preloader__orbit", { duration: 0.72, "--orbit-scale": 1.04, opacity: 0, filter: "blur(8px)", ease: "power3.inOut" }, 1.16)
    .to(preloader, { duration: 0.76, opacity: 0, ease: "power3.inOut" }, 1.34)
    .fromTo(
      ".hero-stage",
      { scale: 0.94, filter: "blur(10px)", opacity: 0.1 },
      { duration: 1.35, scale: 1, filter: "blur(0px)", opacity: 1 },
      1.28,
    )
    .fromTo(
      ".hero__copy",
      { y: 18, scale: 0.98 },
      { duration: 1.2, y: 0, scale: 1 },
      1.44,
    );
}

function scheduleLoaderExit() {
  if (loaderExitScheduled) return;
  loaderExitScheduled = true;

  const elapsed = performance.now() - loaderStartedAt;
  const minimumVisibleTime = prefersReducedMotion ? 200 : 1850;
  const remainingTime = Math.max(minimumVisibleTime - elapsed, 0);

  window.setTimeout(enterExperience, remainingTime);
}

function handlePointerMove(event) {
  mouseX = event.clientX / width;
  mouseY = event.clientY / height;
}

function initFaqAccordion() {
  const root = document.querySelector("[data-faq-accordion]");
  if (!root) return;

  root.querySelectorAll(".faq-item").forEach((item) => {
    const trigger = item.querySelector(".faq-item__trigger");
    const panel = item.querySelector(".faq-item__panel");
    if (!trigger || !panel) return;

    trigger.addEventListener("click", () => {
      const willOpen = !item.classList.contains("is-open");

      root.querySelectorAll(".faq-item").forEach((other) => {
        if (other === item) return;
        other.classList.remove("is-open");
        const otherTrigger = other.querySelector(".faq-item__trigger");
        const otherPanel = other.querySelector(".faq-item__panel");
        otherTrigger?.setAttribute("aria-expanded", "false");
        otherPanel?.setAttribute("aria-hidden", "true");
      });

      if (willOpen) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        panel.setAttribute("aria-hidden", "false");
      } else {
        item.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        panel.setAttribute("aria-hidden", "true");
      }
    });
  });
}

function initLaunchSplashCursor() {
  const splashCanvases = document.querySelectorAll(".launch-splash-cursor");

  if (!splashCanvases.length || prefersReducedMotion) return;

  splashCanvases.forEach((splashCanvas) => {
  const section = splashCanvas.closest(".future-section, .final-section");

  if (!section) return;

  const gl =
    splashCanvas.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    }) ||
    splashCanvas.getContext("webgl", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    }) ||
    splashCanvas.getContext("experimental-webgl", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });

  if (!gl) return;

  const isMobile = window.matchMedia("(max-width: 680px)").matches;
  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  let halfFloat = null;
  let supportLinearFiltering = null;

  if (isWebGL2) {
    gl.getExtension("EXT_color_buffer_float");
    supportLinearFiltering = gl.getExtension("OES_texture_float_linear");
  } else {
    halfFloat = gl.getExtension("OES_texture_half_float");
    supportLinearFiltering = gl.getExtension("OES_texture_half_float_linear");
  }

  if (!halfFloat && !isWebGL2) return;

  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
  const config = {
    SIM_RESOLUTION: isMobile ? 64 : 96,
    DYE_RESOLUTION: isMobile ? 440 : 960,
    DENSITY_DISSIPATION: isMobile ? 4.35 : 3.35,
    VELOCITY_DISSIPATION: isMobile ? 2.35 : 1.85,
    PRESSURE: 0.1,
    PRESSURE_ITERATIONS: isMobile ? 10 : 16,
    CURL: isMobile ? 2.1 : 3.4,
    SPLAT_RADIUS: isMobile ? 0.18 : 0.31,
    SPLAT_FORCE: isMobile ? 3400 : 6800,
    SHADING: !isMobile && !!supportLinearFiltering,
    RAINBOW_MODE: false,
    COLOR_UPDATE_SPEED: 10,
    COLOR: "#a855f7",
  };

  const pointer = {
    texcoordX: 0,
    texcoordY: 0,
    prevTexcoordX: 0,
    prevTexcoordY: 0,
    deltaX: 0,
    deltaY: 0,
    moved: false,
    inside: false,
    color: hexToSplashRgb(config.COLOR),
  };

  const formats = {
    rgba: getSupportedFormat(gl.RGBA16F || gl.RGBA, gl.RGBA, halfFloatTexType),
    rg: getSupportedFormat(gl.RG16F || gl.RGBA, gl.RG || gl.RGBA, halfFloatTexType),
    r: getSupportedFormat(gl.R16F || gl.RGBA, gl.RED || gl.RGBA, halfFloatTexType),
  };

  if (!formats.rgba || !formats.rg || !formats.r) return;

  const baseVertexShader = compileShader(
    gl.VERTEX_SHADER,
    `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;

      void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `,
  );

  const copyShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
        gl_FragColor = texture2D(uTexture, vUv);
      }
    `,
  );

  const clearShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;

      void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
      }
    `,
  );

  const splatShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;

      void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
      }
    `,
  );

  const advectionShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform vec2 dyeTexelSize;
      uniform float dt;
      uniform float dissipation;

      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }

      void main () {
        #ifdef MANUAL_FILTERING
          vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
          vec4 result = bilerp(uSource, coord, dyeTexelSize);
        #else
          vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
          vec4 result = texture2D(uSource, coord);
        #endif
        float decay = 1.0 + dissipation * dt;
        gl_FragColor = result / decay;
      }
    `,
    supportLinearFiltering ? null : ["MANUAL_FILTERING"],
  );

  const divergenceShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) L = -C.x;
        if (vR.x > 1.0) R = -C.x;
        if (vT.y > 1.0) T = -C.y;
        if (vB.y < 0.0) B = -C.y;
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `,
  );

  const curlShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
      }
    `,
  );

  const vorticityShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;

      void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 velocityValue = texture2D(uVelocity, vUv).xy;
        velocityValue += force * dt;
        velocityValue = min(max(velocityValue, -1000.0), 1000.0);
        gl_FragColor = vec4(velocityValue, 0.0, 1.0);
      }
    `,
  );

  const pressureShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressureValue = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressureValue, 0.0, 0.0, 1.0);
      }
    `,
  );

  const gradientSubtractShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
      precision mediump float;
      precision mediump sampler2D;
      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;

      void main () {
        float L = texture2D(uPressure, vL).x;
        float R = texture2D(uPressure, vR).x;
        float T = texture2D(uPressure, vT).x;
        float B = texture2D(uPressure, vB).x;
        vec2 velocityValue = texture2D(uVelocity, vUv).xy;
        velocityValue.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocityValue, 0.0, 1.0);
      }
    `,
  );

  const displayShaderSource = `
    precision highp float;
    precision highp sampler2D;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;

    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;
        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);
        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);
        float diffuse = clamp(dot(n, l) + 0.64, 0.64, 1.0);
        c *= diffuse;
      #endif
      c *= vec3(1.16, 0.94, 1.42);
      float alpha = max(c.r, max(c.g, c.b)) * 1.18;
      gl_FragColor = vec4(c, alpha);
    }
  `;

  const copyProgram = createProgram(baseVertexShader, copyShader);
  const clearProgram = createProgram(baseVertexShader, clearShader);
  const splatProgram = createProgram(baseVertexShader, splatShader);
  const advectionProgram = createProgram(baseVertexShader, advectionShader);
  const divergenceProgram = createProgram(baseVertexShader, divergenceShader);
  const curlProgram = createProgram(baseVertexShader, curlShader);
  const vorticityProgram = createProgram(baseVertexShader, vorticityShader);
  const pressureProgram = createProgram(baseVertexShader, pressureShader);
  const gradientSubtractProgram = createProgram(baseVertexShader, gradientSubtractShader);
  const displayProgram = createProgram(
    baseVertexShader,
    compileShader(gl.FRAGMENT_SHADER, displayShaderSource, config.SHADING ? ["SHADING"] : null),
  );

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  let dye;
  let velocity;
  let divergence;
  let curl;
  let pressure;
  let lastUpdateTime = performance.now();

  function getSupportedFormat(internalFormat, format, type) {
    if (!supportRenderTextureFormat(internalFormat, format, type)) {
      if (internalFormat === gl.R16F) return getSupportedFormat(gl.RG16F, gl.RG, type);
      if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
      return null;
    }

    return { internalFormat, format };
  }

  function supportRenderTextureFormat(internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);

    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  function compileShader(type, source, keywords) {
    const keywordSource = keywords ? `${keywords.map((keyword) => `#define ${keyword}`).join("\n")}\n` : "";
    const shader = gl.createShader(type);
    gl.shaderSource(shader, keywordSource + source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  function createProgram(vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
    }

    return {
      program,
      uniforms: getUniforms(program),
      bind() {
        gl.useProgram(program);
      },
    };
  }

  function getUniforms(program) {
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    for (let index = 0; index < count; index += 1) {
      const name = gl.getActiveUniform(program, index).name;
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    return uniforms;
  }

  function createFBO(fboWidth, fboHeight, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, fboWidth, fboHeight, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, fboWidth, fboHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      width: fboWidth,
      height: fboHeight,
      texelSizeX: 1 / fboWidth,
      texelSizeY: 1 / fboHeight,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      },
    };
  }

  function createDoubleFBO(fboWidth, fboHeight, internalFormat, format, type, param) {
    let fbo1 = createFBO(fboWidth, fboHeight, internalFormat, format, type, param);
    let fbo2 = createFBO(fboWidth, fboHeight, internalFormat, format, type, param);

    return {
      width: fboWidth,
      height: fboHeight,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value) {
        fbo2 = value;
      },
      swap() {
        const temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function blit(target, clear = false) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }

    if (clear) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;

    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);

    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  }

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    dye = createDoubleFBO(
      dyeRes.width,
      dyeRes.height,
      formats.rgba.internalFormat,
      formats.rgba.format,
      halfFloatTexType,
      filtering,
    );
    velocity = createDoubleFBO(
      simRes.width,
      simRes.height,
      formats.rg.internalFormat,
      formats.rg.format,
      halfFloatTexType,
      filtering,
    );
    divergence = createFBO(
      simRes.width,
      simRes.height,
      formats.r.internalFormat,
      formats.r.format,
      halfFloatTexType,
      gl.NEAREST,
    );
    curl = createFBO(simRes.width, simRes.height, formats.r.internalFormat, formats.r.format, halfFloatTexType, gl.NEAREST);
    pressure = createDoubleFBO(
      simRes.width,
      simRes.height,
      formats.r.internalFormat,
      formats.r.format,
      halfFloatTexType,
      gl.NEAREST,
    );
  }

  function resizeSplashCanvas() {
    const rect = section.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75);
    const nextWidth = Math.max(1, Math.floor(rect.width * pixelRatio));
    const nextHeight = Math.max(1, Math.floor(rect.height * pixelRatio));

    if (splashCanvas.width !== nextWidth || splashCanvas.height !== nextHeight) {
      splashCanvas.width = nextWidth;
      splashCanvas.height = nextHeight;
      splashCanvas.style.width = `${rect.width}px`;
      splashCanvas.style.height = `${rect.height}px`;
      initFramebuffers();
    }
  }

  function correctRadius(radius) {
    const aspectRatio = splashCanvas.width / splashCanvas.height;
    return aspectRatio > 1 ? radius * aspectRatio : radius;
  }

  function correctDeltaX(delta) {
    const aspectRatio = splashCanvas.width / splashCanvas.height;
    return aspectRatio < 1 ? delta * aspectRatio : delta;
  }

  function correctDeltaY(delta) {
    const aspectRatio = splashCanvas.width / splashCanvas.height;
    return aspectRatio > 1 ? delta / aspectRatio : delta;
  }

  function splat(x, y, dx, dy, color) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.uniforms.aspectRatio, splashCanvas.width / splashCanvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x, y);
    gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
    gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function step(dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));

    for (let index = 0; index < config.PRESSURE_ITERATIONS; index += 1) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function renderSplash() {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    displayProgram.bind();

    if (config.SHADING) {
      gl.uniform2f(displayProgram.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    }

    gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
    blit(null, true);
  }

  function updatePointer(event) {
    const rect = section.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;

    pointer.inside = inside;
    if (!inside) return;

    const pixelRatio = splashCanvas.width / rect.width;
    const posX = (event.clientX - rect.left) * pixelRatio;
    const posY = (event.clientY - rect.top) * pixelRatio;

    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / splashCanvas.width;
    pointer.texcoordY = 1 - posY / splashCanvas.height;
    pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0.0004 || Math.abs(pointer.deltaY) > 0.0004;

    if (!pointer.prevTexcoordX && !pointer.prevTexcoordY) {
      pointer.deltaX = 0;
      pointer.deltaY = 0;
    }
  }

  function applyInputs() {
    if (!pointer.inside || !pointer.moved) return;

    pointer.moved = false;
    splat(
      pointer.texcoordX,
      pointer.texcoordY,
      pointer.deltaX * config.SPLAT_FORCE,
      pointer.deltaY * config.SPLAT_FORCE,
      pointer.color,
    );
  }

  function tick() {
    resizeSplashCanvas();

    const now = performance.now();
    const dt = Math.min((now - lastUpdateTime) / 1000, 0.016666);
    lastUpdateTime = now;

    applyInputs();
    step(dt);
    renderSplash();
    requestAnimationFrame(tick);
  }

  function hexToSplashRgb(hex) {
    let value = hex.replace("#", "");
    if (value.length === 3) value = `${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;

    return {
      r: (parseInt(value.slice(0, 2), 16) / 255) * (isMobile ? 0.18 : 0.32),
      g: (parseInt(value.slice(2, 4), 16) / 255) * (isMobile ? 0.16 : 0.28),
      b: (parseInt(value.slice(4, 6), 16) / 255) * (isMobile ? 0.13 : 0.24),
    };
  }

  resizeSplashCanvas();
  window.addEventListener("pointermove", updatePointer, { passive: true });
  requestAnimationFrame(tick);
  });
}

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  {
    threshold: 0.18,
    rootMargin: "0px 0px -8% 0px",
  },
);

revealItems.forEach((item) => revealObserver.observe(item));

magneticItems.forEach((item) => {
  item.addEventListener("pointermove", (event) => {
    if (prefersReducedMotion) return;

    const rect = item.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    item.style.transform = `translate(${x * 0.08}px, ${y * 0.12}px)`;
  });

  item.addEventListener("pointerleave", () => {
    item.style.transform = "";
  });
});

window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("resize", resizeCanvas);
window.addEventListener("load", scheduleLoaderExit, { once: true });
window.addEventListener(
  "scroll",
  () => {
    root.style.setProperty("--header-opacity", window.scrollY > 32 ? "1" : "0");
  },
  { passive: true },
);

initGlobalGlobe();
initFaqAccordion();
initLaunchSplashCursor();
resizeCanvas();
if (prefersReducedMotion) {
  drawParticles();
  renderGlobalGlobe();
} else {
  animate();
}

window.setTimeout(scheduleLoaderExit, 2800);
