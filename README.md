# GoingBoy

**Planned.** A browser demo of how the human body moves: a stylized figure walks, runs, squats or dances, and you can see
which joints, bones and muscles do the work. Not a game to beat, an interactive anatomy of movement.

[Русская версия](README.ru.md)

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Status](https://img.shields.io/badge/status-planned-lightgrey)](#) [![Built with Claude Code](https://img.shields.io/badge/Built_with-Claude_Code-D97757?logo=claude&logoColor=white)](https://claude.com/claude-code) [![Ko-fi](https://img.shields.io/badge/Ko--fi-Support_me-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/alexalesha)

Code, tests and docs are written by Claude (Anthropic) in Claude Code. Ideas, testing and decisions - Alexey.

☕ If you like this project, you can support me on Ko-fi: https://ko-fi.com/alexalesha

## Status

There is no code yet. The repository holds the design note
([docs/superpowers/specs/2026-10-17-goingboy-design.md](docs/superpowers/specs/2026-10-17-goingboy-design.md), in Russian),
which waits for Alexey's go-ahead. This README describes the plan, not a working program.

## What it will do

- **Movements:** walking, running, jumping; exercises (squat, push-up, pull-up, lunge); sport and dance (kicking a ball,
  a throw, a flip, dance steps); **your own pose with the mouse** - drag a hand or a foot and the rest of the body follows
  (inverse kinematics).
- **Layers:** skin, muscles and bones with one switch.
- **Muscle work:** a muscle under load turns red, joints show their angle. The highlight follows the movement, not a
  random glow: a flexor lights up when its joint bends under load.
- **Names on hover:** point at a muscle or a bone to see its name and what it does.
- **Slow motion, pause and a free camera.**
- **Look:** a clean mannequin, muscles as colored bands, simplified bones.

Not planned: an anatomy atlas with all 600 muscles (about 30-40 main groups and the main joints instead), and ragdoll
falls for their own sake.

## How it will be built

- One page in the browser on three.js, also inside the Hub and as its own Electron app; GitHub Pages.
- The skeleton and the muscles are made in code, no downloaded models: bones are capsules, a muscle is a band between two
  attachment points, its length comes from the joint angles, and "work" is how fast it shortens under load.
- Movements are key poses in code with smooth blending. Russian and English.
- Laws (automatic checks): the highlight matches the movement on reference poses, labels never cover the body, 60 fps.

## License

MIT
