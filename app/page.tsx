"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  Camera,
  ChevronRight,
  CircleGauge,
  CloudSun,
  Cpu,
  DoorOpen,
  Download,
  Fan,
  FlaskConical,
  Layers3,
  Lightbulb,
  LockKeyhole,
  Monitor,
  Network,
  Pause,
  Play,
  Printer,
  Radio,
  RotateCcw,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Snowflake,
  Thermometer,
  University,
  Users,
  Wind,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Zone =
  | "Teaching"
  | "Laboratory"
  | "Office / Admin"
  | "Shared / Common"
  | "Commercial"
  | "Critical";
type RawRoom = {
  room_id: string;
  floor: number;
  room_type: string;
  capacity: number;
  subtype: string | null;
  timetable: boolean;
  assumed: boolean;
  equipment?: Record<string, number>;
  equipment_note?: string;
};
type Catalog = {
  building_id: string;
  total_spaces: number;
  rooms: Record<string, RawRoom>;
};
type RoomLive = RawRoom & {
  zone: Zone;
  displayName: string;
  occupancy: number;
  occupancyRatio: number;
  future: [number, number, number];
  temp: number;
  power: number;
  hvac: "HEAT" | "NEUTRAL" | "COOL";
  safetyEvent: boolean;
};
type ViewName =
  "Digital Twin" | "Rooms" | "Energy" | "Occupancy" | "Safety" | "Experiments" | "Future";

const FLOOR_NAMES = ["Ground", "First", "Second", "Third"];
const CONTROLLERS = ["PPO", "SAC", "TD3", "B0 Fixed RBC", "B1 Timetable RBC"];
const SEASONS = ["January", "April", "July", "October"];
const ZONE_COLORS: Record<Zone, string> = {
  Teaching: "#20d8bd",
  Laboratory: "#45a6ff",
  "Office / Admin": "#a78bfa",
  "Shared / Common": "#f2b84b",
  Commercial: "#ff8b5f",
  Critical: "#ef5f74",
};
const SEASON_OUTDOOR: Record<string, number> = {
  January: 13.2,
  April: 31.4,
  July: 34.1,
  October: 27.2,
};
const ALGORITHM_ACTION: Record<string, number> = {
  PPO: 0.62,
  SAC: 0.48,
  TD3: 0.55,
  "B0 Fixed RBC": 0.38,
  "B1 Timetable RBC": 0.34,
};
const RESULTS = [
  {
    controller: "PPO",
    energy: 20708.0,
    peak: 557.41,
    comfort: 0.771,
    deviation: 0.664,
    safety: 9.064,
    ramp: 63.76,
  },
  {
    controller: "SAC",
    energy: 19167.21,
    peak: 537.96,
    comfort: 1.145,
    deviation: 0.83,
    safety: 11.658,
    ramp: 37.39,
  },
  {
    controller: "TD3",
    energy: 20354.79,
    peak: 526.94,
    comfort: 1.075,
    deviation: 0.793,
    safety: 11.677,
    ramp: 54.41,
  },
  {
    controller: "B0 Fixed RBC",
    energy: 17478.04,
    peak: 416.12,
    comfort: 1.46,
    deviation: 1.38,
    safety: 0,
    ramp: 25.3,
  },
  {
    controller: "B1 Timetable RBC",
    energy: 17296.75,
    peak: 368.8,
    comfort: 2.044,
    deviation: 1.409,
    safety: 0,
    ramp: 23.43,
  },
];
const SEASONAL_ENERGY: Record<string, number[]> = {
  PPO: [24086.81, 24386.05, 20667.42, 13691.74],
  SAC: [19765.46, 24684.17, 18211.17, 14008.03],
  TD3: [21447.83, 25105.3, 20645.2, 14220.82],
};
const SAFETY_EFFECT = [
  {
    controller: "PPO",
    energy: 9.42,
    comfort: 69.3,
    deviation: 11.98,
    reliance: 9.06,
  },
  {
    controller: "SAC",
    energy: 28.99,
    comfort: 90.48,
    deviation: 45.58,
    reliance: 11.66,
  },
  {
    controller: "TD3",
    energy: 13.7,
    comfort: 89.35,
    deviation: 41.67,
    reliance: 11.68,
  },
];

const hash = (value: string) =>
  Array.from(value).reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 7);
const zoneFor = (room: RawRoom): Zone =>
  room.room_type === "classroom" || room.room_type === "seminar_room"
    ? "Teaching"
    : room.room_type === "laboratory"
      ? "Laboratory"
      : room.room_type === "faculty_admin"
        ? "Office / Admin"
        : room.room_type === "commercial"
          ? "Commercial"
          : room.room_type === "security"
            ? "Critical"
            : "Shared / Common";
const roomName = (room: RawRoom) => {
  if (room.room_id === "LIBRARY") return "University Library & Printing";
  if (room.room_id === "BANK") return "Campus Bank";
  if (room.room_id === "IRO") return "International Relations Office";
  if (room.room_id.startsWith("SECURITY"))
    return `Security Control ${room.room_id.slice(-2)}`;
  if (room.room_id.startsWith("ADMIN"))
    return `Administration ${room.room_id.slice(-2)}`;
  const names: Record<string, string> = {
    classroom: "Classroom",
    laboratory: "Laboratory",
    faculty_admin: "Faculty Room",
    seminar_room: "Smart Seminar Room",
  };
  return `${names[room.room_type] ?? "Space"} ${room.room_id}`;
};
const scheduledRatio = (room: RawRoom, step: number, offset: number) => {
  const shifted = (step + offset / 15) % 672,
    day = Math.floor(shifted / 96),
    slot = shifted % 96,
    hour = slot / 4;
  const working = day < 6 && hour >= 8 && hour < 18;
  if (!working)
    return room.room_type === "security"
      ? 0.55
      : room.room_type === "library" && hour < 20
        ? 0.12
        : 0;
  const wave = 0.5 + 0.5 * Math.sin((slot + (hash(room.room_id) % 31)) * 0.39);
  if (room.timetable)
    return wave > 0.48
      ? 0.48 + (hash(room.room_id + String(day)) % 45) / 100
      : 0;
  if (
    ["faculty_admin", "commercial", "library", "security"].includes(
      room.room_type,
    )
  )
    return 0.42 + wave * 0.28;
  return 0.5;
};
const makeLiveRoom = (
  room: RawRoom,
  step: number,
  season: string,
  algorithm: string,
  safety: boolean,
  stress = 0,
): RoomLive => {
  const ratio = Math.min(1, scheduledRatio(room, step, 0)),
    future = [30, 60, 120].map((v) =>
      Math.round(scheduledRatio(room, step, v) * room.capacity),
    ) as [number, number, number];
  const outdoor = SEASON_OUTDOOR[season],
    action = ALGORITHM_ACTION[algorithm] ?? 0.5;
  const base =
    24 + stress +
    (outdoor - 24) * 0.075 +
    ratio * 1.3 -
    action * 1.15 +
    ((hash(room.room_id + season) % 19) - 9) / 28;
  const unsafe = base < 20 || base > 27 || (ratio > 0.78 && base > 26.3),
    temp = safety && unsafe ? Math.max(20.4, Math.min(26.4, base)) : base;
  const typePower: Record<string, number> = {
    classroom: 5.8,
    laboratory: 17.5,
    faculty_admin: 3.8,
    seminar_room: 9.2,
    library: 28,
    commercial: 8.5,
    security: 7.2,
  };
  const hvacLoad =
    Math.abs(outdoor - 24) * action * (room.capacity / 45) * 0.42;
  return {
    ...room,
    zone: zoneFor(room),
    displayName: roomName(room),
    occupancyRatio: ratio,
    occupancy: Math.round(ratio * room.capacity),
    future,
    temp: Number(temp.toFixed(1)),
    power: Number(
      (
        (typePower[room.room_type] ?? 5) * (0.32 + ratio * 0.68) +
        hvacLoad + (safety && unsafe ? Math.abs(base - temp) * room.capacity / 90 : 0)
      ).toFixed(1),
    ),
    hvac:
      outdoor < 20 ? "HEAT" : Math.abs(temp - 24) < 0.7 ? "NEUTRAL" : "COOL",
    safetyEvent: safety && unsafe,
  };
};

type Equipment = {
  name: string;
  meta: string;
  icon: typeof Fan;
  defaultOn: boolean;
  protected?: boolean;
};
const equipmentFor = (room: RoomLive): Equipment[] => {
  if (room.room_id === "LIBRARY")
    return [
      {
        name: "Central air-conditioning",
        meta: "1 central plant · protected",
        icon: Snowflake,
        defaultOn: true,
      },
      {
        name: "Library computers",
        meta: "15 endpoints",
        icon: Monitor,
        defaultOn: true,
      },
      {
        name: "Lighting circuits",
        meta: "50 tube lights",
        icon: Lightbulb,
        defaultOn: true,
      },
      {
        name: "Ventilation fans",
        meta: "12 units",
        icon: Fan,
        defaultOn: true,
      },
      {
        name: "Print centre",
        meta: "2 printer/photocopiers",
        icon: Printer,
        defaultOn: true,
      },
    ];
  if (room.zone === "Laboratory")
    return [
      {
        name: "Centralized AC terminal",
        meta: "Variable-flow cooling",
        icon: Snowflake,
        defaultOn: true,
      },
      {
        name: "Lab ventilation",
        meta: "Air-change control",
        icon: Wind,
        defaultOn: true,
      },
      {
        name: "Workstations",
        meta: "Monitored equipment circuit",
        icon: Monitor,
        defaultOn: true,
      },
      {
        name: "Bench equipment",
        meta: "Safety-isolated supply",
        icon: FlaskConical,
        defaultOn: room.occupancy > 0,
      },
      {
        name: "Local UPS",
        meta: "Critical · cannot be shed",
        icon: Server,
        defaultOn: true,
        protected: true,
      },
    ];
  if (room.zone === "Critical")
    return [
      {
        name: "CCTV recorder",
        meta: "24/7 protected circuit",
        icon: Camera,
        defaultOn: true,
        protected: true,
      },
      {
        name: "Access control",
        meta: "Fail-safe operation",
        icon: LockKeyhole,
        defaultOn: true,
        protected: true,
      },
      {
        name: "Network rack",
        meta: "UPS-backed",
        icon: Network,
        defaultOn: true,
        protected: true,
      },
      {
        name: "Fire panel",
        meta: "Life-safety circuit",
        icon: ShieldCheck,
        defaultOn: true,
        protected: true,
      },
    ];
  if (room.zone === "Office / Admin" || room.zone === "Commercial")
    return [
      {
        name: "VRF / split AC group",
        meta: "Setpoint 24 °C",
        icon: Snowflake,
        defaultOn: room.occupancy > 0,
      },
      {
        name: "Task lighting",
        meta: "Dimmable circuit",
        icon: Lightbulb,
        defaultOn: room.occupancy > 0,
      },
      {
        name: "Office computers",
        meta: "Managed endpoints",
        icon: Monitor,
        defaultOn: room.occupancy > 0,
      },
      {
        name: "Network printer",
        meta: "Standby capable",
        icon: Printer,
        defaultOn: false,
      },
      {
        name: "Access controller",
        meta: "Protected",
        icon: LockKeyhole,
        defaultOn: true,
        protected: true,
      },
    ];
  return [
    {
      name: "VRF cassette AC",
      meta: "RL magnitude · plant direction",
      icon: Snowflake,
      defaultOn: room.occupancy > 0,
    },
    {
      name: "LED lighting bank",
      meta: "Occupancy linked",
      icon: Lightbulb,
      defaultOn: room.occupancy > 0,
    },
    {
      name: "Smart projector",
      meta: "Timetable linked",
      icon: Monitor,
      defaultOn: room.occupancy > 5,
    },
    {
      name: "Ceiling fans",
      meta: "Four-speed group",
      icon: Fan,
      defaultOn: room.occupancy > 0,
    },
    {
      name: "Occupancy sensor",
      meta: "PIR + schedule fusion",
      icon: Radio,
      defaultOn: true,
      protected: true,
    },
  ];
};
const colorFor = (room: RoomLive, layer: string) =>
  layer === "Temperature"
    ? room.temp > 26
      ? "#ff765f"
      : room.temp < 21
        ? "#4ea8ff"
        : "#44d6a8"
    : layer === "Energy"
      ? room.power > 20
        ? "#ef5f74"
        : room.power > 10
          ? "#f2b84b"
          : "#42d3ba"
      : layer === "Occupancy"
        ? room.occupancyRatio > 0.75
          ? "#ff8b5f"
          : room.occupancy
            ? "#48c7ff"
            : "#263e51"
        : layer === "Safety"
          ? room.safetyEvent
            ? "#ef5f74"
            : "#39d98a"
          : layer === "RL Action"
            ? room.hvac === "COOL"
              ? "#45a6ff"
              : room.hvac === "HEAT"
                ? "#ff8b5f"
                : "#657b8b"
            : ZONE_COLORS[room.zone];

function DigitalTwin({
  rooms,
  selectedId,
  onSelect,
  floor,
  layer,
  entered,
}: {
  rooms: RoomLive[];
  selectedId: string;
  onSelect: (id: string, enter?: boolean) => void;
  floor: number;
  layer: string;
  entered: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null),
    onSelectRef = useRef(onSelect);
  const roomsRef = useRef(rooms),
    selectedRef = useRef(selectedId);
  const roomMeshesRef = useRef(new Map<string, THREE.Mesh>()),
    edgeMeshesRef = useRef(new Map<string, THREE.LineSegments>()),
    slabMeshesRef = useRef(new Map<number, THREE.Mesh>());
  // Keep the 3D event handlers connected to the latest React values.
  // Updating refs here does not trigger another render.
  useEffect(() => {
    onSelectRef.current = onSelect;
    roomsRef.current = rooms;
    selectedRef.current = selectedId;
  }, [onSelect, rooms, selectedId]);
  const interiorKey = entered ? selectedId : "building";
  useEffect(() => {
    const host = mountRef.current;
    if (!host || !rooms.length) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07101d, 0.027);
    const camera = new THREE.PerspectiveCamera(
      42,
      host.clientWidth / host.clientHeight,
      0.1,
      100,
    );
    camera.position.set(14, 12, 17);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI / 2.03;
    controls.target.set(0, entered ? 1.4 : 4.1, 0);
    scene.add(new THREE.HemisphereLight(0xc8f2ff, 0x07101d, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3.1);
    sun.position.set(9, 15, 7);
    sun.castShadow = true;
    scene.add(sun);
    const accent = new THREE.PointLight(0x00e5c4, 9, 32);
    accent.position.set(-8, 7, -4);
    scene.add(accent);
    const grid = new THREE.GridHelper(34, 34, 0x18536c, 0x102b3e);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.42;
    scene.add(grid);
    const interactive: THREE.Mesh[] = [];
    const selected = rooms.find((r) => r.room_id === selectedId) ?? rooms[0];
    roomMeshesRef.current.clear();
    edgeMeshesRef.current.clear();
    slabMeshesRef.current.clear();
    if (!entered) {
      const podium = new THREE.Mesh(
        new THREE.BoxGeometry(14.5, 0.25, 9.6),
        new THREE.MeshStandardMaterial({
          color: 0x0a2130,
          roughness: 0.7,
          metalness: 0.2,
        }),
      );
      podium.position.y = 0.1;
      scene.add(podium);
      for (let level = 0; level < 4; level++) {
        const floorRooms = rooms.filter((r) => r.floor === level),
          visible = floor === -1 || floor === level,
          y = level * 2.15 + 0.45;
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(13.4, 0.14, 8.5),
          new THREE.MeshStandardMaterial({
            color: 0x173348,
            transparent: true,
            opacity: visible ? 0.85 : 0.1,
            metalness: 0.3,
          }),
        );
        slab.position.y = y;
        scene.add(slab);
        slabMeshesRef.current.set(level, slab);
        floorRooms.forEach((room, index) => {
          const row = Math.floor(index / 11),
            col = index % 11,
            x = -5.8 + col * 1.16,
            z = -3.15 + row * 1.48,
            color = colorFor(room, layer),
            active = visible;
          const material = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: room.room_id === selectedId ? 0.5 : 0.08,
            transparent: true,
            opacity: active ? 0.82 : 0.045,
            roughness: 0.32,
            metalness: 0.25,
          });
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.04, 1.55, 1.24),
            material,
          );
          mesh.position.set(x, y + 0.86, z);
          mesh.userData = { roomId: room.room_id, active, floor: level };
          mesh.castShadow = true;
          scene.add(mesh);
          interactive.push(mesh);
          roomMeshesRef.current.set(room.room_id, mesh);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({
              color: room.room_id === selectedId ? 0xffffff : 0x75d8d0,
              transparent: true,
              opacity: active ? 0.34 : 0.02,
            }),
          );
          edges.position.copy(mesh.position);
          scene.add(edges);
          edgeMeshesRef.current.set(room.room_id, edges);
        });
      }
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(13.8, 0.22, 8.9),
        new THREE.MeshStandardMaterial({
          color: 0x163247,
          metalness: 0.55,
          roughness: 0.35,
        }),
      );
      roof.position.y = 9.2;
      scene.add(roof);
    } else {
      camera.position.set(7.8, 5.4, 8.8);
      controls.target.set(0, 1.4, 0);
      const floorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(8.5, 0.15, 6.5),
        new THREE.MeshStandardMaterial({ color: 0x132e40, roughness: 0.8 }),
      );
      scene.add(floorMesh);
      const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e4458,
        transparent: true,
        opacity: 0.55,
      });
      [
        [0, 1.5, -3.2, 8.5, 3, 0.12],
        [-4.2, 1.5, 0, 0.12, 3, 6.5],
        [4.2, 1.5, 0, 0.12, 3, 6.5],
      ].forEach((v) => {
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(v[3], v[4], v[5]),
          wallMaterial,
        );
        wall.position.set(v[0], v[1], v[2]);
        scene.add(wall);
      });
      const count =
        selected.zone === "Laboratory"
          ? 15
          : selected.zone === "Office / Admin"
            ? 7
            : selected.zone === "Critical"
              ? 5
              : 18;
      for (let i = 0; i < count; i++) {
        const desk = new THREE.Mesh(
          new THREE.BoxGeometry(
            selected.zone === "Laboratory" ? 1.15 : 0.85,
            0.12,
            0.5,
          ),
          new THREE.MeshStandardMaterial({
            color: selected.zone === "Laboratory" ? 0x365c78 : 0x41738a,
          }),
        );
        desk.position.set(
          -2.8 + (i % 6) * 1.12,
          0.75,
          -1.55 + Math.floor(i / 6) * 1.45,
        );
        scene.add(desk);
      }
      for (
        let i = 0;
        i < Math.min(18, Math.round(selected.occupancy / 3));
        i++
      ) {
        const person = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 14, 10),
          new THREE.MeshStandardMaterial({
            color: 0x7ef7e5,
            emissive: 0x19b7ac,
            emissiveIntensity: 0.35,
          }),
        );
        person.position.set(
          -2.7 + (i % 7) * 0.82,
          1.15,
          -1.3 + Math.floor(i / 7) * 1.6,
        );
        scene.add(person);
      }
    }
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const click = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(interactive)
        .find((h) => h.object.userData.active);
      if (hit?.object.userData.roomId)
        onSelectRef.current(hit.object.userData.roomId, event.type === "dblclick");
    };
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("dblclick", click);
    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resize.observe(host);
    let phase = 0,
      frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      phase += 0.035;
      roomMeshesRef.current.forEach((mesh, id) => {
        if (id === selectedRef.current)
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
            0.36 + Math.sin(phase) * 0.16;
      });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("dblclick", click);
      roomMeshesRef.current.clear();
      edgeMeshesRef.current.clear();
      slabMeshesRef.current.clear();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host)
        host.removeChild(renderer.domElement);
    };
  }, [rooms.length, entered, interiorKey]);
  useEffect(() => {
    if (entered) return;
    const byId = new Map(rooms.map((room) => [room.room_id, room]));
    roomMeshesRef.current.forEach((mesh, id) => {
      const room = byId.get(id);
      if (!room) return;
      const active = floor === -1 || room.floor === floor,
        color = new THREE.Color(colorFor(room, layer)),
        material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(color);
      material.emissive.copy(color);
      material.opacity = active ? 0.82 : 0.045;
      material.emissiveIntensity = id === selectedId ? 0.48 : 0.08;
      mesh.userData.active = active;
      const edge = edgeMeshesRef.current.get(id);
      if (edge) {
        const edgeMaterial = edge.material as THREE.LineBasicMaterial;
        edgeMaterial.color.set(id === selectedId ? 0xffffff : 0x75d8d0);
        edgeMaterial.opacity = active
          ? id === selectedId
            ? 0.85
            : 0.34
          : 0.02;
      }
    });
    slabMeshesRef.current.forEach((mesh, level) => {
      (mesh.material as THREE.MeshStandardMaterial).opacity =
        floor === -1 || floor === level ? 0.85 : 0.1;
    });
  }, [rooms, selectedId, floor, layer, entered]);
  return (
    <div
      ref={mountRef}
      className="twin-canvas"
      aria-label="Interactive 3D whole-college digital twin"
    />
  );
}

function Kpis({
  rooms,
  safety,
  algorithm,
  onNavigate,
}: {
  rooms: RoomLive[];
  safety: boolean;
  algorithm: string;
  onNavigate: (view: ViewName) => void;
}) {
  const occupied = rooms.filter((r) => r.occupancy > 0).length,
    people = rooms.reduce((s, r) => s + r.occupancy, 0),
    demand = rooms.reduce((s, r) => s + r.power, 0),
    interventions = rooms.filter((r) => r.safetyEvent).length;
  return (
    <section
      className="kpi-strip"
      aria-label="Building key performance indicators"
    >
      <button
        type="button"
        onClick={() => onNavigate("Energy")}
        title="Open energy analysis"
      >
        <span>Whole-building demand</span>
        <strong>
          {demand.toFixed(1)} <small>kW</small>
        </strong>
        <em>157-space simulated load</em>
      </button>
      <button
        type="button"
        onClick={() => onNavigate("Rooms")}
        title="Open room explorer"
      >
        <span>Occupied spaces</span>
        <strong>
          {occupied} <small>/ 157</small>
        </strong>
        <em>{people.toLocaleString()} estimated occupants</em>
      </button>
      <button
        type="button"
        onClick={() => onNavigate("Experiments")}
        title="Open research results"
      >
        <span>Comfort band</span>
        <strong>
          {rooms.length
            ? (
                (100 *
                  rooms.filter((r) => r.temp >= 20 && r.temp <= 27).length) /
                rooms.length
              ).toFixed(1)
            : "0"}
          <small>%</small>
        </strong>
        <em className="good">20–27 °C occupied target</em>
      </button>
      <button
        type="button"
        onClick={() => onNavigate("Safety")}
        title="Open safety analysis"
      >
        <span>Safety supervisor</span>
        <strong>
          {safety ? interventions : 0} <small>events</small>
        </strong>
        <em>
          {safety ? "multi-system protection active" : "ablation mode disabled"}
        </em>
      </button>
      <button
        type="button"
        onClick={() => onNavigate("Experiments")}
        title="Compare controllers"
      >
        <span>Controller</span>
        <strong>{algorithm.split(" ")[0]}</strong>
        <em>
          {algorithm.includes("RBC")
            ? "deterministic baseline"
            : "5-D semantic-zone RL"}
        </em>
      </button>
    </section>
  );
}

function RoomsView({
  rooms,
  selectedId,
  onSelect,
}: {
  rooms: RoomLive[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [floor, setFloor] = useState("all"),
    [zone, setZone] = useState("all");
  const filtered = rooms.filter(
    (r) =>
      (floor === "all" || r.floor === Number(floor)) &&
      (zone === "all" || r.zone === zone) &&
      `${r.room_id} ${r.displayName} ${r.subtype ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="data-view rooms-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">157-SPACE SEMANTIC CATALOG</span>
          <h1>Whole-college room explorer</h1>
          <p>Search, filter and inspect every modeled physical space.</p>
        </div>
        <span className="result-count">{filtered.length} spaces</span>
      </div>
      <div className="room-filters">
        <label>
          <Search />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search RN001, library, admin…"
          />
        </label>
        <Select value={floor} onValueChange={setFloor}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All floors</SelectItem>
            {FLOOR_NAMES.map((n, i) => (
              <SelectItem key={n} value={String(i)}>
                {n} floor
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={zone} onValueChange={setZone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All semantic zones</SelectItem>
            {Object.keys(ZONE_COLORS).map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="room-table">
        <div className="room-table-head">
          <span>Space</span>
          <span>Floor</span>
          <span>Semantic zone</span>
          <span>Occupancy</span>
          <span>Temperature</span>
          <span>Power</span>
          <span>Source</span>
        </div>
        {filtered.map((room) => (
          <button
            type="button"
            key={room.room_id}
            className={room.room_id === selectedId ? "selected" : ""}
            aria-pressed={room.room_id === selectedId}
            onClick={() => onSelect(room.room_id)}
          >
            <span>
              <b>{room.room_id}</b>
              <small>{room.displayName}</small>
            </span>
            <span>{FLOOR_NAMES[room.floor]}</span>
            <span>
              <i style={{ background: ZONE_COLORS[room.zone] }} />
              {room.zone}
            </span>
            <span>
              {room.occupancy}/{room.capacity}
            </span>
            <span>{room.temp.toFixed(1)} °C</span>
            <span>{room.power.toFixed(1)} kW</span>
            <span>{room.timetable ? "Timetable" : "Profile"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function BarSeries({
  values,
  labels,
  color = "#29d4b8",
  suffix = "",
}: {
  values: number[];
  labels: string[];
  color?: string;
  suffix?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="research-bars">
      {values.map((v, i) => (
        <div key={labels[i]}>
          <span>{labels[i]}</span>
          <i>
            <b style={{ width: `${(v / max) * 100}%`, background: color }} />
          </i>
          <strong>
            {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {suffix}
          </strong>
        </div>
      ))}
    </div>
  );
}

function AnalyticsView({
  view,
  rooms,
  algorithm,
  setAlgorithm,
  safety,
}: {
  view: Exclude<ViewName, "Digital Twin" | "Rooms" | "Future">;
  rooms: RoomLive[];
  algorithm: string;
  setAlgorithm: (v: string) => void;
  safety: boolean;
}) {
  const floorOccupancy = FLOOR_NAMES.map((_, floor) =>
    rooms.filter((r) => r.floor === floor).reduce((s, r) => s + r.occupancy, 0),
  );
  if (view === "Energy")
    return (
      <section className="data-view">
        <div className="view-heading">
          <div>
            <span className="eyebrow">FINAL CORRECTED DATA</span>
            <h1>Seasonal energy and demand</h1>
            <p>Five-seed means · four representative weeks · safety ON.</p>
          </div>
          <span className="verified">
            <ShieldCheck /> 120 runs verified
          </span>
        </div>
        <div className="analytics-grid">
          <article className="chart-card span-two">
            <div className="card-title">
              <div>
                <b>Seasonal energy by RL controller</b>
                <small>kWh per representative week</small>
              </div>
              <Select
                value={
                  ["PPO", "SAC", "TD3"].includes(algorithm) ? algorithm : "PPO"
                }
                onValueChange={setAlgorithm}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["PPO", "SAC", "TD3"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <BarSeries
              values={SEASONAL_ENERGY[algorithm] ?? SEASONAL_ENERGY.PPO}
              labels={SEASONS}
              color={
                algorithm === "PPO"
                  ? "#20d8bd"
                  : algorithm === "SAC"
                    ? "#45a6ff"
                    : "#a78bfa"
              }
              suffix=" kWh"
            />
          </article>
          <article className="chart-card">
            <b>Four-season mean</b>
            <BarSeries
              values={RESULTS.slice(0, 3).map((r) => r.energy)}
              labels={["PPO", "SAC", "TD3"]}
            />
          </article>
          <article className="chart-card">
            <b>Peak demand</b>
            <BarSeries
              values={RESULTS.map((r) => r.peak)}
              labels={RESULTS.map((r) =>
                r.controller.replace(" Timetable", ""),
              )}
              color="#f2b84b"
              suffix=" kW"
            />
          </article>
          <article className="finding-card">
            <strong>SAC</strong>
            <span>lowest RL energy</span>
            <b>19,167.21 kWh</b>
            <small>8.04% below PPO; Holm p = 0.0194</small>
          </article>
          <article className="finding-card amber">
            <strong>B1 RBC</strong>
            <span>overall efficiency winner</span>
            <b>17,296.75 kWh</b>
            <small>PPO trades +19.72% energy for better comfort</small>
          </article>
        </div>
      </section>
    );
  if (view === "Occupancy")
    return (
      <section className="data-view">
        <div className="view-heading">
          <div>
            <span className="eyebrow">TIMETABLE INTELLIGENCE</span>
            <h1>Current and future occupancy</h1>
            <p>
              15-minute resolution across 157 spaces; profile assumptions
              retained for unscheduled rooms.
            </p>
          </div>
          <span className="result-count">105,504 room-time records/week</span>
        </div>
        <div className="analytics-grid">
          <article className="chart-card span-two">
            <b>Current occupants by floor</b>
            <BarSeries
              values={floorOccupancy}
              labels={FLOOR_NAMES}
              color="#45a6ff"
            />
          </article>
          <article className="chart-card">
            <b>Coverage</b>
            <div className="metric-stack">
              <p>
                <strong>157</strong>
                <span>physical spaces</span>
              </p>
              <p>
                <strong>101</strong>
                <span>unique timetable rooms</span>
              </p>
              <p>
                <strong>1,961</strong>
                <span>parsed academic events</span>
              </p>
              <p>
                <strong>104</strong>
                <span>source timetable pages</span>
              </p>
            </div>
          </article>
          <article className="chart-card">
            <b>Lookahead horizons</b>
            <div className="horizon-row">
              {["Now", "+30", "+60", "+120"].map((h, i) => (
                <span key={h}>
                  <i className={i === 0 ? "clock-mini active" : "clock-mini"}>
                    <CalendarClock />
                  </i>
                  {h}
                  <small>{i ? "minutes" : "current"}</small>
                </span>
              ))}
            </div>
          </article>
          <article className="finding-card span-two">
            <strong>RQ3</strong>
            <span>
              Future timetable lookahead did not significantly improve PPO.
            </span>
            <b>Energy +0.73% · peak +1.12%</b>
            <small>
              No metric remained significant after Holm correction; retained as
              a negative result.
            </small>
          </article>
        </div>
      </section>
    );
  if (view === "Safety")
    return (
      <section className="data-view">
        <div className="view-heading">
          <div>
            <span className="eyebrow">DETERMINISTIC SUPERVISOR</span>
            <h1>Whole-system safety and constraint layer</h1>
            <p>
              Thermal protection plus electrical, occupancy and
              critical-infrastructure supervision.
            </p>
          </div>
          <span className={safety ? "verified" : "verified disabled"}>
            <ShieldCheck /> {safety ? "Supervisor active" : "Ablation mode"}
          </span>
        </div>
        <div className="safety-systems">
          {[
            [Thermometer, "Thermal envelope", "20–27 °C occupied band"],
            [Zap, "Electrical limits", "Peak and circuit protection"],
            [Users, "Occupancy logic", "No empty-room preconditioning"],
            [Server, "Critical loads", "UPS, network and server continuity"],
            [Camera, "Security & access", "CCTV and access fail-safe"],
            [
              Activity,
              "Fire & life safety",
              "Protected, non-sheddable circuits",
            ],
          ].map(([Icon, title, sub]) => {
            const I = Icon as typeof Activity;
            return (
              <article key={String(title)}>
                <I />
                <div>
                  <b>{String(title)}</b>
                  <span>{String(sub)}</span>
                </div>
                <em>OK</em>
              </article>
            );
          })}
        </div>
        <div className="analytics-grid">
          <article className="chart-card span-two">
            <b>Measured safety effect</b>
            <div className="safety-effect-table">
              <div>
                <span>Controller</span>
                <span>Energy cost</span>
                <span>Violation reduction</span>
                <span>Deviation reduction</span>
                <span>Reliance</span>
              </div>
              {SAFETY_EFFECT.map((r) => (
                <div key={r.controller}>
                  <b>{r.controller}</b>
                  <span>+{r.energy.toFixed(2)}%</span>
                  <span className="good">−{r.comfort.toFixed(2)}%</span>
                  <span className="good">−{r.deviation.toFixed(2)}%</span>
                  <span>{r.reliance.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </article>
          <article className="finding-card">
            <strong>Benefit</strong>
            <span>Comfort protection</span>
            <b>69–90%</b>
            <small>reduction in comfort violations</small>
          </article>
          <article className="finding-card amber">
            <strong>Cost</strong>
            <span>Additional energy</span>
            <b>9–29%</b>
            <small>depending on the controller</small>
          </article>
        </div>
      </section>
    );
  return (
    <section className="data-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">RESEARCH EXPERIMENTS</span>
          <h1>Controller comparison and RQ answers</h1>
          <p>Corrected post-action comfort · five seeds · four seasons.</p>
        </div>
        <button
          type="button"
          className="export-button"
          onClick={() => downloadJson("eemd-rl-final-results.json", RESULTS)}
        >
          <Download /> Export summary
        </button>
      </div>
      <div className="experiment-table">
        <div>
          <span>Controller</span>
          <span>Energy kWh</span>
          <span>Peak kW</span>
          <span>Violations</span>
          <span>Deviation</span>
          <span>Safety</span>
          <span>Ramp</span>
        </div>
        {RESULTS.map((r) => (
          <button
            type="button"
            key={r.controller}
            className={algorithm === r.controller ? "active" : ""}
            aria-pressed={algorithm === r.controller}
            onClick={() => setAlgorithm(r.controller)}
          >
            <b>{r.controller}</b>
            <span>{r.energy.toLocaleString()}</span>
            <span>{r.peak.toFixed(2)}</span>
            <span>{r.comfort.toFixed(3)}%</span>
            <span>{r.deviation.toFixed(3)} °C</span>
            <span>{r.safety.toFixed(2)}%</span>
            <span>{r.ramp.toFixed(2)} kW</span>
          </button>
        ))}
      </div>
      <div className="rq-grid">
        {[
          [
            "RQ1",
            "No universal RL winner",
            "PPO leads comfort; SAC leads RL energy and smoothness; TD3 has the lowest mean RL peak.",
          ],
          [
            "RQ2",
            "Safety is effective but costly",
            "Comfort violations fall 69–90%, while energy rises 9–29%.",
          ],
          [
            "RQ3",
            "Lookahead is a valid negative result",
            "Future timetable features did not significantly improve PPO.",
          ],
          [
            "RQ4",
            "RL does not dominate B1 RBC",
            "PPO improves comfort, while B1 wins energy, peak and ramping.",
          ],
          [
            "RQ5",
            "Season matters",
            "Peak is stable; energy, comfort and safety reliance vary materially by season.",
          ],
        ].map(([rq, title, text]) => (
          <article key={rq}>
            <strong>{rq}</strong>
            <b>{title}</b>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Inspector({
  room,
  entered,
  setEntered,
  algorithm,
  safety,
  deviceStates,
  setDeviceStates,
}: {
  room?: RoomLive;
  entered: boolean;
  setEntered: (v: boolean) => void;
  algorithm: string;
  safety: boolean;
  deviceStates: Record<string, boolean>;
  setDeviceStates: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
}) {
  if (!room)
    return (
      <aside className="inspector loading-panel">
        Loading 157-space catalog…
      </aside>
    );
  const equipment = equipmentFor(room),
    action = ALGORITHM_ACTION[algorithm] ?? 0.5;
  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div>
          <span>SELECTED SPACE</span>
          <h2>{room.room_id}</h2>
        </div>
        <span className="status-badge">
          <i /> ONLINE
        </span>
      </div>
      <h3>{room.displayName}</h3>
      <p className="room-path">
        Whole College <ChevronRight /> {FLOOR_NAMES[room.floor]} Floor{" "}
        <ChevronRight /> {room.zone}
      </p>
      <div className="room-stats">
        <article>
          <Users />
          <span>Occupancy</span>
          <b>
            {room.occupancy}
            <small> / {room.capacity}</small>
          </b>
        </article>
        <article>
          <Thermometer />
          <span>Indoor</span>
          <b>
            {room.temp.toFixed(1)}
            <small> °C</small>
          </b>
        </article>
        <article>
          <Zap />
          <span>Room load</span>
          <b>
            {room.power.toFixed(1)}
            <small> kW</small>
          </b>
        </article>
        <article>
          <Wind />
          <span>Plant mode</span>
          <b>{room.hvac}</b>
        </article>
      </div>
      <div className="action-card">
        <div>
          <span>CONTROLLER ACTION</span>
          <b>{Math.round(action * 100)}%</b>
        </div>
        <div className="action-track">
          <i style={{ width: `${action * 100}%` }} />
        </div>
        <small>
          <ShieldCheck />{" "}
          {safety
            ? room.safetyEvent
              ? "corrected by supervisor"
              : "within safe envelope"
            : "raw action · safety disabled"}
        </small>
      </div>
      <Button className="enter-room" onClick={() => setEntered(!entered)}>
        {entered ? <RotateCcw /> : <DoorOpen />}
        {entered ? "Return to building" : "Explore room in 3D"}
      </Button>
      <section className="device-section">
        <div className="section-title">
          <span>DEVICES & CIRCUITS</span>
          <b>
            {
              equipment.filter(
                (e, i) => deviceStates[`${room.room_id}-${i}`] ?? e.defaultOn,
              ).length
            }
            /{equipment.length} ON
          </b>
        </div>
        {equipment.map((item, index) => {
          const key = `${room.room_id}-${index}`,
            enabled = deviceStates[key] ?? item.defaultOn,
            Icon = item.icon;
          return (
            <div className="device-row" key={key}>
              <div className="device-icon">
                <Icon />
              </div>
              <div>
                <b>{item.name}</b>
                <span>{item.meta}</span>
              </div>
              <Switch
                checked={enabled}
                disabled={item.protected}
                onCheckedChange={(v) =>
                  setDeviceStates((s) => ({ ...s, [key]: v }))
                }
              />
            </div>
          );
        })}
      </section>
      <section className="forecast">
        <div className="section-title">
          <span>TIMETABLE LOOKAHEAD</span>
          <b>{room.timetable ? "DIRECT" : "PROFILE"}</b>
        </div>
        {[
          ["Now", room.occupancy],
          ["+30m", room.future[0]],
          ["+60m", room.future[1]],
          ["+120m", room.future[2]],
        ].map(([label, value]) => (
          <div className="forecast-row" key={String(label)}>
            <span>{label}</span>
            <i>
              <b
                style={{ width: `${(Number(value) / room.capacity) * 100}%` }}
              />
            </i>
            <em>{value}</em>
          </div>
        ))}
      </section>
    </aside>
  );
}

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
  
    [season, setSeason] = useState("October"),
    [algorithm, setAlgorithm] = useState("PPO"),
    [safety, setSafety] = useState(true),
    [playing, setPlaying] = useState(true),
    [step, setStep] = useState(238),
    [speed, setSpeed] = useState("1×"),
    [floor, setFloor] = useState(-1),
    [layer, setLayer] = useState("Zone"),
    [selectedId, setSelectedId] = useState("RN001"),
    [entered, setEntered] = useState(false),
    [activeView, setActiveView] = useState<ViewName>("Digital Twin"),
    [realtime, setRealtime] = useState(false),
    [deviceStates, setDeviceStates] = useState<Record<string, boolean>>({});
  const [stress, setStress] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);
  useEffect(() => {
    // Native tooltip bubbles work on hover without a timer or event-listener loop.
    const glossary: Record<string, string> = {
      "PPO":"Proximal Policy Optimization: an on-policy reinforcement-learning algorithm.",
      "SAC":"Soft Actor-Critic: an off-policy algorithm that encourages exploration using entropy.",
      "TD3":"Twin Delayed DDPG: an off-policy continuous-action algorithm using two critics.",
      "RBC":"Rule-based controller: deterministic rules rather than a learned policy.",
      "Safety":"A deterministic check that corrects unsafe proposed actions. The top count is affected rooms at the current demo timestep, not cumulative research interventions.",
      "Semantic":"A model linking building spaces to meaningful categories and devices.",
      "Occupancy":"Estimated number of people in a space; these demo values are synthetic profiles.",
      "Lookahead":"Estimated future occupancy at +30, +60 and +120 minutes.",
      "Peak":"Highest electrical demand in the evaluation interval, measured in kW.",
      "Ramp":"Change in electrical demand between consecutive timesteps.",
      "Deviation":"Temperature distance from the defined comfort target, measured in degrees Celsius.",
      "Ablation":"A controlled comparison with one feature removed or disabled.",
      "Holm":"A multiple-comparison correction applied to statistical p-values.",
      "kWh":"Energy consumed: kilowatts multiplied by hours.",
      "kW":"Electrical power: the instantaneous rate of energy use.",
      "32-D":"32 observation features passed to the research policy.",
      "5-D":"Five continuous control magnitudes, one per controlled semantic zone.",
      "HVAC":"Heating, ventilation and air conditioning.",
      "Replay":"Synthetic browser demonstration; not a replay of trained-policy action traces."
    };
    document.querySelectorAll<HTMLElement>("button, h1, h2, h3, b, strong, small, span, em").forEach(el => {
      if (el.closest(".side-rail")) {
          el.removeAttribute("data-help");
          el.removeAttribute("title");
          return;
        }
      if (el.title || !el.textContent || el.textContent.length > 160) return;
      const matches = Object.entries(glossary).filter(([term]) => el.textContent!.toLowerCase().includes(term.toLowerCase()));
      //if (matches.length) el.dataset.help = matches.map(([, meaning]) => meaning).join(" ");
    });
  }, [activeView, entered, algorithm]);
  useEffect(() => {
    fetch("/data/actual_building_catalog.json")
      .then((r) => r.json() as Promise<Catalog>)
      .then((data) => setCatalog(data))
      .catch(() => setLoadError("Building catalog could not load. Check public/data/actual_building_catalog.json and reload."));
  }, []);
  useEffect(() => {
    if (!playing || realtime) return;
    const delay = speed === "4×" ? 350 : speed === "2×" ? 700 : 1200,
      timer = window.setInterval(() => setStep((s) => (s + 1) % 672), delay);
    return () => window.clearInterval(timer);
  }, [playing, speed, realtime]);
  const syncNow = useCallback(() => {
    const d = new Date(),
      day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    setStep(day * 96 + d.getHours() * 4 + Math.floor(d.getMinutes() / 15));
    setPlaying(false);
    setRealtime(true);
    const month = d.getMonth() + 1;
    setSeason(
      month <= 2 || month === 12
        ? "January"
        : month <= 5
          ? "April"
          : month <= 8
            ? "July"
            : "October",
    );
  }, []);
    useEffect(() => {
    if (!realtime) return;

    const timer = window.setInterval(syncNow, 30_000);

    return () => window.clearInterval(timer);
  }, [realtime, syncNow]);
  const rooms = useMemo(
    () =>
      catalog
        ? Object.values(catalog.rooms).map((r) =>
            makeLiveRoom(r, step, season, algorithm, safety, stress),
          )
        : [],
    [catalog, step, season, algorithm, safety, stress],
  );
  const selected = rooms.find((r) => r.room_id === selectedId) ?? rooms[0];
  const simTime = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      day = Math.floor(step / 96),
      slot = step % 96,
      hour = Math.floor(slot / 4),
      min = (slot % 4) * 15;
    return `${days[day]} ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }, [step]);
  const selectRoom = useCallback((id: string, enter = false) => {
    setSelectedId(id);
    setEntered(enter);
    if (enter) setActiveView("Digital Twin");
  }, []);
  const nav: [ViewName, typeof Building2][] = [
    ["Digital Twin", Building2],
    ["Rooms", University],
    ["Energy", Zap],
    ["Occupancy", Users],
    ["Safety", ShieldCheck],
    ["Experiments", BarChart3],
    ["Future", Network],
  ];
  const layers: [string, typeof Layers3][] = [
    ["Zone", Layers3],
    ["Occupancy", Users],
    ["Temperature", Thermometer],
    ["Energy", Zap],
    ["RL Action", Cpu],
    ["Safety", ShieldCheck],
  ];
  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <img
            src="/images/branding/logo.png"
            alt="logo"
            />
          </div>
          <div>
            <div className="brand-name">EEMD-RL NCU Campus</div>
            <div className="brand-sub">Campus energy workspace</div>
          </div>
        </div>
        <button
        type="button"
        className="admin-profile"
        title="Nitish Ch · Project Administrator"
        aria-label="Administrator profile"
      >
        N
      </button>
        
      </header>
      
      <div className="workspace">
        <nav className="side-rail">
          {nav.map(([name, Icon]) => (
            <button
              type="button"
              key={name}
              className={
                activeView === name ? "rail-button active" : "rail-button"

              }
              aria-label={name === "Digital Twin" ? "Overview" : name}
              data-tooltip={name === "Digital Twin" ? "Overview" : name}
              aria-pressed={activeView === name}
              onClick={() => setActiveView(name)}
            >
              <Icon />
              <span>
                {name === "Digital Twin" ? "Overview" : name}
              </span>
            </button>
          ))}
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="rail-button rail-bottom" aria-label="Settings" data-tooltip="Settings">
                <Settings2 />
                <span>Settings</span>
              </button>
            </DialogTrigger>
            <DialogContent className="admin-dialog">
              <DialogHeader>
                <DialogTitle>Simulation administration</DialogTitle>
                <DialogDescription>
                  Frozen research configuration and local demonstration
                  controls.
                </DialogDescription>
              </DialogHeader>
              <div className="admin-grid">
                <label>
                  Building
                  <div className="admin-value">
                    NCU academic building · 157 spaces
                  </div>
                </label>
                <label>
                  Temporal resolution
                  <div className="admin-value">15 minutes · 672 steps/week</div>
                </label>
                <label>
                  Observation
                  <div className="admin-value">32-D · five semantic zones</div>
                </label>
                <label>
                  Action
                  <div className="admin-value">
                    5-D continuous HVAC magnitude
                  </div>
                </label>
                <label>
                  Research protocol
                  <div className="admin-value">
                    4 seasons · 5 seeds · 120 RL runs
                  </div>
                </label>
                <label>
                  Comfort definition
                  <div className="admin-value">
                    occupied · post-action · 20–27 °C
                  </div>
                </label>
                <label className="admin-toggle">
                  <span>Deterministic safety</span>
                  <Switch checked={safety} onCheckedChange={setSafety} />
                </label>
                <label className="admin-toggle">
                  <span>Timetable lookahead</span>
                  <span title="This demo displays forecast estimates; it does not run a retrained ablation policy.">Display only</span>
                </label>
              </div>
            </DialogContent>
          </Dialog>
        </nav>
        <section className="main-stage">
          {loadError && <p role="alert">{loadError}</p>}
          {activeView === "Digital Twin" && (
            <Kpis
              rooms={rooms}
              safety={safety}
              algorithm={algorithm}
              onNavigate={setActiveView}
            />
          )}
          {activeView === "Digital Twin" ? (
            <>
              <section className="viewer-panel">
                <div className="viewer-title">
                  <div>
                    <span className="eyebrow">Building overview</span>
                    <h1>
                      {entered
                        ? `${selected?.displayName ?? "Room"} interior`
                        : floor === -1
                          ? "Campus building"
                          : `${FLOOR_NAMES[floor]} floor · ${rooms.filter((r) => r.floor === floor).length} spaces`}
                    </h1>
                    <p>
                      Drag to rotate · scroll to zoom · click any room to
                      inspect
                    </p>
                  </div>
                  <div className="viewer-actions">
                    {entered && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEntered(false)}
                      >
                        <RotateCcw /> Building
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFloor(-1);
                        setEntered(false);
                      }}
                    >
                      <Layers3 /> Reset
                    </Button>
                  </div>
                </div>
                <DigitalTwin
                  rooms={rooms}
                  selectedId={selectedId}
                  onSelect={(id, enter) => {
                    selectRoom(id, enter);
                    setRoomPanelOpen(true);
                  }}
                  floor={floor}
                  layer={layer}
                  entered={entered}
                />
                <div className="floor-selector">
                  <span>FLOOR</span>
                  <button
                    type="button"
                    className={floor === -1 ? "active" : ""}
                    aria-pressed={floor === -1}
                    onClick={() => {
                      setFloor(-1);
                      setEntered(false);
                    }}
                  >
                    ALL
                  </button>
                  {FLOOR_NAMES.map((_, i) => (
                    <button
                      type="button"
                      key={i}
                      className={floor === i ? "active" : ""}
                      aria-pressed={floor === i}
                      onClick={() => {
                        setFloor(i);
                        setEntered(false);
                      }}
                    >
                      {i === 0 ? "G" : i}
                    </button>
                  ))}
                </div>
                <div className="weather-chip">
                  <CloudSun />
                  <div>
                    <small>{season} scenario</small>
                    <b>{SEASON_OUTDOOR[season].toFixed(1)} °C</b>
                  </div>
                  <span>historical weather context</span>
                </div>
              </section>
              <div className="layer-bar">
                <span>VISUAL LAYER</span>
                {layers.map(([name, Icon]) => (
                  <button
                    type="button"
                    key={name}
                    className={layer === name ? "active" : ""}
                    aria-pressed={layer === name}
                    onClick={() => setLayer(name)}
                  >
                    <Icon />
                    {name}
                  </button>
                ))}
              </div>
              <section className="control-panel">
                <h2>Control panel</h2>
                <div className="scenario-controls">
                <div className="control-cluster">
                <CloudSun />
                <span>Season</span>
                <Select
                value={season}
                onValueChange={(v) => {
                  setSeason(v);
                  setRealtime(false);
                }}
                >
                <SelectTrigger className="dark-select">
                  <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((v) => (
                    <SelectItem key={v} value={v}>
                    {v}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                </div>
                <div className="control-cluster">
                <Cpu />
              <span>Controller</span>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger className="dark-select algorithm-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTROLLERS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="safety-control">
            <ShieldCheck />
            <span>
              <b>Safety</b>
              <small>{safety ? "multi-system ON" : "ablation OFF"}</small>
            </span>
            <Switch
              className="safety-switch"
              checked={safety}
              onCheckedChange={setSafety}
            />
          </div>
          <Button
            variant="outline"
            className={realtime ? "now-button active" : "now-button"}
            onClick={syncNow}
          >
            <CircleGauge />
            <span>
              <b>NOW</b>
              <small>local time</small>
            </span>
          </Button>
        </div>
        <div className={realtime ? "live-pill now-live" : "live-pill"}>
          <i />
          <span>{realtime ? "Local-time simulation" : "Simulation replay"}</span>
          <b>{simTime}</b>
          </div>
              </section>
            </>
          ) : activeView === "Future" ? <FutureView /> : activeView === "Rooms" ? (
            <RoomsView
              rooms={rooms}
              selectedId={selectedId}
              onSelect={selectRoom}
            />
          ) : (
            <AnalyticsView
              view={activeView}
              rooms={rooms}
              algorithm={algorithm}
              setAlgorithm={setAlgorithm}
              safety={safety}
            />
          )}
          {activeView === "Digital Twin" && (
          <section className="timeline-panel">
            <label title="Synthetic temperature offset applied equally to all controllers. Not a trained-policy experiment.">Demo test<select aria-label="Demo stress test" value={stress} onChange={e => {setStress(Number(e.target.value));setPlaying(false);setRealtime(false);setStep(138);}}><option value={0}>Normal</option><option value={4}>Heat +4°C</option><option value={-6}>Cold −6°C</option></select></label>
            <button
              type="button"
              className="play-button"
              aria-label={playing ? "Pause simulation replay" : "Play simulation replay"}
              onClick={() => {
                setPlaying(!playing);
                setRealtime(false);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </button>
            <div className="timeline-main">
              <div className="timeline-head">
                <b>{season.toUpperCase()} · 7-DAY REPLAY</b>
                <span>
                  15-minute step {step + 1}/672 · {simTime}
                </span>
              </div>
              <Slider
                className="time-slider"
                min={0}
                max={671}
                step={1}
                value={[step]}
                onValueChange={(v) => {
                  setStep(v[0]);
                  setRealtime(false);
                }}
              />
              <div className="day-labels">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(
                  (d, i) => (
                    <span
                      className={Math.floor(step / 96) === i ? "active" : ""}
                      key={d}
                    >
                      {d}
                    </span>
                  ),
                )}
              </div>
            </div>
            <Select value={speed} onValueChange={setSpeed}>
              <SelectTrigger className="speed-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1×", "2×", "4×"].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>)}
        </section>
        {activeView === "Digital Twin" && roomPanelOpen && (
        <Inspector
          room={selected}
          entered={entered}
          setEntered={setEntered}
          algorithm={algorithm}
          safety={safety}
          deviceStates={deviceStates}
          setDeviceStates={setDeviceStates}
        />
        )}
      </div>
    </main>
  );
}

function FutureView() {
  const [selected, setSelected] = useState<(typeof plans)[number] | null>(null);

  const plans = [
    {
      title: "Floor-plan digitisation",
      summary: "Turn approved floor plans into structured building geometry.",
      image: "/images/future/floor-plan.webp",
      points: [
        "Upload a floor-plan PDF or image and identify its floor and scale.",
        "Propose room boundaries, doors, corridors and adjacencies for review.",
        "Let a facilities administrator confirm room IDs and dimensions before use.",
        "Keep an audit trail of corrections and export approved geometry for the 3D twin.",
      ],
    },
    {
      title: "Timetable parsing and validation",
      summary: "Convert timetable files into reviewable class and room schedules.",
      image: "/images/future/timetable.webp",
      points: [
        "Read room, course, day, time and capacity fields from timetable files.",
        "Flag missing fields, duplicate events, room conflicts and overlapping times.",
        "Show the source page or row so a reviewer can check each extracted event.",
        "Require corrections and approval before a timetable is used by the simulation.",
      ],
    },
    {
      title: "Room mapping and audit",
      summary: "Match timetable room names to the building’s verified spaces.",
      image: "/images/future/room-mapping.webp",
      points: [
        "Suggest matches between timetable IDs and the 157-space room catalogue.",
        "Show a confidence score and flag uncertain or ambiguous matches.",
        "Let an authorised reviewer resolve uncertain mappings instead of guessing.",
        "Record who approved each mapping and when it changed.",
      ],
    },
    {
      title: "Controller comparison and selection",
      summary: "Compare approved controllers against clear operational priorities.",
      image: "/images/future/controller-selection.webp",
      points: [
        "Compare PPO, SAC, TD3 and rule-based baselines across seasons.",
        "Show energy, peak demand, comfort, safety interventions and ramping together.",
        "Allow operators to set priorities and review the trade-offs.",
        "Require approval before selecting a controller, with a rule-based fallback.",
      ],
    },
    {
      title: "IoT and sensor integration",
      summary: "Connect building measurements while checking data quality and safety.",
      image: "/images/future/iot-integration.webp",
      points: [
        "Ingest occupancy, temperature, energy-meter and equipment-status readings.",
        "Check timestamps, missing values, stale sensors and implausible readings.",
        "Show sensor health and data freshness to authorised facilities staff.",
        "Keep local fail-safe behaviour available if the connection is lost.",
      ],
    },
    {
      title: "In-room control",
      summary: "Coordinate room equipment while preserving safety and manual control.",
      image: "/images/future/in-room-control.webp",
      points: [
        "Coordinate HVAC, lighting and eligible equipment with occupancy and schedules.",
        "Show the proposed action and its expected energy and comfort impact.",
        "Preserve manual overrides and protect critical, non-sheddable circuits.",
        "Log control changes and show which role or system initiated them.",
      ],
    },
    {
      title: "Student room-change reports and Green Points",
      summary: "Give students a simple way to report a rescheduled class or room change.",
      image: "/images/future/student-green-points.webp",
      points: [
        "Provide a student dashboard form for the course, original room, new room, date and time.",
        "Let students report a class moved from its original timetable location or schedule.",
        "Verify reports against an authorised timetable update and prevent duplicate submissions.",
        "Award Green Points to the first 10 valid reports for a change; show each student’s points and verification status.",
        "Allow accumulated points to contribute toward community-service hours only after the university or club verifies the rules and group total.",
      ],
    },
    {
      title: "Teacher timetable and verification workspace",
      summary: "Help faculty publish changes and confirm student-submitted updates.",
      image: "/images/future/faculty-workspace.webp",
      points: [
        "Let faculty submit or publish a rescheduled class, including its new room and time.",
        "Show pending student reports for the affected course so faculty can verify them.",
        "Notify relevant students after a change is confirmed.",
        "Keep a dated record of the original schedule, revised schedule and approver.",
        "Give faculty a summary of room use and reported conflicts without exposing unnecessary student information.",
      ],
    },
  ];

  return (
    <section className="data-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">PLANNED CAPABILITIES</span>
          <h1>Future implementation roadmap</h1>
          <p>
            Planned work only. These features are not implemented or validated
            in the current demonstration.
          </p>
        </div>
      </div>

      <div className="roadmap-grid">
        {plans.map((plan) => (
          <button
            type="button"
            className="roadmap-card"
            key={plan.title}
            onClick={() => setSelected(plan)}
          >
            <span>{plan.title}</span>
            
          </button>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent className="roadmap-dialog">
            <DialogHeader>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>{selected.summary}</DialogDescription>
            </DialogHeader>

            <div className="roadmap-dialog-grid">
              <div className="roadmap-plan-text">
                <h3>Planned scope</h3>
                <ul>
                  {selected.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>

              <img src={selected.image} alt="" />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}