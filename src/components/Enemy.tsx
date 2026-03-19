/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, useRapier, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, EnemyData } from '../store';
import { Text } from '@react-three/drei';
import { playHitSound } from '../utils/audio';

const ENEMY_STATS = {
  default: { speed: 3, chaseDist: 15, shootDist: 15, cooldown: 3500, color: '#ff0055', label: 'BOT', burst: 1 },
  ninja: { speed: 6, chaseDist: 25, shootDist: 3, cooldown: 1500, color: '#00ff00', label: 'NINJA', burst: 1 },
  gunslinger: { speed: 4, chaseDist: 20, shootDist: 20, cooldown: 2000, color: '#ffff00', label: 'GUNSLINGER', burst: 3 },
  executioner: { speed: 2.5, chaseDist: 30, shootDist: 25, cooldown: 5000, color: '#ff8800', label: 'EXECUTIONER', burst: 1 },
};

export function Enemy({ data }: { data: EnemyData }) {
  const body = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const { world, rapier } = useRapier();
  
  const gameState = useGameStore(state => state.gameState);
  const playerState = useGameStore(state => state.playerState);
  const hitPlayer = useGameStore(state => state.hitPlayer);
  const addLaser = useGameStore(state => state.addLaser);
  const addParticles = useGameStore(state => state.addParticles);

  const stats = ENEMY_STATS[data.type || 'default'];

  const lastShootTime = useRef(0);
  const burstsLeft = useRef(0);
  const lastBurstTime = useRef(0);
  
  const patrolTarget = useRef(new THREE.Vector3());
  const lastPatrolChange = useRef(0);
  const state = useRef<'patrol' | 'chase'>('patrol');

  const groupRef = useRef<THREE.Group>(null);

  // Initialize patrol target
  useMemo(() => {
    patrolTarget.current.set(
      data.position[0] + (Math.random() - 0.5) * 10,
      data.position[1],
      data.position[2] + (Math.random() - 0.5) * 10
    );
  }, [data.position]);

  useFrame((state_fiber) => {
    if (!body.current || gameState !== 'playing' || data.state === 'disabled') {
      if (body.current) {
        body.current.setLinvel({ x: 0, y: body.current.linvel().y, z: 0 }, true);
      }
      return;
    }

    const pos = body.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    let closestTargetPos: THREE.Vector3 | null = null;
    let closestDist = stats.chaseDist;

    // Check player
    if (playerState === 'active') {
      const playerPos = camera.position.clone();
      playerPos.y = pos.y; // Ignore height difference for distance
      const distToPlayer = currentPos.distanceTo(playerPos);
      if (distToPlayer < closestDist) {
        closestDist = distToPlayer;
        closestTargetPos = playerPos;
      }
    }

    // Check other enemies
    const allEnemies = useGameStore.getState().enemies;
    allEnemies.forEach(e => {
      if (e.id !== data.id && e.state === 'active') {
        const ePos = new THREE.Vector3(e.position[0], pos.y, e.position[2]);
        const distToEnemy = currentPos.distanceTo(ePos);
        if (distToEnemy < closestDist) {
          closestDist = distToEnemy;
          closestTargetPos = ePos;
        }
      }
    });

    // AI Logic
    if (closestTargetPos) {
      state.current = 'chase';
    } else if (state.current === 'chase') {
      state.current = 'patrol';
      patrolTarget.current.set(
        currentPos.x + (Math.random() - 0.5) * 40,
        currentPos.y,
        currentPos.z + (Math.random() - 0.5) * 40
      );
      lastPatrolChange.current = Date.now();
    }

    const direction = new THREE.Vector3();

    if (state.current === 'chase' && closestTargetPos) {
      if (closestDist > 2) {
        direction.subVectors(closestTargetPos, currentPos).normalize();
      } else {
        direction.set(0, 0, 0);
      }
      
      if (data.type === 'ninja') {
        // Zig-zag flanking movement
        const time = Date.now() / 500;
        const perp = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(Math.sin(time) * 0.8);
        direction.add(perp).normalize();
      }

      // Shooting logic
      const now = Date.now();
      
      const fireShot = (rayDir: THREE.Vector3, startPos: THREE.Vector3, spreadAmount: number = 0) => {
        const finalDir = rayDir.clone();
        if (spreadAmount > 0) {
          finalDir.x += (Math.random() - 0.5) * spreadAmount;
          finalDir.y += (Math.random() - 0.5) * spreadAmount;
          finalDir.z += (Math.random() - 0.5) * spreadAmount;
          finalDir.normalize();
        }

        const ray = new rapier.Ray(startPos, finalDir);
        const hit = world.castRay(ray, stats.shootDist, true);

        let endPos = startPos.clone().add(finalDir.clone().multiplyScalar(stats.shootDist));
        let hitPlayerFlag = false;

        if (hit) {
          const collider = hit.collider;
          const rb = collider.parent();
          const hitPoint = ray.pointAt(hit.timeOfImpact);
          endPos.copy(hitPoint);

          if (rb && rb.userData) {
            const userData = rb.userData as { name?: string };
            if (userData.name === 'player') {
              hitPlayerFlag = true;
              if (useGameStore.getState().playerState === 'active') {
                if (data.type === 'executioner') {
                  useGameStore.getState().setPlayerHookedBy({ id: data.id, position: [currentPos.x, currentPos.y, currentPos.z] });
                } else {
                  hitPlayer();
                  playHitSound();
                }
              }
            } else if (userData.name && userData.name !== data.id) {
              // Hit another entity
              useGameStore.getState().hitEnemy(userData.name);
              playHitSound();
            }
          }
        }

        const laserColor = data.type === 'executioner' ? '#ff8800' : stats.color;
        addParticles([endPos.x, endPos.y, endPos.z], hitPlayerFlag ? '#ff0000' : laserColor);
        addLaser(
          [startPos.x, startPos.y, startPos.z],
          [endPos.x, endPos.y, endPos.z],
          laserColor
        );
      };

      const rayDir = new THREE.Vector3().subVectors(closestTargetPos, currentPos).normalize();
      const startPos = new THREE.Vector3(currentPos.x, currentPos.y + 0.5, currentPos.z);
      startPos.add(rayDir.clone().multiplyScalar(1.5));

      if (burstsLeft.current > 0 && now - lastBurstTime.current > 200) {
        fireShot(rayDir, startPos, 0.1); // Slight spread for burst
        burstsLeft.current--;
        lastBurstTime.current = now;
      } else if (closestDist < stats.shootDist && now - lastShootTime.current > stats.cooldown) {
        if (data.type === 'gunslinger') {
          burstsLeft.current = stats.burst;
          lastShootTime.current = now;
        } else if (data.type === 'ninja') {
          // Ninja fires a spread of 3 shots
          fireShot(rayDir, startPos, 0);
          fireShot(rayDir, startPos, 0.4);
          fireShot(rayDir, startPos, 0.4);
          lastShootTime.current = now;
        } else {
          fireShot(rayDir, startPos, 0);
          lastShootTime.current = now;
        }
      }
    } else {
      // Patrol
      const now = Date.now();
      if (currentPos.distanceTo(patrolTarget.current) < 2 || now - lastPatrolChange.current > 4000) {
        patrolTarget.current.set(
          currentPos.x + (Math.random() - 0.5) * 60,
          currentPos.y,
          currentPos.z + (Math.random() - 0.5) * 60
        );
        lastPatrolChange.current = now;
      }
      direction.subVectors(patrolTarget.current, currentPos).normalize();
    }

    // Apply movement with smoothing to prevent jitter
    const velocity = body.current.linvel();
    const targetVelocity = new THREE.Vector3(direction.x * stats.speed, velocity.y, direction.z * stats.speed);
    const currentVelocity = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    currentVelocity.lerp(targetVelocity, 0.1);

    body.current.setLinvel(currentVelocity, true);

    // Rotate to face direction
    if (groupRef.current && direction.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(direction.x, direction.z);
      const currentRotation = groupRef.current.rotation.y;
      let diff = targetRotation - currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.1;
    }
  });

  const color = data.state === 'disabled' ? '#444' : stats.color;

  return (
    <RigidBody
      ref={body}
      colliders={false}
      mass={1}
      type="dynamic"
      position={data.position}
      enabledRotations={[false, false, false]}
      userData={{ name: data.id }}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 1, 0]} />
      <group ref={groupRef} position={[0, 0, 0]}>
        {/* Body */}
        <mesh castShadow position={[0, 1, 0]}>
          <capsuleGeometry args={[0.5, 1]} />
          <meshStandardMaterial 
            color={color} 
            roughness={0.3} 
            metalness={0.8} 
            emissive={color}
            emissiveIntensity={data.state === 'disabled' ? 0 : 0.4}
          />
        </mesh>
        
        {/* Eye/Visor */}
        <mesh position={[0, 1.6, 0.45]}>
          <boxGeometry args={[0.6, 0.2, 0.2]} />
          <meshBasicMaterial color={data.state === 'disabled' ? '#111' : '#ffffff'} />
        </mesh>

        {/* Ninja Headband */}
        {data.type === 'ninja' && (
          <mesh position={[0, 1.6, 0.46]}>
            <boxGeometry args={[0.62, 0.05, 0.22]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        )}

        {/* Gunslinger Hat */}
        {data.type === 'gunslinger' && (
          <group position={[0, 1.8, 0]}>
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.4, 0.4, 0.1, 16]} />
              <meshStandardMaterial color="#8b4513" />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.2, 16]} />
              <meshStandardMaterial color="#8b4513" />
            </mesh>
          </group>
        )}

        {/* Executioner Hood/Axe */}
        {data.type === 'executioner' && (
          <mesh position={[0.4, 1.2, 0.2]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.1, 1.2, 0.1]} />
            <meshStandardMaterial color="#555" />
            <mesh position={[0, 0.5, 0.2]}>
              <boxGeometry args={[0.05, 0.4, 0.4]} />
              <meshStandardMaterial color="#aaa" />
            </mesh>
          </mesh>
        )}

        {/* Username Label */}
        <Text
          position={[0, 2.5, 0]}
          fontSize={0.3}
          color={data.state === 'active' ? stats.color : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {stats.label}
        </Text>
      </group>
    </RigidBody>
  );
}
