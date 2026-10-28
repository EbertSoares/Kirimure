import { createInitialState, tickSimulation, buildTargets } from './src/simulation/model.js';

let state = createInitialState();
state.paused = false;
state.speed = 10;

console.log('Testing baseline over 120 simulated days...');
for (let day = 1; day <= 120; day++) {
  // 1 day advance
  state = tickSimulation(state, 1 / (10 * 0.1)); // realDtSeconds for 1 day
  if (day % 15 === 0) {
    console.log(`Day ${state.elapsedDays.toFixed(1)}: Health Fish = ${state.health.fish.toFixed(1)}%, Coral = ${state.health.coral.toFixed(1)}%, OD = ${state.dissolvedOxygen.toFixed(2)} mg/L`);
  }
}
